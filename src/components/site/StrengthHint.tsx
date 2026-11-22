import { passwordStrength } from "@/lib/auth";

export function StrengthHint({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (!password) return <p className="s-muted mt-1.5 text-[11px]">Use 8+ characters; mixing cases, numbers and symbols makes it stronger.</p>;
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1">{[0, 1, 2, 3].map(i => <span key={i} className={`h-1 flex-1 rounded ${i < score ? (score >= 3 ? "bg-[var(--s-up)]" : "bg-[var(--s-gold)]") : "bg-[var(--s-border)]"}`} />)}</div>
      <p className={`mt-1 text-[11px] ${score === 0 ? "s-down" : "s-muted"}`}>Strength: {label}</p>
    </div>
  );
}
