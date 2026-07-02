// ─── Device Registry (presence) ─────────────────────────────────────
//
// 각 기기가 users/{uid}/devices/{deviceId} 문서에 자신의 존재를 등록한다:
// 라벨(UA 기반), 플랫폼, 마지막 접속 시각, 동기화 프로토콜 버전.
// 설정 → 데이터의 '내 기기' 패널이 이 목록을 보여준다 — 5개 기기 중
// 어느 것이 살아있고 어떤 버전을 돌리는지 한눈에 확인할 수 있다
// (dv 레거시 purge처럼 "전 기기 최신 버전" 전제가 필요한 작업의 근거).

import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { getDeviceId } from '@/lib/deviceId'
import type { DeviceInfo } from '@/lib/types'

/** 이 빌드의 동기화 프로토콜 버전 (3 = Sync v2, 문자열 id/FK). */
export const SYNC_PROTOCOL = 3

const devicePath = (uid: string, deviceId: string) => `users/${uid}/devices/${deviceId}`

/** UA에서 사람이 읽을 기기 라벨을 만든다 (설정에서 이름 변경 가능). */
function detectDeviceLabel(): { label: string; platform: string } {
  if (typeof navigator === 'undefined') return { label: '알 수 없는 기기', platform: 'unknown' }
  const ua = navigator.userAgent
  let platform = 'web'
  let label = '브라우저'
  if (/Android/i.test(ua)) {
    platform = 'android'
    const model = ua.match(/;\s*([^;)]+)\s+Build\//)?.[1]?.trim()
    label = model || 'Android 기기'
  } else if (/iPhone/i.test(ua)) {
    platform = 'ios'
    label = 'iPhone'
  } else if (/iPad/i.test(ua)) {
    platform = 'ios'
    label = 'iPad'
  } else if (/Windows/i.test(ua)) {
    platform = 'windows'
    label = 'Windows PC'
  } else if (/Macintosh/i.test(ua)) {
    platform = 'mac'
    label = 'Mac'
  }
  const isPwa = typeof window !== 'undefined'
    && window.matchMedia?.('(display-mode: standalone)')?.matches
  return { label: isPwa ? `${label} (앱)` : label, platform }
}

let _registeredThisSession = false

/**
 * 이 기기의 presence 문서를 갱신한다 (로그인 + 하트비트).
 * 세션 첫 호출만 createdAt/label을 채우고, 이후엔 lastSeenAt만 갱신한다 —
 * 사용자가 설정에서 바꾼 라벨을 하트비트가 덮어쓰지 않는다.
 */
export async function registerDevicePresence(uid: string): Promise<void> {
  const deviceId = getDeviceId()
  const ref = doc(firestore, devicePath(uid, deviceId))
  const now = new Date().toISOString()
  try {
    if (!_registeredThisSession) {
      _registeredThisSession = true
      const snap = await getDoc(ref)
      const { label, platform } = detectDeviceLabel()
      await setDoc(ref, {
        deviceId,
        platform,
        lastSeenAt: now,
        syncProtocol: SYNC_PROTOCOL,
        ...(snap.exists()
          ? {} // 기존 라벨/등록시각 보존
          : { label, createdAt: now }),
      }, { merge: true })
    } else {
      await setDoc(ref, { lastSeenAt: now, syncProtocol: SYNC_PROTOCOL }, { merge: true })
    }
  } catch (err) {
    console.warn('[presence] register failed (non-fatal):', err)
  }
}

/** 계정에 등록된 모든 기기 목록 — 최근 접속순. */
export async function listDevices(uid: string): Promise<DeviceInfo[]> {
  const snap = await getDocs(collection(firestore, `users/${uid}/devices`))
  const devices = snap.docs.map(d => d.data() as DeviceInfo)
  return devices.sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''))
}

/** 이 브라우저의 deviceId — UI가 '현재 기기' 표시에 쓴다. */
export function currentDeviceId(): string {
  return getDeviceId()
}

/** 기기 라벨 변경 (설정 UI). */
export async function renameDevice(uid: string, deviceId: string, label: string): Promise<void> {
  await setDoc(doc(firestore, devicePath(uid, deviceId)), { label }, { merge: true })
}

/** 기기 등록 해제 (설정 UI — 더 이상 쓰지 않는 기기 정리). */
export async function removeDevice(uid: string, deviceId: string): Promise<void> {
  await deleteDoc(doc(firestore, devicePath(uid, deviceId)))
}
