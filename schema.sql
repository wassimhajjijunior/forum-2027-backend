-- Run this in the Supabase SQL editor before starting the API.
-- The backend uses the Supabase service role key server-side only.
-- RLS is enabled and no public policies are intentionally defined, so anon and
-- authenticated clients cannot read or write this table directly.

CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  university text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_email_lower_idx
  ON public.registrations (lower(email));

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
