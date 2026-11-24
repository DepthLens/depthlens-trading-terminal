import { useEffect, useRef } from 'react';

/** Decorative 3D order-book depth terrain (bids green / asks red, gold price path). Canvas 2D perspective projection,
 *  ≤30 fps, pauses off-screen, static frame for reduced motion. No sockets, no data fetches. */
type V = [number, number, number];
const css = (el: HTMLElement, v: string, fb: string) => getComputedStyle(el).getPropertyValue(v).trim() || fb;
const hex = (c: string) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c); return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] as const : [245, 184, 61] as const; };
const rgba = (c: readonly [number, number, number], a: number, k = 1) => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;

export function Hero3DVisual({ className = '' }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = box.current, c = cv.current; if (!el || !c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = matchMedia('(max-width: 767px)').matches;
    const up = hex(css(el, '--s-up', '#22C55E')), dn = hex(css(el, '--s-down', '#EF4444')), gold = hex(css(el, '--s-gold', '#F5B83D'));
    const COLS = small ? 18 : 26, ROWS = small ? 11 : 16;
    let w = 0, h = 0, raf = 0, last = 0, t = 0, visible = true;
    let yaw = -0.55, pitch = 0.52, tYaw = yaw, tPitch = pitch, vYaw = 0, vPitch = 0;
    const size = () => { const r = el.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 1.75); w = r.width; h = r.height; c.width = Math.round(w * d); c.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0); draw(); };
    // depth at column i (price), row j (time back), time t
    const depth = (i: number, j: number) => {
      const x = (i + .5) / COLS * 2 - 1, ax = Math.abs(x), z = j - t * 1.1;
      if (ax < .07) return 0;
      const base = .12 + Math.pow(ax, .7) * .55;
      const wall = Math.max(0, Math.sin(i * 1.7 + z * .35) * Math.sin(i * .53 + 1.3)) * .55;
      const ripple = (Math.sin(z * .9 + i * .8) * .5 + .5) * .12;
      return Math.min(1.15, base + wall * (x < 0 ? 1 : .85) + ripple);
    };
    const mid = (j: number) => Math.sin((j - t * 1.1) * .45) * .05 + Math.sin((j - t * 1.1) * .17) * .04;
    const project = (p: V): [number, number, number] => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      let x = p[0] * cy - p[2] * sy; const z1 = p[0] * sy + p[2] * cy;
      const y = p[1] * cp - z1 * sp; const z = p[1] * sp + z1 * cp + 3.4;
      const f = Math.min(w, h * 1.5) * .95 / z; x = w / 2 + x * f;
      return [x, h * .56 - y * f, z];
    };
    type Face = { pts: [number, number][]; z: number; fill: string };
    const draw = () => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const SX = 2 / COLS, SZ = 2 / ROWS, bw = SX * .78, bd = SZ * .78;
      // floor grid
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(gold, .08);
      ctx.beginPath();
      for (let i = 0; i <= COLS; i += 2) { const a = project([-1 + i * SX, 0, -1]), b = project([-1 + i * SX, 0, 1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let j = 0; j <= ROWS; j += 2) { const a = project([-1, 0, -1 + j * SZ]), b = project([1, 0, -1 + j * SZ]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      const faces: Face[] = [];
      const cam = (() => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); return (n: V) => { const x = n[0] * cy - n[2] * sy, z1 = n[0] * sy + n[2] * cy; return n[1] * sp + z1 * cp; }; })();
      const showFront = cam([0, 0, -1]) < 0, showLeft = cam([-1, 0, 0]) < 0;
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        const hgt = depth(i, j) * .9; if (hgt <= .01) continue;
        const x0 = -1 + i * SX + (SX - bw) / 2, x1 = x0 + bw, z0 = -1 + j * SZ + (SZ - bd) / 2, z1 = z0 + bd;
        const col = (i + .5) / COLS < .5 ? up : dn, fade = 1 - j / ROWS * .65, hi = Math.min(1, .35 + hgt * .7);
        const P = (x: number, y: number, z: number) => project([x, y, z]);
        const t00 = P(x0, hgt, z0), t10 = P(x1, hgt, z0), t11 = P(x1, hgt, z1), t01 = P(x0, hgt, z1);
        const b00 = P(x0, 0, z0), b10 = P(x1, 0, z0), b11 = P(x1, 0, z1), b01 = P(x0, 0, z1);
        const zc = (t00[2] + t11[2] + b00[2]) / 3;
        const xy = (p: [number, number, number]): [number, number] => [p[0], p[1]];
        if (showFront) faces.push({ pts: [b00, b10, t10, t00].map(xy), z: zc + .001, fill: rgba(col, .55 * fade * hi, .55) });
        else faces.push({ pts: [b01, b11, t11, t01].map(xy), z: zc + .001, fill: rgba(col, .55 * fade * hi, .55) });
        if (showLeft) faces.push({ pts: [b00, b01, t01, t00].map(xy), z: zc + .0005, fill: rgba(col, .5 * fade * hi, .4) });
        else faces.push({ pts: [b10, b11, t11, t10].map(xy), z: zc + .0005, fill: rgba(col, .5 * fade * hi, .4) });
        faces.push({ pts: [t00, t10, t11, t01].map(xy), z: zc, fill: rgba(col, .85 * fade * hi, 1) });
      }
      faces.sort((a, b) => b.z - a.z);
      for (const f of faces) { ctx.beginPath(); ctx.moveTo(f.pts[0]![0], f.pts[0]![1]); for (let k = 1; k < f.pts.length; k++) ctx.lineTo(f.pts[k]![0], f.pts[k]![1]); ctx.closePath(); ctx.fillStyle = f.fill; ctx.fill(); }
      // gold price path along the spread, floating
      ctx.save(); ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(gold, .95); ctx.shadowColor = rgba(gold, .8); ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let j = 0; j <= ROWS * 2; j++) { const zz = -1 + j / (ROWS * 2) * 2, p = project([mid(j / 2), .55 + Math.sin((j / 2 - t * 1.1) * .6) * .08, zz]); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.stroke(); ctx.restore();
      // trade particles rising at the spread
      for (let k = 0; k < 14; k++) {
        const ph = (t * .35 + k / 14) % 1, side = k % 2 ? 1 : -1, zz = -1 + ((k * 7) % 14) / 14 * 2;
        const p = project([side * .05 + mid(k) , .2 + ph * 1.1, zz]); const a = Math.sin(ph * Math.PI) * .9;
        ctx.fillStyle = rgba(side < 0 ? up : dn, a); ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 + (1 - ph) * 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // mid label
      const lp = project([mid(0), .55 + Math.sin(-t * 1.1 * .6) * .08, -1]);
      ctx.fillStyle = rgba(gold, 1); ctx.beginPath(); ctx.arc(lp[0], lp[1], 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(gold, .35); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(lp[0], lp[1], 7 + (t * 6 % 6), 0, Math.PI * 2); ctx.stroke();
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      const dt = Math.min(.1, (now - (last || now)) / 1000); last = now; t += dt;
      // spring toward target tilt + slow idle sway
      const idle = Math.sin(t * .25) * .12;
      vYaw += ((tYaw + idle) - yaw) * 6 * dt; vYaw *= Math.exp(-5 * dt); yaw += vYaw * dt * 4;
      vPitch += (tPitch - pitch) * 6 * dt; vPitch *= Math.exp(-5 * dt); pitch += vPitch * dt * 4;
      draw();
    };
    const start = () => { if (!raf && !reduced && visible) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width - .5, ny = (e.clientY - r.top) / r.height - .5; tYaw = -.55 + Math.max(-.5, Math.min(.5, nx)) * .7; tPitch = .52 + Math.max(-.5, Math.min(.5, ny)) * .3; };
    const leave = () => { tYaw = -.55; tPitch = .52; };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) start(); else stop(); }); io.observe(el);
    const vis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', vis);
    if (!small) { window.addEventListener('pointermove', move, { passive: true }); document.documentElement.addEventListener('pointerleave', leave); }
    el.dataset['sceneReady'] = '1';
    start();
    return () => { stop(); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); };
  }, []);
  return <div ref={box} className={`relative ${className}`} aria-hidden><canvas ref={cv} className="absolute inset-0 size-full" /></div>;
}
