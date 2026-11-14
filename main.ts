// news-image-01 — "THE WORLD TODAY": one image summing up the world's news
// of Friday 13 November 2026, drawn programmatically (no image model, no network,
// no shipped pixels). Pure Node 22 standard library: a tiny software rasterizer,
// a stroke font designed for this poster, and a minimal PNG encoder.
//
// Run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program is deterministic: two runs write byte-identical files.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------- PNG output
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// RGB, filter None per scanline; flat editorial art deflates very well.
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ canvas
export type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Canvas {
  w: number;
  h: number;
  data: Uint8Array;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 3] = bg[0];
      this.data[i * 3 + 1] = bg[1];
      this.data[i * 3 + 2] = bg[2];
    }
  }
  set(x: number, y: number, c: RGB): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const o = (iy * this.w + ix) * 3;
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
  }
  // alpha-blended pixel, a in 0..1
  blend(x: number, y: number, c: RGB, a: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h || a <= 0) return;
    if (a >= 1) return this.set(ix, iy, c);
    const o = (iy * this.w + ix) * 3;
    this.data[o] = Math.round(this.data[o] * (1 - a) + c[0] * a);
    this.data[o + 1] = Math.round(this.data[o + 1] * (1 - a) + c[1] * a);
    this.data[o + 2] = Math.round(this.data[o + 2] * (1 - a) + c[2] * a);
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.w;
      for (let xx = x0; xx < x1; xx++) {
        const o = (row + xx) * 3;
        this.data[o] = c[0];
        this.data[o + 1] = c[1];
        this.data[o + 2] = c[2];
      }
    }
  }
  // vertical gradient rectangle
  vgrad(x: number, y: number, w: number, h: number, top: RGB, bot: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      const t = h <= 1 ? 0 : (yy - y) / h;
      const r = Math.round(top[0] + (bot[0] - top[0]) * t);
      const g = Math.round(top[1] + (bot[1] - top[1]) * t);
      const b = Math.round(top[2] + (bot[2] - top[2]) * t);
      const row = yy * this.w;
      for (let xx = x0; xx < x1; xx++) {
        const o = (row + xx) * 3;
        this.data[o] = r;
        this.data[o + 1] = g;
        this.data[o + 2] = b;
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c);
      }
    }
  }
  ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(cx - r - t));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r + t));
    const y0 = Math.max(0, Math.floor(cy - r - t));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r + t));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (Math.abs(d - r) <= t / 2) this.set(x, y, c);
      }
    }
  }
  // thick line with round caps
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len));
    const r = w / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + dx * t, y0 + dy * t, r, c);
    }
  }
  poly(points: Array<[number, number]>, c: RGB): void {
    // scanline fill, even-odd
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k]));
        const xb = Math.min(this.w - 1, Math.floor(xs[k + 1]));
        for (let x = xa; x <= xb; x++) this.set(x, y, c);
      }
    }
  }
  // ellipse fill (axis-aligned)
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }
  // rounded-rectangle fill
  rrect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
    this.fillRect(x + r, y, w - 2 * r, h, c);
    this.fillRect(x, y + r, w, h - 2 * r, c);
    this.disc(x + r, y + r, r, c);
    this.disc(x + w - r, y + r, r, c);
    this.disc(x + r, y + h - r, r, c);
    this.disc(x + w - r, y + h - r, r, c);
  }
}

// ------------------------------------------------------- stroke font (6x10)
// One-case headline font, drawn as polylines on a 6-wide, 10-tall grid
// (x 0..5, y 0..9, y = 0 at the cap top). A stroke is a list of [x, y] points;
// a stroke with a single point renders as a dot. Designed for this poster:
// every label it prints is spelled exactly, never garbled.
type Stroke = Array<[number, number]>;
const FONT: Record<string, Stroke[]> = {
  A: [[[0, 9], [2.5, 0], [5, 9]], [[1.2, 6], [3.8, 6]]],
  B: [[[0, 9], [0, 0], [3.5, 0], [4.8, 1.5], [4.8, 3.2], [3.5, 4.5], [0, 4.5]], [[3.5, 4.5], [4.8, 6], [4.8, 7.5], [3.5, 9], [0, 9]]],
  C: [[[4.8, 1.8], [3.5, 0], [1.5, 0], [0, 1.5], [0, 7.5], [1.5, 9], [3.5, 9], [4.8, 7.2]]],
  D: [[[0, 0], [0, 9], [2.5, 9], [4.8, 7], [4.8, 2], [2.5, 0], [0, 0]]],
  E: [[[5, 0], [0, 0], [0, 9], [5, 9]], [[0, 4.5], [3.5, 4.5]]],
  F: [[[0, 9], [0, 0], [5, 0]], [[0, 4.5], [3.5, 4.5]]],
  G: [[[4.8, 1.8], [3.5, 0], [1.5, 0], [0, 1.5], [0, 7.5], [1.5, 9], [3.5, 9], [4.8, 7.2], [4.8, 4.5], [2.5, 4.5]]],
  H: [[[0, 0], [0, 9]], [[5, 0], [5, 9]], [[0, 4.5], [5, 4.5]]],
  I: [[[2.5, 0], [2.5, 9]], [[0.5, 0], [4.5, 0]], [[0.5, 9], [4.5, 9]]],
  J: [[[5, 0], [5, 7], [3.5, 9], [1.5, 9], [0, 7]]],
  K: [[[0, 0], [0, 9]], [[4.8, 0], [0, 4.5], [4.8, 9]]],
  L: [[[0, 0], [0, 9], [5, 9]]],
  M: [[[0, 9], [0, 0], [2.5, 4.5], [5, 0], [5, 9]]],
  N: [[[0, 9], [0, 0], [5, 9], [5, 0]]],
  O: [[[1.5, 0], [3.5, 0], [5, 1.5], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.5], [0, 1.5], [1.5, 0]]],
  P: [[[0, 9], [0, 0], [3.5, 0], [5, 1.5], [5, 3.2], [3.5, 4.5], [0, 4.5]]],
  Q: [[[1.5, 0], [3.5, 0], [5, 1.5], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.5], [0, 1.5], [1.5, 0]], [[3, 6], [5, 9]]],
  R: [[[0, 9], [0, 0], [3.5, 0], [5, 1.5], [5, 3.2], [3.5, 4.5], [0, 4.5]], [[3.5, 4.5], [5, 9]]],
  S: [[[4.8, 1.8], [3.5, 0], [1.5, 0], [0, 1.5], [0, 3.2], [1.5, 4.5], [3.5, 4.5], [5, 6], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.2]]],
  T: [[[0, 0], [5, 0]], [[2.5, 0], [2.5, 9]]],
  U: [[[0, 0], [0, 7.5], [1.5, 9], [3.5, 9], [5, 7.5], [5, 0]]],
  V: [[[0, 0], [2.5, 9], [5, 0]]],
  W: [[[0, 0], [1.2, 9], [2.5, 4.5], [3.8, 9], [5, 0]]],
  X: [[[0, 0], [5, 9]], [[5, 0], [0, 9]]],
  Y: [[[0, 0], [2.5, 4.5], [5, 0]], [[2.5, 4.5], [2.5, 9]]],
  Z: [[[0, 0], [5, 0], [0, 9], [5, 9]]],
  '0': [[[1.5, 0], [3.5, 0], [5, 1.5], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.5], [0, 1.5], [1.5, 0]], [[1.5, 1.5], [3.5, 7.5]]],
  '1': [[[1.5, 1.5], [2.5, 0], [2.5, 9]], [[0.5, 9], [4.5, 9]]],
  '2': [[[0, 1.8], [1.5, 0], [3.5, 0], [5, 1.5], [5, 3.5], [0, 9], [5, 9]]],
  '3': [[[0.5, 1.5], [2, 0], [3.8, 0], [5, 1.8], [5, 3.8], [3.8, 4.5], [5, 5.2], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.5]]],
  '4': [[[0, 6.5], [3.5, 0], [3.5, 9]], [[0, 6.5], [5, 6.5]]],
  '5': [[[5, 0], [0, 0], [0, 4.5], [3.5, 4.5], [5, 6], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.2]]],
  '6': [[[4.8, 1.5], [3.5, 0], [1.5, 0], [0, 1.5], [0, 7.5], [1.5, 9], [3.5, 9], [5, 7.5], [5, 6], [3.5, 4.5], [1.5, 4.5], [0, 6]]],
  '7': [[[0, 0], [5, 0], [2, 9]]],
  '8': [[[1.5, 0], [3.5, 0], [5, 1.5], [5, 3.2], [3.5, 4.5], [1.5, 4.5], [0, 3.2], [0, 1.5], [1.5, 0]], [[1.5, 4.5], [3.5, 4.5], [5, 6], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.5], [0, 6], [1.5, 4.5]]],
  '9': [[[5, 7.5], [5, 1.5], [3.5, 0], [1.5, 0], [0, 1.5], [0, 3.2], [1.5, 4.5], [3.5, 4.5], [5, 3.2]], [[5, 3.2], [5, 7.5], [3.5, 9], [1.5, 9], [0, 7.5]]],
  '&': [[[4.5, 8.5], [3.5, 9], [1.5, 9], [0.5, 7.5], [0.5, 6], [2, 4.5], [4.5, 1.5], [4.5, 0.8], [3.5, 0], [2, 0.8], [1, 2.5], [2.5, 4.5], [5, 9]]],
  ':': [[[2.5, 2.2]], [[2.5, 6.8]]],
  '.': [[[2.5, 8.2]]],
  ',': [[[2.5, 7.6]], [[2.8, 8], [1.6, 9.6]]],
  "'": [[[2.8, 0], [2.2, 2.2]]],
  '-': [[[0.5, 4.5], [4.5, 4.5]]],
  '/': [[[1, 9], [4, 0]]],
  '%': [[[1.2, 2]], [[3.8, 7]], [[1, 8.5], [4, 0.5]]],
  '$': [[[4.5, 1.8], [3.5, 0.3], [1.5, 0.3], [0.5, 1.8], [0.5, 3.4], [1.5, 4.5], [3.5, 4.5], [4.5, 5.8], [4.5, 7.4], [3.5, 8.8], [1.5, 8.8], [0.5, 7.2]], [[2.5, -0.6], [2.5, 9.6]]],
  '(': [[[4, 0], [2, 2], [2, 7], [4, 9]]],
  ')': [[[1, 0], [3, 2], [3, 7], [1, 9]]],
  '!': [[[2.5, 0], [2.5, 6.2]], [[2.5, 8.2]]],
  '?': [[[1, 1.2], [2.5, 0], [4, 1], [4, 3], [2.5, 4.5], [2.5, 6]], [[2.5, 8.2]]],
  '+': [[[0.5, 4.5], [4.5, 4.5]], [[2.5, 2], [2.5, 7]]],
  '=': [[[0.5, 3.2], [4.5, 3.2]], [[0.5, 6], [4.5, 6]]],
  '\u2022': [[[2.5, 4.5]]],
};

const ADV = 6.4; // advance width in grid units
const SPACE_ADV = 3.2;

function textWidth(s: string, scale: number): number {
  let w = 0;
  for (const ch of s) {
    w += ch === ' ' ? SPACE_ADV : ADV;
  }
  return w * scale - (s.length > 0 ? (ADV - 6) * scale * 0 : 0);
}

// Draw one glyph with its origin at (ox, oy) = top-left of the cap box.
function drawGlyph(c: Canvas, ch: string, ox: number, oy: number, scale: number, col: RGB, weight: number): void {
  const strokes = FONT[ch];
  if (!strokes) return;
  const w = Math.max(1, weight * scale);
  for (const st of strokes) {
    if (st.length === 1) {
      c.disc(ox + st[0][0] * scale, oy + st[0][1] * scale, Math.max(w * 0.62, scale * 0.55), col);
      continue;
    }
    for (let i = 0; i + 1 < st.length; i++) {
      c.line(
        ox + st[i][0] * scale, oy + st[i][1] * scale,
        ox + st[i + 1][0] * scale, oy + st[i + 1][1] * scale,
        w, col,
      );
    }
  }
}

// align: 'left' | 'center' | 'right'; x is the anchor, y is the cap-top.
function drawText(c: Canvas, s: string, x: number, y: number, scale: number, col: RGB, align: 'left' | 'center' | 'right' = 'left', weight = 1.15): void {
  const w = textWidth(s, scale);
  let ox = x;
  if (align === 'center') ox = x - w / 2;
  if (align === 'right') ox = x - w;
  for (const ch of s) {
    if (ch !== ' ') drawGlyph(c, ch, ox, y, scale, col, weight);
    ox += (ch === ' ' ? SPACE_ADV : ADV) * scale;
  }
}

// Word-wrap to lines that fit maxW (in px) at the given scale.
function wrapText(s: string, scale: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur === '' ? word : cur + ' ' + word;
    if (textWidth(test, scale) <= maxW || cur === '') cur = test;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ palette
const NAVY_TOP = hex('#0D1330');
const NAVY_BOT = hex('#1B2452');
const NAVY_BAND = hex('#090E26');
const GOLD = hex('#D9A441');
const GOLD_LT = hex('#EBCB7A');
const PAPER = hex('#F8F3E6');
const PAPER_EDGE = hex('#D8CDB2');
const INK = hex('#14213D');
const RED = hex('#B3271E');
const DECK = hex('#5C5A50');
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [10, 10, 12];

// Small helpers shared by the scenes --------------------------------------
function sky(c: Canvas, x: number, y: number, w: number, h: number, top: RGB, bot: RGB): void {
  c.vgrad(x, y, w, h, top, bot);
}

function usFlag(c: Canvas, x: number, y: number, w: number, h: number): void {
  // 13 stripes, blue canton with a dot field standing in for the stars
  const sh = h / 13;
  for (let i = 0; i < 13; i++) c.fillRect(x, y + i * sh, w, sh + 0.6, i % 2 === 0 ? hex('#B22234') : WHITE);
  const cw = w * 0.42;
  const chh = sh * 7;
  c.fillRect(x, y, cw, chh, hex('#3C3B6E'));
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 5; col++) {
      c.disc(x + 3 + col * (cw - 5) / 4, y + 3 + r * (chh - 5) / 3, 1.1, WHITE);
    }
  }
}

function uaFlag(c: Canvas, x: number, y: number, w: number, h: number): void {
  c.fillRect(x, y, w, h / 2, hex('#0057B7'));
  c.fillRect(x, y + h / 2, w, h / 2, hex('#FFD700'));
}

function euFlag(c: Canvas, x: number, y: number, w: number, h: number): void {
  c.fillRect(x, y, w, h, hex('#003399'));
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.32;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    c.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(1.2, h * 0.045), hex('#FFCC00'));
  }
}

// A seated/standing person: head + torso, in flat colours.
function person(c: Canvas, cx: number, yTop: number, scale: number, skin: RGB, shirt: RGB, hair: RGB): void {
  c.disc(cx, yTop + 7 * scale, 6.5 * scale, skin);
  c.disc(cx, yTop + 3.5 * scale, 6.5 * scale, hair); // hair cap
  c.fillRect(cx - 6.5 * scale, yTop + 3.5 * scale, 13 * scale, 3.5 * scale, skin);
  c.poly([[cx - 11 * scale, yTop + 34 * scale], [cx - 8 * scale, yTop + 14 * scale], [cx + 8 * scale, yTop + 14 * scale], [cx + 11 * scale, yTop + 34 * scale]], shirt);
}

// Side-view aeroplane silhouette, nose to the right.
function plane(c: Canvas, x: number, y: number, s: number, col: RGB): void {
  c.ellipse(x + 34 * s, y, 34 * s, 7 * s, col);
  c.poly([[x + 8 * s, y - 6 * s], [x + 20 * s, y - 26 * s], [x + 26 * s, y - 26 * s], [x + 22 * s, y - 4 * s]], col);
  c.poly([[x + 22 * s, y + 2 * s], [x + 40 * s, y + 14 * s], [x + 44 * s, y + 14 * s], [x + 34 * s, y + 2 * s]], col);
  c.poly([[x + 58 * s, y - 4 * s], [x + 66 * s, y - 16 * s], [x + 70 * s, y - 16 * s], [x + 68 * s, y - 2 * s]], col);
  c.disc(x + 62 * s, y - 2 * s, 2.2 * s, hex('#9FB6D8'));
}

// ------------------------------------------------------------------- scenes
// Every scene draws inside (x, y, w, h). Scenes are flat editorial art:
// a few bold shapes, one idea each, so the story reads at a glance.

function sceneSenate(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h, hex('#2E3A55'), hex('#4A3A2E'));
  usFlag(c, x + 14, y + 14, 52, 30);
  // wood panelling
  c.fillRect(x, y + h - 66, w, 66, hex('#5C3A22'));
  c.fillRect(x, y + h - 66, w, 5, hex('#7A4E2E'));
  // hearing desk
  c.fillRect(x + 18, y + h - 96, w - 36, 34, hex('#6E4526'));
  c.fillRect(x + 18, y + h - 96, w - 36, 5, hex('#8A5A30'));
  // two empty witness chairs
  for (const cx of [x + w * 0.32, x + w * 0.68]) {
    c.fillRect(cx - 26, y + h - 158, 52, 62, hex('#2E2118'));
    c.fillRect(cx - 26, y + h - 158, 52, 8, hex('#C8A15A'));
    c.fillRect(cx - 22, y + h - 96, 44, 8, hex('#3A2A1C'));
  }
  // microphones + nameplates on the desk
  for (const cx of [x + w * 0.32, x + w * 0.68]) {
    c.line(cx, y + h - 96, cx + 8, y + h - 116, 3, BLACK);
    c.disc(cx + 8, y + h - 117, 4, BLACK);
    c.fillRect(cx - 20, y + h - 90, 40, 12, hex('#EDE6D2'));
  }
  // a black leather jacket draped over the left chair
  c.poly([[x + w * 0.32 - 26, y + h - 158], [x + w * 0.32 + 6, y + h - 158], [x + w * 0.32 + 2, y + h - 118], [x + w * 0.32 - 26, y + h - 122]], hex('#16161C'));
}

function sceneZelensky(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h, hex('#7A9CC4'), hex('#C8D6E8'));
  // three flags on poles behind the table
  const fw = 44;
  const fh = 30;
  const fy = y + 22;
  uaFlag(c, x + 18, fy, fw, fh);
  usFlag(c, x + w / 2 - fw / 2, fy - 8, fw, fh);
  euFlag(c, x + w - 18 - fw, fy, fw, fh);
  for (const fx of [x + 18 + fw / 2, x + w / 2, x + w - 18 - fw / 2]) {
    c.fillRect(fx - 1.5, fy + fh, 3, 46, hex('#5A4632'));
  }
  // two envoys facing each other across a round table
  person(c, x + w * 0.26, y + 78, 1.5, hex('#E8B98F'), hex('#2E4A6B'), hex('#3A2A1A'));
  person(c, x + w * 0.74, y + 78, 1.5, hex('#D9A077'), hex('#4A4A4A'), hex('#8A8A8A'));
  // handshake over the table
  c.line(x + w * 0.32, y + 128, x + w * 0.5, y + 118, 7, hex('#E8B98F'));
  c.line(x + w * 0.68, y + 128, x + w * 0.5, y + 118, 7, hex('#D9A077'));
  c.disc(x + w * 0.5, y + 118, 7, hex('#E8C9A0'));
  // round table
  c.ellipse(x + w / 2, y + 168, w * 0.46, 26, hex('#6E4526'));
  c.fillRect(x + w / 2 - 8, y + 168, 16, 34, hex('#4A2E18'));
  c.ellipse(x + w / 2, y + 168, w * 0.46, 20, hex('#8A5A30'));
}

function sceneWarship(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h * 0.62, hex('#5A6A7A'), hex('#C98A5A'));
  // cold northern sea
  c.fillRect(x, y + h * 0.62, w, h * 0.38, hex('#2E4A5E'));
  c.fillRect(x, y + h * 0.62, w, 3, hex('#7A9AB0'));
  for (let i = 0; i < 5; i++) {
    const wy = y + h * (0.68 + i * 0.055);
    c.line(x + 12 + i * 17, wy, x + 60 + i * 23, wy, 2.5, hex('#5A7A90'));
  }
  // warship silhouette
  const hx = x + 30;
  const hy = y + h * 0.60;
  c.poly([[hx, hy], [hx + 150, hy], [hx + 168, hy - 14], [hx + 150, hy - 14], [hx + 138, hy - 22], [hx + 20, hy - 22], [hx + 8, hy - 14]], hex('#3A4149'));
  c.fillRect(hx + 52, hy - 44, 44, 22, hex('#4A515A'));
  c.fillRect(hx + 96, hy - 36, 26, 14, hex('#4A515A'));
  c.line(hx + 118, hy - 36, hx + 118, hy - 62, 4, hex('#2E3339'));
  c.fillRect(hx + 60, hy - 58, 12, 14, hex('#2E3339'));
  // smoke and fire where the drone hit
  c.disc(hx + 128, hy - 52, 13, hex('#8A8A8A'));
  c.disc(hx + 136, hy - 66, 10, hex('#A8A8A8'));
  c.disc(hx + 124, hy - 78, 8, hex('#C8C8C8'));
  c.disc(hx + 132, hy - 40, 9, hex('#E87E2A'));
  c.disc(hx + 132, hy - 40, 5, hex('#F5C542'));
  // small drone upper right, diving in
  const dx = x + w - 52;
  const dy = y + 26;
  c.line(dx - 10, dy - 6, dx + 10, dy + 6, 2.5, BLACK);
  c.line(dx - 10, dy + 6, dx + 10, dy - 6, 2.5, BLACK);
  c.disc(dx, dy, 4, BLACK);
  c.disc(dx - 10, dy - 6, 2.5, hex('#5A5A5A'));
  c.disc(dx + 10, dy + 6, 2.5, hex('#5A5A5A'));
}

function sceneIran(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h * 0.66, hex('#3A2E4E'), hex('#C96A3A'));
  // desert coast
  c.fillRect(x, y + h * 0.66, w, h * 0.34, hex('#C8A06A'));
  c.ellipse(x + w * 0.2, y + h * 0.78, 60, 10, hex('#A8824E'));
  c.ellipse(x + w * 0.75, y + h * 0.86, 70, 12, hex('#A8824E'));
  // radar dome on its base: a true hemisphere
  const bx = x + w * 0.36;
  const by = y + h * 0.66;
  c.fillRect(bx - 34, by - 8, 68, 26, hex('#8A8A8A'));
  c.fillRect(bx - 40, by + 16, 80, 10, hex('#6E6E6E'));
  const domePts: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI; // left to right over the top
    domePts.push([bx + Math.cos(a) * 36, by - 8 - Math.sin(a) * 34]);
  }
  domePts.push([bx + 36, by - 8], [bx - 36, by - 8]);
  c.poly(domePts, hex('#EDEDED'));
  c.line(bx, by - 42, bx + 22, by - 56, 3, hex('#C8C8C8'));
  c.disc(bx + 22, by - 56, 3.5, hex('#C8C8C8'));
  // missile streaking down toward the dome, flame at its head
  c.line(x + w - 30, y + 10, x + w - 62, y + 62, 4, hex('#F5E6C8'));
  c.disc(x + w - 64, y + 64, 9, hex('#F5C542'));
  c.disc(x + w - 64, y + 64, 5, hex('#E87E2A'));
  // impact burst where the streak meets the dome's sky
  c.disc(bx + 30, by - 44, 7, hex('#F5C542'));
  c.disc(bx + 30, by - 44, 3.5, hex('#E87E2A'));
}

function sceneHack(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h, hex('#0E1420'), hex('#1E2A44'));
  // matrix-style dots in the dark
  for (let i = 0; i < 26; i++) {
    const px = x + 10 + ((i * 53) % (w - 20));
    const py = y + 10 + ((i * 37) % 60);
    c.disc(px, py, 1.6, hex('#2E5A3A'));
  }
  // laptop
  const lx = x + w * 0.5 - 78;
  const ly = y + 52;
  c.fillRect(lx - 6, ly + 96, 168, 10, hex('#3A3F47'));
  c.fillRect(lx, ly, 156, 96, hex('#22262E'));
  c.fillRect(lx + 6, ly + 6, 144, 84, hex('#0A2E3E'));
  // masked face on the video call
  const fx = x + w * 0.5;
  const fy = ly + 42;
  c.disc(fx, fy, 22, hex('#C8A882')); // face
  c.disc(fx, fy - 6, 22, hex('#1A1A1A')); // balaclava top
  c.fillRect(fx - 22, fy - 6, 44, 8, hex('#C8A882'));
  c.fillRect(fx - 22, fy + 2, 44, 12, hex('#1A1A1A')); // mask band
  c.disc(fx - 9, fy + 1, 2.5, WHITE);
  c.disc(fx + 9, fy + 1, 2.5, WHITE);
  // red recording dot + fake-call bar
  c.disc(lx + 16, ly + 16, 4, hex('#E83A2A'));
  c.fillRect(lx + 108, ly + 12, 36, 8, hex('#E83A2A'));
  // gold coins spilling out of the screen
  const coin = hex('#E8B93A');
  const coinD = hex('#B8860B');
  const spots: Array<[number, number, number]> = [
    [0.16, 0.86, 11], [0.34, 0.9, 13], [0.52, 0.87, 11], [0.7, 0.91, 13],
    [0.86, 0.85, 11], [0.26, 0.74, 9], [0.62, 0.76, 9], [0.44, 0.68, 8],
  ];
  for (const [fxr, fyr, fr] of spots) {
    c.disc(x + w * fxr, y + h * fyr, fr, coin);
    c.ring(x + w * fxr, y + h * fyr, fr - 3.5, 2, coinD);
  }
}

function sceneDeport(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h * 0.72, hex('#7AB0DE'), hex('#D6E8F5'));
  // clouds
  c.ellipse(x + 44, y + 34, 30, 10, WHITE);
  c.ellipse(x + 62, y + 28, 22, 9, WHITE);
  c.ellipse(x + w - 52, y + 58, 34, 11, WHITE);
  c.ellipse(x + w - 74, y + 52, 22, 8, WHITE);
  // big plane climbing away
  plane(c, x + 62, y + 96, 1.5, hex('#5A6A7A'));
  plane(c, x + w - 150, y + 40, 0.9, hex('#8A9AB0'));
  // ground: runway + terminal
  c.fillRect(x, y + h * 0.72, w, h * 0.28, hex('#4A4A48'));
  c.fillRect(x, y + h * 0.72, w, 4, hex('#E8E8E8'));
  for (let i = 0; i < 6; i++) c.fillRect(x + 14 + i * 38, y + h * 0.84, 22, 5, hex('#E8C93A'));
  c.fillRect(x + 18, y + h * 0.72 - 34, 64, 34, hex('#6E7A88'));
  c.fillRect(x + 26, y + h * 0.72 - 26, 48, 10, hex('#9FC6E8'));
  c.fillRect(x + w - 46, y + h * 0.72 - 22, 28, 22, hex('#6E7A88'));
}

function sceneGroundStop(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h * 0.6, hex('#8A97A8'), hex('#D8DDE2'));
  // tarmac
  c.fillRect(x, y + h * 0.6, w, h * 0.4, hex('#5A5E62'));
  for (let i = 0; i < 6; i++) c.fillRect(x + 12 + i * 40, y + h * 0.76, 24, 5, hex('#E8C93A'));
  // control tower
  const tx = x + 26;
  const ty = y + h * 0.6;
  c.fillRect(tx, ty - 108, 20, 108, hex('#7A8288'));
  c.fillRect(tx - 8, ty - 128, 36, 22, hex('#3A4A5E'));
  c.fillRect(tx - 4, ty - 124, 28, 12, hex('#9FC6E8'));
  c.fillRect(tx - 12, ty - 132, 44, 6, hex('#2E3A48'));
  // three grounded planes in a row
  plane(c, x + 78, y + h * 0.68, 0.85, hex('#3A4149'));
  plane(c, x + 78, y + h * 0.80, 0.85, hex('#4A515A'));
  plane(c, x + 150, y + h * 0.74, 0.7, hex('#2E3339'));
  // red STOP sign
  const sx = x + w - 62;
  const sy = y + 16;
  c.poly([[sx + 8, sy], [sx + 40, sy], [sx + 48, sy + 8], [sx + 48, sy + 40], [sx + 40, sy + 48], [sx + 8, sy + 48], [sx, sy + 40], [sx, sy + 8]], hex('#C0271C'));
  c.poly([[sx + 11, sy + 3], [sx + 37, sy + 3], [sx + 45, sy + 11], [sx + 45, sy + 37], [sx + 37, sy + 45], [sx + 11, sy + 45], [sx + 3, sy + 37], [sx + 3, sy + 11]], WHITE);
  drawText(c, 'STOP', sx + 24, sy + 15, 1.9, hex('#C0271C'), 'center', 1.3);
}

function sceneKane(c: Canvas, x: number, y: number, w: number, h: number): void {
  sky(c, x, y, w, h * 0.42, hex('#1E5E2E'), hex('#2E7A3E'));
  // crowd dots in the stands
  const cols = [hex('#E83A2A'), hex('#E8B93A'), hex('#3A7AD9'), hex('#E8E8E8'), hex('#7A4AD9')];
  for (let i = 0; i < 40; i++) {
    const px = x + 8 + ((i * 41) % (w - 16));
    const py = y + 12 + ((i * 23) % 46);
    c.disc(px, py, 3, cols[i % cols.length]);
  }
  // pitch
  c.fillRect(x, y + h * 0.42, w, h * 0.58, hex('#2E8A3E'));
  c.fillRect(x, y + h * 0.42, w, 4, hex('#E8E8E8'));
  c.ellipse(x + w * 0.5, y + h * 0.86, 66, 12, hex('#277A34'));
  // footballer in white, arms raised
  const px = x + w * 0.5;
  const py = y + h * 0.44;
  const s = 1.9;
  c.line(px - 14 * s, py + 34 * s, px - 24 * s, py + 6 * s, 6, hex('#E8B98F')); // left arm up
  c.line(px + 14 * s, py + 34 * s, px + 24 * s, py + 6 * s, 6, hex('#E8B98F')); // right arm up
  c.poly([[px - 13 * s, py + 62 * s], [px - 9 * s, py + 30 * s], [px + 9 * s, py + 30 * s], [px + 13 * s, py + 62 * s]], WHITE); // shirt
  c.fillRect(px - 13 * s, py + 62 * s, 26 * s, 12 * s, hex('#14213D')); // shorts
  c.line(px - 6 * s, py + 74 * s, px - 8 * s, py + 100 * s, 6, hex('#E8B98F'));
  c.line(px + 6 * s, py + 74 * s, px + 9 * s, py + 100 * s, 6, hex('#E8B98F'));
  c.disc(px, py + 16 * s, 10 * s, hex('#E8B98F')); // head
  c.disc(px, py + 7 * s, 10 * s, hex('#5A3A1A')); // hair
  c.fillRect(px - 10 * s, py + 7 * s, 20 * s, 5 * s, hex('#E8B98F'));
  // shirt number 9
  drawText(c, '9', px, py + 36 * s, 1.6, hex('#B3271E'), 'center', 1.3);
  // ball at his feet
  const bx = px + 34 * s;
  const by = py + 98 * s;
  c.disc(bx, by, 11, WHITE);
  c.poly([[bx - 3, by - 5], [bx + 3, by - 5], [bx + 5, by], [bx, by + 5], [bx - 5, by]], BLACK);
  c.disc(bx - 8, by - 6, 1.8, BLACK);
  c.disc(bx + 8, by - 6, 1.8, BLACK);
}

// ------------------------------------------------------------- globe emblem
function globe(c: Canvas, cx: number, cy: number, r: number): void {
  c.disc(cx, cy, r, hex('#2A5A8A'));
  // continents as flat blobs
  c.ellipse(cx - r * 0.32, cy - r * 0.28, r * 0.30, r * 0.22, hex('#4A9A4A'));
  c.ellipse(cx + r * 0.34, cy + r * 0.05, r * 0.26, r * 0.30, hex('#4A9A4A'));
  c.ellipse(cx + r * 0.05, cy + r * 0.48, r * 0.22, r * 0.16, hex('#4A9A4A'));
  // latitude chords
  for (const dy of [-r * 0.5, 0, r * 0.5]) {
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    c.line(cx - half, cy + dy, cx + half, cy + dy, 1.5, hex('#7AB0DE'));
  }
  // longitude ellipse
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i + 1 < pts.length; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.5, hex('#7AB0DE'));
  // city lights
  c.disc(cx - r * 0.3, cy - r * 0.25, 1.8, GOLD_LT);
  c.disc(cx + r * 0.35, cy + r * 0.1, 1.8, GOLD_LT);
  c.disc(cx + r * 0.05, cy + r * 0.5, 1.8, GOLD_LT);
  c.ring(cx, cy, r, 2.5, GOLD);
}

// ------------------------------------------------------------ panel composer
function fitScale(line: string, maxW: number, maxScale: number): number {
  return Math.min(maxScale, maxW / (line.length * ADV));
}

interface Panel {
  scene: (c: Canvas, x: number, y: number, w: number, h: number) => void;
  kicker: string;
  head: [string, string];
  deck: [string, string];
}

const PANEL_W = 239;
const PANEL_H = 400;
const TEXT_W = PANEL_W - 24;

function drawPanel(c: Canvas, x: number, y: number, p: Panel): void {
  // drop shadow + paper card
  c.fillRect(x + 3, y + 5, PANEL_W, PANEL_H, hex('#05070F'));
  c.fillRect(x, y, PANEL_W, PANEL_H, PAPER);
  // gold top strip + thin edge
  c.fillRect(x, y, PANEL_W, 4, GOLD);
  c.fillRect(x, y + PANEL_H - 1, PANEL_W, 1, PAPER_EDGE);
  c.fillRect(x, y, 1, PANEL_H, PAPER_EDGE);
  c.fillRect(x + PANEL_W - 1, y, 1, PANEL_H, PAPER_EDGE);
  // scene
  p.scene(c, x, y + 4, PANEL_W, 240);
  // kicker
  drawText(c, p.kicker, x + 12, y + 256, 1.5, RED, 'left', 1.25);
  // headline, each line fitted
  const s1 = fitScale(p.head[0], TEXT_W, 2.6);
  const s2 = fitScale(p.head[1], TEXT_W, 2.6);
  drawText(c, p.head[0], x + 12, y + 276, s1, INK, 'left', 1.3);
  drawText(c, p.head[1], x + 12, y + 306, s2, INK, 'left', 1.3);
  // deck
  drawText(c, p.deck[0], x + 12, y + 342, 1.35, DECK, 'left', 1.1);
  drawText(c, p.deck[1], x + 12, y + 360, 1.35, DECK, 'left', 1.1);
}

const PANELS: Panel[] = [
  { scene: sceneSenate, kicker: 'WASHINGTON', head: ['SENATE SUMMONS', 'HUANG & LUTNICK'], deck: ['HUANG AND LUTNICK', 'CALLED TO TESTIFY.'] },
  { scene: sceneZelensky, kicker: 'KYIV', head: ['ZELENSKYY MEETS', 'US ENVOYS'], deck: ['EUROPE JOINS THE', 'PEACE TALKS.'] },
  { scene: sceneWarship, kicker: 'GULF OF FINLAND', head: ['DRONE HITS', 'RUSSIAN WARSHIP'], deck: ['FIRST STRIKE OF ITS', 'KIND IN BALTIC WATERS.'] },
  { scene: sceneIran, kicker: 'BAHRAIN', head: ['IRAN CLAIMS', 'US RADAR STRIKE'], deck: ['TEHRAN SAYS IT HIT', 'A US RADAR SITE.'] },
  { scene: sceneHack, kicker: 'CYBERCRIME', head: ['FBI: N. KOREA', '$400M CRYPTO HACK'], deck: ['HACKERS USED FAKE', 'VIDEO CALLS.'] },
  { scene: sceneDeport, kicker: 'UNITED STATES', head: ['RECORD 483,200', 'DEPORTATIONS'], deck: ['MOST REMOVALS IN A', 'YEAR ON RECORD.'] },
  { scene: sceneGroundStop, kicker: 'AVIATION', head: ['US GROUNDS ALL', 'FLIGHTS'], deck: ['AIR-TRAFFIC OUTAGE', 'HALTS DEPARTURES.'] },
  { scene: sceneKane, kicker: 'SPORT', head: ['KANE BREAKS', 'CAPS RECORD'], deck: ['126TH CAP, VS', 'CROATIA.'] },
];

// ------------------------------------------------------------------ compose
function render(): Canvas {
  const W = 1024;
  const H = 1024;
  const c = new Canvas(W, H, NAVY_TOP);
  c.vgrad(0, 0, W, H, NAVY_TOP, NAVY_BOT);

  // masthead
  c.fillRect(0, 0, W, 116, NAVY_BAND);
  globe(c, 64, 58, 40);
  drawText(c, 'THE WORLD TODAY', 560, 16, 5.5, WHITE, 'center', 1.2);
  drawText(c, 'FRIDAY \u2022 13 NOVEMBER 2026', 560, 76, 2.6, GOLD_LT, 'center', 1.15);
  c.fillRect(0, 112, W, 4, GOLD);
  // badge: story count
  c.rrect(892, 20, 116, 36, 6, RED);
  drawText(c, '8 STORIES', 950, 29, 1.7, WHITE, 'center', 1.25);

  // grid: 4 columns x 2 rows
  const xs = [16, 267, 518, 769];
  const ys = [132, 548];
  for (let i = 0; i < PANELS.length; i++) {
    drawPanel(c, xs[i % 4], ys[Math.floor(i / 4)], PANELS[i]);
  }

  // footer
  c.fillRect(16, 958, 992, 2, GOLD);
  drawText(c, 'SOURCES: BBC \u2022 AL JAZEERA \u2022 REUTERS \u2022 AP - ALL STORIES FIRST REPORTED 13 NOV 2026', 512, 972, 1.7, hex('#9AA3C0'), 'center', 1.1);
  return c;
}

// --------------------------------------------------------------------- main
const canvas = render();
const png = encodePNG(canvas.w, canvas.h, canvas.data);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`wrote ${join(outDir, 'entry.png')}: ${canvas.w}x${canvas.h}, ${png.length} bytes`);
