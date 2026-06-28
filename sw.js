const CACHE_NAME = "siel-aac-app-sielPwaCardFixed20260628";
const IMAGE_CACHE = "siel-aac-image-cache-v5";
const APP_SHELL=["./","./index.html","./styles.css?v=sielPwaCardFixed20260628","./app.js?v=sielPwaCardFixed20260628","./manifest.webmanifest?v=sielPwaCardFixed20260628"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("siel-aac-app-")&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
function isImg(req,u){return req.destination==="image"||/\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(u.pathname)||u.hostname.includes("firebasestorage.googleapis.com")||u.pathname.includes("/o/");}
self.addEventListener("fetch",e=>{
 const req=e.request;if(req.method!=="GET")return;const u=new URL(req.url);
 if(isImg(req,u)){e.respondWith(caches.open(IMAGE_CACHE).then(async cache=>{
   const cached=await cache.match(req);
   if(self.navigator.onLine){try{const r=await fetch(req,{cache:"reload"});if(r&&(r.ok||r.type==="opaque")){await cache.put(req,r.clone());return r;}}catch(err){if(cached)return cached;}}
   if(cached)return cached;
   try{const r=await fetch(req);if(r&&(r.ok||r.type==="opaque"))await cache.put(req,r.clone());return r;}catch(err){return Response.error();}
 }));return;}
 if(u.hostname.includes("googleapis.com")||u.hostname.includes("firebase"))return;
 e.respondWith(caches.match(req).then(cached=>{const net=fetch(req).then(r=>{if(r&&r.ok&&u.origin===self.location.origin)caches.open(CACHE_NAME).then(c=>c.put(req,r.clone()));return r;}).catch(()=>cached);return cached||net;}));
});
