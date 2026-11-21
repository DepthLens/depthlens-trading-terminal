import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError(""); setBusy(true);
    setTimeout(() => void navigate({ to: "/terminal" }), 350);
  };
  return (
    <AuthShell title="Create your account" subtitle="Start watching the order flow">
      <form onSubmit={submit} onInvalidCapture={invalidHandler(setError)}>
        <label className="s-label" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="s-input mb-4" placeholder="you@example.com" />
        <label className="s-label" htmlFor="password">Password</label>
        <PasswordInput id="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
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
