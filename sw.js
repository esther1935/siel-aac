const CACHE_NAME = "siel-aac-app-sielRestore20260630";
const IMAGE_CACHE = "siel-aac-image-cache-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=sielRestore20260630",
  "./app.js?v=sielRestore20260630",
  "./manifest.webmanifest?v=sielRestore20260630"
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

  if (looksLikeImageRequest(req, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);

        if (self.navigator.onLine) {
          try {
            const response = await fetch(req, { cache: "reload" });
            if (response && (response.ok || response.type === "opaque")) {
              await cache.put(req, response.clone());
              return response;
            }
          } catch (e) {
            if (cached) return cached;
          }
        }

        if (cached) return cached;

        try {
          const response = await fetch(req);
          if (response && (response.ok || response.type === "opaque")) {
            await cache.put(req, response.clone());
          }
          return response;
        } catch (e) {
          return Response.error();
        }
      })
    );
    return;
  }

  if (url.hostname.includes("googleapis.com") || url.hostname.includes("firebase")) {
    return;
  }

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
