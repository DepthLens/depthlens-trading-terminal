import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_DAYS, daysLeft, effectiveStatus, fmtDate, nextEnd, toCsv, type Membership, type PaidPlan, type PlanName } from "@/lib/membership";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Admin — DepthLens" },
    { name: "description", content: "Manage DepthLens memberships, plans and the admin log." },
    { property: "og:title", content: "Admin — DepthLens" },
    { property: "og:description", content: "Manage DepthLens memberships, plans and the admin log." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  beforeLoad: async () => {
    const { data } = await supabase.rpc("is_admin");
    if (data !== true) throw redirect({ to: "/terminal" });
  },
  component: Admin,
});

type Row = { id: string; email: string; display_name: string | null; verified: boolean; is_admin: boolean; plan: PlanName; status: Membership["status"]; starts_at: string | null; ends_at: string | null; note: string | null; created_at: string; last_sign_in: string | null };
type Log = { id: number; at: string; admin_email: string; target_email: string | null; action: string; old_value: string | null; new_value: string | null };
type Action = { kind: "activate"; plan: PaidPlan } | { kind: "extend"; days: number } | { kind: "set_end" } | { kind: "suspend" } | { kind: "reactivate" } | { kind: "free" } | { kind: "note" };

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const dt = (iso: string | null) => iso ? fmtDate(iso) : "—";
const DAY = 86_400_000;

function Admin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState(""), [plan, setPlan] = useState("all"), [status, setStatus] = useState("all"), [sort, setSort] = useState<"asc" | "desc">("asc");
  const [sel, setSel] = useState<Row | null>(null);
  const load = async () => {
    const [{ data, error: e }, { data: l }] = await Promise.all([
      supabase.rpc("admin_list_members"),
      supabase.from("admin_logs").select("id,at,admin_email,target_email,action,old_value,new_value").order("at", { ascending: false }).limit(200),
    ]);
    if (e) setError("Could not load users."); else setRows(data as Row[]);
    setLogs((l as Log[] | null) ?? []);
  };
  useEffect(() => { void load(); }, []);
  const now = Date.now();
  const view = useMemo(() => (rows ?? []).map(r => ({ ...r, eff: effectiveStatus(r, now) }))
    .filter(r => (!q || r.email.toLowerCase().includes(q.trim().toLowerCase())) && (plan === "all" || r.plan === plan) && (status === "all" || r.eff === status))
    .sort((a, b) => { const x = a.ends_at ? Date.parse(a.ends_at) : Infinity, y = b.ends_at ? Date.parse(b.ends_at) : Infinity; return sort === "asc" ? x - y : y - x; }), [rows, q, plan, status, sort, now]);
  const all = (rows ?? []).map(r => ({ ...r, eff: effectiveStatus(r, now) }));
  const stats = [
    ["Total users", all.length],
    ["Active members", all.filter(r => r.plan !== "Free" && r.eff === "active").length],
    ["Expiring in 3 days", all.filter(r => r.plan !== "Free" && r.eff === "active" && r.ends_at && Date.parse(r.ends_at) - now <= 3 * DAY).length],
    ["Expired", all.filter(r => r.eff === "expired").length],
  ] as const;
  const exportCsv = () => {
    const csv = toCsv(view.map(r => ({ email: r.email, name: r.display_name, verified: r.verified, plan: r.plan, status: r.eff, end_date: r.ends_at, days_left: r.plan === "Free" ? "" : daysLeft(r, now), created: r.created_at, last_sign_in: r.last_sign_in, note: r.note })));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `depthlens-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const sel_ = "h-10 rounded-md border border-[var(--s-border)] bg-transparent px-2 text-sm";
  return (
    <div className="dl-site min-h-dvh px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Memberships</h1>
          <Link to="/terminal" className="s-link text-sm">← Terminal</Link>
        </div>
        {error && <p role="alert" className="s-down text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{stats.map(([l, n]) => <div key={l} className="s-glass p-4"><p className="s-muted text-xs">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{rows ? n : "…"}</p></div>)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Search by email" value={q} onChange={e => setQ(e.target.value)} placeholder="Search email" className={`${sel_} min-w-0 flex-1 basis-48`} />
          <select aria-label="Filter by plan" value={plan} onChange={e => setPlan(e.target.value)} className={sel_}><option value="all">All plans</option>{["Free", "Weekly", "15 Days", "Monthly"].map(p => <option key={p}>{p}</option>)}</select>
          <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)} className={sel_}><option value="all">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="suspended">Suspended</option></select>
          <button type="button" onClick={() => setSort(s => s === "asc" ? "desc" : "asc")} className="s-btn s-btn-secondary h-10 px-3 text-sm">End date {sort === "asc" ? "↑" : "↓"}</button>
          <button type="button" onClick={exportCsv} className="s-btn s-btn-secondary h-10 gap-1.5 px-3 text-sm"><Download className="size-4" />CSV</button>
        </div>
        <div className="s-glass hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="s-muted text-xs uppercase"><tr>{["Email", "Name", "Verified", "Plan", "Status", "End date", "Days left", "Created", "Last sign-in", ""].map(h => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows === null ? <tr><td className="s-muted p-3" colSpan={10}>Loading…</td></tr> : view.map(r => (
                <tr key={r.id} className="border-t border-[var(--s-border)]">
                  <td className="p-3">{r.email}{r.is_admin && <span className="s-gold ml-2 text-xs">admin</span>}{r.note && <span className="s-muted block text-xs">{r.note}</span>}</td>
                  <td className="p-3">{r.display_name ?? "—"}</td>
                  <td className="p-3">{r.verified ? <span className="s-up">Yes</span> : <span className="s-muted">No</span>}</td>
                  <td className="p-3">{r.plan}</td>
                  <td className="p-3"><StatusBadge s={r.eff} /></td>
                  <td className="p-3 tabular-nums">{dt(r.ends_at)}</td>
                  <td className="p-3 tabular-nums">{r.plan === "Free" ? "—" : daysLeft(r, now)}</td>
                  <td className="s-muted p-3">{dt(r.created_at)}</td>
                  <td className="s-muted p-3">{dt(r.last_sign_in)}</td>
                  <td className="p-3"><button type="button" onClick={() => setSel(r)} className="s-btn s-btn-secondary h-8 px-3 text-xs">Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 md:hidden">
          {rows === null ? <p className="s-muted text-sm">Loading…</p> : view.map(r => (
            <button key={r.id} type="button" onClick={() => setSel(r)} className="s-glass block w-full p-3 text-left">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{r.email}</span><StatusBadge s={r.eff} /></div>
              <p className="s-muted mt-1 text-xs">{r.plan}{r.ends_at ? ` · until ${dt(r.ends_at)} · ${daysLeft(r, now)} days left` : ""} · {r.verified ? "verified" : "not verified"}</p>
            </button>
          ))}
        </div>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Admin log</h2>
          <div className="s-glass max-h-96 overflow-auto">
            {logs.length === 0 ? <p className="s-muted p-3 text-sm">No actions yet.</p> : <ul className="divide-y divide-[var(--s-border)] text-sm">{logs.map(l => (
              <li key={l.id} className="p-3"><p><span className="font-medium">{l.action}</span> · {l.target_email ?? "—"}</p><p className="s-muted text-xs">{new Date(l.at).toLocaleString()} · by {l.admin_email}</p><p className="mt-1 break-words text-xs">{l.old_value ?? "—"} → {l.new_value ?? "—"}</p></li>
            ))}</ul>}
          </div>
        </section>
      </div>
      {sel && <ManageDialog row={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); void load(); }} />}
    </div>
  );
}

function StatusBadge({ s }: { s: Membership["status"] }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${s === "active" ? "s-up border-current" : s === "expired" ? "s-down border-current" : "s-gold border-current"}`}>{s}</span>;
}

function describe(a: Action) {
  return a.kind === "activate" ? `Activate ${a.plan}` : a.kind === "extend" ? `Extend by ${a.days} days` : a.kind === "set_end" ? "Change end date" : a.kind === "suspend" ? "Suspend" : a.kind === "reactivate" ? "Reactivate" : a.kind === "free" ? "Set back to Free" : "Save note";
}

function ManageDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [end, setEnd] = useState(""), [custom, setCustom] = useState("10"), [note, setNote] = useState(row.note ?? "");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const now = Date.now();
  const pick = (a: Action) => {
    setErr(""); setAction(a);
    if (a.kind === "activate") setEnd(toLocalInput(nextEnd(row, a.plan, now)));
    else if (a.kind === "extend") setEnd(toLocalInput(nextEnd(row, a.days, now)));
    else if (a.kind === "set_end") setEnd(toLocalInput(row.ends_at ? new Date(row.ends_at) : new Date(now + DAY)));
  };
  const needsEnd = action && (action.kind === "activate" || action.kind === "extend" || action.kind === "set_end");
  const confirm = async () => {
    if (!action) return;
    const endIso = needsEnd ? new Date(end).toISOString() : null;
    if (needsEnd && Number.isNaN(Date.parse(end))) { setErr("Pick a valid end date."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("admin_membership_action", {
      _user: row.id, _action: action.kind,
      ...(action.kind === "activate" ? { _plan: action.plan } : {}),
      ...(action.kind === "extend" ? { _days: action.days } : {}),
      ...(endIso ? { _ends_at: endIso } : {}),
      ...(action.kind === "note" ? { _note: note } : {}),
    });
    setBusy(false);
    if (error) setErr(error.message || "Could not save."); else onDone();
  };
  const paid = row.plan !== "Free";
  const btn = "s-btn s-btn-secondary h-9 px-3 text-sm disabled:opacity-40";
  const days = Number(custom);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Manage ${row.email}`} className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_oklab,var(--s-bg)_75%,transparent)] p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="dl-site s-glass max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-xl p-4 sm:rounded-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0"><h2 className="truncate font-semibold">{row.email}</h2><p className="s-muted text-xs">{row.plan} · {effectiveStatus(row, now)}{row.ends_at ? ` · until ${dt(row.ends_at)}` : ""}</p></div>
          <button type="button" aria-label="Close" onClick={onClose} className="s-muted p-1"><X className="size-5" /></button>
        </div>
        {!action ? <div className="space-y-4">
          <div><p className="s-muted mb-2 text-xs uppercase">Activate</p><div className="flex flex-wrap gap-2">{(Object.keys(PLAN_DAYS) as PaidPlan[]).map(p => <button key={p} type="button" className={btn} onClick={() => pick({ kind: "activate", plan: p })}>{p}</button>)}</div></div>
          <div><p className="s-muted mb-2 text-xs uppercase">Extend</p><div className="flex flex-wrap items-center gap-2">{[7, 15, 30].map(d => <button key={d} type="button" disabled={!paid} className={btn} onClick={() => pick({ kind: "extend", days: d })}>+{d}</button>)}
            <input aria-label="Custom days" type="number" min={1} max={3650} value={custom} onChange={e => setCustom(e.target.value)} className="h-9 w-20 rounded-md border border-[var(--s-border)] bg-transparent px-2 text-sm" />
            <button type="button" disabled={!paid || !(days >= 1 && days <= 3650)} className={btn} onClick={() => pick({ kind: "extend", days: Math.round(days) })}>+ custom</button>
            <button type="button" disabled={!paid} className={btn} onClick={() => pick({ kind: "set_end" })}>Set end date</button></div>
            {!paid && <p className="s-muted mt-1 text-xs">Activate a plan first to extend it.</p>}</div>
          <div><p className="s-muted mb-2 text-xs uppercase">Status</p><div className="flex flex-wrap gap-2">
            <button type="button" disabled={row.status === "suspended"} className={btn} onClick={() => pick({ kind: "suspend" })}>Suspend</button>
            <button type="button" disabled={row.status !== "suspended"} className={btn} onClick={() => pick({ kind: "reactivate" })}>Reactivate</button>
            <button type="button" disabled={row.plan === "Free"} className={btn} onClick={() => pick({ kind: "free" })}>Set back to Free</button></div></div>
          <div><label htmlFor="note" className="s-muted mb-2 block text-xs uppercase">Note</label><div className="flex gap-2"><input id="note" value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="e.g. paid via JazzCash, ref 123" className="h-9 min-w-0 flex-1 rounded-md border border-[var(--s-border)] bg-transparent px-2 text-sm" /><button type="button" disabled={note === (row.note ?? "")} className={btn} onClick={() => pick({ kind: "note" })}>Save</button></div></div>
        </div> : <div className="space-y-3">
          <p className="font-medium">{describe(action)}?</p>
          {needsEnd && <div><label htmlFor="end" className="s-muted mb-1 block text-xs">New end date (you can edit it)</label><input id="end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="h-10 w-full rounded-md border border-[var(--s-border)] bg-transparent px-2 text-sm" /></div>}
          {action.kind === "note" && <p className="text-sm">Note: “{note || "—"}”</p>}
          <p className="s-muted text-xs">Current: {row.plan} · {effectiveStatus(row, now)}{row.ends_at ? ` · until ${new Date(row.ends_at).toLocaleString()}` : ""}</p>
          {err && <p role="alert" className="s-down text-sm">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={() => setAction(null)}>Back</button><button type="button" disabled={busy} onClick={() => void confirm()} className="s-btn s-btn-primary h-9 px-4 text-sm">{busy ? "Saving…" : "Confirm"}</button></div>
        </div>}
      </div>
    </div>
  );
}
