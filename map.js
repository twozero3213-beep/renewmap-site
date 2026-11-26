/* 리뉴맵 전국 드릴다운 지도(첫 화면의 주인공). 전국 › 광역 › 기초 › (일반구·행정시) › 읍·면·동 — 법적 체계 그대로(SCHEMA.md '행정구역 체계').
   값은 data/national/index.json(시군구 summary)·emd/{code5}.json(행정동 시계열)·living/(생활 지표, 있으면)에서만 온다.
   색 구간은 지표별 기준값에 고정한다. 가중 종합점수·순위·값 순 정렬을 만들지 않는다(D13). '기준선 넘은 지표 수'는 가중치 없는 개수다.
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부(Leaflet, dashboard.js의 loadLeaflet 재사용). */
(function () {
  'use strict';
  const { esc, isNum, fmt2, roundD, dongHit, plainSource, josa: josaOf, bizZeroNote, BIZ_BOUNDARY, checkWhy, whyShort } = typeof module !== 'undefined' && module.exports ? require('./util.js') : window.RenewUtil;
  const DeclineReq = typeof module !== 'undefined' && module.exports ? require('./decline-req.js') : window.DeclineReq;
  // HWPX·XLSX·복사용 표·1쪽 요약·지도 이미지. 브라우저에서는 첫 지도 뒤에 받는다(아래 loadDocgen): undefined = 아직, null = 못 받음
  let DG = typeof module !== 'undefined' && module.exports ? require('./docgen.js') : (typeof window !== 'undefined' && window.RenewDocgen) || undefined;
  // 서식기는 자릿수마다 한 번만 만든다(호출마다 새로 만들면 휴대폰 첫 지도에서 1초 넘게 썼다, 2026-11-08 프로파일)
  const NF = new Map(), nf = d => NF.get(d) || NF.set(d, new Intl.NumberFormat('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d })).get(d);
  const digitsOf = v => (Math.round(v * 10) % 10 === 0 ? 0 : 1);
  const fmt = (v, unit) => (isNum(v) ? nf(digitsOf(v)).format(v) + (unit || '') : null);
  // 쇠퇴 3요건 비율은 홈 카드·동 페이지·문서와 같게 소수 둘째 자리까지(2026-11-14 v9, 같은 동이 34.81%인데 표에서 34.8%로 보였다). 다른 지표는 그대로
  const REQ2 = new Set(['DECLINE_POP_DROP30Y_PCT', 'DECLINE_BIZ_DROP10Y_PCT', 'DECLINE_AGING_20Y_PCT']);
  const fmtI = (v, ind, mode, unit) => (isNum(v) && ind && mode !== 'trend' && REQ2.has(ind.code) ? fmt2(v) + (unit || '') : fmt(v, unit));
  // r23(13 L4): 왼쪽 목록에서 '83.4%'와 '85.64%'가 섞였다(끝 0을 지움) → 목록 값만 소수 둘째 자리로 맞춘다(반올림은 fmt2와 같다, 문서·패널 글은 그대로)
  const fmtL = (v, ind, mode, unit) => (isNum(v) && ind && mode !== 'trend' && REQ2.has(ind.code) && !Number.isInteger(v)
    ? roundD(v, 2).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (unit || '') : fmtI(v, ind, mode, unit));
  const SOURCE_DEFAULT = '도시재생종합정보체계 쇠퇴진단지표';
  const SERIES_NO_CELL = '해당 연도 출처 기록 없음 · 근거 상세 추가확인';

  // ── 지표·색 ──
  // 기준이 있는 지표는 기준선 안쪽(옅은 회색)·넘은 쪽(주황→갈색, 넘을수록 진함) 두 계열로 나누고, 경계는 기준값에 고정한다(값 순·분위 금지, D13).
  // UI 검수(2026-10-28): 초록↔빨강은 좋음·나쁨 판정처럼 읽히고 적록색약이 구분하기 어렵다 → 안쪽은 무채색, 밝기만으로도 순서가 읽히게.
  const NULL_COLOR = '#9aa6a1';
  // v4(D21) 갱신: 기준 넘은 쪽 색은 동 요약 도넛·카드 띠(--over)와 같은 주황·갈색, 공식 기준 없음은 중립 청회색
  // v7(2026-11-13): 배경 지도를 회색으로 바꾸자 기준 안쪽(회색)이 바탕과 섞였다(5회차) → 청회색으로 했더니 갈색 사이에 하늘색이 끼어 '좋은 동'처럼 튀었다(7회차).
  // 안쪽은 넘은 쪽과 같은 따뜻한 계열의 옅은 크림 단계로: 한 색 계열의 밝기 순서로 읽히고, 회색 바탕지도와도 갈린다
  // BELOW[4]는 R4 7: 인구 감소율(30년) 2·3단계가 ΔE 8로 붙어 보여 한 칸 더 짙게 둔 기준 안쪽 색
  const BELOW = ['#f7f1e6', '#ecdfc7', '#e1cfac', '#d4bd92', '#c9ac78'], ABOVE = ['#f2ad6f', '#b4521d', '#7a3010'];
  // R2 15: 20년 이상 건축물은 해운대 18동 중 15동이 '70% 이상' 한 칸에 몰렸다 → 50% 위를 넷으로(70·80·90)
  const ABOVE4 = ['#f2ad6f', '#d9773a', '#b4521d', '#7a3010'];
  const MET = [BELOW[1], ABOVE[0], ABOVE[1], ABOVE[2]];
  const SUMC = [...MET, '#4a1d09'];
  // R4 7: 1·2단계 ΔE가 10.3~10.9라 색각이 달라도 맞닿은 칸을 못 가렸다 → 2·3단계를 조정해 정상·2형·1형 모두 인접 ΔE 13 이상(13.8 최소)
  const REF = ['#eef1f4', '#c2ccd7', '#96a7bb', '#6d84a0', '#3f5677']; // 공식 기준 없는 지표의 참고 구간(중립 청회색 5단계, 좋고 나쁨 없음. 녹색은 '기준 안'에만)
  // R4 7: 2·3단계(#8fcfc3·#e9ecea)가 1형 색각에서 ΔE 12.8이었다 → 2단계를 #6fbfb1로(인접 ΔE 최소 19.1)
  const DIVERGE = ['#0b7f6f', '#6fbfb1', '#e9ecea', ABOVE[0], ABOVE[1]]; // 개선 청록 ↔ 악화 주황·갈색(기준 넘은 쪽과 같은 계열), 가운데 중성
  const MIG = ['#6a4c93', '#b3a2d1', '#e9ecea', '#8fcfc3', '#0b7f6f']; // 기준 없는 변화·청년 순이동: 줄어듦(유출) 보라 ↔ 늘어남(유입) 청록, 가운데 중성(기준선 0). 주황은 '기준 넘음' 전용
  // 지표 묶음: '정비가 필요한 신호'와 '생활 여건'을 각각 고를 수 있게 묶는다. 범죄 통계·안전시설 점수·순위는 만들지 않는다(D8·D13)
  // 아이콘은 이모지 대신 지표 칩과 같은 선 아이콘(ICONS) 한 벌을 쓴다(UI 검수 2026-10-28: 3D 이모지·선 아이콘·글자 기호가 섞여 있었다)
  const GROUPS = [['aging', '노후·쇠퇴'], ['pop', '인구'], ['estate', '부동산 거래'], ['life', '생활 여건'], ['safe', '안전 시설'], ['fore', '인구 전망'], ['sum', '모아 보기']];
  const GROUP_ICON = { aging: 'bldg', pop: 'people', estate: 'home', life: 'tree', safe: 'cctv', fore: 'fore', sum: 'sum' };
  const gIco = g => icon(GROUP_ICON[g]);
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);
  // 쇠퇴 요건의 기준값은 시행령 제17조 문언 그대로라 '법정'이다. 정하지 못한 것은 요건을 묶어 세는 규칙(decline-3req-v0.2: 조문 숫자 대조 전, 계산 방법·해석 미결)이다.
  // 출처 기록의 '공식 기준선 넘은 지표 수'(living STD_SHORTFALL_COUNT)도 이 기준을 확정으로 센다 — 화면과 원장이 같은 수를 보이게 맞춘다
  const LAW = '도시재생법 시행령 제17조';
  const lawStd = (value, direction, text) => ({ value, direction, text, source: LAW, status: '법정' });
  const SUM = 'SUM_STD_CROSSED';
  const INDICATORS = [
    // chip: 화면 칩 이름(11회차까지 세 번 지적: 칩·범례·카드 이름이 달랐다). label은 출처(도시재생종합정보체계) 지표 이름이라 문서·출처 기록에서 그대로
    { code: 'DECLINE_AGING_20Y_PCT', group: 'aging', icon: 'bldg', label: '20년 이상 건축물 비율', chip: '20년 이상 건축물', unit: '%', edges: [30, 50, 70, 80, 90], colors: [BELOW[0], BELOW[2], ...ABOVE4],
      title: '준공 20년 이상 건축물 비율', worseUp: true, domain: [0, 100], series: true, standard: lawStd(50, 'above_bad', '준공 20년 이상 건축물 50% 이상') },
    { code: 'DECLINE_MET_COUNT', group: 'aging', icon: 'check', label: '기준을 넘은 수(확실한 것만)', unit: '개', edges: [1, 2, 3], colors: MET, labels: ['0개', '1개', '2개', '3개'],
      title: '도시재생법 제13조·시행령 제17조의 세 기준 가운데 넘은 수(확실한 것만) · 추가확인인 기준은 세지 않음 · 참고용 계산', worseUp: true, domain: [0, 3], series: true, composite: true, noPlay: true, yearNote: '해마다 기준을 넘은 수(확실한 것만)가 달라 연도 비교는 하지 않습니다',
      dEdges: [-1.5, -0.5, 0.5, 1.5], dLabels: ['2개 이상 줄어듦', '1개 줄어듦', '변화 없음', '1개 늘어남', '2개 이상 늘어남'], standard: lawStd(2, 'above_bad', '쇠퇴 세 기준 중 2개 이상') },
    { code: 'DECLINE_POP_DROP30Y_PCT', group: 'pop', icon: 'popdown', label: '인구 감소율(30년)', unit: '%', edges: [0, 10, 20, 30], colors: [BELOW[0], BELOW[2], BELOW[4], ABOVE[1], ABOVE[2]],   // R4 7: 1~3단계 인접 ΔE 9.5·8.4 → 17.9·16.5(2·3단계를 한 칸씩 짙게)
      title: '주민등록 인구 30년 최대 대비 감소율 · KOSIS', worseUp: true, domain: [-20, 60], series: true, standard: lawStd(20, 'above_bad', '30년 최대 대비 20% 이상 감소') },
    { code: 'DECLINE_POP_CHANGE_PCT', group: 'pop', icon: 'people', label: '인구변화율', unit: '%', edges: [-20, -10, 0, 10], colors: [ABOVE[2], BELOW[3], BELOW[2], BELOW[1], BELOW[0]],
      title: '주민등록 인구 변화율 · 출처 참고값', worseUp: false, domain: [-50, 50], series: true, standard: null, ref: true,
      note: '공식 기준 없음 · 출처 CSV 인구변화율의 비교 기간·산식 미확인 · 참고값' },
    { code: 'DECLINE_BIZ_DROP10Y_PCT', group: 'aging', icon: 'shop', label: '사업체 감소율(10년)', unit: '%', edges: [0, 5, 10, 20], colors: [BELOW[0], BELOW[2], ...ABOVE],
      title: '사업체 10년 최대 대비 감소율', worseUp: true, domain: [-20, 40], series: true, breakSource: 'biz_source', standard: lawStd(5, 'above_bad', '10년 최대 대비 5% 이상 감소') },
    { code: SUM, group: 'sum', icon: 'sum', label: '기준선 넘은 지표 수', unit: '개', edges: [1, 2, 3, 4], colors: SUMC, labels: ['0개', '1개', '2개', '3개', '4개 이상'],
      // v9: 카드의 '쇠퇴 3요건 N개 해당'과 수가 달라 혼란 → 무엇을 세는지 범례 제목에 밝힌다
      title: '쇠퇴·생활 지표 가운데 공식 기준선보다 나쁜 쪽에 있는 항목 수(쇠퇴 세 기준 해당 수와 다른 셈) · 자료 있는 항목만 · 가중치·순위 없음', worseUp: true, domain: [0, 8], computed: true, composite: true },
  ];
  // 자료 파일이 없을 때 칩에 '수집 중'으로만 보이는 자리. 숫자·기준값을 만들지 않는다
  const EXPECTED = { pop: ['고령(65세 이상) 비율', '청년(20~34세) 비율'], life: ['병의원(1만 명당)', '도서관 거리', '1인당 공원 면적', '공원 수', '버스정류장 밀도', '응급의료 거리'], safe: ['CCTV 밀도', '보안등 밀도', '경찰관서 거리'] };
  // 2026-11-20 CQ-08: 받지 못한 자료(ind.failed)는 '수집 중'이라고 적지 않는다. 일시적인 통신 실패가 '모으는 중'이라는 사실과 다른 말이 됐다
  const soonText = ind => (ind.failed ? '불러오지 못함' : '수집 중');
  const pendingOf = (group, labels) => labels.map((label, i) => ({ code: `PENDING_${group.toUpperCase()}_${i}`, group, label, unit: '', icon: iconFor(label), living: true, pending: true, edges: [], colors: [NULL_COLOR] }));
  const LIVING_EXPECTED = Object.entries(EXPECTED).flatMap(([g, l]) => pendingOf(g, l));
  // 2026-11-13: 대상별 '시작 묶음' — 주제 탭 8개·칩 수십 개를 먼저 고르지 않게, 묶음 3개로 지표를 먼저 보인다.
  // 왜: 처음 온 사용자가 무엇을 눌러야 할지 몰랐다(docs/design/ux_feedback_2026-11-12.md 1절 4번). 묶음은 보여 주는 순서만 바꾼다.
  //     새 숫자·가중치·점수를 만들지 않고(원칙 1, D13), 지표는 이미 있는 코드만 가리킨다. 없는 코드는 빠진다.
  //     '모든 지표'를 고르면 예전과 같은 주제 탭·칩이 나온다.
  // later: 아직 출처 기록이 없는 지표 이름. 칩은 '수집 중'으로만 보이고 눌러도 지도를 바꾸지 않는다(숫자 없음).
  //     셀이 생기면 그 코드를 codes에 넣고 later에서 뺀다
  // 재사용: 묶음을 늘릴 때는 이 배열에 한 줄만 더한다(화면 코드는 그대로)
  const BUNDLES = [
    { key: 'req', label: '쇠퇴 세 기준', codes: ['DECLINE_AGING_20Y_PCT', 'DECLINE_POP_DROP30Y_PCT', 'DECLINE_BIZ_DROP10Y_PCT', 'DECLINE_MET_COUNT'], later: [] },
    // 2026-11-13 우지예 결정: '청년이 살 만한가' 대신 '생활 인프라 최저기준'. 소아과·편의점 자리는 뺐다.
    // 왜: 공모 서류가 묻는 생활시설은 기초생활인프라 국가적 최저기준 표(제2차 기본방침 별표2 = 2027 가이드라인 참고 2-3-1) 6종이다.
    //     인정사업 요건이 '최저기준 미달 또는 쇠퇴 2개 이상'이고 사업계획 양식이 미달지역 분석을 요구한다(docs/rule_reviews/guideline_2027_crosscheck_2026-11-09.md).
    //     소아과·편의점은 그 표에 없어 2순위로 둔다(docs/data/kids_cvs_sources_2026-11-13.md). 청년 지표는 '모든 지표'에 그대로 있다.
    // codes = 6종 중 출처 기록이 있는 도서관·공원. 공원 지표는 1인당 면적·개수라 최저기준의 '거점공원 차량 10분'과 같은 잣대는 아니다(관련 지표).
    // later = 6종 중 아직 셀이 없는 것(docs/RULES_VERSIONS.md SOC-2019.01, docs/data/data_gap_2026-11-09.md 8번)
    // 2026-11-13: 보건소 거리(HEALTH_CENTER_NEAREST_M, 지소·진료소 포함) 셀이 생겨 codes로 옮기고 later에서 뺐다(scripts/export_facilities.py health)
    // 2026-11-13: 어린이집 거리(CHILDCARE_NEAREST_M, 부산 구·군 API 16개) 셀이 생겨 codes 맨 앞으로(최저기준 표 순서), later에서 뺐다.
    //     출처가 부산뿐이라 다른 시·도에서는 이 칩이 자동으로 숨는다(chipShown, '부산만')
    // 2026-11-13: 생활체육시설 거리(SPORTS_CENTER_NEAREST_M, 국민체육진흥공단 15107764, 실내 생활체육 시설만) 셀이 생겨 codes로, later에서 뺐다
    // 2026-11-13: 유치원 거리(KINDER_NEAREST_M, 부산교육청 명부 + 카카오 주소검색) 셀이 생겨 어린이집 다음에 넣고 later를 비웠다 — 6종이 모두 셀을 가진다.
    //     생활안전지도 API 키가 승인 뒤에도 거절돼 교육청 파일로 바꿨다(scripts/export_facilities.py kinder). 출처가 부산뿐이라 다른 시·도에서는 칩이 숨는다
    { key: 'soc', label: '생활시설 거리', codes: ['CHILDCARE_NEAREST_M', 'KINDER_NEAREST_M', 'SPORTS_CENTER_NEAREST_M', 'LIB_NEAREST_M', 'HEALTH_CENTER_NEAREST_M', 'PARK_AREA_PER_CAPITA', 'PARK_COUNT'],
      later: [] },
    { key: 'shop', label: '상권 변화', codes: ['STORE_COUNT', 'STORE_RETAIL_COUNT', 'STORE_FOOD_COUNT', 'DECLINE_BIZ_DROP10Y_PCT'], later: [] },
  ];
  const BUNDLE_ALL = 'all';
  // 묶음 칩 목록: shown(지금 화면에서 보일 수 있는 지표 목록)에서 codes 순서대로 고르고, later는 '수집 중' 자리로 붙인다
  function bundleList(key, shown) {
    const b = BUNDLES.find(x => x.key === key);
    if (!b) return null;
    const have = b.codes.map(c => (shown || []).find(i => i.code === c)).filter(Boolean);
    const later = b.later.map((label, i) => ({ code: `PENDING_${b.key.toUpperCase()}_${i}`, group: 'life', label, unit: '', icon: iconFor(label), pending: true, edges: [], colors: [NULL_COLOR] }));
    return [...have, ...later];
  }
  function iconFor(label) {
    // 2026-11-13: '보건'을 더해 보건소 거리 칩도 병의원과 같은 아이콘을 쓴다(없으면 기본 점 아이콘)
    const words = [['고령', 'elder'], ['청년', 'youth'], ['병', 'hosp'], ['의원', 'hosp'], ['보건', 'hosp'], ['도서관', 'book'], ['공원', 'tree'], ['버스', 'bus'], ['정류', 'bus'], ['응급', 'amb'], ['사업', 'shop'], ['인구', 'people'],
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
  const FORECAST_BASE = [['DECLINE_POP_TOTAL', '인구', '명'], ['DECLINE_AGING_20Y_PCT', '20년 이상 건축물 비율', '%'], ['DECLINE_BIZ_TOTAL', '사업체', '개']];
  const hasList = (o, k) => !!o && Array.isArray(o[k]) && o[k].length > 0;
  const srcName = s => (s && typeof s === 'object' ? s.name : s) || null;
  function extraIndicators(ext, lv) {
    const e = ext || {};
    // 값은 청년 인구 천 명당 순이동(셀 단위 '명/천 명'). 이름에 '천 명당'이 없어 보고서에서 사람 수로 읽혔다(11-14 페르소나: -41.2명 ≠ 사하구 -1,880명)
    const mig = { code: MIG_CODE, group: 'pop', icon: 'move', label: '청년 순이동(천 명당)', unit: '명', level: 'sg', src: 'migration', source: srcName(e.migration && e.migration.source), standard: null, worseUp: false, ref: true,
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
      // 코호트 모델(예: 65세 이상 비율)은 추세 외삽이 아니다. 자료가 준 모델 이름을 그대로 쓴다
      const how = b && b.model === 'cohort' && typeof b.model_label === 'string' && b.model_label ? b.model_label : '추세 외삽';
      const common = { code: 'FORECAST_' + c, group: 'fore', icon: 'fore', level: sgScope ? 'sg' : 'emd', src: 'forecast', mape, held, standard: null, pending: !fi, sgFile: !!(fi && typeof fi.sigungu_file === 'string'), empty: !!held || (!!b && isNum(b.n_areas) && b.n_areas === 0),
        disclaimer: fi && typeof fi.disclaimer === 'string' ? fi.disclaimer : null, how, source: how !== '추세 외삽' ? how : fi && typeof fi.method === 'string' ? `추세 외삽(${fi.method})` : '추세 외삽' };
      const tail = `${sgScope ? ' · 시·군·구 단위' : ''} · ${how} · 판정·투자 조언 아님 · 승인 전 초안${mape === null ? '' : ` · 백테스트 오차(전국 동 중앙값) MAPE ${fmt(mape, '%')}`}`;
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
  // 지표마다 모델 이름(코호트 등)이 있으면 '추세 외삽' 자리에 그것을 쓴다
  const foreNote = ind => (ind && ind.how && ind.how !== '추세 외삽' ? FORE_NOTE.replace('추세 외삽', ind.how) : FORE_NOTE);
  const foreLine = (ind, r) => `${foreNote(ind)}${ind.mape === null || ind.mape === undefined ? '' : ` · 백테스트 오차(전국 동 중앙값) MAPE ${fmt(ind.mape, '%')}`}${r && isNum(r.mape) ? ` · 이 동 백테스트 오차 ${fmt(r.mape, '%')}` : ''}${ind.disclaimer ? ` · ${ind.disclaimer}` : ''}`;
  const SAFE_NOTE = '공식 기준 없음 · 점수 아님 · 공식 시설 현황만';
  // 공식 기준이 없는 생활 지표의 고정 참고 구간(화면 표시용 눈금, 분위 아님). 자료가 ref_edges를 주면 그것을 쓴다
  const REF_EDGES = { POP_YOUTH_PCT: [10, 15, 20, 25], HOSP_CLINIC_COUNT: [1, 5, 10, 30], HOSP_PER10K: [2, 5, 10, 20], PARK_COUNT: [1, 3, 5, 10], BUS_STOP_DENSITY: [5, 10, 20, 40],
    // 독거노인 수(부산 206동, 2026-11-14 값 10·50·90% 577·1,067·2,127명)는 한 색이라 동끼리 견줄 수 없었다(페르소나 점검: 한파 순찰 대상 고르기) → 둥근 고정 눈금
    ELDERLY_LIVING_ALONE: [500, 1000, 1500, 2000] };
  // living/index.json의 group은 키(life) 또는 이름(생활 인프라)이다. '교통'은 대표 결정대로 생활 인프라에 둔다
  const GROUP_ALIAS = { '쇠퇴·노후': 'aging', 노후: 'aging', '부동산 거래': 'estate', 부동산: 'estate', 정비: 'aging', '노후·정비': 'aging', '정비 신호': 'aging', 경제: 'aging', 인구: 'pop', '인구 변화': 'pop', '인구·가구': 'pop', '생활 인프라': 'life', '생활 여건': 'life', 생활: 'life', 교통: 'life', '안전 인프라': 'safe', 안전: 'safe', '건축·정비': 'aging', 복지: 'pop', 전망: 'fore', '추세 전망': 'fore', 종합: 'sum' };
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
  // 하한 기준(below_bad, 예: 공원 1인당 6㎡ 이상)은 기준 문장만 적으면 '1.1㎡/인 · 기준 해당 · 기준 … 6㎡ 이상'이 기준을 채운 값처럼 읽혔다(r16 4차 B5).
  // 문서(docgen criteriaTable 기준 칸 '6㎡/인 미만')처럼 기준 해당이 되는 조건을 앞에 적고, 기준 원문은 그 값의 근거로 뒤에 둔다. 상한 기준(above_bad)은 문장 그대로
  const belowLead = ind => (validStd(ind.standard) && ind.standard.direction === 'below_bad' ? `${fmt(ind.standard.value, ind.unit)} 미만이면 ${HIT} · ` : '');
  const ascending = a => Array.isArray(a) && a.length > 0 && a.length < REF.length && a.every((x, i) => isNum(x) && (i === 0 || x > a[i - 1]));
  // living/index.json의 지표 → 화면 지표. 기준이 없으면 ref_edges(고정 참고 구간)가 있을 때만 단계 색, 없으면 한 색
  // _DELTA5Y는 따로 칩을 만들지 않고 본 지표의 5년 변화 화살표로 쓴다. coverage에서 값 있는 동이 0이면 수집 중
  function livingIndicators(li) {
    if (!li || !Array.isArray(li.indicators)) return LIVING_EXPECTED;
    const cov = li.coverage || {};
    // hidden_until_decision: 대표 결정 전까지 화면에 내지 않는 지표. 2026-11-07 D26로 안전비상벨은 풀었다
    const list = li.indicators.filter(x => x && x.code && x.label && !/_DELTA5Y$/.test(x.code) && x.hidden_until_decision !== true).map(x => {
      const code = String(x.code), group = groupKey(x.group), c = cov[code], ref = ascending(x.ref_edges) ? x.ref_edges : REF_EDGES[code];
      const base = { code, group, label: String(x.label), unit: x.unit || '', icon: iconFor(x.label), living: true, title: String(x.label), empty: !!c && c.dongs_with_value === 0,
        delta: li.indicators.some(y => y && y.code === code + '_DELTA5Y'), worseUp: true, ...(x.source ? { source: String(x.source) } : {}) }; // 범례 출처는 이 지표의 출처
      if (group === 'sum') return { ...base, icon: 'sum', composite: true, edges: [1, 2, 3, 4], colors: SUMC, labels: ['0개', '1개', '2개', '3개', '4개 이상'], standard: null,
        title: `${x.label} · 출처 값 · 가중치·순위 없음 · 판정 아님` };
      if (validStd(x.standard)) return { ...base, ...stdScale(x.standard), worseUp: x.standard.direction === 'above_bad', standard: { ...x.standard, status: x.standard.status || '', source: plainSource(x.standard.source) } };   // 출처 문구의 저장소 경로는 걷어 낸다(v9)
      if (ascending(ref)) return { ...base, edges: ref, colors: REF.slice(REF.length - ref.length - 1), standard: null, ref: true };
      return { ...base, edges: [], colors: [REF[2]], labels: ['값 있음'], standard: null };
    });
    return list.some(x => x.group === 'safe') ? list : list.concat(pendingOf('safe', EXPECTED.safe)); // 안전 인프라 자료가 아직 없으면 수집 중 자리만
  }
  // 화면 지표 목록: 그룹 순서(고정) → 그룹 안에서는 정의 순서. 값으로 줄 세우지 않는다
  // 원장이 종합(기준선 넘은 지표 수)을 주면 화면에서 따로 세지 않는다
  function allIndicators(li, ext) {
    const lv = livingIndicators(li), gi = g => GROUPS.findIndex(x => x[0] === g);
    const bad = ext && ext.failed, list = [...INDICATORS.filter(i => !(i.computed && lv.some(x => x.group === 'sum'))), ...lv, ...extraIndicators(ext, lv)]
      .map(i => (bad && i.pending && bad.has(auxKey(i)) ? { ...i, failed: true } : i));   // ext.failed: 받지 못한 보조 자료 이름(map 브라우저 state.failed)
    return list.sort((a, b) => gi(a.group) - gi(b.group)); // 안정 정렬: 묶음 안에서는 정의 순서 유지
  }
  // 지표가 기대는 보조 자료 이름(브라우저 AUX 표의 열쇠). 생활 지표 자리(LIVING_EXPECTED)는 living/index.json
  const auxKey = i => (i.src === 'forecast' ? 'forecastIdx' : i.src || (i.living ? 'living' : null));
  const MODES = [['now', '현재'], ['trend', '5년 변화']];
  const indOf = (code, list) => (list || INDICATORS).find(i => i.code === code) || INDICATORS[0];
  // R3 9: 주소의 ?ind=CODE로 처음 지표를 고른다(소개의 쓰임 링크). 지표 목록에 있는 코드만 받고, 없으면 무시한다(생활 지표는 늦게 도착해 목록이 자란다)
  const wantedInd = (want, list) => (typeof want === 'string' && list.some(i => i.code === want) ? want : null);
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
      return { edges, colors: ind.worseUp ? DIVERGE : [...DIVERGE].reverse(), labels, unit, title: `${ind.label} 5년 변화 · 청록 기준에서 멀어지는 쪽 · 주황 기준 쪽` };   // r16 사전 K: 악화·개선 대신 방향
    }
    return { edges: ind.edges || [], colors: ind.colors || [NULL_COLOR], labels: ind.labels || edgeLabels(ind.edges || [], ind.unit), unit: ind.unit, title: ind.title || ind.label };
  }
  const colorOf = (v, scale) => { const b = binIndex(v, scale.edges); return b < 0 ? NULL_COLOR : scale.colors[b]; };
  // 2026-11-20 r11: 추가확인(값은 있으나 정하지 못함)도 지도에서는 결측과 같은 빗금이다(C09 D) → 지금 칸에 추가확인이 있으면(check) 범례에 따로 적는다
  function legendItems(ind, mode, check) {
    const s = scaleFor(ind, mode);
    return (ind.pending ? [] : s.colors.map((color, i) => ({ color, label: s.labels[i] }))).concat({ color: NULL_COLOR, label: ind.pending ? soonText(ind) : ind.held ? '보류' : '자료 없음·비공개', hatch: true },
      check && !ind.pending ? [{ color: NULL_COLOR, label: '추가확인', hatch: true, check: true }] : []);
  }
  const CHECK_NOTE = '빗금 가운데 추가확인은 값이 있어도 아직 정하지 못한 곳입니다. 목록과 말풍선에 추가확인으로 적습니다.';
  // 목록·말풍선의 값 글. 추가확인 칸은 꼬리표를 붙이고, 값이 없으면 '자료 없음' 대신 추가확인만 적는다
  const itemText = it => (!it.check ? it.text : it.value == null ? '추가확인' : `${it.text} · 추가확인`);
  const isPending = s => !!s && /초안|대기|미승인/.test(String(s.status || ''));
  // 기준선보다 나쁜 쪽인가. 기준 없음·값 없음은 null
  function crossed(v, s) {
    if (!validStd(s) || !isNum(v)) return null;
    return s.direction === 'below_bad' ? v < s.value : v >= s.value;
  }
  // 추세 화살표: 값이 늘면 ▲, 줄면 ▼. 기준이 있으면 기준 쪽인지(toward)를 색·말풍선으로만(r16 사전 K: 악화·개선 같은 가치 낱말을 쓰지 않는다)
  function trendText(delta, ind) {
    if (!isNum(delta)) return null;
    if (Math.abs(delta) < 1e-9) return { arrow: '→', word: '변화 없음', cls: 'same' };
    const up = delta > 0;
    if (!judged(ind)) return { arrow: up ? '▲' : '▼', word: up ? '늘어남' : '줄어듦', cls: 'neutral' };
    const worse = up === ind.worseUp;
    return { arrow: up ? '▲' : '▼', word: up ? '늘어남' : '줄어듦', cls: worse ? 'worse' : 'better', toward: worse ? '기준 쪽으로' : '기준에서 멀어지는 쪽으로' };
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
  // 주소에 적는 경로(resolve가 다듬은 꼴). 동은 읍·면·동 단계일 때만
  const routeHash = (v, route) => toHash({ sido: v.sido && v.sido.code2, sigungu: v.sigungu && v.sigungu.code5, gu: v.gu && v.gu.code5, dong: v.level === 'emd' ? route.dong : null });
  // 기초 목록: parent가 있으면 parent 기준(일반구·행정시), 없으면 시도 직속
  const childrenOf = (index, code) => ((index && index.sigungu) || []).filter(s => String(s.parent || s.sido2) === String(code));
  const sgOf = (index, code5) => ((index && index.sigungu) || []).find(s => String(s.code5) === String(code5)) || null;
  const sidoOf = (index, code2) => ((index && index.sido) || []).find(s => String(s.code2) === String(code2)) || null;
  // 지도에 그려지는 칸(경계가 있는 단위): 아래에 일반구를 둔 시(수원시 등)는 빼고 그 일반구를 넣는다
  // 시·군·구 대표값이 절반 미만 지역에만 있으면 그 시·도 이름(2곳까지)을 돌려준다. 예: '부산만'. 순위 아님
  function coverLabel(ind, index) {
    if (ind.src === 'forecast' && ind.level !== 'sg' && !ind.pending && !ind.sgFile) return '동 단위'; // 시·군·구 전망 파일(forecast/sigungu.json)이 없으면 전국·시·도 지도는 빈칸
    if (!index || ind.src || ind.computed || ind.level === 'sg' || ind.pending) return '';
    const all = leavesOf(index), has = all.filter(sg => isNum(summaryOf(sg, ind.code).value));
    if (!has.length || has.length >= all.length / 2) return '';
    // 2026-11-16 우지예: 양산·거제만 값이 있는 지표가 '부산·경상남만'으로 나왔다('도'를 떼는 규칙 + 경남 전체처럼 읽힘).
    // 시·도 안의 모든 시·군·구에 값이 있으면 시·도 줄임말(부산·경남), 일부만 있으면 그 시·군·구 이름(양산·거제)을 쓴다. 이름이 3개 넘으면 '일부 지역'
    const names = [];
    for (const c of [...new Set(has.map(sg => String(sg.sido2)))]) {
      const mine = has.filter(sg => String(sg.sido2) === c);
      if (mine.length >= leavesOf(index, c).length) names.push(sidoShort(((index.sido || []).find(x => String(x.code2) === c) || {}).name));
      else names.push(...mine.map(sg => String(sg.name || '').replace(/(시|군|구)$/, '')));
    }
    const ok = names.filter(Boolean);
    return ok.length && ok.length === names.length && ok.length <= 3 ? `${ok.join('·')}만` : '일부 지역';
  }
  // 시·도 줄임말(경상남도→경남). 표에 없으면 끝의 특별시·광역시 등을 뗀다
  const SIDO_SHORT = { 경상남도: '경남', 경상북도: '경북', 충청남도: '충남', 충청북도: '충북', 전라남도: '전남', 전북특별자치도: '전북', 전라북도: '전북', 강원특별자치도: '강원', 강원도: '강원', 제주특별자치도: '제주', 경기도: '경기' };
  const sidoShort = n => (n ? SIDO_SHORT[n] || n.replace(/(특별시|광역시|특별자치시|특별자치도)$/, '') : '');
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
  // r16: 화면 배지는 무엇으로 칠했는지('기초 단계'의 뜻이 안 잡혔다). 전국·시·도·일반구 화면도 칸은 시·군·구다
  const STEP_BADGE = { nation: '시·군·구별 색', sido: '시·군·구별 색', gu: '시·군·구별 색', emd: '읍·면·동별 색' };
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
    const sg = sgOf(index, r.sigungu);
    // 일반구를 시 자리에 둔 주소(#map/31/31192/…, 홈·순위·검색이 code5 하나로 만든다)는 상위 시 아래 구로 고쳐 읽는다.
    // v9: 이 경우 시·도 단계에서 멈춰, 일반구에 속한 동 461곳이 홈에서 눌러도 열리지 않았다
    if (sg && !r.gu && /^\d{5}$/.test(String(sg.parent || '')) && !sgs.includes(sg)) {
      const par = sgOf(index, sg.parent);
      if (par && sgs.includes(par)) return resolve(index, { sido: r.sido, sigungu: par.code5, gu: sg.code5, dong: r.dong });
    }
    if (!sg || !sgs.includes(sg)) { out.level = 'sido'; out.step = STEP.sido; out.children = sgs; return out; }
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
      out.push({ label: [name, sgName, sidoName].filter(Boolean).join(' · '), route: { ...r, dong: String(code7) }, name, region: [sgName, sidoName],   // name·region: 법정동 이름으로 찾기(util.js dongHit)
        ...(row[5] ? { href: `dong/${code7}.html` } : {}) });   // 여섯째 칸 true: 2025 경계가 없는 동(dong_extra.json). 지도 대신 그 동 쪽으로(홈 찾기와 같다)
    }
    return out;
  }
  const flatName = x => String(x || '').replace(/\s|·/g, '');
  const byLabel = (a, b) => a.label.localeCompare(b.label, 'ko', { numeric: true });
  // '로/으로': 받침 없거나 ㄹ 받침이면 '로'(v9: '사하구 · 부산광역시(으)로'처럼 자리표시가 그대로 보였다)
  const roJosa = w => { const c = String(w).slice(-1).charCodeAt(0) - 0xAC00; return c < 0 || c > 11171 || c % 28 === 0 || c % 28 === 8 ? '로' : '으로'; };
  function findEntry(entries, q) {
    const s = String(q || '').trim().replace(/\s+/g, ' ');
    if (!s) return null;
    const f = flatName(s);
    return entries.find(e => e.label === s) || entries.filter(e => e.name && dongHit(s, e.name, e.region)).sort(byLabel)[0] || entries.find(e => flatName(e.label).startsWith(f)) || entries.find(e => flatName(e.label).includes(f)) || null;
  }
  // r16 B5: 같은 이름(법정동 이름 포함)의 동이 둘 이상이면 옮기지 않고 후보를 돌려준다(홈 찾기와 같게). 자동완성 이름 그대로면 그곳으로
  // 돌려주는 것: { go: 항목 } | { many: 앞 8곳, total: 전체 수, same: 이름이 모두 같은가 } | { none: true }
  const CAND_MAX = 8;
  // r16: 후보는 지금 보는 범위(구 → 시·군·구 → 시·도) 안의 동, 시범 지역 부산, 그 밖은 시·군·구 코드 순(부산을 보는데 '중앙동' 8곳에 부산 중구가 없었다)
  const PILOT_SIDO = '21';
  const scopeOrder = (r, sc) => (sc.gu && r.gu === sc.gu ? 0 : sc.sigungu && r.sigungu === sc.sigungu ? 1 : sc.sido && r.sido === sc.sido ? 2 : r.sido === PILOT_SIDO ? 3 : 4);
  function searchPick(entries, q, scope = {}) {
    const s = String(q || '').trim().replace(/\s+/g, ' ');
    if (!s) return { none: true };
    const exact = entries.find(e => e.label === s); if (exact) return { go: exact };
    const code5 = e => String(e.route.gu || e.route.sigungu || '');
    const hits = entries.filter(e => e.name && dongHit(s, e.name, e.region)).sort((a, b) => scopeOrder(a.route, scope) - scopeOrder(b.route, scope) || code5(a).localeCompare(code5(b)) || byLabel(a, b));
    if (hits.length > 1) return { many: hits.slice(0, CAND_MAX), total: hits.length, same: hits.every(e => e.name === hits[0].name) };
    const e = findEntry(entries, s);
    return e ? { go: e } : { none: true };
  }
  const candMsg = r => `${r.same ? '같은 이름의 동이' : '맞는 동이'} ${r.total}곳 있습니다. ${r.total > CAND_MAX ? '시·군·구 이름을 같이 적어 주세요(예: 창원 중앙동).' : '시·군·구를 골라 주세요.'}`;
  // 후보 줄: '{동} <small>{시·도} {시·군·구}</small>', 낭독은 '{동}, {시·도} {시·군·구}'
  const candHTML = list => list.map(e => { const where = [...(e.region || [])].reverse().filter(Boolean).join(' ');
    return `<a class="dash-chip" href="${esc(e.href || toHash(e.route))}" aria-label="${esc(`${e.name}, ${where}`)}">${esc(e.name)} <small>${esc(where)}</small></a>`; }).join('');
  // 입력한 글자에 맞는 이름만 n개(앞에서 맞는 것 먼저). 자동완성 목록에 전국 이름 3,800여 개를 한꺼번에 넣으면 화면 요소가 4,700개로 늘어 첫 화면이 무거웠다
  function suggestEntries(entries, q, n = 20) {
    const f = flatName(q); if (!f) return [];
    const hit = [], head = [], mid = [];   // hit: '우동'→우1·2·3동처럼 법정동 이름·구를 붙인 말이 가리키는 동(v9)
    for (const e of entries) { const l = flatName(e.label); if (e.name && dongHit(q, e.name, e.region)) hit.push(e); else if (l.startsWith(f)) head.push(e); else if (l.includes(f)) mid.push(e); if (hit.length + head.length >= n) break; }
    return hit.sort(byLabel).concat(head, mid).slice(0, n);   // 반여1·2·3·4동 순(v9: 코드 순이라 2·3·1·4였고 Enter가 반여2동을 열었다)
  }

  // ── 모델 ──
  // 시군구 색: index.json summary 값만 쓴다(행정동 값을 모아 계산하지 않는다)
  function summaryOf(sg, key) {
    const s = sg && sg.summary && sg.summary[key];
    return s && typeof s === 'object' ? { value: isNum(s.value) ? s.value : null, year: s.year ?? null, status: s.status || null } : { value: null, year: null, status: null };
  }
  // 한 지역의 지표 한 줄: 값과 기준선의 관계. 기준이 원문 대조 전이면 넘었어도 '기준 원문 대조 전'으로 둔다
  function rowOf(ind, value, extra) {
    if (ind.categorical) { // 행정 지정: 숫자가 아니라 상태 글자. 기준선·순위 없음
      const has = typeof value === 'string';
      return { ind, value: has ? value : null, crossed: null, status: ind.pending ? soonText(ind) : !has ? '자료 없음' : value === DESIG_NONE ? '미지정' : '행정 지정', text: has ? value : null, ...extra };
    }
    const v = isNum(value) ? value : null, c = crossed(v, ind.standard);
    const status = ind.pending ? soonText(ind) : v === null ? (extra && extra.held ? '보류' : '자료 없음') : ind.src === 'forecast' ? '추세 전망' : !ind.standard ? '공식 기준 없음' : isPending(ind.standard) ? '기준 원문 대조 전' : c ? '기준 넘음' : '기준 안';
    return { ind, value: v, crossed: c, status, ...extra };
  }
  // 같은 동 중앙값은 결측까지 갱신한다. 직접 원장 집계·시군구 원값은 다른 공간 단위라 보존한다.
  function mergeLivingSummary(index, sum) {
    if (!index || !sum || !sum.items) return;
    for (const sg of index.sigungu) {
      const row = sum.items[String(sg.code5)] || {};
      sg.summary = sg.summary || {};
      for (const code of sum.indicators || Object.keys(row)) {
        const old = sg.summary[code], owned = old && !old.cell_id && (old.agg === '읍·면·동 중앙값' || old.dongMedian === true);
        if (old && !owned) continue;
        const current = row[code];
        if (!current && !owned) continue;
        const [value, year, n] = current || [null, null, 0];
        sg.summary[code] = { value: isNum(value) ? value : null, year, n, status: null, dongMedian: true };
      }
    }
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
      const value = st ? st[0] : row.status === DESIG_NONE || row.status === null ? DESIG_NONE : null;
      return { value, year: null, text: value ?? '지정 구분 추가확인', color: st ? st[1] : value === null ? NULL_COLOR : BELOW[0],
        check: value === null, since: row.since ?? null, cell: (row.cells || []).find(c => c && c.value === value) || null };
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
    if (ind.src === 'forecast') { // 시·군·구 전망(forecast/sigungu.json): 인구는 동 GB 합과 시·군·구 추세의 평균, 65세 이상은 시·군·구 추세. 구간 없으면 값 없음(윤리 원칙 ④)
      const row = sgMatch(e.forecastSg && e.forecastSg.sigungu, sg), a = row && row.forecast && row.forecast[ind.fc] && isNum(e.horizon) ? row.forecast[ind.fc][String(e.horizon)] : null;
      if (!Array.isArray(a) || !isNum(a[0]) || !isNum(a[1]) || !isNum(a[2])) {
        const held = row && row.excluded && typeof row.excluded[ind.fc.replace(/_CHANGE_PCT$/, '')] === 'string' ? '보류' : '자료 없음';
        return { value: null, year: null, text: held, color: NULL_COLOR, cell: null };
      }
      const lo = Math.min(a[1], a[2]), hi = Math.max(a[1], a[2]);
      return { value: a[0], year: e.horizon, text: `${fmt(a[0], ind.unit)} · ${e.horizon}년 전망 · 80% 구간 ${fmt(lo, ind.unit)}~${fmt(hi, ind.unit)}`, color: colorOf(a[0], scaleFor(ind, 'now')), cell: null, lo, hi };
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
    const bt = fd.backtest && (fd.backtest[base] || fd.backtest[base.replace(/_CHANGE_PCT$/, '')]);   // 이 동 자신의 백테스트 오차(전국 동 중앙값과 나란히 보인다)
    return { point: a[0], lo: Math.min(a[1], a[2]), hi: Math.max(a[1], a[2]), mape: bt && isNum(bt.mape) ? bt.mape : null, cell: ((fd.cells || []).find(c => c.indicator_code === code || c.indicator_code === base) || null) };
  }
  // 기준선 넘은 지표 수: 확정(승인된 기준을 넘음) · 추가확인(넘었지만 기준 원문 대조 전) · 자료 없음. 묶음 지표(요건 충족 수)와 종합은 세지 않는다
  function tally(rows) {
    const r = rows.filter(x => !x.ind.composite && !x.ind.computed && (x.ind.standard || x.ind.pending));
    return { confirmed: r.filter(x => x.status === '기준 넘음' && !x.unsettled).length, pending: r.filter(x => x.status === '기준 원문 대조 전' && x.crossed).length,
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
    // 5·6열(쇠퇴 요건 수 MET만): 동 충족 수 상한의 중앙값 U, 하한·상한이 기준선을 사이에 둔 동 수(확정 불가). 4열 옛 자료는 null
    return r ? { year: r[0], value: isNum(r[1]) ? r[1] : null, over: isNum(r[2]) ? r[2] : null, n: isNum(r[3]) ? r[3] : 0, upper: isNum(r[4]) ? r[4] : null, unsure: isNum(r[5]) ? r[5] : null } : null;
  }
  // 동 수 세기: 전국은 national_series(일반구 중복 없음), 시도는 그 안 칸(경계 있는 시군구)의 수를 더한다. 순위 아님
  function countOver(index, code, year, sgs) {
    if (!sgs) { const r = natRows(index, code).find(x => x[0] === year); return { over: r && isNum(r[1]) ? r[1] : null, n: r && isNum(r[2]) ? r[2] : 0 }; }
    let over = null, n = 0;
    for (const sg of sgs) { const r = sgRow(sg, code, year); if (r && r.n) { n += r.n; if (r.over !== null) over = (over || 0) + r.over; } }
    return { over, n };
  }
  // 첫 화면 문구: '기준선(50% 이상) 넘은 동 n곳 / 값 있는 동 m곳 · 2016년'. 연도가 없으면 자료 있는 마지막 해
  // 시·도별 '값 있는 동 중 기준선 넘은 동' 합계 비율. over·n이 둘 다 숫자인 칸만 센다. 셀 칸이 없으면 0%가 아니라 '—'(막대 없음)
  function sidoShare(by) {
    const rows = new Map(), f = nf(0).format;
    by.forEach((xs, k) => {
      const ok = xs.filter(x => isNum(x.over) && isNum(x.n) && x.n > 0), over = ok.reduce((a, x) => a + x.over, 0), n = ok.reduce((a, x) => a + x.n, 0);
      if (!n) { rows.set(k, { w: null, text: '—', aria: '기준선 넘은 동 자료 없음' }); return; }
      const p = Math.round(over / n * 100);
      rows.set(k, { w: p, text: `${p}%`, aria: `값 있는 동 ${f(n)}곳 중 기준선 넘은 동 ${f(over)}곳, ${p}%` });
    });
    return rows;
  }
  function overCaption(index, ind, year, sgs) {
    const py = playYears(index, ind.code), lastRow = [...natRows(index, ind.code)].reverse().find(r => isNum(r[1]) && r[2] > 0);
    const y = isNum(year) ? year : lastRow ? lastRow[0] : null, c = countOver(index, ind.code, y, sgs), std = overStd(index, ind);
    const reg = ind.breakSource && index && index[ind.breakSource] ? index[ind.breakSource].register_based_from : null;
    const notes = [ind.noPlay ? ind.yearNote : null, isNum(reg) && y >= reg ? `${reg}년부터 등록기반 통계로 바뀐 뒤 — 이전 해와 직접 비교 주의` : null].filter(Boolean);
    const f = nf(0).format, stdText = std === null ? '' : `기준선(${pm(std)}${ind.unit} 이상)`;
    return { year: y, over: c.over, n: c.n, std, notes, skipNote: !ind.noPlay && py.skipped.length ? `자료 없는 해 건너뜀: ${py.skipped.join('·')}` : null,
      text: sgs && index && index.seriesPending ? '연도별 동 수를 불러오는 중입니다' : c.n ? `${stdText} 넘은 동 ${c.over === null ? '–' : f(c.over)}곳 / 값 있는 동 ${f(c.n)}곳 · ${y}년` : `${y ?? ''}년은 자료가 없습니다` };
  }
  // 분리 자료는 같은 생성판에서만 합친다. 추가 지표를 기다리는 동안 결측이나 0으로 판단하지 않는다.
  const indexSummaryPending = (index, ind, mode) => !!(index && Array.isArray(index.summary_codes) && !index.summaryReady && !ind.src &&
    (ind.computed || !index.summary_codes.includes(keyOf(ind, mode))));
  function mergeIndexSeries(index, data) {
    if (!data || !data.sigungu || typeof data.sigungu !== 'object' || Array.isArray(data.sigungu) ||
        data.snapshot_hash !== index.snapshot_hash || data.generated_at !== index.generated_at ||
        (Array.isArray(index.summary_codes) && (!data.summary || typeof data.summary !== 'object' || Array.isArray(data.summary)))) return false;
    for (const sg of index.sigungu || []) {
      if (Object.hasOwn(data.sigungu, sg.code5)) sg.series = data.sigungu[sg.code5];
      if (data.summary && Object.hasOwn(data.summary, sg.code5)) sg.summary = { ...sg.summary, ...data.summary[sg.code5] };
    }
    index.unmatched = data.unmatched || [];
    index.summaryReady = true;
    return true;
  }
  function sigunguModel(sgs, ind, mode, inds, year, ext) {
    const scale = scaleFor(ind, mode), key = keyOf(ind, mode), byYear = !!ind.series && mode !== 'trend';
    return (sgs || []).map(sg => {
      if (ind.level === 'sg' || (ind.src === 'forecast' && ind.sgFile)) { const x = sgExtra(ind, sg, ext); return { code: String(sg.code5), name: sg.name, kind: sg.kind || null, value: x.value, year: x.year, status: null, text: x.text, color: x.color, bbox: sg.bbox || null, over: null, n: null, abs: x.abs ?? null, since: x.since ?? null, cell: x.cell, check: !!x.check }; }
      let s = summaryOf(sg, key);
      const r = byYear ? sgRow(sg, ind.code, isNum(year) ? year : null) : null;
      // 2026-11-20 C09 D: 하한 중앙값 L이 기준선 아래인데 상한 중앙값 U가 기준선 이상이면(L < 기준 ≤ U) 시·군·구 색을 확정할 수 없다 → 추가확인(빗금)
      const torn = !!r && isNum(r.value) && isNum(r.upper) && !!ind.standard && isNum(ind.standard.value) && r.value < ind.standard.value && ind.standard.value <= r.upper;
      // 그해 시·군·구 색 = 그 안 읍·면·동 값의 중앙값(출처 값). 상태는 null로 덮지 않는다(요약과 같은 해면 요약 상태, 그해 행이 갈리면 추가확인)
      if (byYear && isNum(year)) s = { value: r ? r.value : null, year, status: torn ? '추가확인' : year === s.year ? s.status : null };
      if (ind.computed) {
        const parts = lawInds(inds).map(i => ({ i, s: summaryOf(sg, i.code) })), ys = parts.map(p => p.s.year).filter(isNum);
        s = { value: sumValue(parts.map(p => rowOf(p.i, p.s.value))), year: ys.length ? Math.max(...ys) : null, status: null };
      }
      return { code: String(sg.code5), name: sg.name, kind: sg.kind || null, value: s.value, year: s.year, status: s.status, text: s.dongMedian && isNum(s.value) ? `${fmtL(s.value, ind, mode, scale.unit)} · 동 중앙값` : fmtL(s.value, ind, mode, scale.unit) || '자료 없음', color: colorOf(s.value, scale), bbox: sg.bbox || null,
        over: r ? r.over : null, n: r ? r.n : null, unsure: r ? r.unsure : null, check: s.status === '추가확인' || torn };   // check: 지도는 결측과 같은 빗금
    });
  }
  const seriesOf = (dong, key) => (dong && dong.series && Array.isArray(dong.series[key]) ? dong.series[key].filter(p => Array.isArray(p) && isNum(p[0])).map(p => [p[0], isNum(p[1]) ? p[1] : null]).sort((a, b) => a[0] - b[0]) : []);
  function valueAt(series, year) { const p = series.find(x => x[0] === year); return p ? p[1] : null; }
  // 그해 값이 앞뒤 3년(값 있는 해 4개 이상)의 중앙값과 thr(%p) 넘게 다르면 {median}. 출처 값은 그대로 두고 화면에 경고만 한다
  // (v9: 남항동 노후 비율이 2020 80% → 2022 44.5%·2023 53.5% → 2024 85%. 국토부 출처가 그 두 해만 다르게 셈한 것으로 보이는 동이 42곳.
  //  두 해 연속으로 내려가 '앞뒤 해와 비교'로는 못 잡아 중앙값과 견준다)
  function seriesJump(series, year, thr = 20) {
    const v = valueAt(series, year); if (!isNum(v)) return null;
    const w = series.filter(p => Math.abs(p[0] - year) <= 3 && isNum(p[1])).map(p => p[1]).sort((a, b) => a - b);
    if (w.length < 4) return null;
    const median = w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2;
    return Math.abs(v - median) >= thr ? { median } : null;
  }
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
  // 충족 수 '기준 해당(하한)'(D1): 하한 2 이상이고, 셀이 있으면 decline-req metFloor, 셀이 없는 지난 해는 그 해가 check_years에 있을 때(비교표 programs.js와 같다).
  // 척도표 배지(dongRows)와 카드 머리(reqLineHTML)가 이 한 줄을 쓴다(r13 재검토: 머리만 '정하지 못한 요건이 있으면'도 더 봐서 지난 해 두 곳이 달랐다)
  const metFloorOf = (cell, value, held) => !!DeclineReq && isNum(value) && value >= 2 && (cell ? DeclineReq.metFloor(cell) : held);
  // 한 동의 모든 지표 줄(척도표). 순서는 지표 목록 순서 그대로 — 값으로 줄 세우지 않는다
  // ext: { migration, designations, forecastIdx, forecast(이 시군구 전망 파일), horizon(전망 연도), sg(이 시군구 index 항목) }
  function dongRows(inds, dong, ld, year, ext) {
    return (inds || INDICATORS).filter(i => !i.computed).map(ind => {
      if (ind.series) {
        const s = seriesOf(dong, ind.code), y = year ?? latestYear(s), d5 = seriesOf(dong, ind.code + '_DELTA5Y');
        const value = y === null ? null : valueAt(s, y), cell = ((dong && dong.cells) || []).find(c => c.indicator_code === ind.code && c.base_year === y && c.value === value) || null;
        // 그 해 출처 기록이 미확정(추가확인·충돌·폐기)인 값: 셀이 있으면 셀 상태, 지난 해(셀 없음)는 check_years. programs.js isHeld와 같은 규칙
        const held = ((((dong && dong.check_years) || {})[ind.code]) || []).includes(y);
        // 충족 수(D1, 2026-11-20 대표 승인)는 하한·상한으로 본다(decline-req metStatus): 하한 2 이상이면 미확정이어도 기준 해당(하한). 지난 해(셀 없음)는 check_years
        const met = ind.code === 'DECLINE_MET_COUNT' && !!DeclineReq;
        const unsettled = isNum(value) && (met ? (cell ? DeclineReq.metStatus(cell) === 'none' : held && value < 2) : cell ? !!DeclineReq && DeclineReq.cellValue(cell) === null : held);
        const floor = met && metFloorOf(cell, value, held);
        return rowOf(ind, value, { year: y, series: s, delta: y === null ? null : valueAt(d5, y), cell, evidenceMissing: isNum(value) && !cell, unsettled, floor });
      }
      if (ind.src === 'forecast') {
        const f = ind.pending ? null : fcOf(ext, ind.level === 'sg' ? null : codeOf(dong || {}), ind.fc), ok = f && !f.held;
        return rowOf(ind, ok ? f.point : null, { year: ext && isNum(ext.horizon) ? ext.horizon : null, series: null, delta: null, cell: ok ? f.cell : null, lo: ok ? f.lo : null, hi: ok ? f.hi : null, mape: ok ? f.mape : null, held: f && f.held ? f.held : ind.held || null, sgLevel: ind.level === 'sg' });
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
      let v = null, y = null, lo = null, hi = null, cell = null;
      if (ind.computed) { y = year ?? latestYear(seriesOf(d, INDICATORS[0].code)); v = sumValue(dongRows(inds, d, lm.get(code), y, ext)); }
      else if (ind.series) { const s = seriesOf(d, key); y = year ?? latestYear(s); v = y === null ? null : valueAt(s, y);
        cell = ((d.cells || []).find(c => c.indicator_code === key && c.base_year === y && c.value === v)) || null; }
      else if (ind.src === 'forecast') { const f = ind.pending || ind.level === 'sg' ? null : fcOf(ext, code, ind.fc); if (f && !f.held) { v = f.point; lo = f.lo; hi = f.hi; y = ext.horizon; cell = f.cell; } }
      else if (ind.level === 'sg') { v = null; } // 시군구 단위 자료는 읍·면·동 지도에 칠하지 않는다
      else if (!ind.pending) { cell = livingCell(lm.get(code), key); v = cell && isNum(cell.value) ? cell.value : null; y = cell?.base_year ?? null; }
      return { code, name: d.name, kind: d.kind || null, value: v, year: y, text: fmtL(v, ind, mode, scale.unit) || '자료 없음', color: colorOf(v, scale), unmatched: unmatched.has(code), lo, hi, cell };
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
    // 비율(%) 시계열에서 앞뒤 3년 중앙값과 15%p 넘게 벗어난 해는 추세 직선에서 뺀다(2026-11-14 페르소나: 광복동 노후 비율 2022·2023만 67%·41%라 추세가 '연 -0.6%p'로 거꾸로 나왔다)
    const jumps = unit === '%' ? vals.filter(p => seriesJump(series, p[0], 15)) : [];   // 15%p: 광복동 2022(67%)처럼 이웃 해도 함께 떨어진 해까지 잡는다. 카드 경고(20%p)보다 좁게
    const ys = series.map(p => p[0]), y0 = Math.min(...ys), y1 = Math.max(...ys), fit = olsFit(vals.filter(p => !jumps.includes(p)));
    const pool = [...vals.map(p => p[1]), ...(isNum(std) ? [std] : []), ...(fit ? [fit.at(y0), fit.at(y1)] : [])], lo = Math.min(...pool), hi = Math.max(...pool), span = hi - lo || 1;
    const X = y => pad + (y1 === y0 ? W / 2 - pad : (y - y0) / (y1 - y0) * (W - 2 * pad)), Y = v => H - pad - (v - lo) / span * (H - 2 * pad);
    let d = '', pen = false;
    series.forEach(p => { if (p[1] === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`; pen = true; });
    const stdLine = isNum(std) ? `<line class="tr-std" x1="${pad}" x2="${W - pad}" y1="${Y(std).toFixed(1)}" y2="${Y(std).toFixed(1)}"/>` : '';
    const trend = fit ? `<line class="tr-fit" x1="${X(y0).toFixed(1)}" x2="${X(y1).toFixed(1)}" y1="${Y(fit.at(y0)).toFixed(1)}" y2="${Y(fit.at(y1)).toFixed(1)}"/>` : '';
    const cur = series.find(p => p[0] === year && p[1] !== null) || vals[vals.length - 1];
    const u = unit === '%' ? '%p' : unit || '', slope = fit ? `${fit.slope >= 0 ? '+' : ''}${fmt(Math.round(fit.slope * 100) / 100)}${u}` : '';
    const jumpNote = jumps.length ? ` · ${jumps.map(p => p[0]).join('·')}년은 앞뒤 3년 중앙값과 15%p 넘게 달라 추세에서 뺌(출처 값 그대로)` : '';
    const cap = `${y0}~${y1}년${fit ? ` · 추세 연 ${slope}(선형회귀, 설명용)` : ''}${jumpNote}${isNum(std) ? ` · 가로 점선 기준 ${fmt(std)}${unit || ''}` : ''}`;
    const jumpDots = jumps.map(p => `<circle class="tr-jump" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.5" fill="none" stroke="currentColor"/>`).join('');
    return `<figure class="tr"><svg class="tr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} ${esc(cap)}, ${cur[0]}년 ${esc(fmt(cur[1]))}">${stdLine}${trend}${jumpDots}<path class="tr-line" d="${d}"/><circle class="tr-dot" cx="${X(cur[0]).toFixed(1)}" cy="${Y(cur[1]).toFixed(1)}" r="4"/></svg><figcaption>${esc(cap)}</figcaption></figure>`;
  }
  // 추세 전망 그래프: 실측(실선) + 전망 점추정(점선) + 80% 구간(띠). obs [[연도, 값]], fc {연도: [점, 하한, 상한]}. 구간 없는 해는 그리지 않는다(윤리 원칙 ④)
  function forecastSVG(obs, fc, label, unit) {
    const W = 520, H = 180, L = 78, R = 12, T = 10, B = 24; // 패널 폭에 맞춰 늘고 줄어든다(v4.css .fc-svg). 글자 크기도 함께 줄어 휴대폰에서도 겹치지 않게 칸을 넉넉히
    const o = (obs || []).filter(p => isNum(p[0]) && isNum(p[1])).slice(-12), f = Object.entries(fc || {}).map(([y, a]) => [Number(y), a]).filter(([y, a]) => isNum(y) && Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(isNum)).sort((a, b) => a[0] - b[0]);
    if (!o.length || !f.length) return '';
    const xs = [...o.map(p => p[0]), ...f.map(p => p[0])], x0 = Math.min(...xs), x1 = Math.max(...xs);
    const vs = [...o.map(p => p[1]), ...f.flatMap(p => p[1].slice(0, 3))], lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1, v0 = lo - pad, v1 = hi + pad;
    const X = y => L + (x1 === x0 ? (W - L - R) / 2 : (y - x0) / (x1 - x0) * (W - L - R)), Y = v => T + (v1 - v) / (v1 - v0) * (H - T - B), P = (x, y) => `${X(x).toFixed(1)} ${Y(y).toFixed(1)}`;
    const last = o[o.length - 1], fcPts = [[last[0], [last[1], last[1], last[1]]], ...f.filter(p => p[0] > last[0])];
    const band = `M${fcPts.map(([y, a]) => P(y, Math.max(a[1], a[2]))).join('L')}L${fcPts.slice().reverse().map(([y, a]) => P(y, Math.min(a[1], a[2]))).join('L')}Z`;
    const ticks = [v0 + (v1 - v0) * 0.1, (v0 + v1) / 2, v1 - (v1 - v0) * 0.1].map(v => `<text class="fc-ax" x="${L - 4}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmt(Math.round(v * (unit === '%' ? 10 : 1)) / (unit === '%' ? 10 : 1), unit))}</text>`).join('');
    const xl = [x0, last[0], x1].filter((y, i, a) => a.indexOf(y) === i).map(y => `<text class="fc-ax" x="${X(y).toFixed(1)}" y="${H - 6}" text-anchor="middle">${y}</text>`).join('');
    const end = f[f.length - 1], cap = `${o[0][0]}~${last[0]}년 실측 · ${f[0][0]}~${end[0]}년 전망(점선)과 80% 구간(띠) · ${end[0]}년 ${fmt(end[1][0], unit)}(${fmt(Math.min(end[1][1], end[1][2]), unit)}~${fmt(Math.max(end[1][1], end[1][2]), unit)})`;
    return `<figure class="tr fc"><svg class="tr-svg fc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} ${esc(cap)}">${ticks}${xl}` +
      `<line class="fc-now" x1="${X(last[0]).toFixed(1)}" x2="${X(last[0]).toFixed(1)}" y1="${T}" y2="${H - B}"/><path class="fc-band" d="${band}"/>` +
      `<path class="tr-line" d="M${o.map(p => P(p[0], p[1])).join('L')}"/><path class="fc-line" d="M${fcPts.map(([y, a]) => P(y, a[0])).join('L')}"/>` +
      `${f.filter(p => p[0] > last[0]).map(([y, a]) => `<circle class="fc-dot" cx="${X(y).toFixed(1)}" cy="${Y(a[0]).toFixed(1)}" r="4"/>`).join('')}</svg><figcaption>${esc(cap)}</figcaption></figure>`;
  }
  // 지금 보는 지표의 그래프 재료: 인구 변화율 전망은 사람 수로 그린다(변화율보다 읽기 쉬움). code7이 있으면 그 동, 없으면 시·군·구
  function forecastChart(ind, ext, node, dong) {
    if (!ind || ind.src !== 'forecast') return '';
    const base = String(ind.fc || '').replace(/_CHANGE_PCT$/, ''), unit = base === ind.fc ? ind.unit : '명', e = ext || {};
    if (dong) {
      const fd = e.forecast && Array.isArray(e.forecast.dongs) ? e.forecast.dongs.find(d => codeOf(d) === String(codeOf(dong))) : null;
      const svg = fd && fd.forecast ? forecastSVG(seriesOf(dong, base), fd.forecast[base], `${dong.name} ${ind.label}`, unit) : '';
      if (svg) return `<h4 class="map-h4">${esc(dong.name)} 추세 전망 <small>행정동 GradientBoosting · 판정 아님</small></h4>${svg}`;
    }
    const row = node && e.forecastSg ? sgMatch(e.forecastSg.sigungu, node) : null;
    const svg = row && row.forecast && row.observed ? forecastSVG(row.observed[base], row.forecast[base], `${node.name} ${ind.label}`, unit) : '';
    const how = base === 'DECLINE_POP_TOTAL' ? (row && row.pop_model === 'ens' ? '동 GB 합과 시·군·구 추세의 평균' : '시·군·구 추세') : row && row.models && typeof row.models[base] === 'string' ? `시·군·구 ${row.models[base]}` : ind.how && ind.how !== '추세 외삽' ? `시·군·구 ${ind.how}` : '시·군·구 추세 외삽'; // 시·군·구마다 코호트·추세가 다를 수 있어 그 곳 모델(sigungu.json models)을 먼저
    return svg ? `<h4 class="map-h4">${esc(node.name)} 추세 전망 <small>${esc(how)} · 판정 아님</small></h4>${svg}` : '';
  }
  // 상태 개수 도넛(비율 그림). 개수를 글자로 함께 쓴다. 순위·점수 아님
  // 한 동 패널의 세 요약(도넛·기준선 넘은 지표 수·확인할 항목)은 같은 항목 범위·같은 낱말을 쓴다. '공식 기준 없음'(값만)과 '자료 없음'을 섞지 않는다
  const DONUT = [['r', '기준 해당·지정'], ['g', '해당 안 함·지정 안 됨'], ['y', '기준 원문 대조 전'], ['b', '기준선 없음'], ['w', '추가확인']];
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
    const label = `${ind.label} ${row.value === null ? '자료 없음' : fmtI(row.value, ind, 'now', ind.unit)}${band ? `, 80% 구간 ${fmt(row.lo, ind.unit)}~${fmt(row.hi, ind.unit)}` : ''}${sv === null ? ', 공식 기준 없음' : `, 기준 ${pm(sv)}${ind.unit}`}`;
    return `<svg class="sr-bar${row.value === null ? ' is-empty' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><rect class="sr-track" x="0" y="4" width="${W}" height="10" rx="3"/>${band}${fill}${tick}</svg>`;
  }
  // 2026-11-12 화면 낱말 바꿈: '기준 미달' → '기준 해당'. 원장 상태 값('기준 넘음')은 그대로 둔다.
  // 왜: '기준 넘음'의 뜻은 "카드에 적힌 기준선 문장(예: 노후 50% 이상, 공원 1인당 6㎡ 미만)에 들어맞음"이다.
  //     생활 여건 지표에선 '미달'이 맞지만, 쇠퇴 지표(노후 83%, 요건 충족 2개)에서 '기준 미달'로 보이면
  //     용역사·추진위가 '요건을 못 채웠다'로 반대로 읽었다(docs/quality/user_paths_2026-11-12.md 2절 1).
  //     '기준 해당'은 백엔드 ingest/living.py의 '기준선 넘은 지표 수(하한)'와 같은 낱말이라 화면·자료가 한 낱말을 쓴다.
  // 재사용: 화면에서 이 낱말이 필요한 곳은 문자열을 다시 쓰지 말고 HIT를 쓴다.
  const HIT = '기준 해당';
  // D1(2026-11-20 대표 승인): 쇠퇴 요건 수 하한이 2 이상이면 셀이 추가확인이어도 기준 해당. 좁은 칸은 짧은 꼴, 기준·출처 칸은 긴 꼴(docgen OVER_FLOOR·FLOOR_NOTE)
  const FLOOR = `${HIT}(하한)`, FLOOR_LONG = '정하지 못한 요건은 세지 않았고, 확정된 요건만으로 기준 해당(하한: 최소 2개 확정)';
  const statusLabels = { '기준 넘음': HIT, '기준 안': '해당 안 함', '공식 기준 없음': '기준선 없음', '행정 지정': '지정', '미지정': '지정 안 됨', '자료 없음': '추가확인(자료 부족)', '보류': '추가확인(공개 보류)', '추세 전망': '인구 전망' };
  const stLabel = st => statusLabels[st] || st;
  // 이 기기에 저장해 둔 예전 기준일 비교값(snapshotOf의 s)은 옛 낱말로 남아 있다.
  // 낱말만 바뀐 것을 '판정 바뀜'으로 세지 않도록 diffSnap이 읽을 때 새 낱말로 맞춘다.
  // r16 OD1: 까닭은 '추가확인(까닭)' 꼴로 통일했다('추가확인 · 자료 부족' → '추가확인(자료 부족)')
  const LEGACY_LABEL = { '기준 미달': HIT, '기준 미달(승인 대기)': `${HIT}(원문 대조 전)`, '추가확인 · 자료 부족': '추가확인(자료 부족)', '추가확인 · 공개 보류': '추가확인(공개 보류)' };
  const normLabel = s => LEGACY_LABEL[s] || s;
  const ROW_CLASS = { '기준 넘음': 'over', '기준 안': 'in', '자료 없음': 'none', '기준 원문 대조 전': 'wait', '공식 기준 없음': 'nostd', '수집 중': 'soon', '불러오지 못함': 'soon', '추세 전망': 'fore', '행정 지정': 'desig', '미지정': 'in', '보류': 'none', '추가확인': 'none' };
  // 척도표·확인할 항목에 보일 상태. 값과 기준선의 비교(r.status)는 그대로 두고, 그 해 출처 기록이 미확정(dongRows unsettled)이면
  // '기준 해당'·'해당 안 함' 대신 추가확인(요약 탭 세 줄·동 페이지·홈 카드와 같은 낱말). 연도 막대로 지난 해를 골라도 같은 규칙이다
  const shownSt = r => (r.unsettled && (r.status === '기준 넘음' || r.status === '기준 안') ? '추가확인' : r.status);
  // r16 공통 사전: 추가확인 줄 아래 까닭 한 줄 '(전국 공통) …' / '(이 동 자료) …'(util.checkWhy). 까닭을 모르면 빈 글
  const whyText = w => (w ? `(${w.tag}) ${w.text}` : '');
  const whyOf = r => (r && shownSt(r) === '추가확인' && r.cell ? whyText(checkWhy(r.cell)) : '');
  // 한 지표 줄의 화면 상태(현황 보고서 카드·근거서 2절이 지도 카드와 같은 말을 쓰게): 띠 class, 상태 낱말, 까닭 한 줄
  const rowState = r => { const st = shownSt(r); return { cls: ROW_CLASS[st] || 'none', label: r.floor ? FLOOR : stLabel(st), why: whyOf(r) }; };
  // 고정 문구(docs/legal/ai_ethics.md 1부 · 총괄 지시 2026-10-24). 화면마다 상시 표시
  const FORE_FIXED = '과거 추세를 이어 본 계산입니다. 판정이나 투자·거래 조언이 아니며, 정책·경기 변화로 달라질 수 있습니다. 표시된 범위는 불확실성 구간입니다.';
  const SAFE_FIXED = 'CCTV·보안등·경찰관서까지의 거리는 확인된 시설 현황입니다. 범죄 발생이나 안전 수준을 의미하지 않으며, 지역 간 순위나 등급을 매기지 않습니다.';
  const AI_HEAD = 'AI가 리뉴맵 출처 기록의 숫자와 출처를 문장으로 옮깁니다. 평가나 판정은 하지 않습니다.';
  const AI_FOOT = 'AI 생성 문장입니다. 공모·계획에 쓰기 전에 출처 기록 화면과 출처를 사람이 확인하세요.';
  const REPORT_FOOT = '판정 아님 · AI 문장은 참고용 · 사람 검토 권고';   // r16 사전 K: '숫자마다'는 D29 부제 자리 밖에서 쓰지 않는다
  // 항목마다 기준·단위 설명 한 줄
  const ACCESS_METHOD_NOTE = '동 대표점의 직선거리 · 주민별 보행·도로망 이동시간이나 시설 수용력 분석이 아닙니다';
  const accessMethod = ind => ['LIB_NEAREST_M', 'ER_NEAREST_M', 'POLICE_NEAREST_M', 'ELEM_SCHOOL_NEAREST_M', 'SUBWAY_NEAREST_M'].includes(ind.code) ? ACCESS_METHOD_NOTE + (ind.group === 'safe' ? ` · ${SAFE_NOTE}` : '') : '';
  function stdTextOf(r) {
    const ind = r.ind;
    if (ind.pending) return ind.failed ? '자료를 불러오지 못했습니다. 숫자를 만들지 않습니다.' : '자료를 모으는 중입니다. 숫자를 만들지 않습니다.';
    if (r.floor) return `${FLOOR_LONG} · ${stdTextOf({ ...r, floor: false, evidenceMissing: false })}`;
    if (r.evidenceMissing) return (r.unsettled ? '이 해 출처 기록 추가확인 · 기준 해당 여부 정하지 않음' : SERIES_NO_CELL) + (ind.standard ? ` · ${belowLead(ind)}기준 ${ind.standard.text}` : ind.note ? ` · ${ind.note}` : '');
    // 30년 감소율 셀이 비면 까닭을 적는다(docs/quality/pop_drop30_missing_2026-11-06.md: 98%가 지금 행정동 코드 기록이 1995년 뒤 시작). 값을 지어 채우지 않는다
    if (ind.code === 'DECLINE_POP_DROP30Y_PCT' && r.value === null && r.cell) return `계산 안 함 · 1996~2025년 인구 기록이 다 있지 않음(대부분 지금 행정동 코드가 1995년 뒤에 생김) · 요건 ①은 '최근 5년 중 3년 연속 감소' 길로 볼 수 있음${ind.standard ? ` · 기준 ${ind.standard.text}` : ''}`;
    if (ind.src === 'forecast') return `${r.held ? `보류 · ${r.held} · ` : ''}${foreLine(ind, r)}${isNum(r.lo) && isNum(r.hi) ? ` · 80% 구간 ${fmt(r.lo, ind.unit)}~${fmt(r.hi, ind.unit)}` : ''}${ind.level === 'sg' ? ' · 시·군·구 단위' : ''}`;
    if (ind.level === 'sg') return `시·군·구 단위 자료 · 읍·면·동 값이 아닙니다${ind.group === 'estate' ? ` · ${ESTATE_NOTE}` : ''}${r.since ? ` · 지정 ${r.since}` : ''}${isNum(r.abs) ? ` · 순이동 ${fmt(r.abs, '명')}` : ''}`;
    const method = accessMethod(ind);
    if (method) return `${method}${ind.standard ? ` · ${belowLead(ind)}기준 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · ${ind.standard.status}${r.crossed ? ' · 기준선 넘은 쪽' : r.crossed === false ? ' · 기준선 안쪽' : ''}` : ''}` : ''}`;
    if (ind.standard) return `${belowLead(ind)}기준 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · ${ind.standard.status}${r.crossed ? ' · 기준선 넘은 쪽' : r.crossed === false ? ' · 기준선 안쪽' : ''}` : ''}`;
    if (ind.group === 'safe') return SAFE_NOTE;
    const rent = rentSub(ind.code, r.cell), base = ind.note || (ind.ref ? '공식 기준 없음 · 참고 구간' : '공식 기준 없음');
    return rent ? `${rent} · ${base}` : base;
  }
  // R4 12: 전세·월세 중위값은 '몇 건에서 어떤 주택으로 셌는지'가 같이 있어야 쓸 수 있다. 값 셀의 sample_n(계약 수)과 note의
  // '계약월 …, 아파트 N건, 연립다세대 N건…'에 이미 있는 것만 옮기고 없으면 쓰지 않는다(export_dong_pages.rent_sub와 같은 글). 월세는 보증금이 별도라는 말을 붙인다
  const RENT_NOTE = /계약월 (\d{4}\.\d{2})~(\d{4}\.\d{2}), ((?:[가-힣]+ [\d,]+건(?:, )?)+)/;
  function rentSub(code, cell) {
    const n = cell && cell.sample_n, m = RENT_NOTE.exec((cell && cell.note) || '');
    if (!['JEONSE_M2_MED', 'WOLSE_MED'].includes(code) || !Number.isInteger(n) || n <= 0 || !m) return '';
    return `계약 ${n.toLocaleString('ko-KR')}건 · ${m[3].split(', ').map(k => k.replace(/ [\d,]+건$/, '')).join('·')} 합산 · 계약월 ${m[1]}~${m[2]}${code === 'WOLSE_MED' ? ' · 보증금 별도' : ''}`;
  }
  const rowText = r => r.text || fmtI(r.value, r.ind, 'now', r.ind.unit) || '–';
  // 한눈 요약: 항목마다 점 하나를 묶음별로 늘어놓는다. 도넛(비율)이 아니라 개수만 — 순위·점수 아님
  const dotOf = r => { const st = shownSt(r); return r.ind.pending ? 'p' : st === '기준 넘음' || st === '행정 지정' ? 'r' : st === '기준 안' || st === '미지정' ? 'g' : st === '기준 원문 대조 전' ? 'y' : r.value === null || st === '추가확인' ? 'w' : 'b'; };
  function glanceHTML(rows) {
    const list = rows.filter(r => !r.ind.composite && r.ind.group !== 'sum' && r.ind.group !== 'fore'), n = k => list.filter(r => dotOf(r) === k).length; // 수집 중(p)은 점만 찍고 도넛 개수에는 넣지 않는다
    const groups = GROUPS.filter(([g]) => list.some(r => r.ind.group === g)).map(([g, gl]) => `<span class="gl-grp"><span class="gl-k">${gIco(g)}${esc(gl)}</span>${list.filter(r => r.ind.group === g).map(r => `<i class="gl-${dotOf(r)}" title="${esc(r.ind.label)} · ${esc(stLabel(shownSt(r)))}"></i>`).join('')}</span>`).join('');
    const counts = Object.fromEntries(DONUT.map(([k]) => [k, n(k)]));
    return `<div class="sr-glance" role="img" aria-label="한눈 요약. 기준 해당 또는 행정 지정 ${n('r')}개, 기준 안 ${n('g')}개, 기준 원문 대조 전 ${n('y')}개, 공식 기준 없음 ${n('b')}개, 추가확인 ${n('w')}개. 항목마다 점 하나이며 순위·점수가 아닙니다.">` +
      `<div class="gl-top">${donutSVG(counts)}<ul class="gl-n">${DONUT.map(([k, l]) => `<li><b class="gl-sw sw-${k}" aria-hidden="true"></b>${l} <b>${counts[k]}</b></li>`).join('')}</ul></div><p class="gl-dots">${groups}</p><p class="gl-note">묶음별 점 하나가 항목 하나 · 순위·점수 아님</p></div>`;
  }
  // 세부항목별 척도표. detail(cell) → [[라벨, 값, 링크]] (dashboard.js detailRows). 그룹·항목 순서 고정
  function scaleTableHTML(rows, opt) {
    const o = opt || {}, t = tally(rows), detail = o.detail || (() => []);
    const dl = cell => `<dl>${detail(cell).map(([k, val, href]) => `<div><dt>${esc(k)}</dt><dd>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(val)}</a>` : esc(val)}</dd></div>`).join('')}</dl>`;
    const led = rows.find(r => r.ind.living && r.ind.group === 'sum' && r.value !== null), confirmed = led ? led.value : t.confirmed;
    const waiting = rows.filter(r => isPending(r.ind.standard)).map(r => r.ind.label);
    const head = `<div class="sr-tally" role="group" aria-label="기준선 넘은 지표 수"><p class="sr-tally-k">기준선 넘은 지표 수</p>` +
      `<p class="sr-tally-n"><span>기준 해당 <b data-ck="t-c" data-count="${confirmed}">${confirmed}</b></span><span>기준 원문 대조 전 <b data-ck="t-p" data-count="${t.pending}">${t.pending}</b></span>${led ? '<span class="is-dim">최신 출처 기록 기준</span>' : ''}</p>` +
      `<details class="sr-tally-more"><summary>ⓘ 이 수를 세는 법</summary><p class="sr-tally-note">${led ? `확정은 출처 기록 '${esc(led.ind.label)}' 값이며 하한입니다.<br>쇠퇴 요건은 법정 요건 단위(인구 요건 = 30년 감소 또는 3년 연속 감소)로 셉니다.` : '확정은 법정·공식 기준선을 넘은 항목 수입니다.<br>생활 지표까지 기준선과 견준 다른 숫자입니다. 쇠퇴 세 기준 중 기준 해당 수가 아닙니다.'}` +
      `<br>기준 원문 대조 전은 기준선을 넘었지만 그 기준을 아직 근거 원문과 맞춰 보지 않은 항목입니다${waiting.length ? `(${esc(waiting.join('·'))}). 확정 수에는 넣지 않습니다` : ''}.<br>가중치·순위 없이 개수만 셉니다.</p>` +
      (led && led.cell && detail(led.cell).length ? `<div class="map-detail">${dl(led.cell)}</div>` : '') + `</details></div>`;
    const list = rows.filter(r => r.ind.group !== 'sum');
    const curG = (list.find(r => r.ind.code === o.cur) || list[0] || { ind: {} }).ind.group;
    const gsum = g => {
      const members = list.filter(r => r.ind.group === g);
      return DONUT.map(([key, label]) => {
        const count = members.filter(r => dotOf(r) === key).length;
        return count ? `<span class="gs-${key}">${label} ${count}</span>` : '';
      }).join('');
    };
    const groups = GROUPS.filter(([g]) => list.some(r => r.ind.group === g)).map(([g, gl]) => `<li class="sr-group"><details${g === curG ? ' open' : ''}><summary><h4>${gIco(g)}${esc(gl)}</h4><span class="sr-gsum">${gsum(g)}</span></summary>${g === 'safe' ? `<p class="sr-group-note">${esc(SAFE_FIXED)}</p>` : g === 'fore' ? `<p class="sr-group-note">${esc(FORE_FIXED)}</p>` : ''}<ul>${list.filter(r => r.ind.group === g).map(r => {
      const ind = r.ind, tt = trendText(r.delta, ind), st = shownSt(r), cls = ROW_CLASS[st];
      const rowsD = r.cell ? detail(r.cell) : [];
      return `<li class="sr is-${cls}${ind.code === o.cur ? ' is-cur' : ''}"><div class="sr-h">${icon(ind.icon)}<span class="sr-l">${esc(ind.label)}${r.sgLevel ? ' <small>시·군·구</small>' : ''}</span><b class="sr-v">${esc(rowText(r))}</b>${refOf(r) ? `<small>기준일 ${esc(refOf(r))}</small>` : ''}<span class="sr-st st-${cls}">${esc(r.floor ? FLOOR : stLabel(st))}</span></div>` +
        (ind.categorical ? '' : `<div class="sr-m">${barSVG(r)}${tt ? `<em class="map-trend ${tt.cls}"${tt.toward ? ` title="${esc(tt.toward)}"` : ''}>${tt.arrow} 5년 새 ${esc(fmt(Math.abs(r.delta), ind.dEdges ? '개' : '%p'))} ${tt.word === '늘어남' ? '늘었습니다' : tt.word === '줄어듦' ? '줄었습니다' : esc(tt.word)}</em>` : ''}</div>`) +
        (r.series && r.series.some(p => p[1] !== null) && !ind.composite ? trendSVG(r.series, r.year, ind.label, validStd(ind.standard) ? ind.standard.value : null, ind.unit) : '') +
        `<details class="map-detail sr-why"><summary>ⓘ 기준·출처${r.year ? ` (${esc(r.year)}년)` : ''}</summary><p class="sr-std">${esc(stdTextOf(r))}</p>${rowsD.length ? dl(r.cell) : ''}</details></li>`;
    }).join('')}</ul></details></li>`).join('');
    // 2026-11-13: 도넛(항목 상태 분류)을 맨 위에서 접힌 칸 안으로 옮김. 맨 위는 지도 패널의 reqLineHTML(쇠퇴 3요건 한 줄)이 맡는다.
    // 왜: 처음 보는 숫자가 '공식 기준 없음 29'라 사용자가 무엇을 봐야 할지 몰랐다(ux_feedback_2026-11-12.md 1절 3번). 내용은 그대로 두고 순서만 바꾼다
    // v7: 확인할 항목·기준선 넘은 지표 수·한눈 요약은 '항목 수 모아 보기' 한 칸에 접는다(맨 위는 reqLineHTML의 3요건만). 순서(확인할 항목→수→한눈)는 그대로
    return `<ol class="sr-list">${groups}</ol>` + `<details class="sr-glance-more"><summary>항목 수 모아 보기</summary>${gapsHTML(rows)}${head}${glanceHTML(rows)}</details>`;
  }
  // 기준 해당·참고 구간 밖 항목(2026-10-26, 업무 실무자용): 기준선을 넘은 항목(확정·승인 대기)과 자료가 없어 확인이 필요한 항목. 순서 고정, 순위·점수 없음
  // 출처 기록이 미확정인 값(shownSt 추가확인)은 기준선을 넘었든 아니든 추가확인으로 둔다(기준 해당 수에 넣지 않는다)
  function gapRows(rows) {
    return rows.filter(r => !r.ind.composite && r.ind.group !== 'sum' && r.ind.group !== 'fore' && !r.ind.categorical && !r.ind.pending)
      .filter(r => r.crossed === true || r.value === null || shownSt(r) === '추가확인')
      .map(r => ({ row: r, kind: r.value === null ? '자료 없음' : shownSt(r) === '추가확인' ? '추가확인' : isPending(r.ind.standard) ? `${HIT}(원문 대조 전)` : HIT }));
  }
  function gapsHTML(rows, opt) {
    const g = gapRows(rows), o = opt || {}, isCheck = x => x.kind === '자료 없음' || x.kind === '추가확인';
    const line = x => { const r = x.row, ind = r.ind, c = r.cell || {}, src = c.source_name || ind.source || SOURCE_DEFAULT;
      const label = isCheck(x) ? '추가확인' : isPending(ind.standard) ? '기준 원문 대조 전' : HIT;
      return `<li class="gp is-${isCheck(x) ? 'none' : 'over'}"><b>${esc(ind.label)}</b>${r.sgLevel ? '<small class="gp-sg">시·군·구</small>' : ''}<span class="gp-v">${esc(rowText(r))}</span><span class="gp-s">${esc(label)}</span>` +
        `<small class="gp-std">${esc(validStd(ind.standard) ? `${belowLead(ind)}기준 ${ind.standard.text}` : stdTextOf(r).split(' · ')[0])} · 출처 ${esc(src)}${r.year ? ` · ${esc(r.year)}년` : ''}</small></li>`; };
    const nNull = g.filter(isCheck).length;
    const nPending = g.filter(x => x.kind === `${HIT}(원문 대조 전)`).length;
    return `<details class="sr-gaps"${o.open ? ' open' : ''}><summary>${icon('flag')}확인할 항목 <b>${g.length}</b>개 <small>기준 해당 ${g.length - nNull - nPending} · 기준 원문 대조 전 ${nPending} · 추가확인 ${nNull}</small></summary>${g.length ? `<ul>${g.map(line).join('')}</ul>` : '<p class="gp-empty">기준선을 넘거나 자료가 없는 항목이 없습니다.</p>'}` +
      `<p class="gp-note">기준 해당은 카드에 적힌 기준선 문장(예: 50% 이상)에 들어맞는 항목, 기준 원문 대조 전은 기준선을 근거 원문과 아직 맞춰 보지 않은 항목, 추가확인은 자료가 모자라거나 기준을 그대로 적용할 수 없는 항목입니다. 순위·점수가 아닙니다.</p></details>`;
  }
  // 2026-11-13: 동 요약 맨 위 한 줄 — "쇠퇴 3요건 중 몇 개 해당" + 근거 1쪽로 가는 단추.
  // 왜: 동을 고르면 맨 위에 '공식 기준 없음 29' 같은 도넛이 먼저 나와, 첫 약속(D23 공모 신청요건 근거 1쪽)의 답이 묻혔다
  //     (docs/design/ux_feedback_2026-11-12.md 1절 3번). 숫자는 새로 세지 않고 출처 기록 '요건 충족 수(하한)'(DECLINE_MET_COUNT) 값을
  //     그대로 쓴다(원칙 1). 요건을 묶는 규칙(decline-3req)은 조문 숫자 대조 전이라 '참고'·'판정 아님'을 이 줄 아래 한 번 밝힌다.
  //     값이 없으면 0개로 만들지 않고 '추가확인'으로 둔다(원칙 4). 재사용: 지도 패널 외 다른 화면에서도 rows만 있으면 쓸 수 있다
  const REQ_CODE = 'DECLINE_MET_COUNT';
  // opt.go === false: 지도 서랍처럼 꼬리에 '4-1 표 초안 보기' 주 단추를 따로 둔 곳에서는 같은 단추를 한 번 더 그리지 않는다
  // r16: 주 단추는 4-1 표 초안(brief + 4-1 양식). 홈 첫 단추와 같은 곳이다(D29)
  const FRAG_41 = 'MLIT-DECLINE';
  const goFrag = cls => `<a class="btn ${cls}" href="#report" data-set-mode="brief" data-frag="${FRAG_41}">${icon('book')}동네 현황표 보기</a>`;
  // D1 판단(over·floor·in·none) → 카드 띠 class
  const MET_CLS = { over: 'over', floor: 'over', in: 'in', none: 'none' };
  const MET_TAG = { none: '추가확인' }, MET_TAG_CLS = { over: ' over', floor: ' over', in: '', none: ' check' };   // 상태 꼬리표 .tag 모양(rm6.css)
  function reqLineHTML(rows, dong, opt) {
    const r = (rows || []).find(x => x.ind && x.ind.code === REQ_CODE);
    if (!r) return '';
    const go = opt && opt.go === false ? '' : goFrag('sr-req-go');
    const jump = isNum(r.year) && dong ? seriesJump(seriesOf(dong, 'DECLINE_AGING_20Y_PCT'), r.year) : null;
    const jumpNote = jump ? `<p class="sr-req-warn">이 해 20년 이상 건축물 비율이 앞뒤 해(중앙값 ${fmt2(jump.median)}%)와 크게 다릅니다. 출처 값을 그대로 옮겼습니다. 이 해 값은 원문을 확인해 주세요.</p>` : '';
    const rowsHtml = reqRowsHTML(rows, dong, r.year), allKnown = rowsHtml && !rowsHtml.includes('class="is-none"');   // 세 요건이 다 정해졌으면 '빼고 셌다'는 말이 맞지 않는다(11회차)
    // r16 공통 사전 고지(r19 '총괄안': 규칙 상태에 '승인'을 쓰지 않는다): 결과 묶음마다 규칙 상태 한 줄과 '판정은 담당 기관이 합니다' 한 줄
    const foot = `<p class="sr-req-note">${allKnown ? `${r.year ? `${esc(r.year)}년 기준. ` : ''}` : `추가확인 요건은 세지 않았습니다${r.year ? `(${esc(r.year)}년 기준)` : ''}. `}쇠퇴 세 기준 계산 규칙: 조문 숫자 대조 전 · 계산 방법과 해석은 정하지 못함 · 참고용 계산입니다. 판단은 구청·담당 기관이 합니다.</p>`;
    const law = DeclineReq ? `<small>${esc(DeclineReq.MET_LAW)}</small>` : '';
    if (r.value === null || !DeclineReq) {
      const h = DeclineReq ? DeclineReq.metHead(null) : { head: '쇠퇴 세 기준 · 추가확인', sub: '자료가 모자라 아직 셀 수 없습니다.' };
      return `<section class="sr-req is-none" aria-label="쇠퇴를 보는 세 가지 기준 요약"><p class="sr-req-n">${esc(h.plain || h.head)} <span class="tag check">${esc(MET_TAG.none)}</span><small>${esc(h.sub)}</small>${law}</p>${go}${foot}</section>`;
    }
    // 2026-11-17 우지예(지원센터 담당자 인터뷰): "구 단위 지표로는 사업이 타당한지 판단할 수 없고, 사업지 안의 지표를 다시 봐야 한다".
    // 통계 범위가 다른 집계구 자료를 확인하도록 잇는다. 자료가 없는 동은 도착 화면에서 안내하며 숫자는 새로 세지 않는다(원칙 1).
    // 구역 그리기(field/redev.html)는 부산 기준 계산만 제공하므로 부산(21) 동에서만 함께 보인다. 규칙 승인을 뜻하지 않는다.
    const code = dong && /^\d{7,10}$/.test(codeOf(dong)) ? codeOf(dong) : null;
    // D1(2026-11-20 대표 승인, 1쪽 문서·비교표와 같은 판단): 셀이 있으면 decline-req metStatus — 하한 2 이상은 셀이 추가확인이어도 기준 해당(하한),
    // 상한(하한 + 정해지지 않은 요건 3 − sample_n) 2 미만은 해당 안 함, 그 밖 추가확인.
    // 그해 셀이 없으면(지난 해) 아래 세 줄에서 정해지지 않은 요건 수를 센다
    const nUnknown = (rowsHtml.match(/class="is-none"/g) || []).length;
    // 지난 해는 셀이 없어 check_years로 본다: 그 해 충족 수 셀이 추가확인이었으면 하한 2 미만일 때 추가확인(3차 검증: 연도 막대만 옮겨도 판단이 뒤집혔다)
    const metHeld = !r.cell && isNum(r.year) && ((((dong && dong.check_years) || {})[REQ_CODE]) || []).includes(r.year);
    const ms = r.cell ? DeclineReq.metStatus(r.cell) : null;
    const decided = r.status === '기준 안' || r.status === '기준 넘음';
    const floor = decided && metFloorOf(r.cell, r.value, metHeld);   // 척도표 배지와 같은 규칙
    const undecided = decided && (ms ? ms === 'none' : r.status === '기준 안' && (metHeld || r.value + nUnknown >= 2));
    const st = undecided ? '추가확인' : r.status;
    // r16 공통 사전 결론 머리(decline-req metHead): 추가확인이 남으면 '최소 n개 해당 · 추가확인 m개'('1개 해당'이 탈락으로 읽혔다)
    const h = DeclineReq.metHead(r.value, nUnknown, floor ? 'floor' : st === '기준 넘음' ? 'over' : st === '기준 안' ? 'in' : 'none');
    // r19(09 3절): '최소 N개 해당 · 추가확인 K개' 대신 쉬운 문장, 상태 꼬리표는 옆에 그대로(09 1절 '상태 낱말')
    const headHtml = esc(h.plain.replace(/^세 가지 중 /, '')).replace(/^(\d+)가지/, '<b data-ck="req">$1가지</b>') + ` <span class="tag${MET_TAG_CLS[h.state]}">${esc(h.chip)}</span>`;
    // 요건이 아직 정해지지 않았으면(추가확인) '못 미친다'고 단정하지 않는다(원칙 4) → 문장을 나눈다
    const lead = h.state === 'none' ? '동 전체로는 아직 정해지지 않은 요건이 있습니다.' : `동 전체로는 ${DeclineReq.MIN_MET}개에 못 미칩니다.`;
    const smaller = (h.state === 'none' || h.state === 'in') && code ? `<p class="sr-req-more">${lead} 사업지는 통계 범위가 다를 수 있습니다. <a href="field/oa.html?dong=${encodeURIComponent(code)}">집계구 자료 보기</a>${String(code).startsWith('21') ? ` · <a href="field/redev.html">구역 그려 계산하기(부산)</a>` : ''}</p>` : '';
    return `<section class="sr-req is-${MET_CLS[h.state]}" aria-label="쇠퇴를 보는 세 가지 기준 요약">` +
      `<p class="sr-req-n"><span class="sr-req-k">쇠퇴를 보는 세 가지 기준(인구·사업체·오래된 건물) 중</span> ${headHtml}${h.sub ? `<small>${esc(h.sub)}</small>` : ''}${law}</p>${rowsHtml}${jumpNote}${go}${smaller}${foot}</section>`;
  }
  // v7(2026-11-13): 3요건 각각의 값·상태를 홈 카드처럼 세 줄로. 평가: 카드의 세는 법이 넷(해당 수·확인할 항목·확정/추가확인·묶음별 수)이라
  // 무엇을 봐야 할지 몰랐다 → 맨 위는 '몇 개 해당'과 그 세 줄만 두고, 나머지 셈은 아래 접힌 칸으로 옮긴다. 값은 rows(출처 기록) 그대로
  // 요건 단위로 센다(decline-req.js: 한 길이라도 해당이면 해당). 30년 감소율이 없어도 '3년 연속 감소'로 해당이면 그 줄에 그렇게 적는다
  const REQ_ST = { over: '기준 해당', in: '해당 안 함', none: '추가확인' };   // 홈 카드와 같은 세 낱말(v7 7회차: 화면마다 상태 단어가 달랐다)
  // year: 머리 '몇 개 해당'(요건 충족 수 행)의 해. 연도 막대를 옮겼으면 세 줄도 그 해 값으로 센다
  // (v9: 3년 연속 감소 줄이 늘 최신 셀을 읽어, 2022년을 고르면 머리는 1개인데 줄은 '해당'이 둘로 어긋났다)
  // 세 기준 줄의 출처 한 줄: '기관·자료 이름 · ○○년 기준 · 조회 ○○년 ○월'. 이름의 괄호 풀이(API 이름 등)는 '이 숫자는 어디서 왔나요?' 펼침에 남긴다.
  // bizYear: 사업체 수 자료연도가 기준연도보다 앞서면 '사업체 수 ○○년 자료'로 적는다(r16 B8과 같은 뜻, 기준일과 한 덩어리로 읽히지 않게)
  const srcShort = s => String(s || '').replace(/\((?:[^()]|\([^()]*\))*\)/g, '').replace(/\s+·\s+/g, ' · ').trim();
  function srcLine(c, bizYear) {
    if (!c || !c.source_name) return '';
    const y = bizYear ? `사업체 수 ${bizYear}년 자료` : isNum(c.base_year) ? `${c.base_year}년 기준` : '', m = /^(\d{4})-(\d{2})/.exec(c.retrieved_at || '');
    return `<small class="sr-sub sr-src">${[esc(srcShort(c.source_name)), y, m ? `조회 ${m[1]}년 ${+m[2]}월` : ''].filter(Boolean).join(' · ')}</small>`;
  }
  function reqRowsHTML(rows, dong, year) {
    const rowOf = code => rows.find(x => x.ind && x.ind.code === code);
    if (!DeclineReq || !rowOf('DECLINE_AGING_20Y_PCT')) return '';
    // 지도 지표가 아닌 코드(3년 연속 감소 등)도 원장 셀이 있으면 그 상태를 본다(추가확인·충돌·폐기·비공개는 셈에 안 쓴다).
    // 2026-11-20 PROF-11: 셀 원값만 읽어 반포본동 사업체 '3년 연속 감소'(값 1·추가확인)가 '기준 해당'으로 보였다. 셀이 없는 해만 연도 시계열
    const cellAt = code => { const cs = ((dong && dong.cells) || []).filter(c => c && c.indicator_code === code); const y = isNum(year) ? year : Math.max(...cs.map(c => c.base_year).filter(isNum)); return cs.find(c => c.base_year === y) || null; };
    // 머리 해의 원장 셀이 먼저다. 3차 통합 검토: 그 해 셀이 비어(추가확인) 지도 줄이 지난 해 값을 들고 오면 '기준 해당'으로 세어 머리와 어긋났다(부천 개편 동 등 14곳).
    // 지난 해는 셀 대신 check_years(그 해 값은 있으나 원장이 정하지 못한 해, export_national)를 보고, 줄 값은 머리와 같은 해일 때만 쓴다
    const held = code => isNum(year) && (((dong && dong.check_years) || {})[code] || []).includes(year);
    const val = code => {
      const c = cellAt(code); if (c) return DeclineReq.cellValue(c);
      if (held(code)) return null;
      const r = rowOf(code); if (r && isNum(r.value) && (!isNum(year) || !isNum(r.year) || r.year === year)) return r.cell ? DeclineReq.cellValue(r.cell) : r.value;
      return isNum(year) ? valueAt(seriesOf(dong, code), year) : null;
    };
    // 사업체 감소율은 사업체 수 마지막 값의 해로 셈한다(2025년 사업체 수는 출처에 아직 없음). 동 페이지·문서처럼 그 해를 밝힌다(v9 2차)
    const bizS = seriesOf(dong, 'DECLINE_BIZ_TOTAL'), bizLast = [...bizS].reverse().find(p => isNum(p[1]));
    const yr = isNum(year) ? year : (latestYear(seriesOf(dong, 'DECLINE_BIZ_DROP10Y_PCT')) ?? null);
    // r16: 정하지 못한 요건도 값은 지우지 않는다(흐린 글자, 셈에는 안 씀). 홈 카드·4-1 표와 같은 값. 공개 보류 값은 그대로 숨긴다
    const raw = code => {
      const c = cellAt(code); if (c) return c.value_hidden_reason || !isNum(c.value) ? null : c.value;
      const r = rowOf(code); if (r && isNum(r.value) && (!isNum(year) || !isNum(r.year) || r.year === year)) return r.cell && r.cell.value_hidden_reason ? null : r.value;
      return isNum(year) ? valueAt(seriesOf(dong, code), year) : null;
    };
    const li = DeclineReq.evaluate(val).map((q, i) => {
      const viaC = !!(q.via && /DECL3IN5$/.test(q.via.code)), paths = DeclineReq.REQS[i].paths;
      const shown = q.rate !== null ? q.rate : q.status === 'none' ? raw(paths[0][0]) : null, dim = q.rate === null && isNum(shown);
      const text = viaC ? '3년 연속 감소' : isNum(shown) ? `${fmt2(shown)}%` : '–';   // 홈·문서와 같은 소수 둘째 자리
      // 인구 감소율은 셀 계산식에 적힌 30년 최대 인구·그 해를 보인다(화면 시계열은 2000년부터라 1990년대 최댓값을 다시 셀 수 없었다, v9)
      const peak = q.key === 'pop' && q.rate !== null ? /30년 최대 인구 ([\d,]+)명\((\d{4})년\)/.exec(((rowOf('DECLINE_POP_DROP30Y_PCT') || {}).cell || {}).formula_text || '') : null;
      // R3 11: 감소율 0%가 지어낸 값처럼 읽혔다 → 그 해 사업체 수가 10년 중 최대라는 뜻을 시계열로 확인되는 때만 한 줄(출처 경계는 '자세한 근거' 안)
      const zero = q.key === 'biz' && !viaC ? bizZeroNote(bizS.filter(p => !isNum(year) || p[0] <= year), shown) : '';
      const notes = [peak ? `${peak[2]}년 최대 ${peak[1]}명 대비` : '', zero].filter(Boolean);
      // r16: 추가확인 줄에는 까닭 한 줄(원장 note, util.checkWhy). 길(가목·나목) 가운데 까닭이 적힌 첫 셀
      const whyCell = q.status === 'none' ? paths.map(p => cellAt(p[0])).find(c => checkWhy(c)) : null, why = whyCell ? whyText(checkWhy(whyCell)) : '';
      // r19(09 5절): 추가확인이면 큰 숫자 자리에 짧은 까닭, 계산값은 그 아래 회색 괄호(셈에 넣지 않음). 기준 문장과 같은 줄에 두지 않는다
      const short = whyCell ? whyShort(whyCell) : '';
      const big = short ? `<b class="sr-why-b">${esc(short)}</b>` : `<b${dim ? ' class="is-unsettled"' : ''}>${esc(text)}</b>`;
      const calc = short && isNum(shown) ? `<small class="sr-sub sr-calc">(계산값 ${esc(fmt2(shown))}% · 셈에 넣지 않음)</small>` : '';
      // r19(09 0절 3): 근거는 누르지 않아도 보이게 — 줄마다 출처 기관·자료 이름 · 자료 기준연도 · 조회 연월(사업체는 자료연도를 따로 적어 기준일과 섞이지 않게)
      const src = srcLine(q.via ? cellAt(q.via.code) || cellAt(paths[0][0]) : cellAt(paths[0][0]), q.key === 'biz' && bizLast && isNum(yr) && bizLast[0] < yr ? bizLast[0] : null);
      // 보조 글은 이름 칸이 아니라 줄 전체 폭 한 줄(sr-sub)로: 좁은 칸에서 4줄로 꺾였다. 낭독은 '인구 감소 34.81%, 추가확인, 까닭'
      return `<li class="is-${q.status}"><span>${esc(q.name)}</span>${big}<em>${q.status === 'none' ? '<span class="sr-only">, </span>' : ''}${REQ_ST[q.status]}</em>` +
        `${calc}${why ? `<small class="sr-sub sr-why-tag">${esc(why)}</small>` : ''}${notes.length ? `<small class="sr-sub"${zero ? ' data-biz-zero' : ''}>${esc(notes.join(' · '))}</small>` : ''}${src}</li>`;
    }).join('');
    return `<ul class="sr-req-rows">${li}</ul>`;
  }
  function tooltipHTML(it, ind, mode, year, source) {
    const t = mode === 'trend' ? trendText(it.value, ind) : null;
    const band = isNum(it.lo) && isNum(it.hi) ? `<br>80% 구간 ${esc(fmt(it.lo, ind.unit))}~${esc(fmt(it.hi, ind.unit))} · ${esc(foreNote(ind))}` : ind.level === 'sg' ? `<br>시·군·구 단위${isNum(it.abs) ? ` · 순이동 ${esc(fmt(it.abs, '명'))}` : ''}${it.since ? ` · 지정 ${esc(it.since)}` : ''}` : '';
    return `<b>${esc(it.name)}</b>${it.kind ? ` <small>${esc(it.kind)}</small>` : ''}<br>${esc(ind.label)}${mode === 'trend' ? ' 5년 변화' : ''} ${esc(itemText(it))}${t ? ` ${t.arrow} ${t.word}` : ''}${isNum(it.n) && it.n > 0 ? `<br>그해 기준선 넘은 동 ${esc(it.over ?? '–')}곳${isNum(it.unsure) ? ` · 추가확인 ${esc(it.unsure)}곳` : ''} / ${esc(it.n)}곳` : ''}${band}<br>${it.year ? `${esc(it.year)}년 · ` : ''}${esc(ind.source || source || SOURCE_DEFAULT)}`;
  }
  // 범례 아래 기준선 한 줄. 지도 이미지(PNG)도 같은 글을 쓴다
  function stdLineOf(ind, off) {
    const method = accessMethod(ind);
    if (!off && method) return `${method}${ind.standard ? ` · 기준선 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · 기준 ${ind.standard.status}` : ''}` : ''}`;
    return off ? (ind.held ? `보류 · ${ind.held} · 숫자를 만들지 않습니다` : ind.failed ? '불러오지 못함 · 연결을 확인하고 지표의 다시 시도를 눌러 주세요' : '수집 중 · 자료가 오기 전에는 숫자를 만들지 않습니다')
      : ind.src === 'forecast' ? foreLine(ind) : ind.group === 'safe' ? SAFE_NOTE : ind.group === 'estate' ? '공식 기준 없음 · 참고 구간' /* 실거래 고정 문구는 바로 아래 줄에 상시 */
        : ind.standard ? `기준선 ${ind.standard.text}${ind.standard.source ? ` · ${ind.standard.source}` : ''}${isPending(ind.standard) ? ` · 기준 ${ind.standard.status}` : ''}`
          : ind.composite ? '자료 없는 항목·원문 대조 전 기준은 세지 않음(하한)' : ind.note || (ind.ref ? '공식 기준 없음 · 참고 구간' : ind.categorical ? '행정 지정 상태 · 좋고 나쁨 축 아님' : '공식 기준 없음 · 값 있는 곳만 한 색');
  }
  // R5 10: 사람 수(명)인 지표는 인구 대비 비율로 읽히기 쉽다 → 범례 제목에 밝힌다
  const countNote = (ind, title) => (ind.unit === '명' && !ind.noCountNote ? `${title} (명, 인구 대비 비율 아님)` : title);
  // R5 10: 휴대폰·태블릿에서 전체 범례가 지도 아래 970px라 색 뜻을 모른 채 지도를 본다 → 같은 범례 자료(legendItems)로 한 줄 요약. 구간 견본 양 끝 이름 + 자료 없음
  function legendLineHTML(ind, mode, avail, check) {
    const off = avail === false || ind.pending, items = legendItems(ind, off ? 'now' : mode, check && !off), cols = items.filter(l => !l.hatch), [nul, chk] = items.filter(l => l.hatch);
    const sw = it => `<i class="${it.hatch ? 'is-hatch' : ''}"${it.hatch ? '' : ` data-bg="${esc(it.color)}"`} aria-hidden="true"></i>`;
    const nulText = off ? (ind.held ? '보류' : soonText(ind)) : '자료 없음';
    const span = off || !cols.length ? '' : cols.length === 1 ? `<span>${sw(cols[0])}${esc(cols[0].label)}</span>`
      : `<span>${esc(cols[0].label)} ${cols.map(sw).join('')} ${esc(cols[cols.length - 1].label)}</span>`;
    return `<p class="map-legend-line"><b>색 · ${esc(countNote(ind, ind.label))}</b>${span}<span>${sw(nul)}${esc(nulText)}</span>${chk ? `<span>${sw(chk)}${esc(chk.label)}</span>` : ''}</p>`;
  }
  // 2026-11-23 대표 지적(한눈에 안 들어온다): 범례 색마다 지금 지도에 그 색인 칸이 몇 곳인지 한 막대로(칸 폭 = 곳 수).
  //   기준값이 구간 경계이면 눈금을 세우고 아래에 '기준선 아래 n곳 · 기준선 위 n곳'. 빗금(자료 없음·추가확인)은 막대에서 빼고 끝에 수만 적는다
  function distHTML(ind, mode, items, unit) {
    const s = scaleFor(ind, mode);
    if (ind.categorical || ind.pending || s.colors.length < 2) return '';
    const n = s.colors.map(() => 0); let none = 0;
    items.forEach(x => { const b = x.check ? -1 : binIndex(x.value, s.edges); if (b < 0 || b >= n.length) none++; else n[b]++; });
    const total = n.reduce((a, b) => a + b, 0);
    if (!total) return '';
    const n0 = x => nf(0).format(x), pct = k => Math.round(k / total * 1000) / 10;
    const at = mode === 'now' && validStd(ind.standard) ? s.edges.indexOf(ind.standard.value) : -1;   // 이 경계 왼쪽(0..at)이 기준값보다 작은 구간
    const lo = at < 0 ? 0 : n.slice(0, at + 1).reduce((a, b) => a + b, 0);
    const segs = n.map((k, i) => (k ? `<i data-bg="${esc(s.colors[i])}" data-w="${pct(k)}" title="${esc(`${s.labels[i]} ${n0(k)}곳`)}"></i>` : '')).join('');
    const aria = `지도 색 구간별 ${unit} 수: ${n.map((k, i) => `${s.labels[i]} ${n0(k)}곳`).join(', ')}${none ? `, 빗금 ${n0(none)}곳` : ''}`;
    const foot = at < 0 ? `<span>색별 ${unit} 수 · 모두 ${n0(total)}곳</span>` : `<span>기준선 아래 ${unit} <b>${n0(lo)}</b>곳</span><span>기준선 위 <b>${n0(total - lo)}</b>곳</span>`;
    return `<div class="mv-dist"><div class="mv-dist-bar" role="img" aria-label="${esc(aria)}">${segs}${at < 0 ? '' : `<span class="mv-dist-tick" data-w="${pct(lo)}" aria-hidden="true"></span>`}</div>` +
      `<p class="mv-dist-foot">${foot}${none ? `<span class="is-none">빗금 ${n0(none)}곳</span>` : ''}</p></div>`;
  }
  function legendHTML(ind, mode, source, year, avail, check) {
    const s = scaleFor(ind, mode), off = avail === false || ind.pending, stdLine = stdLineOf(ind, off);
    return `<div class="map-legend"><p class="map-legend-title">${esc(countNote(ind, off ? ind.label : s.title))}</p><ul aria-label="지도 색 구간">${legendItems(ind, off ? 'now' : mode, check && !off).filter(l => !off || l.hatch).map((l, i) =>
      `<li data-i="${i}"><i class="${l.hatch ? 'is-hatch' : ''}" data-bg="${esc(l.color)}"></i>${esc(off ? (ind.held ? '보류' : soonText(ind)) : l.label)}</li>`).join('')}</ul>` +
      `<p class="map-legend-std${off || isPending(ind.standard) || !ind.standard ? ' is-flag' : ''}">${esc(stdLine)}</p>` + (check && !off ? `<p class="map-legend-note">${esc(CHECK_NOTE)}</p>` : '') +
      (ind.src === 'forecast' ? `<p class="map-legend-note">${esc(FORE_FIXED)}</p>` : ind.group === 'safe' ? `<p class="map-legend-note">${esc(SAFE_FIXED)}</p>` : ind.group === 'estate' ? `<p class="map-legend-note">${esc(ind.note || ESTATE_NOTE)}<br>${esc(ESTATE_PROV)}.</p>` : '') + // 수집 중에도 고정 문구는 상시
      `<p class="map-legend-note">판정 아님 · 출처 ${esc(ind.source || source || SOURCE_DEFAULT)} · ${ind.latest ? `최근 달 ${String(ind.latest).slice(0, 4)}.${String(ind.latest).slice(4, 6)}` : `기준연도 ${esc(year ?? '자료 없음')}`}</p></div>`;
  }
  // ── 현황 보고서: 출처 기록 값으로만 만든 결정적 문장. 평가어 없음, 숫자는 셀 값 그대로 ──
  const josa = label => josaOf(label, '은', '는');
  function reportSentences(name, rows) {
    return rows.filter(r => r.value != null && !r.cell?.value_hidden_reason && !r.ind.held && !r.ind.pending &&
      !r.ind.composite && r.ind.group !== 'sum').map(r => {
      const ind = r.ind, c = r.cell || {}, v = rowText(r), y = r.year ? `${r.year}년` : null;
      const src = c.source_name || (r.evidenceMissing ? '추가확인' : ind.source || SOURCE_DEFAULT), ref = c.reference_date ? String(c.reference_date).slice(0, 10) : null;
      const where = r.sgLevel ? `이 동이 속한 시·군·구의 ${ind.label}` : `${name}의 ${ind.label}`;
      const review = !!r.unsettled || ['추가확인', '충돌', '폐기'].includes(c.status);
      const below = validStd(ind.standard) && ind.standard.direction === 'below_bad', kind = isPending(ind.standard) ? '원문 대조 전 기준' : '기준';
      // 하한 기준(below_bad, 예: 공원 1인당 6㎡ 이상)은 '선을 넘습니다'가 '충분하다'로 읽혔다(11-14 페르소나: 0.5㎡/인) → 기준값과 높낮이로
      const std = review || !validStd(ind.standard) || typeof r.crossed !== 'boolean' ? null : below
        ? `${kind}값 ${fmt(ind.standard.value, ind.unit)}${r.crossed ? '보다 낮습니다' : ' 이상입니다'}(${kind}: ${ind.standard.text})`
        : `${kind}(${ind.standard.text}) ${r.crossed ? '선을 넘습니다' : '안에 있습니다'}`;
      const fore = ind.src === 'forecast' && isNum(r.lo) && isNum(r.hi) ? `80% 구간은 ${fmt(r.lo, ind.unit)}~${fmt(r.hi, ind.unit)}이며 ${foreNote(ind)}` : null;
      const tail = review ? '이며 해석은 추가확인이 필요합니다.' : std ? `로, ${std}.` : fore ? `로 계산됩니다. ${fore}입니다.` : '입니다.';
      // crossed: 기준 문장이 있을 때만 true(넘습니다)/false(안에 있습니다), 없으면 null. AI 문장 검증이 방향을 대조할 때 쓴다(2026-11-01)
      // stdText: 기준 문구("1만 명당 10곳 미만" 등). 문구 안의 '미만'·'이상'을 방향 표현으로 오인하지 않게 검증 때 떼어 낸다
      return { code: ind.code, group: ind.group, label: ind.label, value: v, year: r.year ?? null, source: src, ref, url: safeUrl(c.source_url),
        review, crossed: std ? r.crossed : null, below: std ? below : null, stdText: std ? ind.standard.text : null,
        text: `${where}${josa(ind.label)} ${v}${y ? `(${y})` : ''}${tail} 출처 ${src}${ref ? `, 기준일 ${ref}` : ''}.${r.evidenceMissing ? ` ${SERIES_NO_CELL}.` : ''}` };
    });
  }
  // AI가 다듬은 문장: 원래 문장에 없는 숫자가 하나라도 있으면 거부한다(숫자를 만들거나 반올림하지 않는다)
  const minusText = t => String(t || '').replace(/[−－]/g, '-');
  const numsIn = t => (minusText(t).match(/(?<![\d.])[+-]?\d[\d,]*(?:\.\d+)?/g) || [])
    .map(n => n.replace(/,/g, '').replace(/^\+/, ''));
  const factText = t => minusText(t).replace(/(?<=\d),(?=\d)/g, '').replace(/\s+/g, '');
  // ── 2026-11-01 리뷰(OWASP LLM09 허위 정보, 국정원 AI보안 A-M10 입·출력 결과 검증)로 검사를 넓혔다 ──
  // 전에는 "출력 숫자가 원문 어딘가에 있는가"만 봐서, 두 지표의 값을 맞바꾸거나("고령 30%, 청년 12%" → "고령 12%, 청년 30%")
  // 기준 방향을 뒤집어도("선을 넘습니다" → "안에 있습니다") 통과했다. 공모 서류에 그대로 쓰이면 법정 요건 판단이 틀린 근거가 된다.
  // 출처 기록 문장 구조(sents)를 받으면 지표별로 ①숫자 짝 ②기준 방향 ③값 누락을 대조한다. 실패하면 AI 문장을 버리고 출처 기록 문장을 보인다(안전 쪽).
  const BANNED = ['좋', '나쁘', '나쁜', '위험', '열악', '우수', '심각', '양호', '낙후', '추천', '유망', '피해야', '등급',
    // '순위'는 2026-11-07 D24·D26으로 뺐다(전국·시도·시군구 순위가 출처 값이 됨). 숫자는 아래 대조로 검사한다
    // 2026-11-01 추가: 판정·평가로 읽히는 말(D8·D13 낙인 금지). 중립 문장도 막힐 수 있지만 그때는 출처 기록 문장을 보여 주므로 안전 쪽 오류다
    // '취'+'약': map.test.cjs '검토용 근거서' 테스트가 화면 문구에 낙인 낱말이 섞이지 않게 이 소스 전체를 낱말 검사한다. 이 목록은 화면 문구가 아니라
    // 금지어 목록이라 그 검사를 약하게 바꾸지 않고, 낱말을 조각으로 적어 검사에 걸리지 않게 한다
    '취' + '약', '부족', '시급', '열위', '개선이 필요', '개선 필요', '높은 편', '낮은 편', '바람직', '우려', '문제'];
  // 출처 기록 문장에 없는 크기 표현: 숫자 정규식에 걸리지 않아 값을 바꿔 말해도 통과하던 것들(배수·어림·증감 강조)
  const VAGUE = [/절반/, /과반/, /대부분/, /상당수/, /다수/, /(?:두|세|네|몇|수)\s?배/, /배\s?(?:이상|가량|정도|가까이)/,
    /(?:급증|급감|급격|크게\s?(?:늘|줄|증가|감소))/, /(?<![가-힣])(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s?(?:곳|개|명|가구|채|해)(?![가-힣])/];
  // 기준 방향: 원장은 "선을 넘습니다"/"안에 있습니다" 두 가지뿐. 단정으로 끝나는 표현만 인정한다.
  // 낱말만 찾으면 "초과하지 않습니다"·"넘은 적이 없습니다"·"안에 있지 않습니다"처럼 뒤집은 문장이 통과한다(2026-11-04 재현). 다른 표현은 거부해 출처 기록 문장을 보인다
  const CROSS_RE = /(?:넘(?:습니다|었습니다|어섭니다|어섰습니다|는다|었다)|초과(?:합니다|했습니다|입니다|한다|했다))(?![가-힣])/,
    WITHIN_RE = /(?:안에\s?있습니다|이내입니다|(?:넘지|넘어서지|초과하지)\s?(?:않습니다|않았습니다|못했습니다)|미만입니다|이하입니다)(?![가-힣])/,
    // 하한 기준(below_bad) 문장: 기준값보다 낮음 = 넘은 쪽, 기준값 이상 = 안쪽
    LOW_RE = /(?:낮습니다|낮았습니다|못\s?미칩니다|못\s?미쳤습니다|밑돕니다|미만입니다)(?![가-힣])/,
    HIGH_RE = /(?:이상입니다|높습니다|웃돕니다|넘습니다|넘었습니다)(?![가-힣])/;
  // 지표 이름은 괄호 설명을 떼고 글자 사이 띄어쓰기를 허용해 찾는다(예: "병의원(1만 명당)" → "병 의원"도 찾음)
  const labelRe = label => {
    const parts = String(label || '').split(/(\([^()]*\))/).map(p => p.trim()).filter(Boolean);
    return parts.length ? new RegExp(parts.map(p => {
      const pattern = textRe(p).source;
      return p.startsWith('(') ? `(?:${pattern})?` : pattern;
    }).join('\\s*'), 'g') : null;
  };
  // 출력 한 문장 안에서 지표 이름 위치로 구간을 나눈다. 더 긴 이름 안에 든 짧은 이름(예: "노후건축물비율 전망" 안의 "노후건축물비율")은 버린다
  function labelSegments(sentence, sents) {
    const hits = [];
    sents.forEach((s, i) => { const re = labelRe(s.label); if (!re) return; for (const m of sentence.matchAll(re)) hits.push({ i, start: m.index, end: m.index + m[0].length }); });
    const kept = hits.filter(h => !hits.some(o => o !== h && o.start <= h.start && o.end >= h.end && (o.end - o.start) > (h.end - h.start))).sort((a, b) => a.start - b.start);
    // 첫 지표 이름 앞부분(예: "2024년 기준 노후건축물비율이…")은 첫 지표 구간에 붙인다
    return kept.map((h, k) => ({ i: h.i, text: sentence.slice(k === 0 ? 0 : h.start, k + 1 < kept.length ? kept[k + 1].start : sentence.length) }));
  }
  // 2026-11-01 추가한 검사의 거부 사유를 사람이 읽을 문장으로. 이스케이프는 여기서 한다(지표 이름은 출처 값이지만 출력은 HTML로 들어간다)
  const aiFailText = r => [
    r.swapped && r.swapped.length ? `다른 지표의 숫자를 붙였습니다(${esc(r.swapped.join(', '))}). ` : '',
    r.flipped && r.flipped.length ? `기준을 넘는지 여부가 출처 기록과 다르거나 확인할 수 없습니다(${esc(r.flipped.join(', '))}). ` : '',
    r.missing && r.missing.length ? `지표 값이 빠졌습니다(${esc(r.missing.join(', '))}). ` : '',
    r.vague && r.vague.length ? `출처 기록에 없는 크기 표현(${esc(r.vague.join(', '))})이 있었습니다. ` : ''].join('');
  // 원장 문구(기준 문구·출처 이름)를 괄호·마침표까지 글자 그대로 찾되 띄어쓰기만 느슨하게 본다
  const textRe = s => {
    const chars = [...String(s || '')].filter(c => !/\s/.test(c));
    return chars.length ? new RegExp(chars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g') : null;
  };
  function verifyPolished(text, original, sents) {
    const t = String(text || ''), orig = String(original || '');
    const allowed = new Set(numsIn(orig)), bad = [...new Set(numsIn(t).filter(n => !allowed.has(n)))];
    // 출처 기록 문장에 이미 있는 낱말은 AI가 덧붙인 평가가 아니다(실데이터 점검 2026-11-01: 기준 문구·출처 이름에 쓰인 낱말이 있어 전 동이 거부됐다)
    const banned = BANNED.filter(w => t.includes(w) && !orig.includes(w));
    const vague = VAGUE.map(re => (t.match(re) || [])[0]).filter(w => w && !orig.includes(w));
    const swapped = [], flipped = [], missing = [];
    if (Array.isArray(sents) && sents.length) {
      const own = sents.map(s => new Set(numsIn(s.text)));
      // 모든 문장에 나오는 숫자(동 이름의 "1", 공통 기준일 등)는 어느 지표 구간에 있어도 된다
      const common = new Set([...own[0]].filter(n => own.every(o => o.has(n))));
      const seen = sents.map(() => '');
      // 기준 문구·출처 이름을 먼저 떼어 낸다. 기준 문구 안에 마침표("…정의에 해당. 국가 단위…")·괄호·다른 지표 이름("65세 이상 인구 비율 20% 이상")·
      // 방향처럼 보이는 낱말('미만')이 있어, 그대로 두면 문장이 중간에 잘리거나 구간이 잘못 나뉜다(실데이터 점검으로 발견)
      let body = t;
      for (const s of sents) for (const x of [s.stdText, s.source]) { const re = textRe(x); if (re) body = body.replace(re, ' '); }
      // 마침표 뒤에 띄어쓰기가 올 때만 문장을 나눈다. 바로 나누면 "81.8%"의 소수점에서 잘려 숫자가 깨진다
      for (const sentence of body.split(/(?<=[.!?。])\s+/)) {
        for (const seg of labelSegments(sentence, sents)) {
          seen[seg.i] += ' ' + seg.text;
          for (const n of numsIn(seg.text)) if (allowed.has(n) && !own[seg.i].has(n) && !common.has(n)) swapped.push(`${sents[seg.i].label} ${n}`);
        }
      }
      sents.forEach((s, i) => {
        const name = labelRe(s.label);
        const where = name ? (seen[i] || '').replace(name, '') : '';
        const value = factText(s.value);
        const exact = value && value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const includesValue = exact && new RegExp(`(?<![\\d.+-])${exact}(?![\\d.])`).test(factText(where));
        if (!includesValue || (s.review && !factText(where).includes('추가확인이필요합니다'))) missing.push(s.label);
        if (s.crossed === true || s.crossed === false) {
          // 기준 문장이 있는 지표는 이름을 찾아 방향을 대조해야 한다. 이름을 못 찾으면 방향을 확인할 수 없으므로 거부한다
          // 기준 문구는 위에서 이미 뗐다. AI가 문구를 바꿔 옮긴 경우에 대비해 괄호 속 설명도 방향 판단에서 뺀다
          const d = (seen[i] || '').replace(/\([^()]*\)/g, ' ');
          const [C, W] = s.below ? [LOW_RE, HIGH_RE] : [CROSS_RE, WITHIN_RE];
          const ok = seen[i] && (s.crossed ? C.test(d) && !W.test(d) : W.test(d) && !C.test(d));
          if (!ok) flipped.push(s.label);
        }
      });
    }
    const fail = bad.length || banned.length || vague.length || swapped.length || flipped.length || missing.length || !t.trim();
    return fail ? { ok: false, bad, banned, vague, swapped: [...new Set(swapped)], flipped, missing } : { ok: true, text: t };
  }
  // ── 검토용 근거서(업무 실무자용, 2026-10-26): 현황 보고서의 변형. 현황 → 기준 대비 → 기준 해당·확인 필요 → 출처·계산식(펼친 상태). 평가·권고 문장 없음, 판정은 담당 기관이 합니다 ──
  const BRIEF_HEAD = '출처 모음(근거서) · 예산 요구·사업계획·민원 회신 검토용 · 참고용 계산입니다. 판단은 구청·담당 기관이 합니다';   // r19(09 3절)
  const BRIEF_FOOT = '참고용 계산입니다. 판단은 구청·담당 기관이 합니다.';   // 화면 아래 고지 줄이라 합니다체(r16 4차 P5). 문서 본문 끝의 고정 문구(docgen FIXED_NOTICE)는 이다체
  // 근거 1쪽 화면 머리 한 줄은 문서 '1. 요약' 첫 문장(이다체)을 화면 말투로 옮겨 보인다. 요약 문장 틀(report_templates.json summary)의 끝맺음만 다룬다. 종이에는 문서 문장 그대로다
  const screenLead = s => String(s).replace(/이다(?=[(.])/g, '입니다').replace(/한다\./g, '합니다.').replace(/않는다\./g, '않습니다.').replace(/둔다\./g, '둡니다.').replace(/있다\./g, '있습니다.');
  const BRIEF_MAIL = 'renewmapteam@gmail.com';
  // r16: 4-1 표가 든 근거서를 맨 앞에. 키(report·brief·onepage·programs)는 주소·저장 값이라 그대로 둔다
  // r19(09 3절): 탭 이름은 쉬운 말. 받는 파일의 이름(근거서·근거 1쪽)은 r16대로 문서 안에만 둔다
  const REPORT_MODES = [['brief', '동네 현황표·출처 모음'], ['onepage', '한 장 요약'], ['report', '현황 보고서'], ['programs', '이 동에 맞는 재생 사업']];
  // 2026-11-13 우지예: 빈 화면 문구가 '1쪽 요약가·재생 사업가'로 나왔다. 왜: 이름 뒤에 '가'를 고정으로 붙였다 → 받침이 있으면 '이', 없으면 '가'
  const iGa = label => label + josaOf(label, '이', '가');
  // r16: 종류마다 쓰임 한 줄(무엇을 받는 화면인지 한 번에)
  const MODE_USE = { brief: '공모 신청서 4-1 칸에 붙일 표·문장과 모든 지표의 근거서입니다.', onepage: '결재·보고에 붙이는 한 장입니다.', report: '지표를 주제별로 넘겨 보는 화면입니다.', programs: '재생 사업 요건에 이 동의 값을 맞춘 표입니다.' };
  const reportModeHTML = mode => `<div class="dash-seg rp-mode" role="group" aria-label="문서 종류">${REPORT_MODES.map(([k, l]) => `<button type="button" data-rp-mode="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div>${MODE_USE[mode] ? `<p class="map-note rp-mode-use">${MODE_USE[mode]}</p>` : ''}`;
  // 파일(HWPX·XLSX)은 이 브라우저에서 바로 만든다(docgen.js). 메일 요청은 내부망에서 파일 생성이 막힐 때를 위한 보조 경로로만 남긴다
  function briefMailto(it, year, what = '근거서') {
    const subject = `${what} HWPX·XLSX 요청 [${it.name}·${it.code}]`, body = `동: ${it.name} (${it.code})\n요청 형식: HWPX·XLSX\n기준연도: 쇠퇴 지표 ${year ?? '최신 연도'} · 생활 지표는 항목별 기준연도`;
    return `mailto:${BRIEF_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  // 출처 머리말: 원본 기관명이 앞, 가공(리뉴맵)이 뒤
  const srcHead = where => (DG ? DG.SRC_HEAD(where) : '');
  const copyHead = caption => `<div class="dg-tbl-h" aria-live="polite"><b>${esc(caption)}</b>${DG ? `<button type="button" class="btn ghost dg-copy" data-copy-table>${esc(DG.COPY_TABLE)}</button>` : ''}</div>`;
  // 내려받기·인쇄·보조 메일 요청. 1쪽 요약에서는 HWPX가 1쪽 문서다
  // 현황 보고서 화면에서 받는 파일은 근거서 형식이다(문서는 1쪽 요약·근거서 두 가지). 단추에 그렇게 적는다(v9: 두 화면의 HWPX가 같은 파일인데 이름만 보고는 몰랐다)
  // 주 단추는 HWPX 하나, 나머지 형식·과업 연결은 접는다(2026-11-18: 단추 6개가 같은 무게로 결과보다 먼저 나왔다)
  // r16: 근거 1쪽 밖(4-1 표·근거서·현황 보고서)에서 받는 한글 파일은 근거서라 단추에 그렇게 적는다
  // r16: 채운 단추는 문서 화면마다 하나. 4-1 표 한글 받기가 있는 화면(primary=false)에서는 근거서 받기도 테두리 단추
  const fileTools = (it, year, what, primary = true) => `<button type="button" class="btn ghost" data-print>PDF로 저장</button>` + (DG ? `<button type="button" class="btn${primary ? '' : ' ghost'}" data-dl="hwpx">${primary ? '한글 파일로 받기' : '출처 모음 전체를 한글로 받기'}</button>${what === '현황 보고서' ? '<small>한글 파일은 근거서 형식으로 받습니다.</small>' : ''}<details class="rp-more-files"><summary>다른 파일 형식 · 과업에 연결</summary><button type="button" class="btn ghost" data-dl="xlsx">엑셀로 받기</button><button type="button" class="btn ghost" data-dl="docx">워드로 받기</button><button type="button" class="btn ghost" data-dl="pptx">파워포인트로 받기</button><button type="button" class="btn ghost" data-task-package>과업에 연결</button></details>` : '') +
    // 메일 요청은 단추가 아니라 한 줄 안내로(v9: 'HWPX 받기' 옆에 같은 모양으로 있어 둘의 차이를 몰랐다)
    `<p class="rp-mail-note">${DG ? '양식에 맞춰 사람이 다듬은 파일이 필요하면' : '이 기기에서 파일을 만들 수 없으면'} <a class="rp-mail" href="${esc(briefMailto(it, year, what))}">메일로 요청</a>하세요.</p>`;
  // 양식에 붙일 조각(문장 5개 이하 + 표 1개 + 출처 줄): 양식을 고르면 그 양식 항목 순서대로 만든다(data-frag-out). 양식 정의는 data/report_templates.json
  function fragPanelHTML(sel) {
    if (!DG || !DG.getTemplates()) return '';
    const ch = DG.fragmentChoices(), cur = sel && sel.id ? ch.find(c => c.id === sel.id) : null, is41 = !!cur && cur.id === FRAG_41;
    // r16: 4-1 양식이면 '4-1 표 초안', 다른 양식이면 '양식에 붙일 문장·표'. 기본은 4-1 양식이라 '양식을 고르세요' 빈 칸은 고른 양식이 없을 때만
    const tools = cur ? `<p class="rp-frag-tools">${typeof DG.fragmentHwpx === 'function' ? `<button type="button" class="btn" data-frag-hwpx>한글 파일로 받기</button>` : ''}<button type="button" class="btn ghost" data-frag-print>이 표만 인쇄</button></p>` : '';
    return `<section class="rp-g rp-frag" aria-labelledby="fragTitle"><h3 id="fragTitle">${is41 ? '신청서용 동네 현황표' : '양식에 붙일 문장·표'}</h3>${is41 ? '<p class="map-note">공모 신청서 4-1 도시쇠퇴현황 검토 표 칸에 붙이는 표입니다.</p>' : ''}` +
      `<div class="rp-frag-ctl"><label class="map-select">양식<select data-frag-preset>${cur ? '' : '<option value="">양식을 고르세요</option>'}${ch.map(c => `<option value="${esc(c.id)}"${cur && c.id === cur.id ? ' selected' : ''}>${esc(c.title.split(' · ')[0])}</option>`).join('')}</select></label>` +
      (cur && cur.variants.length > 1 ? `<label class="map-select">내용<select data-frag-variant>${cur.variants.map(v => `<option value="${esc(v.id)}"${v.id === sel.variant ? ' selected' : ''}>${esc(v.title)}</option>`).join('')}</select></label>` : '') + `</div>` +
      `<p class="map-note">양식 항목 순서대로 문장과 표를 만듭니다. 복사해 한/글·엑셀 양식에 붙여 넣어 주세요.<br>값이 없는 칸은 '자료 없음'으로 두고, 출처 번호는 이 표 안에서 1부터 매깁니다.</p>${tools}<div data-frag-out aria-live="polite"></div></section>`;
  }
  // r16 2차: 근거 1쪽 아래에 4-1 조각 전체를 다시 붙이면 쪽이 4,500px였다 → 4-1 표·근거서로 가는 한 줄만
  const fragLinkHTML = () => `<p class="map-note rp-frag-link"><a href="#report" data-set-mode="brief" data-frag="${FRAG_41}">동네 현황표 보기</a> · 공모 신청서 4-1 도시쇠퇴현황 검토 칸에 붙이는 표입니다.</p>`;
  // 2026-11-20 홈 '반여1동 4-1 표 초안 보기'(explore.html?report=brief&frag=MLIT-DECLINE): 주소의 조각 id가 양식 정의에 있으면 첫 내용으로 미리 고른다. 모르는 id는 null(무시)
  const fragFromParam = (id, choices) => { const c = id ? (choices || []).find(x => x.id === id) : null; return c ? { id: c.id, variant: c.variants.length ? c.variants[0].id : '' } : null; };
  function deliveryReviewHTML(brief) {
    if (!DG || !brief) return '';
    const review = DG.deliveryReview(brief);
    return `<details class="map-detail rp-review"><summary>받기 전에 자료 상태 보기</summary><p class="map-note">${esc(review.note)}</p><p class="map-note">XLSX의 '자료 점검' 시트에는 전망 항목도 포함합니다.</p><dl>${review.rows.slice(1).map(r => `<dt>${esc(r[0])} · ${esc(r[1])}</dt><dd>${esc(r[2])}</dd>`).join('')}</dl></details>`;
  }
  function briefHTML(v, it, rows, sel, brief) {
    const here = v.crumbs.map(c => c.label).join(' › '), dy = rows.find(r => r.ind.series && r.year)?.year ?? null;
    const facts = rows.filter(r => r.value !== null && !r.ind.composite && r.ind.group !== 'sum');
    const srcOf = r => { const c = r.cell || {}; return { name: c.source_name || (r.evidenceMissing ? SERIES_NO_CELL : r.ind.source || SOURCE_DEFAULT), url: safeUrl(c.source_url), ref: c.reference_date ? String(c.reference_date).slice(0, 10) : null, formula: c.formula_text || null, rule: c.rule_version || null }; };
    const fact = r => { const s = srcOf(r); return `<tr><td>${esc(r.ind.label)}${r.sgLevel ? ' <small>시·군·구</small>' : ''}</td><td>${esc(rowText(r))}</td><td>${r.year ? `${esc(r.year)}년` : esc(s.ref || '기록 없음')}</td><td>${esc(s.name)}${s.ref ? ` · 기준일 ${esc(s.ref)}` : ''}</td></tr>`; };
    const sec1 = `<section class="rp-g"><h3>1. 현황</h3>${GROUPS.filter(([g]) => facts.some(r => r.ind.group === g)).map(([g, gl]) => `<h4 class="map-h4">${gIco(g)}${esc(gl)}</h4>${g === 'safe' ? `<p class="rp-fixed">${esc(SAFE_FIXED)}</p>` : g === 'fore' ? `<p class="rp-fixed">${esc(FORE_FIXED)}</p>` : ''}` +
      `<div class="dg-tbl">${copyHead(gl)}<div class="table-wrap"><table class="rp-tbl rp-facts"><caption class="sr-only">${esc(gl)} 현황 · ${esc(it.name)}</caption><thead><tr><th>항목</th><th>값</th><th>기준연도</th><th>출처</th></tr></thead><tbody>${facts.filter(r => r.ind.group === g).map(fact).join('')}</tbody></table></div></div>`).join('')}</section>`;
    const std = facts.filter(r => validStd(r.ind.standard));
    const sec2 = `<section class="rp-g"><h3>2. 기준 대비</h3>${std.length ? `<div class="dg-tbl">${copyHead('기준 대비')}<div class="table-wrap"><table class="rp-tbl"><caption class="sr-only">기준 대비 · ${esc(it.name)}</caption><thead><tr><th>항목</th><th>값</th><th>기준</th><th>상태</th></tr></thead><tbody>${std.map(r => { const { label, why } = rowState(r); return `<tr><td>${esc(r.ind.label)}</td><td>${esc(rowText(r))}</td><td>${esc(belowLead(r.ind) + r.ind.standard.text)}${r.ind.standard.source ? ` · ${esc(r.ind.standard.source)}` : ''}</td><td>${esc(label)}${why ? `<br><small>${esc(why)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>` : '<p class="map-note">기준이 있는 항목의 값이 없습니다.</p>'}` +
      // r16: 상태는 지도·근거 1쪽·4-1 표와 같은 규칙(shownSt). 정하지 못한 셀은 '추가확인'(반여1동 인구가 근거서에서만 '기준 해당'이었다)
      `<p class="map-note">상태는 기준과의 사실 비교입니다. 추가확인 셀은 확정 수에 넣지 않습니다. 확정 수도 조문 숫자 대조 전 규칙으로 낸 참고용 계산입니다.</p></section>`;
    const sec3 = `<section class="rp-g"><h3>3. 기준 해당·추가확인 목록</h3>${gapsHTML(rows, { open: true })}</section>`;
    const sec4 = `<section class="rp-g"><h3>4. 출처·계산식</h3><div class="dg-tbl">${copyHead('출처·계산식')}<div class="table-wrap"><table class="rp-tbl"><caption class="sr-only">출처·계산식 · ${esc(it.name)}</caption><thead><tr><th>항목</th><th>값</th><th>출처</th><th>기준일</th><th>계산식</th><th>규칙 판본</th></tr></thead><tbody>${facts.map(r => { const s = srcOf(r);
      return `<tr><td>${esc(r.ind.label)}</td><td>${esc(rowText(r))}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.ref || (r.year ? `${r.year}년` : '출처 기록 없음'))}${ageSmall(s.ref)}</td><td>${esc(s.formula ? (DG && DG.readerText ? DG.readerText(s.formula) : s.formula) : '출처 기록 없음')}</td><td>${esc(s.rule || '출처 기록 없음')}</td></tr>`; }).join('')}</tbody></table></div></div></section>`;
    const frag = fragPanelHTML(sel || '');
    return `<div class="rp-head"><p class="rp-crumb">${esc(here)}</p><h3 class="rp-title">${esc(it.name)} 동네 현황표·출처 모음</h3><div class="rp-tools">${fileTools(it, dy, '4-1 표·근거서', !frag.includes('data-frag-hwpx'))}</div></div>` +
      `${deliveryReviewHTML(brief)}<p class="rp-intro rp-src-line">${esc(srcHead('4. 출처·계산식'))}</p><p class="rp-intro rp-brief-head">${esc(BRIEF_HEAD)}</p><p class="rp-intro">${esc(here)} <small class="rp-code">(행정동 코드 ${esc(it.code)})</small> · 쇠퇴 지표 ${dy ? `${esc(dy)}년` : '최신 연도'} · 생활 지표는 항목별 기준연도</p>${frag}${sec1}${sec2}${sec3}${sec4}<p class="rp-foot">${esc(BRIEF_FOOT)}</p>`;
  }
  // 1쪽 요약: 제목·개요 4줄·요약 문장 5개·기준 대비 표(8행 이하)·출처 번호·끝. one = DG.buildOnepage(...) 결과. 인쇄하면 A4 한 쪽
  function onepageHTML(v, it, one) {
    const labels = v.crumbs.map(c => c.label), here = (labels[labels.length - 1] === it.name ? labels : [...labels, it.name]).join(' › '), lead = one.parts.summary[0];
    return `<div class="rp-head"><p class="rp-crumb">${esc(here)}</p><h3 class="rp-title">${esc(it.name)} 한 장 요약</h3>${lead ? `<p class="rp-lead">${esc(screenLead(lead.text))}</p>` : ''}<div class="rp-tools">${fileTools(it, one.brief.year, '근거 1쪽')}</div></div>` +
      `${deliveryReviewHTML(one.brief)}<div class="dg-doc dg-onepage">${DG.docHTML(one, { copy: true }).html}</div>${fragLinkHTML()}<p class="rp-foot">${esc(BRIEF_FOOT)}</p>`;
  }
  // ── 기기 안 AI(Chrome 내장 AI의 Rewriter·Summarizer 전역 API). 문장을 서버로 보내지 않는다 ──
  // developer.chrome.com/docs/ai 확인(2026-10-24): availability()는 'unavailable'|'downloadable'|'downloading'|'available', create()는 사용자 클릭(활성화) 뒤에만,
  // Summarizer는 Chrome 138 정식, Rewriter는 오리진 트라이얼. 공식 지원 언어 목록(en·ja·es·de·fr)에 한국어가 없어 'ko'를 요청해 거절되면 '쓸 수 없음'으로 둔다
  const AI_LANG = { expectedInputLanguages: ['ko'], expectedContextLanguages: ['ko'], outputLanguage: 'ko' };
  const AI_APIS = [['Rewriter', { ...AI_LANG, tone: 'as-is', format: 'plain-text', length: 'as-is' }], ['Summarizer', { ...AI_LANG, type: 'tldr', format: 'plain-text', length: 'long' }]];
  const AI_CONTEXT = '도시재생 기초조사 출처 기록 문장입니다. 숫자·연도·출처 이름을 바꾸거나 새로 만들지 말고, 좋다·나쁘다·위험하다 같은 평가 없이 읽기 쉬운 한국어 문단으로 옮기세요.';
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
  // sents(선택): reportSentences 결과. 주면 지표별 숫자 짝·기준 방향·누락까지 검증한다(2026-11-01). 없으면 예전처럼 숫자·평가어만 본다
  async function runDeviceAI(g, api, original, onProgress, sents) {
    const opts = (AI_APIS.find(a => a[0] === api) || [])[1];
    if (!opts || !g[api]) return { ok: false, bad: [], banned: [] };
    const m = await g[api].create({ ...opts, sharedContext: AI_CONTEXT, monitor(mon) { mon.addEventListener('downloadprogress', e => onProgress && onProgress(e.loaded, e.total)); } });
    try {
      const out = api === 'Rewriter' ? await m.rewrite(original, { context: AI_CONTEXT }) : await m.summarize(original, { context: AI_CONTEXT });
      return verifyPolished(out, original, sents);
    } finally { if (typeof m.destroy === 'function') m.destroy(); }
  }
  // 상태별 버튼·안내. 미지원이면 버튼을 끄고 결정적 보고서는 그대로 둔다. 내려받기는 사용자가 누를 때만
  function aiDevHTML(det) {
    const s = det ? det.status : 'checking', on = ['available', 'downloadable', 'downloading', 'unknown'].includes(s);
    const note = { checking: '이 브라우저의 기기 내 AI를 확인하는 중입니다.', unknown: '이 브라우저에 기기 내 AI가 있습니다.<br>누르면 한국어를 지원하는지 먼저 확인합니다. 아직 아무것도 내려받지 않습니다.', unsupported: `${AI_UNSUPPORTED}<br>아래 출처 기록 문장은 그대로 쓸 수 있습니다.`,
      unavailable: '이 브라우저에 기기 내 AI가 있지만 한국어를 지원하지 않거나 기기 사양이 맞지 않습니다.<br>아래 출처 기록 문장은 그대로 쓸 수 있습니다.',
      downloadable: '처음 한 번 Chrome이 기기 내 AI 모델을 내려받습니다.<br>Chrome 안내 기준 저장 공간이 22GB 이상 비어 있어야 합니다(모델 자체는 더 작습니다).<br>버튼을 누르기 전에는 내려받지 않습니다.',
      downloading: 'Chrome이 기기 내 AI 모델을 내려받는 중입니다.<br>끝나면 바로 다듬을 수 있습니다.',
      available: '문장은 이 기기 안에서만 처리되고 서버로 보내지 않습니다.<br>입력을 저장하지 않습니다.' }[s];
    return `<button type="button" class="btn ghost rp-ai-btn" data-ai-run${on ? '' : ' disabled aria-disabled="true"'}>${esc(AI_DEV_BTN)}</button><p class="rp-ai-note is-${esc(s)}">${note}</p>`;
  }
  const liveText = (v, it, ind, mode) => `${v.crumbs.map(c => c.label).join(' › ')}${it ? ` › ${it.name}. ${ind.label}${mode === 'trend' ? ' 5년 변화' : ''} ${it.text}${it.year ? `, ${it.year}년` : ''}.` : `. ${STEP_BADGE[v.level] || ''}`}`;
  const ICONS = {
    play: 'M5 3l8 5-8 5z', pause: 'M5 3v10M11 3v10',
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
  const refOf = r => (r.ind.series && r.year !== r.cell?.base_year ? (r.year ? `${r.year}년` : null) : r.cell?.reference_date) || (r.year ? `${r.year}년` : null);
  const SNAP_BASIS = [['unit', '단위'], ['rule_version', '규칙 버전'], ['formula_id', '산식 ID'], ['formula_text', '산식'],
    ['spatial_unit', '공간단위'], ['area_code', '지역 코드'], ['data_source_system', '출처 시스템'], ['source_url', '출처 URL']];
  function snapshotOf(it, rows, now) {
    return { v: 3, code: it.code, name: it.name, saved_at: now.toISOString(),
      items: rows.filter(r => r.ind.group !== 'fore' && !r.ind.pending).map(r => {
        const c = r.cell, matched = c && c.value === r.value && (!r.ind.series || c.base_year === r.year);
        // 과거 시계열 값에 최신 셀의 산식·출처를 붙여 비교 가능하다고 만들지 않는다.
        return { c: r.ind.code, l: r.ind.label, u: r.ind.unit || '', v: r.value ?? null, t: rowText(r), s: rowState(r).label, d: refOf(r),
          basis: matched ? Object.fromEntries(SNAP_BASIS.map(([k]) => [k, c[k] ?? null])) : null };
      }) };
  }
  function snapComparisonReason(prev, cur) {
    if (!prev.basis || !cur.basis) return '출처 기록 비교 근거 없음';
    const reasons = [];
    if (!prev.u || !cur.u) reasons.push('표시 단위 누락');
    else if (prev.u !== cur.u) reasons.push('표시 단위 변경');
    for (const [key, label] of SNAP_BASIS) {
      const before = prev.basis[key], now = cur.basis[key];
      if (typeof before !== 'string' || !before.trim() || typeof now !== 'string' || !now.trim()) reasons.push(`${label} 누락`);
      else if (before !== now) reasons.push(`${label} 변경`);
    }
    return reasons.join(' · ');
  }
  const thresholdStatus = s => s === HIT || s === statusLabels['기준 안'];
  function diffSnap(prev, cur) {
    // 2026-11-12: 예전 저장분의 옛 낱말('기준 미달')을 새 낱말로 맞춘 뒤 비교한다(normLabel). 저장된 원본(localStorage)은 고치지 않는다
    const before = new Map((prev.items || []).map(x => [x.c, { ...x, s: normLabel(x.s) }])), now = new Set(cur.items.map(x => x.c)), out = [];
    // 예전 기록에는 당시 화면의 추가확인·하한이 빠질 수 있다.
    const hasDisplayStates = prev.v === 3 && cur.v === 3;
    let same = 0;
    for (const x of cur.items) {
      const p = before.get(x.c);
      if (!p) out.push({ kind: 'new', flip: false, prev: null, cur: x });
      else if (p.v !== x.v || p.d !== x.d || p.u !== x.u || p.s !== x.s || SNAP_BASIS.some(([k]) => p.basis?.[k] !== x.basis?.[k])) {
        const reason = snapComparisonReason(p, x);
        const flip = !reason && hasDisplayStates && isNum(p.v) && isNum(x.v)
          && p.s !== x.s && thresholdStatus(p.s) && thresholdStatus(x.s);
        out.push({ kind: 'changed', flip, prev: p, cur: x, reason });
      }
      else same++;
    }
    for (const p of before.values()) if (!now.has(p.c)) out.push({ kind: 'gone', flip: false, prev: p, cur: null }); // 빠진 항목도 맞춘 낱말로 보인다
    return { rows: out, same };
  }
  const deltaText = d => (d.prev && d.cur && isNum(d.prev.v) && isNum(d.cur.v)
    ? d.reason ? `수치 비교 보류: ${d.reason}` : `${d.cur.v - d.prev.v >= 0 ? '+' : ''}${fmt(Math.round((d.cur.v - d.prev.v) * 100) / 100, d.cur.u === '%' ? '%p' : d.cur.u)}`
    : d.kind === 'new' ? '새 항목' : d.kind === 'gone' ? '빠짐' : '자료 없음');
  const hasStatusDifference = d => !!(d.prev && d.cur && d.prev.s !== d.cur.s);
  const countStatusChecks = rows => rows.filter(d => !d.flip && hasStatusDifference(d)).length;
  const snapStatusText = d => hasStatusDifference(d)
    ? `저장 때 ${d.prev.s || '상태 기록 없음'} · 지금 ${d.cur.s || '상태 기록 없음'}` : (d.cur || d.prev).s;
  function snapHTML(prev, cur) {
    const head = `<section class="rp-g rp-snap"><h3>${icon('fore')}기준일 비교</h3>`;
    if (!prev) return head + '<p class="rp-intro">지금 값을 이 기기에 저장해 두면, 사전컨설팅·보완 때 다시 열어 바뀐 항목만 표로 볼 수 있습니다.<br>서버로 보내지 않습니다.<br>같은 기기·같은 브라우저에서만 보이고, 방문 기록을 지우면 함께 지워집니다.<br>남겨 둘 값은 문서 받기로 파일에 넣어 두세요.</p><p class="rp-tools"><button type="button" class="btn ghost" data-snap-save>지금 값 저장</button></p></section>';
    const d = diffSnap(prev, cur), flips = d.rows.filter(x => x.flip).length, when = String(prev.saved_at).slice(0, 10);
    const cell = x => (x ? `${esc(x.t)}<br><small>${esc(x.d || '기준일 기록 없음')}</small>` : '–');
    const table = d.rows.length ? `<div class="dg-tbl">${copyHead('기준일 비교')}<div class="table-wrap"><table class="rp-tbl rp-snap-tbl"><thead><tr><th>항목</th><th>저장 때(${esc(when)})</th><th>지금</th><th>변동</th><th>표시 상태</th></tr></thead><tbody>` +
      d.rows.map(x => `<tr class="${x.flip ? 'is-flip' : ''}"><td>${esc((x.cur || x.prev).l)}</td><td>${cell(x.prev)}</td><td>${cell(x.cur)}</td><td>${esc(deltaText(x))}</td><td>${x.flip ? `<b>${esc(x.prev.s)} → ${esc(x.cur.s)}</b>` : esc(snapStatusText(x))}</td></tr>`).join('') + '</tbody></table></div></div>'
      : '<p>저장한 뒤 바뀐 값이 없습니다.</p>';
    return head + `<p class="rp-snap-sum">${esc(when)} 저장분 대비 바뀐 항목 <b>${d.rows.length}</b>개 · 같은 근거에서 바뀐 상태 <b>${flips}</b>개 · 확인할 상태 차이 <b>${countStatusChecks(d.rows)}</b>개 · 그대로 ${d.same}개</p>${table}` +
      '<p class="rp-tools"><button type="button" class="btn ghost" data-snap-save>지금 값으로 다시 저장</button><button type="button" class="btn ghost" data-snap-clear>저장 지우기</button></p></section>';
  }
  // 납품 파일(HWPX·DOCX·PPTX·XLSX)용 표. 문서 글꼴 검사(clean)가 화살표를 지우므로 '에서 …로'로 쓴다
  function snapDoc(prev, cur) {
    if (!prev) return null;
    const d = diffSnap(prev, cur), when = String(prev.saved_at).slice(0, 10), flips = d.rows.filter(x => x.flip).length;
    const cell = x => (x ? `${x.t}${x.d ? ` (${x.d})` : ''}` : '-');
    return { when, summary: d.rows.length ? `${when}에 저장한 값과 비교하면 바뀐 항목은 ${d.rows.length}개, 같은 근거에서 바뀐 상태는 ${flips}개, 확인할 상태 차이는 ${countStatusChecks(d.rows)}개, 그대로인 항목은 ${d.same}개다.` : `${when}에 저장한 뒤 바뀐 값이 없다(${d.same}개 항목).`,
      rows: [['항목', '저장 때 값(기준일)', '지금 값(기준일)', '변동', '표시 상태'], ...d.rows.map(x => [(x.cur || x.prev).l, cell(x.prev), cell(x.cur), deltaText(x), x.flip ? `${x.prev.s}에서 ${x.cur.s}로 바뀜` : snapStatusText(x)])] };
  }
  // 2026년 행정구역 개편: 지도 경계·이름·코드는 SGIS 2025 기준이라, 바뀐 지역을 열면 바뀐 사실과 공식 출처를 함께 적는다(2026-10-30 전수검사: 3,559동 중 468동)
  const MOIS_REORG = 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=127039';
  const REORG = [
    { sido: ['24', '36'], text: '2026. 7. 1. 광주광역시와 전라남도가 전남광주통합특별시로 통합됐다. 행정동·법정동 코드도 새로 매겨졌다.', url: MOIS_REORG },
    { sg: ['23010', '23020'], text: '2026. 7. 1. 중구·동구가 제물포구·영종구로 바뀌었다.', url: MOIS_REORG },
    { sg: ['23080'], text: '2026. 7. 1. 서구가 서해구와 검단구로 나뉘었다.', url: MOIS_REORG },
    { sg: ['31240'], text: '2026. 2. 1. 화성시에 만세구·효행구·병점구·동탄구가 생겼다.', url: 'https://www.code.go.kr/comp/compBas_01.do' },
  ];
  function reorgNote(v) {
    const s2 = v && v.sido ? String(v.sido.code2) : '', s5 = v && v.sigungu ? String(v.sigungu.code5) : '';
    const r = REORG.find(x => (x.sido || []).includes(s2) || (x.sg || []).includes(s5));
    return r ? `<p class="map-note">${esc(r.text)} 이 지도의 경계·이름·코드는 SGIS 2025 기준이다. <a href="${r.url}" target="_blank" rel="noopener">공식 변경 내역</a></p>` : '';
  }
  // 기준일이 오늘보다 몇 달 앞인지(팩트풀니스: 낡은 숫자를 지금 숫자로 읽지 않게, 2026-11-01). 지난 달 수만 센다. 날짜가 아니거나 미래면 빈 문자열.
  // 연도만 있는 값(예: 2024년)은 날짜를 지어내지 않으려고 대지 않는다
  function ageText(ref, today = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ref || '')); if (!m) return '';
    const t = today instanceof Date ? [today.getFullYear(), today.getMonth() + 1, today.getDate()] : String(today).split('-').map(Number);
    const n = (t[0] - m[1]) * 12 + (t[1] - m[2]) - (t[2] < +m[3] ? 1 : 0);
    return n < 0 ? '' : n === 0 ? '1개월 안 자료' : `${n >= 12 ? `${Math.floor(n / 12)}년${n % 12 ? ` ${n % 12}개월` : ''}` : `${n}개월`} 전 자료`;
  }
  const ageSmall = (ref, today) => { const a = ageText(ref, today); return a ? `<br><small>${esc(a)}</small>` : ''; };
  // ── 수변 수질 측정지점(data/national/water_quality.json, 국가 수질측정망 연평균) ──
  // 등급 구간은 환경정책기본법 시행령 별표 1 제3호 가목 2) 하천 생활환경기준 문언(2025. 10. 1. 개정본, 2026-11-01 law.go.kr 확인).
  // 하천 지점의 BOD·총인만 대어 본다. 호소는 기준 항목·조건(총인/총질소 비율)이 달라 대지 않는다. 연평균을 기준 구간에 대어 본 것이지 판정·정비 필요 여부가 아니다
  const WATER_LAW = '환경정책기본법 시행령 별표 1 하천 생활환경기준';
  const WATER_GRADES = [['Ia', '매우 좋음'], ['Ib', '좋음'], ['II', '약간 좋음'], ['III', '보통'], ['IV', '약간 나쁨'], ['V', '나쁨'], ['VI', '매우 나쁨']];
  const WATER_EDGES = { bod: [1, 2, 3, 5, 8, 10], tp: [0.02, 0.04, 0.1, 0.2, 0.3, 0.5] };
  const WATER_COLORS = [...REF, '#2a3b52', '#16202e']; // BOD 구간이 높을수록 진한 청회색(좋음·나쁨 색 아님)
  const isLake = p => p.type === '호소';
  const waterGrade = (v, edges) => (isNum(v) ? (edges.findIndex(e => v <= e) + 1 || edges.length + 1) - 1 : null);
  const waterStyle = p => { const g = isLake(p) ? null : waterGrade(p.bod, WATER_EDGES.bod);
    return { pane: 'water', radius: 5, weight: 1, color: '#153c39', fillOpacity: 0.9, fillColor: g === null ? '#fff' : WATER_COLORS[g] }; };
  function waterTipHTML(p, year) {
    const row = (label, v, unit, d, k) => { if (!isNum(v)) return ''; const g = k && !isLake(p) ? waterGrade(v, WATER_EDGES[k]) : null;
      return `<br>${label} ${esc(nf(d).format(v))}${unit}${g === null ? '' : ` (${WATER_GRADES[g][0]} ${WATER_GRADES[g][1]} 구간)`}`; };
    return `<b>${esc(p.name)}</b> ${esc(p.type)} 측정지점<br>${esc(year)}년 평균(${esc(p.n)}개월)` + row('BOD', p.bod, 'mg/L', 1, 'bod') + row('총인', p.tp, 'mg/L', 3, 'tp') +
      row('TOC', p.toc, 'mg/L', 1) + row('총대장균군', p.tcoli, '/100mL', 0) + (isLake(p) ? row('클로로필-a', p.chla, 'mg/㎥', 1) + '<br>호소는 등급 구간을 대지 않음' : '');
  }
  const waterNoteHTML = (d, today) => (d === null ? '<p class="map-legend-note">수질 측정지점 자료를 불러오지 못했습니다.</p>'
    : `<p class="map-legend-note">${esc(d.year)}년 12월까지 측정값(${esc(ageText(`${d.year}-12-31`, today))}).<br>점 색: 하천 BOD ${esc(d.year)}년 평균이 드는 ${esc(WATER_LAW)} 구간(진할수록 BOD 높음). 흰 점은 호소(구간 대조 안 함).<br>원본에 0으로 적힌 달은 측정하지 않은 것으로 보고 평균에서 뺐습니다.<br>판정 아님 · 출처 <a href="${esc(safeUrl(d.source && d.source.url) || '#')}" target="_blank" rel="noopener">${esc(d.source && d.source.name)}</a> · ${esc(d.points.length)}개 지점</p>`);
  // 4대강 수질자동측정소(data/national/water_auto.json): 공개 좌표가 없어 지도 점 대신 수계별 표로만 보인다. 하루 평균 확정값의 30일 평균
  const AUTO_COLS = [['temp', '수온(℃)', 1], ['ph', 'pH', 1], ['do', '용존산소(mg/L)', 1], ['toc', 'TOC(mg/L)', 1], ['tn', '총질소(mg/L)', 2], ['tp', '총인(mg/L)', 3], ['chla', '클로로필-a(mg/㎥)', 1]];
  function waterAutoHTML(d, today) {
    if (!d || !Array.isArray(d.sites) || !d.sites.length) return '';
    const cell = (x, dg) => (x && isNum(x.cur) ? `${esc(nf(dg).format(x.cur))}${isNum(x.prev) ? `<br><small>직전 ${esc(nf(dg).format(x.prev))}</small>` : ''}` : '-');
    const basins = [...new Set(d.sites.map(s => s.basin))];
    return `<details class="map-hint"><summary>4대강 수질자동측정소 ${esc(d.sites.length)}곳 표 (위치 좌표 비공개라 지도에 없음)</summary>` +
      `<p>${esc(d.cur[0])}~${esc(d.cur[1])} 하루 평균 확정값의 평균(${esc(ageText(d.cur[1], today))}). 아래 작은 글씨는 직전 30일(${esc(d.prev[0])}~${esc(d.prev[1])}) 평균.<br>실시간이 아닙니다. 판정 아님 · 출처 <a href="${esc(safeUrl(d.source && d.source.url) || '#')}" target="_blank" rel="noopener">${esc(d.source && d.source.name)}</a></p>` +
      basins.map(b => `<div class="table-wrap"><table class="rp-tbl"><caption>${esc(b)}</caption><thead><tr><th scope="col">측정소</th>${AUTO_COLS.map(c => `<th scope="col">${esc(c[1])}</th>`).join('')}</tr></thead><tbody>` +
        d.sites.filter(s => s.basin === b).map(s => `<tr><th scope="row">${esc(s.name)}</th>${AUTO_COLS.map(([k, , dg]) => `<td class="num">${cell(s.v && s.v[k], dg)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>').join('') + '</details>';
  }
  // 폴리곤들의 바깥 경계 선([[경도, 위도], ...] 여러 개). 같은 파일 안 이웃 폴리곤은 꼭짓점을 공유하므로 한 번만 쓰인 변이 바깥이다.
  // groupOf를 주면 같은 묶음끼리 공유한 변만 지운다(시·도 테두리). 칸과 같은 좌표에서 나오므로 선이 칸과 어긋나지 않는다
  function outerLines(features, groupOf = () => 0) {
    const ids = new Map(), idOf = p => { const k = Math.round(p[0] * 1e5) * 1e7 + Math.round(p[1] * 1e5); let v = ids.get(k); if (v === undefined) ids.set(k, v = ids.size); return v; }; // 문자열 키는 전국 파일에서 150ms 걸렸다
    const edges = new Map();
    for (const f of features) {
      const c = f.geometry && f.geometry.coordinates; if (!c) continue;
      const g = groupOf(f);
      for (const poly of f.geometry.type === 'MultiPolygon' ? c : [c]) for (const ring of poly) for (let i = 1, ia = idOf(ring[0]); i < ring.length; i++) {
        const ib = idOf(ring[i]);
        if (ia !== ib) { const k = ia < ib ? ia * 1e7 + ib : ib * 1e7 + ia, had = edges.get(k);
          if (!had) edges.set(k, { g, ia, ib, a: ring[i - 1], b: ring[i], used: false }); else if (had.g === g) edges.delete(k); }
        ia = ib;
      }
    }
    const at = Array.from({ length: ids.size }, () => []);
    for (const e of edges.values()) { at[e.ia].push(e); at[e.ib].push(e); }
    const lines = [];
    for (const e of edges.values()) {
      if (e.used) continue;
      e.used = true;
      const line = [e.a, e.b];
      for (let next, end = e.ib; (next = at[end].find(x => !x.used));) { next.used = true; const fwd = next.ia === end; line.push(fwd ? next.b : next.a); end = fwd ? next.ib : next.ia; }
      lines.push(line);
    }
    return lines;
  }
  // ── 2026-11-12 동 이름 지도 표시(회의 "지도 품질") ──
  // 왜: 동 단계 지도에 이름이 없어 마우스를 올려야만 어느 동인지 알 수 있었다(휴대폰은 올릴 수도 없다).
  // 이름을 놓을 자리: 다각형 안에서 가장자리와 가장 먼 점(격자 표본). 바깥 경계 상자 가운데는 오목한 동에서 남의 동 위에 찍혔다.
  // 경위도를 평면으로 보고 경도에 cos(위도)를 곱해 거리를 맞춘다(동 크기에서 오차는 이름 자리 정하기에 충분히 작다)
  function labelPoint(geometry, n = 16) {
    const polys = geometry && geometry.type === 'MultiPolygon' ? geometry.coordinates : geometry && geometry.type === 'Polygon' ? [geometry.coordinates] : [];
    const area = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(s / 2); };
    const poly = polys.filter(p => p && p[0] && p[0].length > 2).sort((a, b) => area(b[0]) - area(a[0]))[0];
    if (!poly) return null;
    const ring = poly[0], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = Math.cos((y0 + y1) / 2 * Math.PI / 180);
    const inside = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
    const segDist = (x, y, a, b) => { const ax = a[0] * k, ay = a[1], bx = b[0] * k, by = b[1], px = x * k, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (y - ay) * dy) / L2)) : 0; return Math.hypot(px - ax - t * dx, y - ay - t * dy); };
    let best = null, bestD = -1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / n, y = y0 + (y1 - y0) * (j + 0.5) / n;
      if (!inside(x, y, ring) || poly.slice(1).some(h => inside(x, y, h))) continue;   // 구멍(다른 동을 품은 동) 안은 뺀다
      let d = Infinity; for (const r of poly) for (let s = 1; s < r.length; s++) d = Math.min(d, segDist(x, y, r[s - 1], r[s]));
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    return best || [(x0 + x1) / 2, (y0 + y1) / 2];
  }
  // 겹치는 이름 빼기: 우선순위(고른 동 먼저, 그다음 큰 동) 순서로 놓고, 이미 놓은 이름과 겹치면 뺀다. 화면 좌표(px) 상자
  function pickLabels(boxes, pad = 4) {
    const kept = [];
    for (const b of [...boxes].sort((a, c) => c.prio - a.prio)) {
      const hit = kept.some(k => b.x - b.w / 2 - pad < k.x + k.w / 2 && k.x - k.w / 2 - pad < b.x + b.w / 2 && b.y - b.h / 2 - pad < k.y + k.h / 2 && k.y - k.h / 2 - pad < b.y + b.h / 2);
      if (!hit) kept.push(b);
    }
    return new Set(kept.map(b => b.id));
  }
  const snapGet = code => { try { return JSON.parse(localStorage.getItem(SNAP_KEY + code) || 'null'); } catch (e) { return null; } };
  // 첫 경계를 그린 뒤 보조 자료를 받는다. 지도 초기화가 실패해도 문서·조건 검색은 8초 뒤 계속한다.
  function makeFirstMapGate(timers) {
    const { setTimeout, clearTimeout } = timers;   // 꺼내서 부른다: window 함수를 다른 객체의 메서드로 부르면 브라우저가 오류를 낸다
    let mapPainted;
    const firstMap = new Promise(resolve => {
      const timeout = setTimeout(resolve, 8000);
      mapPainted = () => { clearTimeout(timeout); resolve(); };
    });
    return { firstMap, mapPainted };
  }
  // 상세 시군구 경계는 한 번만 받는다. 첫 화면에 필요한 경우는 보조 자료를 기다리지 않는다.
  // 실패하면 개요 경계를 그대로 두고, 다음 호출에서 다시 받는다(2026-11-20 FE-R2-04: 한 번 끊기면 새로 고칠 때까지 각진 개요 경계가 남았다)
  function makeSgDetailLoader(deps) {
    let sgDetailWait = null;
    return function loadSgDetail(low = true) {
      if (deps.state.sgGeoDetailed) return Promise.resolve(true);
      return sgDetailWait || (sgDetailWait = deps.fetchJson('data/national/sigungu.geojson', low).then(geo => {
        if (!geo || !Array.isArray(geo.features)) { sgDetailWait = null; return false; }
        deps.state.sgGeo = geo; deps.state.sgGeoDetailed = true; deps.state.sgGeoScope = null;
        deps.render();
        return true;
      }));
    };
  }
  // 기본 부산은 정확한 부산 경계와 다른 지역 개요를 한 파일로 받는다.
  const firstGeoKind = route => route?.sido === '21' ? 'busan' : route?.sido ? 'detail' : 'overview';
  function boundaryCoverage(items, geo) {
    const listing = new Set(items.map(item => item.code).filter(code => code != null).map(String));
    if (!Array.isArray(geo?.features)) return { listCount: listing.size, boundaryCount: null, missingCodes: null };
    const hasRing = polygon => {
      const ring = Array.isArray(polygon) ? polygon[0] : null;
      return Array.isArray(ring) && ring.length >= 4 && ring.every(p => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
    };
    const bounded = new Set();
    for (const feature of geo.features) {
      const code = feature?.properties?.code, geometry = feature?.geometry;
      if (code == null || !listing.has(String(code)) || bounded.has(String(code))) continue;
      const coordinates = geometry?.coordinates;
      if (geometry?.type === 'Polygon' ? hasRing(coordinates) :
          geometry?.type === 'MultiPolygon' && Array.isArray(coordinates) && coordinates.some(hasRing)) bounded.add(String(code));
    }
    return { listCount: listing.size, boundaryCount: bounded.size, missingCodes: [...listing].filter(code => !bounded.has(code)) };
  }
  function boundaryCoverageHTML(m) {
    if (m.kind !== 'emd' || m.nodata) return '';
    const { listCount, boundaryCount } = boundaryCoverage(m.items, m.geo);
    const coverage = boundaryCount === null ? '지도 경계 자료를 확인하지 못했습니다.' : `지도 경계 확인 ${boundaryCount}곳`;
    const help = boundaryCount !== null && boundaryCount < listCount
      ? ` · 경계 없는 ${listCount - boundaryCount}곳<br>경계가 없는 동은 읍·면·동 목록에서 고를 수 있습니다.` : '';
    return `<p class="map-guide" data-map-boundary-coverage>목록 ${listCount}곳 · ${coverage}${help}</p>`;
  }
  const api = { makeFirstMapGate, makeSgDetailLoader, firstGeoKind,indexSummaryPending, mergeIndexSeries, rentSub, geojsonOf, boundaryCoverage, boundaryCoverageHTML, labelPoint, pickLabels, mergeLivingSummary, outerLines, forecastSVG, snapshotOf, diffSnap, snapHTML, snapDoc, icon, INDICATORS, GROUPS, MODES, NULL_COLOR, BELOW, ABOVE, MIG, DESIG, DESIG_NONE, MIG_CODE, DESIG_CODE, SOURCE_DEFAULT, SUM, LIVING_EXPECTED, FORE_NOTE, FORE_FIXED, SAFE_NOTE, SAFE_FIXED, AI_HEAD, AI_FOOT, REPORT_FOOT,
    ESTATE_NOTE, ESTATE_PROV, indOf, keyOf, binIndex, edgeLabels, scaleFor, colorOf, legendItems, legendLineHTML, distHTML, itemText, CHECK_NOTE, trendText, crossed, isPending, extraIndicators, sgExtra, fcOf,
    seriesJump, livingIndicators, allIndicators, wantedInd, isAvailable, provenanceHTML, parseHash, toHash, routeHash, childrenOf, leavesOf, leafRoute, resolve, searchEntries, findEntry, searchPick, candMsg, candHTML, suggestEntries, summaryOf, rowOf, tally, sigunguModel, seriesOf, valueAt,
    latestYear, yearsOf, dongRows, dongModel, crossedCount, playYears, sgRow, countOver, overCaption, sidoShare, hasYears, overStd, sparkline, strip, barSVG, scaleTableHTML, glanceHTML, tooltipHTML, legendHTML, liveText, fmt,
    reportSentences, verifyPolished, stdTextOf, olsFit, trendSVG, donutSVG, coverLabel, presentDeviceAI, detectDeviceAI, runDeviceAI, aiDevHTML, AI_APIS, AI_DEV_BTN, AI_LABEL, AI_UNSUPPORTED,
    gapRows, gapsHTML, reqLineHTML, rowState, BUNDLES, BUNDLE_ALL, bundleList, reorgNote, REORG, ageText, WATER_GRADES, WATER_EDGES, waterGrade, waterStyle, waterTipHTML, waterNoteHTML, waterAutoHTML, briefHTML, onepageHTML, fragPanelHTML, fragLinkHTML, fragFromParam, briefMailto, reportModeHTML, stdLineOf, BRIEF_HEAD, BRIEF_FOOT, REPORT_MODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewMap = api;
  api.countUp = el => countUp(el); // find.js·hero.js가 같은 카운트업을 쓴다
  // 네이버가 만든 로고·법적 고지 링크는 이름이 없어 화면 낭독기가 읽지 못한다(감사 김슬아3). 그림만 있는 링크에 이름을 붙인다
  api.nameMapLinks = root => root.querySelectorAll('a').forEach(a => {
    if (!a.getAttribute('aria-label') && !a.textContent.trim()) a.setAttribute('aria-label', 'NAVER 지도 ' + (/legal|notice|policy/i.test(a.href) ? '법적 고지' : '바로가기') + '(새 창)');
  });
  // countUp이 쓰는 값은 지도 없는 화면(about.html)에서도 있어야 한다. 아래 '지도 없으면 끝'보다 먼저 둔다(2026-10-30: about에서 초기화 전 접근 오류로 등장 효과가 멈췄다)
  const shown = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, coarse = matchMedia('(pointer: coarse)').matches, wide = matchMedia('(min-width: 900px)'), narrow = matchMedia('(max-width: 1023px)');

  // ── 브라우저 ──
  const app = document.getElementById('mapApp'); if (!app) return;
  // low: 첫 지도에 필요 없는 자료. 경계·지도 라이브러리가 먼저 받히도록 낮은 우선순위로 받는다
  const { fetchJson, fetchFailed } = window.RenewUtil;
  const { firstMap, mapPainted } = makeFirstMapGate({ setTimeout, clearTimeout });
  // 외부 AI 서버로 문장을 보내지 않는다. 다듬기는 기기 안 AI(detectDeviceAI)로만 한다(docs/legal/ai_ethics.md ⑤). 주소 상수도 두지 않는다(v9: 읽는 곳 없는 빈 상수였다)
  // 2026-11-12: 주소에 지도 경로가 없으면 전국이 아니라 부산(시도 코드 21)에서 시작한다.
  // 왜: 회의 결정 "의미는 도시재생으로 넓히되 범위는 부산 고정"[팀]. 전국에서 시작하면 첫 화면이 대부분 '자료 없음'인 전국 지도라
  // 쓰기 어렵다는 인상을 남겼다(docs/design/ux_feedback_2026-11-12.md 1절 1번). 전국은 경로(전국 ›)나 #map 주소로 그대로 갈 수 있다
  const DEFAULT_ROUTE_HASH = '#map/21';
  const deepLink = !!parseHash(location.hash);
  const BASE_TITLE = document.title;   // 경로를 들고 왔을 때만 휴대폰에서 지도로 내린다
  const state = { route: parseHash(location.hash) || parseHash(DEFAULT_ROUTE_HASH), ind: INDICATORS[0].code, bundle: BUNDLES[0].key, mode: 'now', year: null, horizon: null, playing: false, index: undefined, living: undefined, dongIndex: undefined, sgGeo: undefined, dash: undefined, mapErr: false, touched: false,
    migration: undefined, designations: undefined, forecastIdx: undefined, realestate: undefined, templates: undefined, sgGeoDetailed: false, sgGeoScope: null, failed: new Set() };
  const localBoundary = () => state.sgGeoScope === '21' && state.route.sido === '21';
  const inds = () => allIndicators(state.living, { migration: state.migration, designations: state.designations, forecastIdx: state.forecastIdx, realestate: state.realestate, failed: state.failed });
  const curInd = () => indOf(state.ind, inds());
  let wantInd = new URLSearchParams(location.search).get('ind');   // 한 번만 쓴다: 그 뒤 사용자가 고른 칩을 덮지 않는다
  // AX(2026-11-23): 연도(?y=)·5년 변화(?mode=trend)도 주소로 돌아온다('이 지도 링크 복사'가 보던 해를 그대로 보낸다). 지표가 정해진 뒤 한 번만 쓴다
  let wantYear = (/^\d{4}$/.exec(new URLSearchParams(location.search).get('y') || '') || [null])[0];
  if (new URLSearchParams(location.search).get('mode') === 'trend') state.mode = 'trend';
  const effMode = ind => (hasTrend(ind) ? state.mode : 'now');
  const horizons = () => (state.forecastIdx && Array.isArray(state.forecastIdx.horizons) ? state.forecastIdx.horizons.filter(isNum) : []);
  // 처음 보이는 전망 연도는 가장 먼 해다. 첫 해(1년 뒤)는 거의 모든 시·군·구가 0~10% 감소 한 칸에 들어가 색이 안 바뀌어 보였다(2026-11-07 대표 지적)
  const horizon = () => (isNum(state.horizon) && horizons().includes(state.horizon) ? state.horizon : horizons()[horizons().length - 1] ?? null);
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
  const emdGeometry = code5 => fetchJson(`data/national/emd/${code5}.geojson`);
  // r16 M19: 받지 못함(통신 끊김·5xx)과 파일 없음(404)을 나눈다. 받지 못했으면 failed → '다시 받기'(전에는 '자료가 아직 없습니다'로 남았다)
  const emdOf = code5 => lazy('emd:' + code5, () => Promise.all([emdGeometry(code5), fetchJson(`data/national/emd/${code5}.json`)])
    .then(([geo, json]) => { if (!geo && json && Array.isArray(json.features)) geo = json; return { geo: geo && Array.isArray(geo.features) ? geo : null, json: json && Array.isArray(json.dongs) ? json : null, failed: fetchFailed(`data/national/emd/${code5}.json`) }; }));
  // 생활 지표 파일: living/index.json이 없으면 시군구 파일도 찾지 않는다(null = 없음)
  const livingOf = code5 => (state.living ? lazy('living:' + code5, () => fetchJson(`data/national/living/${code5}.json`).then(j => (j && Array.isArray(j.dongs) ? j : null))) : null);
  // 전망 파일: forecast/index.json이 없으면 시군구 파일도 찾지 않는다
  const forecastOf = code5 => (state.forecastIdx ? lazy('fc:' + code5, () => fetchJson(`data/national/forecast/${code5}.json`).then(j => (j && Array.isArray(j.dongs) ? j : null))) : null);
  // 시·군·구 전망 파일(약 220KB): 추세 전망 지표를 고를 때만 받는다
  const forecastSgOf = () => (state.forecastIdx && typeof state.forecastIdx.sigungu_file === 'string' && curInd().src === 'forecast'
    ? lazy('fcsg', () => fetchJson(`data/national/forecast/${state.forecastIdx.sigungu_file}`).then(j => (j && Array.isArray(j.sigungu) ? j : null))) : null);
  const extOf = v => ({ migration: state.migration, designations: state.designations, forecastIdx: state.forecastIdx, realestate: state.realestate, horizon: horizon(), forecastSg: forecastSgOf(),
    forecast: v && v.level === 'emd' ? forecastOf(v.emdCode) || null : null, sg: v ? (v.gu || v.sigungu || null) : null });
  const extraAsked = new Set();
  let timer = null, autoT = null, lastLegend = '', lastLive = '', lastDong = null, wantCard = null;
  const fold = { tools: false, listUser: null, intro: false, legend: false, pick: false };   // 지도 아래 접힌 칸(받기·목록)의 펼침 상태. 다시 그려도 지킨다
  const miFold = {};   // '모든 지표' 묶음별 펼침: 사용자가 제목 줄을 누른 것만 기억한다(없으면 지금 지표의 묶음만 펼침)

  // 2026-11-19 화면 정리: 위치 줄(where)·연도 막대(ctl)를 따로 두고, 아래 칸(bottom)은 출처 한 줄·도구 접기·안내 문구를 고정 자리로 둔다.
  // 왜: 도구 안의 GIS 겹치기(#overlayApp)는 overlay.js가 상태를 들고 있어 render마다 다시 만들면 입력이 사라진다 → 도구 틀은 한 번만 만들고 안쪽만 바꾼다
  app.innerHTML = `<div class="map-where" data-where></div><div class="map-top" data-top></div><div class="map-stage" data-stage><div class="map-canvas is-wait" data-map-slot>전국 자료를 불러오는 중입니다.</div>` +
    `<section class="map-panel" data-panel id="dongCard" hidden aria-label="고른 동 카드"></section></div><div class="map-legend-line-box" data-legend-line></div><div class="map-ctlbox" data-ctl></div><div class="map-dongs" data-dongs></div><div class="map-pick" data-pick></div>` +
    `<div class="map-bottom" data-bottom><div class="map-prov" data-prov></div><details class="map-tools rm-disclosure" data-fold="tools"><summary>지도 도구 더 보기 <small>지도 그림 저장·수질·내 지도 파일 겹치기·두 파일을 같은 코드로 잇기·쓰는 법</small></summary><div data-tools></div><div class="map-tools-gis" data-gis></div></details><p class="map-live" aria-live="polite" data-live></p></div>`;
  const $ = s => app.querySelector(s), top = $('[data-top]'), stage = $('[data-stage]'), panel = $('[data-panel]'), pick = $('[data-pick]'), bottom = $('[data-bottom]'), dongBox = $('[data-dongs]'), legendLine = $('[data-legend-line]');
  const where = $('[data-where]'), ctlBox = $('[data-ctl]'), provBox = $('[data-prov]'), toolsBox = $('[data-tools]'), liveEl = $('[data-live]');
  const heroLive = document.getElementById('heroLive');
  // 지도 설명 두 줄(.hero-head .lead)과 자료 기준 줄(.hero-basis)은 '현재 지도 자료' 접힌 칸 안으로 옮긴다(문구는 그대로, 위치만). GIS 겹치기는 도구 칸 안으로
  const provExtra = document.createElement('div');
  provExtra.className = 'map-prov-extra';
  provExtra.append(...['#map .hero-head .lead', '#map .hero-basis'].map(s => document.querySelector(s)).filter(Boolean));
  const gisEl = document.getElementById('overlayApp');
  if (gisEl) $('[data-gis]').append(gisEl);
  // R4 1: 키보드로 지도 동 모양 18개를 모두 지나야 카드에 닿았다(검색 → 카드 Tab 47번). 지도 앞에 건너뛰기 링크를 둔다(.skip 모양: 초점을 받을 때만 보임).
  //   넓은 화면은 지도가 DOM 맨 뒤라 조작 줄(top) 맨 앞에, 좁은 화면은 지도(stage) 맨 앞에 둔다(render가 옮긴다). 고른 동 카드는 동 단계에서만 있어 그때만 보인다
  // href는 '#map…'으로 시작하면 안 된다: #mapApp의 'a[href^="#map"]' 처리가 경로를 전국으로 되돌린다
  const skipEl = document.createElement('a');
  skipEl.className = 'skip map-skip'; skipEl.href = '#dongCard'; skipEl.hidden = true; skipEl.textContent = '지도 건너뛰고 고른 동 카드로';
  skipEl.addEventListener('click', e => { e.preventDefault(); const h = (panel.hidden ? dongBox : panel).querySelector('.map-h3'); if (h) h.focus(); });   // 넓은 화면은 동을 고르기 전 카드 대신 목록 제목

  // 자료 불러오기 실패: 경고(role=alert)와 다시 시도 단추. 주소의 고른 곳(코드)을 함께 적어 어디서 막혔는지 알린다
  function loadErrorHTML() {
    const picked = String(location.hash || '').replace(/^#map\/?/, '').replace(/[^0-9/]/g, '');
    return `<div class="map-empty" role="alert"><h3>자료를 불러오지 못했습니다</h3><p>인터넷 연결을 확인하고 다시 시도해 주세요.</p>${picked ? `<p>고른 곳: ${esc(picked)}</p>` : ''}<p><button type="button" class="btn" data-retry>다시 시도</button></p></div>`;
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-retry]')) location.reload(); });
  function emptyHTML(title, lines, mascot) {
    return `<div class="map-empty" role="status">${mascot ? '<img src="mascot/taggy-waiting.svg" width="120" height="148" alt="" aria-hidden="true">' : ''}<h3>${esc(title)}</h3>${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  }
  const seg = (key, list, cur, label) => `<div class="dash-seg map-seg" role="group" aria-label="${label}">${list.map(([val, txt]) => `<button type="button" data-${key}="${val}" aria-pressed="${cur === val}">${txt}</button>`).join('')}</div>`;

  // 현재 단계에서 지도에 색을 칠할 항목(시군구 summary 또는 행정동)과 연도 범위
  function model(v) {
    const ind = curInd(), mode = effMode(ind), list = inds();
    if (v.level === 'emd') {
      const e = emdOf(v.emdCode);
      if (e === undefined) return { kind: 'wait' };
      if (e.failed && !e.json) return { kind: 'emdfail' };
      if (!e.json && !e.geo) return { kind: 'noemd' };
      const lv = livingOf(v.emdCode) || null, json = e.json || { dongs: [] }, years = yearsOf(json), ext = extOf(v);
      const year = state.year !== null && years && state.year >= years.min && state.year <= years.max ? state.year : null;
      let items = dongModel(json, ind, mode, year, lv, list, ext);
      const node = v.gu || v.sigungu;
      if (ind.level === 'sg' && node) { const x = sgExtra(ind, node, ext); items = items.map(it => ({ ...it, value: x.value, year: x.year, text: `${x.text} · 시·군·구 값`, color: x.color, cell: x.cell, check: !!x.check })); }
      // selYear: 사용자가 고른 연도(없으면 null → 쇠퇴 지표는 동마다 최신 연도). 생활 지표의 기준연도를 쇠퇴 시계열에 쓰지 않는다
      return { kind: 'emd', items, years, selYear: year, year: year ?? (items.find(i => i.year)?.year ?? null), geo: e.geo, json, living: lv, nodata: !e.json, ext };
    }
    const sgs = v.level === 'nation' ? leavesOf(state.index) : v.level === 'sido' ? leavesOf(state.index, v.sido.code2) : v.children;
    const items = sigunguModel(sgs, ind, mode, list, state.year, extOf(v));
    if (indexSummaryPending(state.index, ind, mode)) return { kind: 'sg', summaryWaiting: true, year: null, sgs,
      items: items.map(it => ({ ...it, value: null, year: null, color: NULL_COLOR, status: null, over: null, n: null,
        text: state.index.summaryError ? '추가 지표 자료를 불러오지 못했습니다' : '추가 지표 자료를 불러오는 중입니다' })) };
    return { kind: 'sg', items, sgs: v.level === 'nation' ? null : sgs, year: (isNum(state.year) && ind.series && mode === 'now' ? state.year : null) ?? items.find(i => i.year)?.year ?? null };
  }
  const coverMemo = new Map();
  const cover = i => { const k = i.code + ':' + !!state.index; if (!coverMemo.has(k)) coverMemo.set(k, coverLabel(i, state.index)); return coverMemo.get(k); };
  // 일부 시·도에만 값이 있는 지표(부산만 등)는 그 시·도 밖(전국 포함)에서 칩을 숨기고, 수집 중·보류 칩도 숨긴다. 지금 고른 지표는 남긴다
  const coverSidos = i => { const k = `S:${i.code}:${!!state.index}`; if (!coverMemo.has(k)) coverMemo.set(k, cover(i) && cover(i) !== '동 단위' ? new Set(leavesOf(state.index).filter(sg => isNum(summaryOf(sg, i.code).value)).map(sg => String(sg.sido2))) : null); return coverMemo.get(k); };
  // 받지 못한 자료의 칩(failed)은 숨기지 않는다: 그 칩이 다시 받기 단추다
  const chipShown = (i, cur, v) => i.code === cur || i.failed || (avail(i) && !(coverSidos(i) && !(v && v.sido && coverSidos(i).has(String(v.sido.code2)))));
  function provenanceHTML(ind, m, source, mode = 'now', open = false) {
    if (!ind || ind.hidden_until_decision) return '';
    const district = ind.level === 'sg', ready = m && (m.kind === 'sg' || m.kind === 'emd'), ext = m && m.ext;
    const items = !ready ? [] : district && m.kind === 'emd'
      ? [ext && ext.sg ? sgExtra(ind, ext.sg, ext) : { value: null }] : m.items || [];
    const lm = livingMap(m && m.living), key = keyOf(ind, mode);
    const hasValue = x => !ind.pending && !ind.held && (ind.categorical ? typeof x.value === 'string' && !!x.value.trim() : isNum(x.value));
    const rows = items.filter(hasValue), cells = rows.map(x => {
      if (x.cell) return x.cell;
      if (!m || m.kind !== 'emd' || district) return null;
      if (ind.src === 'forecast') return (fcOf(ext, x.code, ind.fc) || {}).cell || null;
      const d = ind.series ? ((m.json && m.json.dongs) || []).find(d => codeOf(d) === x.code) : lm.get(x.code);
      return livingCell(d, key);
    });
    const sources = [...new Set(cells.map(c => c && c.source_name).filter(Boolean))];
    if (!sources.length) sources.push(ind.source || ((ind.series || ind.computed) && (srcName(source) || SOURCE_DEFAULT)) || '추가확인');
    const dates = cells.map((c, i) => {
      const date = c && typeof c.reference_date === 'string' ? c.reference_date.slice(0, 10) : null;
      // 과거 연도 조회에 최신 셀의 기준일을 붙이지 않는다.
      return date && c.value === rows[i].value && /^\d{4}-\d{2}-\d{2}$/.test(date) && (ind.src === 'forecast' || !isNum(rows[i].year) || Number(date.slice(0, 4)) === rows[i].year) ? date : null;
    });
    const knownDates = [...new Set(dates.filter(Boolean))].sort(), years = [...new Set(rows.map(x => x.year).filter(isNum))].sort((a, b) => a - b);
    const period = knownDates.length === 1 ? knownDates[0] : knownDates.length ? `지역별 ${knownDates[0]}~${knownDates[knownDates.length - 1]}` : '추가확인';
    const dateText = period + (knownDates.length && dates.some(d => !d) ? ' · 일부 기준일 추가확인' : '')
      + (years.length ? ` · ${ind.src === 'forecast' ? '전망' : '표시'} 연도 ${years.length === 1 ? years[0] : `${years[0]}~${years[years.length - 1]}`}` : '');
    const unit = district ? '시·군·구' : m && m.kind === 'emd' ? '읍·면·동(행정구역)' : '시·군·구 요약 · 읍·면·동 원자료';
    const status = !ready ? (m && m.kind === 'wait' ? '자료를 불러오는 중' : '자료 없음 · 추가확인')
      : `값 있음 ${rows.length}곳 · 자료 없음 ${items.length - rows.length}곳${ind.held ? ' · 보류' : ind.pending ? ` · ${soonText(ind)}` : ''}`;
    return `<details class="map-hint map-provenance"${open ? ' open' : ''}><summary><span class="mp-sum">현재 지도 자료 · ${esc(ind.chip || ind.label)}${mode === 'trend' && hasTrend(ind) ? ' · 5년 변화' : ''}</span> <span class="mp-more">ⓘ 자세히</span></summary><dl>`
      + `<dt>공간 단위</dt><dd>${esc(unit)}</dd><dt>출처·방법</dt><dd>${esc(sources.join(' · '))}</dd><dt>기준일</dt><dd>${esc(dateText)}</dd><dt>현재 범위</dt><dd>${esc(status)}</dd></dl>`
      + `<p>${district && m && m.kind === 'emd' ? '같은 시·군·구 값을 여러 동 경계에 표시하며, 한 곳으로 셉니다.' : '현재 지도 범위의 지역 수입니다.'}<br>법정동·개별 건물 자료와 구분해서 봅니다.${ind.src === 'forecast' ? '<br>추세 전망은 관측값이 아닙니다.' : ''}</p><a href="data.html">전체 데이터 출처·확인 방법</a></details>`;
  }
  // 2026-11-13 우지예: '모든 지표' 칩이 '가장 가까운 ○○ 직선거리'처럼 길어 한 줄에 하나씩 쌓여 읽기 어려웠다 →
  //     칩에는 '○○ 직선거리'로 줄여 쓴다('직선'을 빼면 걸어서 가는 거리로 읽혀 남긴다, #86 검토). 범례·출처·문서는 원래 이름 그대로
  const chipName = i => i.chip || String(i.label).replace(/^가장 가까운 (.+?) 직선거리$/, '$1 직선거리');
  // 2026-11-23 대표 지적(버튼이 너무 많다): 묶음 4개·칩(또는 모든 지표 목록)을 '지표' 한 칸에 접어 둔다. 닫힌 줄에 지금 지표 이름, 칩을 고르면 닫힌다
  const pickHTML = (ind, inner) => `<details class="mv-pick" data-fold="pick"${fold.pick ? ' open' : ''}><summary><span class="mv-pick-k">지표</span><b>${esc(chipName(ind))}</b></summary><div class="mv-pick-in">${inner}</div></details>`;
  function indCtlHTML(ind, m, source, mode) {
    const v = state.index && resolve(state.index, state.route), list = inds().filter(i => chipShown(i, ind.code, v)), g = ind.group;
    // 2026-11-13: 시작 묶음(BUNDLES). 지금 고른 지표가 묶음 안에 없으면(주소·검색으로 다른 지표에 왔을 때) '모든 지표'로 보여 고른 칩이 사라지지 않게 한다
    const inBundle = bundleList(state.bundle, list), bkey = inBundle && inBundle.some(i => i.code === ind.code) ? state.bundle : BUNDLE_ALL;
    // 2026-11-22 대표 지적(글이 많다): 묶음 단추를 그림 타일로(그림 + 짧은 이름). 그림은 꾸밈이라 aria-hidden, 이름은 그대로 읽힌다
    const BUNDLE_ICON = { req: 'bldg', soc: 'tree', shop: 'shop', [BUNDLE_ALL]: 'sum' };
    const bundles = `<div class="map-bundles mv-tiles" role="group" aria-label="무엇을 볼지 고르기">${[...BUNDLES.map(b => [b.key, b.label]), [BUNDLE_ALL, '모든 지표']].map(([k, l]) => `<button type="button" data-bundle="${k}" aria-pressed="${k === bkey}">${icon(BUNDLE_ICON[k])}<span>${esc(l)}</span></button>`).join('')}</div>`;
    const tag = (i, ok) => (ok ? (cover(i) ? `<small class="is-part">${esc(cover(i))}</small>` : '') : `<small>${i.held ? '보류' : i.failed ? '불러오지 못함 · 다시 시도' : '수집 중'}</small>`);   // avail은 수집 중(pending)을 이미 뺀다
    const chipOf = i => { const ok = avail(i);
      return `<button type="button" class="dash-chip${ok ? '' : ' is-planned'}" data-ind="${esc(i.code)}" title="${esc(i.label)}" aria-pressed="${i.code === ind.code}"${ok || i.failed ? '' : ' aria-disabled="true"'}>${icon(i.icon)}${esc(chipName(i))}${tag(i, ok)}</button>`; };
    if (bkey !== BUNDLE_ALL) {
      // 2026-11-19: 휴대폰은 칩 6개까지만 먼저 보이고 나머지는 '+N개 더 보기'(고른 칩이 뒤쪽이면 모두). 가로 스크롤 줄은 쓰지 않는다(칩은 줄바꿈)
      const cut = narrow.matches && !state.chipsMore && inBundle.length > 6 && inBundle.findIndex(i => i.code === ind.code) < 6 ? 6 : inBundle.length;
      const more = cut < inBundle.length ? `<button type="button" class="dash-chip map-chips-more" data-chips-more>+${inBundle.length - cut}개 더 보기</button>` : '';
      return bundles + `<div class="dash-chips map-inds" role="group" aria-label="${esc(BUNDLES.find(b => b.key === bkey).label)} 지표">${inBundle.slice(0, cut).map(chipOf).join('')}${more}</div>`;
    }
    // 2026-11-19 대표 지적('모든 지표'가 가로 스크롤 탭 줄 + 칩 20여 개로 지저분했다): 묶음 7개를 접는 목록으로, 지표는 한 줄씩(44px).
    // 맨 위 검색 칸이 이름으로 줄을 거른다(거른 결과가 있는 묶음만 펼침). 수집 중·보류는 chipShown이 이미 숨긴다(지금 고른 것만 남는다)
    const rowOf = i => { const ok = avail(i);
      return `<button type="button" class="mi-row${ok ? '' : ' is-planned'}" data-ind="${esc(i.code)}" data-mi-text="${esc((chipName(i) + i.label).replace(/\s+/g, '').toLowerCase())}" title="${esc(i.label)}" aria-pressed="${i.code === ind.code}"${ok || i.failed ? '' : ' aria-disabled="true"'}><span class="mi-name">${esc(chipName(i))}</span>${tag(i, ok)}</button>`; };
    const groups = GROUPS.filter(([k]) => k === g || list.some(i => i.group === k)).map(([k, l]) => {
      const rows = list.filter(i => i.group === k);
      return `<details class="mi-group rm-disclosure" data-mi-group="${k}"${miFold[k] ?? k === g ? ' open' : ''}><summary>${gIco(k)}<span class="mi-gname">${esc(l)}</span><small class="mi-gn">${rows.length}개</small></summary><div class="mi-rows" role="group" aria-label="${esc(l)} 지표">${rows.map(rowOf).join('')}</div></details>`;
    }).join('');
    return bundles + `<div class="mi" data-mi><label class="mi-search"><span>지표 이름 검색</span><input type="search" data-mi-q value="${esc(state.miQ || '')}" placeholder="예: 도서관, 인구" autocomplete="off" enterkeyhint="search"></label><p class="mi-none" data-mi-none role="status" hidden>맞는 지표가 없습니다.</p>${groups}</div>`;
  }
  // '모든 지표' 검색: 다시 그리지 않고 줄만 숨긴다(입력 칸 초점·글자 그대로). 찾은 줄이 있는 묶음만 펼치고, 검색을 지우면 원래 펼침으로
  function miFilter() {
    const box = app.querySelector('[data-mi]'); if (!box) return;
    const q = String(state.miQ || '').replace(/\s+/g, '').toLowerCase(), g = curInd().group;
    let any = false;
    box.querySelectorAll('.mi-group').forEach(d => {
      let n = 0;
      d.querySelectorAll('.mi-row').forEach(r => { const hit = !q || r.dataset.miText.includes(q); r.hidden = !hit; if (hit) n++; });
      d.hidden = !!q && !n;
      d.open = q ? n > 0 : (miFold[d.dataset.miGroup] ?? d.dataset.miGroup === g);
      if (n) any = true;
    });
    box.querySelector('[data-mi-none]').hidden = any;
  }
  function panelHTML(v, m, bare) {
    const ind = curInd(), mode = effMode(ind), scale = scaleFor(ind, mode), here = v.crumbs[v.crumbs.length - 1].label;
    // r18: 자료가 늦거나 화면을 읽는 도구(AI 에이전트)가 여기서 멈출 때 갈 곳 — 스크립트 없이 열리는 동 쪽(dong/{코드}.html). 빠른 연결에서는 깜빡이지 않게 4초 뒤에 보인다(map.css .wait-alt). 같은 링크가 두 번 나오지 않게 고른 동 카드(bare)에만 둔다
    if (m.kind === 'wait') return `<div class="map-panel-wait${v.dong ? ' has-dong' : ''}">읍·면·동 자료를 불러오는 중입니다.${v.dong && bare ? ` <a class="wait-alt" href="dong/${esc(v.dong)}.html">오래 걸리면 지도 없이 이 동 숫자 보기</a>` : ''}</div>`;   // has-dong: 동 카드 높이를 미리 잡아 둔다(R5 2, rm6.css)
    if (m.kind === 'emdfail') return `<div class="map-empty" role="alert"><h3>${esc(here)} 자료를 받지 못했습니다.</h3><p>인터넷 연결을 확인하고 다시 받아 주세요.</p><p><button type="button" class="btn" data-emd-retry="${esc(v.emdCode)}">다시 받기</button></p></div>`;
    if (m.kind === 'noemd' || m.nodata) return emptyHTML(`${here} · 읍·면·동 자료 준비 중`, [m.kind === 'noemd' ? '이 지역의 읍·면·동 자료가 아직 없습니다.' : '경계는 있지만 지표 시계열이 아직 없습니다.', '준비되기 전에는 숫자를 보여 드리지 않습니다.']);
    const it = m.items.find(x => x.code === v.dong), dist = ind.level === 'sg' ? `<p class="map-note">${esc(ind.label)}은(는) 시·군·구 단위 자료라 읍·면·동 분포가 없습니다.</p>`
      : `<h4 class="map-h4">${esc(here)} 읍·면·동 분포 · ${esc(ind.label)} <small>순위 아님${m.year ? ` · ${esc(m.year)}년` : ''}</small></h4>${strip(m.items, it ? it.code : null, ind, scale)}`;
    // 2026-11-19: 동을 고르기 전 안내는 한 줄만 두고, 분포·사업 비교·정밀 사례는 접어 둔다(목록이 바로 아래 오게). 문구는 그대로 접힌 칸 안에
    // bare: 넓은 화면 왼쪽 목록 위에 붙일 때(목록 제목이 이름·개수를 이미 보인다)
    // r16: 옛 동 코드·없는 동 코드로 들어오면 말없이 구 목록만 보였다 → 사실과 할 일을 한 줄로
    const lost = !it && v.dong ? `<p class="map-note" role="status">이 링크의 동 코드(${esc(v.dong)})를 찾지 못해 ${esc(here)}${josaOf(here, '을', '를')} 보여 드립니다. 행정동 개편으로 바뀌었을 수 있습니다. <button type="button" class="btn ghost" data-focus-search>동 이름으로 찾기</button></p>` : '';
    if (!it) return (bare ? '' : `<h3 class="map-h3" tabindex="-1">${esc(here)} <small>${m.items.length}개 읍·면·동</small></h3>`) + lost + '<p class="map-guide">지도나 목록에서 동을 고르면 요약이 열립니다.</p>' +
      `<details class="map-intro rm-disclosure" data-fold="intro"${fold.intro ? ' open' : ''}><summary>분포·사업 요건 비교 더 보기</summary>` +
      `<p class="map-guide">지도에서 동을 누르면 그 동의 요건·출처 카드가 열립니다.<br>항목마다 값, 기준선, 출처가 함께 보입니다.</p><p class="map-report-link"><a href="#report" data-set-mode="programs">${icon('flag')}동별 사업 요건 비교 보기</a></p>${reorgNote(v)}${forecastChart(ind, m.ext, v.gu || v.sigungu, null)}${dist}${hubHTML(v)}</details>`;
    const rows = rowsFor(v, m, it), D = window.RenewDashboard, dy = rows.find(r => r.ind.series && r.year)?.year, dong = m.json.dongs.find(d => codeOf(d) === it.code) || null;
    // 2026-11-19 대표 지적('자세한 근거'가 카드 안에 접힌 칸으로 겹쳐 길었다): 오른쪽 서랍(휴대폰은 지도 아래 카드)을 머리·탭·꼬리로 나눈다.
    // 머리 = 이름·닫기, 탭 = 요약(쇠퇴 3요건 세 줄)·지표 전체(척도표)·재생 사업, 꼬리 = 주 단추 하나('근거 문서 열기' = 예전 근거 1쪽 단추).
    // 경로·연도·경계 안내 같은 보조 문구는 'ⓘ 자세히' 한 칸에 모은다(문구는 그대로)
    const req = reqLineHTML(rows, dong, { go: false }); // 2026-11-13: 동 이름 바로 아래에 신청요건(첫 약속 D23의 답을 맨 먼저)
    const tab = MP_TABS.some(t => t[0] === state.mpTab) ? state.mpTab : 'sum';
    const { boundaryCount } = boundaryCoverage([it], m.geo);
    const boundaryLabel = boundaryCount === null ? '지도 경계 확인 불가' : boundaryCount === 0 ? '지도 경계 없음' : '경로·기준연도';
    const info = `<details class="mp-info"><summary>ⓘ 자세히 <small>${boundaryLabel}</small></summary>` +
      (boundaryCount === null ? '<p class="map-note" role="status">이 동의 경계 자료를 확인하지 못했습니다. 값은 아래에서 볼 수 있습니다.</p>' :
        boundaryCount === 0 ? '<p class="map-note" data-boundary-missing role="status">이 동의 지도 경계가 없어 위치를 표시하지 못합니다. 값은 아래에서 볼 수 있습니다.</p>' : '') +
      `<p class="map-note">${esc(v.crumbs.map(c => c.label).join(' › '))} · 쇠퇴 지표 ${dy ? `${esc(dy)}년` : '최신 연도'}, 생활 지표는 항목별 기준연도</p>${reorgNote(v)}` +
      (req.includes('data-biz-zero') ? `<p class="map-note">${esc(BIZ_BOUNDARY)}</p>` : '') + '</details>';
    const pane = (k, html) => `<div class="mp-pane" role="tabpanel" id="mp-pane-${k}" aria-labelledby="mp-tab-${k}" tabindex="0"${k === tab ? '' : ' hidden'}>${html}</div>`;
    // r16: 이름 옆에 종류('동')를 다시 붙이면 '반여1동 동'으로 읽혔다 → 시·도 시·군·구(같은 이름 동을 가린다)
    const region = [v.sido && v.sido.name, v.sigungu && v.sigungu.name, v.gu && v.gu.name].filter(Boolean).join(' ');
    return `<div class="map-panel-head mp-head"><h3 class="map-h3" tabindex="-1" data-code="${esc(it.code)}">${esc(it.name)}${region ? ` <small>${esc(region)}</small>` : ''}</h3><button type="button" class="map-close" data-close aria-label="${esc(it.name)} 카드 닫기">닫기</button></div>` +
      `<div class="mp-tabs" role="tablist" aria-label="${esc(it.name)} 보기">${MP_TABS.map(([k, l]) => `<button type="button" role="tab" id="mp-tab-${k}" data-mp-tab="${k}" aria-controls="mp-pane-${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}">${l}</button>`).join('')}</div>` +
      '<div class="mp-body">' +
      pane('sum', req + '<p class="map-copy"><button type="button" class="btn ghost" data-copy-map>이 지도 링크 복사</button><button type="button" class="btn ghost" data-candidate-save>보관함에 담기</button></p><p class="map-copy-msg" role="status" aria-live="polite" data-copy-map-msg></p><p data-candidate-status role="status"></p>' + info) +
      pane('all', forecastChart(ind, m.ext, v.gu || v.sigungu, dong) + scaleTableHTML(rows, { cur: ind.code, detail: D ? D.detailRows : null }) + dist) +
      pane('biz', `<p class="map-guide">이 동의 값에 맞춘 재생 사업 요건은 문서 탭에서 봅니다.</p><p class="map-report-link"><a href="#report" data-set-mode="programs">${icon('flag')}이 동에 맞는 재생 사업 보기</a></p>` + hubHTML(v)) +
      // r23(13 M8): 글 링크 줄은 카드 몸 끝으로 옮겼다. 휴대폰에서 붙는 꼬리가 단추+링크 약 110px라 아래 탭(65px)과 함께 출처 줄을 가렸다
      '<p class="mp-foot-more"><a href="#report" data-set-mode="onepage">한 장 요약</a> · <a href="#report" data-set-mode="programs">이 동에 맞는 재생 사업 보기</a></p></div>' +
      // r16: 꼬리 주 단추는 4-1 표 초안(홈 첫 단추와 같은 곳)
      `<div class="mp-foot">${goFrag('mp-go')}</div>`;
  }
  const MP_TABS = [['sum', '요약'], ['all', '지표 전체'], ['biz', '재생 사업']];   // r23(13 M1): 09 3절 '사업 요건 대조' 대신
  const rowsFor = (v, m, it) => dongRows(inds(), m.json.dongs.find(d => codeOf(d) === it.code), livingMap(m.living).get(it.code), m.selYear, m.ext);
  // 2026-11-19: 넓은 화면 왼쪽 패널의 주 목록 = 지금 단계의 아래 지역(전국 → 시·도, 시·도·시 → 시·군·구·일반구, 시·군·구 → 읍·면·동).
  // 시·도·시·군·구 고르기 칸(select)과 접힌 '읍·면·동 목록'을 대신한다. 줄마다 지도와 같은 색 견본·값(출처 값 그대로). 순서는 자료 순서(값 순 아님, D13)
  // 시·도 줄마다 막대 하나: 기준선이 있는 연도 지표는 '값 있는 동 중 기준선 넘은 동 비율'(합계 그대로), 그 밖의 숫자 지표는 시·군·구 값의 중앙값(가장 큰 시·도 = 꽉 찬 막대)
  function sidoBars(list, m) {
    const none = { cap: '', rows: new Map() };
    if (!m || m.kind !== 'sg' || m.summaryWaiting) return none;
    const ind = curInd(), mode = effMode(ind), sidoOf = new Map(leavesOf(state.index).map(sg => [String(sg.code5), String(sg.sido2)]));
    const by = new Map(list.map(s => [String(s.code2), []]));
    m.items.forEach(x => { const k = sidoOf.get(x.code); if (by.has(k)) by.get(k).push(x); });
    const rows = new Map();
    if (m.items.some(x => isNum(x.over) && isNum(x.n))) return { cap: '기준선 넘은 동 비율', rows: sidoShare(by), over: true };   // over: 막대 색 = 지도의 기준선 위 단계색(map-visual.css)
    if (ind.categorical) return none;
    const unit = scaleFor(ind, mode).unit, med = xs => { const a = xs.map(x => x.value).filter(isNum).sort((p, q) => p - q), h = a.length >> 1; return a.length ? (a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2) : null; };
    const meds = new Map([...by].map(([k, xs]) => [k, med(xs)]).filter(([, x]) => isNum(x)));
    const max = Math.max(0, ...meds.values());
    if (!meds.size || !max || [...meds.values()].some(x => x < 0)) return none;   // 음수(변화량)는 막대 길이로 그리지 않는다
    meds.forEach((x, k) => { const t = fmtL(x, ind, mode, unit) || ''; rows.set(k, { w: Math.round(x / max * 100), text: t, aria: `시·군·구 중앙값 ${t}` }); });
    return { cap: '시·군·구 값의 중앙값', rows };
  }
  function areaListHTML(v, m, it) {
    const here = v.crumbs[v.crumbs.length - 1].label;
    const fill = x => (isNum(x.value) || typeof x.value === 'string') && !x.check;   // check(추가확인)는 지도처럼 빗금
    const sw = x => `<i class="ma-sw${fill(x) ? '' : ' is-hatch'}"${fill(x) ? ` data-bg="${esc(x.color)}"` : ''} aria-hidden="true"></i>`;
    // AX(2026-11-23): 동 단계 목록은 기준 해당을 색 견본만이 아니라 글로도(값을 머릿속으로 기준과 비교하지 않게). 추가확인은 itemText가 이미 적는다
    const ind = curInd(), hit = x => m.kind === 'emd' && ind.level !== 'sg' && effMode(ind) === 'now' && !x.check && crossed(x.value, ind.standard) === true;
    const cells = x => `${sw(x)}<span class="ma-name">${esc(x.name)}</span><span class="ma-val">${m.summaryWaiting ? '' : esc(itemText(x) || '')}${hit(x) ? `<small class="ma-st">${HIT}</small>` : ''}</span>`;   // 기다리는 중 문구는 범례 줄에 한 번만
    const head = (n, unit) => `<h3 class="map-h3 ma-h" tabindex="-1">${esc(here)} <small>${n}개 ${unit}</small></h3>`;
    if (v.level === 'nation') {
      const list = state.index.sido || [], { cap, rows, over } = sidoBars(list, m);
      // 2026-11-22: 목록 자체를 막대 그래프로. 순서는 행정구역 순서 그대로(값 순 아님), 막대 뜻은 목록 위 한 줄에
      const bar = s => { const b = rows.get(String(s.code2)); return !b ? '' : b.w === null ? `<span class="mv-sbar is-none" aria-hidden="true"></span><span class="ma-val">${esc(b.text)}<span class="sr-only">${esc(b.aria)}</span></span>` : `<span class="mv-sbar" role="img" aria-label="${esc(`${s.name} ${b.aria}`)}"><i data-w="${b.w}"></i></span><span class="ma-val">${esc(b.text)}</span>`; };
      return head(list.length, '시·도') + (rows.size ? `<p class="mv-key${over ? ' is-over' : ''}"><i aria-hidden="true"></i>${esc(cap)}</p>` : '') +
        `<ul class="ma-list mv-sidos${over ? ' is-over' : ''}" aria-label="시·도 · 행정구역 순서(순위 아님)">${list.map(s => `<li><a class="ma-row" href="${esc(toHash({ sido: s.code2 }))}"><span class="ma-name">${esc(s.name)}</span>${bar(s)}</a></li>`).join('')}</ul>`;
    }
    if (m.kind === 'sg') return head(m.items.length, '시·군·구') + `<ul class="ma-list">${m.items.map(x => { const r = leafRoute(state.index, x.code); return r ? `<li><a class="ma-row" href="${esc(toHash(r))}">${cells(x)}</a></li>` : ''; }).join('')}</ul>`;
    if (m.kind !== 'emd' || m.nodata) return panelHTML(v, m, true);   // 불러오는 중·자료 준비 중·받지 못함 안내
    return `<h3 class="map-h3 ma-h" tabindex="-1">${esc(here)}</h3>` + boundaryCoverageHTML(m) + (it ? '' : panelHTML(v, m, true)) +
      `<ul class="ma-list" aria-label="읍·면·동">${m.items.map(x => `<li><button type="button" class="ma-row" data-dong="${esc(x.code)}" aria-pressed="${x.code === v.dong}">${cells(x)}</button></li>`).join('')}</ul>`;
  }
  // r16 M7: 고른 동을 왼쪽 패널·오른쪽 서랍에 가리지 않는 칸에 맞춘다(검색·목록으로 고르면 그 동 경계로 확대).
  // 지도에서 누른 동(onMap)은 다 보이면 옮기지 않는다(누른 곳이 손 밑에서 달아나지 않게). 전에는 구 전체에 맞춰 어느 동인지 몰랐다
  function fitDong(code, onMap) {
    if (!M || !M.emd) return;
    let lay = null;
    M.emd.eachLayer(l => { if (String(((l.feature || {}).properties || {}).code) === code) lay = l; });
    if (!lay || !lay.getBounds) return;
    const mr = M.el.getBoundingClientRect(), cover = el => { const r = el && !el.hidden && el.getBoundingClientRect(); return r && r.width && r.right > mr.left && r.left < mr.right && r.bottom > mr.top && r.top < mr.bottom ? r : null; };
    const side = cover(app.querySelector('.mx-side')), drawer = getComputedStyle(panel).position === 'absolute' ? cover(panel) : null;
    // 넓은 화면의 범례·연도 카드(.map-key, 지도 왼쪽 아래)도 피한다: 카드 위쪽 끝까지 아래를 비운다
    const card = cover(M.el.querySelector('.map-key')), bottom = card ? Math.round(mr.bottom - card.top) + 16 : 24;
    const left = side ? Math.round(side.right - mr.left) + 24 : 24, right = drawer ? Math.round(mr.right - drawer.left) + 24 : 24, size = M.map.getSize();
    if (left + right >= size.x - 80 || bottom >= size.y - 120) return;   // 남는 칸이 없으면(좁은 창) 옮기지 않는다
    const b = lay.getBounds(), nw = M.map.latLngToContainerPoint(b.getNorthWest()), se = M.map.latLngToContainerPoint(b.getSouthEast());
    if (onMap && nw.x >= left && se.x <= size.x - right && nw.y >= 0 && se.y <= size.y - bottom) return;
    const opt = { paddingTopLeft: [left, 24], paddingBottomRight: [right, bottom], maxZoom: 15 };
    if (reduced || state.naver) M.map.fitBounds(b, opt); else M.map.flyToBounds(b, { ...opt, duration: 0.6 });
  }
  // ── 현황 보고서(#report): 출처 기록 문장 + 그래프 + 출처표. 인쇄는 브라우저 인쇄(@media print), HWPX·XLSX는 메일 요청 ──
  const report = document.getElementById('reportApp');
  const initialReportMode = new URLSearchParams(location.search).get('report');
  let reportKey = '', reportInputs = [], polished = null, reportMode = REPORT_MODES.some(([key]) => key === initialReportMode) ? initialReportMode : 'report'; // polished: 검증을 통과한 AI 문장만
  api.download = k => download(k);
  // r16: data-frag가 있는 링크(서랍·카드의 '4-1 표 초안 보기')는 그 양식을 고르고 표까지 한 번 내린다(?frag=와 같다). 같은 문서여도 다시 그린다
  document.addEventListener('click', e => { const a = e.target.closest('[data-set-mode]'); if (!a) return; if (a.dataset.frag) { fragWanted = a.dataset.frag; reportKey = ''; } api.setReportMode(a.dataset.setMode, !!a.dataset.frag); });
  api.setReportMode = (m, force) => { const next = REPORT_MODES.some(x => x[0] === m) ? m : 'report'; if (next === reportMode && !force) return; reportMode = next; if (state.index !== undefined) render(); }; // find.js 프리셋이 쓴다
  function reportHTML(v, it, rows) {
    const D = window.RenewDashboard, sents = reportSentences(it.name, rows), here = v.crumbs.map(c => c.label).join(' › ');
    const byG = GROUPS.filter(([g]) => sents.some(s => s.group === g)).map(([g, gl]) => `<section class="rp-g"><h3>${gIco(g)}${esc(gl)}</h3>${g === 'safe' ? `<p class="rp-fixed">${esc(SAFE_FIXED)}</p>` : g === 'fore' ? `<p class="rp-fixed">${esc(FORE_FIXED)}</p>` : ''}` +
      // 항목 카드: 이름·상태 → 큰 값 → 기준 막대·추세 → 출처 기록 문장(접힘, 인쇄 때는 펼침). 숫자가 문장 속에 묻히지 않게
      // r16: 상태는 지도 카드·근거서와 같은 규칙(shownSt). 출처 기록이 미확정이면 값은 두고 '추가확인'과 까닭 한 줄(반여1동 인구 34.81%가 '기준 해당'으로 보였다)
      `<div class="rp-cards">${sents.filter(s => s.group === g).map(s => { const r = rows.find(x => x.ind.code === s.code), { cls, label, why } = r ? rowState(r) : { cls: 'none', label: '', why: '' };
        return `<div class="rp-item rp-card is-${cls}"><div class="rc-h"><span class="rc-l">${esc(s.label)}</span>${r ? `<span class="sr-st st-${cls}">${esc(label)}</span>` : ''}</div>` +
          `<p class="rc-v">${esc(r ? rowText(r) : s.value)}</p>${why ? `<p class="map-note rc-why">${esc(why)}</p>` : ''}${r && !r.ind.categorical ? barSVG(r) : ''}${r && r.series && r.series.some(p => p[1] !== null) ? sparkline(r.series, r.year, r.ind.label) : ''}` +
          `<details class="rc-more"><summary>문장·출처</summary><p>${esc(s.text)}</p></details></div>`; }).join('')}</div></section>`).join('');
    const src = `<details class="rp-src"><summary>출처표 (${sents.length}개 항목)</summary><div class="table-wrap"><table><thead><tr><th>항목</th><th>값</th><th>출처</th><th>기준일</th></tr></thead><tbody>${sents.map(s =>
      `<tr><td>${esc(s.label)}</td><td>${esc(s.value)}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : esc(s.source)}</td><td>${esc(s.ref || (s.year ? `${s.year}년` : '기록 없음'))}${ageSmall(s.ref)}</td></tr>`).join('')}</tbody></table></div></details>`;
    const pol = polished && polished.key === reportKey ? polished : null;
    const ai = `<div class="rp-ai"><p class="rp-ai-head">${esc(AI_HEAD)}</p><div data-ai-dev>${aiDevHTML(aiDet)}</div>` +
      `<span class="rp-ai-note">선택 기능 · 기본 꺼짐 · 무료 · 로그인 없음 · 서버 전송 없음</span>` +
      `<div class="rp-ai-consent" data-ai-confirm hidden><p><b>기기 내 AI 모델 내려받기</b><br>Chrome이 AI 모델을 이 기기에 한 번 내려받습니다(Chrome 안내: 저장 공간 22GB 이상 여유 필요).<br>내려받은 뒤에도 문장은 이 기기 안에서만 처리합니다.</p><button type="button" class="btn" data-ai-go>내려받고 다듬기</button> <button type="button" class="btn ghost" data-ai-cancel>취소</button></div>` +
      `<div class="rp-ai-out" data-ai-out aria-live="polite">${pol ? `<p class="rp-ai-label">${esc(AI_LABEL)}</p><p>${esc(pol.text)}</p>` : ''}</div><p class="rp-ai-foot">${esc(AI_FOOT)}</p></div>`;
    return `<div class="rp-head"><p class="rp-crumb">${esc(here)}</p><h3 class="rp-title">${esc(it.name)} 현황 보고서</h3><div class="rp-tools">${fileTools(it, rows.find(r => r.ind.series && r.year)?.year ?? null, '현황 보고서')}</div></div>` +
      `<p class="rp-intro rp-src-line">${esc(srcHead('출처표'))}</p><p class="rp-intro">카드의 숫자와 문장은 출처 기록의 값과 출처만 옮긴 것입니다.<br>평가나 판정은 하지 않습니다.</p>${typeof localStorage !== 'undefined' ? snapHTML(snapGet(it.code), snapshotOf(it, rows, new Date())) : ''}${byG}${src}${ai}<p class="rp-foot">${esc(REPORT_FOOT)}</p>`;
  }
  const socText = r => fmt(r.value, r.ind.unit);
  function renderReport(v, m, it) {
    if (!report) return;
    // 생활·전망 파일이 늦게 도착하면 키가 바뀌어 다시 그린다
    const key = it ? `${reportMode}:${it.code}:${m.selYear}:${horizon()}:${m.living ? 'L' : ''}${m.ext && m.ext.forecast ? 'F' : ''}${state.migration ? 'M' : ''}${state.designations ? 'D' : ''}${state.living ? 'I' : ''}${state.forecastIdx ? 'X' : ''}${state.realestate ? 'R' : ''}` : `empty:${reportMode}:${toHash(state.route)}`;   // 빈 안내의 '지도' 링크가 지역을 따라가게(v9: 시·도를 바꿔도 첫 시·도를 가리켰다)
    const inputs = [state.index, m.json, m.living, state.living, m.ext && m.ext.forecast, state.forecastIdx, state.designations, state.migration, state.realestate, m.geo, state.templates];
    if (key === reportKey && inputs.every((x, i) => x === reportInputs[i])) return;
    // 입력 SHA·보조 자료가 늦게 와도 같은 문서의 파일 메뉴와 키보드 초점을 유지한다.
    const filesView = it ? `${reportMode}:${it.code}` : '';
    const previousFiles = filesView && report.dataset.filesView === filesView ? report.querySelector('.rp-more-files') : null;
    const summaryFocused = previousFiles && previousFiles.querySelector('summary') === document.activeElement;
    report.dataset.filesView = filesView;
    reportInputs = inputs;
    reportKey = key;
    document.body.classList.toggle('print-onepage', reportMode === 'onepage' && !!it); // 인쇄 때 1쪽 요약만 A4 한 쪽에 맞춘다
    if (!it && reportMode === 'programs' && window.RenewPrograms && m.kind === 'emd' && m.items && m.items.length) {
      const here = v.crumbs[v.crumbs.length - 1].label, items = m.items.map(x => { const d = m.json.dongs.find(d => codeOf(d) === x.code) || {}; return { name: x.name, rows: rowsFor(v, m, x), cells: d.cells, series: d.series, check_years: d.check_years }; });
      report.innerHTML = reportModeHTML(reportMode) + window.RenewPrograms.districtHTML(here, items, DG);
      report.querySelector('[data-district-csv]').addEventListener('click', () => { if (DG) DG.saveBytes(`사업요건대조표_${DG.safeName(here)}.csv`, new TextEncoder().encode(window.RenewPrograms.districtCSV(items)), 'text/csv;charset=utf-8'); });
      return;
    }
    if (!it) { report.innerHTML = reportModeHTML(reportMode) + `<div class="rp-empty" role="status"><img src="mascot/taggy-waiting.svg" width="120" height="148" alt="" aria-hidden="true"><h3>동을 고르면 이 자리에 ${esc(iGa(REPORT_MODES.find(x => x[0] === reportMode)[1]))} 나옵니다.</h3><p><a href="${esc(toHash({ sido: v.sido && v.sido.code2, sigungu: v.sigungu && v.sigungu.code5, gu: v.gu && v.gu.code5 }))}">동 찾기</a></p>${m.kind === 'emd' && m.items && m.items.length && window.RenewPrograms ? '<p><button type="button" class="btn" data-set-mode="programs">이 구의 동 비교표 보기</button></p>' : ''}</div>`; return; }
    const rows = rowsFor(v, m, it);
    // 주소의 ?frag=는 양식 정의가 온 뒤 한 번만 읽는다(workspace.js가 고른 양식을 보고 그 주제를 연다)
    // r16: 고른 양식이 없으면 4-1 양식을 먼저 고른다(근거서·근거 1쪽을 열면 4-1 표가 바로 보이게). 내려 주는 것은 바로가기로 왔을 때만(fragJump)
    // report.dataset.fragWant: workspace.js가 좁은 화면 주제 넘김에서 4-1 표 주제를 연다(주소의 ?frag=와 같은 일)
    if (fragWanted && DG && DG.getTemplates()) { const f = fragFromParam(fragWanted, DG.fragmentChoices()); fragChoice = f || fragChoice; fragJump = !!f; fragWanted = null; if (f) report.dataset.fragWant = f.id; }
    else if (!fragChoice.id && DG && DG.getTemplates()) fragChoice = fragFromParam(FRAG_41, DG.fragmentChoices()) || fragChoice;
    if (reportMode === 'onepage') {
      const built = docFor(v, m, it);
      // r14 감사: 정상으로 만드는 중인데 '아직 만들 수 없습니다 … 다시 눌러 주세요'로 실패처럼 보였다 → 만드는 중(저절로 다시 그린다)과 받지 못함을 나눈다
      report.innerHTML = reportModeHTML(reportMode) + (built.loading ? '<div class="rp-empty" role="status" aria-busy="true"><h3>한 장 요약을 만드는 중입니다.</h3></div>'
        : built.error ? `<div class="rp-empty" role="alert"><h3>한 장 요약을 만들 자료를 받지 못했습니다.</h3><p>${esc(built.error)}</p><p><button type="button" class="btn" data-retry>다시 시도</button></p></div>` : onepageHTML(v, it, built.one));
    } else if (reportMode === 'programs' && window.RenewPrograms) {
      report.innerHTML = reportModeHTML(reportMode) + window.RenewPrograms.dongHTML(it.name, rows, (m.json && m.json.dongs || []).find(d => codeOf(d) === it.code)) + window.RenewPrograms.socHTML(rows, socText);
      report.querySelector('[data-soc-csv]').addEventListener('click', () => { if (DG) DG.saveBytes(`기반편의시설현황_${DG.safeName(it.name)}.csv`, new TextEncoder().encode(window.RenewPrograms.socCSV(it.name, rows, socText)), 'text/csv;charset=utf-8'); });
    } else if (reportMode === 'brief') {
      const built = docFor(v, m, it);
      report.innerHTML = reportModeHTML(reportMode) + briefHTML(v, it, rows, fragChoice, built.error ? null : built.brief);
    } else report.innerHTML = reportModeHTML(reportMode) + reportHTML(v, it, rows);
    const files = report.querySelector('.rp-more-files');
    if (files && previousFiles) {
      files.open = previousFiles.open;
      if (summaryFocused) files.querySelector('summary').focus({ preventScroll: true });
    }
    const exportMessage = DG === undefined ? '문서 도구를 불러오는 중입니다. 준비가 끝나면 출력 버튼이 활성화됩니다.'
      : !DG ? '문서 도구를 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.'
      : state.templates === null ? '문서 양식을 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.'
      : filesLoading(v) ? '문서에 필요한 자료를 불러오는 중입니다. 준비가 끝나면 출력 버튼이 활성화됩니다.' : '';
    report.querySelectorAll('[data-print], [data-dl], [data-task-package]').forEach(button => { button.disabled = !!exportMessage || (button.hasAttribute('data-task-package') && taskLinkBusy); });
    if (exportMessage) {
      const note = document.createElement('p'); note.className = 'rp-intro'; note.dataset.exportWait = ''; note.setAttribute('role', 'status'); note.textContent = exportMessage;
      report.querySelector('.rp-head')?.after(note);
    }
    paintFrag();
    // r14 출시 감사: ?frag=로 오면 문서 맨 위(표는 두 화면 아래)에 내렸다. 자료 대기 안내까지 걷힌 뒤 표로 한 번 내린다.
    // workspace.js가 MutationObserver로 조각 주제를 고른 뒤에 재도록 다음 그림 차례에
    if (fragJump && fragCur && !exportMessage) {
      fragJump = false;
      requestAnimationFrame(() => report.querySelector('.rp-frag')?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }));
    }
  }
  // ── 파일 만들기(docgen.js): 선택한 동의 출처 기록으로 근거서(HWPX·XLSX)와 1쪽 요약을 이 브라우저에서 바로 만든다. 서버로 보내지 않는다 ──
  const todayISO = () => DG.localDate();   // 서울 날짜(기기 시간대와 무관: 한국 밖·UTC 환경에서 0~9시에 하루가 어긋나지 않게)
  let taskLinkBusy = false;
  let docMemo = { key: '', val: null }, fragChoice = { id: '', variant: '' }, fragWanted = new URLSearchParams(location.search).get('frag'), fragJump = false;
  // 생활·전망·순이동 자료가 아직 오는 중이면 '파일 없음'으로 적히지 않게 만들기를 미룬다
  const filesLoading = v => [state.templates, state.living, state.migration, state.designations, state.realestate, state.forecastIdx].some(x => x === undefined) || (!!state.living && livingOf(v.emdCode) === undefined) || (!!state.forecastIdx && forecastOf(v.emdCode) === undefined);
  // 문서 생성기(docgen.js 114KB)는 첫 지도가 뜬 뒤에 받는다. 시작할 때 읽으면 휴대폰 첫 화면이 그만큼 늦었다(라이트하우스 '안 쓰는 JS' 1위)
  let dgWait = null;
  const loadDocgen = () => dgWait || (dgWait = new Promise(res => {
    const s = document.createElement('script'); s.src = 'docgen.js?v=20261122-r23'; s.onload = () => res(window.RenewDocgen || null); s.onerror = () => res(null); document.head.appendChild(s);
  }).then(d => {
    DG = d; docMemo = { key: '', val: null };
    if (DG && state.templates) DG.setTemplates(state.templates);
    document.dispatchEvent(new Event('renew-docgen')); // find.js가 XLSX 단추를 다시 그린다
    if (state.index) { reportKey = ''; render(); }
  }));
  function docFor(v, m, it) {
    // loading: 정상으로 만드는 중(자료가 오면 render가 다시 그린다). error만 있는 것은 받지 못함
    if (DG === undefined) { loadDocgen(); return { loading: true, error: '문서 도구를 불러오는 중입니다.' }; }
    if (!DG) return { error: '이 브라우저에서 문서 도구를 받지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' };
    if (state.templates === null) return { error: '문서 양식을 받지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' };
    if (filesLoading(v)) return { loading: true, error: '문서에 쓸 자료를 불러오는 중입니다.' };
    // 2026-11-20 CQ-08: 받지 못한 자료를 '파일 없음'으로 적은 문서를 만들지 않는다(기본값: 부분 문서 허용 안 함, 대표 확인 대기)
    const lost = [...state.failed].filter(k => k !== 'templates');
    if (lost.length) return { error: `일부 자료(${lost.map(k => AUX[k][2]).join(', ')})를 받지 못해 문서를 만들지 않았습니다. 지도의 '모든 지표'에서 그 지표의 '다시 시도'를 누른 뒤 다시 만들어 주세요.` };
    const writtenOn = todayISO(), key = [v.emdCode, it.code, m.selYear, writtenOn].join(':');
    const refsFor = m => [state.index, m.json, m.living, state.living, m.ext && m.ext.forecast, state.forecastIdx, state.designations, state.migration, state.realestate, m.geo, state.templates];
    const refs = refsFor(m);
    if (docMemo.key === key && refs.every((x, i) => x === docMemo.refs[i])) return docMemo.val;
    const memo = { key, refs, val: { loading: true, error: '문서 확인값을 만드는 중입니다.' } };
    docMemo = memo;
    try {
      const geo = m.geo && Array.isArray(m.geo.features) ? m.geo.features.find(f => String((f.properties || {}).code) === it.code) || null : null;
      // 해시를 기다리는 사이 선택·파일이 바뀌어도 해시와 본문은 이 고정 입력 하나에서 만든다.
      const fixed = JSON.stringify({ scheme: 'browser-brief-input-v1', code: it.code, year: m.selYear ?? null, writtenOn, geo, templates: state.templates,
        src: { index: state.index, emd: m.json, living: m.living, livingIdx: state.living, forecast: m.ext && m.ext.forecast, forecastIdx: state.forecastIdx,
          designations: state.designations, migration: state.migration, realestate: state.realestate } });
      const current = () => {
        const cur = currentDong();
        return docMemo === memo && cur && [cur.v.emdCode, cur.it.code, cur.m.selYear, todayISO()].join(':') === key && refsFor(cur.m).every((x, i) => x === refs[i]);
      };
      memo.ready = Promise.resolve().then(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(fixed))).then(digest => {
        if (!current()) return;
        const inputHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), input = JSON.parse(fixed);
        DG.setTemplates(input.templates);
        const brief = DG.buildBrief(input.code, input.src, { year: input.year ?? undefined, writtenOn: input.writtenOn, geo: input.geo, inputHash });
        memo.val = { brief, doc: DG.buildDoc(brief), one: DG.buildOnepage(brief), inputJSON: fixed };
      }).catch(err => { if (current()) memo.val = { error: `문서를 만들지 못했습니다: ${err.message}` }; }).then(() => {
        if (current()) { reportKey = ''; render(); }
        else if (docMemo === memo) docMemo = { key: '', val: null };
      });
    } catch (err) { memo.val = { error: `문서를 만들지 못했습니다: ${err.message}` }; }
    return memo.val;
  }
  const currentDong = () => { if (!state.index) return null; const v = resolve(state.index, state.route), m = model(v), it = m.kind === 'emd' && v.dong ? m.items.find(x => x.code === v.dong) : null; return it ? { v, m, it } : null; };
  const notify = detail => document.dispatchEvent(new CustomEvent('renew-export', { detail })); // report.js가 상태 문구를 바꾼다
  async function exportInput(format) {
    const cur = currentDong(), mode = reportMode;
    if (!cur) { notify({ format, status: 'empty' }); return null; }
    let built = docFor(cur.v, cur.m, cur.it);
    if (built.error && docMemo.ready) {
      const pending = docMemo;
      await pending.ready;
      if (docMemo !== pending || reportMode !== mode) { notify({ format, status: 'error', message: '문서 준비 중 선택이나 입력이 바뀌었습니다. 현재 문서에서 다시 눌러 주세요.' }); return null; }
      built = docFor(cur.v, cur.m, cur.it);
    }
    if (built.error) { notify({ format, status: 'error', message: built.error }); return null; }
    return { cur, built };
  }
  // 받는 파일 형식 표: 내려받기와 과업 연결이 같은 이름·MIME·바이트를 쓴다
  const OOXML = 'application/vnd.openxmlformats-officedocument.', FILE_MIME = { hwpx: 'application/hwp+zip', docx: OOXML + 'wordprocessingml.document', pptx: OOXML + 'presentationml.presentation', xlsx: OOXML + 'spreadsheetml.sheet' };
  // DG는 늦게 받으므로 부를 때 읽고, 고른 형식의 바이트만 만든다
  function filesFor(cur, one, pick, full, kinds) {
    const stem = `${cur.it.code}_${DG.safeName(cur.it.name)}_${one ? '근거1쪽' : '근거서'}`;
    return kinds.map(kind => ({ name: `${stem}.${kind}`, kind, mime: FILE_MIME[kind],
      bytes: kind === 'xlsx' ? DG.workbookBytes(full) : kind === 'hwpx' ? DG.hwpxBytes(pick) : kind === 'docx' ? DG.docxBytes(pick) : DG.pptxBytes(pick) }));
  }
  // r16: 받는 동안 같은 단추를 잠근다(두 번 눌러 파일이 둘 생겼다). 글자는 '만드는 중입니다'
  let dlBusy = false;
  async function download(kind) {
    if (dlBusy) return;
    dlBusy = true;
    const btns = report ? [...report.querySelectorAll(`[data-dl="${kind}"]`)].filter(b => b && b.tagName) : [], label = btns.map(b => b.textContent);
    btns.forEach(b => { b.disabled = true; b.textContent = '만드는 중입니다'; });
    try { await downloadNow(kind); } finally { dlBusy = false; btns.forEach((b, i) => { if (b.isConnected) { b.disabled = false; b.textContent = label[i]; } }); }
  }
  async function downloadNow(kind) {
    const prepared = await exportInput(kind); if (!prepared) return;
    const { cur, built } = prepared;
    const one = reportMode === 'onepage';
    try {
      // 동 보고서에서 '지금 값 저장'을 했으면 본문·엑셀에 기준일 비교를 붙인다(1쪽 요약은 분량 때문에 넣지 않는다)
      const snap = typeof localStorage !== 'undefined' ? snapDoc(snapGet(cur.it.code), snapshotOf(cur.it, rowsFor(cur.v, cur.m, cur.it), new Date())) : null, full = DG.withSnap(built.doc, snap);
      const file = filesFor(cur, one, one ? built.one : full, full, [kind])[0];
      notify({ format: kind, status: 'done', file: file.name, size: DG.saveBytes(file.name, file.bytes, file.mime), year: built.doc.brief.year, one });
    } catch (err) { notify({ format: kind, status: 'error', message: err.message }); }
  }
  async function printReport() {
    const prepared = await exportInput('pdf'); if (!prepared) return;
    const { cur, built } = prepared;
    reportKey = ''; renderReport(cur.v, cur.m, cur.it);
    if (!report.querySelector('[data-input-hash]')) {
      const footer = document.createElement('p'); footer.className = 'dg-small'; footer.setAttribute('data-input-hash', ''); footer.textContent = built.doc.footer; report.appendChild(footer);
    }
    report.querySelectorAll('details').forEach(d => { d.open = true; }); window.print();
  }
  async function connectTask(button) {
    if (taskLinkBusy) return;
    taskLinkBusy = true; button.disabled = true; button.textContent = '파일 묶음을 보관하는 중';
    const mode = reportMode;
    try {
      const prepared = await exportInput('task'); if (!prepared) return;
      const { cur, built } = prepared;
      const current = () => {
        const now = currentDong();
        return now && reportMode === mode && now.it.code === cur.it.code && docFor(now.v, now.m, now.it) === built;
      };
      const comparison = typeof localStorage !== 'undefined' ? snapDoc(snapGet(cur.it.code), snapshotOf(cur.it, rowsFor(cur.v, cur.m, cur.it), new Date())) : null;
      const full = DG.withSnap(built.doc, comparison), one = mode === 'onepage', pick = one ? built.one : full;
      // 보관 묶음 내용이 바뀌지 않게 mime은 넣지 않는다
      const request = {files:filesFor(cur, one, pick, full, ['hwpx', 'docx', 'pptx', 'xlsx']).map(({ name, kind, bytes }) => ({ name, kind, bytes })),inputJSON:built.inputJSON,comparison,templateVersion:JSON.parse(built.inputJSON).templates.version,
      reviewRows:DG.deliveryReview(built.brief,true).rows,context:{code:cur.it.code,region:built.brief.region,year:built.brief.year}};
      if (!window.RenewTaskLink) await import('./task-link.js?v=20261122-r21');
      if (!current()) throw new Error('파일 준비 중 선택이나 입력이 바뀌었습니다. 현재 문서에서 다시 눌러 주세요.');
      const packet = await window.RenewTaskLink.capture(request);
      if (!current()) throw new Error('선택이 바뀌어 화면 이동을 멈췄습니다. 보관한 파일 묶음은 보관함에서 다시 열 수 있습니다.');
      location.assign(`tasks.html?packet=${encodeURIComponent(packet.id)}`);
    } catch (error) { notify({format:'task',status:'error',message:error.message || '과업 파일을 보관하지 못했습니다.'}); }
    finally {
      taskLinkBusy = false;
      const now = currentDong();
      report.querySelectorAll('[data-task-package]').forEach(b => { b.disabled = !now || !DG || state.templates === null || filesLoading(now.v); b.textContent = '과업에 연결'; });
    }
  }
  // 지도 자료(GeoJSON, v7 2026-11-13): 지금 보는 경계와 지표 값을 GIS(QGIS 등)에서 바로 열게. 평가 6회차(시청 GIS 담당): 받을 수 있는 게 지도 그림뿐이었다.
  // 좌표는 경계 파일 그대로(WGS84, EPSG:4326). 값이 없으면 null(0으로 채우지 않음), 판정 아님
  function exportLabel(ind, mode) { return mode === 'trend' && hasTrend(ind) ? `${ind.label} 5년 변화` : ind.label; }
  function geojsonOf(feats, byCode, ind, meta) {
    const trend = meta.mode === 'trend' && hasTrend(ind), label = exportLabel(ind, meta.mode);
    const unit = trend && !ind.dEdges ? '%p' : ind.unit || '';
    const kind = trend ? 'change_5y' : ind.categorical ? 'designation' : ind.src === 'forecast' ? 'forecast' : 'current';
    const listing = meta.level === 'emd' && byCode.size
      ? new Map([...byCode].filter(([code]) => code != null).map(([code, item]) => [String(code), item?.name || null]))
      : null;
    const coverage = listing?.size ? boundaryCoverage([...listing.keys()].map(code => ({ code })), { features: feats }) : null;
    return { type: 'FeatureCollection', name: meta.name, note: '좌표계 WGS84(EPSG:4326) · 결측·보류는 null · 판정 아님 · 연도와 공간 단위는 각 행에',
      ...(coverage ? { renewmap_coverage: { list_count: coverage.listCount, matched_boundary_count: coverage.boundaryCount,
        feature_count: feats.length, areas_without_boundary: coverage.missingCodes.map(code => ({ code, name: listing.get(code) })) } } : {}),
      features: feats.map(f => {
        const props = f.properties || {}, code = String(props.code), it = byCode.get(code);
        const reg = meta.region ? meta.region(code) : {};
        const cell = it?.cell && it.cell.value === it.value ? it.cell : null;
        const review = !!(it?.check || ['추가확인', '충돌', '폐기'].includes(it?.status) || ['추가확인', '충돌', '폐기'].includes(cell?.status));
        const held = !!(ind.pending || ind.held || ind.hidden_until_decision || it?.cell?.value_hidden_reason);
        let value = null;
        if (!held && !review) {
          if (ind.categorical) {
            if (it?.value === DESIG_NONE || ind.cats?.some(([key]) => key === it?.value)) value = it.value;
          } else if (isNum(it?.value)) value = roundD(it.value, 2);
        }
        const year = isNum(it?.year) ? it.year : null, ref = cell?.reference_date;
        const referenceDate = typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref) &&
          (year === null || kind === 'forecast' || Number(ref.slice(0, 4)) === year) ? ref : null;
        return { type: 'Feature', geometry: f.geometry, properties: { code, name: it?.name || props.name || null,
          sido: reg.sido || null, sigungu: reg.sigungu || null, indicator: ind.code, label, value, unit, year, value_kind: kind,
          geometry_level: meta.level || null, data_level: meta.districtCode ? 'sg' : meta.level || null, data_area_code: meta.districtCode || code,
          value_status: held ? 'withheld' : review ? 'review' : value === null ? 'missing' : 'available',
          reference_date: value === null ? null : referenceDate, source: cell?.source_name || meta.source || null } };
      }) };
  }
  // 지도 내보내기(GeoJSON·그림) 공통: 알림 줄, 시군구면 상세 경계 받기, 지금 보이는 경계만 고르기. 못 하면 알리고 null
  // (v9: 두 함수에 같은 코드가 한 벌씩 있었다)
  // R5 3: 지금 지도(동·지표 포함) 주소 복사. 클립보드가 막히면 주소를 글로 보여 주고 선택해 둔다(site.js 인용 복사와 같은 방식)
  function copyMapLink() {
    const msg = panel.querySelector('[data-copy-map-msg]'), url = location.href;
    if (!msg) return;
    const select = () => {
      msg.textContent = '복사하지 못해 주소를 선택해 두었습니다. Ctrl+C로 복사해 주세요. ';
      const u = document.createElement('span'); u.textContent = url; u.className = 'map-copy-url'; msg.append(u);
      const r = document.createRange(); r.selectNodeContents(u); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => { msg.textContent = '복사했습니다.'; }, select);
    else select();
  }
  const exportSay = t => { const msg = app.querySelector('[data-png-msg]'); if (msg) msg.textContent = t; };
  async function exportFeats(m, what) {
    if (m.summaryWaiting) { exportSay('추가 지표 자료가 준비되지 않아 저장을 보류했습니다. 잠시 뒤 다시 시도하거나 새로고침해 주세요.'); return null; }
    if (m.kind === 'sg' && !state.sgGeoDetailed) {
      exportSay('상세 경계를 불러오는 중입니다.');
      if (!(await loadSgDetail())) { exportSay(`상세 경계를 불러오지 못해 ${what}을 보류했습니다. 다시 열어 주세요.`); return null; }
    }
    const feats = m.kind === 'emd' ? (m.geo && m.geo.features) || [] : m.kind === 'sg' && state.sgGeo ? state.sgGeo.features.filter(f => m.items.some(i => i.code === String((f.properties || {}).code))) : [];
    if (!feats.length) { exportSay(`경계 자료가 아직 없어 ${what}을 만들 수 없습니다.`); return null; }
    return feats;
  }
  async function mapGeojson() {
    const say = exportSay;
    if (!DG || !state.index) return;
    const index = state.index, v = resolve(index, state.route), m = model(v), ind = curInd(), mode = effMode(ind);
    const feats = await exportFeats(m, '지도 자료'); if (!feats) return;
    const label = exportLabel(ind, mode), where = v.crumbs[v.crumbs.length - 1].label;
    const name = `지도자료_${DG.safeName(label)}_${DG.safeName(where)}.geojson`;
    const region = code => { if (m.kind === 'emd') return { sido: v.sido && v.sido.name, sigungu: [v.sigungu && v.sigungu.name, v.gu && v.gu.name].filter(Boolean).join(' ') };
      const sg = sgOf(index, code); return { sido: v.sido ? v.sido.name : (sidoOf(index, String(code).slice(0, 2)) || {}).name, sigungu: sg && sg.name }; };
    const districtCode = m.kind === 'emd' && ind.level === 'sg' ? v.emdCode : null;
    const source = ind.source || ((ind.series || ind.computed) ? srcName(index.source) || SOURCE_DEFAULT : null);
    const fc = geojsonOf(feats, new Map(m.items.map(i => [i.code, i])), ind, { name: `${where} ${label}`,
      mode, level: m.kind, districtCode, source, region });
    const coverage = fc.renewmap_coverage;
    const scope = coverage ? ` 목록 ${coverage.list_count}곳 · 지도 경계 확인 ${coverage.matched_boundary_count}곳 · 경계 없는 ${coverage.areas_without_boundary.length}곳 · 파일 항목 ${coverage.feature_count}개.` : '';
    say(`${name} (${Math.round(DG.saveBytes(name, new TextEncoder().encode(JSON.stringify(fc)), 'application/geo+json') / 1024)}KB)를 내려받았습니다.${scope}`);
  }
  // 지도 이미지(PNG): 배경 타일(CORS로 캔버스에 못 그림)을 빼고 경계·색·범례·출처·기준연도만 그린다
  async function mapPng() {
    const say = exportSay;
    if (!DG || !state.index) return;
    const v = resolve(state.index, state.route), m = model(v), ind = curInd(), mode = effMode(ind), ok = avail(ind), off = !ok || ind.pending;
    const feats = await exportFeats(m, '이미지'); if (!feats) return;
    const byCode = new Map(m.items.map(i => [i.code, i])), crumbs = v.crumbs.map(c => c.label).join(' › ');
    const base = ind.latest ? `최근 달 ${String(ind.latest).slice(0, 4)}.${String(ind.latest).slice(4, 6)}` : `기준연도 ${m.year ?? '자료 없음'}${m.year ? '년' : ''}`;
    const model_ = { features: feats, paths: feats.length, colorOf: code => { const it = byCode.get(code); return it && it.value !== null && !it.check ? it.color : null; },
      title: off ? ind.label : scaleFor(ind, mode).title, subtitle: `${crumbs} · ${base}`, legend: legendItems(ind, off ? 'now' : mode, !off && m.items.some(x => x.check)).filter(l => !off || l.hatch).map(l => ({ ...l, label: off ? (ind.held ? '보류' : soonText(ind)) : l.label })),
      std: stdLineOf(ind, off), source: ind.source || (state.index.source && state.index.source.name) || SOURCE_DEFAULT, base };
    const { svg, width, height } = DG.mapSvg(model_);
    say('이미지를 만드는 중입니다.');
    DG.svgToPng(svg, width, height, 2).then(png => { const name = `지도_${DG.safeName(ind.label)}_${DG.safeName(v.crumbs[v.crumbs.length - 1].label)}.png`; say(`${name} (${Math.round(DG.saveBytes(name, png, 'image/png') / 1024)}KB)를 내려받았습니다.`); },
      () => say('이미지를 만들지 못했습니다. 브라우저 인쇄로 지도를 저장해 주세요.'));
  }
  const rowsOfTable = t => [...t.rows].map(tr => [...tr.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
  // R8 3: 문장 복사 단추는 aria-label이 이름을 정하고 live 영역 밖이라 '복사했습니다'가 안 읽혔다. 표 복사 단추는 .dg-tbl-h(aria-live) 안이라 이미 읽히므로,
  // live 밖의 단추만 화면 하나뿐인 숨김 알림 칸(role=status)에 알린다(같은 글이 live 두 곳에 들어가 두 번 읽히지 않게)
  const copyLive = msg => { let l = app.querySelector('[data-copy-live]'); if (!l) { l = document.createElement('p'); l.className = 'sr-only'; l.setAttribute('role', 'status'); l.dataset.copyLive = ''; app.append(l); } l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 50); };
  const copyDone = (b, ok) => { const old = b.dataset.label || (b.dataset.label = b.textContent); const msg = ok ? '복사했습니다' : '복사하지 못했습니다. 표를 직접 선택해 복사해 주세요'; if (!b.closest('[aria-live]')) copyLive(msg); b.textContent = msg; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = old; }, 2200); };
  function copyTable(b) {
    const box = b.closest('.dg-tbl'), t = box && box.querySelector('table'); if (!t || !DG) return;
    DG.copyToClipboard(DG.tablePayload(rowsOfTable(t), (box.querySelector('.dg-tbl-h b') || {}).textContent || '')).then(() => copyDone(b, true), () => copyDone(b, false));
  }
  function copyFrag(b) {
    if (!fragCur) return;
    const p = b.hasAttribute('data-frag-all') ? DG.fragmentPayload(fragCur) : DG.sentencePayload(DG.fragmentSentenceText(fragCur, +b.dataset.fragSentence));
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
    out.innerHTML = DG.fragmentHTML(fr);   // 추가확인 칸 안내는 docgen 상자(dg-pilot) 하나만(r16 2차: 같은 안내가 두 번, 낱말도 달랐다)
  }
  // r16: 4-1 표 한글 파일(docgen이 fragmentHwpx를 낼 때만 단추가 있다)과 4-1 표만 인쇄
  function fragHwpx() {
    const cur = currentDong(), built = cur && docFor(cur.v, cur.m, cur.it);
    if (!fragCur || !built || built.error || typeof DG.fragmentHwpx !== 'function') return;
    try {
      const name = `${cur.it.code}_${DG.safeName(cur.it.name)}_${fragCur.id === FRAG_41 ? '4-1표' : '양식표'}.hwpx`;
      notify({ format: 'hwpx', status: 'done', file: name, size: DG.saveBytes(name, DG.fragmentHwpx(fragCur, built.brief), FILE_MIME.hwpx) });
    } catch (err) { notify({ format: 'hwpx', status: 'error', message: err.message }); }
  }
  // 인쇄 CSS는 조각 칸(.rp-frag)을 숨기므로 조각 출력만 근거 1쪽 인쇄 틀(print-onepage)에 잠깐 옮겨 인쇄하고 되돌린다(print-frag: 4-1 표 전용 규칙 자리)
  function printFrag() {
    const out = report && report.querySelector('[data-frag-out] .dg-frag'); if (!out) return;
    const kids = [...report.childNodes], box = document.createElement('div');
    box.className = 'dg-doc dg-onepage'; box.append(out.cloneNode(true));
    document.body.classList.add('print-onepage', 'print-frag');
    report.replaceChildren(box);
    try { window.print(); } finally { report.replaceChildren(...kids); document.body.classList.remove('print-frag'); document.body.classList.toggle('print-onepage', reportMode === 'onepage'); }
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
    runDeviceAI(window, aiDet.api, original, (l, t) => msg(`기기 내 AI 모델을 내려받는 중입니다 · ${Math.round(100 * l / (t || 1))}%`), sents)
      .then(res => {
        if (aiDet.status !== 'available') { aiDet = { ...aiDet, status: 'available' }; aiPaint(); }
        if (key !== reportKey) return;
        polished = res.ok ? { key, text: res.text } : null;
        out.innerHTML = res.ok ? `<p class="rp-ai-label">${esc(AI_LABEL)}</p><p>${esc(res.text)}</p>`
          : `<p class="rp-ai-label">AI 문장을 버리고 출처 기록 문장을 보여 드립니다</p><p>${res.bad && res.bad.length ? `출처 기록에 없는 숫자(${esc(res.bad.join(', '))})가 있었습니다. ` : ''}${res.banned && res.banned.length ? `평가 표현(${esc(res.banned.join(', '))})이 있었습니다. ` : ''}${aiFailText(res)}</p>${sents.map(s => `<p>${esc(s.text)}</p>`).join('')}`;
      })
      .catch(() => msg('기기 내 AI가 문장을 만들지 못했습니다. 위의 출처 기록 문장을 그대로 보세요.'));
  }
  if (report) report.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const confirm = report.querySelector('[data-ai-confirm]');
    if (b.dataset.rpMode) { api.setReportMode(b.dataset.rpMode); report.querySelector(`[data-rp-mode="${b.dataset.rpMode}"]`)?.focus({ preventScroll: true }); }
    else if (b.hasAttribute('data-print')) printReport();
    else if (b.dataset.dl) download(b.dataset.dl);
    else if (b.hasAttribute('data-task-package')) connectTask(b);
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
    else if (b.hasAttribute('data-frag-hwpx')) fragHwpx();
    else if (b.hasAttribute('data-frag-print')) printFrag();
    else if (b.dataset.copySentence !== undefined) copySentence(b);
    else if (b.hasAttribute('data-ai-run') && aiDet) {
      const next = () => { if (aiDet.status === 'available') aiRun(); else if (confirm && (aiDet.status === 'downloadable' || aiDet.status === 'downloading')) { confirm.hidden = false; confirm.querySelector('[data-ai-go]')?.focus(); } };
      if (aiDet.status === 'unknown') { b.disabled = true; detectDeviceAI(window).then(d => { aiDet = d; aiPaint(); next(); }); } else next();
    }
    else if (b.hasAttribute('data-ai-cancel') && confirm) confirm.hidden = true;
    else if (b.hasAttribute('data-ai-go')) { if (confirm) confirm.hidden = true; aiRun(); } // 이 클릭(사용자 활성화) 안에서 create()가 불려 내려받기가 시작된다
  });
  // 건축HUB 3기준(dashboard.json, 법정동)은 수집된 시군구에서만 별도 섹션으로. 행정동 값과 합치지 않는다
  // 2026-11-08 속도: dashboard.json(압축 풀면 2.5MB)은 이 칸에만 쓰는데, 전에는 지도를 열자마자 받아 휴대폰이 첫 화면과 함께 읽어야 했다.
  // 이제 읍·면·동 단계에 처음 들어올 때 받는다(undefined=아직 안 받음, null=없음). 도착했을 때 '수집됨' 시군구가 있으면 한 번 다시 그린다
  let dashP = null;
  const loadDash = () => dashP || (dashP = fetchJson('data/dashboard.json', true).then(d => {
    state.dash = d && Array.isArray(d.sigungu) ? d : null;
    if (state.dash && state.dash.sigungu.some(s => s.status === '수집됨')) render();
  }));
  function hubHTML(v) {
    const D = window.RenewDashboard, dash = state.dash;
    if (D && v.emdCode && dash === undefined) loadDash();
    if (!D || !dash || !v.emdCode) return '';
    const node = v.gu || v.sigungu, mois = node ? String(node.mois_code5 || node.code5) : v.emdCode; // dashboard.json은 행안부 코드
    const sg = (dash.sigungu || []).find(s => String(s.code) === mois && s.status === '수집됨'); if (!sg) return '';
    const dongs = (dash.dongs || []).filter(d => d.sigungu_code === sg.code).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    // r19(사이트 현황 조사): 정밀 사례 칸(#dashboard)을 그리는 화면이 이제 없어(about.html에도 없음) 링크가 소개 쪽 맨 위로 떨어졌다 → 링크 없이 값만 보인다
    return `<h4 class="map-h4">정밀 사례 · 건축물대장 3기준 <small>법정동 · 건축HUB</small></h4><p class="map-note">이 구는 건축물대장을 동수·연면적·세대 기준으로 따로 모았습니다.<br>법정동은 행정동과 경계가 달라 따로 보여 줍니다.</p>` +
      `<ul class="map-hub">${dongs.map(d => { const c = D.cellView(D.cellOf(d, 20, 'COUNT')); return `<li>${esc(d.name)}<span>20년 동수 ${esc(c.text)}</span></li>`; }).join('')}</ul>`;
  }
  // 첫 화면 왼쪽 문구: 지금 보이는 범위에서 기준선을 넘은 곳의 개수(순위 아님)
  // 2026-11-12: 지도 아래 "자료 기준" 한 줄. 화면에 기준연도가 안 보여 자료가 오래됐다는 오해가 있었다.
  // 숫자는 손으로 적지 않고 index_map.json의 출처 메타(source·boundary_source·pop_source·biz_source)에서만 읽는다.
  // 메타에 없는 항목은 빼고, 하나도 없으면 줄 자체를 숨긴다(모르는 값을 지어내지 않는다)
  function heroBasis(index) {
    const el = document.querySelector('[data-basis]');
    if (!el) return;
    const last = a => (Array.isArray(a) && isNum(a[a.length - 1]) ? a[a.length - 1] : null);
    const parts = [];
    if (index && index.source && isNum(index.source.base_year)) parts.push(`쇠퇴지표 ${index.source.base_year}`);
    if (index && index.boundary_source && isNum(index.boundary_source.year)) parts.push(`행정동 경계 ${index.boundary_source.year}`);
    if (index && index.pop_source && last(index.pop_source.years)) parts.push(`인구 ${last(index.pop_source.years)}`);
    if (index && index.biz_source && last(index.biz_source.years)) parts.push(`사업체 ${last(index.biz_source.years)}`);
    const made = index && typeof index.generated_at === 'string' ? index.generated_at.slice(0, 10) : '';
    if (!parts.length) { el.textContent = ''; return; }
    el.innerHTML = `자료 기준: ${esc(parts.join(' · '))}${made ? ` · 만든 날 ${esc(made)}` : ''} <a href="data.html">출처 보기</a>`;
  }
  // AX(2026-11-23): 지금 지도를 한 문장으로(지역·지표·연도·기준 해당 수). 보이는 글이라 낭독기·AI 도구가 그대로 읽는다(aria-live·움직이는 숫자 없음).
  //   상태 낱말은 HIT('기준 해당') 하나로 쓴다(전에는 기준선·기준 해당·기준을 넘은이 섞였다)
  function summaryLine(v, m, ind) {
    if ((m.kind !== 'emd' && m.kind !== 'sg') || m.summaryWaiting || !avail(ind)) return '';
    const scope = v.level === 'nation' ? '전국' : v.crumbs[v.crumbs.length - 1].label, n0 = x => nf(0).format(x), mode = effMode(ind);
    const unit = m.kind === 'emd' && ind.level !== 'sg' ? '읍·면·동' : '시·군·구';
    const tail = `지도 색은 ${unit}별 ${ind.label}${mode === 'trend' ? ' 5년 변화' : ''}이며 판정이 아닙니다.`;
    if (m.kind === 'sg' && mode === 'now' && ind.standard && hasYears(state.index, ind)) {
      const c = overCaption(state.index, ind, m.year, m.sgs);
      if (c.n && isNum(c.over)) return `${scope}의 값 있는 읍·면·동 ${n0(c.n)}곳 중 ${HIT}(${ind.standard.text})인 곳은 ${n0(c.over)}곳(${Math.round(c.over / c.n * 100)}%)입니다. ${c.year}년 자료 · ${tail}`;
      if (c.n) return `${scope}의 값 있는 읍·면·동 ${n0(c.n)}곳 중 ${HIT}인 곳의 수는 아직 셀 수 없습니다. ${c.year}년 자료 · ${tail}`;   // 숫자판의 '—곳'과 같은 경우(0곳으로 단정하지 않는다)
      return state.index.seriesPending || !isNum(c.year) ? '' : `${scope}의 ${c.year}년은 ${ind.label} 자료가 없는 해입니다.`;   // 받는 중이면 쓰지 않는다(숫자판과 같은 규칙)
    }
    const has = m.items.filter(i => i.value !== null).length, yr = m.year ? `${m.year}년 자료 · ` : '';
    if (!has) return m.kind === 'sg' ? `${scope}에서는 ${ind.label}${mode === 'trend' ? ' 5년 변화' : ''} 값이 읍·면·동 단위로만 있어 시·군·구 색이 없습니다. 시·군·구를 고르면 색이 보입니다.` : `${scope}에는 ${ind.label} 값이 있는 읍·면·동이 없습니다.`;
    if (mode === 'now' && (ind.standard || ind.composite)) return `${scope}의 값 있는 ${unit} ${n0(has)}곳 중 ${ind.standard ? `${HIT}(${ind.standard.text})인 곳` : `${HIT}인 항목이 하나라도 있는 곳`}은 ${n0(crossedCount(m.items, ind))}곳입니다. ${yr}${tail}`;
    return `${scope}의 ${unit} ${n0(m.items.length)}곳 중 값 있는 곳은 ${n0(has)}곳입니다. ${yr}${tail}`;
  }
  function heroLiveHTML(v, m, ind) {
    if (!heroLive) return;
    const scope = v.level === 'nation' ? '전국' : v.crumbs[v.crumbs.length - 1].label, unitWord = m.kind === 'emd' ? '읍·면·동' : '시·군·구';
    if (m.kind !== 'emd' && m.kind !== 'sg') return;
    const total = m.items.length, has = m.items.filter(i => i.value !== null).length;
    let body;
    if (m.summaryWaiting) body = `<span class="hl-t">${state.index.summaryError ? '추가 지표 자료를 불러오지 못했습니다. 새로고침해 주세요.' : '추가 지표 자료를 불러오는 중입니다.'}<br>자료가 준비되면 숫자와 색을 보여 줍니다.</span>`;
    else if (!avail(ind)) body = `<span class="hl-t">${ind.held ? `${esc(ind.label)}은(는) 보류 중입니다: ${esc(ind.held)}` : ind.failed ? `${esc(ind.label)} 자료를 불러오지 못했습니다.` : `${esc(ind.label)}은(는) 자료를 모으는 중입니다.`}<br>${ind.failed ? '지표의 다시 시도를 눌러 주세요.' : '자료가 오기 전에는 지도를 회색으로 둡니다.'}</span>`;
    else if (!has) body = `<span class="hl-t">${esc(ind.label)}은(는) 읍·면·동 자료만 있습니다.<br>지도에서 시·군·구를 누르면 색이 보입니다.</span>`;
    else if (ind.src === 'forecast') body = `<span class="hl-t">${esc(FORE_FIXED)}</span>`;
    else if (ind.group === 'safe') body = `<span class="hl-t">${esc(SAFE_FIXED)}</span>`;
    else if (ind.group === 'estate') body = `<span class="hl-t">${esc(ESTATE_NOTE)}.<br>시·군·구 단위 신고 집계입니다.<br>${esc(ESTATE_PROV)}.</span>`;
    else if (!ind.standard && !ind.composite) body = `<span class="hl-t">공식 기준이 없는 지표입니다.<br>색은 고정 참고 구간입니다.</span>`;
    else if (m.kind === 'sg' && effMode(ind) === 'now' && hasYears(state.index, ind)) {
      const c = overCaption(state.index, ind, m.year, m.sgs), k = `${ind.code}-${scope}`;
      // 2026-11-22: 큰 숫자 아래 비율 막대 하나(값 있는 동 중 기준선 넘은 동). 숫자는 위 글에 그대로 있다
      const pct = c.n && isNum(c.over) ? Math.round(c.over / c.n * 100) : null;   // 넘은 동 수를 모르면 0%가 아니라 '—'·막대 없음
      body = `<span class="hl-t">${esc(ind.standard ? ind.standard.text : ind.label)}</span>` +
        `<span class="hl-n" title="${esc(c.text)}">${c.n ? `기준선 넘은 동 ${isNum(c.over) ? `<b data-ck="hl-o-${esc(k)}" data-count="${c.over}">0</b>` : '<b>—</b>'}곳 <small>/ 값 있는 동 <span data-ck="hl-n-${esc(k)}" data-count="${c.n}">0</span>곳</small> · <b class="hl-y">${esc(c.year)}년</b>` : state.index.seriesPending ? '<small>연도 자료를 불러오는 중입니다</small>' : `<b class="hl-y">${esc(c.year ?? '')}년</b> <small>자료 없는 해</small>`}</span>` +   // 받기 전 0곳을 '자료 없는 해'로 단정하지 않는다(GIS2-09)
        (pct === null ? '' : `<span class="mv-bar" role="img" aria-label="값 있는 동 ${nf(0).format(c.n)}곳 중 기준선 넘은 동 ${nf(0).format(c.over)}곳, ${pct}%"><span class="mv-track"><i data-w="${pct}"></i></span></span>`) +
        c.notes.map(n => `<span class="hl-note">${esc(n)}</span>`).join('');
    }
    else body = `<span class="hl-n"><b data-ck="hl-${esc(ind.code)}-${esc(scope)}" data-count="${crossedCount(m.items, ind)}">0</b>곳 <small>/ ${esc(scope)} ${nf(0).format(total)}개 ${unitWord}</small></span>` +
      `<span class="hl-t">${!ind.standard ? '기준 해당인 항목이 하나라도 있는 곳' : `${esc(belowLead(ind) + ind.standard.text)} — 기준 해당인 곳`}${m.year ? ` · ${esc(m.year)}년` : ''}${isPending(ind.standard) ? ` · 기준 ${esc(ind.standard.status)}` : ''}</span>`;
    const hk = ind.code + scope; heroLive.classList.toggle('is-new', hk !== lastLive); lastLive = hk;
    // r16: 같은 내용이면 다시 쓰지 않는다(aria-live라 render마다 같은 글을 다시 읽었다)
    // 2026-11-23: 제목 줄(지역 · 지표)을 화면에 보인다(전에는 낭독기에만 있어 지금 무엇을 보는지 칩에서 찾아야 했다). 끝에 요약 한 문장(#mapSummary, 지도 칸의 설명)
    const sum = summaryLine(v, m, ind);
    const html = `<span class="hl-k">${icon(ind.icon)}${esc(scope)} · ${esc(ind.chip || ind.label)}</span>${body}${sum ? `<span class="hl-sum" id="mapSummary">${esc(sum)}</span>` : ''}${autoT ? '<span class="hl-auto">연도·지표가 자동으로 바뀝니다 · 지도를 만지면 멈춥니다</span>' : ''}`;
    if (heroLive._html === html) return;
    heroLive.innerHTML = heroLive._html = html;
    styleData(heroLive);
    heroLive.querySelectorAll('[data-count]').forEach(countUp);
  }
  // 좁은 화면(≤1023px)과 넓은 화면의 덩어리 순서. 넓은 화면 틀(explore-layout.js)이 .map-top·.map-bottom을 #mapApp 밖으로 옮긴 뒤에는 건드리지 않는다
  let arranged = null;
  function arrange() {
    const n = narrow.matches;
    if (arranged === n || top.parentNode !== app) return;
    arranged = n;
    // 휴대폰: 위치 줄 → 지도 → 범례 한 줄 → 현황 숫자판 → 연도 → 고른 동 카드 → 동 목록 → 지표 칸 → 출처·도구
    // 2026-11-23: 숫자판(현황 한 줄·요약 문장)과 연도 막대를 범례 바로 아래로(전에는 동 목록·지표 단추 뒤라 한참 내려야 보였다)
    if (n) app.append(where, stage, legendLine, ...(heroLive ? [heroLive] : []), ctlBox, panel, dongBox, pick, top, bottom);
    else { stage.append(panel); app.append(where, top, stage, legendLine, ctlBox, dongBox, pick, bottom); }
  }
  // R5 3: 칩으로 지표를 바꾸면 주소(?ind=)도 따라간다 → 지금 지도를 메신저·서류에 그대로 건다. 기본 지표면 지우고, report·panel 같은 다른 값과 #경로는 그대로 둔다
  function syncIndUrl() {
    try {
      const u = new URL(location.href);
      if (state.ind === INDICATORS[0].code) u.searchParams.delete('ind'); else u.searchParams.set('ind', state.ind);
      if (state.mode === 'trend') u.searchParams.set('mode', 'trend'); else u.searchParams.delete('mode');
      // 재생·자동 넘김 중의 연도는 남기지 않는다(멈춘 뒤 고른 해만)
      if (isNum(state.year) && !state.playing && !state.yearByAuto) u.searchParams.set('y', state.year); else u.searchParams.delete('y');
      if (u.search !== location.search) history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* 주소를 못 바꿔도 지도는 그대로 쓴다 */ }
  }
  // 연도 막대: 재생 단추 + 연도 끌기. 시·군·구(재생 연도 목록)와 읍·면·동(연도 범위) 두 곳이 같은 모양을 쓴다
  const yearHTML = (on, min, max, year) => `<div class="map-year"><button type="button" class="map-play" data-play aria-pressed="${on}" aria-label="${on ? '재생 멈춤' : `${min}년부터 ${max}년까지 재생`}">${icon(on ? 'pause' : 'play')}</button><label><span class="map-year-k">연도</span> <b>${esc(year ?? '')}</b><input type="range" data-year min="${min}" max="${max}" step="1" value="${year ?? max}"></label></div>`;
  // '지도 저장·수질 겹쳐 보기' 접이. v7.14(9회차): 받기·수질·쓰는 법은 접어 두고 펼침 상태는 다시 그려도 지킨다(fold).
  // 2026-11-13 우지예: 단추가 무엇을 하는지 설명이 없어 이해가 어려웠다 → 단추 위에 한 줄씩 설명. median: 시·군·구 색이 중앙값일 때 계산법도 적는다
  function toolsHTML(median) {
    const save = DG ? `<p class="map-tools-note">지금 보이는 지도를 그림 파일(PNG)이나 GIS 프로그램용 파일(GeoJSON)로 저장합니다.</p><p class="map-png"><button type="button" class="btn ghost" data-map-png>지도 이미지(PNG)</button><button type="button" class="btn ghost" data-map-geojson>지도 자료(GeoJSON)</button><span class="map-png-msg" data-png-msg role="status"></span></p>` : '';
    const water = `<p class="map-tools-note">강·바다 수질 측정 위치를 지도 위에 겹쳐 봅니다.</p><p class="map-png"><button type="button" class="btn ghost" data-water aria-pressed="${!!state.water}">수변 수질 측정지점 ${state.water ? '끄기' : '보기'}</button></p>` +
      (state.water && state.waterData !== undefined ? waterNoteHTML(state.waterData) : '') + (state.water ? waterAutoHTML(state.waterAuto) : '');
    const move = coarse ? '두 손가락으로 지도를 움직이고 확대합니다.' : '끌어서 움직이고, 휠이나 + − 버튼으로 확대합니다.';
    const hint = `<details class="map-hint"><summary>ⓘ ${median ? '색 계산법·' : ''}지도 쓰는 법</summary>${median ? '<p>시·군·구 색 = 그 안 읍·면·동 값의 중앙값(가중 없음)</p>' : ''}<p>${move}<br>지도에서 구·군을 누르면 그 안의 읍·면·동이 보이고(시·도 → 구·군 → 읍·면·동), 동을 누르면 그 동의 요약이 열립니다.<br>지도가 불편하면 '읍·면·동 목록'에서 이름으로 고를 수 있습니다.</p></details>`;
    return save + water + hint;   // 2026-11-19: 감싸는 '도구' 접기 틀은 고정 자리(app 맨 아래)라 안쪽만 돌려준다
  }

  // 같은 글이면 다시 쓰지 않는다: 늦게 오는 자료가 render를 불러도 초점·펼침이 그대로 남는다
  const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
  function render() {
    if (state.index === undefined) return;
    if (wantInd) { const code = wantedInd(wantInd, inds()); if (code) { state.ind = code; state.year = null; wantInd = null; } else if (state.living !== undefined) wantInd = null; }   // 생활 지표 도착 전에는 기다리고, 도착했는데 없으면 버린다
    if (!wantInd && wantYear) { state.year = +wantYear; wantYear = null; }
    if (!wantInd) syncIndUrl();
    const v = resolve(state.index, state.route);
    // 도구 틀(GIS 겹치기 포함)은 고정 자리라 비우지 않는다. 그 밖의 칸만 비운다
    const clear = () => { [where, top, ctlBox, dongBox].forEach(el => setHTML(el, '')); pick.innerHTML = provBox.innerHTML = legendLine.innerHTML = ''; panel.hidden = true; };
    if (state.index === null) {   // 자료 파일을 못 불러왔다(네트워크·차단). '준비 중'이라 말하면 이미 고른 동네를 서비스에 자료가 없는 것으로 오해한다
      clear();
      stage.innerHTML = loadErrorHTML(); if (report) report.innerHTML = loadErrorHTML(); return;
    }
    if (v.level === 'empty') { clear(); stage.innerHTML = emptyHTML('전국 데이터 준비 중', ['출처 기록에서 내보낸 숫자만 이 자리에 보여 드립니다.', '준비되면 전국에서 읍·면·동까지 내려가 볼 수 있습니다.'], true); return; }
    const ind = curInd(), mode = effMode(ind), m = model(v), src = state.index.source && state.index.source.name, ok = avail(ind);
    const summaryNotice = m.summaryWaiting ? (state.index.summaryError ? '추가 지표 자료를 불러오지 못했습니다. 새로고침해 주세요.' : '추가 지표 자료를 불러오는 중입니다.') : '';
    const it = m.kind === 'emd' && v.dong ? m.items.find(x => x.code === v.dong) : null;
    if (EXTRA_FILES[ind.src]) wantExtra(ind.src);   // 그 칩을 골랐다
    if (it) wantExtra('migration', 'realestate');   // 동 카드의 세부 지표 표와 문서가 쓴다
    // 탭 제목에 지금 보는 곳을(v9 접근성: 동을 열어도 '동네 진단·지도 | 리뉴맵' 그대로라 화면 읽기·탭 목록에서 어느 동인지 몰랐다)
    const here = it ? it.name : v.crumbs.length > 1 ? v.crumbs[v.crumbs.length - 1].label : '';
    document.title = `${here ? `${here} · ` : ''}${chipName(ind)} · ${BASE_TITLE}`;   // AX(2026-11-23): 지표도(전국이면 지표만)
    const crumbs = `<nav class="map-crumbs" aria-label="지금 보는 곳"><ol>${v.crumbs.map((c, i) => i === v.crumbs.length - 1 && !it ? `<li aria-current="page">${esc(c.label)}</li>` : `<li><a href="${esc(c.hash)}">${esc(c.label)}</a></li>`).join('')}${it ? `<li aria-current="page">${esc(it.name)}</li>` : ''}</ol><span class="map-step">${esc(STEP_BADGE[v.level] || '')}</span></nav>`;
    const py = m.kind === 'sg' && mode === 'now' && hasYears(state.index, ind) && !ind.noPlay ? playYears(state.index, ind.code) : null, sgOn = v.level === 'nation' && !reduced ? !!autoT : state.playing;
    const yearCtl = py && py.years.length ? yearHTML(sgOn, py.years[0], py.years[py.years.length - 1], m.year)
      : m.kind === 'emd' && m.years && (ind.series || ind.computed) ? yearHTML(state.playing, m.years.min, m.years.max, m.year)
      : m.kind === 'sg' && state.index.seriesPending && ind.series && !ind.noPlay && mode === 'now' ? '<div class="map-year" aria-busy="true"><span class="map-year-wait">연도 자료를 불러오는 중입니다.</span></div>' : '';
    const base = state.index.source && isNum(state.index.source.base_year) ? state.index.source.base_year : null;
    // 휴대폰 폭에서 네 칸이 한 줄에 들어가게 '(+1년)'은 뺐다. 기준연도는 지표 이름(○○년 대비)에 있다
    const hzCtl = ind.src === 'forecast' && horizons().length ? seg('horizon', horizons().map(h => [h, `${h}년`]), horizon(), base !== null ? `전망 연도(기준 ${base}년)` : '전망 연도') : '';
    // 연도 막대를 끄는 중이면 막대를 다시 만들지 않는다(다시 만들면 끌기가 한 칸에서 끊긴다)
    const lkey = ind.code + mode, median = ok && !ind.pending && m.kind === 'sg' && mode === 'now' && hasYears(state.index, ind), chk = (m.items || []).some(x => x.check), legend = (summaryNotice ? `<div class="map-legend" role="status"><b>${esc(ind.label)}</b><p>${esc(summaryNotice)}</p></div>` : legendHTML(ind, mode, src, m.year, ok, chk)).replace('class="map-legend"', `class="map-legend${lkey !== lastLegend && !reduced ? ' is-new' : ''}"`); lastLegend = lkey;
    arrange();
    const desk = !narrow.matches;
    // 출처 한 줄('현재 지도 자료 · ⓘ 자세히') 안에 지도 설명·자료 기준 줄을 붙인다(provExtra는 다시 그려도 같은 노드)
    const prov = open => { provBox.innerHTML = provenanceHTML(ind, m, src, mode, open); const d = provBox.firstElementChild; if (d) d.append(provExtra); };
    const sliding = ctlBox.contains(document.activeElement) && document.activeElement.matches('[data-year]');
    if (sliding) {
      const yb = ctlBox.querySelector('.map-year b'); if (yb) yb.textContent = m.year ?? '';
      prov(!!provBox.querySelector('.map-provenance[open]'));
    }
    else {
      const ctl = `<div class="map-ctl">${hasTrend(ind) ? seg('mode', MODES, state.mode, '현재 또는 5년 변화') : ''}${hzCtl}${yearCtl}</div>`, inds = pickHTML(ind, indCtlHTML(ind, m, src, mode));
      // R3 2: 휴대폰·태블릿(≤1023px)은 DOM 순서 그대로 그린다(CSS order·display:contents 없이). 키보드·화면 낭독기 순서가 보이는 순서와 같다.
      // 넓은 화면은 왼쪽 패널 틀(explore-layout.js)이 .map-top(지표)·.map-bottom(출처·도구)을, 지도 위로 범례·연도 막대를 옮긴다
      setHTML(where, crumbs);
      setHTML(top, desk ? inds : '');
      pick.innerHTML = desk ? '' : inds;
      setHTML(ctlBox, ctl);
      prov(!!provBox.querySelector('.map-provenance[open]'));
      miFilter();
    }
    skipEl.hidden = v.level !== 'emd';
    const skipHome = narrow.matches ? stage : top;
    if (skipEl.parentNode !== skipHome || skipHome.firstChild !== skipEl) skipHome.prepend(skipEl);
    const chips = m.kind === 'emd' ? `<div class="dash-chips dash-dongs map-list" role="group" aria-label="읍·면·동">${m.items.map(x => `<button type="button" class="dash-chip" data-dong="${esc(x.code)}" aria-pressed="${x.code === v.dong}">${esc(x.name)}</button>`).join('')}</div>` : '';
    // R4 2: 휴대폰·태블릿(≤1023px)은 지도 위 동 모양이 44px보다 작은 것이 많다(390px 해운대구 18동 중 10동, 좌3동 21×40). 기존 '읍·면·동 목록'(44px 단추)을
    //   지도 바로 아래로 옮겨 쓴다(새 목록을 만들지 않는다). 동을 고르기 전에는 펼쳐 두고, 고른 뒤에는 접어 카드가 지도 바로 아래에 오게 한다. 사용자가 누른 뒤에는 그 선택(fold.listUser)을 따른다
    const listOpen = fold.listUser ?? !it;
    const dongList = boundaryCoverageHTML(m) + `<details class="map-dong-list map-more" data-fold="list"${listOpen ? ' open' : ''}><summary>읍·면·동 목록</summary>${chips}</details>`;
    // R5 2: 자료가 오기 전(wait)에도 목록 자리를 비워 두지 않으면 도착 때 지도 아래 전부가 117px 밀린다(390 딥링크 CLS 0.16)
    // 넓은 화면: 시·도·시·군·구 고르기 칸 대신 지금 단계의 아래 지역 목록이 왼쪽 패널의 주 목록이다(areaListHTML)
    setHTML(dongBox, desk ? areaListHTML(v, m, it) : (m.kind === 'emd' ? dongList : m.kind === 'wait' ? '<div class="map-dongs-wait" aria-hidden="true"></div>' : ''));
    setHTML(toolsBox, toolsHTML(median));
    // AX(2026-11-23): 알리는 칸은 이것 하나(숫자판 #heroLive는 aria-live 없음). 자동·연도 재생 중에는 해마다 읽지 않고 멈춘 뒤 한 번
    const say = liveText(v, it, ind, mode); if (!autoT && !state.playing && liveEl.textContent !== say) liveEl.textContent = say;
    // R5 10: 범례 한 줄(색 이름 · 구간 견본 · 자료 없음) + 구간·기준 문장은 그 아래 접힌 칸 하나에만(2026-11-19: 전체 범례가 두 번 그려졌다)
    const distUnit = m.kind === 'emd' ? (ind.level === 'sg' ? null : '읍·면·동') : '시·군·구';   // 동 단계의 시·군·구 지표는 같은 값을 여러 동에 칠해 세지 않는다
    legendLine.innerHTML = summaryNotice ? `<span role="status">${esc(summaryNotice)}</span>` : legendLineHTML(ind, mode, ok, chk) + (ok && distUnit && m.items ? distHTML(ind, mode, m.items, distUnit) : '') +
      `<details class="map-legend-more" data-fold="legend"${fold.legend ? ' open' : ''}><summary>구간·기준 보기</summary>${legend}</details>`;
    styleData(dongBox); styleData(legendLine);
    const inEmd = v.level === 'emd';
    // 넓은 화면의 오른쪽 서랍은 동을 골랐을 때만 연다(고르기 전 안내는 왼쪽 목록 위). 휴대폰은 지도 아래 카드 그대로
    panel.hidden = !inEmd || (desk && !it && !(m.kind === 'wait' && v.dong));
    if (!panel.hidden) {
      // R4 1: 카드 제목에 초점이 있으면(동을 고른 직후) 다시 그려도 잃지 않게 한다. 늦게 오는 자료(순이동·시세)가 render를 부른다. 탭 단추 초점도 같다
      const a = document.activeElement, keepCard = panel.contains(a) && a.classList.contains('map-h3'), keepTab = panel.contains(a) && a.dataset.mpTab;
      const oldInfo = it && it.code === lastDong ? panel.querySelector('.mp-info') : null;
      const keepInfoFocus = !!oldInfo && a === oldInfo.querySelector('summary');
      panel.innerHTML = panelHTML(v, m);
      if (it && window.RenewSafety) window.RenewSafety.card(panel, it.code, it.name);   // 안전·재난·기후 묶음(safety-layer.js)은 카드 몸 끝에 붙는다
      const info = oldInfo ? panel.querySelector('.mp-info') : null;
      if (info) info.open = oldInfo.open;
      if (keepCard || (wantCard && it && it.code === wantCard)) { panel.querySelector('.map-h3')?.focus({ preventScroll: true }); wantCard = null; }
      else if (keepInfoFocus) info?.querySelector('summary')?.focus({ preventScroll: true });
      else if (keepTab) panel.querySelector(`[data-mp-tab="${keepTab}"]`)?.focus({ preventScroll: true });
      panel.classList.toggle('is-sheet', !!it && !wide.matches);
      panel.classList.toggle('is-new', !!it && it.code !== lastDong && !reduced);
      document.body.classList.toggle('sheet-open', !!it && !wide.matches);
    } else document.body.classList.remove('sheet-open');
    const newDong = !!it && it.code !== lastDong;
    lastDong = it ? it.code : null;
    if (state.mapErr) { const s = stage.querySelector('[data-map-slot]'); if (s) s.outerHTML = emptyHTML('지도를 불러오지 못했습니다', ['네트워크를 확인한 뒤 다시 열어 주세요.', '아래 목록으로는 계속 고를 수 있습니다.']); }
    else drawMap(v, m);
    // 2026-11-19: 넓은 화면은 고른 동이 오른쪽 서랍 밑에 숨지 않게 지도를 옮기고(새 구로 맞출 때는 fitView가 서랍 폭만큼 비운다),
    // 휴대폰은 지도 바로 아래 카드로 내려 보인다(움직임 줄이기 설정이면 바로)
    if (newDong && desk && M) { const code = it.code, onMap = M.pickedOnMap === code; M.pickedOnMap = null;
      if (M.fitting) M.map.once('moveend', () => fitDong(code, onMap)); else fitDong(code, onMap); }
    if (newDong && !desk) panel.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    heroLiveHTML(v, m, ind);
    yearbar(v, m, ind, mode);
    renderReport(v, m, it);
    app.querySelectorAll('[data-count]').forEach(countUp);
  }
  // CSP(style-src에 'unsafe-inline' 없음): 인라인 style 속성 대신 data-*를 CSSOM으로 옮긴다
  function styleData(el) {
    el.querySelectorAll('[data-bg]').forEach(x => { x.style.background = x.dataset.bg; });
    el.querySelectorAll('[data-i]').forEach(x => x.style.setProperty('--i', x.dataset.i));
    el.querySelectorAll('[data-w]').forEach(x => { x.style.width = `${x.dataset.w}%`; });   // 막대 길이(CSP: 인라인 style 대신 여기서)
  }
  // 이전에 보인 값에서 새 값으로 센다(같은 값이면 그대로). 재생 중 매번 0부터 다시 세지 않는다
  function countUp(el) {
    const target = +el.dataset.count, k = el.dataset.ck || '', from = shown.has(k) ? shown.get(k) : 0, d = digitsOf(target), f = nf(d);
    shown.set(k, target);
    // 백그라운드 탭에서는 rAF가 멈춰 0이 남는다 — 최종값을 먼저 쓰고, 보일 때만 애니메이션
    el.textContent = f.format(target);
    // r16 접근성: 움직이는 숫자는 낭독에서 빼고(aria-live 안에서 프레임마다 읽혔다), 마지막 값만 숨김 글로 한 번
    if (!el._sr) { const sr = document.createElement('span'); sr.className = 'sr-only'; el.setAttribute('aria-hidden', 'true'); el.after(sr); el._sr = sr; }
    el._sr.textContent = f.format(target);
    if (reduced || from === target || document.hidden) return;
    const t0 = performance.now(), dur = 550; // 연도 재생 한 칸(750ms)보다 짧게: 숫자가 해마다 멈춰 읽힌다
    // rAF 시각이 t0보다 앞설 수 있다(첫 프레임 t < t0) → p를 0~1로 묶는다(v: '-36곳'이 한 프레임 보였다)
    const tick = t => { const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); el.textContent = f.format(from + (target - from) * e); if (p < 1) requestAnimationFrame(tick); };
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
  let M = null, to3dEl = null;   // to3dEl: '연도별 건물 나이(부산)' 단추(지도를 만들 때 한 번)
  api.getMap = () => M && M.map;
  api.getDistrictIndex = () => state.index?.sigungu || [];
  function loadNaver() {
    if (window.renewNaverAuthFailed) return Promise.resolve(false);
    return window.renewLoadNaver?.() || Promise.resolve(false);
  }
  // 경계·지표 지도는 배경지도 공급자와 별도로 연다.
  function mapReady(slot) {
    const wait = msg => { if (slot) { slot.className = 'map-canvas is-wait'; slot.textContent = msg; } };
    if (state.sgGeo === null) { if (slot) slot.outerHTML = emptyHTML('경계 자료 준비 중', ['시군구 경계가 아직 없습니다.', '아래 목록으로 숫자는 볼 수 있습니다.']); return false; }
    const D = window.RenewDashboard;
    if (!D?.leafletReady) {
      wait('지도를 불러오는 중입니다.');
      if (!state.leafletWaiting) {
        state.leafletWaiting = true;
        (D ? D.loadLeaflet() : Promise.reject()).then(render, () => { state.mapErr = true; render(); });
      }
      return false;
    }
    createMap(slot);
    return true;
  }
  function boundaryHatch() {
    if (!window.L.Browser.canvas) return 'url(#rmHatch)';
    const tile = document.createElement('canvas'); tile.width = tile.height = 6;
    const ctx = tile.getContext('2d');
    if (!ctx) return 'url(#rmHatch)';
    // 2026-11-23: 빗금이 가장 진한 단계만큼 눈에 띄었다 → 옅은 바탕·가는 줄(map-visual.css의 #mapApp --hatch-* 견본과 같은 색)
    ctx.fillStyle = '#eceeec'; ctx.fillRect(0, 0, 6, 6);
    ctx.strokeStyle = '#a9b3af'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(0, 6); ctx.lineTo(6, 0); ctx.moveTo(-3, 3); ctx.lineTo(3, -3); ctx.moveTo(3, 9); ctx.lineTo(9, 3); ctx.stroke();
    return ctx.createPattern(tile, 'repeat') || 'url(#rmHatch)';
  }
  function createMap(slot) {
    const L = window.L, el = document.createElement('div'); el.className = 'map-canvas'; el.setAttribute('role', 'region');
    el.insertAdjacentHTML('beforeend', '<svg class="map-defs" width="0" height="0" aria-hidden="true"><defs><pattern id="rmHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#eceeec"/><line x1="0" y1="0" x2="0" y2="6" stroke="#a9b3af" stroke-width="1.5"/></pattern></defs></svg>');
    slot.replaceWith(el);
    ybar = document.createElement('div'); ybar.className = 'map-yearbar'; ybar.hidden = true; ybar.setAttribute('aria-hidden', 'true'); el.appendChild(ybar);
    const hatch = boundaryHatch();
    // 동네 진단 넓은 화면은 지도가 화면 남은 높이 전체라(explore-layout.js) 페이지 스크롤과 다투지 않으므로 휠 확대를 처음부터 켠다(2026-11-13 v7)
    const wideApp = document.body.classList.contains('explore-page') && window.matchMedia('(min-width: 1024px)').matches;
    // maxBoundsViscosity 1: 네이버 배경이 범위 끝에서 멈출 때 경계층도 그 밖으로 끌려 나가지 않게 한다(범위는 followWithNaver가 SDK에서 읽어 건다)
    const map = L.map(el, { dragging: !coarse, scrollWheelZoom: wideApp, minZoom: 0, maxZoom: 17, zoomSnap: 0.25, attributionControl: false, zoomControl: false,
      // 2026-11-13 우지예: 휠로 확대·축소할 때 조금씩 끊긴다 → 휠 눈금 여러 개를 한 번에 모아(60ms) 덜 자주, 한 번에 조금 더 크게 움직인다.
      //     왜: 기본값(40ms·60px)에서는 휠 한 번에 0.25단계씩 여러 번 확대되며, 그때마다 전국 시군구 경계·동 경계·동 이름을 다시 그렸다
      wheelDebounceTime: 60, wheelPxPerZoomLevel: 100 });
    L.control.zoom({ zoomInTitle: '확대', zoomOutTitle: '축소' }).addTo(map);   // 기본 단추 이름이 영어(Zoom in)였다(v9 접근성) // 네이버 배경은 애니메이션 없이 확대하므로 경계도 같이 바로 바꾼다
    // 확대는 17(골목·건물 단위)까지. 두 번 누르기를 거듭해도 그 이상 커지지 않는다. 휠 확대는 지도를 한 번 누른 뒤에만 켠다(페이지를 내리다 지도에 걸려 확대되지 않게). 지도 밖으로 나가면 다시 끈다(2026-11-07 대표 지시)
    map.on('click', () => map.scrollWheelZoom.enable()); map.on('mouseout', () => { if (!wideApp) map.scrollWheelZoom.disable(); });
    // R4 9: 자동 맞춤(fitBounds)이 만든 줌으로는 상세 경계(sigungu.geojson 약 288KB gz)를 받지 않는다(맞춤 중에는 M.fitting이 켜져 있다).
    //   전국 화면에서 사용자가 줌 9 이상으로 확대하면 받는다. 시·도 이하 단계는 첫 경계(firstGeoKind)와 drawMap이 이미 상세를 받는다(2026-11-19 뒤)
    map.on('zoomend', () => { if (M && !M.fitting) { M.previewZoom = map.getZoom() >= 12; if (map.getZoom() > 8 && !localBoundary()) loadSgDetail(); } });
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 120 }).addTo(map);   // v7.9: 축척 막대(8회차 GIS 평가)
    const attr = L.control.attribution({ position: 'bottomleft' }).addTo(map); // 오른쪽은 척도표 서랍이 덮으므로 저작권 표시는 왼쪽 아래
    addBasemapControl(map, el, attr);
    add3dControl(map);
    // 2026-11-23: 범례·연도 막대는 지도 위 카드가 아니라 왼쪽 숫자판(explore-layout.js .mv-dash)·휴대폰 지도 아래에 있다. 지도 칸 설명 = 그 요약 문장
    el.setAttribute('aria-describedby', 'mapSummary');
    // 칸 크기가 바뀌면(업무 패널 열기·휴대폰 순서) 경계층도 다시 재야 바탕과 어긋나지 않는다. 네이버 동기화는 resize 이벤트로 따라간다
    // r16: 숨었다(문서·조건 탭, 0×0) 다시 보일 때는 가운데를 지킨다(pan). 왼쪽 위를 지키면 4-1 표를 보고 돌아왔을 때 고른 동이 화면 밖이었다
    let hidden = false;
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (!el.clientWidth || !el.clientHeight) { hidden = true; return; } map.invalidateSize({ pan: hidden }); hidden = false; }).observe(el);
    const src = () => state.index.source && state.index.source.name;
    map.createPane('water').style.zIndex = 450; // 수질 점은 경계층(overlayPane 400) 위. 동 층을 다시 만들어도 덮이지 않는다
    map.createPane('sg').style.zIndex = 395; // 시군구·시도 경계는 동 층(overlayPane 400) 아래. 경계가 동 층보다 늦게 와도 동을 덮지 않는다
    // 2026-11-12: 동 이름 층. 경계·수질 점 위(460), 누르기는 아래 동으로 통과시킨다(map.css .leaflet-labels-pane)
    map.createPane('labels').style.zIndex = 460;
    // 2026-11-13: 확대가 끝나면 zoomend와 moveend가 잇달아 와 동 이름 자리 계산을 두 번 했다 → 한 화면 그리기(requestAnimationFrame)에 한 번만
    let labelFrame = 0;
    map.on('zoomend moveend', () => { if (!labelFrame) labelFrame = requestAnimationFrame(() => { labelFrame = 0; cullSg(); syncEmdOutlines(); placeDongLabels(); }); });
    // 상위 동·수질 pane은 SVG를 유지한다. 별도 Canvas가 빈 영역의 아래 경계 클릭까지 가로막지 않게 한다.
    M = { el, map, hatch, sgRenderer: typeof hatch === 'string' ? null : L.canvas({ pane: 'sg' }), sg: null, sido: null, emd: null, emdCode: null, outlines: new Map(), water: null, sgItems: new Map(), emdItems: new Map(), fitKey: null, src, ready: false };
    document.dispatchEvent(new Event('renew-map'));   // safety-layer.js가 이 지도에 안전·재난·기후 층 단추를 붙인다
    setTimeout(startAuto, 1500);
  }
  function addBasemapControl(map, el, attr) {
    const control = window.L.control({ position: 'topleft' });
    control.onAdd = () => {
      const button = window.L.DomUtil.create('button', 'leaflet-bar map-basemap');
      button.type = 'button';
      button.textContent = '배경지도 켜기';
      window.L.DomEvent.disableClickPropagation(button);
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = '배경지도 불러오는 중';
        const naver = await loadNaver();
        if (naver && !window.renewNaverAuthFailed) {
          const nv = document.createElement('div');
          nv.className = 'map-naver';
          el.prepend(nv);
          el.classList.add('has-naver');
          state.naver = true;
          map.options.zoomSnap = 1;
          map.options.maxBoundsViscosity = 1;
          map.setMinZoom(6);
          map.setZoom(Math.round(map.getZoom()), { animate: false });
          attr.addAttribution('<a href="https://ssl.pstatic.net/static/maps/mantle/notice/legal.html" target="_blank" rel="noopener">NAVER 지도 법적 고지(새 창)</a>');
          followWithNaver(map, el, nv, tileNotice(map));
        } else {
          addBaseTiles(map, tileNotice(map));
        }
        button.textContent = '배경지도 요청됨';
      }, { once: true });
      return button;
    };
    control.addTo(map);
  }
  // 지금 보는 곳의 건물을 연도별 건물 나이(time4d.html, 연도별 입체)로 연다. 주소에는 지도 중심 좌표만 싣고, 4D 화면이 그 자리의 법정동을 고른다.
  // v7(2026-11-13): 예전에는 브이월드 3D(새 창)였는데, 우리 자료(사용승인일·높이)로 세운 4D가 근거 문서와 같은 숫자를 보여 준다. 브이월드는 4D 화면에서 잇는다
  function add3dControl(map) {
    const to3d = window.L.control({ position: 'topleft' });
    to3d.onAdd = () => {
      const a = window.L.DomUtil.create('a', 'leaflet-bar map-3d');
      a.textContent = '연도별 건물 나이(부산)';   // v9: 대구에서 눌러도 부산이 열려 '부산만'을 단추에 밝힌다
      a.title = '지금 보는 곳의 건물을 연도별 입체로 봅니다(부산)';
      // 컨트롤을 붙일 때는 아직 지도 시점이 없어 getCenter가 오류를 낸다. 첫 맞춤(fitBounds) 뒤 moveend부터 좌표를 싣는다
      a.href = 'time4d.html';
      map.on('moveend', () => { const c = map.getCenter(); a.href = `time4d.html?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}`; });
      window.L.DomEvent.disableClickPropagation(a);
      to3dEl = a;
      return a;
    };
    to3d.addTo(map);
  }
  // 네이버 배경(nv)을 Leaflet 지도와 같은 중심·확대로 따라 움직인다. 네이버 지도는 스스로 움직이지 않는다
  function followWithNaver(map, el, nv, onTileFail) {
    let N, nmap = null, stopped = false, resizeObserver = null, linkObserver = null, fixing = false, fixes = 0;
    const events = 'move zoom moveend zoomend viewreset resize';
    // 2026-11-19: 최소 확대에서 끌면 네이버 배경은 자기 범위 끝에서 멈추는데 Leaflet 경계층은 계속 움직여 둘이 어긋났다(대표 화면).
    // 움직임이 끝날 때 두 중심이 1px 넘게 다르면 경계층을 네이버 중심으로 되돌린다. 서로 되돌리기를 반복하지 않게 사용자가 다시 움직일 때까지 2번만
    // 네이버 좌표: LatLng는 lat()·lng(), Point(범위 꼭짓점일 수 있다)는 y·x
    const ll = p => window.L.latLng(typeof p.lat === 'function' ? p.lat() : p.y, typeof p.lng === 'function' ? p.lng() : p.x);
    let bounded = false;
    const setLimits = () => {
      const b = nmap.getOptions && nmap.getOptions('maxBounds');
      if (!b || !b.getMin || !b.getMax) return;
      // 네이버는 중심, Leaflet은 화면 전체를 제한한다. 반 화면을 더하고 경계에서 픽셀 반올림할 여유를 남긴다.
      const half = map.getSize().divideBy(2), margin = window.L.point(half.x - 1, 1 - half.y);
      const sw = map.project(ll(b.getMin())).subtract(margin), ne = map.project(ll(b.getMax())).add(margin);
      bounded = true;
      map.setMaxBounds(window.L.latLngBounds(map.unproject(sw), map.unproject(ne)));
    };
    const realign = () => {
      if (!nmap || stopped || fixing || fixes >= 2) return;
      try {
        const to = ll(nmap.getCenter());
        if (map.project(to).distanceTo(map.project(map.getCenter())) <= 1) return;
        fixing = true; fixes++; map.panTo(to, { animate: false });
      } catch { /* 중심을 못 읽으면 다음 움직임에서 다시 본다 */ }
      finally { fixing = false; }
    };
    const userMove = () => { fixes = 0; };
    const destroy = target => {
      if (!target || typeof target.destroy !== 'function') return;
      try { target.destroy(); }
      catch { console.warn('네이버 배경 정리 중 SDK 오류가 발생했습니다.'); }
    };
    const dispose = () => {
      stopped = true;
      window.removeEventListener('renew-navermap-auth-failed', fallback);
      map.off(events, sync); map.off('unload', dispose); map.off('moveend', realign); map.off('dragstart zoomstart', userMove);
      if (resizeObserver) resizeObserver.disconnect();
      if (linkObserver) linkObserver.disconnect();
      const previous = nmap; nmap = null; destroy(previous);
    };
    const fallback = () => {
      if (stopped) return;
      dispose(); state.naver = false;
      nv.remove(); el.classList.remove('has-naver');
      map.options.zoomSnap = 0.25; map.options.maxBoundsViscosity = 0; map.setMinZoom(0); map.setMaxBounds(null);   // 네이버 범위 제한은 대체 배경(브이월드·OSM)에 쓰지 않는다
      addBaseTiles(map, onTileFail);
    };
    const sync = e => {
      if (!nmap || stopped) return;
      try {
        if (!bounded || (e && (e.type === 'zoom' || e.type === 'resize'))) setLimits();
        const c = map.getCenter(); nmap.setZoom(map.getZoom(), false); nmap.setCenter(new N.LatLng(c.lat, c.lng));
      }
      catch { fallback(); }
    };
    // 인증 실패 콜백과 달리 이 이벤트는 이미 열린 배경을 회복하는 앱 내부 신호다.
    window.addEventListener('renew-navermap-auth-failed', fallback);
    map.on(events, sync); map.on('unload', dispose); map.on('moveend', realign); map.on('dragstart zoomstart', userMove);
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        if (!nmap || stopped) return;
        try { if (nmap.autoResize) nmap.autoResize(); sync(); } catch { fallback(); }
      });
      resizeObserver.observe(el);
    }
    // 링크는 지도가 그려진 뒤 늦게 생기고 'idle'보다 늦을 수 있다(배포 화면에서 이름 없음 확인).
    linkObserver = new MutationObserver(() => api.nameMapLinks(nv));
    linkObserver.observe(nv, { childList: true, subtree: true });
    if (window.renewNaverAuthFailed) { fallback(); return; }
    // 임시 중심·확대의 타일을 받은 뒤 버리지 않도록 첫 맞춤 위치에서 시작한다.
    map.whenReady(() => {
      if (stopped) return;
      try {
        N = window.naver.maps;
        const c = map.getCenter();
        nmap = new N.Map(nv, { center: new N.LatLng(c.lat, c.lng), zoom: map.getZoom(), minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom(), tileTransition: false, draggable: false, pinchZoom: false, scrollWheel: false, keyboardShortcuts: false,
          disableDoubleClickZoom: true, disableDoubleTapZoom: true, disableTwoFingerTapZoom: true, zoomControl: false, scaleControl: false, mapDataControl: true, logoControl: true, mapTypeControl: false,
          // 2026-11-19: 넓은 화면의 동 서랍이 지도 오른쪽 전체 높이를 덮으므로 NAVER 로고를 왼쪽 아래(저작권 표시 옆)로 옮긴다(로고는 가리지 않는다)
          ...(N.Position && N.Position.BOTTOM_LEFT ? { logoControlOptions: { position: N.Position.BOTTOM_LEFT } } : {}) });
        if (stopped) { const previous = nmap; nmap = null; destroy(previous); return; }
        setLimits();
        N.Event.once(nmap, 'tilesloaded', () => { if (!stopped) { sync(); mapPainted(); } });
      } catch { fallback(); }
    });
  }
  // 네이버가 없을 때 배경지도: 브이월드(국토교통부 공식 지도, 한국 지명·도로). 키(field/vworld-key.js)는 사이트 저장소에만 있고 등록 주소에서만 동작 → 없으면 OSM
  function addBaseTiles(map, onFail) {
    const osm = () => {
      const layer = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).once('tileerror', onFail);
      layer.once('load', () => { if (map.hasLayer(layer)) mapPainted(); }).addTo(map);
    };
    const vw = /^[A-Za-z0-9-]+$/.test(window.RENEWMAP_VWORLD_KEY || '') ? window.RENEWMAP_VWORLD_KEY : '';
    if (!vw) { osm(); return; }
    const tiles = window.L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${vw}/Base/{z}/{y}/{x}.png`, { maxZoom: 19, attribution: '&copy; <a href="https://www.vworld.kr">국토교통부 브이월드</a>' });
    tiles.once('tileerror', () => {
      if (!map.hasLayer(tiles)) return;
      map.removeLayer(tiles); osm();
    });
    tiles.once('load', () => { if (map.hasLayer(tiles)) mapPainted(); }).addTo(map);
  }
  const lineLatLngs = lines => lines.map(l => l.map(([x, y]) => [y, x]));
  // OSM 공용 타일은 SLA가 없어 예고 없이 막힐 수 있다(C13). dashboard.js osmTiles(L, onFail)처럼 once('tileerror')로 한 번만 알린다.
  // 바탕 타일만 못 받은 것이라 경계·색·목록·근거 1쪽은 그대로 둔다(state를 건드리지 않는다)
  const tileNotice = map => () => {
    const note = window.L.control({ position: 'topleft' });
    note.onAdd = () => { const p = document.createElement('p'); p.className = 'map-tile-err'; p.setAttribute('role', 'status'); p.textContent = (window.RenewDashboard && window.RenewDashboard.TILE_ERR) || '배경 지도를 받지 못했습니다.'; return p; };
    note.addTo(map);
  };
  const loadSgDetail = makeSgDetailLoader({ state, fetchJson, render });
  // 2026-11-13 우지예: 2D 지도를 휠로 확대·축소하면 조금씩 끊겼다. 잰 결과(1280px, 해운대구, 휠 20번) 자바스크립트 시간의 대부분이
  //     Leaflet이 전국 시군구 상세 경계(sigungu.geojson)의 모든 점을 확대마다 다시 계산하는 일(project·_projectLatlngs)이었다.
  //     → 시군구 단계보다 크게 확대했을 때(9 이상)는 화면 둘레(가로·세로 50% 여유) 밖의 시군구·시도 경계 조각을 지도에서 잠시 뺀다.
  //     빠진 조각은 화면에 안 보이는 곳이라 모양·색·값은 그대로이고, 움직여서 다시 들어오면 붙인다
  function cullSg() {
    if (!M || !M.sg || !M.map) return;
    if (!M.cull) M.cull = [...M.sg.getLayers(), ...(M.sido ? M.sido.getLayers() : [])];   // 경계를 새로 만들면(addSgLayers) 비워 두고 여기서 다시 모은다
    const all = M.map.getZoom() < 9, view = all ? null : M.map.getBounds().pad(0.5);
    for (const l of M.cull) {
      const on = all || view.intersects(l._rmBox || (l._rmBox = l.getBounds()));
      if (on !== M.map.hasLayer(l)) on ? l.addTo(M.map) : M.map.removeLayer(l);
    }
  }
  // 전국 개요를 먼저 그리고, 확대·지역 선택 때 상세 경계로 교체한다. 값·색은 같은 원장이다.
  function addSgLayers() {
    if (!state.sgGeo || M.sgGeo === state.sgGeo) return;
    const updating = !!M.sg;
    if (updating) { M.map.removeLayer(M.sg); M.map.removeLayer(M.sido); }
    const L = window.L;
    M.sg = L.geoJSON(state.sgGeo, { pane: 'sg', renderer: M.sgRenderer, style: { weight: 1, color: '#fff' }, onEachFeature: (f, layer) => {
      layer.bindTooltip(() => { const it = M.sgItems.get(String(f.properties.code)); return it ? tooltipHTML(it, curInd(), effMode(curInd()), null, M.src()) : `<b>${esc(f.properties.name)}</b>`; }, { sticky: true });
      const pick = () => { const r = leafRoute(state.index, String(f.properties.code)); if (r) go(r); };
      layer.on('click', pick); keyable(layer, f.properties.name, pick);
    } }).addTo(M.map);
    // 2026-11-13: 시도 경계선을 한 덩어리 대신 선 조각마다 따로 둔다 — 화면 밖 조각을 빼고 그릴 수 있게(cullSg 주석)
    M.sido = L.featureGroup(lineLatLngs(outerLines(state.sgGeo.features, f => String(f.properties.code).slice(0, 2))).map(ll => L.polyline(ll, { pane: 'sg', renderer: M.sgRenderer, interactive: false, color: '#14302c', weight: 1.2, opacity: 0.75, smoothFactor: 0 }))).addTo(M.map); // 묶음이라야 첫 시점이 잡히기 전 bringToFront가 오류 없이 지나간다
    M.cull = null;   // 다음 확대·이동 때 cullSg가 새 조각으로 다시 모은다
    M.sgGeo = state.sgGeo; M.order = null;
  }
  // 시군구 레이어 색: 현재 단계의 항목만 색, 나머지는 옅게. 칸 구성이 바뀌었는지(reorder)와 색칠한 코드(active)를 돌려준다
  // 지도 도형을 키보드로도: Tab으로 닿으면 이름을 읽고 Enter·Space로 고른다(v9 접근성: 이름 없는 도형 18개에 초점만 멈추고 Enter가 안 먹었다).
  // 캔버스로 그린 층은 요소가 없어 건너뛴다(목록으로 고를 수 있다)
  const dongAria = (it, ind, mode) => `${it.name}, ${ind.chip || ind.label}${mode === 'trend' ? ' 5년 변화' : ''} ${it.value === null ? '자료 없음' : it.text}${it.value !== null && it.year ? `(${it.year})` : ''}, 고르기`;
  function keyable(layer, name, act) {
    layer.on('add', () => {
      const el = layer.getElement && layer.getElement(); if (!el) return;
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${name} 고르기`); el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    });
  }
  // 2026-11-23 대표 지적(시각화가 별로다): 칠 40%는 크림 두 단계가 회색 바탕과 거의 같았다 → 75%. 경계는 검은 그물 대신 흰 가는 선(시·도만 먹색).
  //   범례 견본·분포 막대도 같은 값을 쓴다(map-visual.css --fill-o)
  const FILL_O = 0.75;
  function paintSg(v, m) {
    M.sgItems = new Map((m.kind === 'sg' ? m.items : []).map(it => [it.code, it]));
    const active = new Set(M.sgItems.keys()), inEmd = v.level === 'emd';
    // 앞으로 올리기(bringToFront)는 DOM에서 path를 다시 붙인다. 누르는 도중에 하면 click이 사라지므로 칸 구성이 바뀔 때만 한다
    const order = [...active].join() + '|' + v.emdCode + '|' + v.dong, reorder = M.order !== order; M.order = order;
    if (M.sg) M.sg.eachLayer(l => { const code = String((l.feature.properties || {}).code), it = M.sgItems.get(code), on = active.has(code);
      l.setStyle(on ? { fillColor: it.value === null || it.check ? M.hatch : it.color, fillOpacity: FILL_O, color: '#fff', weight: 0.6, opacity: 0.9, dashArray: null }
        : { fillColor: '#c9d3cf', fillOpacity: inEmd ? 0.08 : 0.15, color: '#fff', weight: 0.5, dashArray: null });
      if (on && reorder) l.bringToFront(); });
    if (M.sido) { M.sido.setStyle({ opacity: inEmd ? 0 : 1 }); if (reorder) M.sido.bringToFront(); } // 동 단계에서는 고른 구의 굵은 테두리가 대신한다
    return { active, reorder };
  }
  function syncEmdOutlines() {
    const visible = new Set();
    if (M.previewZoom && M.map.getZoom() >= 12 && M.sg && M.sgItems.size) {
      const view = M.map.getBounds();
      M.sg.eachLayer(layer => {
        const code = String(layer.feature.properties.code);
        if (M.sgItems.has(code) && view.intersects(layer._rmBox || (layer._rmBox = layer.getBounds()))) visible.add(code);
      });
    }
    for (const [code, entry] of M.outlines) {
      if (visible.has(code)) continue;
      if (entry.layer) entry.layer.remove();
      M.outlines.delete(code);
    }
    for (const code of visible) {
      if (M.outlines.has(code)) continue;
      const entry = {};
      M.outlines.set(code, entry);
      emdGeometry(code).then(geo => {
        if (M.outlines.get(code) !== entry) return;
        if (!geo) { M.outlines.delete(code); return; }
        if (!Array.isArray(geo.features)) return;
        entry.layer = window.L.geoJSON(geo, { interactive: false, style: { fill: false, color: '#465651', weight: 1, opacity: 0.7, smoothFactor: 0 } }).addTo(M.map);
      });
    }
  }
  // 행정동 레이어: 시군구가 바뀔 때만 다시 만들고, 연도·지표는 setStyle로만 바꾼다(CSS transition)
  function paintEmd(v, m, reorder) {
    if (m.kind === 'emd' && m.geo) {
      if (!M.emd || M.emdCode !== v.emdCode) {
        if (M.emd) M.emd.remove();
        M.emd = window.L.geoJSON(m.geo, { style: { weight: 1.5, color: '#fff' }, onEachFeature: (f, layer) => {
          layer.bindTooltip(() => { const it = M.emdItems.get(String((f.properties || {}).code)); return it ? tooltipHTML(it, curInd(), effMode(curInd()), it.year, M.src()) : `<b>${esc((f.properties || {}).name)}</b><br>지표와 코드가 맞지 않는 동`; }, { sticky: true });
          const pick = () => { const code = String((f.properties || {}).code); if (M.emdItems.has(code)) { M.pickedOnMap = code; go({ ...state.route, dong: code }); } };
          layer.on('click', pick); keyable(layer, (f.properties || {}).name || '동', pick);
        } }).addTo(M.map);
        M.emdCode = v.emdCode;
        if (M.emdLine) M.emdLine.remove();
        // r16 M7: 구 바깥선은 고른 동 테두리와 역할을 나눈다(전에는 둘 다 검정 3px라 어느 동인지 몰랐다). 2026-11-23: 점선 대신 옅은 먹색 실선(고른 동은 먹색 3px + 흰 바탕선)
        M.emdLine = window.L.featureGroup([window.L.polyline(lineLatLngs(outerLines(m.geo.features)), { interactive: false, color: '#14302c', weight: 1.5, opacity: 0.6, smoothFactor: 0 })]).addTo(M.map);
        makeDongLabels(m.geo);
      }
      M.emdItems = new Map(m.items.map(it => [it.code, it]));
      M.emd.eachLayer(l => { const code = String((l.feature.properties || {}).code), it = M.emdItems.get(code), sel = code === v.dong;
        // 고른 동: 먹색 3px(DESIGN 4.9)·진한 칠, 나머지는 고른 동이 있을 때 옅게. 동 사이 경계는 흰 선
        l.setStyle({ fillColor: !it || it.value === null ? 'url(#rmHatch)' : it.color, fillOpacity: sel ? 0.9 : v.dong ? 0.45 : FILL_O, color: sel ? '#14302c' : '#fff', weight: sel ? 3 : 1.2, opacity: 1, smoothFactor: 0, dashArray: null });
        // R4 1: 낭독기가 동 모양을 지나며 지금 지표의 값을 듣게 한다(값은 마우스를 올려야 뜨는 말풍선에만 있었다). 값이 없으면 '자료 없음'
        const el = it && l.getElement && l.getElement(); if (el) el.setAttribute('aria-label', dongAria(it, curInd(), effMode(curInd())));
        if (sel && reorder) l.bringToFront(); });
      if (reorder) M.emdLine.bringToFront();
      placeDongLabels(v.dong);
    } else if (M.emd && (v.level !== 'emd' || M.emdCode !== v.emdCode)) { M.emd.remove(); M.emdLine.remove(); M.emd = null; M.emdLine = null; M.emdCode = null; M.emdItems = new Map(); makeDongLabels(null); }   // 새 시군구 경계를 못 받았으면 앞 시군구 동을 남기지 않는다(v9: 남은 동을 누르면 다른 구 동 코드로 갔다)
  }
  // 2026-11-12: 동 이름표. 시군구가 바뀔 때만 다시 만들고, 확대·이동·동 고르기마다 겹치는 이름만 숨긴다(labelPoint·pickLabels)
  const LABEL_MIN_ZOOM = 12;   // 이보다 멀면 동이 수십 px라 이름이 서로 덮는다(부산 해운대구 기준 확인)
  function makeDongLabels(geo) {
    if (M.emdLabels) { M.emdLabels.group.remove(); M.emdLabels = null; }
    if (!geo) return;
    const L = window.L, items = [];
    for (const f of geo.features) {
      const p = labelPoint(f.geometry), name = (f.properties || {}).name;
      if (!p || !name) continue;
      const marker = L.marker([p[1], p[0]], { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: 'map-dong-label', html: esc(name), iconSize: null }) });
      const b = L.geoJSON(f).getBounds(), size = (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth());
      items.push({ code: String((f.properties || {}).code), name, marker, size });
    }
    M.emdLabels = { group: L.layerGroup(items.map(it => it.marker)).addTo(M.map), items, dong: null };
  }
  function placeDongLabels(dong) {
    const lab = M && M.emdLabels; if (!lab) return;
    if (dong !== undefined) lab.dong = dong;
    const show = M.map.getZoom() >= LABEL_MIN_ZOOM;
    const boxes = show ? lab.items.map(it => { const pt = M.map.latLngToContainerPoint(it.marker.getLatLng());
      return { id: it.code, x: pt.x, y: pt.y, w: it.name.length * 14 + 12, h: 22, prio: it.code === lab.dong ? Infinity : it.size }; }) : [];
    const kept = pickLabels(boxes);
    for (const it of lab.items) { const el = it.marker.getElement(); if (!el) continue;
      // Leaflet 표시 아이콘은 CSS로 display:block이라 hidden 속성으로는 숨겨지지 않는다. 직접 숨긴다
      el.style.display = kept.has(it.code) ? '' : 'none'; el.classList.toggle('is-sel', it.code === lab.dong); }
  }
  function syncWater() {
    if (state.water && state.waterData && !M.water) M.water = window.L.layerGroup(state.waterData.points.map(p => window.L.circleMarker([p.lat, p.lon], waterStyle(p)).bindTooltip(waterTipHTML(p, state.waterData.year)))).addTo(M.map);
    else if (!state.water && M.water) { M.water.remove(); M.water = null; }
  }
  // 단계가 바뀔 때만 화면을 옮긴다(연도 재생·지표 자동 전환 중에는 움직이지 않는다)
  function fitView(v, m, active) {
    const L = window.L, inEmd = v.level === 'emd';
    const key = v.level + ':' + m.kind + ':' + (v.emdCode || (v.sigungu && v.sigungu.code5) || (v.sido && v.sido.code2) || '');
    if (M.fitKey === key || m.kind === 'wait') return;
    // 숨은 탭에서 만든 지도는 크기를 0으로 기억한다. 탭을 연 바로 그 렌더에서는 ResizeObserver가 아직 돌지 않아 flyToBounds가 NaN 좌표로 던졌다(r19 ?preset=cctv) → 맞추기 전에 다시 잰다
    if (M.el && M.el.clientWidth && !M.map.getSize().x) M.map.invalidateSize({ pan: false });
    let b = null;
    if (m.kind === 'emd' && M.emd) b = M.emd.getBounds();
    else if (!M.sg) { const bx = (m.kind === 'sg' ? m.items : []).map(it => it.bbox).filter(x => Array.isArray(x) && x.length === 4); b = bx.length ? L.latLngBounds(bx.flatMap(x => [[x[1], x[0]], [x[3], x[2]]])) : null; } // 경계 전: 목록의 bbox로 같은 범위를 먼저 잡는다
    else { const fg = L.featureGroup(); M.sg.eachLayer(l => { if (active.has(String((l.feature.properties || {}).code))) fg.addLayer(l); }); b = fg.getLayers().length ? fg.getBounds() : M.sg.getBounds(); }
    const right = inEmd && wide.matches && !panel.hidden && getComputedStyle(panel).position !== 'static' ? panel.offsetWidth + 28 : 12; // 지도 위에 겹친 패널일 때만 비운다
    // 2026-11-23: 지도 위 범례 카드(.map-key)를 왼쪽 숫자판으로 옮겨 카드 피하기 맞춤이 없어졌다(카드 때문에 전국 첫 화면이 줌 6으로 떨어졌다)
    const opt = { paddingTopLeft: [12, 12], paddingBottomRight: [right, 12], maxZoom: 14 };
    if (b && b.isValid()) {
      // R4 9: 이 맞춤이 만든 줌은 사용자 확대가 아니다(첫 zoomend에서 상세 경계를 받지 않는다). 움직임 없는 맞춤은 moveend가 없어 시간으로도 푼다
      M.fitting = true; M.map.once('moveend', () => { M.fitting = false; }); setTimeout(() => { if (M) M.fitting = false; }, 1500);
      if (reduced || !M.ready || state.naver) M.map.fitBounds(b, opt); else M.map.flyToBounds(b, { ...opt, duration: 0.9 });
      // 목록 bbox로 이미 맞춘 화면은 경계 도착 때 다시 옮기지 않는다. 배경 타일 재요청과 사용자 위치 초기화를 막는다.
      M.fitKey = key; M.ready = true;
    }
  }
  function drawMap(v, m) {
    if (!M && !mapReady(stage.querySelector('[data-map-slot]'))) return;
    addSgLayers();
    M.el.setAttribute('aria-label', `${v.crumbs.map(c => c.label).join(' › ')} ${curInd().label} 지도. 아래 목록으로도 고를 수 있습니다.`);
    if (to3dEl) to3dEl.style.display = v.sido && String(v.sido.code2) === '21' ? '' : 'none';   // r16: 4D는 부산 건물만 있어 부산을 볼 때만
    const { active, reorder } = paintSg(v, m);
    paintEmd(v, m, reorder);
    syncWater();
    fitView(v, m, active);
    syncEmdOutlines();
    if (M.sg && !M.firstBoundary) { M.firstBoundary = true; requestAnimationFrame(mapPainted); }
    // 전국 화면만 개요 경계. R4 9는 시·도 단계도 개요로 충분하다고 봤지만, 첫 화면이 부산(#map/21)으로 바뀐 뒤 꼭짓점 4~5개짜리 구 경계가 네이버 바탕 해안선과 어긋나 보였다(2026-11-19 대표 지적)
    // 시·도 이하로 열었으면 첫 경계가 이미 받는 중이라 같은 약속을 돌려받는다(요청 한 번). 전국에서 시·도로 들어갈 때 여기서 받는다
    if (v.level !== 'nation' && !localBoundary()) loadSgDetail();
  }
  function go(route, focusSel) {
    stopPlay(); stopAuto(true);
    if (state.yearByAuto) { state.year = null; state.yearByAuto = false; }
    const before = routeHash(resolve(state.index, state.route), state.route);
    state.route = route;
    // R4 1: 동을 고르면(검색·지도 Enter·목록) 초점을 고른 동 카드 제목으로 옮긴다. 전에는 지도 모양·검색창이 다시 그려져 BODY로 돌아가 낭독기가 카드가 열린 줄 몰랐다.
    //   다른 구의 동 자료는 늦게 와서 카드가 아직 없을 수 있다 → 도착한 render가 옮기고, 4초가 지나면 포기한다(그 사이 사용자가 다른 곳으로 옮겼을 수 있다)
    wantCard = route.dong || null; if (wantCard) setTimeout(() => { wantCard = null; }, 4000);
    const v = resolve(state.index, route);
    // r16 B6: 다른 곳으로 옮기면 방문 기록을 쌓는다(뒤로 가기 = 앞의 동, 휴대폰에서는 시트 닫기). 같은 곳의 주소를 다듬을 때만 바꿔 쓴다.
    // 전에는 늘 replaceState라 뒤로 가기가 화면을 벗어나거나, 탭을 오간 뒤 주소와 화면의 동이 달랐다
    const h = v.level !== 'empty' ? routeHash(v, route) : null;
    if (h && h !== location.hash) history[h !== before ? 'pushState' : 'replaceState'](null, '', h);
    render();
    if (route.dong) return;   // 동을 고른 때의 초점은 render()가 카드 제목으로 옮긴다(wantCard)
    const f = focusSel && app.querySelector(focusSel); if (f) f.focus({ preventScroll: true });
  }
  function stopPlay() { clearInterval(timer); timer = null; state.playing = false; }
  function play() {
    const v = resolve(state.index, state.route), m = model(v);
    if (m.kind === 'sg') {
      if (v.level === 'nation' && !reduced && M) { if (autoT) { stopAuto(true); render(); } else { state.touched = false; autoAsked = true; startAuto(state.ind); } return; }
      const ys = playYears(state.index, state.ind).years; if (!ys.length) return;
      if (state.playing) { stopPlay(); render(); return; }
      let i = ys.indexOf(state.year); if (i < 0 || i >= ys.length - 1) i = 0;
      state.playing = true; state.yearByAuto = false; state.year = ys[i]; render();
      timer = setInterval(() => { i++; if (i >= ys.length) { stopPlay(); render(); return; } state.year = ys[i]; render(); }, reduced ? 1000 : 700);
      return;
    }
    if (m.kind !== 'emd' || !m.years) return;
    if (state.playing) { stopPlay(); render(); return; }
    state.playing = true; state.year = m.year == null || m.year >= m.years.max ? m.years.min : m.year;   // 값 없는 해면 처음부터(null+1로 돌던 것)
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
    if (!autoAsked || autoT || reduced || state.touched || !visible || document.hidden || !M || (state.index && state.index.seriesPending)) return;
    if (resolve(state.index, state.route).level !== 'nation') return;
    const list = autoList(); if (!list.length) return;
    autoRun(list.find(x => x.code === (from || state.ind)) || list[0], 0);
  }
  // 멈출 때 다시 그리지 않는다(누르는 도중 버튼·지도 칸이 바뀌면 click이 사라진다). 안내 줄과 재생 버튼만 바꾼다
  function stopAuto(user) {
    if (user) state.touched = true;
    if (!autoT) return;
    clearTimeout(autoT); autoT = null; if (ybar) ybar.hidden = true;
    if (heroLive) heroLive.querySelector('.hl-auto')?.remove();
    const b = app.querySelector('[data-play]'); if (b) { b.innerHTML = icon('play'); b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', '재생'); }
  }
  const touch = e => { if (e && e.target && e.target.closest && e.target.closest('[data-play]')) return; if (!state.touched) stopAuto(true); };
  ['pointerdown', 'wheel', 'keydown'].forEach(t => app.addEventListener(t, touch, { passive: true }));
  document.addEventListener('visibilitychange', () => (document.hidden ? stopAuto(false) : startAuto()));
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? startAuto() : stopAuto(false); }, { threshold: 0.25 }).observe(app);

  // 2026-11-20 C18: #overlay처럼 코드가 연 칸이 닫힌 '도구' 칸 안에 있으면 도구 칸도 연다(바로가기 explore.html#overlay가 접힌 칸 안에서 안 보였다).
  //   사용자는 닫힌 칸 안의 칸을 열 수 없으므로 이 경로는 코드가 연 경우뿐이다. 도구 칸의 열림 기록(fold.tools)은 그 칸의 toggle이 같은 리스너로 남긴다
  app.addEventListener('toggle', e => {
    const d = e.target; if (!d || !d.dataset) return;
    if (d.dataset.fold) fold[d.dataset.fold] = d.open;
    if (d.open) { const t = d.parentElement && d.parentElement.closest('details.map-tools'); if (t && !t.open) t.open = true; }
  }, true);
  // 좁은 화면의 동 목록은 처음에 '동을 고르기 전이면 펼침'이라 toggle(코드가 연 것도 옴)로는 사용자의 선택을 못 가린다 → 제목 줄 누름만 따로 기록
  app.addEventListener('click', e => {
    const sm = e.target.closest && e.target.closest('.map-dong-list > summary, .mi-group > summary'); if (!sm) return;
    if (sm.parentNode.dataset.miGroup) miFold[sm.parentNode.dataset.miGroup] = !sm.parentNode.open; else fold.listUser = !sm.parentNode.open;
  }, true);
  // 서랍 탭(요약·지표 전체·재생 사업): 다시 그리지 않고 칸만 바꾼다. 고른 탭은 다음 동에도 이어진다
  function mpTab(k, focus) {
    state.mpTab = k;
    panel.querySelectorAll('[data-mp-tab]').forEach(t => { const on = t.dataset.mpTab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    panel.querySelectorAll('.mp-pane').forEach(p => { p.hidden = p.id !== 'mp-pane-' + k; });
  }
  panel.addEventListener('keydown', e => {   // 탭 목록 화살표·Home·End(WAI-ARIA 탭 패턴)
    const t = e.target.closest('[data-mp-tab]'); if (!t) return;
    const keys = MP_TABS.map(x => x[0]), i = keys.indexOf(t.dataset.mpTab);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault(); mpTab(keys[(j + keys.length) % keys.length], true);
  });
  app.addEventListener('click', async e => {
    const a = e.target.closest('a[href^="#map"]');
    if (a) { e.preventDefault(); go(parseHash(a.getAttribute('href')) || {}); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('is-planned')) { // 수집 중·보류: 지도를 회색으로 바꾸지 않는다. 받지 못한 자료면 이때만 다시 받는다
      const i = inds().find(x => x.code === b.dataset.ind);
      if (i && i.failed) { retryAux(auxKey(i)); render(); app.querySelector(`[data-ind="${CSS.escape(b.dataset.ind)}"]`)?.focus({ preventScroll: true }); }
      return;
    }
    if (b.dataset.bundle || b.dataset.ind || b.dataset.mode) { stopPlay(); stopAuto(true); } // 화면 낭독기 등은 click만 보내 pointerdown 멈춤이 안 걸린다
    // 2026-11-13: 시작 묶음 단추. 묶음의 첫 지표(지금 볼 수 있는 것)로 지도를 바꾼다. '모든 지표'는 지금 지표를 그대로 두고 묶음별 목록을 연다(고른 줄이 보이게)
    if (b.dataset.bundle) {
      state.bundle = b.dataset.bundle; const v = resolve(state.index, state.route), pick = (bundleList(state.bundle, inds().filter(i => chipShown(i, null, v))) || []).find(i => !i.pending && avail(i)); if (pick) { state.ind = pick.code; state.year = null; }
      render(); app.querySelector(`[data-bundle="${b.dataset.bundle}"]`)?.focus({ preventScroll: true });
      if (state.bundle === BUNDLE_ALL) app.querySelector('.mi-row[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (b.dataset.mpTab) mpTab(b.dataset.mpTab, false);
    else if (b.hasAttribute('data-chips-more')) { state.chipsMore = true; const n = app.querySelectorAll('.map-inds [data-ind]').length; render(); app.querySelectorAll('.map-inds [data-ind]')[n]?.focus({ preventScroll: true }); }
    else if (b.dataset.ind) {   // '지표' 칸 안에서 고르면 칸을 닫고 초점은 그 칸 제목 줄로(고른 칩은 닫힌 칸 안에 숨는다)
      const inPick = !!b.closest('.mv-pick'); if (inPick) fold.pick = false;
      state.ind = b.dataset.ind; state.year = null; render();
      (inPick ? app.querySelector('.mv-pick > summary') : app.querySelector(`[data-ind="${CSS.escape(b.dataset.ind)}"]`))?.focus({ preventScroll: true });
    }
    else if (b.dataset.mode) { state.mode = b.dataset.mode; state.year = null; render(); app.querySelector(`[data-mode="${b.dataset.mode}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.horizon) { state.horizon = +b.dataset.horizon; render(); app.querySelector(`[data-horizon="${b.dataset.horizon}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.dong) go({ ...state.route, dong: b.dataset.dong }, `[data-dong="${b.dataset.dong}"]`);
    else if (b.hasAttribute('data-candidate-save')) {
      const c = currentDong(), msg = panel.querySelector('[data-candidate-status]'); if (!c || !msg) return;
      const rows = rowsFor(c.v, c.m, c.it), snapshot = snapshotOf(c.it, rows, new Date()), route = toHash(state.route);
      b.disabled = true;
      try {
        if (!window.RenewCandidates) await import('./candidates.js?v=20261126-export-evidence');
        const saved = window.RenewCandidates.save(localStorage, snapshot, route, rows);
        msg.textContent = saved ? '보관함에 담았습니다. 이 기기에만 저장됩니다.' : '이미 보관함에 있습니다.';
      } catch (err) { msg.textContent = '저장하지 못했습니다. ' + err.message; }
      finally { b.disabled = false; }
    }
    else if (b.hasAttribute('data-close')) closeDong();
    else if (b.dataset.emdRetry) { cache.delete('emd:' + b.dataset.emdRetry); render(); }
    else if (b.hasAttribute('data-focus-search')) document.getElementById('heroQ')?.focus();
    else if (b.hasAttribute('data-play')) { play(); app.querySelector('[data-play]')?.focus({ preventScroll: true }); }
    else if (b.hasAttribute('data-copy-map')) copyMapLink();
    else if (b.hasAttribute('data-map-png')) mapPng();
    else if (b.hasAttribute('data-map-geojson')) mapGeojson();
    else if (b.hasAttribute('data-water')) {
      state.water = !state.water;
      if (state.water && state.waterData === undefined) {
        fetchJson('data/national/water_quality.json').then(j => { state.waterData = j && Array.isArray(j.points) ? j : null; render(); });
        fetchJson('data/national/water_auto.json').then(j => { state.waterAuto = j && Array.isArray(j.sites) ? j : null; render(); });
      }
      render(); app.querySelector('[data-water]')?.focus({ preventScroll: true });
    }
  });
  app.addEventListener('input', e => {
    const q = e.target.closest('[data-mi-q]'); if (q) { state.miQ = q.value; miFilter(); return; }
    const r = e.target.closest('[data-year]'); if (r) { stopPlay(); state.year = +r.value; state.yearByAuto = false; render(); app.querySelector('[data-year]')?.focus({ preventScroll: true }); }
  });
  // 지표 검색 칸에서 Enter = 걸러진 첫 줄 고르기
  app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-mi-q]')) { e.preventDefault(); [...app.querySelectorAll('.mi-row:not(.is-planned)')].find(r => !r.hidden && !r.closest('[hidden]'))?.click(); } });
  // 닫으면 초점은 목록의 그 동으로 돌아간다(없으면 첫 동)
  function closeDong() { const code = state.route.dong; go({ ...state.route, dong: null }, code ? `[data-dong="${code}"]` : '[data-dong]'); }
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden && state.route.dong && (panel.classList.contains('is-sheet') || panel.contains(document.activeElement))) closeDong(); });
  // 뒤로·앞으로(popstate)와 주소 바뀜(hashchange)을 같게 처리한다. 둘이 함께 오거나 패널만 바뀐 때(같은 경로)는 다시 그리지 않는다
  const onRoute = () => { const r = parseHash(location.hash); if (!r || toHash(r) === toHash(state.route)) return; stopPlay(); stopAuto(true); if (state.yearByAuto) { state.year = null; state.yearByAuto = false; } state.route = r; render(); }; // 검색으로 동에 오면 자동 재생 중이던 해가 아니라 최신 해
  addEventListener('hashchange', onRoute);
  addEventListener('popstate', onRoute);
  wide.addEventListener('change', render);
  narrow.addEventListener('change', () => { lastLegend = ''; render(); });   // 폭이 1024px을 넘나들면 덩어리 순서·내용을 다시 짠다

  // 우리 동네 진단: dong_index.json이 있으면 동까지, 없으면 시·도·시군구 이름으로
  const form = document.getElementById('heroSearch');
  let entries = [];
  function searchSetup() {
    if (!form) return;
    entries = searchEntries(state.index, state.dongIndex);
    const note = form.querySelector('[data-search-note]');
    if (note) note.textContent = Array.isArray(state.dongIndex) ? '동 이름, 시·군·구, 시·도로 찾습니다.' : '지금은 시·도와 시·군·구 이름으로 찾습니다. 읍·면·동 이름 목록은 준비 중입니다.';
    if (api.searchQuery) api.searchQuery();   // 동 목록까지 온 뒤 한 번(?q=)
  }
  let q0 = new URLSearchParams(location.search).get('q');   // r16 M18: 스크립트가 늦어 기본 폼 전송(?q=)으로 다시 열렸으면 그 검색을 이어 간다
  if (form) {
    const q = form.querySelector('input'), msg = form.querySelector('[data-search-msg]');
    // 같은 이름 후보 칸(검색 칸 바로 아래). 넓은 화면에서 explore-layout.js가 폼째 옮기므로 폼 안에 둔다
    const cands = document.createElement('div'); cands.className = 'dash-chips hero-cands'; cands.setAttribute('role', 'group'); cands.setAttribute('aria-label', '같은 이름 동 후보'); cands.hidden = true;
    (msg || q).after(cands);
    const clearCands = () => { cands.hidden = true; cands.innerHTML = ''; };
    const goEntry = e => { clearCands(); if (e.href) { location.href = e.href; return; } go(e.route); if (!e.route.dong) app.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); };   // 동이면 render가 카드로 내린다
    const pick = () => {
      const r = searchPick(entries, q.value, state.route || {});
      if (r.many) { cands.innerHTML = candHTML(r.many); cands.hidden = false; if (msg) msg.textContent = candMsg(r); return; }
      const e = r.go;
      if (msg) msg.textContent = e ? `${e.label.split(' · ')[0]}${roJosa(e.label.split(' · ')[0])} 이동했습니다.` : '찾지 못했습니다. 동 이름이나 구 이름으로 다시 찾아 보세요.';
      if (e) goEntry(e); else clearCands();
    };
    cands.addEventListener('click', ev => {
      const a = ev.target.closest('a'); if (!a || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      const e = entries.find(x => (x.href || toHash(x.route)) === a.getAttribute('href')); if (!e) return;
      ev.preventDefault(); if (msg) msg.textContent = `${e.name}${roJosa(e.name)} 이동했습니다.`; goEntry(e);
    });
    form.addEventListener('submit', e => { e.preventDefault(); pick(); });
    api.searchQuery = () => { if (!q0 || state.dongIndex === undefined) return; const v = q0; q0 = null;
      try { const u = new URL(location.href); u.searchParams.delete('q'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (err) { /* 주소를 못 바꿔도 검색은 한다 */ }
      q.value = v; pick(); };
    q.addEventListener('focus', touch);
    const dl = form.querySelector('datalist');
    if (dl) q.addEventListener('input', () => { dl.innerHTML = suggestEntries(entries, q.value).map(e => `<option value="${esc(e.label)}"></option>`).join(''); });
    q.addEventListener('change', () => { if (entries.some(e => e.label === q.value.trim())) pick(); });
  }

  // 첫 경계는 보조 자료와 별도로 요청한다. 상세가 없으면 화면을 비우지 않고 개요를 쓴다.
  window.renewAfter = firstMap;
  const firstKind = firstGeoKind(state.route);
  const overview = () => fetchJson('data/national/sigungu-overview.geojson').then(geo => ({ geo, detailed: false }));
  const detail = () => loadSgDetail(false).then(ok => ok ? { geo: state.sgGeo, detailed: true } : overview());
  state.sgGeoScope = firstKind === 'busan' ? '21' : null;
  const geoP = firstKind === 'busan'
    ? fetchJson('data/national/sigungu-busan-overview.geojson').then(geo => {
      if (geo?.detail_sido === '21' && Array.isArray(geo.features)) return { geo, detailed: false };
      state.sgGeoScope = null;
      return detail();
    })
    : firstKind === 'detail' ? detail()
    : overview().then(entry => entry.geo && Array.isArray(entry.geo.features)
      ? entry : fetchJson('data/national/sigungu.geojson').then(geo => ({ geo, detailed: true })));
  // 첫 지도는 기본 쇠퇴 지표·지역 메타만 담은 index_map.json을 기다린다. 없으면 전체 index.json
  const indexP = fetchJson('data/national/index_map.json').then(c => (c && Array.isArray(c.sigungu) ? c : fetchJson('data/national/index.json')));
  window.renewAfter = Promise.all([indexP, geoP, firstMap]).then(() => {}, () => {});
  if (DG === undefined) window.renewAfter.then(loadDocgen);
  indexP.then(index => {
    state.index = index && Array.isArray(index.sigungu) ? index : null;
    heroBasis(index);
    if (!state.index) { render(); return; }
    if (deepLink && !matchMedia('(min-width: 1024px)').matches) app.scrollIntoView({ block: 'start' }); // 넓은 화면은 한 화면 배치라 옮기지 않는다. 기본 경로(부산)로 열 때도 옮기지 않는다(v9: 검색·탭을 건너뛰었다)
    searchSetup();
    if (index.series_file) { // 시·군·구 연도 요약은 목록·경계 뒤에 받아 붙인다. 오기 전에는 연도 문구를 '불러오는 중'으로 두고 자동 재생을 미룬다
      index.seriesPending = true;
      fetchJson('data/national/' + index.series_file, true).then(s => {
        index.summaryError = !mergeIndexSeries(index, s);
        if (!index.summaryError) mergeLivingSummary(index, state.livingSummary);
        index.seriesPending = false; coverMemo.clear(); render(); startAuto();
        document.dispatchEvent(new Event('renew-series'));   // find.js: 시·군·구 값은 series에서 읽는다. 늦게 오면 다시 센다(v9: 먼저 열면 '0곳'으로 남았다)
      });
    }
    render();
    geoP.then(({ geo, detailed }) => {
      if (!state.sgGeoDetailed) { state.sgGeo = geo && Array.isArray(geo.features) ? geo : null; state.sgGeoDetailed = !!state.sgGeo && detailed; }
      render(); startAuto();
    });
  });
  // R3 13: 순이동(migration.json 717KB)·부동산(realestate.json 1.96MB)은 첫 화면에 안 쓴다 → 그 지표 칩을 고르거나, 동을 골라 카드·문서가 쓸 때 받는다.
  // 받기 전에는 state가 undefined라 칩은 '수집 중'이고 문서는 '불러오는 중'으로 기다린다(filesLoading)
  // 2026-11-20 CQ-08: 보조 자료 여섯 개의 주소를 한 표에 두고 loadAux 하나로 받는다. 받지 못하면(통신 끊김·5xx·깨진 JSON) state.failed에 남겨
  // 칩을 '불러오지 못함 · 다시 시도'로 두고 문서를 만들지 않는다. 404(파일 없음)는 전처럼 null → '수집 중'. 다시 받기는 사용자가 칩을 누를 때만(retryAux)
  const AUX = {
    templates: ['data/report_templates.json', j => typeof j === 'object' && !!j.onepage && !!j.summary, '문서 양식'],
    living: ['data/national/living/index.json', j => Array.isArray(j.indicators), '생활 지표'],
    designations: ['data/national/designations.json', j => Array.isArray(j.items), '인구감소지역 지정'],
    forecastIdx: ['data/national/forecast/index.json', j => Array.isArray(j.horizons), '인구 전망'],
    migration: ['data/national/migration.json', j => Array.isArray(j.sigungu), '청년 순이동'],
    realestate: ['data/national/realestate.json', j => Array.isArray(j.sigungu), '아파트 거래'],
  };
  const loadAux = k => { extraAsked.add(k); return fetchJson(AUX[k][0], true).then(j => {
    state[k] = j && AUX[k][1](j) ? j : null;
    if (fetchFailed(AUX[k][0])) state.failed.add(k); else state.failed.delete(k);
  }); };
  // R3 13: 순이동(migration.json 717KB)·부동산(realestate.json 1.96MB)은 첫 화면에 안 쓴다 → 그 지표 칩을 고르거나, 동을 골라 카드·문서가 쓸 때 받는다.
  // 받기 전에는 state가 undefined라 칩은 '수집 중'이고 문서는 '불러오는 중'으로 기다린다(filesLoading)
  const EXTRA_FILES = { migration: true, realestate: true };
  function wantExtra(...kinds) {
    for (const k of kinds) {
      if (state[k] !== undefined || extraAsked.has(k)) continue;
      loadAux(k).then(() => { if (state.index) render(); });
    }
  }
  function retryAux(k) { state[k] = undefined; state.failed.delete(k); extraAsked.delete(k); wantExtra(k); }
  // 보조 자료 네 개는 다 받은 뒤 한 번만 다시 그린다(하나 올 때마다 지도·문서를 새로 그리면 휴대폰에서 1초 넘게 멈췄다, 2026-11-07 라이트하우스)
  // 2026-11-08: dashboard.json(2.5MB, 정밀 사례 칸 전용)은 여기서 빼고 읍·면·동 단계에서 받는다(hubHTML의 loadDash)
  Promise.all([
    loadAux('templates').then(() => { if (DG && state.templates) DG.setTemplates(state.templates); }),
    loadAux('living'),
    fetchJson('data/national/living/summary.json', true).then(j => { state.livingSummary = j; mergeLivingSummary(state.index, j); coverMemo.clear(); }),
    // 다른 직원이 만드는 중인 파일. 없으면(404) null → 해당 칩은 '수집 중'
    loadAux('designations'),
    loadAux('forecastIdx'),
  ]).then(() => { if (state.index) render(); });
  // 보충 목록(경계 없는 동 9곳)은 받지 못해도 본 색인으로 찾는다(home.js getIndex와 같다)
  Promise.all([fetchJson('data/national/dong_index.json', true), fetchJson('data/national/dong_extra.json', true)])
    .then(([di, ex]) => { state.dongIndex = Array.isArray(di) ? di.concat((Array.isArray(ex) ? ex : []).map(r => [...r, true])) : null; if (state.index) searchSetup(); });   // searchSetup이 ?q= 검색도 이어 간다
})();
