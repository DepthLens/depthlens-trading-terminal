import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEPTH_NOTE, IMB_PCTS, REPLAY_SPEEDS, type ProSettings } from '@/lib/heatmap-pro';
import { ALERT_LABEL, type AlertKind, type AlertSettings } from '@/lib/heatmap-alerts';
import { heatTape, type TapeTrade } from '@/lib/heatmap-tape';
import { formatPrice, type PriceSpec } from '@/lib/market-data';

export type ReplayState = { on: boolean; playing: boolean; speed: number; start: number; t: number };
const pad2 = (n: number) => String(n).padStart(2, '0');
const compact = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toFixed(0);
const toLocalInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const on = 'bg-t-accent text-t-bg hover:bg-t-accent/90', off = 'text-t-muted hover:bg-t-border/50 hover:text-t-text';

function Toggle({ label, checked, onChange, mobile }: { label: string; checked: boolean; onChange: (v: boolean) => void; mobile?: boolean }) {
  return <label className={`flex items-center justify-between gap-3 text-t-muted ${mobile ? 'h-10' : 'h-6'}`}>{label}<input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} className={`${mobile ? 'size-5' : ''} accent-current`} /></label>;
}
function Num({ label, value, onChange, step, mobile, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step: number; mobile?: boolean; min?: number }) {
  return <label className={`flex items-center justify-between gap-3 text-t-muted ${mobile ? 'h-10' : 'h-7'}`}>{label}<input type="number" min={min} step={step} value={value} onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))} aria-label={label} className={`${mobile ? 'h-10 w-28 text-sm' : 'h-6 w-24 text-xs'} rounded border border-t-border bg-t-bg px-1 text-t-text`} /></label>;
}

export function HeatmapProPanel({ pro, update, alerts, updateAlerts, recordedNote, signedIn, mobile = false }: { pro: ProSettings; update: (p: Partial<ProSettings>) => void; alerts: AlertSettings; updateAlerts: (p: Partial<AlertSettings>) => void; recordedNote: boolean; signedIn: boolean; mobile?: boolean }) {
  const head = 'pt-2 text-[11px] font-semibold uppercase tracking-wide text-t-muted';
  const askBrowser = async (v: boolean) => {
    if (v && typeof Notification !== 'undefined' && Notification.permission !== 'granted') { try { const r = await Notification.requestPermission(); if (r !== 'granted') { updateAlerts({ browser: false }); return; } } catch { updateAlerts({ browser: false }); return; } }
    updateAlerts({ browser: v });
  };
  return <div className={`space-y-1 ${mobile ? 'text-sm' : 'text-xs'}`} data-testid="heatmap-pro-panel">
    <p className="text-t-muted" data-testid="depth-note">{DEPTH_NOTE}</p>
    {recordedNote && <p className="text-t-muted">Recorded history: BTCUSDT only</p>}
    <div className={head}>Colour scale</div>
    <Toggle mobile={mobile} label="Auto-fit price range" checked={pro.autoFit} onChange={v => update({ autoFit: v })} />
    <label className="flex items-center justify-between gap-2 text-t-muted">Lower cut-off P{pro.lowCut}<input type="range" min={0} max={50} step={1} value={pro.lowCut} onChange={e => update({ lowCut: Number(e.target.value) })} aria-label="Lower cut-off" className="w-32 accent-current" /></label>
    <label className="flex items-center justify-between gap-2 text-t-muted">Upper cut-off P{pro.highCut}<input type="range" min={80} max={99.9} step={0.1} value={pro.highCut} onChange={e => update({ highCut: Number(e.target.value) })} aria-label="Upper cut-off" className="w-32 accent-current" /></label>
    {!mobile && <>
      <div className={head}>Right side</div>
      <Toggle label="Order book ladder (COB)" checked={pro.ladder} onChange={v => update({ ladder: v })} />
      <Toggle label="Session volume profile (SVP)" checked={pro.svp} onChange={v => update({ svp: v })} />
      <Toggle label="Time & Sales" checked={pro.tape} onChange={v => update({ tape: v })} />
      <div className={head}>Lower panels</div>
      <Toggle label="Volume bars" checked={pro.volume} onChange={v => update({ volume: v })} />
      <Toggle label="CVD" checked={pro.cvd} onChange={v => update({ cvd: v })} />
      <Toggle label="Order book imbalance" checked={pro.imbalance} onChange={v => update({ imbalance: v })} />
    </>}
    {mobile && <Toggle mobile label="SVP inside the book ladder" checked={pro.svp} onChange={v => update({ svp: v })} />}
    <Toggle mobile={mobile} label="CVD resets each session (00:00 UTC)" checked={pro.cvdSession} onChange={v => update({ cvdSession: v })} />
    <div className="flex items-center justify-between gap-2 text-t-muted">Imbalance range<span className="flex gap-1">{IMB_PCTS.map(v => <Button key={v} variant="ghost" size="sm" aria-pressed={pro.imbPct === v} onClick={() => update({ imbPct: v })} className={`${mobile ? 'h-9' : 'h-6'} px-1.5 text-xs ${pro.imbPct === v ? on : off}`}>{v}%</Button>)}</span></div>
    <Num mobile={mobile} label="T&S: big trade (USDT)" step={10000} value={pro.tapeBig} onChange={v => update({ tapeBig: v })} />
    <Num mobile={mobile} label="Bubble size text from (USDT)" step={50000} value={pro.bubbleText} onChange={v => update({ bubbleText: v })} />
    <div className={head}>Markers (context, not signals)</div>
    <Toggle mobile={mobile} label="P · Pulled / spoof (≥70% gone in 10s)" checked={pro.pulled} onChange={v => update({ pulled: v })} />
    <Toggle mobile={mobile} label="◆ Iceberg (30s traded > 2× visible)" checked={pro.iceberg} onChange={v => update({ iceberg: v })} />
    <Toggle mobile={mobile} label="▲ Absorption (top 5% burst, < 2 ticks)" checked={pro.absorption} onChange={v => update({ absorption: v })} />
    <div className={head}>Alerts {signedIn ? '(saved to your account on this browser)' : '(sign in to save per account)'}</div>
    {(Object.keys(ALERT_LABEL) as AlertKind[]).map(k => <Toggle key={k} mobile={mobile} label={ALERT_LABEL[k]} checked={alerts[k]} onChange={v => updateAlerts({ [k]: v })} />)}
    <Num mobile={mobile} label="Wall size for alerts (USDT)" step={500000} value={alerts.wallSize} onChange={v => updateAlerts({ wallSize: v })} />
    <Num mobile={mobile} label="Near wall within (%)" step={0.05} value={alerts.nearPct} onChange={v => updateAlerts({ nearPct: v })} />
    <Toggle mobile={mobile} label="Browser notifications" checked={alerts.browser} onChange={v => void askBrowser(v)} />
    <p className="text-t-muted">Wall alerts need Wall lines on. Same wall alerts at most once per 5 minutes.</p>
  </div>;
}

export function ReplayBar({ replayRef, api, minTime, onExit, mobile }: { replayRef: MutableRefObject<ReplayState>; api: MutableRefObject<{ start: (t: number) => void; exit: () => void } | null>; minTime: number; onExit: () => void; mobile: boolean }) {
  const [startValue, setStartValue] = useState(() => toLocalInput(Math.max(minTime, Date.now() - 3600000)));
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(t); }, []);
  const r = replayRef.current, end = Date.now() - 1000, pct = r.on && end > r.start ? Math.min(100, (r.t - r.start) / (end - r.start) * 100) : 0;
  const h = mobile ? 'h-9' : 'h-6';
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-t-border bg-t-panel px-3 py-1.5 text-xs" data-testid="replay-bar">
    <span className="font-semibold text-t-text">Replay</span>
    <input type="datetime-local" value={startValue} min={toLocalInput(minTime)} max={toLocalInput(Date.now())} onChange={e => setStartValue(e.target.value)} aria-label="Replay start time" className={`${h} rounded border border-t-border bg-t-bg px-1 text-t-text [color-scheme:dark]`} />
    {!r.on ? <Button size="sm" className={`${h} px-2 text-xs ${on}`} onClick={() => { const t = new Date(startValue).getTime(); if (Number.isFinite(t)) api.current?.start(t); }}><Play className="size-3" />Start</Button>
      : <Button size="sm" variant="ghost" className={`${h} px-2 text-xs ${off}`} aria-label={r.playing ? 'Pause replay' : 'Play replay'} onClick={() => { r.playing = !r.playing; tick(n => n + 1); }}>{r.playing ? <Pause className="size-3" /> : <Play className="size-3" />}{r.playing ? 'Pause' : 'Play'}</Button>}
    <span className="flex gap-1" role="group" aria-label="Replay speed">{REPLAY_SPEEDS.map(s => <Button key={s} size="sm" variant="ghost" aria-pressed={r.speed === s} onClick={() => { r.speed = s; tick(n => n + 1); }} className={`${h} px-1.5 text-xs ${r.speed === s ? on : off}`}>{s}×</Button>)}</span>
    <input type="range" min={0} max={100} step={0.1} value={pct} disabled={!r.on} aria-label="Replay progress" onChange={e => { const end2 = Date.now() - 1000; r.t = r.start + (end2 - r.start) * Number(e.target.value) / 100; tick(n => n + 1); if (!r.playing) { r.playing = true; setTimeout(() => { r.playing = false; }, 120); } }} className="min-w-24 flex-1 accent-current" />
    <span className="tabular-nums text-t-muted" data-testid="replay-time">{r.on ? new Date(r.t).toLocaleString() : '—'}</span>
    <Button size="sm" variant="ghost" className={`${h} px-2 text-xs ${off}`} onClick={onExit}><X className="size-3" />Exit replay</Button>
  </div>;
}

export function TimeSales({ symbol, spec, minSize, bigSize, replay }: { symbol: string; spec: PriceSpec | undefined; minSize: number; bigSize: number; replay: MutableRefObject<TapeTrade[] | null>; onMin: (v: number) => void }) {
  const [rows, setRows] = useState<TapeTrade[]>([]);
  const hover = useRef(false);
  useEffect(() => {
    let version = -1;
    const t = setInterval(() => {
      if (hover.current) return;
      const rep = replay.current;
      if (rep) { setRows(rep.filter(x => x.notional >= minSize).slice(0, 120)); return; }
      if (heatTape.version === version) return;
      version = heatTape.version; setRows(heatTape.latest(120, minSize));
    }, 250);
    return () => clearInterval(t);
  }, [minSize, replay]);
  const coin = symbol.replace(/USDT$/, '');
  const fmtT = (t: number) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`; };
  return <div className="flex h-full flex-col text-[11px] tabular-nums" data-testid="time-sales" onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }}>
    <div className="flex items-center justify-between gap-2 border-b border-t-border px-2 py-1 text-t-muted">
      <span className="font-semibold text-t-text">Time & Sales{replay.current ? ' · history' : ''}</span>
      {minSize > 0 && <span title="Change in Edit" data-testid="tape-min">≥ {compact(minSize)} USDT</span>}
    </div>
    <div className="grid grid-cols-[1fr_1fr_auto] gap-x-2 border-b border-t-border px-2 py-0.5 text-t-muted"><span>Time</span><span className="text-right">Price</span><span className="text-right">Size {coin}</span></div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {rows.length === 0 && <p className="p-2 text-t-muted">Waiting for trades…</p>}
      {rows.map((r, i) => <div key={`${r.t}:${i}`} className={`grid grid-cols-[1fr_1fr_auto] gap-x-2 px-2 ${r.side === 'Buy' ? 'text-t-up' : 'text-t-down'} ${r.notional >= bigSize ? 'bg-t-border/40 font-bold' : ''}`}>
        <span>{fmtT(r.t)}</span><span className="text-right">{spec ? formatPrice(r.price, spec) : r.price.toFixed(2)}</span><span className="text-right" title={`${compact(r.notional)} USDT`}>{r.coin >= 100 ? r.coin.toFixed(0) : r.coin.toFixed(3)}</span>
      </div>)}
    </div>
  </div>;
}
