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
    // 토지특성(1365 흡수, 2026-11-07): PNU 앞 15자리(법정동+산구분+본번)마다 면적·도로접면·지형형상·용도지역·지목만 묻고 돌려준다.
    // 브이월드 약관 제19조(사전 승낙 없는 저장·제공 금지) 때문에 파일로 만들지 않고, 이 계산에만 쓰고 저장하지 않는다(docs/quality/parcels_license_2026-10-28.md)
    if (Array.isArray(e.data.land)) {
      const pres = e.data.land.filter((p) => /^\d{15}$/.test(p)).slice(0, 300), out = new Map();
      const ask = (pre, page) => new Promise((ok) => {
        const cb = `vw${++n}`, s = document.createElement("script");
        const fin = (v) => { clearTimeout(t); delete window[cb]; s.remove(); ok(v); };
        const t = setTimeout(() => fin(null), 15000);
        window[cb] = (d) => fin(d);
        s.onerror = () => fin(null);
        s.src = "https://api.vworld.kr/ned/data/getLandCharacteristics?" + new URLSearchParams({ key: KEY, domain: DOMAIN, pnu: pre, stdrYear: String(e.data.year || ""), format: "json", numOfRows: "1000", pageNo: String(page), callback: cb });
        document.head.append(s);
      });
      (async () => {
        let failed = 0;
        for (let i = 0; i < pres.length; i += 4) {
          await Promise.all(pres.slice(i, i + 4).map(async (pre) => {
            for (let page = 1; page <= 5; page++) {
              const d = await ask(pre, page), box = d && d.landCharacteristicss;
              if (!box || !box.field) { if (!(d && d.response && String(d.response.totalCount) === "0")) failed++; return; }
              // 같은 필지가 갱신일만 다르게 여러 번 온다 → 가장 최근 행
              for (const f of box.field) { const o = out.get(f.pnu); if (!o || (f.lastUpdtDt || "") >= o.u) out.set(f.pnu, { u: f.lastUpdtDt || "", area: Number(f.lndpclAr), road: f.roadSideCodeNm || "", shape: f.tpgrphFrmCodeNm || "", zone: f.prposArea1Nm || "", dae: f.lndcgrCode === "08" }); }
              if (page * 1000 >= Number(box.totalCount || 0)) return;
            }
          }));
        }
        reply({ rows: [...out].map(([pnu, v]) => ({ pnu, area: Number.isFinite(v.area) ? v.area : null, road: v.road, shape: v.shape, zone: v.zone, dae: v.dae })), failed });
      })();
      return;
    }
    // 영역 그리기(T20): 다각형 안 필지의 PNU만 돌려준다. 도형은 돌려주지 않고 저장하지 않는다. 한 번에 1,000필지까지
    if (typeof e.data.wkt === "string") {
      if (!/^POLYGON\(\([0-9., -]+\)\)$/.test(e.data.wkt) || e.data.wkt.length > 8000) return reply({ error: "영역 오류" });
      const cb = `vw${++n}`, s = document.createElement("script");
      const done = (body) => { clearTimeout(t); delete window[cb]; s.remove(); reply(body); };
      const t = setTimeout(() => done({ error: "시간 초과" }), 20000);
      window[cb] = (d) => {
        const r = d && d.response;
        if (r && r.status === "NOT_FOUND") return done({ pnus: [], total: 0 });
        if (!(r && r.status === "OK")) return done({ error: "조회 실패" });
        const pnus = r.result.featureCollection.features.map((f) => String(f.properties.pnu || "")).filter((v) => /^\d{19}$/.test(v));
        done({ pnus, total: Number(r.record && r.record.total) || pnus.length });
      };
      s.onerror = () => done({ error: "조회 실패" });
      s.src = "https://api.vworld.kr/req/data?" + new URLSearchParams({ service: "data", request: "GetFeature", data: "LP_PA_CBND_BUBUN", key: KEY, format: "json", geometry: "false",
        attribute: "true", crs: "EPSG:4326", geomFilter: e.data.wkt, size: "1000", domain: DOMAIN, callback: cb });
      return document.head.append(s);
    }
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
