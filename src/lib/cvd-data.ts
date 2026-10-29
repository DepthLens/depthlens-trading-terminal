import { NATIVE } from './chart-data';

export type CvdAnchor = 'Daily UTC' | 'Weekly' | 'Visible start' | 'Continuous';
export type CvdMode = 'Line' | 'Candles' | 'Delta histogram';
export type CvdUnit = 'USDT' | 'coin';
export type CvdSettings = { anchor: CvdAnchor; mode: CvdMode; unit: CvdUnit; height: number | null };
export const CVD_KEY = 'depthlens.cvd.v1';
export const CVD_DEFAULT: CvdSettings = { anchor: 'Daily UTC', mode: 'Line', unit: 'USDT', height: null };
export const CVD_PAGE_LIMIT = 6, CVD_PAGE_SIZE = 1500;
export const CVD_ANCHORS: CvdAnchor[] = ['Daily UTC', 'Weekly', 'Visible start', 'Continuous'];
export const CVD_MODES: CvdMode[] = ['Line', 'Candles', 'Delta histogram'];
export type DeltaBar = { time: number; quote: number; coin: number; quoteHigh: number; quoteLow: number; coinHigh: number; coinLow: number; path: boolean };
export type CvdBar = { time: number; open: number; high: number; low: number; close: number; delta: number; reset: boolean; path: boolean };
export function restoreCvd(raw: string | null): CvdSettings {
  try {
    const v = JSON.parse(raw ?? '{}');
    return { anchor: CVD_ANCHORS.includes(v.anchor) ? v.anchor : CVD_DEFAULT.anchor, mode: CVD_MODES.includes(v.mode) ? v.mode : 'Line', unit: v.unit === 'coin' ? 'coin' : 'USDT', height: typeof v.height === 'number' && Number.isFinite(v.height) ? Math.max(.1, Math.min(.6, v.height)) : null };
  } catch { return { ...CVD_DEFAULT }; }
}
export function deltaBar(time: number, quote: number, coin: number): DeltaBar {
  return { time, quote, coin, quoteHigh: Math.max(0, quote), quoteLow: Math.min(0, quote), coinHigh: Math.max(0, coin), coinLow: Math.min(0, coin), path: false };
}
export function binanceDelta(k: unknown[]): DeltaBar | null {
  const time = Number(k[0]), volume = Number(k[5]), quote = Number(k[7]), buy = Number(k[9]), buyQuote = Number(k[10]);
  if (![time, volume, quote, buy, buyQuote].every(Number.isFinite)) return null;
  return deltaBar(time, 2 * buyQuote - quote, 2 * buy - volume);
}
export function klineDelta(k: { t?: unknown; v?: unknown; q?: unknown; V?: unknown; Q?: unknown }): DeltaBar | null {
  return binanceDelta([k.t, 0, 0, 0, 0, k.v, 0, k.q, 0, k.V, k.Q]);
}
export function aggregateDeltas(input: DeltaBar[], minutes: number): DeltaBar[] {
  const out: DeltaBar[] = [], span = minutes * 60000;
  for (const b of [...input].sort((a,b) => a.time-b.time)) {
    const time = Math.floor(b.time / span) * span, last = out.at(-1);
    if (last?.time === time) {
      last.quoteHigh = Math.max(last.quoteHigh, last.quote + b.quoteHigh); last.quoteLow = Math.min(last.quoteLow, last.quote + b.quoteLow);
      last.coinHigh = Math.max(last.coinHigh, last.coin + b.coinHigh); last.coinLow = Math.min(last.coinLow, last.coin + b.coinLow);
      last.quote += b.quote; last.coin += b.coin; last.path = true;
    } else out.push({ ...b, time });
  }
  return out;
}
export function anchorBucket(time: number, anchor: CvdAnchor) {
  const day = 86400000;
  if (anchor === 'Daily UTC') return Math.floor(time / day);
  if (anchor === 'Weekly') return Math.floor((time - 4 * day) / (7 * day)); // Monday, 1970-01-05.
  return 0;
}
export function buildCvd(input: DeltaBar[], anchor: CvdAnchor, unit: CvdUnit, visibleFrom = -Infinity): CvdBar[] {
  const bars = anchor === 'Visible start' ? input.filter(b => b.time >= visibleFrom) : input;
  let total = 0, previous: number | undefined;
  return bars.map(b => {
    const key = anchorBucket(b.time, anchor), reset = previous === undefined || key !== previous;
    if (reset) total = 0;
    const open = total, delta = unit === 'USDT' ? b.quote : b.coin;
    total += delta; previous = key;
    return { time: b.time, open, high: open + (unit === 'USDT' ? b.quoteHigh : b.coinHigh), low: open + (unit === 'USDT' ? b.quoteLow : b.coinLow), close: total, delta, reset, path: b.path };
  });
}
export function formatCvd(value: number) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value), divisor = abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  return `${value >= 0 ? '+' : '−'}${(abs / divisor).toLocaleString('en-US', { maximumFractionDigits: 2 })}${divisor === 1e6 ? 'M' : divisor === 1e3 ? 'K' : ''}`;
}
export const cvdPaneHeight = (total: number, mobile: boolean, ratio: number | null) => Math.max(90, Math.round(total * (ratio ?? (mobile ? .25 : .22))));
export const cvdInterval = (minutes: number) => NATIVE[minutes] ?? '1m';