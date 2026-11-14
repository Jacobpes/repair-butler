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
  const compact = normalizePartNumber(term);
  if (compact.length >= 4) return mentionsPart(text, term);
  const body = term
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[\s\-]+/g, "[\\s\\-]*");
  if (!body) return false;
  return new RegExp(`(?:^|[^A-Za-z0-9])${body}(?=$|[^A-Za-z0-9])`, "i").test(text);
}

export function urlMentionsPart(url: string, partNumber: string): boolean {
  const compact = normalizePartNumber(partNumber);
  if (compact.length < 4) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  const pieces = decoded.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let start = 0; start < pieces.length; start += 1) {
    let joined = "";
    for (let index = start; index < Math.min(pieces.length, start + 6); index += 1) {
      joined += pieces[index] ?? "";
      if (normalizePartNumber(joined) === compact) return true;
      if (joined.length > compact.length + 8) break;
    }
  }
  return false;
}

export function partNumberVariants(partNumber: string): string[] {
  const raw = partNumber.trim();
  const compact = raw.replace(/[\s\-_/]+/g, "");
  const spaced = raw.replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
  return [...new Set([raw, compact, spaced].filter((item) => item.length >= 4))];
}

const SYMPTOM_STOP = new Set([
  "with",
  "from",
  "this",
  "that",
  "unit",
  "have",
  "been",
  "when",
  "your",
  "into",
  "inch",
  "color",
  "colour",
  "panel",
  "controller",
  "available",
]);

export function symptomHits(text: string, symptom: string): boolean {
  const alarms = symptom.match(/\b(?:alarm|error|err|fault|trip)\s*#?\s*\d{1,4}\b/gi) ?? [];
  const codes = symptom.match(/\b(?:ERR|OC|GF|BF|SF)\b/g) ?? [];
  if (alarms.some((alarm) => mentionsPart(text, alarm))) return true;
  if (codes.some((code) => new RegExp(`\\b${code}\\b`).test(text))) return true;
  const words = symptom
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !SYMPTOM_STOP.has(word));
  return words.some((word) => mentionsTerm(text, word));
}

const NAMED_FAMILIES: { pattern: RegExp; term: string }[] = [
  { pattern: /\bTP\s*177\s*B\b/i, term: "TP177B" },
  { pattern: /\bTP\s*177\b/i, term: "TP177" },
  { pattern: /\bMP\s*277\b/i, term: "MP 277" },
  { pattern: /\bControl\s*Logix\b/i, term: "ControlLogix" },
  { pattern: /\bCompact\s*Logix\b/i, term: "CompactLogix" },
  { pattern: /\bMicro\s*Logix\b/i, term: "MicroLogix" },
  { pattern: /\bV1000\b/i, term: "V1000" },
  { pattern: /\bFC\s*-?\s*302\b/i, term: "FC302" },
  { pattern: /\bVLT\b/i, term: "VLT" },
  { pattern: /\bNX\s*-?\s*1P2\b/i, term: "NX1P2" },
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
  const head = input.partNumber.split(/[\s\-/]+/).filter(Boolean)[0];
  if (head && head.length >= 4 && /[a-z]/i.test(head) && /\d/.test(head) && !terms.includes(head)) {
    terms.push(head);
  }
  const compact = normalizePartNumber(input.partNumber);
  const catalog: { test: (value: string) => boolean; names: string[] }[] = [
    { test: (value) => value === "131b0081", names: ["FC302", "VLT"] },
    { test: (value) => value === "6av66420ba011ax1", names: ["TP177B"] },
    { test: (value) => value === "1756l71", names: ["ControlLogix", "1756"] },
    { test: (value) => value.startsWith("nx1p2"), names: ["NX1P2"] },
    { test: (value) => value.startsWith("cimrvu"), names: ["V1000"] },
  ];
  for (const entry of catalog) {
    if (!entry.test(compact)) continue;
    for (const name of entry.names) {
      if (!terms.includes(name)) terms.push(name);
    }
  }
  return terms;
}
