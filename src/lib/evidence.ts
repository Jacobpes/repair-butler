import {
  conflictsWithPart,
  familyTerms,
  mentionsPart,
  mentionsTerm,
  nearerSibling,
  symptomHits,
  urlMentionsPart,
} from "@/lib/part";
import type { Intake, PathPlan, RawHit, RawSearch, Source } from "@/lib/types";
import { normalizeUrl, siteHost } from "@/lib/text";

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

const SHOP_HOSTS = [
  "ebay.com",
  "ebay.de",
  "ebay.co.uk",
  "ebay.fr",
  "ebay.it",
  "amazon.com",
  "amazon.de",
  "amazon.co.uk",
  "aliexpress.com",
  "radwell.com",
  "radwell.eu",
  "radwell.co.uk",
  "radwell.de",
  "plc-city.com",
  "plc-city.de",
  "plc-city.co.uk",
  "dosupply.com",
  "mroelectric.com",
  "plchardware.com",
  "unisgroup.com",
  "surplusrecord.com",
  "labx.com",
  "galco.com",
  "mouser.com",
  "digikey.com",
  "discount-automation.com",
  "airlinehydraulics.com",
  "drive-outlet.co.uk",
  "drive-outlet.com",
];

const REPAIR_HOSTS = ["controlboardlab.com", "foxon.cz", "foxon.com", "foxon.eu"];

const LEAD_RES = [
  /\b\d+\s+in stock\b/i,
  /\bin stock\b/i,
  /\b(?:ships|shipping)\s+today\b/i,
  /\bready to ship\b/i,
  /\bships?\s+(?:in\s+)?\d+\s*[-–to]+\s*\d+\s*(?:business\s+)?(?:days?|weeks?)\b/i,
  /\b\d+\s*[-–]\s*\d+\s*(?:business\s+)?(?:days?|weeks?)\b/i,
  /\b\d+\s+(?:business\s+)?(?:days?|weeks?)\b/i,
];

type Condition = "new" | "used" | "refurbished" | "repair" | "listed";

type Offer = {
  verbatim: string;
  amount: number;
  currency: Currency | null;
  quantity: number | null;
  source: Source;
  eu: boolean;
  condition: Condition;
  lead: string | null;
};

export function sourceText(source: Source): string {
  return `${source.title} ${source.highlight ?? ""}`;
}

export function numbersAreVerbatim(fact: string, text: string): boolean {
  const numbers = fact.match(/\d[\d.,]*/g) ?? [];
  return numbers.every((number) => numberIsBounded(text, number));
}

function numberIsBounded(text: string, number: string): boolean {
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(number, from);
    if (at < 0) return false;
    const before = at > 0 ? text[at - 1] : "";
    const after = text[at + number.length] ?? "";
    if (!/\d/.test(before ?? "") && !/\d/.test(after)) return true;
    from = at + 1;
  }
  return false;
}

export function filterHits(plan: PathPlan, hits: RawHit[] | undefined): RawHit[] {
  return (hits ?? []).flatMap((hit) => {
    if (!hit.url || isSocial(hit.url)) return [];
    const blob = matchBlob(hit);
    if ((plan.id === "used" || plan.id === "new") && DEAD.test(blob)) return [];
    if (isNewsUrl(hit.url) && plan.id !== "obsolete") return [];
    const staleAfter = STALE_MONTHS[plan.id];
    if (staleAfter && isStale(hit.publishedDate, plan.asOf, staleAfter)) return [];
    const compared = plan.id === "used" || plan.id === "new" ? listingBlob(hit) : blob;
    if (!matchesPath(plan, compared, hit.url)) return [];
    if (plan.id === "obsolete" && isNewsUrl(hit.url) && !SUCCESSOR.test(blob)) return [];
    return [orderHighlights(hit, plan)];
  });
}

export function commercialFacts(
  plan: PathPlan,
  sources: Source[],
  model: { cost: string; lead: string },
): { estimatedCost: string; costSources: Source[]; leadTime: string; leadSources: Source[] } {
  if (plan.id === "diy" || plan.id === "obsolete") {
    return { estimatedCost: "not found", costSources: [], leadTime: "not found", leadSources: [] };
  }
  const eligible = sources.filter((source) => quoteNames(sourceText(source), source.url, plan));
  const offers = eligible.flatMap((source) => offersFrom(sourceText(source), source, plan));
  const chosen = chooseOffer(offers, plan.country, plan.id);
  const modelCost = chosen ? null : findModelPhrase(model.cost, eligible, plan, false);

  let estimatedCost = chosen
    ? formatOffer(chosen, plan.country)
    : (modelCost?.display ?? "not found");
  const costNeedle = chosen?.verbatim ?? modelCost?.needle ?? "";
  let costSources = sourcesContaining(eligible, costNeedle);
  if (chosen) costSources = costSources.filter((source) => source.url === chosen.source.url);
  if (costSources.length === 0) {
    estimatedCost = "not found";
    costSources = [];
  }

  let leadTime = chosen?.lead ?? "not found";
  let leadSources = chosen?.lead ? [chosen.source] : [];
  if (chosen && !chosen.lead) {
    const samePageLead = findModelPhrase(model.lead, [chosen.source], plan, true);
    if (samePageLead) {
      leadTime = samePageLead.display;
      leadSources = [chosen.source];
    }
  }
  if (!chosen) {
    const pageLead = eligible
      .map((source) => ({ source, lead: firstLead(sourceText(source), plan.id) }))
      .find((item) => item.lead);
    if (pageLead?.lead) {
      leadTime = pageLead.lead;
      leadSources = [pageLead.source];
    } else {
      const fallbackLead = findModelPhrase(model.lead, eligible, plan, true);
      leadTime = fallbackLead?.display ?? "not found";
      leadSources = fallbackLead ? sourcesContaining(eligible, fallbackLead.needle) : [];
    }
  }
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

function matchesPath(plan: PathPlan, blob: string, url: string): boolean {
  if (conflictsWithPart(`${blob} ${url}`, plan.partNumber)) return false;
  if (plan.id === "repair") return repairRelevant(blob, url, plan);
  if (plan.id === "diy") return diyRelevant(blob, url, plan);
  if (plan.id === "obsolete") return successorRelevant(blob, url, plan);
  if (isRepairHost(url) || isRepairServiceText(url, blob)) return false;
  return mentionsPart(blob, plan.partNumber) || urlMentionsPart(url, plan.partNumber);
}

function namedProduct(blob: string, url: string, plan: PathPlan): boolean {
  return (
    mentionsPart(blob, plan.partNumber) ||
    urlMentionsPart(url, plan.partNumber) ||
    plan.familyTerms.some((term) => mentionsTerm(blob, term) || mentionsTerm(url, term))
  );
}

function diyRelevant(blob: string, url: string, plan: PathPlan): boolean {
  if (isShopHost(url) || isRepairHost(url) || isRepairServiceText(url, blob)) return false;
  if (mentionsPart(blob, plan.partNumber) || urlMentionsPart(url, plan.partNumber)) return true;
  if (!plan.familyTerms.some((term) => mentionsTerm(blob, term))) return false;
  return symptomHits(blob, plan.symptom);
}

function successorRelevant(blob: string, url: string, plan: PathPlan): boolean {
  if (isShopHost(url) && !SUCCESSOR.test(blob)) return false;
  if (!namedProduct(blob, url, plan)) return false;
  return SUCCESSOR.test(blob) || symptomHits(blob, plan.symptom);
}

function repairRelevant(blob: string, url: string, plan: PathPlan): boolean {
  const named =
    namedProduct(blob, url, plan) ||
    (isRepairHost(url) && mentionsTerm(blob, plan.manufacturer));
  if (!named) return false;
  if (isRepairHost(url)) return true;
  return REPAIR.test(blob);
}

function quoteNames(text: string, url: string, plan: PathPlan): boolean {
  if (mentionsPart(text, plan.partNumber) || urlMentionsPart(url, plan.partNumber)) return true;
  if (plan.id === "used" || plan.id === "new") return false;
  return plan.familyTerms.some((term) => mentionsTerm(text, term));
}

function listingBlob(hit: RawHit): string {
  return `${hit.title ?? ""} ${(hit.highlights ?? []).join(" ")}`;
}

function matchBlob(hit: RawHit): string {
  return `${listingBlob(hit)} ${hit.text ?? ""}`;
}

function orderHighlights(hit: RawHit, plan: PathPlan): RawHit {
  const highlights = hit.highlights ?? [];
  const named = highlights.filter((item) => quoteNames(`${hit.title ?? ""} ${item}`, hit.url ?? "", plan));
  const rest = highlights.filter((item) => !quoteNames(`${hit.title ?? ""} ${item}`, hit.url ?? "", plan));
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
  const prices = findPrices(text);
  return prices.flatMap((price, index) => {
    const amount = parseAmount(price.verbatim);
    if (amount === null) return [];
    const next = prices[index + 1]?.index ?? text.length;
    const start = Math.max(0, price.index - 180);
    const window = text.slice(start, next);
    const before = text.slice(Math.max(0, price.index - 28), price.index);
    if (/\b(save|discount)\b/i.test(before) && !/\bprice\b/i.test(before)) return [];
    if (nearerSibling(window, plan.partNumber, price.index - start)) return [];
    if (!offerAnchored(window, source.url, plan)) return [];
    const currency = currencyOf(price.verbatim);
    return [
      {
        verbatim: price.verbatim,
        amount,
        currency,
        quantity: quantityNear(text, price.index, price.verbatim.length),
        source,
        eu: offerIsEu(source.url, currency),
        condition: conditionNear(window, plan.id, price.index - start),
        lead: firstLead(window, plan.id),
      },
    ];
  });
}

function repairPriceLanguage(text: string): boolean {
  return /\b(flat[-\s]?rate|repair price|repair cost|to repair|for repair|cost of repair)\b/i.test(text);
}

function saleLanguage(text: string): boolean {
  return /\b(for sale|add to cart|buy now|in stock|excl\.?\s*vat|purchase|sales)\b/i.test(text);
}

function offerAnchored(window: string, url: string, plan: PathPlan): boolean {
  if (conflictsWithPart(window, plan.partNumber) && !mentionsPart(window, plan.partNumber)) return false;
  if ((plan.id === "used" || plan.id === "new") && /\b(for repair|repair price|send it to us|product overhaul)\b/i.test(window)) {
    return false;
  }
  if (plan.id === "repair" && /\breplacement\b|\bsealed surplus\b/i.test(window)) return false;
  if (plan.id === "repair" && !repairPriceLanguage(window) && (saleLanguage(window) || !isRepairHost(url))) {
    return false;
  }
  if (/\btypical repairs?\b|\bmost modules\b/i.test(window) && !mentionsPart(window, plan.partNumber)) {
    return false;
  }
  if (mentionsPart(window, plan.partNumber) || urlMentionsPart(url, plan.partNumber)) return true;
  if (plan.id === "used" || plan.id === "new") return false;
  return plan.familyTerms.some((term) => mentionsTerm(window, term));
}

function chooseOffer(offers: Offer[], country: string, pathId: PathPlan["id"]): Offer | null {
  if (offers.length === 0) return null;
  const units = offers.filter((offer) => offer.quantity === null || offer.quantity === 1);
  let pool = units.length > 0 ? units : offers;
  if (pathId === "new") {
    const fresh = pool.filter((offer) => offer.condition === "new");
    if (fresh.length > 0) pool = fresh;
  }
  if (pathId === "used") {
    const secondary = pool.filter(
      (offer) => offer.condition === "used" || offer.condition === "refurbished",
    );
    if (secondary.length > 0) pool = secondary;
  }
  if (country === "FI") {
    const eu = pool.filter((offer) => offer.eu);
    if (eu.length > 0) pool = eu;
  }
  return [...dropOutliers(pool)].sort((left, right) => eurValue(left) - eurValue(right))[0] ?? null;
}

function dropOutliers(offers: Offer[]): Offer[] {
  if (offers.length < 2) return offers;
  const values = offers.map(eurValue).sort((left, right) => left - right);
  const mid = values[Math.floor(values.length / 2)] ?? 0;
  if (mid < 80) return offers;
  const kept = offers.filter((offer) => eurValue(offer) >= mid * 0.25);
  return kept.length > 0 ? kept : offers;
}

function eurValue(offer: Offer): number {
  if (!offer.currency) return offer.amount;
  return offer.amount * EUR_PER[offer.currency];
}

function formatOffer(offer: Offer, country: string): string {
  let body = tidyPrice(offer.verbatim);
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
      eu: offerIsEu(source.url, currencyOf(verbatim)),
      condition: conditionNear(text, plan.id, index),
      lead: firstLead(text, plan.id),
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

function firstLead(text: string, pathId?: PathPlan["id"]): string | null {
  for (const expression of LEAD_RES) {
    const match = expression.exec(text);
    if (!match) continue;
    if (pathId === "repair" && /\bstock\b|ships?\s+today|ready to ship/i.test(match[0])) continue;
    const stockCount = Number.parseInt(match[0], 10);
    if (/\bin stock\b/i.test(match[0]) && Number.isFinite(stockCount) && stockCount > 500) continue;
    return match[0];
  }
  return null;
}

function quantityNear(text: string, index: number, length: number): number | null {
  const after = text.slice(index + length, index + length + 16);
  if (/^\s*\/\s*EA\b/i.test(after) || /^\s*each\b/i.test(after)) return 1;
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
  if (/\bSEK\b|\bkr\b/i.test(verbatim)) return "SEK";
  if (/\bNOK\b/i.test(verbatim)) return "NOK";
  if (/\bDKK\b/i.test(verbatim)) return "DKK";
  if (/\bPLN\b/i.test(verbatim)) return "PLN";
  return null;
}

function conditionNear(text: string, pathId: PathPlan["id"], priceAt: number): Condition {
  if (pathId === "repair") return "repair";
  const earlier = findPrices(text.slice(0, priceAt)).at(-1);
  const start = earlier ? earlier.index + earlier.verbatim.length : Math.max(0, priceAt - 60);
  const slice = text.slice(start, priceAt + 16);
  const localAt = priceAt - start;
  const explicit = /condition\s*[:\-]\s*(refurbished|refurb|reconditioned|remanufactured|new|used)/i.exec(slice);
  if (explicit?.[1]) return mapCondition(explicit[1]);
  const cleaned = slice.replace(/\bnever\s+used\b/gi, "unused").replace(/\bused\s+(?:in|for|with|on|as|to|by)\b/gi, " ");
  const words = [
    ...cleaned.matchAll(
      /\b(refurbished|reconditioned|remanufactured|rebuilt|factory[-\s]?sealed|brand new|unused|new|used|second[-\s]?hand|pre-owned|surplus)\b/gi,
    ),
  ];
  const specific = words.filter((word) => !/^surplus$/i.test(word[1] ?? ""));
  const pool = specific.length > 0 ? specific : words;
  if (pool.length === 0) {
    if (/\bsurplus\b/i.test(text)) return "listed";
    return pathId === "used" ? "listed" : "new";
  }
  let closest = pool[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const word of pool) {
    const at = Math.abs((word.index ?? 0) - localAt);
    if (at < distance) {
      distance = at;
      closest = word;
    }
  }
  return mapCondition(closest?.[1] ?? "");
}

function mapCondition(word: string): Condition {
  if (/refurb|recondition|remanufactur|rebuilt/i.test(word)) return "refurbished";
  if (/surplus/i.test(word)) return "listed";
  if (/new|sealed|unused/i.test(word)) return "new";
  return "used";
}

function conditionLabel(condition: Condition): string {
  if (condition === "new") return "New";
  if (condition === "used") return "Used";
  if (condition === "refurbished") return "Refurbished";
  if (condition === "listed") return "Listed";
  return "Repair service";
}

function offerIsEu(url: string, currency: Currency | null): boolean {
  if (currency === "EUR") return true;
  const host = siteHost(url).toLowerCase();
  return EU_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

function hostIs(url: string, domains: string[]): boolean {
  const host = siteHost(url).toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isShopHost(url: string): boolean {
  return hostIs(url, SHOP_HOSTS);
}

function isRepairHost(url: string): boolean {
  return hostIs(url, REPAIR_HOSTS);
}

const MONEY_NUMBER =
  "(?:\\d{1,3}(?:[ \\u00a0]\\d{3})+(?:[.,]\\d{2})?|\\d{1,3}(?:\\.\\d{3})+(?:,\\d{2})?|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{2})?|\\d+(?:[ \\u00a0]*[.,][ \\u00a0]*\\d{2})?)";

function tidyPrice(verbatim: string): string {
  return verbatim
    .replace(/\s+/g, " ")
    .replace(/\s*([.,])\s*(?=\d{2}\b)/g, "$1")
    .trim();
}

function findPrices(text: string): { verbatim: string; index: number }[] {
  const found: { verbatim: string; index: number }[] = [];
  const occupied: [number, number][] = [];
  const prefix = new RegExp(`(?:USD|EUR|GBP|SEK|NOK|DKK|PLN)\\s+|[€£$]\\s?`, "gi");
  const numberAtStart = new RegExp(`^${MONEY_NUMBER}`);
  let match: RegExpExecArray | null;
  while ((match = prefix.exec(text))) {
    const start = match.index;
    const rest = text.slice(start + match[0].length);
    const number = numberAtStart.exec(rest);
    if (!number) continue;
    const end = start + match[0].length + number[0].length;
    if (/\d/.test(text[end] ?? "")) continue;
    found.push({ verbatim: text.slice(start, end).replace(/\s+/g, " ").trim(), index: start });
    occupied.push([start, end]);
    prefix.lastIndex = end;
  }
  const suffix = new RegExp(
    `\\b${MONEY_NUMBER}\\s?(?:EUR|USD|GBP|SEK|NOK|DKK|PLN|kr|€|£|\\$)\\b`,
    "gi",
  );
  while ((match = suffix.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (occupied.some(([from, to]) => start < to && end > from)) continue;
    if (/\d/.test(text[end] ?? "") || /\d/.test(text[start - 1] ?? "")) continue;
    found.push({ verbatim: match[0].replace(/\s+/g, " ").trim(), index: start });
  }
  return found.sort((left, right) => left.index - right.index);
}

export function sourceMatchesIntake(
  source: Pick<Source, "url" | "title" | "highlight">,
  intake: Pick<Intake, "manufacturer" | "partNumber" | "symptom">,
): boolean {
  const text = `${source.title} ${source.url} ${source.highlight ?? ""}`;
  const families = familyTerms({
    manufacturer: intake.manufacturer,
    partNumber: intake.partNumber,
    symptom: intake.symptom,
  });
  if (conflictsWithPart(text, intake.partNumber)) return false;
  if (mentionsPart(text, intake.partNumber) || urlMentionsPart(source.url, intake.partNumber)) return true;
  if (families.some((term) => mentionsTerm(text, term))) return true;
  return mentionsTerm(text, intake.manufacturer) && symptomHits(text, intake.symptom);
}

export function rehomeRepairHits(plans: PathPlan[], raws: Map<PathPlan["id"], RawSearch>): void {
  const repairPlan = plans.find((plan) => plan.id === "repair");
  const repair = raws.get("repair");
  if (!repairPlan || !repair || repair.error) return;
  const seen = new Set((repair.results ?? []).map((hit) => normalizeUrl(hit.url ?? "")));
  for (const plan of plans) {
    if (plan.id === "repair") continue;
    const raw = raws.get(plan.id);
    if (!raw?.results) continue;
    const keep: RawHit[] = [];
    for (const hit of raw.results) {
      if (isRepairOffer(hit, repairPlan)) {
        const key = normalizeUrl(hit.url ?? "");
        if (key && !seen.has(key)) {
          repair.results = [...(repair.results ?? []), hit];
          seen.add(key);
        }
        continue;
      }
      keep.push(hit);
    }
    raw.results = keep;
  }
}

function isRepairServiceText(url: string, blob: string): boolean {
  if (/forum|reddit\.|stackexchange|\/posts\/|manual|literature\.|\.pdf(?:$|\?)/i.test(url)) return false;
  if (isRepairHost(url)) return true;
  if (/\bhow to\b|\bprocedure\b|\breplace the\b/i.test(blob) && !/\brepair service\b/i.test(blob)) {
    return false;
  }
  return /\b(repair service|we repair|flat[-\s]?rate|free evaluation|product overhaul|send[-\s]?in|no-fix,\s*no-fee|servisujeme)\b|维修|修理/i.test(
    blob,
  );
}

function isRepairOffer(hit: RawHit, plan: PathPlan): boolean {
  if (!hit.url) return false;
  const blob = matchBlob(hit);
  const named = namedProduct(blob, hit.url, plan) || mentionsTerm(blob, plan.manufacturer);
  if (!named || conflictsWithPart(`${blob} ${hit.url}`, plan.partNumber)) return false;
  return isRepairServiceText(hit.url, `${hit.title ?? ""} ${hit.url} ${blob}`);
}

function formatGrouped(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
