import Exa, { ExaAbortError, ExaError, ExaTimeoutError } from "exa-js";
import {
  buildAnswerPrompt,
  fallbackRecommendation,
  recommendationFromAnswer,
} from "@/lib/answer";
import { buildCard, mergeHitsIntoRaw } from "@/lib/claims";
import { EXTRACTION_PROMPT, HIGHLIGHT_QUERY, buildPathPlans, extraSearches } from "@/lib/paths";
import type { Intake, PathCard, PathPlan, RawHit, RawSearch, Source } from "@/lib/types";
import { normalizeUrl, siteHost } from "@/lib/text";

const PATH_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: {
      type: "string",
      description:
        "One sentence the pages support about this path. If nothing relevant, exactly not found.",
    },
    estimatedCost: {
      type: "string",
      description:
        "Price or cost range with currency only if a page states it. Otherwise exactly not found.",
    },
    leadTime: {
      type: "string",
      description:
        "Lead time or turnaround only if a page states it. Otherwise exactly not found.",
    },
    risk: {
      type: "string",
      description: "low, medium, high, or unknown. Effort and downside for a technician.",
    },
    keyFacts: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to 4 short facts from the pages: failure mode, stock, condition, successor, or discontinuation.",
    },
    pros: {
      type: "array",
      items: { type: "string" },
      description: "Up to 3 advantages grounded in the pages. No invented prices.",
    },
    cons: {
      type: "array",
      items: { type: "string" },
      description: "Up to 3 drawbacks grounded in the pages. No invented prices.",
    },
  },
  required: ["headline", "estimatedCost", "leadTime", "risk", "keyFacts", "pros", "cons"],
} as const;

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendedPath: {
      type: "string",
      description: "Exactly one of: diy, repair, used, new, obsolete",
    },
    reason: { type: "string" },
    urgencyNote: { type: "string" },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: ["recommendedPath", "reason", "urgencyNote", "caveats"],
} as const;

type Send = (event: string, data: unknown) => void;

export function publicErrorMessage(error: unknown): string {
  if (error instanceof ExaTimeoutError || (error instanceof Error && error.name === "TimeoutError")) {
    return "Exa timed out on this search.";
  }
  if (error instanceof ExaAbortError || (error instanceof Error && error.name === "AbortError")) {
    return "Search cancelled.";
  }
  if (error instanceof ExaError) {
    if (error.statusCode === 401 || error.statusCode === 403) return "Exa rejected the API key.";
    if (error.statusCode === 402) return "The Exa account is out of credits.";
    if (error.statusCode === 429) return "Exa rate-limited this search.";
    return `Exa returned an error (${error.statusCode}).`;
  }
  return "This search failed.";
}

export async function runResearch(args: {
  intake: Intake;
  apiKey: string;
  signal: AbortSignal;
  send: Send;
}): Promise<void> {
  const exa = new Exa(args.apiKey, undefined, { warnings: "silent" });
  const plans = buildPathPlans(args.intake);
  const raws = new Map<PathPlan["id"], RawSearch>();

  args.send("status", { message: "Searching five resolution paths on the live web." });

  const searched = await Promise.all(
    plans.map(async (plan) => {
      args.send("status", {
        message: `Searching ${plan.title.toLowerCase()}.`,
        pathId: plan.id,
        state: "running",
      });
      const started = Date.now();
      try {
        const raw = await searchPath(exa, plan, args.signal);
        raws.set(plan.id, raw);
        const card = buildCard(plan, raw);
        card.timingMs = Date.now() - started;
        args.send("path", card);
        args.send("status", {
          message: `${plan.title} returned ${card.sources.length} source${card.sources.length === 1 ? "" : "s"}.`,
          pathId: plan.id,
          state: card.status === "error" ? "error" : "done",
        });
        return card;
      } catch (error) {
        console.error(`Exa ${plan.id} failed`, error instanceof Error ? error.message : error);
        const raw = { error: publicErrorMessage(error) };
        raws.set(plan.id, raw);
        const card = buildCard(plan, raw);
        card.timingMs = Date.now() - started;
        args.send("path", card);
        args.send("status", {
          message: card.error ?? `${plan.title} failed.`,
          pathId: plan.id,
          state: "error",
        });
        return card;
      }
    }),
  );

  if (args.signal.aborted) return;

  args.send("status", {
    message: "Reading the best page on each path with Exa Contents (text, highlights, summary).",
  });

  let cards = searched;
  try {
    cards = await enrichWithContents(exa, plans, raws, searched, args.signal);
    for (const card of cards) args.send("path", card);
  } catch (error) {
    console.error("Exa contents failed", error instanceof Error ? error.message : error);
    args.send("status", {
      message: "Page reading failed. Showing the search highlights already in hand.",
    });
  }

  if (args.signal.aborted) return;

  args.send("status", { message: "Asking Exa Answer which path fits this urgency." });

  let recommendation;
  try {
    recommendation = await recommend(exa, args.intake, cards, args.signal);
  } catch (error) {
    console.error("Exa answer failed", error instanceof Error ? error.message : error);
    recommendation = fallbackRecommendation(
      args.intake,
      cards,
      publicErrorMessage(error),
    );
  }

  args.send("recommendation", recommendation);

  if (cards.every((card) => card.status === "error")) {
    args.send("error", { message: cards[0]?.error ?? "Every search failed." });
  }

  args.send("report", {
    intake: args.intake,
    cards,
    recommendation,
    generatedAt: new Date().toISOString(),
  });
}

async function searchPath(exa: Exa, plan: PathPlan, signal: AbortSignal): Promise<RawSearch> {
  const extras = extraSearches(plan);
  const [primary, companions] = await Promise.all([
    searchPlan(exa, plan, signal).then(toRaw),
    Promise.all(
      extras.map((extra) =>
        searchPlan(exa, extra, signal)
          .then(toRaw)
          .catch((error: unknown) => {
            console.error(
              `Exa ${plan.id} companion failed`,
              error instanceof Error ? error.message : error,
            );
            return { results: [] };
          }),
      ),
    ),
  ]);
  return {
    output: primary.output,
    grounding: primary.grounding,
    results: dedupeHits([
      ...(primary.results ?? []),
      ...companions.flatMap((companion) => companion.results ?? []),
    ]),
  };
}

function dedupeHits(hits: RawHit[]): RawHit[] {
  const seen = new Set<string>();
  const unique: RawHit[] = [];
  for (const hit of hits) {
    const key = normalizeUrl(hit.url ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

async function searchPlan(exa: Exa, plan: PathPlan, signal: AbortSignal) {
  const timeout = plan.searchType === "deep" ? 24_000 : plan.searchType === "fast" ? 16_000 : 18_000;
  const request = { signal, timeout };
  const contents = { highlights: { query: HIGHLIGHT_QUERY } };
  const common = {
    numResults: plan.numResults,
    contents,
    systemPrompt: EXTRACTION_PROMPT,
    objective: plan.objective,
    outputSchema: PATH_OUTPUT_SCHEMA,
    ...(plan.userLocation ? { userLocation: plan.userLocation } : {}),
    ...(plan.includeDomains ? { includeDomains: plan.includeDomains } : {}),
    ...(plan.excludeDomains ? { excludeDomains: plan.excludeDomains } : {}),
    ...(plan.startPublishedDate ? { startPublishedDate: plan.startPublishedDate } : {}),
    ...(plan.category ? { category: plan.category } : {}),
  };

  if (plan.searchType === "deep") {
    return exa.search(
      plan.query,
      {
        type: "deep",
        additionalQueries: plan.additionalQueries,
        ...common,
      },
      request,
    );
  }

  return exa.search(plan.query, { type: plan.searchType, ...common }, request);
}

function toRaw(response: {
  output?: { content?: unknown; grounding?: RawSearch["grounding"] };
  results: RawHit[];
}): RawSearch {
  return {
    output: response.output,
    grounding: response.output?.grounding,
    results: response.results.map((result) => ({
      url: result.url,
      title: result.title,
      publishedDate: result.publishedDate,
      highlights: result.highlights,
      text: result.text,
      summary: result.summary,
    })),
  };
}

async function enrichWithContents(
  exa: Exa,
  plans: PathPlan[],
  raws: Map<PathPlan["id"], RawSearch>,
  cards: PathCard[],
  signal: AbortSignal,
): Promise<PathCard[]> {
  const urls = [
    ...new Set(
      cards.flatMap((card) => (card.sources[0]?.url ? [card.sources[0].url] : [])),
    ),
  ].slice(0, 5);
  if (urls.length === 0) return cards;

  const response = await exa.getContents(
    urls,
    {
      text: { maxCharacters: 1200 },
      highlights: { query: HIGHLIGHT_QUERY },
      summary: {
        query:
          "What does this page state about price, stock, lead time, failure mode, condition, or a replacement? If it does not say, say so.",
      },
    },
    { signal, timeout: 10_000 },
  );

  const hits: RawHit[] = response.results.map((result) => ({
    url: result.url,
    title: result.title,
    publishedDate: "publishedDate" in result ? result.publishedDate : undefined,
    highlights: "highlights" in result ? result.highlights : undefined,
    text: "text" in result && typeof result.text === "string" ? result.text : undefined,
    summary:
      "summary" in result && typeof result.summary === "string" ? result.summary : undefined,
  }));

  return plans.map((plan) => {
    const previous = cards.find((card) => card.id === plan.id);
    const raw = raws.get(plan.id);
    if (!previous || !raw || raw.error) return previous as PathCard;
    const card = buildCard(plan, mergeHitsIntoRaw(raw, hits));
    card.contentsRead = true;
    card.timingMs = previous.timingMs;
    return card;
  });
}

async function recommend(exa: Exa, intake: Intake, cards: PathCard[], signal: AbortSignal) {
  const response = await exa.answer(
    buildAnswerPrompt(intake, cards),
    {
      outputSchema: ANSWER_SCHEMA,
      systemPrompt:
        "Recommend one path for the technician. Never introduce a price, stock level, or lead time that is not in the sourced findings.",
      userLocation: intake.country,
    },
    { signal, timeout: 12_000 },
  );
  const citations: Source[] = response.citations.map((citation) => ({
    url: citation.url,
    title: citation.title?.trim() || siteHost(citation.url),
    publishedDate: citation.publishedDate,
  }));
  return recommendationFromAnswer(response.answer, citations, intake, cards);
}
