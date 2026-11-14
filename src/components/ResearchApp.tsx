"use client";

import { useEffect, useRef, useState } from "react";
import { ApprovalPanel } from "@/components/ApprovalPanel";
import { intakeFromExample, IntakeForm, toIntake, type FormValue } from "@/components/IntakeForm";
import { OptionCard, PendingCard, RecommendationBanner } from "@/components/OptionCard";
import { ProgressRail, type Phase } from "@/components/ProgressRail";
import { SourcesPanel } from "@/components/SourcesPanel";
import { parseIntake } from "@/lib/intake";
import { PATH_META } from "@/lib/paths";
import { consumeSseBuffer } from "@/lib/sse";
import type { PathCard, PathId, Recommendation, StatusEvent } from "@/lib/types";

const INITIAL_FORM: FormValue = {
  manufacturer: "",
  partNumber: "",
  symptom: "",
  country: "FI",
  urgency: "emergency",
  notes: "",
};

const IDLE: Record<PathId, Phase> = {
  diy: "idle",
  repair: "idle",
  used: "idle",
  new: "idle",
  obsolete: "idle",
};

export function ResearchApp() {
  const [form, setForm] = useState<FormValue>(INITIAL_FORM);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("Waiting for a unit.");
  const [elapsed, setElapsed] = useState(0);
  const [phases, setPhases] = useState(IDLE);
  const [cards, setCards] = useState<PathCard[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [selected, setSelected] = useState<PathId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reasonRef = useRef<"user" | "timeout" | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!selected) return;
    document.getElementById("approval")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  function stop(reason: "user" | "timeout") {
    reasonRef.current = reason;
    abortRef.current?.abort();
  }

  async function start(next: FormValue) {
    const parsed = parseIntake(toIntake(next));
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }

    const runId = runRef.current + 1;
    runRef.current = runId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    reasonRef.current = null;
    const timeout = window.setTimeout(() => stop("timeout"), 50_000);

    setForm(next);
    setRunning(true);
    setError(null);
    setCards([]);
    setRecommendation(null);
    setSelected(null);
    setFinishedAt(null);
    setElapsed(0);
    setMessage("Starting the live search.");
    setPhases({
      diy: "running",
      repair: "running",
      used: "running",
      new: "running",
      obsolete: "running",
    });

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.intake),
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("text/event-stream")) {
        setPhases(IDLE);
        setCards([]);
        const payload: { message?: string } = await response.json().catch(() => ({}));
        throw new Error(payload.message || `The search could not start (${response.status}).`);
      }
      if (!response.body) throw new Error("The search returned an empty stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parsedBuffer = consumeSseBuffer(buffer);
        buffer = parsedBuffer.rest;
        for (const frame of parsedBuffer.events) applyFrame(frame.event, frame.data);
      }
    } catch (caught) {
      if (runRef.current !== runId) return;
      setPhases((current) => {
        const next = { ...current };
        for (const id of Object.keys(next) as PathId[]) {
          if (next[id] === "running") next[id] = "error";
        }
        return next;
      });
      if (reasonRef.current === "user") {
        setError("Search cancelled. Nothing was sent.");
      } else if (reasonRef.current === "timeout") {
        setError("Stopped after 50 seconds so the page does not hang.");
      } else if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "The search failed.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (runRef.current === runId) setRunning(false);
    }
  }

  function applyFrame(event: string, raw: string) {
    const data: unknown = JSON.parse(raw);
    if (event === "status") {
      const status = data as StatusEvent;
      setMessage(status.message);
      if (status.pathId && status.state) {
        const pathId = status.pathId;
        const state = status.state;
        setPhases((current) => ({ ...current, [pathId]: state }));
      }
      return;
    }
    if (event === "path") {
      const card = data as PathCard;
      setCards((current) => [...current.filter((item) => item.id !== card.id), card]);
      setPhases((current) => ({
        ...current,
        [card.id]: card.status === "error" ? "error" : "done",
      }));
      return;
    }
    if (event === "recommendation") {
      setRecommendation(data as Recommendation);
      return;
    }
    if (event === "report") {
      const report = data as {
        cards: PathCard[];
        recommendation: Recommendation;
        generatedAt: string;
      };
      setCards(report.cards);
      setRecommendation(report.recommendation);
      setFinishedAt(report.generatedAt);
      setMessage("Search finished. Pick an option to prepare the next step.");
      setPhases((current) => {
        const next = { ...current };
        for (const meta of PATH_META) {
          const card = report.cards.find((item) => item.id === meta.id);
          next[meta.id] = !card ? "error" : card.status === "error" ? "error" : "done";
        }
        return next;
      });
      return;
    }
    if (event === "error") {
      const payload = data as { message?: string };
      setError(payload.message ?? "The search failed.");
    }
  }

  const ordered = PATH_META.map((meta) => cards.find((card) => card.id === meta.id) ?? null);
  const showBoard = running || cards.length > 0;
  const selectedCard = cards.find((card) => card.id === selected) ?? null;
  const intake = toIntake(form);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-ink font-mono text-xs font-medium text-paper">
              RB
            </span>
            <div>
              <p className="font-medium leading-none tracking-tight">Repair Butler</p>
              <p className="mt-1 text-xs text-muted">Industrial electronics, sourced</p>
            </div>
          </div>
          <p className="hidden text-right text-xs text-muted sm:block">
            Junction 2026 · Exa Internet Butler
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <section>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-copper">
            For maintenance technicians and small repair shops
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-medium tracking-tight sm:text-4xl">
            Every way to get a dead unit running again.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            Describe the manufacturer, part number, and symptom. Repair Butler searches the live
            web for a DIY fix, a repair shop, a used unit, a new one, and a successor. You approve
            the next step. Every price, lead time, and failure mode has a source, or it says not
            found.
          </p>
        </section>

        <IntakeForm
          value={form}
          onChange={setForm}
          running={running}
          onCancel={() => stop("user")}
          onSubmit={() => void start(form)}
          onExample={(exampleId) => {
            const next = intakeFromExample(exampleId);
            if (next) void start(next);
          }}
        />

        {error ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {showBoard ? <ProgressRail phases={phases} message={message} elapsed={elapsed} /> : null}

        {recommendation ? <RecommendationBanner recommendation={recommendation} /> : null}

        {showBoard ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {PATH_META.map((meta, index) => {
              const card = ordered[index];
              const wide = index === PATH_META.length - 1;
              if (!card) {
                return (
                  <div key={meta.id} className={wide ? "lg:col-span-2" : undefined}>
                    <PendingCard title={meta.title} summary={meta.summary} waiting={running} />
                  </div>
                );
              }
              return (
                <div key={meta.id} className={wide ? "lg:col-span-2" : undefined}>
                  <OptionCard
                    card={card}
                    recommended={recommendation?.pathId === card.id}
                    selected={selected === card.id}
                    onSelect={() => setSelected(card.id)}
                  />
                </div>
              );
            })}
          </section>
        ) : null}

        {selectedCard ? <ApprovalPanel card={selectedCard} intake={intake} /> : null}

        {cards.length > 0 ? <SourcesPanel cards={cards} recommendation={recommendation} /> : null}

        <footer className="border-t border-line pt-4 text-sm leading-relaxed text-muted">
          <p>
            Sources are live pages retrieved through Exa for this search. Repair Butler does not
            place orders or send email.
            {finishedAt ? ` Finished ${finishedAt}.` : ""}
          </p>
          <p className="mt-2">
            Built for plant engineers and shops like JP Electronix AB, where the next step on a
            dead HMI, PLC, or drive has to be sourced before anyone spends money.
          </p>
        </footer>
      </main>
    </div>
  );
}
