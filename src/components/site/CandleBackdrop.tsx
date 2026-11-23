import { useEffect, useRef } from "react";

/** Decorative looping candle animation for the outer site pages. Canvas, rAF, pauses when hidden. */
export function CandleBackdrop({ dim = false, bright = false, speed = 1 }: { dim?: boolean; bright?: boolean; speed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, last = performance.now(), t = 0;
    const N = 48; let candles: { o: number; c: number; hi: number; lo: number; v: number }[] = [];
    const gen = () => {
      candles = []; let p = 0.5;
      for (let i = 0; i < N; i++) {
        const o = p, c = Math.min(.85, Math.max(.15, o + (Math.random() - .47) * .08));
        candles.push({ o, c, hi: Math.max(o, c) + Math.random() * .03, lo: Math.min(o, c) - Math.random() * .03, v: .3 + Math.random() * .7 }); p = c;
      }
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const STEP = 0.18, HOLD = 3; // seconds per candle, seconds held at end
    const cycle = N * STEP + HOLD;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const lt = reduced ? cycle : t % cycle;
      const gap = w / N, bw = Math.max(2, gap * .55), top = h * .12, span = h * .62;
      const y = (v: number) => top + (1 - v) * span;
      const fadeOut = lt > cycle - .8 ? (cycle - lt) / .8 : 1;
      ctx.globalAlpha = (bright ? 1 : dim ? .35 : .7) * fadeOut;
      const pulse = .75 + .25 * Math.sin(t * 1.2);
      const pts: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const k = Math.min(1, Math.max(0, (lt - i * STEP) / (STEP * 2)));
        if (k <= 0) break;
        const c = candles[i]!; const x = i * gap + gap / 2; const up = c.c >= c.o;
        const col = up ? "#22C55E" : "#EF4444";
        const ease = 1 - Math.pow(1 - k, 3);
        const mid = (c.o + c.c) / 2;
        ctx.strokeStyle = col; ctx.lineWidth = bright ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(x, y(mid) + (y(c.hi) - y(mid)) * ease); ctx.lineTo(x, y(mid) + (y(c.lo) - y(mid)) * ease); ctx.stroke();
        const bt = y(mid) + (y(Math.max(c.o, c.c)) - y(mid)) * ease, bb = y(mid) + (y(Math.min(c.o, c.c)) - y(mid)) * ease;
        ctx.fillStyle = col; ctx.fillRect(x - bw / 2, bt, bw, Math.max(1, bb - bt));
        const vh = h * .12 * c.v * ease * pulse;
        ctx.globalAlpha *= .35; ctx.fillRect(x - bw / 2, h - vh - h * .04, bw, vh); ctx.globalAlpha /= .35;
        pts.push([x, y(c.c)]);
      }
      if (pts.length > 1) {
        ctx.strokeStyle = "#F5B83D"; ctx.globalAlpha *= .5; ctx.lineWidth = 1.5; ctx.beginPath();
        pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); ctx.stroke();
        const [lx, ly] = pts[pts.length - 1]!; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(w, ly); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    };
    const loop = (now: number) => {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      const prev = t % cycle; t += dt * speed; if (t % cycle < prev) gen();
      draw(); raf = requestAnimationFrame(loop);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduced) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    gen(); resize(); draw();
    const ro = new ResizeObserver(() => { resize(); draw(); }); ro.observe(canvas);
    document.addEventListener("visibilitychange", vis); vis();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [dim, bright, speed]);
  return <canvas ref={ref} aria-hidden data-testid="candle-backdrop" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
