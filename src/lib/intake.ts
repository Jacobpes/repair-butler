import { isCountryCode } from "@/lib/countries";
import { parseFreeText } from "@/lib/freetext";
import type { Intake, Urgency } from "@/lib/types";
import { asRecord } from "@/lib/text";

export type ParseResult =
  | { ok: true; intake: Intake }
  | { ok: false; message: string };

const URGENCIES = new Set<Urgency>(["emergency", "this-week", "planned"]);

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function parseIntake(input: unknown): ParseResult {
  const record = asRecord(input);
  if (!record) {
    return { ok: false, message: "Describe the faulty unit first." };
  }

  const manufacturer = clean(record.manufacturer, 80);
  const partNumber = clean(record.partNumber, 80);
  const symptom = clean(record.symptom, 500);
  const notes = clean(record.notes, 400);
  const query = clean(record.query, 500);
  const country =
    typeof record.country === "string" ? record.country.trim().toUpperCase() : "";
  const urgency = record.urgency;

  if (query && manufacturer.length < 2 && partNumber.length < 2) {
    const parsed = parseFreeText(query);
    if (!parsed.ok) return parsed;
    if (isCountryCode(country)) parsed.intake.country = country;
    if (typeof urgency === "string" && URGENCIES.has(urgency as Urgency)) {
      parsed.intake.urgency = urgency as Urgency;
    }
    if (notes) parsed.intake.notes = notes;
    return parsed;
  }

  if (manufacturer.length < 2) {
    return { ok: false, message: "Enter the manufacturer." };
  }
  if (partNumber.length < 2) {
    return { ok: false, message: "Enter the part number from the nameplate." };
  }
  if (symptom.length < 6) {
    return { ok: false, message: "Describe the symptom in a few words." };
  }
  if (!isCountryCode(country)) {
    return { ok: false, message: "Choose a country." };
  }
  if (typeof urgency !== "string" || !URGENCIES.has(urgency as Urgency)) {
    return { ok: false, message: "Choose how urgent this is." };
  }

  return {
    ok: true,
    intake: {
      manufacturer,
      partNumber,
      symptom,
      country,
      urgency: urgency as Urgency,
      notes: notes || undefined,
    },
  };
}
