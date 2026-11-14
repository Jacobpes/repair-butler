"use client";

import { useState } from "react";
import { Citations } from "@/components/citations";
import { PATH_META } from "@/lib/paths";
import type { PathCard, PathId, Recommendation } from "@/lib/types";
import { formatDate, isNotFound } from "@/lib/text";

const STATUS_LABEL = {
  found: "Sourced",
  thin: "Thin evidence",
  not_found: "Not found",
  error: "Search failed",
} as const;

const STATUS_CLASS = {
  found: "bg-pine-soft text-pine",
  thin: "bg-amber-soft text-amber",
  not_found: "bg-paper text-muted",
  error: "bg-danger-soft text-danger",
} as const;

export function StatusBadge({ status }: { status: PathCard["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function splitOffer(value: string): { condition: string; cost: string } {
  if (isNotFound(value)) return { condition: "—", cost: "Not found" };
  const match = /^(New|Used|Refurbished|Listed|Repair service)\s·\s([\s\S]+)$/.exec(value.trim());
  if (!match?.[1] || !match[2]) return { condition: "—", cost: value };
  return { condition: match[1], cost: match[2] };
}

export function RecommendationBanner({
  recommendation,
  card,
}: {
  recommendation: Recommendation;
  card: PathCard | null;
}) {
  const offer = splitOffer(card?.estimatedCost ?? "not found");
  const lead = card && !isNotFound(card.leadTime) ? card.leadTime : "Not found";
  return (
    <section className="rounded-2xl border border-accent bg-card p-5 shadow-card sm:p-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
        {recommendation.via === "exa-answer" ? "Recommendation" : "Workshop rule"}
      </p>
      <h2 className="mt-2 text-2xl font-medium tracking-tight">
        {recommendation.pathId ? `Start with ${labelFor(recommendation.pathId)}` : "No path to recommend yet"}
      </h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-paper px-4 py-3">
          <dt className="text-xs text-muted">Cost</dt>
          <dd className="mt-1 text-base font-medium">{offer.cost}</dd>
          {offer.condition !== "—" ? <dd className="text-sm text-muted">{offer.condition}</dd> : null}
        </div>
        <div className="rounded-xl bg-paper px-4 py-3">
          <dt className="text-xs text-muted">Lead time</dt>
          <dd className="mt-1 text-base font-medium">{lead}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed">
        <span className="font-medium">Why. </span>
        {recommendation.reason}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <span className="font-medium text-ink">Fastest sourced option. </span>
        {recommendation.fastestNote}
      </p>
      <p className="mt-2 text-sm text-muted">{recommendation.urgencyNote}</p>
      {recommendation.caveats.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted">
          {recommendation.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      ) : null}
      {recommendation.sources.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted">Sources</p>
          <Citations sources={recommendation.sources} />
        </div>
      ) : null}
    </section>
  );
}

export function Comparison({
  cards,
  running,
  recommendation,
  selected,
  onSelect,
}: {
  cards: Array<PathCard | null>;
  running: boolean;
  recommendation: Recommendation | null;
  selected: PathId | null;
  onSelect: (id: PathId) => void;
}) {
  const [open, setOpen] = useState<PathId | null>(null);
  return (
    <section aria-labelledby="comparison-heading">
      <h2 id="comparison-heading" className="text-lg font-medium tracking-tight">
        Compare the paths
      </h2>
      <p className="mt-1 text-sm text-muted">Same facts on every row. A figure without a page says not found.</p>
      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Five ways to restore the unit</caption>
          <thead className="bg-paper text-xs uppercase tracking-[0.08em] text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Path</th>
              <th scope="col" className="px-3 py-3 font-medium">Cost</th>
              <th scope="col" className="px-3 py-3 font-medium">Lead time</th>
              <th scope="col" className="px-3 py-3 font-medium">Condition</th>
              <th scope="col" className="px-3 py-3 font-medium">Risk</th>
              <th scope="col" className="px-3 py-3 font-medium">Sources</th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PATH_META.map((meta, index) => {
              const card = cards[index] ?? null;
              return (
                <ComparisonRows
                  key={meta.id}
                  title={meta.title}
                  summary={meta.summary}
                  card={card}
                  running={running}
                  recommended={recommendation?.pathId === meta.id}
                  fastest={
                    recommendation?.fastestPathId === meta.id &&
                    recommendation.fastestPathId !== recommendation.pathId
                  }
                  selected={selected === meta.id}
                  expanded={open === meta.id}
                  onToggle={() => setOpen((current) => (current === meta.id ? null : meta.id))}
                  onSelect={() => card && onSelect(card.id)}
                  layout="table"
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 lg:hidden">
        {PATH_META.map((meta, index) => {
          const card = cards[index] ?? null;
          return (
            <ComparisonRows
              key={meta.id}
              title={meta.title}
              summary={meta.summary}
              card={card}
              running={running}
              recommended={recommendation?.pathId === meta.id}
              fastest={
                recommendation?.fastestPathId === meta.id &&
                recommendation.fastestPathId !== recommendation.pathId
              }
              selected={selected === meta.id}
              expanded={open === meta.id}
              onToggle={() => setOpen((current) => (current === meta.id ? null : meta.id))}
              onSelect={() => card && onSelect(card.id)}
              layout="card"
            />
          );
        })}
      </div>
    </section>
  );
}

function ComparisonRows(props: RowProps & { layout: "table" | "card" }) {
  if (props.layout === "card") return <MobileRow {...props} />;
  return <DesktopRow {...props} />;
}

type RowProps = {
  title: string;
  summary: string;
  card: PathCard | null;
  running: boolean;
  recommended: boolean;
  fastest: boolean;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
};

function DesktopRow({
  title,
  summary,
  card,
  running,
  recommended,
  fastest,
  selected,
  expanded,
  onToggle,
  onSelect,
}: RowProps) {
  const offer = splitOffer(card?.estimatedCost ?? "not found");
  return (
    <>
      <tr className={recommended ? "bg-accent-soft/60" : undefined}>
        <th scope="row" className="border-t border-line px-4 py-3 font-medium">
          <button type="button" onClick={onToggle} className="text-left" aria-expanded={card ? expanded : undefined} disabled={!card}>
            <span className="block">{title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-muted">
              {card ? <StatusBadge status={card.status} /> : <span>{running ? "Searching" : "Waiting"}</span>}
              {recommended ? <span className="text-accent">Recommended</span> : null}
              {fastest ? <span>Fastest</span> : null}
            </span>
          </button>
        </th>
        <td className="border-t border-line px-3 py-3">{card ? offer.cost : "—"}</td>
        <td className="border-t border-line px-3 py-3">{card ? displayLead(card.leadTime) : "—"}</td>
        <td className="border-t border-line px-3 py-3">{card ? offer.condition : "—"}</td>
        <td className="border-t border-line px-3 py-3 capitalize">{card ? card.risk : "—"}</td>
        <td className="border-t border-line px-3 py-3">
          {card ? <Citations sources={card.sources} compact numbersOnly /> : "—"}
        </td>
        <td className="border-t border-line px-4 py-3">
          {card ? (
            <div className="flex flex-col items-stretch gap-2">
              <button
                type="button"
                onClick={onSelect}
                className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected ? "bg-accent-fill text-on-accent ring-2 ring-accent" : "bg-accent-fill text-on-accent"
                }`}
              >
                {selected ? "Selected" : "Prepare"}
              </button>
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line px-3 py-2 text-sm"
              >
                {expanded ? "Hide" : "Details"}
              </button>
            </div>
          ) : null}
        </td>
      </tr>
      {card && expanded ? (
        <tr>
          <td colSpan={7} className="border-t border-line bg-paper px-4 py-4">
            <Detail card={card} summary={summary} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MobileRow({
  title,
  summary,
  card,
  running,
  recommended,
  fastest,
  selected,
  expanded,
  onToggle,
  onSelect,
}: RowProps) {
  const offer = splitOffer(card?.estimatedCost ?? "not found");
  return (
    <article className={`rounded-2xl border bg-card p-4 shadow-card ${recommended ? "border-accent" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">{title}</h3>
          <p className="text-sm text-muted">{summary}</p>
        </div>
        {card ? <StatusBadge status={card.status} /> : null}
      </div>
      <p className="mt-2 text-xs text-accent">
        {recommended ? "Recommended" : ""}
        {recommended && fastest ? " · " : ""}
        {fastest ? "Fastest" : ""}
        {!card ? (running ? "Searching" : "Waiting") : ""}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Fact label="Cost" value={card ? offer.cost : "—"} />
        <Fact label="Lead time" value={card ? displayLead(card.leadTime) : "—"} />
        <Fact label="Condition" value={card ? offer.condition : "—"} />
        <Fact label="Risk" value={card ? card.risk : "—"} />
        <Fact label="Sources" value={card ? String(card.sources.length) : "—"} />
      </dl>
      {card ? (
        <div className="mt-3">
          <Citations sources={card.sources} compact />
        </div>
      ) : null}
      {card ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-fill px-4 py-2 text-sm font-medium text-on-accent"
          >
            {selected ? "Selected" : "Prepare this option"}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-medium"
          >
            {expanded ? "Hide details" : "Details"}
          </button>
        </div>
      ) : null}
      {card && expanded ? (
        <div className="mt-4 border-t border-line pt-4">
          <Detail card={card} summary={summary} />
        </div>
      ) : null}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function displayLead(value: string): string {
  return isNotFound(value) ? "Not found" : value;
}

function Detail({ card, summary }: { card: PathCard; summary: string }) {
  const findings = card.claims.filter((claim) => claim.label === "Finding");
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">{summary}</p>
      <p className="leading-relaxed">{card.headline}</p>
      <Citations sources={card.sources} />
      {findings.length > 0 ? (
        <ul className="space-y-3">
          {findings.map((claim) => (
            <li key={claim.value}>
              <span className="font-medium">Finding. </span>
              {claim.value}
              <Citations sources={claim.sources} />
            </li>
          ))}
        </ul>
      ) : null}
      {card.pros.length > 0 || card.cons.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <BulletList title="Advantages" items={card.pros} />
          <BulletList title="Drawbacks" items={card.cons} />
          <p className="text-xs text-muted sm:col-span-2">A reading of the linked pages, not a separate measured fact.</p>
        </div>
      ) : null}
      {card.risk !== "unknown" ? <p className="text-xs text-muted">Risk is an assessment, not a measurement.</p> : null}
      {card.contentsRead ? <p className="text-xs text-muted">Page text read</p> : null}
      {card.error ? <p className="text-danger">{card.error}</p> : null}
      <details>
        <summary className="cursor-pointer text-muted">What Exa was asked</summary>
        <p className="mt-2 leading-relaxed">{card.trace.query}</p>
        <dl className="mt-2 space-y-1 text-xs text-muted">
          <div>Search type: {card.trace.searchType}</div>
          {card.trace.category ? <div>Category: {card.trace.category}</div> : null}
          {card.trace.userLocation ? <div>User location: {card.trace.userLocation}</div> : null}
          {card.trace.startPublishedDate ? <div>Published after: {formatDate(card.trace.startPublishedDate)}</div> : null}
          {card.trace.includeDomains ? <div>Include domains: {card.trace.includeDomains.join(", ")}</div> : null}
          {card.trace.excludeDomains ? <div>Exclude domains: {card.trace.excludeDomains.join(", ")}</div> : null}
          {card.trace.additionalQueries ? <div>Extra queries: {card.trace.additionalQueries.join(" · ")}</div> : null}
          <div>Structured output on the search, plus highlights.</div>
        </dl>
      </details>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function labelFor(id: Recommendation["pathId"]): string {
  switch (id) {
    case "diy":
      return "DIY repair";
    case "repair":
      return "a repair service";
    case "used":
      return "a used or refurbished unit";
    case "new":
      return "a new unit";
    case "obsolete":
      return "a successor";
    default:
      return "a path";
  }
}
