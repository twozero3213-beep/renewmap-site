// 오래된 창고·공장 목록(유휴 공간 후보 현황). 건축물대장에는 '비어 있음'이 없으므로 쓰임은 현장 확인으로만 정한다.
// 순위·점수·추천을 만들지 않는다(D13·D23). 목록은 지번 순으로 고정한다.
(function (root) {
  "use strict";
  const KINDS = ["창고", "공장"];
  const OLD = 30;
  const isIdleUse = (u) => KINDS.some((k) => (u || "").includes(k));
  // 30년 이상 / 30년 미만 / 추가확인. 건물 파일의 age_years(경과 기준일 기준)만 쓰고, 값이 없으면 추정하지 않는다
  function ageGroup(b) {
    if (typeof b.age_years === "number") return b.age_years >= OLD ? "old" : "young";
    return "unknown";
  }
  const LABEL = { old: `${OLD}년 이상`, unknown: "추가확인(사용승인일 없음)", young: `${OLD}년 미만` };
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
    return { name: file.name, bjd10: file.bjd10, total: file.buildings.length, rows, count, hub: file.hub_reference_date, ref: file.age_reference_date, source: file.source, license: file.license };
  }
  const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); const t = typeof v === "number" || /^-?\d+(\.\d+)?$/.test(s.trim()) ? s : s.replace(/^[\s\uFEFF]*[=+@\t\r-]/, "'$&"); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  function toCSV(res) {
    const note = [[`${res.name} 주용도 창고·공장 ${res.rows.length}동 / 전체 ${res.total}동 · 건축물대장 기준일 ${res.hub} · 경과 기준일 ${res.ref} · 비어 있는지는 대장에 없어 현장 추가확인 · 추천·순위 아님`, res.source, res.license].filter(Boolean).join(" · ")];
    return "﻿" + [note, ...listRows(res)].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }
  const HEAD = ["지번", "PNU", "주용도", "구조", "사용승인일", "층수", "연면적(㎡)", "경과 연수", "구분"];
  const listRows = (res) => [HEAD, ...res.rows.map((r) => [r.jibun, r.pnu, r.main_use, r.structure, r.use_apr_day || (r.use_apr_span || []).join("~"), r.floors, r.tot_area, r.age_years ?? "", LABEL[r.group]])];
  const pnuText = (value) => typeof value === "string" && /^\d{19}$/.test(value) ? value : null;

  function workbookSheets(res) {
    const [head, ...body] = listRows(res);
    const parcels = new Map();
    let missingPnu = 0;
    body.forEach(([jibun, rawPnu], i) => {
      const pnu = pnuText(rawPnu);
      if (pnu === null) { missingPnu++; return; }
      const parcel = parcels.get(pnu);
      if (parcel) parcel.count++;
      else parcels.set(pnu, { pnu, jibun, count: 1, firstRow: i + 2 });
    });
    const groups = [...parcels.values()];
    return [
      { name: "건물 목록", widths: [14, 24, 23, 19, 23, 10, 14, 12, 30], rows: [head, ...body.map(([jibun, pnu, ...cells]) => [jibun, pnuText(pnu), ...cells])] },
      { name: "자료 기준", widths: [24, 76], rows: [
        ["항목", "내용"],
        ["법정동", res.name],
        ["법정동 코드", typeof res.bjd10 === "string" ? res.bjd10 : null],
        ["건축물대장 기준일", res.hub],
        ["경과 기준일", res.ref],
        ["전체 건물 행 수", res.total],
        ["창고·공장 목록 행 수", res.rows.length],
        ["목록에서 대조한 필지", groups.length],
        ["목록 행이 여러 개인 필지", groups.filter((parcel) => parcel.count > 1).length],
        ["PNU 추가확인 행", missingPnu],
        ["PNU 읽는 법", "PNU는 필지번호입니다. 같은 PNU에 목록 행이 여러 개 있을 수 있습니다."],
        [LABEL.old, res.count.old],
        [LABEL.unknown, res.count.unknown],
        [LABEL.young, res.count.young],
        ["출처", res.source],
        ["이용 조건", res.license],
        ["확인 범위", "건축물대장의 주용도 기준 현황입니다. 실제 사용 여부는 현장에서 확인합니다."],
      ] },
      { name: "필지 대조", widths: [24, 21, 16, 27], rows: [
        ["PNU", "첫 목록 행의 지번", "목록 행 수", "건물 목록 시트의 첫 행 번호"],
        ...groups.map(({ pnu, jibun, count, firstRow }) => [pnu, jibun, count, firstRow]),
      ] },
    ];
  }

  // 공개 빈집 파일에 기준일 칸이 없으면 지어내지 않고, 파일 이름 끝 날짜(…_20241201)를 그 이름으로만 밝힌다
  function vacantBase(g) {
    if (g && g.base_date) return String(g.base_date);
    const day = /_(\d{4})(\d{2})(\d{2})$/.exec(String((g && g.title) || ""));
    return day ? `추가확인(원자료에 기준일 없음 · 파일 이름 날짜 ${day[1]}-${day[2]}-${day[3]})` : "추가확인(원자료에 기준일 없음)";
  }
  const api = { KINDS, OLD, LABEL, isIdleUse, ageGroup, jibunKey, list, toCSV, workbookSheets, csvCell: cell, vacantBase };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RenewIdle = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
