import { AnimatePresence, motion } from "motion/react";
import { BellRing, CheckCircle2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Monitor } from "@/hooks/use-aura-monitor";

const COPY = {
  tachycardia: "CRITICAL ALERT: Tachycardia Detected",
  bradypnea: "CRITICAL ALERT: Respiratory Depression Detected",
  distress: "CRITICAL ALERT: Patient Distress Signature Detected",
} as const;

export function AlertOverlay({ monitor, bed }: { monitor: Monitor; bed: string }) {
  const { alert, alertDispatched, hr, rr } = monitor;

  return (
    <AnimatePresence>
      {alert && (
        <>
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="fixed inset-x-0 top-0 z-50 border-b border-destructive/50 bg-destructive/20 backdrop-blur-md"
            style={{ boxShadow: "var(--shadow-alert)" }}
            role="alert"
          >
            <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <ShieldAlert className="size-5 shrink-0 animate-blink text-destructive" />
                <p className="min-w-0 truncate font-display text-sm font-bold tracking-wide text-destructive animate-blink">
                  {COPY[alert]} | {bed}
                </p>
              </div>
              <button
                onClick={monitor.dismissAlert}
                className="shrink-0 rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/20"
                aria-label="Dismiss alert"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="panel-surface w-full max-w-md rounded-2xl border border-destructive/40 p-6"
              style={{ boxShadow: "var(--shadow-alert)" }}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive">
                  <ShieldAlert className="size-5 animate-blink" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-base font-bold text-destructive">{COPY[alert]}</p>
                  <p className="truncate font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {bed} · escalation tier 1
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Heart rate
                  </dt>
                  <dd className="font-display text-2xl font-bold tabular-nums text-destructive">
                    {hr} <span className="text-xs font-normal">bpm</span>
                  </dd>
                </div>
                <div className="rounded-xl border p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Respiration
                  </dt>
                  <dd className="font-display text-2xl font-bold tabular-nums">
                    {rr.toFixed(0)} <span className="text-xs font-normal">br/min</span>
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {alertDispatched ? (
                  <span className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                    <CheckCircle2 className="size-4" /> Caregiver push alert dispatched
                  </span>
                ) : (
                  <Button variant="destructive" onClick={monitor.dispatchAlert} className="gap-2">
                    <BellRing className="size-4" /> Dispatch caregiver push alert
                  </Button>
                )}
                <Button variant="secondary" onClick={monitor.dismissAlert}>
                  Acknowledge
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
