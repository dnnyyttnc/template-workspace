import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { status, payment_reference } = body

  if (!["approved", "paid"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }

  if (status === "approved") {
    update.approved_at = new Date().toISOString()

    // Assign sequential invoice number
    const year = new Date().getFullYear()
    const { data: invoiceNumber } = await supabaseAdmin.rpc(
      "next_invoice_number",
      { p_year: year }
    )
    if (invoiceNumber) {
      update.invoice_number = invoiceNumber
    }
  }
  if (status === "paid") {
    update.paid_at = new Date().toISOString()
    if (payment_reference) {
      update.payment_reference = payment_reference
    }
  }

  const { error } = await supabaseAdmin
    .from("monthly_payouts")
    .update(update)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
