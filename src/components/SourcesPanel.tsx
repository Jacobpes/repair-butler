"use client";

import { useState } from "react";
import { hostOf } from "@/components/citations";
import { IconCheck, IconCopy } from "@/components/icons";
import { PATH_META } from "@/lib/paths";
import type { PathCard, Recommendation, Source } from "@/lib/types";
import { formatDate } from "@/lib/text";

export function SourcesPanel({
  cards,
  recommendation,
}: {
  cards: PathCard[];
  recommendation: Recommendation | null;
}) {
  const [copied, setCopied] = useState(false);
  const groups = [
    ...(recommendation
      ? [{ id: "recommendation", title: "Recommendation", sources: recommendation.sources }]
      : []),
    ...PATH_META.map((meta) => ({
      id: meta.id,
      title: meta.title,
      sources: cards.find((card) => card.id === meta.id)?.sources ?? [],
    })),
  ];
  const text = groups
    .flatMap((group) => group.sources.map((source, index) => `${group.title}\t${index + 1}\t${source.title}\t${source.url}`))
    .join("\n");

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">All sources</h2>
          <p className="mt-1 text-sm text-muted">Every URL from this search, grouped by path.</p>
        </div>
        <button
          type="button"
          disabled={text.length === 0}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? "Copied" : "Copy source list"}
        </button>
      </div>
      <div className="mt-5 space-y-6">
        {groups.map((group) => (
          <div key={group.id}>
            <h3 className="text-sm font-medium">{group.title}</h3>
            {group.sources.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No pages returned.</p>
            ) : (
              <ol className="mt-2 space-y-3">
                {group.sources.map((source, index) => (
                  <SourceRow key={`${group.id}-${source.url}`} source={source} index={index + 1} />
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SourceRow({ source, index }: { source: Source; index: number }) {
  const host = hostOf(source.url);
  return (
    <li className="rounded-xl border border-line bg-paper px-3 py-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 font-mono text-xs text-accent">{index}</span>
        <div className="min-w-0">
          <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            {source.title}
          </a>
          <p className="mt-1 font-mono text-xs text-muted">
            {host}
            {source.publishedDate ? ` · ${formatDate(source.publishedDate)}` : ""}
          </p>
        </div>
      </div>
      {source.highlight ? (
        <blockquote className="mt-2 text-sm leading-relaxed">
          <span className="mr-1 text-xs text-muted">
            {source.quoteKind === "excerpt" ? "Excerpt" : "Quoted highlight"}
          </span>
          {source.highlight}
        </blockquote>
      ) : null}
      {source.summary ? (
        <p className="mt-2 text-sm text-muted">
          <span className="text-xs">Page summary. </span>
          {source.summary}
        </p>
      ) : null}
    </li>
  );
}
