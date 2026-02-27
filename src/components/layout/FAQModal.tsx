import { Dialog, DialogHeader, DialogBody } from '@/components/ui/Dialog'
import { useUIStore } from '@/stores/uiStore'

const faqs = [
  { q: '자산관리 앱은 어떤 기능을 제공하나요?', a: '개인 자산/부채를 일별로 기록하고, 순자산 추이를 분석하며, 가계부로 수입/지출을 관리할 수 있습니다.' },
  { q: '데이터는 어디에 저장되나요?', a: '기본적으로 브라우저 내부(IndexedDB)에 저장됩니다. Google 로그인 시 클라우드에 자동 동기화됩니다.' },
  { q: '오프라인에서도 사용할 수 있나요?', a: '네, 오프라인에서도 모든 기능을 사용할 수 있으며, 온라인 복귀 시 자동으로 동기화됩니다.' },
  { q: '가족 구성원은 추가할 수 있나요?', a: '네, 설정에서 가족 구성원을 자유롭게 추가하거나 삭제할 수 있습니다.' },
]

export function FAQModal() {
  const isOpen = useUIStore((s) => s.isFAQModalOpen)
  const closeModal = useUIStore((s) => s.closeFAQModal)

  return (
    <Dialog open={isOpen} onClose={closeModal} size="lg">
      <DialogHeader title="자주 묻는 질문" onClose={closeModal} />
      <DialogBody>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Q. {faq.q}</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{faq.a}</p>
            </div>
          ))}
        </div>
      </DialogBody>
    </Dialog>
  )
}
