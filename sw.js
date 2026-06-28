const CACHE_NAME = "siel-aac-app-sielResponsiveCategory20260628";
const IMAGE_CACHE = "siel-aac-image-cache-v12";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=sielResponsiveCategory20260628",
  "./app.js?v=sielResponsiveCategory20260628",
  "./manifest.webmanifest?v=sielResponsiveCategory20260628"
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

function isImageRequest(req, url) {
  return req.destination === "image"
    || /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url.pathname)
    || url.hostname.includes("firebasestorage.googleapis.com")
    || url.pathname.includes("/o/");
}

async function cachedIndex() {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match("./index.html")) || (await cache.match("./")) || (await caches.match("./index.html"));
}

function rawImageUrl(url) {
  const clone = new URL(url.toString());
  clone.searchParams.delete("sielImg");
  return clone.toString();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(async (response) => {
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("./index.html", response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await cachedIndex();
          return cached || Response.error();
        })
    );
    return;
  }

  if (isImageRequest(req, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const rawUrl = rawImageUrl(url);
        const cachedRaw = await cache.match(rawUrl);

        if (self.navigator.onLine) {
          try {
            const response = await fetch(req, { cache: "reload" });
            if (response && (response.ok || response.type === "opaque")) {
              await cache.put(req, response.clone());
              await cache.put(rawUrl, response.clone());
              return response;
            }
          } catch (e) {
            if (cached) return cached;
            if (cachedRaw) return cachedRaw;
          }
        }

        if (cached) return cached;
        if (cachedRaw) return cachedRaw;

        try {
          const response = await fetch(req);
          if (response && (response.ok || response.type === "opaque")) {
            await cache.put(req, response.clone());
            await cache.put(rawUrl, response.clone());
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
      if (cached) return cached;

      return fetch(req).then((response) => {
        if (response && response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      }).catch(async () => {
        if (url.origin === self.location.origin) {
          const index = await cachedIndex();
          if (index) return index;
        }
        return Response.error();
      });
    })
  );
});
