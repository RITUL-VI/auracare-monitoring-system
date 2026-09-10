import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Activity, CameraOff, Play, ScanFace, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Monitor } from "@/hooks/use-aura-monitor";

const FOREHEAD = [10, 67, 69, 104, 108, 151, 337, 299, 333, 297, 338, 9, 8];
const CHEEKS = [50, 101, 118, 205, 36, 142, 280, 330, 347, 425, 266, 371];

type Point = { x: number; y: number };

export function CameraViewport({ monitor }: { monitor: Monitor }) {
  const { videoRef, monitoring, cameraLive, cameraError, alert, hr } = monitor;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [meshMode, setMeshMode] = useState<"mediapipe" | "estimated">("estimated");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!monitoring) {
      setLocked(false);
      const c = canvasRef.current;
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let faceMesh: { send: (o: { image: HTMLVideoElement }) => Promise<void>; close: () => void } | null =
      null;
    let landmarks: Point[] | null = null;
    let busy = false;
    let t = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const w = video.clientWidth || 960;
      const h = video.clientHeight || 540;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const pts = landmarks ?? estimatedMesh(t, w, h);
      const useMediapipe = Boolean(landmarks);
      const scaled = useMediapipe ? pts.map((p) => ({ x: p.x * w, y: p.y * h })) : pts;

      // Face mesh cloud
      ctx.fillStyle = "rgba(6, 182, 212, 0.35)";
      for (const p of scaled) {
        ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
      }

      // High-perfusion landmarks
      const highlight = useMediapipe
        ? [...FOREHEAD, ...CHEEKS].map((i) => scaled[i]).filter(Boolean)
        : scaled.filter((_, i) => i % 7 === 0);
      const accent = alert ? "rgba(239, 68, 68, 0.95)" : "rgba(6, 182, 212, 0.95)";
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
      for (const p of highlight) {
        ctx.beginPath();
        ctx.arc(p!.x, p!.y, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Bounding box
      const xs = scaled.map((p) => p.x);
      const ys = scaled.map((p) => p.y);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      const pad = 14;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
      ctx.setLineDash([]);

      // Corner brackets
      const corner = 18;
      const bx = [x0 - pad, x1 + pad];
      const by = [y0 - pad, y1 + pad];
      ctx.lineWidth = 2.5;
      for (const i of [0, 1]) {
        for (const j of [0, 1]) {
          const sx = i ? -1 : 1;
          const sy = j ? -1 : 1;
          ctx.beginPath();
          ctx.moveTo(bx[i]! + sx * corner, by[j]!);
          ctx.lineTo(bx[i]!, by[j]!);
          ctx.lineTo(bx[i]!, by[j]! + sy * corner);
          ctx.stroke();
        }
      }
      setLocked(true);
      t += 1 / 60;
    };

    const pump = async () => {
      if (cancelled) return;
      raf = requestAnimationFrame(pump);
      const video = videoRef.current;
      if (faceMesh && video && video.readyState >= 2 && !busy) {
        busy = true;
        try {
          await faceMesh.send({ image: video });
        } catch {
          /* keep the estimated overlay */
        }
        busy = false;
      }
      draw();
    };

    (async () => {
      if (cameraLive) {
        try {
          const mod = await import("@mediapipe/face_mesh");
          const Ctor = (mod as unknown as { FaceMesh: new (o: unknown) => never }).FaceMesh;
          const instance = new Ctor({
            locateFile: (file: string) =>
              `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
          }) as unknown as {
            setOptions: (o: unknown) => void;
            onResults: (cb: (r: { multiFaceLandmarks?: Point[][] }) => void) => void;
            send: (o: { image: HTMLVideoElement }) => Promise<void>;
            close: () => void;
          };
          instance.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          instance.onResults((res) => {
            const found = res.multiFaceLandmarks?.[0];
            if (found?.length) {
              landmarks = found;
              setMeshMode("mediapipe");
            }
          });
          if (!cancelled) faceMesh = instance;
        } catch {
          setMeshMode("estimated");
        }
      }
      if (!cancelled) raf = requestAnimationFrame(pump);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      faceMesh?.close();
    };
  }, [monitoring, cameraLive, alert, videoRef]);

  const beat = `${(60 / Math.max(hr, 30)).toFixed(2)}s`;

  return (
    <section className="panel-surface overflow-hidden rounded-2xl border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ScanFace className="size-4 shrink-0 text-primary" />
          <h2 className="truncate font-display text-sm font-semibold tracking-wide">
            Optical Sensor · Face Mesh
          </h2>
        </div>
        <span className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-primary">
          {meshMode === "mediapipe" ? "MediaPipe 468 pts" : "Geometric estimator"}
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden bg-black/60 grid-backdrop">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 size-full scale-x-[-1] object-cover opacity-90"
        />
        <canvas ref={canvasRef} className="absolute inset-0 size-full scale-x-[-1]" />

        {monitoring && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px animate-scanline bg-primary/70 shadow-glow" />
        )}

        {!monitoring && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <CameraOff className="size-8 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Sensor idle. Start monitoring to lock the region of interest and begin contact-free
              extraction.
            </p>
          </div>
        )}

        {monitoring && locked && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-background/80 px-3 py-1.5 backdrop-blur"
          >
            <span
              className="size-2 rounded-full bg-primary animate-heart"
              style={{ ["--beat" as string]: beat }}
            />
            <span className="font-mono text-[11px] uppercase tracking-widest text-primary">
              Target ROI Locked
            </span>
          </motion.div>
        )}

        {monitoring && (
          <div className="absolute bottom-4 left-4 space-y-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <p>ROI: forehead + bilateral malar</p>
            <p>Pipeline: POS → Butterworth 0.7–4.0 Hz</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Button onClick={monitor.start} disabled={monitoring} className="gap-2">
          <Play className="size-4" /> Start Monitoring
        </Button>
        <Button onClick={monitor.stop} variant="secondary" disabled={!monitoring} className="gap-2">
          <Square className="size-4" /> Stop
        </Button>
        <Button
          onClick={monitor.simulateDistress}
          variant="destructive"
          disabled={!monitoring}
          className="gap-2"
        >
          <TriangleAlert className="size-4" /> Simulate Distress
        </Button>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Activity className="size-3.5 text-primary" />
          {monitor.source === "rppg" ? "rPPG extraction" : "Modelled fallback"}
        </span>
      </div>

      {cameraError && (
        <p className="border-t border-warning/20 bg-warning/10 px-4 py-2 text-xs text-warning">
          {cameraError}
        </p>
      )}
    </section>
  );
}

/** Geometric mesh estimator used before/without MediaPipe landmarks. */
function estimatedMesh(t: number, w: number, h: number): Point[] {
  const cx = w / 2 + Math.sin(t * 0.5) * w * 0.012;
  const cy = h / 2 + Math.cos(t * 0.4) * h * 0.012;
  const rx = w * 0.16;
  const ry = h * 0.26;
  const pts: Point[] = [];
  for (let ring = 1; ring <= 7; ring++) {
    const k = ring / 7;
    const count = 10 + ring * 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
  }
  return pts;
}
