-- AutoClipper: Affiliate/Referral system
-- Run after 001_profiles.sql in Supabase SQL Editor

-- ─── Add affiliate & referral columns to profiles ───────────────────────────

-- Who referred this user (stores the referral code string, e.g. 'mikelvlog')
ALTER TABLE public.profiles ADD COLUMN referred_by text;

-- Is this user an affiliate?
ALTER TABLE public.profiles ADD COLUMN is_affiliate boolean NOT NULL DEFAULT false;

-- The affiliate's custom referral code (human-readable, unique)
ALTER TABLE public.profiles ADD COLUMN referral_code text UNIQUE;

-- Display name for co-branding ("Recomendado por X")
ALTER TABLE public.profiles ADD COLUMN affiliate_name text;

-- Indexes
CREATE INDEX idx_profiles_referral_code ON public.profiles(referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX idx_profiles_referred_by ON public.profiles(referred_by)
  WHERE referred_by IS NOT NULL;

-- ─── Commissions table ──────────────────────────────────────────────────────

CREATE TABLE public.commissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_checkout_session_id text,
  amount_cents integer NOT NULL,
  commission_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

-- Prevent duplicate commissions for the same purchase
CREATE UNIQUE INDEX idx_commissions_unique_purchase
  ON public.commissions(referred_user_id, stripe_checkout_session_id);

-- RLS: affiliates can read their own commissions
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates can read own commissions"
  ON public.commissions FOR SELECT
  USING (auth.uid() = affiliate_id);

-- ─── Public view for landing page co-branding (no auth needed) ──────────────

CREATE VIEW public.affiliate_display AS
  SELECT referral_code, affiliate_name
  FROM public.profiles
  WHERE is_affiliate = true AND referral_code IS NOT NULL;

GRANT SELECT ON public.affiliate_display TO anon;

-- ─── Update handle_new_user trigger to capture referred_by ──────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, referred_by)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'referred_by'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Affiliate stats function (called via RPC from edge function) ───────────

CREATE OR REPLACE FUNCTION public.get_affiliate_stats(p_affiliate_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'referral_code', p.referral_code,
    'affiliate_name', p.affiliate_name,
    'total_referrals', (
      SELECT count(*) FROM public.profiles
      WHERE referred_by = p.referral_code
    ),
    'total_conversions', (
      SELECT count(*) FROM public.commissions
      WHERE affiliate_id = p_affiliate_id
    ),
    'total_earnings_cents', (
      SELECT coalesce(sum(commission_cents), 0) FROM public.commissions
      WHERE affiliate_id = p_affiliate_id AND status IN ('pending', 'approved', 'paid')
    ),
    'pending_cents', (
      SELECT coalesce(sum(commission_cents), 0) FROM public.commissions
      WHERE affiliate_id = p_affiliate_id AND status = 'pending'
    ),
    'paid_cents', (
      SELECT coalesce(sum(commission_cents), 0) FROM public.commissions
      WHERE affiliate_id = p_affiliate_id AND status = 'paid'
    )
  ) INTO result
  FROM public.profiles p
  WHERE p.id = p_affiliate_id AND p.is_affiliate = true;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
