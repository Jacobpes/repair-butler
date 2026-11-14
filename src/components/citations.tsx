"use client";

import { useState } from "react";
import type { Source } from "@/lib/types";

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Favicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !host || host.includes(" ")) {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-sm bg-accent-soft text-[10px] font-medium text-accent">
        {host.slice(0, 1).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // Favicons are remote and tiny; next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={16}
      height={16}
      className="h-4 w-4 rounded-sm"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function Citations({
  sources,
  compact = false,
  numbersOnly = false,
}: {
  sources: Source[];
  compact?: boolean;
  numbersOnly?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (sources.length === 0) return <span className="text-sm text-muted">None</span>;
  const shown = compact ? sources.slice(0, 4) : sources;
  const active = open !== null ? sources[open] : null;

  return (
    <div>
      <ol className="flex flex-wrap gap-1.5">
        {shown.map((source, index) => {
          const host = hostOf(source.url);
          return (
            <li key={`${source.url}-${index}`} className="group relative">
              <button
                type="button"
                aria-expanded={open === index}
                aria-label={`Source ${index + 1}, ${host}. ${open === index ? "Hide" : "Show"} the quoted highlight.`}
                onClick={() => setOpen((current) => (current === index ? null : index))}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-1 text-xs text-ink hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Favicon host={host} />
                <span className="font-mono text-[11px] text-accent">{index + 1}</span>
                {numbersOnly ? null : <span className="max-w-28 truncate">{host}</span>}
              </button>
              {source.highlight ? (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-72 rounded-lg border border-line bg-card p-3 text-left text-xs leading-relaxed text-ink shadow-card group-hover:block group-focus-within:block"
                >
                  <span className="mb-1 block font-medium text-muted">
                    {source.quoteKind === "excerpt" ? "Excerpt" : "Quoted highlight"}
                  </span>
                  {source.highlight}
                </span>
              ) : null}
            </li>
          );
        })}
        {compact && sources.length > shown.length ? (
          <li className="self-center text-xs text-muted">+{sources.length - shown.length}</li>
        ) : null}
      </ol>
      {active ? (
        <blockquote className="mt-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed">
          <a href={active.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            {active.title}
          </a>
          {active.highlight ? <p className="mt-1">{active.highlight}</p> : null}
        </blockquote>
      ) : null}
    </div>
  );
}
