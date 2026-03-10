#!/usr/bin/env python3
"""
Sync Shopify Orders to Supabase

Fetches orders from the Shopify Admin REST API and upserts them
into Supabase (shopify_orders + order_line_items tables).

For each line item, matches the SKU against product_variants in Supabase
to assign the correct artist and payout amount.

Usage:
    python execution/sync_shopify_orders.py                          # Current month
    python execution/sync_shopify_orders.py --month 2026-02          # Specific month
    python execution/sync_shopify_orders.py --from 2026-01-01 --to 2026-03-31  # Date range
    python execution/sync_shopify_orders.py --all                    # All orders
"""

import os
import sys
import time
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

# Config
SHOPIFY_STORE_NAME = os.getenv("SHOPIFY_STORE_NAME", "exe-ist-shop")
SHOPIFY_CLIENT_ID = os.getenv("SHOPIFY_CLIENT_ID")
SHOPIFY_CLIENT_SECRET = os.getenv("SHOPIFY_CLIENT_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

API_VERSION = "2026-01"
SHOPIFY_BASE = f"https://{SHOPIFY_STORE_NAME}.myshopify.com/admin/api/{API_VERSION}"

# Rate limit tracking
BUCKET_MAX = 40
BUCKET_CURRENT = 0
REQUESTS_PER_SECOND = 2

# Token cache for client credentials grant
_token_cache = {"token": None, "expires_at": 0}


def get_shopify_access_token():
    """Get a valid Shopify access token via Client Credentials Grant.

    Tokens expire after 24h. This function caches the token and
    refreshes it automatically 60 seconds before expiry.
    """
    now = time.time()

    # Return cached token if still valid
    if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    if not SHOPIFY_CLIENT_ID or not SHOPIFY_CLIENT_SECRET:
        print("Error: SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set in .env")
        sys.exit(1)

    print("  Fetching new Shopify access token...")
    resp = requests.post(
        f"https://{SHOPIFY_STORE_NAME}.myshopify.com/admin/oauth/access_token",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "client_credentials",
            "client_id": SHOPIFY_CLIENT_ID,
            "client_secret": SHOPIFY_CLIENT_SECRET,
        },
    )

    if resp.status_code != 200:
        print(f"Error getting Shopify token: {resp.status_code} - {resp.text}")
        sys.exit(1)

    data = resp.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 86399)

    print(f"  Token obtained (expires in {data.get('expires_in', 0) // 3600}h)")
    return _token_cache["token"]


def check_config():
    """Verify all required config is present."""
    missing = []
    if not SHOPIFY_CLIENT_ID:
        missing.append("SHOPIFY_CLIENT_ID")
    if not SHOPIFY_CLIENT_SECRET:
        missing.append("SHOPIFY_CLIENT_SECRET")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")

    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        if "SHOPIFY_CLIENT_ID" in missing or "SHOPIFY_CLIENT_SECRET" in missing:
            print("\nTo set up Shopify access (Dev Dashboard):")
            print("  1. Go to https://dev.shopify.com/dashboard")
            print("  2. Create app 'exe Auszahlung Sync' (Start from Dev Dashboard)")
            print("  3. Versions tab: configure scopes read_orders, read_products, read_customers, read_all_orders")
            print("  4. Release the version, then install on exe-ist-shop")
            print("  5. Settings tab: copy Client ID and Client Secret")
            print("  6. Add to .env:")
            print("     SHOPIFY_CLIENT_ID=your-client-id")
            print("     SHOPIFY_CLIENT_SECRET=your-client-secret")
        sys.exit(1)


def shopify_get(endpoint, params=None):
    """Make an authenticated GET request to the Shopify Admin API."""
    global BUCKET_CURRENT

    token = get_shopify_access_token()
    headers = {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    }

    url = f"{SHOPIFY_BASE}/{endpoint}"
    resp = requests.get(url, headers=headers, params=params)

    # Track rate limits
    limit_header = resp.headers.get("X-Shopify-Shop-Api-Call-Limit", "0/40")
    used, total = limit_header.split("/")
    BUCKET_CURRENT = int(used)

    if resp.status_code == 429:
        retry_after = float(resp.headers.get("Retry-After", 2))
        print(f"  Rate limited. Waiting {retry_after}s...")
        time.sleep(retry_after)
        return shopify_get(endpoint, params)

    if resp.status_code != 200:
        print(f"  Shopify API error: {resp.status_code} - {resp.text[:300]}")
        return None, None

    # Throttle if bucket is getting full
    if BUCKET_CURRENT > BUCKET_MAX * 0.8:
        time.sleep(1.0 / REQUESTS_PER_SECOND)

    # Extract pagination link
    link_header = resp.headers.get("Link", "")
    next_url = None
    if 'rel="next"' in link_header:
        for part in link_header.split(","):
            if 'rel="next"' in part:
                next_url = part.split("<")[1].split(">")[0]
                break

    return resp.json(), next_url


def fetch_orders(created_at_min=None, created_at_max=None, status="any"):
    """Fetch all orders for a date range with pagination."""
    all_orders = []
    params = {
        "status": status,
        "limit": 250,
    }
    if created_at_min:
        params["created_at_min"] = created_at_min
    if created_at_max:
        params["created_at_max"] = created_at_max

    print(f"Fetching orders from Shopify...")
    if created_at_min:
        print(f"  From: {created_at_min}")
    if created_at_max:
        print(f"  To: {created_at_max}")

    data, next_url = shopify_get("orders.json", params)
    if not data:
        return all_orders

    orders = data.get("orders", [])
    all_orders.extend(orders)
    print(f"  Page 1: {len(orders)} orders (total: {len(all_orders)})")

    page = 1
    while next_url:
        page += 1
        # For pagination, use the full URL directly
        token = get_shopify_access_token()
        headers = {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
        }
        resp = requests.get(next_url, headers=headers)

        if resp.status_code != 200:
            print(f"  Error on page {page}: {resp.status_code}")
            break

        # Rate limit tracking
        limit_header = resp.headers.get("X-Shopify-Shop-Api-Call-Limit", "0/40")
        used, _ = limit_header.split("/")
        if int(used) > BUCKET_MAX * 0.8:
            time.sleep(1.0 / REQUESTS_PER_SECOND)

        data = resp.json()
        orders = data.get("orders", [])
        all_orders.extend(orders)
        print(f"  Page {page}: {len(orders)} orders (total: {len(all_orders)})")

        # Next page
        link_header = resp.headers.get("Link", "")
        next_url = None
        if 'rel="next"' in link_header:
            for part in link_header.split(","):
                if 'rel="next"' in part:
                    next_url = part.split("<")[1].split(">")[0]
                    break

    return all_orders


def get_sku_to_variant_map():
    """Get mapping of SKU to product_variant (id, artist_id, payout) from Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/product_variants?select=id,sku,artist_id,artist_payout_net,product_type"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }

    # Fetch all (may need pagination for large datasets)
    all_variants = []
    offset = 0
    limit = 1000

    while True:
        resp = requests.get(
            f"{url}&offset={offset}&limit={limit}",
            headers=headers,
        )
        if resp.status_code != 200:
            print(f"Warning: Could not fetch variants: {resp.status_code}")
            break

        batch = resp.json()
        all_variants.extend(batch)
        if len(batch) < limit:
            break
        offset += limit

    return {v["sku"]: v for v in all_variants if v.get("sku")}


def upsert_orders_to_supabase(orders, sku_map):
    """Upsert Shopify orders and line items to Supabase."""
    stats = {
        "orders_upserted": 0,
        "line_items_upserted": 0,
        "skus_matched": 0,
        "skus_unmatched": 0,
        "unmatched_skus": set(),
        "errors": 0,
    }

    sb_headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    for order in orders:
        shopify_order_id = order["id"]
        customer = order.get("customer", {})

        # Build order record
        order_record = {
            "shopify_order_id": shopify_order_id,
            "order_number": str(order.get("order_number", "")),
            "order_name": order.get("name", ""),
            "created_at_shopify": order.get("created_at"),
            "financial_status": order.get("financial_status"),
            "fulfillment_status": order.get("fulfillment_status"),
            "total_price": float(order.get("total_price", 0)),
            "currency": order.get("currency", "EUR"),
            "customer_email": order.get("email") or customer.get("email"),
            "customer_name": f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip() or None,
            "cancelled_at": order.get("cancelled_at"),
            "synced_at": datetime.utcnow().isoformat(),
        }

        # Calculate refund total
        refund_total = 0
        for refund in order.get("refunds", []):
            for txn in refund.get("transactions", []):
                refund_total += float(txn.get("amount", 0))
        order_record["refund_total"] = refund_total

        # Upsert order (on_conflict=shopify_order_id for idempotent re-runs)
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/shopify_orders?on_conflict=shopify_order_id",
            headers=sb_headers,
            json=order_record,
        )

        if resp.status_code not in (200, 201):
            print(f"  Error upserting order {order.get('name')}: {resp.status_code} - {resp.text[:200]}")
            stats["errors"] += 1
            continue

        stats["orders_upserted"] += 1

        # Upsert line items
        refunded_items = {}
        for refund in order.get("refunds", []):
            for item in refund.get("refund_line_items", []):
                li_id = item.get("line_item_id")
                refunded_items[li_id] = refunded_items.get(li_id, 0) + item.get("quantity", 0)

        for item in order.get("line_items", []):
            sku = item.get("sku", "")
            variant_info = sku_map.get(sku) if sku else None

            artist_id = None
            artist_payout_net = None
            product_variant_id = None
            product_type = None

            if variant_info:
                artist_id = variant_info.get("artist_id")
                artist_payout_net = variant_info.get("artist_payout_net")
                product_variant_id = variant_info.get("id")
                product_type = variant_info.get("product_type")
                stats["skus_matched"] += 1
            elif sku:
                stats["skus_unmatched"] += 1
                stats["unmatched_skus"].add(sku)

            quantity = item.get("quantity", 1)
            payout_total = round(artist_payout_net * quantity, 2) if artist_payout_net else None

            li_id = item.get("id")
            refunded_qty = refunded_items.get(li_id, 0)

            line_item_record = {
                "shopify_order_id": shopify_order_id,
                "shopify_line_item_id": li_id,
                "sku": sku or None,
                "title": item.get("title"),
                "variant_title": item.get("variant_title"),
                "quantity": quantity,
                "price": float(item.get("price", 0)),
                "total_discount": float(item.get("total_discount", 0)),
                "artist_id": artist_id,
                "artist_payout_net": artist_payout_net,
                "artist_payout_total": payout_total,
                "product_variant_id": product_variant_id,
                "product_type": product_type,
                "is_refunded": refunded_qty >= quantity,
                "refunded_quantity": refunded_qty,
            }

            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/order_line_items?on_conflict=shopify_line_item_id",
                headers=sb_headers,
                json=line_item_record,
            )

            if resp.status_code in (200, 201):
                stats["line_items_upserted"] += 1
            else:
                print(f"  Error upserting line item: {resp.status_code} - {resp.text[:200]}")
                stats["errors"] += 1

    return stats


def parse_args():
    """Parse command line arguments for date range."""
    args = sys.argv[1:]

    if "--all" in args:
        return None, None

    if "--month" in args:
        idx = args.index("--month")
        if idx + 1 < len(args):
            month_str = args[idx + 1]
            year, month = map(int, month_str.split("-"))
            from_date = datetime(year, month, 1)
            # Last day of month
            if month == 12:
                to_date = datetime(year + 1, 1, 1) - timedelta(seconds=1)
            else:
                to_date = datetime(year, month + 1, 1) - timedelta(seconds=1)
            return from_date.isoformat(), to_date.isoformat()

    if "--from" in args:
        idx = args.index("--from")
        from_date = args[idx + 1] if idx + 1 < len(args) else None

        to_date = None
        if "--to" in args:
            idx = args.index("--to")
            to_date = args[idx + 1] if idx + 1 < len(args) else None

        return from_date, to_date

    # Default: current month
    now = datetime.now()
    from_date = datetime(now.year, now.month, 1)
    if now.month == 12:
        to_date = datetime(now.year + 1, 1, 1) - timedelta(seconds=1)
    else:
        to_date = datetime(now.year, now.month + 1, 1) - timedelta(seconds=1)

    return from_date.isoformat(), to_date.isoformat()


def main():
    check_config()

    created_at_min, created_at_max = parse_args()

    print("=" * 60)
    print("SHOPIFY → SUPABASE ORDER SYNC")
    print(f"Store: {SHOPIFY_STORE_NAME}")
    print(f"Time: {datetime.now().isoformat()}")
    if created_at_min:
        print(f"From: {created_at_min}")
    if created_at_max:
        print(f"To: {created_at_max}")
    else:
        print("Range: ALL orders")
    print("=" * 60)

    # Load SKU mapping from Supabase
    print("\nLoading product variant SKU map from Supabase...")
    sku_map = get_sku_to_variant_map()
    print(f"Loaded {len(sku_map)} SKU mappings")

    if not sku_map:
        print("WARNING: No SKU mappings found. Run sync_airtable_products.py first!")
        print("Continuing anyway (line items won't have artist/payout data)...")

    # Fetch orders from Shopify
    print()
    orders = fetch_orders(created_at_min, created_at_max)
    print(f"\nTotal orders fetched: {len(orders)}")

    if not orders:
        print("No orders found for the specified date range.")
        return

    # Upsert to Supabase
    print("\nUpserting to Supabase...")
    stats = upsert_orders_to_supabase(orders, sku_map)

    print(f"\n{'=' * 60}")
    print("SYNC COMPLETE")
    print(f"{'=' * 60}")
    print(f"Orders upserted: {stats['orders_upserted']}")
    print(f"Line items upserted: {stats['line_items_upserted']}")
    print(f"SKUs matched: {stats['skus_matched']}")
    print(f"SKUs unmatched: {stats['skus_unmatched']}")
    print(f"Errors: {stats['errors']}")

    if stats["unmatched_skus"]:
        print(f"\nUnmatched SKUs ({len(stats['unmatched_skus'])}):")
        for sku in sorted(stats["unmatched_skus"])[:20]:
            print(f"  - {sku}")
        if len(stats["unmatched_skus"]) > 20:
            print(f"  ... and {len(stats['unmatched_skus']) - 20} more")


if __name__ == "__main__":
    main()
