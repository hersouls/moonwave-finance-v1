import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import { EmptyState } from './EmptyState'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <EmptyState
        icon={
          <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        title="페이지를 찾을 수 없습니다"
        description="요청하신 페이지가 존재하지 않거나 이동되었습니다."
        action={{
          label: '홈으로 돌아가기',
          onClick: () => navigate('/'),
          icon: <Home className="w-5 h-5" />,
        }}
      />
    </div>
  )
}
