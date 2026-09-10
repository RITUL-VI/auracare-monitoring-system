import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bandpass,
  ChromExtractor,
  HR_BAND,
  RR_BAND,
  averageRoiColor,
  estimateRate,
  roisFromLandmarks,
  signalConfidence,
  syntheticPulse,
  type Point,
  type Roi,
} from "@/lib/rppg";
import { saveDispatchedAlert } from "@/lib/alerts";

export type WavePoint = { i: number; ppg: number; resp: number };
export type AlertKind = null | "tachycardia" | "bradypnea" | "distress";

const SAMPLE_RATE = 30;
const WINDOW = SAMPLE_RATE * 10;
const CHART_POINTS = 165;

/** Fallback patches used only until MediaPipe reports landmarks. */
const FALLBACK_ROIS: Roi[] = [
  { x: 0.34, y: 0.2, w: 0.32, h: 0.14 },
  { x: 0.24, y: 0.46, w: 0.16, h: 0.14 },
  { x: 0.6, y: 0.46, w: 0.16, h: 0.14 },
];

export function useAuraMonitor() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** MediaPipe Face Mesh landmarks, published by the camera viewport. */
  const landmarksRef = useRef<Point[] | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [distress, setDistress] = useState(false);
  const [hr, setHr] = useState(0);
  const [rr, setRr] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [wave, setWave] = useState<WavePoint[]>([]);
  const [alert, setAlert] = useState<AlertKind>(null);
  const [alertDispatched, setAlertDispatched] = useState(false);
  const [source, setSource] = useState<"rppg" | "synthetic">("synthetic");
  const [tracking, setTracking] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const distressRef = useRef(false);
  const stateRef = useRef({
    hr: 0,
    rr: 0,
    targetHr: 78,
    targetRr: 16,
    tick: 0,
    time: 0,
    last: 0,
    acc: 0,
    liveFrames: 0,
    ppg: [] as number[],
    resp: [] as number[],
    chart: [] as WavePoint[],
    chrom: new ChromExtractor(SAMPLE_RATE * 4),
    hrFilter: new Bandpass(HR_BAND[0], HR_BAND[1], SAMPLE_RATE),
    rrFilter: new Bandpass(RR_BAND[0], RR_BAND[1], SAMPLE_RATE),
  });

  distressRef.current = distress;

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.ppg = [];
    s.resp = [];
    s.chart = [];
    s.tick = 0;
    s.time = 0;
    s.acc = 0;
    s.last = 0;
    s.hr = 0;
    s.rr = 0;
    s.liveFrames = 0;
    s.chrom.reset();
    s.hrFilter = new Bandpass(HR_BAND[0], HR_BAND[1], SAMPLE_RATE);
    s.rrFilter = new Bandpass(RR_BAND[0], RR_BAND[1], SAMPLE_RATE);
    landmarksRef.current = null;
  }, []);

  const start = useCallback(async () => {
    reset();
    setAlert(null);
    setAlertDispatched(false);
    setHr(0);
    setRr(0);
    setTracking(false);
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
    setTracking(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraLive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    reset();
    setWave([]);
    setHr(0);
    setRr(0);
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
      sampleCanvas.current.width = 240;
      sampleCanvas.current.height = 180;
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

      // --- Stage 1: sample the tracked skin regions (real MediaPipe landmarks) ---
      let measured: number | null = null;
      let landmarked = false;
      const video = videoRef.current;
      if (ctx && video && video.readyState >= 2 && video.videoWidth) {
        const lm = landmarksRef.current;
        landmarked = Boolean(lm && lm.length > 100);
        const rois = lm && landmarked ? roisFromLandmarks(lm) : FALLBACK_ROIS;
        if (rois.length) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const rgb = averageRoiColor(ctx, canvas.width, canvas.height, rois);
          if (rgb) {
            // --- Stage 2: CHROM chrominance projection ---
            const v = s.chrom.push(rgb);
            if (v !== null && Number.isFinite(v)) measured = v * 90;
          }
        }
      }

      const live = measured !== null && landmarked;
      s.liveFrames = live ? Math.min(SAMPLE_RATE * 12, s.liveFrames + 1) : Math.max(0, s.liveFrames - 3);
      const locked = s.liveFrames > SAMPLE_RATE * 2;

      // Real trace when the face is tracked; modelled signal only as fallback.
      if (!live && !distressRef.current && s.tick % 90 === 0) {
        s.targetHr = 74 + Math.random() * 10;
        s.targetRr = 15 + Math.random() * 3;
      }
      const input = live
        ? Math.max(-8, Math.min(8, measured as number))
        : syntheticPulse(s.time, s.targetHr, s.targetRr);

      // --- Stage 3: 4th-order Butterworth bandpass ---
      const ppg = s.hrFilter.process(input);
      const resp = s.rrFilter.process(input) * 3;

      s.ppg.push(ppg);
      s.resp.push(resp);
      if (s.ppg.length > WINDOW) s.ppg.shift();
      if (s.resp.length > WINDOW) s.resp.shift();

      const scale = live ? 1 / (peakAbs(s.ppg) || 1) : 1;
      s.chart.push({
        i: s.tick,
        ppg: Number((ppg * scale).toFixed(4)),
        resp: Number((resp * (live ? scale * 0.8 : 1)).toFixed(4)),
      });
      if (s.chart.length > CHART_POINTS) s.chart.shift();

      // --- Stage 4: rate estimation from the measured waveform ---
      if (s.tick % 15 === 0) {
        const hrEst = estimateRate(s.ppg, SAMPLE_RATE);
        const rrEst = estimateRate(s.resp, SAMPLE_RATE);
        const hrValid = hrEst !== null && hrEst > 42 && hrEst < 190;
        const rrValid = rrEst !== null && rrEst > 5 && rrEst < 45;

        if (distressRef.current) {
          // Operator-triggered drill: drive the reading to the distress signature.
          s.hr += (s.targetHr - s.hr) * 0.5;
          s.rr += (s.targetRr - s.rr) * 0.5;
        } else if (live && locked) {
          if (hrValid) s.hr = s.hr ? s.hr + (hrEst! - s.hr) * 0.3 : hrEst!;
          if (rrValid) s.rr = s.rr ? s.rr + (rrEst! - s.rr) * 0.3 : rrEst!;
        } else if (!live) {
          s.hr += ((hrValid ? hrEst! : s.targetHr) - s.hr) * 0.25;
          s.rr += ((rrValid ? rrEst! : s.targetRr) - s.rr) * 0.25;
        }

        setHr(Math.round(s.hr));
        setRr(Math.round(s.rr * 10) / 10);
        setSource(live && locked ? "rppg" : "synthetic");
        setTracking(landmarked);
        const conf = signalConfidence(s.ppg);
        setConfidence(live && locked ? conf : Math.min(conf, 70));
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
  }, [monitoring]);

  // Threshold-based alerting.
  useEffect(() => {
    if (!monitoring) return;
    if (hr > 120) setAlert("tachycardia");
    else if (rr > 0 && rr < 10) setAlert("bradypnea");
    else if (distress) setAlert("distress");
    else setAlert(null);
  }, [hr, rr, distress, monitoring]);

  const dispatchAlert = useCallback(
    async (bed: string) => {
      setAlertDispatched(true);
      if (!alert) return;
      await saveDispatchedAlert({
        bed,
        kind: alert,
        hr,
        rr,
        confidence,
      });
    },
    [alert, hr, rr, confidence],
  );

  return {
    videoRef,
    landmarksRef,
    monitoring,
    cameraLive,
    cameraError,
    tracking,
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
    dispatchAlert,
    dismissAlert: clearDistress,
  };
}

function peakAbs(xs: number[]): number {
  let max = 0;
  for (let i = Math.max(0, xs.length - 90); i < xs.length; i++) {
    const v = Math.abs(xs[i]!);
    if (v > max) max = v;
  }
  return max;
}

export type Monitor = ReturnType<typeof useAuraMonitor>;
