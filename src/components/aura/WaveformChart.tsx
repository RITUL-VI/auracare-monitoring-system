import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, YAxis } from "recharts";
import { Radio } from "lucide-react";
import type { Monitor } from "@/hooks/use-aura-monitor";

export function WaveformChart({ monitor }: { monitor: Monitor }) {
  const { wave, monitoring, alert, hr, rr } = monitor;
  const stroke = alert ? "var(--destructive)" : "var(--primary)";

  return (
    <section className="panel-surface rounded-2xl border">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="size-4 shrink-0 text-primary" />
          <h2 className="truncate font-display text-sm font-semibold tracking-wide">
            Live rPPG Waveform
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: stroke }} /> pulse · {hr} bpm
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="size-2 rounded-full bg-muted-foreground" /> respiration ·{" "}
            {rr.toFixed(0)} br/min
          </span>
        </div>
      </header>

      <div className="h-64 w-full px-2 py-3 grid-backdrop">
        {monitoring && wave.length > 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={wave} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="ppgFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <YAxis hide domain={[-2.4, 2.4]} />
              <Area
                type="monotone"
                dataKey="ppg"
                stroke={stroke}
                strokeWidth={2}
                fill="url(#ppgFill)"
                isAnimationActive={false}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="resp"
                stroke="var(--muted-foreground)"
                strokeWidth={1.25}
                strokeDasharray="5 5"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Awaiting signal acquisition
          </div>
        )}
      </div>
    </section>
  );
}
