import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Receipt, TrendingDown, Landmark, CreditCard, Calendar,
  Repeat, TrendingUp, BarChart3, User, Search, Plus, Settings, HelpCircle,
  Sun, Eye, EyeOff, Moon, Rows3, Command as CommandIcon, CornerDownLeft,
  type LucideIcon,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Density, ThemeMode } from '@/lib/types'

type Group = 'navigation' | 'action' | 'appearance' | 'help'

interface Command {
  id: string
  label: string
  group: Group
  keywords: string
  icon: LucideIcon
  hint?: string
  run: () => void
}

const GROUP_LABEL: Record<Group, string> = {
  navigation: '이동',
  action: '빠른 작업',
  appearance: '화면 / 테마',
  help: '도움말',
}

const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system']
const DENSITY_ORDER: Density[] = ['comfortable', 'compact', 'spacious']
const DENSITY_LABEL: Record<Density, string> = {
  comfortable: '보통', compact: '촘촘하게', spacious: '여유롭게',
}

/**
 * Command palette (Cmd/Ctrl+K). Power-user hub: navigate anywhere, quick-add,
 * search, and toggle every appearance setting from the keyboard. Renders the
 * panel top-anchored (desktop convention) with full keyboard navigation.
 */
export function CommandPalette() {
  const navigate = useNavigate()
  const isOpen = useUIStore((s) => s.isCommandPaletteOpen)
  const close = useUIStore((s) => s.closeCommandPalette)
  const setCurrentView = useUIStore((s) => s.setCurrentView)
  const openSearchModal = useUIStore((s) => s.openSearchModal)
  const openSettingsModal = useUIStore((s) => s.openSettingsModal)
  const openFAQModal = useUIStore((s) => s.openFAQModal)
  const openShortcutsModal = useUIStore((s) => s.openShortcutsModal)
  const openTransactionCreateModal = useUIStore((s) => s.openTransactionCreateModal)
  const openAssetCreateModal = useUIStore((s) => s.openAssetCreateModal)

  const theme = useSettingsStore((s) => s.settings.theme)
  const density = useSettingsStore((s) => s.settings.density ?? 'comfortable')
  const hideAmounts = useSettingsStore((s) => !!s.settings.hideAmounts)
  const oled = useSettingsStore((s) => !!s.settings.oledMode)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setDensity = useSettingsStore((s) => s.setDensity)
  const toggleOledMode = useSettingsStore((s) => s.toggleOledMode)
  const toggleHideAmounts = useSettingsStore((s) => s.toggleHideAmounts)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const go = (path: string, view?: Parameters<typeof setCurrentView>[0]) => {
    if (view) setCurrentView(view)
    navigate(path)
  }
  const goAndOpen = (path: string, opener: () => void) => {
    navigate(path)
    // let the destination page mount its modal, then flip the store flag
    setTimeout(opener, 60)
  }

  const commands = useMemo<Command[]>(() => {
    const cycleTheme = () => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length])
    const cycleDensity = () => setDensity(DENSITY_ORDER[(DENSITY_ORDER.indexOf(density) + 1) % DENSITY_ORDER.length])
    return [
      // ── Navigation ──
      { id: 'nav-dash', label: '대시보드', group: 'navigation', keywords: 'dashboard home 홈 메인', icon: LayoutDashboard, hint: 'g d', run: () => go('/', 'dashboard') },
      { id: 'nav-expense', label: '지출관리', group: 'navigation', keywords: 'ledger expense 가계부 지출', icon: TrendingDown, hint: 'g l', run: () => go('/ledger/expense', 'ledger') },
      { id: 'nav-income', label: '수입관리', group: 'navigation', keywords: 'ledger income 수입', icon: Receipt, run: () => go('/ledger/income', 'ledger') },
      { id: 'nav-assets', label: '자본관리', group: 'navigation', keywords: 'assets 자산 자본', icon: Landmark, hint: 'g a', run: () => go('/assets', 'assets') },
      { id: 'nav-liab', label: '부채관리', group: 'navigation', keywords: 'liabilities debt 부채 대출', icon: CreditCard, hint: 'g b', run: () => go('/liabilities', 'assets') },
      { id: 'nav-subs', label: '구독 관리', group: 'navigation', keywords: 'subscriptions 구독', icon: Repeat, hint: 'g s', run: () => go('/subscriptions', 'subscriptions') },
      { id: 'nav-invest', label: '투자수익', group: 'navigation', keywords: 'investments 투자 수익', icon: TrendingUp, hint: 'g i', run: () => go('/investments') },
      { id: 'nav-reports', label: '분석', group: 'navigation', keywords: 'reports analysis 통계 리포트 분석', icon: BarChart3, hint: 'g r', run: () => go('/reports', 'reports') },
      { id: 'nav-cal-ledger', label: '가계부 캘린더', group: 'navigation', keywords: 'calendar 달력 가계부', icon: Calendar, hint: 'g c', run: () => go('/ledger/calendar', 'ledger') },
      { id: 'nav-cal-asset', label: '자산 캘린더', group: 'navigation', keywords: 'calendar 달력 자산', icon: Calendar, run: () => go('/assets/calendar', 'assets') },
      { id: 'nav-profile', label: '프로필', group: 'navigation', keywords: 'profile account 계정', icon: User, run: () => go('/profile', 'profile') },
      // ── Actions ──
      { id: 'act-new-tx', label: '거래 추가', group: 'action', keywords: 'new transaction add 거래 입력 추가', icon: Plus, hint: 'n', run: () => goAndOpen('/ledger/expense', openTransactionCreateModal) },
      { id: 'act-new-asset', label: '자산 추가', group: 'action', keywords: 'new asset add 자산 추가', icon: Plus, run: () => goAndOpen('/assets', openAssetCreateModal) },
      { id: 'act-search', label: '거래 검색', group: 'action', keywords: 'search find 검색 찾기', icon: Search, hint: '/', run: openSearchModal },
      // ── Appearance ──
      { id: 'ap-theme', label: `테마 전환 (현재: ${theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '시스템'})`, group: 'appearance', keywords: 'theme dark light 테마 다크 라이트', icon: Sun, run: cycleTheme },
      { id: 'ap-density', label: `정보 밀도 (현재: ${DENSITY_LABEL[density]})`, group: 'appearance', keywords: 'density compact spacious 밀도 촘촘 여유', icon: Rows3, run: cycleDensity },
      { id: 'ap-oled', label: oled ? 'OLED 블랙 끄기' : 'OLED 블랙 켜기', group: 'appearance', keywords: 'oled black 블랙 amoled', icon: Moon, run: toggleOledMode },
      { id: 'ap-mask', label: hideAmounts ? '금액 표시' : '금액 숨기기', group: 'appearance', keywords: 'hide amount mask 금액 숨김 보안', icon: hideAmounts ? Eye : EyeOff, run: toggleHideAmounts },
      // ── Help ──
      { id: 'help-settings', label: '설정 열기', group: 'help', keywords: 'settings 설정 환경설정', icon: Settings, run: openSettingsModal },
      { id: 'help-faq', label: 'FAQ / 도움말', group: 'help', keywords: 'faq help 도움말 질문', icon: HelpCircle, run: openFAQModal },
      { id: 'help-keys', label: '키보드 단축키', group: 'help', keywords: 'keyboard shortcuts 단축키 키보드', icon: CommandIcon, hint: '?', run: openShortcutsModal },
    ]
  }, [theme, density, oled, hideAmounts, setTheme, setDensity, toggleOledMode, toggleHideAmounts, openSearchModal, openSettingsModal, openFAQModal, openShortcutsModal, openTransactionCreateModal, openAssetCreateModal]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => (c.label + ' ' + c.keywords).toLowerCase().includes(q))
  }, [query, commands])

  // Reset selection/query when opened/filtered
  useEffect(() => { if (isOpen) { setQuery(''); setSelected(0) } }, [isOpen])
  useEffect(() => { setSelected(0) }, [query])

  const execute = (cmd: Command | undefined) => {
    if (!cmd) return
    close()
    cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      execute(filtered[selected])
    } else if (e.key === 'Home') {
      setSelected(0)
    } else if (e.key === 'End') {
      setSelected(filtered.length - 1)
    }
  }

  // keep the active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // group the filtered list while keeping a flat index for keyboard nav
  let runningIndex = -1
  const groups: { group: Group; items: { cmd: Command; idx: number }[] }[] = []
  for (const cmd of filtered) {
    runningIndex++
    const idx = runningIndex
    const last = groups[groups.length - 1]
    if (last && last.group === cmd.group) last.items.push({ cmd, idx })
    else groups.push({ group: cmd.group, items: [{ cmd, idx }] })
  }

  return (
    <Dialog open={isOpen} onClose={close} className="relative z-[var(--z-overlay)]">
      <DialogBackdrop
        transition
        className="scrim fixed inset-0 transition data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in"
      />
      <div className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh] sm:pt-[16vh]">
        <DialogPanel
          transition
          className={clsx(
            'w-full max-w-xl overflow-hidden rounded-2xl bg-surface-primary elevation-4 ring-1 ring-[var(--border-default)] el-dialog',
            'transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:ease-out data-[leave]:ease-in',
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-base px-4">
            <Search className="h-5 w-5 flex-shrink-0 text-disabled" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="이동하거나 명령을 실행하세요…"
              className="w-full bg-transparent py-4 text-body1 text-heading placeholder:text-disabled focus:outline-none"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmdk-list"
              aria-activedescendant={filtered[selected] ? `cmdk-${filtered[selected].id}` : undefined}
            />
            <kbd className="hidden flex-shrink-0 rounded-md bg-surface-tertiary px-2 py-1 text-micro text-sub sm:block">ESC</kbd>
          </div>

          {/* Command list */}
          <div ref={listRef} id="cmdk-list" role="listbox" className="max-h-[52vh] overflow-y-auto overscroll-contain px-2 py-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-body3 text-sub">결과가 없습니다</div>
            ) : (
              groups.map(({ group, items }) => (
                <Fragment key={group}>
                  <div className="px-3 pb-1 pt-3 text-label4 font-semibold uppercase tracking-wide text-disabled">
                    {GROUP_LABEL[group]}
                  </div>
                  {items.map(({ cmd, idx }) => {
                    const Icon = cmd.icon
                    const active = idx === selected
                    return (
                      <button
                        key={cmd.id}
                        id={`cmdk-${cmd.id}`}
                        data-idx={idx}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseMove={() => setSelected(idx)}
                        onClick={() => execute(cmd)}
                        className={clsx(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                          active ? 'bg-accent-primary text-accent-primary' : 'text-body hover:bg-[var(--hover-bg)]',
                        )}
                      >
                        <Icon className={clsx('h-[18px] w-[18px] flex-shrink-0', active ? 'text-accent-primary' : 'text-sub')} aria-hidden="true" />
                        <span className="flex-1 truncate text-body3">{cmd.label}</span>
                        {cmd.hint && (
                          <kbd className="flex-shrink-0 rounded-md bg-surface-tertiary px-1.5 py-0.5 text-micro text-sub">{cmd.hint}</kbd>
                        )}
                      </button>
                    )
                  })}
                </Fragment>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center justify-between gap-2 border-t border-base px-4 py-2 text-micro text-disabled">
            <span className="flex items-center gap-1.5">
              <CommandIcon className="h-3 w-3" aria-hidden="true" /> 명령 팔레트
            </span>
            <span className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-1"><kbd className="rounded bg-surface-tertiary px-1">↑</kbd><kbd className="rounded bg-surface-tertiary px-1">↓</kbd> 이동</span>
              <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> 실행</span>
            </span>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
