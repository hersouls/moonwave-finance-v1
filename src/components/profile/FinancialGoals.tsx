import { useState, useEffect } from 'react'
import { Target, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useGoalStore } from '@/stores/goalStore'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalCreateModal } from '@/components/goals/GoalCreateModal'
import type { FinancialGoal } from '@/lib/types'

export function FinancialGoals() {
  const goals = useGoalStore((s) => s.goals)
  const loadGoals = useGoalStore((s) => s.loadGoals)
  const deleteGoal = useGoalStore((s) => s.deleteGoal)

  const [showModal, setShowModal] = useState(false)
  const [editGoal, setEditGoal] = useState<FinancialGoal | null>(null)

  useEffect(() => { loadGoals() }, [])

  const handleEdit = (goal: FinancialGoal) => {
    setEditGoal(goal)
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditGoal(null)
    setShowModal(true)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Target className="w-5 h-5" />
          재정 목표
        </h2>
        <Button variant="ghost" size="sm" onClick={handleAdd} leftIcon={<Plus className="w-4 h-4" />}>
          추가
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card className="!p-5">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
            재정 목표를 설정하고 진행률을 추적해보세요.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {goals.map(g => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() => handleEdit(g)}
              onDelete={() => deleteGoal(g.id!)}
            />
          ))}
        </div>
      )}

      <GoalCreateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        editGoal={editGoal}
      />
    </section>
  )
}
