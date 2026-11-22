import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Admin — DepthLens" },
    { name: "description", content: "Manage DepthLens users and private beta access." },
    { property: "og:title", content: "Admin — DepthLens" },
    { property: "og:description", content: "Manage DepthLens users and private beta access." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Admin,
});

type Row = { id: string; email: string; verified: boolean; beta_access: boolean; is_admin: boolean; created_at: string };

function Admin() {
  const profile = useProfile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    const { data, error: e } = await supabase.rpc("admin_list_users");
    if (e) setError("Could not load users."); else setRows(data as Row[]);
  };
  useEffect(() => { if (profile?.is_admin) void load(); }, [profile?.is_admin]);
  if (!profile?.is_admin) return (
    <div className="dl-site flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold">Admins only</h1>
      <p className="s-muted text-sm">You don't have permission to open this page.</p>
      <Link to="/terminal" className="s-btn s-btn-secondary h-10 px-4">Back to terminal</Link>
    </div>
  );
  const toggle = async (r: Row, on: boolean) => {
    setRows(rs => rs?.map(x => x.id === r.id ? { ...x, beta_access: on } : x) ?? null);
    const { error: e } = await supabase.rpc("admin_set_beta", { _user: r.id, _on: on });
    if (e) { setError("Could not save the change."); void load(); }
  };
  return (
    <div className="dl-site min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Users</h1>
          <Link to="/terminal" className="s-link text-sm">← Terminal</Link>
        </div>
        {error && <p role="alert" className="s-down mb-3 text-sm">{error}</p>}
        <div className="s-glass overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="s-muted text-xs uppercase"><tr><th className="p-3">Email</th><th className="p-3">Verified</th><th className="p-3">Created</th><th className="p-3">Beta access</th></tr></thead>
            <tbody>
              {rows === null ? <tr><td className="s-muted p-3" colSpan={4}>Loading…</td></tr> : rows.map(r => (
                <tr key={r.id} className="border-t border-[var(--s-border)]">
                  <td className="p-3">{r.email}{r.is_admin && <span className="s-gold ml-2 text-xs">admin</span>}</td>
                  <td className="p-3">{r.verified ? <span className="s-up">Yes</span> : <span className="s-muted">No</span>}</td>
                  <td className="s-muted p-3">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="p-3"><Switch aria-label={`Beta access for ${r.email}`} checked={r.beta_access} onCheckedChange={v => void toggle(r, v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
