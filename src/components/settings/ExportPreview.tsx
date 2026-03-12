import { useState, useEffect, useMemo } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { db } from '@/services/database'
import type { Transaction } from '@/lib/types'

interface ExportPreviewProps {
  open: boolean
  onClose: () => void
  type: 'transactions' | 'assets'
}

export function ExportPreview({ open, onClose, type }: ExportPreviewProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [data, setData] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    if (!open) return
    // Default: this month
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    setStartDate(`${y}-${m}-01`)
    setEndDate(`${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`)
  }, [open])

  useEffect(() => {
    if (!open || !startDate || !endDate) return
    loadPreview()
  }, [open, startDate, endDate])

  const loadPreview = async () => {
    setIsLoading(true)
    try {
      if (type === 'transactions') {
        const txns = await db.transactions
          .where('date')
          .between(startDate, endDate, true, true)
          .toArray()
        setData(txns)
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  const previewRows = useMemo(() => data.slice(0, 20), [data])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const { exportTransactionsCSV } = await import('@/services/backup')
      await exportTransactionsCSV(startDate, endDate)
    } finally {
      setIsExporting(false)
      onClose()
    }
  }

  const formatAmount = (n: number) => n.toLocaleString('ko-KR')

  return (
    <Dialog open={open} onClose={onClose} size="3xl">
      <DialogHeader
        title={type === 'transactions' ? '거래내역 내보내기' : '자산가치 내보내기'}
        onClose={onClose}
      />
      <DialogBody>
        {/* Date Range */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-500">시작</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-500">종료</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
            />
          </div>
          <span className="text-sm text-zinc-400 self-center">
            총 {data.length}건
          </span>
        </div>

        {/* Preview Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : previewRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-400">데이터가 없습니다</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800">
                  <th className="px-3 py-2 text-left text-caption font-medium text-zinc-500">날짜</th>
                  <th className="px-3 py-2 text-left text-caption font-medium text-zinc-500">구분</th>
                  <th className="px-3 py-2 text-left text-caption font-medium text-zinc-500">메모</th>
                  <th className="px-3 py-2 text-right text-caption font-medium text-zinc-500">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {previewRows.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 tabular-nums">{row.date}</td>
                    <td className="px-3 py-2">
                      <span className={row.type === 'income' ? 'text-emerald-600' : 'text-red-600'}>
                        {row.type === 'income' ? '수입' : '지출'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">{row.memo || '-'}</td>
                    <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-100 tabular-nums">{formatAmount(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 20 && (
              <div className="px-3 py-2 text-center text-caption text-zinc-400 bg-zinc-50 dark:bg-zinc-800">
                외 {data.length - 20}건 더...
              </div>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button
          onClick={handleExport}
          disabled={data.length === 0 || isExporting}
          leftIcon={isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        >
          {isExporting ? '내보내는 중...' : `CSV 다운로드 (${data.length}건)`}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
