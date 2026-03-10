"use client"

import { useState } from "react"
import type { OnboardingFormData } from "@/types/database"

type AddressData = OnboardingFormData["address"]

interface AddressStepProps {
  data?: AddressData
  onUpdate: (data: AddressData) => void
  onNext: () => void
  onBack: () => void
}

export function AddressStep({ data, onUpdate, onNext, onBack }: AddressStepProps) {
  const [form, setForm] = useState<AddressData>({
    name: data?.name || "",
    company: data?.company || "",
    street: data?.street || "",
    house_number: data?.house_number || "",
    postal_code: data?.postal_code || "",
    city: data?.city || "",
    country_code: data?.country_code || "DE",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof AddressData, string>>>({})

  function update(field: keyof AddressData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function handleNext() {
    const newErrors: Partial<Record<keyof AddressData, string>> = {}
    if (!form.name.trim()) newErrors.name = "Pflichtfeld"
    if (!form.street.trim()) newErrors.street = "Pflichtfeld"
    if (!form.postal_code.trim()) newErrors.postal_code = "Pflichtfeld"
    if (!form.city.trim()) newErrors.city = "Pflichtfeld"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onUpdate(form)
    onNext()
  }

  const inputClass = (field: keyof AddressData) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 ${
      errors[field] ? "border-red-300 bg-red-50" : "border-zinc-200"
    }`

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-xl font-bold">Rechnungsadresse</h2>
      <p className="mb-6 text-sm text-zinc-500">
        Unter welcher Adresse sollen deine Gutschriften ausgestellt werden?
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Vollständiger Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Max Mustermann"
            className={inputClass("name")}
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Firma <span className="text-zinc-400">(optional)</span>
          </label>
          <input
            type="text"
            value={form.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="Firmenname GmbH"
            className={inputClass("company")}
          />
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Straße *</label>
            <input
              type="text"
              value={form.street}
              onChange={(e) => update("street", e.target.value)}
              placeholder="Musterstraße"
              className={inputClass("street")}
            />
            {errors.street && <p className="mt-1 text-xs text-red-500">{errors.street}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Hausnr.</label>
            <input
              type="text"
              value={form.house_number}
              onChange={(e) => update("house_number", e.target.value)}
              placeholder="42a"
              className={inputClass("house_number")}
            />
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">PLZ *</label>
            <input
              type="text"
              value={form.postal_code}
              onChange={(e) => update("postal_code", e.target.value)}
              placeholder="10115"
              className={inputClass("postal_code")}
            />
            {errors.postal_code && <p className="mt-1 text-xs text-red-500">{errors.postal_code}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Stadt *</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Berlin"
              className={inputClass("city")}
            />
            {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Land</label>
          <select
            value={form.country_code}
            onChange={(e) => update("country_code", e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
          >
            <option value="DE">Deutschland</option>
            <option value="AT">Österreich</option>
            <option value="CH">Schweiz</option>
          </select>
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
