import { useState } from 'react'
import {
  Cloud, CloudOff, Upload, Download, FileSpreadsheet,
  Loader2, CheckCircle2, AlertCircle, Database,
} from 'lucide-react'
import { useAuthStore, type SyncStatus } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useToastStore } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { exportBackup, importBackup, exportTransactionsCSV, exportAssetValuesCSV } from '@/services/backup'
import { formatRelativeTime } from '@/utils/format'

function SyncStatusIndicator({ status }: { status: SyncStatus }) {
  if (status === 'syncing') return <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
  if (status === 'synced') return <CheckCircle2 className="w-5 h-5 text-green-500" />
  if (status === 'error') return <AlertCircle className="w-5 h-5 text-red-500" />
  return <CloudOff className="w-5 h-5 text-zinc-400" />
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  syncing: '동기화 중...',
  synced: '동기화 완료',
  error: '동기화 오류',
  idle: '동기화 대기',
}

export function DataTab() {
  const user = useAuthStore((s) => s.user)
  const syncStatus = useAuthStore((s) => s.syncStatus)
  const lastSyncTime = useAuthStore((s) => s.lastSyncTime)
  const manualUpload = useAuthStore((s) => s.manualUpload)
  const manualDownload = useAuthStore((s) => s.manualDownload)
  const settings = useSettingsStore((s) => s.settings)
  const setLastBackupDate = useSettingsStore((s) => s.setLastBackupDate)
  const addToast = useToastStore((s) => s.addToast)

  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const handleExportBackup = async () => {
    setIsBackingUp(true)
    try {
      await exportBackup()
      setLastBackupDate(new Date())
      addToast('백업이 완료되었습니다.', 'success')
    } catch {
      addToast('백업에 실패했습니다.', 'error')
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleImportBackup = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setIsRestoring(true)
      try {
        await importBackup(file)
        addToast('복원이 완료되었습니다. 페이지를 새로고침합니다.', 'success')
        setTimeout(() => window.location.reload(), 1000)
      } catch {
        addToast('복원에 실패했습니다. 올바른 백업 파일인지 확인하세요.', 'error')
      } finally {
        setIsRestoring(false)
      }
    }
    input.click()
  }

  const handleExportCSV = async (type: 'transactions' | 'assets') => {
    try {
      if (type === 'transactions') {
        await exportTransactionsCSV()
        addToast('거래내역 CSV가 내보내졌습니다.', 'success')
      } else {
        await exportAssetValuesCSV()
        addToast('자산가치 CSV가 내보내졌습니다.', 'success')
      }
    } catch {
      addToast('CSV 내보내기에 실패했습니다.', 'error')
    }
  }

  return (
    <div className="space-y-8">
      {/* Cloud Sync */}
      {user && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            클라우드 동기화
          </h3>
          <div className="space-y-3">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
              <div className="flex items-center gap-3">
                <SyncStatusIndicator status={syncStatus} />
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {SYNC_LABELS[syncStatus]}
                  </p>
                  {lastSyncTime && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      마지막 동기화: {formatRelativeTime(lastSyncTime)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={async () => {
                  try {
                    await manualUpload()
                    addToast('클라우드에 업로드 완료', 'success')
                  } catch {
                    addToast('업로드에 실패했습니다.', 'error')
                  }
                }}
                disabled={syncStatus === 'syncing'}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <Upload className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">로컬 → 클라우드</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await manualDownload()
                    addToast('클라우드에서 다운로드 완료', 'success')
                  } catch {
                    addToast('다운로드에 실패했습니다.', 'error')
                  }
                }}
                disabled={syncStatus === 'syncing'}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <Download className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">클라우드 → 로컬</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Backup & Restore */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Database className="w-4 h-4" />
          백업 및 복원
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">백업 다운로드</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {settings.lastBackupDate
                  ? `마지막 백업: ${formatRelativeTime(settings.lastBackupDate)}`
                  : '백업한 적이 없습니다'}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportBackup}
              disabled={isBackingUp}
              leftIcon={isBackingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            >
              {isBackingUp ? '백업 중...' : '내보내기'}
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">데이터 복원</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">JSON 백업 파일에서 복원합니다</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImportBackup}
              disabled={isRestoring}
              leftIcon={isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            >
              {isRestoring ? '복원 중...' : '복원'}
            </Button>
          </div>
        </div>
      </section>

      {/* CSV Export */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          CSV 내보내기
        </h3>
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
            Excel 호환 CSV 파일로 데이터를 내보냅니다
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExportCSV('transactions')}
              leftIcon={<FileSpreadsheet className="w-4 h-4" />}
            >
              거래내역
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExportCSV('assets')}
              leftIcon={<FileSpreadsheet className="w-4 h-4" />}
            >
              자산가치
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
