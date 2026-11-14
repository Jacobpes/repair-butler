import { PATH_META } from "@/lib/paths";
import type { PathId } from "@/lib/types";

export type Phase = "idle" | "running" | "done" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Waiting",
  running: "Searching the live web",
  done: "Result in",
  error: "Search failed",
};

export function ProgressRail({
  phases,
  message,
  elapsed,
}: {
  phases: Record<PathId, Phase>;
  message: string;
  elapsed: number;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card sm:p-6" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Checking five paths</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
        <p className="font-mono text-sm text-muted">{elapsed}s</p>
      </div>
      <ol className="mt-5">
        {PATH_META.map((meta, index) => {
          const phase = phases[meta.id];
          const last = index === PATH_META.length - 1;
          return (
            <li key={meta.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-medium ${
                    phase === "done"
                      ? "border-pine bg-pine-soft text-pine"
                      : phase === "error"
                        ? "border-danger bg-danger-soft text-danger"
                        : phase === "running"
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-paper text-muted"
                  }`}
                >
                  {phase === "done" ? "✓" : phase === "error" ? "!" : index + 1}
                  {phase === "running" ? <span className="sr-only"> searching</span> : null}
                </span>
                {last ? null : <span className="my-1 w-px flex-1 bg-line" />}
              </div>
              <div className={`min-w-0 pb-4 ${last ? "pb-0" : ""}`}>
                <p className="text-sm font-medium">{meta.title}</p>
                <p className="text-sm text-muted">{PHASE_LABEL[phase]}</p>
                <p className="text-xs text-muted">{meta.summary}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
