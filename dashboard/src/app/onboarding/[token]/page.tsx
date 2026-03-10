"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import type { OnboardingContext, OnboardingFormData } from "@/types/database"
import { ProgressBar } from "./components/ProgressBar"
import { WelcomeStep } from "./components/WelcomeStep"
import { AddressStep } from "./components/AddressStep"
import { TaxStep } from "./components/TaxStep"
import { PaymentStep } from "./components/PaymentStep"
import { ConsentStep } from "./components/ConsentStep"
import { SuccessStep } from "./components/SuccessStep"

const TOTAL_STEPS = 6

export default function OnboardingPage() {
  const params = useParams<{ token: string }>()
  const [context, setContext] = useState<OnboardingContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [formData, setFormData] = useState<Partial<OnboardingFormData>>({})

  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(`/api/onboarding/${params.token}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || "Unbekannter Fehler")
        } else {
          const data = await res.json()
          setContext(data)
          if (data.already_completed) setStep(6)
        }
      } catch {
        setError("Verbindungsfehler. Bitte versuche es erneut.")
      }
      setLoading(false)
    }
    validate()
  }, [params.token])

  function updateFormData(partial: Partial<OnboardingFormData>) {
    setFormData((prev) => ({ ...prev, ...partial }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/onboarding/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        setStep(6)
      } else {
        const data = await res.json()
        setSubmitError(data.error || "Fehler beim Speichern.")
      }
    } catch {
      setSubmitError("Verbindungsfehler. Bitte versuche es erneut.")
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-2 w-full animate-pulse rounded-full bg-zinc-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
      </div>
    )
  }

  if (error && !context) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold">Link ungültig</h2>
        <p className="mb-4 text-sm text-zinc-500">{error}</p>
        <p className="text-xs text-zinc-400">
          Bei Fragen: <a href="mailto:accounting@exe-ist.de" className="underline">accounting@exe-ist.de</a>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {step < 6 && <ProgressBar current={step} total={TOTAL_STEPS} />}

      {step === 1 && (
        <WelcomeStep
          artistName={context!.artist_name}
          pendingAmount={context!.pending_amount}
          pendingMonths={context!.pending_months}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <AddressStep
          data={formData.address}
          onUpdate={(address) => updateFormData({ address })}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <TaxStep
          data={formData.tax}
          onUpdate={(tax) => updateFormData({ tax })}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <PaymentStep
          data={formData.payment}
          onUpdate={(payment) => updateFormData({ payment })}
          onNext={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      )}
      {step === 5 && (
        <ConsentStep
          formData={formData}
          onUpdate={(consent) => updateFormData({ consent })}
          onSubmit={handleSubmit}
          onBack={() => setStep(4)}
          onEditStep={setStep}
          submitting={submitting}
          error={submitError}
        />
      )}
      {step === 6 && <SuccessStep artistName={context!.artist_name} />}
    </div>
  )
}
