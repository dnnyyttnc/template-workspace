#!/usr/bin/env python3
"""
Calculate Monthly Artist Payouts

Aggregates order line items from Supabase for a given month and
calculates the payout per artist. Considers:
- Artist's VAT liability (MwSt-pflichtig)
- Refunded items
- 14-day return window (orders from month X are paid out after the 14th of month X+1)
- Both exe and external products

Usage:
    python execution/calculate_monthly_payouts.py --month 2026-02
    python execution/calculate_monthly_payouts.py --month 2026-02 --dry-run
"""

import os
import sys
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
}


def sb_get(endpoint, params=None):
    """Make a GET request to Supabase REST API with pagination."""
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    all_data = []
    offset = 0
    limit = 1000

    while True:
        full_params = params or ""
        sep = "&" if "?" not in endpoint and full_params else "&"
        page_url = f"{url}{'?' if '?' not in url else ''}{full_params}{sep}offset={offset}&limit={limit}"

        resp = requests.get(page_url, headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        })

        if resp.status_code != 200:
            print(f"Error fetching {endpoint}: {resp.status_code} - {resp.text[:200]}")
            return all_data

        batch = resp.json()
        all_data.extend(batch)

        if len(batch) < limit:
            break
        offset += limit

    return all_data


def fetch_artists():
    """Fetch all artists with their VAT status."""
    data = sb_get("artists?select=id,name,slug,is_vat_liable,status")
    return {a["id"]: a for a in data}


def fetch_line_items_for_month(year, month):
    """Fetch all order line items for orders created in a specific month."""
    # Calculate date range
    from_date = datetime(year, month, 1)
    if month == 12:
        to_date = datetime(year + 1, 1, 1)
    else:
        to_date = datetime(year, month + 1, 1)

    from_iso = from_date.isoformat()
    to_iso = to_date.isoformat()

    # First fetch orders for this month
    orders = sb_get(
        f"shopify_orders?select=shopify_order_id,financial_status,cancelled_at"
        f"&created_at_shopify=gte.{from_iso}&created_at_shopify=lt.{to_iso}"
    )

    if not orders:
        return []

    # Filter out cancelled/voided orders
    valid_order_ids = []
    refunded_order_ids = set()

    for o in orders:
        if o.get("cancelled_at"):
            continue
        valid_order_ids.append(o["shopify_order_id"])
        if o.get("financial_status") in ("refunded", "partially_refunded"):
            refunded_order_ids.add(o["shopify_order_id"])

    if not valid_order_ids:
        return []

    # Fetch line items for these orders
    # PostgREST uses 'in' filter
    all_line_items = []

    # Batch the order IDs to avoid URL length limits
    batch_size = 50
    for i in range(0, len(valid_order_ids), batch_size):
        batch_ids = valid_order_ids[i:i + batch_size]
        ids_str = ",".join(str(oid) for oid in batch_ids)
        items = sb_get(
            f"order_line_items?select=*"
            f"&shopify_order_id=in.({ids_str})"
        )
        all_line_items.extend(items)

    return all_line_items


def calculate_payouts(line_items, artists):
    """Calculate payout per artist from line items."""
    artist_payouts = defaultdict(lambda: {
        "total_orders": set(),
        "total_items_sold": 0,
        "gross_revenue": Decimal("0"),
        "net_payout": Decimal("0"),
        "refund_deductions": Decimal("0"),
        "exe_commission_total": Decimal("0"),
        "items": [],
        "unmatched_items": [],
    })

    unmatched_total = 0

    for item in line_items:
        artist_id = item.get("artist_id")
        sku = item.get("sku", "")
        quantity = item.get("quantity", 1)
        payout_net = item.get("artist_payout_net")
        price = item.get("price", 0)
        is_refunded = item.get("is_refunded", False)
        refunded_qty = item.get("refunded_quantity", 0)
        order_id = item.get("shopify_order_id")

        if not artist_id or payout_net is None:
            unmatched_total += 1
            continue

        payout = artist_payouts[artist_id]
        payout["total_orders"].add(order_id)

        # Calculate effective quantity (after refunds)
        effective_qty = quantity - refunded_qty
        if effective_qty <= 0:
            # Fully refunded
            refund_amount = Decimal(str(payout_net)) * Decimal(str(quantity))
            payout["refund_deductions"] += refund_amount
            continue

        payout["total_items_sold"] += effective_qty
        payout["gross_revenue"] += Decimal(str(price)) * Decimal(str(effective_qty))

        item_payout = Decimal(str(payout_net)) * Decimal(str(effective_qty))
        payout["net_payout"] += item_payout

        # Track refund deductions (partial refunds)
        if refunded_qty > 0:
            refund_amount = Decimal(str(payout_net)) * Decimal(str(refunded_qty))
            payout["refund_deductions"] += refund_amount

        payout["items"].append({
            "sku": sku,
            "title": item.get("title", ""),
            "quantity": effective_qty,
            "price": price,
            "payout_per_unit": payout_net,
            "payout_total": float(item_payout),
            "line_item_id": item.get("id"),
        })

    # Post-process: round and calculate totals
    results = {}
    for artist_id, payout in artist_payouts.items():
        artist = artists.get(artist_id, {})
        net = payout["net_payout"].quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # VAT handling: if artist is VAT-liable, add 19% on top of net payout
        vat_on_payout = Decimal("0")
        if artist.get("is_vat_liable"):
            vat_on_payout = (net * Decimal("0.19")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        total_payout = net + vat_on_payout

        results[artist_id] = {
            "artist_id": artist_id,
            "artist_name": artist.get("name", "Unknown"),
            "artist_slug": artist.get("slug", ""),
            "is_vat_liable": artist.get("is_vat_liable", False),
            "total_orders": len(payout["total_orders"]),
            "total_items_sold": payout["total_items_sold"],
            "gross_revenue": float(payout["gross_revenue"].quantize(Decimal("0.01"))),
            "net_payout": float(net),
            "vat_on_payout": float(vat_on_payout),
            "total_payout": float(total_payout),
            "refund_deductions": float(payout["refund_deductions"].quantize(Decimal("0.01"))),
            "items": payout["items"],
        }

    if unmatched_total:
        print(f"\nWARNING: {unmatched_total} line items had no artist/payout match (missing SKU mapping)")

    return results


def save_payouts_to_supabase(payouts, year, month, dry_run=False):
    """Save calculated payouts to the monthly_payouts table."""
    month_date = f"{year}-{month:02d}-01"
    saved = 0

    for artist_id, payout in payouts.items():
        record = {
            "artist_id": artist_id,
            "month": month_date,
            "total_orders": payout["total_orders"],
            "total_items_sold": payout["total_items_sold"],
            "gross_revenue": payout["gross_revenue"],
            "net_payout": payout["net_payout"],
            "vat_on_payout": payout["vat_on_payout"],
            "total_payout": payout["total_payout"],
            "refund_deductions": payout["refund_deductions"],
            "status": "pending",
        }

        if dry_run:
            print(f"  [DRY RUN] {payout['artist_name']}: {payout['total_payout']:.2f} EUR")
            saved += 1
            continue

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/monthly_payouts",
            headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates"},
            json=record,
        )

        if resp.status_code in (200, 201):
            saved += 1
            print(f"  Saved: {payout['artist_name']}: {payout['total_payout']:.2f} EUR")
        else:
            print(f"  Error saving payout for {payout['artist_name']}: {resp.status_code} - {resp.text[:200]}")

    return saved


def print_summary(payouts, year, month):
    """Print a formatted summary of the monthly payouts."""
    print(f"\n{'=' * 70}")
    print(f"  ARTIST PAYOUTS - {month:02d}/{year}")
    print(f"{'=' * 70}")
    print(f"{'Artist':<30} {'Items':>6} {'Revenue':>10} {'Payout':>10} {'MwSt':>8} {'Total':>10}")
    print(f"{'-' * 70}")

    total_items = 0
    total_revenue = 0
    total_net = 0
    total_vat = 0
    total_total = 0

    sorted_payouts = sorted(payouts.values(), key=lambda p: p["total_payout"], reverse=True)

    for p in sorted_payouts:
        vat_marker = " *" if p["is_vat_liable"] else ""
        print(
            f"{p['artist_name'][:29]:<30} "
            f"{p['total_items_sold']:>6} "
            f"{p['gross_revenue']:>9.2f}€ "
            f"{p['net_payout']:>9.2f}€ "
            f"{p['vat_on_payout']:>7.2f}€ "
            f"{p['total_payout']:>9.2f}€{vat_marker}"
        )
        total_items += p["total_items_sold"]
        total_revenue += p["gross_revenue"]
        total_net += p["net_payout"]
        total_vat += p["vat_on_payout"]
        total_total += p["total_payout"]

    print(f"{'-' * 70}")
    print(
        f"{'TOTAL':<30} "
        f"{total_items:>6} "
        f"{total_revenue:>9.2f}€ "
        f"{total_net:>9.2f}€ "
        f"{total_vat:>7.2f}€ "
        f"{total_total:>9.2f}€"
    )
    print(f"\n* = MwSt-pflichtig (19% auf Netto-Auszahlung)")

    # Check return window
    now = datetime.now()
    if month == 12:
        payout_earliest = datetime(year + 1, 1, 14)
    else:
        payout_earliest = datetime(year, month + 1, 14)

    if now < payout_earliest:
        days_left = (payout_earliest - now).days
        print(f"\n14-Tage-Rückgabefrist: Auszahlung frühestens am {payout_earliest.strftime('%d.%m.%Y')} ({days_left} Tage)")
    else:
        print(f"\n14-Tage-Rückgabefrist abgelaufen. Auszahlung möglich!")


def main():
    dry_run = "--dry-run" in sys.argv

    # Parse month argument
    if "--month" not in sys.argv:
        print("Usage: python execution/calculate_monthly_payouts.py --month YYYY-MM")
        sys.exit(1)

    idx = sys.argv.index("--month")
    month_str = sys.argv[idx + 1]
    year, month = map(int, month_str.split("-"))

    print("=" * 60)
    print("MONTHLY PAYOUT CALCULATION")
    print(f"Month: {month:02d}/{year}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 60)

    # Fetch artists
    print("\nFetching artists...")
    artists = fetch_artists()
    print(f"Loaded {len(artists)} artists")

    # Fetch line items for the month
    print(f"\nFetching line items for {month:02d}/{year}...")
    line_items = fetch_line_items_for_month(year, month)
    print(f"Found {len(line_items)} line items")

    if not line_items:
        print("\nNo line items found for this month. Nothing to calculate.")
        return

    # Calculate payouts
    print("\nCalculating payouts...")
    payouts = calculate_payouts(line_items, artists)

    if not payouts:
        print("No payouts to calculate (all items may be unmatched).")
        return

    # Print summary
    print_summary(payouts, year, month)

    # Save to Supabase
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Saving to Supabase...")
    saved = save_payouts_to_supabase(payouts, year, month, dry_run=dry_run)
    print(f"Saved {saved} payout records")

    # Save detailed report to .tmp
    report_file = Path(__file__).parent.parent / ".tmp" / f"payout_{year}_{month:02d}.json"
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_data = {
        "month": f"{year}-{month:02d}",
        "generated_at": datetime.now().isoformat(),
        "artists": {k: {**v, "items": v["items"]} for k, v in payouts.items()},
        "summary": {
            "total_artists": len(payouts),
            "total_items": sum(p["total_items_sold"] for p in payouts.values()),
            "total_net_payout": sum(p["net_payout"] for p in payouts.values()),
            "total_vat": sum(p["vat_on_payout"] for p in payouts.values()),
            "total_payout": sum(p["total_payout"] for p in payouts.values()),
        },
    }
    report_file.write_text(json.dumps(report_data, indent=2, ensure_ascii=False, default=str))
    print(f"\nDetailed report saved to: {report_file}")


if __name__ == "__main__":
    main()
