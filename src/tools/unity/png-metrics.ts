/**
 * What a captured frame shows, measured from its pixels.
 *
 * The play-mode harness used to describe frames by file size and a byte hash:
 * true facts, but blind to what was drawn — a title screen and a dead render
 * hash the same way when both hold still. These metrics decode the PNG (8-bit
 * or 16-bit, non-interlaced; no image library, only node:zlib) and sample a
 * grid, so a verdict can say "this frame is one flat colour" or "nothing moved
 * between these two frames" from evidence rather than from inference.
 */
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Decode budget: a 1280×720 frame is 0.9 M pixels; 4 M keeps 4K out of memory. */
export const PNG_DECODE_MAX_PIXELS = 4_194_304;
/** Sampling grid per axis: 64×64 samples describe a frame well enough to judge flatness and motion. */
const GRID = 64;
/** Quantization for the colour count: 4 bits per channel, so dithering does not read as variety. */
const QUANT_SHIFT = 4;
/** A sample counts as moved when any channel differs by more than this (0–255). */
const MOTION_THRESHOLD = 24;
/** Fewer distinct quantized colours than this on the sample grid is a flat frame. */
export const FLAT_FRAME_MAX_COLOURS = 3;

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface FrameMetrics {
  readonly width: number;
  readonly height: number;
  /** Distinct colours on the sample grid after 4-bit quantization. */
  readonly colours: number;
  /** Mean luma of the samples, 0–255. */
  readonly meanLuma: number;
  /** True when the frame is (near) one colour: nothing, or nothing visible, was drawn. */
  readonly flat: boolean;
}

export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 33) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== 'IHDR') return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Decode an 8-bit or 16-bit non-interlaced PNG (grey, RGB, palette, grey+alpha,
 * RGBA) to RGBA. Null for anything else or anything over the decode budget —
 * an unreadable frame is reported as unreadable, never as flat.
 */
export function decodePngRgba(bytes: Uint8Array): DecodedPng | null {
  const dims = readPngDimensions(bytes);
  if (dims === null || dims.width * dims.height > PNG_DECODE_MAX_PIXELS) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bitDepth = bytes[24]!;
  const colorType = bytes[25]!;
  const interlace = bytes[28]!;
  if (interlace !== 0 || (bitDepth !== 8 && bitDepth !== 16)) return null;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number | undefined>)[
    colorType
  ];
  if (channels === undefined) return null;
  const idat: Buffer[] = [];
  let palette: Uint8Array | undefined;
  let trns: Uint8Array | undefined;
  let at = 8;
  while (at + 8 <= bytes.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(
      bytes[at + 4]!,
      bytes[at + 5]!,
      bytes[at + 6]!,
      bytes[at + 7]!,
    );
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  let raw: Uint8Array;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const bytesPerSample = bitDepth / 8;
  const bpp = channels * bytesPerSample;
  const stride = dims.width * bpp;
  if (raw.length < (stride + 1) * dims.height) return null;
  const rgba = new Uint8Array(dims.width * dims.height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let inAt = 0;
  for (let y = 0; y < dims.height; y++) {
    const filter = raw[inAt++]!;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      let v = raw[inAt + x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    inAt += stride;
    for (let px = 0; px < dims.width; px++) {
      const o = (y * dims.width + px) * 4;
      const i = px * bpp;
      const sample = (k: number): number => cur[i + k * bytesPerSample]!;
      if (colorType === 6) {
        rgba[o] = sample(0);
        rgba[o + 1] = sample(1);
        rgba[o + 2] = sample(2);
        rgba[o + 3] = sample(3);
      } else if (colorType === 2) {
        rgba[o] = sample(0);
        rgba[o + 1] = sample(1);
        rgba[o + 2] = sample(2);
        rgba[o + 3] = 255;
      } else if (colorType === 0) {
        const g = sample(0);
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = 255;
      } else if (colorType === 4) {
        const g = sample(0);
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = sample(1);
      } else {
        const idx = cur[i]!;
        rgba[o] = palette?.[idx * 3] ?? 0;
        rgba[o + 1] = palette?.[idx * 3 + 1] ?? 0;
        rgba[o + 2] = palette?.[idx * 3 + 2] ?? 0;
        rgba[o + 3] = trns !== undefined && idx < trns.length ? trns[idx]! : 255;
      }
    }
    prev.set(cur);
  }
  return { width: dims.width, height: dims.height, rgba };
}

function sampleAt(png: DecodedPng, gx: number, gy: number): [number, number, number] {
  const x = Math.min(png.width - 1, Math.floor(((gx + 0.5) * png.width) / GRID));
  const y = Math.min(png.height - 1, Math.floor(((gy + 0.5) * png.height) / GRID));
  const o = (y * png.width + x) * 4;
  return [png.rgba[o]!, png.rgba[o + 1]!, png.rgba[o + 2]!];
}

export function frameMetrics(png: DecodedPng): FrameMetrics {
  const colours = new Set<number>();
  let luma = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const [r, g, b] = sampleAt(png, gx, gy);
      colours.add(((r >> QUANT_SHIFT) << 8) | ((g >> QUANT_SHIFT) << 4) | (b >> QUANT_SHIFT));
      luma += 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  return {
    width: png.width,
    height: png.height,
    colours: colours.size,
    meanLuma: Math.round(luma / (GRID * GRID)),
    flat: colours.size <= FLAT_FRAME_MAX_COLOURS,
  };
}

/**
 * Share of grid samples (0–1) that changed between two frames of the same size.
 * Frames of different sizes are incomparable and answer null.
 */
export function motionShare(a: DecodedPng, b: DecodedPng): number | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  let moved = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const p = sampleAt(a, gx, gy);
      const q = sampleAt(b, gx, gy);
      if (
        Math.abs(p[0] - q[0]) > MOTION_THRESHOLD ||
        Math.abs(p[1] - q[1]) > MOTION_THRESHOLD ||
        Math.abs(p[2] - q[2]) > MOTION_THRESHOLD
      ) {
        moved++;
      }
    }
  }
  return moved / (GRID * GRID);
}
