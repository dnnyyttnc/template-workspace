"""
explore_external_products.py
-----------------------------
Explores the ExternalProductOptions table and related external product tables
in Airtable to understand:
1. Schema / field names and types for ExternalProductOptions
2. Sample records from ExternalProductOptions
3. Related tables (ExternalProductVariants, etc.)
4. Pricing structure and Artist linkage

Uses the Airtable REST API directly via requests.
"""

import requests
import json
import sys
import os

# --- Configuration ---
PAT_TOKEN = os.getenv("AIRTABLE_PAT", "")
BASE_ID = os.getenv("AIRTABLE_BASE_ID", "")
EXTERNAL_PRODUCT_OPTIONS_TABLE_ID = "tbltQJqFXlb5ghsTI"

HEADERS = {
    "Authorization": f"Bearer {PAT_TOKEN}",
    "Content-Type": "application/json",
}
API_BASE = "https://api.airtable.com/v0"


def separator(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")


def print_field_schema(table_schema):
    """Print detailed field schema for a table."""
    fields = table_schema.get("fields", [])
    print(f"Table: {table_schema['name']}  (id: {table_schema['id']})")
    print(f"Fields ({len(fields)}):\n")
    for i, f in enumerate(fields, 1):
        ftype = f.get("type", "unknown")
        desc = f.get("description", "")
        desc_str = f'  -- "{desc}"' if desc else ""
        # For linked records, show the linked table
        options = f.get("options", {})
        linked_info = ""
        if ftype == "multipleRecordLinks" and options:
            linked_table = options.get("linkedTableId", "")
            is_reversed = options.get("isReversed", False)
            linked_info = f"  -> linked to {linked_table} (reversed={is_reversed})"
        elif ftype == "rollup" and options:
            linked_info = f"  -> rollup via {options.get('recordLinkFieldIdInThisTable', '?')}"
        elif ftype == "formula" and options:
            formula = options.get("formula", "")
            if formula:
                linked_info = f'  -> formula: {formula[:100]}'
        elif ftype == "lookup" and options:
            linked_info = f"  -> lookup via {options.get('recordLinkFieldIdInThisTable', '?')}, field {options.get('fieldIdInLinkedTable', '?')}"
        elif ftype in ("singleSelect", "multipleSelects") and options:
            choices = options.get("choices", [])
            choice_names = [c.get("name", "") for c in choices[:10]]
            if choice_names:
                linked_info = f"  -> choices: {choice_names}"
        
        print(f"  {i:>3}. {f['name']:<45} type: {ftype}{desc_str}{linked_info}")
    print()


def fetch_sample_records(table_id, max_records=5):
    """Fetch sample records from a table."""
    url = f"{API_BASE}/{BASE_ID}/{table_id}"
    params = {"pageSize": max_records}
    resp = requests.get(url, headers=HEADERS, params=params)
    if resp.status_code != 200:
        print(f"  [ERROR] Failed to fetch records: {resp.status_code}")
        print(f"  {resp.text[:500]}")
        return []
    data = resp.json()
    return data.get("records", [])


def print_sample_records(records, label=""):
    """Print sample records in a readable format."""
    if not records:
        print("  No records found.")
        return
    
    for i, r in enumerate(records, 1):
        print(f"  --- Record {i} (id: {r['id']}) ---")
        fields = r.get("fields", {})
        if not fields:
            print("    (empty record)")
            continue
        for key, val in sorted(fields.items()):
            val_str = str(val)
            if len(val_str) > 150:
                val_str = val_str[:150] + "..."
            print(f"    {key}: {val_str}")
        print()


# ====================================================================
# STEP 1: Fetch full base schema
# ====================================================================
separator("STEP 1: Full Base Schema - All Tables")

schema_url = f"https://api.airtable.com/v0/meta/bases/{BASE_ID}/tables"
resp = requests.get(schema_url, headers=HEADERS)

if resp.status_code != 200:
    print(f"[ERROR] Schema request failed: {resp.status_code}")
    print(resp.text)
    sys.exit(1)

schema = resp.json()
tables = schema.get("tables", [])
print(f"Found {len(tables)} table(s) in base:\n")

# Build lookup: table_id -> table_name
table_id_to_name = {}
for t in tables:
    table_id_to_name[t["id"]] = t["name"]

# Identify external-product-related tables
external_tables = []
all_table_names = []
for t in tables:
    name = t["name"]
    tid = t["id"]
    all_table_names.append(name)
    is_external = "external" in name.lower()
    is_target = tid == EXTERNAL_PRODUCT_OPTIONS_TABLE_ID
    marker = ""
    if is_target:
        marker = " <-- TARGET (ExternalProductOptions)"
    elif is_external:
        marker = " <-- EXTERNAL"
    
    if is_external or is_target:
        external_tables.append(t)
    
    print(f"  - {name:<50} (id: {tid}){marker}")

# Also look for Artist-related tables
artist_tables = [t for t in tables if "artist" in t["name"].lower()]
product_tables = [t for t in tables if "product" in t["name"].lower() and t not in external_tables]

print(f"\nExternal-related tables: {len(external_tables)}")
print(f"Artist-related tables: {len(artist_tables)}")
print(f"Other product-related tables: {len(product_tables)}")


# ====================================================================
# STEP 2: ExternalProductOptions - Detailed Schema
# ====================================================================
separator("STEP 2: ExternalProductOptions - Field Schema")

target_schema = next((t for t in tables if t["id"] == EXTERNAL_PRODUCT_OPTIONS_TABLE_ID), None)
if target_schema:
    print_field_schema(target_schema)
    
    # Resolve linked table names
    print("\n  Linked table references (resolved):")
    for f in target_schema.get("fields", []):
        options = f.get("options", {})
        linked_id = options.get("linkedTableId", "")
        if linked_id:
            linked_name = table_id_to_name.get(linked_id, "UNKNOWN")
            print(f"    Field '{f['name']}' -> Table '{linked_name}' ({linked_id})")
else:
    print("[ERROR] Target table not found in schema!")
    sys.exit(1)


# ====================================================================
# STEP 3: ExternalProductOptions - Sample Records
# ====================================================================
separator("STEP 3: ExternalProductOptions - Sample Records")

records = fetch_sample_records(EXTERNAL_PRODUCT_OPTIONS_TABLE_ID, max_records=5)
print_sample_records(records)

# Identify pricing/payout fields from the actual data
payout_keywords = ["auszahl", "payout", "netto", "brutto", "artist", "payment", 
                    "amount", "betrag", "price", "preis", "cost", "kosten", "margin",
                    "revenue", "umsatz", "fee", "gebühr", "commission", "provision"]

if records:
    all_fields = set()
    for r in records:
        all_fields.update(r.get("fields", {}).keys())
    
    print("\n  Pricing/Payout-related fields found in ExternalProductOptions:")
    for fn in sorted(all_fields):
        if any(kw in fn.lower() for kw in payout_keywords):
            vals = [r.get("fields", {}).get(fn) for r in records if fn in r.get("fields", {})]
            print(f"    * {fn}: sample values = {vals[:5]}")


# ====================================================================
# STEP 4: Explore ALL External-related tables
# ====================================================================
separator("STEP 4: All External-Related Tables - Schemas & Samples")

for ext_table in external_tables:
    print(f"\n{'- '*40}")
    print(f"  TABLE: {ext_table['name']} ({ext_table['id']})")
    print(f"{'- '*40}")
    print_field_schema(ext_table)
    
    # Fetch a few sample records
    print(f"  Sample records from {ext_table['name']}:")
    ext_records = fetch_sample_records(ext_table["id"], max_records=3)
    print_sample_records(ext_records)
    
    # Highlight pricing fields
    if ext_records:
        ext_all_fields = set()
        for r in ext_records:
            ext_all_fields.update(r.get("fields", {}).keys())
        pricing_fields = [fn for fn in sorted(ext_all_fields) 
                         if any(kw in fn.lower() for kw in payout_keywords)]
        if pricing_fields:
            print(f"\n  *** Pricing/Payout fields in {ext_table['name']}:")
            for fn in pricing_fields:
                vals = [r.get("fields", {}).get(fn) for r in ext_records if fn in r.get("fields", {})]
                print(f"      {fn}: {vals[:5]}")


# ====================================================================
# STEP 5: Explore Artist-related tables (brief)
# ====================================================================
separator("STEP 5: Artist-Related Tables (brief)")

for art_table in artist_tables:
    print(f"\n  TABLE: {art_table['name']} ({art_table['id']})")
    # Just print field names, not full schema
    fields = art_table.get("fields", [])
    pricing_fields = [f for f in fields 
                     if any(kw in f["name"].lower() for kw in payout_keywords)]
    if pricing_fields:
        print(f"  Pricing/payout fields:")
        for f in pricing_fields:
            options = f.get("options", {})
            formula = options.get("formula", "")
            print(f"    * {f['name']} (type: {f['type']}){f' formula: '+formula if formula else ''}")
    else:
        field_names = [f["name"] for f in fields]
        print(f"  All fields: {field_names}")


# ====================================================================
# STEP 6: Explore other Product tables for comparison
# ====================================================================
separator("STEP 6: Other Product Tables (for AristAuszahlungNetto comparison)")

for prod_table in product_tables:
    print(f"\n  TABLE: {prod_table['name']} ({prod_table['id']})")
    fields = prod_table.get("fields", [])
    pricing_fields = [f for f in fields 
                     if any(kw in f["name"].lower() for kw in payout_keywords)]
    if pricing_fields:
        print(f"  Pricing/payout fields:")
        for f in pricing_fields:
            options = f.get("options", {})
            formula = options.get("formula", "")
            linked_id = options.get("linkedTableId", "")
            extra = ""
            if formula:
                extra = f" formula: {formula[:120]}"
            if linked_id:
                extra = f" -> linked to {table_id_to_name.get(linked_id, linked_id)}"
            print(f"    * {f['name']} (type: {f['type']}){extra}")
    else:
        field_names = [f["name"] for f in fields]
        print(f"  All fields: {field_names}")


# ====================================================================
# SUMMARY
# ====================================================================
separator("SUMMARY: External Product Pricing Structure")

print("""
Based on the schema analysis above, here is what we found about external products.
(Detailed analysis follows in the script output above.)

Key questions answered:
1. ExternalProductOptions schema - see STEP 2
2. Sample data - see STEP 3
3. Related external tables - see STEP 4
4. Pricing / AristAuszahlungNetto / Artist linkage - see STEPS 4-6
""")

print("[DONE] Exploration complete.")
