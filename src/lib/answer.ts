import { countryName } from "@/lib/countries";
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
    return {
      pathId: null,
      reason:
        "None of the five searches returned a sourced option, so there is nothing to recommend yet.",
      urgencyNote: URGENCY_NOTE[intake.urgency],
      caveats,
      sources: [],
      via: "urgency-rule",
    };
  }

  return {
    pathId: picked.id,
    reason: `For this urgency, the workshop rule picks ${picked.title} because that path has the strongest sourced pages in this run.`,
    urgencyNote: URGENCY_NOTE[intake.urgency],
    caveats,
    sources: picked.sources.slice(0, 4),
    via: "urgency-rule",
  };
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
  if (looksQuantitative(reason) && citations.length === 0) {
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

  return {
    pathId,
    reason,
    urgencyNote,
    caveats,
    sources: citations.slice(0, 6),
    via: "exa-answer",
  };
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
