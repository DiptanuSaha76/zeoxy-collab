-- Smile Coin cost per package
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS smile_coin_cost numeric NOT NULL DEFAULT 0;

-- Smile Coin rate history
CREATE TABLE public.coin_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  money_spent numeric NOT NULL,
  coins_received numeric NOT NULL,
  coin_rate numeric NOT NULL,
  profit_percent numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coin_rates TO anon;
GRANT SELECT, INSERT, UPDATE ON public.coin_rates TO authenticated;
GRANT ALL ON public.coin_rates TO service_role;

ALTER TABLE public.coin_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coin rates public read" ON public.coin_rates
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "coin rates admin insert" ON public.coin_rates
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "coin rates admin update" ON public.coin_rates
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX coin_rates_single_active ON public.coin_rates (is_active) WHERE is_active;

-- Per-order pricing snapshot
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS smile_coin_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS real_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit numeric NOT NULL DEFAULT 0;