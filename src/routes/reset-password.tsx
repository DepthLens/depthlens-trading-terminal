import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, invalidHandler } from "@/components/site/AuthShell";
import { PasswordInput, SubmitButton } from "@/components/site/SiteField";
import { StrengthHint } from "@/components/site/StrengthHint";
import { authMessage, MIN_PASSWORD } from "@/lib/auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Set new password — DepthLens" },
    { name: "description", content: "Choose a new password for your DepthLens account." },
    { property: "og:title", content: "Set new password — DepthLens" },
    { property: "og:description", content: "Choose a new password for your DepthLens account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => { if (ev === "PASSWORD_RECOVERY" || s) setReady(true); });
    const t = setTimeout(() => { void supabase.auth.getSession().then(({ data }) => setReady(r => r ?? !!data.session)); }, 1200);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setBusy(false); setError(authMessage(err)); return; }
    await supabase.auth.signOut();
    void navigate({ to: "/login", search: { reason: "reset" } });
  };
  return (
    <AuthShell title="Set new password" subtitle="Choose a new password for your account">
      {ready === false ? (
        <div className="text-center text-sm">
          <p className="s-muted">This reset link is invalid or has expired.</p>
          <Link to="/login" className="s-link mt-4 inline-block">Back to login</Link>
        </div>
      ) : (
        <form onSubmit={submit} onInvalidCapture={invalidHandler(setError)}>
          <label className="s-label" htmlFor="password">New password</label>
          <PasswordInput id="password" required minLength={MIN_PASSWORD} value={password} onChange={e => setPassword(e.target.value)} placeholder={`At least ${MIN_PASSWORD} characters`} />
          <StrengthHint password={password} />
          <label className="s-label mt-3" htmlFor="confirm">Confirm password</label>
          <PasswordInput id="confirm" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" />
          <p role="alert" className="s-down mt-2 min-h-5 text-xs">{error}</p>
          <div className="mt-2"><SubmitButton busy={busy || ready === null}>Save new password</SubmitButton></div>
        </form>
      )}
    </AuthShell>
  );
}
