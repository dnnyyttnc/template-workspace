-- ============================================================
-- ONBOARDING TOKENS + INVOICE NUMBERING SYSTEM
-- ============================================================

-- 1. Add onboarding columns to artists table
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS onboarding_token UUID,
  ADD COLUMN IF NOT EXISTS onboarding_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_credit_notes BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

-- Unique index on token for fast lookup (partial: only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_onboarding_token
  ON artists(onboarding_token) WHERE onboarding_token IS NOT NULL;

-- Index on onboarding status for dashboard filtering
CREATE INDEX IF NOT EXISTS idx_artists_onboarding_status
  ON artists(onboarding_status);

-- 2. Add USt-IdNr field to artist_payment_info
ALTER TABLE artist_payment_info
  ADD COLUMN IF NOT EXISTS vat_id TEXT;

-- 3. Add unique constraint on artist_addresses for upserts
ALTER TABLE artist_addresses
  ADD CONSTRAINT artist_addresses_artist_type_unique
  UNIQUE(artist_id, address_type);

-- 4. Add invoice_number to monthly_payouts
ALTER TABLE monthly_payouts
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50) UNIQUE;

-- 5. Invoice number sequence table
CREATE TABLE IF NOT EXISTS invoice_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL UNIQUE,
  last_number INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Function to get next invoice number atomically
CREATE OR REPLACE FUNCTION next_invoice_number(p_year INT)
RETURNS TEXT AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO invoice_sequences (year, last_number)
  VALUES (p_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1,
               updated_at = NOW()
  RETURNING last_number INTO v_next;

  RETURN 'GS-' || p_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
