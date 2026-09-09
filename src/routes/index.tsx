import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, Cpu, ShieldCheck, Thermometer } from "lucide-react";
import { BEDS, HeaderBar } from "@/components/aura/HeaderBar";
import { CameraViewport } from "@/components/aura/CameraViewport";
import { VitalsPanel } from "@/components/aura/VitalsPanel";
import { WaveformChart } from "@/components/aura/WaveformChart";
import { AlertOverlay } from "@/components/aura/AlertOverlay";
import { useAuraMonitor } from "@/hooks/use-aura-monitor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AuraCare — Touch-Free AI Patient Monitoring" },
      {
        name: "description",
        content:
          "AuraCare monitors heart rate, respiration and rPPG signal quality contact-free from a live camera feed, with real-time waveforms and critical alerts.",
      },
      { property: "og:title", content: "AuraCare — Touch-Free AI Patient Monitoring" },
      {
        property: "og:description",
        content:
          "Contact-free vitals from a camera feed: rPPG heart rate, respiration, live waveforms and instant critical alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuraCare,
});

function AuraCare() {
  const [bed, setBed] = useState<string>(BEDS[0]!);
  const monitor = useAuraMonitor();

  return (
    <div className="min-h-screen bg-background">
      <HeaderBar bed={bed} onBedChange={setBed} monitoring={monitor.monitoring} />
      <AlertOverlay monitor={monitor} bed={bed} />

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
          <CameraViewport monitor={monitor} />
          <VitalsPanel monitor={monitor} />
        </div>

        <WaveformChart monitor={monitor} />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile
            icon={<Cpu className="size-4" />}
            label="Inference"
            value="On-device edge"
            note="No frames leave the bedside"
          />
          <InfoTile
            icon={<Activity className="size-4" />}
            label="Sample rate"
            value="30 Hz"
            note="POS projection + 4th-order Butterworth"
          />
          <InfoTile
            icon={<Thermometer className="size-4" />}
            label="Patient"
            value={bed}
            note="Continuous contact-free watch"
          />
          <InfoTile
            icon={<ShieldCheck className="size-4" />}
            label="Alert policy"
            value="HR > 120 · RR < 10"
            note="Auto escalation to caregiver"
          />
        </section>

        <p className="pb-6 text-center text-xs text-muted-foreground">
          Research demonstrator. AuraCare is not a certified medical device and must not be used for
          clinical diagnosis.
        </p>
      </main>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="panel-surface rounded-2xl border p-4">
      <div className="flex min-w-0 items-center gap-2 text-primary">
        {icon}
        <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-2 truncate font-display text-sm font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </article>
  );
}
