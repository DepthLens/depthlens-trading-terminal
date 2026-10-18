import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/depthlens-logo.png.asset.json";

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
  return (
    <div data-theme="navy" className="flex min-h-dvh flex-col items-center justify-center bg-t-bg px-4 text-t-text">
      <form
        onSubmit={e => { e.preventDefault(); void navigate({ to: "/terminal" }); }}
        className="w-full max-w-sm rounded-xl border border-t-border bg-t-panel p-8"
      >
        <div className="mb-6 flex flex-col items-center">
          <img src={logo.url} alt="DepthLens logo" className="size-14 rounded-lg" />
          <h1 className="mt-3 text-xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-t-muted">Log in to DepthLens</p>
        </div>
        <label className="mb-1 block text-xs font-medium text-t-muted" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mb-4 h-10 w-full rounded-md border border-t-border bg-t-bg px-3 text-sm outline-none focus:border-t-accent" placeholder="you@example.com" />
        <label className="mb-1 block text-xs font-medium text-t-muted" htmlFor="password">Password</label>
        <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className="mb-6 h-10 w-full rounded-md border border-t-border bg-t-bg px-3 text-sm outline-none focus:border-t-accent" placeholder="••••••••" />
        <button type="submit" className="h-10 w-full rounded-md bg-t-accent text-sm font-semibold text-t-bg hover:opacity-90">Log in</button>
        <p className="mt-4 text-center text-xs text-t-muted">No account yet? <Link to="/register" className="font-medium text-t-accent hover:underline">Register</Link></p>
        <p className="mt-2 text-center text-xs"><Link to="/" className="text-t-muted hover:underline">← Back to home</Link></p>
      </form>
    </div>
  );
}
