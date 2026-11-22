REVOKE ALL ON public.profiles, public.user_roles, public.beta_codes, public.admin_emails FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;