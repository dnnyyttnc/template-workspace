#!/usr/bin/env python3
"""
Migrate Artists from Airtable to Supabase

Fetches all artists from the Airtable Artists table and creates
corresponding records in Supabase (artists + artist_payment_info + artist_addresses).

This is a one-time migration script. Can be run multiple times safely (upserts).

Usage:
    python execution/migrate_artists_from_airtable.py
    python execution/migrate_artists_from_airtable.py --dry-run  # Preview without writing
"""

import os
import sys
import time
import json
import re
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
    sys.exit(1)

ARTISTS_TABLE = "tblWesDqINNiv3w7K"

AT_HEADERS = {
    "Authorization": f"Bearer {AIRTABLE_PAT}",
    "Content-Type": "application/json",
}

SB_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def slugify(name):
    """Create a URL-safe slug from an artist name."""
    slug = name.lower().strip()
    slug = re.sub(r'[äÄ]', 'ae', slug)
    slug = re.sub(r'[öÖ]', 'oe', slug)
    slug = re.sub(r'[üÜ]', 'ue', slug)
    slug = re.sub(r'[ß]', 'ss', slug)
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug or 'unnamed'


def fetch_all_artists():
    """Fetch all artist records from Airtable."""
    records = []
    offset = None
    page = 0

    # Don't filter by fields - fetch all to avoid Umlaut issues with field names
    fields = None

    while True:
        page += 1
        url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{ARTISTS_TABLE}"
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
            print(f"  Error: {resp.status_code} - {resp.text[:200]}")
            break

        data = resp.json()
        batch = data.get("records", [])
        records.extend(batch)
        print(f"  Page {page}: {len(batch)} artists (total: {len(records)})")

        offset = data.get("offset")
        if not offset:
            break

        time.sleep(0.2)

    return records


def transform_artist(record):
    """Transform Airtable artist record into Supabase format."""
    f = record.get("fields", {})
    airtable_id = record.get("id")
    name = f.get("Name", "").strip()

    if not name:
        return None

    base_slug = f.get("slug") or slugify(name)
    # Append short airtable_id suffix to guarantee uniqueness
    slug = f"{base_slug}-{airtable_id[-6:]}"

    # All existing artists default to active
    status = "active"

    artist = {
        "name": name,
        "slug": slug,
        "email": f.get("mail"),
        "is_vat_liable": f.get("Artist MwSt. Pflichtig", False),
        "status": status,
        "airtable_record_id": airtable_id,
    }

    # Payment info - try both Umlaut and non-Umlaut field names
    payout_method = f.get("Auszahlungsmethode", "")
    payment_info = {
        "payout_method": "paypal" if "PayPal" in str(payout_method) else "bank_transfer" if payout_method else None,
        "paypal_email": f.get("paypal"),
        "bank_name": f.get("Künstler_Bank") or f.get("Kunstler_Bank"),
        "iban": f.get("IBAN"),
        "bic": f.get("BIC"),
        "tax_number": f.get("Steuernummer"),
    }

    # Address - try various field name variants
    address = None
    addr_name = f.get("Rechnungsadresse_Name")
    addr_street = f.get("Rechnungsadresse_Straße") or f.get("Rechnungsadresse_Strasse")
    if addr_name or addr_street:
        address = {
            "address_type": "billing",
            "is_default": True,
            "name": addr_name,
            "street": addr_street,
            "house_number": f.get("Rechnungsadresse_Hausnummer_"),
            "address_line_2": f.get("Rechnungsadresse_Adresszusatz"),
            "postal_code": f.get("Rechnungsadresse_PLZ_"),
            "city": f.get("Rechnungsadresse_Ort"),
            "country_code": "DE",
        }

    return {
        "artist": artist,
        "payment_info": payment_info,
        "address": address,
    }


def upsert_artists(transformed_data, dry_run=False):
    """Upsert artists, payment info, and addresses to Supabase."""
    stats = {"artists": 0, "payment_info": 0, "addresses": 0, "errors": 0}

    for data in transformed_data:
        if data is None:
            continue

        artist = data["artist"]

        if dry_run:
            print(f"  [DRY RUN] Would upsert: {artist['name']} ({artist['slug']})")
            stats["artists"] += 1
            continue

        # 1. Upsert artist
        url = f"{SUPABASE_URL}/rest/v1/artists"
        headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
        resp = requests.post(url, headers=headers, json=artist)

        if resp.status_code not in (200, 201):
            print(f"  Error upserting artist {artist['name']}: {resp.status_code} - {resp.text[:200]}")
            stats["errors"] += 1
            continue

        artist_result = resp.json()
        artist_uuid = artist_result[0]["id"] if isinstance(artist_result, list) else artist_result["id"]
        stats["artists"] += 1

        # 2. Upsert payment info
        payment_info = data["payment_info"]
        has_payment_data = any(v for k, v in payment_info.items() if v is not None)

        if has_payment_data:
            payment_info["artist_id"] = artist_uuid
            url = f"{SUPABASE_URL}/rest/v1/artist_payment_info"
            resp = requests.post(url, headers=SB_HEADERS, json=payment_info)
            if resp.status_code in (200, 201):
                stats["payment_info"] += 1
            else:
                print(f"  Warning: Payment info for {artist['name']}: {resp.status_code}")

        # 3. Upsert address
        address = data["address"]
        if address:
            address["artist_id"] = artist_uuid
            # Check if address already exists for this artist
            check_url = f"{SUPABASE_URL}/rest/v1/artist_addresses?artist_id=eq.{artist_uuid}&address_type=eq.billing&limit=1"
            check_resp = requests.get(check_url, headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            })

            if check_resp.status_code == 200 and check_resp.json():
                # Update existing
                existing_id = check_resp.json()[0]["id"]
                url = f"{SUPABASE_URL}/rest/v1/artist_addresses?id=eq.{existing_id}"
                resp = requests.patch(url, headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                }, json=address)
            else:
                # Insert new
                url = f"{SUPABASE_URL}/rest/v1/artist_addresses"
                resp = requests.post(url, headers=SB_HEADERS, json=address)

            if resp.status_code in (200, 201, 204):
                stats["addresses"] += 1
            else:
                print(f"  Warning: Address for {artist['name']}: {resp.status_code}")

        print(f"  Migrated: {artist['name']}")

    return stats


def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("AIRTABLE → SUPABASE ARTIST MIGRATION")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 60)

    # Fetch artists from Airtable
    print("\nFetching artists from Airtable...")
    records = fetch_all_artists()
    print(f"Found {len(records)} artists")

    # Transform
    print("\nTransforming artist data...")
    transformed = [transform_artist(r) for r in records]
    valid = [t for t in transformed if t is not None]
    print(f"Valid artists: {len(valid)}")

    # Preview data quality
    print("\nData quality check:")
    has_email = sum(1 for t in valid if t["artist"]["email"])
    has_iban = sum(1 for t in valid if t["payment_info"]["iban"])
    has_paypal = sum(1 for t in valid if t["payment_info"]["paypal_email"])
    has_address = sum(1 for t in valid if t["address"])
    has_tax = sum(1 for t in valid if t["payment_info"]["tax_number"])
    vat_liable = sum(1 for t in valid if t["artist"]["is_vat_liable"])

    print(f"  Email: {has_email}/{len(valid)}")
    print(f"  IBAN: {has_iban}/{len(valid)}")
    print(f"  PayPal: {has_paypal}/{len(valid)}")
    print(f"  Address: {has_address}/{len(valid)}")
    print(f"  Tax number: {has_tax}/{len(valid)}")
    print(f"  VAT liable: {vat_liable}/{len(valid)}")

    # Upsert to Supabase
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Migrating to Supabase...")
    stats = upsert_artists(valid, dry_run=dry_run)

    print(f"\n{'DRY RUN ' if dry_run else ''}Migration complete:")
    print(f"  Artists: {stats['artists']}")
    print(f"  Payment info: {stats.get('payment_info', 0)}")
    print(f"  Addresses: {stats.get('addresses', 0)}")
    print(f"  Errors: {stats.get('errors', 0)}")

    if dry_run:
        print("\nRe-run without --dry-run to actually migrate.")


if __name__ == "__main__":
    main()
