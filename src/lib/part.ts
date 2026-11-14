export function normalizePartNumber(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SEPARATOR = "[\\s\\-_/.\u2013\u2014]*";

export function mentionsPart(text: string, partNumber: string): boolean {
  const compact = normalizePartNumber(partNumber);
  if (compact.length < 4) return false;
  const body = [...compact]
    .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(SEPARATOR);
  return new RegExp(`(?:^|[^A-Za-z0-9])${body}(?=$|[^A-Za-z0-9])`, "i").test(text);
}

export function mentionsTerm(text: string, term: string): boolean {
  const body = term
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[\s\-]+/g, "[\\s\\-]*");
  if (!body) return false;
  return new RegExp(`(?:^|[^A-Za-z0-9])${body}(?=$|[^A-Za-z0-9])`, "i").test(text);
}

const NAMED_FAMILIES: { pattern: RegExp; term: string }[] = [
  { pattern: /\bTP\s*177\s*B\b/i, term: "TP177B" },
  { pattern: /\bTP\s*177\b/i, term: "TP177" },
  { pattern: /\bMP\s*277\b/i, term: "MP 277" },
  { pattern: /\bControl\s*Logix\b/i, term: "ControlLogix" },
  { pattern: /\bCompact\s*Logix\b/i, term: "CompactLogix" },
  { pattern: /\bMicro\s*Logix\b/i, term: "MicroLogix" },
  { pattern: /\bV1000\b/i, term: "V1000" },
  { pattern: /\bFC\s*302\b/i, term: "FC302" },
  { pattern: /\bS7[-\s]?1500\b/i, term: "S7-1500" },
  { pattern: /\bS7[-\s]?1200\b/i, term: "S7-1200" },
  { pattern: /\bS7[-\s]?400\b/i, term: "S7-400" },
  { pattern: /\bS7[-\s]?300\b/i, term: "S7-300" },
];

export function familyTerms(input: {
  manufacturer: string;
  partNumber: string;
  symptom: string;
}): string[] {
  const blob = `${input.manufacturer} ${input.symptom} ${input.partNumber}`;
  const terms: string[] = [];
  for (const entry of NAMED_FAMILIES) {
    if (entry.pattern.test(blob) && !terms.includes(entry.term)) terms.push(entry.term);
  }
  const series = input.partNumber.match(/^(\d{3,5})(?=[-/])/);
  if (series && !terms.includes(series[1])) terms.push(series[1]);
  return terms;
}
