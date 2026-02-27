import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

declare global {
    interface Window {
        gapi: any
    }
}

export default function OAuthCallback() {
    const navigate = useNavigate()

    useEffect(() => {
        // Hash fragment에서 access_token 추출 (implicit flow)
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const error = params.get('error')

        if (error) {
            alert('Google 로그인이 취소되었습니다.')
            navigate('/')
            return
        }

        if (accessToken) {
            // gapi client에 토큰 설정
            if (window.gapi?.client) {
                window.gapi.client.setToken({ access_token: accessToken })
            }
            // 토큰 임시 저장 (SettingsModal에서 처리)
            sessionStorage.setItem('google_oauth_token', accessToken)
            alert('Google 계정이 연결되었습니다.\n설정에서 백업 기능을 사용할 수 있습니다.')
        }

        navigate('/')
    }, [navigate])

    return (
        <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-900">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4" />
                <p className="text-zinc-600 dark:text-zinc-400">Google 인증 처리 중...</p>
            </div>
        </div>
    )
}
