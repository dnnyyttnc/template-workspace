"use client"

import { cn } from "@/lib/utils"

const statusConfig = {
  pending: { label: "Offen", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Freigegeben", className: "bg-blue-100 text-blue-800" },
  paid: { label: "Bezahlt", className: "bg-emerald-100 text-emerald-800" },
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    className: "bg-zinc-100 text-zinc-600",
  }

  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  )
}
