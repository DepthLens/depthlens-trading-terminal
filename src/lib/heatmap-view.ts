// Browser-safe heatmap view rules: build and paint only what fits the screen.
// Columns keep their right-anchored 3–12px width from the full window, but only the visible slots plus a
// small lookback margin are built, decoded and painted, so long windows never allocate off-screen columns.
import { colorFor, type Column } from './heatmap-data';
import type { RecordedSnapshot } from './heatmap-recorded';
import { scalePos } from './heatmap-pro';
import { heatColumnWidth } from './tool-layout';

export const VIEW_MARGIN_SLOTS = 300; // lookback for walls/markers/flows just left of the screen
export const OFF_SLOTS = 3600; // offscreen texture width (one pixel per slot)
export const MAX_BUBBLES = 3000;
// Coverage must not change the selected time scale, including on a fresh/sparse buffer.
export const windowSlotCount = (minutes: number, stepSeconds = 1) => Math.round(minutes * 60 / stepSeconds);

// Column width from the full window (unchanged look) and how many slots are visible / worth building.
export function viewSlots(width: number, logicalN: number, margin = VIEW_MARGIN_SLOTS): { colW: number; visible: number; build: number } {
  const n = Math.max(0, Math.round(logicalN));
  const colW = heatColumnWidth(width, n);
  const visible = Math.min(n, Math.ceil(Math.max(0, width) / colW) + 1);
  return { colW, visible, build: Math.min(n, visible + margin) };
}

// Precomputed palette (4096 steps) so painting never allocates per cell; within one colour level of colorFor.
const LUT_SIZE = 4096;
let lut: Uint8Array | null = null;
export function colorLut(): Uint8Array {
  if (lut) return lut;
  const out = new Uint8Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i++) { const [r, g, b] = colorFor(i / (LUT_SIZE - 1)); out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b; }
  return (lut = out);
}

// Write one column's pixels into an RGBA buffer `width` pixels wide at column x (same rules as before:
// grouped rows from the top bucket down, price-only transparent, gaps dim, tiny sizes transparent).
export function fillColumn(px: Uint8ClampedArray, width: number, x: number, col: Column, rows: number, topIdx: number, g: number, lo: number, hi: number, contrast: number) {
  const table = colorLut(), data = col.data, n = data.length;
  for (let r = 0; r < rows; r++) {
    let value = 0;
    const rowTop = topIdx - r * g;
    for (let k = 0; k < g; k++) { const i = rowTop - k - col.origin; if (i >= 0 && i < n) value += data[i] ?? 0; }
    const li = Math.round(scalePos(value, lo, hi, contrast) * (LUT_SIZE - 1)) * 3, o = (r * width + x) * 4;
    px[o] = table[li] ?? 0; px[o + 1] = table[li + 1] ?? 0; px[o + 2] = table[li + 2] ?? 0;
    px[o + 3] = col.priceOnly ? 0 : col.gap ? 70 : value > lo * .25 ? 255 : 0;
  }
}

type Ctx2D = Pick<CanvasRenderingContext2D, 'createImageData' | 'putImageData'>;
// Paint many slots with one ImageData per contiguous run of slots (one blit per run, not per column).
export function paintSlots(ctx: Ctx2D, todo: { slot: number; col: Column }[], rows: number, topIdx: number, g: number, lo: number, hi: number, contrast: number): number {
  if (!todo.length || rows <= 0) return 0;
  todo.sort((a, b) => a.slot - b.slot);
  let runs = 0;
  for (let i = 0; i < todo.length;) {
    let j = i + 1;
    while (j < todo.length && todo[j]!.slot === todo[j - 1]!.slot + 1) j++;
    const width = j - i, img = ctx.createImageData(width, rows);
    for (let k = i; k < j; k++) fillColumn(img.data, width, k - i, todo[k]!.col, rows, topIdx, g, lo, hi, contrast);
    ctx.putImageData(img, todo[i]!.slot, 0);
    runs++; i = j;
  }
  return runs;
}

// Keep at most `max` bubbles (largest first) so zoomed-out views stay light; returns the input when small.
export function capBubbles<T extends { radius: number }>(list: T[], max = MAX_BUBBLES): T[] {
  return list.length <= max ? list : [...list].sort((a, b) => b.radius - a.radius).slice(0, max);
}

// Lazily decodes recorded rows into columns only for the requested time range, a few hundred rows per
// call, and keeps decoded pages in an LRU bounded by total column count so memory cannot keep growing.
type Entry = { rows: RecordedSnapshot[]; order: number[]; times: number[]; cols: (Column[] | undefined)[]; count: number; pass: number };
export class RecordedDecodeCache {
  private entries = new Map<string, Entry>();
  private total = 0;
  private pass = 0;
  constructor(private maxCols = 6000) {}
  get size() { return this.total; }
  get pages() { return this.entries.size; }
  beginPass() { this.pass++; }
  rowsOf(key: string): RecordedSnapshot[] | null { return this.entries.get(key)?.rows ?? null; }
  drop(prefix: string) { for (const [k, e] of this.entries) if (k.startsWith(prefix)) { this.total -= e.count; this.entries.delete(k); } }
  clear() { this.entries.clear(); this.total = 0; }
  // Appends columns with time in [from, to) to `out`. Returns false when the budget ran out (call again).
  collect(key: string, rows: RecordedSnapshot[], from: number, to: number, decode: (row: RecordedSnapshot) => Column[], budget: { left: number }, out: Column[]): boolean {
    let e = this.entries.get(key);
    if (e && e.rows !== rows) { this.total -= e.count; this.entries.delete(key); e = undefined; }
    if (!e) {
      const times = rows.map(r => Date.parse(r.ts));
      const order = rows.map((_, i) => i).sort((a, b) => (times[a] ?? 0) - (times[b] ?? 0));
      e = { rows, order, times: order.map(i => times[i] ?? NaN), cols: new Array(rows.length), count: 0, pass: this.pass };
    } else this.entries.delete(key);
    this.entries.set(key, e); e.pass = this.pass; // most recently used last
    // Rows cover up to 5 s after their timestamp (per-second expansion), so start a little earlier.
    let a = 0, b = e.times.length;
    while (a < b) { const m = (a + b) >> 1; if ((e.times[m] ?? 0) < from - 5000) a = m + 1; else b = m; }
    let complete = true;
    for (let i = a; i < e.times.length; i++) {
      if ((e.times[i] ?? 0) >= to) break;
      let cols = e.cols[i];
      if (!cols) {
        if (budget.left <= 0) { complete = false; break; }
        budget.left--;
        cols = decode(e.rows[e.order[i] ?? i]!); e.cols[i] = cols; e.count += cols.length; this.total += cols.length;
      }
      for (const c of cols) if (c.time >= from && c.time < to) out.push(c);
    }
    // Evict least recently used pages not used in this pass.
    for (const [k, old] of this.entries) {
      if (this.total <= this.maxCols) break;
      if (old.pass === this.pass) continue;
      this.total -= old.count; this.entries.delete(k);
    }
    return complete;
  }
}
