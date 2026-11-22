// 음식점 상권 변화 유형(참고). 서울시 상권분석서비스 상권변화지표 방식을 부산 법정동에 옮긴 값을 보여 준다(경쟁 보고서 ⑬).
// 계산은 backend/scripts/export_shop_change.py가 한다. 여기서는 고른 구의 행을 동 이름 순으로 늘어놓고 CSV를 만든다. 순위·추천을 만들지 않는다
(function (root) {
  "use strict";
  const KINDS = ["general", "rest"];
  const typeText = (r, minN) => r.type || `유형 없음(운영·폐업 각 ${minN}곳 미만)`;
  // 고른 구·군의 동 목록: 두 업종을 동 이름으로 합친다
  function rowsFor(doc, gu) {
    const by = new Map();
    for (const k of KINDS) {
      for (const r of (doc.kinds[k] || { rows: [] }).rows) {
        if (r.gu !== gu) continue;
        const o = by.get(r.dong) || { dong: r.dong, bjd10: r.bjd10 || null, unit: r.unit || null };
        o[k] = r;
        by.set(r.dong, o);
      }
    }
    return [...by.values()].sort((a, b) => a.dong.localeCompare(b.dong, "ko"));
  }
  const gus = (doc) => [...new Set(KINDS.flatMap((k) => (doc.kinds[k] || { rows: [] }).rows.map((r) => r.gu)))].sort((a, b) => a.localeCompare(b, "ko"));
  // 2026-11-16 우지예: 양산·거제(shop_change_gyeongnam.json)는 부산 평균이 아니라 그 시 평균(city_avg[시])과 견준다.
  // 부산 파일은 kinds[k].busan을 그대로 쓰므로 부산 화면·CSV는 한 글자도 바뀌지 않는다
  const avgOf = (doc, k, gu) => (doc.kinds[k].city_avg ? doc.kinds[k].city_avg[gu] : doc.kinds[k].busan) || {};
  const avgName = (doc, gu) => (doc.kinds.general.city_avg ? `${gu} 평균` : "부산 평균");
  // 읍·면은 리를 묻지 않고 읍·면 전체를 한 줄로 센다(export_shop_change_gyeongnam.py 머리말)
  const dongText = (o) => (o.unit === "읍면" ? `${o.dong}(읍·면 전체)` : o.dong);
  const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); const t = typeof v === "number" || /^-?\d+(\.\d+)?$/.test(s.trim()) ? s : s.replace(/^[\s\uFEFF]*[=+@\t\r-]/, "'$&"); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  function toCSV(doc, gu, rows) {
    const note = [`${gu} 음식점 상권 변화 유형(참고) · 인허가 기준일 ${doc.ref_date} · ${doc.source} · ${doc.license} · ${doc.method} · 판정·추천 아님`];
    const head = [doc.kinds.general.city_avg ? "법정동·읍면" : "법정동", "법정동코드"];
    for (const k of KINDS) { const n = doc.kinds[k].name; head.push(`${n} 유형`, `${n} 운영 업소`, `${n} 운영 평균 영업개월`, `${n} 최근 ${doc.years}년 폐업 업소`, `${n} 폐업 평균 영업개월`); }
    const body = rows.map((o) => {
      const out = [dongText(o), o.bjd10 || ""];
      for (const k of KINDS) { const r = o[k]; out.push(r ? typeText(r, doc.min_n) : "자료 없음", r ? r.n_open : "", r ? r.open_avg_m : "", r ? r.n_closed : "", r ? r.closed_avg_m : ""); }
      return out;
    });
    const avg = KINDS.map((k) => `${doc.kinds[k].name} ${avgName(doc, gu)}: 운영 ${avgOf(doc, k, gu).open_avg_m}개월, 폐업 ${avgOf(doc, k, gu).closed_avg_m}개월`);
    return "﻿" + [note, head, ...body, [avg.join(" / ")]].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  const api = { KINDS, typeText, rowsFor, gus, toCSV, avgOf, avgName, dongText, csvCell: cell };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RenewShop = api;
})(this);
