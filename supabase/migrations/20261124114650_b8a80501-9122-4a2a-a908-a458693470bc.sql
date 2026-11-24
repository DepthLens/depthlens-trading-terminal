DROP POLICY IF EXISTS "Forex candles are public" ON public.forex_candles;
CREATE POLICY "Signed-in users read forex candles" ON public.forex_candles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.forex_candles FROM anon;
DROP POLICY IF EXISTS "Recorded order book is public market data" ON public.ob_snapshots;
CREATE POLICY "Signed-in users read recorded order book" ON public.ob_snapshots FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.ob_snapshots FROM anon;