import { motion } from "motion/react";
import { HeartPulse, Signal, Waves } from "lucide-react";
import type { Monitor } from "@/hooks/use-aura-monitor";

function statusOf(hr: number, rr: number) {
  if (hr > 120) return { label: "Tachycardia", tone: "critical" as const };
  if (hr < 55) return { label: "Bradycardia", tone: "critical" as const };
  if (rr < 10) return { label: "Bradypnea", tone: "critical" as const };
  if (hr > 105) return { label: "Elevated", tone: "warn" as const };
  return { label: "Stable", tone: "ok" as const };
}

const toneClass = {
  ok: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/30 bg-warning/10 text-warning",
  critical: "border-destructive/40 bg-destructive/15 text-destructive",
};

export function VitalsPanel({ monitor }: { monitor: Monitor }) {
  const { hr, rr, confidence, monitoring } = monitor;
  const status = statusOf(hr, rr);
  const beat = `${(60 / Math.max(hr, 30)).toFixed(2)}s`;
  const breath = `${(60 / Math.max(rr, 4)).toFixed(2)}s`;
  const critical = status.tone === "critical";

  return (
    <div className="grid gap-4">
      {/* Heart rate */}
      <article className="panel-surface relative overflow-hidden rounded-2xl border p-5">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <HeartPulse
              className={`size-4 shrink-0 animate-heart ${critical ? "text-destructive" : "text-primary"}`}
              style={{ ["--beat" as string]: beat }}
            />
            <h3 className="truncate font-display text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Heart Rate
            </h3>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${toneClass[status.tone]}`}
          >
            {monitoring ? status.label : "Idle"}
          </span>
        </header>

        <div className="mt-4 flex items-end gap-2">
          <motion.span
            key={hr}
            initial={{ opacity: 0.55, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`font-display text-5xl font-bold tabular-nums text-glow ${critical ? "text-destructive" : "text-primary"}`}
          >
            {monitoring ? hr : "--"}
          </motion.span>
          <span className="pb-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            BPM
          </span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-700 ${critical ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${Math.min(100, ((hr - 40) / 120) * 100)}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Neonatal window 100–160 · alert &gt; 120
        </p>
      </article>

      {/* Respiration */}
      <article className="panel-surface overflow-hidden rounded-2xl border p-5">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Waves className="size-4 shrink-0 text-primary" />
            <h3 className="truncate font-display text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Respiration Rate
            </h3>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${rr < 10 ? toneClass.critical : toneClass.ok}`}
          >
            {monitoring ? (rr < 10 ? "Bradypnea" : "Regular") : "Idle"}
          </span>
        </header>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="flex items-end gap-2">
            <span className="font-display text-5xl font-bold tabular-nums text-foreground">
              {monitoring ? rr.toFixed(0) : "--"}
            </span>
            <span className="pb-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              br/min
            </span>
          </div>
          <div
            className="flex h-12 items-end gap-1"
            style={{ ["--breath" as string]: breath }}
            aria-hidden
          >
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-primary/70 animate-breathe"
                style={{ height: `${28 + Math.sin(i) * 16}px`, animationDelay: `${i * 0.09}s` }}
              />
            ))}
          </div>
        </div>
      </article>

      {/* Signal quality */}
      <article className="panel-surface rounded-2xl border p-5">
        <header className="flex min-w-0 items-center gap-2">
          <Signal className="size-4 shrink-0 text-primary" />
          <h3 className="truncate font-display text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            rPPG Signal Confidence
          </h3>
        </header>
        <div className="mt-3 flex items-end justify-between">
          <span className="font-display text-3xl font-bold tabular-nums text-foreground">
            {monitoring ? `${confidence}%` : "--"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {monitor.cameraLive ? "sensor locked" : "fallback stream"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-20 gap-0.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className={`h-3 rounded-sm ${monitoring && i < Math.round(confidence / 5) ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>
      </article>
    </div>
  );
}
