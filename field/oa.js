// 집계구로 다시 보기: 행정동 단위로 쇠퇴 요건이 모자라면 더 작은 단위(통계청 집계구)의 인구·사업체 요건 결과를 보인다.
// 판정은 백엔드(rules/decline.py, 승인 전)가 낸 값을 그대로 쓰고 여기서 다시 판정하지 않는다. 노후건축물은 집계구로 계산하지 않는다.
(function (root) {
  "use strict";
  // 상태어는 화면과 받는 파일이 같은 한 벌이다(OD1): 기준 해당 / 해당 안 함 / 추가확인(사유)
  const MET = "기준 해당", NOT_MET = "해당 안 함", CHECK = "추가확인", GAP = `${CHECK}(값 빠짐)`;
  // 자료 파일의 판정 값(충족·미충족)을 옮겨 적는다. 추가확인의 사유는 백엔드가 적은 근거(basis)에서 알아볼 때만 붙이고 지어내지 않는다
  const FROM_DATA = { 충족: MET, 미충족: NOT_MET };
  const verdict = (r) => FROM_DATA[r.verdict] || (r.verdict !== CHECK ? r.verdict : /단절/.test(r.basis) ? `${CHECK}(통계 단절)` : /결측/.test(r.basis) ? GAP : CHECK);
  // 지도 색(D22: 기준을 넘은 쪽 주황→갈색, 추가확인 회색). 점수가 아니라 '두 요건 중 몇 개가 기준 해당'인지의 구분이다
  const FILL = { 2: "#9c4a1a", 1: "#e8a33d", 0: "#e7ecea", check: "#cdd7d3" };
  const LABEL = { 2: `인구·사업체 모두 ${MET}`, 1: `하나만 ${MET}`, 0: `둘 다 ${NOT_MET}`, check: `${CHECK}(값 빠짐·통계 단절)` };   // 2026-11-20: 사업체는 2020년 등록기반 전환을 가로지르면 추가확인이라 '값 빠짐'만이 사유가 아니다
  const groupOf = (o) => (o.met === 2 ? 2 : o.met === 1 ? 1 : o.pop_req.verdict === CHECK || o.biz_req.verdict === CHECK ? "check" : 0);
  function summary(dong) {
    const n = { 2: 0, 1: 0, 0: 0, check: 0 };
    for (const o of dong.oas) n[groupOf(o)]++;
    return n;
  }
  const pct = (v) => (v === null || v === undefined ? GAP : `${(Math.round(v * 10) / 10).toFixed(1)}%`);
  const yn = (v) => (v === true ? "있음" : v === false ? "없음" : GAP);
  // 위경도 → SVG 좌표(작은 구역이라 위도에 따른 가로 줄임만 맞춘다)
  function projector(shapes, width = 640) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const polys of Object.values(shapes)) for (const poly of polys || []) for (const ring of poly) for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), w = (x1 - x0) * k || 1e-6, h = (y1 - y0) || 1e-6, s = width / w;
    return { width, height: Math.ceil(h * s), path: (polys) => polys.map((poly) => poly.map((ring) => "M" + ring.map(([x, y]) => `${((x - x0) * k * s).toFixed(1)},${((y1 - y) * s).toFixed(1)}`).join("L") + "Z").join("")).join("") };
  }
  const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); const t = typeof v === "number" || /^-?\d+(\.\d+)?$/.test(s.trim()) ? s : s.replace(/^[\s\uFEFF]*[=+@\t\r-]/, "'$&"); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  function toCSV(data, dong, oa) {
    const y = data.years;
    const rows = oa === undefined ? dong.oas : dong.oas.filter((o) => o.oa === oa);
    if (oa !== undefined && !rows.length) throw new RangeError("현재 행정동에 없는 집계구");
    const note = [`${dong.sigungu} ${dong.name} 집계구 ${rows.length}개 · ${data.source} · ${data.license_type} · 판정 규칙 ${data.rule}(승인 전) · ${data.note}`];
    if (oa !== undefined) {
      const [row] = rows;
      note[0] += ` · 선택 집계구 ${oa} · 인구 사유 ${row.pop_req.basis || "기록 없음"} · 사업체 사유 ${row.biz_req.basis || "기록 없음"}`;
    }
    const head = ["집계구", ...y.map((v) => `인구 ${v}`), ...y.map((v) => `사업체 ${v}`), "인구 5년 중 3년 연속 감소", "인구 요건", "사업체 10년 최대 대비 감소율(%)", "사업체 5년 중 3년 연속 감소", "사업체 요건", "기준 해당 수(인구·사업체 2개 중)"];
    const body = rows.map((o) => [o.oa, ...o.pop, ...o.biz, yn(o.pop_req.consecutive_3y_in_5y), verdict(o.pop_req), o.biz_req.peak_drop_pct_10y ?? "", yn(o.biz_req.consecutive_3y_in_5y), verdict(o.biz_req), o.met]);
    return "﻿" + [note, head, ...body].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  const api = { MET, NOT_MET, CHECK, FILL, LABEL, groupOf, summary, verdict, pct, yn, projector, toCSV, csvCell: cell };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RenewOA = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
