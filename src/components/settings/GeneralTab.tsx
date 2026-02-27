import { Sun, Moon, Monitor, Info, HelpCircle, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import { COLOR_PALETTES, BACKUP_CONFIG } from '@/utils/constants'
import { useUIStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/Button'
import { ToggleSwitch } from './ToggleSwitch'
import type { Settings, ThemeMode, ColorPalette } from '@/lib/types'

interface GeneralTabProps {
  draft: Settings
  onChange: (updates: Partial<Settings>) => void
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '라이트', icon: Sun },
  { value: 'dark', label: '다크', icon: Moon },
  { value: 'system', label: '시스템', icon: Monitor },
]

export function GeneralTab({ draft, onChange }: GeneralTabProps) {
  const openFAQModal = useUIStore((s) => s.openFAQModal)
  const openTermsModal = useUIStore((s) => s.openTermsModal)
  const closeSettingsModal = useUIStore((s) => s.closeSettingsModal)

  const handleOpenFAQ = () => {
    closeSettingsModal()
    setTimeout(() => openFAQModal(), 150)
  }

  const handleOpenTerms = () => {
    closeSettingsModal()
    setTimeout(() => openTermsModal(), 150)
  }

  return (
    <div className="space-y-8">
      {/* Theme Selection */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">화면 테마</h3>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onChange({ theme: value })}
              className={clsx(
                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                draft.theme === value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              )}
            >
              <Icon className={clsx(
                'w-6 h-6',
                draft.theme === value
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              )} />
              <span className={clsx(
                'text-sm font-medium',
                draft.theme === value
                  ? 'text-primary-700 dark:text-primary-300'
                  : 'text-zinc-600 dark:text-zinc-400'
              )}>
                {label}
              </span>
            </button>
          ))}
        </div>
        {draft.theme === 'system' && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
            시스템 설정에 따라 자동으로 변경됩니다
          </p>
        )}
      </section>

      {/* Color Palette */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">강조 색상</h3>
        <div className="grid grid-cols-5 gap-2">
          {(Object.values(COLOR_PALETTES) as { id: ColorPalette; nameKo: string; colors: { primary: string } }[]).map((palette) => (
            <button
              key={palette.id}
              onClick={() => onChange({ colorPalette: palette.id })}
              className={clsx(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all',
                draft.colorPalette === palette.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800'
              )}
            >
              <div
                className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-zinc-800 shadow-sm"
                style={{ backgroundColor: palette.colors.primary }}
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{palette.nameKo}</span>
            </button>
          ))}
        </div>
        {draft.theme === 'dark' && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
            다크 모드에서는 색상이 자동 조정됩니다
          </p>
        )}
      </section>

      {/* Currency Unit */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">통화 단위</h3>
        <div className="flex gap-2">
          {([
            { value: 'won' as const, label: '₩ 원 (KRW)' },
            { value: 'dollar' as const, label: '$ 달러 (USD)' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onChange({ currencyUnit: value })}
              className={clsx(
                'flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all',
                draft.currencyUnit === value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* High Contrast */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">접근성</h3>
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          <ToggleSwitch
            checked={draft.highContrastMode}
            onChange={(v) => onChange({ highContrastMode: v })}
            label="고대비 모드"
            description="시각적 대비를 높여 가독성을 개선합니다"
          />
        </div>
      </section>

      {/* App Info */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">앱 정보</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <Info className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {BACKUP_CONFIG.APP_NAME} v{BACKUP_CONFIG.CURRENT_VERSION}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenFAQ}
              leftIcon={<HelpCircle className="w-4 h-4" />}
            >
              자주 묻는 질문
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenTerms}
              leftIcon={<FileText className="w-4 h-4" />}
            >
              이용약관
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
