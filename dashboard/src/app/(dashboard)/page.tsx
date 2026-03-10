"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatMonth, getLastNMonths } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/StatusBadge"
import { AlertTriangle, ArrowRight, Package, Users, Receipt } from "lucide-react"
import type { MonthSummary } from "@/types/database"

export default function DashboardHome() {
  const [months, setMonths] = useState<MonthSummary[]>([])
  const [stats, setStats] = useState({ artists: 0, products: 0, unmatchedSkus: 0, missingPayment: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const last6 = getLastNMonths(6)

      // Fetch monthly payout summaries
      const { data: payouts } = await supabase
        .from("monthly_payouts")
        .select("month, total_payout, total_items_sold, status, artist_id")
        .in("month", last6.map((m) => m + "-01"))
        .order("month", { ascending: false })

      // Aggregate by month
      const monthMap: Record<string, MonthSummary> = {}
      for (const m of last6) {
        monthMap[m] = {
          month: m,
          total_artists: 0,
          total_items: 0,
          total_payout: 0,
          total_pending: 0,
          total_approved: 0,
          total_paid: 0,
        }
      }

      if (payouts) {
        for (const p of payouts) {
          const key = p.month.slice(0, 7) // "2026-02-01" → "2026-02"
          if (!monthMap[key]) continue
          monthMap[key].total_artists++
          monthMap[key].total_items += p.total_items_sold
          monthMap[key].total_payout += p.total_payout
          if (p.status === "pending") monthMap[key].total_pending++
          if (p.status === "approved") monthMap[key].total_approved++
          if (p.status === "paid") monthMap[key].total_paid++
        }
      }

      setMonths(last6.map((m) => monthMap[m]))

      // Fetch quick stats
      const [artistRes, productRes, unmatchedRes, paymentRes] = await Promise.all([
        supabase.from("artists").select("id", { count: "exact", head: true }),
        supabase.from("product_variants").select("id", { count: "exact", head: true }),
        supabase
          .from("order_line_items")
          .select("id", { count: "exact", head: true })
          .is("artist_id", null),
        supabase
          .from("artists")
          .select("id, artist_payment_info(id)")
          .eq("status", "active"),
      ])

      const missingPayment = paymentRes.data
        ? paymentRes.data.filter(
            (a: { id: string; artist_payment_info: { id: string }[] }) =>
              !a.artist_payment_info || a.artist_payment_info.length === 0
          ).length
        : 0

      setStats({
        artists: artistRes.count || 0,
        products: productRes.count || 0,
        unmatchedSkus: unmatchedRes.count || 0,
        missingPayment,
      })

      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Warning banners */}
      {stats.missingPayment > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{stats.missingPayment} Artists</strong> haben keine Zahlungsinformationen hinterlegt.
          </span>
          <Link href="/artists" className="ml-auto font-medium underline">
            Anzeigen
          </Link>
        </div>
      )}

      {stats.unmatchedSkus > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <Package className="h-4 w-4 shrink-0" />
          <span>
            <strong>{stats.unmatchedSkus}</strong> Positionen ohne Artist-Zuordnung (fehlende SKU).
          </span>
          <Link href="/orders" className="ml-auto font-medium underline">
            Anzeigen
          </Link>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
              <Users className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.artists}</p>
              <p className="text-sm text-zinc-500">Artists</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
              <Package className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.products}</p>
              <p className="text-sm text-zinc-500">Produkte</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
              <Receipt className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(months.reduce((sum, m) => sum + m.total_payout, 0))}
              </p>
              <p className="text-sm text-zinc-500">Gesamt (6 Monate)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Monatliche Auszahlungen</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {months.map((m) => (
            <Link key={m.month} href={`/payouts/${m.month}`}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{formatMonth(m.month)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {m.total_artists === 0 ? (
                    <p className="text-sm text-zinc-400">Keine Daten</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold">{formatCurrency(m.total_payout)}</p>
                      <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <span>{m.total_artists} Artists</span>
                        <span>·</span>
                        <span>{m.total_items} Artikel</span>
                      </div>
                      <div className="flex gap-1.5">
                        {m.total_pending > 0 && <StatusBadge status="pending" />}
                        {m.total_approved > 0 && <StatusBadge status="approved" />}
                        {m.total_paid > 0 && <StatusBadge status="paid" />}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center text-xs text-zinc-400">
                    Details <ArrowRight className="ml-1 h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
