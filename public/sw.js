const CACHE_NAME = '__SW_VERSION__'
// lie-fi 대비 내비게이션 타임아웃 — 이 시간 안에 응답이 없으면 캐시된 셸로 폴백
const NAV_TIMEOUT_MS = 4000
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

// SPA 리라이트가 존재하지 않는 해시 청크 URL에 index.html(200)을 돌려주는 경우 감지 —
// script/style/worker 요청에 text/html 응답을 캐시하면 그 URL이 영구 오염된다
function isSpaFallbackHtml(request, response) {
  const dest = request.destination
  if (dest !== 'script' && dest !== 'style' && dest !== 'worker') return false
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('text/html')
}

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and cross-origin requests
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  // Network-first for API calls and navigation
  if (event.request.mode === 'navigate' || event.request.url.includes('/api/')) {
    const networkFetch = fetch(event.request).then((response) => {
      // 일시적 5xx/점검 페이지가 오프라인 셸을 오염시키지 않도록 정상 응답만 캐시
      if (response.ok) {
        const clone = response.clone()
        event.waitUntil(
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone))
            .catch(() => {})
        )
      }
      return response
    })
    // 타임아웃으로 캐시를 먼저 응답한 뒤에도 네트워크가 완료되면 캐시가 갱신되도록 SW를 살려둔다
    event.waitUntil(networkFetch.then(() => {}, () => {}))
    event.respondWith(
      (async () => {
        // network-first 유지: 제한 시간 안에 도착한 네트워크 응답을 우선 사용
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS))
        const response = await Promise.race([networkFetch.then((r) => r, () => null), timeout])
        if (response) return response
        // 타임아웃/네트워크 실패 → 캐시 폴백 (백그라운드 네트워크 갱신은 계속 진행)
        const cached = await caches.match(event.request)
        if (cached) return cached
        const shell = await caches.match('/')
        if (shell) return shell
        // 캐시가 전혀 없으면 네트워크 결과(성공/실패)를 그대로 전달
        return networkFetch
      })()
    )
    return
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (response.ok && !isSpaFallbackHtml(event.request, response)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
