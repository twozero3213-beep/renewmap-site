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
  // 입안 전 후보지 목록은 미공개정보다(이해충돌방지법 제14조: 받은 제3자도 처벌, 도시정비법 제77조 권리산정기준일). 표시는 사용자가 끌 수 있다
  const SECRET = "대외비(입안 전 후보지 정보, 외부 배포 금지)";
  // 조례 제3조②2나는 기존무허가건축물도 20년 노후·불량에 넣는데, 대장에 없으니 세지 못한다(공개 계획서에서 분모 차이 26%p 사례: 수원 매산동)
  const UNREG = "대장에 없는 무허가 건축물은 세지 않았다(조례 제3조②)";
  const mark = (secret, text, short = false) => (secret ? `${short ? "대외비" : SECRET} · ${text}` : text);   // short: 1쪽 본문 한 줄(쪽 높이), 풀이는 바닥글에
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
  const range = (lo, hi) => (fmt(lo) === fmt(hi) ? `${fmt(lo)}%` : `${fmt(lo)}~${fmt(hi)}%`);   // 반올림해 같으면 한 값(못 정한 동수는 값 옆에 따로 적는다)

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
  const URBAN = { years: 20, thr: 50 };
  // 날짜 없는 건물의 구조로 '어느 건물부터 확인할지' 정하는 참고값. 판정에 쓰지 않는다(추정으로 충족을 만들지 않음).
  // 근거: 부산 건축물대장 주건축물 중 날짜 있는 목조·블록·벽돌·조적 165,371동의 98.4%가 20년 이상, 날짜 없는 건물의 90.7%가 이 구조(backend/scripts/busan_undated_share.py, 2026-10-24 수집·기준일 2026-10-26)
  const MASONRY = /목구조|블록|벽돌|조적/;
  const MASONRY_PRIOR = { pct: 98.4, n: 165371, basis: "부산 건축물대장 2026-10-24 수집" };   // 도시재생법 시행령 제17조 노후 요건(동수). 적용 단위가 달라 참고로만 같이 센다

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
      { label: "다목 도로", rule: "폭 4m 미만 30% 이상 또는 접도율 40% 이하", value: "현장·도면 확인", status: CHECK, basis: art("제5조②2다"), field: "road" },   // field: 현장 앱 R.CHECKS id(접도 상태)
      { label: "라목 필지", rule: "과소·부정형·세장형 40% 이상", value: "지적도 확인", status: CHECK, basis: art("제5조②2라") },
      { label: "마·바목", rule: "순환용주택·재해 우려 등", value: "행정 판단", status: CHECK, basis: art("제5조②2마·바") },
      { label: "가~바목 중 하나", rule: "하나 이상", value: ga === MET ? "가목 충족" : "가목 외 확인 필요", status: ga === MET ? MET : CHECK, basis: art("제5조②2") },
    ];
    const perBuilding = rows.map((r) => ({ ...r, mark: r.old === true ? "노후·불량" : r.old === false ? "아님" : CHECK }));
    // 같은 목록, 다른 사업 기준: 도시재생은 구조·용도와 관계없이 준공 20년 이상 건축물 수를 센다
    const uOld = rows.filter((r) => r.b.use_apr_day && ageYears(r.b.use_apr_day, ref) >= URBAN.years).length, uUnk = rows.filter((r) => !r.b.use_apr_day).length;
    const uLo = (uOld / n) * 100, uHi = ((uOld + uUnk) / n) * 100;
    // 사용승인일 없는 건물을 분모에서 뺀 값도 함께 둔다. 부산 원도심은 날짜 없는 건물이 많아(중구 47%) 분모 선택만으로 판정이 뒤집힌다(2026-10-30 전수검사)
    const known = uUnk && n > uUnk ? (uOld / (n - uUnk)) * 100 : null;
    const unkMasonry = rows.filter((r) => !r.b.use_apr_day && MASONRY.test(r.b.structure || "")).length;
    const urban = { label: "도시재생 쇠퇴 진단 노후 요건", rule: `준공 ${URBAN.years}년 이상 건축물 수 ${URBAN.thr}% 이상`, value: range(uLo, uHi), known, unk: uUnk, unkMasonry,
      status: status(uLo, uHi, URBAN.thr), basis: "도시재생법 시행령 제17조" };
    const one = (w) => [reachDate(rows, w, thr, ref, fromEarly), reachDate(rows, w, thr, ref, fromLate)];
    const reach = { count: one(() => 1), area: one((r) => Number(r.b.tot_area) || 0) };
    return { thr, district, n, nOld, nUnk, area, aOld, aUnk, lines, perBuilding, ref, urban, reach, newVillage: newVillage(blds, urban) };
  }

  // 노후주거지정비 지원사업 신청요건(2027 도시재생 신규사업 평가 가이드라인, 일반·빈집정비형).
  // 저층 주거용 건축물(단독·다가구·연립·다세대 등)이 3분의 2 이상 + 쇠퇴요건 ①인구 ②사업체 ③20년 이상 건축물 2분의 1 중 ③ 포함 2개 이상.
  // 대장 주용도가 단독주택·공동주택 두 갈래뿐이라 지상 4층 이하 단독·공동주택을 저층 주거로 본다(5층 이상 = 아파트 등). 층수가 없거나 0이면 못 정함
  // 3분의 2는 정수로 비교한다(2/3×100이 부동소수로 기준선보다 작게 나와 정확히 3분의 2가 미충족이 되는 것을 막음)
  const LOWRISE = { rule: "저층 주거용 건축물 수 3분의 2 이상" };
  // 주용도가 근린생활시설 등이어도 기타용도에 주택이 있으면(mixed_home, 1층 상가·위층 살림집) 저층 주거인지 법령이 정하지 않아 못 정함으로 센다
  const lowState = (b) => (b.main_use === "단독주택" || b.main_use === "공동주택" ? (!b.floors ? null : b.floors <= 4)
    : b.mixed_home && b.floors >= 1 && b.floors <= 4 ? null : false);
  const NV_BASIS = "2027 도시재생 신규사업 평가 가이드라인(노후주거지정비 신청요건)";
  function newVillage(blds, urban) {
    const n = blds.length, st = blds.map(lowState), yes = st.filter((s) => s === true).length, unk = st.filter((s) => s === null).length;
    const mixed = blds.filter((b, i) => st[i] === null && b.mixed_home).length, noFloor = unk - mixed;
    const unkText = unk ? `, 확인 필요 ${[noFloor ? `층수 없는 주택 ${noFloor}동` : "", mixed ? `주택 겸용 ${mixed}동` : ""].filter(Boolean).join("·")}` : "";
    const lo = (yes / n) * 100, hi = ((yes + unk) / n) * 100;
    const lowrise = { label: "저층 주거 비율", rule: LOWRISE.rule, value: `${range(lo, hi)} (${yes}/${n}동${unkText})`, mixed,
      status: yes * 3 >= 2 * n ? MET : (yes + unk) * 3 < 2 * n ? NOT_MET : CHECK, unit: "신청 구역(이 목록)", define: "지상 4층 이하 단독·공동주택(주택 겸용 근린생활시설 등은 확인 필요)", basis: NV_BASIS };
    // ③(20년 경과)이 안 되면 나머지와 관계없이 불충족. ①②는 행정동 공식 쇠퇴진단 값이라 이 목록으로는 정하지 못한다
    const decline = { label: "쇠퇴요건 2개 이상(20년 경과 포함)", rule: "①인구 감소 ②사업체 감소 ③20년 이상 건축물 2분의 1 중 ③ 포함 2개 이상",
      value: urban.status === NOT_MET ? "③ 20년 경과 미충족" : `③ 20년 경과 ${urban.status}, ①·② 중 하나 이상은 공식 쇠퇴진단(행정동) 값으로 확인`,
      status: urban.status === NOT_MET ? NOT_MET : CHECK, shown: urban.status === NOT_MET ? NOT_MET : "공식값 확인", unit: "③은 이 목록, ①·②는 행정동", basis: NV_BASIS };
    return { lowrise, decline };
  }
  function newVillageHTML(nv) {
    const row = (x) => `<div><dt>${escH(x.label)} <span class="nv-st">${escH(x.shown || x.status)}</span></dt><dd><b>${escH(x.value)}</b> <span>기준 ${escH(x.rule)} · 적용 단위: ${escH(x.unit)}${x.define ? ` · 저층 주거 = ${escH(x.define)}` : ""}</span></dd></div>`;
    return `<h3 class="nv-h">노후주거지정비 신청요건</h3><dl class="rv-ref">${row(nv.lowrise)}${row(nv.decline)}</dl>` +
      `<p class="rv-key">${escH(`${NV_BASIS}. 적용 단위는 가이드라인 원문과 대조 전이다. 종합 판정이 아니라 요건별 상태다.`)}</p>`;
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
    [`참고: ${res.urban.label}`, res.urban.rule, `${res.urban.value}${res.urban.known === null ? "" : `(날짜 있는 건물만 ${fmt(res.urban.known)}%)`}, ${res.urban.status}`, res.urban.basis],
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
      `<p class="rv-key">${escH(REACH_NOTE)}</p>` + (res.urban.unkMasonry ? `<p class="rv-key">${escH(masonryNote(res.urban))}</p>` : "") +
      (res.newVillage ? newVillageHTML(res.newVillage) : "");
  }
  const masonryNote = (u) => `사용승인일 없는 ${u.unk}동 중 목조·블록·벽돌·조적이 ${u.unkMasonry}동이다. ${MASONRY_PRIOR.basis} 기준 같은 구조의 날짜 있는 건물 ${MASONRY_PRIOR.n.toLocaleString("ko-KR")}동 중 ${MASONRY_PRIOR.pct}%가 20년 이상이다. 판정에는 쓰지 않고, 대장 열람·현장 확인을 이 건물부터 하라는 참고다.`;

  // 확인할 건물: 사용승인일 없는 건물. 목조·블록·벽돌·조적 먼저(같은 구조의 날짜 있는 건물 98.4%가 20년 이상, 판정에는 안 씀).
  // 현장 기록(같은 기기 FieldStore)은 PNU로만 붙인다. 지번만으로는 법정동이 갈려 다른 건물에 붙을 수 있다
  function todoList(res, records = []) {
    const byPnu = new Map();
    for (const r of records) { const p = r.pnu || (r.building && r.building.pnu); if (p) byPnu.set(p, [...(byPnu.get(p) || []), r]); }
    const items = res.perBuilding.filter((r) => !r.b.use_apr_day)
      .map((r) => ({ b: r.b, masonry: MASONRY.test(r.b.structure || ""), records: (r.b.pnu && byPnu.get(r.b.pnu)) || [] }));
    items.sort((x, y) => (y.masonry - x.masonry) || String(x.b.jibun || "").localeCompare(String(y.b.jibun || ""), "ko", { numeric: true }));
    return { items, withRecord: items.filter((i) => i.records.length).length };
  }

  // 경계안 비교(최대 3개). plans: [{name, res, keys}] — res는 review 결과, keys는 planKeys(건물). 첫 안을 기준으로 빠진·더한 건물을 센다.
  // 판정을 합치지 않는다. 안마다 요건별 상태를 나란히 둘 뿐이다
  const PLAN_MAX = 3;
  const planKeys = (blds) => new Set(blds.map(bKey));
  function comparePlans(plans) {
    const base = plans[0].keys;
    return plans.map((p, i) => ({ name: p.name, n: p.res.n, lowrise: p.res.newVillage.lowrise, urban: p.res.urban, decline: p.res.newVillage.decline,
      old: p.res.lines.find((l) => l.label === "노후·불량 건축물 수"),
      added: i ? [...p.keys].filter((k) => !base.has(k)).length : 0, removed: i ? [...base].filter((k) => !p.keys.has(k)).length : 0 }));
  }
  function compareHTML(rows) {
    const cell = (v, st) => `<td><b>${escH(v)}</b>${st ? `<br><span class="nv-st">${escH(st)}</span>` : ""}</td>`;
    const tr = (k, f) => `<tr><th scope="row">${escH(k)}</th>${rows.map(f).join("")}</tr>`;
    return `<table class="plan-cmp"><thead><tr><th scope="col">요건</th>${rows.map((r) => `<th scope="col">${escH(r.name)}</th>`).join("")}</tr></thead><tbody>` +
      tr("건물 수", (r) => cell(`${r.n.toLocaleString("ko-KR")}동`)) +
      tr("저층 주거 비율(3분의 2)", (r) => cell(r.lowrise.value.split(" (")[0], r.lowrise.status)) +
      tr("20년 경과(2분의 1)", (r) => cell(r.urban.value, r.urban.status)) +
      tr("쇠퇴요건 2개 이상", (r) => cell(r.decline.status === NOT_MET ? "③ 미충족" : "①·② 확인", r.decline.shown || r.decline.status)) +
      tr("노후·불량 건축물 수(재개발)", (r) => cell(r.old.value.split(" (")[0], r.old.status)) +
      tr("첫 경계안과 다른 건물", (r, i) => cell(i ? `더함 ${r.added.toLocaleString("ko-KR")}동 · 빠짐 ${r.removed.toLocaleString("ko-KR")}동` : "기준")) +
      `</tbody></table>`;
  }

  // 엑셀이 수식으로 읽지 않게 =·+·-·@로 시작하는 칸 앞에 '를 붙인다
  const csvCell = (v) => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // 건물별 산정 근거(엑셀용, BOM). 첫 줄에 승인 전 표시. 소유자 등 개인 항목은 파일에 없다
  function toCSV(res, file, { secret = false } = {}) {
    const head = ["지번", "PNU", "주용도", "구조", "사용승인일", "연면적(㎡)", "적용 연한", "경과 연수", "노후·불량", "사유"];
    const body = res.perBuilding.map((r) => [r.b.jibun, r.b.pnu, r.b.main_use, r.b.structure, r.b.use_apr_day, r.b.tot_area, r.years || "", r.age ?? "", r.mark, r.why || ""]);
    const note = [mark(secret, `${NOT_APPROVED} · ${RULES.map((x) => x.id).join("·")} 초안 · 경과 기준일 ${res.ref} · 건축물대장 기준일 ${file.hub_reference_date}`)];
    return "﻿" + [note, head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  // 수기 대조 표본(회계감사 표본추출 방식). 목록 순서와 관계없이 같은 건물들이면 같은 표본: 건물 키를 정렬해 FNV-1a로 시드를 만들고 mulberry32로 섞는다.
  // 불일치 0건일 때 오류율 95% 상한은 1 - 0.05^(1/n)(n=60이면 약 4.9%). 불일치가 있으면 상한을 쓰지 않고 원인부터 본다
  const bKey = (b) => [b.pnu || "", b.jibun || "", b.use_apr_day || "", b.tot_area ?? "", b.main_use || "", b.structure || ""].join("|");
  function fnv1a(s) { let h = 0x811c9dc5; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function sample(res, n = 60) {
    const rows = [...res.perBuilding].sort((x, y) => (bKey(x.b) < bKey(y.b) ? -1 : bKey(x.b) > bKey(y.b) ? 1 : 0));
    const seed = fnv1a(rows.map((r) => bKey(r.b)).join("\n")), rnd = mulberry32(seed), k = Math.min(n, rows.length);
    for (let i = 0; i < k; i++) { const j = i + Math.floor(rnd() * (rows.length - i)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    return { picked: rows.slice(0, k), seed: seed.toString(16).padStart(8, "0"), upper: (1 - Math.pow(0.05, 1 / k)) * 100 };
  }
  function sampleCSV(res, file, { n = 60, secret = false } = {}) {
    const s = sample(res, n), k = s.picked.length;
    const note = [mark(secret, `수기 대조 표본 ${k}동 / 전체 ${res.n}동 · 같은 목록이면 같은 표본(시드 ${s.seed}) · 불일치 0건이면 오류율 95% 상한 ${fmt(s.upper)}% · ${NOT_APPROVED} · 건축물대장 기준일 ${file.hub_reference_date}`)];
    const head = ["표본 번호", "지번", "PNU", "주용도", "구조", "사용승인일", "연면적(㎡)", "리뉴맵 판단", "열람 주용도", "열람 구조", "열람 사용승인일", "열람 연면적(㎡)", "일치(O/X)", "메모"];
    const body = s.picked.map((r, i) => [i + 1, r.b.jibun, r.b.pnu, r.b.main_use, r.b.structure, r.b.use_apr_day, r.b.tot_area, r.mark, "", "", "", "", "", ""]);
    return "﻿" + [note, head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  const block = (kind, text = "", extra = {}) => ({ kind, text: D.clean(text), rows: [], widths: [], caption: "", small: false, ...extra });
  // 한글·PDF 1쪽. 건물별 표는 CSV로 뺀다
  function buildDoc(res, m, file, today, { secret = false } = {}) {
    const src = new D.Sources(), title = `${file.name} 재개발 입안요건 사전검토`;
    const bld = src.ref({ source_name: file.source, source_url: file.source_url, reference_date: file.hub_reference_date, retrieved_at: file.retrieved_at, license_type: file.license });
    const law = src.ref({ source_name: ORD, source_url: ORD_URL, reference_date: "2025-10-01", retrieved_at: "2026-10-23", license_type: "저작권 보호 대상 아님(저작권법 제7조)" });
    const box = [
      ["대상", `붙여 넣은 목록에서 건물 ${res.n}동을 찾음${m.missing.length ? ` · 못 찾은 지번 ${m.missing.length}개(${m.missing.slice(0, 5).join(", ")}${m.missing.length > 5 ? " 등" : ""})` : ""}${m.otherDong.length ? ` · 다른 법정동 ${m.otherDong.length}개 제외` : ""}${bld}`],
      ["기준", `${res.district ? "재정비촉진지구(50%)" : "일반(60%)"} · 연한은 조례 제3조②${law} · 경과 기준일 ${res.ref}`],
      ["못 정한 건물", `${res.nUnk ? `${res.nUnk}동(사용승인일 없음 또는 구조·용도에 따라 연한이 갈림). 비율은 범위로 적었다` : "없음"}. ${UNREG}`],
    ];
    const blocks = [block("title", title), block("para", mark(secret, `${NOT_APPROVED} · 판정 아님 · ${RULES.map((x) => `${x.id} 초안`).join(", ")}`, true), { small: true }),
      block("box", "", { rows: box.map((r) => r.map(D.clean)), widths: [18, 82], refs: true }),
      block("table", "", { rows: [["요건", "기준", "이 목록", "상태", "근거"], ...res.lines.map((l) => [l.label, l.rule, l.value, l.status, l.basis].map(D.clean))], widths: [20, 22, 30, 12, 16], caption: "표 1. 줄마다 따로 본 결과(종합 판정 아님)" }),
      block("para", `현장 확인 줄은 자료로 정하지 못한 요건이다. 주민 동의(도시정비법 제36조)와 재건축진단은 다루지 않고, 건물별 근거는 같은 이름의 CSV에 있다. ${refPara(res)}`, { small: true }),
      block("h1", "출처")];
    src.list.forEach((s, n) => blocks.push(block("para", D.sourceLine(n + 1, s), { small: true })));
    return { kind: "redev", sizes: "onepage", title, blocks, sources: src.list, writtenOn: today, footer: mark(secret, `리뉴맵 입안요건 사전검토 · ${NOT_APPROVED} · `) };
  }

  return { THR, RULES, NOT_APPROVED, SECRET, UNREG, YEARS, RC_STEEL, OTHER, structClass, useClass, yearsRange, ageYears, addYears, oldState, parseList, match, review, newVillage, todoList, PLAN_MAX, planKeys, comparePlans, compareHTML, reachText, summaryHTML, toCSV, sample, sampleCSV, buildDoc, MET, NOT_MET, CHECK };
});
