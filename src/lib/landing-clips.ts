// Browser-safe drawing for landing-page mini clips. Seeded market fixture (no sockets, no network),
// Flow Radar marks come from the real findSetups()/detectPatterns() engines. Loops every LOOP seconds.
import { findSetups, RADAR_DEFAULT, deltaRatio, type RadarBar } from './flow-radar';
import { detectPatterns, type AtlasCandle } from './flow-radar-patterns';

export type ClipKind = 'heatmap' | 'footprint' | 'dom' | 'cvd' | 'profile' | 'whales' | 'liquidations' | 'pressure' | 'radar';
export type Pal = { up: string; down: string; poc: string; va: string; text: string; muted: string; grid: string; bg: string; heat: string; gold: string };
type C = CanvasRenderingContext2D;
export type MBar = { time: number; open: number; high: number; low: number; close: number; volume: number; takerBuy: number };

export const L = 64;            // bars in one loop (series is periodic so the loop is seamless)
export const STEP = 0.55;       // seconds per bar
export const LOOP = L * STEP;   // ~35 s
const N = 44;                   // visible bars
const T0 = Date.UTC(2026, 10, 22, 14, 0);
const AXIS = 46;

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const hash = (a: number, b: number) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Seeded BTC-like 1m series: volatility clustering, volume spikes with big moves, taker flow follows direction. Closes wrap to the first open. */
export function makeSeries(seed = 7, n = L, base = 64250): MBar[] {
  const r = rng(seed); const rets: number[] = []; let vol = 0.0009;
  for (let i = 0; i < n; i++) { vol = Math.max(0.0004, Math.min(0.003, vol * 0.85 + 0.00015 + Math.abs(gauss(r)) * 0.0002 + (r() < 0.06 ? 0.0012 : 0))); rets.push(gauss(r) * vol); }
  const mean = rets.reduce((a, b) => a + b, 0) / n; let p = base; const out: MBar[] = [];
  rets.forEach((ret0, i) => {
    const ret = ret0 - mean, o = p, c = o + base * ret, mv = Math.min(4, Math.abs(ret) / 0.0009);
    const hi = Math.max(o, c) * (1 + Math.abs(gauss(r)) * 0.00035), lo = Math.min(o, c) * (1 - Math.abs(gauss(r)) * 0.00035);
    const volume = 40 + 60 * r() + 90 * mv * mv + (r() < 0.08 ? 260 : 0);
    const buyFrac = Math.max(0.08, Math.min(0.92, 0.5 + Math.sign(ret) * Math.min(0.38, mv * 0.16) + gauss(r) * 0.06));
    out.push({ time: T0 + i * 60000, open: o, high: hi, low: lo, close: c, volume, takerBuy: volume * buyFrac }); p = c;
  });
  return out;
}
const S = makeSeries();
const PMIN = Math.min(...S.map(b => b.low)), PMAX = Math.max(...S.map(b => b.high)), PAD = (PMAX - PMIN) * 0.08;
const VOLS = S.map(b => b.volume).sort((a, z) => a - z), VQ = VOLS[Math.floor(L * .78)]!, VMAX = VOLS[L - 1]!;
const mod = (k: number) => ((k % L) + L) % L;
const timeOf = (k: number) => T0 + k * 60000;
/** Bar at unrolled index k; the bar at `now` is still forming (0..1). */
export function barAt(k: number, formP = 1): MBar {
  const b = S[mod(k)]!; if (formP >= 1) return { ...b, time: timeOf(k) };
  const f = Math.max(0.02, formP), wig = Math.sin(formP * 17 + k) * (b.high - b.low) * 0.15 * (1 - f);
  const c = b.open + (b.close - b.open) * f + wig;
  return { time: timeOf(k), open: b.open, high: Math.max(b.open, c, b.open + (b.high - b.open) * Math.min(1, f * 1.4)), low: Math.min(b.open, c, b.open - (b.open - b.low) * Math.min(1, f * 1.4)), close: c, volume: b.volume * f, takerBuy: b.takerBuy * f };
}
function windowAt(t: number, n = N) { const e = t / STEP, last = Math.floor(e), f = e - last; return Array.from({ length: n }, (_, j) => { const k = last - (n - 1) + j; return barAt(k, k === last ? f : 1); }); }

// Flow Radar: run the real engines once on the unrolled series and keep events by series slot.
let radarCache: { setups: Map<number, { side: 'buy' | 'sell'; entry: number; stop: number; target: number }>; pats: Map<number, { side: 1 | -1; label: string }> } | null = null;
export function radarMarks() {
  if (radarCache) return radarCache;
  const reps = 8, H = 3600000, bars: RadarBar[] = [];
  for (let i = 0; i < L * reps; i++) { const b = S[i % L]!; bars.push({ ...b, time: T0 + i * H }); }
  const s = { ...RADAR_DEFAULT, vz: 2.2, dr: 0.25, sweep: false };
  const setups = new Map<number, { side: 'buy' | 'sell'; entry: number; stop: number; target: number }>();
  for (const x of findSetups(bars, s)) { const i = Math.round((x.time - T0) / H); if (i >= L * 2) setups.set(i % L, x); }
  const pats = new Map<number, { side: 1 | -1; label: string }>();
  const atlas: AtlasCandle[] = bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, delta: 2 * b.takerBuy - b.volume }));
  for (const e of detectPatterns(atlas, '1h')) if (e.index >= L * 2 && !setups.has(e.index % L)) pats.set(e.index % L, { side: e.side, label: e.label });
  return (radarCache = { setups, pats });
}

const alpha = (col: string, a: number) => `color-mix(in srgb, ${col} ${Math.round(a * 100)}%, transparent)`;
type Frame = { x0: number; x1: number; top: number; bot: number; lo: number; hi: number };
const yOf = (f: Frame, p: number) => f.top + (f.hi - p) / (f.hi - f.lo) * (f.bot - f.top);
function frame(w: number, h: number, top = 6, bot = h - 6, x1 = w - AXIS): Frame { return { x0: 0, x1, top, bot, lo: PMIN - PAD, hi: PMAX + PAD }; }
function grid(c: C, f: Frame, p: Pal) { c.strokeStyle = p.grid; c.lineWidth = 1; for (let i = 1; i < 6; i++) { const y = Math.round(f.top + (f.bot - f.top) * i / 6) + .5; c.beginPath(); c.moveTo(f.x0, y); c.lineTo(f.x1, y); c.stroke(); } }
function axis(c: C, f: Frame, w: number, p: Pal, last?: MBar) {
  c.font = '9px ui-monospace,monospace'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = p.muted;
  for (let i = 1; i < 6; i++) { const y = f.top + (f.bot - f.top) * i / 6, pr = f.hi - (f.hi - f.lo) * i / 6; c.fillText(pr.toFixed(1), f.x1 + 4, y); }
  if (last) { const y = yOf(f, last.close), col = last.close >= last.open ? p.up : p.down; c.strokeStyle = alpha(col, .7); c.setLineDash([2, 2]); c.beginPath(); c.moveTo(f.x0, Math.round(y) + .5); c.lineTo(f.x1, Math.round(y) + .5); c.stroke(); c.setLineDash([]); c.fillStyle = col; c.fillRect(f.x1, y - 7, w - f.x1, 14); c.fillStyle = p.bg; c.font = 'bold 9px ui-monospace,monospace'; c.fillText(last.close.toFixed(1), f.x1 + 4, y); }
}
function candles(c: C, f: Frame, bs: MBar[], p: Pal, outline = false) {
  const cw = (f.x1 - f.x0) / bs.length;
  bs.forEach((b, i) => { const x = f.x0 + i * cw + cw / 2, col = b.close >= b.open ? p.up : p.down; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1;
    c.beginPath(); c.moveTo(Math.round(x) + .5, yOf(f, b.high)); c.lineTo(Math.round(x) + .5, yOf(f, b.low)); c.stroke();
    const y1 = yOf(f, Math.max(b.open, b.close)), y2 = yOf(f, Math.min(b.open, b.close)), bw = Math.max(1, cw * .7);
    if (outline) c.strokeRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1)); else c.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1)); });
  return cw;
}
const heatColor = (v: number) => { // terminal-like depth ramp: deep blue -> cyan -> yellow -> white
  const s = [[8, 20, 70], [20, 90, 200], [30, 200, 220], [250, 220, 60], [255, 255, 240]] as const, x = Math.min(.999, Math.max(0, v)) * 4, i = Math.floor(x), t = x - i, a = s[i]!, b = s[i + 1]!;
  return `rgb(${a[0] + (b[0] - a[0]) * t | 0},${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0})`; };
// Resting walls: fixed price levels with a life span; consumed when price trades through them.
const WALLS = (() => { const r = rng(99); return Array.from({ length: 9 }, () => ({ price: PMIN + (PMAX - PMIN) * (r() * 1.1 - .05), from: Math.floor(r() * L), life: 14 + Math.floor(r() * 40), size: .5 + r() * .5 })); })();
const wallAt = (k: number, price: number, mid: number, bucket: number) => { let v = 0; for (const wl of WALLS) { const age = mod(k - wl.from); if (age > wl.life) continue; if (Math.abs(price - wl.price) < bucket * .8 && Math.sign(wl.price - mid) === Math.sign(wl.price - S[mod(wl.from)]!.open)) v = Math.max(v, wl.size); } return v; };
const fmtUsd = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}K`;
const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19);

const draw: Record<ClipKind, (c: C, w: number, h: number, t: number, p: Pal) => void> = {
  heatmap(c, w, h, t, p) {
    c.fillStyle = p.heat; c.fillRect(0, 0, w, h);
    const f = frame(w, h), bs = windowAt(t), cols = bs.length * 3, cw = (f.x1 - f.x0) / cols, rows = 70, rh = (f.bot - f.top) / rows, bucket = (f.hi - f.lo) / rows, lastK = Math.floor(t / STEP);
    for (let x = 0; x < cols; x++) { const bi = Math.floor(x / 3), b = bs[bi]!, k = lastK - (bs.length - 1) + bi, mid = b.open + (b.close - b.open) * ((x % 3) + 1) / 3;
      for (let r = 0; r < rows; r++) { const pr = f.hi - (r + .5) * bucket, d = Math.abs(pr - mid) / (f.hi - f.lo);
        const v = Math.max(wallAt(k, pr, mid, bucket), (.5 * Math.exp(-d * 14)) * (.3 + .7 * hash(mod(Math.floor(k / 3)) * 7, Math.round(pr / bucket))) ** 2);
        if (v < .05 || d < .006) continue; c.fillStyle = heatColor(v); c.fillRect(f.x0 + x * cw, f.top + r * rh, cw + .6, rh + .6); } }
    c.strokeStyle = p.text; c.lineWidth = 1.4; c.beginPath(); bs.forEach((b, i) => { const x = f.x0 + (i + 1) * 3 * cw, y = yOf(f, b.close); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    bs.forEach((b, i) => { if (b.volume < VQ) return; const buy = b.takerBuy * 2 > b.volume, x = f.x0 + (i + .7) * 3 * cw, y = yOf(f, b.close); c.fillStyle = alpha(buy ? p.up : p.down, .55); c.strokeStyle = buy ? p.up : p.down; c.beginPath(); c.arc(x, y, 2 + Math.sqrt(b.volume) * .3, 0, 7); c.fill(); c.stroke(); });
    axis(c, f, w, p, bs[bs.length - 1]);
  },
  footprint(c, w, h, t, p) {
    const n = w > 520 ? 4 : 3, f = frame(w, h, 8, h - 18), bs = windowAt(t, n), cw = (f.x1 - f.x0) / n;
    const lo = Math.min(...bs.map(b => b.low)), hi = Math.max(...bs.map(b => b.high)), pad = (hi - lo) * .06; f.lo = lo - pad; f.hi = hi + pad;
    const row = Math.max(5, Math.ceil((f.hi - f.lo) / 18 / 5) * 5), rh = row / (f.hi - f.lo) * (f.bot - f.top), lastK = Math.floor(t / STEP);
    grid(c, f, p);
    bs.forEach((b, i) => { const k = lastK - (n - 1) + i, x = f.x0 + i * cw, r0 = Math.floor(b.low / row), r1 = Math.floor(b.high / row), cells: { bid: number; ask: number; y: number }[] = [];
      const vwap = (b.open + b.close) / 2, sd = Math.max(row, (b.high - b.low) / 2.5);
      let wsum = 0; for (let r = r0; r <= r1; r++) wsum += Math.exp(-((((r + .5) * row - vwap) / sd) ** 2));
      for (let r = r0; r <= r1; r++) { const wv = Math.exp(-((((r + .5) * row - vwap) / sd) ** 2)) / (wsum || 1), skew = hash(mod(k), r) - .5;
        const ask = b.takerBuy * wv * (1 + skew * .9), bid = (b.volume - b.takerBuy) * wv * (1 - skew * .9); cells.push({ bid, ask, y: yOf(f, (r + 1) * row) }); }
      const mx = Math.max(...cells.map(q => q.bid + q.ask)), poc = cells.findIndex(q => q.bid + q.ask === mx);
      const cx = x + 9, colW = cw - 12, half = colW / 2;
      c.strokeStyle = b.close >= b.open ? p.up : p.down; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 4.5, yOf(f, b.high)); c.lineTo(x + 4.5, yOf(f, b.low)); c.stroke(); c.fillStyle = c.strokeStyle; c.fillRect(x + 3, yOf(f, Math.max(b.open, b.close)), 3, Math.max(1, Math.abs(yOf(f, b.open) - yOf(f, b.close))));
      cells.forEach((q, j) => { const tot = mx || 1, ib = q.ask >= q.bid * 3 && q.ask > 2 ? 'up' : q.bid >= q.ask * 3 && q.bid > 2 ? 'down' : null;
        c.fillStyle = alpha(p.down, ib === 'down' ? .55 : .22); c.fillRect(cx + half - half * Math.max(.12, q.bid / tot), q.y + .5, half * Math.max(.12, q.bid / tot), rh - 1);
        c.fillStyle = alpha(p.up, ib === 'up' ? .55 : .22); c.fillRect(cx + half, q.y + .5, half * Math.max(.12, q.ask / tot), rh - 1);
        if (j === poc) { c.strokeStyle = alpha(p.text, .8); c.strokeRect(cx + .5, q.y + .5, colW - 1, rh - 1); }
        if (rh >= 10 && colW > 76) { c.font = `${ib ? "bold " : ""}${Math.min(10, rh * .75)}px ui-monospace,monospace`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = p.text; c.fillText(`${q.bid.toFixed(1)} x ${q.ask.toFixed(1)}`, cx + half, q.y + rh / 2); } });
      const d = 2 * b.takerBuy - b.volume; c.font = 'bold 9px ui-monospace,monospace'; c.textAlign = 'center'; c.fillStyle = d >= 0 ? p.up : p.down; c.fillText(`${d >= 0 ? '+' : ''}${d.toFixed(1)}`, cx + half, h - 9); });
    axis(c, f, w, p, bs[n - 1]);
  },
  dom(c, w, h, t, p) {
    const k = Math.floor(t / STEP), b = barAt(k, (t / STEP) % 1), step = .5, mid = Math.round(b.close / step) * step, rows = 22, rh = h / (rows + 1.5), half = rows / 2;
    c.font = '10px ui-monospace,monospace'; c.textBaseline = 'middle'; c.fillStyle = alpha(p.muted, .15); c.fillRect(0, 0, w, rh * 1.3);
    c.fillStyle = p.muted; c.textAlign = 'left'; c.fillText(`BTCUSDT  bid ${(mid - step).toFixed(1)}  ask ${mid.toFixed(1)}  spread ${step.toFixed(1)}`, 8, rh * .65);
    const sizes: number[] = [];
    for (let r = 0; r < rows; r++) { const pr = mid + (half - r - .5) * step + step / 2, slow = Math.floor(t * 2); sizes.push((0.3 + hash(Math.round(pr / step), slow) ** 3 * 4 + hash(Math.round(pr / step), 1) * 1.5) * (wallAt(k, pr, b.close, step * 3) ? 9 : 1)); }
    const med = [...sizes].sort((a, z) => a - z)[rows >> 1]! || 1, mx = Math.max(...sizes);
    sizes.forEach((sz, r) => { const ask = r < half, pr = mid + (half - r - 1) * step + (ask ? step : 0), y = rh * 1.5 + r * rh, col = ask ? p.down : p.up, wall = sz > med * 3, bw = sz / mx * w * .55;
      c.fillStyle = alpha(col, wall ? .6 : .26); c.fillRect(w - bw, y + 1, bw, rh - 2);
      if (wall) { c.strokeStyle = p.gold; c.strokeRect(w - bw + .5, y + 1.5, bw - 1, rh - 3); }
      if (r === half - 1 || r === half) { c.strokeStyle = col; c.strokeRect(.5, y + .5, w - 1, rh - 1); }
      c.fillStyle = col; c.textAlign = 'left'; c.fillText(pr.toFixed(1), 8, y + rh / 2); c.fillStyle = p.text; c.textAlign = 'right'; c.fillText(sz.toFixed(3), w - 8, y + rh / 2); });
    const ly = rh * 1.5 + half * rh; c.fillStyle = b.close >= b.open ? p.up : p.down; c.textAlign = 'center'; c.font = 'bold 10px ui-monospace,monospace'; c.fillText(`${b.close >= b.open ? '▲' : '▼'} ${b.close.toFixed(1)}`, w * .45, ly);
  },
  cvd(c, w, h, t, p) {
    const bs = windowAt(t), f = frame(w, h, 6, h * .6), g: Frame = { ...f, top: h * .64, bot: h - 6 }; grid(c, f, p); const cw = candles(c, f, bs, p);
    let acc = 0; const pts = bs.map(b => (acc += 2 * b.takerBuy - b.volume)); const mn = Math.min(0, ...pts), mx = Math.max(0, ...pts); g.lo = mn - (mx - mn) * .1; g.hi = mx + (mx - mn) * .1;
    c.strokeStyle = p.grid; c.beginPath(); c.moveTo(0, h * .62); c.lineTo(f.x1, h * .62); c.stroke();
    c.strokeStyle = alpha(p.muted, .6); c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, yOf(g, 0)); c.lineTo(g.x1, yOf(g, 0)); c.stroke(); c.setLineDash([]);
    c.lineWidth = 1.5; for (let i = 1; i < pts.length; i++) { c.strokeStyle = pts[i]! >= pts[i - 1]! ? p.up : p.down; c.beginPath(); c.moveTo((i - .5) * cw, yOf(g, pts[i - 1]!)); c.lineTo((i + .5) * cw, yOf(g, pts[i]!)); c.stroke(); }
    axis(c, f, w, p, bs[bs.length - 1]); c.font = '9px ui-monospace,monospace'; c.fillStyle = p.muted; c.textAlign = 'left'; c.fillText(`CVD ${acc >= 0 ? '+' : ''}${acc.toFixed(0)}`, 6, g.top + 8);
  },
  profile(c, w, h, t, p) {
    const bs = windowAt(t), f = frame(w, h); grid(c, f, p); candles(c, { ...f, x1: f.x1 * .74 }, bs, p);
    const rows = 40, bucket = (f.hi - f.lo) / rows, vals = new Array<number>(rows).fill(0);
    for (const b of bs) { const r0 = Math.max(0, Math.floor((f.hi - b.high) / bucket)), r1 = Math.min(rows - 1, Math.floor((f.hi - b.low) / bucket)); for (let r = r0; r <= r1; r++) vals[r]! += b.volume / (r1 - r0 + 1); }
    const tot = vals.reduce((a, z) => a + z, 0); let poc = 0; vals.forEach((v, r) => { if (v > vals[poc]!) poc = r; });
    let a = poc, z = poc, sum = vals[poc]!; while (sum < tot * .7 && (a > 0 || z < rows - 1)) { const up = a > 0 ? vals[a - 1]! : -1, dn = z < rows - 1 ? vals[z + 1]! : -1; if (up >= dn) sum += vals[--a]!; else sum += vals[++z]!; }
    const rh = (f.bot - f.top) / rows, mx = vals[poc]! || 1; c.fillStyle = alpha(p.va, .07); c.fillRect(0, f.top + a * rh, f.x1, (z - a + 1) * rh);
    vals.forEach((v, r) => { const bw = v / mx * f.x1 * .3, inVa = r >= a && r <= z; c.fillStyle = r === poc ? p.poc : alpha(inVa ? p.va : p.muted, inVa ? .55 : .3); c.fillRect(f.x1 - bw, f.top + r * rh + .5, bw, rh - 1); });
    c.strokeStyle = p.poc; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, f.top + (poc + .5) * rh); c.lineTo(f.x1, f.top + (poc + .5) * rh); c.stroke();
    c.font = '9px ui-monospace,monospace'; c.fillStyle = p.muted; c.textAlign = 'left'; c.fillText('VAH', 4, f.top + a * rh - 4); c.fillText('VAL', 4, f.top + (z + 1) * rh + 9);
    axis(c, f, w, p, bs[bs.length - 1]);
  },
  whales(c, w, h, t, p) {
    const fw = Math.max(150, w * .36), bs = windowAt(t), f = frame(w - fw, h); grid(c, f, p); const cw = candles(c, f, bs, p), lastK = Math.floor(t / STEP);
    const ev: { k: number; buy: boolean; price: number; usd: number; i: number }[] = [];
    bs.forEach((b, i) => { const k = lastK - (bs.length - 1) + i; if (b.volume < VQ) return; const buy = b.takerBuy * 2 > b.volume; ev.push({ k, buy, price: buy ? b.low + (b.close - b.low) * .6 : b.high - (b.high - b.close) * .6, usd: b.volume / VMAX * 1.3e6 * (.6 + hash(mod(k), 3)), i }); });
    ev.forEach(e => { const r = 3 + Math.sqrt(e.usd / 1e5) * 2.4, col = e.buy ? p.up : p.down, x = (e.i + .5) * cw; c.fillStyle = alpha(col, .3); c.strokeStyle = col; c.beginPath(); c.arc(x, yOf(f, e.price), r, 0, 7); c.fill(); c.stroke(); });
    axis(c, f, w - fw, p, bs[bs.length - 1]);
    const fx = w - fw; c.fillStyle = alpha(p.muted, .08); c.fillRect(fx, 0, fw, h); c.strokeStyle = p.grid; c.beginPath(); c.moveTo(fx + .5, 0); c.lineTo(fx + .5, h); c.stroke();
    c.font = 'bold 10px system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = p.gold; c.fillText(`Whale feed · ${ev.length}`, fx + 8, 12);
    const rowH = 18, age = (t / STEP) % 1; c.font = '10px ui-monospace,monospace';
    ev.slice().reverse().slice(0, Math.floor((h - 26) / rowH)).forEach((e, j) => { const slide = j === 0 && e.k === lastK ? (1 - Math.min(1, age * 3)) * rowH : 0, y = 30 + j * rowH - slide, big = e.usd >= 1e6;
      c.globalAlpha = j === 0 ? Math.min(1, age * 3 + .3) : 1;
      if (big) { c.fillStyle = alpha(p.gold, .14); c.fillRect(fx + 2, y - rowH / 2 + 1, fw - 4, rowH - 2); }
      c.fillStyle = p.muted; c.textAlign = 'left'; c.fillText(hms(timeOf(e.k) + Math.floor(hash(e.k, 9) * 59000)), fx + 6, y);
      c.fillStyle = e.buy ? p.up : p.down; c.fillText(e.buy ? 'Buy' : 'Sell', fx + 6 + fw * .36, y);
      c.fillStyle = big ? p.gold : p.text; c.textAlign = 'right'; c.fillText(fmtUsd(e.usd), fx + fw - 6, y); c.globalAlpha = 1; });
  },
  liquidations(c, w, h, t, p) {
    const bs = windowAt(t), f = frame(w, h, 6, h * .7), g = { top: h * .74, bot: h - 4 }; grid(c, f, p); const cw = candles(c, f, bs, p);
    const liq = bs.map(b => { const mv = (b.close - b.open) / b.open / 0.0009, big = b.volume > VQ * .7; return { long: big && mv < -.6 ? b.volume * (-mv) * 9e3 : b.volume * 200, short: big && mv > .6 ? b.volume * mv * 9e3 : b.volume * 180 }; });
    const mx = Math.max(...liq.map(l => Math.max(l.long, l.short))) || 1, mid = (g.top + g.bot) / 2;
    c.strokeStyle = p.grid; c.beginPath(); c.moveTo(0, mid); c.lineTo(f.x1, mid); c.stroke();
    liq.forEach((l, i) => { const x = i * cw + cw * .15, bw = cw * .7; c.fillStyle = alpha(p.down, .8); c.fillRect(x, mid, bw, l.long / mx * (g.bot - mid)); c.fillStyle = alpha(p.up, .8); c.fillRect(x, mid, bw, -l.short / mx * (mid - g.top));
      const b = bs[i]!; for (const [v, buy] of [[l.long, false], [l.short, true]] as const) if (v > mx * .35) { const col = buy ? p.up : p.down, y = yOf(f, buy ? b.high : b.low) + (buy ? -9 : 9); c.fillStyle = alpha(col, .35); c.strokeStyle = col; c.beginPath(); c.arc(x + bw / 2, y, 3 + Math.sqrt(v / mx) * 6, 0, 7); c.fill(); c.stroke(); } });
    axis(c, f, w, p, bs[bs.length - 1]); c.font = '9px ui-monospace,monospace'; c.fillStyle = p.muted; c.textAlign = 'left'; c.fillText('Longs ▼ / Shorts ▲ liquidated', 6, g.top + 6);
  },
  pressure(c, w, h, t, p) {
    const bs = windowAt(t), sh = Math.max(22, h * .12), cw = (w - AXIS) / bs.length;
    const sc = bs.map(b => { const r = b.high - b.low || 1; return .4 * (b.close - b.open) / r + .35 * ((b.close - b.low) / r * 2 - 1) + .25 * deltaRatio(b); });
    const ctl = sc.slice(-20).reduce((a, z) => a + z, 0) / 20, att = sc[sc.length - 1]!;
    const strip = (y: number, label: string, txt: string, v: number) => { const col = v >= 0 ? p.up : p.down; c.fillStyle = alpha(col, .14); c.fillRect(0, y, w, sh); c.font = `bold ${Math.min(11, sh * .42)}px system-ui`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = p.muted; c.fillText(label, 8, y + sh / 2); c.fillStyle = col; c.fillText(txt, 70, y + sh / 2); const m = Math.min(1, Math.abs(v) * 2) * w * .18; c.fillStyle = alpha(p.muted, .25); c.fillRect(w - 8 - w * .18, y + sh * .38, w * .18, sh * .24); c.fillStyle = col; c.fillRect(w - 8 - m, y + sh * .38, m, sh * .24); };
    strip(0, 'CONTROL', ctl >= 0 ? 'Buyers are in control' : 'Sellers are in control', ctl);
    strip(h - sh, 'ATTACK', Math.abs(att) < .25 ? 'No one is attacking' : att > 0 ? 'Buyers are attacking' : 'Sellers are attacking', att);
    const p1 = { top: sh + 6, bot: (h) / 2 - 2 }, p2 = { top: h / 2 + 2, bot: h - sh - 6 };
    let acc = 0; const cum = sc.map(v => (acc += v)); const mn = Math.min(0, ...cum), mx = Math.max(0, ...cum), yc = (v: number) => p1.bot - (v - mn) / (mx - mn || 1) * (p1.bot - p1.top);
    c.strokeStyle = alpha(p.muted, .5); c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, yc(0)); c.lineTo(w - AXIS, yc(0)); c.stroke(); c.setLineDash([]);
    c.lineWidth = 1.5; c.strokeStyle = p.gold; c.beginPath(); cum.forEach((v, i) => i ? c.lineTo((i + .5) * cw, yc(v)) : c.moveTo(cw / 2, yc(v))); c.stroke();
    const m2 = (p2.top + p2.bot) / 2; c.strokeStyle = p.grid; c.beginPath(); c.moveTo(0, m2); c.lineTo(w - AXIS, m2); c.stroke();
    bs.forEach((b, i) => { const up = b.takerBuy / VMAX * 1.6, dn = (b.volume - b.takerBuy) / VMAX * 1.6; c.fillStyle = alpha(p.up, .75); c.fillRect(i * cw + cw * .15, m2, cw * .7, -Math.min(1, up) * (m2 - p2.top)); c.fillStyle = alpha(p.down, .75); c.fillRect(i * cw + cw * .15, m2, cw * .7, Math.min(1, dn) * (p2.bot - m2)); });
    c.font = '9px ui-monospace,monospace'; c.fillStyle = p.muted; c.textAlign = 'left'; c.fillText('Pressure', w - AXIS + 4, p1.top + 8); c.fillText('Up / Down', w - AXIS + 4, p2.top + 8);
  },
  radar(c, w, h, t, p) {
    const bs = windowAt(t), f = frame(w, h, 16, h - 16); grid(c, f, p); const cw = candles(c, f, bs, p), lastK = Math.floor(t / STEP), { setups, pats } = radarMarks();
    c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    bs.forEach((b, i) => { const k = lastK - (bs.length - 1) + i; if (k === lastK) return; const x = (i + .5) * cw, s = setups.get(mod(k)), pt = pats.get(mod(k));
      if (s) { const buy = s.side === 'buy', col = buy ? p.up : p.down, y = buy ? yOf(f, b.low) + 9 : yOf(f, b.high) - 9; c.fillStyle = col; c.beginPath(); if (buy) { c.moveTo(x, y - 5); c.lineTo(x - 5, y + 3); c.lineTo(x + 5, y + 3); } else { c.moveTo(x, y + 5); c.lineTo(x - 5, y - 3); c.lineTo(x + 5, y - 3); } c.fill(); c.fillText('A', x, buy ? y + 10 : y - 10);
        const x2 = Math.min(f.x1, x + cw * 6); if (k >= lastK - 10) for (const [pr, cl] of [[s.target, p.up], [s.stop, p.down], [s.entry, p.muted]] as const) { c.strokeStyle = alpha(buy || cl === p.muted ? cl : cl === p.up ? p.down : p.up, .7); c.setLineDash([3, 2]); c.beginPath(); c.moveTo(x, yOf(f, pr)); c.lineTo(x2, yOf(f, pr)); c.stroke(); c.setLineDash([]); } }
      else if (pt && pt.label === 'Setup' || (pt && mod(k) % 2 === 0)) { if (!pt) return; const buy = pt.side === 1, y = buy ? yOf(f, b.low) + 8 : yOf(f, b.high) - 8, col = pt.label === 'Setup' ? (buy ? p.up : p.down) : p.gold; c.strokeStyle = col; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.stroke(); c.fillStyle = col; c.fillText(pt.label, x, buy ? y + 9 : y - 9); } });
    axis(c, f, w, p, bs[bs.length - 1]);
  },
};
export function drawClip(kind: ClipKind, c: C, w: number, h: number, t: number, p: Pal) {
  c.clearRect(0, 0, w, h); c.fillStyle = p.bg; c.fillRect(0, 0, w, h); c.save(); draw[kind](c, w, h, ((t % LOOP) + LOOP) % LOOP, p); c.restore();
  c.font = 'bold 9px system-ui'; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillStyle = p.muted; c.fillText('DEMO DATA', 6, h - 3);
}
// Only the most-visible clip runs. Pure so it can be tested.
export function pickActive(vis: Map<string, number>, min = .35): string | null {
  let id: string | null = null, best = min; for (const [k, v] of vis) if (v >= best) { best = v; id = k; } return id;
}
