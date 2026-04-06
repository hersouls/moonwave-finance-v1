import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { Check } from 'lucide-react'
import { clsx } from 'clsx'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Select({ value, onChange, options, placeholder, disabled, className }: SelectProps) {
  const selected = options.find(o => o.value === value)

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={clsx('relative', className)}>
        <ListboxButton className="select-base text-left">
          <span className={clsx('block truncate', !selected && 'text-disabled')}>
            {selected?.label || placeholder || '선택'}
          </span>
        </ListboxButton>
        <ListboxOptions
          transition
          className={clsx(
            'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl',
            'bg-surface-primary elevation-3 ring-1 ring-[var(--border-default)]',
            'py-1 text-sm focus:outline-none',
            'transition data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in'
          )}
        >
          {placeholder && (
            <ListboxOption
              value=""
              className={clsx(
                'relative cursor-pointer select-none py-2.5 pl-10 pr-4',
                'text-disabled',
                'data-[focus]:bg-[var(--hover-bg)]'
              )}
            >
              {placeholder}
            </ListboxOption>
          )}
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className={clsx(
                'relative cursor-pointer select-none py-2.5 pl-10 pr-4',
                'text-heading',
                'data-[focus]:bg-[var(--hover-bg)]'
              )}
            >
              {({ selected: isSelected }) => (
                <>
                  <span className={clsx('block truncate', isSelected && 'font-medium')}>
                    {option.label}
                  </span>
                  {isSelected && (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
