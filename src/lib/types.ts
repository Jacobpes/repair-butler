export const PATH_IDS = ["diy", "repair", "used", "new", "obsolete"] as const;

export type PathId = (typeof PATH_IDS)[number];

export type Urgency = "emergency" | "this-week" | "planned";

export type SearchType = "fast" | "auto" | "deep";

export type Risk = "low" | "medium" | "high" | "unknown";

export type CardStatus = "found" | "thin" | "not_found" | "error";

export type Intake = {
  manufacturer: string;
  partNumber: string;
  symptom: string;
  country: string;
  urgency: Urgency;
  notes?: string;
};

export type Source = {
  url: string;
  title: string;
  highlight?: string;
  quoteKind?: "highlight" | "excerpt";
  summary?: string;
  publishedDate?: string;
};

export type Claim = {
  label: string;
  value: string;
  sources: Source[];
};

export type ExaTrace = {
  searchType: SearchType;
  query: string;
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  additionalQueries?: string[];
  userLocation?: string;
};

export type PathCard = {
  id: PathId;
  title: string;
  summary: string;
  status: CardStatus;
  headline: string;
  estimatedCost: string;
  leadTime: string;
  risk: Risk;
  pros: string[];
  cons: string[];
  claims: Claim[];
  sources: Source[];
  trace: ExaTrace;
  contentsRead: boolean;
  timingMs?: number;
  error?: string;
};

export type Recommendation = {
  pathId: PathId | null;
  reason: string;
  urgencyNote: string;
  caveats: string[];
  sources: Source[];
  via: "exa-answer" | "urgency-rule";
  fastestPathId: PathId | null;
  fastestNote: string;
};

export type Report = {
  intake: Intake;
  cards: PathCard[];
  recommendation: Recommendation;
  generatedAt: string;
};

export type PreparedAction = {
  kind: "email" | "checklist";
  title: string;
  intro: string;
  recipient: string;
  recipientLabel: string;
  subject: string;
  body: string;
  mailto: string;
  steps: string[];
  links: Source[];
  clipped: boolean;
};

export type PathPlan = {
  id: PathId;
  title: string;
  summary: string;
  query: string;
  searchType: SearchType;
  category?: "company";
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  additionalQueries?: string[];
  userLocation?: string;
  objective: string;
  partNumber: string;
  country: string;
  symptom: string;
  familyTerms: string[];
  numResults: number;
  asOf: string;
};

export type RawHit = {
  url?: string;
  title?: string | null;
  publishedDate?: string;
  highlights?: string[];
  text?: string;
  summary?: string;
};

export type RawGrounding = {
  field?: string;
  citations?: { url?: string; title?: string }[];
  confidence?: string;
};

export type RawSearch = {
  output?: unknown;
  grounding?: RawGrounding[];
  results?: RawHit[];
  error?: string;
};

export type StatusEvent = {
  message: string;
  pathId?: PathId;
  state?: "running" | "done" | "error";
};
