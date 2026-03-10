"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Search } from "lucide-react"
import type { ShopifyOrder, OrderLineItem } from "@/types/database"

type Tab = "orders" | "unmatched"

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>("orders")
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [unmatched, setUnmatched] = useState<(OrderLineItem & { shopify_orders: { order_name: string; created_at_shopify: string } })[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [unmatchedCount, setUnmatchedCount] = useState(0)

  useEffect(() => {
    async function load() {
      const [ordersRes, unmatchedRes, unmatchedCountRes] = await Promise.all([
        supabase
          .from("shopify_orders")
          .select("*")
          .order("created_at_shopify", { ascending: false })
          .limit(200),
        supabase
          .from("order_line_items")
          .select("*, shopify_orders(order_name, created_at_shopify)")
          .is("artist_id", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("order_line_items")
          .select("id", { count: "exact", head: true })
          .is("artist_id", null),
      ])

      setOrders(ordersRes.data || [])
      setUnmatched(unmatchedRes.data as typeof unmatched || [])
      setUnmatchedCount(unmatchedCountRes.count || 0)
      setLoading(false)
    }
    load()
  }, [])

  const filteredOrders = orders.filter((o) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (o.order_name || "").toLowerCase().includes(q) ||
      (o.customer_name || "").toLowerCase().includes(q) ||
      (o.customer_email || "").toLowerCase().includes(q)
    )
  })

  const filteredUnmatched = unmatched.filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (item.sku || "").toLowerCase().includes(q) ||
      (item.title || "").toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Bestellungen</h1>
        <div className="h-96 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bestellungen</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-zinc-50 p-1 w-fit">
        <button
          onClick={() => setTab("orders")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "orders" ? "bg-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Bestellungen ({orders.length})
        </button>
        <button
          onClick={() => setTab("unmatched")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "unmatched" ? "bg-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Nicht zugeordnet ({unmatchedCount})
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder={tab === "orders" ? "Bestellung, Kunde suchen..." : "SKU oder Produkt suchen..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border px-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
        />
      </div>

      {tab === "orders" ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Bestellung</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Kunde</th>
                <th className="px-4 py-3 font-medium text-right">Betrag</th>
                <th className="px-4 py-3 font-medium">Zahlungsstatus</th>
                <th className="px-4 py-3 font-medium">Versand</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOrders.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium">{o.order_name}</td>
                  <td className="px-4 py-3">{formatDate(o.created_at_shopify)}</td>
                  <td className="px-4 py-3">
                    <p>{o.customer_name || "–"}</p>
                    {o.customer_email && (
                      <p className="text-xs text-zinc-400">{o.customer_email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(o.total_price)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.financial_status === "paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : o.financial_status === "refunded"
                          ? "bg-red-100 text-red-700"
                          : o.financial_status === "partially_refunded"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {o.financial_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500">
                      {o.fulfillment_status || "unfulfilled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Bestellung</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Produkt</th>
                <th className="px-4 py-3 font-medium">Variante</th>
                <th className="px-4 py-3 font-medium text-right">Menge</th>
                <th className="px-4 py-3 font-medium text-right">Preis</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUnmatched.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">{item.shopify_orders?.order_name || "–"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.sku || <span className="text-zinc-400 italic">kein SKU</span>}</td>
                  <td className="px-4 py-3">{item.title || "–"}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{item.variant_title || "–"}</td>
                  <td className="px-4 py-3 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
