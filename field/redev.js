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
  // 사용승인 [첫날, 끝날]. 대장에 연도·연월만 있으면 use_apr_span(내보내기 apr_span), 아무것도 없으면 null
  const aprSpan = (b) => (b.use_apr_day ? [b.use_apr_day, b.use_apr_day] : b.use_apr_span || null);
  // 기간 전체가 n년을 넘으면 true, 기간 어느 날로도 안 넘으면 false, 걸치면 null
  const pastYears = (s, n, ref) => (ageYears(s[1], ref) >= n ? true : ageYears(s[0], ref) < n ? false : null);
  // 건물 1동: true 노후·불량, false 아님, null 자료로 못 정함(사용승인일 없음, 연한이 갈리는 구조·용도, 연도만 있어 경계에 걸림)
  function oldState(b, ref) {
    const s = aprSpan(b);
    if (!s) return { old: null, why: b.apr_odd ? `대장 사용승인일이 1900년 이전으로 적혀 있음(${b.apr_odd})` : "사용승인일 자료 없음" };
    const [lo, hi] = yearsRange(b), young = ageYears(s[1], ref), aged = ageYears(s[0], ref), age = young === aged ? young : `${young}~${aged}`;   // 연도만 있으면 범위(CSV 경과 연수 칸)
    const years = lo === hi ? `${lo}년` : `${lo}·${hi}년(구조·용도 분류 필요)`;
    if (pastYears(s, hi, ref)) return { old: true, age, years };
    if (pastYears(s, lo, ref) === false) return { old: false, age, years };
    return { old: null, age, years, why: s[0] === s[1] || lo < hi ? "구조·용도에 따라 연한이 갈림" : "사용승인일이 연·월까지만 있어 연한 경계에 걸림" };
  }

  // 붙여 넣은 글 → [{raw, pnu} | {raw, jibun, dong?}]. 첫 줄에 'PNU'·'지번' 머리가 있으면 그 열만 읽는다(엑셀 복사·CSV).
  // 지번 앞의 동 이름("재송동 45")과 '소재지'·'법정동' 열은 dong으로 남긴다. 버리면 고른 동의 같은 번지 건물이 대신 세어진다
  // ponytail: 따옴표 안 쉼표는 나누지 않는다. 토지조서 CSV가 그런 형식이면 열 고르기를 더한다
  const JIBUN_RE = /(산)?\s*(\d{1,4})(?:\s*-\s*(\d{1,4}))?\s*(?:번지)?$/;
  const dongOf = (s) => { const t = String(s || "").trim().split(/\s+/).pop() || ""; return /^[가-힣][가-힣0-9]*(동|리|가)$/.test(t) ? t : undefined; };
  function parseList(text) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cellsOf = (l) => l.split(/[\t,]/).map((c) => c.replace(/^"|"$/g, "").trim());
    const head = lines.length ? cellsOf(lines[0]) : [];
    const pc = head.findIndex((h) => /^(pnu|필지고유번호)$/i.test(h)), jc = head.findIndex((h) => /지번/.test(h)), dc = head.findIndex((h) => /^(소재지|법정동)$/.test(h));
    const cells = pc >= 0 || jc >= 0
      ? lines.slice(1).map((l) => { const c = cellsOf(l); return [(pc >= 0 && c[pc]) || (jc >= 0 && c[jc]) || "", dc >= 0 ? c[dc] : ""]; })
      : lines.flatMap((l) => l.split(/[,;\t]/)).map((c) => [c, ""]);
    const items = [], bad = [], seen = new Set();
    for (const [raw, place] of cells.map(([c, p]) => [c.trim(), p]).filter(([c]) => c)) {
      let it = null;
      if (/^\d{19}$/.test(raw)) it = { raw, pnu: raw };
      else {
        const m = JIBUN_RE.exec(raw), ji = m && Number(m[3] || 0);
        if (m) {
          it = { raw, jibun: `${m[1] || ""}${Number(m[2])}${ji ? `-${ji}` : ""}` };
          const dong = dongOf(raw.slice(0, m.index)) || dongOf(place);
          if (dong) it.dong = dong;
        }
      }
      if (!it) { bad.push(raw); continue; }
      const key = it.pnu || `${it.dong || ""}|${it.jibun}`;
      if (!seen.has(key)) { seen.add(key); items.push(it); }
    }
    return { items, bad };
  }

  // 지도에서 찍은 꼭짓점 [[lat,lng],...] → 브이월드 geomFilter용 WKT(경도 위도 순, 고리를 닫는다). 3~100점, 한국 범위 밖이면 null
  function polygonWKT(pts) {
    if (!Array.isArray(pts) || pts.length < 3 || pts.length > 100) return null;
    if (!pts.every(([la, ln]) => la > 32 && la < 39.5 && ln > 124 && ln < 132)) return null;
    const ring = [...pts, pts[0]].map(([la, ln]) => `${ln.toFixed(7)} ${la.toFixed(7)}`);
    return `POLYGON((${ring.join(", ")}))`;
  }

  // 점이 다각형 안인지(짝홀 규칙, 위경도 평면). 구역 크기에서는 평면으로 봐도 된다. 경계선 바로 위 점은 어느 한쪽으로 들어간다
  function inPolygon(lat, lng, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ai, oi] = pts[i], [aj, oj] = pts[j];
      if ((ai > lat) !== (aj > lat) && lng < (oj - oi) * (lat - ai) / (aj - ai) + oi) inside = !inside;
    }
    return inside;
  }

  // 위경도 → 첫 꼭짓점 기준 m 평면(구역 크기에서는 오차가 작다)
  const toM = (pts) => { const lat0 = pts[0][0], k = Math.cos(lat0 * Math.PI / 180) * 111320; return ([a, o]) => [(o - pts[0][1]) * k, (a - lat0) * 110540]; };
  // 그린 다각형 면적(㎡). 사용자가 그린 선 기준이라 고시 면적이 아니다
  function polygonAreaM2(pts) {
    if (!Array.isArray(pts) || pts.length < 3) return 0;
    const m = pts.map(toM(pts));
    return Math.abs(m.reduce((s, [x, y], i) => { const [x2, y2] = m[(i + 1) % m.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  }
  // 점이 다각형 안이거나 변에서 buffer(m) 안인지. 2027 가이드라인 p.42의 '구역 반경 500m'에 쓴다
  function nearPolygon(lat, lng, pts, buffer) {
    if (inPolygon(lat, lng, pts)) return true;
    const f = toM(pts), [px, py] = f([lat, lng]), m = pts.map(f);
    return m.some(([ax, ay], i) => {
      const [bx, by] = m[(i + 1) % m.length], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - ax - t * dx, py - ay - t * dy) <= buffer;
    });
  }
  const NEAR_M = 500;
  // 지역 SOC 현황표(경쟁·흡수 보고서 6번). soc: data/soc_busan.json, pts: 그린 꼭짓점. 원자료 행을 그대로 센다(값을 고치지 않는다)
  function socCount(soc, pts) {
    const inside = soc.points.filter(([, , , la, ln]) => inPolygon(la, ln, pts));
    const near = soc.points.filter(([, , , la, ln]) => nearPolygon(la, ln, pts, NEAR_M));
    const rows = soc.sources.map((s, i) => {
      const mine = inside.filter((p) => p[0] === i), types = {};
      for (const p of mine) types[p[2] || "구분 없음"] = (types[p[2] || "구분 없음"] || 0) + 1;
      const dates = mine.map((p) => p[5]).filter(Boolean).sort();
      return { kind: s.kind, n: mine.length, near: near.filter((p) => p[0] === i).length, types, dates: dates.length ? [dates[0], dates[dates.length - 1]] : null, source: s };
    });
    return { rows, inside, near };
  }
  const socTypes = (r) => Object.entries(r.types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(" · ");
  const socDates = (r) => !r.dates ? "" : r.dates[0] === r.dates[1] ? r.dates[0] : `${r.dates[0]}~${r.dates[1]}`;

  // 원자료에는 이름·종류·좌표·기준일이 같고 관리번호만 다른 행이 있다(부산 2026-11-07: 공원 1쌍·주차장 3쌍). 기관이 따로 올린 행이라 지우지 않고 CSV에 표시만 한다
  const socKey = (p) => p.slice(0, 6).join("|");
  function socCSV(soc, pts, today) {
    const { rows, near } = socCount(soc, pts), same = new Map();
    for (const p of near) same.set(socKey(p), (same.get(socKey(p)) || 0) + 1);
    const out = [[`리뉴맵 지역 SOC 현황표 · ${today} · 그린 영역 안 시설 점 수 · 경계 도형은 담지 않음 · ${soc.license_type}`],
      ["시설", "영역 안 수", "영역과 반경 500m 수", "영역 안 종류별", "데이터기준일자", "자료", "받은 날"],
      ...rows.map((r) => [r.kind, r.n, r.near, socTypes(r), socDates(r), `${r.source.name}(공공데이터포털 ${r.source.id}) ${r.source.url}`, r.source.retrieved_at.slice(0, 10)]),
      [], ["시설", "이름", "종류", "위치 구분", "위도", "경도", "데이터기준일자", "관리번호", "같은 이름·위치 행"],
      ...near.map((p) => [soc.sources[p[0]].kind, p[1], p[2], inPolygon(p[3], p[4], pts) ? "영역 안" : "반경 500m", p[3], p[4], p[5], p[6] || "", same.get(socKey(p)) > 1 ? `${same.get(socKey(p))}행(관리번호로 구분)` : ""])];
    return "﻿" + out.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  // GIS·엑셀에서 내보낸 파일 → parseList가 읽는 글. CSV·TXT는 그대로 둔다.
  // GeoJSON은 도형이 아니라 속성(PNU 19자리, 없으면 지번+법정동)만 읽는다. 필지 도형은 이용 조건(D16) 때문에 쓰지 않는다
  function listFromFile(name, text) {
    if (!/\.(geo)?json$/i.test(name || "")) return { text: String(text || ""), n: null, skipped: 0 };
    const feats = (JSON.parse(text).features || []).map((f) => f && f.properties || {});
    const out = [];
    let skipped = 0;
    for (const pr of feats) {
      const vals = Object.entries(pr), pnu = vals.find(([, v]) => /^\d{19}$/.test(String(v).trim()));
      const ji = vals.find(([k]) => /지번|jibun/i.test(k)), dong = vals.find(([k]) => /^(법정동|emd_?nm|dong)$/i.test(k));
      if (pnu) out.push(String(pnu[1]).trim());
      else if (ji && String(ji[1]).trim()) out.push(`${dong ? `${String(dong[1]).trim()} ` : ""}${String(ji[1]).trim()}`);
      else skipped += 1;
    }
    return { text: out.join("\n"), n: out.length, skipped };
  }

  // 목록을 법정동 파일(buildings/{법정동}.json, 여러 동이면 mergeFiles 결과)의 건물과 잇는다. 같은 건물은 한 번만 센다.
  // 동 이름도 PNU도 없는 지번은 고른 동(file.bjd10)으로 본다.
  // 관리번호(mgm_bld_pk)는 2^53을 넘는 값이 있어 JS 숫자로는 서로 다른 건물이 같아진다 → 객체로 가린다
  function match(items, file) {
    const dongs = file.dongs || [{ code: file.bjd10, name: file.name }], codeOf = new Map(dongs.map((d) => [d.name, d.code]));
    const byPnu = new Map(), byJibun = new Map(), found = new Set(), missing = [], otherDong = [];
    const put = (m, k, b) => m.set(k, [...(m.get(k) || []), b]);
    for (const b of file.buildings) {
      if (b.pnu) put(byPnu, b.pnu, b);
      if (b.jibun) put(byJibun, `${(b.pnu || file.bjd10).slice(0, 10)}|${b.jibun}`, b);
    }
    for (const it of items) {
      const code = it.pnu ? it.pnu.slice(0, 10) : it.dong ? codeOf.get(it.dong) : file.bjd10;
      if (!code || !dongs.some((d) => d.code === code)) { otherDong.push(it.raw); continue; }
      const hits = it.pnu ? byPnu.get(it.pnu) : byJibun.get(`${code}|${it.jibun}`);
      if (!hits) { missing.push(it.raw); continue; }
      for (const b of hits) found.add(b);
    }
    return { buildings: [...found.values()], missing, otherDong };
  }

  // 신청 구역이 법정동 경계를 넘으면 여러 동 파일을 한 파일처럼 잇는다. 첫 파일이 고른 동이다.
  // 수집일은 가장 이른 날(보수적), 경과 기준일이 다르면 같은 잣대가 아니라 합치지 않는다. 받는 파일 수는 MERGE_MAX까지
  const MERGE_MAX = 5;
  function mergeFiles(files) {
    const [f] = files;
    if (files.some((x) => x.age_reference_date !== f.age_reference_date)) throw new Error("경과 기준일이 다른 법정동 파일");
    const first = (k) => files.map((x) => x[k]).sort()[0];
    return { ...f, name: files.map((x) => x.name).join("·"), dongs: files.map((x) => ({ code: x.bjd10, name: x.name })),
      hub_reference_date: first("hub_reference_date"), retrieved_at: first("retrieved_at"),
      count: files.reduce((s, x) => s + x.buildings.length, 0), buildings: files.flatMap((x) => x.buildings) };
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
  const fromEarly = (r) => { const s = aprSpan(r.b); return s ? addYears(s[0], yearsRange(r.b)[0]) : ""; };
  const fromLate = (r) => { const s = aprSpan(r.b); return s ? addYears(s[1], yearsRange(r.b)[1]) : null; };
  const URBAN = { years: 20, thr: 50 };
  // 날짜 없는 건물의 구조로 '어느 건물부터 확인할지' 정하는 참고값. 판정에 쓰지 않는다(추정으로 충족을 만들지 않음).
  // 근거: 부산 건축물대장 주건축물 중 날짜 있는 목조·블록·벽돌·조적 165,169동의 98.4%가 20년 이상, 날짜(연·월도) 없는 건물의 89.7%가 이 구조(backend/scripts/busan_undated_share.py, 2026-10-24 수집·기준일 2026-10-26, 11-01 연·월만 있는 건물 분리)
  const MASONRY = /목구조|블록|벽돌|조적/;
  const MASONRY_PRIOR = { pct: 98.4, n: 165169, basis: "부산 건축물대장 2026-10-24 수집" };   // 도시재생법 시행령 제17조 노후 요건(동수). 적용 단위가 달라 참고로만 같이 센다

  // blds: match().buildings, ref: 'YYYY-MM-DD'(파일 age_reference_date), district: 재정비촉진지구, areaM2: 사용자가 넣은 구역 면적(없으면 null)
  // parcel: parcel-ref.js texts() 결과(나·다·라목 참고 범위). 있어도 상태는 '현장 확인' 그대로다(규칙 승인 전·정의 일부를 자료로 못 채움)
  function review(blds, { ref, district = false, areaM2 = null, parcel = null }) {
    if (!blds.length) throw new Error("목록에서 찾은 건물이 없습니다.");
    const thr = district ? THR.district : THR.default, rows = blds.map((b) => ({ b, ...oldState(b, ref) }));
    const sum = (f) => rows.reduce((s, r) => s + (f(r) ? Number(r.b.tot_area) || 0 : 0), 0);
    const n = rows.length, nOld = rows.filter((r) => r.old).length, nUnk = rows.filter((r) => r.old === null).length;
    // 못 정한 까닭별 동수(화면·1쪽 '현장 확인' 비율 옆에 적는다. 가상 고객 11-08 장벽 5). oldState의 why와 같은 네 갈래
    const unk = { noDate: 0, odd: 0, span: 0, split: 0 };
    for (const r of rows) if (r.old === null) unk[!aprSpan(r.b) ? (r.b.apr_odd ? "odd" : "noDate") : r.why.startsWith("구조") ? "split" : "span"] += 1;
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
      { label: "나목 호수밀도", rule: "1ha당 50동 이상", value: parcel ? `참고 ${parcel.density}` : "대장 표제부로 셀 수 없음(공동주택 세대층 기준)", status: CHECK, basis: `${art("제5조②2나")}·제2조8호` },
      { label: "다목 도로", rule: "폭 4m 미만 30% 이상 또는 접도율 40% 이하", value: parcel ? `참고 접도율 ${parcel.road}` : "현장·도면 확인", status: CHECK, basis: art("제5조②2다"), field: "road" },   // field: 현장 앱 R.CHECKS id(접도 상태)
      { label: "라목 필지", rule: "과소·부정형·세장형 40% 이상", value: parcel ? `참고 ${parcel.lots}` : "지적도 확인", status: CHECK, basis: art("제5조②2라") },
      { label: "마·바목", rule: "순환용주택·재해 우려 등", value: "행정 판단", status: CHECK, basis: art("제5조②2마·바") },
      { label: "가~바목 중 하나", rule: "하나 이상", value: ga === MET ? "가목 충족" : "가목 외 확인 필요", status: ga === MET ? MET : CHECK, basis: art("제5조②2") },
    ];
    const perBuilding = rows.map((r) => ({ ...r, mark: r.old === true ? "노후·불량" : r.old === false ? "아님" : CHECK }));
    // 같은 목록, 다른 사업 기준: 도시재생은 구조·용도와 관계없이 준공 20년 이상 건축물 수를 센다
    const uSt = rows.map((r) => { const s = aprSpan(r.b); return s ? pastYears(s, URBAN.years, ref) : null; });
    const uOld = uSt.filter((x) => x === true).length, uUnk = uSt.filter((x) => x === null).length;
    const uLo = (uOld / n) * 100, uHi = ((uOld + uUnk) / n) * 100;
    // 사용승인일 없는 건물을 분모에서 뺀 값도 함께 둔다. 부산 원도심은 날짜 없는 건물이 많아(중구 47%) 분모 선택만으로 판정이 뒤집힌다(2026-10-30 전수검사)
    const known = uUnk && n > uUnk ? (uOld / (n - uUnk)) * 100 : null;
    const noDate = rows.filter((r) => !aprSpan(r.b)), unkMasonry = noDate.filter((r) => MASONRY.test(r.b.structure || "")).length;
    const urban = { label: "도시재생 쇠퇴 진단 노후 요건", rule: `준공 ${URBAN.years}년 이상 건축물 수 ${URBAN.thr}% 이상`, value: range(uLo, uHi), known, unk: uUnk, noDate: noDate.length, unkMasonry,
      status: status(uLo, uHi, URBAN.thr), basis: "도시재생법 시행령 제17조" };
    const one = (w) => [reachDate(rows, w, thr, ref, fromEarly), reachDate(rows, w, thr, ref, fromLate)];
    const reach = { count: one(() => 1), area: one((r) => Number(r.b.tot_area) || 0) };
    return { thr, district, n, nOld, nUnk, unk, area, aOld, aUnk, lines, perBuilding, ref, urban, reach, newVillage: newVillage(blds, urban) };
  }

  // 분모·기준시점·현장 확인 비율(용역사 심사 03 §2·가상 고객 11-08 장벽 5: 결과 숫자 옆에 안 보였다). 값은 review 결과와 건물 파일에서만 읽는다.
  // 분모는 export_buildings.main_items(주건축물만, 부속건축물 제외)와 oldState(주택 겸용도 주용도·구조로 분류, 분모에 그대로)에서 온다
  const DENOM = "건축물대장 표제부 주건축물 동수(부속건축물 제외, 주택 겸용 건물 포함)와 그 연면적 합";
  const DENOM_SHORT = "주건축물 동수·연면적(부속 제외, 주택 겸용 포함)";   // 1쪽 상자용(쪽 높이)
  const UNK_KEYS = [["noDate", "사용승인일 빈칸", "승인일 빈칸"], ["odd", "1900년 이전 표기", "1900년 이전"], ["span", "연·월만 있어 경계에 걸림", "연·월만"], ["split", "구조·용도로 연한이 갈림", "연한 갈림"]];
  // short: 1쪽 상자(쪽 높이). 화면은 긴 이름
  const unkText = (res, short = false) => UNK_KEYS.filter(([k]) => res.unk[k]).map(([k, t, ts]) => (short ? `${ts} ${res.unk[k]}` : `${t} ${res.unk[k]}동`)).join(short ? ", " : " · ") || "없음";
  const pct = (a, b) => (b ? fmt((a / b) * 100) : "0");
  // dong: 행정동 쇠퇴 값(national/emd)을 골랐을 때. 쇠퇴지표 기준연도는 그 셀의 기준일에서 읽는다
  function basisRows(res, file, dong = null) {
    const refs = ((dong && dong.cells) || []).filter((c) => c.indicator_code.startsWith("DECLINE_")).map((c) => c.reference_date).filter(Boolean).sort();
    const low = res.newVillage.lowrise;
    return [
      ["분모", `건물 수 ${res.n}동 · 연면적 ${fmt(res.area)}㎡ = ${DENOM}. ${UNREG}`],
      ["기준시점", `건축물대장 기준일 ${D.govDate(file.hub_reference_date)} · 노후 연한 경과 기준일 ${D.govDate(res.ref)}(${res.ref === file.age_reference_date ? "자료 기준일, 입력 없음" : "입력값"}) · 쇠퇴지표 기준연도 ${refs.length ? refs[refs.length - 1].slice(0, 4) : "행정동을 고르면 표시"}`],
      ["현장 확인", `노후·불량 못 정한 건물 ${res.nUnk}동 / ${res.n}동(${pct(res.nUnk, res.n)}%): ${unkText(res)}` +
        (low.unk ? ` · 저층 주거 못 정한 건물 ${low.unk}동(${pct(low.unk, res.n)}%): ${Object.entries(low.unkWhy).map(([k, v]) => `${k} ${v}동`).join(" · ")}` : "")],
    ];
  }
  const basisHTML = (res, file, dong) => `<dl class="rv-ref">${basisRows(res, file, dong).map(([k, v]) => `<div><dt>${escH(k)}</dt><dd>${escH(v)}</dd></div>`).join("")}</dl>`;

  // 노후주거지정비 지원사업 신청요건(2027 도시재생 신규사업 평가 가이드라인, 일반·빈집정비형).
  // 저층 주거용 건축물(단독·다가구·연립·다세대 등)이 3분의 2 이상 + 쇠퇴요건 ①인구 ②사업체 ③20년 이상 건축물 2분의 1 중 ③ 포함 2개 이상.
  // 원문은 저층 주거를 주택 유형(단독·다가구·연립·다세대 등)으로 적고 층수 기준이 없다(docs/rule_reviews/OLDRES-2027-GEN.md).
  // 유형으로 읽든 지상 4층 이하로 읽든 저층 주거면 true, 둘 다 아니면 false, 두 읽기가 갈리면 못 정함(null).
  // 갈리는 건물: 5층 이상 단독주택·다세대·연립(1층 필로티 등), 4층 이하 아파트·기숙사, 층수 없는 주택. house_type은 기타용도에서 읽은 공동주택 유형
  // 3분의 2는 정수로 비교한다(2/3×100이 부동소수로 기준선보다 작게 나와 정확히 3분의 2가 미충족이 되는 것을 막음)
  const LOWRISE = { rule: "저층 주거용 건축물 수 3분의 2 이상" };
  // 주용도가 근린생활시설 등이어도 기타용도에 주택이 있으면(mixed_home, 1층 상가·위층 살림집) 저층 주거인지 법령이 정하지 않아 못 정함으로 센다
  function lowState(b) {
    const low = b.floors >= 1 && b.floors <= 4;
    if (b.main_use === "단독주택") return low || null;
    if (b.main_use !== "공동주택") return b.mixed_home && low ? null : false;
    if (b.house_type === "다세대·연립") return low || null;
    if (b.house_type === "아파트") return b.floors >= 5 ? false : null;
    if (b.house_type) return null;   // 기숙사, 아파트·다세대 혼재
    return !b.floors ? null : low;
  }
  // 못 정한 까닭(화면 글). lowState가 null인 건물만 부른다
  const lowWhy = (b) => (b.mixed_home && b.main_use !== "단독주택" && b.main_use !== "공동주택" ? "주택 겸용"
    : !b.floors ? "층수 없는 주택" : b.main_use === "단독주택" || b.house_type === "다세대·연립" ? "5층 이상 단독·다세대·연립" : "4층 이하 아파트·기숙사 등");
  const NV_BASIS = "2027 도시재생 신규사업 평가 가이드라인(노후주거지정비 신청요건)";
  function newVillage(blds, urban) {
    const n = blds.length, st = blds.map(lowState), yes = st.filter((s) => s === true).length, unk = st.filter((s) => s === null).length;
    const why = new Map();
    blds.forEach((b, i) => { if (st[i] === null) why.set(lowWhy(b), (why.get(lowWhy(b)) || 0) + 1); });
    const mixed = why.get("주택 겸용") || 0;
    const unkText = unk ? `, 확인 필요 ${["층수 없는 주택", "주택 겸용", "5층 이상 단독·다세대·연립", "4층 이하 아파트·기숙사 등"].filter((k) => why.has(k)).map((k) => `${k} ${why.get(k)}동`).join("·")}` : "";
    const lo = (yes / n) * 100, hi = ((yes + unk) / n) * 100;
    const lowrise = { label: "저층 주거 비율", rule: LOWRISE.rule, value: `${range(lo, hi)} (${yes}/${n}동${unkText})`, mixed, unk, unkWhy: Object.fromEntries(why),
      status: yes * 3 >= 2 * n ? MET : (yes + unk) * 3 < 2 * n ? NOT_MET : CHECK, unit: "신청 구역(이 목록)", define: "단독·다가구·연립·다세대 등(유형과 지상 4층 이하 기준이 갈리는 건물, 주택 겸용 근린생활시설 등은 확인 필요)", basis: NV_BASIS };
    // ③(20년 경과)이 안 되면 나머지와 관계없이 불충족. ①②는 행정동 공식 쇠퇴진단 값이라 이 목록으로는 정하지 못한다
    const decline = { label: "쇠퇴요건 2개 이상(20년 경과 포함)", rule: "①인구 감소 ②사업체 감소 ③20년 이상 건축물 2분의 1 중 ③ 포함 2개 이상",
      value: urban.status === NOT_MET ? "③ 20년 경과 미충족" : `③ 20년 경과 ${urban.status}, ①·② 중 하나 이상은 공식 쇠퇴진단(행정동) 값으로 확인`,
      status: urban.status === NOT_MET ? NOT_MET : CHECK, shown: urban.status === NOT_MET ? NOT_MET : "공식값 확인", unit: "③은 이 목록, ①·②는 행정동", basis: NV_BASIS };
    // 원문은 활성화지역 안을 먼저 요구한다(p.36, 일반·빈집정비형 모두). 지번 목록으로는 정하지 못해 공식 고시로 확인하게 둔다.
    // 이 줄이 없으면 아래 두 줄이 충족일 때 신청할 수 있는 것처럼 읽힌다(규칙 대조 분류표 17, 2026-11-01)
    const area = { label: "도시재생활성화지역 안", rule: "전략계획상 도시재생활성화지역(접수 마감일 기준)", value: "이 목록으로는 정하지 못함. 도시재생전략계획 고시로 확인",
      status: CHECK, shown: "공식값 확인", unit: "신청 구역", basis: NV_BASIS };
    return { area, lowrise, decline };
  }
  function newVillageHTML(nv) {
    const row = (x) => `<div><dt>${escH(x.label)} <span class="nv-st">${escH(x.shown || x.status)}</span></dt><dd><b>${escH(x.value)}</b> <span>기준 ${escH(x.rule)} · 적용 단위: ${escH(x.unit)}${x.define ? ` · 저층 주거 = ${escH(x.define)}` : ""}</span></dd></div>`;
    return `<h3 class="nv-h">노후주거지정비 신청요건</h3><dl class="rv-ref">${row(nv.area)}${row(nv.lowrise)}${row(nv.decline)}</dl>` +
      `<p class="rv-key">${escH(`${NV_BASIS}. 적용 단위는 가이드라인 원문과 대조 전이다. 종합 판정이 아니라 요건별 상태다.`)}</p>`;
  }

  // 화면 요약(v4): 숫자 칸, 줄 상태 도넛, 건물 수·연면적 쌓은 막대(노후·불량 | 못 정함 | 아님)와 기준선. 종합 판정·순위 아님
  // 홑따옴표도 바꾼다(2026-11-01 리뷰, SW 개발보안 가이드 XSS 항목). record.js escH와 같은 다섯 글자
  const escH = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // 행정동 쇠퇴 3요건 값(2026-11-04). ①·②는 지번 목록으로 구하지 못해 지도와 같은 원장 셀을 그대로 옮긴다.
  // 충족 여부는 정하지 않는다: 판정 규칙(rules/decline.py)이 승인 전이고, 행정동과 신청 구역은 경계가 달라 이 값이 구역의 값은 아니다
  const REQ_OVER = "기준 해당", REQ_INSIDE = "기준 비해당", REQ_UNKNOWN = "정할 수 없음", UNSETTLED = ["추가확인", "충돌", "폐기"];
  const DONG_REQ = [
    { label: "① 인구", rule: "최근 30년 최대 대비 20% 이상 감소, 또는 최근 5년 중 3년 이상 연속 감소", rate: "DECLINE_POP_DROP30Y_PCT", rateName: "30년 최대 대비 감소율", thr: 20, run: "DECLINE_POP_DECL3IN5" },
    { label: "② 사업체", rule: "최근 10년 최대 대비 5% 이상 감소, 또는 최근 5년 중 3년 이상 연속 감소", rate: "DECLINE_BIZ_DROP10Y_PCT", rateName: "10년 최대 대비 감소율", thr: 5, run: "DECLINE_BIZ_DECL3IN5" },
    { label: "③ 20년 이상 건축물", rule: "비율 50% 이상", rate: "DECLINE_AGING_20Y_PCT", rateName: "행정동 전체 비율", thr: 50 },
  ];
  function dongDecline(dong) {
    const cell = (code) => (dong.cells || []).find((c) => c.indicator_code === code);
    const num = (c) => (c && typeof c.value === "number" ? c.value : null);
    return DONG_REQ.map((q) => {
      const rate = cell(q.rate), run = q.run ? cell(q.run) : null, r = num(rate), s = num(run);
      // 셀은 있는데 값이 비고 가린 이유도 없으면 시계열이 모자라 계산하지 않은 것이다(2026-11-06 조사: 대부분 지금 행정동 코드가 1995년 이후 생김)
      const short = r === null && rate && !rate.value_hidden_reason && q.rate === "DECLINE_POP_DROP30Y_PCT";
      const parts = [`${q.rateName} ${short ? "계산 안 함(1996~2025년 인구 기록이 다 있지 않음)" : r === null ? "자료 없음" : `${r.toFixed(1)}%`}`];
      if (q.run) parts.push(`3년 연속 감소 ${s === null ? "자료 없음" : s === 1 ? "있음" : "없음"}`);
      const c = rate || run || {};
      // 두 길(시행령 제17조 가목·나목) 중 하나라도 기준에 닿으면 그 요건은 기준 해당 값이 있다. 30년 값이 없어도 5년 길로 본다(2026-11-07).
      // dong_brief.requirement_paths와 같은 규칙: 값이 없거나 가렸거나 추가확인·충돌·폐기면 그 길은 정할 수 없음
      const hit = (cl, v, ok) => (!cl || v === null || cl.value_hidden_reason || UNSETTLED.includes(cl.status) ? null : ok(v));
      const ways = [hit(rate, r, (v) => v >= q.thr)].concat(q.run ? [hit(run, s, (v) => v === 1)] : []);
      const path = ways.includes(true) ? REQ_OVER : ways.every((w) => w === false) ? REQ_INSIDE : REQ_UNKNOWN;
      return { label: q.label, rule: q.rule, value: parts.join(", "), path, source: c.source_name || "출처 없음", ref: c.reference_date || "", checked: c.status === "미확인" ? "수기 대조 전" : c.status || "" };
    });
  }
  function dongDeclineHTML(dong) {
    const reqs = dongDecline(dong);
    const rows = reqs.map((x) => `<div><dt>${escH(x.label)}</dt><dd><b>${escH(x.value)}</b> → ${escH(x.path)} <span>기준 ${escH(x.rule)} · 기준일 ${escH(x.ref ? D.govDate(x.ref) : "없음")} · ${escH(x.source)} · ${escH(x.checked)}</span></dd></div>`);
    // 행정동 값으로 기준에 닿지 않는 요건이 있으면 집계구 제시 길을 알린다(2027 가이드라인, claims C74)
    const block = reqs.some((x) => x.path !== REQ_OVER)
      ? `<p class="rv-key">행정동 값으로 기준에 닿지 않거나 정할 수 없는 요건이 있습니다.<br>2027 도시재생 신규사업 평가 가이드라인은 지역특화재생 사전적격성에서 행정동 단위 기준에 미치지 못하면 집계구 등 공간 단위로 제시하게 합니다(인정사업은 읍·면·동 단위만).<br>리뉴맵에는 아직 집계구 인구·사업체 값이 없습니다. ③은 위 지번 목록으로 구역 값을 셉니다.</p>`
      : "";
    return `<dl class="rv-ref">${rows.join("")}</dl><p class="rv-key">${escH(dong.name)} 전체의 값입니다.<br>인구·사업체는 두 길 중 하나라도 기준에 닿으면 기준 해당입니다. 규칙 승인 전 참고이고, 신청 구역의 값이 아니고, 충족 판정이 아닙니다.</p>${block}`;
  }
  // 법정동 이름으로 이어지는 행정동(반여동 → 반여1~4동, 중앙동1가 → 중앙동). 이름만 보는 것이라 못 찾는 동이 있어 사람이 고르게 둔다
  function dongCandidates(legalName, dongs) {
    const stem = String(legalName || "").replace(/\d+가$/, "").replace(/동$/, "");
    if (!stem) return [];
    const re = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}제?\\d*(?:[·,.]\\d+)*동$`);
    return dongs.filter((d) => re.test(d.name)).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
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
  const masonryNote = (u) => `사용승인일 없는 ${u.noDate}동 중 목조·블록·벽돌·조적이 ${u.unkMasonry}동이다. ${MASONRY_PRIOR.basis} 기준 같은 구조의 날짜 있는 건물 ${MASONRY_PRIOR.n.toLocaleString("ko-KR")}동 중 ${MASONRY_PRIOR.pct}%가 20년 이상이다. 판정에는 쓰지 않고, 대장 열람·현장 확인을 이 건물부터 하라는 참고다.`;

  // 확인할 건물: 사용승인일 없는 건물. 목조·블록·벽돌·조적 먼저(같은 구조의 날짜 있는 건물 98.4%가 20년 이상, 판정에는 안 씀).
  // 현장 기록(같은 기기 FieldStore)은 PNU로만 붙인다. 지번만으로는 법정동이 갈려 다른 건물에 붙을 수 있다
  function todoList(res, records = []) {
    const byPnu = new Map();
    for (const r of records) { const p = r.pnu || (r.building && r.building.pnu); if (p) byPnu.set(p, [...(byPnu.get(p) || []), r]); }
    const items = res.perBuilding.filter((r) => !aprSpan(r.b))
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
      tr("도시재생활성화지역 안", () => cell("고시로 확인", "공식값 확인")) +
      tr("저층 주거 비율(3분의 2)", (r) => cell(r.lowrise.value.split(" (")[0], r.lowrise.status)) +
      tr("20년 경과(2분의 1)", (r) => cell(r.urban.value, r.urban.status)) +
      tr("쇠퇴요건 2개 이상", (r) => cell(r.decline.status === NOT_MET ? "③ 미충족" : "①·② 확인", r.decline.shown || r.decline.status)) +
      tr("노후·불량 건축물 수(주택정비형 재개발)", (r) => cell(r.old.value.split(" (")[0], r.old.status)) +
      tr("첫 경계안과 다른 건물", (r, i) => cell(i ? `더함 ${r.added.toLocaleString("ko-KR")}동 · 빠짐 ${r.removed.toLocaleString("ko-KR")}동` : "기준")) +
      `</tbody></table>`;
  }

  // 엑셀이 수식으로 읽지 않게 =·+·-·@로 시작하는 칸 앞에 '를 붙인다
  const csvCell = (v) => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // 건물별 산정 근거(엑셀용, BOM). 첫 줄에 승인 전 표시. 소유자 등 개인 항목은 파일에 없다
  function toCSV(res, file, { secret = false } = {}) {
    const head = ["지번", "PNU", "주용도", "구조", "사용승인일", "연면적(㎡)", "적용 연한", "경과 연수", "노후·불량", "사유"];
    const body = res.perBuilding.map((r) => [r.b.jibun, r.b.pnu, r.b.main_use, r.b.structure, r.b.use_apr_day || (r.b.use_apr_span || []).join("~"), r.b.tot_area, r.years || "", r.age ?? "", r.mark, r.why || ""]);
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
    const body = s.picked.map((r, i) => [i + 1, r.b.jibun, r.b.pnu, r.b.main_use, r.b.structure, r.b.use_apr_day || (r.b.use_apr_span || []).join("~"), r.b.tot_area, r.mark, "", "", "", "", "", ""]);
    return "﻿" + [note, head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  const block = (kind, text = "", extra = {}) => ({ kind, text: D.clean(text), rows: [], widths: [], caption: "", small: false, ...extra });
  // 한글·PDF 1쪽. 건물별 표는 CSV로 뺀다
  function buildDoc(res, m, file, today, { secret = false } = {}) {
    // 조례 제5조②2는 주택정비형 재개발사업구역에만 쓴다(도시정비형은 대상 아님). 제목과 기준 줄에 밝힌다(규칙 대조 분류표 6)
    const src = new D.Sources(), title = `${file.name} 주택정비형 재개발 입안요건 사전검토`;
    const bld = src.ref({ source_name: file.source, source_url: file.source_url, reference_date: file.hub_reference_date, retrieved_at: file.retrieved_at, license_type: file.license });
    const law = src.ref({ source_name: ORD, source_url: ORD_URL, reference_date: "2025-10-01", retrieved_at: "2026-10-23", license_type: "저작권 보호 대상 아님(저작권법 제7조)" });
    const box = [
      ["대상", `붙여 넣은 목록에서 건물 ${res.n}동을 찾음 · 대장 기준일 ${file.hub_reference_date}${m.missing.length ? ` · 못 찾은 지번 ${m.missing.length}개(${m.missing.slice(0, 5).join(", ")}${m.missing.length > 5 ? " 등" : ""})` : ""}${m.otherDong.length ? ` · 다른 법정동 ${m.otherDong.length}개 제외` : ""}${bld}`],
      ["기준", `주택정비형 재개발(도시정비형은 대상 아님, 조례 제5조②2) · ${res.district ? "재정비촉진지구(50%)" : "일반(60%)"} · 연한은 조례 제3조②${law} · 경과 기준일 ${res.ref}(${res.ref === file.age_reference_date ? "자료 기준일" : "입력값"})`],
      ["분모·못 정함", `${DENOM_SHORT}. 못 정함 ${res.nUnk ? `${res.nUnk}동(${pct(res.nUnk, res.n)}%: ${unkText(res, true)})은 범위로 적음` : "없음"}. ${UNREG}`],
    ];
    const blocks = [block("title", title), block("para", mark(secret, `${NOT_APPROVED} · 판정 아님 · ${RULES.map((x) => `${x.id} 초안`).join(", ")}`, true), { small: true }),
      block("box", "", { rows: box.map((r) => r.map(D.clean)), widths: [18, 82], refs: true }),
      block("table", "", { rows: [["요건", "기준", "이 목록", "상태", "근거"], ...res.lines.map((l) => [l.label, l.rule, l.value, l.status, l.basis].map(D.clean))], widths: [20, 22, 30, 12, 16], caption: "표 1. 줄마다 따로 본 결과(종합 판정 아님)" }),
      block("para", `현장 확인 줄은 자료로 정하지 못한 요건이다. 주민 동의(도시정비법 제36조)와 재건축진단은 다루지 않고, 건물별 근거는 같은 이름의 CSV에 있다. ${refPara(res)}`, { small: true }),
      block("h1", "출처")];
    src.list.forEach((s, n) => blocks.push(block("para", D.sourceLine(n + 1, s), { small: true })));
    return { kind: "redev", sizes: "onepage", title, blocks, sources: src.list, writtenOn: today, footer: mark(secret, `리뉴맵 입안요건 사전검토 · ${NOT_APPROVED} · `) };
  }

  function applicationRecords(res, records) {
    const pnus = new Set(res.perBuilding.map((r) => r.b.pnu).filter(Boolean));
    return records.filter((r) => pnus.has(r.pnu || (r.building && r.building.pnu)))
      .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)) || String(a.id).localeCompare(String(b.id)));
  }

  function buildApplicationDoc(res, m, file, today, { secret = false, records = [], dataHash = "" } = {}) {
    const src = new D.Sources(), nv = res.newVillage, recs = applicationRecords(res, records);
    const bld = src.ref({ source_name: file.source, source_url: file.source_url, reference_date: file.hub_reference_date, retrieved_at: file.retrieved_at, license_type: file.license });
    const guide = src.ref({ source_name: "국토교통부 2027 도시재생 신규사업 평가 가이드라인 p.36·94", source_url: "https://www.krihs.re.kr/board.es?act=view&bid=0077&list_no=398642&mid=a60504000000", reference_date: "2026-09-11", retrieved_at: "2026-11-04", license_type: "확인 필요" });
    const title = `${file.name} 노후주거지정비 신청요건 근거`;
    const rows = [
      ["현황조사 항목(p.94)", "이 목록으로 확인한 내용 / 판단 못 한 내용"],
      ["노후주거지 개요", "인구·가구·세대·거주형태, 도시·군 관리계획, 토지이용: 구역 자료 확인 필요"],
      ["건축물 현황", `총 ${res.n}동 · 저층 주거 ${nv.lowrise.value.split(" (")[0]} · 20년 경과 ${res.urban.value}${bld}. 용도·승인일·층수·구조는 건물별 CSV. 공폐가·허가 여부 확인 필요`],
      ["주택정비 현황", "최근 5년 신규주택·정비사업, 주택규모별 비율·미분양: 확인 필요"],
      ["기반·편의시설 현황", "신청 구역 현장 조사 필요(행정동 값을 구역 값으로 쓰지 않음)"],
      ["빈집현황·실태조사", "실태조사 미실시. 현장 기록은 실태조사를 대체하지 않음"],
      ["도시재생활성화지역 지정 요건", `${nv.area.shown} · 저층 주거 ${nv.lowrise.status} · ③20년 경과 ${res.urban.status}. ①인구·②사업체는 행정동 공식값 확인${guide}`],
    ];
    const missing = [...m.missing, ...m.otherDong];
    const blocks = [
      block("title", title),
      block("para", mark(secret, `${NOT_APPROVED} · 판정 아님 · 일반정비형 참고(빈집정비형 추가요건 별도 확인)`, true), { small: true }),
      block("para", `대상 ${res.n}동 · 경과 기준일 ${D.govDate(res.ref)} · 못 정한 건물 ${res.nUnk}동. ${missing.length ? `계산 제외 ${missing.length}개: ${missing.slice(0, 3).join("·")}${missing.length > 3 ? " 등(전체는 CSV)" : ""}` : "계산 제외 없음"}. ${UNREG}`, { small: true }),
      block("table", "", { rows: rows.map((r) => r.map(D.clean)), widths: [25, 75] }),
      block("para", `신청요건(p.36): 활성화지역 고시 확인, 저층 주거 3분의 2 이상, ①②③ 중 ③ 포함 2개 이상. ③은 20년 이상 건축물 2분의 1 이상. 저층 유형 해석·규칙 승인 전. 종합 판정을 내리지 않는다. 이 문서는 요건 검토용 계산 근거이며 최종 적격성 판단은 국토교통부·지자체 검토를 따른다.`, { small: true }),
      block("para", `현장 기록 ${recs.length}건 / ${new Set(recs.map((r) => r.pnu || r.building.pnu)).size}필지(이 기기, PNU 일치). 기록만 첨부하며 대장 값·계산값은 바꾸지 않았다. 상세는 신청요건 근거 CSV.`, { small: true }),
      block("para", `자료 판: 법정동 ${file.bjd10} · SHA-256 ${dataHash || "미기록(같은 건물 파일 보관 필요)"} · 받은 시각 ${file.retrieved_at ? String(file.retrieved_at).slice(0, 16).replace("T", " ") : "미표시"} · ${RULES.map((r) => r.id).join("·")} 초안. SHA-256은 건물 파일이 바뀌지 않았는지만 확인하며 현장 사실을 입증하지 않는다. 다시 계산: 같은 건물 파일·지번 목록·경과 기준일로 계산한다. 건물 파일·건물별 CSV·신청요건 CSV를 함께 보관한다.`, { small: true }),
      ...src.list.map((s, i) => block("para", D.sourceLine(i + 1, s), { small: true })),
    ];
    return { kind: "redev", sizes: "onepage", title, blocks, sources: src.list, writtenOn: today, footer: mark(secret, `리뉴맵 신청요건 근거 · ${NOT_APPROVED} · `) };
  }

  function consultRows(res, m, file) {
    const nv = res.newVillage, out = m.missing.length + m.otherDong.length;
    return [
      ["질의", "근거(조문·자료)", "이 문서의 한계"],
      ["20년 이상 건축물 비율은 어떤 기준일·분모로 셌나", `도시재생법 시행령 제17조 · 건축물대장 기준일 ${D.govDate(file.hub_reference_date)} · 분모 ${res.n}동(주건축물)`, `사용승인일 없는 ${res.urban.unk}동은 범위로 둠. 대장에 없는 무허가 건축물 미포함`],
      ["저층 주거 3분의 2는 어떻게 셌나", "2027 평가 가이드라인 p.36 · 주용도·층수·기타용도(주택 유형)", `${nv.lowrise.value.split(" (")[0]}. 주택 겸용·층수 해석은 확인 필요`],
      ["인구·사업체 요건은 어디 값인가", "쇠퇴진단지표(행정동, 2025) · 30년·5년 두 길", "행정동 값이며 구역 값이 아님. 행정동에서 안 맞으면 집계구 등으로 따로 제시"],
      ["경계를 바꾸면 결과가 어떻게 달라지나", "같은 건물 파일로 경계안 최대 3개 비교", `경계 도형은 없고 지번 목록 기준. 계산 제외 지번 ${out}개`],
      ["현장 확인은 했나", "현장 기록(사진·위치 오차·확인자)을 PNU로 연결", "실태조사를 대신하지 않음. 기록은 대장 값을 바꾸지 않음"],
    ];
  }

  // 사전컨설팅(2027 공모 최소 2회)에서 먼저 나올 질문. 1쪽 높이를 지키려고 따로 낸다. 답은 이 계산의 값과 한계만 쓴다(경쟁·흡수 보고서 2026-11-07 흡수 14)
  function buildConsultDoc(res, m, file, today, { secret = false } = {}) {
    const title = `${file.name} 신청요건 근거 · 사전컨설팅 부록`;
    const blocks = [
      block("title", title),
      block("para", mark(secret, `${NOT_APPROVED} · 판정 아님 · 같은 날 받은 신청요건 근거 1쪽과 함께 본다`, true), { small: true }),
      block("table", "", { rows: consultRows(res, m, file).map((r) => r.map(D.clean)), widths: [28, 36, 36] }),
    ];
    return { kind: "redev", sizes: "onepage", title, blocks, sources: [], writtenOn: today, footer: mark(secret, `리뉴맵 사전컨설팅 부록 · ${NOT_APPROVED} · `) };
  }

  function applicationCSV(res, m, file, today, opt = {}) {
    const doc = buildApplicationDoc(res, m, file, today, opt);
    const rows = doc.blocks.flatMap((b) => b.kind === "table" ? b.rows : [[b.text]]);
    rows.push(["사전컨설팅 예상 질의"], ...consultRows(res, m, file));
    rows.push(["계산 제외 지번", ...m.missing], ["계산 제외 다른 동", ...m.otherDong],
      ["현장 기록 ID", "PNU", "기록 시각", "확인 항목", "관찰값", "상태"]);
    for (const r of applicationRecords(res, opt.records || [])) rows.push([r.id, r.pnu || r.building.pnu, r.recorded_at, r.item || r.target, r.observed, r.status]);
    return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  return { polygonWKT, inPolygon, nearPolygon, polygonAreaM2, socCount, socTypes, socDates, socCSV, listFromFile, buildApplicationDoc, buildConsultDoc, consultRows, applicationCSV, dongDecline, dongDeclineHTML, dongCandidates, basisRows, basisHTML, DENOM, DENOM_SHORT, THR, RULES, NOT_APPROVED, SECRET, UNREG, YEARS, RC_STEEL, OTHER, structClass, useClass, yearsRange, ageYears, addYears, oldState, parseList, match, MERGE_MAX, mergeFiles, review, newVillage, todoList, PLAN_MAX, planKeys, comparePlans, compareHTML, reachText, summaryHTML, toCSV, sample, sampleCSV, buildDoc, MET, NOT_MET, CHECK };
});
