import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { StrengthHint } from "@/components/site/StrengthHint";
import { authMessage, MIN_PASSWORD } from "@/lib/auth";
import { useState } from "react";
import { AuthShell, invalidHandler } from "@/components/site/AuthShell";
import { PasswordInput, SubmitButton } from "@/components/site/SiteField";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — DepthLens" },
      { name: "description", content: "Create your DepthLens account and open the order flow terminal." },
      { property: "og:title", content: "Register — DepthLens" },
      { property: "og:description", content: "Create your DepthLens account and open the order flow terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Register,
});

function Register() {
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError(""); setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/login?reason=verified` } });
    setBusy(false);
    if (err) { setError(authMessage(err)); return; }
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities?.length === 0) { setError(authMessage({ message: "already registered" })); return; }
    // Email confirmation off: a session comes back immediately — go straight in.
    if (data.session) { navigate({ to: "/terminal" }); return; }
    setSent(true);
  };
  if (sent) return (
    <AuthShell title="Check your email" subtitle="One more step to activate your account">
      <p className="text-center text-sm">We sent a verification link to <span className="s-gold font-semibold">{email}</span>. Open it to verify your email, then log in.</p>
      <Link to="/login" className="s-btn s-btn-primary mt-6 h-11 w-full">Go to login</Link>
      <p className="s-muted mt-4 text-center text-xs">No email? Check spam, or wait a minute and register again.</p>
    </AuthShell>
  );
  return (
    <AuthShell title="Create your account" subtitle="Start watching the order flow">
      <form onSubmit={e => void submit(e)} onInvalidCapture={invalidHandler(setError)}>
        <label className="s-label" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="s-input mb-4" placeholder="you@example.com" />
        <label className="s-label" htmlFor="password">Password</label>
        <PasswordInput id="password" required minLength={MIN_PASSWORD} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
        <StrengthHint password={password} />
        <label className="s-label mt-4" htmlFor="confirm">Confirm password</label>
        <PasswordInput id="confirm" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" aria-invalid={error === "Passwords do not match."} />
        <p role="alert" className="s-down mt-2 min-h-5 text-xs">{error}</p>
        <div className="mt-2"><SubmitButton busy={busy}>Register</SubmitButton></div>
        <p className="s-muted mt-5 text-center text-xs">Already have an account? <Link to="/login" className="s-link">Log in</Link></p>
        <p className="mt-2 text-center text-xs"><Link to="/" className="s-muted hover:underline">← Back to home</Link></p>
      </form>
    </AuthShell>
  );
}
