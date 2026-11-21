CREATE TABLE public.forex_candles (
  pair text NOT NULL,
  tf text NOT NULL,
  time bigint NOT NULL,
  open double precision NOT NULL,
  high double precision NOT NULL,
  low double precision NOT NULL,
  close double precision NOT NULL,
  PRIMARY KEY (pair, tf, time)
);
GRANT SELECT ON public.forex_candles TO anon, authenticated;
GRANT ALL ON public.forex_candles TO service_role;
ALTER TABLE public.forex_candles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Forex candles are public" ON public.forex_candles FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.forex_sync_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run timestamptz NOT NULL DEFAULT 'epoch'
);
GRANT ALL ON public.forex_sync_state TO service_role;
ALTER TABLE public.forex_sync_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.forex_sync_state (id) VALUES (1);