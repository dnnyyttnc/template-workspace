#!/usr/bin/env python3
"""
Sync Product Variants from Airtable to Supabase

Fetches all product variants (both exe and external) from Airtable,
extracts pricing info (especially AristAuszahlungNetto), and upserts
them into the Supabase product_variants table.

The SKU field is the unique key for matching Shopify orders later.

Usage:
    python execution/sync_airtable_products.py
    python execution/sync_airtable_products.py --type exe       # Only exe products
    python execution/sync_airtable_products.py --type external  # Only external products
"""

import os
import sys
import time
import json
import requests
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

# Config
AIRTABLE_PAT = os.getenv("AIRTABLE_PAT")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not all([AIRTABLE_PAT, AIRTABLE_BASE_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("Error: Missing required environment variables.")
    print("Need: AIRTABLE_PAT, AIRTABLE_BASE_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY")
    sys.exit(1)

# Airtable table IDs
EXE_VARIANTS_TABLE = "tblaaJQZhgs3IVyHj"       # ExeArtistProductVariants
EXTERNAL_VARIANTS_TABLE = "tblaZgwdhNxpZFZUa"   # ExternalProductsVariants

# Airtable API headers
AT_HEADERS = {
    "Authorization": f"Bearer {AIRTABLE_PAT}",
    "Content-Type": "application/json",
}

# Supabase API headers
SB_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # Upsert on conflict
}


def fetch_all_airtable_records(table_id, fields=None):
    """Fetch all records from an Airtable table with pagination."""
    records = []
    offset = None
    page = 0

    while True:
        page += 1
        url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{table_id}"
        params = {"pageSize": 100}

        if fields:
            params["fields[]"] = fields
        if offset:
            params["offset"] = offset

        resp = requests.get(url, headers=AT_HEADERS, params=params)

        if resp.status_code == 429:
            print("  Rate limited, waiting 30s...")
            time.sleep(30)
            continue

        if resp.status_code != 200:
            print(f"  Error fetching page {page}: {resp.status_code} - {resp.text[:200]}")
            break

        data = resp.json()
        batch = data.get("records", [])
        records.extend(batch)
        print(f"  Page {page}: {len(batch)} records (total: {len(records)})")

        offset = data.get("offset")
        if not offset:
            break

        time.sleep(0.2)  # Respect rate limits (5 req/s for Airtable)

    return records


def get_artist_id_map():
    """Get mapping of Airtable record IDs to Supabase artist UUIDs."""
    url = f"{SUPABASE_URL}/rest/v1/artists?select=id,airtable_record_id"
    resp = requests.get(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })

    if resp.status_code != 200:
        print(f"Warning: Could not fetch artist map: {resp.status_code}")
        return {}

    return {a["airtable_record_id"]: a["id"] for a in resp.json() if a.get("airtable_record_id")}


def extract_lookup_value(field_value):
    """Extract the first value from an Airtable multipleLookupValues field."""
    if isinstance(field_value, list) and len(field_value) > 0:
        return field_value[0]
    return field_value


def get_field(fields, prefix):
    """Find a field by prefix, handling Airtable lookup suffixes like '(from ...)'.

    Airtable lookup fields have names like:
        'AristAuszahlungNetto (from ExeArtistProductClass) (from ExeArtistProductOptions)'
    This function matches by the prefix before the first ' (' suffix.
    """
    # Try exact match first
    if prefix in fields:
        return fields[prefix]
    # Try prefix match (for lookup fields with ' (from ...)' suffixes)
    for key, value in fields.items():
        if key.startswith(prefix + " (") or key.startswith(prefix + "("):
            return value
    return None


def sync_exe_variants(artist_map):
    """Sync ExeArtistProductVariants from Airtable to Supabase."""
    print("\n=== Syncing Exe Product Variants ===")

    # Fetch all fields - lookup field names may differ from display names
    records = fetch_all_airtable_records(EXE_VARIANTS_TABLE)
    print(f"Fetched {len(records)} exe variants from Airtable")

    variants = []
    skipped = 0

    for rec in records:
        f = rec.get("fields", {})
        sku = extract_lookup_value(get_field(f, "SKU") or f.get("SKU"))
        if not sku:
            skipped += 1
            continue

        artist_at_id = extract_lookup_value(get_field(f, "artist_airtable_rec_id"))
        artist_uuid = artist_map.get(artist_at_id) if artist_at_id else None

        # Extract class record ID for Airtable Interface links
        class_rec_id = extract_lookup_value(get_field(f, "airtableRecordID (from ExeArtistProductClass)"))

        variants.append({
            "sku": str(sku),
            "product_name": extract_lookup_value(get_field(f, "Name") or ""),
            "product_type": "exe",
            "artist_id": artist_uuid,
            "artist_payout_net": extract_lookup_value(get_field(f, "AristAuszahlungNetto")),
            "retail_price": extract_lookup_value(get_field(f, "PurchasePrice") or f.get("PurchasePrice")),
            "exe_commission": extract_lookup_value(get_field(f, "exeProvisionBetrag")),
            "shopify_fees": extract_lookup_value(get_field(f, "ShopifyGebuehren")),
            "vat_amount": extract_lookup_value(get_field(f, "MwStBetrag")),
            "production_cost_net": extract_lookup_value(get_field(f, "EKProduktionskostenNetto")),
            "airtable_variant_id": rec.get("id"),
            "airtable_class_id": class_rec_id if isinstance(class_rec_id, str) else None,
            "last_synced_at": datetime.utcnow().isoformat(),
        })

    if skipped:
        print(f"Skipped {skipped} records with no SKU")

    return variants


def sync_external_variants(artist_map):
    """Sync ExternalProductsVariants from Airtable to Supabase."""
    print("\n=== Syncing External Product Variants ===")

    # Fetch all fields - lookup field names may differ from display names
    records = fetch_all_airtable_records(EXTERNAL_VARIANTS_TABLE)
    print(f"Fetched {len(records)} external variants from Airtable")

    variants = []
    skipped = 0

    for rec in records:
        f = rec.get("fields", {})
        sku = extract_lookup_value(get_field(f, "SKU") or f.get("SKU"))
        if not sku:
            skipped += 1
            continue

        artist_at_id = extract_lookup_value(get_field(f, "artist_airtable_rec_id"))
        artist_uuid = artist_map.get(artist_at_id) if artist_at_id else None

        variants.append({
            "sku": str(sku),
            "product_name": extract_lookup_value(get_field(f, "Name") or ""),
            "product_type": "external",
            "artist_id": artist_uuid,
            "artist_payout_net": extract_lookup_value(get_field(f, "AuszahlungArtistNetto")),
            "retail_price": extract_lookup_value(get_field(f, "PurchasePrice") or f.get("PurchasePrice")),
            "exe_commission": extract_lookup_value(get_field(f, "exeAuszahlung")),
            "shopify_fees": extract_lookup_value(get_field(f, "ShopifyGebuehren")),
            "vat_amount": extract_lookup_value(get_field(f, "MwSt")),
            "production_cost_net": None,  # External products have no production cost
            "airtable_variant_id": rec.get("id"),
            "last_synced_at": datetime.utcnow().isoformat(),
        })

    if skipped:
        print(f"Skipped {skipped} records with no SKU")

    return variants


def upsert_to_supabase(variants):
    """Upsert product variants to Supabase (batch of 500)."""
    if not variants:
        print("No variants to upsert.")
        return 0

    total = 0
    batch_size = 500

    for i in range(0, len(variants), batch_size):
        batch = variants[i:i + batch_size]
        url = f"{SUPABASE_URL}/rest/v1/product_variants?on_conflict=sku"

        resp = requests.post(url, headers=SB_HEADERS, json=batch)

        if resp.status_code in (200, 201):
            total += len(batch)
            print(f"  Upserted batch {i // batch_size + 1}: {len(batch)} records")
        else:
            print(f"  Error upserting batch: {resp.status_code} - {resp.text[:300]}")

    return total


def main():
    sync_type = "all"
    if "--type" in sys.argv:
        idx = sys.argv.index("--type")
        if idx + 1 < len(sys.argv):
            sync_type = sys.argv[idx + 1]

    print("=" * 60)
    print("AIRTABLE → SUPABASE PRODUCT VARIANT SYNC")
    print(f"Type: {sync_type}")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 60)

    # Get artist mapping
    artist_map = get_artist_id_map()
    print(f"Loaded {len(artist_map)} artist mappings from Supabase")

    all_variants = []

    if sync_type in ("all", "exe"):
        exe_variants = sync_exe_variants(artist_map)
        all_variants.extend(exe_variants)

    if sync_type in ("all", "external"):
        external_variants = sync_external_variants(artist_map)
        all_variants.extend(external_variants)

    print(f"\nTotal variants to sync: {len(all_variants)}")

    # Check for duplicate SKUs
    skus = [v["sku"] for v in all_variants]
    unique_skus = set(skus)
    if len(skus) != len(unique_skus):
        dupes = [s for s in unique_skus if skus.count(s) > 1]
        print(f"WARNING: {len(dupes)} duplicate SKUs found: {dupes[:5]}...")
        # Keep only the first occurrence
        seen = set()
        deduped = []
        for v in all_variants:
            if v["sku"] not in seen:
                seen.add(v["sku"])
                deduped.append(v)
        all_variants = deduped
        print(f"After dedup: {len(all_variants)} variants")

    # Upsert to Supabase
    total = upsert_to_supabase(all_variants)
    print(f"\nSync complete: {total} variants upserted to Supabase")


if __name__ == "__main__":
    main()
