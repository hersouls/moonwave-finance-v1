import { clsx } from 'clsx'
import { Check, AlertCircle } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'

interface ValidatedInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  error?: string | null
  touched?: boolean
  isValid?: boolean
  onChange?: (value: string) => void
  onBlurValidate?: () => void
}

export function ValidatedInput({
  label,
  error,
  touched,
  isValid,
  onChange,
  onBlurValidate,
  className,
  ...props
}: ValidatedInputProps) {
  const showError = touched && error
  const showSuccess = touched && isValid && !error

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          {...props}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={(e) => {
            onBlurValidate?.()
            props.onBlur?.(e)
          }}
          className={clsx(
            'w-full px-3 py-2 rounded-lg border text-sm transition-colors',
            'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100',
            'focus:outline-none focus:ring-2',
            showError && 'border-danger-500 focus:ring-danger-500/20',
            showSuccess && 'border-success-500 focus:ring-success-500/20',
            !showError && !showSuccess && 'border-zinc-300 dark:border-zinc-600 focus:ring-primary-500/20 focus:border-primary-500',
            className
          )}
        />
        {showError && (
          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-danger-500" />
        )}
        {showSuccess && (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success-500" />
        )}
      </div>
      {showError && (
        <p className="text-caption text-danger-500">{error}</p>
      )}
    </div>
  )
}
