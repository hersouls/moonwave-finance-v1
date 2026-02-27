export function AppLoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="animate-pulse mb-4">
        <img src="/favicon.svg" alt="" className="w-16 h-16 mx-auto" />
      </div>
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
        자산관리
      </h1>
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span>불러오는 중...</span>
      </div>
    </div>
  )
}
