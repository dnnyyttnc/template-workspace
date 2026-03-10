"use client"

import { useState } from "react"
import type { OnboardingFormData } from "@/types/database"

type PaymentData = OnboardingFormData["payment"]

interface PaymentStepProps {
  data?: PaymentData
  onUpdate: (data: PaymentData) => void
  onNext: () => void
  onBack: () => void
}

function formatIban(value: string): string {
  const clean = value.replace(/\s/g, "").toUpperCase()
  return clean.replace(/(.{4})/g, "$1 ").trim()
}

export function PaymentStep({ data, onUpdate, onNext, onBack }: PaymentStepProps) {
  const [form, setForm] = useState<PaymentData>({
    payout_method: data?.payout_method || "bank_transfer",
    paypal_email: data?.paypal_email || "",
    iban: data?.iban || "",
    bic: data?.bic || "",
    account_holder_name: data?.account_holder_name || "",
    bank_name: data?.bank_name || "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleNext() {
    const newErrors: Record<string, string> = {}

    if (form.payout_method === "paypal") {
      if (!form.paypal_email?.trim()) newErrors.paypal_email = "Pflichtfeld"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.paypal_email))
        newErrors.paypal_email = "Ungültige E-Mail"
    }

    if (form.payout_method === "bank_transfer") {
      if (!form.iban?.replace(/\s/g, "").trim()) newErrors.iban = "Pflichtfeld"
      if (!form.account_holder_name?.trim()) newErrors.account_holder_name = "Pflichtfeld"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Clean IBAN before saving
    const cleanedForm = {
      ...form,
      iban: form.iban?.replace(/\s/g, "") || "",
    }
    onUpdate(cleanedForm)
    onNext()
  }

  const inputClass = (field: string) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 ${
      errors[field] ? "border-red-300 bg-red-50" : "border-zinc-200"
    }`

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-xl font-bold">Zahlungsdaten</h2>
      <p className="mb-6 text-sm text-zinc-500">
        Wie sollen wir dir dein Geld auszahlen?
      </p>

      <div className="space-y-4">
        {/* Method selection */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, payout_method: "bank_transfer" }))}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
              form.payout_method === "bank_transfer"
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
            </svg>
            <span className="text-sm font-medium">Banküberweisung</span>
          </button>

          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, payout_method: "paypal" }))}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
              form.payout_method === "paypal"
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .757-.65h6.803c2.264 0 3.858.723 4.735 2.148.406.66.636 1.397.683 2.191.05.836-.06 1.795-.328 2.848l-.011.046v.041c-.6 2.681-1.97 4.185-3.098 4.94-.78.521-1.667.835-2.561 1.005-.357.068-.735.108-1.14.122-.22.008-.449.011-.688.011H8.54a.77.77 0 0 0-.757.65l-.707 4.266z" />
            </svg>
            <span className="text-sm font-medium">PayPal</span>
          </button>
        </div>

        {/* Bank transfer fields */}
        {form.payout_method === "bank_transfer" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Kontoinhaber *
              </label>
              <input
                type="text"
                value={form.account_holder_name}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, account_holder_name: e.target.value }))
                  if (errors.account_holder_name) setErrors((prev) => ({ ...prev, account_holder_name: "" }))
                }}
                placeholder="Max Mustermann"
                className={inputClass("account_holder_name")}
              />
              {errors.account_holder_name && (
                <p className="mt-1 text-xs text-red-500">{errors.account_holder_name}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">IBAN *</label>
              <input
                type="text"
                value={formatIban(form.iban || "")}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\s/g, "").toUpperCase()
                  setForm((prev) => ({ ...prev, iban: raw }))
                  if (errors.iban) setErrors((prev) => ({ ...prev, iban: "" }))
                }}
                placeholder="DE89 3704 0044 0532 0130 00"
                className={`${inputClass("iban")} font-mono tracking-wider`}
                maxLength={34}
              />
              {errors.iban && (
                <p className="mt-1 text-xs text-red-500">{errors.iban}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  BIC <span className="text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.bic}
                  onChange={(e) => setForm((prev) => ({ ...prev, bic: e.target.value.toUpperCase() }))}
                  placeholder="COBADEFFXXX"
                  className={`${inputClass("bic")} font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Bankname <span className="text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.bank_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, bank_name: e.target.value }))}
                  placeholder="Commerzbank"
                  className={inputClass("bank_name")}
                />
              </div>
            </div>
          </div>
        )}

        {/* PayPal fields */}
        {form.payout_method === "paypal" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              PayPal E-Mail *
            </label>
            <input
              type="email"
              value={form.paypal_email}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, paypal_email: e.target.value }))
                if (errors.paypal_email) setErrors((prev) => ({ ...prev, paypal_email: "" }))
              }}
              placeholder="deine@email.de"
              className={inputClass("paypal_email")}
            />
            {errors.paypal_email && (
              <p className="mt-1 text-xs text-red-500">{errors.paypal_email}</p>
            )}
          </div>
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
          onClick={handleNext}
          className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
