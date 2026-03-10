"use client"

import { useState } from "react"
import type { OnboardingFormData } from "@/types/database"

type TaxData = OnboardingFormData["tax"]

interface TaxStepProps {
  data?: TaxData
  onUpdate: (data: TaxData) => void
  onNext: () => void
  onBack: () => void
}

export function TaxStep({ data, onUpdate, onNext, onBack }: TaxStepProps) {
  const [form, setForm] = useState<TaxData>({
    tax_number: data?.tax_number || "",
    is_vat_liable: data?.is_vat_liable ?? false,
    vat_id: data?.vat_id || "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleNext() {
    const newErrors: Record<string, string> = {}
    if (!form.tax_number.trim()) newErrors.tax_number = "Pflichtfeld"
    if (form.is_vat_liable && !form.vat_id?.trim()) newErrors.vat_id = "Pflichtfeld bei MwSt-Pflicht"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onUpdate(form)
    onNext()
  }

  const inputClass = (field: string) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 ${
      errors[field] ? "border-red-300 bg-red-50" : "border-zinc-200"
    }`

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-xl font-bold">Steuerdaten</h2>
      <p className="mb-6 text-sm text-zinc-500">
        Wir brauchen deine Steuernummer für die Gutschriften.
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Steuernummer *
          </label>
          <input
            type="text"
            value={form.tax_number}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, tax_number: e.target.value }))
              if (errors.tax_number) setErrors((prev) => ({ ...prev, tax_number: "" }))
            }}
            placeholder="12/345/67890"
            className={inputClass("tax_number")}
          />
          {errors.tax_number && (
            <p className="mt-1 text-xs text-red-500">{errors.tax_number}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-700">
            Bist du umsatzsteuerpflichtig?
          </label>
          <div className="space-y-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                !form.is_vat_liable ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="vat"
                checked={!form.is_vat_liable}
                onChange={() => setForm((prev) => ({ ...prev, is_vat_liable: false }))}
                className="accent-zinc-900"
              />
              <div>
                <p className="text-sm font-medium">Nein, Kleinunternehmer (§19 UStG)</p>
                <p className="text-xs text-zinc-500">Du erhältst den Netto-Betrag</p>
              </div>
            </label>

            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                form.is_vat_liable ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="vat"
                checked={form.is_vat_liable}
                onChange={() => setForm((prev) => ({ ...prev, is_vat_liable: true }))}
                className="accent-zinc-900"
              />
              <div>
                <p className="text-sm font-medium">Ja, umsatzsteuerpflichtig</p>
                <p className="text-xs text-zinc-500">Du erhältst Netto + 19% MwSt</p>
              </div>
            </label>
          </div>
        </div>

        {form.is_vat_liable && (
          <div className="animate-in fade-in">
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              USt-IdNr. *
            </label>
            <input
              type="text"
              value={form.vat_id}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, vat_id: e.target.value }))
                if (errors.vat_id) setErrors((prev) => ({ ...prev, vat_id: "" }))
              }}
              placeholder="DE123456789"
              className={inputClass("vat_id")}
            />
            {errors.vat_id && (
              <p className="mt-1 text-xs text-red-500">{errors.vat_id}</p>
            )}
          </div>
        )}

        <div className="rounded-lg bg-zinc-50 p-4 text-xs text-zinc-500">
          <strong>Info:</strong> Kleinunternehmer erhalten den Netto-Betrag.
          Umsatzsteuerpflichtige Artists erhalten Netto + 19% MwSt auf der Gutschrift.
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="rounded-xl border border-zinc-200 px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          Zurück
        </button>
        <button
          onClick={handleNext}
          className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
