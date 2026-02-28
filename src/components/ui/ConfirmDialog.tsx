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
    danger: 'text-danger-500 bg-danger-50 dark:bg-danger-900/30',
    warning: 'text-warning-500 bg-warning-50 dark:bg-warning-900/30',
    info: 'text-primary-500 bg-primary-50 dark:bg-primary-900/30',
  }

  const buttonVariant = variant === 'danger' ? 'danger' : 'primary'

  return (
    <Dialog open={open} onClose={onClose} size="sm" role="alertdialog">
      <DialogHeader title={title} onClose={onClose} />
      <DialogBody>
        <div className="flex gap-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${iconColors[variant]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
              {description}
            </p>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          {cancelText}
        </Button>
        <Button variant={buttonVariant} onClick={onConfirm} disabled={isLoading}>
          {isLoading ? '처리 중...' : confirmText}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
