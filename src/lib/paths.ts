import { countryName } from "@/lib/countries";
import { familyTerms, partNumberVariants } from "@/lib/part";
import type { Intake, PathPlan } from "@/lib/types";

export const PATH_META = [
  { id: "diy", title: "DIY repair", summary: "Failure modes and published fixes" },
  { id: "repair", title: "Repair service", summary: "Shops that take this model" },
  { id: "used", title: "Used or refurbished", summary: "Current listings" },
  { id: "new", title: "New unit", summary: "Distributors and stock" },
  { id: "obsolete", title: "Successor", summary: "Discontinuation and replacements" },
] as const;

export const EXTRACTION_PROMPT =
  'Extract only facts the results state about this exact part number. Copy any price, stock count, or lead time character for character, including every digit and the decimal. Never convert currency, never multiply a pack price into a unit price, and never invent a figure. If a fact is missing, write exactly "not found" for text fields and use an empty list for arrays. Ignore a page that does not show this exact part number.';

export function extractionPrompt(id: PathPlan["id"]): string {
  if (id === "diy" || id === "obsolete") {
    return 'Extract only facts the pages state about this part, or about its family when the symptom matches. Copy numbers character for character. Never invent a price, stock count, or lead time. If a fact is missing, write exactly "not found" for text fields and use an empty list for arrays. A repair-shop price list is not a failure note.';
  }
  if (id === "repair") {
    return 'Extract only repair-service facts tied to this exact part. Copy a flat rate or turnaround character for character. Do not use a generic module price range for this unit. If a fact is missing, write exactly "not found" for text fields and use an empty list for arrays.';
  }
  return EXTRACTION_PROMPT;
}

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
  plan: Omit<
    PathPlan,
    "partNumber" | "manufacturer" | "country" | "symptom" | "familyTerms" | "asOf" | "numResults"
  > & {
    numResults?: number;
  },
): PathPlan {
  return {
    ...plan,
    numResults: plan.numResults ?? 5,
    partNumber: intake.partNumber,
    manufacturer: intake.manufacturer,
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
  const family = familyTerms(intake).join(" ");
  const variants = partNumberVariants(intake.partNumber)
    .map((item) => `"${item}"`)
    .join(" OR ");

  return [
    finish(intake, now, {
      id: "diy",
      title: "DIY repair",
      summary: "Failure modes and published fixes",
      searchType: "auto",
      query: `Failure modes, alarms, and repair notes for ${part} ${family}. Symptom: ${intake.symptom}. Field reports and service manuals.${extra}`,
      numResults: 8,
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
      query: `Repair workshop for ${part} ${family}. Control Board Lab, FOXON, or another specialist. Flat-rate repair price or turnaround if the page states it. Symptom: ${intake.symptom}.${extra}`,
      numResults: 8,
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
      numResults: 12,
      query: `${variants} used OR refurbished listing, price and condition. Prefer sellers who can ship to ${place}.${extra}`,
      objective: OBJECTIVE,
    }),
    finish(intake, now, {
      id: "new",
      title: "New unit",
      summary: "Distributors and stock",
      searchType: "fast",
      userLocation: intake.country,
      numResults: 10,
      excludeDomains: SOCIAL,
      query: `${variants} new from a distributor or the manufacturer. Stock, price, and condition when the page publishes them. Prefer supply to ${place}.${extra}`,
      objective: OBJECTIVE,
    }),
    finish(intake, now, {
      id: "obsolete",
      title: "Successor",
      summary: "Discontinuation and replacements",
      searchType: "deep",
      excludeDomains: [...MARKETPLACES, ...SOCIAL],
      additionalQueries: [
        `${intake.partNumber} ${family} discontinuation notice successor`,
        `${family} ${intake.symptom} replacement migration`,
      ],
      query: `Is ${part} ${family} discontinued, and what is the official successor? Migration notes and the symptom: ${intake.symptom}.${extra}`,
      objective: OBJECTIVE,
    }),
  ];
}

export function extraSearches(plan: PathPlan): PathPlan[] {
  if (plan.id === "used") {
    const surplus = partNumberVariants(plan.partNumber).slice(0, 2).map((variant) => ({
      ...plan,
      numResults: 12,
      userLocation: undefined,
      includeDomains: SURPLUS_DOMAINS,
      startPublishedDate: undefined,
      query: `"${variant}" (used OR refurbished OR surplus) price stock condition site product`,
    }));
    return [
      ...surplus,
      {
        ...plan,
        numResults: 12,
        userLocation: undefined,
        includeDomains: undefined,
        excludeDomains: SOCIAL,
        startPublishedDate: undefined,
        query: `"${plan.partNumber}" (used OR refurbished OR surplus) (price OR EUR OR USD OR GBP OR stock)`,
      },
    ];
  }
  if (plan.id === "obsolete") {
    const family = plan.familyTerms.slice(0, 2).join(" ");
    return [
      {
        ...plan,
        searchType: "fast",
        additionalQueries: undefined,
        numResults: 6,
        query: `"${plan.partNumber}" ${family} discontinued OR successor OR "end of life" OR replacement`,
      },
    ];
  }
  if (plan.id === "repair") {
    const family = plan.familyTerms.join(" ");
    return [
      {
        ...plan,
        numResults: 8,
        userLocation: undefined,
        category: undefined,
        includeDomains: undefined,
        searchType: "auto",
        query: `Repair service ${plan.partNumber} ${family}. Control Board Lab, FOXON, BVS Electronics. Flat rate repair price or turnaround.`,
      },
      {
        ...plan,
        numResults: 5,
        userLocation: undefined,
        category: undefined,
        searchType: "fast",
        includeDomains: ["controlboardlab.com", "foxon.cz", "foxon.com", "foxon.eu", "bvs-electronics.com"],
        query: `"${plan.partNumber}" ${family} repair price OR flat rate`,
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
