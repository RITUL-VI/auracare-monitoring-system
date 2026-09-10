import { HeartPulse, Cpu, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const BEDS = [
  "Bed 04 - Infant NICU",
  "Bed 07 - Infant NICU",
  "Bed 12 - Pediatric ICU",
  "Bed 21 - Post-Op Recovery",
];

export function HeaderBar({
  bed,
  onBedChange,
  monitoring,
}: {
  bed: string;
  onBedChange: (b: string) => void;
  monitoring: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <HeartPulse className="size-5 animate-heart" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold tracking-tight">
              Aura<span className="text-primary">Care</span>
            </h1>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Touch-free AI patient monitoring
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 md:flex">
            <Cpu className="size-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
              System Active — Processing on Edge
            </span>
            <span className="size-1.5 rounded-full bg-primary animate-blink" />
          </span>

          <Select value={bed} onValueChange={onBedChange}>
            <SelectTrigger className="w-[190px] font-mono text-xs sm:w-[220px]">
              <SelectValue />
              <ChevronDown className="size-3.5 opacity-0" />
            </SelectTrigger>
            <SelectContent>
              {BEDS.map((b) => (
                <SelectItem key={b} value={b} className="font-mono text-xs">
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span
            className={`hidden rounded-lg border px-2.5 py-2 font-mono text-[10px] uppercase tracking-widest lg:block ${
              monitoring
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            {monitoring ? "Streaming" : "Idle"}
          </span>
        </div>
      </div>
    </header>
  );
}
