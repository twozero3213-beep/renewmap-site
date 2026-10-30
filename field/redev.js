// 재개발 입안요건 사전검토 1쪽(R1). 지번·PNU 목록 → 건축물대장 표제부로 노후·불량 동수·연면적 비율을 조문과 함께 계산한다.
// 규칙은 BSN-AGE-2025.10(연한)·BSN-ORD-2025.10(입안요건) 초안이다. 승인 전이라 화면·한글·CSV 모두에 '승인 전 참고'를 찍는다.
// 줄마다 충족·미충족·현장 확인만 쓴다. 종합 판정·순위·추천은 없다. 계산은 기기 안에서만 하고 목록은 어디로도 보내지 않는다.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../docgen.js"));
  else root.Redev = factory(root.RenewDocgen);
})(this, function (D) {
  "use strict";
  const ORD_URL = "https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=2079585";
  const ORD = "부산광역시 도시 및 주거환경정비 조례(조례 제7751호, 2025. 10. 1. 시행)";
  const RULES = [{ id: "BSN-AGE-2025.10", article: "제3조제2항", approved: false }, { id: "BSN-ORD-2025.10", article: "제5조제2항제2호", approved: false }];
  const NOT_APPROVED = "승인 전 참고 · 납품용 아님";
  const MET = "충족", NOT_MET = "미충족", CHECK = "현장 확인";

  // 조례 제3조② '철근콘크리트·철골콘크리트·철골철근콘크리트 또는 강구조'. 대장 구조명이 어느 쪽인지 원문만으로 못 정하는 것
  // (경량철골·프리캐스트·컨테이너 등)은 분류하지 않는다 → 연한 20·30년이 갈리는 건물만 현장 확인으로 남는다
  const RC_STEEL = ["철근콘크리트구조", "철골철근콘크리트구조", "철골콘크리트구조", "기타철골철근콘크리트구조", "일반철골구조", "기타강구조", "강파이프구조"];
  const OTHER = ["블록구조", "벽돌구조", "기타조적구조", "조적구조", "시멘트블럭조", "일반목구조", "통나무구조", "석구조"];
  const structClass = (s) => (RC_STEEL.includes(s) ? "RC_STEEL" : OTHER.includes(s) ? "OTHER" : null);
  const useClass = (u) => (u === "공동주택" ? "APT" : u === "단독주택" ? "DETACHED" : u ? "OTHER" : null);
  // 제3조② 연한표. backend/renewmap/rules/busan_age.py의 YEARS와 같아야 한다(교차 테스트 test_redev_js.py)
  // 값은 data/params/busan_redev.json과 같아야 한다(redev.test.cjs가 대조, 서버는 그 파일을 직접 읽는다)
  const THR = { default: 60, district: 50 };
  const YEARS = { "RC_STEEL/APT": 30, "OTHER/APT": 20, "RC_STEEL/OTHER": 30, "RC_STEEL/DETACHED": 20, "OTHER/OTHER": 20, "OTHER/DETACHED": 20 };
  function yearsRange(b) {
    const s = structClass(b.structure), u = useClass(b.main_use);
    const ys = (s ? [s] : ["RC_STEEL", "OTHER"]).flatMap((x) => (u ? [u] : ["APT", "DETACHED", "OTHER"]).map((y) => YEARS[`${x}/${y}`]));
    return [Math.min(...ys), Math.max(...ys)];
  }
  // 만 경과 연수. 기념일 당일은 '지난' 것으로 본다(rules/aging.age_years_exact와 같음)
  function ageYears(day, ref) {
    const [y, m, d] = day.split("-").map(Number), [Y, M, DD] = ref.split("-").map(Number);
    return Y - y - (M < m || (M === m && DD < d) ? 1 : 0);
  }
  // 건물 1동: true 노후·불량, false 아님, null 자료로 못 정함(사용승인일 없음 또는 연한이 갈리는 구조·용도)
  function oldState(b, ref) {
    if (!b.use_apr_day) return { old: null, why: "사용승인일 자료 없음" };
    const [lo, hi] = yearsRange(b), age = ageYears(b.use_apr_day, ref);
    const years = lo === hi ? `${lo}년` : `${lo}·${hi}년(구조·용도 분류 필요)`;
    if (age >= hi) return { old: true, age, years };
    if (age < lo) return { old: false, age, years };
    return { old: null, age, years, why: "구조·용도에 따라 연한이 갈림" };
  }

  // 붙여 넣은 글 → [{raw, pnu} | {raw, jibun}]. 첫 줄에 'PNU'·'지번' 머리가 있으면 그 열만 읽는다(엑셀 복사·CSV).
  // ponytail: 따옴표 안 쉼표는 나누지 않는다. 토지조서 CSV가 그런 형식이면 열 고르기를 더한다
  const JIBUN_RE = /(산)?\s*(\d{1,4})(?:\s*-\s*(\d{1,4}))?\s*(?:번지)?$/;
  function parseList(text) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cellsOf = (l) => l.split(/[\t,]/).map((c) => c.replace(/^"|"$/g, "").trim());
    const head = lines.length ? cellsOf(lines[0]) : [];
    const pc = head.findIndex((h) => /^(pnu|필지고유번호)$/i.test(h)), jc = head.findIndex((h) => /지번/.test(h));
    const cells = pc >= 0 || jc >= 0
      ? lines.slice(1).map((l) => { const c = cellsOf(l); return (pc >= 0 && c[pc]) || (jc >= 0 && c[jc]) || ""; })
      : lines.flatMap((l) => l.split(/[,;\t]/));
    const items = [], bad = [], seen = new Set();
    for (const raw of cells.map((c) => c.trim()).filter(Boolean)) {
      let it = null;
      if (/^\d{19}$/.test(raw)) it = { raw, pnu: raw };
      else {
        const m = JIBUN_RE.exec(raw), ji = m && Number(m[3] || 0);
        if (m) it = { raw, jibun: `${m[1] || ""}${Number(m[2])}${ji ? `-${ji}` : ""}` };
      }
      if (!it) { bad.push(raw); continue; }
      const key = it.pnu || it.jibun;
      if (!seen.has(key)) { seen.add(key); items.push(it); }
    }
    return { items, bad };
  }

  // 목록을 한 법정동 파일(buildings/{법정동}.json)의 건물과 잇는다. 같은 건물은 한 번만 센다.
  // 관리번호(mgm_bld_pk)는 2^53을 넘는 값이 있어 JS 숫자로는 서로 다른 건물이 같아진다 → 객체로 가린다
  function match(items, file) {
    const by = (k) => { const m = new Map(); for (const b of file.buildings) if (b[k]) m.set(b[k], [...(m.get(b[k]) || []), b]); return m; };
    const byPnu = by("pnu"), byJibun = by("jibun"), found = new Set(), missing = [], otherDong = [];
    for (const it of items) {
      if (it.pnu && it.pnu.slice(0, 10) !== file.bjd10) { otherDong.push(it.raw); continue; }
      const hits = it.pnu ? byPnu.get(it.pnu) : byJibun.get(it.jibun);
      if (!hits) { missing.push(it.raw); continue; }
      for (const b of hits) found.add(b);
    }
    return { buildings: [...found.values()], missing, otherDong };
  }

  const fmt = (x) => (Math.round(x * 10) / 10).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  // lo: 못 정한 건물을 노후 아님으로, hi: 노후로 볼 때. 기준이 둘 사이에 걸리면 현장 확인
  const status = (lo, hi, thr) => (lo >= thr ? MET : hi < thr ? NOT_MET : CHECK);
  const range = (lo, hi) => (lo === hi ? `${fmt(lo)}%` : `${fmt(lo)}~${fmt(hi)}%`);

  // 사용승인일 + n년이 되는 날. ageYears와 같이 기념일 당일부터 '지난' 것으로 보고, 2월 29일은 평년이면 3월 1일
  const addYears = (day, n) => {
    const [y, m, d] = day.split("-").map(Number), Y = y + n, leap = Y % 4 === 0 && (Y % 100 !== 0 || Y % 400 === 0);
    return m === 2 && d === 29 && !leap ? `${Y}-03-01` : `${Y}${day.slice(4)}`;
  };
  // 지금 있는 건물이 그대로일 때 비율이 thr에 처음 닿는 날(예측이 아니라 사용승인일 + 연한 달력 계산).
  // from(r): 노후로 세기 시작하는 날, ""는 처음부터, null은 끝내 세지 않음. 이미 넘었으면 ref, 못 닿으면 null
  function reachDate(rows, weight, thr, ref, from) {
    const tot = rows.reduce((s, r) => s + weight(r), 0);
    if (!tot) return null;
    const ev = rows.map((r) => [from(r), weight(r)]).filter(([d]) => d !== null).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    let acc = 0;
    for (const [d, w] of ev) { acc += w; if ((acc / tot) * 100 >= thr) return d < ref ? ref : d; }
    return null;
  }
  // 빠른 쪽: 못 정한 건물을 노후로 일찍 셈(날짜 없음은 처음부터, 연한이 갈리면 짧은 연한). 늦은 쪽: 날짜 없으면 세지 않고 긴 연한
  const fromEarly = (r) => (r.b.use_apr_day ? addYears(r.b.use_apr_day, yearsRange(r.b)[0]) : "");
  const fromLate = (r) => (r.b.use_apr_day ? addYears(r.b.use_apr_day, yearsRange(r.b)[1]) : null);
  const URBAN = { years: 20, thr: 50 };   // 도시재생법 시행령 제17조 노후 요건(동수). 적용 단위가 달라 참고로만 같이 센다

  // blds: match().buildings, ref: 'YYYY-MM-DD'(파일 age_reference_date), district: 재정비촉진지구, areaM2: 사용자가 넣은 구역 면적(없으면 null)
  function review(blds, { ref, district = false, areaM2 = null }) {
    if (!blds.length) throw new Error("목록에서 찾은 건물이 없습니다.");
    const thr = district ? THR.district : THR.default, rows = blds.map((b) => ({ b, ...oldState(b, ref) }));
    const sum = (f) => rows.reduce((s, r) => s + (f(r) ? Number(r.b.tot_area) || 0 : 0), 0);
    const n = rows.length, nOld = rows.filter((r) => r.old).length, nUnk = rows.filter((r) => r.old === null).length;
    const area = sum(() => true), aOld = sum((r) => r.old), aUnk = sum((r) => r.old === null);
    const cLo = (nOld / n) * 100, cHi = ((nOld + nUnk) / n) * 100;
    const fLo = area ? (aOld / area) * 100 : 0, fHi = area ? ((aOld + aUnk) / area) * 100 : 0;
    const ga = area ? status(fLo, fHi, thr) : CHECK;
    const art = (x) => `조례 ${x}`;
    const lines = [
      { label: "구역 면적", rule: "1만㎡ 이상", value: areaM2 === null ? "입력 안 함" : `${Math.round(areaM2).toLocaleString("ko-KR")}㎡(입력값)`,
        status: areaM2 === null ? CHECK : areaM2 >= 10000 ? MET : NOT_MET, basis: art("제5조②2") },
      { label: "노후·불량 건축물 수", rule: `전체의 ${thr}% 이상`, value: `${range(cLo, cHi)} (${nOld}/${n}동${nUnk ? `, 못 정한 ${nUnk}동` : ""})`,
        status: status(cLo, cHi, thr), basis: `${art("제5조②2")}·제3조②` },
      { label: "가목 노후·불량 연면적", rule: `전체의 ${thr}% 이상`, value: area ? range(fLo, fHi) : "연면적 자료 없음", status: ga, basis: art("제5조②2가") },
      { label: "나목 호수밀도", rule: "1ha당 50동 이상", value: "대장 표제부로 셀 수 없음(공동주택 세대층 기준)", status: CHECK, basis: `${art("제5조②2나")}·제2조8호` },
      { label: "다목 도로", rule: "폭 4m 미만 30% 이상 또는 접도율 40% 이하", value: "현장·도면 확인", status: CHECK, basis: art("제5조②2다") },
      { label: "라목 필지", rule: "과소·부정형·세장형 40% 이상", value: "지적도 확인", status: CHECK, basis: art("제5조②2라") },
      { label: "마·바목", rule: "순환용주택·재해 우려 등", value: "행정 판단", status: CHECK, basis: art("제5조②2마·바") },
      { label: "가~바목 중 하나", rule: "하나 이상", value: ga === MET ? "가목 충족" : "가목 외 확인 필요", status: ga === MET ? MET : CHECK, basis: art("제5조②2") },
    ];
    const perBuilding = rows.map((r) => ({ ...r, mark: r.old === true ? "노후·불량" : r.old === false ? "아님" : CHECK }));
    // 같은 목록, 다른 사업 기준: 도시재생은 구조·용도와 관계없이 준공 20년 이상 건축물 수를 센다
    const uOld = rows.filter((r) => r.b.use_apr_day && ageYears(r.b.use_apr_day, ref) >= URBAN.years).length, uUnk = rows.filter((r) => !r.b.use_apr_day).length;
    const uLo = (uOld / n) * 100, uHi = ((uOld + uUnk) / n) * 100;
    const urban = { label: "도시재생 쇠퇴 진단 노후 요건", rule: `준공 ${URBAN.years}년 이상 건축물 수 ${URBAN.thr}% 이상`, value: range(uLo, uHi),
      status: status(uLo, uHi, URBAN.thr), basis: "도시재생법 시행령 제17조" };
    const one = (w) => [reachDate(rows, w, thr, ref, fromEarly), reachDate(rows, w, thr, ref, fromLate)];
    const reach = { count: one(() => 1), area: one((r) => Number(r.b.tot_area) || 0) };
    return { thr, district, n, nOld, nUnk, area, aOld, aUnk, lines, perBuilding, ref, urban, reach };
  }

  // 화면 요약(v4): 숫자 칸, 줄 상태 도넛, 건물 수·연면적 쌓은 막대(노후·불량 | 못 정함 | 아님)와 기준선. 종합 판정·순위 아님
  const escH = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function stackHTML(label, old, unk, tot, thr) {
    if (!tot) return `<div class="rv-stack is-empty"><div class="rv-h"><b>${escH(label)}</b><span>자료 없음</span></div></div>`;
    const a = (old / tot) * 100, b = (unk / tot) * 100, c = Math.max(0, 100 - a - b), r = range(a, a + b);
    return `<div class="rv-stack"><div class="rv-h"><b>${escH(label)}</b><span>${r} · 기준 ${thr}%</span></div>` +
      `<svg viewBox="0 0 100 16" preserveAspectRatio="none" role="img" aria-label="${escH(label)} 노후·불량 ${fmt(a)}%, 못 정함 ${fmt(b)}%, 아님 ${fmt(c)}%, 기준선 ${thr}%">` +
      `<rect class="rv-old" width="${a.toFixed(2)}" height="16"/><rect class="rv-unk" x="${a.toFixed(2)}" width="${b.toFixed(2)}" height="16"/><rect class="rv-no" x="${(a + b).toFixed(2)}" width="${c.toFixed(2)}" height="16"/>` +
      `<line class="rv-thr" x1="${thr}" x2="${thr}" y1="0" y2="16" vector-effect="non-scaling-stroke"/></svg></div>`;
  }
  // [early, late] → 글. 날짜는 공문서 표기
  function reachText([early, late], ref) {
    if (late === ref) return "이미 넘음";
    if (early === null) return "지금 있는 건물로는 닿지 않음";
    const a = early === ref ? "지금" : D.govDate(early);
    if (late === null) return `${a} 이후(못 정한 건물에 따라 닿지 않을 수도 있음)`;
    return early === late ? a : `${a}~${D.govDate(late)}`;
  }
  // 화면 참고 줄: 다른 사업 기준 대조 + 기준 도달 날짜. 요건 줄(lines)과 섞지 않는다. 한글 1쪽에는 표 대신 refPara 한 문단(쪽 높이)
  const refPara = (res) => {
    const [u, c, a] = refRows(res);
    return `참고: 도시재생 노후 기준(시행령 제17조)으로는 ${u[2]}. ` +
      `${res.thr}% 도달일(지금 건물 기준): 건물 수 ${c[2]}, 연면적 ${a[2]} 적용 판본은 구역 이력마다 다를 수 있다.`;
  };
  const refRows = (res) => [
    [`참고: ${res.urban.label}`, res.urban.rule, `${res.urban.value}, ${res.urban.status}`, res.urban.basis],
    ["건물 수 기준 도달 날짜", `전체의 ${res.thr}%`, reachText(res.reach.count, res.ref), "사용승인일 + 조례 연한"],
    ["연면적 기준 도달 날짜", `전체의 ${res.thr}%`, res.area ? reachText(res.reach.area, res.ref) : "연면적 자료 없음", "사용승인일 + 조례 연한"],
  ];
  const REACH_NOTE = "도달 날짜는 지금 있는 건물이 그대로일 때의 달력 계산이다(예측 아님). 새로 짓거나 허무는 건물이 생기면 바뀐다. 도시재생 줄은 적용 단위가 달라 참고로만 같이 셌다.";
  const ST_CLS = { [MET]: "g", [NOT_MET]: "r", [CHECK]: "y" };
  function summaryHTML(res) {
    const cnt = Object.fromEntries([MET, NOT_MET, CHECK].map((k) => [k, res.lines.filter((l) => l.status === k).length])), tot = res.lines.length, C = 2 * Math.PI * 42;
    let off = 0;
    const arcs = [MET, NOT_MET, CHECK].filter((k) => cnt[k]).map((k) => { const len = (cnt[k] / tot) * C, s = `<circle class="dn-${ST_CLS[k]}" r="42" cx="60" cy="60" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(C - len + 1.5).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`; off += len; return s; }).join("");
    const tiles = [["건물", `${res.n}동`], ["노후·불량", `${res.nOld}동`], ["못 정함", `${res.nUnk}동`], ["기준", `${res.thr}%`]];
    return `<ul class="v4-tiles">${tiles.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join("")}</ul>` +
      `<div class="v4-charts"><div class="v4-donut"><svg class="dn" viewBox="0 0 120 120" aria-hidden="true"><g transform="rotate(-90 60 60)">${arcs}</g><text x="60" y="62" class="dn-n">${tot}</text><text x="60" y="80" class="dn-k">요건 줄</text></svg>` +
      `<ul class="gl-n">${[MET, NOT_MET, CHECK].map((k) => `<li><b class="gl-sw sw-${ST_CLS[k]}" aria-hidden="true"></b>${k} <b>${cnt[k]}</b></li>`).join("")}</ul></div>` +
      `<div class="rv-stacks">${stackHTML("건물 수", res.nOld, res.nUnk, res.n, res.thr)}${stackHTML("연면적", res.aOld, res.aUnk, res.area, res.thr)}` +
      `<p class="rv-key"><i class="rv-old"></i>노후·불량 <i class="rv-unk"></i>못 정함 <i class="rv-no"></i>아님 <i class="rv-thr"></i>기준선</p></div></div>` +
      `<dl class="rv-ref">${refRows(res).map(([k, rule, v]) => `<div><dt>${escH(k)}</dt><dd><b>${escH(v)}</b> <span>기준 ${escH(rule)}</span></dd></div>`).join("")}</dl>` +
      `<p class="rv-key">${escH(REACH_NOTE)}</p>`;
  }

  // 엑셀이 수식으로 읽지 않게 =·+·-·@로 시작하는 칸 앞에 '를 붙인다
  const csvCell = (v) => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // 건물별 산정 근거(엑셀용, BOM). 첫 줄에 승인 전 표시. 소유자 등 개인 항목은 파일에 없다
  function toCSV(res, file) {
    const head = ["지번", "PNU", "주용도", "구조", "사용승인일", "연면적(㎡)", "적용 연한", "경과 연수", "노후·불량", "사유"];
    const body = res.perBuilding.map((r) => [r.b.jibun, r.b.pnu, r.b.main_use, r.b.structure, r.b.use_apr_day, r.b.tot_area, r.years || "", r.age ?? "", r.mark, r.why || ""]);
    const note = [`${NOT_APPROVED} · ${RULES.map((x) => x.id).join("·")} 초안 · 경과 기준일 ${res.ref} · 건축물대장 기준일 ${file.hub_reference_date}`];
    return "﻿" + [note, head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  const block = (kind, text = "", extra = {}) => ({ kind, text: D.clean(text), rows: [], widths: [], caption: "", small: false, ...extra });
  // 한글·PDF 1쪽. 건물별 표는 CSV로 뺀다
  function buildDoc(res, m, file, today) {
    const src = new D.Sources(), title = `${file.name} 재개발 입안요건 사전검토`;
    const bld = src.ref({ source_name: file.source, source_url: file.source_url, reference_date: file.hub_reference_date, retrieved_at: file.retrieved_at, license_type: file.license });
    const law = src.ref({ source_name: ORD, source_url: ORD_URL, reference_date: "2025-10-01", retrieved_at: "2026-10-23", license_type: "저작권 보호 대상 아님(저작권법 제7조)" });
    const box = [
      ["대상", `붙여 넣은 목록에서 건물 ${res.n}동을 찾음${m.missing.length ? ` · 못 찾은 지번 ${m.missing.length}개(${m.missing.slice(0, 5).join(", ")}${m.missing.length > 5 ? " 등" : ""})` : ""}${m.otherDong.length ? ` · 다른 법정동 ${m.otherDong.length}개 제외` : ""}${bld}`],
      ["기준", `${res.district ? "재정비촉진지구(50%)" : "일반(60%)"} · 연한은 조례 제3조②${law} · 경과 기준일 ${res.ref}`],
      ["못 정한 건물", res.nUnk ? `${res.nUnk}동(사용승인일 없음 또는 구조·용도에 따라 연한이 갈림). 비율은 범위로 적었다` : "없음"],
    ];
    const blocks = [block("title", title), block("para", `${NOT_APPROVED} · 판정 아님 · ${RULES.map((x) => `${x.id} 초안`).join(", ")}`, { small: true }),
      block("box", "", { rows: box.map((r) => r.map(D.clean)), widths: [18, 82], refs: true }),
      block("table", "", { rows: [["요건", "기준", "이 목록", "상태", "근거"], ...res.lines.map((l) => [l.label, l.rule, l.value, l.status, l.basis].map(D.clean))], widths: [20, 22, 30, 12, 16], caption: "표 1. 줄마다 따로 본 결과(종합 판정 아님)" }),
      block("para", `현장 확인 줄은 자료로 정하지 못한 요건이다. 주민 동의(도시정비법 제36조)와 재건축진단은 다루지 않고, 건물별 근거는 같은 이름의 CSV에 있다. ${refPara(res)}`, { small: true }),
      block("h1", "출처")];
    src.list.forEach((s, n) => blocks.push(block("para", D.sourceLine(n + 1, s), { small: true })));
    return { kind: "redev", sizes: "onepage", title, blocks, sources: src.list, writtenOn: today, footer: `리뉴맵 입안요건 사전검토 · ${NOT_APPROVED} · ` };
  }

  return { THR, RULES, NOT_APPROVED, YEARS, RC_STEEL, OTHER, structClass, useClass, yearsRange, ageYears, addYears, oldState, parseList, match, review, reachText, summaryHTML, toCSV, buildDoc, MET, NOT_MET, CHECK };
});
