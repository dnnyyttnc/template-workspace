-- ============================================================
-- ARTIST PAYOUT SYSTEM - DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. ARTISTS (core table)
CREATE TABLE IF NOT EXISTS artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    bio TEXT,
    profile_image_url TEXT,
    is_vat_liable BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    airtable_record_id VARCHAR(50) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);
CREATE INDEX IF NOT EXISTS idx_artists_airtable_id ON artists(airtable_record_id);

-- 2. ARTIST PAYMENT INFO (sensitive, separate table)
CREATE TABLE IF NOT EXISTS artist_payment_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    payout_method VARCHAR(50),  -- 'paypal' or 'bank_transfer'
    paypal_email TEXT,
    bank_name TEXT,
    iban TEXT,
    bic TEXT,
    account_holder_name TEXT,
    tax_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(artist_id)
);

-- 3. ARTIST ADDRESSES
CREATE TABLE IF NOT EXISTS artist_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    address_type VARCHAR(50) NOT NULL DEFAULT 'billing',
    is_default BOOLEAN DEFAULT TRUE,
    name TEXT,
    company TEXT,
    street TEXT,
    house_number TEXT,
    address_line_2 TEXT,
    postal_code VARCHAR(20),
    city TEXT,
    country_code CHAR(2) DEFAULT 'DE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_addresses_artist ON artist_addresses(artist_id);

-- 4. PRODUCT VARIANTS (synced from Airtable - both exe and external)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    product_name TEXT,
    product_type VARCHAR(50) NOT NULL DEFAULT 'exe',  -- 'exe' or 'external'
    artist_id UUID REFERENCES artists(id),
    artist_payout_net DECIMAL(10,2),  -- AristAuszahlungNetto / AuszahlungArtistNetto
    retail_price DECIMAL(10,2),       -- Preis (Brutto)
    exe_commission DECIMAL(10,2),     -- exeProvisionBetrag / exeAuszahlung
    shopify_fees DECIMAL(10,2),
    vat_amount DECIMAL(10,2),
    production_cost_net DECIMAL(10,2),  -- Only for exe products
    airtable_variant_id VARCHAR(50),
    airtable_class_id VARCHAR(50),
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_variants_artist ON product_variants(artist_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_type ON product_variants(product_type);

-- 5. SHOPIFY ORDERS
CREATE TABLE IF NOT EXISTS shopify_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_order_id BIGINT UNIQUE NOT NULL,
    order_number VARCHAR(50),
    order_name VARCHAR(50),       -- e.g., "#1234"
    created_at_shopify TIMESTAMPTZ,
    financial_status VARCHAR(50),  -- paid, refunded, partially_refunded, etc.
    fulfillment_status VARCHAR(50),
    total_price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'EUR',
    customer_email VARCHAR(255),
    customer_name TEXT,
    cancelled_at TIMESTAMPTZ,
    refund_total DECIMAL(10,2) DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_shopify_id ON shopify_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created ON shopify_orders(created_at_shopify);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_status ON shopify_orders(financial_status);

-- 6. ORDER LINE ITEMS (individual products sold)
CREATE TABLE IF NOT EXISTS order_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_order_id BIGINT NOT NULL REFERENCES shopify_orders(shopify_order_id),
    shopify_line_item_id BIGINT,
    sku VARCHAR(100),
    title TEXT,
    variant_title TEXT,
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(10,2),              -- Price per unit (Brutto)
    total_discount DECIMAL(10,2) DEFAULT 0,
    artist_id UUID REFERENCES artists(id),
    artist_payout_net DECIMAL(10,2),    -- Payout per unit at time of sync
    artist_payout_total DECIMAL(10,2),  -- Payout * quantity
    product_variant_id UUID REFERENCES product_variants(id),
    product_type VARCHAR(50),           -- 'exe' or 'external'
    is_refunded BOOLEAN DEFAULT FALSE,
    refunded_quantity INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_items_order ON order_line_items(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_line_items_sku ON order_line_items(sku);
CREATE INDEX IF NOT EXISTS idx_line_items_artist ON order_line_items(artist_id);

-- 7. MONTHLY PAYOUTS (aggregated per artist per month)
CREATE TABLE IF NOT EXISTS monthly_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artists(id),
    month DATE NOT NULL,  -- First day of month (e.g., 2026-03-01)
    total_orders INT DEFAULT 0,
    total_items_sold INT DEFAULT 0,
    gross_revenue DECIMAL(10,2) DEFAULT 0,
    net_payout DECIMAL(10,2) DEFAULT 0,
    vat_on_payout DECIMAL(10,2) DEFAULT 0,
    total_payout DECIMAL(10,2) DEFAULT 0,
    refund_deductions DECIMAL(10,2) DEFAULT 0,
    exe_commission_total DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',  -- pending, approved, paid
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(artist_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_payouts_artist ON monthly_payouts(artist_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payouts_month ON monthly_payouts(month);
CREATE INDEX IF NOT EXISTS idx_monthly_payouts_status ON monthly_payouts(status);

-- 8. PAYOUT LINE ITEMS (detail: which order items are in a payout)
CREATE TABLE IF NOT EXISTS payout_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_payout_id UUID NOT NULL REFERENCES monthly_payouts(id) ON DELETE CASCADE,
    order_line_item_id UUID NOT NULL REFERENCES order_line_items(id),
    quantity INT NOT NULL,
    payout_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_items_payout ON payout_line_items(monthly_payout_id);

-- 9. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'artists', 'artist_payment_info', 'artist_addresses',
        'product_variants', 'monthly_payouts'
    ])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS update_%s_updated_at ON %I; '
            'CREATE TRIGGER update_%s_updated_at '
            'BEFORE UPDATE ON %I '
            'FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END;
$$;

-- 10. Enable RLS on sensitive tables
ALTER TABLE artist_payment_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_addresses ENABLE ROW LEVEL SECURITY;

-- Service role policies (allow Python scripts full access)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_payment_info'
    ) THEN
        CREATE POLICY service_role_all_payment_info ON artist_payment_info
            FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_addresses'
    ) THEN
        CREATE POLICY service_role_all_addresses ON artist_addresses
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END;
$$;
