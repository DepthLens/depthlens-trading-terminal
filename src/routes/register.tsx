import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/depthlens-logo.png.asset.json";

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
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError("");
    void navigate({ to: "/terminal" });
  };
  const field = "mb-4 h-10 w-full rounded-md border border-t-border bg-t-bg px-3 text-sm outline-none focus:border-t-accent";
  const label = "mb-1 block text-xs font-medium text-t-muted";
  return (
    <div data-theme="navy" className="flex min-h-dvh flex-col items-center justify-center bg-t-bg px-4 text-t-text">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-t-border bg-t-panel p-8">
        <div className="mb-6 flex flex-col items-center">
          <img src={logo.url} alt="DepthLens logo" className="size-14 rounded-lg" />
          <h1 className="mt-3 text-xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-t-muted">Start watching the order flow</p>
        </div>
        <label className={label} htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
        <label className={label} htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className={field} placeholder="At least 8 characters" />
        <label className={label} htmlFor="confirm">Confirm password</label>
        <input id="confirm" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={field} placeholder="Repeat your password" />
        {error && <p role="alert" className="mb-3 text-xs text-t-down">{error}</p>}
        <button type="submit" className="mt-2 h-10 w-full rounded-md bg-t-accent text-sm font-semibold text-t-bg hover:opacity-90">Register</button>
        <p className="mt-4 text-center text-xs text-t-muted">Already have an account? <Link to="/login" className="font-medium text-t-accent hover:underline">Log in</Link></p>
        <p className="mt-2 text-center text-xs"><Link to="/" className="text-t-muted hover:underline">← Back to home</Link></p>
      </form>
    </div>
  );
}
