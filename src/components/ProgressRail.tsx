import { PATH_META } from "@/lib/paths";
import type { PathId } from "@/lib/types";

export type Phase = "idle" | "running" | "done" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Waiting",
  running: "Searching",
  done: "In",
  error: "Failed",
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
    <section
      className="rounded-2xl border border-line bg-card p-4 sm:p-5"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">Live search</h2>
        <p className="font-mono text-sm text-muted">{elapsed}s</p>
      </div>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {PATH_META.map((meta) => {
          const phase = phases[meta.id];
          return (
            <li key={meta.id} className="rounded-xl border border-line bg-paper px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={`h-2 w-2 rounded-full ${
                    phase === "running"
                      ? "animate-pulse bg-amber"
                      : phase === "done"
                        ? "bg-pine"
                        : phase === "error"
                          ? "bg-danger"
                          : "bg-line"
                  }`}
                />
                {meta.title}
              </span>
              <span className="mt-1 block text-xs text-muted">
                {phase === "done" ? "Result in" : PHASE_LABEL[phase]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
