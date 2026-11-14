import { isCountryCode } from "@/lib/countries";
import type { Intake, Urgency } from "@/lib/types";

export type FreeTextResult =
  | { ok: true; intake: Intake }
  | { ok: false; message: string };

const MANUFACTURERS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bAllen[-\s]?Bradley\b/i, name: "Allen-Bradley" },
  { pattern: /\bRockwell Automation\b/i, name: "Rockwell Automation" },
  { pattern: /\bPhoenix Contact\b/i, name: "Phoenix Contact" },
  { pattern: /\bBosch Rexroth\b/i, name: "Bosch Rexroth" },
  { pattern: /\bMitsubishi Electric\b/i, name: "Mitsubishi Electric" },
  { pattern: /\bControl Techniques\b/i, name: "Control Techniques" },
  { pattern: /\bFuji Electric\b/i, name: "Fuji Electric" },
  { pattern: /\bSiemens\b/i, name: "Siemens" },
  { pattern: /\bDanfoss\b/i, name: "Danfoss" },
  { pattern: /\bYaskawa\b/i, name: "Yaskawa" },
  { pattern: /\bSchneider\b/i, name: "Schneider" },
  { pattern: /\bMitsubishi\b/i, name: "Mitsubishi" },
  { pattern: /\bRockwell\b/i, name: "Rockwell" },
  { pattern: /\bOmron\b/i, name: "Omron" },
  { pattern: /\bFanuc\b/i, name: "Fanuc" },
  { pattern: /\bBeckhoff\b/i, name: "Beckhoff" },
  { pattern: /\bLenze\b/i, name: "Lenze" },
  { pattern: /\bSEW\b/i, name: "SEW" },
  { pattern: /\bEaton\b/i, name: "Eaton" },
  { pattern: /\bWago\b/i, name: "Wago" },
  { pattern: /\bPilz\b/i, name: "Pilz" },
  { pattern: /\bKeyence\b/i, name: "Keyence" },
  { pattern: /\bHitachi\b/i, name: "Hitachi" },
  { pattern: /\bHoneywell\b/i, name: "Honeywell" },
  { pattern: /\bEmerson\b/i, name: "Emerson" },
  { pattern: /\bVacon\b/i, name: "Vacon" },
  { pattern: /\bABB\b/i, name: "ABB" },
  { pattern: /\bB&R\b/i, name: "B&R" },
];

const COUNTRY_WORDS: { pattern: RegExp; code: string }[] = [
  { pattern: /\b(?:finland|finnish|suomi)\b/i, code: "FI" },
  { pattern: /\b(?:sweden|swedish|sverige)\b/i, code: "SE" },
  { pattern: /\b(?:germany|german|deutschland)\b/i, code: "DE" },
  { pattern: /\b(?:estonia|estonian)\b/i, code: "EE" },
  { pattern: /\b(?:poland|polish|polska)\b/i, code: "PL" },
  { pattern: /\b(?:netherlands|dutch|holland)\b/i, code: "NL" },
  { pattern: /\b(?:denmark|danish|danmark)\b/i, code: "DK" },
  { pattern: /\b(?:united kingdom|britain|british|u\.k\.|\buk\b)\b/i, code: "GB" },
  { pattern: /\b(?:united states|u\.s\.a?\.|\busa\b|\bus\b)\b/i, code: "US" },
];

const PART_RE =
  /\b[A-Za-z0-9][A-Za-z0-9]*(?:[-/][A-Za-z0-9]+)+\b|\b(?=[A-Za-z]*\d)[A-Za-z0-9]{5,}\b/g;

export function parseFreeText(sentence: string): FreeTextResult {
  const text = sentence.replace(/\s+/g, " ").trim();
  if (text.length < 8) {
    return { ok: false, message: "Paste a sentence with the manufacturer and part number." };
  }

  const manufacturer = MANUFACTURERS.find((entry) => entry.pattern.test(text));
  if (!manufacturer) {
    return { ok: false, message: "Name the manufacturer in the sentence, for example Siemens or Danfoss." };
  }

  const partNumber = pickPartNumber(text, manufacturer.name);
  if (!partNumber) {
    return { ok: false, message: "Include the part number from the nameplate." };
  }

  const country = COUNTRY_WORDS.find((entry) => entry.pattern.test(text))?.code ?? "FI";
  if (!isCountryCode(country)) {
    return { ok: false, message: "Choose a country." };
  }

  const urgency = urgencyOf(text);
  const symptom = symptomOf(text, [manufacturer.name, partNumber]);

  return {
    ok: true,
    intake: {
      manufacturer: manufacturer.name,
      partNumber,
      symptom,
      country,
      urgency,
    },
  };
}

function pickPartNumber(text: string, manufacturer: string): string | null {
  const candidates = text.match(PART_RE) ?? [];
  const ranked = candidates
    .filter((token) => digitCount(token) >= 3)
    .filter((token) => !manufacturer.toLowerCase().includes(token.toLowerCase()))
    .sort((left, right) => score(right) - score(left) || right.length - left.length);
  return ranked[0] ?? null;
}

function score(token: string): number {
  return digitCount(token) * 100 + token.length;
}

function digitCount(token: string): number {
  return token.replace(/\D/g, "").length;
}

function urgencyOf(text: string): Urgency {
  if (/\b(?:urgent|urgently|emergency|asap|line down|rush)\b/i.test(text)) return "emergency";
  if (/\b(?:planned|when possible|next month)\b/i.test(text)) return "planned";
  if (/\b(?:this week|next week)\b/i.test(text)) return "this-week";
  return "this-week";
}

function symptomOf(text: string, remove: string[]): string {
  let symptom = text;
  const pieces = [...remove].sort((left, right) => right.length - left.length);
  for (const piece of pieces) {
    symptom = symptom.replace(new RegExp(escapeRegExp(piece), "ig"), " ");
  }
  symptom = symptom
    .replace(
      /\b(?:urgent|urgently|emergency|asap|line down|rush|this week|next week|planned|when possible|next month|finland|finnish|suomi|sweden|swedish|sverige|germany|german|deutschland|estonia|estonian|poland|polish|polska|netherlands|dutch|holland|denmark|danish|danmark|united kingdom|britain|british|united states|usa|uk|us)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, "")
    .trim();
  if (symptom.length >= 6) return symptom.slice(0, 500);
  return "No symptom was written in the sentence.";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
