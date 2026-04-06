export function AppLoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-secondary">
      <div className="animate-pulse mb-4">
        <img src="/icons/icon-192.png" alt="FIN" className="w-16 h-16 mx-auto rounded-2xl" />
      </div>
      <h1 className="text-title2 text-heading mb-3">
        FIN
      </h1>
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span>불러오는 중...</span>
      </div>
    </div>
  )
}
