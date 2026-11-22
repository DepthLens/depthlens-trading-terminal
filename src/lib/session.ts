import { supabase } from "@/integrations/supabase/client";
import { clearRemember } from "@/lib/auth";

export type Profile = { id: string; email: string; display_name: string | null; beta_access: boolean; is_admin: boolean };

export async function loadProfile(userId: string): Promise<Profile | null> {
  const [{ data: p }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,beta_access").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (!p) return null;
  return { ...p, is_admin: (roles ?? []).some(r => r.role === "admin") };
}

let manualSignOut = false;
export const wasManualSignOut = () => { const v = manualSignOut; manualSignOut = false; return v; };

/** Sign out and go to the login page (full navigation clears all terminal state and sockets). */
export async function signOutApp() {
  manualSignOut = true;
  clearRemember();
  await supabase.auth.signOut();
  window.location.assign("/login");
}
