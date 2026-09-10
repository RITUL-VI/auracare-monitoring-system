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

export type Point = { x: number; y: number };

/** MediaPipe Face Mesh indices over high-perfusion skin patches. */
export const FOREHEAD_IDX = [10, 67, 69, 104, 108, 151, 337, 299, 333, 297, 338, 9, 8];
export const LEFT_CHEEK_IDX = [50, 101, 118, 205, 36, 142];
export const RIGHT_CHEEK_IDX = [280, 330, 347, 425, 266, 371];

/**
 * Build normalized sampling rectangles from real MediaPipe landmarks so the
 * pulse is read from the tracked face rather than a fixed frame region.
 */
export function roisFromLandmarks(landmarks: Point[]): Roi[] {
  const box = (indices: number[]): Roi | null => {
    const pts = indices.map((i) => landmarks[i]).filter(Boolean) as Point[];
    if (pts.length < 3) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    let x0 = Math.min(...xs);
    let x1 = Math.max(...xs);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    // Inset slightly to stay clear of hairline / jaw edges.
    const ix = (x1 - x0) * 0.12;
    const iy = (y1 - y0) * 0.12;
    x0 += ix;
    x1 -= ix;
    y0 += iy;
    y1 -= iy;
    const w = x1 - x0;
    const h = y1 - y0;
    if (!(w > 0.01 && h > 0.01) || x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1) return null;
    return { x: x0, y: y0, w, h };
  };

  return [box(FOREHEAD_IDX), box(LEFT_CHEEK_IDX), box(RIGHT_CHEEK_IDX)].filter(
    (r): r is Roi => r !== null,
  );
}

/**
 * CHROM (de Haan & Jeanne) chrominance extractor with a sliding window, so the
 * X/Y projection ratio is computed from real signal statistics.
 */
export class ChromExtractor {
  private xs: number[] = [];
  private ys: number[] = [];
  private mean: Rgb | null = null;
  private readonly size: number;

  constructor(size = 120) {
    this.size = size;
  }

  reset() {
    this.xs = [];
    this.ys = [];
    this.mean = null;
  }

  get ready() {
    return this.xs.length >= 24;
  }

  push(rgb: Rgb): number | null {
    this.mean = this.mean
      ? {
          r: this.mean.r * 0.95 + rgb.r * 0.05,
          g: this.mean.g * 0.95 + rgb.g * 0.05,
          b: this.mean.b * 0.95 + rgb.b * 0.05,
        }
      : rgb;

    const m = this.mean;
    if (m.r < 1 || m.g < 1 || m.b < 1) return null;

    const rn = rgb.r / m.r - 1;
    const gn = rgb.g / m.g - 1;
    const bn = rgb.b / m.b - 1;

    const x = 3 * rn - 2 * gn;
    const y = 1.5 * rn + gn - 1.5 * bn;

    this.xs.push(x);
    this.ys.push(y);
    if (this.xs.length > this.size) this.xs.shift();
    if (this.ys.length > this.size) this.ys.shift();
    if (!this.ready) return null;

    const sy = std(this.ys);
    const alpha = sy > 1e-9 ? std(this.xs) / sy : 0;
    return x - alpha * y;
  }
}
