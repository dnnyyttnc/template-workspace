"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { formatCurrency, airtableLink } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Search, ExternalLink, RefreshCw } from "lucide-react"
import type { ProductVariantWithArtist } from "@/types/database"

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductVariantWithArtist[]>([])
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "exe" | "external">("all")
  const [missingOnly, setMissingOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("product_variants")
        .select("*, artists(name, slug)")
        .order("product_name")

      setProducts((data as ProductVariantWithArtist[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  async function resync() {
    setSyncing(true)
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "airtable" }),
      })
      window.location.reload()
    } finally {
      setSyncing(false)
    }
  }

  const filtered = products.filter((p) => {
    if (search) {
      const q = search.toLowerCase()
      const match =
        p.sku.toLowerCase().includes(q) ||
        (p.product_name || "").toLowerCase().includes(q) ||
        (p.artists?.name || "").toLowerCase().includes(q)
      if (!match) return false
    }
    if (typeFilter !== "all" && p.product_type !== typeFilter) return false
    if (missingOnly && p.artist_payout_net !== null) return false
    return true
  })

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Produkte</h1>
        <div className="h-96 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produkte ({products.length})</h1>
        <Button variant="outline" size="sm" onClick={resync} disabled={syncing}>
          <RefreshCw className={`mr-2 h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisiere..." : "Airtable Sync"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="SKU, Produkt oder Artist suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border px-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">Alle Typen</option>
          <option value="exe">exe</option>
          <option value="external">external</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(e) => setMissingOnly(e.target.checked)}
            className="rounded"
          />
          Nur fehlende Auszahlung
        </label>
      </div>

      <p className="text-sm text-zinc-500">{filtered.length} Ergebnisse</p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Produkt</th>
              <th className="px-4 py-3 font-medium">Artist</th>
              <th className="px-4 py-3 font-medium">Typ</th>
              <th className="px-4 py-3 font-medium text-right">Preis (brutto)</th>
              <th className="px-4 py-3 font-medium text-right">Artist Auszahlung</th>
              <th className="px-4 py-3 font-medium text-right">exe Provision</th>
              <th className="px-4 py-3 font-medium">Airtable</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3">{p.product_name || "–"}</td>
                <td className="px-4 py-3">{p.artists?.name || <span className="text-zinc-400">–</span>}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.product_type === "exe"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {p.product_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {p.retail_price ? formatCurrency(p.retail_price) : "–"}
                </td>
                <td className={`px-4 py-3 text-right ${!p.artist_payout_net ? "text-amber-500" : ""}`}>
                  {p.artist_payout_net ? formatCurrency(p.artist_payout_net) : "Fehlt"}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.exe_commission ? formatCurrency(p.exe_commission) : "–"}
                </td>
                <td className="px-4 py-3">
                  {(p.airtable_class_id || p.airtable_variant_id) ? (
                    <a
                      href={airtableLink(p.airtable_class_id || p.airtable_variant_id!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-400 hover:text-zinc-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="text-zinc-300">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
