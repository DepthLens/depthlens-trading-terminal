// Browser-safe rules for the Edit menu: which tools get a settings section and what "Reset to default" restores.
import { TOOL_GROUPS } from '@/lib/tools-panel';

/** Heatmap view options that used to sit in the row above the heatmap (not saved, same as before). */
export const HEATMAP_VIEW_DEFAULT = { intensity: 1, windowMin: 15, grouping: 1, minBubble: 10000, bubblesOn: true } as const;

/** Layout-only fields (pane sizes, collapsed strips) that a settings reset leaves alone. */
export const LAYOUT_KEYS: Record<string, readonly string[]> = {
  CVD: ['height'], Liquidations: ['height'], 'Control & Attack bars': ['collapsed'], 'Price Pressure': ['heights', 'collapsed'], DOM: ['width'],
};

/** Switchable tools that are currently on, in Order flow menu order. Control & Attack bars defaults on. */
export function editTools(tools: Record<string, boolean>): string[] {
  const out: string[] = [];
  for (const g of TOOL_GROUPS) for (const r of g.rows) {
    if (r.kind) continue;
    const on = r.id === 'Control & Attack bars' ? tools[r.id] !== false : Boolean(tools[r.id]);
    if (on) out.push(r.id);
  }
  return out;
}

/** A tool's default settings, keeping only its layout fields from the current value. */
export function resetToDefault<T extends object>(tool: string, defaults: T, current: T): T {
  const next = structuredClone(defaults) as Record<string, unknown>;
  const cur = current as Record<string, unknown>;
  for (const k of LAYOUT_KEYS[tool] ?? []) if (k in cur) next[k] = cur[k];
  return next as T;
}
