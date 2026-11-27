REVOKE EXECUTE ON FUNCTION public.guard_user_roles() FROM public, anon, authenticated;
DROP POLICY "Own membership or admin" ON public.memberships;
CREATE POLICY "Own membership or admin" ON public.memberships FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id OR (select public.is_admin()));