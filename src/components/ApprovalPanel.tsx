"use client";

import { useState } from "react";
import { buildAction } from "@/lib/actions";
import type { Intake, PathCard } from "@/lib/types";

export function ApprovalPanel({ card, intake }: { card: PathCard; intake: Intake }) {
  const action = buildAction(card, intake);
  const [copied, setCopied] = useState(false);

  return (
    <section id="approval" className="scroll-mt-24 rounded-2xl border border-ink bg-card p-4 sm:p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-copper">Approval</p>
      <h2 className="mt-1 text-xl font-medium tracking-tight">
        {action.title}: {card.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed">{action.intro}</p>
      <p className="mt-2 text-sm">
        <span className="text-muted">Recipient. </span>
        {action.recipientLabel}
      </p>

      <label className="mt-4 block text-sm font-medium" htmlFor="draft">
        {action.kind === "email" ? "Email draft" : "Checklist"}
      </label>
      <textarea
        id="draft"
        readOnly
        value={action.body}
        rows={14}
        className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-3 font-mono text-xs leading-relaxed text-ink"
      />
      {action.clipped ? (
        <p className="mt-2 text-xs text-muted">The draft was shortened so a mail app can open it.</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(action.body).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          {copied ? "Copied" : "Copy draft"}
        </button>
        <a
          href={action.mailto}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2 text-center text-sm font-medium"
        >
          Open in email
        </a>
      </div>

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
        {action.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {action.links.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm">
          {action.links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="text-copper underline-offset-2 hover:underline"
              >
                {link.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
