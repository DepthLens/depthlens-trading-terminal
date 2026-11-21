import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, invalidHandler } from "@/components/site/AuthShell";
import { PasswordInput, SubmitButton } from "@/components/site/SiteField";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — DepthLens" },
      { name: "description", content: "Log in to your DepthLens order flow terminal." },
      { property: "og:title", content: "Login — DepthLens" },
      { property: "og:description", content: "Log in to your DepthLens order flow terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const onInvalid = invalidHandler(setError);
  return (
    <AuthShell title="Welcome back" subtitle="Log in to DepthLens">
      <form
        onInvalidCapture={onInvalid}
        onSubmit={e => { e.preventDefault(); setError(""); setBusy(true); setTimeout(() => void navigate({ to: "/terminal" }), 350); }}
      >
        <label className="s-label" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="s-input mb-4" placeholder="you@example.com" />
        <label className="s-label" htmlFor="password">Password</label>
        <PasswordInput id="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        <p role="alert" className="s-down mt-2 min-h-5 text-xs">{error}</p>
        <div className="mt-2"><SubmitButton busy={busy}>Log in</SubmitButton></div>
        <p className="s-muted mt-5 text-center text-xs">No account yet? <Link to="/register" className="s-link">Register</Link></p>
        <p className="mt-2 text-center text-xs"><Link to="/" className="s-muted hover:underline">← Back to home</Link></p>
      </form>
    </AuthShell>
  );
}
