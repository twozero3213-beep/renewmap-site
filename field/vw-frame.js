// 브이월드 필지 조회 전용 창. 현장 앱이 sandbox="allow-scripts"(같은 출처 아님)로 띄워, 여기서 실행되는 브이월드 스크립트는
// 현장 앱의 기록·사진·저장소에 닿지 못한다. 부모가 보낸 좌표 1개로 연속지적도를 JSONP로 묻고 필지 1건을 돌려준다. 저장하지 않는다.
// 브이월드 데이터 API는 다른 사이트의 fetch(CORS)를 막아 JSONP만 된다(2026-10-27 확인).
(function () {
  "use strict";
  const KEY = window.RENEWMAP_VWORLD_KEY || "", DOMAIN = "https://twozero3213-beep.github.io/renewmap-site/";
  let n = 0;
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const { id, lng, lat } = e.data || {};
    const reply = (body) => window.parent.postMessage({ id, ...body }, "*");   // 부모는 e.source로 이 창인지 확인한다
    if (!KEY) return reply({ error: "키 없음" });
    if (!(typeof lng === "number" && typeof lat === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return reply({ error: "좌표 오류" });
    const cb = `vw${++n}`, s = document.createElement("script");
    const done = (body) => { clearTimeout(t); delete window[cb]; s.remove(); reply(body); };
    const t = setTimeout(() => done({ error: "시간 초과" }), 10000);
    window[cb] = (d) => {
      const r = d && d.response, f = r && r.status === "OK" && r.result && r.result.featureCollection.features[0];
      done(f ? { props: f.properties, geometry: f.geometry } : { error: r && r.status === "NOT_FOUND" ? "필지 없음" : "조회 실패" });
    };
    s.onerror = () => done({ error: "조회 실패" });
    s.src = "https://api.vworld.kr/req/data?" + new URLSearchParams({ service: "data", request: "GetFeature", data: "LP_PA_CBND_BUBUN", key: KEY, format: "json", geometry: "true",
      attribute: "true", crs: "EPSG:4326", geomFilter: `POINT(${lng} ${lat})`, size: "1", domain: DOMAIN, callback: cb });
    document.head.append(s);
  });
})();
