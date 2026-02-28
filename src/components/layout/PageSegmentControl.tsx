import { useNavigate, useLocation } from 'react-router-dom'
import { Tabs } from '@/components/ui/Tabs'

interface Segment {
  id: string
  label: string
  path: string
}

interface PageSegmentControlProps {
  segments: Segment[]
  className?: string
}

export function PageSegmentControl({ segments, className }: PageSegmentControlProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const activeSegment = segments.find((s) => location.pathname === s.path)?.id || segments[0].id

  return (
    <Tabs
      tabs={segments.map((s) => ({ id: s.id, label: s.label }))}
      activeTab={activeSegment}
      onChange={(tabId) => {
        const segment = segments.find((s) => s.id === tabId)
        if (segment) navigate(segment.path)
      }}
      className={className}
    />
  )
}
