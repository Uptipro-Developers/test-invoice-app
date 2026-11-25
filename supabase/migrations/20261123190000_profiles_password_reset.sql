-- Password reset tokens for forgot-password flow.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.reset_token_hash IS
  'SHA-256 hash of the one-time password reset token; null when no reset is pending.';
COMMENT ON COLUMN public.profiles.reset_token_expires_at IS
  'Expiry for reset_token_hash; tokens are rejected after this time.';
