// 현장 확인 근거 1쪽: 좌표 → 행정동(오프라인 경계), 그 동의 공식 현황(출처·기준일), 1쪽 문서 블록.
// 판정·순위·점수를 만들지 않는다. 값은 data/national 파일에 있는 셀만 옮긴다(지어내지 않음).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../docgen.js"), require("./record.js"));
  else root.FieldEvidence = factory(root.RenewDocgen, root.FieldRecord);
})(typeof window !== "undefined" ? window : this, function (D, R) {
  "use strict";
  const polys = (g) => (!g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
  function inRing(x, y, ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  // 바깥 고리 안이고 구멍 밖이면 안이다
  const contains = (f, lng, lat) => polys(f && f.geometry).some((p) => inRing(lng, lat, p[0]) && !p.slice(1).some((h) => inRing(lng, lat, h)));
  const findFeature = (fc, lng, lat) => ((fc && fc.features) || []).find((f) => contains(f, lng, lat)) || null;

  // 위경도 → 그 자리 기준 m 평면(수 km 안에서는 오차가 작다). 손 보정 지도와 거리 계산이 같이 쓴다
  const M_LAT = 110540, M_LNG = 111320;
  function plane(lat0, lng0) {
    const k = Math.cos((lat0 * Math.PI) / 180) * M_LNG;
    return { toXY: (lng, lat) => [(lng - lng0) * k, (lat0 - lat) * M_LAT], toLngLat: (x, y) => [lng0 + x / k, lat0 - y / M_LAT] };
  }
  function segDist(px, py, [ax, ay], [bx, by]) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  // 점에서 동 경계까지 최소 거리(m). 안에 있으면 0
  function distanceM(f, lng, lat) {
    if (contains(f, lng, lat)) return 0;
    const P = plane(lat, lng);
    let best = Infinity;
    for (const p of polys(f.geometry)) for (const ring of p) {
      const pts = ring.map(([x, y]) => P.toXY(x, y));
      for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(0, 0, pts[i - 1], pts[i]));
    }
    return best;
  }
  // 오차 반경 안에 걸치는 다른 동(코드 순). 경계 근처면 문서에 함께 적는다
  const nearby = (fc, lng, lat, radius, except) => ((fc && fc.features) || [])
    .filter((f) => f !== except && radius > 0 && distanceM(f, lng, lat) <= radius)
    .map((f) => ({ code: String(f.properties.code), name: String(f.properties.name) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // 시군구 경계 → 그 시군구의 행정동 경계 순서로 받는다. 받은 파일은 기억해 두고(서비스 워커가 오프라인용으로도 저장) 다시 받지 않는다
  function makeLocator(getJson) {
    const memo = new Map();
    const get = (p) => { if (!memo.has(p)) memo.set(p, getJson(p).catch((e) => { memo.delete(p); throw e; })); return memo.get(p); };
    return {
      get,
      async locate(lat, lng, accuracy) {
        const sg = findFeature(await get("sigungu.geojson"), lng, lat);
        if (!sg) return null;
        const code5 = String(sg.properties.code), emd = await get(`emd/${code5}.geojson`), f = findFeature(emd, lng, lat);
        return { code5, sgName: String(sg.properties.name), code: f ? String(f.properties.code) : null, name: f ? String(f.properties.name) : null,
          nearby: nearby(emd, lng, lat, Number(accuracy) || 0, f), emd };
      },
    };
  }

  // 1쪽에 싣는 지표(8행 이하, 출처 5개 이하). 노후·인구·고령·청년·사업체·생활 시설의 사실 값만. 안전 시설은 넣지 않는다(D17)
  const PICK = ["DECLINE_AGING_20Y_PCT", "DECLINE_POP_TOTAL", "DECLINE_POP_DROP30Y_PCT", "POP_AGED65_PCT", "POP_YOUTH_PCT", "DECLINE_BIZ_TOTAL", "PARK_AREA_PER_CAPITA", "HOSP_CLINIC_COUNT"];
  const ROWS_MAX = 8, SOURCES_MAX = 5, ROWS_MIN = 4;
  const PAGE_LIMIT_MM = 297 - (20 + 15) - (15 + 15) - 8;   // docgen 1쪽 요약과 같은 본문 높이·여유(PAGE_MM - ONEPAGE_SLACK_MM)
  const srcKey = (c) => JSON.stringify([D.displayName(c.source_name), c.source_url, c.reference_date, String(c.retrieved_at || "").slice(0, 10), c.license_type || c.license || "미표시"]);
  function pickIndicators(code8, emdJson, livingJson, livingIdx) {
    const code = String(code8), find = (j) => ((j && j.dongs) || []).find((d) => String(d.code7 ?? d.code) === code);
    const dong = find(emdJson), years = ((emdJson && emdJson.cells_years) || []).slice().sort((a, b) => a - b), year = years[years.length - 1];
    const by = new Map();
    ((dong && dong.cells) || []).filter((c) => c.base_year === year).forEach((c) => by.set(c.indicator_code, c));
    ((find(livingJson) || {}).cells || []).forEach((c) => by.set(c.indicator_code, c));
    const labels = Object.fromEntries(((livingIdx && livingIdx.indicators) || []).map((i) => [i.code, i.label]));
    const rows = [], keys = new Set();
    for (const k of PICK) {
      const c = by.get(k);
      if (!D.usable(c) || rows.length >= ROWS_MAX) continue;
      const key = srcKey(c);
      if (!keys.has(key) && keys.size >= SOURCES_MAX) continue;      // 출처가 5개를 넘기면 그 행은 싣지 않는다
      keys.add(key);
      rows.push({ code: k, label: labels[k] || D.LABEL[k] || k, value: D.valueWithUnit(c), reference_date: c.reference_date, status: c.status,
        src: { source_name: c.source_name, source_url: c.source_url, reference_date: c.reference_date, retrieved_at: c.retrieved_at, license_type: c.license_type || c.license || "미표시" } });
    }
    return rows;
  }

  const pad = (n) => String(n).padStart(2, "0");
  // 기기 시각(현지)으로 적는다. 저장값은 UTC ISO
  const localTime = (iso) => { const t = new Date(iso); return `${t.getFullYear()}. ${t.getMonth() + 1}. ${t.getDate()}. ${pad(t.getHours())}:${pad(t.getMinutes())}`; };
  const block = (kind, text = "", extra = {}) => ({ kind, text: D.clean(text), rows: [], widths: [], caption: "", small: false, ...extra });

  // rec: makeRecord 결과. images: [{bytes, w, h, src}] (가린 사진, 기록 순서). 반환: docgen의 hwpxBytes·docHTML이 받는 doc
  function buildFieldDoc(rec, images) {
    const d = rec.dong, pics = images || [], when = localTime(rec.recorded_at);
    const place = d ? `${[d.sido, d.sgName].filter(Boolean).join(" ")} ${d.name}`.trim() : "행정동 미확인";
    const title = `${d ? d.name : "현장"} 현장 확인 결과`;
    const lead = `${when.slice(0, -6)} ${place}에서 ${rec.target} 현장을 확인하고 ${pics.length ? `사진 ${pics.length}장을` : "사진 없이 내용을"} 기록했다.`;
    // 위치 한 줄: 좌표·정확도(±m)·보정 여부. 1쪽에 들어가도록 칸을 묶는다
    const loc = rec.lat === null ? "위치 없음" : `위도 ${rec.lat.toFixed(6)}, 경도 ${rec.lng.toFixed(6)}(WGS84) · 정확도 ${rec.accuracy_m === null ? "자료 없음" : `±${Math.round(rec.accuracy_m)}m`} · ${rec.corrected ? "보정됨(작성자가 옮김)" : "보정 안 함"}`;
    const box = [
      ["행정동", d ? `${place} (행정동 코드 ${d.code})${d.nearby.length ? `. 경계 근처(${d.nearby.join("·")})` : ""}` : "확인 못 함"],
      ["위치", loc],
      ["지번", rec.jibun || (rec.pnu ? `필지 번호 ${rec.pnu}` : R.NO_PARCEL)],
      ["기록 시각", when],
      ["확인 내용", `${rec.target}${rec.memo ? ` · ${rec.memo}` : ""}`],
      ...(rec.item ? [["자료와 비교", `${rec.item}: ${rec.observed || "-"} (${R.STATUS_LABEL[rec.status]})`]] : []),
    ];
    const head = [block("title", title), block("para", lead, { strong: true }), block("box", "", { rows: box.map((r) => r.map(D.clean)), widths: [22, 78] })];
    // 사진은 한 줄에 3장(4장이면 4장), 설명은 한 줄로 묶는다. 사진 설명(alt)은 장마다 둔다
    if (pics.length) head.push(block("images", `사진 1~${pics.length}. ${rec.target} · ${when} 촬영 · 얼굴·번호판 가림 확인`.replace("1~1.", "1."), { perRow: pics.length > 3 ? 4 : 3, images: pics.map((p, i) => ({ ...p, caption: `사진 ${i + 1}` })) }));
    const ind = rec.indicators || [], b = d && d.boundary;
    const make = (nRows) => {
      const src = new D.Sources(), blocks = head.slice(), rows = ind.slice(0, nRows);
      blocks.push(block("h1", "이 동의 공식 현황"));
      if (rows.length) blocks.push(block("table", "", { rows: [["지표", "값", "기준일", "출처"], ...rows.map((r) => [r.label, r.value, D.govDate(r.reference_date), src.ref(r.src)].map(D.clean))], widths: [44, 22, 22, 12], caption: `표 1. ${d ? d.name : ""} 현황` }));
      else blocks.push(block("para", "이 위치의 행정동 자료를 찾지 못해 현황 숫자를 싣지 않았다."));
      blocks.push(block("para", `이 문서는 판정이 아니며 순위나 점수를 매기지 않았다.${b ? ` 행정동은 좌표를 ${b.name}(${b.year}년) 경계에 대어 찾았다.` : ""}`));
      if (src.list.length) {
        blocks.push(block("h1", "출처"));
        src.list.forEach((s, n) => blocks.push(block("para", D.sourceLine(n + 1, s), { small: true })));   // '끝' 표시는 쓰지 않는다
      }
      return { kind: "field", sizes: "onepage", title, blocks, sources: src.list, writtenOn: rec.recorded_at.slice(0, 10), footer: "리뉴맵 현장 확인 · ", rows: rows.length };
    };
    // 1쪽에 들어갈 때까지 현황 행을 뒤에서부터 줄인다(4행 아래로는 줄이지 않는다). 분량 추정은 docgen.estimateHeightMm(1쪽 요약과 같은 기준)
    let doc = make(ind.length);
    for (let n = ind.length - 1; n >= Math.min(ROWS_MIN, ind.length) && D.estimateHeightMm(doc) > PAGE_LIMIT_MM; n--) doc = make(n);
    return doc;
  }
  // 같은 날 여러 건이어도 이름이 겹치지 않게 기기 시각(시분)을 붙인다
  const fileName = (rec) => { const t = new Date(rec.recorded_at); return D.safeName(`${rec.dong ? rec.dong.name : "현장"}_현장확인_${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}`); };

  return { inRing, contains, findFeature, plane, distanceM, nearby, makeLocator, PICK, pickIndicators, localTime, buildFieldDoc, fileName };
});
