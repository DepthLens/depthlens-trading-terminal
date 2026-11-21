import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className="s-input pr-11" />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"} className="s-muted absolute inset-y-0 right-0 flex w-11 items-center justify-center hover:text-[var(--s-text)]">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return <button type="submit" disabled={busy} className="s-btn s-btn-primary h-11 w-full">{busy && <Loader2 className="size-4 animate-spin" />}{children}</button>;
}
