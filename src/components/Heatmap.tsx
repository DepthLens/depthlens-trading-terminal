import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Crosshair, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { colorFor, percentile, COLUMN_MS } from '@/lib/heatmap-data';
import { calibrateHeatmap, getHeatmapEntry, persistHeatmaps, type HeatSource } from '@/lib/heatmap-store';
import { orderBook } from '@/lib/order-book';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import { niceStep, heatColumnWidth, heatFitRows, heatMaxRows, depthRowSize } from '@/lib/tool-layout';
import { toolDemoEnabled, demoHeatmap } from '@/lib/tool-demo';
import type { TradeBridge } from '@/components/LiveQuote';

const AXIS_W = 72, AXIS_H = 26;
const WINDOWS = [5, 15, 30, 60] as const;
const GROUPINGS = [1, 2, 5, 10] as const;
const DEFAULT_ROWS = 200;

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function Heatmap({ symbol, spec, bridge, mobile = false }: { symbol: string; spec: PriceSpec | undefined; bridge: MutableRefObject<TradeBridge>; mobile?: boolean }) {
  const [showSettings, setShowSettings] = useState(false);
  const mobileRef = useRef(mobile); mobileRef.current = mobile;
  const centerRef = useRef<(() => void) | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [collected, setCollected] = useState(0);
  const [priceOnlyFrom, setPriceOnlyFrom] = useState<number | null>(null);
  const labelRef = useRef<number | null>(null);
  const [intensity, setIntensity] = useState(1);
  const [windowMin, setWindowMin] = useState<number>(15);
  const [grouping, setGrouping] = useState<number>(1);
  const [minBubble, setMinBubble] = useState(10000);
  const [bubblesOn, setBubblesOn] = useState(true);
  // Mutable view/drawing state; the rAF loop reads these refs so drawing never rerenders React.
  const view = useRef({ center: NaN, rows: DEFAULT_ROWS });
  const controls = useRef({ intensity, windowMin, grouping, minBubble, bubblesOn });
  controls.current = { intensity, windowMin, grouping, minBubble, bubblesOn };
  const specRef = useRef(spec); specRef.current = spec;
  useEffect(() => { redrawRef.current?.(); }, [intensity, windowMin, grouping, minBubble, bubblesOn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    const demo = toolDemoEnabled();
    const demoPrice = symbol === 'ETHUSDT' ? 3000 : symbol === 'DOGEUSDT' ? .15 : 68000;
    const fixture = demo ? demoHeatmap(demoPrice, depthRowSize(demoPrice * .003, specRef.current?.minMove ?? .1)) : null;
    // History lives in the module-level store keyed by source:symbol; remounts,
    // tab switches and setting changes never clear it. Only a source change does.
    let entry = fixture ? {buffer:fixture.buffer,restored:true,calibrated:true,depthSpan:fixture.span} : getHeatmapEntry(orderBook.debug().source as HeatSource, symbol, bridge.current.latest?.price ?? NaN);
    let buffer = fixture?.buffer ?? entry.buffer;
    let depthSpan = fixture?.span ?? entry.depthSpan;
    let fitted = Boolean(fixture), lastGrouping = controls.current.grouping;
    let normValue = 1, normAt = 0, cacheKey = "", paintedTime = 0;
    off.width = 3600;
    let source = orderBook.debug().source;
    let stopped = false, hidden = document.hidden, frame = 0, dirty = true;
    view.current = { center: NaN, rows: DEFAULT_ROWS };

    // Trades flow in through the bridge; every trade is aggregated immediately.
    const onTrade = (tick: { price: number; size?: number; side?: 'Buy' | 'Sell' }) => {
      if (!demo && tick.size !== undefined) buffer.trade(tick.price, tick.size, tick.side);
    };
    bridge.current.heat = onTrade;

    // One snapshot column per second; keep collecting while hidden, marking the gap.
    const timer = setInterval(() => {
      if (demo) { setCollected(buffer.columns.length); dirty = true; return; }
      const dbg = orderBook.debug();
      if (dbg.source !== source) { source = dbg.source; entry = getHeatmapEntry(source as HeatSource, symbol, bridge.current.latest?.price ?? NaN); buffer = entry.buffer;depthSpan=entry.depthSpan;fitted=false;view.current.center = NaN; }
      const price = bridge.current.latest?.price ?? dbg.bestBid ?? NaN;
      if (!Number.isFinite(price)) return;
      if (hidden) buffer.markGap(Date.now(), price);
      else if (dbg.enabled && dbg.state === 'Synced') {
        const bids = orderBook.bids.levels, asks = orderBook.asks.levels;
        let low = Infinity, high = -Infinity;
        for (const p of bids.keys()) low = Math.min(low, p);
        for (const p of asks.keys()) high = Math.max(high, p);
        const wasCalibrated=entry.calibrated;
        calibrateHeatmap(source as HeatSource, symbol, entry, high - low, specRef.current?.minMove ?? .01);
        if (!entry.calibrated) return;
        depthSpan = entry.depthSpan;
        if(!fitted||!wasCalibrated){view.current.center=price;view.current.rows=heatFitRows(depthSpan,buffer.bucket,controls.current.grouping);fitted=true;}
        buffer.sample(Date.now(), bids, asks, price);
      }
      else return;
      setCollected(buffer.columns.length);
      // "Price and trades only" label: shown while backfilled columns are visible.
      const cols = buffer.columns;
      const hasPriceOnly = cols.some(c => c.priceOnly);
      const bookStart = cols.find(c => !c.priceOnly && !c.gap)?.time ?? null;
      const label = hasPriceOnly && bookStart !== null ? bookStart : hasPriceOnly ? -1 : null;
      if (label !== labelRef.current) { labelRef.current = label; setPriceOnlyFrom(label); }
      dirty = true;
    }, COLUMN_MS);
    // Persist all buffers to IndexedDB every 10 seconds.
    const persistTimer = setInterval(()=>{if(!demo)persistHeatmaps();}, 10000);

    const onVisibility = () => { hidden = document.hidden; if (!hidden) dirty = true; };
    document.addEventListener('visibilitychange', onVisibility);

    const priceToY = (price: number, top: number, band: number, H: number) => ((top - price) / band) * H;

    const draw = () => {
      frame = 0;
      if (stopped || hidden) return;
      // Phones only draw when something changed (battery); desktop keeps its loop.
      if (!dirty) { if (!mobileRef.current) schedule(); return; }
      dirty = false;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      if (!cssW || !cssH) { schedule(); return; }
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cssW - AXIS_W, H = cssH - AXIS_H;
      const styles = getComputedStyle(canvas);
      const cBg = styles.getPropertyValue('--heat-bg').trim();
      const cMuted = styles.getPropertyValue('--heat-text').trim();
      const cBorder = styles.getPropertyValue('--heat-grid').trim();
      const cUp = styles.getPropertyValue('--flow-up').trim();
      const cDown = styles.getPropertyValue('--flow-down').trim();
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = cBg; ctx.fillRect(0, 0, cssW, cssH);

      const c = controls.current;
      if(lastGrouping!==c.grouping){view.current.rows=Math.max(20,view.current.rows*lastGrouping/c.grouping);lastGrouping=c.grouping;}
      const cols = buffer.columns.slice(-c.windowMin * 60);
      const price = fixture ? demoPrice : bridge.current.latest?.price ?? NaN;
      if (!Number.isFinite(view.current.center)) { view.current.center = price; view.current.rows = heatFitRows(depthSpan || buffer.bucket * 150, buffer.bucket, c.grouping); }
      const center = view.current.center;
      if (!cols.length || !Number.isFinite(center)) {
        ctx.fillStyle = cMuted; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Collecting data… 0.0 min', W / 2, H / 2);
        schedule(); return;
      }
      const g = c.grouping, bs = buffer.bucket * g;
      const rows = Math.min(Math.floor(heatMaxRows(price,buffer.bucket,g)),Math.max(20, Math.round(view.current.rows)));
      const band = rows * bs;
      const top = Math.ceil((center + band / 2)/bs)*bs;
      const N = cols.length;

      // Sample a bounded histogram every five seconds, never on animation frames.
      const scaleChanged = Date.now() - normAt >= 5000;
      if (scaleChanged) {
        const values: number[] = [];
        for (let ci = 0; ci < N; ci += Math.max(1, Math.floor(N / 48))) {
          const col = cols[ci]; if (!col || col.gap) continue;
          for (let r = 0; r < rows; r += 2) {
            const value = buffer.groupedCell(col, Math.floor(top / buffer.bucket) - r * g, g);
            if (value > 0) values.push(value);
          }
        }
        normValue = percentile(values, 98) || 1; normAt = Date.now();
      }
      const norm = normValue / Math.max(.05, c.intensity);
      const key = `${top}:${rows}:${g}:${norm}:${c.windowMin}`;
      const rebuild = key !== cacheKey || scaleChanged || off.height !== rows;
      if (off.height !== rows) off.height = rows;
      const columnImage = offCtx.createImageData(1, rows);
      const firstTime = cols[0]?.time ?? 0;
      if (rebuild) { offCtx.clearRect(0, 0, off.width, off.height); paintedTime = 0; }
      for (let ci = 0; ci < N; ci++) {
        const col = cols[ci]; if (!col || col.time <= paintedTime) continue;
        const slot = Math.floor(col.time / 1000) % 3600;
        for (let r = 0; r < rows; r++) {
          const o = r * 4, value = buffer.groupedCell(col, Math.floor(top / buffer.bucket) - r * g, g);
          const [rr, gg, bb] = colorFor(Math.sqrt(value / norm));
          columnImage.data[o] = rr; columnImage.data[o + 1] = gg; columnImage.data[o + 2] = bb; columnImage.data[o + 3] = col.priceOnly ? 0 : col.gap ? 70 : value > 0 ? 255 : 0;
        }
        offCtx.putImageData(columnImage, slot, 0);
      }
      paintedTime = cols.at(-1)?.time ?? firstTime; cacheKey = key;
      ctx.imageSmoothingEnabled = false; offCtx.imageSmoothingEnabled = false;
      const colW = heatColumnWidth(W, N), x0 = W - N * colW;
      for (let ci = Math.max(0, Math.floor(-x0 / colW)); ci < N; ci++) {
        const col = cols[ci]; if (!col) continue;
        const slot = Math.floor(col.time / 1000) % 3600;
        ctx.drawImage(off, slot, 0, 1, rows, x0 + ci * colW, 0, colW, H);
      }
      Object.assign(canvas.dataset, { rows: String(rows), bucket: String(buffer.bucket), depthSpan: String(depthSpan), columnWidth: String(colW), demo: String(demo), normalizationAt: String(normAt) });
      // Trade bubbles: radius ∝ sqrt(volume), green buyer / red seller aggressor.
      if (c.bubblesOn) {
        for (let ci = 0; ci < N; ci++) {
          const col = cols[ci]!;
          if (col.gap) continue;
          const x = x0 + (ci + 0.5) * colW;
          for (const [bucket, t] of col.trades) {
            for (const [vol, color] of [[t.buy, cUp], [t.sell, cDown]] as const) {
              if (vol < c.minBubble) continue;
              const y = priceToY((bucket + 0.5) * buffer.bucket, top, band, H);
              if (y < -20 || y > H + 20) continue;
              const r = Math.min(28, Math.max(2.5, Math.sqrt(vol) / 40));
              ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.globalAlpha = 0.55; ctx.fillStyle = color; ctx.fill();
              ctx.globalAlpha = 0.9; ctx.lineWidth = 1; ctx.strokeStyle = styles.getPropertyValue('--flow-text').trim(); ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
      }

      // Price line through per-second last trade prices.
      ctx.beginPath();
      let started = false;
      for (let ci = 0; ci < N; ci++) {
        const col = cols[ci]!;
        if (col.gap || !Number.isFinite(col.price)) { started = false; continue; }
        const x = x0 + (ci + 0.5) * colW, y = priceToY(col.price, top, band, H);
        if (started) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        started = true;
      }
      ctx.lineWidth = 1; ctx.strokeStyle = styles.getPropertyValue('--flow-text').trim(); ctx.stroke();

      // Best bid / ask thin lines.
      const dbg = orderBook.debug();
      ctx.lineWidth = 1;
      if (!demo && dbg.bestBid !== null) { const y = priceToY(dbg.bestBid, top, band, H); if (y >= 0 && y <= H) { ctx.strokeStyle = cUp; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
      if (!demo && dbg.bestAsk !== null) { const y = priceToY(dbg.bestAsk, top, band, H); if (y >= 0 && y <= H) { ctx.strokeStyle = cDown; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }

      // Axes.
      ctx.strokeStyle = cBorder; ctx.beginPath(); ctx.moveTo(W + 0.5, 0); ctx.lineTo(W + 0.5, H); ctx.moveTo(0, H + 0.5); ctx.lineTo(W, H + 0.5); ctx.stroke();
      ctx.font = '10px sans-serif'; ctx.fillStyle = cMuted;
      const step = niceStep(band / 8);
      ctx.textAlign = 'left';
      for (let p = Math.ceil((top - band) / step) * step; p <= top; p += step) {
        const y = priceToY(p, top, band, H);
        if (y < 4 || y > H - 4) continue;
        ctx.fillText(specRef.current ? formatPrice(p, specRef.current) : p.toFixed(2), W + 6, y + 3);
        ctx.strokeStyle = cBorder; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W + 4, y); ctx.stroke();
      }
      ctx.textAlign = 'center';
      const labelEvery = Math.max(1, Math.round(60 / Math.max(1, colW)));
      for (let ci = 0; ci < N; ci++) {
        const t = cols[ci]!.time;
        if (t % 60000 >= COLUMN_MS || ci % labelEvery !== 0) continue;
        const d = new Date(t);
        ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, x0 + (ci + 0.5) * colW, H + 16);
      }

      // Price tag on the right axis, green/red by direction.
      if (Number.isFinite(price)) {
        const y = Math.min(H - 8, Math.max(8, priceToY(price, top, band, H)));
        const up = (bridge.current.latest?.direction ?? 0) >= 0;
        ctx.fillStyle = up ? cUp : cDown;
        ctx.fillRect(W + 1, y - 8, AXIS_W - 2, 16);
        ctx.fillStyle = cBg; ctx.textAlign = 'left';
        ctx.fillText(specRef.current ? formatPrice(price, specRef.current) : String(price), W + 5, y + 3.5);
      }

      // Color legend (bottom-left of the plot).
      const lw = 120, lh = 6, lx = 10, ly = H - 14;
      for (let i = 0; i < lw; i++) { const [r, gg, bb] = colorFor(i / (lw - 1)); ctx.fillStyle = `rgb(${r},${gg},${bb})`; ctx.fillRect(lx + i, ly, 1, lh); }
      ctx.fillStyle = cMuted; ctx.textAlign = 'left';
      ctx.fillText('0', lx, ly - 3);
      ctx.textAlign = 'right'; ctx.fillText(`${compact(norm)} USDT`, lx + lw, ly - 3);

      // Collecting hint until one minute of history exists.
      if (cols.length < 60) {
        ctx.fillStyle = cMuted; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`Collecting data… ${(cols.length / 60).toFixed(1)} min`, W / 2, 18);
      }
      if (!mobileRef.current) schedule();
    };
    const schedule = () => { if (!frame && !stopped) frame = requestAnimationFrame(draw); };
    // Redraw at least once per second (new column) and on every control change.
    let pulses = 0;
    // Phones redraw every 2 seconds to save battery; collection stays at one column per second.
    const pulse = setInterval(() => { if (mobileRef.current && ++pulses % 2) return; dirty = true; schedule(); }, COLUMN_MS);
    centerRef.current = () => { view.current.center = fixture ? demoPrice : bridge.current.latest?.price ?? NaN; view.current.rows = heatFitRows(depthSpan || buffer.bucket * 150, buffer.bucket, controls.current.grouping); dirty = true; schedule(); };
    redrawRef.current = () => { dirty = true; schedule(); };
    schedule();

    // Wheel zoom on the price axis (and plot), anchored at the cursor price.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const H = rect.height - AXIS_H;
      const c = controls.current, bs = buffer.bucket * c.grouping;
      const band = view.current.rows * bs;
      const top = view.current.center + band / 2;
      const anchor = top - ((e.clientY - rect.top) / H) * band;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const next = Math.min(heatMaxRows(bridge.current.latest?.price ?? demoPrice, buffer.bucket, c.grouping), Math.max(20, view.current.rows * Math.exp(dy * 0.0015)));
      const k = next / view.current.rows;
      view.current.center = anchor - (anchor - view.current.center) * k;
      view.current.rows = next;
      dirty = true; schedule();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Drag to pan the price range.
    let dragging = false, lastY = 0;
    const touches = new Map<number, number>();
    let pinchStart = 0, pinchRows = 0;
    const spread = () => { const ys = [...touches.values()]; return Math.abs((ys[0] ?? 0) - (ys[1] ?? 0)); };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, e.clientY);
        if (touches.size === 2) { dragging = false; pinchStart = Math.max(10, spread()); pinchRows = view.current.rows; canvas.setPointerCapture(e.pointerId); return; }
      }
      dragging = true; lastY = e.clientY; canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, e.clientY);
        if (touches.size === 2) {
          // Pinch zooms the price range (fingers apart = fewer rows = zoom in).
          view.current.rows = Math.min(heatMaxRows(bridge.current.latest?.price ?? demoPrice, buffer.bucket, controls.current.grouping), Math.max(20, pinchRows * pinchStart / Math.max(10, spread())));
          dirty = true; schedule(); return;
        }
      }
      const rect = canvas.getBoundingClientRect();
      const W = rect.width - AXIS_W, H = rect.height - AXIS_H;
      if (dragging) {
        const c = controls.current, band = view.current.rows * buffer.bucket * c.grouping;
        view.current.center += ((e.clientY - lastY) / H) * band;
        lastY = e.clientY; dirty = true; schedule();
        return;
      }
      // Hover tooltip: price, time and order size at that cell.
      const tip = tooltipRef.current;
      if (!tip) return;
      const c = controls.current, g = c.grouping, bs = buffer.bucket * g;
      const rows = Math.max(20, Math.round(view.current.rows));
      const band = rows * bs, top = view.current.center + band / 2;
      const cols = buffer.columns.slice(-c.windowMin * 60);
      const colW = heatColumnWidth(W, cols.length);
      const ci = Math.floor((e.clientX - rect.left - (W - cols.length * colW)) / colW);
      const r = Math.floor(((e.clientY - rect.top) / H) * rows);
      const col = cols[ci];
      if (!col || e.clientX - rect.left > W || e.clientY - rect.top > H || r < 0 || r >= rows) { tip.style.display = 'none'; return; }
      const rowTop = Math.floor((top - r * bs) / bs);
      const v = col.gap ? 0 : buffer.groupedCell(col, rowTop, g);
      const cellPrice = rowTop * bs;
      const d = new Date(col.time);
      tip.style.display = 'block';
      tip.style.left = `${Math.min(e.clientX - rect.left + 12, W - 150)}px`;
      tip.style.top = `${Math.max(4, e.clientY - rect.top - 12)}px`;
      tip.textContent = `${specRef.current ? formatPrice(cellPrice, specRef.current) : cellPrice.toFixed(2)} · ${d.toLocaleTimeString('en-US')} · ${col.gap ? 'gap' : `${compact(v)} USDT`}`;
    };
    const onUp = (e: PointerEvent) => { touches.delete(e.pointerId); dragging = false; };
    const onLeave = () => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    return () => {
      stopped = true;
      clearInterval(timer); clearInterval(pulse); clearInterval(persistTimer); cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      redrawRef.current = null; centerRef.current = null;
      canvas.removeEventListener('pointerleave', onLeave);
      if (bridge.current.heat === onTrade) bridge.current.heat = null;
    };
  }, [symbol, bridge]);

  const center = () => centerRef.current?.();
  const control = 'text-t-muted hover:bg-t-border/50 hover:text-t-text';
  return <div className={`heatmap-surface relative flex h-full w-full flex-col ${mobile ? 'min-h-0' : 'min-h-80'}`} data-testid="heatmap">
    {mobile ? <div className="flex h-11 shrink-0 items-center gap-2 border-b border-t-border px-2 text-xs">
      <span className="min-w-0 flex-1 truncate font-semibold text-t-text">{symbol} · Heatmap · {windowMin}m</span>
      <Button variant="ghost" size="sm" onClick={center} className={`h-10 px-3 text-xs ${control}`} title="Center on the current price"><Crosshair className="size-4" />Center</Button>
      <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className={`size-10 ${control}`} aria-label="Heatmap settings"><Settings2 /></Button>
    </div> : <>
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-t-border px-3 py-1.5 text-xs">
      <span className="font-semibold text-t-text">{symbol} · Heatmap</span>
      <label className="flex items-center gap-1.5 text-t-muted">Intensity
        <input type="range" min={0.2} max={3} step={0.1} value={intensity} onChange={e => setIntensity(Number(e.target.value))} aria-label="Intensity" className="h-1 w-24 accent-current" />
      </label>
      <span className="flex items-center gap-1" role="group" aria-label="Time window">
        {WINDOWS.map(w => <Button key={w} variant="ghost" size="sm" aria-pressed={windowMin === w} onClick={() => setWindowMin(w)} className={`h-6 px-2 text-xs ${windowMin === w ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{w}m</Button>)}
      </span>
      <span className="flex items-center gap-1" role="group" aria-label="Grouping">
        {GROUPINGS.map(gr => <Button key={gr} variant="ghost" size="sm" aria-pressed={grouping === gr} onClick={() => setGrouping(gr)} className={`h-6 px-2 text-xs ${grouping === gr ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>x{gr}</Button>)}
      </span>
      <label className="flex items-center gap-1.5 text-t-muted">Min bubble
        <input type="number" min={0} step={1000} value={minBubble} onChange={e => setMinBubble(Math.max(0, Number(e.target.value) || 0))} aria-label="Minimum bubble size" className="h-6 w-20 rounded border border-t-border bg-t-panel px-1 text-xs text-t-text" />
      </label>
      <label className="flex items-center gap-1.5 text-t-muted">Bubbles
        <input type="checkbox" checked={bubblesOn} onChange={e => setBubblesOn(e.target.checked)} aria-label="Toggle trade bubbles" className="accent-current" />
      </label>
      <Button variant="ghost" size="sm" onClick={center} className={`h-6 px-2 text-xs ${control}`} title="Center on the current price"><Crosshair className="size-3" />Center</Button>
    </div>
    </>}
    <div className="relative min-h-0 flex-1">
      {toolDemoEnabled() && <span className="demo-watermark">DEMO DATA</span>}
      <canvas ref={canvasRef} className={`block size-full ${mobile ? 'touch-none' : ''}`} aria-label={`${symbol} order book heatmap`} />
      <div ref={tooltipRef} data-testid="heatmap-tooltip" className="pointer-events-none absolute z-10 hidden rounded border border-t-border bg-t-panel/95 px-2 py-1 text-[10px] tabular-nums text-t-text" />
      {!toolDemoEnabled() && collected < 60 && <span role="status" className="pointer-events-none absolute bottom-2 left-3 text-[10px] mobile:text-xs text-t-muted">● Collecting data… {(collected / 60).toFixed(1)} min</span>}
      {priceOnlyFrom !== null && <span data-testid="price-only-label" className="pointer-events-none absolute bottom-2 right-3 text-[10px] mobile:text-xs text-t-muted">Price and trades only.{priceOnlyFrom > 0 ? ` Order book colors start at ${new Date(priceOnlyFrom).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</span>}
    </div>
    {mobile && showSettings && <div className="fixed inset-0 z-50 flex flex-col justify-end bg-t-bg/70" onClick={() => setShowSettings(false)}>
      <div role="dialog" aria-modal="true" aria-label="Heatmap settings" onClick={e => e.stopPropagation()} className="space-y-4 rounded-t-xl border-t border-t-border bg-t-panel px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-t-text">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Heatmap settings</h2><Button variant="ghost" size="icon" className={`size-10 ${control}`} aria-label="Close heatmap settings" onClick={() => setShowSettings(false)}><X /></Button></div>
        <label className="flex h-10 items-center gap-3 text-t-muted">Intensity
          <input type="range" min={0.2} max={3} step={0.1} value={intensity} onChange={e => setIntensity(Number(e.target.value))} aria-label="Intensity" className="h-10 flex-1 accent-current" />
        </label>
        <div className="space-y-1"><span className="text-t-muted">Time window</span><div className="grid grid-cols-4 gap-2" role="group" aria-label="Time window">
          {WINDOWS.map(w => <Button key={w} variant="ghost" aria-pressed={windowMin === w} onClick={() => setWindowMin(w)} className={`h-10 text-sm ${windowMin === w ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{w}m</Button>)}
        </div></div>
        <div className="space-y-1"><span className="text-t-muted">Grouping</span><div className="grid grid-cols-4 gap-2" role="group" aria-label="Grouping">
          {GROUPINGS.map(gr => <Button key={gr} variant="ghost" aria-pressed={grouping === gr} onClick={() => setGrouping(gr)} className={`h-10 text-sm ${grouping === gr ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>x{gr}</Button>)}
        </div></div>
        <label className="flex h-10 items-center justify-between gap-3 text-t-muted">Min bubble size (USDT)
          <input type="number" min={0} step={1000} value={minBubble} onChange={e => setMinBubble(Math.max(0, Number(e.target.value) || 0))} aria-label="Minimum bubble size" className="h-10 w-28 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text" />
        </label>
        <label className="flex h-10 items-center justify-between gap-3 text-t-muted">Trade bubbles
          <input type="checkbox" checked={bubblesOn} onChange={e => setBubblesOn(e.target.checked)} aria-label="Toggle trade bubbles" className="size-5 accent-current" />
        </label>
      </div>
    </div>}
  </div>;
}
