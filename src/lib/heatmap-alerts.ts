// Browser-safe heatmap alert rules: per-type switches, saved per account, 5-minute de-duplication.
export type AlertKind = 'newWall' | 'wallPulled' | 'nearWall' | 'iceberg' | 'absorption';
export type AlertSettings = { newWall: boolean; wallPulled: boolean; nearWall: boolean; iceberg: boolean; absorption: boolean; wallSize: number; nearPct: number; browser: boolean };
export const DEFAULT_ALERTS: AlertSettings = { newWall: false, wallPulled: false, nearWall: false, iceberg: false, absorption: false, wallSize: 5_000_000, nearPct: 0.1, browser: false };
export const ALERT_DEDUP_MS = 5 * 60000;
export const ALERT_LABEL: Record<AlertKind, string> = { newWall: 'New wall above size', wallPulled: 'Wall pulled', nearWall: 'Price near a wall', iceberg: 'Iceberg detected', absorption: 'Absorption detected' };
export const alertsKey = (userId: string | null) => `depthlens.heatmap.alerts:${userId ?? 'guest'}`;
export function restoreAlerts(raw: string | null): AlertSettings {
  try { const v = raw ? JSON.parse(raw) as Partial<AlertSettings> : {}; const o = { ...DEFAULT_ALERTS };
    for (const k of Object.keys(o) as (keyof AlertSettings)[]) if (typeof v[k] === typeof o[k]) (o as Record<string, unknown>)[k] = v[k];
    return o; } catch { return { ...DEFAULT_ALERTS }; }
}
export class AlertGate {
  private last = new Map<string, number>();
  // Returns true once per key every 5 minutes.
  allow(key: string, now: number): boolean {
    const t = this.last.get(key);
    if (t !== undefined && now - t < ALERT_DEDUP_MS) return false;
    this.last.set(key, now);
    if (this.last.size > 500) for (const [k, v] of this.last) if (now - v >= ALERT_DEDUP_MS) this.last.delete(k);
    return true;
  }
}
