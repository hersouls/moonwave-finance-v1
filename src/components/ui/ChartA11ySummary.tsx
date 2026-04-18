import type { ReactNode } from 'react'

interface ChartA11yRow {
  label: string
  value: string
  /** Optional metadata (e.g. percentage, change). */
  extra?: string
}

interface ChartA11ySummaryProps {
  /** Required: human-readable chart title (mirrors visual heading). */
  title: string
  /** Brief description of the chart type & what it shows. */
  description?: string
  /** Tabular data rows — screen readers read this as a proper table. */
  rows: ChartA11yRow[]
  /** Optional caption content (e.g. trend summary) */
  caption?: ReactNode
}

/**
 * Screen-reader-only table that mirrors a chart's data.
 * Canvas charts are opaque to AT; this gives SR users the underlying data.
 */
export function ChartA11ySummary({ title, description, rows, caption }: ChartA11ySummaryProps) {
  if (rows.length === 0) return null
  return (
    <div className="sr-only">
      <table>
        <caption>
          {title}
          {description && <> — {description}</>}
          {caption && <> — {caption}</>}
        </caption>
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">값</th>
            <th scope="col">추가</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{row.label}</td>
              <td>{row.value}</td>
              <td>{row.extra ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
