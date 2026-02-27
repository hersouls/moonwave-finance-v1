import { Switch } from '@headlessui/react'
import { clsx } from 'clsx'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function ToggleSwitch({ checked, onChange, label, description, disabled = false }: ToggleSwitchProps) {
  return (
    <Switch.Group>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Switch.Label className="text-sm font-medium text-zinc-900 dark:text-zinc-100 cursor-pointer">
            {label}
          </Switch.Label>
          {description && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
          )}
        </div>
        <Switch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className={clsx(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900',
            checked ? 'bg-primary-500' : 'bg-zinc-300 dark:bg-zinc-600',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span
            aria-hidden="true"
            className={clsx(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
              checked ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </Switch>
      </div>
    </Switch.Group>
  )
}
