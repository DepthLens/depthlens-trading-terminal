import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { ProfileChart } from './VolumeProfile';
import { useFlow } from './FlowBars';
import { combinedSentence, controlSentence, FB_KEY, restoreFlowBars } from '@/lib/flow-bars';

/** A reserved native pane keeps this strip between candles and Pressure panes. No socket or copied math. */
export function PressureStrip({ chartRef, symbol, minutes }: { chartRef: MutableRefObject<ProfileChart | null>; symbol: string; minutes: number }) {
  const [settings, setSettings] = useState(() => restoreFlowBars(null));
  const [bounds, setBounds] = useState({ top: 0, height: 88 });
  const ref = useRef<HTMLDivElement>(null);
  const snap = useFlow(chartRef, minutes, settings, symbol);
  useEffect(() => { setSettings(restoreFlowBars(localStorage.getItem(FB_KEY))); }, []);
  useEffect(() => {
    const api = chartRef.current;
    if (!api || api.disposed) return;
    const pane = api.chart.addPane(true);
    pane.setStretchFactor(0.32);
    const update = () => {
      const el = pane.getHTMLElement();
      const parent = api.host.parentElement;
      if (el && parent) setBounds({ top: el.getBoundingClientRect().top - parent.getBoundingClientRect().top, height: pane.getHeight() });
    };
    const observer = new ResizeObserver(update);
    observer.observe(api.host);
    const el = pane.getHTMLElement();
    if (el) observer.observe(el);
    update();
    return () => { observer.disconnect(); if (!api.disposed) api.chart.removePane(pane.paneIndex()); };
  }, [chartRef]);
  const c = snap?.shownControl ?? 'BALANCED', a = snap?.shownAttack ?? 'NONE';
  const attack = snap?.attack;
  const tone = (s: string) => s === 'BUYERS' ? 'text-t-up' : s === 'SELLERS' ? 'text-t-down' : 'text-t-muted';
  const share = Math.round((snap?.control.buyShare ?? 0.5) * 100);
  const strength = Math.round((attack?.strength ?? 0) * 100);
  return <div ref={ref} data-testid="pressure-ca-strip" style={bounds} className="absolute inset-x-0 z-10 flex flex-col justify-center gap-1 overflow-hidden border-y border-t-border bg-t-panel px-3 text-xs">
    <div className="flex items-center gap-3"><strong className={tone(c)}>{c === 'BALANCED' ? c : `${c} CONTROL`}</strong><div role="meter" aria-label="Buyers share" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} className="flex h-1.5 w-28 overflow-hidden rounded-full bg-t-down"><div className="bg-t-up" style={{ width: `${share}%` }} /></div><span className="text-t-muted">{share}% buyers</span><strong className={tone(a)}>{a === 'NONE' ? 'NO ATTACK' : `${a} ATTACK`}</strong><div role="meter" aria-label="Attack strength" aria-valuenow={strength} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-20 overflow-hidden rounded-full bg-t-border"><div className={a === 'BUYERS' ? 'h-full bg-t-up' : 'h-full bg-t-down'} style={{ width: `${strength}%` }} /></div><span className="tabular-nums">{attack ? attack.p.toFixed(2) : '—'}</span><span className="text-t-muted">{attack?.live ? 'LIVE' : 'CLOSED'}</span></div>
    {settings.sentences && <><div className="truncate text-t-muted" title={controlSentence(c)}>{controlSentence(c)}</div><div className="truncate text-t-muted">{attack ? combinedSentence(c, a, attack.scores) : 'No strong attack right now.'}</div></>}
  </div>;
}