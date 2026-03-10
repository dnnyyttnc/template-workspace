"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatMonth } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"

interface MonthRow {
  month: string
  artists: number
  items: number
  total: number
  pending: number
  approved: number
  paid: number
}

export default function PayoutsIndexPage() {
  const [months, setMonths] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("monthly_payouts")
        .select("month, total_payout, total_items_sold, status")
        .order("month", { ascending: false })

      if (!data) { setLoading(false); return }

      const map: Record<string, MonthRow> = {}
      for (const p of data) {
        const key = p.month.slice(0, 7)
        if (!map[key]) {
          map[key] = { month: key, artists: 0, items: 0, total: 0, pending: 0, approved: 0, paid: 0 }
        }
        map[key].artists++
        map[key].items += p.total_items_sold
        map[key].total += p.total_payout
        if (p.status === "pending") map[key].pending++
        if (p.status === "approved") map[key].approved++
        if (p.status === "paid") map[key].paid++
      }

      setMonths(Object.values(map))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Auszahlungen</h1>
        <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Auszahlungen</h1>

      {months.length === 0 ? (
        <p className="text-sm text-zinc-500">Noch keine Auszahlungsdaten vorhanden.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Monat</th>
                <th className="px-4 py-3 font-medium text-right">Artists</th>
                <th className="px-4 py-3 font-medium text-right">Artikel</th>
                <th className="px-4 py-3 font-medium text-right">Gesamt</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {months.map((m) => (
                <tr key={m.month} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/payouts/${m.month}`} className="font-medium hover:underline">
                      {formatMonth(m.month)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">{m.artists}</td>
                  <td className="px-4 py-3 text-right">{m.items}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(m.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {m.pending > 0 && <StatusBadge status="pending" />}
                      {m.approved > 0 && <StatusBadge status="approved" />}
                      {m.paid > 0 && <StatusBadge status="paid" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
