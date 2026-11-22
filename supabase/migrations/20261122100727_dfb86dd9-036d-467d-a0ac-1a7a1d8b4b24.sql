CREATE TABLE public.forex_pair_sync (
  pair text PRIMARY KEY,
  last_fetch timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  history_loaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.forex_pair_sync TO service_role;
ALTER TABLE public.forex_pair_sync ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.forex_api_calls (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  purpose text NOT NULL,
  pair text
);
CREATE INDEX forex_api_calls_at_idx ON public.forex_api_calls (at);
GRANT ALL ON public.forex_api_calls TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.forex_api_calls_id_seq TO service_role;
ALTER TABLE public.forex_api_calls ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fx_take_call(_purpose text, _pair text, _min_cap integer DEFAULT 8, _day_cap integer DEFAULT 800)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE m int; d int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fx_take_call'));
  DELETE FROM public.forex_api_calls WHERE at < now() - interval '2 days';
  SELECT count(*) INTO m FROM public.forex_api_calls WHERE at > now() - interval '60 seconds';
  SELECT count(*) INTO d FROM public.forex_api_calls WHERE at > now() - interval '24 hours';
  IF m >= _min_cap OR d >= _day_cap THEN RETURN false; END IF;
  INSERT INTO public.forex_api_calls (purpose, pair) VALUES (_purpose, _pair);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fx_take_call(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_take_call(text, text, integer, integer) TO service_role;