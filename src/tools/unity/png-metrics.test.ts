import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { decodePngRgba, frameMetrics, motionShare, readPngDimensions } from './png-metrics.js';

/** A minimal RGB PNG encoder for fixtures: filter 0 on every row, one IDAT. */
export function encodeRgbPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc = (buf: Buffer): number => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

describe('frame metrics measured from pixels', () => {
  it('a one-colour frame is flat; a drawn frame is not', () => {
    const flat = decodePngRgba(encodeRgbPng(160, 90, () => [30, 30, 30]))!;
    const drawn = decodePngRgba(
      encodeRgbPng(160, 90, (x, y) => [(x * 7) & 255, (y * 11) & 255, ((x ^ y) * 3) & 255]),
    )!;
    expect(readPngDimensions(encodeRgbPng(160, 90, () => [0, 0, 0]))).toEqual({
      width: 160,
      height: 90,
    });
    expect(frameMetrics(flat)).toMatchObject({ colours: 1, meanLuma: 30, flat: true });
    const m = frameMetrics(drawn);
    expect(m.flat).toBe(false);
    expect(m.colours).toBeGreaterThan(50);
  });

  it('motion is the share of samples that changed between two frames', () => {
    const a = decodePngRgba(encodeRgbPng(160, 90, () => [10, 10, 10]))!;
    const half = decodePngRgba(
      encodeRgbPng(160, 90, (x) => (x < 80 ? [10, 10, 10] : [200, 200, 200])),
    )!;
    expect(motionShare(a, a)).toBe(0);
    const moved = motionShare(a, half)!;
    expect(moved).toBeGreaterThan(0.45);
    expect(moved).toBeLessThan(0.55);
    const small = decodePngRgba(encodeRgbPng(16, 9, () => [0, 0, 0]))!;
    expect(motionShare(a, small)).toBeNull();
  });

  it('a change below the threshold is not motion', () => {
    const a = decodePngRgba(encodeRgbPng(64, 64, () => [100, 100, 100]))!;
    const b = decodePngRgba(encodeRgbPng(64, 64, () => [110, 110, 110]))!;
    expect(motionShare(a, b)).toBe(0);
  });

  it('refuses what it cannot decode instead of calling it flat', () => {
    expect(decodePngRgba(new Uint8Array([1, 2, 3]))).toBeNull();
    const png = encodeRgbPng(8, 8, () => [1, 2, 3]);
    png[28] = 1; // interlaced
    expect(decodePngRgba(png)).toBeNull();
  });
});
