import { Link } from "@tanstack/react-router";
import logo from "@/assets/depthlens-logo.png.asset.json";
import { CandleBackdrop } from "./CandleBackdrop";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="dl-site flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="fixed inset-0 z-0 opacity-60"><CandleBackdrop dim speed={0.45} /></div>
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--s-bg)_80%)]" />
      <div className="s-glass s-rise relative z-10 w-full max-w-sm p-7 sm:p-8">
        <Link to="/" className="mx-auto mb-6 flex w-fit flex-col items-center">
          <span className="s-logo rounded-xl"><img src={logo.url} alt="DepthLens logo" className="size-14 rounded-xl" /></span>
        </Link>
        <h1 className="text-center text-xl font-bold">{title}</h1>
        <p className="s-muted mt-1 mb-6 text-center text-sm">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

/** Shows the browser's validation message inline (red) instead of a bubble. */
export function invalidHandler(set: (m: string) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = e.target as HTMLInputElement;
    const name = el.labels?.[0]?.textContent ?? "Field";
    set(el.validity.valueMissing ? `${name} is required.` : el.validity.typeMismatch ? "Enter a valid email address." : el.validity.tooShort ? `${name} must be at least ${el.minLength} characters.` : el.validationMessage);
  };
}
