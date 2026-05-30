import type { LucideIcon } from 'lucide-react'
import {
  UtensilsCrossed, Car, Home, Smartphone, Heart, GraduationCap,
  HeartPulse, Gift, Landmark, Percent, ShoppingCart, Shield,
  Package, Map, CreditCard, TrendingUp, Shirt, MoreHorizontal,
  Briefcase, Coins, Plane, Bitcoin, LineChart, Tag,
  Banknote, Gem, Building2, Building, Users, MinusCircle,
  PiggyBank, Wallet, DollarSign, Receipt, Repeat, Wifi,
} from 'lucide-react'

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  UtensilsCrossed, Car, Home, Smartphone, Heart, GraduationCap,
  HeartPulse, Gift, Landmark, Percent, ShoppingCart, Shield,
  Package, Map, CreditCard, TrendingUp, Shirt, MoreHorizontal,
  Briefcase, Coins, Plane, Bitcoin, LineChart, Tag,
  // Asset / liability icons (used by default asset categories + the picker)
  Banknote, Gem, Building2, Building, Users, MinusCircle,
  PiggyBank, Wallet, DollarSign, Receipt, Repeat, Wifi,
}

export function getCategoryIcon(iconName?: string): LucideIcon {
  if (!iconName) return Tag
  return CATEGORY_ICON_MAP[iconName] || Tag
}
