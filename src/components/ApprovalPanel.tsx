"use client";

import { useState } from "react";
import { IconCheck, IconCopy, IconMail } from "@/components/icons";
import { buildAction } from "@/lib/actions";
import type { Intake, PathCard } from "@/lib/types";

export function ApprovalPanel({ card, intake }: { card: PathCard; intake: Intake }) {
  const action = buildAction(card, intake);
  const [copied, setCopied] = useState(false);

  return (
    <section id="approval" className="scroll-mt-24 rounded-2xl border border-accent bg-card p-5 shadow-card sm:p-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Final step</p>
      <h2 className="mt-2 text-2xl font-medium tracking-tight">
        {action.title}: {card.title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed">{action.intro}</p>
      <p className="mt-3 text-sm">
        <span className="text-muted">Recipient. </span>
        {action.recipientLabel}
      </p>

      <div className="mt-5 rounded-xl border border-line bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm font-medium" id="draft-label">
            {action.kind === "email" ? "Email draft" : "Checklist"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(action.body).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-fill px-4 py-2 text-sm font-medium text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copied ? <IconCheck /> : <IconCopy />}
              {copied ? "Copied" : "Copy draft"}
            </button>
            <a
              href={action.mailto}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconMail />
              Open in email
            </a>
          </div>
        </div>
        <textarea
          id="draft"
          aria-labelledby="draft-label"
          readOnly
          value={action.body}
          rows={14}
          className="w-full resize-y bg-transparent px-4 py-4 font-mono text-xs leading-relaxed text-ink outline-none"
        />
      </div>
      {action.clipped ? (
        <p className="mt-2 text-xs text-muted">The draft was shortened so a mail app can open it.</p>
      ) : null}

      <ol className="mt-5 space-y-2">
        {action.steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-medium text-accent">
              {index + 1}
            </span>
            <span className="pt-0.5 text-muted">{step}</span>
          </li>
        ))}
      </ol>

      {action.links.length > 0 ? (
        <ul className="mt-5 space-y-1 text-sm">
          {action.links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
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
