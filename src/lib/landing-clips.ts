// Browser-safe drawing for landing-page mini clips. Pure demo data, no sockets, loops every LOOP seconds.
export const LOOP = 30;
export type ClipKind = 'heatmap' | 'footprint' | 'dom' | 'cvd' | 'profile' | 'whales' | 'liquidations' | 'pressure' | 'radar';
export type Pal = { up: string; down: string; poc: string; va: string; text: string; muted: string; grid: string; bg: string; heat: string; gold: string };
type C = CanvasRenderingContext2D;
const N = 48;
// Seamless loop: price path is periodic in t.
const px = (i: number, t: number) => { const a = (i / N + t / LOOP) * Math.PI * 2; return Math.sin(a * 3) * .28 + Math.sin(a * 7 + 1) * .1 + Math.sin(a * 2) * .12; };
const bars = (t: number, n = N) => Array.from({ length: n }, (_, i) => { const o = px(i, t), c = px(i + 1, t); return { o, c, h: Math.max(o, c) + .06 + .04 * Math.abs(Math.sin(i * 2.3)), l: Math.min(o, c) - .06 - .04 * Math.abs(Math.cos(i * 1.7)), v: .3 + Math.abs(Math.sin(i * 1.3 + t * .2)) * .7 }; });
const Y = (v: number, h: number, top = .08, bot = .92) => h * (top + (bot - top) * (.5 - v * .9));
function candles(c: C, w: number, h: number, t: number, p: Pal, n = N, x0 = 0, x1 = w, top = .08, bot = .92, outline = false) {
  const bs = bars(t, n), cw = (x1 - x0) / n;
  bs.forEach((b, i) => {
    const x = x0 + i * cw + cw / 2, col = b.c >= b.o ? p.up : p.down;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1;
    c.beginPath(); c.moveTo(Math.round(x) + .5, Y(b.h, h, top, bot)); c.lineTo(Math.round(x) + .5, Y(b.l, h, top, bot)); c.stroke();
    const y1 = Y(Math.max(b.o, b.c), h, top, bot), y2 = Y(Math.min(b.o, b.c), h, top, bot);
    if (outline) c.strokeRect(x - cw * .35, y1, cw * .7, Math.max(1, y2 - y1)); else c.fillRect(x - cw * .35, y1, cw * .7, Math.max(1, y2 - y1));
  });
  return bs;
}
function grid(c: C, w: number, h: number, p: Pal) { c.strokeStyle = p.grid; c.lineWidth = 1; for (let i = 1; i < 6; i++) { const y = Math.round(h * i / 6) + .5; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }
const alpha = (col: string, a: number) => `color-mix(in srgb, ${col} ${Math.round(a * 100)}%, transparent)`;

const draw: Record<ClipKind, (c: C, w: number, h: number, t: number, p: Pal) => void> = {
  heatmap(c, w, h, t, p) {
    c.fillStyle = p.heat; c.fillRect(0, 0, w, h);
    const cols = 90, rows = 60, cw = w / cols, rh = h / rows;
    for (let x = 0; x < cols; x++) for (let r = 0; r < rows; r++) {
      const k = (x / cols + t / LOOP) * Math.PI * 2;
      const wall = Math.exp(-(((r - 18 - Math.sin(k) * 3) / 1.5) ** 2)) + Math.exp(-(((r - 42 + Math.cos(k) * 2) / 1.2) ** 2)) * .9;
      const v = Math.min(1, wall + .25 * Math.abs(Math.sin(r * 1.7 + x * .05)) ** 3);
      if (v < .08) continue;
      c.fillStyle = `hsl(${240 - v * 200} 90% ${20 + v * 40}%)`; c.fillRect(x * cw, r * rh, cw + .5, rh + .5);
    }
    c.strokeStyle = p.text; c.lineWidth = 1.5; c.beginPath();
    for (let x = 0; x <= cols; x++) { const y = h * (.5 - px(x * N / cols, t) * .7); x ? c.lineTo(x * cw, y) : c.moveTo(0, y); } c.stroke();
  },
  footprint(c, w, h, t, p) {
    const n = 8, cw = w / n, bs = bars(t, n);
    bs.forEach((b, i) => {
      const x = i * cw, top = Y(b.h, h), bot = Y(b.l, h), rows = 9, rh = (bot - top) / rows;
      c.strokeStyle = b.c >= b.o ? p.up : p.down; c.strokeRect(x + 4, top, cw - 8, bot - top);
      for (let r = 0; r < rows; r++) {
        const s = Math.exp(-(((r - 4) / 2.5) ** 2)), bid = Math.round(20 + s * 180 * (1 + Math.sin(i + r + t * .4) * .3)), ask = Math.round(20 + s * 180 * (1 + Math.cos(i * 2 + r - t * .4) * .3));
        const y = top + r * rh, imb = ask > bid * 1.6 ? p.up : bid > ask * 1.6 ? p.down : null;
        c.fillStyle = alpha(p.down, .12 + .5 * bid / 400); c.fillRect(x + 6, y + .5, (cw / 2 - 6) * Math.max(.12, bid / 260), rh - 1);
        c.fillStyle = alpha(p.up, .12 + .5 * ask / 400); c.fillRect(x + cw / 2, y + .5, (cw / 2 - 6) * Math.max(.12, ask / 260), rh - 1);
        if (r === 4) { c.strokeStyle = p.poc; c.strokeRect(x + 5, y, cw - 10, rh); }
        if (rh < 9) continue;
        c.font = `${imb ? 'bold ' : ''}${Math.max(8, Math.min(11, rh * .7))}px ui-monospace,monospace`; c.textBaseline = 'middle';
        c.fillStyle = imb === p.down ? p.down : p.text; c.textAlign = 'right'; c.fillText(String(bid), x + cw / 2 - 3, y + rh / 2);
        c.fillStyle = imb === p.up ? p.up : p.text; c.textAlign = 'left'; c.fillText(String(ask), x + cw / 2 + 3, y + rh / 2);
      }
    });
  },
  dom(c, w, h, t, p) {
    const rows = 22, rh = h / rows, mid = rows / 2, shift = Math.round(Math.sin(t / LOOP * Math.PI * 2) * 2);
    c.font = `${Math.min(12, rh * .65)}px ui-monospace,monospace`; c.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) {
      const ask = r < mid + shift, d = Math.abs(r - mid - shift + .5), size = (1 + Math.abs(Math.sin(r * 2.1 + t * .3)) * 3) * (r === 3 || r === 18 ? 4 : 1) / (1 + d * .05);
      const col = ask ? p.down : p.up, bw = Math.min(1, size / 16) * w * .5, y = r * rh;
      c.fillStyle = alpha(col, size > 10 ? .55 : .25); c.fillRect(w - bw, y + 1, bw, rh - 2);
      c.fillStyle = col; c.textAlign = 'left'; c.fillText((64250 + (mid - r) * 0.5).toFixed(1), 8, y + rh / 2);
      c.fillStyle = p.text; c.textAlign = 'right'; c.fillText(size.toFixed(2), w - 8, y + rh / 2);
    }
    c.strokeStyle = p.gold; c.beginPath(); c.moveTo(0, (mid + shift) * rh); c.lineTo(w, (mid + shift) * rh); c.stroke();
  },
  cvd(c, w, h, t, p) {
    grid(c, w, h, p); const bs = candles(c, w, h, t, p, N, 0, w, .05, .55);
    const cw = w / N; let acc = 0; const pts: number[] = [];
    bs.forEach((b, i) => { const d = (b.c - b.o) * 4 + Math.sin(i * .9) * .2; acc += d; pts.push(acc); c.fillStyle = alpha(d >= 0 ? p.up : p.down, .7); const z = h * .82; c.fillRect(i * cw + cw * .15, z, cw * .7, -d * h * .15); });
    const mn = Math.min(...pts), mx = Math.max(...pts) || 1; c.strokeStyle = p.gold; c.lineWidth = 1.5; c.beginPath();
    pts.forEach((v, i) => { const y = h * .6 + (1 - (v - mn) / (mx - mn || 1)) * h * .14; i ? c.lineTo(i * cw + cw / 2, y) : c.moveTo(cw / 2, y); }); c.stroke();
    c.strokeStyle = p.muted; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, h * .82); c.lineTo(w, h * .82); c.stroke(); c.setLineDash([]);
  },
  profile(c, w, h, t, p) {
    grid(c, w, h, p); candles(c, w, h, t, p, N, 0, w * .72);
    const rows = 40, rh = h / rows; let poc = 0, best = 0; const vals: number[] = [];
    for (let r = 0; r < rows; r++) { const v = Math.exp(-(((r - 20 - Math.sin(t / LOOP * Math.PI * 2) * 4) / 7) ** 2)) + .2 * Math.abs(Math.sin(r * 1.3)); vals.push(v); if (v > best) { best = v; poc = r; } }
    c.fillStyle = alpha(p.va, .08); c.fillRect(0, (poc - 7) * rh, w, 14 * rh);
    vals.forEach((v, r) => { const bw = v / best * w * .3; c.fillStyle = r === poc ? p.poc : alpha(r >= poc - 7 && r < poc + 7 ? p.va : p.muted, .55); c.fillRect(w - bw, r * rh + .5, bw, rh - 1); });
    c.strokeStyle = p.poc; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, (poc + .5) * rh); c.lineTo(w, (poc + .5) * rh); c.stroke();
  },
  whales(c, w, h, t, p) {
    grid(c, w, h, p); const bs = candles(c, w, h, t, p), cw = w / N;
    bs.forEach((b, i) => { if ((i * 7) % 5) return; const n = [50, 250, 1200, 100][i % 4] ?? 50, r = 4 + Math.sqrt(n) * .45, buy = i % 2 === 0, col = buy ? p.up : p.down; c.fillStyle = alpha(col, .35); c.strokeStyle = col; c.beginPath(); c.arc(i * cw + cw / 2, Y((b.h + b.l) / 2, h), r, 0, Math.PI * 2); c.fill(); c.stroke(); });
  },
  liquidations(c, w, h, t, p) {
    grid(c, w, h, p); const bs = candles(c, w, h, t, p, N, 0, w, .05, .68), cw = w / N;
    bs.forEach((b, i) => { const lg = Math.max(0, Math.sin(i * 1.9 + 1)) ** 3, sh = Math.max(0, Math.cos(i * 1.3)) ** 3; c.fillStyle = alpha(p.down, .8); c.fillRect(i * cw + cw * .15, h * .86, cw * .7, -lg * h * .14); c.fillStyle = alpha(p.up, .8); c.fillRect(i * cw + cw * .15, h * .86, cw * .7, sh * h * .12);
      if (lg > .6) { c.fillStyle = alpha(p.down, .4); c.strokeStyle = p.down; c.beginPath(); c.arc(i * cw + cw / 2, Y(b.l, h, .05, .68) + 8, 4 + lg * 6, 0, Math.PI * 2); c.fill(); c.stroke(); } });
  },
  pressure(c, w, h, t, p) {
    const bs = bars(t); const stripH = h * .16, cw = w / N;
    const ctl = bs.slice(-12).reduce((s, b) => s + (b.c - b.o), 0), buy = ctl >= 0;
    c.fillStyle = alpha(buy ? p.up : p.down, .18); c.fillRect(0, 0, w, stripH); c.fillStyle = buy ? p.up : p.down; c.font = `bold ${Math.min(13, stripH * .4)}px system-ui`; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillText(buy ? 'Buyers are in control' : 'Sellers are in control', 10, stripH / 2);
    const m = Math.min(1, Math.abs(ctl) * 2); c.fillRect(w - 10 - w * .25 * m, stripH * .35, w * .25 * m, stripH * .3);
    const pane = (y0: number, y1: number, f: (i: number) => number, two: boolean) => { const mid = (y0 + y1) / 2; c.strokeStyle = p.grid; c.beginPath(); c.moveTo(0, mid); c.lineTo(w, mid); c.stroke();
      bs.forEach((_, i) => { const v = f(i); c.fillStyle = alpha(v >= 0 ? p.up : p.down, .75); c.fillRect(i * cw + cw * .15, mid, cw * .7, -v * (y1 - y0) * .45); if (two) { c.fillStyle = alpha(p.down, .5); c.fillRect(i * cw + cw * .15, mid, cw * .7, Math.abs(Math.cos(i * .7 + t * .2)) * (y1 - y0) * .3); } }); };
    pane(stripH + 6, h * .58, i => { const b = bs[i]; return b ? (b.c - b.o) * 3 : 0; }, false);
    pane(h * .6, h, i => Math.abs(Math.sin(i * .5 + t * .2)) * .8, true);
  },
  radar(c, w, h, t, p) {
    grid(c, w, h, p); const bs = candles(c, w, h, t, p), cw = w / N;
    c.font = 'bold 10px system-ui'; c.textAlign = 'center';
    bs.forEach((b, i) => { if (i < 2) return; const prev = bs[i - 1]; if (!prev) return;
      if (prev.c < prev.o && b.c > b.o && (i % 6 === 0)) { const x = i * cw + cw / 2, y = Y(b.l, h) + 12; c.fillStyle = p.up; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x - 5, y + 2); c.lineTo(x + 5, y + 2); c.fill(); c.fillText('A', x, y + 12); }
      else if (i % 11 === 0) { const x = i * cw + cw / 2, y = Y(b.h, h) - 12; c.strokeStyle = p.gold; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.stroke(); c.fillStyle = p.gold; c.fillText('Watch', x, y - 10); } });
  },
};
export function drawClip(kind: ClipKind, c: C, w: number, h: number, t: number, p: Pal) {
  c.clearRect(0, 0, w, h); c.fillStyle = p.bg; c.fillRect(0, 0, w, h); c.save(); draw[kind](c, w, h, ((t % LOOP) + LOOP) % LOOP, p); c.restore();
  c.font = 'bold 9px system-ui'; c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillStyle = p.muted; c.fillText('DEMO DATA', w - 6, h - 4);
}
// Only the most-visible clip runs. Pure so it can be tested.
export function pickActive(vis: Map<string, number>, min = .35): string | null {
  let id: string | null = null, best = min; for (const [k, v] of vis) if (v >= best) { best = v; id = k; } return id;
}
