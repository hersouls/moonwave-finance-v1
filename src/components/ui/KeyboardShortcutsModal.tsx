import { Dialog, DialogHeader } from './Dialog'
import { useUIStore } from '@/stores/uiStore'

interface Shortcut {
  keys: string[]
  label: string
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: '전역',
    items: [
      { keys: ['Ctrl', 'K'], label: '명령 팔레트 열기' },
      { keys: ['/'], label: '거래 검색' },
      { keys: ['n'], label: '새 거래 추가' },
      { keys: ['?'], label: '이 단축키 도움말' },
      { keys: ['Ctrl', 'Z'], label: '실행 취소' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: '다시 실행' },
    ],
  },
  {
    title: '이동 (g 누른 뒤)',
    items: [
      { keys: ['g', 'd'], label: '대시보드' },
      { keys: ['g', 'l'], label: '가계부 (지출)' },
      { keys: ['g', 'a'], label: '자본관리' },
      { keys: ['g', 'b'], label: '부채관리' },
      { keys: ['g', 's'], label: '구독' },
      { keys: ['g', 'i'], label: '투자수익' },
      { keys: ['g', 'r'], label: '분석' },
      { keys: ['g', 'c'], label: '가계부 캘린더' },
    ],
  },
]

/** '?' cheat-sheet listing the global keyboard shortcuts (power-user, desktop). */
export function KeyboardShortcutsModal() {
  const open = useUIStore((s) => s.isShortcutsModalOpen)
  const close = useUIStore((s) => s.closeShortcutsModal)

  return (
    <Dialog open={open} onClose={close} size="lg">
      <DialogHeader title="키보드 단축키" description="대부분의 작업을 키보드만으로 수행할 수 있습니다." onClose={close} />
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-label3 font-semibold uppercase tracking-wide text-disabled">{g.title}</h3>
            <ul className="space-y-1.5">
              {g.items.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="text-body3 text-body">{s.label}</span>
                  <span className="flex flex-shrink-0 items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-[24px] rounded-md bg-surface-tertiary px-1.5 py-0.5 text-center text-label4 font-semibold text-sub ring-1 ring-[var(--border-default)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
