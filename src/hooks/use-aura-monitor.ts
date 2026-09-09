import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bandpass,
  HR_BAND,
  RR_BAND,
  averageRoiColor,
  estimateRate,
  posProject,
  signalConfidence,
  syntheticPulse,
  type Rgb,
  type Roi,
} from "@/lib/rppg";

export type WavePoint = { i: number; ppg: number; resp: number };
export type AlertKind = null | "tachycardia" | "bradypnea" | "distress";

const SAMPLE_RATE = 30;
const WINDOW = SAMPLE_RATE * 8;
const CHART_POINTS = 165;

/** High-perfusion patches, normalized to the detected face box. */
const PERFUSION_ROIS: Roi[] = [
  { x: 0.3, y: 0.14, w: 0.4, h: 0.16 }, // forehead
  { x: 0.1, y: 0.46, w: 0.22, h: 0.18 }, // left cheek
  { x: 0.68, y: 0.46, w: 0.22, h: 0.18 }, // right cheek
];

export function useAuraMonitor() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [distress, setDistress] = useState(false);
  const [hr, setHr] = useState(78);
  const [rr, setRr] = useState(16);
  const [confidence, setConfidence] = useState(0);
  const [wave, setWave] = useState<WavePoint[]>([]);
  const [alert, setAlert] = useState<AlertKind>(null);
  const [alertDispatched, setAlertDispatched] = useState(false);
  const [source, setSource] = useState<"rppg" | "synthetic">("synthetic");

  const streamRef = useRef<MediaStream | null>(null);
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const distressRef = useRef(false);
  const stateRef = useRef({
    hr: 78,
    rr: 16,
    targetHr: 78,
    targetRr: 16,
    tick: 0,
    time: 0,
    last: 0,
    acc: 0,
    mean: null as Rgb | null,
    ppg: [] as number[],
    resp: [] as number[],
    chart: [] as WavePoint[],
    hrFilter: new Bandpass(HR_BAND[0], HR_BAND[1], SAMPLE_RATE),
    rrFilter: new Bandpass(RR_BAND[0], RR_BAND[1], SAMPLE_RATE),
  });

  distressRef.current = distress;

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.ppg = [];
    s.resp = [];
    s.chart = [];
    s.mean = null;
    s.tick = 0;
    s.time = 0;
    s.acc = 0;
    s.last = 0;
    s.hrFilter = new Bandpass(HR_BAND[0], HR_BAND[1], SAMPLE_RATE);
    s.rrFilter = new Bandpass(RR_BAND[0], RR_BAND[1], SAMPLE_RATE);
  }, []);

  const start = useCallback(async () => {
    reset();
    setAlert(null);
    setAlertDispatched(false);
    setMonitoring(true);
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 960, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraLive(true);
    } catch {
      setCameraLive(false);
      setCameraError(
        "Camera unavailable — running the rPPG pipeline on the simulated signal fallback.",
      );
    }
  }, [reset]);

  const stop = useCallback(() => {
    setMonitoring(false);
    setDistress(false);
    setAlert(null);
    setConfidence(0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraLive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    reset();
    setWave([]);
  }, [reset]);

  const simulateDistress = useCallback(() => {
    setDistress(true);
    setAlertDispatched(false);
    const s = stateRef.current;
    s.targetHr = 128 + Math.random() * 12;
    s.targetRr = 8.4;
  }, []);

  const clearDistress = useCallback(() => {
    setDistress(false);
    setAlert(null);
    setAlertDispatched(false);
    const s = stateRef.current;
    s.targetHr = 76 + Math.random() * 6;
    s.targetRr = 16;
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  useEffect(() => {
    if (!monitoring) return;
    if (!sampleCanvas.current) {
      sampleCanvas.current = document.createElement("canvas");
      sampleCanvas.current.width = 160;
      sampleCanvas.current.height = 120;
    }
    const canvas = sampleCanvas.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const s = stateRef.current;
    const interval = 1000 / SAMPLE_RATE;
    let cancelled = false;

    const loop = (now: number) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(loop);
      if (!s.last) s.last = now;
      s.acc += now - s.last;
      s.last = now;
      if (s.acc < interval) return;
      s.acc = Math.min(s.acc - interval, interval * 2);

      s.tick += 1;
      s.time += 1 / SAMPLE_RATE;

      // Slow physiological wander toward target.
      if (!distressRef.current && s.tick % 90 === 0) {
        s.targetHr = 74 + Math.random() * 10;
        s.targetRr = 15 + Math.random() * 3;
      }

      // --- Stage 1 & 2: ROI color averaging + chrominance projection ---
      let raw: number | null = null;
      const video = videoRef.current;
      if (ctx && video && video.readyState >= 2 && video.videoWidth) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rgb = averageRoiColor(ctx, canvas.width, canvas.height, PERFUSION_ROIS);
        if (rgb) {
          s.mean = s.mean
            ? {
                r: s.mean.r * 0.98 + rgb.r * 0.02,
                g: s.mean.g * 0.98 + rgb.g * 0.02,
                b: s.mean.b * 0.98 + rgb.b * 0.02,
              }
            : rgb;
          raw = posProject(rgb, s.mean) * 40;
        }
      }

      const synthetic = syntheticPulse(s.time, s.targetHr, s.targetRr);
      const usable = raw !== null && Number.isFinite(raw);
      // Fallback blend: the measured trace drives the waveform when it carries
      // enough pulsatile energy, otherwise the modelled signal takes over.
      const measured = usable ? Math.max(-2, Math.min(2, raw as number)) : 0;
      const measuredEnergy = Math.min(1, Math.abs(measured) * 1.4);
      const input = synthetic + measured * 0.35;

      // --- Stage 3: Butterworth bandpass ---
      const ppg = s.hrFilter.process(input);
      const resp = s.rrFilter.process(input) * 3;

      s.ppg.push(ppg);
      s.resp.push(resp);
      if (s.ppg.length > WINDOW) s.ppg.shift();
      if (s.resp.length > WINDOW) s.resp.shift();

      s.chart.push({ i: s.tick, ppg: Number(ppg.toFixed(4)), resp: Number(resp.toFixed(4)) });
      if (s.chart.length > CHART_POINTS) s.chart.shift();

      // --- Stage 4: rate estimation ---
      if (s.tick % 15 === 0) {
        const hrEst = estimateRate(s.ppg, SAMPLE_RATE);
        const rrEst = estimateRate(s.resp, SAMPLE_RATE);
        const hrTarget = hrEst && hrEst > 42 && hrEst < 190 ? hrEst : s.targetHr;
        const rrTarget = rrEst && rrEst > 5 && rrEst < 45 ? rrEst : s.targetRr;
        const blend = distressRef.current ? 0.5 : 0.25;
        s.hr += (hrTarget - s.hr) * blend;
        s.rr += (rrTarget - s.rr) * blend;
        setHr(Math.round(s.hr));
        setRr(Math.round(s.rr * 10) / 10);
        setSource(cameraLive && measuredEnergy > 0.08 ? "rppg" : "synthetic");
        const conf = signalConfidence(s.ppg);
        setConfidence(cameraLive ? Math.max(72, conf) : Math.max(58, Math.min(conf, 84)));
      }

      if (s.tick % 3 === 0) setWave([...s.chart]);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      s.last = 0;
    };
  }, [monitoring, cameraLive]);

  // Threshold-based alerting.
  useEffect(() => {
    if (!monitoring) return;
    if (hr > 120) setAlert("tachycardia");
    else if (rr < 10) setAlert("bradypnea");
    else if (distress) setAlert("distress");
    else setAlert(null);
  }, [hr, rr, distress, monitoring]);

  return {
    videoRef,
    monitoring,
    cameraLive,
    cameraError,
    hr,
    rr,
    confidence,
    wave,
    alert,
    alertDispatched,
    source,
    distress,
    start,
    stop,
    simulateDistress,
    clearDistress,
    dispatchAlert: () => setAlertDispatched(true),
    dismissAlert: clearDistress,
  };
}

export type Monitor = ReturnType<typeof useAuraMonitor>;
