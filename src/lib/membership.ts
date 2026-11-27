/** Browser-safe membership rules. The database is the authority; these mirror it for display and tool locking. */
export const PLAN_NAMES = ['Free', 'Weekly', '15 Days', 'Monthly'] as const;
export type PlanName = (typeof PLAN_NAMES)[number];
export type PaidPlan = Exclude<PlanName, 'Free'>;
export const PLAN_DAYS: Record<PaidPlan, number> = { Weekly: 7, '15 Days': 15, Monthly: 30 };
export type MemberStatus = 'active' | 'expired' | 'suspended';
export type Membership = { plan: PlanName; status: MemberStatus; starts_at: string | null; ends_at: string | null; note?: string | null };
export const FREE: Membership = { plan: 'Free', status: 'active', starts_at: null, ends_at: null };
const DAY = 86_400_000;

/** Status as of `now`: a paid plan past its end date is expired even before the hourly job runs. */
export function effectiveStatus(m: Membership, now = Date.now()): MemberStatus {
  if (m.plan !== 'Free' && m.status === 'active' && (!m.ends_at || Date.parse(m.ends_at) <= now)) return 'expired';
  return m.status;
}
/** Paid tools unlock only with an active Weekly, 15 Days or Monthly plan. */
export const isPaid = (m: Membership | null | undefined, now = Date.now()) => Boolean(m && m.plan !== 'Free' && effectiveStatus(m, now) === 'active');
export const daysLeft = (m: Membership, now = Date.now()) => m.ends_at ? Math.max(0, Math.ceil((Date.parse(m.ends_at) - now) / DAY)) : 0;
export const expiringSoon = (m: Membership | null | undefined, now = Date.now()) => Boolean(m && isPaid(m, now) && m.ends_at && Date.parse(m.ends_at) - now <= 3 * DAY);
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** End date for activating `plan` or extending by `days`: remaining days are never lost. */
export function nextEnd(m: Membership, add: PaidPlan | number, now = Date.now()): Date {
  const days = typeof add === 'number' ? add : PLAN_DAYS[add];
  const running = m.plan !== 'Free' && m.status !== 'expired' && m.ends_at && Date.parse(m.ends_at) > now;
  return new Date((running ? Date.parse(m.ends_at!) : now) + days * DAY);
}

/** Label in the tools menu, e.g. "Free" or "Monthly – until 26 Dec 2026". */
export function planLabel(m: Membership | null | undefined, now = Date.now()) {
  if (!m || m.plan === 'Free') return 'Free';
  const s = effectiveStatus(m, now);
  if (s === 'suspended') return `${m.plan} – suspended`;
  if (s === 'expired') return `${m.plan} – expired`;
  return `${m.plan} – until ${fmtDate(m.ends_at!)}`;
}

/** Tool switches as the terminal sees them: everything except the always-on Candle timer is off when locked. */
export function lockTools(tools: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(Object.keys({ ...tools, 'Control & Attack bars': true }).map(k => [k, k === 'Candle timer' ? tools[k] !== false : false]));
}

export function toCsv(rows: Record<string, string | number | boolean | null>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
}
