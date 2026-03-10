import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

function formatCurrency(amount: number): string {
  return amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("de-DE")
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fetch payout with artist info
  const { data: payout, error } = await supabaseAdmin
    .from("monthly_payouts")
    .select("*, artists(name, slug, email, is_vat_liable)")
    .eq("id", id)
    .single()

  if (error || !payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 })
  }

  // Fetch artist address
  const { data: address } = await supabaseAdmin
    .from("artist_addresses")
    .select("*")
    .eq("artist_id", payout.artist_id)
    .eq("is_default", true)
    .maybeSingle()

  // Fetch line items for this month
  const monthFrom = payout.month
  const [y, m] = monthFrom.slice(0, 7).split("-").map(Number)
  const monthTo = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1).toISOString().slice(0, 10)

  const { data: lineItems } = await supabaseAdmin
    .from("order_line_items")
    .select("sku, title, quantity, price, artist_payout_net, refunded_quantity, shopify_orders(order_name, created_at_shopify)")
    .eq("artist_id", payout.artist_id)
    .gte("created_at", monthFrom)
    .lt("created_at", monthTo)

  const artist = payout.artists as { name: string; slug: string; email: string | null; is_vat_liable: boolean }
  const monthLabel = new Date(payout.month).toLocaleDateString("de-DE", { month: "long", year: "numeric" })
  const today = new Date().toLocaleDateString("de-DE")
  const gutschriftNr = payout.invoice_number || `ENTWURF-${payout.month.slice(0, 7)}-${artist.slug}`

  // Generate HTML-based PDF (simple, no external lib needed for now)
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Gutschrift ${gutschriftNr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .logo { font-size: 20px; font-weight: bold; letter-spacing: -0.5px; }
    .logo span { background: #1a1a1a; color: white; padding: 2px 6px; border-radius: 3px; }
    .meta { text-align: right; color: #666; }
    .addresses { display: flex; gap: 60px; margin-bottom: 30px; }
    .address-block h3 { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
    .address-block p { margin-bottom: 2px; }
    .title { font-size: 16px; font-weight: bold; margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { text-align: left; padding: 8px 0; border-bottom: 1px solid #ddd; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
    td { padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
    .text-right { text-align: right; }
    .summary { margin-top: 20px; border-top: 2px solid #1a1a1a; padding-top: 12px; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .summary-row.total { font-size: 14px; font-weight: bold; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 4px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 9px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo"><span>exe</span> Network</div>
    <div class="meta">
      <p><strong>Gutschrift Nr.:</strong> ${gutschriftNr}</p>
      <p><strong>Datum:</strong> ${today}</p>
      <p><strong>Zeitraum:</strong> ${monthLabel}</p>
    </div>
  </div>

  <div class="addresses">
    <div class="address-block">
      <h3>Empfänger</h3>
      <p><strong>${artist.name}</strong></p>
      ${address ? `
        ${address.street ? `<p>${address.street} ${address.house_number || ""}</p>` : ""}
        ${address.postal_code || address.city ? `<p>${address.postal_code || ""} ${address.city || ""}</p>` : ""}
      ` : "<p style='color: #999;'>Adresse nicht hinterlegt</p>"}
    </div>
    <div class="address-block">
      <h3>Aussteller</h3>
      <p><strong>exe Network</strong></p>
      <p>exe ist GmbH</p>
    </div>
  </div>

  <div class="title">Abrechnungsgutschrift – ${monthLabel}</div>

  <table>
    <thead>
      <tr>
        <th>Bestellung</th>
        <th>Produkt</th>
        <th>SKU</th>
        <th class="text-right">Menge</th>
        <th class="text-right">Preis</th>
        <th class="text-right">Auszahlung</th>
      </tr>
    </thead>
    <tbody>
      ${(lineItems || [])
        .filter((item) => (item.quantity - (item.refunded_quantity || 0)) > 0)
        .map((item) => {
          const effectiveQty = item.quantity - (item.refunded_quantity || 0)
          const itemPayout = (item.artist_payout_net || 0) * effectiveQty
          const orderData = item.shopify_orders as unknown as { order_name: string } | { order_name: string }[] | null
          const order = Array.isArray(orderData) ? orderData[0] : orderData
          return `
          <tr>
            <td>${order?.order_name || "–"}</td>
            <td>${item.title || "–"}</td>
            <td style="font-family: monospace; font-size: 10px;">${item.sku || "–"}</td>
            <td class="text-right">${effectiveQty}</td>
            <td class="text-right">${formatCurrency(item.price)} €</td>
            <td class="text-right">${formatCurrency(itemPayout)} €</td>
          </tr>`
        })
        .join("")}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span>Netto-Auszahlung</span>
      <span>${formatCurrency(payout.net_payout)} €</span>
    </div>
    ${payout.vat_on_payout > 0 ? `
    <div class="summary-row">
      <span>MwSt (19%)</span>
      <span>${formatCurrency(payout.vat_on_payout)} €</span>
    </div>
    ` : ""}
    ${payout.refund_deductions > 0 ? `
    <div class="summary-row">
      <span>Retouren-Abzüge</span>
      <span>-${formatCurrency(payout.refund_deductions)} €</span>
    </div>
    ` : ""}
    <div class="summary-row total">
      <span>Auszahlungsbetrag</span>
      <span>${formatCurrency(payout.total_payout)} €</span>
    </div>
  </div>

  <div class="footer">
    <p>Diese Gutschrift wurde automatisch erstellt. Bei Fragen wenden Sie sich an accounting@exe-ist.de</p>
    <p>exe ist GmbH · Gutschrift ${gutschriftNr} · ${today}</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${gutschriftNr}.html"`,
    },
  })
}
