// 음식점 상권 변화 유형(참고). 서울시 상권분석서비스 상권변화지표 방식을 부산 법정동에 옮긴 값을 보여 준다(경쟁 보고서 ⑬).
// 계산은 backend/scripts/export_shop_change.py가 한다. 여기서는 고른 구의 행을 동 이름 순으로 늘어놓고 CSV를 만든다. 순위·추천을 만들지 않는다
(function (root) {
  "use strict";
  const KINDS = ["general", "rest"];
  const MEANING = { 다이나믹: "운영·폐업 업소 모두 영업기간이 부산 평균보다 짧음", 상권확장: "운영 업소는 짧고 폐업 업소는 김", 상권축소: "운영 업소는 길고 폐업 업소는 짧음", 정체: "운영·폐업 업소 모두 김" };
  const typeText = (r, minN) => r.type || `유형 없음(운영·폐업 각 ${minN}곳 미만)`;
  // 고른 구·군의 동 목록: 두 업종을 동 이름으로 합친다
  function rowsFor(doc, gu) {
    const by = new Map();
    for (const k of KINDS) {
      for (const r of (doc.kinds[k] || { rows: [] }).rows) {
        if (r.gu !== gu) continue;
        const o = by.get(r.dong) || { dong: r.dong, bjd10: r.bjd10 || null };
        o[k] = r;
        by.set(r.dong, o);
      }
    }
    return [...by.values()].sort((a, b) => a.dong.localeCompare(b.dong, "ko"));
  }
  const gus = (doc) => [...new Set(KINDS.flatMap((k) => (doc.kinds[k] || { rows: [] }).rows.map((r) => r.gu)))].sort((a, b) => a.localeCompare(b, "ko"));
  const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCSV(doc, gu, rows) {
    const note = [`${gu} 음식점 상권 변화 유형(참고) · 인허가 기준일 ${doc.ref_date} · ${doc.source} · ${doc.license} · ${doc.method} · 판정·추천 아님`];
    const head = ["법정동", "법정동코드"];
    for (const k of KINDS) { const n = doc.kinds[k].name; head.push(`${n} 유형`, `${n} 운영 업소`, `${n} 운영 평균 영업개월`, `${n} 최근 ${doc.years}년 폐업 업소`, `${n} 폐업 평균 영업개월`); }
    const body = rows.map((o) => {
      const out = [o.dong, o.bjd10 || ""];
      for (const k of KINDS) { const r = o[k]; out.push(r ? typeText(r, doc.min_n) : "자료 없음", r ? r.n_open : "", r ? r.open_avg_m : "", r ? r.n_closed : "", r ? r.closed_avg_m : ""); }
      return out;
    });
    const avg = KINDS.map((k) => `${doc.kinds[k].name} 부산 평균: 운영 ${doc.kinds[k].busan.open_avg_m}개월, 폐업 ${doc.kinds[k].busan.closed_avg_m}개월`);
    return "﻿" + [note, head, ...body, [avg.join(" / ")]].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  const api = { KINDS, MEANING, typeText, rowsFor, gus, toCSV };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RenewShop = api;
})(this);
