"use client"

import { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatMonth, airtableLink, shopifyOrdersLink, shopifyOrderLink } from "@/lib/utils"
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
  UserRoundPen,
  X,
  Loader2,
  Search,
} from "lucide-react"
import type { MonthlyPayoutWithArtist, Artist } from "@/types/database"

interface LineItem {
  id: string
  sku: string | null
  title: string | null
  variant_title: string | null
  quantity: number
  price: number
  artist_id: string | null
  artist_payout_net: number | null
  refunded_quantity: number
  is_refunded: boolean
  product_variant_id: string | null
  shopify_order_id: number
  product_variants: { airtable_variant_id: string | null; airtable_class_id: string | null; product_name: string | null } | null
  shopify_orders: { order_name: string; created_at_shopify: string } | null
}

// Searchable artist picker component
function ArtistPicker({
  artists,
  excludeId,
  onSelect,
  onCancel,
}: {
  artists: Pick<Artist, "id" | "name" | "slug">[]
  excludeId: string
  onSelect: (artistId: string) => void
  onCancel: () => void
}) {
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = artists.filter(
    (a) =>
      a.id !== excludeId &&
      (a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.slug.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded border bg-white shadow-lg">
        <Search className="ml-1.5 h-3 w-3 text-zinc-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Artist suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-28 rounded py-1 pr-1 text-xs focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel()
            if (e.key === "Enter" && filtered.length === 1) onSelect(filtered[0].id)
          }}
        />
        <button onClick={onCancel} className="pr-1.5 text-zinc-400 hover:text-zinc-600">
          <X className="h-3 w-3" />
        </button>
      </div>
      {search.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-56 overflow-auto rounded border bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-400">Kein Artist gefunden</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 transition-colors"
              >
                <span className="font-medium">{a.name}</span>
                <span className="ml-1 text-zinc-400">{a.slug}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function PayoutMonthPage() {
  const params = useParams<{ month: string }>()
  const month = params.month
  const [payouts, setPayouts] = useState<MonthlyPayoutWithArtist[]>([])
  const [lineItems, setLineItems] = useState<Record<string, LineItem[]>>({})
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [allArtists, setAllArtists] = useState<Pick<Artist, "id" | "name" | "slug">[]>([])
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [savingItem, setSavingItem] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from("monthly_payouts")
      .select("*, artists(name, slug, is_vat_liable, email)")
      .eq("month", month + "-01")
      .order("total_payout", { ascending: false })

    setPayouts((data as MonthlyPayoutWithArtist[]) || [])
    setLoading(false)
  }

  async function loadArtists() {
    if (allArtists.length > 0) return
    const { data } = await supabase
      .from("artists")
      .select("id, name, slug")
      .order("name")
    setAllArtists(data || [])
  }

  // Get order IDs for this month (cached)
  const [monthOrderIds, setMonthOrderIds] = useState<number[] | null>(null)

  async function getMonthOrderIds(): Promise<number[]> {
    if (monthOrderIds) return monthOrderIds

    const [y, m] = month.split("-").map(Number)
    const fromDate = new Date(y, m - 1, 1).toISOString()
    const toDate = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1).toISOString()

    const { data: orders } = await supabase
      .from("shopify_orders")
      .select("shopify_order_id")
      .gte("created_at_shopify", fromDate)
      .lt("created_at_shopify", toDate)

    const ids = (orders || []).map((o) => o.shopify_order_id)
    setMonthOrderIds(ids)
    return ids
  }

  async function fetchLineItems(artistId: string): Promise<LineItem[]> {
    const orderIds = await getMonthOrderIds()
    if (orderIds.length === 0) return []

    const { data: items } = await supabase
      .from("order_line_items")
      .select("*, product_variants(airtable_variant_id, airtable_class_id, product_name), shopify_orders(order_name, created_at_shopify)")
      .eq("artist_id", artistId)
      .in("shopify_order_id", orderIds)
      .order("created_at", { ascending: false })

    return (items as unknown as LineItem[]) || []
  }

  async function loadLineItems(artistId: string, forceReload = false) {
    if (!forceReload && lineItems[artistId] !== undefined) return

    setLoadingItems((prev) => new Set(prev).add(artistId))
    const items = await fetchLineItems(artistId)
    setLineItems((prev) => ({ ...prev, [artistId]: items }))
    setLoadingItems((prev) => {
      const next = new Set(prev)
      next.delete(artistId)
      return next
    })
  }

  function toggleExpand(artistId: string) {
    const next = new Set(expanded)
    if (next.has(artistId)) {
      next.delete(artistId)
    } else {
      next.add(artistId)
      loadLineItems(artistId)
      loadArtists()
    }
    setExpanded(next)
  }

  async function reassignArtist(lineItemId: string, newArtistId: string, currentArtistId: string) {
    setSavingItem(lineItemId)
    try {
      const res = await fetch(`/api/line-item/${lineItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: newArtistId }),
      })
      if (res.ok) {
        setEditingItem(null)

        // Recalculate payouts so the overview table updates
        await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month }),
        })

        // Reload the payout overview
        await load()

        // Force reload line items for both old and new artist
        await loadLineItems(currentArtistId, true)
        if (expanded.has(newArtistId)) {
          await loadLineItems(newArtistId, true)
        }
      } else {
        const err = await res.json()
        alert(`Fehler: ${err.error || "Unbekannter Fehler"}`)
      }
    } finally {
      setSavingItem(null)
    }
  }

  useEffect(() => {
    load()
  }, [month])

  async function updateStatus(id: string, status: "approved" | "paid") {
    const res = await fetch(`/api/payout/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) load()
  }

  async function bulkUpdateStatus(status: "approved" | "paid") {
    const pending = payouts.filter((p) =>
      status === "approved" ? p.status === "pending" : p.status === "approved"
    )
    for (const p of pending) {
      await fetch(`/api/payout/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    }
    load()
  }

  async function calculate() {
    setCalculating(true)
    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      })
      if (res.ok) load()
    } finally {
      setCalculating(false)
    }
  }

  const totals = payouts.reduce(
    (acc, p) => ({
      items: acc.items + p.total_items_sold,
      revenue: acc.revenue + p.gross_revenue,
      net: acc.net + p.net_payout,
      vat: acc.vat + p.vat_on_payout,
      total: acc.total + p.total_payout,
    }),
    { items: 0, revenue: 0, net: 0, vat: 0, total: 0 }
  )

  // 14-day return window check
  const [y, m] = month.split("-").map(Number)
  const payoutEarliest = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 14)
  const canPayout = new Date() >= payoutEarliest
  const daysLeft = Math.max(0, Math.ceil((payoutEarliest.getTime() - Date.now()) / 86400000))

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/payouts" className="text-zinc-400 hover:text-zinc-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">Auszahlungen {formatMonth(month)}</h1>
        </div>
        <a
          href={shopifyOrdersLink(month)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <ShoppingBag className="h-4 w-4" />
          In Shopify anzeigen
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {!canPayout && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          14-Tage-Rückgabefrist: Auszahlung frühestens am{" "}
          <strong>{payoutEarliest.toLocaleDateString("de-DE")}</strong> ({daysLeft} Tage)
        </div>
      )}

      {payouts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-zinc-500">Keine Auszahlungsdaten für diesen Monat.</p>
            <Button onClick={calculate} disabled={calculating}>
              <Calculator className="mr-2 h-4 w-4" />
              {calculating ? "Berechne..." : "Jetzt berechnen"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-zinc-500">Artists</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{payouts.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-zinc-500">Artikel</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totals.items}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-zinc-500">Umsatz (brutto)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(totals.revenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-zinc-500">Auszahlung gesamt</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(totals.total)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Bulk actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkUpdateStatus("approved")}
              disabled={!payouts.some((p) => p.status === "pending")}
            >
              <Check className="mr-1 h-3 w-3" />
              Alle freigeben
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkUpdateStatus("paid")}
              disabled={!payouts.some((p) => p.status === "approved")}
            >
              <CreditCard className="mr-1 h-3 w-3" />
              Alle als bezahlt markieren
            </Button>
            <Button variant="outline" size="sm" onClick={calculate} disabled={calculating}>
              <Calculator className="mr-1 h-3 w-3" />
              Neu berechnen
            </Button>
          </div>

          {/* Payout table with expandable rows */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-zinc-50 text-left">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-4 py-3 font-medium">Artist</th>
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
                const isExpanded = expanded.has(p.artist_id)
                const items = lineItems[p.artist_id]
                const isLoadingItems = loadingItems.has(p.artist_id)

                return (
                  <tbody key={p.id}>
                    {/* Artist summary row */}
                    <tr
                      className="border-b hover:bg-zinc-50 cursor-pointer"
                      onClick={() => toggleExpand(p.artist_id)}
                    >
                      <td className="px-2 py-3 text-center">
                        {isExpanded ? (
                          <ChevronDown className="mx-auto h-4 w-4 text-zinc-400" />
                        ) : (
                          <ChevronRight className="mx-auto h-4 w-4 text-zinc-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/artists/${p.artist_id}`}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.artists?.name || "Unbekannt"}
                        </Link>
                        {p.artists?.is_vat_liable && (
                          <span className="ml-1 text-xs text-zinc-400">MwSt</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{p.total_items_sold}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.gross_revenue)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.net_payout)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.vat_on_payout)}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(p.total_payout)}
                      </td>
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
                        </div>
                      </td>
                    </tr>

                    {/* Expanded: line item details */}
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
                              Keine Positionen für diesen Artist in diesem Monat.
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
                                    const isEditing = editingItem === item.id
                                    const isSaving = savingItem === item.id

                                    return (
                                      <tr key={item.id} className="border-t border-zinc-100 group">
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
                                          {item.title || "–"}
                                          {item.variant_title && (
                                            <span className="ml-1 text-zinc-400">
                                              ({item.variant_title})
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 pr-4 font-mono">{item.sku || "–"}</td>
                                        <td className="py-2 pr-4 text-right">{effectiveQty}</td>
                                        <td className="py-2 pr-4 text-right">
                                          {formatCurrency(item.price)}
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                          {formatCurrency(itemPayout)}
                                        </td>
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

                                            {/* Artist reassignment */}
                                            {isSaving ? (
                                              <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                                            ) : isEditing ? (
                                              <ArtistPicker
                                                artists={allArtists}
                                                excludeId={p.artist_id}
                                                onSelect={(newId) => reassignArtist(item.id, newId, p.artist_id)}
                                                onCancel={() => setEditingItem(null)}
                                              />
                                            ) : (
                                              <button
                                                onClick={() => setEditingItem(item.id)}
                                                title="Artist zuordnen"
                                                className="text-zinc-300 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                <UserRoundPen className="h-3 w-3" />
                                              </button>
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
                  <td className="px-4 py-3 text-right">{totals.items}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totals.revenue)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totals.net)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totals.vat)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totals.total)}</td>
                  <td className="px-4 py-3" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
