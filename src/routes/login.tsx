import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/depthlens-logo.png.asset.json";
import { invalidHandler } from "@/components/site/AuthShell";
import { PasswordInput, SubmitButton } from "@/components/site/SiteField";
import { LoginAmbient } from "@/components/site/LoginAmbient";
import { FlowPreview, type PreviewKind } from "@/components/site/FlowPreview";

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

const TOOLS: { kind: PreviewKind; name: string; text: string }[] = [
  { kind: "heatmap", name: "Heatmap", text: "Where large resting orders sit and when they are pulled or absorbed." },
  { kind: "footprint", name: "Footprint", text: "Buy vs sell volume inside every candle." },
  { kind: "cvd", name: "Delta & CVD", text: "Whether aggressive buyers or sellers are in control." },
  { kind: "profile", name: "Volume Profile", text: "Prices where most trading happened (POC)." },
  { kind: "radar", name: "Flow Radar", text: "Setups and context measured on past data." },
];
const step = (i: number) => ({ animationDelay: `${0.25 + i * 0.08}s` });

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const onInvalid = invalidHandler(setError);
  return (
    <div className="dl-site min-h-dvh">
      <LoginAmbient />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col-reverse items-stretch gap-8 px-4 py-8 md:grid md:grid-cols-[55fr_45fr] md:items-center md:gap-10 md:px-8">
        <section aria-labelledby="flow-heading" className="md:pr-4">
          <h2 id="flow-heading" className="lg-step text-2xl font-bold md:text-4xl" style={step(0)}>See what moves the price.</h2>
          <p className="lg-step s-muted mt-3 max-w-lg text-sm md:text-base" style={step(1)}>Order flow shows who is buying, who is selling, and where large orders are waiting.</p>
          <ul className="mt-6 grid max-h-[26rem] gap-2.5 overflow-y-auto pr-1 md:max-h-none md:overflow-visible">
            {TOOLS.map((t, i) => (
              <li key={t.kind} className="lg-tool lg-step flex items-center gap-3 p-2.5" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                <FlowPreview kind={t.kind} />
                <div className="min-w-0"><div className="s-gold text-sm font-semibold">{t.name}</div><div className="s-muted text-xs leading-snug">{t.text}</div></div>
              </li>
            ))}
          </ul>
          <p className="s-muted mt-4 text-[11px]">Tools show setups and context, not guaranteed signals.</p>
        </section>

        <div className="lg-card s-rise mx-auto w-full max-w-sm p-7 sm:p-8">
          <Link to="/" className="mx-auto mb-5 flex w-fit flex-col items-center">
            <span className="s-logo rounded-xl"><img src={logo.url} alt="DepthLens logo" className="size-14 rounded-xl" /></span>
          </Link>
          <h1 className="text-center text-xl font-bold">Welcome back</h1>
          <p className="s-muted mt-1 mb-6 text-center text-sm">Sign in to your order-flow terminal</p>
          <form onInvalidCapture={onInvalid} onSubmit={e => { e.preventDefault(); setError(""); setBusy(true); setTimeout(() => void navigate({ to: "/terminal" }), 350); }}>
            <div className="lg-step" style={step(0)}>
              <label className="s-label" htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="s-input mb-4" placeholder="you@example.com" />
            </div>
            <div className="lg-step" style={step(1)}>
              <label className="s-label" htmlFor="password">Password</label>
              <PasswordInput id="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="lg-step mt-3 flex items-center justify-between text-xs" style={step(2)}>
              <label className="s-muted flex cursor-pointer items-center gap-2"><input type="checkbox" className="lg-check" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember me</label>
              <button type="button" className="lg-textbtn s-link" onClick={() => setInfo("Password reset isn't available yet.")}>Forgot password?</button>
            </div>
            <p role="alert" className="s-down mt-2 min-h-5 text-xs">{error || <span className="s-muted">{info}</span>}</p>
            <div className="lg-step mt-1 grid gap-2.5" style={step(3)}>
              <SubmitButton busy={busy}>Sign in</SubmitButton>
              <Link to="/register" className="s-btn s-btn-secondary h-11 w-full">Create account</Link>
            </div>
            <p className="mt-4 text-center text-xs"><Link to="/" className="s-muted hover:underline">← Back to home</Link></p>
          </form>
        </div>
      </main>
    </div>
  );
}
