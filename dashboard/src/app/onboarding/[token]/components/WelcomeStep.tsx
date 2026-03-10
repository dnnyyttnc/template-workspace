interface WelcomeStepProps {
  artistName: string
  pendingAmount: number
  pendingMonths: number
  onNext: () => void
}

function formatEuro(amount: number) {
  return amount.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function WelcomeStep({
  artistName,
  pendingAmount,
  pendingMonths,
  onNext,
}: WelcomeStepProps) {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-2xl font-bold">Hallo {artistName}!</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Schön, dass du dabei bist.
      </p>

      {/* Wallet display */}
      {pendingAmount > 0 && (
        <div className="mb-6 rounded-xl bg-emerald-50 p-6 text-center">
          <p className="mb-1 text-sm text-emerald-700">Dein aktuelles Guthaben</p>
          <p className="text-3xl font-bold text-emerald-800">
            {formatEuro(pendingAmount)} €
          </p>
          <p className="mt-1 text-sm text-emerald-600">
            aus {pendingMonths} {pendingMonths === 1 ? "Monat" : "Monaten"} warten auf dich
          </p>
        </div>
      )}

      <p className="mb-4 text-sm text-zinc-600">
        Um dir dein Geld auszuzahlen, brauchen wir noch ein paar Daten von dir.
        Das dauert nur <strong>2 Minuten</strong>.
      </p>

      <ul className="mb-6 space-y-2 text-sm text-zinc-600">
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-xs">1</span>
          Rechnungsadresse
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-xs">2</span>
          Steuerdaten
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-xs">3</span>
          Zahlungsdaten
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-xs">4</span>
          Kurze Bestätigung
        </li>
      </ul>

      <button
        onClick={onNext}
        className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
      >
        Los geht&apos;s
      </button>
    </div>
  )
}
