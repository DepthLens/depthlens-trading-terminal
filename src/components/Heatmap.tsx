import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Crosshair, Info, Settings2, SlidersHorizontal, History, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { colorFor, COLUMN_MS, type Column, type HeatTrade } from '@/lib/heatmap-data';
import { LONG_WINDOWS, RECORDED_SYMBOL, loadRetentionStats, recordedOldestMs, retentionLine, setRecordedOldest, type RetentionStats, buildNavColumns, fillGaps, historyRange, loadRecorded, loadRecordedPage, loadRecorderStatus, pageEvery, pageSpanMs, peekRecordedPage, recordedEvery, snapshotsToColumns, thinColumns, type RecordedSnapshot, type RecorderStatus } from '@/lib/heatmap-recorded';
import { bubbleBuyShare, bubbleNumber, bubbleRadius, dominantBubble } from '@/lib/heatmap-bubbles';
import { DEFAULT_PRO, HEATMAP_PRO_KEY, restoreProSettings, scaleRange, scalePos, columnFlows, sessionProfile, replayAdvance, type ProSettings, type ColumnFlow } from '@/lib/heatmap-pro';
import { MarkerEngine, type Marker } from '@/lib/heatmap-markers';
import { AlertGate, DEFAULT_ALERTS, alertsKey, restoreAlerts, type AlertSettings } from '@/lib/heatmap-alerts';
import { heatTape } from '@/lib/heatmap-tape';
import { HeatmapProPanel, ReplayBar, TimeSales, type ReplayState } from '@/components/HeatmapPro';
import { DEFAULT_WALLS, HEATMAP_WALLS_KEY, WALL_FADES, WALL_INFO, WALL_MIN_TIMES, WALL_PERCENTILES, WALL_STATUS_LABEL, detectWalls, restoreWallSettings, wallAge, wallAlpha, wallThreshold, wallWidth, type Wall, type WallSettings } from '@/lib/heatmap-walls';
import { HEATMAP_UNIT_KEY, restoreHeatmapUnit, type HeatmapUnit } from '@/lib/terminal-state';
import { calibrateHeatmap, getHeatmapEntry, persistHeatmaps, type HeatSource } from '@/lib/heatmap-store';
import { orderBook } from '@/lib/order-book';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import { niceStep, heatColumnWidth, heatFitRows, heatMaxRows, depthRowSize } from '@/lib/tool-layout';
import { toolDemoEnabled, demoHeatmap } from '@/lib/tool-demo';
import { OFF_SLOTS, RecordedDecodeCache, capBubbles, paintSlots, viewSlots } from '@/lib/heatmap-view';
import type { TradeBridge } from '@/components/LiveQuote';

const AXIS_W = 72, AXIS_H = 26, COB_W = 92, SVP_W = 64;
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
  const [retention, setRetention] = useState<RetentionStats | null>(null);
  useEffect(() => {
    if (symbol !== RECORDED_SYMBOL || toolDemoEnabled()) return;
    let stopped = false;
    const tick = () => { void loadRetentionStats().then(v => { if (stopped || !v) return; setRetention(v); setRecordedOldest(v.first ? Date.parse(v.first) : null); }).catch(() => { /* status line falls back to generic text */ }); };
    tick(); const t = setInterval(tick, 300000); return () => { stopped = true; clearInterval(t); };
  }, [symbol]);
  const [intensity, setIntensity] = useState(1);
  const [windowMin, setWindowMin] = useState<number>(15);
  const [grouping, setGrouping] = useState<number>(1);
  const [minBubble, setMinBubble] = useState(10000);
  const [bubblesOn, setBubblesOn] = useState(true);
  const [bubbleUnit, setBubbleUnit] = useState<HeatmapUnit>('USDT');
  useEffect(() => { try { setBubbleUnit(restoreHeatmapUnit(localStorage.getItem(HEATMAP_UNIT_KEY))); } catch { /* unavailable browser storage */ } }, []);
  const selectUnit = (unit: HeatmapUnit) => { setBubbleUnit(unit); if (!toolDemoEnabled()) { try { localStorage.setItem(HEATMAP_UNIT_KEY, unit); } catch { /* unavailable browser storage */ } } };
  const coinLabel = symbol.replace(/USDT$/, '');
  const [walls, setWalls] = useState<WallSettings>(DEFAULT_WALLS);
  useEffect(() => { try { setWalls(restoreWallSettings(localStorage.getItem(HEATMAP_WALLS_KEY))); } catch { /* unavailable browser storage */ } }, []);
  const updateWalls = (patch: Partial<WallSettings>) => setWalls(prev => { const next = { ...prev, ...patch }; if (!toolDemoEnabled()) { try { localStorage.setItem(HEATMAP_WALLS_KEY, JSON.stringify(next)); } catch { /* unavailable browser storage */ } } return next; });
  const [pro, setPro] = useState<ProSettings>(DEFAULT_PRO);
  useEffect(() => { try { setPro(restoreProSettings(localStorage.getItem(HEATMAP_PRO_KEY))); } catch { /* unavailable browser storage */ } }, []);
  const updatePro = (patch: Partial<ProSettings>) => setPro(prev => { const next = { ...prev, ...patch }; if (!toolDemoEnabled()) { try { localStorage.setItem(HEATMAP_PRO_KEY, JSON.stringify(next)); } catch { /* unavailable browser storage */ } } return next; });
  // The Tools panel edits Wall lines / Time & Sales / panel switches in storage and announces it; re-read so both stay in sync.
  useEffect(() => { const sync = () => { try { setWalls(restoreWallSettings(localStorage.getItem(HEATMAP_WALLS_KEY))); setPro(restoreProSettings(localStorage.getItem(HEATMAP_PRO_KEY))); } catch { /* unavailable browser storage */ } }; window.addEventListener('depthlens-heatmap-settings', sync); return () => window.removeEventListener('depthlens-heatmap-settings', sync); }, []);
  // Phones collapse ladder, lower panels and Time & Sales into toggles (off until tapped).
  const [mob, setMob] = useState({ ladder: false, panels: false, tape: false });
  const [showPro, setShowPro] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertSettings>(DEFAULT_ALERTS);
  useEffect(() => { let off = false; void import('@/integrations/supabase/client').then(({ supabase }) => supabase.auth.getSession()).then(({ data }) => { if (off) return; const id = data.session?.user.id ?? null; setUserId(id); try { setAlerts(restoreAlerts(localStorage.getItem(alertsKey(id)))); } catch { /* unavailable browser storage */ } }).catch(() => { /* signed-out or offline: guest alerts */ }); return () => { off = true; }; }, []);
  const updateAlerts = (patch: Partial<AlertSettings>) => setAlerts(prev => { const next = { ...prev, ...patch }; try { localStorage.setItem(alertsKey(userId), JSON.stringify(next)); } catch { /* unavailable browser storage */ } return next; });
  const replayRef = useRef<ReplayState>({ on: false, playing: false, speed: 20, start: 0, t: 0 });
  const [replayOn, setReplayOn] = useState(false);
  const replayApi = useRef<{ start: (t: number) => void; exit: () => void } | null>(null);
  const tapeReplay = useRef<{ t: number; price: number; notional: number; coin: number; side: 'Buy' | 'Sell' }[] | null>(null);
  const [layoutBox, setLayoutBox] = useState({ H: 0, panelsH: 0 });
  // Time navigation: end === null follows live; otherwise the view is paused at that absolute end time.
  const [live, setLive] = useState(true);
  const [navLoading, setNavLoading] = useState(false);
  const [gotoValue, setGotoValue] = useState('');
  const nav = useRef<{ end: number | null; pendingCenter: boolean }>({ end: null, pendingCenter: false });
  const navApi = useRef<{ goTo: (end: number) => void; goLive: () => void } | null>(null);
  const rangeRef = useRef<HTMLSpanElement>(null);
  // Mutable view/drawing state; the rAF loop reads these refs so drawing never rerenders React.
  const view = useRef({ center: NaN, rows: DEFAULT_ROWS });
  const showLadder = mobile ? mob.ladder : pro.ladder, showPanels = mobile ? mob.panels : (pro.volume || pro.cvd || pro.imbalance), showTape = mobile ? mob.tape : pro.tape;
  const controls = useRef({ intensity, windowMin, grouping, minBubble, bubblesOn, bubbleUnit, walls, pro, alerts, showLadder, showPanels });
  controls.current = { intensity, windowMin, grouping, minBubble, bubblesOn, bubbleUnit, walls, pro, alerts, showLadder, showPanels };
  const specRef = useRef(spec); specRef.current = spec;
  useEffect(() => { redrawRef.current?.(); }, [intensity, windowMin, grouping, minBubble, bubblesOn, bubbleUnit, walls, pro, showLadder, showPanels]);

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
    let lastCutKey = '', scaleLo = 0, scaleHi = 1, normAt = 0, cacheKey = "", userAt = 0;
    // What each offscreen slot currently shows, so only new or changed visible columns are painted.
    const paintedTimes = new Float64Array(OFF_SLOTS).fill(NaN), paintedKind = new Uint8Array(OFF_SLOTS), paintedData: (Float32Array | null)[] = new Array(OFF_SLOTS).fill(null);
    let lastDraw: { cols: readonly Column[]; colW: number; x0: number } = { cols: [], colW: 3, x0: 0 }, moreWork = false;
    const layout = { W: 0, H: 0, panelsH: 0, ladderW: 0 };
    const markerEngine = new MarkerEngine(); let markerKey = '', markerAt = 0;
    let markerHits: { x: number; y: number; m: Marker }[] = [];
    let flows: ColumnFlow[] = [], flowAt = new Map<number, ColumnFlow>(), flowsAt = 0, flowsKey = '', profile: ReturnType<typeof sessionProfile> = { bins: new Map(), poc: null, from: null }, profileAt = 0;
    const gate = new AlertGate(), mountedAt = Date.now(); let alertMarkerAt = Date.now(), tapeAt = 0;
    off.width = OFF_SLOTS;
    let source = orderBook.debug().source;
    let stopped = false, hidden = document.hidden, frame = 0, dirty = true;
    let bubbleHits: { x: number; y: number; radius: number; price: number; time: number; trade: HeatTrade }[] = [];
    // Wall lines are re-detected at most once per second (or on a settings change), never per frame.
    let wallList: Wall[] = [], wallThr = 0, wallKey = '', wallAt = 0;
    view.current = { center: NaN, rows: DEFAULT_ROWS };
    // Recorded history fills short gaps and extends long Binance BTCUSDT windows.
    let recRows: RecordedSnapshot[] = [], recFor = 0, recFirst = Infinity, loading = false, recCheckedAt = 0, requestedWindow = 0;
    let shortCols: Column[] = [], shortKey = '', shown = false, long = false, lastRangeKey = '';
    // Only visible slots (plus a small lookback margin) are built and decoded; logicalN is the full window's
    // column count, which keeps the right-anchored column width exactly as before.
    let logicalN = 0, stepMsCur = 1000;
    const decodeCache = new RecordedDecodeCache(6000), DECODE_BUDGET = 400;
    // Recorded history is Binance BTCUSDT and loads whatever the live price source is.
    const recordedOn = () => !demo && symbol === RECORDED_SYMBOL;
    setLiveBinance((historySource ?? source) === 'binance');
    setRecordedAvail(recordedOn()); setRecordedShown(false); setHistoryError(null); setRange(null);
    // ---- Time navigation state (paged recorded history + live buffer) ----
    let navCols: Column[] = [], navKey = '', navAt = 0, wheelAcc = 0, wheelAt = 0, lastRange = '';
    const navFailedAt = new Map<string, number>(), navPending = new Set<string>();
    nav.current = { end: null, pendingCenter: false }; setLive(true); setNavLoading(false);
    const navOn = () => nav.current.end !== null;
    const oldestMs = () => recordedOn() ? recordedOldestMs() : (buffer.columns[0]?.time ?? Date.now());
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
    // Columns for [from, end) from the fixed recorded pages, decoding only rows inside the range (a few hundred per frame).
    const recordedRange = (w: number, from: number, end: number, budget: { left: number }): { cols: Column[]; complete: boolean } => {
      const every = pageEvery(w), span = pageSpanMs(every), out: Column[] = [], expand = w <= 60;
      const first = Math.floor(from / span), last = Math.floor((end - 1) / span);
      let complete = true;
      for (let p = first; p <= last; p++) {
        const ck = `${every}:${p}:${buffer.bucket}:${expand ? 1 : 0}`;
        let rows = peekRecordedPage(every, p);
        // An open page being refreshed keeps showing its previous rows until the new ones arrive.
        if (!rows) { requestPage(every, p); rows = decodeCache.rowsOf(ck); if (!rows) continue; }
        if (!decodeCache.collect(ck, rows, from, end, row => snapshotsToColumns([row], buffer.bucket, every, expand), budget, out)) complete = false;
      }
      // Prefetch the next older page so dragging back stays fast.
      if ((first - 1) * span >= recordedOldestMs() && !peekRecordedPage(every, first - 1)) requestPage(every, first - 1);
      return { cols: out, complete };
    };
    // Paused views and long live windows: a time-linear grid of only the visible slots plus margin.
    const navColumns = (W: number): readonly Column[] => {
      const w = controls.current.windowMin, step = navStep(w), stepMs = step * 1000, follow = !navOn();
      const raw = nav.current.end ?? Date.now();
      const end = (follow ? Math.ceil(raw / stepMs) : Math.floor(raw / stepMs)) * stepMs;
      const total = Math.round(w * 60 / step), { build } = viewSlots(W, total);
      logicalN = total; stepMsCur = stepMs;
      const k = `${w}:${end}:${buffer.bucket}:${build}`;
      if (k === navKey && !(follow && Date.now() - navAt >= 1000)) return navCols;
      decodeCache.beginPass();
      const from = end - build * stepMs, rec = recordedOn() ? recordedRange(w, from, end, { left: DECODE_BUDGET }) : { cols: [], complete: true };
      navCols = buildNavColumns(buffer.columns, rec.cols, from, end, step); navKey = rec.complete ? k : ''; navAt = Date.now();
      if (!rec.complete) moreWork = true;
      if (nav.current.pendingCenter) { const lastCol = [...navCols].reverse().find(c => !c.empty && Number.isFinite(c.price)); if (lastCol) { view.current.center = lastCol.price; nav.current.pendingCenter = false; } }
      return navCols;
    };
    const requestHistory = (w: number, before: number) => {
      if (loading || (requestedWindow === w && Date.now() - recCheckedAt < 10000)) return;
      loading = true; requestedWindow = w; recCheckedAt = Date.now();
      void loadRecorded(w, before).then(rows => {
        if (stopped || controls.current.windowMin !== w) return;
        if (rows !== recRows) decodeCache.drop('short:');
        recRows = rows; recFor = w; shortKey = '';
        recFirst = rows.reduce((m, r) => { const t = Date.parse(r.ts); return Number.isFinite(t) ? Math.min(m, t) : m; }, Infinity);
        setRange(historyRange(rows)); setHistoryError(null); dirty = true; schedule();
      }).catch(error => {
        if (!stopped && controls.current.windowMin === w) setHistoryError(error instanceof Error ? error.message : String(error));
      }).finally(() => { loading = false; });
    };
    const windowColumns = (W: number): readonly Column[] => {
      const w = controls.current.windowMin;
      if (navOn() || (w > 60 && recordedOn())) {
        long = !navOn();
        const cols = navColumns(W);
        const hasRecorded = cols.some(c => c.recorded); if (shown !== hasRecorded) { shown = hasRecorded; setRecordedShown(shown); }
        if (long) {
          // Settings "History" line describes the recorded part currently loaded for the view.
          let a = Infinity, b = -Infinity, n = 0;
          for (const c of cols) if (c.recorded) { a = Math.min(a, c.time); b = Math.max(b, c.time); n++; }
          const rk = n ? `${a}:${b}:${n}` : '';
          if (rk !== lastRangeKey) { lastRangeKey = rk; setRange(n ? { from: a, to: b, count: n } : null); }
        }
        return cols;
      }
      long = false; stepMsCur = 1000;
      const liveCols = buffer.columns.slice(-Math.min(w, 60) * 60);
      const liveOnly = () => { if (shown) { shown = false; setRecordedShown(false); } logicalN = liveCols.length; return liveCols.slice(-Math.max(1, viewSlots(W, logicalN).build)); };
      if (!recordedOn()) return liveOnly();
      // Binance BTCUSDT: fill holes (tab hidden, chart view, other pair) with the recording, visible part only.
      if (requestedWindow !== w || Date.now() - recCheckedAt >= 10000) requestHistory(w, Date.now());
      if (recFor !== w) return liveOnly();
      const now = Date.now(), covered = Math.round((now - Math.max(now - w * 60000, recFirst)) / 1000);
      logicalN = Math.max(liveCols.length, Number.isFinite(covered) ? covered : 0);
      const { build } = viewSlots(W, logicalN);
      const k = `${Math.floor(now / 1000)}:${buffer.bucket}:${recFor}:${recRows.length}:${build}:${liveCols.at(-1)?.time ?? 0}`;
      if (k === shortKey) return shortCols;
      const fromMs = Math.max(now - w * 60000, now - (build + 2) * 1000), rec: Column[] = [];
      decodeCache.beginPass();
      const complete = decodeCache.collect(`short:${recFor}:${buffer.bucket}`, recRows, fromMs - 10000, now + 1000, row => snapshotsToColumns([row], buffer.bucket), { left: DECODE_BUDGET }, rec);
      const { cols, filled } = fillGaps(liveCols, rec, fromMs, now);
      shortCols = cols.slice(-Math.max(1, build)); shortKey = complete ? k : '';
      if (!complete) moreWork = true;
      if (shown !== filled > 0) { shown = filled > 0; setRecordedShown(shown); }
      return shortCols;
    };
    const slotOf = (col: Column) => ((Math.floor(col.time / stepMsCur) % OFF_SLOTS) + OFF_SLOTS) % OFF_SLOTS;

    // Trades flow in through the bridge; every trade is aggregated immediately.
    const onTrade = (tick: { price: number; size?: number; side?: 'Buy' | 'Sell'; tradeCount?: number }) => {
      if (!demo && tick.size !== undefined) { buffer.trade(tick.price, tick.size, tick.side, tick.tradeCount); heatTape.push({ t: Date.now(), price: tick.price, coin: tick.size, notional: tick.price * tick.size, side: tick.side ?? 'Buy' }); }
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
      const c0 = controls.current;
      const cobW = mobileRef.current ? 62 : COB_W, svpW = mobileRef.current ? 40 : SVP_W;
      const ladderW = c0.showLadder ? cobW + (c0.pro.svp ? svpW : 0) : 0;
      const nPanels = c0.showPanels ? (mobileRef.current ? 3 : [c0.pro.volume, c0.pro.cvd, c0.pro.imbalance].filter(Boolean).length) : 0;
      const panelsH = nPanels ? Math.min(Math.round(cssH * .45), c0.pro.panelH) : 0;
      const W = cssW - AXIS_W - ladderW, H = cssH - AXIS_H - panelsH;
      if (layout.H !== H || layout.panelsH !== panelsH) setLayoutBox({ H, panelsH });
      Object.assign(layout, { W, H, panelsH, ladderW });
      const styles = getComputedStyle(canvas);
      const cBg = styles.getPropertyValue('--heat-bg').trim();
      const cMuted = styles.getPropertyValue('--heat-text').trim();
      const cBorder = styles.getPropertyValue('--heat-grid').trim();
      const cUp = styles.getPropertyValue('--flow-up').trim();
      const cDown = styles.getPropertyValue('--flow-down').trim();
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = cBg; ctx.fillRect(0, 0, cssW, cssH);

      const c = controls.current;
      const dbg0 = orderBook.debug();
      if(lastGrouping!==c.grouping){view.current.rows=Math.max(20,view.current.rows*lastGrouping/c.grouping);lastGrouping=c.grouping;}
      moreWork = false;
      const cols = windowColumns(W);
      const price = fixture ? demoPrice : bridge.current.latest?.price ?? cols.at(-1)?.price ?? NaN;
      if (!Number.isFinite(view.current.center)) { view.current.center = price; view.current.rows = heatFitRows(depthSpan || buffer.bucket * 150, buffer.bucket, c.grouping); }
      // Auto-fit: keep the price inside the middle half and the fitted depth band filling the height (paused 10s after manual zoom/drag).
      if (c.pro.autoFit && !navOn() && fitted && Number.isFinite(price) && Date.now() - userAt > 10000) {
        const fitRows = heatFitRows(depthSpan || buffer.bucket * 150, buffer.bucket, c.grouping), halfBand = view.current.rows * buffer.bucket * c.grouping / 2;
        if (Math.abs(price - view.current.center) > halfBand * .5) view.current.center = price;
        if (Math.abs(view.current.rows - fitRows) > 1) view.current.rows = fitRows;
      }
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
      const cutKey = `${c.pro.lowCut}:${c.pro.highCut}:${rows}:${g}`;
      const scaleChanged = Date.now() - normAt >= 5000 || cutKey !== lastCutKey; lastCutKey = cutKey;
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
        const sr = scaleRange(values, c.pro.lowCut, c.pro.highCut); scaleLo = sr.lo; scaleHi = sr.hi; normAt = Date.now();
      }
      const norm = scaleHi;
      const topIdx0 = Math.floor(top / buffer.bucket), stepMs = stepMsCur;
      const key = `${top}:${rows}:${g}:${scaleLo}:${scaleHi}:${c.intensity}:${c.pro.lowCut}:${c.pro.highCut}:${stepMs}:${buffer.bucket}`;
      const rebuild = key !== cacheKey || off.height !== rows;
      if (off.height !== rows) off.height = rows;
      const firstTime = cols[0]?.time ?? 0;
      if (rebuild) { offCtx.clearRect(0, 0, off.width, off.height); paintedTimes.fill(NaN); paintedData.fill(null); paintedKind.fill(0); }
      const colW = viewSlots(W, logicalN).colW, x0 = W - N * colW, firstVis = Math.max(0, Math.floor(-x0 / colW));
      // Paint only visible columns that are new or changed since the slot was last painted, in batched blits.
      const todo: { slot: number; col: Column }[] = [];
      for (let ci = firstVis; ci < N; ci++) {
        const col = cols[ci]; if (!col) continue;
        const slot = slotOf(col), kind = (col.gap ? 1 : 0) | (col.priceOnly ? 2 : 0) | (col.empty ? 4 : 0), data = col.empty ? null : col.data;
        if (paintedTimes[slot] === col.time && paintedKind[slot] === kind && paintedData[slot] === data) continue;
        paintedTimes[slot] = col.time; paintedKind[slot] = kind; paintedData[slot] = data;
        todo.push({ slot, col });
      }
      paintSlots(offCtx, todo, rows, topIdx0, g, scaleLo, scaleHi, c.intensity);
      cacheKey = key;
      lastDraw = { cols, colW, x0 };
      ctx.imageSmoothingEnabled = false; offCtx.imageSmoothingEnabled = false;
      for (let ci = firstVis; ci < N; ci++) {
        const col = cols[ci]; if (!col) continue;
        const slot = slotOf(col);
        ctx.drawImage(off, slot, 0, 1, rows, x0 + ci * colW, 0, colW, H);
      }
      // Wall lines: large resting orders that persisted, with Held / Pulled / Broken outcomes.
      const xAt = (t: number) => {
        if (!N || t <= (cols[0]?.time ?? 0)) return x0;
        let a = 0, b = N - 1;
        while (a < b) { const m = (a + b + 1) >> 1; if ((cols[m]?.time ?? 0) <= t) a = m; else b = m - 1; }
        return x0 + (a + .5) * colW;
      };
      const wallLabels: { y: number; text: string; color: string; alpha: number; peak: number }[] = [];
      const ws = c.walls, nowT = navOn() ? (cols.at(-1)?.time ?? Date.now()) : Date.now();
      if (ws.on) {
        const midIdx = Math.floor((top - band / 2) / buffer.bucket), half = Math.min(600, Math.ceil(band / buffer.bucket));
        const wk = `${JSON.stringify(ws)}:${buffer.bucket}:${c.windowMin}:${navOn()}:${demo}`;
        if (wk !== wallKey || Date.now() - wallAt >= 1000) {
          const r = detectWalls(cols, buffer.bucket, midIdx - half, midIdx + half, ws, nowT);
          wallList = r.walls; wallThr = r.threshold; wallKey = wk; wallAt = Date.now();
        }
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        for (const w of wallList) {
          if ((w.status === 'pulled' && !ws.showPulled) || (w.status === 'broken' && !ws.showBroken)) continue;
          const alpha = wallAlpha(w, nowT, ws.fadeMs), y = Math.round(priceToY(w.price, top, band, H)) + .5;
          if (alpha <= .02 || y < 0 || y > H) continue;
          const xa = Math.max(0, xAt(w.start)), xb = w.endedAt === null ? W : Math.min(W, xAt(w.endedAt));
          const color = w.status === 'broken' ? cMuted : w.side === 'bid' ? cUp : cDown;
          const lw = wallWidth(w.peak, wallThr), xe = Math.max(xa + 2, xb);
          ctx.setLineDash(w.status === 'pulled' ? [5, 4] : []);
          // Dark halo keeps the line readable on top of bright liquidity cells.
          ctx.globalAlpha = alpha * .7; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = lw + 2;
          ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xe, y); ctx.stroke();
          ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xe, y); ctx.stroke();
          const size = c.bubbleUnit === 'USDT' ? compact(w.size) : `${bubbleNumber(w.size / w.price)} ${symbol.replace(/USDT$/, '')}`;
          const status = WALL_STATUS_LABEL[w.status];
          wallLabels.push({ y, alpha, color, peak: w.peak, text: `${w.side === 'bid' ? 'Bid' : 'Ask'} wall ${size} · ${wallAge((w.endedAt ?? nowT) - w.start)}${status ? ` · ${status}` : ''}` });
        }
        ctx.restore(); ctx.setLineDash([]);
      }
      // Markers (Pulled / Iceberg / Absorption): processed incrementally once per second, drawn per frame.
      const pr = c.pro, anyMarker = pr.pulled || pr.iceberg || pr.absorption;
      markerHits = [];
      if (anyMarker) {
        const stepMs = N > 1 ? Math.max(1000, ((cols.at(-1)?.time ?? 0) - (cols[0]?.time ?? 0)) / (N - 1)) : 1000;
        const mk = `${buffer.bucket}:${c.windowMin}:${navOn()}:${pr.pulled}:${pr.iceberg}:${pr.absorption}`;
        if (mk !== markerKey || (cols.at(-1)?.time ?? 0) < markerEngine.processedTo) { markerEngine.reset(); markerKey = mk; markerAt = 0; }
        if (Date.now() - markerAt >= 1000) {
          markerAt = Date.now();
          const midIdx = Math.floor((top - band / 2) / buffer.bucket), half = Math.min(600, Math.ceil(band / buffer.bucket));
          const thr = ws.on ? wallThr : wallThreshold(cols, midIdx - half, midIdx + half, 1);
          markerEngine.process(cols, buffer.bucket, thr, pr, stepMs);
        }
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
        const t0 = cols[0]?.time ?? 0, t1 = cols.at(-1)?.time ?? 0;
        for (const m of markerEngine.markers) {
          if (m.time < t0 || m.time > t1 || !pr[m.kind]) continue;
          const x = xAt(m.time), y = priceToY(m.price, top, band, H);
          if (y < -6 || y > H + 6 || x < 0) continue;
          markerHits.push({ x, y, m });
          ctx.globalAlpha = .95; ctx.lineWidth = 1; ctx.strokeStyle = cBg;
          if (m.kind === 'pulled') { ctx.fillStyle = cMuted; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = cBg; ctx.fillText('P', x, y + 3); }
          else if (m.kind === 'iceberg') { ctx.fillStyle = styles.getPropertyValue('--flow-text').trim(); ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
          else { const up = m.side === 'sell'; ctx.fillStyle = up ? cUp : cDown; ctx.beginPath(); if (up) { ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); } else { ctx.moveTo(x, y + 6); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x - 6, y - 5); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
        }
        ctx.restore();
      }
      canvas.dataset['markers'] = markerHits.map(h => h.m.kind[0]).join('');
      // Alerts (live only): once per wall/marker key every 5 minutes, toast plus optional browser notification.
      const al = c.alerts;
      if (!demo && !navOn() && (al.newWall || al.wallPulled || al.nearWall || al.iceberg || al.absorption) && Date.now() - mountedAt > 3000) {
        const fire = (key: string, text: string) => {
          if (!gate.allow(key, Date.now())) return;
          toast(text, { description: 'Heatmap alert · context, not a signal' });
          try { if (al.browser && typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('DepthLens', { body: text }); } catch { /* notifications unavailable */ }
          canvas.dataset['alerts'] = String(Number(canvas.dataset['alerts'] ?? 0) + 1);
        };
        const fmt = (p: number) => specRef.current ? formatPrice(p, specRef.current) : p.toFixed(2);
        for (const w of wallList) {
          const side = w.side === 'bid' ? 'Bid' : 'Ask';
          if (al.newWall && w.status === 'active' && w.size >= al.wallSize && w.start >= mountedAt - 300000) fire(`wall:${w.index}`, `New ${side.toLowerCase()} wall ${compact(w.size)} at ${fmt(w.price)}`);
          if (al.wallPulled && w.status === 'pulled' && (w.endedAt ?? 0) >= mountedAt) fire(`pulled:${w.index}`, `${side} wall pulled at ${fmt(w.price)} (${compact(w.peak)})`);
          if (al.nearWall && w.status === 'active' && Number.isFinite(price) && Math.abs(price - w.price) / price * 100 <= al.nearPct) fire(`near:${w.index}`, `Price within ${al.nearPct}% of ${side.toLowerCase()} wall ${compact(w.size)} at ${fmt(w.price)}`);
        }
        for (const m of markerEngine.markers) {
          if (m.time <= alertMarkerAt) continue;
          if (m.kind === 'iceberg' && al.iceberg) fire(`iceberg:${m.index}`, `Iceberg at ${fmt(m.price)} · hidden ≈ ${compact(m.hidden ?? 0)} USDT`);
          if (m.kind === 'absorption' && al.absorption) fire(`absorption:${m.index}`, `Absorption at ${fmt(m.price)} · buy ${compact(m.buy ?? 0)} / sell ${compact(m.sell ?? 0)}`);
        }
        alertMarkerAt = markerEngine.markers.at(-1)?.time ?? alertMarkerAt;
      }
      Object.assign(canvas.dataset, { walls: String(wallLabels.length), wallStatuses: wallLabels.map(l => l.text.split(' · ')[2] ?? 'Active').join(',') });
      Object.assign(canvas.dataset, { rows: String(rows), bucket: String(buffer.bucket), depthSpan: String(depthSpan), columnWidth: String(colW), demo: String(demo), normalizationAt: String(normAt) });
      // Trade bubbles: radius ∝ sqrt(volume), green buyer / red seller aggressor.
      bubbleHits = [];
      if (c.bubblesOn) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        const lastAt = new Map<number, (typeof bubbleHits)[number]>();
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
            const prev = lastAt.get(bucket);
            if (prev && x - prev.x < prev.radius + radius && Math.abs(prev.y - y) < Math.max(prev.radius, radius)) {
              const m = prev.trade, tot = m.buy + m.sell + t.buy + t.sell;
              const merged = { buy: m.buy + t.buy, sell: m.sell + t.sell, count: (m.count ?? 0) + (t.count ?? 0), buyCoin: (m.buyCoin ?? 0) + (t.buyCoin ?? 0), sellCoin: (m.sellCoin ?? 0) + (t.sellCoin ?? 0), price: ((prev.price * (m.buy + m.sell)) + executionPrice * (t.buy + t.sell)) / tot };
              prev.trade = merged; prev.x = (prev.x + x) / 2; prev.radius = bubbleRadius(merged.buy + merged.sell, 0); prev.price = merged.price; prev.y = priceToY(merged.price, top, band, H);
              continue;
            }
            const hit = { x, y, radius, price: executionPrice, time: col.time, trade: t as HeatTrade };
            bubbleHits.push(hit); lastAt.set(bucket, hit);
          }
        }
        // Zoomed-out views can hold many trades: keep the largest so drawing stays light.
        bubbleHits = capBubbles(bubbleHits);
        // Glossy volumetric spheres: split buy/sell wedge, radial shading, specular highlight, dark rim, thin stems.
        const path = [...bubbleHits].sort((m, n) => m.time - n.time || m.x - n.x);
        // Trade path: green segment when price rises, red when it falls, drawn behind the spheres.
        ctx.globalAlpha = .9; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!, b = path[i]!;
          ctx.strokeStyle = b.price > a.price ? cUp : b.price < a.price ? cDown : (b.trade.buy >= b.trade.sell ? cUp : cDown);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const order = [...bubbleHits].sort((m, n) => n.radius - m.radius);
        for (const { x, y, radius: r, trade: t } of order) {
          const share = bubbleBuyShare(t), buyMain = share >= .5;
          ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
          ctx.fillStyle = buyMain ? cUp : cDown; ctx.fillRect(x - r, y - r, r * 2, r * 2);
          const minor = buyMain ? 1 - share : share;
          if (minor > .02) { ctx.fillStyle = buyMain ? cDown : cUp; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r + 1, -Math.PI / 2, -Math.PI / 2 + minor * Math.PI * 2); ctx.closePath(); ctx.fill(); }
          const shade = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
          shade.addColorStop(0, 'rgba(255,255,255,.3)'); shade.addColorStop(.5, 'rgba(255,255,255,0)'); shade.addColorStop(.85, 'rgba(0,0,0,.18)'); shade.addColorStop(1, 'rgba(0,0,0,.5)');
          ctx.fillStyle = shade; ctx.fillRect(x - r, y - r, r * 2, r * 2);
          if (r >= 2) { const hl = ctx.createRadialGradient(x - r * .35, y - r * .4, 0, x - r * .35, y - r * .4, r * .42); hl.addColorStop(0, 'rgba(255,255,255,.95)'); hl.addColorStop(.35, 'rgba(255,255,255,.55)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
          ctx.restore();
          ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r - .5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
      Object.assign(canvas.dataset, { bubbles: String(bubbleHits.length), largeBubbles: String(bubbleHits.filter(dot => dot.radius >= 11).length) });

      // Price line through per-second last trade prices.
      ctx.beginPath();
      let started = false;
      for (let ci = Math.max(0, firstVis - 1); ci < N; ci++) {
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

      if (navOn() && Date.now() - tapeAt >= 500) {
        tapeAt = Date.now(); const out: NonNullable<typeof tapeReplay.current> = [];
        for (let i = N - 1; i >= 0 && out.length < 150; i--) { const col = cols[i]; if (!col) continue;
          for (const [k, t] of col.trades) { const p2 = t.price ?? (k + .5) * buffer.bucket; if (t.buy > 0) out.push({ t: col.time, price: p2, notional: t.buy, coin: t.buyCoin ?? t.buy / p2, side: 'Buy' }); if (t.sell > 0) out.push({ t: col.time, price: p2, notional: t.sell, coin: t.sellCoin ?? t.sell / p2, side: 'Sell' }); } }
        tapeReplay.current = out;
      } else if (!navOn()) tapeReplay.current = null;
      // Wall labels at the right edge of the plot; the biggest walls win when labels would overlap.
      if (wallLabels.length) {
        ctx.save(); ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        const used: number[] = [];
        for (const l of [...wallLabels].sort((a, b) => b.peak - a.peak)) {
          const ly = Math.min(H - 4, Math.max(10, l.y - 3));
          if (used.some(u => Math.abs(u - ly) < 12)) continue;
          used.push(ly);
          const tw = ctx.measureText(l.text).width;
          ctx.globalAlpha = .88; ctx.fillStyle = cBg; ctx.fillRect(W - tw - 9, ly - 10, tw + 8, 14);
          ctx.globalAlpha = Math.max(.7, l.alpha); ctx.fillStyle = l.color; ctx.fillText(l.text, W - 5, ly);
        }
        ctx.restore();
      }

      // Best bid / ask thin lines.
      const dbg = orderBook.debug();
      ctx.lineWidth = 1;
      if (!demo && !navOn() && dbg.bestBid !== null) { const y = priceToY(dbg.bestBid, top, band, H); if (y >= 0 && y <= H) { ctx.strokeStyle = cUp; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
      if (!demo && !navOn() && dbg.bestAsk !== null) { const y = priceToY(dbg.bestAsk, top, band, H); if (y >= 0 && y <= H) { ctx.strokeStyle = cDown; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }

      // Axes.
      ctx.strokeStyle = cBorder; ctx.beginPath(); ctx.moveTo(W + 0.5, 0); ctx.lineTo(W + 0.5, H + panelsH); ctx.moveTo(0, H + 0.5); ctx.lineTo(W, H + 0.5); ctx.moveTo(0, H + panelsH + 0.5); ctx.lineTo(W, H + panelsH + 0.5); ctx.stroke();
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
        if (spaced ? (ci + logicalN - N) % labelEvery !== 0 : (t % 60000 >= COLUMN_MS || Math.floor(t / 60000) % Math.max(1, Math.ceil((withDate ? 96 : 60) / (60 * colW))) !== 0)) continue;
        const d = new Date(t);
        ctx.fillText(withDate ? stamp(t) : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, x0 + (ci + 0.5) * colW, H + panelsH + 16);
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
      ctx.fillText(compact(scaleLo), lx, ly - 3);
      ctx.textAlign = 'right'; ctx.fillText(`${compact(norm)} USDT`, lx + lw, ly - 3);

      // ---- Right side: price-aligned order book ladder (COB) and session volume profile (SVP) ----
      if (ladderW) {
        const lx0 = W + AXIS_W, rowH = H / rows, topIdx = Math.floor(top / buffer.bucket);
        ctx.fillStyle = cBg; ctx.fillRect(lx0, 0, ladderW, H + panelsH);
        ctx.strokeStyle = cBorder; ctx.beginPath(); ctx.moveTo(lx0 + .5, 0); ctx.lineTo(lx0 + .5, H + panelsH); ctx.stroke();
        let book: Column | undefined;
        for (let i = N - 1; i >= 0; i--) { const cc = cols[i]; if (cc && !cc.gap && !cc.empty && !cc.priceOnly && cc.data.length) { book = cc; break; } }
        const ref = book && Number.isFinite(book.price) ? book.price : price, pIdx = Math.floor(ref / buffer.bucket);
        const live = !navOn() && !demo, bb = live ? dbg0.bestBid : null, ba = live ? dbg0.bestAsk : null;
        const vals: number[] = []; let vmax = 0;
        for (let r = 0; r < rows; r++) { const v = book ? buffer.groupedCell(book, topIdx - r * g, g) : 0; vals.push(v); vmax = Math.max(vmax, v); }
        ctx.save(); ctx.beginPath(); ctx.rect(lx0, 0, ladderW, H); ctx.clip();
        ctx.font = `${Math.max(8, Math.min(10, rowH - 1))}px sans-serif`; ctx.textAlign = 'right';
        const showNums = rowH >= 9;
        for (let r = 0; r < rows; r++) {
          const v = vals[r] ?? 0, idx = topIdx - r * g, y = r * rowH;
          const rowLow = idx - g + 1, isBid = idx < pIdx, isAsk = rowLow > pIdx;
          const isPriceRow = pIdx >= rowLow && pIdx <= idx;
          const bestRow = (bb !== null && Math.floor(bb / buffer.bucket) >= rowLow && Math.floor(bb / buffer.bucket) <= idx) || (ba !== null && Math.floor(ba / buffer.bucket) >= rowLow && Math.floor(ba / buffer.bucket) <= idx);
          if (isPriceRow) { ctx.globalAlpha = .25; ctx.fillStyle = cMuted; ctx.fillRect(lx0, y, cobW, Math.max(1, rowH)); ctx.globalAlpha = 1; }
          if (v > 0 && vmax > 0 && (isBid || isAsk)) {
            const len = Math.max(1, (cobW - 4) * Math.sqrt(v / vmax));
            ctx.globalAlpha = .7; ctx.fillStyle = isBid ? cUp : cDown; ctx.fillRect(lx0 + 2, y + (rowH > 3 ? .5 : 0), len, Math.max(1, rowH - (rowH > 3 ? 1 : 0)));
            ctx.globalAlpha = 1;
            if (showNums) { ctx.fillStyle = styles.getPropertyValue('--flow-text').trim(); ctx.fillText(compact(v), lx0 + cobW - 3, y + rowH / 2 + 3); }
          }
          if (bestRow) { ctx.strokeStyle = styles.getPropertyValue('--flow-text').trim(); ctx.lineWidth = 1; ctx.strokeRect(lx0 + 1.5, y + .5, cobW - 3, Math.max(1, rowH - 1)); }
        }
        canvas.dataset['ladderRows'] = String(rows); canvas.dataset['ladderRowH'] = rowH.toFixed(3);
        if (c.pro.svp) {
          const sx0 = lx0 + cobW;
          if (Date.now() - profileAt >= 1000) {
            profileAt = Date.now();
            const pool = (cols.at(-1)?.time ?? 0) - (cols[0]?.time ?? 0) > (buffer.columns.at(-1)?.time ?? 0) - (buffer.columns[0]?.time ?? 0) ? cols : buffer.columns;
            profile = sessionProfile(pool, buffer.bucket, navOn() ? (cols.at(-1)?.time ?? Date.now()) : Date.now());
          }
          const rowsV = new Array<number>(rows).fill(0);
          for (const [k, v] of profile.bins) { const r = Math.floor((topIdx - k) / g); if (r >= 0 && r < rows) rowsV[r] = (rowsV[r] ?? 0) + v; }
          const pocRow = profile.poc === null ? -1 : Math.floor((topIdx - profile.poc) / g);
          const pmax = Math.max(1, ...rowsV);
          ctx.strokeStyle = cBorder; ctx.beginPath(); ctx.moveTo(sx0 + .5, 0); ctx.lineTo(sx0 + .5, H); ctx.stroke();
          for (let r = 0; r < rows; r++) {
            const v = rowsV[r] ?? 0; if (!v) continue;
            const y = r * rowH, len = Math.max(1, (svpW - 4) * v / pmax);
            ctx.globalAlpha = r === pocRow ? 1 : .55; ctx.fillStyle = r === pocRow ? 'rgb(250,204,21)' : cMuted; ctx.fillRect(sx0 + 2, y + (rowH > 3 ? .5 : 0), len, Math.max(1, rowH - (rowH > 3 ? 1 : 0)));
            ctx.globalAlpha = 1;
            if (showNums && (r === pocRow || len > 24)) { ctx.fillStyle = styles.getPropertyValue('--flow-text').trim(); ctx.fillText(compact(v), sx0 + svpW - 3, y + rowH / 2 + 3); }
          }
          if (pocRow >= 0 && pocRow < rows) { ctx.strokeStyle = 'rgb(250,204,21)'; ctx.strokeRect(sx0 + 1.5, pocRow * rowH + .5, svpW - 3, Math.max(1, rowH - 1)); }
          canvas.dataset['poc'] = profile.poc === null ? '' : String((profile.poc + .5) * buffer.bucket);
        }
        ctx.restore();
        ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = cMuted;
        ctx.globalAlpha = .9; ctx.fillStyle = cBg; ctx.fillRect(lx0 + 1, H - 13, ladderW - 2, 12); ctx.globalAlpha = 1; ctx.fillStyle = cMuted;
        ctx.fillText(navOn() ? 'Book @ view time' : 'Book', lx0 + 3, H - 4);
        if (c.pro.svp) ctx.fillText(profile.from !== null ? `SVP ${pad2(new Date(profile.from).getUTCHours())}:${pad2(new Date(profile.from).getUTCMinutes())}Z` : 'SVP —', lx0 + cobW + 3, H - 4);
      }

      // ---- Lower panels sharing the heatmap time axis: Volume, CVD, Order book imbalance ----
      if (panelsH) {
        const pr2 = c.pro, list = (mobileRef.current ? ['volume', 'cvd', 'imbalance'] : (['volume', 'cvd', 'imbalance'] as const).filter(k => pr2[k])) as ('volume' | 'cvd' | 'imbalance')[];
        const fk = `${N}:${cols[0]?.time}:${cols.at(-1)?.time}:${pr2.imbPct}:${pr2.cvdSession}`;
        // Flows cover only the built columns and refresh at most four times per second; drawing looks them up by time.
        if (fk !== flowsKey) {
          if (Date.now() - flowsAt >= 250 || !flows.length) { flows = columnFlows(cols, buffer.bucket, pr2.imbPct, pr2.cvdSession); flowAt = new Map(flows.map(f => [f.time, f])); flowsKey = fk; flowsAt = Date.now(); }
          else moreWork = true;
        }
        const flowOf = (i: number) => { const col = cols[i]; return col ? flowAt.get(col.time) : undefined; };
        const ph = panelsH / list.length, first = Math.max(0, Math.floor(-x0 / colW));
        ctx.fillStyle = cBg; ctx.fillRect(0, H + 1, W + AXIS_W, panelsH - 1);
        list.forEach((kind, pi) => {
          const py0 = H + pi * ph, pTop = py0 + 12, pH = ph - 16;
          ctx.strokeStyle = cBorder; ctx.beginPath(); ctx.moveTo(0, py0 + .5); ctx.lineTo(W + AXIS_W, py0 + .5); ctx.stroke();
          ctx.save(); ctx.beginPath(); ctx.rect(0, py0, W, ph); ctx.clip();
          let label = '', valueText = '';
          if (kind === 'volume') {
            let vmax = 0; for (let i = first; i < N; i++) { const f = flowOf(i); if (f) vmax = Math.max(vmax, f.buy + f.sell); }
            for (let i = first; i < N; i++) { const f = flowOf(i); if (!f || !vmax) continue;
              const x = x0 + i * colW, hb = pH * f.buy / vmax, hs = pH * f.sell / vmax, base = pTop + pH, bw = Math.max(1, colW - (colW > 3 ? 1 : 0));
              ctx.fillStyle = cUp; ctx.fillRect(x, base - hb, bw, hb); ctx.fillStyle = cDown; ctx.fillRect(x, base - hb - hs, bw, hs); }
            const lf = flowOf(N - 1); label = 'Volume (buy / sell)'; valueText = lf ? compact(lf.buy + lf.sell) : '';
          } else {
            const get = (f: ColumnFlow) => kind === 'cvd' ? f.cvd : f.imbalance;
            let lo = kind === 'imbalance' ? -1 : Infinity, hi = kind === 'imbalance' ? 1 : -Infinity;
            if (kind === 'cvd') for (let i = first; i < N; i++) { const f = flowOf(i); if (f && !f.empty) { lo = Math.min(lo, f.cvd); hi = Math.max(hi, f.cvd); } }
            if (!(hi > lo)) { lo = Math.min(lo, 0) - 1; hi = Math.max(hi, 0) + 1; }
            const yOf = (v: number) => pTop + pH - (v - lo) / (hi - lo) * pH;
            if (lo < 0 && hi > 0) { ctx.strokeStyle = cBorder; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, yOf(0)); ctx.lineTo(W, yOf(0)); ctx.stroke(); ctx.setLineDash([]); }
            ctx.beginPath(); let on = false, last: number | null = null;
            for (let i = first; i < N; i++) { const f = flowOf(i); const v = f && !f.empty ? get(f) : null;
              if (v === null || v === undefined) { on = false; continue; }
              const x = x0 + (i + .5) * colW, y = yOf(v); if (on) ctx.lineTo(x, y); else ctx.moveTo(x, y); on = true; last = v; }
            ctx.lineWidth = 1.25; ctx.strokeStyle = kind === 'cvd' ? styles.getPropertyValue('--flow-text').trim() : (last ?? 0) >= 0 ? cUp : cDown; ctx.stroke();
            label = kind === 'cvd' ? `CVD${pr2.cvdSession ? ' (resets 00:00 UTC)' : ''}` : `Imbalance ±${pr2.imbPct}%`;
            valueText = last === null ? '—' : kind === 'cvd' ? `${last < 0 ? '−' : ''}${compact(Math.abs(last))}` : last.toFixed(2);
          }
          ctx.restore();
          ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = cMuted; ctx.fillText(label, 6, py0 + 10);
          ctx.fillText(valueText, W + 6, py0 + 10);
        });
        canvas.dataset['panels'] = list.join(',');
      }

      // Collecting hint until one minute of history exists.
      if (logicalN < 60) {
        ctx.fillStyle = cMuted; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`Collecting data… ${(logicalN / 60).toFixed(1)} min`, W / 2, 18);
      }
      // Unfinished decoding continues on the next frame instead of blocking this one.
      if (moreWork) dirty = true;
      if (!mobileRef.current || moreWork) schedule();
    };
    const schedule = () => { if (!frame && !stopped) frame = requestAnimationFrame(draw); };
    // Redraw at least once per second (new column) and on every control change.
    let pulses = 0;
    // Phones redraw every 2 seconds to save battery; collection stays at one column per second.
    const pulse = setInterval(() => { if (mobileRef.current && ++pulses % 2) return; dirty = true; schedule(); }, COLUMN_MS);
    centerRef.current = () => { view.current.center = fixture ? demoPrice : bridge.current.latest?.price ?? NaN; view.current.rows = heatFitRows(depthSpan || buffer.bucket * 150, buffer.bucket, controls.current.grouping); dirty = true; schedule(); };
    redrawRef.current = () => { dirty = true; schedule(); };
    if (recordedOn() && controls.current.windowMin <= 60) requestHistory(controls.current.windowMin, Date.now());
    schedule();

    const goTo = (end: number) => { nav.current.end = clampEnd(end); nav.current.pendingCenter = true; navKey = ''; setLive(false); dirty = true; schedule(); };
    const goLive = () => {
      nav.current.end = null; nav.current.pendingCenter = false; navKey = ''; setLive(true);
      const p = fixture ? demoPrice : bridge.current.latest?.price;
      if (p !== undefined && Number.isFinite(p)) view.current.center = p;
      dirty = true; schedule();
    };
    navApi.current = { goTo, goLive };
    // Replay: moves the paused view end forward in time; every layer reads the same columns, so all stay in sync.
    const replayTimer = setInterval(() => {
      const r = replayRef.current;
      if (!r.on || !r.playing) return;
      const { t, done } = replayAdvance(r.t, 100, r.speed, Date.now() - 1000);
      r.t = t; nav.current.end = t; dirty = true; schedule();
      if (done) { r.playing = false; }
    }, 100);
    replayApi.current = {
      start: (t0: number) => { const r = replayRef.current; r.on = true; r.playing = true; r.start = clampEnd(t0); r.t = r.start; heatTape.clear(); goTo(r.start); nav.current.end = r.start; },
      exit: () => { const r = replayRef.current; r.on = false; r.playing = false; tapeReplay.current = null; goLive(); },
    };
    // Positive dx (drag right) moves into the past; reaching the current time resumes live follow.
    const panTime = (dxPx: number) => {
      if (!dxPx) return;
      const W = layout.W || canvas.getBoundingClientRect().width - AXIS_W, w = controls.current.windowMin, step = navStep(w);
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
      if (!e.ctrlKey && e.clientX - rect.left <= (layout.W || rect.width - AXIS_W)) {
        wheelAcc += sy;
        if (Math.abs(wheelAcc) < 100 || Date.now() - wheelAt < 200) return;
        const list: number[] = [...WINDOWS, ...(recordedOn() ? LONG_WINDOWS : [])];
        const i = list.indexOf(controls.current.windowMin);
        const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 1 : i) + (wheelAcc > 0 ? 1 : -1)))];
        wheelAcc = 0; wheelAt = Date.now();
        if (next !== undefined && next !== controls.current.windowMin) setWindowMin(next);
        return;
      }
      const H = layout.H || rect.height - AXIS_H; userAt = Date.now();
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
          view.current.rows = Math.min(heatMaxRows(bridge.current.latest?.price ?? demoPrice, buffer.bucket, controls.current.grouping), Math.max(20, pinchRows * pinchStart / Math.max(10, spread()))); userAt = Date.now();
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
        const H = layout.H || canvas.getBoundingClientRect().height - AXIS_H; userAt = Date.now();
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
      const W = layout.W || rect.width - AXIS_W, H = layout.H || rect.height - AXIS_H;
      const tip = tooltipRef.current;
      if (!tip) return;
      const px = clientX - rect.left, py = clientY - rect.top;
      const mh = markerHits.find(h => Math.hypot(px - h.x, py - h.y) <= 8);
      if (mh && px < W && py < H) {
        const m = mh.m, pt = specRef.current ? formatPrice(m.price, specRef.current) : m.price.toFixed(2);
        const extra = m.kind === 'iceberg' ? `\nTraded ${compact(m.size)} USDT · hidden ≈ ${compact(m.hidden ?? 0)} USDT` : m.kind === 'absorption' ? `\nAggressive buy ${compact(m.buy ?? 0)} / sell ${compact(m.sell ?? 0)} USDT` : `\nRemoved ≈ ${compact(m.size)} USDT`;
        tip.style.display = 'block'; tip.style.whiteSpace = 'pre-line';
        tip.style.left = `${Math.max(4, Math.min(px + 12, W - 240))}px`; tip.style.top = `${Math.max(4, Math.min(py - 12, H - 90))}px`;
        tip.textContent = `${m.kind === 'pulled' ? 'P · Pulled' : m.kind === 'iceberg' ? '◆ Iceberg' : '▲ Absorption'} · ${pt} · ${stamp(m.time, true)}\n${m.detail}${extra}\nContext, not a signal.`;
        return;
      }
      if (px < W && py > H && py < H + layout.panelsH && flowAt.size) {
        const { cols, colW, x0 } = lastDraw, ci = Math.floor((px - x0) / colW), col = cols[ci], f = col ? flowAt.get(col.time) : undefined;
        if (f) { tip.style.display = 'block'; tip.style.whiteSpace = 'pre-line'; tip.style.left = `${Math.max(4, Math.min(px + 12, W - 200))}px`; tip.style.top = `${Math.max(4, py - 70)}px`;
          tip.textContent = `${stamp(f.time, true)}\nBuy ${compact(f.buy)} · Sell ${compact(f.sell)} USDT\nCVD ${f.cvd < 0 ? '−' : ''}${compact(Math.abs(f.cvd))}\nImbalance ${f.imbalance === null ? '—' : f.imbalance.toFixed(2)}`; return; }
      }
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
      const { cols, colW, x0 } = lastDraw;
      const ci = Math.floor((clientX - rect.left - x0) / colW);
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
      redrawRef.current = null; centerRef.current = null; navApi.current = null; replayApi.current = null; clearInterval(replayTimer); replayRef.current.on = false; replayRef.current.playing = false;
      canvas.removeEventListener('pointerleave', onLeave);
      if (bridge.current.heat === onTrade) bridge.current.heat = null;
    };
  }, [symbol, bridge, historySource]);

  const center = () => centerRef.current?.();
  const control = 'text-t-muted hover:bg-t-border/50 hover:text-t-text';
  useEffect(() => { if (symbol !== RECORDED_SYMBOL && windowMin > 60) setWindowMin(60); else if (windowMin > 240) setWindowMin(240); }, [symbol, windowMin]);
  const nowMsAvail = Date.now();
  const availableMs = recordedAvail ? nowMsAvail - recordedOldestMs(nowMsAvail) : collected * 1000;
  const retentionText = recordedAvail ? (retention ? retentionLine(retention) : 'History kept: loading…') : 'History kept: 60 minutes (this browser)';
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
      <label className="flex items-center gap-1.5 text-t-muted">Contrast
        <input type="range" min={0.2} max={3} step={0.1} value={intensity} onChange={e => setIntensity(Number(e.target.value))} aria-label="Contrast" className="h-1 w-24 accent-current" />
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
      <span className="flex items-center gap-1.5 text-t-muted" role="group" aria-label="Wall lines">
        <label className="flex items-center gap-1.5">Walls<input type="checkbox" checked={walls.on} onChange={e => updateWalls({ on: e.target.checked })} aria-label="Toggle wall lines" className="accent-current" /></label>
        {walls.on && <>
          <select value={walls.percentile} onChange={e => updateWalls({ percentile: Number(e.target.value) })} aria-label="Wall size percentile" className="h-6 rounded border border-t-border bg-t-panel px-1 text-xs text-t-text">{WALL_PERCENTILES.map(v => <option key={v} value={v}>Top {v}%</option>)}</select>
          <select value={walls.minMs} onChange={e => updateWalls({ minMs: Number(e.target.value) })} aria-label="Wall minimum time" className="h-6 rounded border border-t-border bg-t-panel px-1 text-xs text-t-text">{WALL_MIN_TIMES.map(v => <option key={v} value={v}>≥ {wallAge(v)}</option>)}</select>
          <select value={walls.fadeMs} onChange={e => updateWalls({ fadeMs: Number(e.target.value) })} aria-label="Wall fade time" className="h-6 rounded border border-t-border bg-t-panel px-1 text-xs text-t-text">{WALL_FADES.map(v => <option key={v} value={v}>Fade {wallAge(v).replace(' 0m', '')}</option>)}</select>
          <label className="flex items-center gap-1">Pulled<input type="checkbox" checked={walls.showPulled} onChange={e => updateWalls({ showPulled: e.target.checked })} aria-label="Show pulled walls" className="accent-current" /></label>
          <label className="flex items-center gap-1">Broken<input type="checkbox" checked={walls.showBroken} onChange={e => updateWalls({ showBroken: e.target.checked })} aria-label="Show broken walls" className="accent-current" /></label>
        </>}
        <span title={WALL_INFO} aria-label={WALL_INFO} role="img" data-testid="wall-info" className="cursor-help"><Info className="size-3" /></span>
      </span>
      <Button variant="ghost" size="sm" onClick={center} className={`h-6 px-2 text-xs ${control}`} title="Center on the current price"><Crosshair className="size-3" />Center</Button>
      <Button variant="ghost" size="sm" aria-pressed={showPro} onClick={() => setShowPro(v => !v)} className={`h-6 px-2 text-xs ${showPro ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`} aria-label="Heatmap panels, markers and alerts"><SlidersHorizontal className="size-3" />Panels & alerts</Button>
      <Button variant="ghost" size="sm" aria-pressed={replayOn} disabled={!recordedAvail && collected < 120} onClick={() => setReplayOn(v => { if (v) replayApi.current?.exit(); return !v; })} className={`h-6 px-2 text-xs ${replayOn ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}><History className="size-3" />Replay</Button>
      <span className="flex items-center gap-1" role="group" aria-label="Go to time">
        <span className="text-t-muted">Go to</span>
        {gotoInput('h-6 bg-t-panel px-1 text-xs')}
        {JUMPS.map(([label, ms]) => <Button key={label} variant="ghost" size="sm" disabled={ms > availableMs} onClick={() => navApi.current?.goTo(Date.now() - ms)} className={`h-6 px-2 text-xs ${control}`}>{label}</Button>)}
      </span>
      {!live && liveButton('h-6 px-2 text-xs')}
      <span className="basis-full text-[10px] text-t-muted tabular-nums"><span data-testid="history-kept">{retentionText}</span>{!recordedAvail && !toolDemoEnabled() && symbol !== RECORDED_SYMBOL && <> · <span data-testid="recorded-only">Recorded history: BTCUSDT only</span></>}{recordedAvail && <> · <span data-testid="history-range">{historyText}</span></>}</span>
    </div>
    </>}
    {mobile && <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-t-border px-2 text-xs" role="group" aria-label="Heatmap panels">
      {([['ladder', 'Book'], ['panels', 'Panels'], ['tape', 'T&S']] as const).map(([k, label]) => <Button key={k} variant="ghost" size="sm" aria-pressed={mob[k]} onClick={() => setMob(m => ({ ...m, [k]: !m[k] }))} className={`h-7 px-2.5 text-xs ${mob[k] ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{label}</Button>)}
      <Button variant="ghost" size="sm" aria-pressed={replayOn} disabled={!recordedAvail && collected < 120} onClick={() => setReplayOn(v => { if (v) replayApi.current?.exit(); return !v; })} className={`h-7 px-2.5 text-xs ${replayOn ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}><History className="size-3.5" />Replay</Button>
    </div>}
    {replayOn && <ReplayBar mobile={mobile} replayRef={replayRef} api={replayApi} minTime={recordedAvail ? recordedOldestMs() : Date.now() - collected * 1000} onExit={() => { replayApi.current?.exit(); setReplayOn(false); }} />}
    {!mobile && showPro && <div className="absolute right-2 top-full z-30 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-md border border-t-border bg-t-panel p-3 text-xs text-t-text shadow-lg" style={{ top: 0, marginTop: 44 }}><div className="mb-2 flex items-center justify-between"><span className="font-semibold">Panels, markers & alerts</span><Button variant="ghost" size="icon" className={`size-6 ${control}`} aria-label="Close panels and alerts" onClick={() => setShowPro(false)}><X className="size-3.5" /></Button></div><HeatmapProPanel pro={pro} update={updatePro} alerts={alerts} updateAlerts={updateAlerts} recordedNote={!recordedAvail && !toolDemoEnabled() && symbol !== RECORDED_SYMBOL} signedIn={userId !== null} /></div>}
    <div className="flex min-h-0 flex-1">
    <div className="relative min-h-0 flex-1">
      {toolDemoEnabled() && <span className="demo-watermark">DEMO DATA</span>}
      <canvas ref={canvasRef} className={`block size-full ${mobile ? 'touch-none' : ''}`} aria-label={`${symbol} order book heatmap`} />
      <span ref={rangeRef} data-testid="heatmap-range" className={`pointer-events-none absolute ${mobile && recordedShown ? admin ? 'top-10' : 'top-7' : 'top-2'} right-[78px] text-[10px] tabular-nums text-t-muted`} />
      {navLoading && <span role="status" className="pointer-events-none absolute top-7 left-1/2 -translate-x-1/2 rounded bg-t-panel/95 px-2 py-0.5 text-[10px] mobile:text-xs text-t-muted">Loading history…</span>}
      <div ref={tooltipRef} data-testid="heatmap-tooltip" className="pointer-events-none absolute z-10 hidden rounded border border-t-border bg-t-panel/95 px-2 py-1 text-[10px] tabular-nums text-t-text" />
      {!toolDemoEnabled() && !recordedShown && collected < 60 && <span role="status" className="pointer-events-none absolute bottom-2 left-3 text-[10px] mobile:text-xs text-t-muted">● Collecting data… {(collected / 60).toFixed(1)} min</span>}
      {historyError && <span role="alert" className="pointer-events-none absolute bottom-8 left-3 right-3 rounded bg-t-panel/95 px-2 py-1 text-xs text-t-warning">History could not load: {historyError}</span>}
      {recordedShown && <span data-testid="recorded-label" className="pointer-events-none absolute top-2 left-3 text-[10px] mobile:text-xs text-t-muted">{liveBinance ? 'Recorded history' : 'Recorded history: Binance BTCUSDT'}</span>}
      {admin && <span data-testid="recorder-status" className="pointer-events-none absolute top-6 left-3 text-[10px] text-t-muted tabular-nums">{status ? `Recorder: last ${status.last ? new Date(status.last).toLocaleTimeString('en-US', { hour12: false }) : '—'} · ${status.lastHour}/h · gaps>15s ${status.gaps} (max ${Math.round(status.maxGapSec)}s) · ${status.lastSource ?? '—'}` : 'Recorder: …'}</span>}
      {priceOnlyFrom !== null && <span data-testid="price-only-label" className="pointer-events-none absolute bottom-2 right-3 text-[10px] mobile:text-xs text-t-muted">Price and trades only.{priceOnlyFrom > 0 ? ` Order book colors start at ${new Date(priceOnlyFrom).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</span>}
      {layoutBox.panelsH > 0 && !mobile && <div role="separator" aria-label="Resize lower panels" aria-orientation="horizontal" className="absolute left-0 right-0 z-10 h-1.5 -translate-y-1/2 cursor-row-resize hover:bg-t-accent/40" style={{ top: layoutBox.H }}
        onPointerDown={e => { const startY = e.clientY, startH = pro.panelH; const el = e.currentTarget; el.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) => setPro(p => ({ ...p, panelH: Math.min(400, Math.max(60, startH - (ev.clientY - startY))) }));
          const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); setPro(p => { try { if (!toolDemoEnabled()) localStorage.setItem(HEATMAP_PRO_KEY, JSON.stringify(p)); } catch { /* unavailable browser storage */ } return p; }); };
          el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); }} />}
      {showTape && mobile && <div className="absolute inset-x-0 bottom-0 z-20 h-[42%] border-t border-t-border bg-t-panel"><TimeSales symbol={symbol} spec={spec} minSize={pro.tapeMin} bigSize={pro.tapeBig} replay={tapeReplay} onMin={v => updatePro({ tapeMin: v })} /></div>}
    </div>
    {showTape && !mobile && <div className="w-56 shrink-0 border-l border-t-border"><TimeSales symbol={symbol} spec={spec} minSize={pro.tapeMin} bigSize={pro.tapeBig} replay={tapeReplay} onMin={v => updatePro({ tapeMin: v })} /></div>}
    </div>
    {mobile && showSettings && <div className="fixed inset-0 z-50 flex flex-col justify-end bg-t-bg/70" onClick={() => setShowSettings(false)}>
      <div role="dialog" aria-modal="true" aria-label="Heatmap settings" onClick={e => e.stopPropagation()} className="max-h-[85dvh] space-y-4 overflow-y-auto rounded-t-xl border-t border-t-border bg-t-panel px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-t-text">
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
        <label className="flex h-10 items-center gap-3 text-t-muted">Contrast
          <input type="range" min={0.2} max={3} step={0.1} value={intensity} onChange={e => setIntensity(Number(e.target.value))} aria-label="Contrast" className="h-10 flex-1 accent-current" />
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
        <div className="space-y-2 border-t border-t-border pt-3" role="group" aria-label="Wall lines">
          <label className="flex h-10 items-center justify-between gap-3 text-t-muted">Wall lines
            <input type="checkbox" checked={walls.on} onChange={e => updateWalls({ on: e.target.checked })} aria-label="Toggle wall lines" className="size-5 accent-current" />
          </label>
          <p data-testid="wall-info" className="text-xs text-t-muted">{WALL_INFO}</p>
          {walls.on && <>
            <span className="text-t-muted">Size</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Wall size percentile">{WALL_PERCENTILES.map(v => <Button key={v} variant="ghost" aria-pressed={walls.percentile === v} onClick={() => updateWalls({ percentile: v })} className={`h-10 text-sm ${walls.percentile === v ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>Top {v}%</Button>)}</div>
            <span className="text-t-muted">Minimum time</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Wall minimum time">{WALL_MIN_TIMES.map(v => <Button key={v} variant="ghost" aria-pressed={walls.minMs === v} onClick={() => updateWalls({ minMs: v })} className={`h-10 text-sm ${walls.minMs === v ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{wallAge(v)}</Button>)}</div>
            <span className="text-t-muted">Fade old lines after</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Wall fade time">{WALL_FADES.map(v => <Button key={v} variant="ghost" aria-pressed={walls.fadeMs === v} onClick={() => updateWalls({ fadeMs: v })} className={`h-10 text-sm ${walls.fadeMs === v ? 'bg-t-accent text-t-bg hover:bg-t-accent/90' : control}`}>{wallAge(v).replace(' 0m', '')}</Button>)}</div>
            <label className="flex h-10 items-center justify-between gap-3 text-t-muted">Show pulled walls
              <input type="checkbox" checked={walls.showPulled} onChange={e => updateWalls({ showPulled: e.target.checked })} aria-label="Show pulled walls" className="size-5 accent-current" />
            </label>
            <label className="flex h-10 items-center justify-between gap-3 text-t-muted">Show broken walls
              <input type="checkbox" checked={walls.showBroken} onChange={e => updateWalls({ showBroken: e.target.checked })} aria-label="Show broken walls" className="size-5 accent-current" />
            </label>
          </>}
        </div>
        <div className="space-y-2 border-t border-t-border pt-3"><span className="font-semibold">Panels, markers & alerts</span>
          <HeatmapProPanel mobile pro={pro} update={updatePro} alerts={alerts} updateAlerts={updateAlerts} recordedNote={!recordedAvail && !toolDemoEnabled() && symbol !== RECORDED_SYMBOL} signedIn={userId !== null} />
        </div>
      </div>
    </div>}
  </div>;
}
