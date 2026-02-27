import { useState, useEffect } from 'react'
import { Users, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/Button'
import { useMemberStore } from '@/stores/memberStore'

interface MemberSetupStepProps {
  onNext: () => void
  onBack: () => void
}

const MEMBER_COLORS = ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444']

export function MemberSetupStep({ onNext, onBack }: MemberSetupStepProps) {
  const members = useMemberStore((s) => s.members)
  const loadMembers = useMemberStore((s) => s.loadMembers)
  const addMember = useMemberStore((s) => s.addMember)
  const deleteMember = useMemberStore((s) => s.deleteMember)

  const [newName, setNewName] = useState('')

  useEffect(() => { loadMembers() }, [])

  const handleAdd = async () => {
    if (!newName.trim()) return
    const colorIndex = members.length % MEMBER_COLORS.length
    await addMember(newName.trim(), MEMBER_COLORS[colorIndex])
    setNewName('')
  }

  return (
    <div className="flex flex-col items-center min-h-full px-6 py-12">
      <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
        <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">가족 구성원</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 text-center">자산을 관리할 구성원을 확인하세요</p>

      <div className="w-full max-w-sm space-y-2 mb-6">
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: m.color }}>
              {m.name.charAt(0)}
            </div>
            <span className="flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</span>
            {!m.isDefault && (
              <IconButton plain size="sm" color="danger" onClick={() => deleteMember(m.id!)}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
            )}
          </div>
        ))}
      </div>

      <div className="w-full max-w-sm flex gap-2 mb-10">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="구성원 이름"
          className="flex-1 px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Button variant="secondary" onClick={handleAdd} leftIcon={<Plus className="w-4 h-4" />}>추가</Button>
      </div>

      <div className="w-full max-w-sm flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">이전</Button>
        <Button variant="primary" onClick={onNext} className="flex-1">다음</Button>
      </div>
    </div>
  )
}
