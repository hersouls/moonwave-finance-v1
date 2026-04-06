import { User, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'

export function AccountTab() {
  const user = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const isSigningIn = useAuthStore((s) => s.isSigningIn)

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-body3-semi text-heading mb-3">프로필 설정</h3>
        {user ? (
          <div className="p-4 bg-surface-secondary rounded-xl">
            <div className="flex items-center gap-4">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-12 h-12 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-body3 text-heading truncate">
                  {user.displayName}
                </p>
                <p className="text-caption text-sub truncate">
                  {user.email}
                </p>
                <span className="badge badge-sm badge-success mt-1.5">
                  Google 계정 연동됨
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                leftIcon={<LogOut className="w-4 h-4" />}
              >
                로그아웃
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-surface-secondary rounded-xl text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center mx-auto mb-3">
              <User className="w-7 h-7 text-disabled" />
            </div>
            <p className="text-sm text-sub mb-4">
              Google 로그인 시 프로필이 자동으로 표시됩니다.
            </p>
            <Button onClick={login} disabled={isSigningIn}>
              {isSigningIn ? '로그인 중...' : 'Google 로그인'}
            </Button>
            <p className="text-caption text-sub mt-3">
              로그인 없이도 로컬에서 모든 기능을 사용할 수 있습니다
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
