"use client"

import { useState } from "react"
import type { OnboardingFormData } from "@/types/database"

interface ConsentStepProps {
  formData: Partial<OnboardingFormData>
  onUpdate: (data: OnboardingFormData["consent"]) => void
  onSubmit: () => void
  onBack: () => void
  onEditStep: (step: number) => void
  submitting: boolean
  error: string | null
}

export function ConsentStep({
  formData,
  onUpdate,
  onSubmit,
  onBack,
  onEditStep,
  submitting,
  error,
}: ConsentStepProps) {
  const [agreed, setAgreed] = useState(false)

  function handleSubmit() {
    if (!agreed) return
    onUpdate({ credit_notes: true })
    onSubmit()
  }

  const { address, tax, payment } = formData

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-xl font-bold">Zusammenfassung</h2>
      <p className="mb-6 text-sm text-zinc-500">
        Bitte überprüfe deine Daten und bestätige.
      </p>

      <div className="space-y-4">
        {/* Address summary */}
        <div className="rounded-xl border border-zinc-100 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Rechnungsadresse</h3>
            <button
              onClick={() => onEditStep(2)}
              className="text-xs text-zinc-500 underline hover:text-zinc-700"
            >
              Bearbeiten
            </button>
          </div>
          {address && (
            <div className="text-sm text-zinc-600">
              <p>{address.name}</p>
              {address.company && <p>{address.company}</p>}
              <p>
                {address.street} {address.house_number}
              </p>
              <p>
                {address.postal_code} {address.city}
              </p>
              <p>{address.country_code === "DE" ? "Deutschland" : address.country_code === "AT" ? "Österreich" : "Schweiz"}</p>
            </div>
          )}
        </div>

        {/* Tax summary */}
        <div className="rounded-xl border border-zinc-100 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Steuerdaten</h3>
            <button
              onClick={() => onEditStep(3)}
              className="text-xs text-zinc-500 underline hover:text-zinc-700"
            >
              Bearbeiten
            </button>
          </div>
          {tax && (
            <div className="text-sm text-zinc-600">
              <p>Steuernummer: {tax.tax_number}</p>
              <p>{tax.is_vat_liable ? "Umsatzsteuerpflichtig" : "Kleinunternehmer (§19 UStG)"}</p>
              {tax.is_vat_liable && tax.vat_id && <p>USt-IdNr.: {tax.vat_id}</p>}
            </div>
          )}
        </div>

        {/* Payment summary */}
        <div className="rounded-xl border border-zinc-100 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Zahlungsdaten</h3>
            <button
              onClick={() => onEditStep(4)}
              className="text-xs text-zinc-500 underline hover:text-zinc-700"
            >
              Bearbeiten
            </button>
          </div>
          {payment && (
            <div className="text-sm text-zinc-600">
              {payment.payout_method === "paypal" ? (
                <p>PayPal: {payment.paypal_email}</p>
              ) : (
                <>
                  <p>Banküberweisung</p>
                  <p>Kontoinhaber: {payment.account_holder_name}</p>
                  <p className="font-mono text-xs">
                    IBAN: {payment.iban?.replace(/(.{4})/g, "$1 ").trim()}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Consent checkbox */}
        <label className="flex cursor-pointer gap-3 rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-300">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-zinc-900"
          />
          <span className="text-sm text-zinc-700">
            Ich erteile der <strong>exe ist GmbH</strong> die Erlaubnis, in meinem Namen
            Abrechnungsgutschriften zu erstellen.
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="rounded-xl border border-zinc-200 px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          Zurück
        </button>
        <button
          onClick={handleSubmit}
          disabled={!agreed || submitting}
          className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Wird gespeichert..." : "Daten absenden"}
        </button>
      </div>
    </div>
  )
}
