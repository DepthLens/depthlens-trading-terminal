import { useEffect, useRef } from "react";

const GOLD = "240,185,11", UP = "14,203,129", DOWN = "246,70,93", GRID = "132,142,156";

/** Login-only ambient background: drifting glows (CSS), faint grid with slowly drawing price lines and fading candles (canvas), mouse light and grain. */
export function LoginAmbient() {
  const ref = useRef<HTMLCanvasElement>(null), spot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce), (max-width: 1023px), (pointer: coarse)").matches;
    let w = 0, h = 0, raf = 0, last = performance.now(), t = 0;
    const resize = () => { const d = Math.min(devicePixelRatio || 1, 2); w = innerWidth; h = innerHeight; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    resize(); const onResize = () => { resize(); if (reduce) draw(); }; addEventListener("resize", onResize);
    const lines = [0, 1, 2].map(i => ({ seed: i * 17.3 + 3, y: 0.3 + i * 0.2, color: [GOLD, UP, GRID][i]!, speed: 0.035 + i * 0.012 }));
    const candles = Array.from({ length: 14 }, (_, i) => ({ x: Math.random(), y: 0.2 + Math.random() * 0.6, up: Math.random() > 0.45, s: 0.6 + Math.random(), ph: (i / 14) * Math.PI * 2, rate: 0.15 + Math.random() * 0.2 }));
    const yAt = (seed: number, x: number) => Math.sin(x * 7 + seed) * 0.05 + Math.sin(x * 19 + seed * 2) * 0.02 + Math.sin(x * 41 + seed * 3) * 0.008;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(${GRID},.06)`; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x < w; x += 64) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); }
      for (let y = 0; y < h; y += 64) { ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); }
      ctx.stroke();
      for (const l of lines) {
        const prog = reduce ? 1 : (t * l.speed) % 1.25, end = Math.min(prog, 1), fade = prog > 1 ? 1 - (prog - 1) / 0.25 : 1;
        ctx.strokeStyle = `rgba(${l.color},${0.22 * fade})`; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let x = 0; x <= end; x += 0.004) { const px = x * w, py = (l.y + yAt(l.seed + Math.floor(t * l.speed / 1.25), x)) * h; if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.stroke();
      }
      for (const c of candles) {
        const a = reduce ? 0.12 : Math.max(0, Math.sin(t * c.rate + c.ph)) * 0.22; if (a < 0.01) continue;
        const x = c.x * w, y = c.y * h, bh = 18 * c.s, col = c.up ? UP : DOWN;
        ctx.fillStyle = ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - bh * 0.9); ctx.lineTo(x, y + bh * 0.9); ctx.stroke(); ctx.fillRect(x - 3.5, y - bh / 2, 7, bh);
      }
    };
    const loop = (now: number) => { t += Math.min(now - last, 50) / 1000; last = now; draw(); raf = requestAnimationFrame(loop); };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    if (reduce) draw(); else raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", vis);
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const move = (e: PointerEvent) => { const s = spot.current; if (s) { s.style.setProperty("--mx", `${e.clientX}px`); s.style.setProperty("--my", `${e.clientY}px`); } };
    if (fine && !reduce) addEventListener("pointermove", move);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", vis); removeEventListener("pointermove", move); };
  }, []);
  return (
    <div aria-hidden="true">
      <div className="lg-glow lg-glow-a" /><div className="lg-glow lg-glow-b" /><div className="lg-glow lg-glow-c" />
      <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0 size-full" />
      <div ref={spot} className="lg-spot" />
      <div className="lg-grain" />
    </div>
  );
}
