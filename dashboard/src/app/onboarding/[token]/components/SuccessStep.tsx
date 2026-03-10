export function SuccessStep({ artistName }: { artistName: string }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
      {/* Animated check */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 animate-bounce-once">
        <svg
          className="h-8 w-8 text-emerald-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h2 className="mb-2 text-2xl font-bold">Fertig!</h2>
      <p className="mb-4 text-sm text-zinc-600">
        Vielen Dank, <strong>{artistName}</strong>. Deine Daten sind gespeichert.
      </p>
      <p className="text-sm text-zinc-500">
        Wir kümmern uns um den Rest. Deine nächste Gutschrift kommt bald per E-Mail.
      </p>

      <div className="mt-8 rounded-lg bg-zinc-50 p-4 text-xs text-zinc-400">
        Du kannst dieses Fenster jetzt schließen.
      </div>

      <style jsx>{`
        @keyframes bounce-once {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-bounce-once {
          animation: bounce-once 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
