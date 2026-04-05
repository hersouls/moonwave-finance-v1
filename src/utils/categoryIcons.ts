import type { LucideIcon } from 'lucide-react'
import {
  UtensilsCrossed, Car, Home, Smartphone, Heart, GraduationCap,
  HeartPulse, Gift, Landmark, Percent, ShoppingCart, Shield,
  Package, Map, CreditCard, TrendingUp, Shirt, MoreHorizontal,
  Briefcase, Coins, Plane, Bitcoin, LineChart, Tag,
} from 'lucide-react'

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  UtensilsCrossed, Car, Home, Smartphone, Heart, GraduationCap,
  HeartPulse, Gift, Landmark, Percent, ShoppingCart, Shield,
  Package, Map, CreditCard, TrendingUp, Shirt, MoreHorizontal,
  Briefcase, Coins, Plane, Bitcoin, LineChart, Tag,
}

export function getCategoryIcon(iconName?: string): LucideIcon {
  if (!iconName) return Tag
  return CATEGORY_ICON_MAP[iconName] || Tag
}
