export interface Artist {
  id: string
  name: string
  slug: string
  email: string | null
  bio: string | null
  profile_image_url: string | null
  is_vat_liable: boolean
  status: string
  airtable_record_id: string | null
  onboarding_token: string | null
  onboarding_token_expires_at: string | null
  onboarding_status: "pending" | "invited" | "completed"
  onboarding_completed_at: string | null
  consent_credit_notes: boolean
  consent_given_at: string | null
  created_at: string
  updated_at: string
}

export interface ArtistPaymentInfo {
  id: string
  artist_id: string
  payout_method: string | null
  paypal_email: string | null
  bank_name: string | null
  iban: string | null
  bic: string | null
  account_holder_name: string | null
  tax_number: string | null
  vat_id: string | null
  created_at: string
  updated_at: string
}

export interface ArtistAddress {
  id: string
  artist_id: string
  address_type: string
  is_default: boolean
  name: string | null
  company: string | null
  street: string | null
  house_number: string | null
  address_line_2: string | null
  postal_code: string | null
  city: string | null
  country_code: string
  created_at: string
  updated_at: string
}

export interface ProductVariant {
  id: string
  sku: string
  product_name: string | null
  product_type: "exe" | "external"
  artist_id: string | null
  artist_payout_net: number | null
  retail_price: number | null
  exe_commission: number | null
  shopify_fees: number | null
  vat_amount: number | null
  production_cost_net: number | null
  airtable_variant_id: string | null
  airtable_class_id: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface ShopifyOrder {
  id: string
  shopify_order_id: number
  order_number: string
  order_name: string
  created_at_shopify: string
  financial_status: string
  fulfillment_status: string | null
  total_price: number
  currency: string
  customer_email: string | null
  customer_name: string | null
  cancelled_at: string | null
  refund_total: number
  synced_at: string
  created_at: string
}

export interface OrderLineItem {
  id: string
  shopify_order_id: number
  shopify_line_item_id: number
  sku: string | null
  title: string | null
  variant_title: string | null
  quantity: number
  price: number
  total_discount: number
  artist_id: string | null
  artist_payout_net: number | null
  artist_payout_total: number | null
  product_variant_id: string | null
  product_type: string | null
  is_refunded: boolean
  refunded_quantity: number
  created_at: string
}

export interface MonthlyPayout {
  id: string
  artist_id: string
  month: string
  total_orders: number
  total_items_sold: number
  gross_revenue: number
  net_payout: number
  vat_on_payout: number
  total_payout: number
  refund_deductions: number
  exe_commission_total: number
  status: "pending" | "approved" | "paid"
  approved_at: string | null
  paid_at: string | null
  payment_method: string | null
  payment_reference: string | null
  invoice_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Joined types for views
export interface MonthlyPayoutWithArtist extends MonthlyPayout {
  artists: Pick<Artist, "name" | "slug" | "is_vat_liable" | "email">
}

export interface ProductVariantWithArtist extends ProductVariant {
  artists: Pick<Artist, "name" | "slug"> | null
}

export interface OrderLineItemWithOrder extends OrderLineItem {
  shopify_orders: Pick<ShopifyOrder, "order_name" | "created_at_shopify" | "financial_status">
}

// Summary types
export interface MonthSummary {
  month: string
  total_artists: number
  total_items: number
  total_payout: number
  total_pending: number
  total_approved: number
  total_paid: number
}

// Onboarding types
export interface OnboardingFormData {
  address: {
    name: string
    company?: string
    street: string
    house_number: string
    postal_code: string
    city: string
    country_code: string
  }
  tax: {
    tax_number: string
    is_vat_liable: boolean
    vat_id?: string
  }
  payment: {
    payout_method: "paypal" | "bank_transfer"
    paypal_email?: string
    iban?: string
    bic?: string
    account_holder_name?: string
    bank_name?: string
  }
  consent: {
    credit_notes: boolean
  }
}

export interface OnboardingContext {
  artist_id: string
  artist_name: string
  pending_amount: number
  pending_months: number
  already_completed: boolean
}
