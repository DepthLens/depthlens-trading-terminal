import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
import { detectPatterns, describeEvent, isAtlasTimeframe, PATTERN_INFO, type PatternEvent, type PatternId } from './flow-radar-patterns';
import type { RadarBar } from './flow-radar';
import { whaleCandleTime } from './whale-data';

export const DEFAULT_PATTERNS: PatternId[] = ['R_reversal_watch', 'X2_upthrust_spring', 'B_prevday_sweep', 'X3_div_volume'];
export type PatternSettings = { patternsOn: boolean; patterns: PatternId[] };
export function restorePatternSettings(value: { patternsOn?: unknown; patterns?: unknown }): PatternSettings {
  return { patternsOn: value.patternsOn === true, patterns: Array.isArray(value.patterns)
    ? [...new Set(value.patterns.filter((id): id is PatternId => typeof id === 'string' && Object.hasOwn(PATTERN_INFO, id)))]
    : [...DEFAULT_PATTERNS] };
}
export function patternLayer(bars: RadarBar[], tf: string, settings: PatternSettings, minutes: number, have: Set<number>, colors: { up: string; down: string }) {
  const markers: SeriesMarker<Time>[] = [], details = new Map<string, string[]>();
  const events: PatternEvent[] = settings.patternsOn && isAtlasTimeframe(tf)
    ? detectPatterns(bars.map(b => ({ ...b, delta: 2 * b.takerBuy - b.volume })), tf, settings.patterns) : [];
  for (const e of events) {
    const time = whaleCandleTime(e.time, minutes), b = bars[e.index];
    if (!b || !have.has(time) || !isAtlasTimeframe(tf)) continue;
    const id = `short-tf:${e.pattern}:${e.side}:${e.time}`, buy = e.side === 1;
    markers.push({ id, time: time as UTCTimestamp, price: buy ? b.low : b.high,
      position: buy ? 'atPriceBottom' : 'atPriceTop', shape: 'circle', size: 0.5,
      color: buy ? colors.up : colors.down, text: e.label });
    details.set(id, describeEvent(e, tf));
  }
  return { markers, details };
}