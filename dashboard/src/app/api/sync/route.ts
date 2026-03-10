import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_NAME || "exe-ist-shop"
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!

const AIRTABLE_PAT = process.env.AIRTABLE_PAT!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!

async function getShopifyToken(): Promise<string> {
  const res = await fetch(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`Shopify token error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  return data.access_token
}

async function syncShopifyOrders() {
  const token = await getShopifyToken()
  let synced = 0
  let lineItemsSynced = 0
  let errors = 0
  let pageInfo: string | null = null

  // Fetch products for SKU matching
  const { data: variants } = await supabaseAdmin
    .from("product_variants")
    .select("sku, id, artist_id, artist_payout_net, product_type")

  const skuMap = new Map(
    (variants || []).map((v) => [v.sku, v])
  )

  while (true) {
    let url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-10/orders.json?status=any&limit=250`
    if (pageInfo) {
      url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-10/orders.json?page_info=${pageInfo}&limit=250`
    }

    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    })

    if (!res.ok) {
      errors++
      break
    }

    const data = await res.json()
    const orders = data.orders || []

    for (const order of orders) {
      // Upsert order
      const { error: orderError } = await supabaseAdmin.from("shopify_orders").upsert(
        {
          shopify_order_id: order.id,
          order_number: String(order.order_number),
          order_name: order.name,
          created_at_shopify: order.created_at,
          financial_status: order.financial_status,
          fulfillment_status: order.fulfillment_status,
          total_price: parseFloat(order.total_price),
          currency: order.currency,
          customer_email: order.customer?.email || null,
          customer_name: order.customer
            ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
            : null,
          cancelled_at: order.cancelled_at,
          refund_total: order.refunds?.reduce(
            (sum: number, r: { transactions: { amount: string }[] }) =>
              sum + r.transactions.reduce((s: number, t: { amount: string }) => s + parseFloat(t.amount), 0),
            0
          ) || 0,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "shopify_order_id" }
      )

      if (orderError) {
        errors++
        continue
      }
      synced++

      // Upsert line items
      for (const item of order.line_items || []) {
        const sku = item.sku || null
        const variant = sku ? skuMap.get(sku) : null

        // Check if refunded
        let refundedQty = 0
        for (const refund of order.refunds || []) {
          for (const ri of refund.refund_line_items || []) {
            if (ri.line_item_id === item.id) {
              refundedQty += ri.quantity
            }
          }
        }

        await supabaseAdmin.from("order_line_items").upsert(
          {
            shopify_order_id: order.id,
            shopify_line_item_id: item.id,
            sku,
            title: item.title,
            variant_title: item.variant_title,
            quantity: item.quantity,
            price: parseFloat(item.price),
            total_discount: parseFloat(item.total_discount || "0"),
            artist_id: variant?.artist_id || null,
            artist_payout_net: variant?.artist_payout_net || null,
            artist_payout_total: variant
              ? (variant.artist_payout_net || 0) * item.quantity
              : null,
            product_variant_id: variant?.id || null,
            product_type: variant?.product_type || null,
            is_refunded: refundedQty >= item.quantity,
            refunded_quantity: refundedQty,
          },
          { onConflict: "shopify_line_item_id" }
        )
        lineItemsSynced++
      }
    }

    // Check for next page
    const linkHeader = res.headers.get("link")
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^>&]+).*rel="next"/)
      pageInfo = match ? match[1] : null
    } else {
      break
    }
  }

  return { orders_synced: synced, line_items_synced: lineItemsSynced, errors }
}

async function syncAirtableProducts() {
  const tableId = "tblaaJQZhgs3IVyHj"
  let synced = 0
  let errors = 0
  let offset: string | undefined

  // Fetch artists for mapping
  const { data: artists } = await supabaseAdmin
    .from("artists")
    .select("id, airtable_record_id")

  const artistMap = new Map(
    (artists || []).filter((a) => a.airtable_record_id).map((a) => [a.airtable_record_id, a.id])
  )

  function getField(fields: Record<string, unknown>, prefix: string): unknown {
    if (prefix in fields) return fields[prefix]
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith(prefix + " (") || key.startsWith(prefix + "(")) return value
    }
    return null
  }

  while (true) {
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?pageSize=100`
    if (offset) url += `&offset=${offset}`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
    })

    if (!res.ok) {
      errors++
      break
    }

    const data = await res.json()

    for (const record of data.records || []) {
      const f = record.fields
      const sku = (getField(f, "SKU") as string) || (f["Name"] as string)
      if (!sku) continue

      const artistRecId = getField(f, "artist_airtable_rec_id")
      const artistRecIdStr = Array.isArray(artistRecId) ? artistRecId[0] : artistRecId
      const artistId = artistRecIdStr ? artistMap.get(artistRecIdStr as string) : null

      const productType = ((getField(f, "product_type") as string) || "exe").toLowerCase()

      const payoutNet = getField(f, "AristAuszahlungNetto") ?? getField(f, "AuszahlungArtistNetto")
      const payoutVal = Array.isArray(payoutNet) ? payoutNet[0] : payoutNet

      const retailPrice = getField(f, "Preis (Brutto)") ?? getField(f, "Preis")
      const retailVal = Array.isArray(retailPrice) ? retailPrice[0] : retailPrice

      const exeCommission = getField(f, "exeProvisionBetrag") ?? getField(f, "exeAuszahlung")
      const exeVal = Array.isArray(exeCommission) ? exeCommission[0] : exeCommission

      // Extract the class record ID for Airtable Interface links
      const classRecId = getField(f, "airtableRecordID (from ExeArtistProductClass)")
      const classRecIdStr = Array.isArray(classRecId) ? classRecId[0] : classRecId

      const { error } = await supabaseAdmin.from("product_variants").upsert(
        {
          sku,
          product_name: (getField(f, "product_name") as string) || (f["Name"] as string) || sku,
          product_type: productType.includes("ext") ? "external" : "exe",
          artist_id: artistId || null,
          artist_payout_net: typeof payoutVal === "number" ? payoutVal : null,
          retail_price: typeof retailVal === "number" ? retailVal : null,
          exe_commission: typeof exeVal === "number" ? exeVal : null,
          airtable_variant_id: record.id,
          airtable_class_id: typeof classRecIdStr === "string" ? classRecIdStr : null,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "sku" }
      )

      if (error) errors++
      else synced++
    }

    offset = data.offset
    if (!offset) break
  }

  return { variants_synced: synced, errors }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const source = (body as { source?: string }).source || "all"

    const result: Record<string, unknown> = {}

    if (source === "all" || source === "shopify") {
      result.shopify = await syncShopifyOrders()
    }

    if (source === "all" || source === "airtable") {
      result.airtable = await syncAirtableProducts()
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
