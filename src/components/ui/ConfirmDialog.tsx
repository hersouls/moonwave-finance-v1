import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog'
import { Button } from './Button'
import { AlertTriangle, Info } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'info',
  isLoading = false,
}: ConfirmDialogProps) {
  const Icon = variant === 'info' ? Info : AlertTriangle

  const iconColors = {
    danger: 'text-status-danger bg-status-danger',
    warning: 'text-status-warning bg-status-warning',
    info: 'text-primary-500 bg-primary-50 dark:bg-primary-900/30',
  }

  const buttonVariant = variant === 'danger' ? 'danger' : 'primary'

  const handleConfirm = () => {
    if (variant === 'danger') navigator.vibrate?.(10)
    onConfirm()
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm" role="alertdialog">
      <DialogHeader title={title} onClose={onClose} />
      <DialogBody>
        <div className="flex gap-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${iconColors[variant]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-body3 text-sub whitespace-pre-line">
              {description}
            </p>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          {cancelText}
        </Button>
        <Button variant={buttonVariant} onClick={handleConfirm} disabled={isLoading}>
          {isLoading ? '처리 중...' : confirmText}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
