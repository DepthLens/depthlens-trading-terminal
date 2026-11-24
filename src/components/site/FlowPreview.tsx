import { useEffect, useRef } from "react";

export type PreviewKind = "heatmap" | "footprint" | "cvd" | "profile" | "radar";
const C = { gold: "240,185,11", up: "14,203,129", down: "246,70,93", info: "59,130,246", muted: "132,142,156" };
const rgba = (c: string, a: number) => `rgba(${c},${a})`;

/** Tiny decorative previews drawn on the login page; one rAF per card, paused when hidden, static under reduced motion. */
export function FlowPreview({ kind }: { kind: PreviewKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!, d = Math.min(devicePixelRatio || 1, 2), W = 96, H = 56;
    cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now(), t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      if (kind === "heatmap") {
        for (let x = 0; x < 16; x++) for (let y = 0; y < 9; y++) {
          const wall = (y === 2 && x < 12 - Math.floor((t * 2) % 6)) || (y === 6 && x > 3);
          const v = wall ? 0.75 : 0.08 + 0.12 * Math.abs(Math.sin(x * 1.7 + y * 2.3 + t));
          ctx.fillStyle = wall ? rgba(C.gold, v) : rgba(C.info, v); ctx.fillRect(x * 6, y * 6 + 1, 5.5, 5.5);
        }
        ctx.strokeStyle = rgba("230,237,243", .9); ctx.beginPath();
        for (let x = 0; x <= W; x += 3) { const y = 28 + Math.sin(x / 12 + t) * 8; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
      } else if (kind === "footprint") {
        for (let i = 0; i < 4; i++) for (let r = 0; r < 6; r++) {
          const b = 0.2 + 0.6 * Math.abs(Math.sin(i * 3 + r * 1.3 + t * .8)), s = 0.2 + 0.6 * Math.abs(Math.cos(i * 2 + r * 1.1 + t * .7));
          ctx.fillStyle = rgba(C.down, s * .8); ctx.fillRect(i * 24 + 2, r * 9 + 2, 9 * s + 1, 7);
          ctx.fillStyle = rgba(C.up, b * .8); ctx.fillRect(i * 24 + 12, r * 9 + 2, 9 * b + 1, 7);
        }
      } else if (kind === "cvd") {
        ctx.strokeStyle = rgba(C.muted, .25); ctx.beginPath(); ctx.moveTo(0, 28.5); ctx.lineTo(W, 28.5); ctx.stroke();
        let v = 0; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let x = 0; x <= W; x += 2) { v = Math.sin(x / 15 + t * .8) * 14 + Math.sin(x / 5 + t * 1.6) * 3; if (x) ctx.lineTo(x, 28 - v); else ctx.moveTo(x, 28 - v); }
        ctx.strokeStyle = rgba(v >= 0 ? C.up : C.down, .95); ctx.stroke(); ctx.lineWidth = 1;
      } else if (kind === "profile") {
        const poc = 3 + Math.round(Math.sin(t * .5) * 1.5);
        for (let r = 0; r < 9; r++) { const len = 10 + 60 * Math.exp(-((r - poc) ** 2) / 6) + 8 * Math.abs(Math.sin(r + t)); ctx.fillStyle = r === poc ? rgba(C.gold, .9) : rgba(C.info, .45); ctx.fillRect(2, r * 6 + 1, len, 4.5); }
      } else {
        const cx = 48, cy = 28; ctx.strokeStyle = rgba(C.muted, .3);
        for (const rr of [8, 16, 24]) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); }
        const a = t * 1.4; const g = ctx.createConicGradient ? ctx.createConicGradient(a - .8, cx, cy) : null;
        if (g) { g.addColorStop(0, rgba(C.gold, 0)); g.addColorStop(.12, rgba(C.gold, .45)); g.addColorStop(.13, rgba(C.gold, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill(); }
        for (const [px, py, c] of [[60, 18, C.up], [36, 38, C.down], [56, 40, C.up]] as const) { ctx.fillStyle = rgba(c, .9); ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); }
      }
    };
    const loop = (now: number) => { t += Math.min(now - last, 50) / 1000; last = now; draw(); raf = requestAnimationFrame(loop); };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    if (reduce) draw(); else raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); };
  }, [kind]);
  return <canvas ref={ref} aria-hidden="true" className="h-14 w-24 shrink-0 rounded-md" />;
}
