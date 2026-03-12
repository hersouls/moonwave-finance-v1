import { useState, useCallback } from 'react'

export interface ValidationRule {
  validate: (value: string) => boolean
  message: string
}

export const rules = {
  required: (msg = '필수 입력 항목입니다'): ValidationRule => ({
    validate: (v) => v.trim().length > 0,
    message: msg,
  }),
  min: (min: number, msg?: string): ValidationRule => ({
    validate: (v) => Number(v) >= min,
    message: msg || `${min} 이상이어야 합니다`,
  }),
  max: (max: number, msg?: string): ValidationRule => ({
    validate: (v) => Number(v) <= max,
    message: msg || `${max} 이하여야 합니다`,
  }),
  pattern: (regex: RegExp, msg: string): ValidationRule => ({
    validate: (v) => regex.test(v),
    message: msg,
  }),
  custom: (fn: (v: string) => boolean, msg: string): ValidationRule => ({
    validate: fn,
    message: msg,
  }),
}

interface FieldState {
  value: string
  error: string | null
  touched: boolean
  isValid: boolean
}

export function useFormValidation<T extends Record<string, ValidationRule[]>>(
  schema: T
) {
  const initialFields: Record<string, FieldState> = {}
  for (const key of Object.keys(schema)) {
    initialFields[key] = { value: '', error: null, touched: false, isValid: false }
  }

  const [fields, setFields] = useState<Record<string, FieldState>>(initialFields)

  const validateField = useCallback((name: string, value: string): string | null => {
    const fieldRules = schema[name]
    if (!fieldRules) return null
    for (const rule of fieldRules) {
      if (!rule.validate(value)) return rule.message
    }
    return null
  }, [schema])

  const setValue = useCallback((name: string, value: string) => {
    setFields(prev => {
      const error = prev[name]?.touched ? validateField(name, value) : null
      return {
        ...prev,
        [name]: { value, error, touched: prev[name]?.touched || false, isValid: !error && prev[name]?.touched || false },
      }
    })
  }, [validateField])

  const setTouched = useCallback((name: string) => {
    setFields(prev => {
      const error = validateField(name, prev[name]?.value || '')
      return {
        ...prev,
        [name]: { ...prev[name], touched: true, error, isValid: !error },
      }
    })
  }, [validateField])

  const validateAll = useCallback((): boolean => {
    let allValid = true
    setFields(prev => {
      const next = { ...prev }
      for (const name of Object.keys(schema)) {
        const error = validateField(name, next[name]?.value || '')
        next[name] = { ...next[name], touched: true, error, isValid: !error }
        if (error) allValid = false
      }
      return next
    })
    return allValid
  }, [schema, validateField])

  const reset = useCallback(() => {
    setFields(initialFields)
  }, [])

  return { fields, setValue, setTouched, validateAll, reset }
}
