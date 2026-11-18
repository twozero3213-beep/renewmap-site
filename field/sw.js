// 앱 셸을 캐시해 오프라인에서 연다. 기록은 IndexedDB에만 있고 네트워크로 나가지 않는다.
// 캐시 이름 = 앱 셸 파일 내용의 지문. 파일이 바뀌면 이름도 바뀌어야 새 판이 설치된다(감사 이수진1: v20을 안 올린 채 7번 바뀜).
// 셸 파일을 고치면 field/evidence.test.cjs가 실패하며 새 지문을 알려 준다
// 2026-11-15: f5d3cc214(tasks)가 셸 파일 ../site.js를 바꿨는데 지문을 안 올려 main 테스트가 실패했다 → 테스트가 알려 준 새 지문으로 맞춘다
// 2026-11-15: 양산·거제 SOC 시설 이름의 새 글자로 글꼴(../fonts/pretendard-variable.woff2)을 다시 만들어 지문을 다시 맞춘다
// 2026-11-16: #138과 main(셸 파일·글꼴 변경)을 합친 뒤 테스트가 알려 준 지문으로 맞춘다
// 2026-11-17: field.css(입력 칸 밑 도움말 간격)를 고쳐 테스트가 알려 준 새 지문으로 맞춘다
// 2026-11-17: 현장 기록 첫 안내 문구(index.html)를 고쳐 테스트가 알려 준 새 지문으로 맞춘다
// 2026-11-18: 공개판에 '몇 동 더 확인하면 정해지나'(redev.js·redev-app.js)와 사용자 편의 검토(현장 기록·구역 계산 화면)를 선택 반영해 셸 지문을 다시 맞춘다
// 2026-11-19: 공개판에 1차 개선(P01~P10, P07 제외)을 선택 반영해 셸 지문을 다시 맞춘다
const CACHE = "renewmap-field-bb905f99d4";
const SHELL = ["./", "index.html", "field.css", "record.js?v=20261119-r3", "store.js", "evidence.js?v=20261119-r3", "app.js?v=20261119-r3", "manifest.webmanifest", "../pretendard.css", "../fonts/pretendard-variable.woff2", "../styles.css", "../v4.css", "../site-v4.css", "../site.js", "../site-motion.js", "../frame-guard.js", "../docgen.js?v=20261119-r3", "../cellpack.js", "../list-pages.js", "../list-pages.css", "../rm6.css",
  "../data/report_templates.json", "upload.js", "upload-config.js", "detect.js", "redev.html", "redev.js", "redev-app.js", "parcel-ref.js", "twin.html", "twin.css", "twin.js", "twin-app.js", "../favicon.svg", "../icon-192.png"];
// 설치 때는 브라우저 HTTP 캐시(Pages max-age=600)를 건너뛴다. 안 그러면 갱신 직전에 열어 둔 옛 파일이 새 캐시에 들어간다
// 새 판은 기다리지 않고 바로 자리를 잡는다(skipWaiting·claim). 안 그러면 탭을 모두 닫기 전까지 옛 계산 파일이 나간다(2026-10-30 배포 직후 실측). 화면은 controllerchange로 새로고침을 안내한다
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("renewmap-field-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// 처음 쓸 때 받아 두었다가 오프라인 현장에서도 쓰는 것: 자동 가림 도구(vendor/vision, 약 20MB), 행정동 경계·현황(data/national), 건물 자료(data/buildings, N1)
const KEEP = /\/vendor\/vision\/|\/data\/buildings\/\d{10}\.json|\/data\/national\/(?:sigungu\.geojson|index\.json|ref_lines\.json|emd\/|living\/)/;
// 온라인 탐색은 새 HTML을 받고, 통신 실패일 때만 현재 셸로 연다. 404는 옛 화면으로 덮지 않는다.
// 첫 자료 수신도 HTTP 캐시를 재검증해 공개에서 뺀 자료·이름이 새 오프라인 캐시에 되살아나지 않게 한다.
self.addEventListener("fetch", (e) => {
  if (e.request.cache === "no-cache" && e.request.mode !== "navigate") return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).catch(async (error) => {
      const hit = await caches.match(e.request, { cacheName: CACHE, ignoreSearch: true });
      if (hit) return hit;
      throw error;
    }));
    return;
  }
  e.respondWith(caches.match(e.request, { cacheName: CACHE }).then((hit) => hit || fetch(e.request, KEEP.test(e.request.url) ? { cache: "no-cache" } : undefined).then((res) => {
    if (res.ok && KEEP.test(e.request.url)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
