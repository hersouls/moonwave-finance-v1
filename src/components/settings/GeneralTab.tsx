import { useState } from 'react'
import { Sun, Moon, Monitor, Info, HelpCircle, FileText, Minimize2, Maximize2, Square } from 'lucide-react'
import { clsx } from 'clsx'
import { COLOR_PALETTES, BACKUP_CONFIG, UI_DELAYS } from '@/utils/constants'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Button } from '@/components/ui/Button'
import { ToggleSwitch } from './ToggleSwitch'
import { formatRelativeTime } from '@/utils/format'
import type { Settings, ThemeMode, ColorPalette, Density } from '@/lib/types'

const DENSITY_OPTIONS: { value: Density; label: string; description: string; icon: typeof Minimize2 }[] = [
  { value: 'compact', label: '컴팩트', description: '더 많은 정보', icon: Minimize2 },
  { value: 'comfortable', label: '표준', description: '기본 밀도', icon: Square },
  { value: 'spacious', label: '넓게', description: '여유로운 여백', icon: Maximize2 },
]

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
  const exchangeRate = useSettingsStore((s) => s.settings.exchangeRate)
  const setExchangeRate = useSettingsStore((s) => s.setExchangeRate)
  const setDensity = useSettingsStore((s) => s.setDensity)
  const toggleOledMode = useSettingsStore((s) => s.toggleOledMode)
  const toggleHideAmounts = useSettingsStore((s) => s.toggleHideAmounts)
  const toggleTimeBasedTheme = useSettingsStore((s) => s.toggleTimeBasedTheme)
  const density = useSettingsStore((s) => s.settings.density) ?? 'comfortable'
  const oledMode = useSettingsStore((s) => !!s.settings.oledMode)
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)
  const timeBasedTheme = useSettingsStore((s) => !!s.settings.timeBasedTheme)
  const [rateInput, setRateInput] = useState(String(exchangeRate?.usdToKrw ?? 1350))

  const handleOpenFAQ = () => {
    closeSettingsModal()
    setTimeout(() => openFAQModal(), UI_DELAYS.MODAL_TRANSITION)
  }

  const handleOpenTerms = () => {
    closeSettingsModal()
    setTimeout(() => openTermsModal(), UI_DELAYS.MODAL_TRANSITION)
  }

  return (
    <div className="space-y-8">
      {/* Theme Selection */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3">화면 테마</h3>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onChange({ theme: value })}
              className={clsx(
                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                draft.theme === value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-base hover:bg-[var(--hover-bg)]'
              )}
            >
              <Icon className={clsx(
                'w-6 h-6',
                draft.theme === value
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-sub'
              )} />
              <span className={clsx(
                'text-body3',
                draft.theme === value
                  ? 'text-primary-700 dark:text-primary-300'
                  : 'text-sub'
              )}>
                {label}
              </span>
            </button>
          ))}
        </div>
        {draft.theme === 'system' && (
          <p className="text-caption text-sub mt-2">
            시스템 설정에 따라 자동으로 변경됩니다
          </p>
        )}
      </section>

      {/* Display Density — v2 */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3">표시 밀도</h3>
        <div className="grid grid-cols-3 gap-3">
          {DENSITY_OPTIONS.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setDensity(value)}
              className={clsx(
                'flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all',
                density === value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-base hover:bg-[var(--hover-bg)]'
              )}
              aria-pressed={density === value}
            >
              <Icon className={clsx(
                'w-5 h-5',
                density === value ? 'text-primary-600 dark:text-primary-400' : 'text-sub'
              )} />
              <span className={clsx(
                'text-body3',
                density === value ? 'text-primary-700 dark:text-primary-300' : 'text-sub'
              )}>
                {label}
              </span>
              <span className="text-caption text-disabled">{description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Premium Display Options — v2 */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3">화면 옵션</h3>
        <div className="p-4 bg-surface-secondary rounded-xl space-y-4">
          <ToggleSwitch
            checked={oledMode}
            onChange={() => toggleOledMode()}
            label="AMOLED 절약 모드"
            description="다크 모드에서 순수 블랙 배경으로 전환합니다"
            disabled={draft.theme !== 'dark' && draft.theme !== 'system'}
          />
          <ToggleSwitch
            checked={timeBasedTheme}
            onChange={() => toggleTimeBasedTheme()}
            label="시간대 자동 테마"
            description="아침/낮/저녁/밤에 따라 색상 톤을 자동 조정합니다"
          />
          <ToggleSwitch
            checked={hideAmounts}
            onChange={() => toggleHideAmounts()}
            label="금액 숨기기"
            description="모든 금액을 가립니다. 호버하면 일시적으로 표시됩니다"
          />
        </div>
      </section>

      {/* Color Palette */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3">강조 색상</h3>
        <div className="grid grid-cols-5 gap-2">
          {(Object.values(COLOR_PALETTES) as { id: ColorPalette; nameKo: string; colors: { primary: string } }[]).map((palette) => (
            <button
              key={palette.id}
              onClick={() => onChange({ colorPalette: palette.id })}
              className={clsx(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all',
                draft.colorPalette === palette.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-transparent hover:bg-[var(--hover-bg)]'
              )}
            >
              <div
                className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-[var(--surface-primary)] elevation-1"
                style={{ backgroundColor: palette.colors.primary }}
              />
              <span className="text-caption text-sub">{palette.nameKo}</span>
            </button>
          ))}
        </div>
        {draft.theme === 'dark' && (
          <p className="text-caption text-sub mt-2">
            다크 모드에서는 색상이 자동 조정됩니다
          </p>
        )}
      </section>

      {/* Currency Unit */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3">통화 단위</h3>
        <div className="flex gap-2">
          {([
            { value: 'won' as const, label: '₩ 원 (KRW)' },
            { value: 'dollar' as const, label: '$ 달러 (USD)' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onChange({ currencyUnit: value })}
              className={clsx(
                'flex-1 py-2.5 px-4 rounded-lg border-2 text-body3 transition-all',
                draft.currencyUnit === value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-base text-sub hover:bg-[var(--hover-bg)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Exchange Rate */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3">USD/KRW 환율</h3>
        <div className="p-4 bg-surface-secondary rounded-xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-sub whitespace-nowrap">1 USD =</span>
            <input
              type="number"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={() => {
                const v = Number(rateInput)
                if (v > 0) setExchangeRate(v)
                else setRateInput(String(exchangeRate?.usdToKrw ?? 1350))
              }}
              className="input-base w-32 tabular-nums"
            />
            <span className="text-sm text-sub">KRW</span>
          </div>
          {exchangeRate?.lastUpdated && (
            <p className="text-caption text-disabled">
              마지막 업데이트: {formatRelativeTime(exchangeRate.lastUpdated)}
            </p>
          )}
          <p className="text-caption text-disabled">
            구독 합산 금액 계산에 사용됩니다
          </p>
        </div>
      </section>

      {/* High Contrast */}
      <section>
        <h3 className="text-body3-semi text-heading mb-3">접근성</h3>
        <div className="p-4 bg-surface-secondary rounded-xl">
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
        <h3 className="text-body3-semi text-heading mb-3">앱 정보</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-4 py-3 bg-surface-secondary rounded-xl">
            <Info className="w-4 h-4 text-disabled" />
            <span className="text-sm text-sub">
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
