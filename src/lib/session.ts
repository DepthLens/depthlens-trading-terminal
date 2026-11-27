import { supabase } from "@/integrations/supabase/client";
import { clearRemember } from "@/lib/auth";
import { FREE, type Membership } from "@/lib/membership";

export type Profile = { id: string; email: string; display_name: string | null; beta_access: boolean; is_admin: boolean; membership: Membership };

export async function loadProfile(userId: string): Promise<Profile | null> {
  const [{ data: p }, { data: admin }, { data: m }] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,beta_access").eq("id", userId).maybeSingle(),
    supabase.rpc("is_admin"),
    supabase.from("memberships").select("plan,status,starts_at,ends_at,note").eq("user_id", userId).maybeSingle(),
  ]);
  if (!p) return null;
  // Admin status comes from the database check (owner email, verified, admin role), never from the browser.
  return { ...p, is_admin: admin === true, membership: (m as Membership | null) ?? FREE };
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
