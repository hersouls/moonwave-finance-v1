import { CategoryManagement } from './CategoryManagement'
import { PaymentMethodManagement } from './PaymentMethodManagement'

export function LedgerTab() {
  return (
    <div className="space-y-8">
      <CategoryManagement />
      <div className="border-t border-zinc-200 dark:border-zinc-700" />
      <PaymentMethodManagement />
    </div>
  )
}
