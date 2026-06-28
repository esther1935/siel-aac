const CACHE_NAME = "siel-aac-app-sielOfflineImageFix20260628";
const IMAGE_CACHE = "siel-aac-image-cache-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=sielOfflineImageFix20260628",
  "./app.js?v=sielOfflineImageFix20260628",
  "./manifest.webmanifest?v=sielOfflineImageFix20260628"
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

function looksLikeImageRequest(req, url) {
  return req.destination === "image"
    || /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url.pathname)
    || url.hostname.includes("firebasestorage.googleapis.com")
    || url.pathname.includes("/o/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 이미지/Firebase Storage 이미지는 반드시 캐시 우선 처리
  if (looksLikeImageRequest(req, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;

        try {
          const response = await fetch(req);
          if (response && (response.ok || response.type === "opaque")) {
            await cache.put(req, response.clone());
          }
          return response;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Firestore 등 데이터 API는 온라인일 때만 요청. 오프라인 데이터는 app.js localStorage 사용.
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("firebase")) {
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
