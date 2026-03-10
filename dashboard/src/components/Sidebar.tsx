"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Receipt,
  Users,
  Package,
  ShoppingCart,
  RefreshCw,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Auszahlungen", href: "/payouts", icon: Receipt },
  { name: "Artists", href: "/artists", icon: Users },
  { name: "Produkte", href: "/products", icon: Package },
  { name: "Bestellungen", href: "/orders", icon: ShoppingCart },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-white">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white text-xs font-bold">
          exe
        </div>
        <span className="text-lg font-semibold">Auszahlung</span>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 border-t p-3">
        <button
          onClick={() => fetch("/api/sync", { method: "POST" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Daten synchronisieren
        </button>
      </div>
    </aside>
  )
}
