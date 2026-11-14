"use client";

import { useEffect, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { EXAMPLES } from "@/lib/examples";
import type { NameplateReading } from "@/lib/nameplate";
import type { Intake, Urgency } from "@/lib/types";

export type FormValue = {
  manufacturer: string;
  partNumber: string;
  symptom: string;
  country: string;
  urgency: Urgency;
  notes: string;
};

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2.5 text-base text-ink outline-none placeholder:text-muted/70 focus-visible:border-copper focus-visible:ring-2 focus-visible:ring-copper/30";

const URGENCIES: { id: Urgency; label: string; hint: string }[] = [
  { id: "emergency", label: "Line down", hint: "Fastest sourced option" },
  { id: "this-week", label: "This week", hint: "A shop is reasonable" },
  { id: "planned", label: "Planned stop", hint: "Can wait for the right part" },
];

export function IntakeForm({
  value,
  onChange,
  onSubmit,
  onExample,
  running,
  onCancel,
}: {
  value: FormValue;
  onChange: (value: FormValue) => void;
  onSubmit: () => void;
  onExample: (exampleId: string) => void;
  running: boolean;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<NameplateReading | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPhoto(file: File | null) {
    setSuggestion(null);
    setPhotoMessage(null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setPhotoMessage("Photo must be 4 MB or smaller.");
      return;
    }
    setReadingPhoto(true);
    try {
      const body = new FormData();
      body.set("photo", file);
      const response = await fetch("/api/nameplate", { method: "POST", body });
      const payload: { message?: string; reading?: NameplateReading } = await response.json();
      if (payload.reading) {
        setSuggestion(payload.reading);
        setPhotoMessage("Check the reading, then use it if the plate matches.");
      } else {
        setPhotoMessage(payload.message ?? "The photo could not be read.");
      }
    } catch {
      setPhotoMessage("The photo could not be read. Type the nameplate instead.");
    } finally {
      setReadingPhoto(false);
    }
  }

  return (
    <form
      className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Faulty unit</h2>
          <p className="mt-1 text-sm text-muted">
            One click loads a real workshop case and starts the search. Or type your own.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {EXAMPLES.map((example) => {
          const active =
            value.manufacturer === example.manufacturer && value.partNumber === example.partNumber;
          return (
            <button
              key={example.id}
              type="button"
              aria-pressed={active}
              disabled={running}
              onClick={() => onExample(example.id)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper disabled:opacity-60 ${
                active ? "border-copper bg-paper" : "border-line bg-paper hover:border-copper"
              }`}
            >
              <span className="block text-sm font-medium">{example.label}</span>
              <span className="mt-1 block font-mono text-xs text-muted">{example.partNumber}</span>
              <span className="mt-2 block text-sm text-muted">{example.blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Manufacturer
          <input
            className={fieldClass}
            value={value.manufacturer}
            autoComplete="off"
            required
            onChange={(event) => onChange({ ...value, manufacturer: event.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Part number
          <input
            className={fieldClass}
            value={value.partNumber}
            autoComplete="off"
            required
            spellCheck={false}
            onChange={(event) => onChange({ ...value, partNumber: event.target.value })}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium">
        Symptom
        <textarea
          className={`${fieldClass} min-h-24 resize-y`}
          value={value.symptom}
          required
          onChange={(event) => onChange({ ...value, symptom: event.target.value })}
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Country
          <select
            className={fieldClass}
            value={value.country}
            onChange={(event) => onChange({ ...value, country: event.target.value })}
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Urgency</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {URGENCIES.map((option) => (
              <label
                key={option.id}
                className={`cursor-pointer rounded-lg border px-2 py-2 text-center ${
                  value.urgency === option.id ? "border-copper bg-paper" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="urgency"
                  value={option.id}
                  checked={value.urgency === option.id}
                  onChange={() => onChange({ ...value, urgency: option.id })}
                />
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 hidden text-[11px] leading-tight text-muted sm:block">
                  {option.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="mt-4 block text-sm font-medium">
        Anything else
        <input
          className={fieldClass}
          value={value.notes}
          placeholder="Backup available, 24 V supply checked"
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </label>

      <div className="mt-4 rounded-xl border border-dashed border-line p-3">
        <label className="block text-sm font-medium">
          Nameplate photo
          <span className="ml-2 font-normal text-muted">optional</span>
          <input
            className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:text-paper"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => void onPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          The photo stays in this browser unless a vision key is configured. Reading it sends the
          image to that provider. The comparison itself only needs Exa.
        </p>
        {preview ? (
          // Blob previews cannot go through next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Nameplate preview" className="mt-3 max-h-40 rounded-lg border border-line" />
        ) : null}
        {readingPhoto ? <p className="mt-2 text-sm">Reading the plate…</p> : null}
        {photoMessage ? <p className="mt-2 text-sm text-muted">{photoMessage}</p> : null}
        {suggestion ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <span className="font-medium">{suggestion.manufacturer || "Unknown maker"}</span>
              <span className="mx-2 font-mono text-xs">{suggestion.partNumber || "no part number"}</span>
            </p>
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-copper"
              onClick={() =>
                onChange({
                  ...value,
                  manufacturer: suggestion.manufacturer || value.manufacturer,
                  partNumber: suggestion.partNumber || value.partNumber,
                })
              }
            >
              Use this reading
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={running}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper disabled:opacity-60"
        >
          {running ? "Searching the live web…" : "Compare options"}
        </button>
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
        ) : null}
        <p className="text-sm text-muted">Usually under 45 seconds. Nothing is ordered or emailed.</p>
      </div>
    </form>
  );
}

export function intakeFromExample(exampleId: string): FormValue | null {
  const example = EXAMPLES.find((item) => item.id === exampleId);
  if (!example) return null;
  return {
    manufacturer: example.manufacturer,
    partNumber: example.partNumber,
    symptom: example.symptom,
    country: example.country,
    urgency: example.urgency,
    notes: "",
  };
}

export function toIntake(value: FormValue): Intake {
  return {
    manufacturer: value.manufacturer,
    partNumber: value.partNumber,
    symptom: value.symptom,
    country: value.country,
    urgency: value.urgency,
    notes: value.notes.trim() || undefined,
  };
}
