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
      // num·unit·formula·rule_version·spatial_unit·cell_id는 해명서 부록용(값은 1쪽과 같은 셀)
      rows.push({ code: k, label: labels[k] || D.LABEL[k] || k, value: D.valueWithUnit(c), reference_date: c.reference_date, status: c.status,
        num: typeof c.value === "number" ? c.value : null, unit: c.unit || "", formula: c.formula_text || "", rule_version: c.rule_version || "", spatial_unit: c.spatial_unit || "", cell_id: c.cell_id || "",
        src: { source_name: c.source_name, source_url: c.source_url, reference_date: c.reference_date, retrieved_at: c.retrieved_at, license_type: c.license_type || c.license || "미표시" } });
    }
    return rows;
  }

  // ── 가까운 건물(N1). 법정동 경계가 없어 행정동에서 법정동을 근사한다: living 파일 허가 셀 메모의 '관할 법정동(...): 반여동 63건, ...'을 먼저 쓰고,
  // 없으면 이름의 숫자를 뺀다(반여1동 → 반여동). 후보는 그 시군구 living.bjdong_cells에 있는 법정동만(건물 파일 이름과 같은 10자리 코드)
  function bjdongCandidates(code8, name, living) {
    const dong = ((living && living.dongs) || []).find((d) => String(d.code7 ?? d.code) === String(code8));
    const note = (((dong && dong.cells) || []).find((c) => /관할 법정동/.test(c.note || "")) || {}).note || "";
    const m = /관할 법정동[^:]*:\s*([^.]+)/.exec(note);
    const names = m ? m[1].split(/,\s+/).map((x) => x.trim().replace(/\s+\d[\d,]*건$/, "")) : [String(name || "").replace(/\d+(?=동$)/, "")];
    return ((living && living.bjdong_cells) || []).filter((b) => names.includes(b.name)).map((b) => ({ code10: String(b.code10), name: String(b.name) }));
  }
  // 건물 자료(buildings/{법정동}.json)에 좌표가 없어 사진 위치로는 거리를 못 잰다. 지번으로 찾는다: 같은 본번 안에서 부번이 가까운 순, 최대 3동.
  // 지번 뒤에 낱말을 더 적으면 건물 이름에 그 낱말이 든 것만 남긴다(예: '22 101동'). ponytail: 좌표가 생기면 거리순으로 바꾼다
  const JIBUN_RE = /^(산)?(\d+)(?:-(\d+))?$/;
  function findBuildings(files, query, max = 3) {
    const [j, ...words] = String(query || "").trim().replace(/번지/g, "").split(/\s+/), q = JIBUN_RE.exec(j || "");
    if (!q) return { hits: [], total: 0 };
    const sub = (m) => Number(m[3] || 0), word = words.join(" ");
    const all = (files || []).flatMap((f) => (f.buildings || []).map((b) => ({ b, f, k: JIBUN_RE.exec(String(b.jibun || "")) })))
      .filter((x) => x.k && x.k[1] === q[1] && x.k[2] === q[2] && (!word || String(x.b.name || "").includes(word)))
      .sort((a, b) => Math.abs(sub(a.k) - sub(q)) - Math.abs(sub(b.k) - sub(q)) || sub(a.k) - sub(b.k));
    return { hits: all.slice(0, max).map(({ b, f }) => ({ b, f, exact: b.jibun === j })), total: all.length };
  }
  // 고른 건물을 기록 칸으로. 표제부의 정해진 칸만 옮긴다(소유자 등 개인 항목은 읽지 않는다)
  const buildingFill = (b, f) => ({ pnu: b.pnu, jibun: b.jibun, bjd10: f.bjd10, bjd_name: f.name, use_apr_day: b.use_apr_day, main_use: b.main_use, structure: b.structure, floors: b.floors,
    reference_date: f.hub_reference_date, src: { source_name: f.source, source_url: f.source_url, retrieved_at: f.retrieved_at, license_type: f.license } });
  // 이용조건(N3): 파일에 있는 값만. 없거나 '미표시'면 '미확인'(추정해서 채우지 않는다)
  const lic = (v) => (!v || v === "미표시" ? "미확인" : String(v));
  const bldLine = (bd) => [bd.pnu ? `PNU ${bd.pnu}` : `지번 ${bd.jibun || "-"}`, `사용승인 ${bd.use_apr_day ? D.govDate(bd.use_apr_day) : "자료 없음"}`, bd.main_use || "주용도 자료 없음", bd.structure || "구조 자료 없음",
    bd.floors === null ? "층수 자료 없음" : `지상 ${bd.floors}층`].join(" · ");

  const pad = (n) => String(n).padStart(2, "0");
  // 기기 시각(현지)으로 적는다. 저장값은 UTC ISO
  const localTime = (iso) => { const t = new Date(iso); return `${t.getFullYear()}. ${t.getMonth() + 1}. ${t.getDate()}. ${pad(t.getHours())}:${pad(t.getMinutes())}`; };
  const block = (kind, text = "", extra = {}) => ({ kind, text: D.clean(text), rows: [], widths: [], caption: "", small: false, ...extra });

  const localDay = (iso) => localTime(iso).slice(0, -6);
  // 출처 짧은 이름: 표시 이름의 첫 기관명(괄호 포함). 자세한 출처는 위 첨자 번호로 맨 아래 목록에 있다
  const shortSrc = (name) => (/^[^\s(]+(?:\([^)]*\))?/.exec(D.displayName(name)) || [String(name)])[0];
  // 기준일 문자열(YYYY-MM-DD) 중 가장 이른 날. 없으면 null
  const oldestDate = (rows) => (rows || []).map((r) => String(r.reference_date || "")).filter(Boolean).sort()[0] || null;

  // 1쪽 머리 요약 3줄(A1). 기록 값만 기계적으로 옮긴다. 지어낸 문장·판정어·순위·점수는 넣지 않는다
  function summaryRows(rec, rows, src) {
    const d = rec.dong, pics = (rec.photos || []).length;
    const where = rec.lat === null || rec.lat === undefined
      ? ["위치 없음", rec.jibun || (rec.pnu ? `필지 번호 ${rec.pnu}` : R.NO_PARCEL)]
      : [d ? `${[d.sido, d.sgName].filter(Boolean).join(" ")} ${d.name}`.trim() : "행정동 미확인", rec.accuracy_m === null ? "오차 자료 없음" : `오차 약 ±${Math.round(rec.accuracy_m)}m`,
        ...(rec.corrected ? ["보정됨"] : []), ...(d && d.nearby.length ? [`경계 근처: ${d.nearby.join("·")}`] : [])];
    const seen = [rec.target, ...(rec.memo ? [rec.memo] : []), rec.status === "추가확인" ? "자료와 비교 모름" : `${R.STATUS_LABEL[rec.status]}${rec.item ? `(${rec.item})` : ""}`,
      pics ? `사진 ${pics}장` : "사진 없음", `${localTime(rec.recorded_at)} 촬영`];
    const nums = rows.slice(0, 2).map((r) => `${r.label} ${r.value} (${shortSrc(r.src.source_name)}, ${D.govDate(r.reference_date)})${src.ref(r.src)}`);
    return [["위치", where.join(" · ")], ["관찰", seen.join(" · ")], ["공식 숫자", nums.length ? nums.join(" · ") : "선택한 공식 숫자 없음"]];
  }

  // 출처 종류(제우스벤처스 출처 등급·SGIS 지표 설명 표에서 배움): 신뢰 점수가 아니라 어떤 종류의 근거인지만 적는다. '리뉴맵 기준 비교(쇠퇴진단지표…)'가 먼저 걸리게 순서 고정
  const SRC_KINDS = [[/^리뉴맵/, "리뉴맵 계산"], [/주민등록인구통계|사업체조사|쇠퇴진단지표|KOSIS|통계청/, "공식 통계"]];
  const srcKind = (name) => (SRC_KINDS.find(([re]) => re.test(String(name || ""))) || [null, "행정 자료"])[1];

  // 같은 자리 바로 전 기록(기준일 비교의 상대). 지운 기록·뒤 기록은 쓰지 않는다
  const prevAtSite = (records, rec) => (!rec.site_id ? null : (records || [])
    .filter((r) => r.id !== rec.id && siteOf(r) === rec.site_id && String(r.recorded_at) < String(rec.recorded_at))
    .sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))[0] || null);
  // 기준일 비교(AFCC 원문 대조·Gridics 판본에서 배움): 지표 코드가 같은 행만 맞대고 값이나 기준일이 바뀐 것만 남긴다. 해석·판정은 붙이지 않는다
  function compareRows(cur, prev) {
    const before = new Map(((prev && prev.indicators) || []).map((r) => [r.code, r]));
    const both = ((cur && cur.indicators) || []).filter((r) => r.code && before.has(r.code));
    const changed = both.filter((r) => before.get(r.code).value !== r.value || before.get(r.code).reference_date !== r.reference_date)
      .map((r) => ({ label: r.label, before: before.get(r.code).value, after: r.value, beforeDate: before.get(r.code).reference_date, afterDate: r.reference_date }));
    return { compared: both.length, changed };
  }
  const compareLine = (prev, cmp) => (cmp.changed.length
    ? `${localDay(prev.recorded_at)} 기록 대비 바뀐 숫자 ${cmp.changed.length}개: ${cmp.changed.map((c) => `${c.label} ${c.before}(${D.govDate(c.beforeDate)})에서 ${c.after}(${D.govDate(c.afterDate)})로`).join(" · ")}${cmp.compared > cmp.changed.length ? ` · 나머지 ${cmp.compared - cmp.changed.length}개 같음` : ""}`
    : `${localDay(prev.recorded_at)} 기록과 공식 숫자 ${cmp.compared}개 모두 같음`);

  // rec: makeRecord 결과. images: [{bytes, w, h, src}] (가린 사진. 이 기록 사진 다음에 고른 이전 기록 사진 {prev: 날짜 ISO}).
  // before: 같은 자리 바로 전 기록(prevAtSite, 없으면 생략). 반환: docgen의 hwpxBytes·docHTML이 받는 doc
  function buildFieldDoc(rec, images, before) {
    const d = rec.dong, pics = images || [], when = localTime(rec.recorded_at);
    const title = `${d ? d.name : "현장"} 현장 확인 결과`;
    // 위치 한 줄: 좌표·정확도(±m)·보정 여부. 1쪽에 들어가도록 칸을 묶는다
    const loc = rec.lat === null ? "위치 없음" : `위도 ${rec.lat.toFixed(6)}, 경도 ${rec.lng.toFixed(6)}(WGS84) · 정확도 ${rec.accuracy_m === null ? "자료 없음" : `±${Math.round(rec.accuracy_m)}m`} · ${rec.corrected ? "보정됨(작성자가 옮김)" : "보정 안 함"}`;
    const prevDays = (rec.site_prev || []).map(localDay), bd = rec.building, checks = rec.checks || [], cmp = compareRows(rec, before);
    const picNo = (id) => { const i = (rec.photos || []).indexOf(id); return i < 0 ? "" : `(사진 ${i + 1})`; };
    // 현장 확인 결과(판정 아님): 본 항목만 '항목: 메모(사진 n)'. memos=false면 메모를 빼고 항목 이름·사진 번호만(1쪽이 넘칠 때)
    const checkText = (memos) => [...checks.map((c) => `${R.CHECKS.find((x) => x.id === c.id).label}${memos && c.memo ? `: ${c.memo}` : ""}${picNo(c.photo)}`),
      ...(checks.length < R.CHECKS.length ? [`확인 안 함: ${R.CHECKS.filter((x) => !checks.some((c) => c.id === x.id)).map((x) => x.label).join(", ")}`] : []),
      ...(!memos && checks.some((c) => c.memo) ? ["메모는 원본 기록에 있음"] : [])].join(" · ");
    const box = [
      // 동 이름·경계 근처·관찰 내용은 머리 요약에 있어 여기서는 코드·좌표·지번만 둔다(1쪽 분량)
      ["위치", loc],
      // 확인자(소속·직위). 이름·서명은 결재 문서에서 한다
      ...(rec.checker ? [["확인자", `${rec.checker} · ${when} 현장 확인`]] : []),
      ["행정동·지번", `${d ? `행정동 코드 ${d.code}` : "행정동 확인 못 함"} · ${rec.jibun ? `지번 ${rec.jibun}` : rec.pnu ? `필지 번호 ${rec.pnu}` : R.NO_PARCEL}`],
      ...(rec.item ? [["자료와 비교", `${rec.item}: ${rec.observed || "-"} (${R.STATUS_LABEL[rec.status]})`]] : []),
      // 같은 자리 이전 기록(A4): 작성자가 묶은 것만. 반경은 묶을 때 쓴 설정값
      ...(prevDays.length ? [["같은 자리", `이전 기록 ${prevDays.length}건(${prevDays.join(", ")})${rec.site_radius_m ? ` · 반경 ${rec.site_radius_m}m 안에서 작성자가 묶음` : ""}`]] : []),
      ...(before && cmp.compared ? [["지난 기록과 비교", compareLine(before, cmp)]] : []),
    ];
    // 사진은 한 줄에 3장(4장이면 4장), 설명은 한 줄로 묶는다. 사진 설명(alt)은 장마다 둔다
    const own = pics.filter((p) => !p.prev).length, prev = pics.filter((p) => p.prev);
    const range = (a, b) => (a === b ? `사진 ${a}` : `사진 ${a}~${b}`);
    const picText = [own ? `${range(1, own)}. ${rec.target} · ${when} 촬영` : "", prev.length ? `${range(own + 1, pics.length)}. 같은 자리 이전 기록(${[...new Set(prev.map((p) => localDay(p.prev)))].join(", ")})` : ""].filter(Boolean).join(" / ");
    const ind = rec.indicators || [], b = d && d.boundary;
    const make = (nRows, memos, oneRow) => {
      const src = new D.Sources(), rows = ind.slice(0, nRows), oldest = oldestDate(rows), snap = rec.data_snapshot;
      // 요약 상자가 먼저 출처 번호를 받는다. 앞 1~2행이라 표의 번호와 같다
      const blocks = [block("title", title), block("box", "", { rows: summaryRows(rec, rows, src).map((r) => r.map(D.clean)), widths: [16, 84], refs: true }),
        block("para", ["판정 아님", ...(oldest ? [`가장 오래된 자료 기준일 ${D.govDate(oldest)}`] : []), ...(snap && snap.generated_at ? [`자료 묶음 ${D.govDate(snap.generated_at.slice(0, 10))}`] : [])].join(" · "), { small: true }),
        block("box", "", { rows: [...box,
          // 작성자가 고른 건물(N1): 건축물대장 표제부 값과 기준일·출처 번호. 법정동은 행정동에서 근사했다
          ...(bd ? [["건물(자동 채움)", `${bldLine(bd)} · 건축물대장 기준일 ${D.govDate(bd.reference_date)}${src.ref(bd.src)} · 작성자가 고름(법정동 ${bd.bjd_name}은 행정동에서 근사)`]] : []),
          ...(checks.length || R.CHECK_TARGETS.includes(rec.target) ? [["현장 확인 결과(판정 아님)", checks.length ? checkText(memos) : "확인한 항목 없음"]] : []),
        ].map((r) => r.map(D.clean)), widths: [22, 78], refs: true })];
      if (pics.length) blocks.push(block("images", `${picText} · 얼굴·번호판 가림 확인`, { perRow: oneRow ? pics.length : pics.length > 3 ? 4 : 3, images: pics.map((p, i) => ({ ...p, caption: `사진 ${i + 1}` })) }));
      blocks.push(block("h1", "이 동의 공식 현황"));
      if (rows.length) blocks.push(block("table", "", { rows: [["지표", "값", "기준일", "출처(종류)"], ...rows.map((r) => [r.label, r.value, D.govDate(r.reference_date), `${srcKind(r.src.source_name)}${src.ref(r.src)}`].map(D.clean))], widths: [40, 18, 20, 22], caption: `표 1. ${d ? d.name : ""} 현황` }));
      else blocks.push(block("para", "이 위치의 행정동 자료를 찾지 못해 현황 숫자를 싣지 않았다."));
      blocks.push(block("para", `이 문서는 판정이 아니며 순위나 점수를 매기지 않았다.${b ? ` 행정동은 좌표를 ${b.name}(${b.year}년, 이용조건 ${lic(b.license)}) 경계에 대어 찾았다.` : ""}`));
      if (src.list.length) {
        blocks.push(block("h1", "출처"));
        // 이용조건(N3): 출처마다 파일에 적힌 공공누리 유형·이용허락범위. 없으면 '미확인'
        src.list.forEach((s, n) => blocks.push(block("para", D.sourceLine(n + 1, { ...s, license: lic(s.license) }), { small: true })));   // '끝' 표시는 쓰지 않는다
      }
      return { kind: "field", sizes: "onepage", title, blocks, sources: src.list, writtenOn: rec.recorded_at.slice(0, 10), footer: "리뉴맵 현장 확인 · ", rows: rows.length, oldest, checkMemos: memos, photoOneRow: !!oneRow };
    };
    // 1쪽에 들어갈 때까지 줄이는 순서: ① 현황 행을 뒤에서부터 4행까지 ② 확인 항목 메모를 뺀다(항목 이름·사진 번호는 남김)
    // ③ 사진 5장을 한 줄에 작게 놓는다(4장 이하는 이미 한 줄). ②·③은 그렇게 해서 1쪽에 들어갈 때만 쓴다.
    // 들어가지 않으면 메모를 지우지 않고 ①까지만 줄인 문서를 낸다(실제 쪽 수는 PDF로 확인). 분량 추정은 docgen.estimateHeightMm(1쪽 요약과 같은 기준)
    const over = (x) => D.estimateHeightMm(x) > PAGE_LIMIT_MM;
    let doc = make(ind.length, true);
    for (let n = ind.length - 1; n >= Math.min(ROWS_MIN, ind.length) && over(doc); n--) doc = make(n, true);
    if (!over(doc)) return doc;
    const keep = !checks.some((c) => c.memo);      // 메모가 없으면 ②는 할 것이 없다
    const tries = [...(keep ? [] : [make(doc.rows, false)]), ...(pics.length > 4 ? [make(doc.rows, keep, true)] : [])];
    return tries.find((x) => !over(x)) || doc;
  }

  // 같은 자리 이전 기록(A4): 반경 안 기록을 거리(m 단위 반올림)·날짜(최근 먼저) 순으로. 순위·점수는 매기지 않는다
  const siteOf = (r) => r.site_id || r.id;
  function nearbyRecords(records, lat, lng, radius) {
    const P = plane(lat, lng);
    return (records || []).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r) => ({ rec: r, dist: Math.round(Math.hypot(...P.toXY(r.lng, r.lat))) }))
      .filter((x) => x.dist <= radius)
      .sort((a, b) => a.dist - b.dist || String(b.rec.recorded_at).localeCompare(String(a.rec.recorded_at)));
  }
  // 사진대지(공무달인·ReportShot 같은 사진대지 앱을 대신): 고른 기록들의 가린 사진을 한 줄 2장으로 싣고, 사진마다 대상·위치·촬영 시각 표를 붙인다.
  // items: [{rec, images}] (images는 그 기록 자신의 가린 사진만). 쪽 수는 사진 수만큼 늘어난다
  function buildPhotoSheet(items, now) {
    const pics = [], rows = [["사진", "대상·메모", "위치", "촬영"]];
    for (const { rec, images } of items || []) for (const img of images || []) {
      const n = pics.length + 1, d = rec.dong;
      pics.push({ ...img, caption: `사진 ${n}` });
      rows.push([`사진 ${n}`, [rec.target, rec.memo].filter(Boolean).join(" · "),
        [d ? `${d.sgName} ${d.name}` : "행정동 미확인", rec.jibun ? `지번 ${rec.jibun}` : "", rec.accuracy_m === null || rec.accuracy_m === undefined ? "" : `±${Math.round(rec.accuracy_m)}m`].filter(Boolean).join(" · "),
        localTime(rec.recorded_at)].map(D.clean));
    }
    const recs = (items || []).filter((x) => (x.images || []).length).length, day = now.toISOString().slice(0, 10);
    const blocks = [block("title", "현장 사진대지"), block("para", `판정 아님 · 기록 ${recs}건 · 사진 ${pics.length}장 · 얼굴·번호판 가림 확인 · ${D.govDate(day)} 작성`, { small: true })];
    if (pics.length) blocks.push(block("images", "", { perRow: 2, images: pics }), block("table", "", { rows, widths: [12, 38, 32, 18], caption: "표 1. 사진 설명" }));
    return { kind: "field", title: "현장 사진대지", blocks, sources: [], writtenOn: day, footer: "리뉴맵 사진대지 · ", photos: pics.length };
  }

  // ── 해명서 부록(외부 제안 #5, D19): "이 숫자 어디서 왔나, 기준을 바꾸면 결과가 바뀌나"에 답하는 부록. 순위·점수·추천·지정 판단 없음
  // 법정·공식 기준선. backend/renewmap/rules/decline.py·living_std.py의 RULE_VERSION·STANDARDS와 같게 둔다(approved_by가 채워지면
  // backend/tests/test_explainer_rules.py가 실패해 여기 '승인 대기'를 고치게 한다)
  const LEGAL = {
    DECLINE_POP_DROP30Y_PCT: { line: 20, above: true, text: "최근 30년 최대 대비 20% 이상 감소(또는 5년 중 3년 연속 감소)", law: "도시재생 활성화 및 지원에 관한 특별법 시행령 제17조", rule: "decline-3req-v0.1" },
    DECLINE_AGING_20Y_PCT: { line: 50, above: true, text: "준공 20년 이상 건축물 비율 50% 이상", law: "도시재생 활성화 및 지원에 관한 특별법 시행령 제17조", rule: "decline-3req-v0.1" },
    PARK_AREA_PER_CAPITA: { line: 6, above: false, text: "도시공원 확보기준 주민 1인당 6㎡ 이상(법은 도시지역 단위라 행정동 적용은 참고 비교)", law: "도시공원 및 녹지 등에 관한 법률 시행규칙 제4조", rule: "LIVING-STD-2026.10" },
  };
  // 법정 기준이 아닌 비율 지표에만 쓰는 참고선. 어느 지표에 몇 %를 쓸지는 사람 결정 전 초안(absorb_six_proposals §4-1)
  const REF_LINES = [15, 20, 25];
  const REF_CODES = ["POP_AGED65_PCT", "POP_YOUTH_PCT"];
  // 가림(SGIS 인구부문: 5 미만 N/A). 출처가 N/A로 준 값은 pickIndicators에서 이미 빠진다. 원래 값은 기록하지 않는다
  const maskRule = (r) => (r.unit === "명" && Number.isFinite(r.num) && r.num < 5 ? "SGIS-5" : null);
  const side = (v, line) => (v >= line ? `기준선 ${line} 이상` : `기준선 ${line} 미만`);
  function basisText(r) {
    const L = LEGAL[r.code];
    if (L) return `법정: ${L.text} · ${L.law} · 판본 ${L.rule}(승인 대기 초안)${Number.isFinite(r.num) ? ` · 이 값은 ${side(r.num, L.line)}` : ""}`;
    if (REF_CODES.includes(r.code) && Number.isFinite(r.num)) return `참고선(법정 기준 아님): ${REF_LINES.map((x) => `${x}% ${r.num >= x ? "이상" : "미만"}`).join(" · ")}`;
    return "기준선 없음(사실 값)";
  }

  // rec: makeRecord 결과. now: 작성 시각. 반환: hwpxBytes·docHTML이 받는 doc + masking_log(원래 값 없음)
  function buildExplainer(rec, now) {
    const d = rec.dong, title = `${d ? d.name : "현장"} 숫자 해명서(부록)`, src = new D.Sources(), at = now.toISOString(), log = [];
    const rows = (rec.indicators || []).map((r) => {
      const rule = maskRule(r);
      if (rule) log.push({ cell_id: r.cell_id || `${d ? d.code : ""}:${r.code}`, indicator: r.label, area_code: d ? d.code : "", rule, reference_date: r.reference_date, created_at: at });
      const unit = [r.spatial_unit || (d ? "행정동" : ""), r.rule_version ? `값 판본 ${r.rule_version}` : ""].filter(Boolean).join(" · ");
      return [r.label, `${rule ? "N/A(통계비밀보호, 5 미만)" : r.value}${unit ? ` · ${unit}` : ""}`, `${srcKind(r.src.source_name)}${src.ref(r.src)} · ${lic(r.src.license_type)}`,
        `${D.govDate(r.reference_date)} 기준 / ${D.govDate(String(r.src.retrieved_at || "").slice(0, 10))} 조회`, rule ? "가림" : basisText(r)].map(D.clean);
    });
    const blocks = [block("title", title),
      block("para", "이 부록은 숫자의 출처와 기준을 설명합니다. 지정·예산·순위 결정이 아닙니다. 기준값을 바꾼 결과는 참고이며 어느 기준이 맞다고 판단하지 않습니다.", { small: true }),
      block("para", [`대상 기록 ${localTime(rec.recorded_at)}`, d ? `${d.sgName} ${d.name}(행정동 코드 ${d.code})` : "행정동 미확인", `${D.govDate(at.slice(0, 10))} 작성`].join(" · "), { small: true })];
    if (!rows.length) blocks.push(block("para", "이 기록에는 공식 숫자가 없어 설명할 지표가 없다."));
    else {
      blocks.push(block("table", "", { rows: [["지표", "값·공간 단위", "출처(종류)·이용조건", "기준일·조회일", "기준"], ...rows], widths: [17, 17, 20, 16, 30], caption: "표 1. 지표별 출처와 기준" }));
      // 계산식: 원장 셀의 formula_text 그대로. 없으면(이전 기록) 그렇다고 적는다
      blocks.push(block("h1", "계산식"));
      (rec.indicators || []).forEach((r) => blocks.push(block("bullet", `${r.label}: ${r.formula || "계산식 자료 없음(이 기능 전에 저장한 기록)"}`)));
      // 생활SOC 대안 문장: 법정 기준선의 반대쪽(공원 6㎡ 미만)에 있을 때만 사실 한 줄. 무엇을 지으라는 권고가 아니다
      const soc = (rec.indicators || []).filter((r) => r.code === "PARK_AREA_PER_CAPITA" && Number.isFinite(r.num) && r.num < LEGAL.PARK_AREA_PER_CAPITA.line);
      if (soc.length) {
        blocks.push(block("h1", "생활SOC 기준 대비 사실"));
        soc.forEach((r) => blocks.push(block("bullet", `도시공원 확보기준 1인당 6㎡ 대비: 이 동 ${r.value}(${D.govDate(r.reference_date)} 기준). 공원 조성 권고가 아니다.`)));
      }
    }
    blocks.push(block("h1", "가림 기록"));
    if (log.length) blocks.push(block("table", "", { rows: [["셀", "지표", "공간 단위 코드", "규칙", "기준일"], ...log.map((x) => [x.cell_id, x.indicator, x.area_code, x.rule, D.govDate(x.reference_date)].map(D.clean))], widths: [26, 26, 18, 12, 18], caption: "표 2. 가린 값(원래 값은 남기지 않음)" }));
    else blocks.push(block("para", "가린 값 없음. 인구 5 미만(SGIS-5)에 해당하는 값이 없다."));
    blocks.push(block("para", "출처가 N/A로 준 값은 처음부터 싣지 않는다. 사업체 종사자 수와 비율의 분자·분모는 이 부록에 싣지 않아 SGIS 사업체 규칙과 비율 가림을 쓸 일이 없다. 2차 가림(역산 방지)은 사람 결정 전이라 적용하지 않았다.", { small: true }));
    if (src.list.length) { blocks.push(block("h1", "출처")); src.list.forEach((s, n) => blocks.push(block("para", D.sourceLine(n + 1, { ...s, license: lic(s.license) }), { small: true }))); }
    return { kind: "field", title, blocks, sources: src.list, writtenOn: at.slice(0, 10), footer: "리뉴맵 해명서 부록 · ", masking_log: log };
  }

  // 새 자료 묶음 알림(A3): 두 해시가 모두 있고 다를 때만
  const isNewData = (cur, latest) => !!(cur && latest && cur.snapshot_hash && latest.snapshot_hash && cur.snapshot_hash !== latest.snapshot_hash);

  // 같은 날 여러 건이어도 이름이 겹치지 않게 기기 시각(시분)을 붙인다
  const fileName = (rec) => { const t = new Date(rec.recorded_at); return D.safeName(`${rec.dong ? rec.dong.name : "현장"}_현장확인_${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}`); };

  // 브이월드 필지 조회 응답(외부, 믿지 않음) → {pnu, jibun, addr}. 지번은 PNU에서 만든다(11번째 자리 2 = 산). 형식이 어긋나면 null
  function parcelFrom(p) {
    const pnu = String((p && p.pnu) || "");
    if (!/^\d{19}$/.test(pnu)) return null;
    const bon = Number(pnu.slice(11, 15)), bu = Number(pnu.slice(15, 19));
    return { pnu, jibun: `${pnu[10] === "2" ? "산" : ""}${bon}${bu ? `-${bu}` : ""}`, addr: String(p.addr || "").slice(0, 80) };
  }
  // 필지 경계(MultiPolygon·Polygon) → 숫자 좌표 고리 목록. 화면에만 그린다. 고리 20개·점 2,000개까지
  function ringsFrom(g) {
    const polys = !g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    const ok = (pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]);
    return (Array.isArray(polys) ? polys : []).flat().filter((r) => Array.isArray(r) && r.length <= 2000 && r.every(ok)).slice(0, 20).map((r) => r.map(([x, y]) => [x, y]));
  }
  return { LEGAL, buildExplainer, srcKind, prevAtSite, compareRows, buildPhotoSheet, parcelFrom, ringsFrom, bjdongCandidates, findBuildings, buildingFill, lic, PAGE_LIMIT_MM, inRing, contains, findFeature, plane, distanceM, nearby, makeLocator, PICK, pickIndicators, localTime, localDay, shortSrc, oldestDate, summaryRows, buildFieldDoc, fileName, siteOf, nearbyRecords, isNewData };
});
