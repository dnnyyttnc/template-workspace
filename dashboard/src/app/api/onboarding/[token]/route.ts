import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Look up artist by onboarding token
  const { data: artist, error } = await supabaseAdmin
    .from("artists")
    .select("id, name, onboarding_status, onboarding_token_expires_at")
    .eq("onboarding_token", token)
    .single()

  if (error || !artist) {
    return NextResponse.json(
      { error: "Ungültiger oder abgelaufener Link." },
      { status: 404 }
    )
  }

  // Check expiry
  if (
    artist.onboarding_token_expires_at &&
    new Date(artist.onboarding_token_expires_at) < new Date()
  ) {
    return NextResponse.json(
      { error: "Dieser Link ist abgelaufen. Bitte fordere einen neuen an." },
      { status: 410 }
    )
  }

  const alreadyCompleted = artist.onboarding_status === "completed"

  // Get pending earnings for wallet display
  const { data: payouts } = await supabaseAdmin
    .from("monthly_payouts")
    .select("total_payout, month")
    .eq("artist_id", artist.id)
    .in("status", ["pending", "approved"])

  const pendingAmount = (payouts || []).reduce(
    (sum, p) => sum + Number(p.total_payout),
    0
  )
  const pendingMonths = (payouts || []).length

  return NextResponse.json({
    artist_id: artist.id,
    artist_name: artist.name,
    pending_amount: pendingAmount,
    pending_months: pendingMonths,
    already_completed: alreadyCompleted,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json()

  // Validate token
  const { data: artist } = await supabaseAdmin
    .from("artists")
    .select("id, onboarding_status, onboarding_token_expires_at")
    .eq("onboarding_token", token)
    .single()

  if (!artist) {
    return NextResponse.json({ error: "Ungültiger Link." }, { status: 404 })
  }

  if (
    artist.onboarding_token_expires_at &&
    new Date(artist.onboarding_token_expires_at) < new Date()
  ) {
    return NextResponse.json({ error: "Link abgelaufen." }, { status: 410 })
  }

  const { address, tax, payment, consent } = body

  // Validate required fields
  if (
    !address?.name ||
    !address?.street ||
    !address?.postal_code ||
    !address?.city ||
    !tax?.tax_number ||
    !payment?.payout_method ||
    !consent?.credit_notes
  ) {
    return NextResponse.json(
      { error: "Bitte alle Pflichtfelder ausfüllen." },
      { status: 400 }
    )
  }

  if (payment.payout_method === "paypal" && !payment.paypal_email) {
    return NextResponse.json(
      { error: "PayPal E-Mail fehlt." },
      { status: 400 }
    )
  }

  if (
    payment.payout_method === "bank_transfer" &&
    (!payment.iban || !payment.account_holder_name)
  ) {
    return NextResponse.json(
      { error: "IBAN und Kontoinhaber sind Pflichtfelder." },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  // Upsert billing address
  const { error: addrError } = await supabaseAdmin
    .from("artist_addresses")
    .upsert(
      {
        artist_id: artist.id,
        address_type: "billing",
        is_default: true,
        name: address.name,
        company: address.company || null,
        street: address.street,
        house_number: address.house_number || null,
        postal_code: address.postal_code,
        city: address.city,
        country_code: address.country_code || "DE",
      },
      { onConflict: "artist_id,address_type" }
    )

  if (addrError) {
    return NextResponse.json(
      { error: "Fehler beim Speichern der Adresse: " + addrError.message },
      { status: 500 }
    )
  }

  // Upsert payment info
  const { error: payError } = await supabaseAdmin
    .from("artist_payment_info")
    .upsert(
      {
        artist_id: artist.id,
        payout_method: payment.payout_method,
        paypal_email: payment.paypal_email || null,
        iban: payment.iban || null,
        bic: payment.bic || null,
        bank_name: payment.bank_name || null,
        account_holder_name: payment.account_holder_name || null,
        tax_number: tax.tax_number,
        vat_id: tax.vat_id || null,
      },
      { onConflict: "artist_id" }
    )

  if (payError) {
    return NextResponse.json(
      { error: "Fehler beim Speichern der Zahlungsdaten: " + payError.message },
      { status: 500 }
    )
  }

  // Update artist record
  const { error: artistError } = await supabaseAdmin
    .from("artists")
    .update({
      is_vat_liable: tax.is_vat_liable,
      onboarding_status: "completed",
      onboarding_completed_at: now,
      consent_credit_notes: true,
      consent_given_at: now,
    })
    .eq("id", artist.id)

  if (artistError) {
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren: " + artistError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
