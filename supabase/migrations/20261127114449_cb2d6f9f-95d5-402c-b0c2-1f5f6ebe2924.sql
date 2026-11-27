-- Single permanent admin
DELETE FROM public.user_roles r USING auth.users u WHERE u.id = r.user_id AND r.role = 'admin' AND lower(u.email) <> 'depthlens.coy@gmail.com';
DELETE FROM public.admin_emails WHERE lower(email) <> 'depthlens.coy@gmail.com';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'admin'
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL AND lower(u.email) = 'depthlens.coy@gmail.com')
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Role changes are blocked from the website; admin can only belong to the one email.
CREATE OR REPLACE FUNCTION public.guard_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE em text;
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN RAISE EXCEPTION 'Roles cannot be changed from the website'; END IF;
  IF TG_OP <> 'DELETE' AND NEW.role = 'admin' THEN
    SELECT lower(email) INTO em FROM auth.users WHERE id = NEW.user_id;
    IF em IS DISTINCT FROM 'depthlens.coy@gmail.com' THEN RAISE EXCEPTION 'Only the owner account can be admin'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS guard_user_roles ON public.user_roles;
CREATE TRIGGER guard_user_roles BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles();

-- Memberships
CREATE TABLE public.memberships (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'Free' CHECK (plan IN ('Free','Weekly','15 Days','Monthly')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  note text,
  activated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own membership or admin" ON public.memberships FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
INSERT INTO public.memberships (user_id) SELECT id FROM public.profiles ON CONFLICT DO NOTHING;

CREATE TABLE public.admin_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  admin_id uuid NOT NULL,
  admin_email text NOT NULL,
  target_id uuid,
  target_email text,
  action text NOT NULL,
  old_value text,
  new_value text
);
GRANT SELECT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads log" ON public.admin_logs FOR SELECT TO authenticated USING (public.is_admin());

-- New users: profile, user role, Free membership; admin only for the owner email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email, ''), '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.memberships (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  IF lower(COALESCE(NEW.email, '')) = 'depthlens.coy@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET beta_access = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.expire_memberships()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.memberships SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND plan <> 'Free' AND ends_at IS NOT NULL AND ends_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.expire_memberships() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_members()
RETURNS TABLE(id uuid, email text, display_name text, verified boolean, is_admin boolean, plan text, status text, starts_at timestamptz, ends_at timestamptz, note text, created_at timestamptz, last_sign_in timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  PERFORM public.expire_memberships();
  INSERT INTO public.memberships (user_id) SELECT p.id FROM public.profiles p ON CONFLICT DO NOTHING;
  RETURN QUERY
    SELECT p.id, p.email, p.display_name, (u.email_confirmed_at IS NOT NULL), public.has_role(p.id, 'admin'),
           m.plan, m.status, m.starts_at, m.ends_at, m.note, p.created_at, u.last_sign_in_at
    FROM public.profiles p JOIN auth.users u ON u.id = p.id JOIN public.memberships m ON m.user_id = p.id
    ORDER BY p.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_members() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_membership_action(_user uuid, _action text, _plan text DEFAULT NULL, _days integer DEFAULT NULL, _ends_at timestamptz DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.memberships; me uuid := auth.uid(); my_email text; t_email text; d int; base timestamptz; running boolean;
  n_plan text; n_status text; n_start timestamptz; n_end timestamptz; n_note text; old_txt text; new_txt text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  PERFORM public.expire_memberships();
  INSERT INTO public.memberships (user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  SELECT * INTO m FROM public.memberships WHERE user_id = _user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  SELECT email INTO my_email FROM auth.users WHERE id = me;
  SELECT email INTO t_email FROM public.profiles WHERE id = _user;
  running := m.plan <> 'Free' AND m.ends_at IS NOT NULL AND m.ends_at > now() AND m.status <> 'expired';
  n_plan := m.plan; n_status := m.status; n_start := m.starts_at; n_end := m.ends_at; n_note := m.note;
  IF _action = 'activate' THEN
    d := CASE _plan WHEN 'Weekly' THEN 7 WHEN '15 Days' THEN 15 WHEN 'Monthly' THEN 30 ELSE NULL END;
    IF d IS NULL THEN RAISE EXCEPTION 'unknown plan'; END IF;
    base := CASE WHEN running THEN m.ends_at ELSE now() END;
    n_plan := _plan; n_end := COALESCE(_ends_at, base + make_interval(days => d));
    IF NOT running THEN n_start := now(); END IF;
    n_status := CASE WHEN n_end <= now() THEN 'expired' WHEN m.status = 'suspended' AND running THEN 'suspended' ELSE 'active' END;
  ELSIF _action = 'extend' THEN
    IF m.plan = 'Free' THEN RAISE EXCEPTION 'Activate a plan first'; END IF;
    IF _days IS NULL OR _days < 1 OR _days > 3650 THEN RAISE EXCEPTION 'invalid days'; END IF;
    base := CASE WHEN running THEN m.ends_at ELSE now() END;
    n_end := COALESCE(_ends_at, base + make_interval(days => _days));
    IF NOT running THEN n_start := now(); END IF;
    n_status := CASE WHEN n_end <= now() THEN 'expired' WHEN m.status = 'suspended' THEN 'suspended' ELSE 'active' END;
  ELSIF _action = 'set_end' THEN
    IF m.plan = 'Free' OR _ends_at IS NULL THEN RAISE EXCEPTION 'invalid end date'; END IF;
    n_end := _ends_at;
    n_status := CASE WHEN n_end <= now() THEN 'expired' WHEN m.status = 'suspended' THEN 'suspended' ELSE 'active' END;
  ELSIF _action = 'suspend' THEN
    n_status := 'suspended';
  ELSIF _action = 'reactivate' THEN
    n_status := CASE WHEN m.plan <> 'Free' AND (m.ends_at IS NULL OR m.ends_at <= now()) THEN 'expired' ELSE 'active' END;
  ELSIF _action = 'free' THEN
    n_plan := 'Free'; n_status := 'active'; n_end := NULL; n_start := now();
  ELSIF _action = 'note' THEN
    n_note := NULLIF(left(trim(COALESCE(_note, '')), 300), '');
  ELSE RAISE EXCEPTION 'unknown action';
  END IF;
  old_txt := CASE WHEN _action = 'note' THEN COALESCE(m.note, '—') ELSE m.plan || ' · ' || m.status || COALESCE(' · until ' || to_char(m.ends_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'), '') END;
  new_txt := CASE WHEN _action = 'note' THEN COALESCE(n_note, '—') ELSE n_plan || ' · ' || n_status || COALESCE(' · until ' || to_char(n_end AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'), '') END;
  UPDATE public.memberships SET plan = n_plan, status = n_status, starts_at = n_start, ends_at = n_end, note = n_note,
    activated_by = CASE WHEN _action IN ('activate','extend') THEN me ELSE activated_by END, updated_at = now()
  WHERE user_id = _user;
  INSERT INTO public.admin_logs (admin_id, admin_email, target_id, target_email, action, old_value, new_value)
  VALUES (me, COALESCE(my_email, ''), _user, t_email,
    CASE _action WHEN 'activate' THEN 'Activate ' || _plan WHEN 'extend' THEN 'Extend +' || _days || ' days' WHEN 'set_end' THEN 'Set end date'
      WHEN 'suspend' THEN 'Suspend' WHEN 'reactivate' THEN 'Reactivate' WHEN 'free' THEN 'Set to Free' ELSE 'Edit note' END,
    old_txt, new_txt);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_membership_action(uuid, text, text, integer, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_membership_action(uuid, text, text, integer, timestamptz, text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_users();
DROP FUNCTION IF EXISTS public.admin_set_beta(uuid, boolean);

SELECT cron.schedule('expire-memberships', '0 * * * *', $$SELECT public.expire_memberships()$$);