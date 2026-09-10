CREATE TABLE public.alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bed text NOT NULL,
  alert_type text NOT NULL,
  message text NOT NULL,
  heart_rate numeric,
  respiration_rate numeric,
  signal_confidence numeric,
  notified_phone text,
  notified_email text,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.alerts TO anon;
GRANT SELECT, INSERT ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read dispatched alerts"
  ON public.alerts FOR SELECT
  USING (true);

CREATE POLICY "Anyone can dispatch an alert"
  ON public.alerts FOR INSERT
  WITH CHECK (true);

CREATE INDEX alerts_dispatched_at_idx ON public.alerts (dispatched_at DESC);