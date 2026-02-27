import { useEffect, useState } from 'react'
import { User, Users, Database, Download, Upload, Trash2, Plus, Edit3 } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { useMemberStore } from '@/stores/memberStore'
import { Card } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/Dialog'
import { exportBackup, importBackup } from '@/services/backup'
import { clearAllData } from '@/services/database'
import { useToastStore } from '@/stores/toastStore'
import { formatRelativeTime } from '@/utils/format'

export function ProfilePage() {
  const settings = useSettingsStore((s) => s.settings)
  const user = useAuthStore((s) => s.user)
  const members = useMemberStore((s) => s.members)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const addMember = useMemberStore((s) => s.addMember)
  const updateMember = useMemberStore((s) => s.updateMember)
  const deleteMember = useMemberStore((s) => s.deleteMember)
  const addToast = useToastStore((s) => s.addToast)
  const setLastBackupDate = useSettingsStore((s) => s.setLastBackupDate)

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [editingMember, setEditingMember] = useState<{ id: number; name: string; color: string } | null>(null)
  const [memberName, setMemberName] = useState('')
  const [memberColor, setMemberColor] = useState('#3B82F6')

  useEffect(() => {
    loadMembers()
  }, [])

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

  const MEMBER_COLORS = ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#6366F1']

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl">
      {/* Profile Section */}
      <section>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <User className="w-5 h-5" />
          프로필
        </h2>
        <Card className="!p-5">
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
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{user.displayName}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">로그인하면 데이터를 클라우드에 동기화할 수 있습니다.</p>
          )}
        </Card>
      </section>

      {/* Members Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Users className="w-5 h-5" />
            가족 구성원
          </h2>
          <Button variant="ghost" size="sm" onClick={openAddMember} leftIcon={<Plus className="w-4 h-4" />}>
            추가
          </Button>
        </div>
        <div className="space-y-2">
          {members.map(m => (
            <Card key={m.id} className="!p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</span>
                  {m.isDefault && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                      기본
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <IconButton onClick={() => openEditMember({ id: m.id!, name: m.name, color: m.color })} plain size="sm">
                    <Edit3 className="w-4 h-4" />
                  </IconButton>
                  {!m.isDefault && (
                    <IconButton onClick={() => deleteMember(m.id!)} color="danger" plain size="sm">
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Data Section */}
      <section>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Database className="w-5 h-5" />
          데이터 관리
        </h2>
        <div className="space-y-3">
          <Card className="!p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">백업 내보내기</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
          <Card className="!p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">백업 복원</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">JSON 백업 파일에서 복원</p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleImportBackup} leftIcon={<Upload className="w-4 h-4" />}>
                복원
              </Button>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 text-red-600 dark:text-red-400">데이터 초기화</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">모든 데이터를 삭제하고 초기 상태로 되돌립니다</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setShowResetConfirm(true)} leftIcon={<Trash2 className="w-4 h-4" />}>
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
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">이름</label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">색상</label>
              <div className="flex gap-2 flex-wrap">
                {MEMBER_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setMemberColor(c)}
                    className={`w-8 h-8 rounded-full transition-all ${memberColor === c ? 'ring-2 ring-offset-2 ring-primary-500 scale-110' : 'hover:scale-105'}`}
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
