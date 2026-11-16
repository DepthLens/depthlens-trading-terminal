/**
 * Flow Radar — Higher-timeframe marks + "forming" note (ADD-ON).
 *
 * Uses the existing Flow Radar rules (findSetups in flow-radar.ts) and the Short-TF pattern atlas
 * (detectPatterns in flow-radar-patterns.ts) exactly as they are. Nothing here changes those rules.
 *
 * 1) Higher-timeframe marks
 *    A 1h / 4h result is only known when that big candle CLOSES. So on a smaller chart (e.g. 15m) the mark
 *    is placed on the LAST small candle inside the big candle (10:00–11:00 1h candle → the 10:45 15m candle),
 *    i.e. where the trader could really have seen it. Text: "BUY 1h", "SELL 4h ✓", "Watch 1h", ...
 *
 * 2) Forming note (panel text only, never a chart mark)
 *    While the current big candle is still open, the Flow Momentum rule is checked on what has traded so far.
 *    Measured on BTCUSDT 1h, 2025-01 → 2026-10, default settings (volume ≥1.5× avg of previous 24, delta ratio ≥0.2):
 *    about 1 in 4 forming signals still held at the candle close (174 of 661). Entering early on all of them
 *    was worse after fees than entering at the close (−0.13R vs −0.08R at 1R).
 *
 * Pure functions, no network, no storage.
 */
import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
import { deltaRatio, findSetups, type RadarBar, type RadarSettings, type RadarSetup } from './flow-radar';
import { describeEvent, detectPatterns, isAtlasTimeframe, type PatternEvent, type PatternId } from './flow-radar-patterns';

export type BigTf = '1h' | '4h';
export const MTF_TFS: readonly { tf: BigTf; minutes: number }[] = [{ tf: '1h', minutes: 60 }, { tf: '4h', minutes: 240 }];

/** Big timeframes worth showing on a chart of `chartMinutes`: bigger than the chart and an exact multiple of it. */
export function higherTfs(chartMinutes: number): { tf: BigTf; minutes: number }[] {
  return MTF_TFS.filter(x => chartMinutes > 0 && x.minutes > chartMinutes && x.minutes % chartMinutes === 0);
}

/** Chart candle time (seconds) of the last small candle inside the big candle that opened at bigOpenMs. */
export function closeCandleTime(bigOpenMs: number, bigMinutes: number, chartMinutes: number): number {
  return Math.floor(bigOpenMs / 1000) + (bigMinutes - chartMinutes) * 60;
}

/** Split a kline list into closed candles and the one still forming (close time not reached yet). */
export function splitForming(bars: RadarBar[], bigMinutes: number, now: number): { closed: RadarBar[]; forming: RadarBar | null } {
  const last = bars.at(-1);
  if (last && last.time + bigMinutes * 60000 > now) return { closed: bars.slice(0, -1), forming: last };
  return { closed: bars, forming: null };
}

export interface MtfOptions { setups: boolean; patternsOn: boolean; patterns: PatternId[] }

const px = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)).toString() : '–');
const hhmm = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const outcomeMark = (x: RadarSetup) => (x.outcome === 'win' ? ' ✓' : x.outcome === 'loss' ? ' ✗' : x.outcome === 'expired' ? ' –' : '');
const kindName = (x: RadarSetup) => (x.kind === 'momentum' ? 'Flow Momentum' : 'Trapped Sweep');

/**
 * Markers for one big timeframe on a smaller chart.
 * closedBig: CLOSED big candles only (use splitForming). have: chart candle times in seconds.
 */
export function mtfLayer(closedBig: RadarBar[], big: { tf: BigTf; minutes: number }, chartMinutes: number, s: RadarSettings,
  o: MtfOptions, have: Set<number>, colors: { up: string; down: string; muted: string }) {
  const markers: SeriesMarker<Time>[] = [], details = new Map<string, string[]>();
  if (!(big.minutes > chartMinutes) || big.minutes % chartMinutes !== 0) return { markers, details };

  if (o.setups && closedBig.length >= 26) {
    for (const x of findSetups(closedBig, { ...s, tf: big.tf })) {
      const t = closeCandleTime(x.time, big.minutes, chartMinutes);
      if (!have.has(t)) continue;
      const buy = x.side === 'buy', id = `mtf-setup:${big.tf}:${x.kind}:${x.side}:${x.time}`;
      const color = x.outcome === 'win' ? colors.up : x.outcome === 'loss' ? colors.down : x.outcome === 'expired' ? colors.muted : buy ? colors.up : colors.down;
      markers.push({ id, time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: 'square', size: 1, color,
        text: `${buy ? 'BUY' : 'SELL'} ${big.tf}${outcomeMark(x)}` });
      details.set(id, [
        `${buy ? 'BUY' : 'SELL'} setup · ${big.tf} · ${kindName(x)}`,
        `Known at the ${big.tf} close (${hhmm(x.time + big.minutes * 60000)}), shown on that candle.`,
        `Entry ${px(x.entry)} · Stop ${px(x.stop)} · Target ${px(x.target)} (${s.r}R)`,
        x.outcome === 'open' ? 'Still open.' : x.outcome === 'win' ? 'Target hit.' : x.outcome === 'loss' ? 'Stop hit.' : `No target or stop within ${s.hold} ${big.tf} candles.`,
        x.resultR !== undefined ? `Result after fees: ${x.resultR >= 0 ? '+' : ''}${x.resultR.toFixed(2)}R` : '',
        'Setups are not predictions.',
      ].filter(Boolean));
    }
  }

  if (o.patternsOn && o.patterns.length && isAtlasTimeframe(big.tf)) {
    const events: PatternEvent[] = detectPatterns(closedBig.map(b => ({ ...b, delta: 2 * b.takerBuy - b.volume })), big.tf, o.patterns);
    for (const e of events) {
      const t = closeCandleTime(e.time, big.minutes, chartMinutes);
      if (!have.has(t)) continue;
      const buy = e.side === 1, id = `mtf-pattern:${big.tf}:${e.pattern}:${e.side}:${e.time}`;
      markers.push({ id, time: t as UTCTimestamp, position: buy ? 'belowBar' : 'aboveBar', shape: 'circle', size: 0.5,
        color: buy ? colors.up : colors.down, text: `${e.label} ${big.tf}` });
      details.set(id, [...describeEvent(e, big.tf), `Known at the ${big.tf} close (${hhmm(e.time + big.minutes * 60000)}), shown on that candle.`]);
    }
  }
  return { markers, details };
}

export interface FormingNote { tf: BigTf; side: 'buy' | 'sell'; minute: number; total: number; lines: string[] }

/**
 * Flow Momentum checked on the big candle that is still open. Text for the panel only.
 * Returns null when nothing is forming, Flow Momentum is off, or there is not enough history.
 */
export function formingNote(closedBig: RadarBar[], forming: RadarBar | null, big: { tf: BigTf; minutes: number }, s: RadarSettings, now: number): FormingNote | null {
  if (!s.momentum || !forming || closedBig.length < 24) return null;
  let avg = 0; for (let j = closedBig.length - 24; j < closedBig.length; j++) avg += closedBig[j]!.volume; avg /= 24;
  if (!(avg > 0)) return null;
  const vz = forming.volume / avg, dr = deltaRatio(forming);
  const side = vz >= s.vz && dr >= s.dr ? 'buy' : vz >= s.vz && dr <= -s.dr ? 'sell' : null;
  if (!side) return null;
  const minute = Math.min(big.minutes, Math.max(1, Math.floor((now - forming.time) / 60000) + 1));
  const measured = big.tf === '1h' && s.vz === 1.5 && s.dr === 0.2;
  return { tf: big.tf, side, minute, total: big.minutes, lines: [
    `${big.tf} ${side === 'buy' ? 'BUY' : 'SELL'} forming · minute ${minute}/${big.minutes} · not an entry yet`,
    measured ? 'BTC 1h 2025–26: about 1 in 4 of these still held at the candle close.' : `Not measured for ${big.tf} with these settings; many forming signals do not hold.`,
    `A mark appears only if it holds at the ${big.tf} close.`,
  ] };
}
