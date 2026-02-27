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

export const BACKUP_CONFIG = {
  CURRENT_VERSION: '1.0.0',
  SUPPORTED_VERSIONS: ['1.0.0'],
  APP_NAME: 'Moonwave Finance',
  FILE_PREFIX: 'Finance_Backup',
} as const
