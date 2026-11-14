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

function siblingOrder(norm: string, ours: string): boolean {
  if (norm.length < 6 || norm === ours) return false;
  if (norm.startsWith(ours)) {
    const extra = norm.slice(ours.length);
    if (/^[a-z]{1,2}$/.test(extra)) return false;
    return extra.length > 0 && extra.length <= 3;
  }
  if (ours.startsWith(norm)) {
    const extra = ours.slice(norm.length);
    if (/^[a-z]{1,2}$/.test(extra)) return false;
    return norm.length >= 8 && extra.length <= 3;
  }
  const stem = ours.slice(0, Math.min(6, Math.max(4, ours.length - 2)));
  if (!norm.startsWith(stem) || Math.abs(norm.length - ours.length) > 4) return false;
  let index = 0;
  const limit = Math.min(norm.length, ours.length);
  while (index < limit && norm[index] === ours[index]) index += 1;
  if (index >= limit - 1) {
    return index >= 5 && (ours[index] ?? "") !== (norm[index] ?? "");
  }
  return index >= 5;
}

export function nearerSibling(text: string, partNumber: string, at: number): boolean {
  const ours = normalizePartNumber(partNumber);
  if (ours.length < 6) return false;
  const start = Math.max(0, at - 120);
  const slice = text.slice(start, at);
  const tokens = [
    ...slice.matchAll(/[A-Za-z0-9]{2,}(?:-[A-Za-z0-9]{2,})+(?:-[A-Za-z0-9])?|[A-Za-z]*\d[A-Za-z0-9]{5,}/g),
  ];
  const last = tokens.at(-1);
  if (!last) return false;
  const norm = normalizePartNumber(last[0]);
  if (norm === ours) return false;
  return siblingOrder(norm, ours);
}

export function conflictsWithPart(text: string, partNumber: string): boolean {
  if (mentionsPart(text, partNumber) || urlMentionsPart(text, partNumber)) return false;
  const ours = normalizePartNumber(partNumber);
  if (ours.length < 6) return false;
  const tokens = [
    ...(text.match(/[A-Za-z0-9]{2,}(?:-[A-Za-z0-9]{2,})+/g) ?? []),
    ...(text.match(/[A-Za-z]*\d[A-Za-z0-9]{5,}/g) ?? []),
  ];
  return tokens.some((token) => siblingOrder(normalizePartNumber(token), ours));
}

export function symptomHits(text: string, symptom: string): boolean {
  const alarms = symptom.match(/\b(?:alarm|error|err|fault|trip)\s*#?\s*\d{1,4}\b/gi) ?? [];
  const codes =
    symptom.match(/\b(?:ERR|OC|GF|BF|SF|OCF|SCF|SLF|OHF|OLF|OPF|OSF|PHF|CFF|SOF|BrF)\b/gi) ?? [];
  if (alarms.some((alarm) => mentionsPart(text, alarm))) return true;
  if (codes.some((code) => new RegExp(`\\b${code}\\b`, "i").test(text))) return true;
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
  { pattern: /\bACS\s*580\b/i, term: "ACS580" },
  { pattern: /\bACS\s*880\b/i, term: "ACS880" },
  { pattern: /\bACS\s*355\b/i, term: "ACS355" },
  { pattern: /\bFX\s*3U\b/i, term: "FX3U" },
  { pattern: /\bFX\s*5U\b/i, term: "FX5U" },
  { pattern: /\bAltivar\b/i, term: "Altivar" },
  { pattern: /\bATV\s*320\b/i, term: "ATV320" },
  { pattern: /\bATV\s*630\b/i, term: "ATV630" },
  { pattern: /\bATV\s*71\b/i, term: "ATV71" },
  { pattern: /\bATV\s*12\b/i, term: "ATV12" },
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
    const rest = input.partNumber.slice(head.length).replace(/^[\s\-/]+/, "");
    const digitLedOrder = /^\d/.test(head) && rest.length > 0;
    if (!digitLedOrder) terms.push(head);
  }
  const compact = normalizePartNumber(input.partNumber);
  for (const rule of [/^acs\d{3}/i, /^atv\d{2,3}/i, /^fx\d[a-z]/i, /^nx\d[a-z]\d/i]) {
    const match = compact.match(rule);
    const token = match?.[0];
    if (!token || token.length + 2 >= compact.length) continue;
    const label = token.toUpperCase();
    if (!terms.includes(label)) terms.push(label);
  }
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
