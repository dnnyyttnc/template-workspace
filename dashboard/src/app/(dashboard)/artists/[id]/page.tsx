"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import {
  formatCurrency,
  formatMonth,
  maskIban,
  airtableLink,
  shopifyOrderLink,
  shopifyOrdersForArtistLink,
} from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/StatusBadge"
import {
  ArrowLeft,
  Check,
  CreditCard,
  FileText,
  Calculator,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShoppingBag,
  Loader2,
  Link as LinkIcon,
  Copy,
} from "lucide-react"
import type { Artist, ArtistPaymentInfo, MonthlyPayout } from "@/types/database"

interface LineItem {
  id: string
  sku: string | null
  title: string | null
  variant_title: string | null
  quantity: number
  price: number
  artist_payout_net: number | null
  refunded_quantity: number
  is_refunded: boolean
  shopify_order_id: number
  product_variants: { airtable_variant_id: string | null; airtable_class_id: string | null; product_name: string | null } | null
  shopify_orders: { order_name: string; created_at_shopify: string } | null
}

export default function ArtistDetailPage() {
  const params = useParams<{ id: string }>()
  const [artist, setArtist] = useState<Artist | null>(null)
  const [payment, setPayment] = useState<ArtistPaymentInfo | null>(null)
  const [payouts, setPayouts] = useState<MonthlyPayout[]>([])
  const [loading, setLoading] = useState(true)

  // Expandable month rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lineItems, setLineItems] = useState<Record<string, LineItem[]>>({})
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set())

  // Months with unprocessed orders (no payout record yet)
  const [unmatchedMonths, setUnmatchedMonths] = useState<{ month: string; count: number }[]>([])
  const [calculating, setCalculating] = useState<string | null>(null)

  // Onboarding link
  const [generatingLink, setGeneratingLink] = useState(false)
  const [onboardingLink, setOnboardingLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadPayouts = useCallback(async () => {
    const { data } = await supabase
      .from("monthly_payouts")
      .select("*")
      .eq("artist_id", params.id)
      .order("month", { ascending: false })
    setPayouts(data || [])
  }, [params.id])

  useEffect(() => {
    async function load() {
      const [artistRes, paymentRes] = await Promise.all([
        supabase.from("artists").select("*").eq("id", params.id).single(),
        supabase.from("artist_payment_info").select("*").eq("artist_id", params.id).maybeSingle(),
      ])

      setArtist(artistRes.data)
      setPayment(paymentRes.data)
      await loadPayouts()

      // Find months with orders for this artist that don't have a payout yet
      const { data: orderMonths } = await supabase
        .from("order_line_items")
        .select("shopify_order_id, shopify_orders(created_at_shopify)")
        .eq("artist_id", params.id)

      if (orderMonths) {
        const monthCounts: Record<string, number> = {}
        for (const item of orderMonths) {
          const orderData = item.shopify_orders as unknown as { created_at_shopify: string } | { created_at_shopify: string }[] | null
          const order = Array.isArray(orderData) ? orderData[0] : orderData
          if (order?.created_at_shopify) {
            const m = order.created_at_shopify.slice(0, 7)
            monthCounts[m] = (monthCounts[m] || 0) + 1
          }
        }
        // We'll check which months have payouts after payouts are loaded
        // Store all months with counts for now
        setUnmatchedMonths(
          Object.entries(monthCounts)
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => b.month.localeCompare(a.month))
        )
      }

      setLoading(false)
    }
    load()
  }, [params.id, loadPayouts])

  // Months that have orders but no payout record
  const payoutMonths = new Set(payouts.map((p) => p.month.slice(0, 7)))
  const missingMonths = unmatchedMonths.filter((m) => !payoutMonths.has(m.month))

  async function loadMonthLineItems(monthStr: string, forceReload = false) {
    if (!forceReload && lineItems[monthStr] !== undefined) return

    setLoadingItems((prev) => new Set(prev).add(monthStr))

    const [y, m] = monthStr.split("-").map(Number)
    const fromDate = new Date(y, m - 1, 1).toISOString()
    const toDate = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1).toISOString()

    // Get order IDs for this month
    const { data: orders } = await supabase
      .from("shopify_orders")
      .select("shopify_order_id")
      .gte("created_at_shopify", fromDate)
      .lt("created_at_shopify", toDate)

    const orderIds = (orders || []).map((o) => o.shopify_order_id)
    let items: LineItem[] = []

    if (orderIds.length > 0) {
      const { data } = await supabase
        .from("order_line_items")
        .select("*, product_variants(airtable_variant_id, airtable_class_id, product_name), shopify_orders(order_name, created_at_shopify)")
        .eq("artist_id", params.id)
        .in("shopify_order_id", orderIds)
        .order("created_at", { ascending: false })

      items = (data as unknown as LineItem[]) || []
    }

    setLineItems((prev) => ({ ...prev, [monthStr]: items }))
    setLoadingItems((prev) => {
      const next = new Set(prev)
      next.delete(monthStr)
      return next
    })
  }

  function toggleExpand(monthStr: string) {
    const next = new Set(expanded)
    if (next.has(monthStr)) {
      next.delete(monthStr)
    } else {
      next.add(monthStr)
      loadMonthLineItems(monthStr)
    }
    setExpanded(next)
  }

  async function updateStatus(id: string, status: "approved" | "paid") {
    const res = await fetch(`/api/payout/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) loadPayouts()
  }

  async function calculateMonth(monthStr: string) {
    setCalculating(monthStr)
    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthStr }),
      })
      if (res.ok) await loadPayouts()
    } finally {
      setCalculating(null)
    }
  }

  async function generateOnboardingLink() {
    setGeneratingLink(true)
    try {
      const res = await fetch("/api/onboarding/generate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: params.id }),
      })
      if (res.ok) {
        const { link } = await res.json()
        const fullLink = `${window.location.origin}${link}`
        setOnboardingLink(fullLink)
        // Update local artist state
        setArtist((prev) => prev ? { ...prev, onboarding_status: "invited" as const } : prev)
      }
    } finally {
      setGeneratingLink(false)
    }
  }

  if (loading || !artist) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    )
  }

  const totalEarned = payouts.reduce((s, p) => s + p.total_payout, 0)
  const totalPending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.total_payout, 0)
  const totalApproved = payouts.filter((p) => p.status === "approved").reduce((s, p) => s + p.total_payout, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/artists" className="text-zinc-400 hover:text-zinc-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{artist.name}</h1>
          <p className="text-sm text-zinc-500">{artist.slug}</p>
        </div>
        <span
          className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            artist.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {artist.status}
        </span>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Profil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-zinc-500">E-Mail:</span> {artist.email || "–"}</p>
            <p><span className="text-zinc-500">MwSt-pflichtig:</span> {artist.is_vat_liable ? "Ja (19%)" : "Nein"}</p>
            <p>
              <span className="text-zinc-500">Onboarding:</span>{" "}
              {artist.onboarding_status === "completed" ? (
                <span className="text-emerald-600">Abgeschlossen</span>
              ) : artist.onboarding_status === "invited" ? (
                <span className="text-amber-600">Eingeladen</span>
              ) : (
                <span className="text-zinc-400">Ausstehend</span>
              )}
            </p>
            {artist.onboarding_status !== "completed" && (
              <div className="mt-3 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateOnboardingLink}
                  disabled={generatingLink}
                  className="w-full"
                >
                  {generatingLink ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <LinkIcon className="mr-1 h-3 w-3" />
                  )}
                  {artist.onboarding_status === "invited"
                    ? "Neuen Link erstellen"
                    : "Onboarding-Link erstellen"}
                </Button>
                {onboardingLink && (
                  <div className="mt-2 flex items-center gap-1">
                    <input
                      readOnly
                      value={onboardingLink}
                      className="flex-1 rounded border px-2 py-1 text-xs bg-zinc-50"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(onboardingLink)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Zahlung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {payment ? (
              <>
                <p><span className="text-zinc-500">Methode:</span> {payment.payout_method || "–"}</p>
                {payment.payout_method === "paypal" && (
                  <p><span className="text-zinc-500">PayPal:</span> {payment.paypal_email || "–"}</p>
                )}
                {payment.payout_method === "bank_transfer" && (
                  <p><span className="text-zinc-500">IBAN:</span> {maskIban(payment.iban)}</p>
                )}
              </>
            ) : (
              <p className="text-amber-600">Keine Daten</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Gesamt verdient</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalEarned)}</p>
            <p className="text-sm text-zinc-500">{payouts.length} Monate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Offen</CardTitle>
          </CardHeader>
          <CardContent>
            {totalPending > 0 && (
              <p className="text-lg font-semibold text-amber-600">{formatCurrency(totalPending)} <span className="text-xs font-normal">ausstehend</span></p>
            )}
            {totalApproved > 0 && (
              <p className="text-lg font-semibold text-blue-600">{formatCurrency(totalApproved)} <span className="text-xs font-normal">freigegeben</span></p>
            )}
            {totalPending === 0 && totalApproved === 0 && (
              <p className="text-sm text-zinc-400">Alles bezahlt</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Missing months warning */}
      {missingMonths.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{missingMonths.length} Monate</strong> mit Bestellungen, aber ohne berechnete Auszahlung:
          <div className="mt-2 flex flex-wrap gap-2">
            {missingMonths.map((m) => (
              <Button
                key={m.month}
                variant="outline"
                size="sm"
                className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                onClick={() => calculateMonth(m.month)}
                disabled={calculating === m.month}
              >
                {calculating === m.month ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Calculator className="mr-1 h-3 w-3" />
                )}
                {formatMonth(m.month)} ({m.count} Positionen)
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly payout breakdown */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Auszahlungen nach Monat</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine Auszahlungen vorhanden.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-zinc-50 text-left">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-4 py-3 font-medium">Monat</th>
                  <th className="px-4 py-3 font-medium text-right">Artikel</th>
                  <th className="px-4 py-3 font-medium text-right">Umsatz</th>
                  <th className="px-4 py-3 font-medium text-right">Netto</th>
                  <th className="px-4 py-3 font-medium text-right">MwSt</th>
                  <th className="px-4 py-3 font-medium text-right">Gesamt</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Aktionen</th>
                </tr>
              </thead>
              {payouts.map((p) => {
                const monthStr = p.month.slice(0, 7)
                const isExpanded = expanded.has(monthStr)
                const items = lineItems[monthStr]
                const isLoadingItems = loadingItems.has(monthStr)

                return (
                  <tbody key={p.id}>
                    <tr
                      className="border-b hover:bg-zinc-50 cursor-pointer"
                      onClick={() => toggleExpand(monthStr)}
                    >
                      <td className="px-2 py-3 text-center">
                        {isExpanded ? (
                          <ChevronDown className="mx-auto h-4 w-4 text-zinc-400" />
                        ) : (
                          <ChevronRight className="mx-auto h-4 w-4 text-zinc-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{formatMonth(monthStr)}</td>
                      <td className="px-4 py-3 text-right">{p.total_items_sold}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.gross_revenue)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.net_payout)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.vat_on_payout)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.total_payout)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {p.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatus(p.id, "approved")}
                              title="Freigeben"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                          {p.status === "approved" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatus(p.id, "paid")}
                              title="Als bezahlt markieren"
                            >
                              <CreditCard className="h-3 w-3" />
                            </Button>
                          )}
                          <a href={`/api/pdf/${p.id}`} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" title="PDF Gutschrift">
                              <FileText className="h-3 w-3" />
                            </Button>
                          </a>
                          <a
                            href={shopifyOrdersForArtistLink(monthStr, artist.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="sm" title="In Shopify anzeigen">
                              <ShoppingBag className="h-3 w-3" />
                            </Button>
                          </a>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded: line items */}
                    {isExpanded && (
                      <tr className="border-b">
                        <td colSpan={9} className="bg-zinc-50/50 px-0 py-0">
                          {isLoadingItems ? (
                            <div className="flex items-center gap-2 px-12 py-4 text-sm text-zinc-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Lade Positionen...
                            </div>
                          ) : !items || items.length === 0 ? (
                            <div className="px-12 py-4 text-sm text-zinc-400">
                              Keine Positionen in diesem Monat.
                            </div>
                          ) : (
                            <div className="px-8 py-3">
                              <table className="w-full text-xs">
                                <thead className="text-left text-zinc-400">
                                  <tr>
                                    <th className="pb-2 pr-4 font-medium">Bestellung</th>
                                    <th className="pb-2 pr-4 font-medium">Produkt</th>
                                    <th className="pb-2 pr-4 font-medium">SKU</th>
                                    <th className="pb-2 pr-4 font-medium text-right">Menge</th>
                                    <th className="pb-2 pr-4 font-medium text-right">Preis</th>
                                    <th className="pb-2 pr-4 font-medium text-right">Auszahlung</th>
                                    <th className="pb-2 font-medium">Links</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item) => {
                                    const effectiveQty = item.quantity - (item.refunded_quantity || 0)
                                    if (effectiveQty <= 0) return null
                                    const itemPayout = (item.artist_payout_net || 0) * effectiveQty
                                    const orderData = item.shopify_orders as unknown as { order_name: string } | { order_name: string }[] | null
                                    const order = Array.isArray(orderData) ? orderData[0] : orderData
                                    const variantData = item.product_variants as unknown as { airtable_variant_id: string | null; airtable_class_id: string | null; product_name: string | null } | { airtable_variant_id: string | null; airtable_class_id: string | null; product_name: string | null }[] | null
                                    const variant = Array.isArray(variantData) ? variantData[0] : variantData

                                    return (
                                      <tr key={item.id} className="border-t border-zinc-100">
                                        <td className="py-2 pr-4">
                                          {order?.order_name ? (
                                            <a
                                              href={shopifyOrderLink(order.order_name)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline"
                                            >
                                              {order.order_name}
                                            </a>
                                          ) : (
                                            "–"
                                          )}
                                        </td>
                                        <td className="py-2 pr-4">
                                          {variant?.product_name || item.title || "–"}
                                          {item.variant_title && (
                                            <span className="ml-1 text-zinc-400">
                                              ({item.variant_title})
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 pr-4 font-mono">{item.sku || "–"}</td>
                                        <td className="py-2 pr-4 text-right">{effectiveQty}</td>
                                        <td className="py-2 pr-4 text-right">{formatCurrency(item.price)}</td>
                                        <td className="py-2 pr-4 text-right">{formatCurrency(itemPayout)}</td>
                                        <td className="py-2">
                                          <div className="flex items-center gap-1.5">
                                            {(variant?.airtable_class_id || variant?.airtable_variant_id) && (
                                              <a
                                                href={airtableLink(variant.airtable_class_id || variant.airtable_variant_id!)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="In Airtable öffnen"
                                                className="text-zinc-400 hover:text-purple-600"
                                              >
                                                <ExternalLink className="h-3 w-3" />
                                              </a>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                )
              })}
              <tfoot className="border-t bg-zinc-50 font-medium">
                <tr>
                  <td className="px-2 py-3"></td>
                  <td className="px-4 py-3">Gesamt</td>
                  <td className="px-4 py-3 text-right">{payouts.reduce((s, p) => s + p.total_items_sold, 0)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(payouts.reduce((s, p) => s + p.gross_revenue, 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(payouts.reduce((s, p) => s + p.net_payout, 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(payouts.reduce((s, p) => s + p.vat_on_payout, 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalEarned)}</td>
                  <td className="px-4 py-3" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
