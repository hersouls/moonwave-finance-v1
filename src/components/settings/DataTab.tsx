import { useEffect, useState } from 'react'
import {
  Cloud, CloudOff, Upload, Download, FileSpreadsheet,
  Loader2, CheckCircle2, AlertCircle, Database, FileUp,
} from 'lucide-react'
import { UI_DELAYS } from '@/utils/constants'
import { useAuthStore, type SyncStatus } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useToastStore } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormSectionLabel } from '@/components/ui/CreateFormPrimitives'
import { exportBackup, importBackup, exportTransactionsCSV, exportAssetValuesCSV } from '@/services/backup'
import { formatRelativeTime } from '@/utils/format'
import { EasyLedgerImportDialog } from './EasyLedgerImportDialog'

function SyncStatusIndicator({ status }: { status: SyncStatus }) {
  if (status === 'syncing') return <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
  if (status === 'synced') return <CheckCircle2 className="w-5 h-5 text-status-success" />
  if (status === 'error') return <AlertCircle className="w-5 h-5 text-status-danger" />
  return <CloudOff className="w-5 h-5 text-disabled" />
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  syncing: '동기화 중...',
  synced: '동기화 완료',
  error: '동기화 오류',
  idle: '동기화 대기',
  offline: '오프라인',
}

export function DataTab() {
  const user = useAuthStore((s) => s.user)
  const syncStatus = useAuthStore((s) => s.syncStatus)
  const lastSyncTime = useAuthStore((s) => s.lastSyncTime)
  const pendingChangesCount = useAuthStore((s) => s.pendingChangesCount)
  const syncErrorMessage = useAuthStore((s) => s.syncErrorMessage)
  const updatePendingCount = useAuthStore((s) => s.updatePendingCount)
  const manualUpload = useAuthStore((s) => s.manualUpload)
  const manualDownload = useAuthStore((s) => s.manualDownload)
  const settings = useSettingsStore((s) => s.settings)
  const setLastBackupDate = useSettingsStore((s) => s.setLastBackupDate)
  const addToast = useToastStore((s) => s.addToast)

  // 탭을 열 때마다 대기 카운트를 실제 DB 기준으로 재계산 — store 값은
  // 마지막 동기화 시점의 스냅샷이라 그 사이 업로드/변경을 반영하지 못한다.
  useEffect(() => {
    void updatePendingCount()
  }, [updatePendingCount])

  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null)
  const [showEasyLedgerImport, setShowEasyLedgerImport] = useState(false)
  const [easyLedgerFile, setEasyLedgerFile] = useState<File | null>(null)
  const [showDvPurgeConfirm, setShowDvPurgeConfirm] = useState(false)
  const [isPurgingDv, setIsPurgingDv] = useState(false)

  const handlePurgeLegacyDv = async () => {
    if (!user) return
    setIsPurgingDv(true)
    try {
      const { purgeLegacyDailyValues } = await import('@/services/firestoreSync')
      const r = await purgeLegacyDailyValues(user.uid)
      addToast(`저장 구조 최적화 완료 — 번들 ${r.bundles}개 업로드, 구형 문서 ${r.deleted}개 정리`, 'success')
      setShowDvPurgeConfirm(false)
    } catch (err) {
      console.error('Legacy dailyValues purge failed:', err)
      addToast('최적화에 실패했습니다. 잠시 후 다시 시도하세요.', 'error')
    } finally {
      setIsPurgingDv(false)
    }
  }

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

  // 파일 선택 → 확인 다이얼로그 → 확정 시 복원. 복원은 이 기기의 전체
  // 데이터를 백업 파일 내용으로 교체하므로 반드시 확인을 거친다.
  const handleImportBackup = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setPendingRestoreFile(file)
    }
    input.click()
  }

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) return
    setIsRestoring(true)
    try {
      await importBackup(pendingRestoreFile)
      setPendingRestoreFile(null)
      addToast('복원이 완료되었습니다. 페이지를 새로고침합니다.', 'success')
      setTimeout(() => window.location.reload(), UI_DELAYS.RELOAD)
    } catch {
      addToast('복원에 실패했습니다. 올바른 백업 파일인지 확인하세요.', 'error')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleEasyLedgerImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,.htm,.xls'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setEasyLedgerFile(file)
      setShowEasyLedgerImport(true)
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
          <FormSectionLabel icon={Cloud}>클라우드 동기화</FormSectionLabel>
          <div className="space-y-3">
            <div className="p-4 bg-surface-secondary rounded-xl">
              <div className="flex items-center gap-3">
                <SyncStatusIndicator status={syncStatus} />
                <div>
                  <p className="text-body3 text-heading">
                    {SYNC_LABELS[syncStatus]}
                    {pendingChangesCount > 0 && syncStatus !== 'syncing' && (
                      <span className="text-caption text-status-warning ml-2 tabular-nums">
                        ({pendingChangesCount}건 대기 중)
                      </span>
                    )}
                  </p>
                  {syncStatus === 'error' && syncErrorMessage && (
                    <p className="text-caption text-status-danger">{syncErrorMessage}</p>
                  )}
                  {lastSyncTime && (
                    <p className="text-caption text-sub">
                      마지막 동기화: {formatRelativeTime(lastSyncTime)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await manualUpload()
                    addToast('클라우드에 업로드 완료', 'success')
                  } catch {
                    addToast('업로드에 실패했습니다.', 'error')
                  }
                }}
                disabled={syncStatus === 'syncing'}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                로컬 → 클라우드
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await manualDownload()
                    addToast('클라우드에서 다운로드 완료', 'success')
                  } catch {
                    addToast('다운로드에 실패했습니다.', 'error')
                  }
                }}
                disabled={syncStatus === 'syncing'}
                leftIcon={<Download className="w-4 h-4" />}
              >
                클라우드 → 로컬
              </Button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-surface-secondary rounded-xl">
              <div>
                <p className="text-body3 text-heading">클라우드 저장 구조 최적화</p>
                <p className="text-caption text-sub">
                  자산 일별가치를 월 단위 묶음으로 전환해 새 기기 동기화 속도와 비용을 줄입니다.
                  <span className="text-status-warning"> 모든 기기가 최신 버전으로 업데이트된 후 1회 실행하세요.</span>
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDvPurgeConfirm(true)}
                disabled={isPurgingDv || syncStatus === 'syncing'}
                leftIcon={isPurgingDv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                {isPurgingDv ? '최적화 중...' : '최적화 실행'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Backup & Restore */}
      <section>
        <FormSectionLabel icon={Database}>백업 및 복원</FormSectionLabel>
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-surface-secondary rounded-xl">
            <div>
              <p className="text-body3 text-heading">백업 다운로드</p>
              <p className="text-body3 text-sub">
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
              className="w-full sm:w-auto"
            >
              {isBackingUp ? '백업 중...' : '내보내기'}
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-surface-secondary rounded-xl">
            <div>
              <p className="text-body3 text-heading">데이터 복원</p>
              <p className="text-body3 text-sub">JSON 백업 파일에서 복원합니다</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImportBackup}
              disabled={isRestoring}
              leftIcon={isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              className="w-full sm:w-auto"
            >
              {isRestoring ? '복원 중...' : '복원'}
            </Button>
          </div>
        </div>
      </section>

      {/* Easy Ledger Import */}
      <section>
        <FormSectionLabel icon={FileUp}>편한가계부 가져오기</FormSectionLabel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-surface-secondary rounded-xl">
          <div>
            <p className="text-body3 text-heading">외부 데이터 가져오기</p>
            <p className="text-body3 text-sub">
              편한가계부 앱의 Excel 내보내기 파일에서 거래 데이터를 가져옵니다
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEasyLedgerImport}
            leftIcon={<FileUp className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            파일 선택
          </Button>
        </div>
      </section>

      {/* CSV Export */}
      <section>
        <FormSectionLabel icon={FileSpreadsheet}>CSV 내보내기</FormSectionLabel>
        <div className="p-4 bg-surface-secondary rounded-xl">
          <p className="text-body3 text-sub mb-3">
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

      {/* Easy Ledger Import Dialog */}
      <EasyLedgerImportDialog
        open={showEasyLedgerImport}
        file={easyLedgerFile}
        onClose={() => {
          setShowEasyLedgerImport(false)
          setEasyLedgerFile(null)
        }}
      />

      {/* Restore confirm — 복원은 현재 데이터 전체를 교체하므로 확인 필수 */}
      <ConfirmDialog
        open={pendingRestoreFile !== null}
        onClose={() => { if (!isRestoring) setPendingRestoreFile(null) }}
        onConfirm={handleConfirmRestore}
        title="데이터 복원"
        description={`선택한 백업 파일(${pendingRestoreFile?.name ?? ''})의 내용으로 복원합니다. 이 기기의 현재 데이터는 모두 백업 파일 내용으로 대체되며, 다음 동기화 때 클라우드와 다른 기기에도 반영됩니다. 계속하시겠습니까?`}
        confirmText="복원 실행"
        cancelText="취소"
        variant="warning"
        isLoading={isRestoring}
      />

      {/* Legacy dailyValues purge confirm */}
      <ConfirmDialog
        open={showDvPurgeConfirm}
        onClose={() => { if (!isPurgingDv) setShowDvPurgeConfirm(false) }}
        onConfirm={handlePurgeLegacyDv}
        title="클라우드 저장 구조 최적화"
        description="일별가치 데이터를 월 단위 묶음으로 전환하고 구형 문서를 정리합니다. 구버전 앱이 실행 중인 기기가 있으면 그 기기의 일별가치가 비워질 수 있습니다 — 반드시 모든 기기에서 앱을 한 번씩 열어 최신 버전으로 업데이트한 뒤 실행하세요."
        confirmText="모든 기기가 최신입니다 — 실행"
        cancelText="취소"
        variant="warning"
        isLoading={isPurgingDv}
      />
    </div>
  )
}
