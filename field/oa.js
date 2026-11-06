// 집계구로 다시 보기: 행정동 단위로 쇠퇴 요건이 모자라면 더 작은 단위(통계청 집계구)의 인구·사업체 요건 결과를 보인다.
// 판정은 백엔드(rules/decline.py, 승인 전)가 낸 값을 그대로 쓰고 여기서 다시 판정하지 않는다. 노후건축물은 집계구로 계산하지 않는다.
(function (root) {
  "use strict";
  const MET = "충족", NOT_MET = "미충족", CHECK = "추가확인";
  // 지도 색(D22: 기준을 넘은 쪽 주황→갈색, 못 정함 회색). 점수가 아니라 '두 요건 중 몇 개 충족'의 구분이다
  const FILL = { 2: "#9c4a1a", 1: "#e8a33d", 0: "#e7ecea", check: "#cdd7d3" };
  const LABEL = { 2: "인구·사업체 모두 충족", 1: "하나만 충족", 0: "둘 다 미충족", check: "못 정함(값 빠짐)" };
  const groupOf = (o) => (o.met === 2 ? 2 : o.met === 1 ? 1 : o.pop_req.verdict === CHECK || o.biz_req.verdict === CHECK ? "check" : 0);
  function summary(dong) {
    const n = { 2: 0, 1: 0, 0: 0, check: 0 };
    for (const o of dong.oas) n[groupOf(o)]++;
    return n;
  }
  const pct = (v) => (v === null || v === undefined ? "못 정함" : `${(Math.round(v * 10) / 10).toFixed(1)}%`);
  const yn = (v) => (v === true ? "있음" : v === false ? "없음" : "못 정함");
  // 위경도 → SVG 좌표(작은 구역이라 위도에 따른 가로 줄임만 맞춘다)
  function projector(shapes, width = 640) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const polys of Object.values(shapes)) for (const poly of polys || []) for (const ring of poly) for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), w = (x1 - x0) * k || 1e-6, h = (y1 - y0) || 1e-6, s = width / w;
    return { width, height: Math.ceil(h * s), path: (polys) => polys.map((poly) => poly.map((ring) => "M" + ring.map(([x, y]) => `${((x - x0) * k * s).toFixed(1)},${((y1 - y) * s).toFixed(1)}`).join("L") + "Z").join("")).join("") };
  }
  const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCSV(data, dong) {
    const y = data.years;
    const note = [`${dong.sigungu} ${dong.name} 집계구 ${dong.oas.length}개 · ${data.source} · ${data.license_type} · 판정 규칙 ${data.rule}(승인 전) · ${data.note}`];
    const head = ["집계구", ...y.map((v) => `인구 ${v}`), ...y.map((v) => `사업체 ${v}`), "인구 5년 중 3년 연속 감소", "인구 요건", "사업체 10년 최대 대비 감소율(%)", "사업체 5년 중 3년 연속 감소", "사업체 요건", "충족 수(인구·사업체 2개 중)"];
    const body = dong.oas.map((o) => [o.oa, ...o.pop, ...o.biz, yn(o.pop_req.consecutive_3y_in_5y), o.pop_req.verdict, o.biz_req.peak_drop_pct_10y ?? "", yn(o.biz_req.consecutive_3y_in_5y), o.biz_req.verdict, o.met]);
    return "﻿" + [note, head, ...body].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  const api = { MET, NOT_MET, CHECK, FILL, LABEL, groupOf, summary, pct, yn, projector, toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RenewOA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
