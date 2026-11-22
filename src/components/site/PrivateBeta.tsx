import { useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "./AuthShell";
import { SubmitButton } from "./SiteField";
import { signOutApp } from "@/lib/session";

export function PrivateBeta({ email, onUnlocked }: { email: string; onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError("Enter your access code."); return; }
    setBusy(true); setError("");
    const { data, error: err } = await supabase.rpc("redeem_beta_code", { _code: code });
    setBusy(false);
    if (err) { setError("Could not check the code. Please try again."); return; }
    if (!data) { setError("That access code is not valid."); return; }
    onUnlocked();
  };
  return (
    <AuthShell title="Private beta" subtitle="DepthLens is invite-only right now. Enter your access code once to unlock the terminal.">
      <form onSubmit={submit}>
        <div className="s-muted mb-4 flex items-center gap-2 text-xs"><Lock className="size-3.5" />Signed in as {email}</div>
        <label className="s-label" htmlFor="code">Access code</label>
        <input id="code" value={code} onChange={e => setCode(e.target.value)} className="s-input" autoComplete="off" placeholder="e.g. ABCD-1234" />
        <p role="alert" className="s-down mt-2 min-h-5 text-xs">{error}</p>
        <div className="mt-2"><SubmitButton busy={busy}>Unlock terminal</SubmitButton></div>
        <button type="button" onClick={() => void signOutApp()} className="s-muted mt-4 w-full text-center text-xs hover:underline">Log out</button>
      </form>
    </AuthShell>
  );
}
