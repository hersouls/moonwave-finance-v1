export type ColorPalette = 'default' | 'ocean' | 'rose' | 'purple' | 'forest'

export interface PaletteDefinition {
  id: ColorPalette
  name: string
  nameKo: string
  colors: {
    primary: string
    secondary: string
  }
}

export const COLOR_PALETTES: Record<ColorPalette, PaletteDefinition> = {
  default: {
    id: 'default',
    name: 'Mint',
    nameKo: '민트',
    colors: { primary: '#2EFFB4', secondary: '#00A86B' },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    nameKo: '오션',
    colors: { primary: '#3B82F6', secondary: '#1D4ED8' },
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    nameKo: '로즈',
    colors: { primary: '#F472B6', secondary: '#DB2777' },
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    nameKo: '퍼플',
    colors: { primary: '#A78BFA', secondary: '#7C3AED' },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    nameKo: '포레스트',
    colors: { primary: '#34D399', secondary: '#059669' },
  },
}

export const DEFAULT_MEMBERS = [
  { name: '대성', color: '#3B82F6' },
  { name: '다연', color: '#EC4899' },
] as const

export const DEFAULT_ASSET_CATEGORIES = [
  { name: '퇴직금', type: 'asset' as const, color: '#6366F1', icon: 'Landmark' },
  { name: '주식', type: 'asset' as const, color: '#3B82F6', icon: 'TrendingUp' },
  { name: '암호화폐', type: 'asset' as const, color: '#F59E0B', icon: 'Bitcoin' },
  { name: '거래소 현금', type: 'asset' as const, color: '#10B981', icon: 'Banknote' },
  { name: '금', type: 'asset' as const, color: '#EAB308', icon: 'Gem' },
  { name: '은행계좌', type: 'asset' as const, color: '#06B6D4', icon: 'Building2' },
  { name: '기타자산', type: 'asset' as const, color: '#8B5CF6', icon: 'Package' },
] as const

export const DEFAULT_LIABILITY_CATEGORIES = [
  { name: '주택대출', type: 'liability' as const, color: '#EF4444', icon: 'Home' },
  { name: '신용대출', type: 'liability' as const, color: '#F97316', icon: 'CreditCard' },
  { name: '마이너스 대출', type: 'liability' as const, color: '#DC2626', icon: 'MinusCircle' },
  { name: '회사 대출', type: 'liability' as const, color: '#E11D48', icon: 'Building' },
  { name: '개인 대출', type: 'liability' as const, color: '#BE185D', icon: 'Users' },
] as const

export const DEFAULT_TRANSACTION_CATEGORIES = {
  income: [
    { name: '월급', color: '#10B981', icon: 'Briefcase' },
    { name: '부수입', color: '#06B6D4', icon: 'Coins' },
    { name: '투자수익', color: '#8B5CF6', icon: 'TrendingUp' },
  ],
  expense: [
    { name: '식비', color: '#F59E0B', icon: 'UtensilsCrossed' },
    { name: '교통비', color: '#3B82F6', icon: 'Car' },
    { name: '주거비', color: '#8B5CF6', icon: 'Home' },
    { name: '통신비', color: '#EC4899', icon: 'Smartphone' },
    { name: '의료비', color: '#EF4444', icon: 'Heart' },
    { name: '교육비', color: '#6366F1', icon: 'GraduationCap' },
    { name: '기타', color: '#71717A', icon: 'MoreHorizontal' },
  ],
} as const

export const SUBSCRIPTION_CATEGORIES = [
  { value: 'entertainment' as const, label: '엔터테인먼트', icon: 'Tv', color: '#EF4444' },
  { value: 'productivity' as const, label: '생산성', icon: 'Laptop', color: '#3B82F6' },
  { value: 'cloud' as const, label: '클라우드', icon: 'Cloud', color: '#06B6D4' },
  { value: 'music' as const, label: '음악', icon: 'Music', color: '#10B981' },
  { value: 'news' as const, label: '뉴스/미디어', icon: 'Newspaper', color: '#F59E0B' },
  { value: 'education' as const, label: '교육', icon: 'GraduationCap', color: '#8B5CF6' },
  { value: 'health' as const, label: '건강/피트니스', icon: 'Heart', color: '#EC4899' },
  { value: 'shopping' as const, label: '쇼핑/멤버십', icon: 'ShoppingBag', color: '#F97316' },
  { value: 'finance' as const, label: '금융', icon: 'Landmark', color: '#6366F1' },
  { value: 'other' as const, label: '기타', icon: 'MoreHorizontal', color: '#71717A' },
] as const

export const SUBSCRIPTION_PRESETS = {
  KRW: [
    { name: '넷플릭스', amount: 17000, cycle: 'monthly' as const, category: 'entertainment' as const, color: '#E50914', icon: 'Tv' },
    { name: '유튜브 프리미엄', amount: 14900, cycle: 'monthly' as const, category: 'entertainment' as const, color: '#FF0000', icon: 'Play' },
    { name: '쿠팡플레이', amount: 4990, cycle: 'monthly' as const, category: 'entertainment' as const, color: '#1E88E5', icon: 'Tv' },
    { name: '네이버 플러스', amount: 4900, cycle: 'monthly' as const, category: 'shopping' as const, color: '#03C75A', icon: 'ShoppingBag' },
    { name: '멜론', amount: 10900, cycle: 'monthly' as const, category: 'music' as const, color: '#00CD3C', icon: 'Music' },
    { name: '티빙', amount: 13900, cycle: 'monthly' as const, category: 'entertainment' as const, color: '#FF0558', icon: 'Tv' },
    { name: '디즈니+', amount: 9900, cycle: 'monthly' as const, category: 'entertainment' as const, color: '#113CCF', icon: 'Tv' },
    { name: '밀리의 서재', amount: 9900, cycle: 'monthly' as const, category: 'education' as const, color: '#FF6B00', icon: 'BookOpen' },
    { name: '카카오톡 이모티콘+', amount: 4900, cycle: 'monthly' as const, category: 'entertainment' as const, color: '#FEE500', icon: 'Smile' },
    { name: '웨이브', amount: 13900, cycle: 'monthly' as const, category: 'entertainment' as const, color: '#1C1C1C', icon: 'Tv' },
  ],
  USD: [
    { name: 'ChatGPT Plus', amount: 20, cycle: 'monthly' as const, category: 'productivity' as const, color: '#10A37F', icon: 'Bot' },
    { name: 'Claude Pro', amount: 20, cycle: 'monthly' as const, category: 'productivity' as const, color: '#D4A574', icon: 'Brain' },
    { name: 'GitHub Copilot', amount: 10, cycle: 'monthly' as const, category: 'productivity' as const, color: '#24292E', icon: 'Code' },
    { name: 'Cursor Pro', amount: 20, cycle: 'monthly' as const, category: 'productivity' as const, color: '#00D1FF', icon: 'Code2' },
    { name: 'Notion', amount: 10, cycle: 'monthly' as const, category: 'productivity' as const, color: '#000000', icon: 'FileText' },
    { name: 'Figma', amount: 12, cycle: 'monthly' as const, category: 'productivity' as const, color: '#F24E1E', icon: 'Palette' },
    { name: 'Spotify', amount: 10.99, cycle: 'monthly' as const, category: 'music' as const, color: '#1DB954', icon: 'Music' },
    { name: 'iCloud+', amount: 2.99, cycle: 'monthly' as const, category: 'cloud' as const, color: '#3693F3', icon: 'Cloud' },
    { name: 'Google One', amount: 2.99, cycle: 'monthly' as const, category: 'cloud' as const, color: '#4285F4', icon: 'HardDrive' },
    { name: 'Adobe CC', amount: 54.99, cycle: 'monthly' as const, category: 'productivity' as const, color: '#FF0000', icon: 'Layers' },
  ],
} as const

export const BACKUP_CONFIG = {
  CURRENT_VERSION: '1.2.0',
  SUPPORTED_VERSIONS: ['1.0.0', '1.1.0', '1.2.0'],
  APP_NAME: 'Moonwave Finance',
  FILE_PREFIX: 'Finance_Backup',
} as const

/** PWA service worker update check interval (10 minutes) */
export const PWA_UPDATE_INTERVAL_MS = 10 * 60 * 1000

/** PWA update banner dismiss duration (30 minutes) */
export const PWA_DISMISS_DURATION_MS = 30 * 60 * 1000

/** UI delay constants (ms) */
export const UI_DELAYS = {
  /** Short delay for navigation after state changes */
  NAV: 50,
  /** Modal transition delay to prevent animation conflicts */
  MODAL_TRANSITION: 150,
  /** Reload delay after data restore */
  RELOAD: 1000,
} as const
