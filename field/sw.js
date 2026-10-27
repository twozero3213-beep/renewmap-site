// 앱 셸만 캐시해 오프라인에서 연다. 기록은 IndexedDB에만 있고 네트워크로 나가지 않는다.
const CACHE = "renewmap-field-v2";
const SHELL = ["./", "index.html", "record.js", "app.js", "manifest.webmanifest", "../pretendard.css", "../docgen.js", "../favicon.svg", "../icon-192.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request))));
