const STEP_LABELS = ["Willkommen", "Adresse", "Steuern", "Zahlung", "Bestätigung", "Fertig"]

export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-zinc-900 transition-all duration-500 ease-out"
          style={{ width: `${((current - 1) / (total - 1)) * 100}%` }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const isActive = stepNum === current
          const isDone = stepNum < current
          return (
            <span
              key={label}
              className={`text-xs transition-colors ${
                isActive
                  ? "font-semibold text-zinc-900"
                  : isDone
                    ? "text-zinc-500"
                    : "text-zinc-300"
              }`}
            >
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
