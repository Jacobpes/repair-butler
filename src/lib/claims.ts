import { commercialFacts, filterHits, numbersAreVerbatim, sourceText } from "@/lib/evidence";
import { mentionsPart } from "@/lib/part";
import { traceFromPlan } from "@/lib/paths";
import type {
  Claim,
  PathCard,
  PathPlan,
  RawGrounding,
  RawHit,
  RawSearch,
  Risk,
  Source,
} from "@/lib/types";
import {
  clip,
  isNotFound,
  looksQuantitative,
  normalizeUrl,
  siteHost,
} from "@/lib/text";

const GENERIC_HEADLINE =
  "Relevant pages were found. Figures without a source are withheld.";

const STOP = new Set([
  "with",
  "from",
  "this",
  "that",
  "unit",
  "part",
  "have",
  "been",
  "were",
  "when",
  "where",
  "which",
  "about",
  "after",
  "before",
  "into",
  "over",
  "under",
  "than",
  "then",
  "them",
  "they",
  "their",
  "there",
  "these",
  "those",
  "your",
  "repair",
  "using",
  "used",
  "page",
  "says",
  "said",
  "known",
  "failure",
]);

export function normalizeRisk(value: string): Risk {
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized.startsWith("low ")) return "low";
  if (
    normalized === "medium" ||
    normalized === "med" ||
    normalized.startsWith("medium ")
  ) {
    return "medium";
  }
  if (normalized === "high" || normalized.startsWith("high ")) return "high";
  return "unknown";
}

export function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const unique: Source[] = [];
  for (const source of sources) {
    const key = normalizeUrl(source.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(source);
  }
  return unique;
}

function hasPrice(text: string): boolean {
  return /[€£$]|\b(?:EUR|USD|GBP|SEK|NOK|DKK|PLN)\b/i.test(text);
}

export function mergeHighlights(previous?: string[], incoming?: string[]): string[] | undefined {
  const next = (incoming ?? []).map((item) => item.trim()).filter(Boolean);
  const prev = (previous ?? []).map((item) => item.trim()).filter(Boolean);
  if (next.length === 0) return prev.length ? prev : undefined;
  const kept = next.some(hasPrice) ? next : [...prev.filter(hasPrice), ...next];
  return kept.length ? kept : undefined;
}

export function sourcesFromHits(hits: RawHit[] | undefined): Source[] {
  const sources: Source[] = [];
  for (const hit of hits ?? []) {
    if (!hit.url) continue;
    const highlights = (hit.highlights ?? []).map((item) => item.trim()).filter(Boolean);
    const priced = highlights.filter(hasPrice);
    const ordered = [...priced, ...highlights.filter((item) => !priced.includes(item))];
    const highlight = ordered.length ? clip(ordered.slice(0, 2).join(" "), 520) : undefined;
    const excerpt = !highlight && hit.text ? clip(hit.text, 400) : undefined;
    sources.push({
      url: hit.url,
      title: hit.title?.trim() || siteHost(hit.url),
      highlight: highlight ?? excerpt,
      quoteKind: highlight ? "highlight" : excerpt ? "excerpt" : undefined,
      summary: hit.summary ? clip(hit.summary, 400) : undefined,
      publishedDate: hit.publishedDate,
    });
  }
  return dedupeSources(sources);
}

export function mergeHitsIntoRaw(raw: RawSearch, hits: RawHit[]): RawSearch {
  const byUrl = new Map(
    hits.filter((hit) => hit.url).map((hit) => [normalizeUrl(hit.url ?? ""), hit]),
  );
  return {
    ...raw,
    results: (raw.results ?? []).map((result) => {
      const hit = byUrl.get(normalizeUrl(result.url ?? ""));
      if (!hit) return result;
      return {
        ...result,
        title: result.title || hit.title,
        publishedDate: result.publishedDate || hit.publishedDate,
        highlights: mergeHighlights(result.highlights, hit.highlights),
        text: hit.text ?? result.text,
        summary: hit.summary ?? result.summary,
      };
    }),
  };
}

function fieldText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function fieldList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readOutputContent(output: unknown): Record<string, unknown> {
  if (output && typeof output === "object" && "content" in output) {
    return readOutputContent((output as { content: unknown }).content);
  }
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
    }
    return {};
  }
  if (output && typeof output === "object" && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  return {};
}

function sourcesForField(
  grounding: RawGrounding[],
  field: string,
  pool: Source[],
): Source[] {
  const matches = grounding.filter((entry) => {
    const name = entry.field ?? "";
    return name === field || name.startsWith(`${field}[`) || name.startsWith(`${field}.`);
  });
  const sources: Source[] = [];
  for (const match of matches) {
    for (const citation of match.citations ?? []) {
      if (!citation.url) continue;
      const known = pool.find(
        (source) => normalizeUrl(source.url) === normalizeUrl(citation.url ?? ""),
      );
      if (known) sources.push(known);
    }
  }
  return dedupeSources(sources);
}

export function sourcesMentioning(fact: string, sources: Source[]): Source[] {
  const tokens = fact
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3 && !STOP.has(token));
  if (tokens.length === 0) return [];
  const needed = Math.min(2, tokens.length);
  return sources.filter((source) => {
    const haystack = `${source.title} ${source.highlight ?? ""}`.toLowerCase();
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    return hits >= needed;
  });
}

function acceptHeadline(
  headline: string,
  grounding: RawGrounding[],
  pool: Source[],
): string {
  if (isNotFound(headline)) {
    return pool.length ? GENERIC_HEADLINE : "not found";
  }
  const grounded = sourcesForField(grounding, "headline", pool);
  const overlapped = sourcesMentioning(headline, pool);
  const quoted = pool.map((source) => sourceText(source)).join(" ");
  if (looksQuantitative(headline) && !numbersAreVerbatim(headline, quoted)) {
    return pool.length ? GENERIC_HEADLINE : "not found";
  }
  if (grounded.length === 0 && overlapped.length === 0) {
    return pool.length ? GENERIC_HEADLINE : "not found";
  }
  return clip(headline, 280);
}

function supportsFact(fact: string, source: Source, plan: PathPlan): boolean {
  const text = sourceText(source);
  if ((plan.id === "diy" || plan.id === "obsolete") && /[€£$]|\b(?:eur|usd|gbp|sek)\b/i.test(fact)) {
    return false;
  }
  if (looksQuantitative(fact) && !numbersAreVerbatim(fact, text)) return false;
  if (/free evaluation/i.test(fact) && !/free evaluation/i.test(text)) return false;
  if (
    /this model|this exact part|repairs this/i.test(fact) &&
    !mentionsPart(text, plan.partNumber)
  ) {
    return false;
  }
  return true;
}

function emptyClaims(): Claim[] {
  return [
    { label: "Estimated cost", value: "not found", sources: [] },
    { label: "Lead time", value: "not found", sources: [] },
  ];
}

export function buildCard(plan: PathPlan, raw: RawSearch): PathCard {
  const trace = traceFromPlan(plan);
  const base = {
    id: plan.id,
    title: plan.title,
    summary: plan.summary,
    trace,
    contentsRead: false,
  };

  if (raw.error) {
    return {
      ...base,
      status: "error",
      headline: "This search failed.",
      estimatedCost: "not found",
      leadTime: "not found",
      risk: "unknown",
      pros: [],
      cons: [],
      claims: emptyClaims(),
      sources: [],
      error: raw.error,
    };
  }

  const content = readOutputContent(raw.output);
  const grounding = raw.grounding ?? [];
  const pool = sourcesFromHits(filterHits(plan, raw.results));
  const commercial = commercialFacts(plan, pool, {
    cost: fieldText(content, "estimatedCost"),
    lead: fieldText(content, "leadTime"),
  });
  const estimatedCost = commercial.estimatedCost;
  const leadTime = commercial.leadTime;
  const claims: Claim[] = [
    {
      label: "Estimated cost",
      value: estimatedCost,
      sources: commercial.costSources,
    },
    {
      label: "Lead time",
      value: leadTime,
      sources: commercial.leadSources,
    },
  ];

  fieldList(content, "keyFacts")
    .slice(0, 4)
    .forEach((fact) => {
      const overlapped = sourcesMentioning(fact, pool).filter((source) =>
        supportsFact(fact, source, plan),
      );
      if (overlapped.length === 0) return;
      claims.push({ label: "Finding", value: clip(fact, 280), sources: overlapped });
    });

  const keepAssessment = (items: string[]) =>
    pool.length === 0
      ? []
      : items.filter((item) => pool.some((source) => supportsFact(item, source, plan))).slice(0, 3);

  const sourcedClaims = claims.filter(
    (claim) => !isNotFound(claim.value) && claim.sources.length > 0,
  );
  const sources = dedupeSources([
    ...pool,
    ...claims.flatMap((claim) => claim.sources),
  ]);

  return {
    ...base,
    status: sourcedClaims.length > 0 ? "found" : pool.length > 0 ? "thin" : "not_found",
    headline: acceptHeadline(fieldText(content, "headline"), grounding, pool),
    estimatedCost,
    leadTime,
    risk: pool.length ? normalizeRisk(fieldText(content, "risk")) : "unknown",
    pros: keepAssessment(fieldList(content, "pros")),
    cons: keepAssessment(fieldList(content, "cons")),
    claims,
    sources,
  };
}
