import { useEffect, useState } from 'react'
import { User, Users, Database, Download, Upload, Trash2, Plus, Edit3, FileSpreadsheet, Cloud, CloudOff, Loader2, CheckCircle2, AlertCircle, AlertTriangle, FlaskConical, Receipt, Wallet, LineChart, Landmark } from 'lucide-react'
import type { Member } from '@/lib/types'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore, type SyncStatus } from '@/stores/authStore'
import { useMemberStore, getMemberUsage, type MemberUsage } from '@/stores/memberStore'
import { Card } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { exportBackup, importBackup, exportTransactionsCSV, exportAssetValuesCSV } from '@/services/backup'
import { clearAllData } from '@/services/database'
import { seedTestDataAndUpload } from '@/services/seedTestData'
import { useToastStore } from '@/stores/toastStore'
import { formatRelativeTime } from '@/utils/format'

export function ProfilePage() {
  const settings = useSettingsStore((s) => s.settings)
  const user = useAuthStore((s) => s.user)
  const syncStatus = useAuthStore((s) => s.syncStatus)
  const lastSyncTime = useAuthStore((s) => s.lastSyncTime)
  const manualUpload = useAuthStore((s) => s.manualUpload)
  const manualDownload = useAuthStore((s) => s.manualDownload)
  const members = useMemberStore((s) => s.members)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const addMember = useMemberStore((s) => s.addMember)
  const updateMember = useMemberStore((s) => s.updateMember)
  const deleteMember = useMemberStore((s) => s.deleteMember)
  const addToast = useToastStore((s) => s.addToast)
  const setLastBackupDate = useSettingsStore((s) => s.setLastBackupDate)
  const readOnly = settings.deviceWriteEnabled === false

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)
  const [memberUsage, setMemberUsage] = useState<MemberUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [confirmDefaultDelete, setConfirmDefaultDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [editingMember, setEditingMember] = useState<{ id: number; name: string; color: string } | null>(null)
  const [memberName, setMemberName] = useState('')
  const [memberColor, setMemberColor] = useState('#3B82F6')

  useEffect(() => {
    loadMembers()
  }, [])

  // Fetch the blast radius (linked transactions / assets / etc.) whenever the
  // delete dialog opens for a different member. Resets when it closes so the
  // next deletion starts clean.
  useEffect(() => {
    if (!memberToDelete?.id) {
      setMemberUsage(null)
      setConfirmDefaultDelete(false)
      return
    }
    let cancelled = false
    setUsageLoading(true)
    getMemberUsage(memberToDelete.id)
      .then((usage) => { if (!cancelled) setMemberUsage(usage) })
      .catch(() => { if (!cancelled) setMemberUsage(null) })
      .finally(() => { if (!cancelled) setUsageLoading(false) })
    return () => { cancelled = true }
  }, [memberToDelete?.id])

  const closeDeleteDialog = () => {
    if (isDeleting) return
    setMemberToDelete(null)
  }

  const performDelete = async () => {
    if (!memberToDelete?.id) return
    setIsDeleting(true)
    try {
      await deleteMember(memberToDelete.id)
      setMemberToDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExportBackup = async () => {
    try {
      await exportBackup()
      setLastBackupDate(new Date())
      addToast('백업이 완료되었습니다.', 'success')
    } catch {
      addToast('백업에 실패했습니다.', 'error')
    }
  }

  const handleImportBackup = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        await importBackup(file)
        addToast('복원이 완료되었습니다.', 'success')
        loadMembers()
      } catch {
        addToast('복원에 실패했습니다.', 'error')
      }
    }
    input.click()
  }

  const handleResetData = async () => {
    await clearAllData()
    addToast('모든 데이터가 초기화되었습니다.', 'info')
    setShowResetConfirm(false)
    loadMembers()
  }

  const openAddMember = () => {
    setEditingMember(null)
    setMemberName('')
    setMemberColor('#3B82F6')
    setShowMemberModal(true)
  }

  const openEditMember = (m: { id: number; name: string; color: string }) => {
    setEditingMember(m)
    setMemberName(m.name)
    setMemberColor(m.color)
    setShowMemberModal(true)
  }

  const handleSaveMember = async () => {
    if (!memberName.trim()) return
    if (editingMember) {
      await updateMember(editingMember.id, { name: memberName.trim(), color: memberColor })
    } else {
      await addMember(memberName.trim(), memberColor)
    }
    setShowMemberModal(false)
  }

  const handleExportTransactionsCSV = async () => {
    try {
      await exportTransactionsCSV()
      addToast('거래내역 CSV가 내보내졌습니다.', 'success')
    } catch {
      addToast('CSV 내보내기에 실패했습니다.', 'error')
    }
  }

  const handleExportAssetValuesCSV = async () => {
    try {
      await exportAssetValuesCSV()
      addToast('자산가치 CSV가 내보내졌습니다.', 'success')
    } catch {
      addToast('CSV 내보내기에 실패했습니다.', 'error')
    }
  }

  const MEMBER_COLORS = ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#6366F1']

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl">
      {/* Profile Section */}
      <section>
        <h2 className="text-title2 text-heading mb-3 flex items-center gap-2">
          <User className="w-5 h-5" />
          프로필
        </h2>
        <Card className="card-pad-lg">
          {user ? (
            <div className="flex items-center gap-4">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
              )}
              <div>
                <p className="font-medium text-heading">{user.displayName}</p>
                <p className="text-body3 text-sub">{user.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-body3 text-sub">로그인하면 데이터를 클라우드에 동기화할 수 있습니다.</p>
          )}
        </Card>
      </section>

      {/* Cloud Sync Section */}
      {user && (
        <section>
          <h2 className="text-title2 text-heading mb-3 flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            클라우드 동기화
          </h2>
          <div className="space-y-3">
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SyncStatusIndicator status={syncStatus} />
                  <div>
                    <p className="text-body3 text-heading">
                      {syncStatus === 'syncing' && '동기화 중...'}
                      {syncStatus === 'synced' && '동기화 완료'}
                      {syncStatus === 'error' && '동기화 오류'}
                      {syncStatus === 'idle' && '동기화 대기'}
                    </p>
                    {lastSyncTime && (
                      <p className="text-caption text-sub">
                        마지막 동기화: {formatRelativeTime(lastSyncTime)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  <p className="text-caption text-sub text-center">로컬 → 클라우드</p>
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
                    disabled={syncStatus === 'syncing' || readOnly}
                    title={readOnly ? '읽기 전용 모드 — 업로드 불가' : undefined}
                  >
                    업로드
                  </Button>
                </div>
              </Card>
              <Card>
                <div className="flex flex-col items-center gap-2">
                  <Download className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  <p className="text-caption text-sub text-center">클라우드 → 로컬</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        await manualDownload()
                        addToast('클라우드에서 다운로드 완료', 'success')
                        loadMembers()
                      } catch {
                        addToast('다운로드에 실패했습니다.', 'error')
                      }
                    }}
                    disabled={syncStatus === 'syncing'}
                  >
                    다운로드
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Members Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-title2 text-heading flex items-center gap-2">
            <Users className="w-5 h-5" />
            가족 구성원
          </h2>
          <Button variant="ghost" size="sm" onClick={openAddMember} disabled={readOnly} title={readOnly ? '읽기 전용 모드' : undefined} leftIcon={<Plus className="w-4 h-4" />}>
            추가
          </Button>
        </div>
        <div className="space-y-2">
          {members.map(m => (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.name.charAt(0)}
                  </div>
                  <span className="text-body3 text-heading">{m.name}</span>
                  {m.isDefault && (
                    <span className="text-caption px-2 py-0.5 rounded-full bg-surface-tertiary text-sub">
                      기본
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <IconButton onClick={() => openEditMember({ id: m.id!, name: m.name, color: m.color })} plain size="sm" disabled={readOnly} aria-label={`${m.name} 수정`}>
                    <Edit3 className="w-4 h-4" />
                  </IconButton>
                  <IconButton onClick={() => setMemberToDelete(m)} color="danger" plain size="sm" disabled={readOnly} aria-label={`${m.name} 삭제`}>
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Data Section */}
      <section>
        <h2 className="text-title2 text-heading mb-3 flex items-center gap-2">
          <Database className="w-5 h-5" />
          데이터 관리
        </h2>
        <div className="space-y-3">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body3 text-heading">백업 내보내기</p>
                <p className="text-caption text-sub">
                  {settings.lastBackupDate
                    ? `마지막 백업: ${formatRelativeTime(settings.lastBackupDate)}`
                    : '백업한 적이 없습니다'
                  }
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleExportBackup} leftIcon={<Download className="w-4 h-4" />}>
                내보내기
              </Button>
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body3 text-heading">백업 복원</p>
                <p className="text-caption text-sub">JSON 백업 파일에서 복원</p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleImportBackup} disabled={readOnly} title={readOnly ? '읽기 전용 모드' : undefined} leftIcon={<Upload className="w-4 h-4" />}>
                복원
              </Button>
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body3 text-heading">CSV 내보내기</p>
                <p className="text-caption text-sub">거래내역 또는 자산가치를 Excel 호환 CSV로 내보내기</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleExportTransactionsCSV} leftIcon={<FileSpreadsheet className="w-4 h-4" />}>
                  거래
                </Button>
                <Button variant="secondary" size="sm" onClick={handleExportAssetValuesCSV} leftIcon={<FileSpreadsheet className="w-4 h-4" />}>
                  자산
                </Button>
              </div>
            </div>
          </Card>
          {user && (
            <Card className="border border-warning-500/30 bg-warning-50/50 dark:bg-warning-500/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-body3 text-warning-600 dark:text-warning-500">테스트 데이터 생성</p>
                  <p className="text-caption text-sub">가상의 자산/거래/예산/목표 데이터를 생성하고 Firebase에 업로드합니다</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isSeeding || readOnly}
                  title={readOnly ? '읽기 전용 모드' : undefined}
                  onClick={async () => {
                    if (!user) return
                    setIsSeeding(true)
                    try {
                      await seedTestDataAndUpload(user.uid)
                      addToast('테스트 데이터가 생성되고 Firebase에 업로드되었습니다.', 'success')
                      loadMembers()
                    } catch (err) {
                      console.error('Seed failed:', err)
                      addToast('테스트 데이터 생성에 실패했습니다.', 'error')
                    } finally {
                      setIsSeeding(false)
                    }
                  }}
                  leftIcon={isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                >
                  {isSeeding ? '생성 중...' : '생성'}
                </Button>
              </div>
            </Card>
          )}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body3 text-status-danger">데이터 초기화</p>
                <p className="text-caption text-sub">모든 데이터를 삭제하고 초기 상태로 되돌립니다</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setShowResetConfirm(true)} disabled={readOnly} title={readOnly ? '읽기 전용 모드' : undefined} leftIcon={<Trash2 className="w-4 h-4" />}>
                초기화
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Member Add/Edit Modal */}
      <Dialog open={showMemberModal} onClose={() => setShowMemberModal(false)} size="sm">
        <DialogHeader title={editingMember ? '구성원 수정' : '구성원 추가'} onClose={() => setShowMemberModal(false)} />
        <DialogBody>
          <div className="space-y-4">
            <div>
              <label className="block text-body3 text-body mb-1.5">이름</label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="input-base"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-body3 text-body mb-1.5">색상</label>
              <div className="flex gap-2 flex-wrap">
                {MEMBER_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setMemberColor(c)}
                    className={`touch-target-inset w-8 h-8 rounded-full transition-all ${memberColor === c ? 'ring-2 ring-offset-2 ring-primary-500 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                    aria-label={`색상 ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setShowMemberModal(false)}>취소</Button>
          <Button variant="primary" onClick={handleSaveMember} disabled={!memberName.trim()}>
            {editingMember ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Member Delete with linked-data preview */}
      <MemberDeleteDialog
        member={memberToDelete}
        usage={memberUsage}
        usageLoading={usageLoading}
        isDeleting={isDeleting}
        confirmDefault={confirmDefaultDelete}
        onToggleConfirmDefault={setConfirmDefaultDelete}
        onClose={closeDeleteDialog}
        onConfirm={performDelete}
      />

      {/* Reset Confirm */}
      <ConfirmDialog
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetData}
        title="데이터 초기화"
        description="모든 자산, 부채, 거래 데이터가 삭제됩니다. 기본 구성원과 카테고리만 남습니다. 이 작업은 되돌릴 수 없습니다."
        confirmText="초기화"
        variant="danger"
      />
    </div>
  )
}

function SyncStatusIndicator({ status }: { status: SyncStatus }) {
  if (status === 'syncing') {
    return <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
  }
  if (status === 'synced') {
    return <CheckCircle2 className="w-5 h-5 text-success-500" />
  }
  if (status === 'error') {
    return <AlertCircle className="w-5 h-5 text-danger-500" />
  }
  return <CloudOff className="w-5 h-5 text-disabled" />
}

/**
 * Surfaces the cascade of records that will be removed alongside a member
 * (transactions, assets, daily values, loans linked through those assets) so
 * the user can make an informed decision before confirming. Default members
 * are deletable but require an explicit second confirmation checkbox — they
 * are typically duplicates from the pre-syncId-fix sync bug, and once
 * dedupMigration runs, the user should never see this guarded path again.
 */
interface MemberDeleteDialogProps {
  member: Member | null
  usage: MemberUsage | null
  usageLoading: boolean
  isDeleting: boolean
  confirmDefault: boolean
  onToggleConfirmDefault: (next: boolean) => void
  onClose: () => void
  onConfirm: () => void
}

function MemberDeleteDialog({
  member,
  usage,
  usageLoading,
  isDeleting,
  confirmDefault,
  onToggleConfirmDefault,
  onClose,
  onConfirm,
}: MemberDeleteDialogProps) {
  const isDefault = !!member?.isDefault
  const totalLinked = usage
    ? usage.transactions + usage.assetItems + usage.dailyValues + usage.loans
    : 0
  const canConfirm = !usageLoading && (!isDefault || confirmDefault) && !isDeleting

  const rows: { icon: typeof Receipt; label: string; count: number }[] = usage
    ? [
        { icon: Receipt, label: '거래내역', count: usage.transactions },
        { icon: Wallet, label: '자산 항목', count: usage.assetItems },
        { icon: LineChart, label: '일별 자산가치', count: usage.dailyValues },
        { icon: Landmark, label: '대출', count: usage.loans },
      ]
    : []

  return (
    <Dialog open={!!member} onClose={onClose} size="sm" role="alertdialog">
      <DialogHeader title="구성원 삭제" onClose={onClose} />
      <DialogBody>
        {member && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold"
                style={{ backgroundColor: member.color }}
              >
                {member.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body2 text-heading font-medium truncate">{member.name}</p>
                {isDefault && (
                  <span className="inline-block mt-0.5 text-caption px-2 py-0.5 rounded-full bg-status-warning text-status-warning">
                    기본 구성원
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-status-danger bg-status-danger-soft p-3">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-status-danger mt-0.5 flex-shrink-0" />
                <p className="text-body3 text-status-danger">
                  삭제 시 아래 데이터가 함께 제거됩니다. 되돌릴 수 없습니다.
                </p>
              </div>

              {usageLoading && (
                <div className="flex items-center gap-2 py-2 text-caption text-sub">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  연결된 데이터 확인 중…
                </div>
              )}

              {!usageLoading && usage && totalLinked === 0 && (
                <p className="text-body3 text-sub py-1">연결된 데이터가 없습니다.</p>
              )}

              {!usageLoading && usage && totalLinked > 0 && (
                <ul className="space-y-1.5">
                  {rows.map(({ icon: Icon, label, count }) => (
                    <li
                      key={label}
                      className={`flex items-center justify-between text-body3 ${count > 0 ? 'text-body' : 'text-disabled'}`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </span>
                      <span className="tabular-nums font-medium">
                        {count > 0 ? `${count.toLocaleString()}건` : '0건'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isDefault && (
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmDefault}
                  onChange={(e) => onToggleConfirmDefault(e.target.checked)}
                />
                <span className="text-body3 text-body">
                  기본 구성원입니다. 삭제를 진행하려면 체크해주세요.
                </span>
              </label>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
          취소
        </Button>
        <Button
          variant="danger"
          onClick={onConfirm}
          disabled={!canConfirm}
        >
          {isDeleting ? '삭제 중…' : '삭제'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
