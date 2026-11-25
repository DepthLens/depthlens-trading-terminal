import { useEffect, useRef } from "react";

export type PreviewKind = "heatmap" | "footprint" | "cvd" | "profile" | "radar";
const C = { gold: "240,185,11", up: "14,203,129", down: "246,70,93", grid: "132,142,156", text: "234,236,239" };
const rgba = (c: string, a: number) => `rgba(${c},${a})`;
const W = 96, H = 56;
// deterministic smooth noise
const n = (x: number) => Math.sin(x * 1.37) * 0.5 + Math.sin(x * 0.53 + 1.3) * 0.35 + Math.sin(x * 2.9 + 0.7) * 0.15;
const price = (x: number, t: number) => H / 2 + n(x / 14 + t * 0.35) * 11;

function grid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = rgba(C.grid, 0.08); ctx.lineWidth = 1; ctx.beginPath();
  for (let y = 14; y < H; y += 14) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  for (let x = 24; x < W; x += 24) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  ctx.stroke();
}

function heatmap(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = "#050b18"; ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 2) for (let y = 0; y < H; y += 2) {
    const p = price(x, t);
    const wall = Math.exp(-((y - 12) ** 2) / 3) * 0.9 + Math.exp(-((y - 42) ** 2) / 4) * 0.8;
    const v = Math.max(0, wall * (0.7 + 0.3 * n(x / 9 + y)) + 0.12 * Math.abs(n(x / 6 + y / 4 + t * 0.2))) * (Math.abs(y - p) < 3 ? 0.4 : 1);
    if (v < 0.06) continue;
    ctx.fillStyle = v > 0.6 ? rgba("255,214,90", v) : v > 0.3 ? rgba("230,120,40", v) : rgba("40,90,200", v * 1.4);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = rgba(C.text, 0.95); ctx.lineWidth = 1.2; ctx.beginPath();
  for (let x = 0; x <= W; x++) { const y = price(x, t); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  for (let i = 0; i < 4; i++) { const x = (i * 23 + t * 9) % W, y = price(x, t), r = 1.5 + (i % 3); ctx.strokeStyle = rgba(i % 2 ? C.down : C.up, 0.9); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
}

function footprint(ctx: CanvasRenderingContext2D, t: number) {
  grid(ctx); ctx.font = "5px ui-monospace,monospace"; ctx.textBaseline = "middle";
  for (let c = 0; c < 3; c++) {
    const x0 = 4 + c * 31, up = n(c * 3.1 + Math.floor(t / 3)) > 0;
    ctx.fillStyle = rgba(up ? C.up : C.down, 0.9); ctx.fillRect(x0, 10, 2, 36);
    for (let r = 0; r < 7; r++) {
      const y = 9 + r * 5.5, b = Math.round(20 + 60 * Math.abs(n(c * 5 + r * 1.7 + t * 0.4))), a = Math.round(20 + 60 * Math.abs(n(c * 4 + r * 2.3 - t * 0.35)));
      const poc = r === 3 + (c % 2);
      ctx.fillStyle = rgba(C.down, 0.1 + a / 200); ctx.fillRect(x0 + 4, y - 2.2, (a / 80) * 11, 4.4);
      ctx.fillStyle = rgba(C.up, 0.1 + b / 200); ctx.fillRect(x0 + 16, y - 2.2, (b / 80) * 11, 4.4);
      if (poc) { ctx.strokeStyle = rgba(C.gold, 0.9); ctx.strokeRect(x0 + 3.5, y - 2.7, 24, 5.4); }
      ctx.fillStyle = rgba(C.text, b > a * 2.5 || a > b * 2.5 ? 1 : 0.7);
      ctx.fillText(`${a}`, x0 + 5, y); ctx.fillText(`${b}`, x0 + 17, y);
    }
  }
}

function cvd(ctx: CanvasRenderingContext2D, t: number) {
  grid(ctx); const z = 30;
  for (let i = 0; i < 16; i++) { const d = n(i * 0.9 + t * 0.6) * 9; ctx.fillStyle = rgba(d > 0 ? C.up : C.down, 0.55); ctx.fillRect(i * 6 + 1, d > 0 ? H - 4 - d : H - 4, 4, Math.abs(d)); }
  ctx.strokeStyle = rgba(C.grid, 0.35); ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(0, z + 0.5); ctx.lineTo(W, z + 0.5); ctx.stroke(); ctx.setLineDash([]);
  const pts: [number, number][] = []; for (let x = 0; x <= W; x += 2) pts.push([x, z - (x / W) * 12 - n(x / 11 + t * 0.4) * 8]);
  const g = ctx.createLinearGradient(0, 4, 0, z); g.addColorStop(0, rgba(C.gold, 0.35)); g.addColorStop(1, rgba(C.gold, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, z); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(W, z); ctx.fill();
  ctx.strokeStyle = rgba(C.gold, 1); ctx.lineWidth = 1.3; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  const [lx, ly] = pts[pts.length - 1]!; ctx.fillStyle = rgba(C.gold, 1); ctx.beginPath(); ctx.arc(lx - 1, ly, 1.8, 0, 7); ctx.fill();
}

function profile(ctx: CanvasRenderingContext2D, t: number) {
  grid(ctx);
  // candles on the left
  for (let i = 0; i < 9; i++) { const o = price(i * 6, t * 0.3), c = price(i * 6 + 6, t * 0.3), hi = Math.min(o, c) - 3, lo = Math.max(o, c) + 3, x = 3 + i * 6; ctx.strokeStyle = ctx.fillStyle = rgba(c < o ? C.up : C.down, 0.85); ctx.beginPath(); ctx.moveTo(x + 1.5, hi); ctx.lineTo(x + 1.5, lo); ctx.stroke(); ctx.fillRect(x, Math.min(o, c), 3, Math.max(1, Math.abs(c - o))); }
  const rows = 14, poc = 6 + Math.round(n(t * 0.15) * 1.5);
  ctx.fillStyle = rgba(C.gold, 0.08); ctx.fillRect(56, (poc - 3) * 4, W - 56, 28);
  for (let r = 0; r < rows; r++) { const len = 6 + 30 * Math.exp(-((r - poc) ** 2) / 8) + 4 * Math.abs(n(r * 1.9 + t * 0.2)); ctx.fillStyle = r === poc ? rgba(C.gold, 0.95) : Math.abs(r - poc) <= 3 ? rgba(C.grid, 0.55) : rgba(C.grid, 0.25); ctx.fillRect(W - len, r * 4 + 0.5, len, 3); }
  ctx.strokeStyle = rgba(C.gold, 0.8); ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(0, poc * 4 + 2); ctx.lineTo(W, poc * 4 + 2); ctx.stroke(); ctx.setLineDash([]);
}

function radar(ctx: CanvasRenderingContext2D, t: number) {
  grid(ctx);
  const cs: { o: number; c: number }[] = []; for (let i = 0; i < 12; i++) cs.push({ o: price(i * 7, 0.2 * Math.floor(t / 4)), c: price(i * 7 + 7, 0.2 * Math.floor(t / 4)) });
  cs.forEach(({ o, c }, i) => { const x = 3 + i * 7.6; ctx.strokeStyle = ctx.fillStyle = rgba(c < o ? C.up : C.down, 0.9); ctx.beginPath(); ctx.moveTo(x + 2, Math.min(o, c) - 3); ctx.lineTo(x + 2, Math.max(o, c) + 3); ctx.stroke(); ctx.fillRect(x, Math.min(o, c), 4, Math.max(1, Math.abs(c - o))); });
  [3, 8].forEach((i, k) => { const { o, c } = cs[i]!, x = 5 + i * 7.6, bull = c < o, y = bull ? Math.max(o, c) + 8 : Math.min(o, c) - 8, pulse = 0.5 + 0.5 * Math.sin(t * 3 + k);
    ctx.strokeStyle = rgba(bull ? C.up : C.down, 0.4 * pulse); ctx.beginPath(); ctx.arc(x, y, 3 + pulse * 2, 0, 7); ctx.stroke();
    ctx.fillStyle = rgba(bull ? C.up : C.down, 1); ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); });
  const sx = ((t * 14) % (W + 20)) - 10, g = ctx.createLinearGradient(sx - 10, 0, sx, 0); g.addColorStop(0, rgba(C.gold, 0)); g.addColorStop(1, rgba(C.gold, 0.25));
  ctx.fillStyle = g; ctx.fillRect(sx - 10, 0, 10, H); ctx.fillStyle = rgba(C.gold, 0.8); ctx.fillRect(sx, 0, 1, H);
}

const DRAW = { heatmap, footprint, cvd, profile, radar };

/** Small order-flow previews on the login page: one rAF per card at ≤30fps, paused when hidden, static on mobile/reduced motion. */
export function FlowPreview({ kind }: { kind: PreviewKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!, d = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const still = matchMedia("(prefers-reduced-motion: reduce), (max-width: 1023px), (pointer: coarse)").matches;
    let raf = 0, last = performance.now(), acc = 0, t = 0;
    const draw = () => { ctx.clearRect(0, 0, W, H); DRAW[kind](ctx, t); };
    const loop = (now: number) => { const dt = Math.min(now - last, 50); last = now; t += dt / 1000; acc += dt; if (acc >= 33) { acc = 0; draw(); } raf = requestAnimationFrame(loop); };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !still) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    draw(); if (!still) raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); };
  }, [kind]);
  return <canvas ref={ref} aria-hidden="true" className="h-14 w-24 shrink-0 rounded-md border border-[color:var(--s-border)] bg-[color:var(--s-bg)]" />;
}
