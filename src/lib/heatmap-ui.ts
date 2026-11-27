// Browser-safe bridge between the mounted Heatmap and the Edit menu: the Heatmap publishes its current
// settings and setters here, so the Edit menu can change them without the Heatmap rendering option rows.
import type { WallSettings } from '@/lib/heatmap-walls';
import type { ProSettings } from '@/lib/heatmap-pro';
import type { AlertSettings } from '@/lib/heatmap-alerts';
import type { HeatmapUnit } from '@/lib/terminal-state';

export type HeatmapMob = { ladder: boolean; panels: boolean; tape: boolean };
export type HeatmapEditBridge = {
  intensity: number; setIntensity: (v: number) => void;
  windowMin: number; setWindowMin: (v: number) => void; windows: number[];
  grouping: number; setGrouping: (v: number) => void; groupings: readonly number[];
  minBubble: number; setMinBubble: (v: number) => void;
  bubblesOn: boolean; setBubblesOn: (v: boolean) => void;
  unit: HeatmapUnit; selectUnit: (u: HeatmapUnit) => void; coinLabel: string;
  walls: WallSettings; updateWalls: (p: Partial<WallSettings>) => void;
  pro: ProSettings; updatePro: (p: Partial<ProSettings>) => void;
  alerts: AlertSettings; updateAlerts: (p: Partial<AlertSettings>) => void;
  mob: HeatmapMob; setMob: (m: HeatmapMob) => void;
  retentionText: string; historyText: string | null; recordedNote: boolean; signedIn: boolean;
  reset: () => void;
};

let current: HeatmapEditBridge | null = null;
const listeners = new Set<() => void>();
export const heatmapUi = {
  get: () => current,
  publish(next: HeatmapEditBridge | null) { current = next; listeners.forEach(l => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};
