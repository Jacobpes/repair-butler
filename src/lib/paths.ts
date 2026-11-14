import { countryName } from "@/lib/countries";
import type { Intake, PathPlan } from "@/lib/types";

export const PATH_META = [
  { id: "diy", title: "DIY repair", summary: "Failure modes and published fixes" },
  { id: "repair", title: "Repair service", summary: "Shops that take this model" },
  { id: "used", title: "Used or refurbished", summary: "Current listings" },
  { id: "new", title: "New unit", summary: "Distributors and stock" },
  { id: "obsolete", title: "Successor", summary: "Discontinuation and replacements" },
] as const;

export const EXTRACTION_PROMPT =
  'Extract only facts the results state about this exact part. Never invent a price, stock level, lead time, failure mode, or discontinuation. If a fact is missing, write exactly "not found" for text fields and use an empty list for arrays. Ignore listings for a different part number.';

export const HIGHLIGHT_QUERY =
  "price, stock, lead time, turnaround, failure mode, condition, discontinued, successor, part number";

const OBJECTIVE =
  "Help a maintenance technician compare realistic ways to restore one broken industrial electronic unit: DIY repair, a repair service, a used or refurbished unit, a new unit, or an official successor. Rank pages that name this exact part number. Pull only published prices, stock, lead times, failure modes, and discontinuation notices.";

const MARKETPLACES = [
  "ebay.com",
  "ebay.de",
  "ebay.co.uk",
  "ebay.fr",
  "ebay.it",
  "amazon.com",
  "amazon.de",
  "amazon.co.uk",
  "aliexpress.com",
];

const LISTING_DOMAINS = [
  "ebay.com",
  "ebay.de",
  "ebay.co.uk",
  "ebay.fr",
  "ebay.it",
  "radwell.com",
  "radwell.eu",
  "euautomation.com",
  "plc-city.com",
  "surplusrecord.com",
  "labx.com",
];

export function publishedAfter(now: Date, months: number): string {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString();
}

function partLabel(intake: Intake): string {
  return `${intake.manufacturer} ${intake.partNumber}`.trim();
}

function note(intake: Intake): string {
  return intake.notes ? ` Technician note: ${intake.notes}` : "";
}

export function buildPathPlans(intake: Intake, now = new Date()): PathPlan[] {
  const part = partLabel(intake);
  const place = countryName(intake.country);
  const extra = note(intake);

  return [
    {
      id: "diy",
      title: "DIY repair",
      summary: "Failure modes and published fixes",
      searchType: "auto",
      query: `Known failure modes and repair procedures for a ${part} with this symptom: ${intake.symptom}. Field reports, service manuals, and repair notes.${extra}`,
      excludeDomains: MARKETPLACES,
      objective: OBJECTIVE,
    },
    {
      id: "repair",
      title: "Repair service",
      summary: "Shops that take this model",
      searchType: "auto",
      category: "company",
      userLocation: intake.country,
      query: `Companies that repair a ${part} for customers in ${place}. Published repair price or turnaround, if the page states it. Symptom: ${intake.symptom}.${extra}`,
      objective: OBJECTIVE,
    },
    {
      id: "used",
      title: "Used or refurbished",
      summary: "Current listings",
      searchType: "fast",
      userLocation: intake.country,
      includeDomains: LISTING_DOMAINS,
      startPublishedDate: publishedAfter(now, 18),
      query: `Current used or refurbished ${part} for sale, with price and condition. Prefer sellers who can ship to ${place}.${extra}`,
      objective: OBJECTIVE,
    },
    {
      id: "new",
      title: "New unit",
      summary: "Distributors and stock",
      searchType: "fast",
      userLocation: intake.country,
      query: `New ${part} from a distributor or the manufacturer, including stock and price when the page publishes them. Prefer supply to ${place}.${extra}`,
      objective: OBJECTIVE,
    },
    {
      id: "obsolete",
      title: "Successor",
      summary: "Discontinuation and replacements",
      searchType: "deep",
      excludeDomains: MARKETPLACES,
      additionalQueries: [
        `${intake.partNumber} discontinuation notice successor`,
        `${intake.partNumber} official replacement part number migration`,
      ],
      query: `Is the ${part} discontinued, and what is the official successor or a compatible replacement? Include migration notes when a page states them.${extra}`,
      objective: OBJECTIVE,
    },
  ];
}

export function traceFromPlan(plan: PathPlan) {
  return {
    searchType: plan.searchType,
    query: plan.query,
    category: plan.category,
    includeDomains: plan.includeDomains,
    excludeDomains: plan.excludeDomains,
    startPublishedDate: plan.startPublishedDate,
    additionalQueries: plan.additionalQueries,
    userLocation: plan.userLocation,
  };
}
