"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { formatCurrency } from "@/lib/utils"
import { Search, AlertCircle, CheckCircle2, Mail } from "lucide-react"
import type { Artist } from "@/types/database"

interface ArtistRow extends Artist {
  artist_payment_info: { id: string; payout_method: string | null }[]
  product_variants: { id: string }[]
  monthly_payouts: { total_payout: number }[]
}

export default function ArtistsPage() {
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("artists")
        .select("*, artist_payment_info(id, payout_method), product_variants(id), monthly_payouts(total_payout)")
        .order("name")

      setArtists((data as ArtistRow[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = artists.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.slug.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Artists</h1>
        <div className="h-96 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Artists ({artists.length})</h1>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Artist suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border px-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Produkte</th>
              <th className="px-4 py-3 font-medium text-right">Gesamtumsatz</th>
              <th className="px-4 py-3 font-medium">Zahlungsart</th>
              <th className="px-4 py-3 font-medium">MwSt</th>
              <th className="px-4 py-3 font-medium">Daten komplett</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((a) => {
              const hasPayment = a.artist_payment_info && a.artist_payment_info.length > 0
              const totalEarned = a.monthly_payouts?.reduce((s, p) => s + (p.total_payout || 0), 0) || 0
              const productCount = a.product_variants?.length || 0
              const paymentMethod = hasPayment ? a.artist_payment_info[0].payout_method : null

              return (
                <tr key={a.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/artists/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <p className="text-xs text-zinc-400">{a.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{productCount}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalEarned)}</td>
                  <td className="px-4 py-3">
                    {paymentMethod ? (
                      <span className="text-xs capitalize">{paymentMethod}</span>
                    ) : (
                      <span className="text-xs text-zinc-400">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.is_vat_liable ? (
                      <span className="text-xs text-amber-600">Ja (19%)</span>
                    ) : (
                      <span className="text-xs text-zinc-400">Nein</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.onboarding_status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : a.onboarding_status === "invited" ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-blue-600">Eingeladen</span>
                      </span>
                    ) : hasPayment ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
