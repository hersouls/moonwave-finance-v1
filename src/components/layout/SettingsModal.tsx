import { Dialog, DialogHeader, DialogBody } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { COLOR_PALETTES } from '@/utils/constants'
import type { ColorPalette } from '@/lib/types'

export function SettingsModal() {
  const isOpen = useUIStore((s) => s.isSettingsModalOpen)
  const closeModal = useUIStore((s) => s.closeSettingsModal)
  const settings = useSettingsStore((s) => s.settings)
  const setColorPalette = useSettingsStore((s) => s.setColorPalette)
  const user = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const isSigningIn = useAuthStore((s) => s.isSigningIn)

  return (
    <Dialog open={isOpen} onClose={closeModal} size="md">
      <DialogHeader title="설정" onClose={closeModal} />
      <DialogBody>
        <div className="space-y-6">
          {/* Account */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">계정</h3>
            {user ? (
              <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold">
                      {user.displayName?.[0] || '?'}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user.displayName}</p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={logout}>로그아웃</Button>
              </div>
            ) : (
              <Button onClick={login} disabled={isSigningIn}>{isSigningIn ? '로그인 중...' : 'Google 로그인'}</Button>
            )}
          </section>

          {/* Color Palette */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">색상 테마</h3>
            <div className="grid grid-cols-5 gap-2">
              {(Object.values(COLOR_PALETTES) as { id: ColorPalette; nameKo: string; colors: { primary: string } }[]).map((palette) => (
                <button
                  key={palette.id}
                  onClick={() => setColorPalette(palette.id)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-colors ${settings.colorPalette === palette.id ? 'border-primary-500' : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                >
                  <div className="w-8 h-8 rounded-full" style={{ backgroundColor: palette.colors.primary }} />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">{palette.nameKo}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </DialogBody>
    </Dialog>
  )
}
