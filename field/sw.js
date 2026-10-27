// 앱 셸만 캐시해 오프라인에서 연다. 기록은 IndexedDB에만 있고 네트워크로 나가지 않는다.
const CACHE = "renewmap-field-v3";
const SHELL = ["./", "index.html", "record.js", "app.js", "manifest.webmanifest", "../pretendard.css", "../docgen.js", "upload.js", "upload-config.js", "detect.js", "../favicon.svg", "../icon-192.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
// 자동 가림 도구(vendor/vision, 약 20MB)는 처음 쓸 때 받아 두었다가 오프라인 현장에서도 쓴다
self.addEventListener("fetch", (e) => e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
  if (res.ok && /\/vendor\/vision\//.test(e.request.url)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
  return res;
}))));
