/* 리뉴맵 전국 드릴다운 지도(첫 화면의 주인공). 전국 › 광역 › 기초 › (일반구·행정시) › 읍·면·동 — 법적 체계 그대로(SCHEMA.md '행정구역 체계').
   값은 data/national/index.json(시군구 summary)·emd/{code5}.json(행정동 시계열)·living/(생활 지표, 있으면)에서만 온다.
   색 구간은 지표별 기준값에 고정한다. 가중 종합점수·순위·값 순 정렬을 만들지 않는다(D13). '기준 미달 항목 수'는 가중치 없는 개수다.
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부(Leaflet, dashboard.js의 loadLeaflet 재사용). */
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const nf = d => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const digitsOf = v => (Math.round(v * 10) % 10 === 0 ? 0 : 1);
  const fmt = (v, unit) => (isNum(v) ? nf(digitsOf(v)).format(v) + (unit || '') : null);
  const SOURCE_DEFAULT = '도시재생종합정보체계 쇠퇴진단지표';

  // ── 지표·색 ──
  // 기준이 있는 지표는 기준선 아래(회청색 계열)·위(주황→진홍 계열) 두 색 계열로 나누고, 경계는 기준값에 고정한다(값 순·분위 금지, D13).
  // 요건 충족 수·기준 미달 항목 수는 Okabe-Ito 노랑·주황·진홍: 색상과 밝기가 함께 바뀌어 색각 이상에서도 읽힌다.
  const NULL_COLOR = '#9aa6a1';
  const BELOW = ['#e3e9ee', '#c7d3dd', '#9fb4c7', '#6f8fa8'], ABOVE = ['#f5b060', '#e07a1f', '#b3261e'];
  const MET = ['#d3dbd7', '#f0e442', '#e69f00', '#d55e00'];
  const SUMC = [...MET, '#8f2f0c'];
  const REF = ['#e4f2eb', '#a9d6c1', '#62ae91', '#21846a', '#0b4f42']; // 공식 기준 없는 지표의 참고 구간(DESIGN 1.3 녹색 5단계, 좋고 나쁨 없음)
  const DIVERGE = ['#0b7f6f', '#8fcfc3', '#e9ecea', '#f2a07a', '#b3261e']; // 개선 청록 ↔ 악화 진홍, 가운데 중성
  const GROUPS = [['aging', '노후·정비'], ['pop', '인구'], ['econ', '경제'], ['life', '생활 인프라'], ['sum', '종합']];
  // 쇠퇴 요건의 기준값은 시행령 제17조 문언 그대로라 '법정'이다. 승인 대기인 것은 요건을 묶어 판정하는 규칙(decline-3req-v0.1, hero.js RULE)이다.
  // 원장의 '공식 기준 해당 항목 수'(living STD_SHORTFALL_COUNT)도 이 기준을 확정으로 센다 — 화면과 원장이 같은 수를 보이게 맞춘다
  const LAW = '도시재생법 시행령 제17조';
  const lawStd = (value, direction, text) => ({ value, direction, text, source: LAW, status: '법정' });
  const SUM = 'SUM_STD_CROSSED';
  const INDICATORS = [
    { code: 'DECLINE_AGING_20Y_PCT', group: 'aging', icon: 'bldg', label: '노후건축물비율', unit: '%', edges: [30, 50, 60, 70], colors: [BELOW[0], BELOW[2], ...ABOVE],
      title: '준공 20년 이상 건축물 비율', worseUp: true, domain: [0, 100], series: true, standard: lawStd(50, 'above_bad', '준공 20년 이상 건축물 50% 이상') },
    { code: 'DECLINE_MET_COUNT', group: 'aging', icon: 'check', label: '요건 충족 수(하한)', unit: '개', edges: [1, 2, 3], colors: MET, labels: ['0개', '1개', '2개', '3개'],
      title: '시행령 제17조 요건 충족 수 · 결측으로 확정 못 한 요건은 세지 않은 하한 · 판정 아님', worseUp: true, domain: [0, 3], series: true, composite: true,
      dEdges: [-1.5, -0.5, 0.5, 1.5], dLabels: ['2개 이상 줄어듦', '1개 줄어듦', '변화 없음', '1개 늘어남', '2개 이상 늘어남'], standard: lawStd(2, 'above_bad', '쇠퇴 3요건 중 2개 이상') },
    { code: 'DECLINE_POP_DROP30Y_PCT', group: 'pop', icon: 'popdown', label: '인구 감소율(30년)', unit: '%', edges: [0, 10, 20, 30], colors: [BELOW[0], BELOW[1], BELOW[2], ABOVE[1], ABOVE[2]],
      title: '주민등록 인구 30년 최대 대비 감소율 · KOSIS', worseUp: true, domain: [-20, 60], series: true, standard: lawStd(20, 'above_bad', '30년 최대 대비 20% 이상 감소') },
    { code: 'DECLINE_POP_CHANGE_PCT', group: 'pop', icon: 'people', label: '인구변화율', unit: '%', edges: [-20, -10, 0, 10], colors: [ABOVE[2], BELOW[3], BELOW[2], BELOW[1], BELOW[0]],
      title: '주민등록 인구 변화율', worseUp: false, domain: [-50, 50], series: true, standard: lawStd(-20, 'below_bad', '인구변화율 −20% 미만') },
    { code: 'DECLINE_BIZ_DROP10Y_PCT', group: 'econ', icon: 'shop', label: '사업체 감소율', unit: '%', edges: [0, 5, 10, 20], colors: [BELOW[0], BELOW[2], ...ABOVE],
      title: '사업체 10년 최대 대비 감소율', worseUp: true, domain: [-20, 40], series: true, standard: lawStd(5, 'above_bad', '10년 최대 대비 5% 이상 감소') },
    { code: SUM, group: 'sum', icon: 'sum', label: '기준 미달 항목 수', unit: '개', edges: [1, 2, 3, 4], colors: SUMC, labels: ['0개', '1개', '2개', '3개', '4개 이상'],
      title: '기준선보다 나쁜 쪽에 있는 항목 수 · 자료 있는 항목만 셈 · 가중치·순위 없음 · 판정 아님', worseUp: true, domain: [0, 8], computed: true, composite: true },
  ];
  // living/index.json이 없을 때 칩에 '수집 중'으로만 보이는 자리. 숫자·기준값을 만들지 않는다
  const LIVING_EXPECTED = [['pop', '고령(65세 이상) 비율'], ['pop', '청년(20~34세) 비율'], ['life', '병의원(1만 명당)'], ['life', '도서관 거리'],
    ['life', '1인당 공원 면적'], ['life', '공원 수'], ['life', '버스정류장 밀도'], ['life', '응급의료 거리']]
    .map(([group, label], i) => ({ code: 'PENDING_LIVING_' + i, group, label, unit: '', icon: iconFor(label), living: true, pending: true, edges: [], colors: [NULL_COLOR] }));
  function iconFor(label) {
    const words = [['고령', 'elder'], ['청년', 'youth'], ['병', 'hosp'], ['의원', 'hosp'], ['도서관', 'book'], ['공원', 'tree'], ['버스', 'bus'], ['정류', 'bus'], ['응급', 'amb'], ['사업', 'shop'], ['인구', 'people']];
    const w = words.find(([k]) => String(label).includes(k));
    return w ? w[1] : 'dot';
  }
  // 공식 기준이 없는 생활 지표의 고정 참고 구간(화면 표시용 눈금, 분위 아님). 자료가 ref_edges를 주면 그것을 쓴다
  const REF_EDGES = { POP_YOUTH_PCT: [10, 15, 20, 25], HOSP_CLINIC_COUNT: [1, 5, 10, 30], HOSP_PER10K: [2, 5, 10, 20], PARK_COUNT: [1, 3, 5, 10], BUS_STOP_DENSITY: [5, 10, 20, 40] };
  // living/index.json의 group은 키(life) 또는 이름(생활 인프라)이다. '교통'은 대표 결정대로 생활 인프라에 둔다
  const GROUP_ALIAS = { 노후: 'aging', 정비: 'aging', '노후·정비': 'aging', 인구: 'pop', 경제: 'econ', '생활 인프라': 'life', 생활: 'life', 교통: 'life', 종합: 'sum' };
  const groupKey = g => (GROUPS.some(x => x[0] === g) ? g : GROUP_ALIAS[String(g || '').trim()] || 'life');
  const r3 = x => Number(x.toPrecision(3));
  // 기준값에 고정한 구간. 양수 기준은 0.25~2배 눈금, 0 이하 기준은 기준선 한 곳에서만 나눈다
  function stdScale(s) {
    const v = s.value, up = s.direction === 'above_bad';
    if (!(v > 0)) return { edges: [v], colors: up ? [BELOW[2], ABOVE[1]] : [ABOVE[1], BELOW[2]] };
    return up ? { edges: [v / 2, v, v * 1.5, v * 2].map(r3), colors: [BELOW[0], BELOW[2], ...ABOVE] }
      : { edges: [v / 4, v / 2, v, v * 2].map(r3), colors: [ABOVE[2], ABOVE[1], ABOVE[0], BELOW[2], BELOW[0]] };
  }
  const validStd = s => !!s && isNum(s.value) && (s.direction === 'above_bad' || s.direction === 'below_bad');
  const ascending = a => Array.isArray(a) && a.length > 0 && a.length < REF.length && a.every((x, i) => isNum(x) && (i === 0 || x > a[i - 1]));
  // living/index.json의 지표 → 화면 지표. 기준이 없으면 ref_edges(고정 참고 구간)가 있을 때만 단계 색, 없으면 한 색
  // _DELTA5Y는 따로 칩을 만들지 않고 본 지표의 5년 변화 화살표로 쓴다. coverage에서 값 있는 동이 0이면 수집 중
  function livingIndicators(li) {
    if (!li || !Array.isArray(li.indicators)) return LIVING_EXPECTED;
    const cov = li.coverage || {};
    return li.indicators.filter(x => x && x.code && x.label && !/_DELTA5Y$/.test(x.code)).map(x => {
      const code = String(x.code), group = groupKey(x.group), c = cov[code], ref = ascending(x.ref_edges) ? x.ref_edges : REF_EDGES[code];
      const base = { code, group, label: String(x.label), unit: x.unit || '', icon: iconFor(x.label), living: true, title: String(x.label), empty: !!c && c.dongs_with_value === 0,
        delta: li.indicators.some(y => y && y.code === code + '_DELTA5Y'), worseUp: true };
      if (group === 'sum') return { ...base, icon: 'sum', composite: true, edges: [1, 2, 3, 4], colors: SUMC, labels: ['0개', '1개', '2개', '3개', '4개 이상'], standard: null,
        title: `${x.label} · 원장 값 · 가중치·순위 없음 · 판정 아님` };
      if (validStd(x.standard)) return { ...base, ...stdScale(x.standard), worseUp: x.standard.direction === 'above_bad', standard: { ...x.standard, status: x.standard.status || '' } };
      if (ascending(ref)) return { ...base, edges: ref, colors: REF.slice(REF.length - ref.length - 1), standard: null, ref: true };
      return { ...base, edges: [], colors: [REF[2]], labels: ['값 있음'], standard: null };
    });
  }
  // 화면 지표 목록: 그룹 순서(고정) → 그룹 안에서는 정의 순서. 값으로 줄 세우지 않는다
  // 원장이 종합(기준 해당 항목 수)을 주면 화면에서 따로 세지 않는다
  function allIndicators(li) {
    const lv = livingIndicators(li), gi = g => GROUPS.findIndex(x => x[0] === g);
    const list = [...INDICATORS.filter(i => !(i.computed && lv.some(x => x.group === 'sum'))), ...lv];
    return list.sort((a, b) => gi(a.group) - gi(b.group)); // 안정 정렬: 묶음 안에서는 정의 순서 유지
  }
  const MODES = [['now', '현재'], ['trend', '5년 변화']];
  const indOf = (code, list) => (list || INDICATORS).find(i => i.code === code) || INDICATORS[0];
  const keyOf = (ind, mode) => (mode === 'trend' && ind.series ? ind.code + '_DELTA5Y' : ind.code);
  function binIndex(v, edges) {
    if (!isNum(v)) return -1;
    let i = 0;
    while (i < edges.length && v >= edges[i]) i++;
    return i;
  }
  const pm = v => (v < 0 ? '−' + Math.abs(v) : String(v));
  function edgeLabels(edges, unit) {
    if (!edges.length) return [];
    return edges.map((e, i) => (i === 0 ? `${pm(e)}${unit} 미만` : `${pm(edges[i - 1])}~${pm(e)}${unit}`)).concat(`${pm(edges[edges.length - 1])}${unit} 이상`);
  }
  // 지표+모드 → 구간·색·범례 글자. 추세는 발산형(개선↔악화), 지표의 방향(worseUp)에 따라 뒤집는다
  function scaleFor(ind, mode) {
    if (mode === 'trend' && ind.series) {
      const edges = ind.dEdges || [-10, -3, 3, 10], unit = ind.dEdges ? '' : '%p';
      const labels = ind.dLabels || ['10%p 이상 줄어듦', '3~10%p 줄어듦', '±3%p 안', '3~10%p 늘어남', '10%p 이상 늘어남'];
      return { edges, colors: ind.worseUp ? DIVERGE : [...DIVERGE].reverse(), labels, unit, title: `${ind.label} 5년 변화 · 청록 개선 · 진홍 악화` };
    }
    return { edges: ind.edges || [], colors: ind.colors || [NULL_COLOR], labels: ind.labels || edgeLabels(ind.edges || [], ind.unit), unit: ind.unit, title: ind.title || ind.label };
  }
  const colorOf = (v, scale) => { const b = binIndex(v, scale.edges); return b < 0 ? NULL_COLOR : scale.colors[b]; };
  function legendItems(ind, mode) {
    const s = scaleFor(ind, mode);
    return (ind.pending ? [] : s.colors.map((color, i) => ({ color, label: s.labels[i] }))).concat({ color: NULL_COLOR, label: ind.pending ? '수집 중' : '자료 없음·비공개', hatch: true });
  }
  const isPending = s => !!s && /초안|대기|미승인/.test(String(s.status || ''));
  // 기준선보다 나쁜 쪽인가. 기준 없음·값 없음은 null
  function crossed(v, s) {
    if (!validStd(s) || !isNum(v)) return null;
    return s.direction === 'below_bad' ? v < s.value : v >= s.value;
  }
  // 추세 화살표: 값이 늘면 ▲, 줄면 ▼. 개선/악화는 지표 방향으로 정한다
  function trendText(delta, ind) {
    if (!isNum(delta)) return null;
    if (Math.abs(delta) < 1e-9) return { arrow: '→', word: '변화 없음', cls: 'same' };
    const up = delta > 0, worse = up === ind.worseUp;
    return { arrow: up ? '▲' : '▼', word: worse ? '악화' : '개선', cls: worse ? 'worse' : 'better' };
  }
  // 지표를 고를 수 있는지. 쇠퇴 지표: 시군구 summary에 값이 있거나, 읍·면·동 시계열에만 있는 지표(사업체 감소율 등)는 지금 연 읍·면·동 파일에 값이 있을 때
  // (읍·면·동 파일을 아직 안 열었으면 고를 수 있게 두고, 전국 단계 지도는 회색 + '읍·면·동 자료만' 안내). 생활 지표: living/index.json에 올라 있을 때
  const hasSummary = (ind, index) => ((index && index.sigungu) || []).some(s => isNum(summaryOf(s, ind.code).value));
  function isAvailable(ind, index, li, emd) {
    if (ind.pending || ind.empty) return false;
    if (ind.computed) return true;
    if (ind.series) return hasSummary(ind, index) || !emd || ((emd && emd.dongs) || []).some(d => seriesOf(d, ind.code).some(p => p[1] !== null));
    return !!(li && Array.isArray(li.indicators));
  }

  // ── 해시·단계 ──
  // #map/21/21090/21090530 · 일반구: #map/31/41110/31011/31011510 (2자리 시도, 5자리 기초, 5자리 일반구·행정시, 7~10자리 동)
  function parseHash(hash) {
    const m = /^#map((?:\/\d+)*)$/.exec(String(hash || ''));
    if (!m) return null;
    const r = { sido: null, sigungu: null, gu: null, dong: null };
    for (const p of m[1].split('/').filter(Boolean)) {
      if (p.length === 2 && !r.sido) r.sido = p;
      else if (p.length === 5 && r.sido && !r.sigungu) r.sigungu = p; // 상위 시는 행안부 코드(41110)라 시도(31)로 시작하지 않을 수 있다. 맞는지는 resolve()가 본다
      else if (p.length === 5 && r.sigungu && !r.gu && p.startsWith(r.sido)) r.gu = p;
      else if (p.length >= 7 && p.length <= 10 && r.sigungu && !r.dong && p.startsWith(r.gu || r.sigungu)) r.dong = p;
      else return null;
    }
    return r;
  }
  const toHash = r => '#map' + [r.sido, r.sigungu, r.gu, r.dong].filter(Boolean).map(x => '/' + x).join('');
  // 기초 목록: parent가 있으면 parent 기준(일반구·행정시), 없으면 시도 직속
  const childrenOf = (index, code) => ((index && index.sigungu) || []).filter(s => String(s.parent || s.sido2) === String(code));
  const sgOf = (index, code5) => ((index && index.sigungu) || []).find(s => String(s.code5) === String(code5)) || null;
  const sidoOf = (index, code2) => ((index && index.sido) || []).find(s => String(s.code2) === String(code2)) || null;
  // 지도에 그려지는 칸(경계가 있는 단위): 아래에 일반구를 둔 시(수원시 등)는 빼고 그 일반구를 넣는다
  function leavesOf(index, sido2) {
    const all = (index && index.sigungu) || [], parents = new Set(all.map(s => String(s.parent || '')));
    return all.filter(s => !parents.has(String(s.code5)) && (!sido2 || String(s.sido2) === String(sido2)));
  }
  // 지도의 칸을 누르면 그 시군구(일반구면 상위 시 › 일반구)의 읍·면·동으로 곧장 간다
  function leafRoute(index, code) {
    const s = sgOf(index, code); if (!s) return null;
    const p = String(s.parent || '');
    return p.length === 5 ? { sido: String(s.sido2), sigungu: p, gu: String(s.code5) } : { sido: String(s.sido2), sigungu: String(s.code5) };
  }
  const STEP = { nation: '광역', sido: '기초', gu: '일반구', emd: '읍면동' };
  // 라우트 → 현재 단계. 세종처럼 기초가 없는 광역은 읍면동이 직속이다. 임의로 단계를 합치지 않는다
  function resolve(index, route) {
    const r = route || {}, out = { level: 'nation', step: STEP.nation, sido: null, sigungu: null, gu: null, emdCode: null, children: [], crumbs: [{ label: '전국', hash: '#map' }] };
    if (!index || !Array.isArray(index.sigungu)) return { ...out, level: 'empty', step: null };
    if (!r.sido) { out.children = index.sido || []; return out; }
    const sido = sidoOf(index, r.sido); if (!sido) return out;
    out.sido = sido; out.crumbs.push({ label: sido.name, hash: toHash({ sido: sido.code2 }) });
    const sgs = childrenOf(index, sido.code2);
    // 세종: 기초가 없어 읍면동이 광역 직속. 목록에 항목이 없거나 '세종시' 하나뿐이면 단계를 만들지 않는다
    if (!sgs.length || (sido.kind === '특별자치시' && sgs.length === 1)) { out.level = 'emd'; out.step = STEP.emd; out.emdCode = String(sgs.length ? sgs[0].code5 : sido.code5 || sido.code2 + '110'); out.dong = r.dong || null; out.sigungu = sgs[0] || null; return out; }
    if (!r.sigungu) { out.level = 'sido'; out.step = STEP.sido; out.children = sgs; return out; }
    const sg = sgOf(index, r.sigungu); if (!sg || !sgs.includes(sg)) { out.level = 'sido'; out.step = STEP.sido; out.children = sgs; return out; }
    out.sigungu = sg; out.crumbs.push({ label: sg.name, hash: toHash({ sido: sido.code2, sigungu: sg.code5 }) });
    const gus = childrenOf(index, sg.code5);
    if (gus.length) {
      const gu = r.gu ? sgOf(index, r.gu) : null;
      if (!gu || !gus.includes(gu)) { out.level = 'gu'; out.step = STEP.gu; out.children = gus; return out; }
      out.gu = gu; out.crumbs.push({ label: gu.name, hash: toHash({ sido: sido.code2, sigungu: sg.code5, gu: gu.code5 }) });
      out.emdCode = String(gu.code5);
    } else out.emdCode = String(sg.code5);
    out.level = 'emd'; out.step = STEP.emd; out.dong = r.dong || null;
    return out;
  }

  // ── 검색 ──
  // 시·도, 시군구(일반구 포함), 동(dong_index.json이 있을 때). 순서는 자료 순서 그대로(코드 순)
  function searchEntries(index, dongIndex) {
    if (!index || !Array.isArray(index.sigungu)) return [];
    const out = (index.sido || []).map(s => ({ label: s.name, route: { sido: String(s.code2) } }));
    for (const s of index.sigungu) {
      const sido = sidoOf(index, s.sido2), p = String(s.parent || ''), parent = p.length === 5 ? sgOf(index, p) : null;
      const route = p.length === 5 ? { sido: String(s.sido2), sigungu: p, gu: String(s.code5) } : { sido: String(s.sido2), sigungu: String(s.code5) };
      if (sido && sido.kind === '특별자치시' && childrenOf(index, sido.code2).length === 1) continue; // 세종시는 시·도 항목과 같다
      out.push({ label: [s.name, parent && parent.name, sido && sido.name].filter(Boolean).join(' · '), route });
    }
    for (const row of Array.isArray(dongIndex) ? dongIndex : []) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const [code7, name, code5, sgName, sidoName] = row, r = leafRoute(index, code5);
      if (!r || !/^\d{7,10}$/.test(String(code7)) || !String(code7).startsWith(String(code5))) continue;
      out.push({ label: [name, sgName, sidoName].filter(Boolean).join(' · '), route: { ...r, dong: String(code7) } });
    }
    return out;
  }
  function findEntry(entries, q) {
    const s = String(q || '').trim().replace(/\s+/g, ' ');
    if (!s) return null;
    const flat = x => x.replace(/\s|·/g, ''), f = flat(s);
    return entries.find(e => e.label === s) || entries.find(e => flat(e.label).startsWith(f)) || entries.find(e => flat(e.label).includes(f)) || null;
  }

  // ── 모델 ──
  // 시군구 색: index.json summary 값만 쓴다(행정동 값을 모아 계산하지 않는다)
  function summaryOf(sg, key) {
    const s = sg && sg.summary && sg.summary[key];
    return s && typeof s === 'object' ? { value: isNum(s.value) ? s.value : null, year: s.year ?? null, status: s.status || null } : { value: null, year: null, status: null };
  }
  // 한 지역의 지표 한 줄: 값과 기준선의 관계. 기준이 승인 대기면 넘었어도 '기준 승인 대기'로 둔다
  function rowOf(ind, value, extra) {
    const v = isNum(value) ? value : null, c = crossed(v, ind.standard);
    const status = ind.pending ? '수집 중' : v === null ? '자료 없음' : !ind.standard ? '공식 기준 없음' : isPending(ind.standard) ? '기준 승인 대기' : c ? '기준 넘음' : '기준 안';
    return { ind, value: v, crossed: c, status, ...extra };
  }
  // 기준 미달 항목 수: 확정(승인된 기준을 넘음) · 추가확인(넘었지만 기준 승인 대기) · 자료 없음. 묶음 지표(요건 충족 수)와 종합은 세지 않는다
  function tally(rows) {
    const r = rows.filter(x => !x.ind.composite && !x.ind.computed && (x.ind.standard || x.ind.pending));
    return { confirmed: r.filter(x => x.status === '기준 넘음').length, pending: r.filter(x => x.status === '기준 승인 대기' && x.crossed).length,
      nodata: r.filter(x => x.value === null).length, counted: r.filter(x => x.value !== null).length };
  }
  const sumValue = rows => { const t = tally(rows); return t.counted ? t.confirmed + t.pending : null; };
  const lawInds = inds => (inds || INDICATORS).filter(i => i.series && i.standard && !i.composite);
  function sigunguModel(sgs, ind, mode, inds) {
    const scale = scaleFor(ind, mode), key = keyOf(ind, mode);
    return (sgs || []).map(sg => {
      let s = summaryOf(sg, key);
      if (ind.computed) {
        const parts = lawInds(inds).map(i => ({ i, s: summaryOf(sg, i.code) })), ys = parts.map(p => p.s.year).filter(isNum);
        s = { value: sumValue(parts.map(p => rowOf(p.i, p.s.value))), year: ys.length ? Math.max(...ys) : null, status: null };
      }
      return { code: String(sg.code5), name: sg.name, kind: sg.kind || null, value: s.value, year: s.year, status: s.status, text: fmt(s.value, scale.unit) || '자료 없음', color: colorOf(s.value, scale), bbox: sg.bbox || null };
    });
  }
  const seriesOf = (dong, key) => (dong && dong.series && Array.isArray(dong.series[key]) ? dong.series[key].filter(p => Array.isArray(p) && isNum(p[0])).map(p => [p[0], isNum(p[1]) ? p[1] : null]).sort((a, b) => a[0] - b[0]) : []);
  function valueAt(series, year) { const p = series.find(x => x[0] === year); return p ? p[1] : null; }
  function latestYear(series) { const v = series.filter(p => p[1] !== null); return v.length ? v[v.length - 1][0] : null; }
  function yearsOf(emd) {
    const ys = new Set();
    ((emd && emd.dongs) || []).forEach(d => Object.values(d.series || {}).forEach(s => (Array.isArray(s) ? s : []).forEach(p => Array.isArray(p) && isNum(p[0]) && ys.add(p[0]))));
    const list = [...ys].sort((a, b) => a - b);
    return list.length ? { min: list[0], max: list[list.length - 1] } : null;
  }
  const codeOf = d => String(d.code7 ?? d.code);
  const livingMap = lv => new Map(((lv && Array.isArray(lv.dongs)) ? lv.dongs : []).map(d => [codeOf(d), d]));
  const livingCell = (ld, code) => ((ld && ld.cells) || []).find(c => c.indicator_code === code) || null;
  // 한 동의 모든 지표 줄(척도표). 순서는 지표 목록 순서 그대로 — 값으로 줄 세우지 않는다
  function dongRows(inds, dong, ld, year) {
    return (inds || INDICATORS).filter(i => !i.computed).map(ind => {
      if (ind.series) {
        const s = seriesOf(dong, ind.code), y = year ?? latestYear(s), d5 = seriesOf(dong, ind.code + '_DELTA5Y');
        return rowOf(ind, y === null ? null : valueAt(s, y), { year: y, series: s, delta: y === null ? null : valueAt(d5, y), cell: ((dong && dong.cells) || []).find(c => c.indicator_code === ind.code) || null });
      }
      const c = ind.pending ? null : livingCell(ld, ind.code), dc = ind.delta ? livingCell(ld, ind.code + '_DELTA5Y') : null;
      return rowOf(ind, c ? c.value : null, { year: c ? c.base_year ?? null : null, series: null, delta: dc && isNum(dc.value) ? dc.value : null, cell: c });
    });
  }
  function dongModel(emd, ind, mode, year, living, inds) {
    const scale = scaleFor(ind, mode), key = keyOf(ind, mode), dongs = (emd && Array.isArray(emd.dongs) ? emd.dongs : []), lm = livingMap(living);
    const unmatched = new Set(((emd && emd.unmatched) || []).map(u => String(u && typeof u === 'object' ? u.code : u)));
    return dongs.map(d => {
      const code = codeOf(d);
      let v = null, y = null;
      if (ind.computed) { y = year ?? latestYear(seriesOf(d, INDICATORS[0].code)); v = sumValue(dongRows(inds, d, lm.get(code), y)); }
      else if (ind.series) { const s = seriesOf(d, key); y = year ?? latestYear(s); v = y === null ? null : valueAt(s, y); }
      else if (!ind.pending) { const c = livingCell(lm.get(code), ind.code); v = c && isNum(c.value) ? c.value : null; y = c ? c.base_year ?? null : null; }
      return { code, name: d.name, kind: d.kind || null, value: v, year: y, text: fmt(v, scale.unit) || '자료 없음', color: colorOf(v, scale), unmatched: unmatched.has(code) };
    });
  }
  // 같은 범위에서 기준선을 넘은 곳의 개수(순위 아님). 종합은 1개 이상인 곳
  const crossedCount = (items, ind) => items.filter(it => (ind.composite && !ind.standard ? isNum(it.value) && it.value >= 1 : crossed(it.value, ind.standard) === true)).length;

  // ── 그림 ──
  // 시계열 스파크라인: 결측은 선을 끊는다(0으로 잇지 않는다). 현재 연도에 점
  function sparkline(series, year, label) {
    const W = 220, H = 56, pad = 6, vals = series.filter(p => p[1] !== null);
    if (!vals.length) return `<svg class="map-spark is-empty" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} 시계열 자료 없음"><text x="${W / 2}" y="${H / 2 + 5}" text-anchor="middle">자료 없음</text></svg>`;
    const ys = series.map(p => p[0]), y0 = Math.min(...ys), y1 = Math.max(...ys), lo = Math.min(...vals.map(p => p[1])), hi = Math.max(...vals.map(p => p[1])), span = hi - lo || 1;
    const X = y => pad + (y1 === y0 ? W / 2 - pad : (y - y0) / (y1 - y0) * (W - 2 * pad)), Y = v => H - pad - (v - lo) / span * (H - 2 * pad);
    let d = '', pen = false;
    series.forEach(p => { if (p[1] === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`; pen = true; });
    const cur = series.find(p => p[0] === year && p[1] !== null);
    const dot = cur ? `<circle class="map-spark-dot" cx="${X(cur[0]).toFixed(1)}" cy="${Y(cur[1]).toFixed(1)}" r="4"/>` : '';
    const gaps = series.filter(p => p[1] === null).map(p => `<line class="map-spark-gap" x1="${X(p[0]).toFixed(1)}" x2="${X(p[0]).toFixed(1)}" y1="${pad}" y2="${H - pad}"/>`).join('');
    return `<svg class="map-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} ${y0}~${y1}년 시계열, 최소 ${esc(fmt(lo))} 최대 ${esc(fmt(hi))}${cur ? `, ${year}년 ${esc(fmt(cur[1]))}` : ''}">${gaps}<path d="${d}"/>${dot}</svg>`;
  }
  // 같은 시군구 동들의 분포: 값 축 위의 점 띠. 줄 세우기(순위) 없이 선택 동만 강조한다
  function strip(items, selected, ind, scale) {
    const W = 220, H = 36, pad = 8, vals = items.filter(it => isNum(it.value));
    if (!vals.length) return `<svg class="map-strip is-empty" viewBox="0 0 ${W} ${H}" role="img" aria-label="분포 자료 없음"><text x="${W / 2}" y="${H / 2 + 5}" text-anchor="middle">자료 없음</text></svg>`;
    const dom = scale.edges === ind.edges && ind.domain ? ind.domain : scale.edges.length ? [scale.edges[0], scale.edges[scale.edges.length - 1]] : [0, 1];
    const lo = Math.min(dom[0], ...vals.map(v => v.value)), hi = Math.max(dom[1], ...vals.map(v => v.value)), span = hi - lo || 1;
    const X = v => pad + (v - lo) / span * (W - 2 * pad);
    const ticks = scale.edges.filter(e => e >= lo && e <= hi).map(e => `<line class="map-strip-tick" x1="${X(e).toFixed(1)}" x2="${X(e).toFixed(1)}" y1="4" y2="${H - 4}"/>`).join('');
    const dots = vals.map((it, i) => `<circle class="${it.code === selected ? 'is-sel' : ''}" cx="${X(it.value).toFixed(1)}" cy="${(H / 2 + ((i % 3) - 1) * 6).toFixed(1)}" r="${it.code === selected ? 6 : 4}" fill="${it.color}"><title>${esc(it.name)} ${esc(it.text)}</title></circle>`).join('');
    const sel = vals.find(it => it.code === selected);
    return `<svg class="map-strip" viewBox="0 0 ${W} ${H}" role="img" aria-label="같은 시군구 ${vals.length}개 동의 분포${sel ? `, 선택한 ${esc(sel.name)} ${esc(sel.text)}` : ''}. 순위가 아닙니다.">${ticks}${dots}</svg>`;
  }
  // 척도 막대: 지표마다 고정 축(다른 동과 견주어 늘이지 않는다), 기준값 자리에 눈금
  function barDomain(ind) {
    if (ind.domain) return ind.domain;
    const e = ind.edges || [], s = validStd(ind.standard) ? ind.standard.value : null, xs = [...e, ...(s === null ? [] : [s])];
    const hi = xs.length ? Math.max(...xs) * 1.25 : 1, lo = Math.min(0, ...xs);
    return [lo, hi > lo ? hi : lo + 1];
  }
  function barSVG(row) {
    const ind = row.ind, W = 240, H = 18, [lo, hi] = barDomain(ind), X = v => (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * W;
    const sv = validStd(ind.standard) ? ind.standard.value : null;
    const base = X(Math.min(hi, Math.max(lo, 0))), fill = row.value === null ? '' : (() => { const x = X(row.value); return `<rect class="sr-fill" x="${Math.min(base, x).toFixed(1)}" y="4" width="${Math.max(2, Math.abs(x - base)).toFixed(1)}" height="10" rx="3" fill="${colorOf(row.value, scaleFor(ind, 'now'))}"/>`; })();
    const tick = sv === null ? '' : `<line class="sr-tick" x1="${X(sv).toFixed(1)}" x2="${X(sv).toFixed(1)}" y1="0" y2="${H}"/>`;
    const label = `${ind.label} ${row.value === null ? '자료 없음' : fmt(row.value, ind.unit)}${sv === null ? ', 공식 기준 없음' : `, 기준 ${pm(sv)}${ind.unit}`}`;
    return `<svg class="sr-bar${row.value === null ? ' is-empty' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><rect class="sr-track" x="0" y="4" width="${W}" height="10" rx="3"/>${fill}${tick}</svg>`;
  }
  const ROW_CLASS = { '기준 넘음': 'over', '기준 안': 'in', '자료 없음': 'none', '기준 승인 대기': 'wait', '공식 기준 없음': 'nostd', '수집 중': 'soon' };
  // 세부항목별 척도표. detail(cell) → [[라벨, 값, 링크]] (dashboard.js detailRows). 그룹·항목 순서 고정
  function scaleTableHTML(rows, opt) {
    const o = opt || {}, t = tally(rows), detail = o.detail || (() => []);
    const dl = cell => `<dl>${detail(cell).map(([k, val, href]) => `<div><dt>${esc(k)}</dt><dd>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(val)}</a>` : esc(val)}</dd></div>`).join('')}</dl>`;
    const led = rows.find(r => r.ind.living && r.ind.group === 'sum' && r.value !== null), confirmed = led ? led.value : t.confirmed;
    const waiting = rows.filter(r => isPending(r.ind.standard)).map(r => r.ind.label);
    const head = `<div class="sr-tally" role="group" aria-label="기준 미달 항목 수"><p class="sr-tally-k">기준 미달 항목 수</p>` +
      `<p class="sr-tally-n"><span>확정 <b data-ck="t-c" data-count="${confirmed}">${confirmed}</b></span><span>추가확인 <b data-ck="t-p" data-count="${t.pending}">${t.pending}</b></span><span class="is-dim">자료 없음 ${t.nodata}</span></p>` +
      `<p class="sr-tally-note">${led ? `확정은 원장 셀 '${esc(led.ind.label)}' 값이며 하한입니다.<br>쇠퇴 요건은 법정 요건 단위(인구 요건 = 30년 감소 또는 3년 연속 감소)로 셉니다.` : '확정은 법정·공식 기준선을 넘은 항목 수입니다.'}` +
      `<br>추가확인은 기준선을 넘었지만 그 기준이 아직 승인 대기인 항목입니다${waiting.length ? `(${esc(waiting.join('·'))}). 확정 수에는 넣지 않습니다` : ''}.<br>가중치·순위 없이 개수만 셉니다.</p>` +
      (led && led.cell && detail(led.cell).length ? `<details class="map-detail"><summary>이 수의 출처·계산식</summary>${dl(led.cell)}</details>` : '') + `</div>`;
    const list = rows.filter(r => r.ind.group !== 'sum');
    const groups = GROUPS.filter(([g]) => list.some(r => r.ind.group === g)).map(([g, gl]) => `<li class="sr-group"><h4>${esc(gl)}</h4><ul>${list.filter(r => r.ind.group === g).map(r => {
      const ind = r.ind, tt = trendText(r.delta, ind), cls = ROW_CLASS[r.status];
      const stdText = ind.pending ? '자료를 모으는 중입니다. 숫자를 만들지 않습니다.' : ind.standard ? `기준 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · ${ind.standard.status}${r.crossed ? ' · 기준선 넘은 쪽' : r.crossed === false ? ' · 기준선 안쪽' : ''}` : ''}` : ind.ref ? '공식 기준 없음 · 참고 구간' : '공식 기준 없음';
      const rowsD = r.cell ? detail(r.cell) : [];
      return `<li class="sr is-${cls}${ind.code === o.cur ? ' is-cur' : ''}"><div class="sr-h">${icon(ind.icon)}<span class="sr-l">${esc(ind.label)}</span><b class="sr-v">${esc(fmt(r.value, ind.unit) || '–')}</b><span class="sr-st st-${cls}">${esc(r.status)}</span></div>` +
        `<div class="sr-m">${barSVG(r)}${tt ? `<em class="map-trend ${tt.cls}">${tt.arrow} 5년 ${esc(fmt(r.delta, ind.dEdges ? '' : '%p'))}</em>` : ''}</div>` +
        `<p class="sr-std">${esc(stdText)}</p>` +
        (r.series && r.series.some(p => p[1] !== null) ? sparkline(r.series, r.year, ind.label) : '') +
        (rowsD.length ? `<details class="map-detail"><summary>출처·기준연도${r.year ? ` (${esc(r.year)}년)` : ''}</summary>${dl(r.cell)}</details>` : '') + `</li>`;
    }).join('')}</ul></li>`).join('');
    return head + `<ol class="sr-list">${groups}</ol>`;
  }
  function tooltipHTML(it, ind, mode, year, source) {
    const t = mode === 'trend' ? trendText(it.value, ind) : null;
    return `<b>${esc(it.name)}</b>${it.kind ? ` <small>${esc(it.kind)}</small>` : ''}<br>${esc(ind.label)}${mode === 'trend' ? ' 5년 변화' : ''} ${esc(it.text)}${t ? ` ${t.arrow} ${t.word}` : ''}<br>${it.year ? `${esc(it.year)}년 · ` : ''}${esc(source || SOURCE_DEFAULT)}`;
  }
  function legendHTML(ind, mode, source, year, avail) {
    const s = scaleFor(ind, mode), off = avail === false || ind.pending;
    const stdLine = off ? '수집 중 · 자료가 오기 전에는 숫자를 만들지 않습니다'
      : ind.standard ? `기준선 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · 기준 ${ind.standard.status}` : ''}`
        : ind.composite ? '자료 없는 항목·승인 대기 기준은 세지 않음(하한)' : ind.ref ? '공식 기준 없음 · 참고 구간' : '공식 기준 없음 · 값 있는 곳만 한 색';
    return `<div class="map-legend"><p class="map-legend-title">${esc(off ? ind.label : s.title)}</p><ul aria-label="지도 색 구간">${legendItems(ind, off ? 'now' : mode).filter(l => !off || l.hatch).map((l, i) =>
      `<li style="--i:${i}"><i class="${l.hatch ? 'is-hatch' : ''}" style="background:${l.color}"></i>${esc(off ? '수집 중' : l.label)}</li>`).join('')}</ul>` +
      `<p class="map-legend-std${off || isPending(ind.standard) || !ind.standard ? ' is-flag' : ''}">${esc(stdLine)}</p>` +
      `<p class="map-legend-note">판정 아님 · 출처 ${esc(source || SOURCE_DEFAULT)} · 기준연도 ${esc(year ?? '자료 없음')}</p></div>`;
  }
  const liveText = (v, it, ind, mode) => `${v.crumbs.map(c => c.label).join(' › ')}${it ? ` › ${it.name}. ${ind.label}${mode === 'trend' ? ' 5년 변화' : ''} ${it.text}${it.year ? `, ${it.year}년` : ''}.` : `. ${v.step ? v.step + ' 단계' : ''}`}`;
  const ICONS = {
    bldg: 'M3 14V4l5-2v12M8 6h5v8M1 14h14M5 6v1M5 9v1M10 9v1M10 11v1', check: 'M2 8l4 4 8-8',
    popdown: 'M5 3a2 2 0 1 0 .1 0M2 14v-2a3 3 0 0 1 6 0v2M12 4v8m-2.5-2.5L12 12l2.5-2.5', people: 'M6 3a2 2 0 1 0 .1 0M11 4.5a1.6 1.6 0 1 0 .1 0M2 14v-1.5a4 4 0 0 1 8 0V14M10 10.5a3 3 0 0 1 4.5 2.5V14',
    elder: 'M7 2a1.5 1.5 0 1 0 .1 0M7 6v4l-2 4M7 10l2 4M5 7.5l4 1M12 8v6', youth: 'M8 2a1.5 1.5 0 1 0 .1 0M8 6v4l-2 4M8 10l2 4M4 6l4 1 4-1',
    shop: 'M2 6l1.5-3h9L14 6M2 6h12M3 6v8h10V6M6.5 14v-4h3v4', hosp: 'M2 3h12v11H2zM8 6v5M5.5 8.5h5',
    book: 'M2 3.5c2-1 4-1 6 .5 2-1.5 4-1.5 6-.5V13c-2-1-4-1-6 .5-2-1.5-4-1.5-6-.5zM8 4v9.5', tree: 'M8 2l4.5 7h-3l3 4h-9l3-4h-3zM8 13v2',
    bus: 'M3 2h10v10H3zM3 8h10M5 12v2M11 12v2', amb: 'M1 5h9v7H1zM10 7h3l2 3v2h-5M5.5 6.5v4M3.5 8.5h4', sum: 'M12 3H4l4 5-4 5h8', dot: 'M8 5a3 3 0 1 0 .1 0',
  };
  const icon = k => `<svg class="map-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${ICONS[k] || ICONS.dot}"/></svg>`;

  const api = { INDICATORS, GROUPS, MODES, NULL_COLOR, BELOW, ABOVE, SOURCE_DEFAULT, SUM, LIVING_EXPECTED, indOf, keyOf, binIndex, edgeLabels, scaleFor, colorOf, legendItems, trendText, crossed, isPending,
    livingIndicators, allIndicators, isAvailable, parseHash, toHash, childrenOf, leavesOf, leafRoute, resolve, searchEntries, findEntry, summaryOf, rowOf, tally, sigunguModel, seriesOf, valueAt,
    latestYear, yearsOf, dongRows, dongModel, crossedCount, sparkline, strip, barSVG, scaleTableHTML, tooltipHTML, legendHTML, liveText, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewMap = api;

  // ── 브라우저 ──
  const app = document.getElementById('mapApp'); if (!app) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, coarse = matchMedia('(pointer: coarse)').matches, wide = matchMedia('(min-width: 900px)');
  const fetchJson = url => (window.renewFetch ? window.renewFetch(url) : fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const state = { route: parseHash(location.hash) || {}, ind: INDICATORS[0].code, mode: 'now', year: null, playing: false, index: undefined, living: undefined, dongIndex: undefined, sgGeo: undefined, sidoGeo: undefined, dash: null, mapErr: false, touched: false };
  const inds = () => allIndicators(state.living);
  const curInd = () => indOf(state.ind, inds());
  const effMode = ind => (ind.series ? state.mode : 'now');
  const avail = ind => { const v = state.index && resolve(state.index, state.route), e = v && v.level === 'emd' ? emdOf(v.emdCode) : null; return isAvailable(ind, state.index, state.living, e && e.json); };
  // 시군구별 지연 로드, 한 번만. 아직이면 undefined를 주고, 도착하면 한 번만 다시 그린다
  const cache = new Map();
  function lazy(key, load) {
    let p = cache.get(key);
    if (!p) { p = load().then(x => { p.done = x; return x; }); p.done = undefined; cache.set(key, p); }
    if (p.done === undefined && !p.hooked) { p.hooked = true; p.then(() => render()); }
    return p.done;
  }
  const emdOf = code5 => lazy('emd:' + code5, () => Promise.all([fetchJson(`data/national/emd/${code5}.geojson`), fetchJson(`data/national/emd/${code5}.json`)])
    .then(([geo, json]) => { if (!geo && json && Array.isArray(json.features)) geo = json; return { geo: geo && Array.isArray(geo.features) ? geo : null, json: json && Array.isArray(json.dongs) ? json : null }; }));
  // 생활 지표 파일: living/index.json이 없으면 시군구 파일도 찾지 않는다(null = 없음)
  const livingOf = code5 => (state.living ? lazy('living:' + code5, () => fetchJson(`data/national/living/${code5}.json`).then(j => (j && Array.isArray(j.dongs) ? j : null))) : null);
  let timer = null, auto = null, lastLegend = '', lastDong = null;
  const shown = new Map();

  app.innerHTML = `<div class="map-top" data-top></div><div class="map-stage" data-stage><div class="map-canvas is-wait" data-map-slot>전국 자료를 불러오는 중입니다.</div>` +
    `<aside class="map-panel" data-panel hidden aria-label="선택한 지역의 세부항목 척도표"></aside></div><div class="map-bottom" data-bottom></div>`;
  const $ = s => app.querySelector(s), top = $('[data-top]'), stage = $('[data-stage]'), panel = $('[data-panel]'), bottom = $('[data-bottom]');
  const heroLive = document.getElementById('heroLive'), heroCount = document.querySelector('[data-emd-count]');

  function emptyHTML(title, lines, mascot) {
    return `<div class="map-empty" role="status">${mascot ? '<img src="mascot/taggy-waiting.svg" width="120" height="148" alt="" aria-hidden="true">' : ''}<h3>${esc(title)}</h3>${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  }
  const seg = (key, list, cur, label) => `<div class="dash-seg map-seg" role="group" aria-label="${label}">${list.map(([val, txt]) => `<button type="button" data-${key}="${val}" aria-pressed="${cur === val}">${txt}</button>`).join('')}</div>`;
  const selectHTML = (key, label, list, cur, topOpt) => `<label class="map-select">${label}<select data-${key}>${topOpt ? `<option value="">${topOpt}</option>` : ''}${list.map(o => `<option value="${esc(o.code)}" ${String(o.code) === String(cur) ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`;

  // 현재 단계에서 지도에 색을 칠할 항목(시군구 summary 또는 행정동)과 연도 범위
  function model(v) {
    const ind = curInd(), mode = effMode(ind), list = inds();
    if (v.level === 'emd') {
      const e = emdOf(v.emdCode);
      if (e === undefined) return { kind: 'wait' };
      if (!e.json && !e.geo) return { kind: 'noemd' };
      const lv = livingOf(v.emdCode) || null, json = e.json || { dongs: [] }, years = yearsOf(json);
      const year = state.year !== null && years && state.year >= years.min && state.year <= years.max ? state.year : null;
      const items = dongModel(json, ind, mode, year, lv, list);
      // selYear: 사용자가 고른 연도(없으면 null → 쇠퇴 지표는 동마다 최신 연도). 생활 지표의 기준연도를 쇠퇴 시계열에 쓰지 않는다
      return { kind: 'emd', items, years, selYear: year, year: year ?? (items.find(i => i.year)?.year ?? null), geo: e.geo, json, living: lv, nodata: !e.json };
    }
    const sgs = v.level === 'nation' ? leavesOf(state.index) : v.level === 'sido' ? leavesOf(state.index, v.sido.code2) : v.children;
    const items = sigunguModel(sgs, ind, mode, list);
    return { kind: 'sg', items, year: items.find(i => i.year)?.year ?? null };
  }
  function indCtlHTML(ind) {
    const list = inds(), g = ind.group;
    const tabs = `<div class="map-groups" role="group" aria-label="지표 묶음">${GROUPS.map(([k, l]) => `<button type="button" data-group="${k}" aria-pressed="${k === g}">${esc(l)}</button>`).join('')}</div>`;
    const chips = `<div class="dash-chips map-inds" role="group" aria-label="${esc(GROUPS.find(x => x[0] === g)[1])} 지표">${list.filter(i => i.group === g).map(i => { const ok = avail(i);
      return `<button type="button" class="dash-chip${ok ? '' : ' is-planned'}" data-ind="${esc(i.code)}" aria-pressed="${i.code === ind.code}">${icon(i.icon)}${esc(i.label)}${ok ? '' : '<small>수집 중</small>'}</button>`; }).join('')}</div>`;
    return tabs + chips;
  }
  function panelHTML(v, m) {
    const ind = curInd(), mode = effMode(ind), scale = scaleFor(ind, mode), here = v.crumbs[v.crumbs.length - 1].label;
    if (m.kind === 'wait') return `<div class="map-panel-wait">읍·면·동 자료를 불러오는 중입니다.</div>`;
    if (m.kind === 'noemd' || m.nodata) return emptyHTML(`${here} · 읍·면·동 자료 준비 중`, [m.kind === 'noemd' ? '이 지역의 읍·면·동 자료가 아직 없습니다.' : '경계는 있지만 지표 시계열이 아직 없습니다.', '준비되기 전에는 숫자를 보여 드리지 않습니다.']);
    const it = m.items.find(x => x.code === v.dong), dist = `<h4 class="map-h4">${esc(here)} 읍·면·동 분포 · ${esc(ind.label)} <small>순위 아님${m.year ? ` · ${esc(m.year)}년` : ''}</small></h4>${strip(m.items, it ? it.code : null, ind, scale)}`;
    if (!it) return `<h3 class="map-h3">${esc(here)} <small>${m.items.length}개 읍·면·동</small></h3><p class="map-guide">지도에서 동을 누르면 세부항목별 척도표가 열립니다.<br>항목마다 값, 기준선, 출처가 함께 보입니다.</p>${dist}${hubHTML(v)}`;
    const dong = m.json.dongs.find(d => codeOf(d) === it.code), ld = livingMap(m.living).get(it.code);
    const rows = dongRows(inds(), dong, ld, m.selYear), D = window.RenewDashboard, dy = rows.find(r => r.ind.series && r.year)?.year;
    return `<div class="map-panel-head"><h3 class="map-h3">${esc(it.name)} <small>${esc(it.kind || '행정동')} · ${esc(it.code)}</small></h3><button type="button" class="map-close" data-close aria-label="척도표 닫기">닫기</button></div>` +
      `<p class="map-note">${esc(v.crumbs.map(c => c.label).join(' › '))} · 쇠퇴 지표 ${dy ? `${esc(dy)}년` : '최신 연도'}, 생활 지표는 항목별 기준연도</p>` +
      scaleTableHTML(rows, { cur: ind.code, detail: D ? D.detailRows : null }) + dist + hubHTML(v);
  }
  // 건축HUB 3기준(dashboard.json, 법정동)은 수집된 시군구에서만 별도 섹션으로. 행정동 값과 합치지 않는다
  function hubHTML(v) {
    const D = window.RenewDashboard, dash = state.dash;
    if (!D || !dash || !v.emdCode) return '';
    const node = v.gu || v.sigungu, mois = node ? String(node.mois_code5 || node.code5) : v.emdCode; // dashboard.json은 행안부 코드
    const sg = (dash.sigungu || []).find(s => String(s.code) === mois && s.status === '수집됨'); if (!sg) return '';
    const dongs = (dash.dongs || []).filter(d => d.sigungu_code === sg.code).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    return `<h4 class="map-h4">정밀 사례 · 건축물대장 3기준 <small>법정동 · 건축HUB</small></h4><p class="map-note">이 구는 건축물대장을 동수·연면적·세대 기준으로 따로 모았습니다.<br>법정동은 행정동과 경계가 달라 따로 보여 줍니다.</p>` +
      `<ul class="map-hub">${dongs.map(d => { const c = D.cellView(D.cellOf(d, 20, 'COUNT')); return `<li><a href="#dashboard/${esc(sg.code)}/${esc(d.code)}">${esc(d.name)}</a><span>20년 동수 ${esc(c.text)}</span></li>`; }).join('')}</ul>` +
      `<p><a class="map-hub-more" href="#dashboard/${esc(sg.code)}">정밀 사례 전체 보기</a></p>`;
  }
  // 첫 화면 왼쪽 문구: 지금 보이는 범위에서 기준선을 넘은 곳의 개수(순위 아님)
  function heroLiveHTML(v, m, ind) {
    if (!heroLive) return;
    const scope = v.level === 'nation' ? '전국' : v.crumbs[v.crumbs.length - 1].label, unitWord = m.kind === 'emd' ? '읍·면·동' : '시·군·구';
    if (m.kind !== 'emd' && m.kind !== 'sg') return;
    const total = m.items.length, has = m.items.filter(i => isNum(i.value)).length;
    let body;
    if (!avail(ind)) body = `<span class="hl-t">${esc(ind.label)}은(는) 자료를 모으는 중입니다.<br>자료가 오기 전에는 지도를 회색으로 둡니다.</span>`;
    else if (!has) body = `<span class="hl-t">${esc(ind.label)}은(는) 읍·면·동 자료만 있습니다.<br>지도에서 시·군·구를 누르면 색이 보입니다.</span>`;
    else if (!ind.standard && !ind.composite) body = `<span class="hl-t">공식 기준이 없는 지표입니다.<br>색은 고정 참고 구간입니다.</span>`;
    else body = `<span class="hl-n"><b data-ck="hl-${esc(ind.code)}-${esc(scope)}" data-count="${crossedCount(m.items, ind)}">0</b>곳 <small>/ ${esc(scope)} ${nf(0).format(total)}개 ${unitWord}</small></span>` +
      `<span class="hl-t">${!ind.standard ? '기준선을 넘은 항목이 하나라도 있는 곳' : `${esc(ind.standard.text)} — 기준선을 넘은 곳`}${m.year ? ` · ${esc(m.year)}년` : ''}${isPending(ind.standard) ? ` · 기준 ${esc(ind.standard.status)}` : ''}</span>`;
    heroLive.innerHTML = `<span class="hl-k">${icon(ind.icon)}${esc(ind.label)}</span>${body}${auto ? '<span class="hl-auto">지표가 자동으로 바뀝니다 · 지도를 만지면 멈춥니다</span>' : ''}`;
    heroLive.querySelectorAll('[data-count]').forEach(countUp);
  }
  function render() {
    if (state.index === undefined) return;
    const v = resolve(state.index, state.route);
    if (v.level === 'empty') { top.innerHTML = bottom.innerHTML = ''; panel.hidden = true; stage.innerHTML = emptyHTML('전국 데이터 준비 중', ['원장에서 내보낸 숫자만 이 자리에 보여 드립니다.', '준비되면 전국에서 읍·면·동까지 내려가 볼 수 있습니다.'], true); return; }
    const ind = curInd(), mode = effMode(ind), m = model(v), src = state.index.source && state.index.source.name, ok = avail(ind);
    const it = m.kind === 'emd' && v.dong ? m.items.find(x => x.code === v.dong) : null;
    const crumbs = `<nav class="map-crumbs" aria-label="현재 위치"><ol>${v.crumbs.map((c, i) => i === v.crumbs.length - 1 && !it ? `<li aria-current="page">${esc(c.label)}</li>` : `<li><a href="${esc(c.hash)}">${esc(c.label)}</a></li>`).join('')}${it ? `<li aria-current="page">${esc(it.name)}</li>` : ''}</ol><span class="map-step">${esc(v.step)} 단계</span></nav>`;
    const yearCtl = m.kind === 'emd' && m.years && (ind.series || ind.computed) ? `<div class="map-year"><button type="button" class="map-play" data-play aria-pressed="${state.playing}" aria-label="${state.playing ? '재생 멈춤' : `${m.years.min}년부터 ${m.years.max}년까지 재생`}">${state.playing ? '❚❚' : '▶'}</button><label>연도 <b>${esc(m.year ?? '')}</b><input type="range" data-year min="${m.years.min}" max="${m.years.max}" step="1" value="${m.year ?? m.years.max}"></label></div>` : '';
    top.innerHTML = crumbs + indCtlHTML(ind) + `<div class="map-ctl">${ind.series ? seg('mode', MODES, state.mode, '현재 또는 5년 변화') : ''}${yearCtl}</div>`;
    const lkey = ind.code + mode, legend = legendHTML(ind, mode, src, m.year, ok).replace('class="map-legend"', `class="map-legend${lkey !== lastLegend && !reduced ? ' is-new' : ''}"`); lastLegend = lkey;
    const opts = (list, key) => list.map(x => ({ code: x[key], name: x.name }));
    const kids = v.sido ? childrenOf(state.index, v.sido.code2) : [];
    const sidoSel = selectHTML('sido', '시·도', opts(state.index.sido || [], 'code2'), v.sido && v.sido.code2, '전국');
    const sgSel = kids.length && !(v.sido.kind === '특별자치시' && kids.length === 1) ? selectHTML('sg', '시·군·구', opts(kids, 'code5'), v.sigungu && v.sigungu.code5, '고르기') : '';
    const guSel = v.sigungu && childrenOf(state.index, v.sigungu.code5).length ? selectHTML('gu', '일반구·행정시', opts(childrenOf(state.index, v.sigungu.code5), 'code5'), v.gu && v.gu.code5, '고르기') : '';
    const chips = m.kind === 'emd' ? `<div class="dash-chips dash-dongs map-list" role="group" aria-label="읍·면·동">${m.items.map(x => `<button type="button" class="dash-chip" data-dong="${esc(x.code)}" aria-pressed="${x.code === v.dong}">${esc(x.name)}</button>`).join('')}</div>` : '';
    bottom.innerHTML = legend + `<p class="map-hint">${coarse ? '두 손가락으로 지도를 움직이고 확대합니다.' : '끌어서 움직이고, + − 버튼으로 확대합니다.'} 지도의 칸을 누르면 바로 아래 단계로 내려갑니다.<br>지도 대신 아래 목록으로도 고를 수 있습니다.</p>` +
      `<div class="map-selects">${sidoSel}${sgSel}${guSel}</div>${chips}<p class="map-live" aria-live="polite">${esc(liveText(v, it, ind, mode))}</p>`;
    const inEmd = v.level === 'emd';
    panel.hidden = !inEmd;
    if (inEmd) {
      panel.innerHTML = panelHTML(v, m);
      panel.classList.toggle('is-sheet', !!it && !wide.matches);
      panel.classList.toggle('is-new', !!it && it.code !== lastDong && !reduced);
      document.body.classList.toggle('sheet-open', !!it && !wide.matches);
    } else document.body.classList.remove('sheet-open');
    lastDong = it ? it.code : null;
    if (state.mapErr) { const s = stage.querySelector('[data-map-slot]'); if (s) s.outerHTML = emptyHTML('지도를 불러오지 못했습니다', ['네트워크를 확인한 뒤 다시 열어 주세요.', '아래 목록으로는 계속 고를 수 있습니다.']); }
    else drawMap(v, m);
    heroLiveHTML(v, m, ind);
    app.querySelectorAll('[data-count]').forEach(countUp);
  }
  // 이전에 보인 값에서 새 값으로 센다(같은 값이면 그대로). 재생 중 매번 0부터 다시 세지 않는다
  function countUp(el) {
    const target = +el.dataset.count, k = el.dataset.ck || '', from = shown.has(k) ? shown.get(k) : 0, d = digitsOf(target), f = nf(d);
    shown.set(k, target);
    // 백그라운드 탭에서는 rAF가 멈춰 0이 남는다 — 최종값을 먼저 쓰고, 보일 때만 애니메이션
    el.textContent = f.format(target);
    if (reduced || from === target || document.hidden) return;
    const t0 = performance.now(), dur = 800;
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); el.textContent = f.format(from + (target - from) * e); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // Leaflet 지도는 한 번 만들어 무대(stage)에 두고, render()는 색·선택만 바꾼다
  let M = null;
  function drawMap(v, m) {
    const slot = stage.querySelector('[data-map-slot]');
    const wait = msg => { if (slot) { slot.className = 'map-canvas is-wait'; slot.textContent = msg; } };
    if (!M) {
      if (state.sgGeo === undefined) { wait('경계를 불러오는 중입니다.'); return; }
      if (!state.sgGeo) { if (slot) slot.outerHTML = emptyHTML('경계 자료 준비 중', ['시군구 경계가 아직 없습니다.', '아래 목록으로 숫자는 볼 수 있습니다.']); return; }
      const D = window.RenewDashboard;
      if (!window.L) { wait('지도를 불러오는 중입니다.'); (D ? D.loadLeaflet() : Promise.reject()).then(render, () => { state.mapErr = true; render(); }); return; }
      const L = window.L, el = document.createElement('div'); el.className = 'map-canvas'; el.setAttribute('role', 'region');
      el.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="rmHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#d4dbd8"/><line x1="0" y1="0" x2="0" y2="6" stroke="#6b7a75" stroke-width="2"/></pattern></defs></svg>');
      slot.replaceWith(el);
      const map = L.map(el, { dragging: !coarse, scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: false });
      L.control.attribution({ position: 'bottomleft' }).addTo(map); // 오른쪽은 척도표 서랍이 덮으므로 저작권 표시는 왼쪽 아래
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      const src = () => state.index.source && state.index.source.name;
      const sg = L.geoJSON(state.sgGeo, { style: { weight: 1, color: '#fff' }, onEachFeature: (f, layer) => {
        layer.bindTooltip(() => { const it = M.sgItems.get(String(f.properties.code)); return it ? tooltipHTML(it, curInd(), effMode(curInd()), null, src()) : `<b>${esc(f.properties.name)}</b>`; }, { sticky: true });
        layer.on('click', () => { const r = leafRoute(state.index, String(f.properties.code)); if (r) go(r); });
      } }).addTo(map);
      const sido = state.sidoGeo ? L.geoJSON(state.sidoGeo, { interactive: false, style: { color: '#153c39', weight: 1.5, fill: false } }).addTo(map) : null;
      M = { el, map, sg, sido, emd: null, emdCode: null, sgItems: new Map(), emdItems: new Map(), fitKey: null, src, ready: false };
      setTimeout(startAuto, 1500);
    }
    const L = window.L, ind = curInd(), mode = effMode(ind);
    M.el.setAttribute('aria-label', `${v.crumbs.map(c => c.label).join(' › ')} ${ind.label} 지도. 아래 목록으로도 고를 수 있습니다.`);
    // 시군구 레이어: 현재 단계의 항목만 색, 나머지는 옅게
    M.sgItems = new Map((m.kind === 'sg' ? m.items : []).map(it => [it.code, it]));
    const active = new Set(M.sgItems.keys()), inEmd = v.level === 'emd';
    // 앞으로 올리기(bringToFront)는 DOM에서 path를 다시 붙인다. 누르는 도중에 하면 click이 사라지므로 칸 구성이 바뀔 때만 한다
    const order = [...active].join() + '|' + v.emdCode + '|' + v.dong, reorder = M.order !== order; M.order = order;
    M.sg.eachLayer(l => { const code = String((l.feature.properties || {}).code), it = M.sgItems.get(code), on = active.has(code);
      l.setStyle(on ? { fillColor: it.value === null ? 'url(#rmHatch)' : it.color, fillOpacity: 0.82, color: '#fff', weight: 0.8, dashArray: it.value === null ? '4 3' : null }
        : { fillColor: '#c9d3cf', fillOpacity: inEmd ? 0.08 : 0.15, color: '#fff', weight: 0.5, dashArray: null });
      if (on && reorder) l.bringToFront(); });
    if (M.sido && reorder) M.sido.bringToFront();
    // 행정동 레이어: 시군구가 바뀔 때만 다시 만들고, 연도·지표는 setStyle로만 바꾼다(CSS transition)
    if (m.kind === 'emd' && m.geo) {
      if (!M.emd || M.emdCode !== v.emdCode) {
        if (M.emd) M.emd.remove();
        M.emd = L.geoJSON(m.geo, { style: { weight: 1.5, color: '#fff' }, onEachFeature: (f, layer) => {
          layer.bindTooltip(() => { const it = M.emdItems.get(String((f.properties || {}).code)); return it ? tooltipHTML(it, curInd(), effMode(curInd()), it.year, M.src()) : `<b>${esc((f.properties || {}).name)}</b><br>지표와 코드가 맞지 않는 동`; }, { sticky: true });
          layer.on('click', () => { const code = String((f.properties || {}).code); if (M.emdItems.has(code)) go({ ...state.route, dong: code }); });
        } }).addTo(M.map);
        M.emdCode = v.emdCode;
      }
      M.emdItems = new Map(m.items.map(it => [it.code, it]));
      M.emd.eachLayer(l => { const code = String((l.feature.properties || {}).code), it = M.emdItems.get(code), sel = code === v.dong;
        l.setStyle({ fillColor: !it || it.value === null ? 'url(#rmHatch)' : it.color, fillOpacity: 0.85, color: sel ? '#153c39' : '#fff', weight: sel ? 3.5 : 1.5, dashArray: !it || it.value === null ? '4 3' : null });
        if (sel && reorder) l.bringToFront(); });
    } else if (M.emd && !inEmd) { M.emd.remove(); M.emd = null; M.emdCode = null; }
    // 단계가 바뀔 때만 화면을 옮긴다(연도 재생·지표 자동 전환 중에는 움직이지 않는다)
    const key = v.level + ':' + m.kind + ':' + (v.emdCode || (v.sigungu && v.sigungu.code5) || (v.sido && v.sido.code2) || '');
    if (M.fitKey !== key && m.kind !== 'wait') {
      M.fitKey = key;
      let b = null;
      if (m.kind === 'emd' && M.emd) b = M.emd.getBounds();
      else { const fg = L.featureGroup(); M.sg.eachLayer(l => { if (active.has(String((l.feature.properties || {}).code))) fg.addLayer(l); }); b = fg.getLayers().length ? fg.getBounds() : M.sg.getBounds(); }
      const right = inEmd && wide.matches && !panel.hidden ? panel.offsetWidth + 28 : 12;
      const opt = { paddingTopLeft: [12, 12], paddingBottomRight: [right, 12], maxZoom: 14 };
      if (b && b.isValid()) { if (reduced || !M.ready) M.map.fitBounds(b, opt); else M.map.flyToBounds(b, { ...opt, duration: 0.9 }); M.ready = true; } // 첫 맞춤은 시점이 없어 flyTo를 못 쓴다
    }
  }
  function go(route, focusSel) {
    stopPlay(); stopAuto(true);
    state.route = route;
    const v = resolve(state.index, route);
    if (v.level !== 'empty') history.replaceState(null, '', toHash({ sido: v.sido && v.sido.code2, sigungu: v.sigungu && v.sigungu.code5, gu: v.gu && v.gu.code5, dong: v.level === 'emd' ? route.dong : null }));
    render();
    const f = focusSel && app.querySelector(focusSel); if (f) f.focus({ preventScroll: true });
  }
  function stopPlay() { clearInterval(timer); timer = null; state.playing = false; }
  function play() {
    const v = resolve(state.index, state.route), m = model(v);
    if (m.kind !== 'emd' || !m.years) return;
    if (state.playing) { stopPlay(); render(); return; }
    state.playing = true; state.year = m.year >= m.years.max ? m.years.min : m.year;
    render();
    timer = setInterval(() => { if (state.year >= m.years.max) { stopPlay(); render(); return; } state.year += 1; render(); }, reduced ? 1000 : 320);
  }
  // 첫 화면 자동 재생: 전국 단계에서 기준이 있는 지표를 차례로 보여 준다. 사용자가 만지면 멈추고 다시 켜지 않는다
  let visible = true;
  function autoList() { return inds().filter(i => (i.computed || (i.series && hasSummary(i, state.index))) && avail(i)); } // 전국 단계에 색이 있는 지표만
  function startAuto() {
    if (auto || reduced || state.touched || !visible || document.hidden || !M) return;
    if (resolve(state.index, state.route).level !== 'nation') return;
    auto = setInterval(() => {
      const list = autoList(), i = list.findIndex(x => x.code === state.ind);
      state.ind = list[(i + 1) % list.length].code; render();
    }, 3600);
    render();
  }
  // 멈출 때 다시 그리지 않는다(누르는 도중 버튼·지도 칸이 바뀌면 click이 사라진다). 안내 줄만 지운다
  function stopAuto(user) { if (user) state.touched = true; if (auto) { clearInterval(auto); auto = null; heroLive && heroLive.querySelector('.hl-auto')?.remove(); } }
  const touch = () => { if (!state.touched) stopAuto(true); };
  ['pointerdown', 'wheel', 'keydown'].forEach(t => app.addEventListener(t, touch, { passive: true }));
  document.addEventListener('visibilitychange', () => (document.hidden ? stopAuto(false) : startAuto()));
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? startAuto() : stopAuto(false); }, { threshold: 0.25 }).observe(app);

  app.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#map"]');
    if (a) { e.preventDefault(); go(parseHash(a.getAttribute('href')) || {}); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.group) { const list = inds().filter(i => i.group === b.dataset.group), pick = list.find(avail) || list[0]; if (pick) state.ind = pick.code; render(); app.querySelector(`[data-group="${b.dataset.group}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.ind) { state.ind = b.dataset.ind; render(); app.querySelector(`[data-ind="${CSS.escape(b.dataset.ind)}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.mode) { state.mode = b.dataset.mode; render(); app.querySelector(`[data-mode="${b.dataset.mode}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.dong) go({ ...state.route, dong: b.dataset.dong }, `.map-list [data-dong="${b.dataset.dong}"]`);
    else if (b.hasAttribute('data-close')) go({ ...state.route, dong: null }, `.map-list [data-dong]`);
    else if (b.hasAttribute('data-play')) { play(); app.querySelector('[data-play]')?.focus({ preventScroll: true }); }
  });
  app.addEventListener('input', e => { const r = e.target.closest('[data-year]'); if (r) { stopPlay(); state.year = +r.value; render(); app.querySelector('[data-year]')?.focus({ preventScroll: true }); } });
  app.addEventListener('change', e => {
    const s = e.target.closest('select'); if (!s) return;
    const val = s.value;
    if ('sido' in s.dataset) go(val ? { sido: val } : {}, '[data-sido]');
    else if ('sg' in s.dataset) go({ sido: state.route.sido, sigungu: val || null }, '[data-sg]');
    else if ('gu' in s.dataset) go({ sido: state.route.sido, sigungu: state.route.sigungu, gu: val || null }, '[data-gu]');
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('is-sheet')) go({ ...state.route, dong: null }); });
  addEventListener('hashchange', () => { const r = parseHash(location.hash); if (r) { stopAuto(true); state.route = r; render(); } });
  wide.addEventListener('change', render);

  // 우리 동네 찾기: dong_index.json이 있으면 동까지, 없으면 시·도·시군구 이름으로
  const form = document.getElementById('heroSearch');
  let entries = [];
  function searchSetup() {
    if (!form) return;
    entries = searchEntries(state.index, state.dongIndex);
    const dl = form.querySelector('datalist'), note = form.querySelector('[data-search-note]');
    if (dl) dl.innerHTML = entries.map(e => `<option value="${esc(e.label)}"></option>`).join('');
    if (note) note.textContent = Array.isArray(state.dongIndex) ? '동 이름, 시·군·구, 시·도로 찾습니다.' : '지금은 시·도와 시·군·구 이름으로 찾습니다. 읍·면·동 이름 목록은 준비 중입니다.';
  }
  if (form) {
    const q = form.querySelector('input'), msg = form.querySelector('[data-search-msg]');
    const pick = () => { const e = findEntry(entries, q.value); if (msg) msg.textContent = e ? `${e.label}(으)로 이동했습니다.` : '찾는 이름이 없습니다. 시·군·구 이름으로 다시 찾아 보세요.'; if (e) { go(e.route); app.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } };
    form.addEventListener('submit', e => { e.preventDefault(); pick(); });
    q.addEventListener('focus', touch);
    q.addEventListener('change', () => { if (entries.some(e => e.label === q.value.trim())) pick(); });
  }

  Promise.all([fetchJson('data/national/index.json'), fetchJson('data/dashboard.json')]).then(([index, dash]) => {
    state.index = index && Array.isArray(index.sigungu) ? index : null; state.dash = dash;
    if (heroCount && index && isNum(index.emd_count)) { heroCount.innerHTML = `<b data-ck="emd" data-count="${index.emd_count}">0</b>개 `; countUp(heroCount.firstChild); }
    if (!state.index) { render(); return; }
    if (state.route.sido) app.scrollIntoView({ block: 'start' });
    searchSetup();
    render();
    Promise.all([fetchJson('data/national/sigungu.geojson'), fetchJson('data/national/sido.geojson')]).then(([sg, sido]) => {
      state.sgGeo = sg && Array.isArray(sg.features) ? sg : null; state.sidoGeo = sido && Array.isArray(sido.features) ? sido : null; render(); startAuto();
    });
  });
  fetchJson('data/national/living/index.json').then(li => { state.living = li && Array.isArray(li.indicators) ? li : null; if (state.index) render(); });
  fetchJson('data/national/dong_index.json').then(di => { state.dongIndex = Array.isArray(di) ? di : null; if (state.index) searchSetup(); });
})();
