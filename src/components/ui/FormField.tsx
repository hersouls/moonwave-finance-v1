interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  className?: string
  floating?: boolean
}

export function FormField({ label, required, error, children, className, floating }: FormFieldProps) {
  if (floating) {
    return (
      <div className={className}>
        <div className="input-float-container">
          {children}
          <label className="input-float-label">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        </div>
        {error && (
          <p className="input-error-text">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <label className="block text-body3 text-zinc-700 dark:text-zinc-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="input-error-text">{error}</p>
      )}
    </div>
  )
}
