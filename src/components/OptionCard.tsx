import type { PathCard, Recommendation } from "@/lib/types";
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

export function OptionCard({
  card,
  recommended,
  fastest,
  selected,
  onSelect,
}: {
  card: PathCard;
  recommended: boolean;
  fastest: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const findings = card.claims.filter((claim) => claim.label === "Finding");
  const cost = card.claims.find((claim) => claim.label === "Estimated cost");
  const lead = card.claims.find((claim) => claim.label === "Lead time");

  return (
    <article
      className={`flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm ${
        recommended ? "border-copper ring-1 ring-copper" : "border-line"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-copper">
            {card.trace.searchType}
            {recommended ? " · recommended" : ""}
            {fastest ? " · fastest" : ""}
          </p>
          <h3 className="mt-1 text-lg font-medium tracking-tight">{card.title}</h3>
          <p className="text-sm text-muted">{card.summary}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[card.status]}`}>
          {STATUS_LABEL[card.status]}
        </span>
      </header>

      <p className="mt-3 text-sm leading-relaxed">{card.headline}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Fact label="Estimated cost" value={card.estimatedCost} missing={isNotFound(card.estimatedCost)} />
        <Fact label="Lead time" value={card.leadTime} missing={isNotFound(card.leadTime)} />
        <div>
          <dt className="text-xs text-muted">Risk / effort</dt>
          <dd className="mt-1 text-sm capitalize">{card.risk}</dd>
          {card.risk !== "unknown" ? (
            <dd className="text-[11px] text-muted">Assessment, not a measurement</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs text-muted">Sources</dt>
          <dd className="mt-1 text-sm">{card.sources.length}</dd>
        </div>
      </dl>

      <ClaimQuote claim={cost} />
      <ClaimQuote claim={lead} />

      {findings.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {findings.map((claim) => (
            <li key={claim.value} className="text-sm leading-relaxed">
              <span className="font-medium">Finding. </span>
              {claim.value}
              <ClaimQuote claim={claim} />
            </li>
          ))}
        </ul>
      ) : null}

      {card.pros.length > 0 || card.cons.length > 0 ? (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <List title="Advantages" items={card.pros} />
          <List title="Drawbacks" items={card.cons} />
          <p className="sm:col-span-2 text-xs text-muted">
            A reading of the linked pages, not a separate measured fact.
          </p>
        </div>
      ) : null}

      {card.error ? <p className="mt-3 text-sm text-danger">{card.error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSelect}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper ${
            selected ? "bg-ink text-paper ring-2 ring-copper" : "bg-ink text-paper"
          }`}
        >
          {selected ? "Selected" : "Prepare this option"}
        </button>
        {card.contentsRead ? (
          <span className="text-xs text-muted">Page text read</span>
        ) : null}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted">What Exa was asked</summary>
        <p className="mt-2 leading-relaxed">{card.trace.query}</p>
        <dl className="mt-2 space-y-1 text-xs text-muted">
          <div>Search type: {card.trace.searchType}</div>
          {card.trace.category ? <div>Category: {card.trace.category}</div> : null}
          {card.trace.userLocation ? <div>User location: {card.trace.userLocation}</div> : null}
          {card.trace.startPublishedDate ? (
            <div>Published after: {formatDate(card.trace.startPublishedDate)}</div>
          ) : null}
          {card.trace.includeDomains ? (
            <div>Include domains: {card.trace.includeDomains.join(", ")}</div>
          ) : null}
          {card.trace.excludeDomains ? (
            <div>Exclude domains: {card.trace.excludeDomains.join(", ")}</div>
          ) : null}
          {card.trace.additionalQueries ? (
            <div>Extra queries: {card.trace.additionalQueries.join(" · ")}</div>
          ) : null}
          <div>Structured output on the search, plus highlights.</div>
        </dl>
      </details>
    </article>
  );
}

export function PendingCard({
  title,
  summary,
  waiting,
}: {
  title: string;
  summary: string;
  waiting: boolean;
}) {
  return (
    <article className="h-full rounded-2xl border border-dashed border-line bg-card p-4">
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-sm text-muted">{summary}</p>
      <p className={`mt-6 text-sm ${waiting ? "text-amber" : "text-muted"}`}>
        {waiting ? "Searching…" : "No result returned."}
      </p>
    </article>
  );
}

function Fact({ label, value, missing }: { label: string; value: string; missing: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-sm ${missing ? "text-muted" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

function ClaimQuote({ claim }: { claim?: PathCard["claims"][number] }) {
  const source = claim?.sources[0];
  if (!claim || isNotFound(claim.value) || !source) return null;
  return (
    <div className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs leading-relaxed">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-copper underline-offset-2 hover:underline"
      >
        {source.title}
      </a>
      {source.publishedDate ? (
        <span className="ml-2 text-muted">{formatDate(source.publishedDate)}</span>
      ) : null}
      {source.highlight ? (
        <blockquote className="mt-1 text-ink">
          <span className="mr-1 text-muted">
            {source.quoteKind === "excerpt" ? "Excerpt." : "Quoted highlight."}
          </span>
          {source.highlight}
        </blockquote>
      ) : null}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
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

export function RecommendationBanner({ recommendation }: { recommendation: Recommendation }) {
  return (
    <section className="rounded-2xl border border-copper bg-card p-4 sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-copper">
        {recommendation.via === "exa-answer" ? "Exa Answer" : "Workshop rule"}
      </p>
      <h2 className="mt-1 text-xl font-medium tracking-tight">
        {recommendation.pathId
          ? `Start with ${labelFor(recommendation.pathId)}`
          : "No path to recommend yet"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed">{recommendation.reason}</p>
      <p className="mt-2 text-sm leading-relaxed">
        <span className="font-medium">Fastest sourced option. </span>
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
        <ul className="mt-3 flex flex-wrap gap-2">
          {recommendation.sources.slice(0, 4).map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-copper underline-offset-2 hover:underline"
              >
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
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
