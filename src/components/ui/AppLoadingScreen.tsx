export function AppLoadingScreen() {
  return (
    <div className="aurora-bg min-h-screen flex flex-col items-center justify-center bg-surface-secondary">
      <div className="animate-pulse mb-4">
        <img src="/icons/icon-192.png" alt="FIN" className="w-16 h-16 mx-auto rounded-2xl el-glow-primary" />
      </div>
      <h1 className="text-h1-fluid text-heading mb-3 tracking-tight">
        FIN
      </h1>
      <div className="flex items-center gap-2 text-body3 text-disabled">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span>불러오는 중...</span>
      </div>
    </div>
  )
}
