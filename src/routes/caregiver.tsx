import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BellRing,
  Mail,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  Siren,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ALERT_COPY, type AlertType, fetchDispatchedAlerts } from "@/lib/alerts";

export const Route = createFileRoute("/caregiver")({
  head: () => ({
    meta: [
      { title: "Caregiver Alert Dashboard — AuraCare" },
      {
        name: "description",
        content:
          "Every critical AuraCare alert dispatched from the bedside, with timestamp, bed, heart rate, respiration and the contact notified.",
      },
      { property: "og:title", content: "Caregiver Alert Dashboard — AuraCare" },
      {
        property: "og:description",
        content: "Received critical alerts with timestamp, bed and vitals at the moment of dispatch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CaregiverDashboard,
});

function CaregiverDashboard() {
  const alerts = useQuery({
    queryKey: ["dispatched-alerts"],
    queryFn: fetchDispatchedAlerts,
  });

  // Live push: new bedside dispatches appear without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel("alerts-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, () => {
        void alerts.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [alerts]);

  const rows = alerts.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
            <Siren className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold tracking-tight">
              Caregiver Alert Dashboard
            </h1>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Received critical alerts · live feed
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => void alerts.refetch()}
            >
              <RefreshCw className={`size-4 ${alerts.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button asChild size="sm" className="gap-2">
              <Link to="/">
                <ArrowLeft className="size-4" /> Bedside
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <Stat label="Alerts received" value={String(rows.length)} />
          <Stat
            label="Beds involved"
            value={String(new Set(rows.map((r) => r.bed)).size)}
          />
          <Stat
            label="Latest"
            value={rows[0] ? new Date(rows[0].dispatched_at).toLocaleTimeString() : "—"}
          />
        </section>

        {alerts.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading received alerts…</p>
        ) : alerts.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Could not load the alert feed. Try refreshing.
          </p>
        ) : rows.length === 0 ? (
          <div className="panel-surface rounded-2xl border p-8 text-center">
            <BellRing className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No alerts received yet. Dispatch one from the bedside monitor and it will appear here
              instantly.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <li
                key={a.id}
                className="panel-surface rounded-2xl border border-destructive/25 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <ShieldAlert className="size-5 shrink-0 text-destructive" />
                  <p className="min-w-0 font-display text-sm font-bold text-destructive">
                    {ALERT_COPY[a.alert_type as AlertType] ?? a.alert_type}
                  </p>
                  <span className="rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {a.bed}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {new Date(a.dispatched_at).toLocaleString()}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Metric label="Heart rate" value={`${a.heart_rate ?? "—"} bpm`} />
                  <Metric
                    label="Respiration"
                    value={`${a.respiration_rate ?? "—"} br/min`}
                  />
                  <Metric
                    label="Signal confidence"
                    value={`${a.signal_confidence ?? "—"}%`}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {a.notified_phone && (
                    <span className="flex items-center gap-1.5">
                      <PhoneCall className="size-3.5 text-primary" /> +91 {a.notified_phone}
                    </span>
                  )}
                  {a.notified_email && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Mail className="size-3.5 text-primary" />
                      <span className="truncate">{a.notified_email}</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="panel-surface rounded-2xl border p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}
