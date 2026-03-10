import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function formatMonth(monthStr: string): string {
  const d = new Date(monthStr + "-01")
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
}

export function getMonthRange(monthStr: string): { from: string; to: string } {
  const [year, month] = monthStr.split("-").map(Number)
  const from = new Date(year, month - 1, 1).toISOString()
  const nextMonth = month === 12 ? new Date(year + 1, 0, 1) : new Date(year, month, 1)
  const to = nextMonth.toISOString()
  return { from, to }
}

export function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return months
}

export function maskIban(iban: string | null): string {
  if (!iban) return "–"
  const clean = iban.replace(/\s/g, "")
  if (clean.length < 8) return "****"
  return clean.slice(0, 4) + " **** **** " + clean.slice(-4)
}

export function airtableLink(recordId: string): string {
  const baseId = "appTAaFU6WJ5ZK2QB"
  const interfaceId = "pagjIjVeY2lyn4kUJ"
  const homePageId = "pagOzydz0kM2E2grV"
  return `https://airtable.com/${baseId}/${interfaceId}/${recordId}?home=${homePageId}`
}

export function shopifyOrdersLink(monthStr: string): string {
  const store = "exe-ist-shop"
  const [year, month] = monthStr.split("-").map(Number)
  const from = `${year}-${String(month).padStart(2, "0")}-01`
  const toMonth = month === 12 ? 1 : month + 1
  const toYear = month === 12 ? year + 1 : year
  const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`
  // Shopify admin search syntax: created_at:>=DATE created_at:<DATE
  const query = `created_at:>=${from} created_at:<${to}`
  return `https://admin.shopify.com/store/${store}/orders?query=${encodeURIComponent(query)}`
}

export function shopifyOrderLink(orderName: string): string {
  const store = "exe-ist-shop"
  // orderName is like "#1234", search for it in Shopify admin
  return `https://admin.shopify.com/store/${store}/orders?query=${encodeURIComponent(orderName)}`
}

export function shopifyOrdersForArtistLink(monthStr: string, artistName: string): string {
  const store = "exe-ist-shop"
  const [year, month] = monthStr.split("-").map(Number)
  const from = `${year}-${String(month).padStart(2, "0")}-01`
  const toMonth = month === 12 ? 1 : month + 1
  const toYear = month === 12 ? year + 1 : year
  const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`
  const query = `created_at:>=${from} created_at:<${to} ${artistName}`
  return `https://admin.shopify.com/store/${store}/orders?query=${encodeURIComponent(query)}`
}
