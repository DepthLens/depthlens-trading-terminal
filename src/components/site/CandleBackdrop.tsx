import { useEffect, useRef } from "react";

type C = { o: number; c: number; hi: number; lo: number; v: number };

/** Decorative candle chart backdrop: full width from the first frame, slow continuous drift. Canvas, rAF, pauses when hidden. */
export function CandleBackdrop({ dim = false, bright = false, speed = 1 }: { dim?: boolean; bright?: boolean; speed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, last = performance.now(), off = 0, n = 36;
    let p = 0.5; const candles: C[] = [];
    const next = (): C => {
      const o = p, c = Math.min(.88, Math.max(.12, o + (Math.random() - (o > .6 ? .55 : o < .4 ? .45 : .5)) * .07));
      p = c;
      return { o, c, hi: Math.max(o, c) + Math.random() * .035, lo: Math.min(o, c) - Math.random() * .035, v: .3 + Math.random() * .7 };
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      n = w < 640 ? 20 : w < 1024 ? 28 : 36;
      while (candles.length < n + 2) candles.push(next());
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const gap = w / n, bw = Math.max(6, gap * .5), top = h * .1, span = h * .66;
      let mn = 1, mx = 0; for (const c of candles) { mn = Math.min(mn, c.lo); mx = Math.max(mx, c.hi); }
      const rg = Math.max(.05, mx - mn);
      const y = (v: number) => top + (1 - (v - mn) / rg) * span;
      ctx.globalAlpha = bright ? 1 : dim ? .35 : .7;
      const pts: [number, number][] = [];
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i]!; const x = (i - off) * gap + gap / 2;
        if (x < -gap || x > w + gap) continue;
        const col = c.c >= c.o ? "#22C55E" : "#EF4444";
        ctx.strokeStyle = col; ctx.lineWidth = 1.75;
        ctx.beginPath(); ctx.moveTo(x, y(c.hi)); ctx.lineTo(x, y(c.lo)); ctx.stroke();
        const bt = y(Math.max(c.o, c.c)), bb = y(Math.min(c.o, c.c));
        ctx.fillStyle = col; ctx.fillRect(x - bw / 2, bt, bw, Math.max(2, bb - bt));
        const vh = h * .1 * c.v;
        ctx.globalAlpha *= .3; ctx.fillRect(x - bw / 2, h - vh - h * .03, bw, vh); ctx.globalAlpha /= .3;
        pts.push([x, y(c.c)]);
      }
      if (pts.length > 1) {
        ctx.strokeStyle = "#F5B83D"; ctx.globalAlpha *= .45; ctx.lineWidth = 1.5; ctx.beginPath();
        pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    const loop = (now: number) => {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      off += dt * speed * 0.6; // candles per second
      while (off >= 1) { off -= 1; candles.shift(); candles.push(next()); }
      draw(); raf = requestAnimationFrame(loop);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduced) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    resize(); draw();
    const ro = new ResizeObserver(() => { resize(); draw(); }); ro.observe(canvas);
    document.addEventListener("visibilitychange", vis); vis();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [dim, bright, speed]);
  return <canvas ref={ref} aria-hidden data-testid="candle-backdrop" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
