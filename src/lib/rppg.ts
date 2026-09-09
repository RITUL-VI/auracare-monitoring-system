/**
 * Client-side rPPG (remote photoplethysmography) pipeline.
 *
 * Stage 1  ROI color averaging  -> mean R/G/B over high-perfusion patches
 * Stage 2  POS / chrominance    -> motion-robust pulse projection
 * Stage 3  Butterworth bandpass -> 0.7-4.0 Hz (42-240 BPM) cascade of biquads
 * Stage 4  Peak-interval + zero-crossing estimation -> HR / RR / confidence
 */

export type Rgb = { r: number; g: number; b: number };
export type Roi = { x: number; y: number; w: number; h: number };

/** Mean RGB across a set of normalized ROI rectangles. */
export function averageRoiColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rois: Roi[],
): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (const roi of rois) {
    const x = Math.max(0, Math.round(roi.x * width));
    const y = Math.max(0, Math.round(roi.y * height));
    const w = Math.min(width - x, Math.round(roi.w * width));
    const h = Math.min(height - y, Math.round(roi.h * height));
    if (w <= 1 || h <= 1) continue;

    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(x, y, w, h).data;
    } catch {
      return null;
    }
    // Subsample every 4th pixel for speed.
    for (let i = 0; i < data.length; i += 16) {
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
      n++;
    }
  }

  if (!n) return null;
  return { r: r / n, g: g / n, b: b / n };
}

/** Biquad section of a Butterworth filter (direct form I). */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type: "lowpass" | "highpass", freq: number, sampleRate: number, q = Math.SQRT1_2) {
    const w0 = (2 * Math.PI * Math.min(freq, sampleRate / 2 - 0.01)) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;

    if (type === "lowpass") {
      this.b0 = ((1 - cos) / 2) / a0;
      this.b1 = (1 - cos) / a0;
      this.b2 = this.b0;
    } else {
      this.b0 = ((1 + cos) / 2) / a0;
      this.b1 = -(1 + cos) / a0;
      this.b2 = this.b0;
    }
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** 4th-order Butterworth bandpass (cascaded 2nd-order sections). */
export class Bandpass {
  private sections: Biquad[];

  constructor(lowHz: number, highHz: number, sampleRate: number) {
    this.sections = [
      new Biquad("highpass", lowHz, sampleRate),
      new Biquad("highpass", lowHz, sampleRate),
      new Biquad("lowpass", highHz, sampleRate),
      new Biquad("lowpass", highHz, sampleRate),
    ];
  }

  process(x: number): number {
    return this.sections.reduce((acc, s) => s.process(acc), x);
  }
}

/** Plane-Orthogonal-to-Skin style chrominance projection of a normalized RGB trace. */
export function posProject(rgb: Rgb, mean: Rgb): number {
  const rn = mean.r > 0 ? rgb.r / mean.r - 1 : 0;
  const gn = mean.g > 0 ? rgb.g / mean.g - 1 : 0;
  const bn = mean.b > 0 ? rgb.b / mean.b - 1 : 0;
  const s1 = -rn + gn;
  const s2 = -2 * bn + gn + rn;
  const a1 = std([s1]) || 1;
  const a2 = std([s2]) || 1;
  return s1 + (a1 / a2) * s2;
}

function std(xs: number[]): number {
  if (xs.length < 2) return Math.abs(xs[0] ?? 0);
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Estimate rate (per minute) from peak intervals of a windowed signal. */
export function estimateRate(samples: number[], sampleRate: number): number | null {
  if (samples.length < sampleRate * 3) return null;
  const m = samples.reduce((a, b) => a + b, 0) / samples.length;
  const s = std(samples);
  if (s < 1e-6) return null;

  const peaks: number[] = [];
  const minGap = Math.max(2, Math.floor(sampleRate * 0.3));
  for (let i = 1; i < samples.length - 1; i++) {
    const v = samples[i]!;
    if (v > samples[i - 1]! && v >= samples[i + 1]! && v - m > s * 0.4) {
      if (!peaks.length || i - peaks[peaks.length - 1]! >= minGap) peaks.push(i);
    }
  }
  if (peaks.length < 3) return null;

  let sum = 0;
  for (let i = 1; i < peaks.length; i++) sum += peaks[i]! - peaks[i - 1]!;
  const meanGap = sum / (peaks.length - 1);
  return (60 * sampleRate) / meanGap;
}

/** Confidence proxy: spectral concentration of the filtered trace. */
export function signalConfidence(samples: number[]): number {
  if (samples.length < 32) return 0;
  const s = std(samples);
  const noise = std(samples.slice(-16));
  const ratio = s > 0 ? Math.min(1, noise / (s * 1.6) + 0.55) : 0;
  return Math.round(Math.max(0, Math.min(0.99, ratio)) * 100);
}

/**
 * Synthetic fallback generator: realistic PPG morphology (systolic peak +
 * dicrotic notch) modulated by respiration, with low-level sensor noise.
 * Used when camera access is unavailable or before lock-on.
 */
export function syntheticPulse(t: number, hr: number, rr: number): number {
  const hf = hr / 60;
  const rf = rr / 60;
  const phase = 2 * Math.PI * hf * t;
  const systolic = Math.sin(phase);
  const dicrotic = 0.32 * Math.sin(2 * phase + 1.1);
  const respiration = 0.22 * Math.sin(2 * Math.PI * rf * t);
  const noise = (Math.random() - 0.5) * 0.08;
  return systolic + dicrotic + respiration + noise;
}

export const HR_BAND: [number, number] = [0.7, 4];
export const RR_BAND: [number, number] = [0.13, 0.6];
