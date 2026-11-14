import { mentionsPart, mentionsTerm } from "@/lib/part";
import type { PathPlan, RawHit, Source } from "@/lib/types";
import { siteHost } from "@/lib/text";

const SOCIAL_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "reddit.com",
];

const DEAD =
  /listing (?:has|was) ended|this listing (?:was|has) ended|no longer available|item (?:has been|was) sold|page not found|404 not found|this page does(?:n't| not) exist/i;

const SUCCESSOR =
  /discontinu|successor|replaced by|end of life|\bobsolete\b|phase[- ]?out|migration/i;

const REPAIR =
  /\brepairs?\b|\brefurbished\b|\breconditioning\b|\bservice exchange\b|\bworkshop\b/i;

const STALE_MONTHS: Partial<Record<PathPlan["id"], number>> = {
  used: 24,
  new: 36,
};

type Currency = "EUR" | "USD" | "GBP" | "SEK" | "NOK" | "DKK" | "PLN";

const EUR_PER: Record<Currency, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  SEK: 0.088,
  NOK: 0.085,
  DKK: 0.134,
  PLN: 0.23,
};

const EU_SUFFIXES = [
  ".fi",
  ".eu",
  ".de",
  ".se",
  ".nl",
  ".dk",
  ".ee",
  ".pl",
  ".at",
  ".fr",
  ".it",
  ".es",
  ".be",
  ".cz",
  ".ie",
];

const PRICE_RE =
  /(?:(?:USD|EUR|GBP|SEK|NOK|DKK|PLN)\s+)(?:€|£|\$)?\s?\d{1,3}(?:[ \u00a0,]\d{3})*(?:[.,]\d{2})?|(?:€|£|\$)\s?\d{1,3}(?:[ \u00a0,]\d{3})*(?:[.,]\d{2})?|\b\d{1,3}(?:[ \u00a0.]\d{3})*(?:[.,]\d{2})?\s?(?:EUR|USD|GBP|SEK|NOK|DKK|PLN|€|£|\$)\b/gi;

const LEAD_RES = [
  /\b\d+\s+in stock\b/i,
  /\bin stock\b/i,
  /\b(?:ships|shipping)\s+today\b/i,
  /\bready to ship\b/i,
  /\bships?\s+(?:in\s+)?\d+\s*[-–to]+\s*\d+\s*(?:business\s+)?(?:days?|weeks?)\b/i,
  /\b\d+\s*[-–]\s*\d+\s*(?:business\s+)?(?:days?|weeks?)\b/i,
  /\b\d+\s+(?:business\s+)?(?:days?|weeks?)\b/i,
];

type Condition = "new" | "used" | "refurbished" | "repair";

type Offer = {
  verbatim: string;
  amount: number;
  currency: Currency | null;
  quantity: number | null;
  source: Source;
  eu: boolean;
  condition: Condition;
};

export function sourceText(source: Source): string {
  return `${source.title} ${source.highlight ?? ""}`;
}

export function numbersAreVerbatim(fact: string, text: string): boolean {
  const numbers = fact.match(/\d[\d.,]*/g) ?? [];
  return numbers.every((number) => text.includes(number));
}

export function filterHits(plan: PathPlan, hits: RawHit[] | undefined): RawHit[] {
  return (hits ?? []).flatMap((hit) => {
    if (!hit.url || isSocial(hit.url)) return [];
    const blob = matchBlob(hit);
    if ((plan.id === "used" || plan.id === "new") && DEAD.test(blob)) return [];
    if (isNewsUrl(hit.url) && plan.id !== "obsolete") return [];
    const staleAfter = STALE_MONTHS[plan.id];
    if (staleAfter && isStale(hit.publishedDate, plan.asOf, staleAfter)) return [];
    if (!matchesPath(plan, blob)) return [];
    if (plan.id === "obsolete" && isNewsUrl(hit.url) && !SUCCESSOR.test(blob)) return [];
    return [orderHighlights(hit, plan)];
  });
}

export function commercialFacts(
  plan: PathPlan,
  sources: Source[],
  model: { cost: string; lead: string },
): { estimatedCost: string; costSources: Source[]; leadTime: string; leadSources: Source[] } {
  const eligible = sources.filter((source) => quoteNames(sourceText(source), plan));
  const offers = eligible.flatMap((source) => offersFrom(sourceText(source), source, plan));
  const chosen = chooseOffer(offers, plan.country);
  const modelCost = chosen ? null : findModelPhrase(model.cost, eligible, plan, false);

  let estimatedCost = chosen
    ? formatOffer(chosen, plan.country)
    : (modelCost?.display ?? "not found");
  const costNeedle = chosen?.verbatim ?? modelCost?.needle ?? "";
  let costSources = sourcesContaining(eligible, costNeedle);
  if (costSources.length === 0) {
    estimatedCost = "not found";
    costSources = [];
  }

  const leadFromPrice = chosen ? firstLead(sourceText(chosen.source)) : null;
  const leadFromAny =
    leadFromPrice ?? eligible.map((source) => firstLead(sourceText(source))).find(Boolean) ?? null;
  const modelLead = leadFromAny ? null : findModelPhrase(model.lead, eligible, plan, true);
  let leadTime = leadFromAny ?? modelLead?.display ?? "not found";
  const leadNeedle = leadFromAny ?? modelLead?.needle ?? "";
  let leadSources = sourcesContaining(eligible, leadNeedle);
  if (leadSources.length === 0) {
    leadTime = "not found";
    leadSources = [];
  }

  return { estimatedCost, costSources, leadTime, leadSources };
}

export function sourcedLeadDays(lead: string): number | null {
  if (/\bin stock\b/i.test(lead) || /ships?\s+today/i.test(lead) || /ready to ship/i.test(lead)) {
    return 0;
  }
  const range = lead.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:business\s+)?(day|week)/i);
  if (range) {
    const days = Number(range[2]);
    return /week/i.test(range[3] ?? "") ? days * 7 : days;
  }
  const single = lead.match(/(\d+)\s*(?:business\s+)?(day|week)/i);
  if (single) {
    const days = Number(single[1]);
    return /week/i.test(single[2] ?? "") ? days * 7 : days;
  }
  return null;
}

function matchesPath(plan: PathPlan, blob: string): boolean {
  if (plan.id === "repair") return repairRelevant(blob, plan);
  if (plan.id === "obsolete") return mentionsPart(blob, plan.partNumber) && SUCCESSOR.test(blob);
  return mentionsPart(blob, plan.partNumber);
}

function repairRelevant(blob: string, plan: PathPlan): boolean {
  const named =
    mentionsPart(blob, plan.partNumber) ||
    plan.familyTerms.some((term) => mentionsTerm(blob, term));
  return named && REPAIR.test(blob);
}

function quoteNames(text: string, plan: PathPlan): boolean {
  if (mentionsPart(text, plan.partNumber)) return true;
  if (plan.id !== "repair") return false;
  return plan.familyTerms.some((term) => mentionsTerm(text, term));
}

function matchBlob(hit: RawHit): string {
  return `${hit.title ?? ""} ${(hit.highlights ?? []).join(" ")} ${hit.text ?? ""}`;
}

function orderHighlights(hit: RawHit, plan: PathPlan): RawHit {
  const highlights = hit.highlights ?? [];
  const named = highlights.filter((item) => quoteNames(`${hit.title ?? ""} ${item}`, plan));
  const rest = highlights.filter((item) => !quoteNames(`${hit.title ?? ""} ${item}`, plan));
  return { ...hit, highlights: [...named, ...rest] };
}

function isSocial(url: string): boolean {
  const host = siteHost(url).toLowerCase();
  return SOCIAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isNewsUrl(url: string): boolean {
  try {
    return /\/(?:news|press|press-releases|articles?)\//i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isStale(published: string | undefined, asOf: string, months: number): boolean {
  if (!published) return false;
  const date = new Date(published);
  const now = new Date(asOf);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return date.getTime() < cutoff.getTime();
}

function offersFrom(text: string, source: Source, plan: PathPlan): Offer[] {
  const offers: Offer[] = [];
  for (const match of text.matchAll(new RegExp(PRICE_RE.source, "gi"))) {
    const verbatim = match[0].trim();
    const amount = parseAmount(verbatim);
    if (amount === null || match.index === undefined) continue;
    offers.push({
      verbatim,
      amount,
      currency: currencyOf(verbatim),
      quantity: quantityNear(text, match.index, verbatim.length),
      source,
      eu: isEuSeller(source.url, text),
      condition: conditionFor(text, plan.id),
    });
  }
  return offers;
}

function chooseOffer(offers: Offer[], country: string): Offer | null {
  if (offers.length === 0) return null;
  const units = offers.filter((offer) => offer.quantity === null || offer.quantity === 1);
  const pool = units.length > 0 ? units : offers;
  if (country !== "FI") return pool[0] ?? null;
  return [...pool].sort((left, right) => Number(right.eu) - Number(left.eu))[0] ?? null;
}

function formatOffer(offer: Offer, country: string): string {
  let body = offer.verbatim;
  if (offer.quantity !== null && offer.quantity > 1) {
    body = `${offer.verbatim} for ${offer.quantity} pcs`;
  }
  if (country === "FI" && offer.currency && offer.currency !== "EUR") {
    const eur = formatGrouped(Math.round(offer.amount * EUR_PER[offer.currency]));
    body = `${body} (about EUR ${eur} converted, not a price printed on the page)`;
  }
  return `${conditionLabel(offer.condition)} · ${body}`;
}

function findModelPhrase(
  phrase: string,
  sources: Source[],
  plan: PathPlan,
  lead: boolean,
): { display: string; needle: string } | null {
  const trimmed = phrase.trim();
  if (!trimmed || /^not found$/i.test(trimmed)) return null;
  for (const source of sources) {
    const text = sourceText(source);
    const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
    if (index === -1 || !numbersAreVerbatim(trimmed, text)) continue;
    const verbatim = text.slice(index, index + trimmed.length);
    if (lead) return { display: verbatim, needle: verbatim };
    const offer: Offer = {
      verbatim,
      amount: parseAmount(verbatim) ?? 0,
      currency: currencyOf(verbatim),
      quantity: quantityNear(text, index, verbatim.length),
      source,
      eu: isEuSeller(source.url, text),
      condition: conditionFor(text, plan.id),
    };
    if (offer.quantity !== null && offer.quantity > 1) continue;
    const display =
      offer.currency && offer.amount > 0
        ? formatOffer(offer, plan.country)
        : `${conditionLabel(offer.condition)} · ${verbatim}`;
    return { display, needle: verbatim };
  }
  return null;
}

function sourcesContaining(sources: Source[], needle: string): Source[] {
  const clean = needle.trim();
  if (!clean) return [];
  return sources.filter((source) => sourceText(source).toLowerCase().includes(clean.toLowerCase()));
}

function firstLead(text: string): string | null {
  for (const expression of LEAD_RES) {
    const match = expression.exec(text);
    if (match) return match[0];
  }
  return null;
}

function quantityNear(text: string, index: number, length: number): number | null {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + length + 24);
  const window = text.slice(start, end);
  let bestQuantity: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const patterns = [
    /\b(\d+)\s*(?:pcs|pc|pieces|piece|units|unit|stk)\b/gi,
    /\b(?:pack|lot|set)\s+of\s+(\d+)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of window.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const quantity = Number(match[1]);
      const distance = Math.abs(start + match.index - index);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestQuantity = quantity;
      }
    }
  }
  return bestQuantity;
}

function parseAmount(verbatim: string): number | null {
  const digits = verbatim.replace(/[^\d.,]/g, "");
  if (!digits || !/\d/.test(digits)) return null;
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  let normalized = digits;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const after = digits.length - lastComma - 1;
    normalized = after === 2 ? digits.replace(",", ".") : digits.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const after = digits.length - lastDot - 1;
    normalized = after === 3 ? digits.replace(/\./g, "") : digits;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  return value;
}

function currencyOf(verbatim: string): Currency | null {
  if (/€|\bEUR\b/i.test(verbatim)) return "EUR";
  if (/\$|\bUSD\b/i.test(verbatim)) return "USD";
  if (/£|\bGBP\b/i.test(verbatim)) return "GBP";
  if (/\bSEK\b/i.test(verbatim)) return "SEK";
  if (/\bNOK\b/i.test(verbatim)) return "NOK";
  if (/\bDKK\b/i.test(verbatim)) return "DKK";
  if (/\bPLN\b/i.test(verbatim)) return "PLN";
  return null;
}

function conditionFor(text: string, pathId: PathPlan["id"]): Condition {
  if (pathId === "repair") return "repair";
  if (/refurb|reconditioned|remanufactured|rebuilt/i.test(text)) return "refurbished";
  if (/\bused\b|second[- ]hand|pre-owned|surplus/i.test(text)) return "used";
  if (/\bnew\b|factory[- ]sealed|unused|brand new/i.test(text)) return "new";
  if (pathId === "used") return "used";
  return "new";
}

function conditionLabel(condition: Condition): string {
  if (condition === "new") return "New";
  if (condition === "used") return "Used";
  if (condition === "refurbished") return "Refurbished";
  return "Repair service";
}

function isEuSeller(url: string, text: string): boolean {
  const host = siteHost(url).toLowerCase();
  if (EU_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return /€|\bEUR\b/.test(text);
}

function formatGrouped(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
