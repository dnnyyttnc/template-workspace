"""
test_airtable_connection.py
----------------------------
Tests the Airtable API connection by:
1. Listing all tables in the base (via Base schema endpoint)
2. Fetching records from the target table
3. Printing field names and a sample of records

Uses the Airtable REST API directly via requests.
"""

import requests
import json
import sys
import os

# --- Configuration ---
PAT_TOKEN = os.getenv("AIRTABLE_PAT", "")
BASE_ID = os.getenv("AIRTABLE_BASE_ID", "")
TABLE_ID = "tblaaJQZhgs3IVyHj"

HEADERS = {
    "Authorization": f"Bearer {PAT_TOKEN}",
    "Content-Type": "application/json",
}

API_BASE = "https://api.airtable.com/v0"

def separator(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")


# -------------------------------------------------------
# STEP 1: List all tables in the base (schema endpoint)
# -------------------------------------------------------
separator("STEP 1: List all tables in base")

schema_url = f"https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables"
resp = requests.get(schema_url, headers=HEADERS)

if resp.status_code != 200:
    print(f"[ERROR] Schema request failed: {resp.status_code}")
    print(resp.text)
    sys.exit(1)

schema = resp.json()
tables = schema.get("tables", [])
print(f"Found {len(tables)} table(s) in base {BASE_ID}:\n")

target_table_name = None
for t in tables:
    marker = " <-- TARGET" if t["id"] == TABLE_ID else ""
    print(f"  - {t['name']}  (id: {t['id']}){marker}")
    if t["id"] == TABLE_ID:
        target_table_name = t["name"]

# Print field details for the target table from schema
separator("STEP 2: Field schema for target table")

target_schema = next((t for t in tables if t["id"] == TABLE_ID), None)
if target_schema:
    print(f"Table: {target_schema['name']}  (id: {TABLE_ID})")
    print(f"Fields ({len(target_schema.get('fields', []))}):\n")
    for i, f in enumerate(target_schema.get("fields", []), 1):
        ftype = f.get("type", "unknown")
        desc = f.get("description", "")
        desc_str = f'  -- "{desc}"' if desc else ""
        print(f"  {i:>3}. {f['name']:<45} type: {ftype}{desc_str}")
else:
    print(f"[WARNING] Target table {TABLE_ID} not found in schema.")

# -------------------------------------------------------
# STEP 3: Fetch records from the target table
# -------------------------------------------------------
separator("STEP 3: Fetch records from target table")

records_url = f"{API_BASE}/{BASE_ID}/{TABLE_ID}"
params = {"pageSize": 10}  # Fetch first 10 records as a sample

resp = requests.get(records_url, headers=HEADERS, params=params)

if resp.status_code != 200:
    print(f"[ERROR] Records request failed: {resp.status_code}")
    print(resp.text)
    sys.exit(1)

data = resp.json()
records = data.get("records", [])
has_more = "offset" in data

print(f"Fetched {len(records)} record(s) (sample). More available: {has_more}\n")

if not records:
    print("No records found in this table.")
    sys.exit(0)

# Collect all unique field names across records
all_field_names = set()
for r in records:
    all_field_names.update(r.get("fields", {}).keys())

print(f"Field names present in fetched records ({len(all_field_names)}):")
for fn in sorted(all_field_names):
    print(f"  - {fn}")

# -------------------------------------------------------
# STEP 4: Print sample records
# -------------------------------------------------------
separator("STEP 4: Sample records (first 10)")

for i, r in enumerate(records, 1):
    print(f"--- Record {i} (id: {r['id']}) ---")
    fields = r.get("fields", {})
    if not fields:
        print("  (empty record)")
    for key, val in fields.items():
        # Truncate very long values
        val_str = str(val)
        if len(val_str) > 200:
            val_str = val_str[:200] + "..."
        print(f"  {key}: {val_str}")
    print()

# -------------------------------------------------------
# STEP 5: Look for payout-related fields
# -------------------------------------------------------
separator("STEP 5: Payout / Auszahlung related fields")

payout_keywords = ["auszahl", "payout", "netto", "brutto", "artist", "payment", "amount", "betrag"]
matching_fields = []
for fn in sorted(all_field_names):
    if any(kw in fn.lower() for kw in payout_keywords):
        matching_fields.append(fn)

if matching_fields:
    print("Fields matching payout-related keywords:")
    for fn in matching_fields:
        print(f"  * {fn}")
        # Show sample values for these fields
        sample_vals = []
        for r in records:
            v = r.get("fields", {}).get(fn)
            if v is not None:
                sample_vals.append(v)
        if sample_vals:
            print(f"    Sample values: {sample_vals[:5]}")
else:
    print("No fields found matching payout-related keywords.")
    print("All field names for reference:")
    for fn in sorted(all_field_names):
        print(f"  - {fn}")

print("\n[DONE] Airtable connection test complete.")
