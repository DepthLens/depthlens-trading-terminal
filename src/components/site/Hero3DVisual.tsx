import { useEffect, useRef } from 'react';

/** Landing hero: an institutional live candle terminal console. Flat, crisp candles (1px wicks, solid bodies) with a
 *  forming candle, live price line + axis tag with countdown, depth-of-market profile anchored to the price axis,
 *  delta histogram + CVD sub-pane, OHLC legend, time axis and snapping crosshair. The console sits in a subtle CSS
 *  3D tilt with mouse parallax. Seeded demo feed only — no sockets, no fetches, no React state per frame; ≤30 fps,
 *  paused off-screen/hidden, static frame for reduced motion. */
type Candle = { o: number; h: number; l: number; c: number; d: number; t: number };

const UP = [14, 203, 129] as const, DOWN = [246, 70, 93] as const, GOLD = [240, 185, 11] as const;
const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const MUTED = 'rgba(132,142,156,1)', GRID = 'rgba(234,236,239,0.045)', LINE = 'rgba(234,236,239,0.09)';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const CANDLE_MS = 3200, TICK_MS = 120, TICKS_PER = Math.round(CANDLE_MS / TICK_MS), KEEP = 140;
const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const niceStep = (raw: number) => { const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
const hash = (k: number) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clock = (t: number) => { const m = (9 * 60 + 30 + t) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

export function Hero3DVisual({ className = '' }: { className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const priceEl = useRef<HTMLSpanElement>(null);
  const chgEl = useRef<HTMLSpanElement>(null);
  const latEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = cv.current, box = wrap.current, card = tilt.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !box || !card || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── seeded market model ──
    let seed = 20261124;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
    let p = 96180, drift = 0, vol = 5, regime = 0;
    const tick = (k: Candle) => {
      if (--regime <= 0) { drift = (rnd() - 0.5) * 2.2; regime = 50 + rnd() * 180; }
      vol = Math.min(15, Math.max(2.5, vol * 0.97 + 0.15 + (rnd() < 0.025 ? rnd() * 7 : 0)));
      const dp = drift + gauss() * vol; p += dp;
      k.c = p; if (p > k.h) k.h = p; if (p < k.l) k.l = p;
      k.d += Math.sign(dp || 1) * (0.4 + rnd() * 1.6) * (rnd() < 0.05 ? 5 : 1) * 12 + gauss() * 4;
    };
    const fresh = (t: number): Candle => ({ o: p, h: p, l: p, c: p, d: 0, t });
    const cs: Candle[] = [];
    for (let i = 0; i < 110; i++) { const k = fresh(i); for (let j = 0; j < TICKS_PER; j++) tick(k); cs.push(k); }
    const forming = fresh(110); for (let j = 0; j < 6; j++) tick(forming); cs.push(forming);
    const sessionOpen = cs[0]!.o;

    // ── view state ──
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0, start = performance.now(), tickAcc = 0, scroll = 0, uiAt = 0;
    let lo = 0, hi = 0, shown = forming.c, depthStep = 0, visible = true, running = false;
    let hover: { x: number; y: number } | null = null, rx = 0, ry = 0, trx = 0, try_ = 0;
    const fit = () => {
      const r = box.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const small = W < 520, axisW = small ? 60 : 64, timeH = 20, chartR = W - axisW;
      const mainTop = 22, mainH = Math.round((H - timeH) * 0.72) - mainTop, paneTop = mainTop + mainH + 8, paneH = H - timeH - paneTop - 4;
      const spacing = small ? 7 : 8.5, bw = Math.max(2, Math.round(spacing * 0.64)), rightPad = spacing * 5;
      const n = Math.min(cs.length, Math.ceil((chartR - rightPad) / spacing) + 2);
      const vis = cs.slice(cs.length - n);
      const xOf = (j: number) => chartR - rightPad - j * spacing + scroll * spacing; // j = 0 is the forming candle
      const live = cs[cs.length - 1]!;

      // smooth auto-scale
      let a = Infinity, b = -Infinity;
      for (const k of vis) { if (k.l < a) a = k.l; if (k.h > b) b = k.h; }
      const pad = (b - a) * 0.14 + 4; a -= pad; b += pad;
      if (!lo) { lo = a; hi = b; } else { lo += (a - lo) * 0.08; hi += (b - hi) * 0.08; }
      const Y = (v: number) => mainTop + ((hi - v) / (hi - lo)) * mainH;
      shown += (live.c - shown) * 0.4;

      ctx.clearRect(0, 0, W, H);
      ctx.textBaseline = 'middle';

      // grid + price axis labels
      const ps = niceStep((hi - lo) / (small ? 4 : 6));
      ctx.font = `10px ${MONO}`; ctx.textAlign = 'left';
      for (let v = Math.ceil(lo / ps) * ps; v < hi; v += ps) {
        const y = Math.round(Y(v)) + 0.5; if (y < mainTop + 4 || y > mainTop + mainH - 4) continue;
        ctx.fillStyle = GRID; ctx.fillRect(0, y, chartR, 1);
        ctx.fillStyle = MUTED; ctx.fillText(fmt(v), chartR + 8, y);
      }
      for (const [j, k] of vis.entries()) {
        if (k.t % 15 !== 0) continue;
        const x = Math.round(xOf(vis.length - 1 - j)) + 0.5; if (x < 20 || x > chartR - 20) continue;
        ctx.fillStyle = GRID; ctx.fillRect(x, mainTop, 1, H - timeH - mainTop);
        ctx.fillStyle = MUTED; ctx.textAlign = 'center'; ctx.fillText(clock(k.t), x, H - timeH / 2); ctx.textAlign = 'left';
      }

      // watermark
      ctx.fillStyle = 'rgba(234,236,239,0.025)'; ctx.font = `600 ${small ? 22 : 30}px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText('BTCUSDT · 1m', chartR / 2, mainTop + mainH / 2); ctx.textAlign = 'left';

      // depth-of-market profile anchored to the price axis (absolute price levels, sizes breathe slowly)
      const target = niceStep((hi - lo) / 34);
      if (!depthStep || target / depthStep > 1.9 || depthStep / target > 1.9) depthStep = target;
      const maxLen = Math.min(150, chartR * 0.24), rowPx = (depthStep / (hi - lo)) * mainH;
      const tt = now * 0.0006;
      for (let k = Math.floor(lo / depthStep); k <= Math.ceil(hi / depthStep); k++) {
        const price = k * depthStep, y0 = Y(price + depthStep / 2), dist = Math.abs(price - live.c) / depthStep;
        if (dist < 0.5 || y0 + rowPx < mainTop || y0 > mainTop + mainH) continue;
        const wall = hash(k * 7.3) > 0.9, base = 0.22 + 0.55 * hash(k) ** 1.5 + Math.min(0.25, dist * 0.012);
        const size = Math.min(1, (wall ? base * 1.9 + 0.2 : base) * (0.82 + 0.18 * Math.sin(tt + k * 1.7)));
        const len = Math.round(size * maxLen), col = price > live.c ? DOWN : UP;
        const top = Math.round(y0) + 1, hpx = Math.max(1, Math.round(rowPx) - 1);
        ctx.fillStyle = rgba(col, wall ? 0.3 : 0.13); ctx.fillRect(chartR - len, top, len, hpx);
        ctx.fillStyle = rgba(col, wall ? 0.85 : 0.4); ctx.fillRect(chartR - len, top, 1, hpx);
      }

      // candles
      for (const [j, k] of vis.entries()) {
        const x = xOf(vis.length - 1 - j); if (x < -spacing || x > chartR) continue;
        const up = k.c >= k.o, col = rgba(up ? UP : DOWN, 1), cx = Math.round(x);
        ctx.fillStyle = col;
        const yh = Math.round(Y(k.h)), yl = Math.round(Y(k.l));
        ctx.fillRect(cx, yh, 1, Math.max(1, yl - yh));
        const yt = Math.round(Y(Math.max(k.o, k.c))), yb = Math.round(Y(Math.min(k.o, k.c)));
        ctx.fillRect(cx - Math.floor(bw / 2), yt, bw | 1, Math.max(1, yb - yt));
      }

      // live price line + axis tag + countdown
      const upLive = live.c >= live.o, lc = upLive ? UP : DOWN, ly = Math.round(Y(shown)) + 0.5;
      ctx.strokeStyle = rgba(lc, 0.75); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(chartR, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = rgba(lc, 1); ctx.fillRect(chartR, ly - 9, axisW, 18);
      ctx.fillStyle = '#ffffff'; ctx.font = `600 10px ${MONO}`; ctx.fillText(fmt(shown), chartR + 6, ly);
      const left = Math.max(0, CANDLE_MS - (now - start)), secs = Math.ceil((left / CANDLE_MS) * 60);
      ctx.fillStyle = rgba(lc, 0.22); ctx.fillRect(chartR, ly + 9, axisW, 15);
      ctx.fillStyle = rgba(lc, 1); ctx.font = `10px ${MONO}`; ctx.fillText(`00:${String(secs).padStart(2, '0')}`, chartR + 6, ly + 16.5);

      // delta histogram + CVD line sub-pane
      ctx.fillStyle = LINE; ctx.fillRect(0, paneTop - 4, W, 1);
      const zero = Math.round(paneTop + paneH / 2) + 0.5;
      let md = 1; for (const k of vis) md = Math.max(md, Math.abs(k.d));
      ctx.fillStyle = GRID; ctx.fillRect(0, zero, chartR, 1);
      const cvd: [number, number][] = []; let run = 0, cmin = Infinity, cmax = -Infinity;
      for (const [j, k] of vis.entries()) {
        const x = xOf(vis.length - 1 - j); run += k.d; cvd.push([x, run]); cmin = Math.min(cmin, run); cmax = Math.max(cmax, run);
        if (x < -spacing || x > chartR) continue;
        const hpx = Math.max(1, Math.round((Math.abs(k.d) / md) * (paneH / 2 - 3)));
        ctx.fillStyle = rgba(k.d >= 0 ? UP : DOWN, 0.7);
        ctx.fillRect(Math.round(x) - Math.floor(bw / 2), k.d >= 0 ? zero - hpx : zero + 1, bw | 1, hpx);
      }
      const cy = (v: number) => paneTop + 4 + (1 - (v - cmin) / Math.max(1, cmax - cmin)) * (paneH - 8);
      ctx.strokeStyle = rgba(GOLD, 0.9); ctx.lineWidth = 1.25; ctx.beginPath();
      cvd.forEach(([x, v], i) => (i ? ctx.lineTo(x, cy(v)) : ctx.moveTo(x, cy(v)))); ctx.stroke(); ctx.lineWidth = 1;
      ctx.font = `600 9.5px ${MONO}`; ctx.fillStyle = MUTED; ctx.fillText('DELTA', 8, paneTop + 6);
      ctx.fillStyle = rgba(GOLD, 0.95); ctx.fillText('CVD', 50, paneTop + 6);
      ctx.fillStyle = MUTED; ctx.font = `10px ${MONO}`;
      ctx.fillText(`${run >= 0 ? '+' : ''}${(run / 1000).toFixed(1)}K`, chartR + 8, paneTop + 6);

      // crosshair (snaps to candle) + OHLC legend
      let legend = live;
      if (hover && hover.x < chartR && hover.y > mainTop && hover.y < H - timeH) {
        const j = Math.round((chartR - rightPad + scroll * spacing - hover.x) / spacing), idx = vis.length - 1 - j;
        const k = vis[idx]; if (k) legend = k;
        const sx = Math.round(xOf(Math.max(0, Math.min(vis.length - 1, j)))) + 0.5, sy = Math.round(hover.y) + 0.5;
        ctx.strokeStyle = 'rgba(234,236,239,0.35)'; ctx.setLineDash([3, 3]); ctx.beginPath();
        ctx.moveTo(sx, mainTop); ctx.lineTo(sx, H - timeH); if (sy < mainTop + mainH) { ctx.moveTo(0, sy); ctx.lineTo(chartR, sy); } ctx.stroke(); ctx.setLineDash([]);
        if (sy < mainTop + mainH) { ctx.fillStyle = '#2B3139'; ctx.fillRect(chartR, sy - 9, axisW, 18); ctx.fillStyle = '#EAECEF'; ctx.font = `10px ${MONO}`; ctx.fillText(fmt(hi - ((sy - mainTop) / mainH) * (hi - lo)), chartR + 6, sy); }
      }
      const lu = legend.c >= legend.o, lcol = rgba(lu ? UP : DOWN, 1), chg = ((legend.c - legend.o) / legend.o) * 100;
      ctx.font = `10.5px ${MONO}`; let lx = 8; const ly2 = 11;
      const seg = (label: string, val: string) => { ctx.fillStyle = MUTED; ctx.fillText(label, lx, ly2); lx += ctx.measureText(label).width + 3; ctx.fillStyle = lcol; ctx.fillText(val, lx, ly2); lx += ctx.measureText(val).width + 10; };
      if (!small) { seg('O', fmt(legend.o)); seg('H', fmt(legend.h)); seg('L', fmt(legend.l)); }
      seg('C', fmt(legend.c)); seg('', `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`);

      if (now - uiAt > 250) {
        uiAt = now;
        const dc = ((live.c - sessionOpen) / sessionOpen) * 100;
        if (priceEl.current) { priceEl.current.textContent = fmt(live.c); priceEl.current.style.color = rgba(upLive ? UP : DOWN, 1); }
        if (chgEl.current) { chgEl.current.textContent = `${dc >= 0 ? '+' : ''}${dc.toFixed(2)}%`; chgEl.current.style.color = rgba(dc >= 0 ? UP : DOWN, 1); }
        if (latEl.current) latEl.current.textContent = `${Math.round(9 + hash(Math.floor(now / 1000)) * 9)} ms`;
      }
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - last < 33) return;
      const dt = Math.min(200, now - last); last = now;
      tickAcc += dt;
      const live = cs[cs.length - 1]!;
      while (tickAcc >= TICK_MS) { tickAcc -= TICK_MS; tick(live); }
      if (now - start >= CANDLE_MS) { start = now; cs.push(fresh(live.t + 1)); if (cs.length > KEEP) cs.shift(); scroll = 1; }
      scroll = Math.max(0, scroll - dt / 380);
      rx += (trx - rx) * 0.08; ry += (try_ - ry) * 0.08;
      card.style.setProperty('--tx', `${rx.toFixed(2)}deg`); card.style.setProperty('--ty', `${ry.toFixed(2)}deg`);
      draw(now);
    };
    const play = () => { if (running || reduced || !visible || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(step); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    fit(); draw(performance.now());
    const ro = new ResizeObserver(() => { fit(); draw(performance.now()); }); ro.observe(box);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) play(); else stop(); }); io.observe(box);
    const vis = () => { if (document.hidden) stop(); else play(); };
    document.addEventListener('visibilitychange', vis);
    const move = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (hover.x < 0 || hover.y < 0 || hover.x > r.width || hover.y > r.height) hover = null;
      if (window.innerWidth >= 1024) { trx = ((e.clientY / window.innerHeight) - 0.5) * -3; try_ = ((e.clientX / window.innerWidth) - 0.5) * 4; }
      if (reduced) draw(performance.now());
    };
    window.addEventListener('pointermove', move, { passive: true });
    play();
    return () => { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pointermove', move); };
  }, []);

  return (
    <div className={`lp-stage ${className}`}>
      <div ref={tilt} className="lp-console flex h-full flex-col">
        <div className="lp-console-bar">
          <span className="lp-live" aria-hidden />
          <span className="font-semibold tracking-wide text-[var(--s-text)]">BTCUSDT</span>
          <span className="hidden sm:inline">Perpetual</span>
          <span className="lp-tf">1m</span>
          <span ref={priceEl} className="ml-1 font-mono font-semibold tabular-nums">—</span>
          <span ref={chgEl} className="font-mono tabular-nums" />
          <span className="ml-auto hidden items-center gap-3 sm:flex"><span>Binance</span><span>Latency <span ref={latEl} className="font-mono tabular-nums text-[var(--s-text)]">12 ms</span></span></span>
          <span className="lp-demo">Demo feed</span>
        </div>
        <div ref={wrap} className="relative min-h-0 flex-1" aria-hidden>
          <canvas ref={cv} className="absolute inset-0 size-full" />
        </div>
      </div>
    </div>
  );
}
