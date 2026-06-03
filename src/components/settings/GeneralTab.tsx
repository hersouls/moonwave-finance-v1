import { useState } from 'react'
import { Sun, Info, HelpCircle, FileText, Rows3, Palette, SlidersHorizontal, Coins, ArrowLeftRight, History, Eye } from 'lucide-react'
import { clsx } from 'clsx'
import { COLOR_PALETTES, BACKUP_CONFIG, UI_DELAYS } from '@/utils/constants'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Button } from '@/components/ui/Button'
import { ToggleSwitch } from './ToggleSwitch'
import { FormSectionLabel, SegmentedControl } from '@/components/ui/CreateFormPrimitives'
import { formatRelativeTime } from '@/utils/format'
import type { Settings, ThemeMode, ColorPalette, Density } from '@/lib/types'

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'compact', label: '컴팩트' },
  { value: 'comfortable', label: '표준' },
  { value: 'spacious', label: '넓게' },
]

interface GeneralTabProps {
  draft: Settings
  onChange: (updates: Partial<Settings>) => void
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
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
  const toggleAutoCarryForward = useSettingsStore((s) => s.toggleAutoCarryForward)
  const autoCarryForward = useSettingsStore((s) => s.settings.autoCarryForward !== false)
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
        <FormSectionLabel icon={Sun}>화면 테마</FormSectionLabel>
        <SegmentedControl<ThemeMode>
          options={THEME_OPTIONS}
          value={draft.theme}
          onChange={(value) => onChange({ theme: value })}
          layoutId="settings-theme"
          ariaLabel="화면 테마"
        />
        {draft.theme === 'system' && (
          <p className="text-caption text-sub mt-2">
            시스템 설정에 따라 자동으로 변경됩니다
          </p>
        )}
      </section>

      {/* Display Density — v2 */}
      <section>
        <FormSectionLabel icon={Rows3} hint="목록 간격">표시 밀도</FormSectionLabel>
        <SegmentedControl<Density>
          options={DENSITY_OPTIONS}
          value={density}
          onChange={(value) => setDensity(value)}
          layoutId="settings-density"
          ariaLabel="표시 밀도"
        />
      </section>

      {/* Premium Display Options — v2 */}
      <section>
        <FormSectionLabel icon={SlidersHorizontal}>화면 옵션</FormSectionLabel>
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
        <FormSectionLabel icon={Palette}>강조 색상</FormSectionLabel>
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
                className="w-8 h-8 rounded-full ring-2 ring-[var(--surface-primary)] elevation-1"
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
        <FormSectionLabel icon={Coins}>통화 단위</FormSectionLabel>
        <SegmentedControl<'won' | 'dollar'>
          options={[
            { value: 'won', label: '₩ 원 (KRW)' },
            { value: 'dollar', label: '$ 달러 (USD)' },
          ]}
          value={draft.currencyUnit}
          onChange={(value) => onChange({ currencyUnit: value })}
          layoutId="settings-currency"
          ariaLabel="통화 단위"
        />
      </section>

      {/* Exchange Rate */}
      <section>
        <FormSectionLabel icon={ArrowLeftRight}>USD/KRW 환율</FormSectionLabel>
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

      {/* 자산 가치 기록 — 자동 이어쓰기 */}
      <section>
        <FormSectionLabel icon={History}>자산 가치 기록</FormSectionLabel>
        <div className="p-4 bg-surface-secondary rounded-xl">
          <ToggleSwitch
            checked={autoCarryForward}
            onChange={() => toggleAutoCarryForward()}
            label="값 자동 이어쓰기"
            description="별도 입력이 없으면 어제 값을 오늘로 자동 저장해 일자별 연속성을 유지합니다"
          />
        </div>
      </section>

      {/* High Contrast */}
      <section>
        <FormSectionLabel icon={Eye}>접근성</FormSectionLabel>
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
        <FormSectionLabel icon={Info}>앱 정보</FormSectionLabel>
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
