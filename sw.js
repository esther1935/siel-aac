const CACHE_NAME = "siel-aac-app-adminOfflineCategory20260628";
const IMAGE_CACHE = "siel-aac-image-cache-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=adminOfflineCategory20260628",
  "./app.js?v=adminOfflineCategory20260628",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("siel-aac-app-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Firebase/Google API는 온라인 시도, 실패하면 그대로 실패 처리
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("firebase")) {
    return;
  }

  // 이미지 요청은 런타임 캐시: 한 번 본 그림은 Wi-Fi 없이도 표시
  if (req.destination === "image" || /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;

        try {
          const response = await fetch(req);
          if (response && (response.ok || response.type === "opaque")) {
            cache.put(req, response.clone());
          }
          return response;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // 앱 파일은 캐시 우선, 온라인이면 최신으로 갱신
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((response) => {
        if (response && response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      }).catch(() => cached);

      return cached || network;
    })
  );
});
