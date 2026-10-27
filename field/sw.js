// 앱 셸을 캐시해 오프라인에서 연다. 기록은 IndexedDB에만 있고 네트워크로 나가지 않는다.
const CACHE = "renewmap-field-v8";
const SHELL = ["./", "index.html", "field.css", "record.js", "store.js", "evidence.js", "app.js", "manifest.webmanifest", "../pretendard.css", "../styles.css", "../site.js", "../docgen.js",
  "../data/report_templates.json", "upload.js", "upload-config.js", "detect.js", "redev.html", "redev.js", "redev-app.js", "../favicon.svg", "../icon-192.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
// 처음 쓸 때 받아 두었다가 오프라인 현장에서도 쓰는 것: 자동 가림 도구(vendor/vision, 약 20MB), 행정동 경계·현황(data/national), 건물 자료(data/buildings, N1)
const KEEP = /\/vendor\/vision\/|\/data\/buildings\/\d{10}\.json|\/data\/national\/(?:sigungu\.geojson|index\.json|emd\/|living\/)/;
// 새 자료 점검(app.js checkData)은 cache: "no-cache"로 묻는다. 캐시를 건너뛰고 브라우저가 서버에 직접 묻게 둔다
self.addEventListener("fetch", (e) => e.request.cache === "no-cache" ? undefined : e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
  if (res.ok && KEEP.test(e.request.url)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
  return res;
}))));
