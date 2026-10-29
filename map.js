/* 리뉴맵 전국 드릴다운 지도(첫 화면의 주인공). 전국 › 광역 › 기초 › (일반구·행정시) › 읍·면·동 — 법적 체계 그대로(SCHEMA.md '행정구역 체계').
   값은 data/national/index.json(시군구 summary)·emd/{code5}.json(행정동 시계열)·living/(생활 지표, 있으면)에서만 온다.
   색 구간은 지표별 기준값에 고정한다. 가중 종합점수·순위·값 순 정렬을 만들지 않는다(D13). '기준 미달 항목 수'는 가중치 없는 개수다.
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부(Leaflet, dashboard.js의 loadLeaflet 재사용). */
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DG = typeof module !== 'undefined' && module.exports ? require('./docgen.js') : (typeof window !== 'undefined' && window.RenewDocgen) || null; // HWPX·XLSX·복사용 표·1쪽 요약·지도 이미지
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const nf =d => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const digitsOf = v => (Math.round(v * 10) % 10 === 0 ? 0 : 1);
  const fmt = (v, unit) => (isNum(v) ? nf(digitsOf(v)).format(v) + (unit || '') : null);
  const SOURCE_DEFAULT = '도시재생종합정보체계 쇠퇴진단지표';

  // ── 지표·색 ──
  // 기준이 있는 지표는 기준선 안쪽(옅은 회색)·넘은 쪽(주황→갈색, 넘을수록 진함) 두 계열로 나누고, 경계는 기준값에 고정한다(값 순·분위 금지, D13).
  // UI 검수(2026-10-28): 초록↔빨강은 좋음·나쁨 판정처럼 읽히고 적록색약이 구분하기 어렵다 → 안쪽은 무채색, 밝기만으로도 순서가 읽히게.
  const NULL_COLOR = '#9aa6a1';
  // v4(D21) 갱신: 기준 넘은 쪽 색은 동 요약 도넛·카드 띠(--over)와 같은 주황·갈색, 공식 기준 없음은 중립 청회색
  const BELOW = ['#eef1f0', '#dce2df', '#c6cfcb', '#aeb9b4'], ABOVE = ['#f2ad6f', '#b4521d', '#7a3010'];
  const MET = ['#dce2df', ABOVE[0], ABOVE[1], ABOVE[2]];
  const SUMC = [...MET, '#4a1d09'];
  const REF = ['#eef1f4', '#cdd6e0', '#9fb0c3', '#6d84a0', '#3f5677']; // 공식 기준 없는 지표의 참고 구간(중립 청회색 5단계, 좋고 나쁨 없음. 녹색은 '기준 안'에만)
  const DIVERGE = ['#0b7f6f', '#8fcfc3', '#e9ecea', ABOVE[0], ABOVE[1]]; // 개선 청록 ↔ 악화 주황·갈색(기준 넘은 쪽과 같은 계열), 가운데 중성
  const MIG = ['#6a4c93', '#b3a2d1', '#e9ecea', '#8fcfc3', '#0b7f6f']; // 기준 없는 변화·청년 순이동: 줄어듦(유출) 보라 ↔ 늘어남(유입) 청록, 가운데 중성(기준선 0). 주황은 '기준 넘음' 전용
  // 지표 묶음: '정비가 필요한 신호'와 '생활 여건'을 각각 고를 수 있게 묶는다. 치안 점수·기피·순위는 만들지 않는다(D8·D13)
  // 아이콘은 이모지 대신 지표 칩과 같은 선 아이콘(ICONS) 한 벌을 쓴다(UI 검수 2026-10-28: 3D 이모지·선 아이콘·글자 기호가 섞여 있었다)
  const GROUPS = [['aging', '정비 신호'], ['pop', '인구 변화'], ['estate', '부동산 거래'], ['life', '생활 여건'], ['safe', '안전 인프라'], ['fore', '추세 전망'], ['sum', '종합']];
  const GROUP_ICON = { aging: 'bldg', pop: 'people', estate: 'home', life: 'tree', safe: 'cctv', fore: 'fore', sum: 'sum' };
  const gIco = g => icon(GROUP_ICON[g]);
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);
  // 쇠퇴 요건의 기준값은 시행령 제17조 문언 그대로라 '법정'이다. 승인 대기인 것은 요건을 묶어 판정하는 규칙(decline-3req-v0.1, hero.js RULE)이다.
  // 원장의 '공식 기준 해당 항목 수'(living STD_SHORTFALL_COUNT)도 이 기준을 확정으로 센다 — 화면과 원장이 같은 수를 보이게 맞춘다
  const LAW = '도시재생법 시행령 제17조';
  const lawStd = (value, direction, text) => ({ value, direction, text, source: LAW, status: '법정' });
  const SUM = 'SUM_STD_CROSSED';
  const INDICATORS = [
    { code: 'DECLINE_AGING_20Y_PCT', group: 'aging', icon: 'bldg', label: '노후건축물비율', unit: '%', edges: [30, 50, 60, 70], colors: [BELOW[0], BELOW[2], ...ABOVE],
      title: '준공 20년 이상 건축물 비율', worseUp: true, domain: [0, 100], series: true, standard: lawStd(50, 'above_bad', '준공 20년 이상 건축물 50% 이상') },
    { code: 'DECLINE_MET_COUNT', group: 'aging', icon: 'check', label: '요건 충족 수(하한)', unit: '개', edges: [1, 2, 3], colors: MET, labels: ['0개', '1개', '2개', '3개'],
      title: '시행령 제17조 요건 충족 수 · 결측으로 확정 못 한 요건은 세지 않은 하한 · 판정 아님', worseUp: true, domain: [0, 3], series: true, composite: true, noPlay: true, yearNote: '해마다 확정된 요건 수가 달라 연도 비교는 하지 않습니다',
      dEdges: [-1.5, -0.5, 0.5, 1.5], dLabels: ['2개 이상 줄어듦', '1개 줄어듦', '변화 없음', '1개 늘어남', '2개 이상 늘어남'], standard: lawStd(2, 'above_bad', '쇠퇴 3요건 중 2개 이상') },
    { code: 'DECLINE_POP_DROP30Y_PCT', group: 'pop', icon: 'popdown', label: '인구 감소율(30년)', unit: '%', edges: [0, 10, 20, 30], colors: [BELOW[0], BELOW[1], BELOW[2], ABOVE[1], ABOVE[2]],
      title: '주민등록 인구 30년 최대 대비 감소율 · KOSIS', worseUp: true, domain: [-20, 60], series: true, standard: lawStd(20, 'above_bad', '30년 최대 대비 20% 이상 감소') },
    { code: 'DECLINE_POP_CHANGE_PCT', group: 'pop', icon: 'people', label: '인구변화율', unit: '%', edges: [-20, -10, 0, 10], colors: [ABOVE[2], BELOW[3], BELOW[2], BELOW[1], BELOW[0]],
      title: '주민등록 인구 변화율', worseUp: false, domain: [-50, 50], series: true, standard: lawStd(-20, 'below_bad', '인구변화율 −20% 미만') },
    { code: 'DECLINE_BIZ_DROP10Y_PCT', group: 'aging', icon: 'shop', label: '사업체 감소율', unit: '%', edges: [0, 5, 10, 20], colors: [BELOW[0], BELOW[2], ...ABOVE],
      title: '사업체 10년 최대 대비 감소율', worseUp: true, domain: [-20, 40], series: true, breakSource: 'biz_source', standard: lawStd(5, 'above_bad', '10년 최대 대비 5% 이상 감소') },
    { code: SUM, group: 'sum', icon: 'sum', label: '기준 미달 항목 수', unit: '개', edges: [1, 2, 3, 4], colors: SUMC, labels: ['0개', '1개', '2개', '3개', '4개 이상'],
      title: '기준선보다 나쁜 쪽에 있는 항목 수 · 자료 있는 항목만 셈 · 가중치·순위 없음 · 판정 아님', worseUp: true, domain: [0, 8], computed: true, composite: true },
  ];
  // 자료 파일이 없을 때 칩에 '수집 중'으로만 보이는 자리. 숫자·기준값을 만들지 않는다
  const EXPECTED = { pop: ['고령(65세 이상) 비율', '청년(20~34세) 비율'], life: ['병의원(1만 명당)', '도서관 거리', '1인당 공원 면적', '공원 수', '버스정류장 밀도', '응급의료 거리'], safe: ['CCTV 밀도', '보안등 밀도', '경찰관서 거리'] };
  const pendingOf = (group, labels) => labels.map((label, i) => ({ code: `PENDING_${group.toUpperCase()}_${i}`, group, label, unit: '', icon: iconFor(label), living: true, pending: true, edges: [], colors: [NULL_COLOR] }));
  const LIVING_EXPECTED = Object.entries(EXPECTED).flatMap(([g, l]) => pendingOf(g, l));
  function iconFor(label) {
    const words = [['고령', 'elder'], ['청년', 'youth'], ['병', 'hosp'], ['의원', 'hosp'], ['도서관', 'book'], ['공원', 'tree'], ['버스', 'bus'], ['정류', 'bus'], ['응급', 'amb'], ['사업', 'shop'], ['인구', 'people'],
      ['CCTV', 'cctv'], ['보안등', 'lamp'], ['가로등', 'lamp'], ['경찰', 'police'], ['치안센터', 'police']];
    const w = words.find(([k]) => String(label).includes(k));
    return w ? w[1] : 'dot';
  }
  // ── 다른 직원이 만드는 중인 파일(SCHEMA 계약): migration.json(시군구 청년 순이동) · designations.json(인구감소지역 지정) · forecast/(추세 전망) ──
  // 없으면 '수집 중' 자리만 둔다. 시군구 단위 값은 읍·면·동 지도에 칠하지 않는다(단위가 다르다)
  const MIG_CODE = 'YOUTH_NET_MIGRATION_PER1K', DESIG_CODE = 'POP_DECLINE_DESIGNATION';
  const DESIG = [['인구감소지역', '#d55e00'], ['관심지역', '#e69f00'], ['인구활력+', '#0072b2']]; // 행정 지정 3상태 고정 색(Okabe-Ito 색상·밝기 모두 다름). 좋고 나쁨 축 아님
  const DESIG_NONE = '미지정';
  // 실거래(national/realestate.json, 다른 직원이 만드는 중): 시군구 월별 series. 신고 사실만 보여 주고 가격 전망·투자 판단을 하지 않는다
  const ESTATE_NOTE = '실거래 신고 사실 · 투자 조언 아님';
  const ESTATE_PROV = '최근 2개월은 신고기한(계약 후 30일) 때문에 잠정입니다';
  const FORECAST_BASE = [['DECLINE_POP_TOTAL', '인구', '명'], ['DECLINE_AGING_20Y_PCT', '노후건축물비율', '%'], ['DECLINE_BIZ_TOTAL', '사업체', '개']];
  const hasList = (o, k) => !!o && Array.isArray(o[k]) && o[k].length > 0;
  const srcName = s => (s && typeof s === 'object' ? s.name : s) || null;
  function extraIndicators(ext, lv) {
    const e = ext || {};
    const mig = { code: MIG_CODE, group: 'pop', icon: 'move', label: '청년 순이동', unit: '명', level: 'sg', src: 'migration', source: srcName(e.migration && e.migration.source), standard: null, worseUp: false, ref: true,
      edges: [-20, -5, 5, 20], colors: MIG, labels: ['천 명당 20명 이상 유출', '5~20명 유출', '±5명 안', '5~20명 유입', '20명 이상 유입'], pending: !hasList(e.migration, 'sigungu'),
      title: '청년(20~34세) 순이동 · 청년 인구 천 명당 · 시·군·구 단위 · 주황 유출 · 청록 유입 · 기준선 0' };
    const des = { code: DESIG_CODE, group: 'pop', icon: 'flag', label: '인구감소지역 지정', unit: '', level: 'sg', src: 'designations', source: srcName(e.designations && e.designations.source), standard: null, categorical: true, cats: DESIG,
      edges: [], colors: DESIG.map(c => c[1]).concat(BELOW[0]), labels: DESIG.map(c => c[0]).concat(DESIG_NONE), pending: !hasList(e.designations, 'items'),
      title: '인구감소지역 지정(행정 지정) · 시·군·구 단위 · 상태별 고정 색 · 순위 아님' };
    const fi = e.forecastIdx && typeof e.forecastIdx === 'object' ? e.forecastIdx : null, bt = fi && fi.backtest && typeof fi.backtest === 'object' ? fi.backtest : null;
    const codes = bt && Object.keys(bt).length ? Object.keys(bt) : FORECAST_BASE.map(b => b[0]);
    // 전망 지표: backtest 키마다 하나. 바탕 지표의 색 구간·단위를 그대로 쓴다(없으면 한 색). withheld(보류)·n_areas 0은 칩에 '보류'로 두고 숫자를 만들지 않는다
    const fore = codes.map(c => {
      const b = bt && bt[c] && typeof bt[c] === 'object' ? bt[c] : null, base = INDICATORS.find(i => i.code === c) || (lv || []).find(i => i.code === c) || null;
      const fb = FORECAST_BASE.find(x => x[0] === c) || [, c, ''], lbl = base ? base.label : fb[1], mape = b && isNum(b.median_mape) ? b.median_mape : null, held = b && typeof b.withheld === 'string' && b.withheld ? b.withheld : null;
      const sgScope = !!b && typeof b.scope === 'string' && /시군구|시·군·구/.test(b.scope);
      const common = { code: 'FORECAST_' + c, group: 'fore', icon: 'fore', level: sgScope ? 'sg' : 'emd', src: 'forecast', mape, held, standard: null, pending: !fi, empty: !!held || (!!b && isNum(b.n_areas) && b.n_areas === 0),
        disclaimer: fi && typeof fi.disclaimer === 'string' ? fi.disclaimer : null, source: fi && typeof fi.method === 'string' ? `추세 외삽(${fi.method})` : '추세 외삽' };
      const tail = `${sgScope ? ' · 시·군·구 단위' : ''} · 추세 외삽 · 판정·투자 조언 아님 · 승인 전 초안${mape === null ? '' : ` · 백테스트 MAPE ${fmt(mape, '%')}`}`;
      // 절대량 지표(명·개)는 자료가 주는 변화율 키(change_pct_key, 기준연도 실측 대비 %)로 칠한다 — 고정 참고 구간, 기준 없음. 화면에서 나누지 않는다
      const ck = b && typeof b.change_pct_key === 'string' && b.change_pct_key ? b.change_pct_key : null, by = fi && isNum(fi.base_year) ? fi.base_year : null;
      if (ck) return { ...common, label: `${lbl} 전망 · ${by === null ? '기준연도' : by + '년'} 대비`, unit: '%', fc: ck, worseUp: false, ref: true, domain: [-50, 50],
        edges: [-20, -10, 0, 10], colors: [ABOVE[2], ABOVE[1], ABOVE[0], BELOW[1], BELOW[0]], labels: ['20% 이상 감소', '10~20% 감소', '0~10% 감소', '0~10% 증가', '10% 이상 증가'],
        title: `${lbl} 전망 · ${by === null ? '기준연도' : by + '년'} 실측 대비 변화율 · 고정 참고 구간(공식 기준 없음)${tail}` };
      return { ...common, label: lbl + ' 전망', unit: base ? base.unit : fb[2], fc: c, worseUp: base ? base.worseUp : true,
        edges: base && !base.pending ? base.edges : [], colors: base && !base.pending ? base.colors : [REF[2]], labels: base && !base.pending ? base.labels : ['값 있음'], domain: base ? base.domain || null : null,
        title: `${lbl} 전망${tail}` };
    });
    const reOn = hasList(e.realestate, 'sigungu'), reSrc = srcName(e.realestate && e.realestate.source), reNote = e.realestate && typeof e.realestate.note === 'string' ? e.realestate.note : null,
      reMonth = e.realestate && e.realestate.source && isNum(e.realestate.source.latest_month) ? e.realestate.source.latest_month : null;
    const estate = [
      { code: 'APT_TRADE_COUNT', group: 'estate', icon: 'home', label: '거래량(월)', unit: '건', level: 'sg', src: 'realestate', source: reSrc, note: reNote, latest: reMonth, standard: null, pending: !reOn,
        edges: [], colors: [REF[2]], labels: ['값 있음'], title: `아파트 매매 신고 건수 · 최근 달 · 시·군·구 단위 · ${ESTATE_NOTE}` },
      { code: 'APT_TRADE_COUNT_YOY_PCT', group: 'estate', icon: 'home', label: '연간 거래 건수 변화', unit: '%', level: 'sg', src: 'realestate', source: reSrc, note: reNote, latest: reMonth, standard: null, pending: !reOn, ref: true,
        edges: [-20, -5, 5, 20], colors: REF, labels: ['20% 이상 감소', '5~20% 감소', '±5% 안', '5~20% 증가', '20% 이상 증가'], title: `아파트 매매 신고 건수 최근 12개월 · 직전 12개월 대비 · 고정 참고 구간(공식 기준 없음) · 시·군·구 단위 · ${ESTATE_NOTE}` },
      { code: 'APT_PRICE_M2_YOY_PCT', group: 'estate', icon: 'home', label: '㎡당 중위가 1년 변화율', unit: '%', level: 'sg', src: 'realestate', source: reSrc, note: reNote, latest: reMonth, standard: null, pending: !reOn, ref: true,
        edges: [-10, -3, 3, 10], colors: REF, labels: ['10% 이상 감소', '3~10% 감소', '±3% 안', '3~10% 증가', '10% 이상 증가'], title: `아파트 매매 ㎡당 중위가 전년 같은 달 대비 · 고정 참고 구간(공식 기준 없음) · 시·군·구 단위 · ${ESTATE_NOTE}` },
    ];
    return [mig, des, ...estate, ...fore];
  }
  const FORE_NOTE = '추세 외삽 · 판정·투자 조언 아님 · 승인 전 초안';
  const foreLine = ind => `${FORE_NOTE}${ind.mape === null || ind.mape === undefined ? '' : ` · 백테스트 MAPE ${fmt(ind.mape, '%')}`}${ind.disclaimer ? ` · ${ind.disclaimer}` : ''}`;
  const SAFE_NOTE = '공식 기준 없음 · 점수 아님 · 공식 시설 현황만';
  // 공식 기준이 없는 생활 지표의 고정 참고 구간(화면 표시용 눈금, 분위 아님). 자료가 ref_edges를 주면 그것을 쓴다
  const REF_EDGES = { POP_YOUTH_PCT: [10, 15, 20, 25], HOSP_CLINIC_COUNT: [1, 5, 10, 30], HOSP_PER10K: [2, 5, 10, 20], PARK_COUNT: [1, 3, 5, 10], BUS_STOP_DENSITY: [5, 10, 20, 40] };
  // living/index.json의 group은 키(life) 또는 이름(생활 인프라)이다. '교통'은 대표 결정대로 생활 인프라에 둔다
  const GROUP_ALIAS = { 노후: 'aging', '부동산 거래': 'estate', 부동산: 'estate', 정비: 'aging', '노후·정비': 'aging', '정비 신호': 'aging', 경제: 'aging', 인구: 'pop', '인구 변화': 'pop', '생활 인프라': 'life', '생활 여건': 'life', 생활: 'life', 교통: 'life', '안전 인프라': 'safe', 안전: 'safe', '건축·정비': 'aging', 복지: 'pop', 전망: 'fore', '추세 전망': 'fore', 종합: 'sum' };
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
    // hidden_until_decision: 셀은 있으나 대표 결정 전까지 화면에 내지 않는다(D17 — 안전비상벨)
    const list = li.indicators.filter(x => x && x.code && x.label && !/_DELTA5Y$/.test(x.code) && x.hidden_until_decision !== true).map(x => {
      const code = String(x.code), group = groupKey(x.group), c = cov[code], ref = ascending(x.ref_edges) ? x.ref_edges : REF_EDGES[code];
      const base = { code, group, label: String(x.label), unit: x.unit || '', icon: iconFor(x.label), living: true, title: String(x.label), empty: !!c && c.dongs_with_value === 0,
        delta: li.indicators.some(y => y && y.code === code + '_DELTA5Y'), worseUp: true, ...(x.source ? { source: String(x.source) } : {}) }; // 범례 출처는 이 지표의 출처
      if (group === 'sum') return { ...base, icon: 'sum', composite: true, edges: [1, 2, 3, 4], colors: SUMC, labels: ['0개', '1개', '2개', '3개', '4개 이상'], standard: null,
        title: `${x.label} · 원장 값 · 가중치·순위 없음 · 판정 아님` };
      if (validStd(x.standard)) return { ...base, ...stdScale(x.standard), worseUp: x.standard.direction === 'above_bad', standard: { ...x.standard, status: x.standard.status || '' } };
      if (ascending(ref)) return { ...base, edges: ref, colors: REF.slice(REF.length - ref.length - 1), standard: null, ref: true };
      return { ...base, edges: [], colors: [REF[2]], labels: ['값 있음'], standard: null };
    });
    return list.some(x => x.group === 'safe') ? list : list.concat(pendingOf('safe', EXPECTED.safe)); // 안전 인프라 자료가 아직 없으면 수집 중 자리만
  }
  // 화면 지표 목록: 그룹 순서(고정) → 그룹 안에서는 정의 순서. 값으로 줄 세우지 않는다
  // 원장이 종합(기준 해당 항목 수)을 주면 화면에서 따로 세지 않는다
  function allIndicators(li, ext) {
    const lv = livingIndicators(li), gi = g => GROUPS.findIndex(x => x[0] === g);
    const list = [...INDICATORS.filter(i => !(i.computed && lv.some(x => x.group === 'sum'))), ...lv, ...extraIndicators(ext, lv)];
    return list.sort((a, b) => gi(a.group) - gi(b.group)); // 안정 정렬: 묶음 안에서는 정의 순서 유지
  }
  const MODES = [['now', '현재'], ['trend', '5년 변화']];
  const indOf = (code, list) => (list || INDICATORS).find(i => i.code === code) || INDICATORS[0];
  const hasTrend = ind => !!(ind.series || ind.delta);
  const keyOf = (ind, mode) => (mode === 'trend' && hasTrend(ind) ? ind.code + '_DELTA5Y' : ind.code);
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
  const judged = ind => validStd(ind.standard) || !!ind.composite; // 기준이 있어야 개선·악화를 말한다. 없으면 늘어남·줄어듦만
  function scaleFor(ind, mode) {
    if (mode === 'trend' && hasTrend(ind)) {
      const edges = ind.dEdges || [-10, -3, 3, 10], unit = ind.dEdges ? '' : '%p';
      const labels = ind.dLabels || ['10%p 이상 줄어듦', '3~10%p 줄어듦', '±3%p 안', '3~10%p 늘어남', '10%p 이상 늘어남'];
      if (!judged(ind)) return { edges, colors: MIG, labels, unit, title: `${ind.label} 5년 변화 · 보라 줄어듦 · 청록 늘어남 · 공식 기준 없음` };
      return { edges, colors: ind.worseUp ? DIVERGE : [...DIVERGE].reverse(), labels, unit, title: `${ind.label} 5년 변화 · 청록 개선 · 진홍 악화` };
    }
    return { edges: ind.edges || [], colors: ind.colors || [NULL_COLOR], labels: ind.labels || edgeLabels(ind.edges || [], ind.unit), unit: ind.unit, title: ind.title || ind.label };
  }
  const colorOf = (v, scale) => { const b = binIndex(v, scale.edges); return b < 0 ? NULL_COLOR : scale.colors[b]; };
  function legendItems(ind, mode) {
    const s = scaleFor(ind, mode);
    return (ind.pending ? [] : s.colors.map((color, i) => ({ color, label: s.labels[i] }))).concat({ color: NULL_COLOR, label: ind.pending ? '수집 중' : ind.held ? '보류' : '자료 없음·비공개', hatch: true });
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
    const up = delta > 0;
    if (!judged(ind)) return { arrow: up ? '▲' : '▼', word: up ? '늘어남' : '줄어듦', cls: 'neutral' };
    const worse = up === ind.worseUp;
    return { arrow: up ? '▲' : '▼', word: worse ? '악화' : '개선', cls: worse ? 'worse' : 'better' };
  }
  // 지표를 고를 수 있는지. 쇠퇴 지표: 시군구 summary에 값이 있거나, 읍·면·동 시계열에만 있는 지표(사업체 감소율 등)는 지금 연 읍·면·동 파일에 값이 있을 때
  // (읍·면·동 파일을 아직 안 열었으면 고를 수 있게 두고, 전국 단계 지도는 회색 + '읍·면·동 자료만' 안내). 생활 지표: living/index.json에 올라 있을 때
  const hasSummary = (ind, index) => ((index && index.sigungu) || []).some(s => isNum(summaryOf(s, ind.code).value));
  function isAvailable(ind, index, li, emd) {
    if (ind.pending || ind.empty) return false;
    if (ind.computed || ind.src) return true;
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
  // 시·군·구 대표값이 절반 미만 지역에만 있으면 그 시·도 이름(2곳까지)을 돌려준다. 예: '부산만'. 순위 아님
  function coverLabel(ind, index) {
    if (ind.src === 'forecast' && ind.level !== 'sg' && !ind.pending) return '동 단위'; // 전망은 읍·면·동 파일에만 있어 전국·시·도 지도는 빈칸
    if (!index || ind.src || ind.computed || ind.level === 'sg' || ind.pending) return '';
    const all = leavesOf(index), has = all.filter(sg => isNum(summaryOf(sg, ind.code).value));
    if (!has.length || has.length >= all.length / 2) return '';
    const names = [...new Set(has.map(sg => String(sg.sido2)))].map(c => ((index.sido || []).find(x => String(x.code2) === c) || {}).name).filter(Boolean);
    return names.length && names.length <= 2 ? `${names.map(n => n.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '')).join('·')}만` : '일부 지역';
  }
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
    if (ind.categorical) { // 행정 지정: 숫자가 아니라 상태 글자. 기준선·순위 없음
      const has = typeof value === 'string';
      return { ind, value: has ? value : null, crossed: null, status: ind.pending ? '수집 중' : !has ? '자료 없음' : value === DESIG_NONE ? '미지정' : '행정 지정', text: has ? value : null, ...extra };
    }
    const v = isNum(value) ? value : null, c = crossed(v, ind.standard);
    const status = ind.pending ? '수집 중' : v === null ? (extra && extra.held ? '보류' : '자료 없음') : ind.src === 'forecast' ? '추세 전망' : !ind.standard ? '공식 기준 없음' : isPending(ind.standard) ? '기준 승인 대기' : c ? '기준 넘음' : '기준 안';
    return { ind, value: v, crossed: c, status, ...extra };
  }
  // 시군구 단위 추가 자료(청년 순이동·인구감소지역 지정). 코드는 index.json code5 또는 행안부 code5(mois_code5) 어느 쪽이든 맞춘다
  const sgMatch = (list, sg) => (Array.isArray(list) ? list : []).find(x => x && (String(x.code5) === String(sg.code5) || (sg.mois_code5 && String(x.code5) === String(sg.mois_code5)))) || null;
  function sgExtra(ind, sg, ext) {
    const e = ext || {};
    if (ind.src === 'migration') {
      const row = sgMatch(e.migration && e.migration.sigungu, sg), s = row ? seriesOf(row, MIG_CODE) : [], y = latestYear(s), v = y === null ? null : valueAt(s, y);
      return { value: v, year: y, text: fmt(v, ind.unit) || '자료 없음', color: colorOf(v, scaleFor(ind, 'now')), abs: y === null ? null : valueAt(seriesOf(row, 'YOUTH_NET_MIGRATION'), y), cell: row ? ((row.cells || []).find(c => c.indicator_code === MIG_CODE) || null) : null };
    }
    if (ind.src === 'designations') {
      const items = e.designations && Array.isArray(e.designations.items) ? e.designations.items : null, row = sgMatch(items, sg);
      if (!row) return items ? { value: DESIG_NONE, year: null, text: DESIG_NONE, color: BELOW[0], cell: null } : { value: null, year: null, text: '자료 없음', color: NULL_COLOR, cell: null }; // 고시에 없는 시군구 = 지정 안 됨
      const st = DESIG.find(c => c[0] === row.status);
      return { value: st ? st[0] : DESIG_NONE, year: null, text: st ? st[0] : DESIG_NONE, color: st ? st[1] : BELOW[0], since: row.since ?? null, cell: (row.cells || []).find(c => c && typeof c.value === 'string') || null };
    }
    if (ind.src === 'realestate') { // 월 단위(yyyymm). 연도 칸에 넣지 않고 글자에 '2026.09'처럼 붙인다
      const row = sgMatch(e.realestate && e.realestate.sigungu, sg), raw = row && row.series && Array.isArray(row.series[ind.code]) ? row.series[ind.code] : [];
      const s = seriesOf({ series: { k: raw.map(p => (Array.isArray(p) ? [Number(p[0]), p[1]] : p)) } }, 'k'), ym = latestYear(s), v = ym === null ? null : valueAt(s, ym);
      const cell = row ? ((row.cells || []).find(c => c.indicator_code === ind.code) || null) : null, sv = row && row.summary && isNum(row.summary[ind.code]) ? row.summary[ind.code] : null;
      // 시계열이 없는 값(거래량 1년 변화율: 최근 12개월 합 대비)은 summary에서. 화면에서 다시 계산하지 않는다
      if (ym === null && sv !== null) return { value: sv, year: null, text: `${fmt(sv, ind.unit)} · 최근 12개월`, color: colorOf(sv, scaleFor(ind, 'now')), cell };
      const prov = e.realestate && e.realestate.source && Array.isArray(e.realestate.source.provisional_months) && e.realestate.source.provisional_months.map(Number).includes(ym) ? ' (잠정)' : '';
      return { value: v, year: null, text: v === null ? '자료 없음' : `${fmt(v, ind.unit)} · ${String(ym).slice(0, 4)}.${String(ym).slice(4, 6)}${prov}`, color: colorOf(v, scaleFor(ind, 'now')), cell };
    }
    return { value: null, year: null, text: '자료 없음', color: NULL_COLOR, cell: null };
  }
  // 추세 전망 한 동·한 지표·선택한 연도: [점추정, 하한, 상한]. 구간이 없으면 점추정만 두지 않고 자료 없음(윤리 원칙 ④)
  // code7이 null이면 시군구 단위 전망(sigungu_forecast). 보류된 동은 { held: 사유 }
  function fcOf(ext, code7, base) {
    const e = ext || {}, f = e.forecast;
    const fd = !f ? null : code7 === null ? { forecast: f.sigungu_forecast, cells: f.sigungu_cells, excluded: f.sigungu_excluded } : Array.isArray(f.dongs) ? f.dongs.find(d => codeOf(d) === String(code7)) : null;
    const h = e.horizon, a = fd && fd.forecast && fd.forecast[base] && isNum(h) ? fd.forecast[base][String(h)] : null;
    if (!Array.isArray(a) || !isNum(a[0]) || !isNum(a[1]) || !isNum(a[2])) return fd && fd.excluded && typeof fd.excluded[base] === 'string' ? { held: fd.excluded[base] } : null;
    const by = e.forecastIdx && isNum(e.forecastIdx.base_year) ? e.forecastIdx.base_year : null, code = by === null ? null : `FORECAST_${base}_H${h - by}`;
    return { point: a[0], lo: Math.min(a[1], a[2]), hi: Math.max(a[1], a[2]), cell: ((fd.cells || []).find(c => c.indicator_code === code || c.indicator_code === base) || null) };
  }
  // 기준 미달 항목 수: 확정(승인된 기준을 넘음) · 추가확인(넘었지만 기준 승인 대기) · 자료 없음. 묶음 지표(요건 충족 수)와 종합은 세지 않는다
  function tally(rows) {
    const r = rows.filter(x => !x.ind.composite && !x.ind.computed && (x.ind.standard || x.ind.pending));
    return { confirmed: r.filter(x => x.status === '기준 넘음').length, pending: r.filter(x => x.status === '기준 승인 대기' && x.crossed).length,
      nodata: r.filter(x => x.value === null).length, counted: r.filter(x => x.value !== null).length };
  }
  const sumValue = rows => { const t = tally(rows); return t.counted ? t.confirmed + t.pending : null; };
  const lawInds = inds => (inds || INDICATORS).filter(i => i.series && i.standard && !i.composite);
  // ── 연도 요약(index.json: sigungu[].series [연도, 중앙값, 기준선 이상 동 수, 값 있는 동 수] · national_series [연도, 기준선 이상 동 수, 값 있는 동 수] · over_std) ──
  const natRows = (index, code) => (index && index.national_series && Array.isArray(index.national_series[code]) ? index.national_series[code].filter(r => Array.isArray(r) && isNum(r[0])) : []);
  const hasYears = (index, ind) => natRows(index, ind.code).some(r => isNum(r[2]) && r[2] > 0);
  const overStd = (index, ind) => (index && index.over_std && isNum(index.over_std[ind.code]) ? index.over_std[ind.code] : null);
  // 재생할 해: 값 있는 동 수가 그 지표 최대의 50% 이상인 해만. 처음~끝 사이에서 빠진 해는 '건너뜀'으로 따로 돌려준다
  function playYears(index, code) {
    const rows = natRows(index, code), max = Math.max(0, ...rows.map(r => (isNum(r[2]) ? r[2] : 0)));
    const years = max ? rows.filter(r => isNum(r[1]) && isNum(r[2]) && r[2] >= max / 2).map(r => r[0]) : [];
    const skipped = years.length ? rows.map(r => r[0]).filter(y => y > years[0] && y < years[years.length - 1] && !years.includes(y)) : [];
    return { years, skipped };
  }
  function sgRow(sg, code, year) {
    const rows = sg && sg.series && Array.isArray(sg.series[code]) ? sg.series[code].filter(r => Array.isArray(r)) : [];
    const r = year === null ? [...rows].reverse().find(x => isNum(x[1])) : rows.find(x => x[0] === year);
    return r ? { year: r[0], value: isNum(r[1]) ? r[1] : null, over: isNum(r[2]) ? r[2] : null, n: isNum(r[3]) ? r[3] : 0 } : null;
  }
  // 동 수 세기: 전국은 national_series(일반구 중복 없음), 시도는 그 안 칸(경계 있는 시군구)의 수를 더한다. 순위 아님
  function countOver(index, code, year, sgs) {
    if (!sgs) { const r = natRows(index, code).find(x => x[0] === year); return { over: r && isNum(r[1]) ? r[1] : null, n: r && isNum(r[2]) ? r[2] : 0 }; }
    let over = null, n = 0;
    for (const sg of sgs) { const r = sgRow(sg, code, year); if (r && r.n) { n += r.n; if (r.over !== null) over = (over || 0) + r.over; } }
    return { over, n };
  }
  // 첫 화면 문구: '기준선(50% 이상) 넘은 동 n곳 / 값 있는 동 m곳 · 2016년'. 연도가 없으면 자료 있는 마지막 해
  function overCaption(index, ind, year, sgs) {
    const py = playYears(index, ind.code), lastRow = [...natRows(index, ind.code)].reverse().find(r => isNum(r[1]) && r[2] > 0);
    const y = isNum(year) ? year : lastRow ? lastRow[0] : null, c = countOver(index, ind.code, y, sgs), std = overStd(index, ind);
    const reg = ind.breakSource && index && index[ind.breakSource] ? index[ind.breakSource].register_based_from : null;
    const notes = [ind.noPlay ? ind.yearNote : null, isNum(reg) && y >= reg ? `${reg}년부터 등록기반 통계로 바뀐 뒤 — 이전 해와 직접 비교 주의` : null].filter(Boolean);
    const f = nf(0).format, stdText = std === null ? '' : `기준선(${pm(std)}${ind.unit} 이상)`;
    return { year: y, over: c.over, n: c.n, std, notes, skipNote: !ind.noPlay && py.skipped.length ? `자료 없는 해 건너뜀: ${py.skipped.join('·')}` : null,
      text: c.n ? `${stdText} 넘은 동 ${c.over === null ? '–' : f(c.over)}곳 / 값 있는 동 ${f(c.n)}곳 · ${y}년` : `${y ?? ''}년은 자료가 없습니다` };
  }
  function sigunguModel(sgs, ind, mode, inds, year, ext) {
    const scale = scaleFor(ind, mode), key = keyOf(ind, mode), byYear = !!ind.series && mode !== 'trend';
    return (sgs || []).map(sg => {
      if (ind.level === 'sg') { const x = sgExtra(ind, sg, ext); return { code: String(sg.code5), name: sg.name, kind: sg.kind || null, value: x.value, year: x.year, status: null, text: x.text, color: x.color, bbox: sg.bbox || null, over: null, n: null, abs: x.abs ?? null, since: x.since ?? null }; }
      let s = summaryOf(sg, key);
      const r = byYear ? sgRow(sg, ind.code, isNum(year) ? year : null) : null;
      if (byYear && isNum(year)) s = { value: r ? r.value : null, year, status: null }; // 그해 시·군·구 색 = 그 안 읍·면·동 값의 중앙값(원장 값)
      if (ind.computed) {
        const parts = lawInds(inds).map(i => ({ i, s: summaryOf(sg, i.code) })), ys = parts.map(p => p.s.year).filter(isNum);
        s = { value: sumValue(parts.map(p => rowOf(p.i, p.s.value))), year: ys.length ? Math.max(...ys) : null, status: null };
      }
      return { code: String(sg.code5), name: sg.name, kind: sg.kind || null, value: s.value, year: s.year, status: s.status, text: fmt(s.value, scale.unit) || '자료 없음', color: colorOf(s.value, scale), bbox: sg.bbox || null,
        over: r ? r.over : null, n: r ? r.n : null };
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
  // ext: { migration, designations, forecastIdx, forecast(이 시군구 전망 파일), horizon(전망 연도), sg(이 시군구 index 항목) }
  function dongRows(inds, dong, ld, year, ext) {
    return (inds || INDICATORS).filter(i => !i.computed).map(ind => {
      if (ind.series) {
        const s = seriesOf(dong, ind.code), y = year ?? latestYear(s), d5 = seriesOf(dong, ind.code + '_DELTA5Y');
        return rowOf(ind, y === null ? null : valueAt(s, y), { year: y, series: s, delta: y === null ? null : valueAt(d5, y), cell: ((dong && dong.cells) || []).find(c => c.indicator_code === ind.code) || null });
      }
      if (ind.src === 'forecast') {
        const f = ind.pending ? null : fcOf(ext, ind.level === 'sg' ? null : codeOf(dong || {}), ind.fc), ok = f && !f.held;
        return rowOf(ind, ok ? f.point : null, { year: ext && isNum(ext.horizon) ? ext.horizon : null, series: null, delta: null, cell: ok ? f.cell : null, lo: ok ? f.lo : null, hi: ok ? f.hi : null, held: f && f.held ? f.held : ind.held || null, sgLevel: ind.level === 'sg' });
      }
      if (ind.level === 'sg') { // 시군구 단위 값을 '이 동의 값'처럼 보이지 않게 sgLevel 표시
        const x = ind.pending || !ext || !ext.sg ? { value: null, year: null, text: null, cell: null } : sgExtra(ind, ext.sg, ext);
        return rowOf(ind, x.value, { year: x.year, series: null, delta: null, cell: x.cell, text: x.text, sgLevel: true, abs: x.abs ?? null, since: x.since ?? null });
      }
      const c = ind.pending ? null : livingCell(ld, ind.code), dc = ind.delta ? livingCell(ld, ind.code + '_DELTA5Y') : null;
      return rowOf(ind, c ? c.value : null, { year: c ? c.base_year ?? null : null, series: null, delta: dc && isNum(dc.value) ? dc.value : null, cell: c });
    });
  }
  function dongModel(emd, ind, mode, year, living, inds, ext) {
    const scale = scaleFor(ind, mode), key = keyOf(ind, mode), dongs = (emd && Array.isArray(emd.dongs) ? emd.dongs : []), lm = livingMap(living);
    const unmatched = new Set(((emd && emd.unmatched) || []).map(u => String(u && typeof u === 'object' ? u.code : u)));
    return dongs.map(d => {
      const code = codeOf(d);
      let v = null, y = null, lo = null, hi = null;
      if (ind.computed) { y = year ?? latestYear(seriesOf(d, INDICATORS[0].code)); v = sumValue(dongRows(inds, d, lm.get(code), y, ext)); }
      else if (ind.series) { const s = seriesOf(d, key); y = year ?? latestYear(s); v = y === null ? null : valueAt(s, y); }
      else if (ind.src === 'forecast') { const f = ind.pending || ind.level === 'sg' ? null : fcOf(ext, code, ind.fc); if (f && !f.held) { v = f.point; lo = f.lo; hi = f.hi; y = ext.horizon; } }
      else if (ind.level === 'sg') { v = null; } // 시군구 단위 자료는 읍·면·동 지도에 칠하지 않는다
      else if (!ind.pending) { const c = livingCell(lm.get(code), key); v = c && isNum(c.value) ? c.value : null; y = c ? c.base_year ?? null : null; }
      return { code, name: d.name, kind: d.kind || null, value: v, year: y, text: fmt(v, scale.unit) || '자료 없음', color: colorOf(v, scale), unmatched: unmatched.has(code), lo, hi };
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
  // 최소제곱 직선(설명용 추세, 전망 아님). pts: [[연도, 값]] 결측 제외. 점 3개 미만이면 null
  function olsFit(pts) {
    const p = (pts || []).filter(q => isNum(q[0]) && isNum(q[1])), n = p.length;
    if (n < 3) return null;
    const mx = p.reduce((a, q) => a + q[0], 0) / n, my = p.reduce((a, q) => a + q[1], 0) / n;
    const sxx = p.reduce((a, q) => a + (q[0] - mx) ** 2, 0); if (!sxx) return null;
    const slope = p.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / sxx;
    return { slope, at: x => my + slope * (x - mx), n };
  }
  // 시계열 + 선형 추세(점선) + 기준선. 결측은 선을 끊는다. 순위·전망 아님
  function trendSVG(series, year, label, std, unit) {
    const W = 300, H = 72, pad = 8, vals = (series || []).filter(p => p[1] !== null);
    if (vals.length < 2) return sparkline(series || [], year, label);
    const ys = series.map(p => p[0]), y0 = Math.min(...ys), y1 = Math.max(...ys), fit = olsFit(vals);
    const pool = [...vals.map(p => p[1]), ...(isNum(std) ? [std] : []), ...(fit ? [fit.at(y0), fit.at(y1)] : [])], lo = Math.min(...pool), hi = Math.max(...pool), span = hi - lo || 1;
    const X = y => pad + (y1 === y0 ? W / 2 - pad : (y - y0) / (y1 - y0) * (W - 2 * pad)), Y = v => H - pad - (v - lo) / span * (H - 2 * pad);
    let d = '', pen = false;
    series.forEach(p => { if (p[1] === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`; pen = true; });
    const stdLine = isNum(std) ? `<line class="tr-std" x1="${pad}" x2="${W - pad}" y1="${Y(std).toFixed(1)}" y2="${Y(std).toFixed(1)}"/>` : '';
    const trend = fit ? `<line class="tr-fit" x1="${X(y0).toFixed(1)}" x2="${X(y1).toFixed(1)}" y1="${Y(fit.at(y0)).toFixed(1)}" y2="${Y(fit.at(y1)).toFixed(1)}"/>` : '';
    const cur = series.find(p => p[0] === year && p[1] !== null) || vals[vals.length - 1];
    const u = unit === '%' ? '%p' : unit || '', slope = fit ? `${fit.slope >= 0 ? '+' : ''}${fmt(Math.round(fit.slope * 100) / 100)}${u}` : '';
    const cap = `${y0}~${y1}년${fit ? ` · 추세 연 ${slope}(선형회귀, 설명용)` : ''}${isNum(std) ? ` · 가로 점선 기준 ${fmt(std)}${unit || ''}` : ''}`;
    return `<figure class="tr"><svg class="tr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} ${esc(cap)}, ${cur[0]}년 ${esc(fmt(cur[1]))}">${stdLine}${trend}<path class="tr-line" d="${d}"/><circle class="tr-dot" cx="${X(cur[0]).toFixed(1)}" cy="${Y(cur[1]).toFixed(1)}" r="4"/></svg><figcaption>${esc(cap)}</figcaption></figure>`;
  }
  // 상태 개수 도넛(비율 그림). 개수를 글자로 함께 쓴다. 순위·점수 아님
  // 한 동 패널의 세 요약(도넛·기준 미달 항목 수·확인할 항목)은 같은 항목 범위·같은 낱말을 쓴다. '공식 기준 없음'(값만)과 '자료 없음'을 섞지 않는다
  const DONUT = [['r', '기준 미달·지정'], ['g', '기준 안'], ['y', '승인 대기'], ['b', '공식 기준 없음'], ['w', '자료 없음']];
  const GS_SHORT = { r: '미달', g: '기준 안', y: '승인 대기', b: '기준 없음', w: '자료 없음' };
  function donutSVG(n) {
    const tot = DONUT.reduce((a, [k]) => a + (n[k] || 0), 0), R = 42, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = tot ? DONUT.filter(([k]) => n[k]).map(([k]) => { const len = n[k] / tot * C, a = `<circle class="dn-${k}" r="${R}" cx="60" cy="60" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(C - len + 1.5).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`; off += len; return a; }).join('') : `<circle class="dn-w" r="${R}" cx="60" cy="60"/>`;
    return `<svg class="dn" viewBox="0 0 120 120" aria-hidden="true"><g transform="rotate(-90 60 60)">${arcs}</g><text x="60" y="62" class="dn-n">${tot}</text><text x="60" y="80" class="dn-k">항목</text></svg>`;
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
    const band = isNum(row.lo) && isNum(row.hi) ? `<rect class="sr-band" x="${X(row.lo).toFixed(1)}" y="2" width="${Math.max(2, X(row.hi) - X(row.lo)).toFixed(1)}" height="14" rx="3"/>` : ''; // 전망 80% 구간 띠
    const label = `${ind.label} ${row.value === null ? '자료 없음' : fmt(row.value, ind.unit)}${band ? `, 80% 구간 ${fmt(row.lo, ind.unit)}~${fmt(row.hi, ind.unit)}` : ''}${sv === null ? ', 공식 기준 없음' : `, 기준 ${pm(sv)}${ind.unit}`}`;
    return `<svg class="sr-bar${row.value === null ? ' is-empty' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><rect class="sr-track" x="0" y="4" width="${W}" height="10" rx="3"/>${band}${fill}${tick}</svg>`;
  }
  const stLabel = st => (st === '기준 넘음' ? '기준 미달' : st); // 화면 낱말은 '기준 미달 항목 수'와 같게. 원장 상태 값은 그대로
  const ROW_CLASS = { '기준 넘음': 'over', '기준 안': 'in', '자료 없음': 'none', '기준 승인 대기': 'wait', '공식 기준 없음': 'nostd', '수집 중': 'soon', '추세 전망': 'fore', '행정 지정': 'desig', '미지정': 'in', '보류': 'none' };
  // 고정 문구(docs/legal/ai_ethics.md 1부 · 총괄 지시 2026-10-24). 화면마다 상시 표시
  const FORE_FIXED = '과거 추세를 이어 본 계산입니다. 판정이나 투자·거래 조언이 아니며, 정책·경기 변화로 달라질 수 있습니다. 표시된 범위는 불확실성 구간입니다.';
  const SAFE_FIXED = 'CCTV·보안등·경찰관서까지의 거리는 확인된 시설 현황입니다. 범죄 발생이나 안전 수준을 의미하지 않으며, 지역 간 순위나 등급을 매기지 않습니다.';
  const AI_HEAD = 'AI가 리뉴맵 원장의 숫자와 출처를 문장으로 옮깁니다. 평가나 판정은 하지 않습니다.';
  const AI_FOOT = 'AI 생성 문장입니다. 공모·계획에 쓰기 전에 원장 화면과 출처를 사람이 확인하세요.';
  const REPORT_FOOT = '판정 아님 · 숫자마다 출처 · AI 문장은 참고용 · 사람 검토 권고';
  // 항목마다 기준·단위 설명 한 줄
  function stdTextOf(r) {
    const ind = r.ind;
    if (ind.pending) return '자료를 모으는 중입니다. 숫자를 만들지 않습니다.';
    if (ind.src === 'forecast') return `${r.held ? `보류 · ${r.held} · ` : ''}${foreLine(ind)}${isNum(r.lo) && isNum(r.hi) ? ` · 80% 구간 ${fmt(r.lo, ind.unit)}~${fmt(r.hi, ind.unit)}` : ''}${ind.level === 'sg' ? ' · 시·군·구 단위' : ''}`;
    if (ind.level === 'sg') return `시·군·구 단위 자료 · 읍·면·동 값이 아닙니다${ind.group === 'estate' ? ` · ${ESTATE_NOTE}` : ''}${r.since ? ` · 지정 ${r.since}` : ''}${isNum(r.abs) ? ` · 순이동 ${fmt(r.abs, '명')}` : ''}`;
    if (ind.standard) return `기준 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · ${ind.standard.status}${r.crossed ? ' · 기준선 넘은 쪽' : r.crossed === false ? ' · 기준선 안쪽' : ''}` : ''}`;
    if (ind.group === 'safe') return SAFE_NOTE;
    return ind.ref ? '공식 기준 없음 · 참고 구간' : '공식 기준 없음';
  }
  const rowText = r => r.text || fmt(r.value, r.ind.unit) || '–';
  // 한눈 요약: 항목마다 점 하나를 묶음별로 늘어놓는다. 도넛(비율)이 아니라 개수만 — 순위·점수 아님
  const dotOf = r => (r.ind.pending ? 'p' : r.status === '기준 넘음' || r.status === '행정 지정' ? 'r' : r.status === '기준 안' || r.status === '미지정' ? 'g' : r.status === '기준 승인 대기' ? 'y' : r.value === null ? 'w' : 'b');
  function glanceHTML(rows) {
    const list = rows.filter(r => !r.ind.composite && r.ind.group !== 'sum' && r.ind.group !== 'fore'), n = k => list.filter(r => dotOf(r) === k).length; // 수집 중(p)은 점만 찍고 도넛 개수에는 넣지 않는다
    const groups = GROUPS.filter(([g]) => list.some(r => r.ind.group === g)).map(([g, gl]) => `<span class="gl-grp"><span class="gl-k">${gIco(g)}${esc(gl)}</span>${list.filter(r => r.ind.group === g).map(r => `<i class="gl-${dotOf(r)}" title="${esc(r.ind.label)} · ${esc(stLabel(r.status))}"></i>`).join('')}</span>`).join('');
    const counts = Object.fromEntries(DONUT.map(([k]) => [k, n(k)]));
    return `<div class="sr-glance" role="img" aria-label="한눈 요약. 기준 미달 또는 행정 지정 ${n('r')}개, 기준 안 ${n('g')}개, 기준 승인 대기 ${n('y')}개, 공식 기준 없음 ${n('b')}개, 자료 없음 ${n('w')}개. 항목마다 점 하나이며 순위·점수가 아닙니다.">` +
      `<div class="gl-top">${donutSVG(counts)}<ul class="gl-n">${DONUT.map(([k, l]) => `<li><b class="gl-sw sw-${k}" aria-hidden="true"></b>${l} <b>${counts[k]}</b></li>`).join('')}</ul></div><p class="gl-dots">${groups}</p><p class="gl-note">묶음별 점 하나가 항목 하나 · 순위·점수 아님</p></div>`;
  }
  // 세부항목별 척도표. detail(cell) → [[라벨, 값, 링크]] (dashboard.js detailRows). 그룹·항목 순서 고정
  function scaleTableHTML(rows, opt) {
    const o = opt || {}, t = tally(rows), detail = o.detail || (() => []);
    const dl = cell => `<dl>${detail(cell).map(([k, val, href]) => `<div><dt>${esc(k)}</dt><dd>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(val)}</a>` : esc(val)}</dd></div>`).join('')}</dl>`;
    const led = rows.find(r => r.ind.living && r.ind.group === 'sum' && r.value !== null), confirmed = led ? led.value : t.confirmed;
    const waiting = rows.filter(r => isPending(r.ind.standard)).map(r => r.ind.label);
    const head = `<div class="sr-tally" role="group" aria-label="기준 미달 항목 수"><p class="sr-tally-k">기준 미달 항목 수</p>` +
      `<p class="sr-tally-n"><span>확정 <b data-ck="t-c" data-count="${confirmed}">${confirmed}</b></span><span>추가확인 <b data-ck="t-p" data-count="${t.pending}">${t.pending}</b></span>${led ? '<span class="is-dim">최신 원장 기준</span>' : ''}</p>` +
      `<details class="sr-tally-more"><summary>ⓘ 이 수를 세는 법</summary><p class="sr-tally-note">${led ? `확정은 원장 셀 '${esc(led.ind.label)}' 값이며 하한입니다.<br>쇠퇴 요건은 법정 요건 단위(인구 요건 = 30년 감소 또는 3년 연속 감소)로 셉니다.` : '확정은 법정·공식 기준선을 넘은 항목 수입니다.'}` +
      `<br>추가확인은 기준선을 넘었지만 그 기준이 아직 승인 대기인 항목입니다${waiting.length ? `(${esc(waiting.join('·'))}). 확정 수에는 넣지 않습니다` : ''}.<br>가중치·순위 없이 개수만 셉니다.</p>` +
      (led && led.cell && detail(led.cell).length ? `<div class="map-detail">${dl(led.cell)}</div>` : '') + `</details></div>`;
    const list = rows.filter(r => r.ind.group !== 'sum');
    const curG = (list.find(r => r.ind.code === o.cur) || list[0] || { ind: {} }).ind.group;
    const gsum = g => { const rs = list.filter(r => r.ind.group === g), n = k => rs.filter(r => dotOf(r) === k).length; return DONUT.filter(([k]) => n(k)).map(([k]) => `<span class="gs-${k}">${GS_SHORT[k]} ${n(k)}</span>`).join(''); };
    const groups = GROUPS.filter(([g]) => list.some(r => r.ind.group === g)).map(([g, gl]) => `<li class="sr-group"><details${g === curG ? ' open' : ''}><summary><h4>${gIco(g)}${esc(gl)}</h4><span class="sr-gsum">${gsum(g)}</span></summary>${g === 'safe' ? `<p class="sr-group-note">${esc(SAFE_FIXED)}</p>` : g === 'fore' ? `<p class="sr-group-note">${esc(FORE_FIXED)}</p>` : ''}<ul>${list.filter(r => r.ind.group === g).map(r => {
      const ind = r.ind, tt = trendText(r.delta, ind), cls = ROW_CLASS[r.status];
      const rowsD = r.cell ? detail(r.cell) : [];
      return `<li class="sr is-${cls}${ind.code === o.cur ? ' is-cur' : ''}"><div class="sr-h">${icon(ind.icon)}<span class="sr-l">${esc(ind.label)}${r.sgLevel ? ' <small>시·군·구</small>' : ''}</span><b class="sr-v">${esc(rowText(r))}</b><span class="sr-st st-${cls}">${esc(stLabel(r.status))}</span></div>` +
        (ind.categorical ? '' : `<div class="sr-m">${barSVG(r)}${tt ? `<em class="map-trend ${tt.cls}">${tt.arrow} 5년 ${esc(fmt(r.delta, ind.dEdges ? '' : '%p'))} ${esc(tt.word)}</em>` : ''}</div>`) +
        (r.series && r.series.some(p => p[1] !== null) ? trendSVG(r.series, r.year, ind.label, validStd(ind.standard) ? ind.standard.value : null, ind.unit) : '') +
        `<details class="map-detail sr-why"><summary>ⓘ 기준·출처${r.year ? ` (${esc(r.year)}년)` : ''}</summary><p class="sr-std">${esc(stdTextOf(r))}</p>${rowsD.length ? dl(r.cell) : ''}</details></li>`;
    }).join('')}</ul></details></li>`).join('');
    return glanceHTML(rows) + gapsHTML(rows) + head + `<ol class="sr-list">${groups}</ol>`;
  }
  // 기준 미달·참고 구간 밖 항목(2026-10-26, 업무 실무자용): 기준선을 넘은 항목(확정·승인 대기)과 자료가 없어 확인이 필요한 항목. 순서 고정, 순위·점수 없음
  function gapRows(rows) {
    return rows.filter(r => !r.ind.composite && r.ind.group !== 'sum' && r.ind.group !== 'fore' && !r.ind.categorical && !r.ind.pending)
      .filter(r => r.crossed === true || r.value === null)
      .map(r => ({ row: r, kind: r.value === null ? '자료 없음' : isPending(r.ind.standard) ? '기준 미달(승인 대기)' : '기준 미달' }));
  }
  function gapsHTML(rows, opt) {
    const g = gapRows(rows), o = opt || {};
    const line = x => { const r = x.row, ind = r.ind, c = r.cell || {}, src = c.source_name || ind.source || SOURCE_DEFAULT;
      return `<li class="gp is-${r.value === null ? 'none' : 'over'}"><b>${esc(ind.label)}</b>${r.sgLevel ? '<small class="gp-sg">시·군·구</small>' : ''}<span class="gp-v">${esc(rowText(r))}</span><span class="gp-s">${esc(x.kind)}</span>` +
        `<small class="gp-std">${esc(validStd(ind.standard) ? `기준 ${ind.standard.text}` : stdTextOf(r).split(' · ')[0])} · 출처 ${esc(src)}${r.year ? ` · ${esc(r.year)}년` : ''}</small></li>`; };
    const nNull = g.filter(x => x.row.value === null).length;
    return `<details class="sr-gaps"${o.open ? ' open' : ''}><summary>${icon('flag')}확인할 항목 <b>${g.length}</b>개 <small>기준 미달 ${g.length - nNull} · 자료 없음 ${nNull}</small></summary>${g.length ? `<ul>${g.map(line).join('')}</ul>` : '<p class="gp-empty">기준선을 넘거나 자료가 없는 항목이 없습니다.</p>'}` +
      `<p class="gp-note">기준 미달은 승인된 기준선을 넘은 항목, (승인 대기)는 기준이 아직 승인 전인 항목, 자료 없음은 확인이 필요한 항목입니다. 순위·점수가 아닙니다.</p></details>`;
  }
  function tooltipHTML(it, ind, mode, year, source) {
    const t = mode === 'trend' ? trendText(it.value, ind) : null;
    const band = isNum(it.lo) && isNum(it.hi) ? `<br>80% 구간 ${esc(fmt(it.lo, ind.unit))}~${esc(fmt(it.hi, ind.unit))} · ${FORE_NOTE}` : ind.level === 'sg' ? `<br>시·군·구 단위${isNum(it.abs) ? ` · 순이동 ${esc(fmt(it.abs, '명'))}` : ''}${it.since ? ` · 지정 ${esc(it.since)}` : ''}` : '';
    return `<b>${esc(it.name)}</b>${it.kind ? ` <small>${esc(it.kind)}</small>` : ''}<br>${esc(ind.label)}${mode === 'trend' ? ' 5년 변화' : ''} ${esc(it.text)}${t ? ` ${t.arrow} ${t.word}` : ''}${isNum(it.n) && it.n > 0 ? `<br>그해 기준선 넘은 동 ${esc(it.over ?? '–')}곳 / ${esc(it.n)}곳` : ''}${band}<br>${it.year ? `${esc(it.year)}년 · ` : ''}${esc(ind.source || source || SOURCE_DEFAULT)}`;
  }
  // 범례 아래 기준선 한 줄. 지도 이미지(PNG)도 같은 글을 쓴다
  function stdLineOf(ind, off) {
    return off ? (ind.held ? `보류 · ${ind.held} · 숫자를 만들지 않습니다` : '수집 중 · 자료가 오기 전에는 숫자를 만들지 않습니다')
      : ind.src === 'forecast' ? foreLine(ind) : ind.group === 'safe' ? SAFE_NOTE : ind.group === 'estate' ? '공식 기준 없음 · 참고 구간' /* 실거래 고정 문구는 바로 아래 줄에 상시 */
        : ind.standard ? `기준선 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · 기준 ${ind.standard.status}` : ''}`
          : ind.composite ? '자료 없는 항목·승인 대기 기준은 세지 않음(하한)' : ind.ref ? '공식 기준 없음 · 참고 구간' : ind.categorical ? '행정 지정 상태 · 좋고 나쁨 축 아님' : '공식 기준 없음 · 값 있는 곳만 한 색';
  }
  function legendHTML(ind, mode, source, year, avail) {
    const s = scaleFor(ind, mode), off = avail === false || ind.pending, stdLine = stdLineOf(ind, off);
    return `<div class="map-legend"><p class="map-legend-title">${esc(off ? ind.label : s.title)}</p><ul aria-label="지도 색 구간">${legendItems(ind, off ? 'now' : mode).filter(l => !off || l.hatch).map((l, i) =>
      `<li data-i="${i}"><i class="${l.hatch ? 'is-hatch' : ''}" data-bg="${esc(l.color)}"></i>${esc(off ? (ind.held ? '보류' : '수집 중') : l.label)}</li>`).join('')}</ul>` +
      `<p class="map-legend-std${off || isPending(ind.standard) || !ind.standard ? ' is-flag' : ''}">${esc(stdLine)}</p>` +
      (ind.src === 'forecast' ? `<p class="map-legend-note">${esc(FORE_FIXED)}</p>` : ind.group === 'safe' ? `<p class="map-legend-note">${esc(SAFE_FIXED)}</p>` : ind.group === 'estate' ? `<p class="map-legend-note">${esc(ind.note || ESTATE_NOTE)}<br>${esc(ESTATE_PROV)}.</p>` : '') + // 수집 중에도 고정 문구는 상시
      `<p class="map-legend-note">판정 아님 · 출처 ${esc(ind.source || source || SOURCE_DEFAULT)} · ${ind.latest ? `최근 달 ${String(ind.latest).slice(0, 4)}.${String(ind.latest).slice(4, 6)}` : `기준연도 ${esc(year ?? '자료 없음')}`}</p></div>`;
  }
  // ── 동네 보고서: 원장 셀 값으로만 만든 결정적 문장. 평가어 없음, 숫자는 셀 값 그대로 ──
  const josa = label => { const last = String(label).replace(/[^가-힣]+$/, '').slice(-1); return last ? ((last.charCodeAt(0) - 0xac00) % 28 ? '은' : '는') : '은(는)'; };
  function reportSentences(name, rows) {
    return rows.filter(r => r.value !== null && !r.ind.composite && r.ind.group !== 'sum').map(r => {
      const ind = r.ind, c = r.cell || {}, v = rowText(r), y = r.year ? `${r.year}년` : null;
      const src = c.source_name || ind.source || SOURCE_DEFAULT, ref = c.reference_date ? String(c.reference_date).slice(0, 10) : null;
      const where = r.sgLevel ? `이 동이 속한 시·군·구의 ${ind.label}` : `${name}의 ${ind.label}`;
      const std = validStd(ind.standard) ? `${isPending(ind.standard) ? '승인 대기 중인 기준' : '기준'}(${ind.standard.text}) ${r.crossed ? '선을 넘습니다' : '안에 있습니다'}` : null;
      const fore = ind.src === 'forecast' && isNum(r.lo) && isNum(r.hi) ? `80% 구간은 ${fmt(r.lo, ind.unit)}~${fmt(r.hi, ind.unit)}이며 ${FORE_NOTE}` : null;
      const tail = std ? `로, ${std}.` : fore ? `로 계산됩니다. ${fore}입니다.` : '입니다.';
      return { code: ind.code, group: ind.group, label: ind.label, value: v, year: r.year ?? null, source: src, ref, url: safeUrl(c.source_url),
        text: `${where}${josa(ind.label)} ${v}${y ? `(${y})` : ''}${tail} 출처 ${src}${ref ? `, 기준일 ${ref}` : ''}.` };
    });
  }
  // AI가 다듬은 문장: 원래 문장에 없는 숫자가 하나라도 있으면 거부한다(숫자를 만들거나 반올림하지 않는다)
  const numsIn = t => (String(t || '').match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, ''));
  function verifyPolished(text, original) {
    const allowed = new Set(numsIn(original)), bad = [...new Set(numsIn(text).filter(n => !allowed.has(n)))];
    const banned = ['좋', '나쁘', '나쁜', '위험', '열악', '우수', '심각', '양호', '낙후', '추천', '유망', '피해야', '기피', '등급', '순위'].filter(w => String(text || '').includes(w));
    return bad.length || banned.length || !String(text || '').trim() ? { ok: false, bad, banned } : { ok: true, text: String(text) };
  }
  // ── 사업 근거서(업무 실무자용, 2026-10-26): 동네 보고서의 변형. 현황 → 기준 대비 → 기준 미달·확인 필요 → 출처·계산식(펼친 상태). 평가·권고 문장 없음, 결정은 담당자가 ──
  const BRIEF_HEAD = '예산 요구·사업계획·민원 회신 첨부용 근거 자료 · 리뉴맵 원장 기반 · 판정 아님 · 결정은 담당자가';
  const BRIEF_FOOT = '판정 아님 · 숫자마다 출처 · 결정은 담당자가';
  const BRIEF_MAIL = 'renewmapteam@gmail.com';
  const REPORT_MODES = [['report', '동네 보고서'], ['brief', '사업 근거서'], ['onepage', '1쪽 요약']];
  const reportModeHTML = mode => `<div class="dash-seg rp-mode" role="group" aria-label="보고서 용도">${REPORT_MODES.map(([k, l]) => `<button type="button" data-rp-mode="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div>`;
  // 파일(HWPX·XLSX)은 이 브라우저에서 바로 만든다(docgen.js). 메일 요청은 내부망에서 파일 생성이 막힐 때를 위한 보조 경로로만 남긴다
  function briefMailto(it, year, what = '근거서') {
    const subject = `${what} HWPX·XLSX 요청 [${it.name}·${it.code}]`, body = `동: ${it.name} (${it.code})\n요청 형식: HWPX·XLSX\n기준연도: 쇠퇴 지표 ${year ?? '최신 연도'} · 생활 지표는 항목별 기준연도\n무료 · 1영업일 안에 회신합니다.`;
    return `mailto:${BRIEF_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  // 출처 머리말: 원본 기관명이 앞, 가공(리뉴맵)이 뒤
  const srcHead = where => (DG ? DG.SRC_HEAD(where) : '');
  const copyHead = caption => `<div class="dg-tbl-h" aria-live="polite"><b>${esc(caption)}</b>${DG ? `<button type="button" class="btn ghost dg-copy" data-copy-table>${esc(DG.COPY_TABLE)}</button>` : ''}</div>`;
  // 내려받기·인쇄·보조 메일 요청. 1쪽 요약에서는 HWPX가 1쪽 문서다
  const fileTools = (it, year, what, one) => `<button type="button" class="btn ghost" data-print>인쇄·PDF</button>` + (DG ? `<button type="button" class="btn" data-dl="hwpx">HWPX 받기${one ? '(1쪽)' : ''}</button><button type="button" class="btn" data-dl="xlsx">XLSX 받기</button><button type="button" class="btn" data-dl="docx">DOCX 받기</button><button type="button" class="btn" data-dl="pptx">PPTX 받기</button>` : '') +
    `<a class="btn ghost rp-mail" href="${esc(briefMailto(it, year, what))}">HWPX·XLSX 요청(무료 · 1영업일)</a>`;
  // 양식에 붙일 조각(문장 5개 이하 + 표 1개 + 출처 줄): 양식을 고르면 그 양식 항목 순서대로 만든다(data-frag-out). 양식 정의는 data/report_templates.json
  function fragPanelHTML(sel) {
    if (!DG || !DG.getTemplates()) return '';
    const ch = DG.fragmentChoices(), cur = sel && sel.id ? ch.find(c => c.id === sel.id) : null;
    return `<section class="rp-g rp-frag" aria-labelledby="fragTitle"><h3 id="fragTitle">양식에 붙일 표 조각</h3><div class="rp-frag-ctl"><label class="map-select">양식 순서<select data-frag-preset><option value="">양식을 고르세요</option>${ch.map(c => `<option value="${esc(c.id)}"${cur && c.id === cur.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>` +
      (cur && cur.variants.length > 1 ? `<label class="map-select">내용<select data-frag-variant>${cur.variants.map(v => `<option value="${esc(v.id)}"${v.id === sel.variant ? ' selected' : ''}>${esc(v.title)}</option>`).join('')}</select></label>` : '') + `</div>` +
      `<p class="map-note">고른 양식의 항목 순서대로 문장과 표를 만들고, 복사해 한글·엑셀 양식에 붙여 넣습니다.<br>값이 없는 항목은 '자료 없음'으로 남기고, 출처 번호는 이 조각 안에서 1부터 다시 매깁니다.</p><div data-frag-out aria-live="polite"></div></section>`;
  }
  function briefHTML(v, it, rows, sel) {
    const here = v.crumbs.map(c => c.label).join(' › '), dy = rows.find(r => r.ind.series && r.year)?.year ?? null;
    const facts = rows.filter(r => r.value !== null && !r.ind.composite && r.ind.group !== 'sum');
    const srcOf = r => { const c = r.cell || {}; return { name: c.source_name || r.ind.source || SOURCE_DEFAULT, url: safeUrl(c.source_url), ref: c.reference_date ? String(c.reference_date).slice(0, 10) : null, formula: c.formula_text || null, rule: c.rule_version || null }; };
    const fact = r => { const s = srcOf(r); return `<tr><td>${esc(r.ind.label)}${r.sgLevel ? ' <small>시·군·구</small>' : ''}</td><td>${esc(rowText(r))}</td><td>${r.year ? `${esc(r.year)}년` : esc(s.ref || '기록 없음')}</td><td>${esc(s.name)}${s.ref ? ` · 기준일 ${esc(s.ref)}` : ''}</td></tr>`; };
    const sec1 = `<section class="rp-g"><h3>1. 현황</h3>${GROUPS.filter(([g]) => facts.some(r => r.ind.group === g)).map(([g, gl]) => `<h4 class="map-h4">${gIco(g)}${esc(gl)}</h4>${g === 'safe' ? `<p class="rp-fixed">${esc(SAFE_FIXED)}</p>` : g === 'fore' ? `<p class="rp-fixed">${esc(FORE_FIXED)}</p>` : ''}` +
      `<div class="dg-tbl">${copyHead(gl)}<div class="table-wrap"><table class="rp-tbl rp-facts"><thead><tr><th>항목</th><th>값</th><th>기준연도</th><th>출처</th></tr></thead><tbody>${facts.filter(r => r.ind.group === g).map(fact).join('')}</tbody></table></div></div>`).join('')}</section>`;
    const std = facts.filter(r => validStd(r.ind.standard));
    const sec2 = `<section class="rp-g"><h3>2. 기준 대비</h3>${std.length ? `<div class="dg-tbl">${copyHead('기준 대비')}<div class="table-wrap"><table class="rp-tbl"><thead><tr><th>항목</th><th>값</th><th>기준</th><th>상태</th></tr></thead><tbody>${std.map(r => `<tr><td>${esc(r.ind.label)}</td><td>${esc(rowText(r))}</td><td>${esc(r.ind.standard.text)}${r.ind.standard.source ? ` · ${esc(r.ind.standard.source)}` : ''}</td><td>${esc(stLabel(r.status))}</td></tr>`).join('')}</tbody></table></div></div>` : '<p class="map-note">기준이 있는 항목의 값이 없습니다.</p>'}` +
      `<p class="map-note">상태는 기준선과의 사실 비교입니다. 승인 대기 기준은 확정 수에 넣지 않습니다.</p></section>`;
    const sec3 = `<section class="rp-g"><h3>3. 기준 미달·확인 필요 목록</h3>${gapsHTML(rows, { open: true })}</section>`;
    const sec4 = `<section class="rp-g"><h3>4. 출처·계산식 표</h3><div class="dg-tbl">${copyHead('출처·계산식')}<div class="table-wrap"><table class="rp-tbl"><thead><tr><th>항목</th><th>값</th><th>출처</th><th>기준일</th><th>계산식</th><th>규칙 버전</th></tr></thead><tbody>${facts.map(r => { const s = srcOf(r);
      return `<tr><td>${esc(r.ind.label)}</td><td>${esc(rowText(r))}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.ref || (r.year ? `${r.year}년` : '기록 없음'))}</td><td>${esc(s.formula || '기록 없음')}</td><td>${esc(s.rule || '기록 없음')}</td></tr>`; }).join('')}</tbody></table></div></div></section>`;
    return `<div class="rp-head"><p class="rp-crumb">${esc(here)}</p><h3 class="rp-title">${esc(it.name)} 사업 근거서</h3><p class="rp-tools">${fileTools(it, dy, '근거서', false)}</p></div>` +
      `<p class="rp-intro rp-src-line">${esc(srcHead('4. 출처·계산식 표'))}</p><p class="rp-intro rp-brief-head">${esc(BRIEF_HEAD)}</p><p class="rp-intro">${esc(here)} · ${esc(it.kind || '행정동')} ${esc(it.code)} · 쇠퇴 지표 ${dy ? `${esc(dy)}년` : '최신 연도'} · 생활 지표는 항목별 기준연도</p>${fragPanelHTML(sel || '')}${sec1}${sec2}${sec3}${sec4}<p class="rp-foot">${esc(BRIEF_FOOT)}</p>`;
  }
  // 1쪽 요약: 제목·개요 4줄·요약 문장 5개·기준 대비 표(8행 이하)·출처 번호·끝. one = DG.buildOnepage(...) 결과. 인쇄하면 A4 한 쪽
  function onepageHTML(v, it, one, sel) {
    const here = v.crumbs.map(c => c.label).join(' › ');
    return `<div class="rp-head"><p class="rp-crumb">${esc(here)}</p><p class="rp-tools">${fileTools(it, one.brief.year, '1쪽 요약', true)}</p></div>` +
      `<div class="dg-doc dg-onepage">${DG.docHTML(one, { copy: true }).html}</div>${fragPanelHTML(sel)}<p class="rp-foot">${esc(BRIEF_FOOT)}</p>`;
  }
  // ── 기기 안 AI(Chrome 내장 AI의 Rewriter·Summarizer 전역 API). 문장을 서버로 보내지 않는다 ──
  // developer.chrome.com/docs/ai 확인(2026-10-24): availability()는 'unavailable'|'downloadable'|'downloading'|'available', create()는 사용자 클릭(활성화) 뒤에만,
  // Summarizer는 Chrome 138 정식, Rewriter는 오리진 트라이얼. 공식 지원 언어 목록(en·ja·es·de·fr)에 한국어가 없어 'ko'를 요청해 거절되면 '쓸 수 없음'으로 둔다
  const AI_LANG = { expectedInputLanguages: ['ko'], expectedContextLanguages: ['ko'], outputLanguage: 'ko' };
  const AI_APIS = [['Rewriter', { ...AI_LANG, tone: 'as-is', format: 'plain-text', length: 'as-is' }], ['Summarizer', { ...AI_LANG, type: 'tldr', format: 'plain-text', length: 'long' }]];
  const AI_CONTEXT = '도시재생 기초조사 원장 문장입니다. 숫자·연도·출처 이름을 바꾸거나 새로 만들지 말고, 좋다·나쁘다·위험하다 같은 평가 없이 읽기 쉬운 한국어 문단으로 옮기세요.';
  const AI_DEV_BTN = 'AI 문장 다듬기 (내 기기 안에서 실행 · 서버 전송 없음)';
  const AI_LABEL = 'AI 생성 문장 · 사람 검토 권고';
  const AI_UNSUPPORTED = '이 브라우저는 기기 내 AI를 지원하지 않습니다(Chrome 최신 버전).';
  // 첫 화면에서는 API가 있는지만 본다. 언어 확인(availability)은 거절되면 브라우저가 콘솔 오류를 남기므로 사용자가 누를 때 한다
  function presentDeviceAI(g) { const a = AI_APIS.find(([n]) => g && g[n] && typeof g[n].availability === 'function'); return a ? { api: a[0], status: 'unknown' } : { api: null, status: 'unsupported' }; }
  async function detectDeviceAI(g) {
    let seen = false;
    for (const [name, opts] of AI_APIS) {
      const A = g && g[name];
      if (!A || typeof A.availability !== 'function' || typeof A.create !== 'function') continue;
      seen = true;
      let st;
      try { st = await A.availability(opts); } catch (e) { st = 'unavailable'; } // 지원하지 않는 언어 조합은 거절(예외)로 온다
      if (['available', 'downloadable', 'downloading'].includes(st)) return { api: name, status: st };
    }
    return { api: null, status: seen ? 'unavailable' : 'unsupported' };
  }
  async function runDeviceAI(g, api, original, onProgress) {
    const opts = (AI_APIS.find(a => a[0] === api) || [])[1];
    if (!opts || !g[api]) return { ok: false, bad: [], banned: [] };
    const m = await g[api].create({ ...opts, sharedContext: AI_CONTEXT, monitor(mon) { mon.addEventListener('downloadprogress', e => onProgress && onProgress(e.loaded, e.total)); } });
    try {
      const out = api === 'Rewriter' ? await m.rewrite(original, { context: AI_CONTEXT }) : await m.summarize(original, { context: AI_CONTEXT });
      return verifyPolished(out, original);
    } finally { if (typeof m.destroy === 'function') m.destroy(); }
  }
  // 상태별 버튼·안내. 미지원이면 버튼을 끄고 결정적 보고서는 그대로 둔다. 내려받기는 사용자가 누를 때만
  function aiDevHTML(det) {
    const s = det ? det.status : 'checking', on = ['available', 'downloadable', 'downloading', 'unknown'].includes(s);
    const note = { checking: '이 브라우저의 기기 내 AI를 확인하는 중입니다.', unknown: '이 브라우저에 기기 내 AI가 있습니다.<br>누르면 한국어를 지원하는지 먼저 확인합니다. 아직 아무것도 내려받지 않습니다.', unsupported: `${AI_UNSUPPORTED}<br>아래 원장 문장은 그대로 쓸 수 있습니다.`,
      unavailable: '이 브라우저에 기기 내 AI가 있지만 한국어를 지원하지 않거나 기기 사양이 맞지 않습니다.<br>아래 원장 문장은 그대로 쓸 수 있습니다.',
      downloadable: '처음 한 번 Chrome이 기기 내 AI 모델을 내려받습니다.<br>Chrome 안내 기준 저장 공간이 22GB 이상 비어 있어야 합니다(모델 자체는 더 작습니다).<br>버튼을 누르기 전에는 내려받지 않습니다.',
      downloading: 'Chrome이 기기 내 AI 모델을 내려받는 중입니다.<br>끝나면 바로 다듬을 수 있습니다.',
      available: '문장은 이 기기 안에서만 처리되고 서버로 보내지 않습니다.<br>입력을 저장하지 않습니다.' }[s];
    return `<button type="button" class="btn ghost rp-ai-btn" data-ai-run${on ? '' : ' disabled aria-disabled="true"'}>${esc(AI_DEV_BTN)}</button><p class="rp-ai-note is-${esc(s)}">${note}</p>`;
  }
  const liveText = (v, it, ind, mode) => `${v.crumbs.map(c => c.label).join(' › ')}${it ? ` › ${it.name}. ${ind.label}${mode === 'trend' ? ' 5년 변화' : ''} ${it.text}${it.year ? `, ${it.year}년` : ''}.` : `. ${v.step ? v.step + ' 단계' : ''}`}`;
  const ICONS = {
    bldg: 'M3 14V4l5-2v12M8 6h5v8M1 14h14M5 6v1M5 9v1M10 9v1M10 11v1', check: 'M2 8l4 4 8-8',
    popdown: 'M5 3a2 2 0 1 0 .1 0M2 14v-2a3 3 0 0 1 6 0v2M12 4v8m-2.5-2.5L12 12l2.5-2.5', people: 'M6 3a2 2 0 1 0 .1 0M11 4.5a1.6 1.6 0 1 0 .1 0M2 14v-1.5a4 4 0 0 1 8 0V14M10 10.5a3 3 0 0 1 4.5 2.5V14',
    elder: 'M7 2a1.5 1.5 0 1 0 .1 0M7 6v4l-2 4M7 10l2 4M5 7.5l4 1M12 8v6', youth: 'M8 2a1.5 1.5 0 1 0 .1 0M8 6v4l-2 4M8 10l2 4M4 6l4 1 4-1',
    shop: 'M2 6l1.5-3h9L14 6M2 6h12M3 6v8h10V6M6.5 14v-4h3v4', hosp: 'M2 3h12v11H2zM8 6v5M5.5 8.5h5',
    book: 'M2 3.5c2-1 4-1 6 .5 2-1.5 4-1.5 6-.5V13c-2-1-4-1-6 .5-2-1.5-4-1.5-6-.5zM8 4v9.5', tree: 'M8 2l4.5 7h-3l3 4h-9l3-4h-3zM8 13v2',
    bus: 'M3 2h10v10H3zM3 8h10M5 12v2M11 12v2', amb: 'M1 5h9v7H1zM10 7h3l2 3v2h-5M5.5 6.5v4M3.5 8.5h4', sum: 'M12 3H4l4 5-4 5h8', dot: 'M8 5a3 3 0 1 0 .1 0',
    cctv: 'M2 5l9-2 1 3-9 3zM3 9v4M3 13h4M11 4l3 2', lamp: 'M8 2v3M4 5h8l-2 4H6zM8 9v5M5 14h6', police: 'M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4zM8 5v5M5.5 7.5h5',
    move: 'M2 8h9M8 4l4 4-4 4M13 3v10', home: 'M2 8l6-5 6 5M4 7v7h8V7M7 14v-4h2v4', flag: 'M3 2v12M3 3h9l-2 3 2 3H3', fore: 'M2 12l4-5 3 3 5-7M9 3h5v5',
  };
  const icon = k => `<svg class="map-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${ICONS[k] || ICONS.dot}"/></svg>`;

  // ── 기준일 스냅샷 비교(경쟁·시장 보고서 학습 2026-10-29): 1차 초안 때 값을 이 기기에 저장해 두고, 보완 때 바뀐 항목만 표로 ──
  // 용역은 착수~납품 12개월 안팎이라 그사이 통계가 갱신된다. 값·기준일·판정을 함께 남겨 '무엇이 바뀌어 판정이 달라졌는지'를 보인다. 전망은 넣지 않는다
  const SNAP_KEY = 'renewmap.snap.v1.';
  const refOf = r => (r.cell && r.cell.reference_date) || (r.year ? `${r.year}년` : null);
  function snapshotOf(it, rows, now) {
    return { v: 1, code: it.code, name: it.name, saved_at: now.toISOString(),
      items: rows.filter(r => r.ind.group !== 'fore' && !r.ind.pending).map(r => ({ c: r.ind.code, l: r.ind.label, u: r.ind.unit || '', v: r.value ?? null, t: rowText(r), s: stLabel(r.status), d: refOf(r) })) };
  }
  // 반환 { rows: [{ kind: 'new'|'changed'|'gone', flip, prev, cur }], same }. flip = 판정(기준 미달·기준 안 등)이 바뀜
  function diffSnap(prev, cur) {
    const before = new Map((prev.items || []).map(x => [x.c, x])), now = new Set(cur.items.map(x => x.c)), out = [];
    let same = 0;
    for (const x of cur.items) {
      const p = before.get(x.c), flip = !!p && p.s !== x.s;
      if (!p) out.push({ kind: 'new', flip: false, prev: null, cur: x });
      else if (p.v !== x.v || p.d !== x.d || flip) out.push({ kind: 'changed', flip, prev: p, cur: x });
      else same++;
    }
    for (const p of prev.items || []) if (!now.has(p.c)) out.push({ kind: 'gone', flip: false, prev: p, cur: null });
    return { rows: out, same };
  }
  const deltaText = d => (d.prev && d.cur && isNum(d.prev.v) && isNum(d.cur.v) ? `${d.cur.v - d.prev.v >= 0 ? '+' : ''}${fmt(Math.round((d.cur.v - d.prev.v) * 100) / 100, d.cur.u === '%' ? '%p' : d.cur.u)}` : d.kind === 'new' ? '새 항목' : d.kind === 'gone' ? '빠짐' : '');
  function snapHTML(prev, cur) {
    const head = `<section class="rp-g rp-snap"><h3>${icon('fore')}기준일 비교</h3>`;
    if (!prev) return head + '<p class="rp-intro">지금 값을 이 기기에 저장해 두면, 사전컨설팅·보완 때 다시 열어 바뀐 항목만 표로 볼 수 있습니다.<br>서버로 보내지 않습니다.</p><p class="rp-tools"><button type="button" class="btn ghost" data-snap-save>지금 값 저장</button></p></section>';
    const d = diffSnap(prev, cur), flips = d.rows.filter(x => x.flip).length, when = String(prev.saved_at).slice(0, 10);
    const cell = x => (x ? `${esc(x.t)}<br><small>${esc(x.d || '기준일 기록 없음')}</small>` : '–');
    const table = d.rows.length ? `<div class="dg-tbl">${copyHead('기준일 비교')}<div class="table-wrap"><table class="rp-tbl rp-snap-tbl"><thead><tr><th>항목</th><th>저장 때(${esc(when)})</th><th>지금</th><th>변동</th><th>판정</th></tr></thead><tbody>` +
      d.rows.map(x => `<tr class="${x.flip ? 'is-flip' : ''}"><td>${esc((x.cur || x.prev).l)}</td><td>${cell(x.prev)}</td><td>${cell(x.cur)}</td><td>${esc(deltaText(x))}</td><td>${x.flip ? `<b>${esc(x.prev.s)} → ${esc(x.cur.s)}</b>` : esc((x.cur || x.prev).s)}</td></tr>`).join('') + '</tbody></table></div></div>'
      : '<p>저장한 뒤 바뀐 값이 없습니다.</p>';
    return head + `<p class="rp-snap-sum">${esc(when)} 저장분 대비 바뀐 항목 <b>${d.rows.length}</b>개 · 판정 바뀜 <b>${flips}</b>개 · 그대로 ${d.same}개</p>${table}` +
      '<p class="rp-tools"><button type="button" class="btn ghost" data-snap-save>지금 값으로 다시 저장</button><button type="button" class="btn ghost" data-snap-clear>저장 지우기</button></p></section>';
  }
  const snapGet = code => { try { return JSON.parse(localStorage.getItem(SNAP_KEY + code) || 'null'); } catch (e) { return null; } };
  const api = { snapshotOf, diffSnap, snapHTML, icon, INDICATORS, GROUPS, MODES, NULL_COLOR, BELOW, ABOVE, MIG, DESIG, DESIG_NONE, MIG_CODE, DESIG_CODE, SOURCE_DEFAULT, SUM, LIVING_EXPECTED, FORE_NOTE, FORE_FIXED, SAFE_NOTE, SAFE_FIXED, AI_HEAD, AI_FOOT, REPORT_FOOT,
    ESTATE_NOTE, ESTATE_PROV, indOf, keyOf, binIndex, edgeLabels, scaleFor, colorOf, legendItems, trendText, crossed, isPending, extraIndicators, sgExtra, fcOf,
    livingIndicators, allIndicators, isAvailable, parseHash, toHash, childrenOf, leavesOf, leafRoute, resolve, searchEntries, findEntry, summaryOf, rowOf, tally, sigunguModel, seriesOf, valueAt,
    latestYear, yearsOf, dongRows, dongModel, crossedCount, playYears, sgRow, countOver, overCaption, hasYears, overStd, sparkline, strip, barSVG, scaleTableHTML, glanceHTML, tooltipHTML, legendHTML, liveText, fmt,
    reportSentences, verifyPolished, stdTextOf, olsFit, trendSVG, donutSVG, coverLabel, presentDeviceAI, detectDeviceAI, runDeviceAI, aiDevHTML, AI_APIS, AI_DEV_BTN, AI_LABEL, AI_UNSUPPORTED,
    gapRows, gapsHTML, briefHTML, onepageHTML, fragPanelHTML, briefMailto, reportModeHTML, stdLineOf, BRIEF_HEAD, BRIEF_FOOT, REPORT_MODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewMap = api;
  api.countUp = el => countUp(el); // find.js·hero.js가 같은 카운트업을 쓴다

  // ── 브라우저 ──
  const app = document.getElementById('mapApp'); if (!app) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, coarse = matchMedia('(pointer: coarse)').matches, wide = matchMedia('(min-width: 900px)');
  const fetchJson = url => (window.renewFetch ? window.renewFetch(url) : fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
  // 외부 AI 서버 주소는 비워 둔다(서버로 문장을 보내지 않는다). 다듬기는 기기 안 AI(detectDeviceAI)로만 한다(docs/legal/ai_ethics.md ⑤)
  const AI_POLISH_ENDPOINT = '';
  const state = { route: parseHash(location.hash) || {}, ind: INDICATORS[0].code, mode: 'now', year: null, horizon: null, playing: false, index: undefined, living: undefined, dongIndex: undefined, sgGeo: undefined, sidoGeo: undefined, dash: null, mapErr: false, touched: false,
    migration: undefined, designations: undefined, forecastIdx: undefined, realestate: undefined, templates: undefined };
  const inds = () => allIndicators(state.living, { migration: state.migration, designations: state.designations, forecastIdx: state.forecastIdx, realestate: state.realestate });
  const curInd = () => indOf(state.ind, inds());
  const effMode = ind => (hasTrend(ind) ? state.mode : 'now');
  const horizons = () => (state.forecastIdx && Array.isArray(state.forecastIdx.horizons) ? state.forecastIdx.horizons.filter(isNum) : []);
  const horizon = () => (isNum(state.horizon) && horizons().includes(state.horizon) ? state.horizon : horizons()[0] ?? null);
  const avail = ind => { const v = state.index && resolve(state.index, state.route), e = v && v.level === 'emd' ? emdOf(v.emdCode) : null; return isAvailable(ind, state.index, state.living, e && e.json); };
  // find.js '설치 현황' 카드가 쓴다: 그 묶음의 첫 지표를 고른다(묶음 탭을 누른 것과 같다)
  api.showGroup = g => { const list = inds().filter(i => i.group === g), pick = list.find(avail) || list[0]; if (!pick) return; stopAuto(true); state.ind = pick.code; state.year = null; if (state.index !== undefined) render(); };
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
  // 전망 파일: forecast/index.json이 없으면 시군구 파일도 찾지 않는다
  const forecastOf = code5 => (state.forecastIdx ? lazy('fc:' + code5, () => fetchJson(`data/national/forecast/${code5}.json`).then(j => (j && Array.isArray(j.dongs) ? j : null))) : null);
  const extOf = v => ({ migration: state.migration, designations: state.designations, forecastIdx: state.forecastIdx, realestate: state.realestate, horizon: horizon(),
    forecast: v && v.level === 'emd' ? forecastOf(v.emdCode) || null : null, sg: v ? (v.gu || v.sigungu || null) : null });
  let timer = null, autoT = null, lastLegend = '', lastLive = '', lastDong = null;
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
      const lv = livingOf(v.emdCode) || null, json = e.json || { dongs: [] }, years = yearsOf(json), ext = extOf(v);
      const year = state.year !== null && years && state.year >= years.min && state.year <= years.max ? state.year : null;
      let items = dongModel(json, ind, mode, year, lv, list, ext);
      const node = v.gu || v.sigungu;
      if (ind.level === 'sg' && node) { const x = sgExtra(ind, node, ext); items = items.map(it => ({ ...it, value: x.value, year: x.year, text: `${x.text} · 시·군·구 값`, color: x.color })); }
      // selYear: 사용자가 고른 연도(없으면 null → 쇠퇴 지표는 동마다 최신 연도). 생활 지표의 기준연도를 쇠퇴 시계열에 쓰지 않는다
      return { kind: 'emd', items, years, selYear: year, year: year ?? (items.find(i => i.year)?.year ?? null), geo: e.geo, json, living: lv, nodata: !e.json, ext };
    }
    const sgs = v.level === 'nation' ? leavesOf(state.index) : v.level === 'sido' ? leavesOf(state.index, v.sido.code2) : v.children;
    const items = sigunguModel(sgs, ind, mode, list, state.year, extOf(v));
    return { kind: 'sg', items, sgs: v.level === 'nation' ? null : sgs, year: (isNum(state.year) && ind.series && mode === 'now' ? state.year : null) ?? items.find(i => i.year)?.year ?? null };
  }
  const coverMemo = new Map();
  const cover = i => { const k = i.code + ':' + !!state.index; if (!coverMemo.has(k)) coverMemo.set(k, coverLabel(i, state.index)); return coverMemo.get(k); };
  // 일부 시·도에만 값이 있는 지표(부산만 등)는 그 시·도 밖(전국 포함)에서 칩을 숨기고, 수집 중·보류 칩도 숨긴다. 지금 고른 지표는 남긴다
  const coverSidos = i => { const k = `S:${i.code}:${!!state.index}`; if (!coverMemo.has(k)) coverMemo.set(k, cover(i) && cover(i) !== '동 단위' ? new Set(leavesOf(state.index).filter(sg => isNum(summaryOf(sg, i.code).value)).map(sg => String(sg.sido2))) : null); return coverMemo.get(k); };
  const chipShown = (i, cur, v) => i.code === cur || (avail(i) && !(coverSidos(i) && !(v && v.sido && coverSidos(i).has(String(v.sido.code2)))));
  function indCtlHTML(ind) {
    const v = state.index && resolve(state.index, state.route), list = inds().filter(i => chipShown(i, ind.code, v)), g = ind.group;
    const tabs = `<div class="map-groups" role="group" aria-label="지표 묶음">${GROUPS.filter(([k]) => k === g || list.some(i => i.group === k)).map(([k, l]) => `<button type="button" data-group="${k}" aria-pressed="${k === g}">${gIco(k)}${esc(l)}</button>`).join('')}</div>`;
    const chips = `<div class="dash-chips map-inds" role="group" aria-label="${esc(GROUPS.find(x => x[0] === g)[1])} 지표">${list.filter(i => i.group === g).map(i => { const ok = avail(i);
      return `<button type="button" class="dash-chip${ok ? '' : ' is-planned'}" data-ind="${esc(i.code)}" aria-pressed="${i.code === ind.code}"${ok ? '' : ' aria-disabled="true"'}>${icon(i.icon)}${esc(i.label)}${ok ? (cover(i) ? `<small class="is-part">${esc(cover(i))}</small>` : '') : `<small>${i.held ? '보류' : '수집 중'}</small>`}</button>`; }).join('')}</div>`;
    return tabs + chips;
  }
  function panelHTML(v, m) {
    const ind = curInd(), mode = effMode(ind), scale = scaleFor(ind, mode), here = v.crumbs[v.crumbs.length - 1].label;
    if (m.kind === 'wait') return `<div class="map-panel-wait">읍·면·동 자료를 불러오는 중입니다.</div>`;
    if (m.kind === 'noemd' || m.nodata) return emptyHTML(`${here} · 읍·면·동 자료 준비 중`, [m.kind === 'noemd' ? '이 지역의 읍·면·동 자료가 아직 없습니다.' : '경계는 있지만 지표 시계열이 아직 없습니다.', '준비되기 전에는 숫자를 보여 드리지 않습니다.']);
    const it = m.items.find(x => x.code === v.dong), dist = ind.level === 'sg' ? `<p class="map-note">${esc(ind.label)}은(는) 시·군·구 단위 자료라 읍·면·동 분포가 없습니다.</p>`
      : `<h4 class="map-h4">${esc(here)} 읍·면·동 분포 · ${esc(ind.label)} <small>순위 아님${m.year ? ` · ${esc(m.year)}년` : ''}</small></h4>${strip(m.items, it ? it.code : null, ind, scale)}`;
    if (!it) return `<h3 class="map-h3">${esc(here)} <small>${m.items.length}개 읍·면·동</small></h3><p class="map-guide">지도에서 동을 누르면 세부항목별 척도표가 열립니다.<br>항목마다 값, 기준선, 출처가 함께 보입니다.</p>${dist}${hubHTML(v)}`;
    const rows = rowsFor(v, m, it), D = window.RenewDashboard, dy = rows.find(r => r.ind.series && r.year)?.year;
    return `<div class="map-panel-head"><h3 class="map-h3">${esc(it.name)} <small>${esc(it.kind || '행정동')} · ${esc(it.code)}</small></h3><button type="button" class="map-close" data-close aria-label="척도표 닫기">닫기</button></div>` +
      `<p class="map-note">${esc(v.crumbs.map(c => c.label).join(' › '))} · 쇠퇴 지표 ${dy ? `${esc(dy)}년` : '최신 연도'}, 생활 지표는 항목별 기준연도</p>` +
      `<p class="map-report-link"><a href="#report">${icon('book')}동네 보고서 보기</a></p>` +
      scaleTableHTML(rows, { cur: ind.code, detail: D ? D.detailRows : null }) + dist + hubHTML(v);
  }
  const rowsFor = (v, m, it) => dongRows(inds(), m.json.dongs.find(d => codeOf(d) === it.code), livingMap(m.living).get(it.code), m.selYear, m.ext);
  // ── 동네 보고서(#report): 원장 문장 + 그래프 + 출처표. 인쇄는 브라우저 인쇄(@media print), HWPX·XLSX는 메일 요청 ──
  const report = document.getElementById('reportApp');
  let reportKey = '', polished = null, reportMode = 'report'; // polished: { key, text } 검증을 통과한 AI 문장만. reportMode: 동네 보고서 | 사업 근거서
  api.download = k => download(k);
  api.setReportMode = m => { reportMode = REPORT_MODES.some(x => x[0] === m) ? m : 'report'; if (state.index !== undefined) render(); }; // find.js 프리셋이 쓴다
  function reportHTML(v, it, rows) {
    const D = window.RenewDashboard, sents = reportSentences(it.name, rows), here = v.crumbs.map(c => c.label).join(' › ');
    const byG = GROUPS.filter(([g]) => sents.some(s => s.group === g)).map(([g, gl]) => `<section class="rp-g"><h3>${gIco(g)}${esc(gl)}</h3>${g === 'safe' ? `<p class="rp-fixed">${esc(SAFE_FIXED)}</p>` : g === 'fore' ? `<p class="rp-fixed">${esc(FORE_FIXED)}</p>` : ''}` +
      // 항목 카드: 이름·상태 → 큰 값 → 기준 막대·추세 → 원장 문장(접힘, 인쇄 때는 펼침). 숫자가 문장 속에 묻히지 않게
      `<div class="rp-cards">${sents.filter(s => s.group === g).map(s => { const r = rows.find(x => x.ind.code === s.code), cls = r ? ROW_CLASS[r.status] : 'none';
        return `<div class="rp-item rp-card is-${cls}"><div class="rc-h"><span class="rc-l">${esc(s.label)}</span>${r ? `<span class="sr-st st-${cls}">${esc(stLabel(r.status))}</span>` : ''}</div>` +
          `<p class="rc-v">${esc(r ? rowText(r) : s.value)}</p>${r && !r.ind.categorical ? barSVG(r) : ''}${r && r.series && r.series.some(p => p[1] !== null) ? sparkline(r.series, r.year, r.ind.label) : ''}` +
          `<details class="rc-more"><summary>문장·출처</summary><p>${esc(s.text)}</p></details></div>`; }).join('')}</div></section>`).join('');
    const src = `<details class="rp-src"><summary>출처표 (${sents.length}개 항목)</summary><div class="table-wrap"><table><thead><tr><th>항목</th><th>값</th><th>출처</th><th>기준일</th></tr></thead><tbody>${sents.map(s =>
      `<tr><td>${esc(s.label)}</td><td>${esc(s.value)}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : esc(s.source)}</td><td>${esc(s.ref || (s.year ? `${s.year}년` : '기록 없음'))}</td></tr>`).join('')}</tbody></table></div></details>`;
    const pol = polished && polished.key === reportKey ? polished : null;
    const ai = `<div class="rp-ai"><p class="rp-ai-head">${esc(AI_HEAD)}</p><div data-ai-dev>${aiDevHTML(aiDet)}</div>` +
      `<span class="rp-ai-note">선택 기능 · 기본 꺼짐 · 무료 · 로그인 없음 · 서버 전송 없음</span>` +
      `<div class="rp-ai-consent" data-ai-confirm hidden><p><b>기기 내 AI 모델 내려받기</b><br>Chrome이 AI 모델을 이 기기에 한 번 내려받습니다(Chrome 안내: 저장 공간 22GB 이상 여유 필요).<br>내려받은 뒤에도 문장은 이 기기 안에서만 처리합니다.</p><button type="button" class="btn" data-ai-go>내려받고 다듬기</button> <button type="button" class="btn ghost" data-ai-cancel>취소</button></div>` +
      `<div class="rp-ai-out" data-ai-out aria-live="polite">${pol ? `<p class="rp-ai-label">${esc(AI_LABEL)}</p><p>${esc(pol.text)}</p>` : ''}</div><p class="rp-ai-foot">${esc(AI_FOOT)}</p></div>`;
    return `<div class="rp-head"><p class="rp-crumb">${esc(here)}</p><h3 class="rp-title">${esc(it.name)} 동네 보고서</h3><p class="rp-tools">${fileTools(it, rows.find(r => r.ind.series && r.year)?.year ?? null, '동네 보고서', false)}</p></div>` +
      `<p class="rp-intro rp-src-line">${esc(srcHead('출처표'))}</p><p class="rp-intro">카드의 숫자와 문장은 원장 셀의 값과 출처만 옮긴 것입니다.<br>평가나 판정은 하지 않습니다.</p>${typeof localStorage !== 'undefined' ? snapHTML(snapGet(it.code), snapshotOf(it, rows, new Date())) : ''}${byG}${src}${ai}<p class="rp-foot">${esc(REPORT_FOOT)}</p>`;
  }
  function renderReport(v, m, it) {
    if (!report) return;
    // 생활·전망 파일이 늦게 도착하면 키가 바뀌어 다시 그린다
    const key = it ? `${reportMode}:${it.code}:${m.selYear}:${horizon()}:${m.living ? 'L' : ''}${m.ext && m.ext.forecast ? 'F' : ''}${state.migration ? 'M' : ''}${state.designations ? 'D' : ''}${state.living ? 'I' : ''}${state.forecastIdx ? 'X' : ''}${state.realestate ? 'R' : ''}` : 'empty:' + reportMode;
    if (key === reportKey) return;
    reportKey = key;
    document.body.classList.toggle('print-onepage', reportMode === 'onepage' && !!it); // 인쇄 때 1쪽 요약만 A4 한 쪽에 맞춘다
    if (!it) { report.innerHTML = reportModeHTML(reportMode) + `<div class="rp-empty" role="status"><img src="mascot/taggy-waiting.svg" width="120" height="148" alt="" aria-hidden="true"><h3>동을 고르면 이 자리에 ${esc(REPORT_MODES.find(x => x[0] === reportMode)[1])}가 생깁니다</h3><p><a href="${esc(toHash({ sido: v.sido && v.sido.code2, sigungu: v.sigungu && v.sigungu.code5, gu: v.gu && v.gu.code5 }))}">지도</a>에서 읍·면·동을 누르거나 우리 동네를 찾아 주세요.</p></div>`; return; }
    const rows = rowsFor(v, m, it);
    if (reportMode === 'onepage') {
      const built = docFor(v, m, it);
      report.innerHTML = reportModeHTML(reportMode) + (built.error ? `<div class="rp-empty" role="status"><h3>1쪽 요약을 아직 만들 수 없습니다</h3><p>${esc(built.error)}</p></div>` : onepageHTML(v, it, built.one, fragChoice));
    } else report.innerHTML = reportModeHTML(reportMode) + (reportMode === 'brief' ? briefHTML(v, it, rows, fragChoice) : reportHTML(v, it, rows));
    paintFrag();
  }
  // ── 파일 만들기(docgen.js): 선택한 동의 원장 셀로 근거서(HWPX·XLSX)와 1쪽 요약을 이 브라우저에서 바로 만든다. 서버로 보내지 않는다 ──
  const todayISO = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  let docMemo = { key: '', val: null }, fragChoice = { id: '', variant: '' };
  // 생활·전망·순이동 자료가 아직 오는 중이면 '파일 없음'으로 적히지 않게 만들기를 미룬다
  const filesLoading = v => [state.templates, state.living, state.migration, state.designations, state.realestate, state.forecastIdx].some(x => x === undefined) || (!!state.living && livingOf(v.emdCode) === undefined) || (!!state.forecastIdx && forecastOf(v.emdCode) === undefined);
  function docFor(v, m, it) {
    if (!DG) return { error: '이 브라우저에서 문서 생성기를 불러오지 못했습니다.' };
    if (state.templates === null) return { error: '문서 양식 파일(data/report_templates.json)을 불러오지 못했습니다. 페이지를 새로 고쳐 주세요.' };
    if (filesLoading(v)) return { error: '생활·전망 자료를 불러오는 중입니다. 잠시 뒤 다시 눌러 주세요.' };
    const key = [v.emdCode, it.code, state.living ? 'I' : '', m.living ? 'L' : '', m.ext && m.ext.forecast ? 'F' : '', state.forecastIdx ? 'X' : '', state.migration ? 'M' : '', state.designations ? 'D' : '', state.realestate ? 'R' : ''].join(':');
    if (docMemo.key === key) return docMemo.val;
    let val;
    try {
      const geo = m.geo && Array.isArray(m.geo.features) ? m.geo.features.find(f => String((f.properties || {}).code) === it.code) || null : null;
      const brief = DG.buildBrief(it.code, { index: state.index, emd: m.json, living: m.living, livingIdx: state.living, forecast: m.ext && m.ext.forecast, forecastIdx: state.forecastIdx,
        designations: state.designations, migration: state.migration, realestate: state.realestate }, { writtenOn: todayISO(), geo });
      val = { brief, doc: DG.buildDoc(brief), one: DG.buildOnepage(brief) };
    } catch (err) { val = { error: `문서를 만들지 못했습니다: ${err.message}` }; }
    docMemo = { key, val };
    return val;
  }
  const currentDong = () => { if (!state.index) return null; const v = resolve(state.index, state.route), m = model(v), it = m.kind === 'emd' && v.dong ? m.items.find(x => x.code === v.dong) : null; return it ? { v, m, it } : null; };
  const notify = detail => document.dispatchEvent(new CustomEvent('renew-export', { detail })); // report.js가 상태 문구를 바꾼다
  function download(kind) {
    const cur = currentDong(); if (!cur) { notify({ format: kind, status: 'empty' }); return; }
    const built = docFor(cur.v, cur.m, cur.it); if (built.error) { notify({ format: kind, status: 'error', message: built.error }); return; }
    const one = reportMode === 'onepage', stem = `${cur.it.code}_${DG.safeName(cur.it.name)}_${one ? '요약' : '근거서'}`;
    try {
      const OOXML = 'application/vnd.openxmlformats-officedocument.', pick = one ? built.one : built.doc;
      const file = kind === 'hwpx' ? [`${stem}.hwpx`, DG.hwpxBytes(pick), 'application/hwp+zip']
        : kind === 'docx' ? [`${stem}.docx`, DG.docxBytes(pick), OOXML + 'wordprocessingml.document']
        : kind === 'pptx' ? [`${stem}.pptx`, DG.pptxBytes(pick), OOXML + 'presentationml.presentation']
        : [`${stem}.xlsx`, DG.workbookBytes(built.doc), OOXML + 'spreadsheetml.sheet'];
      notify({ format: kind, status: 'done', file: file[0], size: DG.saveBytes(...file), year: built.doc.brief.year, one });
    } catch (err) { notify({ format: kind, status: 'error', message: err.message }); }
  }
  // 지도 이미지(PNG): 배경 타일(CORS로 캔버스에 못 그림)을 빼고 경계·색·범례·출처·기준연도만 그린다
  function mapPng() {
    const msg = app.querySelector('[data-png-msg]'), say = t => { if (msg) msg.textContent = t; };
    if (!DG || !state.index) return;
    const v = resolve(state.index, state.route), m = model(v), ind = curInd(), mode = effMode(ind), ok = avail(ind), off = !ok || ind.pending;
    const feats = m.kind === 'emd' ? (m.geo && m.geo.features) || [] : m.kind === 'sg' && state.sgGeo ? state.sgGeo.features.filter(f => m.items.some(i => i.code === String((f.properties || {}).code))) : [];
    if (!feats.length) { say('경계 자료가 아직 없어 이미지를 만들 수 없습니다.'); return; }
    const byCode = new Map(m.items.map(i => [i.code, i])), crumbs = v.crumbs.map(c => c.label).join(' › ');
    const base = ind.latest ? `최근 달 ${String(ind.latest).slice(0, 4)}.${String(ind.latest).slice(4, 6)}` : `기준연도 ${m.year ?? '자료 없음'}${m.year ? '년' : ''}`;
    const model_ = { features: feats, paths: feats.length, colorOf: code => { const it = byCode.get(code); return it && it.value !== null ? it.color : null; },
      title: off ? ind.label : scaleFor(ind, mode).title, subtitle: `${crumbs} · ${base}`, legend: legendItems(ind, off ? 'now' : mode).filter(l => !off || l.hatch).map(l => ({ ...l, label: off ? (ind.held ? '보류' : '수집 중') : l.label })),
      std: stdLineOf(ind, off), source: ind.source || (state.index.source && state.index.source.name) || SOURCE_DEFAULT, base };
    const { svg, width, height } = DG.mapSvg(model_);
    say('이미지를 만드는 중입니다.');
    DG.svgToPng(svg, width, height, 2).then(png => { const name = `지도_${DG.safeName(ind.label)}_${DG.safeName(v.crumbs[v.crumbs.length - 1].label)}.png`; say(`${name} (${Math.round(DG.saveBytes(name, png, 'image/png') / 1024)}KB)를 내려받았습니다.`); },
      () => say('이미지를 만들지 못했습니다. 브라우저 인쇄로 지도를 저장해 주세요.'));
  }
  const rowsOfTable = t => [...t.rows].map(tr => [...tr.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
  const copyDone = (b, ok) => { const old = b.dataset.label || (b.dataset.label = b.textContent); b.textContent = ok ? '복사했습니다' : '복사하지 못했습니다. 표를 직접 선택해 복사해 주세요'; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = old; }, 2200); };
  function copyTable(b) {
    const box = b.closest('.dg-tbl'), t = box && box.querySelector('table'); if (!t || !DG) return;
    DG.copyToClipboard(DG.tablePayload(rowsOfTable(t), (box.querySelector('.dg-tbl-h b') || {}).textContent || '')).then(() => copyDone(b, true), () => copyDone(b, false));
  }
  function copyFrag(b) {
    if (!fragCur) return;
    const p = b.hasAttribute('data-frag-all') ? DG.fragmentPayload(fragCur) : DG.sentencePayload(fragCur.sentences[+b.dataset.fragSentence]);
    DG.copyToClipboard(p).then(() => copyDone(b, true), () => copyDone(b, false));
  }
  function copySentence(b) {
    const cur = currentDong(), built = cur && docFor(cur.v, cur.m, cur.it), blk = built && !built.error ? built.one.parts.summary[+b.dataset.copySentence] : null; if (!blk) return;
    DG.copyToClipboard(DG.sentencePayload(DG.sentenceText(built.one, blk))).then(() => copyDone(b, true), () => copyDone(b, false));
  }
  // 양식 조각: 고른 양식(과 변형)의 문장·표·출처를 그리고 복사 버튼을 단다
  let fragCur = null;
  function paintFrag() {
    const out = report && report.querySelector('[data-frag-out]'); if (!out) return;
    fragCur = null;
    if (!fragChoice.id) { out.innerHTML = ''; return; }
    const cur = currentDong(), built = cur && docFor(cur.v, cur.m, cur.it);
    if (!built || built.error) { out.innerHTML = `<p class="map-note">${esc(built ? built.error : '동을 먼저 고르세요.')}</p>`; return; }
    const list = DG.buildFragments(built.brief, [fragChoice.id]), fr = list.find(x => x.variant === fragChoice.variant) || list[0];
    if (!fr) { out.innerHTML = ''; return; }
    fragCur = fr;
    out.innerHTML = DG.fragmentHTML(fr);
  }
  if (report) report.addEventListener('change', e => {
    const s = e.target.closest('select'); if (!s) return;
    if (s.matches('[data-frag-preset]')) { fragChoice = { id: s.value, variant: '' }; if (s.value) fragChoice.variant = DG.fragmentChoices().find(c => c.id === s.value).variants[0].id; refreshFrag(); }
    else if (s.matches('[data-frag-variant]')) { fragChoice = { ...fragChoice, variant: s.value }; paintFrag(); }
  });
  // 양식을 바꾸면 변형 드롭다운이 달라지므로 조각 패널을 통째로 다시 그린다
  function refreshFrag() { const box = report.querySelector('.rp-frag'); if (box) { box.outerHTML = fragPanelHTML(fragChoice); report.querySelector('[data-frag-preset]')?.focus({ preventScroll: true }); } paintFrag(); }
  // 기기 안 AI: 한 번만 확인하고, 보고서가 열려 있으면 버튼 자리만 바꾼다
  let aiDet = null;
  const aiPaint = () => { const box = report && report.querySelector('[data-ai-dev]'); if (box) box.innerHTML = aiDevHTML(aiDet); };
  if (report) aiDet = presentDeviceAI(window);
  function aiRun() {
    const v = resolve(state.index, state.route), m = model(v), it = m.kind === 'emd' ? m.items.find(x => x.code === v.dong) : null, out = report.querySelector('[data-ai-out]');
    if (!it || !out || !aiDet || !aiDet.api) return;
    const sents = reportSentences(it.name, rowsFor(v, m, it)), original = sents.map(s => s.text).join(' '), key = reportKey;
    const msg = t => { if (key === reportKey) out.innerHTML = `<p class="rp-ai-label">${esc(t)}</p>`; };
    msg('기기 안에서 문장을 만드는 중입니다.');
    runDeviceAI(window, aiDet.api, original, (l, t) => msg(`기기 내 AI 모델을 내려받는 중입니다 · ${Math.round(100 * l / (t || 1))}%`))
      .then(res => {
        if (aiDet.status !== 'available') { aiDet = { ...aiDet, status: 'available' }; aiPaint(); }
        if (key !== reportKey) return;
        polished = res.ok ? { key, text: res.text } : null;
        out.innerHTML = res.ok ? `<p class="rp-ai-label">${esc(AI_LABEL)}</p><p>${esc(res.text)}</p>`
          : `<p class="rp-ai-label">AI 문장을 버리고 원장 문장을 보여 드립니다</p><p>${res.bad && res.bad.length ? `원장에 없는 숫자(${esc(res.bad.join(', '))})가 있었습니다. ` : ''}${res.banned && res.banned.length ? `평가 표현(${esc(res.banned.join(', '))})이 있었습니다. ` : ''}</p>${sents.map(s => `<p>${esc(s.text)}</p>`).join('')}`;
      })
      .catch(() => msg('기기 내 AI가 문장을 만들지 못했습니다. 위의 원장 문장을 그대로 보세요.'));
  }
  if (report) report.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const confirm = report.querySelector('[data-ai-confirm]');
    if (b.dataset.rpMode) { api.setReportMode(b.dataset.rpMode); report.querySelector(`[data-rp-mode="${b.dataset.rpMode}"]`)?.focus({ preventScroll: true }); }
    else if (b.hasAttribute('data-print')) { report.querySelectorAll('details').forEach(d => { d.open = true; }); window.print(); }
    else if (b.dataset.dl) download(b.dataset.dl);
    else if (b.hasAttribute('data-copy-table')) copyTable(b);
    else if (b.hasAttribute('data-snap-save') || b.hasAttribute('data-snap-clear')) {
      const c = currentDong(); if (!c) return;
      try {
        if (b.hasAttribute('data-snap-save')) localStorage.setItem(SNAP_KEY + c.it.code, JSON.stringify(snapshotOf(c.it, rowsFor(c.v, c.m, c.it), new Date())));
        else localStorage.removeItem(SNAP_KEY + c.it.code);
      } catch (err) { b.textContent = '이 브라우저는 저장을 막아 두었습니다'; return; }
      reportKey = null; renderReport(c.v, c.m, c.it); report.querySelector('.rp-snap button')?.focus({ preventScroll: true });
    }
    else if (b.dataset.fragSentence !== undefined || b.hasAttribute('data-frag-all')) copyFrag(b);
    else if (b.dataset.copySentence !== undefined) copySentence(b);
    else if (b.hasAttribute('data-ai-run') && aiDet) {
      const next = () => { if (aiDet.status === 'available') aiRun(); else if (confirm && (aiDet.status === 'downloadable' || aiDet.status === 'downloading')) { confirm.hidden = false; confirm.querySelector('[data-ai-go]')?.focus(); } };
      if (aiDet.status === 'unknown') { b.disabled = true; detectDeviceAI(window).then(d => { aiDet = d; aiPaint(); next(); }); } else next();
    }
    else if (b.hasAttribute('data-ai-cancel') && confirm) confirm.hidden = true;
    else if (b.hasAttribute('data-ai-go')) { if (confirm) confirm.hidden = true; aiRun(); } // 이 클릭(사용자 활성화) 안에서 create()가 불려 내려받기가 시작된다
  });
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
    const total = m.items.length, has = m.items.filter(i => i.value !== null).length;
    let body;
    if (!avail(ind)) body = `<span class="hl-t">${ind.held ? `${esc(ind.label)}은(는) 보류 중입니다: ${esc(ind.held)}` : `${esc(ind.label)}은(는) 자료를 모으는 중입니다.`}<br>자료가 오기 전에는 지도를 회색으로 둡니다.</span>`;
    else if (!has) body = `<span class="hl-t">${esc(ind.label)}은(는) 읍·면·동 자료만 있습니다.<br>지도에서 시·군·구를 누르면 색이 보입니다.</span>`;
    else if (ind.src === 'forecast') body = `<span class="hl-t">${esc(FORE_FIXED)}</span>`;
    else if (ind.group === 'safe') body = `<span class="hl-t">${esc(SAFE_FIXED)}</span>`;
    else if (ind.group === 'estate') body = `<span class="hl-t">${esc(ESTATE_NOTE)}.<br>시·군·구 단위 신고 집계입니다.<br>${esc(ESTATE_PROV)}.</span>`;
    else if (!ind.standard && !ind.composite) body = `<span class="hl-t">공식 기준이 없는 지표입니다.<br>색은 고정 참고 구간입니다.</span>`;
    else if (m.kind === 'sg' && effMode(ind) === 'now' && hasYears(state.index, ind)) {
      const c = overCaption(state.index, ind, m.year, m.sgs), k = `${ind.code}-${scope}`;
      body = `<span class="hl-t">${esc(scope)} · ${esc(ind.standard ? ind.standard.text : ind.label)}</span>` +
        `<span class="hl-n" title="${esc(c.text)}">${c.n ? `기준선 넘은 동 <b data-ck="hl-o-${esc(k)}" data-count="${c.over ?? 0}">0</b>곳 <small>/ 값 있는 동 <span data-ck="hl-n-${esc(k)}" data-count="${c.n}">0</span>곳</small> · <b class="hl-y">${esc(c.year)}년</b>` : `<b class="hl-y">${esc(c.year ?? '')}년</b> <small>자료 없는 해</small>`}</span>` +
        c.notes.map(n => `<span class="hl-note">${esc(n)}</span>`).join('');
    }
    else body = `<span class="hl-n"><b data-ck="hl-${esc(ind.code)}-${esc(scope)}" data-count="${crossedCount(m.items, ind)}">0</b>곳 <small>/ ${esc(scope)} ${nf(0).format(total)}개 ${unitWord}</small></span>` +
      `<span class="hl-t">${!ind.standard ? '기준선을 넘은 항목이 하나라도 있는 곳' : `${esc(ind.standard.text)} — 기준선을 넘은 곳`}${m.year ? ` · ${esc(m.year)}년` : ''}${isPending(ind.standard) ? ` · 기준 ${esc(ind.standard.status)}` : ''}</span>`;
    heroLive.setAttribute('aria-live', autoT ? 'off' : 'polite'); // 자동 재생 중에는 해마다 읽지 않는다
    const hk = ind.code + scope; heroLive.classList.toggle('is-new', hk !== lastLive); lastLive = hk;
    heroLive.innerHTML = `<span class="hl-k">${icon(ind.icon)}${esc(ind.label)}</span>${body}${autoT ? '<span class="hl-auto">연도·지표가 자동으로 바뀝니다 · 지도를 만지면 멈춥니다</span>' : ''}`;
    heroLive.querySelectorAll('[data-count]').forEach(countUp);
  }
  function render() {
    if (state.index === undefined) return;
    const v = resolve(state.index, state.route);
    if (v.level === 'empty') { top.innerHTML = bottom.innerHTML = ''; panel.hidden = true; stage.innerHTML = emptyHTML('전국 데이터 준비 중', ['원장에서 내보낸 숫자만 이 자리에 보여 드립니다.', '준비되면 전국에서 읍·면·동까지 내려가 볼 수 있습니다.'], true); return; }
    const ind = curInd(), mode = effMode(ind), m = model(v), src = state.index.source && state.index.source.name, ok = avail(ind);
    const it = m.kind === 'emd' && v.dong ? m.items.find(x => x.code === v.dong) : null;
    const crumbs = `<nav class="map-crumbs" aria-label="현재 위치"><ol>${v.crumbs.map((c, i) => i === v.crumbs.length - 1 && !it ? `<li aria-current="page">${esc(c.label)}</li>` : `<li><a href="${esc(c.hash)}">${esc(c.label)}</a></li>`).join('')}${it ? `<li aria-current="page">${esc(it.name)}</li>` : ''}</ol><span class="map-step">${esc(v.step)} 단계</span></nav>`;
    const py = m.kind === 'sg' && mode === 'now' && hasYears(state.index, ind) && !ind.noPlay ? playYears(state.index, ind.code) : null, sgOn = v.level === 'nation' && !reduced ? !!autoT : state.playing;
    const yearCtl = py && py.years.length ? `<div class="map-year"><button type="button" class="map-play" data-play aria-pressed="${sgOn}" aria-label="${sgOn ? '재생 멈춤' : `${py.years[0]}년부터 ${py.years[py.years.length - 1]}년까지 재생`}">${sgOn ? '❚❚' : '▶'}</button><label>연도 <b>${esc(m.year ?? '')}</b><input type="range" data-year min="${py.years[0]}" max="${py.years[py.years.length - 1]}" step="1" value="${m.year ?? py.years[py.years.length - 1]}"></label></div>`
      : m.kind === 'emd' && m.years && (ind.series || ind.computed) ? `<div class="map-year"><button type="button" class="map-play" data-play aria-pressed="${state.playing}" aria-label="${state.playing ? '재생 멈춤' : `${m.years.min}년부터 ${m.years.max}년까지 재생`}">${state.playing ? '❚❚' : '▶'}</button><label>연도 <b>${esc(m.year ?? '')}</b><input type="range" data-year min="${m.years.min}" max="${m.years.max}" step="1" value="${m.year ?? m.years.max}"></label></div>` : '';
    const base = state.index.source && isNum(state.index.source.base_year) ? state.index.source.base_year : null;
    const hzCtl = ind.src === 'forecast' && horizons().length ? seg('horizon', horizons().map(h => [h, `${h}년${base !== null ? ` (+${h - base}년)` : ''}`]), horizon(), '전망 연도') : '';
    // 연도 막대를 끄는 중이면 막대를 다시 만들지 않는다(다시 만들면 끌기가 한 칸에서 끊긴다)
    const sliding = top.contains(document.activeElement) && document.activeElement.matches('[data-year]');
    if (sliding) { const yb = top.querySelector('.map-year b'); if (yb) yb.textContent = m.year ?? ''; }
    else top.innerHTML = crumbs + indCtlHTML(ind) + `<div class="map-ctl">${hasTrend(ind) ? seg('mode', MODES, state.mode, '현재 또는 5년 변화') : ''}${hzCtl}${yearCtl}</div>`;
    const lkey = ind.code + mode, median = ok && !ind.pending && m.kind === 'sg' && mode === 'now' && hasYears(state.index, ind), legend = legendHTML(ind, mode, src, m.year, ok).replace('class="map-legend"', `class="map-legend${lkey !== lastLegend && !reduced ? ' is-new' : ''}"`); lastLegend = lkey;
    const opts = (list, key) => list.map(x => ({ code: x[key], name: x.name }));
    const kids = v.sido ? childrenOf(state.index, v.sido.code2) : [];
    const sidoSel = selectHTML('sido', '시·도', opts(state.index.sido || [], 'code2'), v.sido && v.sido.code2, '전국');
    const sgSel = kids.length && !(v.sido.kind === '특별자치시' && kids.length === 1) ? selectHTML('sg', '시·군·구', opts(kids, 'code5'), v.sigungu && v.sigungu.code5, '고르기') : '';
    const guSel = v.sigungu && childrenOf(state.index, v.sigungu.code5).length ? selectHTML('gu', '일반구·행정시', opts(childrenOf(state.index, v.sigungu.code5), 'code5'), v.gu && v.gu.code5, '고르기') : '';
    const chips = m.kind === 'emd' ? `<div class="dash-chips dash-dongs map-list" role="group" aria-label="읍·면·동">${m.items.map(x => `<button type="button" class="dash-chip" data-dong="${esc(x.code)}" aria-pressed="${x.code === v.dong}">${esc(x.name)}</button>`).join('')}</div>` : '';
    bottom.innerHTML = legend + (DG ? `<p class="map-png"><button type="button" class="btn ghost" data-map-png>지도 이미지(PNG)</button><span class="map-png-msg" data-png-msg role="status"></span></p>` : '') + `<details class="map-hint"><summary>ⓘ ${median ? '색 계산법·' : ''}지도 쓰는 법</summary>${median ? '<p>시·군·구 색 = 그 안 읍·면·동 값의 중앙값(가중 없음)</p>' : ''}<p>${coarse ? '두 손가락으로 지도를 움직이고 확대합니다.' : '끌어서 움직이고, + − 버튼으로 확대합니다.'} 지도의 칸을 누르면 바로 아래 단계로 내려갑니다.<br>지도 대신 아래 목록으로도 고를 수 있습니다.</p></details>` +
      `<div class="map-selects">${sidoSel}${sgSel}${guSel}</div>${chips}<p class="map-live" aria-live="polite">${esc(liveText(v, it, ind, mode))}</p>`;
    styleData(bottom);
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
    yearbar(v, m, ind, mode);
    renderReport(v, m, it);
    app.querySelectorAll('[data-count]').forEach(countUp);
  }
  // CSP(style-src에 'unsafe-inline' 없음): 인라인 style 속성 대신 data-*를 CSSOM으로 옮긴다
  function styleData(el) {
    el.querySelectorAll('[data-bg]').forEach(x => { x.style.background = x.dataset.bg; });
    el.querySelectorAll('[data-i]').forEach(x => x.style.setProperty('--i', x.dataset.i));
  }
  // 이전에 보인 값에서 새 값으로 센다(같은 값이면 그대로). 재생 중 매번 0부터 다시 세지 않는다
  function countUp(el) {
    const target = +el.dataset.count, k = el.dataset.ck || '', from = shown.has(k) ? shown.get(k) : 0, d = digitsOf(target), f = nf(d);
    shown.set(k, target);
    // 백그라운드 탭에서는 rAF가 멈춰 0이 남는다 — 최종값을 먼저 쓰고, 보일 때만 애니메이션
    el.textContent = f.format(target);
    if (reduced || from === target || document.hidden) return;
    const t0 = performance.now(), dur = 550; // 연도 재생 한 칸(750ms)보다 짧게: 숫자가 해마다 멈춰 읽힌다
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); el.textContent = f.format(from + (target - from) * e); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // 지도 위 큰 연도와 진행 막대(전국·시도 단계, 연도 요약이 있는 지표). 칸은 처음~끝 해, 빈 칸은 건너뛴 해
  let ybar = null;
  function yearbar(v, m, ind, mode) {
    if (!ybar) return;
    const on = (state.playing || !!autoT) && m.kind === 'sg' && mode === 'now' && hasYears(state.index, ind); // 재생할 때만. 멈춰 있으면 연도는 위 막대에 있다
    ybar.hidden = !on; if (!on) return;
    const py = playYears(state.index, ind.code), c = overCaption(state.index, ind, m.year, m.sgs);
    const all = ind.noPlay || !py.years.length ? [] : Array.from({ length: py.years[py.years.length - 1] - py.years[0] + 1 }, (_, k) => py.years[0] + k);
    ybar.innerHTML = `<b class="yb-y">${esc(c.year ?? '')}</b>` + (all.length ? `<span class="yb-track">${all.map(y => `<i class="${py.years.includes(y) ? '' : 'is-skip'}${y <= c.year ? ' is-on' : ''}${y === c.year ? ' is-cur' : ''}"></i>`).join('')}</span><span class="yb-ends"><span>${all[0]}</span><span>${all[all.length - 1]}</span></span>` : '') +
      (c.skipNote ? `<small>${esc(c.skipNote)}</small>` : '') + (ind.noPlay ? '<small>최신 연도만 보여 줍니다</small>' : '');
  }
  // Leaflet 지도는 한 번 만들어 무대(stage)에 두고, render()는 색·선택만 바꾼다
  let M = null;
  // 네이버 지도(배경만). 키(field/naver-map-key.js)는 사이트 저장소에만 있고 등록 주소에서만 동작. 실패·5초 초과면 브이월드로
  function loadNaver() {
    const key = window.RENEWMAP_NAVER_KEY;
    if (!/^[A-Za-z0-9]{6,40}$/.test(key || '')) return Promise.resolve(false);
    return new Promise(res => {
      const done = ok => { clearTimeout(t); res(ok); }, t = setTimeout(() => done(false), 5000);
      window.navermap_authFailure = () => done(false);   // 네이버가 인증 실패 때 부르는 전역 함수
      const s = document.createElement('script');
      s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${key}`;
      s.onload = () => done(!!(window.naver && window.naver.maps && window.naver.maps.Map));
      s.onerror = () => done(false);
      document.head.appendChild(s);
    });
  }
  function drawMap(v, m) {
    const slot = stage.querySelector('[data-map-slot]');
    const wait = msg => { if (slot) { slot.className = 'map-canvas is-wait'; slot.textContent = msg; } };
    if (!M) {
      if (state.sgGeo === undefined) { wait('경계를 불러오는 중입니다.'); return; }
      if (!state.sgGeo) { if (slot) slot.outerHTML = emptyHTML('경계 자료 준비 중', ['시군구 경계가 아직 없습니다.', '아래 목록으로 숫자는 볼 수 있습니다.']); return; }
      const D = window.RenewDashboard;
      if (!window.L) { wait('지도를 불러오는 중입니다.'); (D ? D.loadLeaflet() : Promise.reject()).then(render, () => { state.mapErr = true; render(); }); return; }
      if (state.naver === undefined) { state.naver = null; wait('지도를 불러오는 중입니다.'); loadNaver().then(ok => { state.naver = ok; render(); }); return; }
      if (state.naver === null) return;
      const L = window.L, el = document.createElement('div'); el.className = 'map-canvas'; el.setAttribute('role', 'region');
      el.insertAdjacentHTML('beforeend', '<svg class="map-defs" width="0" height="0" aria-hidden="true"><defs><pattern id="rmHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#d4dbd8"/><line x1="0" y1="0" x2="0" y2="6" stroke="#6b7a75" stroke-width="2"/></pattern></defs></svg>');
      slot.replaceWith(el);
      ybar = document.createElement('div'); ybar.className = 'map-yearbar'; ybar.hidden = true; ybar.setAttribute('aria-hidden', 'true'); el.appendChild(ybar);
      // 네이버 배경: Leaflet(경계·누르기·확대) 아래에 움직이지 않는 네이버 지도를 깔고 같은 중심·확대로 맞춘다. 네이버는 정수 확대라 Leaflet도 정수로
      const nv = state.naver ? document.createElement('div') : null;
      if (nv) { nv.className = 'map-naver'; nv.setAttribute('aria-hidden', 'true'); el.appendChild(nv); el.classList.add('has-naver'); }
      const map = L.map(el, { dragging: !coarse, scrollWheelZoom: false, zoomSnap: nv ? 1 : 0.25, zoomAnimation: !nv, attributionControl: false }); // 네이버 배경은 애니메이션 없이 확대하므로 경계도 같이 바로 바꾼다
      L.control.attribution({ position: 'bottomleft' }).addTo(map); // 오른쪽은 척도표 서랍이 덮으므로 저작권 표시는 왼쪽 아래
      if (nv) {
        const N = window.naver.maps, nmap = new N.Map(nv, { center: new N.LatLng(36.3, 127.8), zoom: 7, draggable: false, pinchZoom: false, scrollWheel: false, keyboardShortcuts: false,
          disableDoubleClickZoom: true, disableDoubleTapZoom: true, disableTwoFingerTapZoom: true, zoomControl: false, scaleControl: false, mapDataControl: true, logoControl: true, mapTypeControl: false });
        const sync = () => { const c = map.getCenter(); nmap.setCenter(new N.LatLng(c.lat, c.lng)); nmap.setZoom(map.getZoom(), false); };
        map.on('move zoom moveend zoomend viewreset resize', sync);
        if ('ResizeObserver' in window) new ResizeObserver(() => { nmap.autoResize && nmap.autoResize(); sync(); }).observe(el);
      }
      // 칸 크기가 바뀌면(업무 패널 열기·휴대폰 순서) 경계층도 다시 재야 바탕과 어긋나지 않는다. 네이버 동기화는 위 resize 이벤트로 따라간다
      if ('ResizeObserver' in window) new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el);
      // 배경지도: 브이월드(국토교통부 공식 지도, 한국 지명·도로). 키(field/vworld-key.js)는 사이트 저장소에만 있고 등록 주소에서만 동작 → 없으면 OSM
      const vw = /^[A-Za-z0-9-]+$/.test(window.RENEWMAP_VWORLD_KEY || '') ? window.RENEWMAP_VWORLD_KEY : '';
      if (nv) { /* 배경은 네이버 */ }
      else if (vw) L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${vw}/Base/{z}/{y}/{x}.png`, { maxZoom: 19, attribution: '&copy; <a href="https://www.vworld.kr">국토교통부 브이월드</a>' }).addTo(map);
      else L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
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
      l.setStyle(on ? { fillColor: it.value === null ? 'url(#rmHatch)' : it.color, fillOpacity: 0.7, color: '#fff', weight: 0.8, dashArray: it.value === null ? '4 3' : null }
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
        l.setStyle({ fillColor: !it || it.value === null ? 'url(#rmHatch)' : it.color, fillOpacity: sel ? 0.25 : 0.6, color: sel ? '#153c39' : '#fff', weight: sel ? 4 : 1.5, dashArray: !it || it.value === null ? '4 3' : null });
        if (sel && reorder) l.bringToFront(); });
    } else if (M.emd && !inEmd) { M.emd.remove(); M.emd = null; M.emdCode = null; }
    // 단계가 바뀔 때만 화면을 옮긴다(연도 재생·지표 자동 전환 중에는 움직이지 않는다)
    const key = v.level + ':' + m.kind + ':' + (v.emdCode || (v.sigungu && v.sigungu.code5) || (v.sido && v.sido.code2) || '');
    if (M.fitKey !== key && m.kind !== 'wait') {
      M.fitKey = key;
      let b = null;
      if (m.kind === 'emd' && M.emd) b = M.emd.getBounds();
      else { const fg = L.featureGroup(); M.sg.eachLayer(l => { if (active.has(String((l.feature.properties || {}).code))) fg.addLayer(l); }); b = fg.getLayers().length ? fg.getBounds() : M.sg.getBounds(); }
      const right = inEmd && wide.matches && !panel.hidden && getComputedStyle(panel).position !== 'static' ? panel.offsetWidth + 28 : 12; // 지도 위에 겹친 패널일 때만 비운다
      const opt = { paddingTopLeft: [12, 12], paddingBottomRight: [right, 12], maxZoom: 14 };
      if (b && b.isValid()) { if (reduced || !M.ready || state.naver) M.map.fitBounds(b, opt); else M.map.flyToBounds(b, { ...opt, duration: 0.9 }); M.ready = true; } // 첫 맞춤은 시점이 없어 flyTo를 못 쓴다
    }
  }
  function go(route, focusSel) {
    stopPlay(); stopAuto(true);
    if (state.yearByAuto) { state.year = null; state.yearByAuto = false; }
    state.route = route;
    const v = resolve(state.index, route);
    if (v.level !== 'empty') history.replaceState(null, '', toHash({ sido: v.sido && v.sido.code2, sigungu: v.sigungu && v.sigungu.code5, gu: v.gu && v.gu.code5, dong: v.level === 'emd' ? route.dong : null }));
    render();
    const f = focusSel && app.querySelector(focusSel); if (f) f.focus({ preventScroll: true });
  }
  function stopPlay() { clearInterval(timer); timer = null; state.playing = false; }
  function play() {
    const v = resolve(state.index, state.route), m = model(v);
    if (m.kind === 'sg') {
      if (v.level === 'nation' && !reduced) { if (autoT) { stopAuto(true); render(); } else { state.touched = false; autoAsked = true; startAuto(state.ind); } return; }
      const ys = playYears(state.index, state.ind).years; if (!ys.length) return;
      if (state.playing) { stopPlay(); render(); return; }
      let i = ys.indexOf(state.year); if (i < 0 || i >= ys.length - 1) i = 0;
      state.playing = true; state.yearByAuto = false; state.year = ys[i]; render();
      timer = setInterval(() => { i++; if (i >= ys.length) { stopPlay(); render(); return; } state.year = ys[i]; render(); }, reduced ? 1000 : 700);
      return;
    }
    if (m.kind !== 'emd' || !m.years) return;
    if (state.playing) { stopPlay(); render(); return; }
    state.playing = true; state.year = m.year >= m.years.max ? m.years.min : m.year;
    render();
    timer = setInterval(() => { if (state.year >= m.years.max) { stopPlay(); render(); return; } state.year += 1; render(); }, reduced ? 1000 : 320);
  }
  // 전국 단계 재생: 기준이 있는 지표를 차례로 보여 준다. 첫 화면에서 저절로 시작하지 않고(UI 검수 2026-10-28: 만지기 전에 화면이 바뀌면 읽기 어렵다)
  // ▶를 누른 뒤에만 돈다. 사용자가 지도를 만지면 멈추고 다시 켜지 않는다
  let visible = true, autoAsked = false;
  // 순서: 노후 → 사업체 → 인구(해마다) → 요건 충족 수(최신 연도만, 연도 비교 안 함). 연도 요약이 없는 지표는 뺀다
  const AUTO_ORDER = ['DECLINE_AGING_20Y_PCT', 'DECLINE_BIZ_DROP10Y_PCT', 'DECLINE_POP_DROP30Y_PCT', 'DECLINE_MET_COUNT'];
  function autoList() { return AUTO_ORDER.map(c => inds().find(i => i.code === c)).filter(i => i && hasYears(state.index, i)); }
  function autoRun(ind, i) {
    const ys = ind.noPlay ? [] : playYears(state.index, ind.code).years, last = !ys.length || i >= ys.length - 1;
    autoT = setTimeout(() => (last ? autoNext() : autoRun(ind, i + 1)), last ? (ys.length ? 2400 : 4200) : 750);
    state.ind = ind.code; state.mode = 'now'; state.year = ys.length ? ys[i] : null; state.yearByAuto = true;
    render();
  }
  function autoNext() { const list = autoList(), k = list.findIndex(x => x.code === state.ind); autoRun(list[(k + 1) % list.length], 0); }
  function startAuto(from) {
    if (!autoAsked || autoT || reduced || state.touched || !visible || document.hidden || !M) return;
    if (resolve(state.index, state.route).level !== 'nation') return;
    const list = autoList(); if (!list.length) return;
    autoRun(list.find(x => x.code === (from || state.ind)) || list[0], 0);
  }
  // 멈출 때 다시 그리지 않는다(누르는 도중 버튼·지도 칸이 바뀌면 click이 사라진다). 안내 줄과 재생 버튼만 바꾼다
  function stopAuto(user) {
    if (user) state.touched = true;
    if (!autoT) return;
    clearTimeout(autoT); autoT = null; if (ybar) ybar.hidden = true;
    if (heroLive) { heroLive.querySelector('.hl-auto')?.remove(); heroLive.setAttribute('aria-live', 'polite'); }
    const b = app.querySelector('[data-play]'); if (b) { b.textContent = '▶'; b.setAttribute('aria-pressed', 'false'); }
  }
  const touch = e => { if (e && e.target && e.target.closest && e.target.closest('[data-play]')) return; if (!state.touched) stopAuto(true); };
  ['pointerdown', 'wheel', 'keydown'].forEach(t => app.addEventListener(t, touch, { passive: true }));
  document.addEventListener('visibilitychange', () => (document.hidden ? stopAuto(false) : startAuto()));
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? startAuto() : stopAuto(false); }, { threshold: 0.25 }).observe(app);

  app.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#map"]');
    if (a) { e.preventDefault(); go(parseHash(a.getAttribute('href')) || {}); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('is-planned')) return; // 수집 중·보류: 지도를 회색으로 바꾸지 않는다
    if (b.dataset.group || b.dataset.ind || b.dataset.mode) { stopPlay(); stopAuto(true); } // 화면 낭독기 등은 click만 보내 pointerdown 멈춤이 안 걸린다
    if (b.dataset.group) { const v = resolve(state.index, state.route), list = inds().filter(i => i.group === b.dataset.group), pick = list.find(i => chipShown(i, null, v)) || list.find(avail) || list[0]; if (pick) state.ind = pick.code; state.year = null; render(); app.querySelector(`[data-group="${b.dataset.group}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.ind) { state.ind = b.dataset.ind; state.year = null; render(); app.querySelector(`[data-ind="${CSS.escape(b.dataset.ind)}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.mode) { state.mode = b.dataset.mode; state.year = null; render(); app.querySelector(`[data-mode="${b.dataset.mode}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.horizon) { state.horizon = +b.dataset.horizon; render(); app.querySelector(`[data-horizon="${b.dataset.horizon}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.dong) go({ ...state.route, dong: b.dataset.dong }, `.map-list [data-dong="${b.dataset.dong}"]`);
    else if (b.hasAttribute('data-close')) go({ ...state.route, dong: null }, `.map-list [data-dong]`);
    else if (b.hasAttribute('data-play')) { play(); app.querySelector('[data-play]')?.focus({ preventScroll: true }); }
    else if (b.hasAttribute('data-map-png')) mapPng();
  });
  app.addEventListener('input', e => { const r = e.target.closest('[data-year]'); if (r) { stopPlay(); state.year = +r.value; state.yearByAuto = false; render(); app.querySelector('[data-year]')?.focus({ preventScroll: true }); } });
  app.addEventListener('change', e => {
    const s = e.target.closest('select'); if (!s) return;
    const val = s.value;
    if ('sido' in s.dataset) go(val ? { sido: val } : {}, '[data-sido]');
    else if ('sg' in s.dataset) go({ sido: state.route.sido, sigungu: val || null }, '[data-sg]');
    else if ('gu' in s.dataset) go({ sido: state.route.sido, sigungu: state.route.sigungu, gu: val || null }, '[data-gu]');
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('is-sheet')) go({ ...state.route, dong: null }); });
  addEventListener('hashchange', () => { const r = parseHash(location.hash); if (r) { stopPlay(); stopAuto(true); if (state.yearByAuto) { state.year = null; state.yearByAuto = false; } state.route = r; render(); } }); // 검색으로 동에 오면 자동 재생 중이던 해가 아니라 최신 해
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

  // dashboard.json(2.5MB)은 정밀 사례 묶음에만 쓴다. 첫 화면은 기다리지 않는다
  fetchJson('data/dashboard.json').then(dash => { state.dash = dash; if (state.index) render(); });
  fetchJson('data/national/index.json').then(index => {
    state.index = index && Array.isArray(index.sigungu) ? index : null;
    if (heroCount && index && isNum(index.emd_count)) { heroCount.innerHTML = `<b data-ck="emd" data-count="${index.emd_count}">0</b>개 `; countUp(heroCount.firstChild); }
    if (!state.index) { render(); return; }
    if (state.route.sido && !matchMedia('(min-width: 1100px)').matches) app.scrollIntoView({ block: 'start' }); // 넓은 화면은 한 화면 배치라 옮기지 않는다
    searchSetup();
    render();
    Promise.all([fetchJson('data/national/sigungu.geojson'), fetchJson('data/national/sido.geojson')]).then(([sg, sido]) => {
      state.sgGeo = sg && Array.isArray(sg.features) ? sg : null; state.sidoGeo = sido && Array.isArray(sido.features) ? sido : null; render(); startAuto();
    });
  });
  fetchJson('data/report_templates.json').then(j => { state.templates = j && typeof j === 'object' && j.onepage && j.summary ? j : null; if (DG && state.templates) DG.setTemplates(j); if (state.index) render(); });
  fetchJson('data/national/living/index.json').then(li => { state.living = li && Array.isArray(li.indicators) ? li : null; if (state.index) render(); });
  // 다른 직원이 만드는 중인 파일. 없으면 null → 해당 칩은 '수집 중'
  fetchJson('data/national/migration.json').then(j => { state.migration = j && Array.isArray(j.sigungu) ? j : null; if (state.index) render(); });
  fetchJson('data/national/designations.json').then(j => { state.designations = j && Array.isArray(j.items) ? j : null; if (state.index) render(); });
  fetchJson('data/national/realestate.json').then(j => { state.realestate = j && Array.isArray(j.sigungu) ? j : null; if (state.index) render(); });
  fetchJson('data/national/forecast/index.json').then(j => { state.forecastIdx = j && Array.isArray(j.horizons) ? j : null; if (state.index) render(); });
  fetchJson('data/national/dong_index.json').then(di => { state.dongIndex = Array.isArray(di) ? di : null; if (state.index) searchSetup(); });
})();
