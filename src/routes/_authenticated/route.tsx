import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadProfile, type Profile } from "@/lib/session";
import { sessionShouldEnd } from "@/lib/auth";
import { PrivateBeta } from "@/components/site/PrivateBeta";
import { ProfileContext } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const returnTo = location.href;
    if (sessionShouldEnd()) {
      await supabase.auth.signOut();
      throw redirect({ to: "/login", search: { returnTo } });
    }
    const { data: s } = await supabase.auth.getSession();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login", search: { returnTo, ...(s.session ? { reason: "expired" as const } : {}) } });
    }
    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      throw redirect({ to: "/login", search: { returnTo, reason: "unverified" as const } });
    }
    return { user: data.user };
  },
  component: Gate,
});

function Gate() {
  const { user } = Route.useRouteContext();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useEffect(() => { let on = true; void loadProfile(user.id).then(p => { if (on) setProfile(p); }); return () => { on = false; }; }, [user.id]);
  if (profile === undefined) return <div className="dl-site flex min-h-dvh items-center justify-center"><span className="s-muted text-sm">Loading your account…</span></div>;
  if (!profile || !profile.beta_access) return <PrivateBeta email={user.email ?? ""} onUnlocked={() => setProfile(p => p ? { ...p, beta_access: true } : p)} />;
  return <ProfileContext.Provider value={profile}><Outlet /></ProfileContext.Provider>;
}
