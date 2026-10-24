// Browser-safe shared price-grid and lifecycle rules.
export function niceStep(raw: number) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw)), m = raw / power;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * power;
}
export function depthRowSize(span: number, tick: number) {
  const validTick = tick > 0 ? tick : .01;
  return Math.max(validTick, Math.round(niceStep(span / 150) / validTick) * validTick);
}
export function profileRowSize(span: number, tick: number, target = 60, previous = 0) {
  const ideal = span / target;
  if (previous > 0 && Math.abs(ideal / previous - 1) <= .4) return previous;
  const next = Math.max(tick, niceStep(Math.max(1, ideal / tick)) * tick);
  if (previous > 0 && next === previous && ideal > previous * 1.4) return previous * 2;
  if (previous > 0 && next === previous && ideal < previous * .6) return Math.max(tick, previous / 2);
  return next;
}
export const heatColumnWidth = (width: number, count: number) => Math.min(12, Math.max(3, width / Math.max(count, 120)));
export const heatFitRows = (span: number, bucket: number, grouping: number) => Math.max(20, span * 1.15 / (bucket * grouping));
export const heatMaxRows = (price: number, bucket: number, grouping: number) => Math.max(20, price * .1 / (bucket * grouping));
export function shouldFitFootprint(previous: { enabled: boolean; minutes: number } | null, enabled: boolean, minutes: number) {
  return enabled && (!previous?.enabled || previous.minutes !== minutes);
}
export const emptyFootprintColumn = (spacing: number, hasData: boolean) => spacing >= 70 && !hasData;