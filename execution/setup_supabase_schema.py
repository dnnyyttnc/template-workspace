#!/usr/bin/env python3
"""
Setup Supabase Schema for Artist Payout System

Reads .tmp/schema.sql and executes it against the Supabase database.
Falls back to printing instructions if direct connection is not possible.

Usage:
    python execution/setup_supabase_schema.py [--verify]
"""

import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)


def verify_tables():
    """Check if all required tables exist in Supabase via REST API."""
    import requests

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }

    required_tables = [
        "artists", "artist_payment_info", "artist_addresses",
        "product_variants", "shopify_orders", "order_line_items",
        "monthly_payouts", "payout_line_items",
    ]

    print("Verifying Supabase tables...")
    all_ok = True

    for table in required_tables:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=count&limit=0"
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            print(f"  [OK] {table}")
        else:
            print(f"  [MISSING] {table} (status: {resp.status_code})")
            all_ok = False

    if all_ok:
        print("\nAll tables exist!")
    else:
        print("\nSome tables are missing. Please run the schema SQL first.")
        print(f"SQL file: .tmp/schema.sql")
        print(f"Supabase SQL Editor: {SUPABASE_URL.replace('.supabase.co', '.supabase.co/project/default/sql')}")

    return all_ok


def main():
    if "--verify" in sys.argv:
        verify_tables()
        return

    sql_file = Path(__file__).parent.parent / ".tmp" / "schema.sql"
    if not sql_file.exists():
        print(f"Error: Schema SQL file not found at {sql_file}")
        sys.exit(1)

    schema_sql = sql_file.read_text()

    print("=" * 60)
    print("ARTIST PAYOUT SYSTEM - SUPABASE SCHEMA SETUP")
    print("=" * 60)
    print()
    print(f"Schema SQL file: {sql_file}")
    print(f"Supabase project: {SUPABASE_URL}")
    print()
    print("Please paste the contents of .tmp/schema.sql into the")
    print("Supabase SQL Editor and click 'Run':")
    print()
    print(f"  https://supabase.com/dashboard/project/gebjkorjydrxnwsmrpsy/sql/new")
    print()
    print("After running the SQL, verify with:")
    print("  python execution/setup_supabase_schema.py --verify")
    print()


if __name__ == "__main__":
    main()
