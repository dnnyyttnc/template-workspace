import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { month, dryRun } = body // month: "2026-02"

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 })
  }

  const [year, mon] = month.split("-").map(Number)
  const fromDate = new Date(year, mon - 1, 1).toISOString()
  const toDate = new Date(mon === 12 ? year + 1 : year, mon === 12 ? 0 : mon, 1).toISOString()

  // 1. Fetch artists
  const { data: artists } = await supabaseAdmin
    .from("artists")
    .select("id, name, slug, is_vat_liable, status")

  const artistMap = new Map((artists || []).map((a) => [a.id, a]))

  // 2. Fetch orders for this month
  const { data: orders } = await supabaseAdmin
    .from("shopify_orders")
    .select("shopify_order_id, financial_status, cancelled_at")
    .gte("created_at_shopify", fromDate)
    .lt("created_at_shopify", toDate)

  if (!orders || orders.length === 0) {
    return NextResponse.json({ message: "No orders found for this month", payouts: {} })
  }

  // Filter cancelled
  const validOrderIds: number[] = []
  for (const o of orders) {
    if (o.cancelled_at) continue
    validOrderIds.push(o.shopify_order_id)
  }

  if (validOrderIds.length === 0) {
    return NextResponse.json({ message: "All orders cancelled", payouts: {} })
  }

  // 3. Fetch line items in batches
  const allLineItems: Record<string, unknown>[] = []
  const batchSize = 50
  for (let i = 0; i < validOrderIds.length; i += batchSize) {
    const batchIds = validOrderIds.slice(i, i + batchSize)
    const { data: items } = await supabaseAdmin
      .from("order_line_items")
      .select("*")
      .in("shopify_order_id", batchIds)

    if (items) allLineItems.push(...items)
  }

  // 4. Calculate payouts per artist
  const artistPayouts: Record<
    string,
    {
      orders: Set<number>
      totalItems: number
      grossRevenue: number
      netPayout: number
      refundDeductions: number
      vatOnPayout: number
      totalPayout: number
    }
  > = {}

  let unmatched = 0

  for (const item of allLineItems) {
    const artistId = item.artist_id as string
    const payoutNet = item.artist_payout_net as number
    const quantity = (item.quantity as number) || 1
    const price = (item.price as number) || 0
    const refundedQty = (item.refunded_quantity as number) || 0
    const orderId = item.shopify_order_id as number

    if (!artistId || payoutNet == null) {
      unmatched++
      continue
    }

    if (!artistPayouts[artistId]) {
      artistPayouts[artistId] = {
        orders: new Set(),
        totalItems: 0,
        grossRevenue: 0,
        netPayout: 0,
        refundDeductions: 0,
        vatOnPayout: 0,
        totalPayout: 0,
      }
    }

    const ap = artistPayouts[artistId]
    ap.orders.add(orderId)

    const effectiveQty = quantity - refundedQty
    if (effectiveQty <= 0) {
      ap.refundDeductions += payoutNet * quantity
      continue
    }

    ap.totalItems += effectiveQty
    ap.grossRevenue += price * effectiveQty
    ap.netPayout += payoutNet * effectiveQty

    if (refundedQty > 0) {
      ap.refundDeductions += payoutNet * refundedQty
    }
  }

  // 5. Post-process: round, add VAT
  const results: Record<string, unknown> = {}
  const monthDate = `${month}-01`

  // Delete stale payout records for artists no longer in this month's calculation
  if (!dryRun) {
    await supabaseAdmin
      .from("monthly_payouts")
      .delete()
      .eq("month", monthDate)
      .not("artist_id", "in", `(${Object.keys(artistPayouts).join(",")})`)
  }

  for (const [artistId, ap] of Object.entries(artistPayouts)) {
    const artist = artistMap.get(artistId)
    const net = Math.round(ap.netPayout * 100) / 100
    const vatOnPayout = artist?.is_vat_liable ? Math.round(net * 19) / 100 : 0
    const totalPayout = Math.round((net + vatOnPayout) * 100) / 100

    results[artistId] = {
      artist_id: artistId,
      artist_name: artist?.name || "Unknown",
      total_orders: ap.orders.size,
      total_items_sold: ap.totalItems,
      gross_revenue: Math.round(ap.grossRevenue * 100) / 100,
      net_payout: net,
      vat_on_payout: vatOnPayout,
      total_payout: totalPayout,
      refund_deductions: Math.round(ap.refundDeductions * 100) / 100,
    }

    // Save to Supabase (unless dry run)
    if (!dryRun) {
      await supabaseAdmin.from("monthly_payouts").upsert(
        {
          artist_id: artistId,
          month: monthDate,
          total_orders: ap.orders.size,
          total_items_sold: ap.totalItems,
          gross_revenue: Math.round(ap.grossRevenue * 100) / 100,
          net_payout: net,
          vat_on_payout: vatOnPayout,
          total_payout: totalPayout,
          refund_deductions: Math.round(ap.refundDeductions * 100) / 100,
          status: "pending",
        },
        { onConflict: "artist_id,month" }
      )
    }
  }

  return NextResponse.json({
    month,
    dryRun: !!dryRun,
    total_artists: Object.keys(results).length,
    unmatched_items: unmatched,
    payouts: results,
  })
}
