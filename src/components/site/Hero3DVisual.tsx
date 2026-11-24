import { useEffect, useRef } from 'react';

/** Decorative 3D trading scene for the landing hero: extruded candlesticks with a forming live candle, a stepped
 *  bid/ask depth ladder anchored to the live price, trade pulses flowing into the book with fill rings, and floating
 *  glass HUD cards. Demo values from a seeded random walk; Canvas 2D perspective projection, ≤30 fps, paused
 *  off-screen, static frame for reduced motion. No sockets, no data fetches, no React state per frame. */
type V = [number, number, number];
type RGB = readonly [number, number, number];
type Candle = { o: number; h: number; l: number; c: number; tc: number };
type Particle = { y: number; z: number; t0: number; dur: number; buy: boolean; big: boolean };
type Ring = { y: number; z: number; t0: number; buy: boolean; big: boolean };
type Box = { d: number; draw: () => void };

const css = (el: HTMLElement, v: string) => getComputedStyle(el).getPropertyValue(v).trim();
const hex = (c: string, fb: RGB): RGB => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c); return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : fb; };
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const lighten = (c: RGB, k: number): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
const fmt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

const X0 = -1.15, X1 = 0.3, BOOK_X = 0.46, BOOK_W = 0.5, BOOK_Z = 0.15;
const PERIOD = 2.8, START = 96310, REF = START / 1.0241;

export function Hero3DVisual({ className = '' }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const price = useRef<HTMLSpanElement>(null), chg = useRef<HTMLSpanElement>(null);
  const cvdVal = useRef<HTMLDivElement>(null), cvdBar = useRef<HTMLSpanElement>(null), cvdPct = useRef<HTMLSpanElement>(null);
  const whale = useRef<HTMLSpanElement>(null), whaleCard = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current, c = cv.current; if (!el || !c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = matchMedia('(max-width: 767px)').matches;
    const up = hex(css(el, '--s-up'), [14, 203, 129]), dn = hex(css(el, '--s-down'), [246, 70, 93]);
    const gold = hex(css(el, '--s-gold'), [240, 185, 11]), bg = hex(css(el, '--s-bg'), [8, 11, 17]);
    const muted = hex(css(el, '--s-muted'), [132, 142, 156]);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

    // ── market model (seeded demo walk) ──
    const N = small ? 16 : 24, S = (X1 - X0) / N, BW = S * 0.3;
    const next = (o: number): Candle => ({ o, h: o, l: o, c: o, tc: o + gauss() * 70 + 6 });
    const candles: Candle[] = [];
    let p = START - 300;
    for (let i = 0; i < N - 1; i++) { const k = next(p); k.c = k.tc; k.h = Math.max(k.o, k.c) + rnd() * 30; k.l = Math.min(k.o, k.c) - rnd() * 30; candles.push(k); p = k.c; }
    candles.push(next(p));
    let w = 0, h = 0, raf = 0, last = 0, t = 0, visible = true, phase = 0, shift = 0, spawn = 0, cvd = 4.82e6, buyShare = 0.64, uiAt = 0, whaleAt = -10;
    let lo = 0, hi = 1, mx = 0, my = 0, tmx = 0, tmy = 0;
    const parts: Particle[] = [], rings: Ring[] = [];
    const book = Array.from({ length: 24 }, (_, i) => ({ base: 0.25 + rnd() * 0.5 + (i === 4 || i === 15 ? 0.55 : 0), ph: rnd() * 6 }));
    const live = () => candles[candles.length - 1]!.c;
    const range = () => { let a = Infinity, b = -Infinity; for (const k of candles) { a = Math.min(a, k.l); b = Math.max(b, k.h); } const pad = (b - a) * 0.12 + 20; return [a - pad, b + pad] as const; };
    [lo, hi] = range();
    const yOf = (v: number) => 0.06 + ((v - lo) / (hi - lo)) * 0.86;

    // ── camera ──
    const BASE_YAW = -0.36, BASE_PITCH = 0.26, DIST = 3.1;
    let yaw = BASE_YAW, pitch = BASE_PITCH;
    const rot = (q: V): V => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x = q[0] * cy - q[2] * sy, z1 = q[0] * sy + q[2] * cy;
      return [x, q[1] * cp - z1 * sp, q[1] * sp + z1 * cp];
    };
    const cam = (q: V): V => { const r = rot([q[0] + 0.12, q[1] - 0.48, q[2]]); return [r[0], r[1], r[2] + DIST]; };
    const scr = (r: V): [number, number] => { const f = Math.min(w * 1.4, h * 2.3) / r[2]; return [w * 0.5 + r[0] * f, h * 0.5 - r[1] * f]; };
    const project = (q: V) => scr(cam(q));

    const quad = (pts: V[], fill: string, stroke?: string) => {
      ctx.beginPath(); pts.forEach((q, i) => { const s = project(q); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    const FACES: [V, (a: V, b: V) => V[]][] = [
      [[0, 1, 0], (a, b) => [[a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]]],
      [[1, 0, 0], (a, b) => [[b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]]]],
      [[-1, 0, 0], (a, b) => [[a[0], a[1], a[2]], [a[0], b[1], a[2]], [a[0], b[1], b[2]], [a[0], a[1], b[2]]]],
      [[0, 0, 1], (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]]],
      [[0, 0, -1], (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]]]],
    ];
    const SHADE = [1, 0.5, 0.5, 0.75, 0.75];
    const prism = (a: V, b: V, col: RGB, alpha: number) => {
      const top = lighten(col, 0.3);
      FACES.forEach(([n, f], i) => {
        const pts = f(a, b), ctr: V = [(a[0] + b[0]) / 2 + n[0] * (b[0] - a[0]) / 2, (a[1] + b[1]) / 2 + n[1] * (b[1] - a[1]) / 2, (a[2] + b[2]) / 2 + n[2] * (b[2] - a[2]) / 2];
        const rn = rot(n), rc = cam(ctr); if (rn[0] * rc[0] + rn[1] * rc[1] + rn[2] * rc[2] >= 0) return;
        const s = SHADE[i]!, base = i === 0 ? top : col;
        quad(pts, rgba([base[0] * s, base[1] * s, base[2] * s], alpha), rgba(lighten(col, 0.25), alpha * 0.55));
      });
    };

    const draw = () => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1; ctx.lineJoin = 'round';
      const lp = live(), yl = yOf(lp);
      // floor grid
      ctx.strokeStyle = rgba(gold, 0.07); ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const x = X0 - 0.05 + i * 0.12, a = project([x, 0, -0.4]), b = project([x, 0, 0.4]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let j = 0; j <= 4; j++) { const z = -0.4 + j * 0.2, a = project([X0 - 0.05, 0, z]), b = project([BOOK_X + BOOK_W + 0.07, 0, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      // back wall price grid with labels
      ctx.font = `${small ? 9 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.textBaseline = 'middle';
      for (let j = 0; j <= 4; j++) {
        const v = lo + ((hi - lo) * (j + 0.5)) / 5, y = yOf(v), a = project([X0 - 0.05, y, -0.4]), b = project([X1 + 0.05, y, -0.4]);
        ctx.strokeStyle = rgba(muted, 0.12); ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = rgba(muted, 0.55); ctx.textAlign = 'right'; ctx.fillText(fmt(v).slice(0, -3), a[0] - 6, a[1]);
      }
      // gather solids, paint far → near
      const solids: Box[] = [];
      candles.forEach((k, i) => {
        const x = X0 + (i + 0.5 + shift) * S, bull = k.c >= k.o, col = bull ? up : dn, forming = i === candles.length - 1;
        const y0 = yOf(Math.min(k.o, k.c)), y1 = Math.max(yOf(Math.max(k.o, k.c)), y0 + 0.008);
        const fade = Math.min(1, (x - X0) / (S * 2.5));
        solids.push({ d: cam([x, (y0 + y1) / 2, 0])[2], draw: () => {
          const wa = project([x, yOf(k.l), 0]), wb = project([x, yOf(k.h), 0]);
          ctx.strokeStyle = rgba(col, 0.85 * fade); ctx.lineWidth = forming ? 1.6 : 1.2; ctx.beginPath(); ctx.moveTo(wa[0], wa[1]); ctx.lineTo(wb[0], wb[1]); ctx.stroke(); ctx.lineWidth = 1;
          if (forming) { ctx.save(); ctx.shadowColor = rgba(col, 0.8); ctx.shadowBlur = 14; }
          prism([x - BW, y0, -BW], [x + BW, y1, BW], col, (forming ? 0.98 : 0.86) * fade);
          if (forming) ctx.restore();
          // volume block on the floor
          const vh = 0.012 + Math.abs(k.c - k.o) / (hi - lo) * 0.18;
          prism([x - BW, 0, 0.22 - BW * 0.6], [x + BW, vh, 0.22 + BW * 0.6], col, 0.35 * fade);
        } });
      });
      const dy = small ? 0.042 : 0.034;
      for (let side = 0; side < 2; side++) for (let k = 1; k <= 12; k++) {
        const ask = side === 0, y = yl + (ask ? k : -k) * dy; if (y < 0.02 || y > 1.02) continue;
        const b = book[side * 12 + k - 1]!, size = b.base * (0.82 + 0.18 * Math.sin(t * 1.3 + b.ph)) * (1 - k * 0.02);
        const x1 = BOOK_X + size * BOOK_W, col = ask ? dn : up;
        solids.push({ d: cam([BOOK_X + 0.1, y, 0])[2], draw: () => prism([BOOK_X, y - dy * 0.34, -BOOK_Z], [x1, y + dy * 0.34, BOOK_Z], col, 0.5 + Math.min(0.35, size * 0.3)) });
      }
      solids.sort((a, b) => b.d - a.d).forEach(s => s.draw());
      // live price plane + line
      const pa = project([X0, yl, 0]), pb = project([BOOK_X, yl, 0]);
      quad([[X0, yl, -0.4], [BOOK_X, yl, -0.4], [BOOK_X, yl, 0.4], [X0, yl, 0.4]], rgba(gold, 0.03));
      ctx.save(); ctx.strokeStyle = rgba(gold, 0.95); ctx.lineWidth = 1.4; ctx.shadowColor = rgba(gold, 0.8); ctx.shadowBlur = 10; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 12;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.restore();
      // trade pulses → book, then fill rings
      const fx = X0 + (candles.length - 0.5 + shift) * S;
      for (const q of parts) {
        const e = ease((t - q.t0) / q.dur), x = fx + (BOOK_X - fx) * e, y = yl + (q.buy ? 1 : -1) * dy * 0.55 * e;
        const s = project([x, y, q.z * e]), col = q.buy ? up : dn, r = q.big ? 12 : 7;
        const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r); g.addColorStop(0, rgba(col, 0.75)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba([255, 255, 255], 0.9); ctx.beginPath(); ctx.arc(s[0], s[1], q.big ? 2.2 : 1.3, 0, Math.PI * 2); ctx.fill();
      }
      for (const r of rings) {
        const k = (t - r.t0) / 0.9, s = project([BOOK_X, yl + (r.buy ? 1 : -1) * dy * 0.55, r.z]), col = r.buy ? up : dn;
        ctx.strokeStyle = rgba(r.big ? gold : col, (1 - k) * 0.85); ctx.lineWidth = r.big ? 2 : 1.3;
        ctx.beginPath(); ctx.ellipse(s[0], s[1], 3 + k * (r.big ? 26 : 14), (3 + k * (r.big ? 26 : 14)) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.lineWidth = 1;
      // price tag at the book edge
      const tagX = pb[0] + 6, label = fmt(lp);
      ctx.font = `600 ${small ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const tw = ctx.measureText(label).width + 12, th = small ? 17 : 19;
      ctx.save(); ctx.shadowColor = rgba(gold, 0.6); ctx.shadowBlur = 12; ctx.fillStyle = rgba(gold, 1);
      ctx.beginPath(); ctx.roundRect(tagX, pb[1] - th / 2, tw, th, 4); ctx.fill(); ctx.restore();
      ctx.fillStyle = rgba(bg, 1); ctx.textAlign = 'left'; ctx.fillText(label, tagX + 6, pb[1] + 0.5);
      ctx.fillStyle = rgba(gold, 1); ctx.beginPath(); ctx.arc(pa[0] + (pb[0] - pa[0]) * 0.999, pb[1], 3, 0, Math.PI * 2); ctx.fill();
    };

    const ui = () => {
      const lp = live(), pct = (lp / REF - 1) * 100;
      if (price.current) price.current.textContent = `$${fmt(lp)}`;
      if (chg.current) { chg.current.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`; chg.current.style.color = `var(${pct >= 0 ? '--s-up' : '--s-down'})`; }
      if (cvdVal.current) cvdVal.current.textContent = `${cvd >= 0 ? '+' : '−'}$${(Math.abs(cvd) / 1e6).toFixed(2)}M`;
      if (cvdBar.current) cvdBar.current.style.width = `${(buyShare * 100).toFixed(0)}%`;
      if (cvdPct.current) cvdPct.current.textContent = `${(buyShare * 100).toFixed(0)}% bids`;
    };
    const step = (dt: number) => {
      t += dt; phase += dt / PERIOD; shift = Math.max(0, shift - dt / 0.45);
      const f = candles[candles.length - 1]!, e = ease(Math.min(1, phase));
      f.c = f.o + (f.tc - f.o) * e + Math.sin(t * 7) * 6 * (1 - e) + Math.sin(t * 2.3) * 4;
      f.h = Math.max(f.h, f.c); f.l = Math.min(f.l, f.c);
      if (phase >= 1) { phase = 0; f.c = f.tc; candles.shift(); candles.push(next(f.c)); shift = 1; }
      const [tl, th] = range(); lo += (tl - lo) * Math.min(1, dt * 2); hi += (th - hi) * Math.min(1, dt * 2);
      spawn -= dt;
      if (spawn <= 0) {
        spawn = 0.1 + rnd() * 0.18; const buy = rnd() < (f.tc >= f.o ? 0.64 : 0.4), big = rnd() < 0.05;
        parts.push({ y: 0, z: (rnd() - 0.5) * 0.2, t0: t, dur: 0.9 + rnd() * 0.5, buy, big });
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]!; if (t - q.t0 < q.dur) continue;
        parts.splice(i, 1); rings.push({ y: 0, z: q.z, t0: t, buy: q.buy, big: q.big });
        const usd = (q.big ? 1.2e7 + rnd() * 6e6 : 2e4 + rnd() * 2e5) * (q.buy ? 1 : -1);
        cvd += usd; buyShare += ((q.buy ? 1 : 0) - buyShare) * 0.01;
        if (q.big && t - whaleAt > 3) {
          whaleAt = t; const btc = Math.abs(usd) / live();
          if (whale.current) whale.current.textContent = `${btc.toFixed(0)} BTC ${q.buy ? 'buy' : 'sell'} @ $${fmt(live()).slice(0, -3)}`;
          const wc = whaleCard.current; if (wc) { wc.style.borderColor = `var(${q.buy ? '--s-up' : '--s-down'})`; wc.animate([{ opacity: 0.4, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' }); }
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) if (t - rings[i]!.t0 > 0.9) rings.splice(i, 1);
      if (t - uiAt > 0.25) { uiAt = t; ui(); }
      // camera parallax with damping
      mx += (tmx - mx) * (1 - Math.exp(-4 * dt)); my += (tmy - my) * (1 - Math.exp(-4 * dt));
      yaw = BASE_YAW + mx * 0.32 + Math.sin(t * 0.18) * 0.06; pitch = BASE_PITCH + my * 0.16;
      cards.current.forEach((n, i) => { if (n) n.style.transform = `translate3d(${(-mx * (10 + i * 8)).toFixed(1)}px, ${(-my * (6 + i * 5)).toFixed(1)}px, 0)`; });
    };
    const size = () => { const r = el.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 1.75); w = r.width; h = r.height; c.width = Math.round(w * d); c.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0); draw(); };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; step(dt); draw();
    };
    const start = () => { if (!raf && !reduced && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); tmx = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5)); tmy = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5)); };
    const leave = () => { tmx = 0; tmy = 0; };
    // warm up so the first frame already shows trades in flight
    for (let i = 0; i < 40; i++) step(0.05);
    size(); ui();
    const ro = new ResizeObserver(size); ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) start(); else stop(); }); io.observe(el);
    const vis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', vis);
    if (!small) { window.addEventListener('pointermove', move, { passive: true }); document.documentElement.addEventListener('pointerleave', leave); }
    el.dataset['sceneReady'] = '1';
    start();
    return () => { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); };
  }, []);

  const card = 'pointer-events-none absolute rounded-xl border border-[color-mix(in_oklab,var(--s-gold)_28%,var(--s-border))] bg-[color-mix(in_oklab,var(--s-surface)_78%,transparent)] shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--s-bg)_90%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--s-text)_8%,transparent)] backdrop-blur-md will-change-transform';
  const mono = 'font-mono tabular-nums';
  return (
    <div ref={box} className={`relative ${className}`} aria-hidden>
      <canvas ref={cv} className="absolute inset-0 size-full" />
      <div ref={n => { cards.current[0] = n; }} className={`${card} left-1 top-1 flex items-center gap-2 px-3 py-2 sm:left-2 sm:top-2`}>
        <span className="lp-live" />
        <span className="text-[10px] font-semibold tracking-[0.12em] text-[var(--s-muted)] sm:text-[11px]">BTC/USDT PERP</span>
        <span ref={price} className={`${mono} text-xs font-bold text-[var(--s-text)] sm:text-sm`}>$96,310.00</span>
        <span ref={chg} className={`${mono} text-[10px] font-semibold sm:text-xs`}>+2.41%</span>
      </div>
      <div ref={n => { cards.current[1] = n; }} className={`${card} bottom-3 right-2 hidden w-44 px-3 py-2.5 sm:block`}>
        <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.12em] text-[var(--s-muted)]"><span>CVD DELTA</span><span ref={cvdPct} className={mono}>64% bids</span></div>
        <div ref={cvdVal} className={`${mono} mt-1 text-base font-bold text-[var(--s-up)]`}>+$4.82M</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--s-down)_70%,transparent)]"><span ref={cvdBar} className="block h-full rounded-full bg-[var(--s-up)] transition-[width] duration-300" style={{ width: '64%' }} /></div>
      </div>
      <div ref={n => { cards.current[2] = n; }} className="pointer-events-none absolute bottom-1 left-1 will-change-transform sm:bottom-3 sm:left-3">
        <div ref={whaleCard} className={`${card.replace('absolute ', '')} flex items-center gap-2 px-3 py-2`}>
          <span className="text-[10px] font-semibold tracking-[0.12em] text-[var(--s-gold)]">WHALE FILL</span>
          <span ref={whale} className={`${mono} text-[11px] font-semibold text-[var(--s-text)] sm:text-xs`}>185 BTC buy @ $96,480</span>
        </div>
      </div>
    </div>
  );
}
