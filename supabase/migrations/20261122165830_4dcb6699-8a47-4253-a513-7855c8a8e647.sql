-- Roles (separate table to prevent privilege escalation)
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  beta_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Private beta codes: no client access at all
CREATE TABLE public.beta_codes (
  code text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.beta_codes TO service_role;
ALTER TABLE public.beta_codes ENABLE ROW LEVEL SECURITY;
INSERT INTO public.beta_codes (code) VALUES ('TRADFYE-BETA-2026');

-- Auto profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email, ''), '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing users
INSERT INTO public.profiles (id, email, display_name)
SELECT id, COALESCE(email, ''), split_part(COALESCE(email, ''), '@', 1) FROM auth.users ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) SELECT id, 'user' FROM auth.users ON CONFLICT DO NOTHING;

-- Redeem an access code for the signed-in user
CREATE OR REPLACE FUNCTION public.redeem_beta_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beta_codes WHERE upper(code) = upper(trim(_code)) AND active) THEN
    RETURN false;
  END IF;
  UPDATE public.profiles SET beta_access = true WHERE id = auth.uid();
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.redeem_beta_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_beta_code(text) TO authenticated;

-- Admin: list users with verification status
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, verified boolean, beta_access boolean, is_admin boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN QUERY
    SELECT p.id, p.email, (u.email_confirmed_at IS NOT NULL), p.beta_access,
           public.has_role(p.id, 'admin'), p.created_at
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Admin: give / remove beta access
CREATE OR REPLACE FUNCTION public.admin_set_beta(_user uuid, _on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.profiles SET beta_access = _on WHERE id = _user;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_beta(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_beta(uuid, boolean) TO authenticated;