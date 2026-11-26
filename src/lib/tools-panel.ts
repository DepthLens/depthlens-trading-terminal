// Browser-safe catalogue for the unified Tools panel: group order, labels and one-line descriptions.
export type ToolRow = { id: string; name: string; desc: string; kind?: 'info' | 'heatmap' };
export const TOOL_GROUPS: { title: string; rows: ToolRow[] }[] = [
  { title: 'Chart', rows: [
    { id: 'Candle timer', name: 'Candle countdown', desc: 'Time left on the candle, under the live price', kind: 'info' },
    { id: 'Volume Profile', name: 'Volume Profile', desc: 'Traded volume at each price' },
  ] },
  { title: 'Order book', rows: [
    { id: 'Heatmap', name: 'Heatmap', desc: 'Resting orders over time with trade bubbles' },
    { id: 'DOM', name: 'DOM ladder', desc: 'Live bids and asks by price' },
    { id: 'Wall lines', name: 'Wall lines', desc: 'Marks large resting orders on the Heatmap', kind: 'heatmap' },
  ] },
  { title: 'Trades & delta', rows: [
    { id: 'Footprint', name: 'Footprint', desc: 'Buy and sell volume inside each candle' },
    { id: 'CVD', name: 'CVD', desc: 'Running total of buy minus sell volume' },
    { id: 'Whale Trades', name: 'Whale Trades', desc: 'Large trades marked on the chart' },
    { id: 'Time & Sales', name: 'Time & Sales', desc: 'Every trade as a live list on the Heatmap', kind: 'heatmap' },
  ] },
  { title: 'Pressure & flow', rows: [
    { id: 'Price Pressure', name: 'Price Pressure', desc: 'Who is pushing price right now' },
    { id: 'Control & Attack bars', name: 'Control & Attack bars', desc: 'Buyer and seller control strips' },
  ] },
  { title: 'Derivatives', rows: [{ id: 'Liquidations', name: 'Liquidations', desc: 'Forced closes of leveraged positions' }] },
  { title: 'Setups', rows: [{ id: 'Flow Radar', name: 'Flow Radar', desc: 'Context markers from order flow' }] },
];
export function filterGroups(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return TOOL_GROUPS;
  return TOOL_GROUPS.map(g => ({ ...g, rows: g.rows.filter(r => `${r.name} ${r.desc} ${g.title}`.toLowerCase().includes(q)) })).filter(g => g.rows.length);
}
/** Tool switches after "Turn all off": every switchable tool off; Control & Attack bars defaults on, so it is written off explicitly. */
export function allToolsOff(tools: Record<string, boolean>): Record<string, boolean> {
  const next: Record<string, boolean> = { ...tools };
  for (const g of TOOL_GROUPS) for (const r of g.rows) if (!r.kind) next[r.id] = false;
  return next;
}
