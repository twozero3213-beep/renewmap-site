// 오래된 창고·공장 목록(유휴 공간 후보 현황). 건축물대장에는 '비어 있음'이 없으므로 쓰임은 현장 확인으로만 정한다.
// 순위·점수·추천을 만들지 않는다(D13·D23). 목록은 지번 순으로 고정한다.
(function (root) {
  "use strict";
  const KINDS = ["창고", "공장"];
  const OLD = 30;
  const isIdleUse = (u) => KINDS.some((k) => (u || "").includes(k));
  // 30년 이상 / 30년 미만 / 못 정함. 건물 파일의 age_years(경과 기준일 기준)만 쓰고, 값이 없으면 추정하지 않는다
  function ageGroup(b) {
    if (typeof b.age_years === "number") return b.age_years >= OLD ? "old" : "young";
    return "unknown";
  }
  const LABEL = { old: `${OLD}년 이상`, unknown: "사용승인일로 못 정함", young: `${OLD}년 미만` };
  // 지번 순: 본번·부번을 숫자로, '산'은 뒤로
  function jibunKey(j) {
    const m = /^(산\s*)?(\d+)(?:-(\d+))?/.exec((j || "").trim());
    return m ? [m[1] ? 1 : 0, Number(m[2]), Number(m[3] || 0)] : [2, 0, 0];
  }
  const cmp = (a, b) => { const x = jibunKey(a.jibun), y = jibunKey(b.jibun); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  function list(file) {
    const rows = file.buildings.filter((b) => isIdleUse(b.main_use)).map((b) => ({ ...b, group: ageGroup(b) })).sort(cmp);
    const count = { old: 0, unknown: 0, young: 0 };
    for (const r of rows) count[r.group]++;
    return { name: file.name, total: file.buildings.length, rows, count, hub: file.hub_reference_date, ref: file.age_reference_date };
  }
  const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCSV(res) {
    const note = [`${res.name} 주용도 창고·공장 ${res.rows.length}동 / 전체 ${res.total}동 · 건축물대장 기준일 ${res.hub} · 경과 기준일 ${res.ref} · 비어 있는지는 대장에 없어 현장 확인 필요 · 추천·순위 아님`];
    const head = ["지번", "PNU", "주용도", "구조", "사용승인일", "층수", "연면적(㎡)", "경과 연수", "구분"];
    const body = res.rows.map((r) => [r.jibun, r.pnu, r.main_use, r.structure, r.use_apr_day || (r.use_apr_span || []).join("~"), r.floors, r.tot_area, r.age_years ?? "", LABEL[r.group]]);
    return "﻿" + [note, head, ...body].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  const api = { KINDS, OLD, LABEL, isIdleUse, ageGroup, jibunKey, list, toCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RenewIdle = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
