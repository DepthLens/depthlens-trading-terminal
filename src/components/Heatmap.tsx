import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Crosshair, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { colorFor, percentile, COLUMN_MS, type Column, type HeatTrade } from '@/lib/heatmap-data';
import { LONG_WINDOWS, RECORDED_RETENTION_MS, RECORDED_SYMBOL, buildNavColumns, fillGaps, historyRange, loadRecorded, loadRecordedPage, loadRecorderStatus, pageEvery, pageSpanMs, peekRecordedPage, recordedEvery, snapshotsToColumns, thinColumns, type RecordedSnapshot, type RecorderStatus } from '@/lib/heatmap-recorded';
import { bubbleNumber, bubbleRadius, bubbleVolume, dominantBubble } from '@/lib/heatmap-bubbles';
import { HEATMAP_UNIT_KEY, restoreHeatmapUnit, type HeatmapUnit } from '@/lib/terminal-state';
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
const windowLabel = (w: number) => w >= 1440 ? `${w / 1440 === 7 ? '7d' : `${w / 60}h`}` : w >= 120 ? `${w / 60}h` : `${w}m`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const JUMPS = [['−15m', 15 * 60000], ['−1h', 3600000], ['−4h', 4 * 3600000], ['−1d', 86400000]] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const stamp = (t: number, seconds = false) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}${seconds ? `:${pad2(d.getSeconds())}` : ''}`; };
const toLocalInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function Heatmap({ symbol, spec, bridge, historySource, mobile = false, floating = false, paused = false }: { symbol: string; spec: PriceSpec | undefined; bridge: MutableRefObject<TradeBridge>; historySource?: 'binance' | 'bybit'; mobile?: boolean; floating?: boolean; paused?: boolean }) {
  // Paused (minimized window) skips drawing only; column collection keeps running.
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [showSettings, setShowSettings] = useState(false);
  const mobileRef = useRef(mobile); mobileRef.current = mobile;
  const centerRef = useRef<(() => void) | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [collected, setCollected] = useState(0);
  const [priceOnlyFrom, setPriceOnlyFrom] = useState<number | null>(null);
  const labelRef = useRef<number | null>(null);
  const [recordedAvail, setRecordedAvail] = useState(false);
  const [recordedShown, setRecordedShown] = useState(false);
  const [liveBinance, setLiveBinance] = useState(true);
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [range, setRange] = useState<ReturnType<typeof historyRange>>(null);
  const historyText = range ? `History: ${new Date(range.from).toLocaleString()} – ${new Date(range.to).toLocaleString()}, ${range.count.toLocaleString()} snapshots` : 'History: —, 0 snapshots';
  const admin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1';
  useEffect(() => {
    if (!admin) return;
    let stopped = false;
    const tick = () => { void loadRecorderStatus().then(value => { if (!stopped) setStatus(value); }).catch(error => { if (!stopped) setHistoryError(error instanceof Error ? error.message : String(error)); }); };
    tick(); const t = setInterval(tick, 30000); return () => { stopped = true; clearInterval(t); };
  }, [admin]);
  const [intensity, setIntensity] = useState(1);
  const [windowMin, setWindowMin] = useState<number>(15);
  const [grouping, setGrouping] = useState<number>(1);
  const [minBubble, setMinBubble] = useState(10000);
  const [bubblesOn, setBubblesOn] = useState(true);
  const [bubbleUnit, setBubbleUnit] = useState<HeatmapUnit>('USDT');
  useEffect(() => { try { setBubbleUnit(restoreHeatmapUnit(localStorage.getItem(HEATMAP_UNIT_KEY))); } catch { /* unavailable browser storage */ } }, []);
  const selectUnit = (unit: HeatmapUnit) => { setBubbleUnit(unit); if (!toolDemoEnabled()) { try { localStorage.setItem(HEATMAP_UNIT_KEY, unit); } catch { /* unavailable browser storage */ } } };
  const coinLabel = symbol.replace(/USDT$/, '');
  // Time navigation: end === null follows live; otherwise the view is paused at that absolute end time.
  const [live, setLive] = useState(true);
  const [navLoading, setNavLoading] = useState(false);
  const [gotoValue, setGotoValue] = useState('');
  const nav = useRef<{ end: number | null; pendingCenter: boolean }>({ end: null, pendingCenter: false });
  const navApi = useRef<{ goTo: (end: number) => void; goLive: () => void } | null>(null);
  const rangeRef = useRef<HTMLSpanElement>(null);
  // Mutable view/drawing state; the rAF loop reads these refs so drawing never rerenders React.
  const view = useRef({ center: NaN, rows: DEFAULT_ROWS });
  const controls = useRef({ intensity, windowMin, grouping, minBubble, bubblesOn, bubbleUnit });
  controls.current = { intensity, windowMin, grouping, minBubble, bubblesOn, bubbleUnit };
  const specRef = useRef(spec); specRef.current = spec;
  useEffect(() => { redrawRef.current?.(); }, [intensity, windowMin, grouping, minBubble, bubblesOn, bubbleUnit]);

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
    let bubbleHits: { x: number; y: number; radius: number; price: number; time: number; trade: HeatTrade }[] = [];
    view.current = { center: NaN, rows: DEFAULT_ROWS };
    // Recorded history fills short gaps and extends long Binance BTCUSDT windows.
    let recRows: RecordedSnapshot[] = [], recFor = 0, recCols: Column[] = [], recColsKey = '', loading = false, recCheckedAt = 0, requestedWindow = 0;
    let longCols: Column[] = [], longKey = '', longAt = 0, longVersion = 0, shown = false, long = false;
    // Recorded history is Binance BTCUSDT and loads whatever the live price source is.
    const recordedOn = () => !demo && symbol === RECORDED_SYMBOL;
    setLiveBinance((historySource ?? source) === 'binance');
    setRecordedAvail(recordedOn()); setRecordedShown(false); setHistoryError(null); setRange(null);
    // ---- Time navigation state (paged recorded history + live buffer) ----
    let navCols: Column[] = [], navKey = '', wheelAcc = 0, wheelAt = 0, lastRange = '';
    const navPageCols = new Map<string, Column[]>(), navFailedAt = new Map<string, number>(), navPending = new Set<string>();
    nav.current = { end: null, pendingCenter: false }; setLive(true); setNavLoading(false);
    const navOn = () => nav.current.end !== null;
    const oldestMs = () => recordedOn() ? Date.now() - RECORDED_RETENTION_MS : (buffer.columns[0]?.time ?? Date.now());
    const clampEnd = (end: number) => Math.min(Date.now(), Math.max(oldestMs() + 60000, end));
    const navStep = (w: number) => w <= 60 ? 1 : recordedEvery(w);
    const requestPage = (every: number, p: number) => {
      const k = `${every}:${p}`;
      if (navPending.has(k) || Date.now() - (navFailedAt.get(k) ?? 0) < 10000) return;
      navPending.add(k); setNavLoading(true);
      void loadRecordedPage(every, p).then(() => { if (stopped) return; navKey = ''; setHistoryError(null); dirty = true; schedule(); })
        .catch(error => { navFailedAt.set(k, Date.now()); if (!stopped) setHistoryError(error instanceof Error ? error.message : String(error)); })
        .finally(() => { navPending.delete(k); if (!stopped && !navPending.size) setNavLoading(false); });
    };
    const recordedRange = (w: number, from: number, end: number): Column[] => {
      const every = pageEvery(w), span = pageSpanMs(every), out: Column[] = [];
      const first = Math.floor(from / span), last = Math.floor((end - 1) / span);
      for (let p = first; p <= last; p++) {
        const ck = `${every}:${p}:${buffer.bucket}`;
        let pageCols = navPageCols.get(ck);
        if (!pageCols) {
          const rows = peekRecordedPage(every, p);
          if (!rows) { requestPage(every, p); continue; }
          pageCols = snapshotsToColumns(rows, buffer.bucket, every); navPageCols.set(ck, pageCols);
          if (navPageCols.size > 24) { const o = navPageCols.keys().next().value; if (o !== undefined) navPageCols.delete(o); }
        }
        for (const c of pageCols) if (c.time >= from && c.time < end) out.push(c);
      }
      // Prefetch the next older page so dragging back stays fast.
      if ((first - 1) * span >= Date.now() - RECORDED_RETENTION_MS && !peekRecordedPage(every, first - 1)) requestPage(every, first - 1);
      return out;
    };
    const navColumns = (): readonly Column[] => {
      const w = controls.current.windowMin, step = navStep(w);
      const end = Math.floor((nav.current.end ?? Date.now()) / (step * 1000)) * step * 1000, from = end - w * 60000;
      const k = `${w}:${end}:${buffer.bucket}`;
      if (k === navKey) return navCols;
      const rec = recordedOn() ? recordedRange(w, from, end) : [];
      navCols = buildNavColumns(buffer.columns, rec, from, end, step); navKey = k; longVersion++;
      if (nav.current.pendingCenter) { const lastCol = [...navCols].reverse().find(c => !c.empty && Number.isFinite(c.price)); if (lastCol) { view.current.center = lastCol.price; nav.current.pendingCenter = false; } }
      return navCols;
    };
    const requestHistory = (w: number, before: number) => {
      if (loading || (requestedWindow === w && Date.now() - recCheckedAt < 10000)) return;
      loading = true; requestedWindow = w; recCheckedAt = Date.now();
      void loadRecorded(w, before).then(rows => {
        if (stopped || controls.current.windowMin !== w) return;
        recRows = rows; recFor = w; recColsKey = ''; longKey = ''; longAt = 0; longVersion++;
        setRange(historyRange(rows)); setHistoryError(null); dirty = true; schedule();
      }).catch(error => {
        if (!stopped && controls.current.windowMin === w) setHistoryError(error instanceof Error ? error.message : String(error));
      }).finally(() => { loading = false; });
    };
    const windowColumns = (): readonly Column[] => {
      const w = controls.current.windowMin;
      if (navOn()) { long = false; const cols = navColumns(); const hasRecorded = recordedOn() && navPageCols.size > 0 && cols.some(c => !c.empty); if (shown !== hasRecorded) { shown = hasRecorded; setRecordedShown(shown); } return cols; }
      long = w > 60 && recordedOn();
      if (!long) {
        const liveCols = buffer.columns.slice(-Math.min(w, 60) * 60);
        // Binance BTCUSDT: fill holes (tab hidden, chart view, other pair) with the Supabase recording.
        if (!recordedOn()) { if (shown) { shown = false; setRecordedShown(false); } return liveCols; }
        if (requestedWindow !== w || Date.now() - recCheckedAt >= 10000) requestHistory(w, Date.now());
        if (recColsKey !== `${recFor}:${buffer.bucket}:${recRows.length}`) { recCols = snapshotsToColumns(recRows, buffer.bucket); recColsKey = `${recFor}:${buffer.bucket}:${recRows.length}`; }
        const now = Date.now();
        const { cols, filled } = recFor === w ? fillGaps(liveCols, recCols, now - w * 60000, now) : { cols: [...liveCols], filled: 0 };
        if (shown !== filled > 0) { shown = filled > 0; setRecordedShown(shown); }
        return cols;
      }
      const k = `${w}:${buffer.bucket}`;
      if (k === longKey && Date.now() - longAt < 5000) return longCols;
      const firstLive = buffer.columns.find(c => !c.priceOnly && !c.gap)?.time ?? Date.now();
      if (recFor !== w || Date.now() - recCheckedAt >= 10000) requestHistory(w, firstLive);
      if (recColsKey !== `${recFor}:${buffer.bucket}:${recRows.length}`) { recCols = snapshotsToColumns(recRows, buffer.bucket, recordedEvery(w)); recColsKey = `${recFor}:${buffer.bucket}:${recRows.length}`; }
      const rec = recFor === w ? recCols.filter(c => c.time < firstLive) : [];
      longCols = [...rec, ...thinColumns(buffer.columns.filter(c => c.time >= firstLive), recordedEvery(w))];
      longKey = k; longAt = Date.now(); longVersion++;
      if (shown !== rec.length > 0) { shown = rec.length > 0; setRecordedShown(shown); }
      return longCols;
    };
    const slotOf = (col: Column, ci: number) => long || navOn() ? ci : Math.floor(col.time / 1000) % 3600;

    // Trades flow in through the bridge; every trade is aggregated immediately.
    const onTrade = (tick: { price: number; size?: number; side?: 'Buy' | 'Sell' }) => {
      if (!demo && tick.size !== undefined) buffer.trade(tick.price, tick.size, tick.side);
    };
    bridge.current.heat = onTrade;

    // One snapshot column per second; keep collecting while hidden, marking the gap.
    const timer = setInterval(() => {
      if (demo) { setCollected(buffer.columns.length); dirty = true; return; }
      const dbg = orderBook.debug();
      if (dbg.source !== source) { source = dbg.source; setLiveBinance((historySource ?? source) === 'binance'); entry = getHeatmapEntry(source as HeatSource, symbol, bridge.current.latest?.price ?? NaN); buffer = entry.buffer;depthSpan=entry.depthSpan;fitted=false;view.current.center = NaN; }
      setRecordedAvail(recordedOn());
      const price = bridge.current.latest?.price ?? dbg.bestBid ?? NaN;
      if (!Number.isFinite(price)) return;
      // Keep recording the book while the tab is hidden; only drawing pauses. Mark a gap only when the book is not synced.
      if (dbg.enabled && dbg.state === 'Synced') {
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
      else if (hidden) buffer.markGap(Date.now(), price);
      else return;
      setCollected(buffer.columns.length);
      setRecordedAvail(recordedOn());
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
    const resizeObs = new ResizeObserver(() => { dirty = true; schedule(); });
    if (canvas) resizeObs.observe(canvas);

    const priceToY = (price: number, top: number, band: number, H: number) => ((top - price) / band) * H;

    const draw = () => {
      frame = 0;
      if (stopped || hidden || pausedRef.current) return;
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
      const cols = windowColumns();
      const price = fixture ? demoPrice : bridge.current.latest?.price ?? cols.at(-1)?.price ?? NaN;
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
        const bookColumns=cols.filter(col=>!col.priceOnly&&!col.gap);
        for (let ci = 0; ci < bookColumns.length; ci += Math.max(1, Math.floor(bookColumns.length / 48))) {
          const col = bookColumns[ci]; if (!col) continue;
          for (let r = 0; r < rows; r += 2) {
            const value = buffer.groupedCell(col, Math.floor(top / buffer.bucket) - r * g, g);
            if (value > 0) values.push(value);
          }
        }
        normValue = percentile(values, 98) || 1; normAt = Date.now();
      }
      const norm = normValue / Math.max(.05, c.intensity);
      const key = `${top}:${rows}:${g}:${norm}:${c.windowMin}:${longVersion}`;
      const rebuild = key !== cacheKey || scaleChanged || off.height !== rows;
      if (off.height !== rows) off.height = rows;
      const columnImage = offCtx.createImageData(1, rows);
      const firstTime = cols[0]?.time ?? 0;
      if (rebuild) { offCtx.clearRect(0, 0, off.width, off.height); paintedTime = 0; }
      for (let ci = 0; ci < N; ci++) {
        const col = cols[ci]; if (!col || col.time <= paintedTime) continue;
        const slot = slotOf(col, ci);
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
        const slot = slotOf(col, ci);
        ctx.drawImage(off, slot, 0, 1, rows, x0 + ci * colW, 0, colW, H);
      }
      Object.assign(canvas.dataset, { rows: String(rows), bucket: String(buffer.bucket), depthSpan: String(depthSpan), columnWidth: String(colW), demo: String(demo), normalizationAt: String(normAt) });
      // Trade bubbles: radius ∝ sqrt(volume), green buyer / red seller aggressor.
      bubbleHits = [];
      if (c.bubblesOn) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        for (let ci = Math.max(0, Math.floor(-x0 / colW)); ci < N; ci++) {
          const col = cols[ci]; if (!col) continue;
          if (col.gap) continue;
          const x = x0 + (ci + 0.5) * colW;
          for (const [bucket, t] of col.trades) {
            const dot = dominantBubble(t), radius = bubbleRadius(dot.notional, c.minBubble);
            if (!radius) continue;
            const executionPrice = t.price ?? (bucket + .5) * buffer.bucket;
            const y = priceToY(executionPrice, top, band, H);
            if (y < -radius || y > H + radius) continue;
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.globalAlpha = .72; ctx.fillStyle = dot.buy ? cUp : cDown; ctx.fill(); ctx.globalAlpha = 1;
            bubbleHits.push({ x, y, radius, price: executionPrice, time: col.time, trade: t });
            if (radius >= 11) {
              const label = bubbleNumber(bubbleVolume(t, executionPrice, c.bubbleUnit));
              let font = 11; ctx.font = `600 ${font}px sans-serif`;
              const width = ctx.measureText(label).width, limit = radius * 1.65;
              if (width > limit) { font = Math.max(6, font * limit / width); ctx.font = `600 ${font}px sans-serif`; }
              if (ctx.measureText(label).width <= limit) {
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowColor = cBg; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
                ctx.fillStyle = styles.getPropertyValue('--flow-text').trim(); ctx.fillText(label, x, y);
                ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.textBaseline = 'alphabetic';
              }
            }
          }
        }
        ctx.restore();
      }
      Object.assign(canvas.dataset, { bubbles: String(bubbleHits.length), largeBubbles: String(bubbleHits.filter(dot => dot.radius >= 11).length) });

      // Price line through per-second last trade prices.
      ctx.beginPath();
      let started = false;
      for (let ci = 0; ci < N; ci++) {
        const col = cols[ci]; if (!col) continue;
        if (col.gap || !Number.isFinite(col.price)) { started = false; continue; }
        const path = col.pricePath?.length ? col.pricePath : [col.price];
        for (let pi = 0; pi < path.length; pi++) {
          const p = path[pi]; if (p === undefined || !Number.isFinite(p)) continue;
          const x = x0 + (ci + (pi + .5) / path.length) * colW, y = priceToY(p, top, band, H);
          if (started) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          started = true;
        }
      }
      ctx.lineWidth = 1; ctx.strokeStyle = styles.getPropertyValue('--flow-text').trim(); ctx.stroke();

      // Best bid / ask thin lines.
      const dbg = orderBook.debug();
      ctx.lineWidth = 1;
      if (!demo && !navOn() && dbg.bestBid !== null) { const y = priceToY(dbg.bestBid, top, band, H); if (y >= 0 && y <= H) { ctx.strokeStyle = cUp; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
      if (!demo && !navOn() && dbg.bestAsk !== null) { const y = priceToY(dbg.bestAsk, top, band, H); if (y >= 0 && y <= H) { ctx.strokeStyle = cDown; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }

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
      // Time axis: minute ticks for one-second columns; spaced ticks (with the date on long or multi-day ranges) otherwise.
      const spaced = long || (navOn() && c.windowMin > 60);
      const firstVisible = Math.max(0, Math.floor(-x0 / colW));
      const fromT = cols[firstVisible]?.time ?? firstTime, toT = cols.at(-1)?.time ?? firstTime;
      const withDate = c.windowMin >= 240 || new Date(fromT).toDateString() !== new Date(toT).toDateString();
      const labelEvery = Math.max(1, Math.round((withDate ? 96 : 60) / Math.max(1, colW)));
      for (let ci = firstVisible; ci < N; ci++) {
        const col = cols[ci]; if (!col) continue;
        const t = col.time;
        if (spaced ? ci % labelEvery !== 0 : (t % 60000 >= COLUMN_MS || Math.floor(t / 60000) % Math.max(1, Math.ceil((withDate ? 96 : 60) / (60 * colW))) !== 0)) continue;
        const d = new Date(t);
        ctx.fillText(withDate ? stamp(t) : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, x0 + (ci + 0.5) * colW, H + 16);
      }
      // Visible range with date and time (DOM text, updated only when it changes).
      const rangeText = `${stamp(fromT)} – ${navOn() ? stamp(toT) : `${stamp(toT)} · live`}`;
      if (rangeText !== lastRange && rangeRef.current) { rangeRef.current.textContent = rangeText; lastRange = rangeText; }
      // Times without any recorded data stay blank with a faint note.
      ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = cMuted; ctx.font = '11px sans-serif';
      for (let ci = firstVisible; ci < N;) {
        if (!cols[ci]?.empty) { ci++; continue; }
        let end = ci; while (end < N && cols[end]?.empty) end++;
        const a = Math.max(0, x0 + ci * colW), b = x0 + end * colW;
        if (b - a >= 90) ctx.fillText('No data recorded', (a + b) / 2, H / 2);
        ci = end;
      }
      ctx.restore();

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
    if (recordedOn()) requestHistory(controls.current.windowMin, Date.now());
    schedule();

    const goTo = (end: number) => { nav.current.end = clampEnd(end); nav.current.pendingCenter = true; navKey = ''; setLive(false); dirty = true; schedule(); };
    const goLive = () => {
      nav.current.end = null; nav.current.pendingCenter = false; navKey = ''; longVersion++; setLive(true);
      const p = fixture ? demoPrice : bridge.current.latest?.price;
      if (p !== undefined && Number.isFinite(p)) view.current.center = p;
      dirty = true; schedule();
    };
    navApi.current = { goTo, goLive };
    // Positive dx (drag right) moves into the past; reaching the current time resumes live follow.
    const panTime = (dxPx: number) => {
      if (!dxPx) return;
      const W = canvas.getBoundingClientRect().width - AXIS_W, w = controls.current.windowMin, step = navStep(w);
      const colW = heatColumnWidth(W, Math.round(w * 60 / step));
      const next = (nav.current.end ?? Date.now()) - (dxPx / colW) * step * 1000;
      if (next >= Date.now() - 500) { if (navOn()) goLive(); return; }
      if (!navOn()) setLive(false);
      nav.current.end = clampEnd(next); dirty = true; schedule();
    };

    // Wheel: plot zooms time (window steps); price axis or pinch zooms price; Shift/sideways swipe scrolls time.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const sx = e.deltaX * unit, sy = e.deltaY * unit;
      if (e.shiftKey || Math.abs(sx) > Math.abs(sy)) { panTime(-(sx || sy)); return; }
      if (!e.ctrlKey && e.clientX - rect.left <= rect.width - AXIS_W) {
        wheelAcc += sy;
        if (Math.abs(wheelAcc) < 100 || Date.now() - wheelAt < 200) return;
        const list: number[] = [...WINDOWS, ...(recordedOn() ? LONG_WINDOWS : [])];
        const i = list.indexOf(controls.current.windowMin);
        const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 1 : i) + (wheelAcc > 0 ? 1 : -1)))];
        wheelAcc = 0; wheelAt = Date.now();
        if (next !== undefined && next !== controls.current.windowMin) setWindowMin(next);
        return;
      }
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
    let dragging = false, lastY = 0, lastX = 0, startX = 0, startY = 0, axis: '' | 'time' | 'price' = '';
    const touches = new Map<number, number>();
    let pinchStart = 0, pinchRows = 0;
    const spread = () => { const ys = [...touches.values()]; return Math.abs((ys[0] ?? 0) - (ys[1] ?? 0)); };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, e.clientY);
        if (touches.size === 2) { dragging = false; pinchStart = Math.max(10, spread()); pinchRows = view.current.rows; canvas.setPointerCapture(e.pointerId); return; }
      }
      dragging = true; lastY = startY = e.clientY; lastX = startX = e.clientX; axis = ''; canvas.setPointerCapture(e.pointerId);
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
      if (dragging) {
        // Lock to one axis after 6px: sideways moves time, up/down moves price.
        if (!axis) {
          if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
          axis = Math.abs(e.clientX - startX) > Math.abs(e.clientY - startY) ? 'time' : 'price';
        }
        if (axis === 'time') { panTime(e.clientX - lastX); lastX = e.clientX; return; }
        const H = canvas.getBoundingClientRect().height - AXIS_H;
        const c = controls.current, band = view.current.rows * buffer.bucket * c.grouping;
        view.current.center += ((e.clientY - lastY) / H) * band;
        lastY = e.clientY; dirty = true; schedule();
        return;
      }
      showTip(e.clientX, e.clientY);
    };
    // Hover (or tap) tooltip: price, date/time and resting size at that cell.
    const showTip = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const W = rect.width - AXIS_W, H = rect.height - AXIS_H;
      const tip = tooltipRef.current;
      if (!tip) return;
      const px = clientX - rect.left, py = clientY - rect.top;
      const hit = bubbleHits.filter(dot => Math.hypot(px - dot.x, py - dot.y) <= dot.radius + 4).sort((a, b) => Math.hypot(px - a.x, py - a.y) - Math.hypot(px - b.x, py - b.y))[0];
      if (hit && px < W && py < H) {
        const unit = controls.current.bubbleUnit, priceText = specRef.current ? formatPrice(hit.price, specRef.current) : hit.price.toFixed(2);
        const buy = unit === 'USDT' ? hit.trade.buy : hit.trade.buyCoin ?? hit.trade.buy / hit.price;
        const sell = unit === 'USDT' ? hit.trade.sell : hit.trade.sellCoin ?? hit.trade.sell / hit.price;
        tip.style.display = 'block'; tip.style.whiteSpace = 'pre-line';
        tip.style.left = `${Math.max(4, Math.min(px + 12, W - 210))}px`; tip.style.top = `${Math.max(4, Math.min(py - 12, H - 100))}px`;
        tip.textContent = `${new Date(hit.time).toISOString().replace('T', ' ').replace('Z', ' UTC')}\nPrice ${priceText}\nAggressive Buy ${bubbleNumber(buy)} ${unit === 'USDT' ? 'USDT' : symbol.replace(/USDT$/, '')}\nAggressive Sell ${bubbleNumber(sell)} ${unit === 'USDT' ? 'USDT' : symbol.replace(/USDT$/, '')}\nTrades: ${hit.trade.count ?? 'unavailable'}`;
        return;
      }
      const c = controls.current, g = c.grouping, bs = buffer.bucket * g;
      const rows = Math.max(20, Math.round(view.current.rows));
      const band = rows * bs, top = view.current.center + band / 2;
      const cols = windowColumns();
      const colW = heatColumnWidth(W, cols.length);
      const ci = Math.floor((clientX - rect.left - (W - cols.length * colW)) / colW);
      const r = Math.floor(((clientY - rect.top) / H) * rows);
      const col = cols[ci];
      if (!col || clientX - rect.left > W || clientY - rect.top > H || r < 0 || r >= rows) { tip.style.display = 'none'; return; }
      const rowTop = Math.floor((top - r * bs) / bs);
      const v = col.gap ? 0 : buffer.groupedCell(col, rowTop, g);
      const cellPrice = rowTop * bs;
      tip.style.display = 'block';
      tip.style.left = `${Math.max(4, Math.min(clientX - rect.left + 12, W - 190))}px`;
      tip.style.top = `${Math.max(4, clientY - rect.top - 12)}px`;
      const when = stamp(col.time, true);
      tip.textContent = col.empty ? `${when} · No data recorded` : `${specRef.current ? formatPrice(cellPrice, specRef.current) : cellPrice.toFixed(2)} · ${when} · ${col.gap ? 'gap' : `resting ${compact(v)} USDT`}`;
    };
    const onUp = (e: PointerEvent) => {
      const tap = dragging && !axis && e.pointerType === 'touch';
      touches.delete(e.pointerId); dragging = false;
      if (tap) showTip(e.clientX, e.clientY);
    };
    const onLeave = () => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    return () => {
      stopped = true;
      clearInterval(timer); clearInterval(pulse); clearInterval(persistTimer); cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility); resizeObs.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      redrawRef.current = null; centerRef.current = null; navApi.current = null;
      canvas.removeEventListener('pointerleave', onLeave);
      if (bridge.current.heat === onTrade) bridge.current.heat = null;
    };
  }, [symbol, bridge, historySource]);

  const center = () => centerRef.current?.();
  const control = 'text-t-muted hover:bg-t-border/50 hover:text-t-text';
  useEffect(() => { if (symbol !== RECORDED_SYMBOL && windowMin > 60) setWindowMin(60); }, [symbol, windowMin]);
  const availableMs = recordedAvail ? RECORDED_RETENTION_MS : collected * 1000;
  const retentionText = recordedAvail ? `History kept: ${Math.round(RECORDED_RETENTION_MS / 86400000)} days` : 'History kept: 60 minutes (this browser)';
  const nowMs = Date.now();
  const pickTime = (value: string) => { setGotoValue(value); const t = new Date(value).getTime(); if (Number.isFinite(t)) navApi.current?.goTo(t + windowMin * 30000); };
  const liveButton = (cls: string) => <Button size="sm" onClick={() => navApi.current?.goLive()} className={`${cls} bg-t-accent text-t-bg hover:bg-t-accent/90`} aria-label="Return to live">Live ▶</Button>;
  const gotoInput = (cls: string) => <input type="datetime-local" value={gotoValue} min={toLocalInput(nowMs - availableMs)} max={toLocalInput(nowMs)} onChange={e => pickTime(e.target.value)} aria-label="Go to date and time" className={`${cls} rounded border border-t-border text-t-text [color-scheme:dark]`} />;
  return <div className={`heatmap-surface relative flex h-full w-full flex-col ${mobile || floating ? 'min-h-0' : 'min-h-80'}`} data-testid="heatmap">
    {mobile ? <div className="flex h-11 shrink-0 items-center gap-2 border-b border-t-border px-2 text-xs">
      <span className="min-w-0 flex-1 truncate font-semibold text-t-text">{symbol} · Heatmap · {windowLabel(windowMin)}</span>
      {!live && liveButton('h-10 px-3 text-xs')}
      <Button variant="ghost" size="sm" onClick={center} className={`h-10 px-3 text-xs ${control}`} title="Center on the current price"><Crosshair className="size-4" />Center</Button>
      <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className={`size-10 ${control}`} aria-label="Heatmap settings"><Settings2 /></Button>
    </div> : <>
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-t-border px-3 py-1.5 text-xs">
      <span className="font-semibold text-t-text">{symbol} · Heatmap</span>
      <label className="flex items-center gap-1.5 text-t-muted">Intensity
        <input type="range" min={0.2} max={3} step={0.1} value={intensity} onChange={e => setIntensity(Number(e.target.value))} aria-label="Intensity" className="h-1 w-24 accent-current" />
      </label>
      <span className="flex items-center gap-1" role="group" aria-label="Time window">
        {[...WINDOWS, ...(recordedAvail ? LONG_WINDOWS : [])].map(w => <Button key={w} variant="ghost" size="sm" aria-pressed={windowMin === w} onClick={() => setWindowMin(w)} className={`h-6 px-2 text-xs ${windowMin === w ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{windowLabel(w)}</Button>)}
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
      <span role="group" aria-label="Bubble volume unit" className="flex items-center gap-1">{(['USDT', 'BTC'] as const).map(unit => <Button key={unit} variant="ghost" size="sm" aria-pressed={bubbleUnit === unit} onClick={() => selectUnit(unit)} className={`h-6 px-2 text-xs ${bubbleUnit === unit ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{unit === 'USDT' ? unit : coinLabel}</Button>)}</span>
      <Button variant="ghost" size="sm" onClick={center} className={`h-6 px-2 text-xs ${control}`} title="Center on the current price"><Crosshair className="size-3" />Center</Button>
      <span className="flex items-center gap-1" role="group" aria-label="Go to time">
        <span className="text-t-muted">Go to</span>
        {gotoInput('h-6 bg-t-panel px-1 text-xs')}
        {JUMPS.map(([label, ms]) => <Button key={label} variant="ghost" size="sm" disabled={ms > availableMs} onClick={() => navApi.current?.goTo(Date.now() - ms)} className={`h-6 px-2 text-xs ${control}`}>{label}</Button>)}
      </span>
      {!live && liveButton('h-6 px-2 text-xs')}
      <span className="basis-full text-[10px] text-t-muted tabular-nums"><span data-testid="history-kept">{retentionText}</span>{!recordedAvail && !toolDemoEnabled() && symbol !== RECORDED_SYMBOL && <> · <span data-testid="recorded-only">Recorded history: BTCUSDT only</span></>}{recordedAvail && <> · <span data-testid="history-range">{historyText}</span></>}</span>
    </div>
    </>}
    <div className="relative min-h-0 flex-1">
      {toolDemoEnabled() && <span className="demo-watermark">DEMO DATA</span>}
      <canvas ref={canvasRef} className={`block size-full ${mobile ? 'touch-none' : ''}`} aria-label={`${symbol} order book heatmap`} />
      <span ref={rangeRef} data-testid="heatmap-range" className="pointer-events-none absolute top-2 right-[78px] text-[10px] tabular-nums text-t-muted" />
      {navLoading && <span role="status" className="pointer-events-none absolute top-7 left-1/2 -translate-x-1/2 rounded bg-t-panel/95 px-2 py-0.5 text-[10px] mobile:text-xs text-t-muted">Loading history…</span>}
      <div ref={tooltipRef} data-testid="heatmap-tooltip" className="pointer-events-none absolute z-10 hidden rounded border border-t-border bg-t-panel/95 px-2 py-1 text-[10px] tabular-nums text-t-text" />
      {!toolDemoEnabled() && !recordedShown && collected < 60 && <span role="status" className="pointer-events-none absolute bottom-2 left-3 text-[10px] mobile:text-xs text-t-muted">● Collecting data… {(collected / 60).toFixed(1)} min</span>}
      {historyError && <span role="alert" className="pointer-events-none absolute bottom-8 left-3 right-3 rounded bg-t-panel/95 px-2 py-1 text-xs text-t-warning">History could not load: {historyError}</span>}
      {recordedShown && <span data-testid="recorded-label" className="pointer-events-none absolute top-2 left-3 text-[10px] mobile:text-xs text-t-muted">{liveBinance ? 'Recorded history' : 'Recorded history: Binance BTCUSDT'}</span>}
      {admin && <span data-testid="recorder-status" className="pointer-events-none absolute top-6 left-3 text-[10px] text-t-muted tabular-nums">{status ? `Recorder: last ${status.last ? new Date(status.last).toLocaleTimeString('en-US', { hour12: false }) : '—'} · ${status.lastHour}/h · gaps>15s ${status.gaps} (max ${Math.round(status.maxGapSec)}s) · ${status.lastSource ?? '—'}` : 'Recorder: …'}</span>}
      {priceOnlyFrom !== null && <span data-testid="price-only-label" className="pointer-events-none absolute bottom-2 right-3 text-[10px] mobile:text-xs text-t-muted">Price and trades only.{priceOnlyFrom > 0 ? ` Order book colors start at ${new Date(priceOnlyFrom).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</span>}
    </div>
    {mobile && showSettings && <div className="fixed inset-0 z-50 flex flex-col justify-end bg-t-bg/70" onClick={() => setShowSettings(false)}>
      <div role="dialog" aria-modal="true" aria-label="Heatmap settings" onClick={e => e.stopPropagation()} className="space-y-4 rounded-t-xl border-t border-t-border bg-t-panel px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-t-text">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Heatmap settings</h2><Button variant="ghost" size="icon" className={`size-10 ${control}`} aria-label="Close heatmap settings" onClick={() => setShowSettings(false)}><X /></Button></div>
        <p data-testid="history-kept" className="text-xs text-t-muted">{retentionText}{!recordedAvail && !toolDemoEnabled() && symbol !== RECORDED_SYMBOL && <> · <span data-testid="recorded-only">Recorded history: BTCUSDT only</span></>}</p>
        {recordedAvail && <p data-testid="history-range" className="text-xs text-t-muted tabular-nums">{historyText}</p>}
        <div className="space-y-1"><span className="text-t-muted">Go to</span>
          {gotoInput('h-10 w-full bg-t-bg px-2 text-sm')}
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Go to time">
            {JUMPS.map(([label, ms]) => <Button key={label} variant="ghost" disabled={ms > availableMs} onClick={() => { navApi.current?.goTo(Date.now() - ms); setShowSettings(false); }} className={`h-10 text-sm ${control}`}>{label}</Button>)}
          </div>
          {!live && liveButton('h-10 w-full text-sm')}
        </div>
        <label className="flex h-10 items-center gap-3 text-t-muted">Intensity
          <input type="range" min={0.2} max={3} step={0.1} value={intensity} onChange={e => setIntensity(Number(e.target.value))} aria-label="Intensity" className="h-10 flex-1 accent-current" />
        </label>
        <div className="space-y-1"><span className="text-t-muted">Time window</span><div className="grid grid-cols-4 gap-2" role="group" aria-label="Time window">
          {[...WINDOWS, ...(recordedAvail ? LONG_WINDOWS : [])].map(w => <Button key={w} variant="ghost" aria-pressed={windowMin === w} onClick={() => setWindowMin(w)} className={`h-10 text-sm ${windowMin === w ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{windowLabel(w)}</Button>)}
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
        <div role="group" aria-label="Bubble volume unit" className="grid grid-cols-2 gap-2">{(['USDT', 'BTC'] as const).map(unit => <Button key={unit} variant="ghost" aria-pressed={bubbleUnit === unit} onClick={() => selectUnit(unit)} className={`h-10 text-sm ${bubbleUnit === unit ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{unit === 'USDT' ? unit : coinLabel}</Button>)}</div>
      </div>
    </div>}
  </div>;
}
