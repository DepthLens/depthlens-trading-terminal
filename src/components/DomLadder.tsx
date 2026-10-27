import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Settings, X, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { orderBook } from '@/lib/order-book';
import { formatPrice, type PriceSpec } from '@/lib/market-data';
import { toolDemoEnabled } from '@/lib/tool-demo';
import type { TradeBridge } from '@/components/LiveQuote';
import { DOM_GROUPINGS, DOM_KEY, DOM_DEFAULT, autoMultiple, buildLadder, clampWidth, demoBook, flashes, isWall, median, restoreDomSettings, type DomSettings } from '@/lib/dom-ladder';

const compact = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n > 0 ? n.toPrecision(2) : '';
const demoPrice = (s: string) => s === 'ETHUSDT' ? 3000 : s === 'DOGEUSDT' ? .15 : 68000;
type Hit = { side: 'ask' | 'bid'; index: number; price: number; coin: number; usdt: number; cumCoin: number; cumUsdt: number; ticks: number; pct: number };

export function DomLadder({ symbol, spec, bridge, mobile, onClose }: { symbol: string; spec: PriceSpec; bridge: MutableRefObject<TradeBridge>; mobile: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<DomSettings>({ ...DOM_DEFAULT });
  const [showSettings, setShowSettings] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [rowLabel, setRowLabel] = useState('');
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const rootRef = useRef<HTMLElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), wrapRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<Record<string, HTMLElement | null>>({});
  const tipRef = useRef<HTMLDivElement>(null);
  const scroll = useRef(0), hover = useRef<{ y: number; x: number } | null>(null), hits = useRef<Hit[]>([]);
  useEffect(() => { setSettings(restoreDomSettings(localStorage.getItem(DOM_KEY))); }, []);
  const change = (next: DomSettings) => { setSettings(next); try { localStorage.setItem(DOM_KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const recenter = () => { scroll.current = 0; setScrolled(false); };
  useEffect(() => { recenter(); }, [symbol]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current, root = rootRef.current;
    if (!canvas || !wrap || !root) return;
    const demo = toolDemoEnabled();
    const fake = demo ? demoBook(demoPrice(symbol), spec.minMove) : null;
    let frame = 0, last = 0, multiple = 0, key = '', dir = 0, label = '';
    let prev = new Map<string, number>(); const flashUntil = new Map<string, number>();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const s = settingsRef.current, rowH = mobile ? 24 : 20, n = s.rows;
      const dbg = orderBook.debug();
      const synced = demo || dbg.state === 'Synced';
      const bidsMap = fake?.bids ?? orderBook.bids.levels, asksMap = fake?.asks ?? orderBook.asks.levels;
      const bestBid = demo ? Math.max(...fake!.bids.keys()) : dbg.bestBid, bestAsk = demo ? Math.min(...fake!.asks.keys()) : dbg.bestAsk;
      const srcName = demo ? 'Demo' : dbg.source === 'bybit' ? 'Bybit' : dbg.source === 'binance' ? 'Binance' : dbg.source;
      const nextKey = `${srcName}:${symbol}`;
      if (nextKey !== key) { key = nextKey; prev = new Map(); flashUntil.clear(); multiple = 0; }
      const tick = bridge.current.latest;
      if (tick?.direction) dir = tick.direction;
      const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : NaN;
      const livePrice = demo ? mid : tick?.price ?? mid;
      multiple = s.grouping === 'auto' ? autoMultiple(Number.isFinite(livePrice) ? livePrice : mid, spec.minMove, n, multiple) : s.grouping;
      const row = multiple * spec.minMove;
      const nextLabel = `${formatPrice(row, spec)} (${multiple}× tick)`;
      if (nextLabel !== label) { label = nextLabel; setRowLabel(label); }
      // Header
      const h = headRef.current, fmt = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : formatPrice(v, spec);
      if (h.source) h.source.textContent = srcName;
      if (h.dot) h.dot.className = `size-2 rounded-full ${synced ? 'bg-t-up' : 'bg-t-warning'}`;
      if (h.dot) h.dot.title = synced ? 'Synced' : 'Resyncing';
      if (h.bid) h.bid.textContent = fmt(bestBid);
      if (h.ask) h.ask.textContent = fmt(bestAsk);
      if (h.mid) h.mid.textContent = fmt(mid);
      if (h.sync) h.sync.style.display = synced ? 'none' : 'flex';
      if (h.note) h.note.textContent = `Order book from ${srcName} only`;
      // Canvas sizing
      const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = wrap.clientHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; }
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const css = getComputedStyle(root), c = (v: string) => css.getPropertyValue(v).trim();
      const up = c('--t-up'), down = c('--t-down'), text = c('--t-text'), muted = c('--t-muted'), accent = c('--t-accent');
      if (bestBid === null || bestAsk === null || !(row > 0)) { hits.current = []; if (h.imb) h.imb.style.width = '50%'; if (h.imbText) h.imbText.textContent = '— / —'; return; }
      const L = buildLadder(bidsMap, asksMap, bestBid, bestAsk, row, n);
      const usd = s.unit === 'usdt', askV = usd ? L.asks : L.askCoin, bidV = usd ? L.bids : L.bidCoin;
      let max = 0, bidSum = 0, askSum = 0; const all: number[] = [];
      for (let i = 0; i < n; i++) { const a = askV[i] ?? 0, b = bidV[i] ?? 0; max = Math.max(max, a, b); askSum += a; bidSum += b; all.push(a, b); }
      const bidShare = bidSum + askSum > 0 ? bidSum / (bidSum + askSum) : .5;
      if (h.imb) h.imb.style.width = `${(bidShare * 100).toFixed(1)}%`;
      if (h.imbText) h.imbText.textContent = `${Math.round(bidShare * 100)}% / ${100 - Math.round(bidShare * 100)}%`;
      const med = median(all);
      const cols = s.cumulative ? [0, .27, .58, .85, 1] : [0, .33, .67, 1];
      const x = (i: number) => (cols[i] ?? 1) * W;
      const total = (2 * n + 1) * rowH, maxScroll = Math.max(0, (total - H) / 2 + rowH * 2);
      scroll.current = Math.max(-maxScroll, Math.min(maxScroll, scroll.current));
      const top = (H - total) / 2 + scroll.current;
      ctx.font = `12px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.textBaseline = 'middle';
      const nextPrev = new Map<string, number>(), list: Hit[] = [];
      const ref = Number.isFinite(livePrice) ? livePrice : mid;
      let cumA = 0, cumAU = 0, cumB = 0, cumBU = 0;
      const rowsOut: { y: number; side: 'ask' | 'bid'; i: number; price: number; v: number; cum: number }[] = [];
      for (let i = 0; i < n; i++) {
        cumA += L.askCoin[i] ?? 0; cumAU += L.asks[i] ?? 0; cumB += L.bidCoin[i] ?? 0; cumBU += L.bids[i] ?? 0;
        const ap = (L.askStart + i) * row, bp = (L.bidStart - i) * row;
        rowsOut.push({ y: top + (n - 1 - i) * rowH, side: 'ask', i, price: ap, v: askV[i] ?? 0, cum: usd ? cumAU : cumA });
        rowsOut.push({ y: top + (n + 1 + i) * rowH, side: 'bid', i, price: bp, v: bidV[i] ?? 0, cum: usd ? cumBU : cumB });
        list.push({ side: 'ask', index: i, price: ap, coin: L.askCoin[i] ?? 0, usdt: L.asks[i] ?? 0, cumCoin: cumA, cumUsdt: cumAU, ticks: Math.round((ap - ref) / spec.minMove), pct: (ap - ref) / ref * 100 });
        list.push({ side: 'bid', index: i, price: bp, coin: L.bidCoin[i] ?? 0, usdt: L.bids[i] ?? 0, cumCoin: cumB, cumUsdt: cumBU, ticks: Math.round((bp - ref) / spec.minMove), pct: (bp - ref) / ref * 100 });
      }
      hits.current = list;
      for (const r of rowsOut) {
        if (r.y + rowH < 0 || r.y > H) continue;
        const ask = r.side === 'ask', color = ask ? down : up;
        const fk = `${r.side}${r.price.toFixed(10)}`;
        nextPrev.set(fk, r.v);
        if (s.flash && flashes(prev.get(fk), r.v)) flashUntil.set(fk, now + 350);
        ctx.globalAlpha = synced ? 1 : (r.i >= n - 5 ? .25 : .55);
        if ((flashUntil.get(fk) ?? 0) > now) { ctx.save(); ctx.globalAlpha *= .22; ctx.fillStyle = text; ctx.fillRect(0, r.y, W, rowH - 1); ctx.restore(); }
        if (r.v > 0 && max > 0) {
          ctx.save(); ctx.globalAlpha *= .35; ctx.fillStyle = color;
          const len = r.v / max * (ask ? x(3) - x(2) : x(1));
          if (ask) ctx.fillRect(x(3) - len, r.y, len, rowH - 1);
          else ctx.fillRect(0, r.y, len, rowH - 1);
          ctx.restore();
        }
        const cy = r.y + rowH / 2;
        ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(formatPrice(r.price, spec), (x(1) + x(2)) / 2, cy);
        ctx.fillStyle = text;
        if (ask) { ctx.textAlign = 'right'; ctx.fillText(compact(r.v), x(3) - 6, cy); }
        else { ctx.textAlign = 'left'; ctx.fillText(compact(r.v), 6, cy); }
        if (s.cumulative) { ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText(compact(r.cum), W - 4, cy); }
        if (s.walls && isWall(r.v, med, s.wallMultiple)) {
          ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.strokeRect(1, r.y + 1, W - 2, rowH - 3);
          ctx.save(); ctx.font = 'bold 9px ui-monospace, monospace'; ctx.fillStyle = accent; ctx.textAlign = ask ? 'left' : 'right';
          ctx.fillText('WALL', ask ? x(1) + 3 : x(2) - 3, cy); ctx.restore();
        }
        if (r.i === 0) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(1, r.y + 1, W - 2, rowH - 3); }
        ctx.globalAlpha = 1;
      }
      prev = nextPrev;
      for (const [k, t] of flashUntil) if (t < now) flashUntil.delete(k);
      // Middle row: last trade, direction and spread.
      const my = top + n * rowH, spread = bestAsk - bestBid;
      ctx.fillStyle = accent; ctx.globalAlpha = .18; ctx.fillRect(0, my, W, rowH); ctx.globalAlpha = 1;
      ctx.fillStyle = dir > 0 ? up : dir < 0 ? down : text; ctx.font = `bold 12px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'left'; ctx.fillText(`${dir > 0 ? '▲' : dir < 0 ? '▼' : '•'} ${Number.isFinite(livePrice) ? formatPrice(livePrice, spec) : '—'}`, 6, my + rowH / 2);
      ctx.fillStyle = muted; ctx.font = `11px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.textAlign = 'right';
      ctx.fillText(`${formatPrice(spread, spec)} · ${(spread / mid * 100).toFixed(3)}%`, W - 6, my + rowH / 2);
      // Tooltip
      const tip = tipRef.current, hv = hover.current;
      if (tip) {
        const idx = hv ? Math.floor((hv.y - top) / rowH) : -1;
        const hit = idx >= 0 && idx < n ? list.find(l => l.side === 'ask' && l.index === n - 1 - idx) : idx > n && idx <= 2 * n ? list.find(l => l.side === 'bid' && l.index === idx - n - 1) : undefined;
        if (!hv || !hit) tip.style.display = 'none';
        else {
          tip.style.display = 'block'; tip.style.top = `${Math.min(H - 90, Math.max(0, hv.y + 12))}px`;
          tip.textContent = `${hit.side === 'ask' ? 'Ask' : 'Bid'} ${formatPrice(hit.price, spec)}\nSize: ${compact(hit.usdt) || '0'} USDT · ${hit.coin.toLocaleString('en-US', { maximumFractionDigits: 4 })} coin\nCumulative: ${compact(hit.cumUsdt) || '0'} USDT · ${hit.cumCoin.toLocaleString('en-US', { maximumFractionDigits: 4 })} coin\nDistance: ${hit.pct >= 0 ? '+' : ''}${hit.pct.toFixed(3)}% · ${hit.ticks} ticks`;
        }
      }
      root.dataset['bestBid'] = String(bestBid); root.dataset['bestAsk'] = String(bestAsk); root.dataset['rowSize'] = String(row);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [symbol, spec, bridge, mobile]);

  const onScroll = (dy: number) => { scroll.current -= dy; setScrolled(scroll.current !== 0); };
  const touchY = useRef<number | null>(null);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); const startX = e.clientX, startW = settingsRef.current.width;
    const move = (m: PointerEvent) => { const w = clampWidth(startW + startX - m.clientX); if (rootRef.current) rootRef.current.style.width = `${w}px`; settingsRef.current = { ...settingsRef.current, width: w }; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); change({ ...settingsRef.current }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const sel = 'h-9 rounded border border-t-border bg-t-bg px-2 text-sm text-t-text mobile:h-10';
  const settingsPanel = showSettings && <div role="dialog" aria-label="DOM settings" className={mobile ? 'fixed inset-x-0 bottom-0 z-[60] max-h-[70dvh] overflow-y-auto rounded-t-xl border-t border-t-border bg-t-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'absolute inset-x-2 top-10 z-30 rounded-md border border-t-border bg-t-panel p-3 shadow-lg'}>
    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">DOM settings</h3><Button variant="ghost" size="icon" className="size-8 text-t-muted mobile:size-10" aria-label="Close DOM settings" onClick={() => setShowSettings(false)}><X /></Button></div>
    <div className="space-y-2 text-sm">
      <label className="flex items-center justify-between gap-2"><span className="text-t-muted">Grouping</span><select aria-label="Grouping" className={sel} value={String(settings.grouping)} onChange={e => change({ ...settings, grouping: e.target.value === 'auto' ? 'auto' : Number(e.target.value) as DomSettings['grouping'] })}>{DOM_GROUPINGS.map(g => <option key={g} value={String(g)}>{g === 'auto' ? 'Auto' : `x${g}`}</option>)}</select></label>
      <p className="text-right text-xs text-t-muted" data-testid="dom-row-size">Row size: {rowLabel}</p>
      <label className="flex items-center justify-between gap-2"><span className="text-t-muted">Rows per side</span><select aria-label="Rows per side" className={sel} value={settings.rows} onChange={e => change({ ...settings, rows: Number(e.target.value) as DomSettings['rows'] })}>{[15, 25, 40].map(r => <option key={r} value={r}>{r}</option>)}</select></label>
      <label className="flex items-center justify-between gap-2"><span className="text-t-muted">Unit</span><select aria-label="Unit" className={sel} value={settings.unit} onChange={e => change({ ...settings, unit: e.target.value === 'coin' ? 'coin' : 'usdt' })}><option value="usdt">USDT notional</option><option value="coin">Coin</option></select></label>
      <label className="flex min-h-9 items-center justify-between"><span className="text-t-muted">Cumulative column</span><Switch aria-label="Cumulative column" checked={settings.cumulative} onCheckedChange={v => change({ ...settings, cumulative: v })} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border" /></label>
      <label className="flex min-h-9 items-center justify-between"><span className="text-t-muted">Walls</span><Switch aria-label="Walls" checked={settings.walls} onCheckedChange={v => change({ ...settings, walls: v })} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border" /></label>
      <label className="flex items-center justify-between gap-2"><span className="text-t-muted">Wall threshold</span><span className="flex items-center gap-2"><input aria-label="Wall threshold" type="range" min={2} max={10} step={.5} value={settings.wallMultiple} onChange={e => change({ ...settings, wallMultiple: Number(e.target.value) })} className="accent-[var(--t-accent)]" /><span className="w-10 text-right tabular-nums">{settings.wallMultiple}×</span></span></label>
      <label className="flex min-h-9 items-center justify-between"><span className="text-t-muted">Flash changes</span><Switch aria-label="Flash changes" checked={settings.flash} onCheckedChange={v => change({ ...settings, flash: v })} className="data-[state=checked]:bg-t-accent data-[state=unchecked]:bg-t-border" /></label>
    </div>
  </div>;
  const head = (k: string) => (el: HTMLElement | null) => { headRef.current[k] = el; };
  return <section ref={rootRef} aria-label="Order book ladder" data-testid="dom-ladder"
    style={mobile ? undefined : { width: settings.width }}
    className={mobile ? 'fixed inset-x-0 bottom-0 z-40 flex h-[60dvh] flex-col rounded-t-xl border-t border-t-border bg-t-panel pb-[env(safe-area-inset-bottom)] text-t-text' : 'relative flex shrink-0 flex-col border-l border-t-border bg-t-panel text-t-text'}>
    {!mobile && <div role="separator" aria-orientation="vertical" aria-label="Resize DOM" onPointerDown={startResize} className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize hover:bg-t-accent/40" />}
    <header className="shrink-0 space-y-1 border-b border-t-border px-2 py-1.5 text-xs tabular-nums">
      <div className="flex items-center gap-2"><span ref={head('dot')} className="size-2 rounded-full bg-t-warning" /><span ref={head('source')} className="font-semibold">—</span><span className="ml-auto text-t-muted">DOM</span>
        <Button variant="ghost" size="icon" className="size-7 text-t-muted hover:bg-t-border mobile:size-10" aria-label="DOM settings" title="DOM settings" onClick={() => setShowSettings(s => !s)}><Settings className="size-4" /></Button>
        {mobile && <Button variant="ghost" size="icon" className="size-10 text-t-muted" aria-label="Close DOM" onClick={onClose}><X /></Button>}</div>
      <div className="grid grid-cols-3 gap-1 font-mono"><span>Bid <b ref={head('bid')} className="text-t-up">—</b></span><span className="text-center">Mid <b ref={head('mid')}>—</b></span><span className="text-right">Ask <b ref={head('ask')} className="text-t-down">—</b></span></div>
      <div className="flex items-center gap-2"><div className="relative h-1.5 flex-1 overflow-hidden rounded bg-t-down/70" aria-label="Bid ask imbalance"><div ref={head('imb')} className="h-full bg-t-up" style={{ width: '50%' }} /></div><span ref={head('imbText')} className="font-mono text-t-muted">— / —</span></div>
      <p ref={head('note')} className="text-[10px] text-t-muted" />
    </header>
    <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none overflow-hidden"
      onWheel={e => onScroll(e.deltaY)}
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); hover.current = { x: e.clientX - r.left, y: e.clientY - r.top }; }}
      onMouseLeave={() => { hover.current = null; }}
      onTouchStart={e => { touchY.current = e.touches[0]?.clientY ?? null; }}
      onTouchMove={e => { const y = e.touches[0]?.clientY; if (y !== undefined && touchY.current !== null) { onScroll(touchY.current - y); touchY.current = y; } }}
      onClick={e => { if (!mobile) return; const r = e.currentTarget.getBoundingClientRect(), y = e.clientY - r.top; hover.current = hover.current && Math.abs(hover.current.y - y) < 4 ? null : { x: e.clientX - r.left, y }; }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div ref={tipRef} role="tooltip" className="pointer-events-none absolute inset-x-2 z-10 hidden whitespace-pre-line rounded border border-t-border bg-t-bg/95 p-2 font-mono text-[11px] text-t-text shadow" />
      <div ref={head('sync')} className="pointer-events-none absolute inset-0 hidden items-center justify-center"><span className="rounded bg-t-bg/90 px-3 py-1.5 text-xs text-t-warning">Syncing order book...</span></div>
      {scrolled && <Button size="sm" onClick={recenter} className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 bg-t-accent text-t-bg hover:bg-t-accent/90"><Crosshair className="size-3.5" />Re-center</Button>}
      {toolDemoEnabled() && <span className="absolute right-2 top-1 z-10 font-mono text-[10px] font-bold text-t-accent">DEMO DATA</span>}
    </div>
    {settingsPanel}
  </section>;
}
