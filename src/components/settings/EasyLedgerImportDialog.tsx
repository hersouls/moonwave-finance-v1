import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, Loader2, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { UI_DELAYS } from '@/utils/constants'
import { useToastStore } from '@/stores/toastStore'
import {
  previewEasyLedgerImport,
  importEasyLedger,
  type ImportPreview,
  type ImportResult,
} from '@/services/easyLedgerImport'

interface Props {
  open: boolean
  file: File | null
  onClose: () => void
}

type Step = 'loading' | 'preview' | 'importing' | 'result' | 'error'

export function EasyLedgerImportDialog({ open, file, onClose }: Props) {
  const addToast = useToastStore((s) => s.addToast)
  const [step, setStep] = useState<Step>('loading')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState({ current: 0, total: 100, phase: '' })

  // Load preview when file changes
  useEffect(() => {
    if (!open || !file) return
    setStep('loading')
    setPreview(null)
    setResult(null)
    setError('')

    previewEasyLedgerImport(file)
      .then((p) => {
        setPreview(p)
        setStep('preview')
      })
      .catch((err) => {
        setError(err.message || '파일을 파싱할 수 없습니다.')
        setStep('error')
      })
  }, [open, file])

  const handleImport = useCallback(async () => {
    if (!file) return
    setStep('importing')
    try {
      const importResult = await importEasyLedger(file, (current, total, phase) => {
        setProgress({ current, total, phase })
      })
      setResult(importResult)
      setStep('result')
    } catch (err: any) {
      setError(err.message || '가져오기에 실패했습니다.')
      setStep('error')
    }
  }, [file])

  const handleDone = () => {
    addToast('편한가계부 데이터를 성공적으로 가져왔습니다. 페이지를 새로고침합니다.', 'success')
    setTimeout(() => window.location.reload(), UI_DELAYS.RELOAD)
  }

  const canClose = step !== 'importing'

  return (
    <Dialog open={open} onClose={canClose ? onClose : () => {}} size="xl">
      <DialogHeader
        title="편한가계부 가져오기"
        onClose={canClose ? onClose : undefined}
      />
      <DialogBody>
        {step === 'loading' && <LoadingView />}
        {step === 'preview' && preview && <PreviewView preview={preview} />}
        {step === 'importing' && <ImportingView progress={progress} />}
        {step === 'result' && result && <ResultView result={result} />}
        {step === 'error' && <ErrorView message={error} />}
      </DialogBody>
      <DialogFooter>
        {step === 'preview' && (
          <>
            <Button variant="secondary" onClick={onClose}>취소</Button>
            <Button onClick={handleImport}>
              <FileSpreadsheet className="w-4 h-4" />
              {preview?.totalRecords.toLocaleString()}건 가져오기
            </Button>
          </>
        )}
        {step === 'result' && <Button onClick={handleDone}>확인</Button>}
        {step === 'error' && <Button variant="secondary" onClick={onClose}>닫기</Button>}
      </DialogFooter>
    </Dialog>
  )
}

// ─── Sub Views ──────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">파일 분석 중...</p>
    </div>
  )
}

function PreviewView({ preview }: { preview: ImportPreview }) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">총 거래</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {preview.totalRecords.toLocaleString()}건
          </p>
        </div>
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">기간</p>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {preview.dateRange.from} ~ {preview.dateRange.to}
          </p>
        </div>
      </div>

      {/* Categories */}
      <div>
        <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">
          카테고리 ({preview.categories.length}개)
        </h4>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {preview.categories.map((cat) => (
            <div
              key={`${cat.name}-${cat.type}`}
              className="flex items-center justify-between px-3 py-1.5 text-sm rounded-md bg-zinc-50 dark:bg-zinc-800/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-zinc-700 dark:text-zinc-300">{cat.name}</span>
                <span className="text-xs text-zinc-400">({cat.type})</span>
                {cat.isNew && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded">
                    새로 생성
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500">{cat.count.toLocaleString()}건</span>
            </div>
          ))}
        </div>
      </div>

      {/* Members & Assets */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">감지된 구성원</h4>
          <div className="space-y-1">
            {preview.members.map((m) => (
              <div key={m.name} className="flex items-center justify-between px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800/50 rounded-md">
                <span className="text-zinc-700 dark:text-zinc-300">{m.name}</span>
                <span className="text-xs text-zinc-500">{m.count.toLocaleString()}건</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">거래수단</h4>
          <div className="space-y-1">
            {preview.assets.map((a) => (
              <div key={a.name} className="flex items-center justify-between px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800/50 rounded-md">
                <span className="text-zinc-700 dark:text-zinc-300">{a.name}</span>
                <span className="text-xs text-zinc-500">{a.count.toLocaleString()}건</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {preview.negativeAmountCount > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 dark:text-amber-400">
            음수 금액(환급) {preview.negativeAmountCount}건이 수입으로 자동 변환됩니다.
          </p>
        </div>
      )}

      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
        <FileSpreadsheet className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-blue-700 dark:text-blue-400">
          기존 데이터는 유지되며, 새 데이터가 추가됩니다.
        </p>
      </div>
    </div>
  )
}

function ImportingView({ progress }: { progress: { current: number; total: number; phase: string } }) {
  const percent = Math.round((progress.current / progress.total) * 100)
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      <div className="w-full max-w-xs">
        <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-center text-zinc-500 dark:text-zinc-400">
          {progress.phase}
        </p>
      </div>
    </div>
  )
}

function ResultView({ result }: { result: ImportResult }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-4">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          가져오기 완료
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-md text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">가져온 거래</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {result.totalImported.toLocaleString()}건
          </span>
        </div>
        <div className="flex justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-md text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">기간</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {result.dateRange.from} ~ {result.dateRange.to}
          </span>
        </div>
        {result.createdCategories.length > 0 && (
          <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-md text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">생성된 카테고리</span>
            <p className="mt-1 text-zinc-900 dark:text-zinc-100">
              {result.createdCategories.join(', ')}
            </p>
          </div>
        )}
        {result.createdPaymentMethods.length > 0 && (
          <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-md text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">생성된 거래수단</span>
            <p className="mt-1 text-zinc-900 dark:text-zinc-100">
              {result.createdPaymentMethods.join(', ')}
            </p>
          </div>
        )}
      </div>

      {result.warnings.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">경고</p>
          <ul className="text-xs text-amber-600 dark:text-amber-500 space-y-0.5">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <AlertTriangle className="w-12 h-12 text-red-500" />
      <p className="text-sm text-red-600 dark:text-red-400 text-center">{message}</p>
    </div>
  )
}
