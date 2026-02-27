import { useState, useEffect } from 'react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useBudgetStore } from '@/stores/budgetStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { formatNumber } from '@/utils/format'

interface BudgetSettingModalProps {
  open: boolean
  onClose: () => void
}

export function BudgetSettingModal({ open, onClose }: BudgetSettingModalProps) {
  const categories = useTransactionStore((s) => s.categories)
  const budgets = useBudgetStore((s) => s.budgets)
  const setBudget = useBudgetStore((s) => s.setBudget)
  const expenseCategories = categories.filter(c => c.type === 'expense')

  const [amounts, setAmounts] = useState<Record<number, string>>({})

  useEffect(() => {
    if (open) {
      const initial: Record<number, string> = {}
      for (const cat of expenseCategories) {
        const budget = budgets.find(b => b.categoryId === cat.id!)
        initial[cat.id!] = budget ? String(budget.amount) : ''
      }
      setAmounts(initial)
    }
  }, [open, budgets, expenseCategories])

  const handleSave = async () => {
    for (const cat of expenseCategories) {
      const val = Number(amounts[cat.id!]?.replace(/,/g, '') || 0)
      if (val > 0) {
        await setBudget(cat.id!, val)
      }
    }
    onClose()
  }

  const formatAmountInput = (value: string) => {
    const num = value.replace(/[^0-9]/g, '')
    return num ? formatNumber(Number(num)) : ''
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader title="월 예산 설정" onClose={onClose} />
      <DialogBody>
        <div className="space-y-3">
          {expenseCategories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0 truncate">{cat.name}</span>
              <div className="relative w-36">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amounts[cat.id!] || ''}
                  onChange={(e) => setAmounts(prev => ({ ...prev, [cat.id!]: formatAmountInput(e.target.value) }))}
                  placeholder="0"
                  className="w-full px-3 py-2 pr-8 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">원</span>
              </div>
            </div>
          ))}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button variant="primary" onClick={handleSave}>저장</Button>
      </DialogFooter>
    </Dialog>
  )
}
