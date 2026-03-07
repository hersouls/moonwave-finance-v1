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
      <div className="toggle-cell">
        <div className="flex-1 min-w-0">
          <Switch.Label className="toggle-cell-label cursor-pointer">
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
            'toggle-track',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span aria-hidden="true" className="toggle-thumb" />
        </Switch>
      </div>
    </Switch.Group>
  )
}
