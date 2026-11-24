import { useEffect, useRef } from 'react';

/** Decorative 3D liquidity surface: order-book depth as a hidden-line wireframe terrain (bids left / asks right),
 *  a glass price plane at the mid price and execution pulses along the contours. Canvas 2D perspective projection,
 *  ≤30 fps, pauses off-screen, static frame for reduced motion. No sockets, no data fetches. */
type V = [number, number, number];
type RGB = readonly [number, number, number];
const css = (el: HTMLElement, v: string, fb: string) => getComputedStyle(el).getPropertyValue(v).trim() || fb;
const hex = (c: string, fb: RGB): RGB => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c); return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : fb; };
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const WALLS: [number, number][] = [[-0.78, 0.9], [-0.52, 0.65], [-0.3, 1.0], [0.27, 0.85], [0.5, 0.7], [0.74, 1.0]];

export function Hero3DVisual({ className = '' }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = box.current, c = cv.current; if (!el || !c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = matchMedia('(max-width: 767px)').matches;
    const up = hex(css(el, '--s-up', ''), [14, 203, 129]), dn = hex(css(el, '--s-down', ''), [246, 70, 93]);
    const gold = hex(css(el, '--s-gold', ''), [240, 185, 11]), bg = hex(css(el, '--s-bg', ''), [8, 11, 17]);
    const NX = small ? 44 : 70, NZ = small ? 20 : 30;
    let w = 0, h = 0, raf = 0, last = 0, t = 0, visible = true;
    const BASE_YAW = -0.38, BASE_PITCH = 0.82;
    let yaw = BASE_YAW, pitch = BASE_PITCH, tYaw = yaw, tPitch = pitch, vYaw = 0, vPitch = 0;
    const size = () => { const r = el.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 1.75); w = r.width; h = r.height; c.width = Math.round(w * d); c.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0); draw(); };
    const tz = (z: number) => z * 2.4 - t * 0.55; // scrolling time axis
    const mid = (z: number) => { const q = tz(z); return Math.sin(q * 0.8) * 0.05 + Math.sin(q * 0.31 + 1) * 0.06; };
    const height = (x: number, z: number) => {
      const m = mid(z), d = x - m, ad = Math.abs(d);
      if (ad < 0.035) return 0;
      const q = tz(z);
      let y = 0.06 + Math.pow(Math.min(1, ad), 0.85) * 0.28;
      for (let k = 0; k < WALLS.length; k++) {
        const [cx, a] = WALLS[k]!; const life = Math.max(0, Math.sin(q * 0.55 + k * 1.9)) ** 2;
        const s = (x - cx - m * 0.5) / 0.07; y += a * 0.5 * life * Math.exp(-s * s);
      }
      y += 0.025 * Math.sin(x * 14 + q * 2.1) + 0.015 * Math.sin(x * 31 - q * 1.3);
      return Math.max(0, 0.62 * y * Math.min(1, (ad - 0.035) * 18));
    };
    const project = (p: V): [number, number, number] => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x = p[0] * cy - p[2] * sy, z1 = p[0] * sy + p[2] * cy;
      const y = p[1] * cp - z1 * sp, z = p[1] * sp + z1 * cp + 3.3;
      const f = Math.min(w, h * 1.55) * 0.98 / z;
      return [w / 2 + x * f, h * 0.52 - y * f, z];
    };
    const draw = () => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      // floor grid
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(gold, 0.06); ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const x = -1 + i * 0.2, a = project([x, 0, -1]), b = project([x, 0, 1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let j = 0; j <= 10; j++) { const z = -1 + j * 0.2, a = project([-1, 0, z]), b = project([1, 0, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      // rows sorted far → near for hidden-line occlusion
      const rows: { z: number; d: number }[] = [];
      for (let j = 0; j < NZ; j++) { const z = -1 + (j / (NZ - 1)) * 2; rows.push({ z, d: project([0, 0, z])[2] }); }
      rows.sort((a, b) => b.d - a.d);
      const dMin = rows[rows.length - 1]!.d, dMax = rows[0]!.d;
      ctx.lineJoin = 'round';
      for (const r of rows) {
        const near = 1 - (r.d - dMin) / (dMax - dMin || 1), m = mid(r.z);
        const top: [number, number][] = [], hs: number[] = [];
        for (let i = 0; i < NX; i++) { const x = -1 + (i / (NX - 1)) * 2, y = height(x, r.z); hs.push(y); const p = project([x, y, r.z]); top.push([p[0], p[1]]); }
        const b0 = project([1, 0, r.z]), b1 = project([-1, 0, r.z]);
        ctx.beginPath(); ctx.moveTo(top[0]![0], top[0]![1]);
        for (let i = 1; i < NX; i++) ctx.lineTo(top[i]![0], top[i]![1]);
        ctx.lineTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath();
        ctx.fillStyle = rgba(bg, 0.62); ctx.fill();
        // contour segments, brightness follows depth height and distance
        ctx.lineWidth = 0.8 + near * 0.9;
        for (let i = 1; i < NX; i++) {
          const x = -1 + ((i - 0.5) / (NX - 1)) * 2, hh = (hs[i]! + hs[i - 1]!) / 2; if (hh <= 0.002) continue;
          ctx.strokeStyle = rgba(x < m ? up : dn, (0.22 + near * 0.6) * (0.45 + Math.min(1, hh * 2.4)));
          ctx.beginPath(); ctx.moveTo(top[i - 1]![0], top[i - 1]![1]); ctx.lineTo(top[i]![0], top[i]![1]); ctx.stroke();
        }
      }
      // glass price plane at the mid price
      const PH = 0.7, steps = 24, edge: [number, number][] = [], foot: [number, number][] = [];
      for (let k = 0; k <= steps; k++) { const z = -1 + (k / steps) * 2, m = mid(z), a = project([m, PH, z]), b = project([m, 0, z]); edge.push([a[0], a[1]]); foot.push([b[0], b[1]]); }
      const top0 = edge[0]!, bot0 = foot[0]!;
      const grad = ctx.createLinearGradient(top0[0], top0[1], bot0[0], bot0[1]);
      grad.addColorStop(0, rgba(gold, 0.16)); grad.addColorStop(1, rgba(gold, 0.01));
      ctx.beginPath(); edge.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      for (let k = foot.length - 1; k >= 0; k--) ctx.lineTo(foot[k]![0], foot[k]![1]);
      ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.save(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(gold, 0.95); ctx.shadowColor = rgba(gold, 0.7); ctx.shadowBlur = 10;
      ctx.beginPath(); edge.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.restore();
      // execution pulses running along contours from the spread outwards
      const N = small ? 8 : 14;
      for (let k = 0; k < N; k++) {
        const ph = (t * 0.22 + k / N) % 1, side = k % 2 ? 1 : -1, z = -0.9 + ((k * 5) % N) / N * 1.8, m = mid(z);
        const x = m + side * (0.05 + ph * 0.85), y = height(x, z) + 0.015, p = project([x, y, z]);
        const a = Math.sin(ph * Math.PI), col = side < 0 ? up : dn;
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 10);
        g.addColorStop(0, rgba(col, 0.55 * a)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba([255, 255, 255], 0.85 * a); ctx.beginPath(); ctx.arc(p[0], p[1], 1.4, 0, Math.PI * 2); ctx.fill();
      }
      // live price marker at the front edge
      const lp = edge[0]!;
      ctx.fillStyle = rgba(gold, 1); ctx.beginPath(); ctx.arc(lp[0], lp[1], 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(gold, 0.45 * (1 - (t % 1.6) / 1.6)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lp[0], lp[1], 4 + ((t % 1.6) / 1.6) * 12, 0, Math.PI * 2); ctx.stroke();
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; t += dt;
      const idle = Math.sin(t * 0.2) * 0.1;
      vYaw += (tYaw + idle - yaw) * 6 * dt; vYaw *= Math.exp(-5 * dt); yaw += vYaw * dt * 4;
      vPitch += (tPitch - pitch) * 6 * dt; vPitch *= Math.exp(-5 * dt); pitch += vPitch * dt * 4;
      draw();
    };
    const start = () => { if (!raf && !reduced && visible) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5; tYaw = BASE_YAW + Math.max(-0.5, Math.min(0.5, nx)) * 0.5; tPitch = BASE_PITCH + Math.max(-0.5, Math.min(0.5, ny)) * 0.22; };
    const leave = () => { tYaw = BASE_YAW; tPitch = BASE_PITCH; };
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
