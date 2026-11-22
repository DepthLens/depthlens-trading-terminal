

export const MIN_PASSWORD = 8;
const SESSION_ONLY = "dl-session-only";
const SESSION_ALIVE = "dl-session-alive";

/** Plain-language message for a Supabase sign-in/up error. */
export function authMessage(err: { message: string; code?: string | undefined; status?: number | undefined }): string {
  const m = (err.message || "").toLowerCase();
  const c = err.code ?? "";
  if (c === "email_not_confirmed" || m.includes("email not confirmed")) return "Please verify your email first. Check your inbox for the link.";
  if (c === "invalid_credentials" || m.includes("invalid login")) return "Wrong email or password.";
  if (err.status === 429 || c.startsWith("over_") || m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a few minutes and try again.";
  if (c === "user_already_exists" || m.includes("already registered")) return "An account with this email already exists. Try logging in.";
  if (c === "weak_password" || m.includes("password should")) return `Password is too weak. Use at least ${MIN_PASSWORD} characters.`;
  if (c === "same_password") return "New password must be different from the old one.";
  return err.message || "Something went wrong. Please try again.";
}

/** 0–4 strength score with a short label. */
export function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= MIN_PASSWORD) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length < MIN_PASSWORD) s = 0;
  return { score: s, label: pw.length < MIN_PASSWORD ? `Too short (min ${MIN_PASSWORD})` : ["Weak", "Fair", "Good", "Strong", "Very strong"][s] ?? "Weak" };
}

/** Only same-app paths are allowed as a post-login destination. */
export function safeReturnTo(v: unknown): string {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/terminal";
  if (v.startsWith("/login") || v.startsWith("/register")) return "/terminal";
  return v;
}

/** Remember me off: the session ends when the browser closes. */
export function setRemember(remember: boolean) {
  try {
    if (remember) localStorage.removeItem(SESSION_ONLY);
    else localStorage.setItem(SESSION_ONLY, "1");
    sessionStorage.setItem(SESSION_ALIVE, "1");
  } catch { /* storage blocked */ }
}

/** True when a "don't remember me" session belongs to a closed browser session. */
export function sessionShouldEnd(): boolean {
  try {
    if (localStorage.getItem(SESSION_ONLY) !== "1") return false;
    return sessionStorage.getItem(SESSION_ALIVE) !== "1";
  } catch { return false; }
}

export function clearRemember() {
  try { localStorage.removeItem(SESSION_ONLY); sessionStorage.removeItem(SESSION_ALIVE); } catch { /* ignore */ }
}
