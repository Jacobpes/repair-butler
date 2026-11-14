import { countryName } from "@/lib/countries";
import { sourceMatchesIntake, sourcedLeadDays } from "@/lib/evidence";
import type { Intake, PathCard, PathId, Recommendation, Source } from "@/lib/types";
import { clip, isNotFound, looksQuantitative } from "@/lib/text";

const URGENCY_NOTE: Record<Intake["urgency"], string> = {
  emergency: "Line down. Prefer a sourced option that can move today.",
  "this-week": "Needed this week. A repair shop is reasonable if the pages support it.",
  planned: "Planned stop. A new or still-supported unit is reasonable if the pages support it.",
};

const FALLBACK_ORDER: Record<Intake["urgency"], PathId[]> = {
  emergency: ["used", "repair", "new", "diy", "obsolete"],
  "this-week": ["repair", "used", "new", "obsolete", "diy"],
  planned: ["new", "obsolete", "repair", "used", "diy"],
};

const PATH_ALIASES: Record<string, PathId> = {
  diy: "diy",
  "diy repair": "diy",
  repair: "repair",
  "repair service": "repair",
  used: "used",
  refurbished: "used",
  "used or refurbished": "used",
  new: "new",
  "new unit": "new",
  obsolete: "obsolete",
  successor: "obsolete",
  replacement: "obsolete",
};

export function coercePathId(value: unknown): PathId | null {
  if (typeof value !== "string") return null;
  return PATH_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function buildAnswerPrompt(intake: Intake, cards: PathCard[]): string {
  const blocks = cards
    .map((card) => {
      const facts = card.claims
        .filter((claim) => !isNotFound(claim.value))
        .map((claim) => `- ${claim.label}: ${claim.value}`)
        .join("\n");
      const pages = card.sources
        .slice(0, 3)
        .map((source) => source.url)
        .join(", ");
      return [
        `Path ${card.id} (${card.title}), status ${card.status}.`,
        card.headline,
        facts || "- No sourced figures.",
        pages ? `Pages: ${pages}` : "Pages: none.",
      ].join("\n");
    })
    .join("\n\n");

  return [
    `A maintenance technician in ${countryName(intake.country)} needs one resolution path.`,
    `Urgency: ${URGENCY_NOTE[intake.urgency]}`,
    `Unit: ${intake.manufacturer} ${intake.partNumber}`,
    `Symptom: ${intake.symptom}`,
    intake.notes ? `Note: ${intake.notes}` : "",
    "",
    "Sourced findings from live searches. Do not add a price, stock level, or lead time that is not written below.",
    blocks,
    "",
    "Choose recommendedPath as exactly one of: diy, repair, used, new, obsolete.",
    "Say what is missing when the evidence is thin.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => clip(item.trim(), 240))
    .filter(Boolean)
    .slice(0, max);
}

function pickCard(urgency: Intake["urgency"], cards: PathCard[]): PathCard | undefined {
  const order = FALLBACK_ORDER[urgency];
  const ranked = order
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is PathCard => Boolean(card));
  return (
    ranked.find((card) => card.status === "found") ??
    ranked.find((card) => card.status === "thin")
  );
}

export function fallbackRecommendation(
  intake: Intake,
  cards: PathCard[],
  caveat?: string,
): Recommendation {
  const picked = pickCard(intake.urgency, cards);
  const caveats = [
    "This ranking is a workshop rule for the urgency you chose. It is not a new fact from the web.",
  ];
  if (caveat) caveats.push(caveat);

  if (!picked) {
    return withFastest(intake, cards, {
      pathId: null,
      reason:
        "None of the five searches returned a sourced option, so there is nothing to recommend yet.",
      urgencyNote: URGENCY_NOTE[intake.urgency],
      caveats,
      sources: [],
      via: "urgency-rule",
      fastestPathId: null,
      fastestNote: "",
    });
  }

  return withFastest(intake, cards, {
    pathId: picked.id,
    reason: `For this urgency, the workshop rule picks ${picked.title} because that path has the strongest sourced pages in this run.`,
    urgencyNote: URGENCY_NOTE[intake.urgency],
    caveats,
    sources: picked.sources.slice(0, 4),
    via: "urgency-rule",
    fastestPathId: null,
    fastestNote: "",
  });
}

export function recommendationFromAnswer(
  answer: unknown,
  citations: Source[],
  intake: Intake,
  cards: PathCard[],
): Recommendation {
  const record =
    typeof answer === "string"
      ? readJsonObject(answer)
      : answer && typeof answer === "object" && !Array.isArray(answer)
        ? (answer as Record<string, unknown>)
        : null;

  if (!record) {
    return fallbackRecommendation(
      intake,
      cards,
      "Exa Answer did not return a structured recommendation.",
    );
  }

  const pathId = coercePathId(record.recommendedPath);
  let reason =
    typeof record.reason === "string" && record.reason.trim()
      ? clip(record.reason.trim(), 600)
      : "";
  const urgencyNote =
    typeof record.urgencyNote === "string" && record.urgencyNote.trim()
      ? clip(record.urgencyNote.trim(), 240)
      : URGENCY_NOTE[intake.urgency];
  const caveats = stringList(record.caveats, 4);

  if (!reason) {
    return fallbackRecommendation(intake, cards, "Exa Answer did not give a reason.");
  }
  const relevantCitations = citations.filter((citation) => sourceMatchesIntake(citation, intake));
  if (looksQuantitative(reason) && relevantCitations.length === 0) {
    reason =
      "Exa Answer included figures without citations, so those figures are withheld. Use the sourced numbers on the cards.";
  }
  if (!pathId || !cards.some((card) => card.id === pathId)) {
    const fallback = fallbackRecommendation(
      intake,
      cards,
      "Exa Answer did not name one of the five paths.",
    );
    return { ...fallback, caveats: [...caveats, ...fallback.caveats].slice(0, 4) };
  }

  return withFastest(intake, cards, {
    pathId,
    reason,
    urgencyNote,
    caveats,
    sources: relevantCitations.slice(0, 6),
    via: "exa-answer",
    fastestPathId: null,
    fastestNote: "",
  });
}

const NONE_READY = "No sourced in-stock purchase was found.";

function withFastest(
  intake: Intake,
  cards: PathCard[],
  recommendation: Recommendation,
): Recommendation {
  const fastest = fastestBuy(cards);
  const next: Recommendation = {
    ...recommendation,
    fastestPathId: fastest?.pathId ?? null,
    fastestNote: fastest?.note ?? NONE_READY,
  };
  if (intake.urgency !== "emergency" || next.pathId !== "repair") return next;
  const repair = cards.find((card) => card.id === "repair");
  if (!repairIsWeak(repair) || !fastest?.inStockOrSoon) return next;
  const card = cards.find((item) => item.id === fastest.pathId);
  return {
    ...next,
    pathId: fastest.pathId,
    via: "urgency-rule",
    reason: `Line down: ${fastest.note} A repair card without a sourced price and turnaround does not outrank a unit that can ship.`,
    urgencyNote: URGENCY_NOTE.emergency,
    caveats: [
      "Emergency ranking prefers a sourced in-stock purchase over a thin repair lead.",
      ...next.caveats,
    ].slice(0, 4),
    sources: card?.sources.slice(0, 4) ?? [],
  };
}

function repairIsWeak(card: PathCard | undefined): boolean {
  if (!card) return true;
  if (card.status !== "found") return true;
  return isNotFound(card.estimatedCost) && isNotFound(card.leadTime);
}

function fastestBuy(
  cards: PathCard[],
): { pathId: PathId; note: string; inStockOrSoon: boolean } | null {
  const buys = cards.filter(
    (card) => (card.id === "used" || card.id === "new") && !isNotFound(card.estimatedCost),
  );
  if (buys.length === 0) return null;
  const ranked = [...buys].sort((left, right) => {
    const leftDays = sourcedLeadDays(left.leadTime);
    const rightDays = sourcedLeadDays(right.leadTime);
    if (leftDays === null && rightDays === null) return 0;
    if (leftDays === null) return 1;
    if (rightDays === null) return -1;
    return leftDays - rightDays;
  });
  const pick = ranked[0];
  if (!pick) return null;
  const days = sourcedLeadDays(pick.leadTime);
  const inStockOrSoon = days !== null && days <= 7;
  const note =
    days === null
      ? `${pick.title} has a sourced price (${pick.estimatedCost}) but no sourced lead time.`
      : `${pick.title}: ${pick.leadTime}. ${pick.estimatedCost}.`;
  return { pathId: pick.id, note, inStockOrSoon };
}

function readJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}
