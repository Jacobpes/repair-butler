import { countryName } from "@/lib/countries";
import { familyTerms } from "@/lib/part";
import type { Intake, PathPlan } from "@/lib/types";

export const PATH_META = [
  { id: "diy", title: "DIY repair", summary: "Failure modes and published fixes" },
  { id: "repair", title: "Repair service", summary: "Shops that take this model" },
  { id: "used", title: "Used or refurbished", summary: "Current listings" },
  { id: "new", title: "New unit", summary: "Distributors and stock" },
  { id: "obsolete", title: "Successor", summary: "Discontinuation and replacements" },
] as const;

export const EXTRACTION_PROMPT =
  'Extract only facts the results state about this exact part number. Copy any price, stock count, or lead time character for character. Never convert currency, never multiply a pack price into a unit price, and never invent a figure. If a fact is missing, write exactly "not found" for text fields and use an empty list for arrays. Ignore a page that does not show this exact part number.';

export const HIGHLIGHT_QUERY =
  "exact part number, price, stock, lead time, turnaround, failure mode, condition, discontinued, successor";

const OBJECTIVE =
  "Help a maintenance technician compare realistic ways to restore one broken industrial electronic unit: DIY repair, a repair service, a used or refurbished unit, a new unit, or an official successor. Keep only pages that show this exact part number. Pull published prices, stock, lead times, failure modes, and discontinuation notices, copied as printed.";

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

const SOCIAL = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "reddit.com",
];

const SURPLUS_DOMAINS = [
  "radwell.com",
  "radwell.eu",
  "radwell.co.uk",
  "radwell.de",
  "plc-city.com",
  "plc-city.de",
  "plc-city.co.uk",
  "euautomation.com",
  "unisgroup.com",
  "dosupply.com",
  "mroelectric.com",
  "plchardware.com",
  "surplusrecord.com",
  "labx.com",
  "bvs-electronics.com",
  "industrypart.com",
];

const LISTING_DOMAINS = [
  "ebay.com",
  "ebay.de",
  "ebay.co.uk",
  "ebay.fr",
  "ebay.it",
  ...SURPLUS_DOMAINS,
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

function finish(
  intake: Intake,
  now: Date,
  plan: Omit<PathPlan, "partNumber" | "country" | "symptom" | "familyTerms" | "asOf" | "numResults"> & {
    numResults?: number;
  },
): PathPlan {
  return {
    ...plan,
    numResults: plan.numResults ?? 5,
    partNumber: intake.partNumber,
    country: intake.country,
    symptom: intake.symptom,
    familyTerms: familyTerms(intake),
    asOf: now.toISOString(),
  };
}

export function buildPathPlans(intake: Intake, now = new Date()): PathPlan[] {
  const part = partLabel(intake);
  const place = countryName(intake.country);
  const extra = note(intake);
  const exact = `Only pages that show the exact part number ${intake.partNumber}.`;

  return [
    finish(intake, now, {
      id: "diy",
      title: "DIY repair",
      summary: "Failure modes and published fixes",
      searchType: "auto",
      query: `Known failure modes and repair procedures for a ${part} with this symptom: ${intake.symptom}. Field reports, service manuals, and repair notes. ${exact}${extra}`,
      excludeDomains: [...MARKETPLACES, ...SOCIAL],
      objective: OBJECTIVE,
    }),
    finish(intake, now, {
      id: "repair",
      title: "Repair service",
      summary: "Shops that take this model",
      searchType: "auto",
      category: "company",
      userLocation: intake.country,
      query: `Companies that repair a ${part} for customers in ${place}. The page must name this model or its family. Published repair price or turnaround, if the page states it. Symptom: ${intake.symptom}. ${exact}${extra}`,
      excludeDomains: [...MARKETPLACES, ...SOCIAL],
      objective: OBJECTIVE,
    }),
    finish(intake, now, {
      id: "used",
      title: "Used or refurbished",
      summary: "Current listings",
      searchType: "fast",
      userLocation: intake.country,
      includeDomains: LISTING_DOMAINS,
      startPublishedDate: publishedAfter(now, 18),
      numResults: 8,
      query: `Current used or refurbished ${part} for sale, with price and condition. Prefer sellers who can ship to ${place}. ${exact}${extra}`,
      objective: OBJECTIVE,
    }),
    finish(intake, now, {
      id: "new",
      title: "New unit",
      summary: "Distributors and stock",
      searchType: "fast",
      userLocation: intake.country,
      numResults: 8,
      excludeDomains: SOCIAL,
      query: `New ${part} from a distributor or the manufacturer, including stock and price when the page publishes them. Prefer supply to ${place}. ${exact}${extra}`,
      objective: OBJECTIVE,
    }),
    finish(intake, now, {
      id: "obsolete",
      title: "Successor",
      summary: "Discontinuation and replacements",
      searchType: "deep",
      excludeDomains: [...MARKETPLACES, ...SOCIAL],
      additionalQueries: [
        `${intake.partNumber} discontinuation notice successor`,
        `${intake.partNumber} official replacement part number migration`,
      ],
      query: `Is the ${part} discontinued, and what is the official successor or a compatible replacement? Include migration notes when a page states them. ${exact}${extra}`,
      objective: OBJECTIVE,
    }),
  ];
}

export function extraSearches(plan: PathPlan): PathPlan[] {
  if (plan.id === "used") {
    return [
      {
        ...plan,
        numResults: 8,
        userLocation: undefined,
        includeDomains: SURPLUS_DOMAINS,
        query: `Surplus or refurbished ${plan.partNumber} in stock at Radwell, PLC City, EU Automation, or another industrial reseller. Exact part number ${plan.partNumber}. Price and condition.`,
      },
    ];
  }
  if (plan.id === "repair") {
    const family = plan.familyTerms.length ? ` Family: ${plan.familyTerms.join(", ")}.` : "";
    return [
      {
        ...plan,
        numResults: 5,
        userLocation: undefined,
        includeDomains: undefined,
        query: `European specialist that repairs ${plan.partNumber}.${family} The page must name that model family. Published turnaround if the shop states it.`,
      },
    ];
  }
  return [];
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
