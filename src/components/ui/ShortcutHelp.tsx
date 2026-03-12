import { Dialog, DialogHeader, DialogBody } from '@/components/ui/Dialog'

interface ShortcutHelpProps {
  open: boolean
  onClose: () => void
}

const shortcuts = [
  { group: '네비게이션', items: [
    { keys: ['G', 'D'], description: '대시보드로 이동' },
    { keys: ['G', 'A'], description: '자산 페이지로 이동' },
    { keys: ['G', 'L'], description: '가계부로 이동' },
    { keys: ['G', 'R'], description: '분석 페이지로 이동' },
    { keys: ['G', 'S'], description: '구독 페이지로 이동' },
  ]},
  { group: '액션', items: [
    { keys: ['N'], description: '새 거래 추가' },
    { keys: ['Ctrl', 'K'], description: '검색 열기' },
    { keys: ['Ctrl', 'Z'], description: '실행 취소' },
    { keys: ['Ctrl', 'Shift', 'Z'], description: '다시 실행' },
    { keys: ['?'], description: '단축키 도움말' },
  ]},
]

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-caption font-mono text-zinc-600 dark:text-zinc-300">
      {children}
    </kbd>
  )
}

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader title="키보드 단축키" onClose={onClose} />
      <DialogBody>
        <div className="space-y-6">
          {shortcuts.map((group) => (
            <div key={group.group}>
              <h4 className="text-body3-semi text-zinc-500 dark:text-zinc-400 mb-3">{group.group}</h4>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.description} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-caption text-zinc-400">+</span>}
                          <KeyBadge>{key}</KeyBadge>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogBody>
    </Dialog>
  )
}
