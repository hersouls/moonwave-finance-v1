import { Dialog, DialogHeader, DialogBody } from '@/components/ui/Dialog'
import { useUIStore } from '@/stores/uiStore'

export function TermsModal() {
  const isOpen = useUIStore((s) => s.isTermsModalOpen)
  const closeModal = useUIStore((s) => s.closeTermsModal)

  return (
    <Dialog open={isOpen} onClose={closeModal} size="lg">
      <DialogHeader title="이용약관" onClose={closeModal} />
      <DialogBody>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <h3>제1조 (목적)</h3>
          <p>본 약관은 Moonwave FIN 서비스 이용에 관한 기본적인 사항을 규정합니다.</p>
          <h3>제2조 (개인정보)</h3>
          <p>사용자의 자산 데이터는 사용자의 브라우저에 저장되며, Google 계정 연동 시 사용자의 Firebase 계정에 암호화되어 저장됩니다.</p>
          <h3>제3조 (면책)</h3>
          <p>본 서비스는 참고용이며, 실제 투자 결정의 근거로 사용해서는 안 됩니다.</p>
        </div>
      </DialogBody>
    </Dialog>
  )
}
