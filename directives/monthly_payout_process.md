# Monatliche Artist-Auszahlung

## Zweck

Berechnung und Durchführung der monatlichen Auszahlung an Artists basierend auf Shopify-Verkäufen.

## Übersicht

| Eigenschaft | Wert |
|-------------|------|
| **Zeitpunkt** | Frühestens am 14. des Folgemonats (14-Tage-Rückgaberecht) |
| **Datenquellen** | Shopify (Orders), Airtable (Produktpreise), Supabase (Berechnung) |
| **Output** | Google Sheet Übersicht, Gutschriften (PDF), Supabase Records |

## Voraussetzungen

1. Shopify App ist installiert mit `read_orders,read_all_orders,read_products` Scopes (`.env: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET`)
2. Airtable Produktpreise sind synchronisiert (`sync_airtable_products.py`)
3. Artists sind in Supabase migriert (`migrate_artists_from_airtable.py`)
4. Supabase Schema ist aufgesetzt (Migrations in `supabase/migrations/`)

## Workflow

```
┌─────────────────────────────────────────────────────────┐
│  1. DATEN SYNCHRONISIEREN                                │
│     python execution/sync_airtable_products.py           │
│     python execution/sync_shopify_orders.py --month YYYY-MM │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  2. AUSZAHLUNG BERECHNEN                                 │
│     python execution/calculate_monthly_payouts.py        │
│       --month YYYY-MM --dry-run  (erst Vorschau)         │
│     Prüfen: Stimmen die Beträge?                         │
│     Dann ohne --dry-run ausführen                        │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  3. REPORT GENERIEREN                                    │
│     python execution/generate_payout_report.py           │
│       --month YYYY-MM                                    │
│     → Google Sheet wird erstellt/aktualisiert            │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  4. PRÜFUNG & FREIGABE                                   │
│     - Google Sheet prüfen                                │
│     - Unbekannte SKUs klären                             │
│     - Beträge plausibilisieren                           │
│     - Freigabe erteilen                                  │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  5. GUTSCHRIFTEN GENERIEREN                              │
│     python execution/generate_credit_notes.py            │
│       --month YYYY-MM                                    │
│     → PDFs werden in .tmp/ erstellt                      │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  6. AUSZAHLUNG DURCHFÜHREN                               │
│     - PayPal / Banküberweisung                           │
│     - Status in Supabase auf "paid" setzen               │
└─────────────────────────────────────────────────────────┘
```

## Timing

| Monat | Auszahlungszeitraum | Frühester Auszahlungstermin |
|-------|--------------------|-----------------------------|
| Januar | 01.01. - 31.01. | 14. Februar |
| Februar | 01.02. - 28/29.02. | 14. März |
| März | 01.03. - 31.03. | 14. April |
| ... | ... | ... |

## Preislogik

### Exe-Produkte (eigene Fertigung)
```
AristAuszahlungNetto = Preis - MwSt - exeProvision - ShopifyGebühren - EKProduktionskostenNetto
```

### Externe Produkte (Fremdprodukte)
```
AuszahlungArtistNetto = (Preis / 1.19 - ShopifyGebühren) * (1 - exeProvision)
```
Typisch: 30% Exe-Provision, 70% Artist

### MwSt-Handling
- Artist **nicht** MwSt-pflichtig → Netto-Betrag wird ausgezahlt
- Artist **MwSt-pflichtig** → Netto-Betrag + 19% MwSt wird ausgezahlt

## Fehlerbehandlung

- **Unbekannte SKUs**: SKUs die keinem Airtable-Produkt zugeordnet sind → manuell klären
- **Fehlende Artist-Daten**: Artists ohne Zahlungsdaten → Onboarding-Formular schicken (Dashboard: Artist → "Onboarding-Link erstellen" → Link an Artist senden → Artist füllt Formular aus unter `/onboarding/{token}`)
- **Retouren**: Teilretouren werden anteilig abgezogen, Vollretouren komplett

## Learnings & Updates

### 2026-03-10: Erster End-to-End Test
- **Shopify Auth**: Seit 01.01.2026 keine legacy Custom Apps mehr. App via Shopify CLI erstellt (`exe-payout-app`), nutzt Client Credentials Grant (Token 24h gültig).
- **Airtable Lookup-Felder**: Feldnamen haben Lookup-Suffixe wie `(from ExeArtistProductClass) (from ExeArtistProductOptions)`. Prefix-Matching nötig statt exaktem Match.
- **Supabase Upserts**: REST API braucht `?on_conflict=<column>` Query-Parameter für idempotente Upserts, nicht nur `Prefer: resolution=merge-duplicates`.
- **SKU-Matching (offen)**: 126 SKUs werden von mehreren Artists geteilt (gleiche Basis-Variante). Aktuell wird nur der erste Artist zugeordnet. Fix: Shopify Product ID statt SKU verwenden.
- **Fehlende SKUs (offen)**: 102 verschiedene SKUs in Shopify-Orders die nicht in Airtable sind (Tickets, Tips, ältere Produkte, abweichende SKU-Formate).
- **Test Dez 2025**: 9 Artists, 16 Items, 173.16€ Gesamt-Auszahlung. Pipeline funktioniert korrekt.

### 2026-03-10: Onboarding-Formular & Rechnungsnummern
- **Artist Onboarding**: Gamifiziertes Step-by-Step Formular unter `/onboarding/{token}` (öffentlich, kein Login). Sammelt: Rechnungsadresse, Steuernummer, MwSt-Status, Zahlungsmethode (PayPal/IBAN), Einverständnis für Gutschriften.
- **Token-System**: UUID-Token pro Artist, 30 Tage gültig. Generierbar im Dashboard auf der Artist-Detailseite.
- **Rechnungsnummern**: Fortlaufend via `next_invoice_number()` DB-Funktion. Format: `GS-{YYYY}-{0001}`. Wird automatisch bei Freigabe (Status → approved) vergeben.
- **Migration**: `20260311_onboarding_and_invoices.sql` — neue Spalten auf artists (onboarding_token, consent), artist_payment_info (vat_id), monthly_payouts (invoice_number), neue Tabelle invoice_sequences.
