import { CategoryManagement } from './CategoryManagement'
import { PaymentMethodManagement } from './PaymentMethodManagement'

export function LedgerTab() {
  return (
    <div className="space-y-8">
      <CategoryManagement />
      <div className="divider-full" />
      <PaymentMethodManagement />
    </div>
  )
}
