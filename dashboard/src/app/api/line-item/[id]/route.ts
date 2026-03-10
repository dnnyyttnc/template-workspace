import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { artist_id } = body

  if (!artist_id) {
    return NextResponse.json({ error: "artist_id is required" }, { status: 400 })
  }

  // Fetch artist info for payout lookup
  const { data: artist } = await supabaseAdmin
    .from("artists")
    .select("id, name")
    .eq("id", artist_id)
    .single()

  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 })
  }

  // Fetch line item to get SKU for payout lookup
  const { data: lineItem } = await supabaseAdmin
    .from("order_line_items")
    .select("sku")
    .eq("id", id)
    .single()

  // Try to find matching product variant for this artist + SKU
  let payoutNet = null
  if (lineItem?.sku) {
    const { data: variant } = await supabaseAdmin
      .from("product_variants")
      .select("artist_payout_net, id, product_type")
      .eq("sku", lineItem.sku)
      .eq("artist_id", artist_id)
      .maybeSingle()

    if (variant) {
      payoutNet = variant.artist_payout_net
    }
  }

  // Update line item
  const update: Record<string, unknown> = {
    artist_id,
  }

  if (payoutNet !== null) {
    update.artist_payout_net = payoutNet
    update.artist_payout_total = payoutNet * ((await supabaseAdmin
      .from("order_line_items")
      .select("quantity")
      .eq("id", id)
      .single()).data?.quantity || 1)
  }

  const { error } = await supabaseAdmin
    .from("order_line_items")
    .update(update)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    artist_name: artist.name,
    artist_payout_net: payoutNet,
  })
}
