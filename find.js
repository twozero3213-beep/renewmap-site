/* 리뉴맵 지역 찾기(#find). 조건 칩을 AND로 묶어 '조건에 해당하는 곳'을 모두 보여 준다. 순위·값 순 정렬·최상급 표현 없음(D13).
   전국·시도 범위 = 시·군·구 단위(index.json series 중앙값·migration·designations·realestate), 시·군·구 범위 = 그 안 읍·면·동 단위(emd·living·forecast).
   기준 숫자는 원장(over_std·living standard)에서 읽는다. 공식 기준이 없는 조건만 아래 REF 참고 구간을 쓰고 칩에 '참고 구간'을 붙인다.
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부다. map.js(RenewMap)의 함수를 다시 쓴다. */
(function () {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./map.js') : window.RenewMap;
  if (!M) return;
  const DG = node ? require('./docgen.js') : window.RenewDocgen || null; // XLSX 만들기
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const pm = v => (v < 0 ? '−' + M.fmt(Math.abs(v)) : M.fmt(v));
  // 공식 기준이 없는 조건의 참고 구간(화면 눈금, 판정 기준 아님). 대표 지시(2026-10-25) 값
  const REF = { LIB_M: 1000, HOSP_PER10K: 10, BUS_PER_KM2: 20, MIG_PER1K: 5, FORE_PCT: 10, DEAL_PCT: 20 };
  const GROUPS = [['aging', '🏚 정비 신호'], ['pop', '👥 인구 변화'], ['estate', '🏠 부동산 거래'], ['life', '🌿 생활 여건'], ['fore', '🔮 전망']];
  const NOTE = '조건 필터 · 순위 아님';
  const ESTATE_NOTE = '실거래 신고 사실 · 투자 조언 아님';
  const UNIT = { sg: '시·군·구', emd: '읍·면·동' };

  const over = (c, code) => (c.index && c.index.over_std && isNum(c.index.over_std[code]) ? c.index.over_std[code] : null);
  const livInd = (c, code) => (c.living && Array.isArray(c.living.indicators) ? c.living.indicators.find(i => i && i.code === code) || null : null);
  const livStd = (c, code) => { const x = livInd(c, code); return x && x.standard && isNum(x.standard.value) ? x.standard.value : null; };
  const foreKey = c => { const b = c.forecastIdx && c.forecastIdx.backtest && c.forecastIdx.backtest.DECLINE_POP_TOTAL; return b && typeof b.change_pct_key === 'string' && b.change_pct_key ? b.change_pct_key : null; };
  const foreH = c => { const h = c.forecastIdx && Array.isArray(c.forecastIdx.horizons) ? c.forecastIdx.horizons.filter(isNum) : []; return h.length ? Math.max(...h) : null; };
  // 값 읽기: 시·군·구는 index.json series의 최신 중앙값, 읍·면·동은 그 동 시계열의 최신 값
  const seriesVal = code => a => {
    if (a.dong) { const s = M.seriesOf(a.dong, code), y = M.latestYear(s); return y === null ? null : M.valueAt(s, y); }
    const r = M.sgRow(a.sg, code, null); return r ? r.value : null;
  };
  const livingVal = code => a => { const c = a.ld && Array.isArray(a.ld.cells) ? a.ld.cells.find(x => x.indicator_code === code) : null; return c && isNum(c.value) ? c.value : null; };
  const sgVal = (src, code) => (a, c) => (a.sg ? M.sgExtra({ src, code, unit: '%' }, a.sg, c).value : null);
  const foreVal = (a, c) => { const k = foreKey(c); if (!k || !a.dong) return null; const f = M.fcOf({ forecast: c.forecast, forecastIdx: c.forecastIdx, horizon: foreH(c) }, a.code, k); return f && !f.held ? f.point : null; };
  // 거래량 1년 변화율은 realestate.json의 summary(최근 12개월 합 대비, 원장 셀)에 있다. 시계열이면 series
  const hasRe = (c, code) => !!c.realestate && Array.isArray(c.realestate.sigungu) && c.realestate.sigungu.some(s => s && ((s.summary && isNum(s.summary[code])) || (s.series && Array.isArray(s.series[code]) && s.series[code].length)));

  // 조건 정의. units: 이 조건을 셀 수 있는 단위. sgLevel: 읍·면·동 범위에서도 그 동이 속한 시·군·구 값(모든 동 같음)
  const CONDS = [
    { id: 'aging', n: '노후 건축물 비율', g: 'aging', e: '🏚', units: ['sg', 'emd'], src: 'index', th: c => over(c, 'DECLINE_AGING_20Y_PCT'), get: seriesVal('DECLINE_AGING_20Y_PCT'), op: 'ge', label: t => `노후 건축물 ${pm(t)}% 이상` },
    { id: 'met', n: '쇠퇴 요건 충족 수', g: 'aging', e: '📋', units: ['sg', 'emd'], src: 'index', th: c => over(c, 'DECLINE_MET_COUNT'), get: seriesVal('DECLINE_MET_COUNT'), op: 'ge', label: t => `쇠퇴 요건 ${pm(t)}개 이상(하한)` },
    { id: 'pop30', n: '인구 30년 감소', g: 'aging', e: '👥', units: ['sg', 'emd'], src: 'index', th: c => over(c, 'DECLINE_POP_DROP30Y_PCT'), get: seriesVal('DECLINE_POP_DROP30Y_PCT'), op: 'ge', label: t => `인구 30년 ${pm(t)}% 이상 감소` },
    { id: 'biz10', n: '사업체 10년 감소', g: 'aging', e: '🏪', units: ['sg', 'emd'], src: 'index', th: c => over(c, 'DECLINE_BIZ_DROP10Y_PCT'), get: seriesVal('DECLINE_BIZ_DROP10Y_PCT'), op: 'ge', label: t => `사업체 10년 ${pm(t)}% 이상 감소` },
    { id: 'depop', n: '인구감소지역 지정', g: 'pop', e: '🏳️', units: ['sg', 'emd'], src: 'designations', sgLevel: true, th: () => '인구감소지역', get: sgVal('designations'), op: 'eq', label: () => '인구감소지역 지정' },
    { id: 'concern', n: '인구감소 관심지역 지정', g: 'pop', e: '🟠', units: ['sg', 'emd'], src: 'designations', sgLevel: true, th: () => '관심지역', get: sgVal('designations'), op: 'eq', label: () => '인구감소 관심지역 지정' },
    // 시·군·구는 forecast/index.json의 KOSIS 시군구 실측(sigungu_aged65_latest, 원장 셀), 읍·면·동은 living 셀
    { id: 'aged', n: '초고령(65세 이상)', g: 'pop', e: '👴', units: ['sg', 'emd'], src: 'living', th: c => livStd(c, 'POP_AGED65_PCT'), op: 'ge',
      get: (a, c) => { if (a.dong) return livingVal('POP_AGED65_PCT')(a);
        const m = c.forecastIdx && c.forecastIdx.sigungu_aged65_latest, x = m && a.sg ? m[a.sg.code5] : null; return x && isNum(x.value) ? x.value : null; }, label: t => `초고령(65세 이상 ${pm(t)}% 이상)`, tag: c => (livInd(c, 'POP_AGED65_PCT') || { standard: {} }).standard.status || null },
    { id: 'youthDown', n: '청년 비율 5년 감소', g: 'pop', e: '📉', units: ['emd'], src: 'living', ref: true, th: c => (livInd(c, 'POP_YOUTH_PCT_DELTA5Y') ? 0 : null), get: livingVal('POP_YOUTH_PCT_DELTA5Y'), op: 'lt', label: () => '청년 비율 5년 감소' },
    { id: 'migOut', n: '청년 순유출', g: 'pop', e: '↘', units: ['sg', 'emd'], src: 'migration', sgLevel: true, ref: true, th: () => -REF.MIG_PER1K, get: sgVal('migration'), op: 'le', label: t => `청년 순유출(천 명당 ${pm(t)}명 이하)` },
    { id: 'migIn', n: '청년 순유입', g: 'pop', e: '↗', units: ['sg', 'emd'], src: 'migration', sgLevel: true, ref: true, th: () => REF.MIG_PER1K, get: sgVal('migration'), op: 'ge', label: t => `청년 순유입(천 명당 +${pm(t)}명 이상)` },
    { id: 'dealDown', n: '연간 거래 감소', g: 'estate', e: '🏠', units: ['sg', 'emd'], src: 'realestate', sgLevel: true, ref: true, code: 'APT_TRADE_COUNT_YOY_PCT', th: c => (hasRe(c, 'APT_TRADE_COUNT_YOY_PCT') ? -REF.DEAL_PCT : null), get: sgVal('realestate', 'APT_TRADE_COUNT_YOY_PCT'), op: 'le', label: t => `연간 거래 ${pm(Math.abs(t))}% 이상 감소` },
    { id: 'dealUp', n: '연간 거래 증가', g: 'estate', e: '🏘', units: ['sg', 'emd'], src: 'realestate', sgLevel: true, ref: true, code: 'APT_TRADE_COUNT_YOY_PCT', th: c => (hasRe(c, 'APT_TRADE_COUNT_YOY_PCT') ? REF.DEAL_PCT : null), get: sgVal('realestate', 'APT_TRADE_COUNT_YOY_PCT'), op: 'ge', label: t => `연간 거래 ${pm(t)}% 이상 증가` },
    // 생활 여건은 기준 이상(안쪽)과 기준 미만(바깥쪽) 칩을 나란히 둔다(2026-10-26, 업무별 프리셋이 미만 쪽을 쓴다). 같은 기준값·같은 꼬리표, 하위 N곳 정렬 아님
    { id: 'park', n: '1인당 공원 면적', g: 'life', e: '🌳', units: ['emd'], src: 'living', th: c => livStd(c, 'PARK_AREA_PER_CAPITA'), get: livingVal('PARK_AREA_PER_CAPITA'), op: 'ge', label: t => `1인당 공원 ${pm(t)}㎡ 이상` },
    { id: 'parkLow', n: '1인당 공원 면적 미만', g: 'life', e: '🌳', units: ['emd'], src: 'living', th: c => livStd(c, 'PARK_AREA_PER_CAPITA'), get: livingVal('PARK_AREA_PER_CAPITA'), op: 'lt', label: t => `1인당 공원 ${pm(t)}㎡ 미만` },
    { id: 'lib', n: '공공도서관 거리', g: 'life', e: '📚', units: ['emd'], src: 'living', ref: true, th: c => (livInd(c, 'LIB_NEAREST_M') ? REF.LIB_M : null), get: livingVal('LIB_NEAREST_M'), op: 'le', label: t => `공공도서관 ${pm(t / 1000)}km 안` },
    { id: 'libFar', n: '공공도서관 거리 밖', g: 'life', e: '📚', units: ['emd'], src: 'living', ref: true, th: c => (livInd(c, 'LIB_NEAREST_M') ? REF.LIB_M : null), get: livingVal('LIB_NEAREST_M'), op: 'gt', label: t => `공공도서관 ${pm(t / 1000)}km 밖` },
    { id: 'hosp', n: '병의원(1만 명당)', g: 'life', e: '🏥', units: ['emd'], src: 'living', ref: true, th: c => (livInd(c, 'HOSP_PER10K') ? REF.HOSP_PER10K : null), get: livingVal('HOSP_PER10K'), op: 'ge', label: t => `병의원 1만 명당 ${pm(t)}곳 이상` },
    { id: 'hospLow', n: '병의원(1만 명당) 미만', g: 'life', e: '🏥', units: ['emd'], src: 'living', ref: true, th: c => (livInd(c, 'HOSP_PER10K') ? REF.HOSP_PER10K : null), get: livingVal('HOSP_PER10K'), op: 'lt', label: t => `병의원 1만 명당 ${pm(t)}곳 미만` },
    { id: 'bus', n: '버스정류장 밀도', g: 'life', e: '🚌', units: ['emd'], src: 'living', ref: true, th: c => (livInd(c, 'BUS_STOP_DENSITY') ? REF.BUS_PER_KM2 : null), get: livingVal('BUS_STOP_DENSITY'), op: 'ge', label: t => `버스정류장 ㎢당 ${pm(t)}개 이상` },
    { id: 'busLow', n: '버스정류장 밀도 미만', g: 'life', e: '🚌', units: ['emd'], src: 'living', ref: true, th: c => (livInd(c, 'BUS_STOP_DENSITY') ? REF.BUS_PER_KM2 : null), get: livingVal('BUS_STOP_DENSITY'), op: 'lt', label: t => `버스정류장 ㎢당 ${pm(t)}개 미만` },
    { id: 'foreDown', n: '인구 감소 전망', g: 'fore', e: '🔮', units: ['emd'], src: 'forecast', ref: true, th: c => (foreKey(c) && foreH(c) ? -REF.FORE_PCT : null), get: foreVal, op: 'le', label: (t, c) => `${foreH(c) ?? ''}년 인구 ${pm(Math.abs(t))}% 이상 감소 전망` },
    { id: 'foreUp', n: '인구 증가 전망', g: 'fore', e: '📈', units: ['emd'], src: 'forecast', ref: true, th: c => (foreKey(c) && foreH(c) ? 0 : null), get: foreVal, op: 'gt', label: (t, c) => `${foreH(c) ?? ''}년 인구 증가 전망` },
  ];
  const condOf = id => CONDS.find(c => c.id === id) || null;
  const SRC_READY = {
    index: c => !!c.index && Array.isArray(c.index.sigungu),
    designations: c => !!c.designations && Array.isArray(c.designations.items),
    migration: c => !!c.migration && Array.isArray(c.migration.sigungu),
    living: c => !!c.living && Array.isArray(c.living.indicators),
    forecast: c => !!c.forecastIdx && Array.isArray(c.forecastIdx.horizons),
    realestate: c => !!c.realestate && Array.isArray(c.realestate.sigungu),
  };
  // 이 범위(단위)에서 쓸 수 있는가. 안 되면 이유를 칩에 적는다. 숫자를 만들지 않는다
  function condState(cond, ctx, unit) {
    if (!SRC_READY[cond.src](ctx)) return { ok: false, why: '수집 중', th: null };
    if (!cond.units.includes(unit)) return { ok: false, why: '읍·면·동 단위만', th: null };
    const th = cond.th(ctx);
    if (th === null || th === undefined) return { ok: false, why: cond.src === 'realestate' ? '변화율 셀 없음' : '기준 없음', th: null };
    return { ok: true, why: null, th };
  }
  function tagsOf(cond, ctx) {
    const t = typeof cond.tag === 'function' ? cond.tag(ctx) : null;
    return [cond.ref ? '참고 구간' : null, t && t !== '법정' ? t : null, cond.src === 'forecast' ? '추세 외삽' : null, cond.sgLevel ? '시·군·구 단위' : null].filter(Boolean);
  }
  // 쓸 수 없는 조건도 기준을 알 수 있으면 숫자를 보이고, 모르면 이름만(숫자를 만들지 않는다)
  const chipLabel = (c, ctx, st) => { const t = st.ok ? st.th : SRC_READY[c.src](ctx) ? c.th(ctx) : null; return t === null || t === undefined ? c.n : c.label(t, ctx); };
  const TEST = { ge: (v, t) => v >= t, le: (v, t) => v <= t, gt: (v, t) => v > t, lt: (v, t) => v < t, eq: (v, t) => v === t };
  // 범위 → 셀 단위의 목록(코드 순 그대로). 전국·시도는 지도에 칸이 있는 시·군·구(일반구 포함), 시·군·구는 그 안 읍·면·동
  function areasOf(scope, ctx) {
    const idx = ctx.index; if (!idx || !Array.isArray(idx.sigungu)) return [];
    if (scope && scope.sg) {
      const sg = (idx.sigungu || []).find(s => String(s.code5) === String(scope.sg)); if (!sg) return [];
      const lm = new Map(((ctx.lv && ctx.lv.dongs) || []).map(d => [String(d.code7 ?? d.code), d]));
      return ((ctx.emd && ctx.emd.dongs) || []).map(d => { const code = String(d.code7 ?? d.code); return { code, name: d.name, sub: sg.name, sg, dong: d, ld: lm.get(code) || null }; });
    }
    const sidoName = s => ((idx.sido || []).find(x => String(x.code2) === String(s.sido2)) || {}).name || '';
    const parentName = s => { const p = String(s.parent || ''); return p.length === 5 ? ((idx.sigungu.find(x => String(x.code5) === p) || {}).name || '') : ''; };
    return M.leavesOf(idx, scope && scope.sido ? scope.sido : null).map(s => ({ code: String(s.code5), name: s.name, sub: [parentName(s), sidoName(s)].filter(Boolean).join(' · '), sg: s }));
  }
  // AND 결합: 고른 조건 중 이 범위에서 쓸 수 있는 것만 센다. 값이 없는 조건이 있으면 '자료 없음'(맞음으로 세지 않는다)
  // ids의 원소가 배열이면 그 안은 OR 묶음(프리셋 전용. 하나라도 맞으면 맞음, 맞는 것 없이 자료 없음이 있으면 자료 없음). 묶음 사이는 AND
  function evaluate(areas, ids, ctx, unit) {
    const groups = (ids || []).map(g => (Array.isArray(g) ? g : [g]).map(condOf).filter(Boolean).map(c => ({ c, s: condState(c, ctx, unit) })));
    const use = groups.map(g => g.filter(x => x.s.ok)).filter(g => g.length), skipped = groups.flat().filter(x => !x.s.ok).map(x => x.c.id);
    const res = new Map();
    for (const a of areas) {
      const r = use.map(g => { const t = g.map(({ c, s }) => { const v = c.get(a, ctx); return v === null || v === undefined ? null : TEST[c.op](v, s.th); }); return t.includes(true) ? true : t.includes(null) ? null : false; });
      res.set(a.code, !use.length ? 'idle' : r.every(v => v === true) ? 'hit' : r.includes(false) ? 'miss' : 'na');
    }
    const hits = areas.filter(a => res.get(a.code) === 'hit');
    return { use: use.flat().map(x => x.c.id), groups: use.map(g => g.map(x => x.c.id)), skipped, total: areas.length, hits, nodata: areas.filter(a => res.get(a.code) === 'na').length, res };
  }
  // 목록 순서: 행정코드 순 또는 가나다 순만. 값 크기로 줄 세우지 않는다(D13)
  function sortAreas(list, by) {
    const out = [...list];
    return by === 'name' ? out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')) : out.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }
  function hashOf(a, ctx) {
    const r = M.leafRoute(ctx.index, a.sg.code5); if (!r) return '#map';
    return M.toHash(a.dong ? { ...r, dong: a.code } : r);
  }
  // 경계 → 정적 SVG 도형(투영: 경도×cos(중심 위도)). 지도 타일 없이 칸만 그린다
  function shapes(features, W) {
    const w = W || 600, rings = f => { const g = f && f.geometry; if (!g) return []; return g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []; };
    const feats = (features || []).filter(f => rings(f).length);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of feats) for (const r of rings(f)) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (!feats.length) return { w, h: 0, paths: [] };
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), s = w / (((x1 - x0) * k) || 1), h = Math.max(1, Math.round((y1 - y0) * s));
    const paths = feats.map(f => {
      const d = rings(f).map(r => { let prev = ''; const pts = []; for (const [x, y] of r) { const p = `${((x - x0) * k * s).toFixed(1)} ${((y1 - y) * s).toFixed(1)}`; if (p !== prev) pts.push(p); prev = p; } return pts.length > 2 ? 'M' + pts.join('L') + 'Z' : ''; }).join('');
      return { code: String((f.properties || {}).code), name: String((f.properties || {}).name || ''), d };
    }).filter(p => p.d);
    return { w, h, paths };
  }
  function chipsHTML(sel, ctx, unit) {
    const flat = (sel || []).flat(), inOr = id => (sel || []).some(x => Array.isArray(x) && x.includes(id));
    return GROUPS.map(([g, gl]) => {
      const list = CONDS.filter(c => c.g === g);
      return `<fieldset class="fd-grp"><legend>${esc(gl)}</legend><div class="fd-chips">${list.map(c => {
        const st = condState(c, ctx, unit), on = flat.includes(c.id), tags = (st.ok ? tagsOf(c, ctx) : [st.why]).concat(inOr(c.id) ? ['또는'] : []);
        return `<button type="button" class="fd-chip${st.ok ? '' : ' is-off'}${on ? ' is-on' : ''}" data-fd-cond="${esc(c.id)}" aria-pressed="${on}"${st.ok || on ? '' : ' aria-disabled="true"'}><span class="fd-e" aria-hidden="true">${esc(c.e)}</span>${esc(chipLabel(c, ctx, st))}${tags.map(t => `<small>${esc(t)}</small>`).join('')}</button>`;
      }).join('')}</div>${g === 'estate' ? `<p class="fd-gnote">${esc(ESTATE_NOTE)} · 아파트 매매 신고 건수 최근 12개월 합을 직전 12개월과 비교(원장 값) · ${esc(M.ESTATE_PROV)}</p>` : g === 'fore' ? `<p class="fd-gnote">${esc(M.FORE_FIXED)}</p>` : ''}</fieldset>`;
    }).join('');
  }
  const PAGE_SIZE = 10;
  function paginate(list, page = 1, perPage = PAGE_SIZE) {
    const total = list.length, pages = Math.ceil(total / perPage), current = pages ? Math.min(Math.max(Number(page) || 1, 1), pages) : 1;
    const from = total ? (current - 1) * perPage + 1 : 0;
    return { items: list.slice(from ? from - 1 : 0, current * perPage), total, page: current, pages, from, to: total ? Math.min(current * perPage, total) : 0 };
  }
  function pageRange(current, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, 'gap-end', pages];
    if (current >= pages - 2) return [1, 'gap-start', pages - 2, pages - 1, pages];
    return [1, 'gap-start', current - 1, current, current + 1, 'gap-end', pages];
  }
  function pagerHTML(p) {
    if (p.pages <= 1) return '';
    return `<nav class="fd-pager" aria-label="지역 결과 페이지"><button type="button" data-fd-page="prev" aria-label="이전 페이지"${p.page === 1 ? ' disabled' : ''}>이전</button><div>${pageRange(p.page, p.pages).map(n => typeof n === 'number' ? `<button type="button" data-fd-page="${n}"${n === p.page ? ' aria-current="page"' : ''} aria-label="${n}페이지">${n}</button>` : '<span aria-hidden="true">…</span>').join('')}</div><button type="button" data-fd-page="next" aria-label="다음 페이지"${p.page === p.pages ? ' disabled' : ''}>다음</button></nav>`;
  }
  function resultHTML(ev, areas, ctx, unit, by, page = 1) {
    const emo = ev.use.map(id => condOf(id).e).join(' ');
    const skip = ev.skipped.length ? `<p class="fd-skip">이 범위에서 쓸 수 없어 빠진 조건 ${ev.skipped.length}개: ${esc(ev.skipped.map(id => condOf(id).e + ' ' + chipLabel(condOf(id), ctx, condState(condOf(id), ctx, unit))).join(', '))}</p>` : '';
    const head = `<p class="fd-note">${esc(NOTE)} · ${esc(UNIT[unit])} 단위${unit === 'sg' ? ' · 시·군·구 값은 그 안 읍·면·동 값의 중앙값' : ''}</p>`;
    const groups = ev.groups || ev.use.map(id => [id]), lbl = id => condOf(id).e + ' ' + chipLabel(condOf(id), ctx, condState(condOf(id), ctx, unit));
    const conds = ev.use.length ? `<p class="fd-conds">쓰는 조건: ${groups.map(g => g.map(id => esc(lbl(id))).join(' <b>또는</b> ')).join(' <b>+</b> ')}</p>` : '';
    if (!ev.use.length) return head + skip + `<p class="fd-count is-idle"><b>–</b><small>조건 칩을 하나 이상 고르면 해당하는 곳을 모두 보여 줍니다. 여러 개를 고르면 모두 맞는 곳(AND)만 남습니다.</small></p>`;
    const list = sortAreas(ev.hits, by), p = paginate(list, page);
    return head + skip + conds + `<p class="fd-count" aria-live="polite">조건에 맞는 곳 <b data-ck="fd-n" data-count="${ev.hits.length}">${ev.hits.length}</b>곳 <small>/ 전체 ${esc(M.fmt(areas.length))}곳${ev.nodata ? ` · 자료가 없어 판단하지 않은 곳 ${esc(M.fmt(ev.nodata))}곳` : ''}</small></p>` +
      LIST_MARK + `<div class="dash-seg fd-sort" role="group" aria-label="목록 순서"><button type="button" data-fd-sort="code" aria-pressed="${by !== 'name'}">행정코드 순</button><button type="button" data-fd-sort="name" aria-pressed="${by === 'name'}">가나다 순</button></div>` +
      (DG ? `<p class="fd-xlsx"><button type="button" class="btn ghost" data-fd-xlsx>XLSX 내려받기</button><small>조건에 맞는 곳 ${ev.hits.length}곳(행정코드 순), 범위 전체의 해당 여부, 조건·출처 시트</small><span class="map-png-msg" data-fd-xlsx-msg role="status"></span></p>` : '') +
      (list.length ? `<div data-state="ready"><h3 class="fd-list-title" data-fd-list-start tabindex="-1">전체 ${p.total}곳 중 ${p.from}–${p.to}곳</h3><ol class="fd-list">${p.items.map(a => `<li><span class="fd-n"><b>${esc(a.name)}</b><small>${esc(a.sub)} · ${esc(a.code)}</small></span><span class="fd-b" aria-label="맞는 조건">${esc(emo)}</span><a href="${esc(hashOf(a, ctx))}" data-fd-go>${a.dong ? '이 동 보기' : '이 지역 보기'}</a></li>`).join('')}</ol>${pagerHTML(p)}</div>`
        : `<div class="fd-empty" data-state="empty" role="status"><img src="mascot/crew/ieum-search.svg" width="104" height="104" alt="" aria-hidden="true"><p>조건을 모두 만족하는 곳이 없습니다.<br>조건을 하나 빼 보세요.</p><button type="button" class="btn ghost" data-fd-relax>마지막 조건 빼기</button></div>`);
  }
  const LIST_MARK = '<!--fd-list-->';
  // ── XLSX 내보내기(여러 시군구 묶음): 열 = 시도·시군구·코드·동·조건별 값·해당 여부·출처 번호. 순위·값 순 정렬 없음(행정코드 순) ──
  // 조건 → 값의 원천(파일 이름, 메타 키). 없는 메타는 빈 칸으로 둔다(이름을 지어내지 않는다)
  const SRC_OF = { aging: ['index', 'source'], met: ['index', 'source'], pop30: ['index', 'pop_source'], biz10: ['index', 'biz_source'], depop: ['designations', 'source'], concern: ['designations', 'source'],
    migOut: ['migration', 'source'], migIn: ['migration', 'source'], dealDown: ['realestate', 'source'], dealUp: ['realestate', 'source'],
    aged: ['living', 'kosis_age'], youthDown: ['living', 'kosis_age'], park: ['living', 'park'], parkLow: ['living', 'park'], lib: ['living', 'library'], libFar: ['living', 'library'],
    hosp: ['living', 'hospital'], hospLow: ['living', 'hospital'], bus: ['living', 'bus'], busLow: ['living', 'bus'] };
  function condSource(c, ctx) {
    if (c.src === 'forecast') { const f = ctx.forecastIdx || {}; return { name: `추세 외삽(${f.method || '방법 미표시'})`, url: '', date: isNum(f.base_year) ? `${f.base_year}년 기준` : '', license: '' }; }
    const [file, key] = SRC_OF[c.id] || [], root = file ? ctx[file] : null, m = root ? (file === 'living' ? (root.sources || {})[key] : root[key]) : null;
    if (!m) return { name: '', url: '', date: '', license: '' };
    return { name: m.name || '', url: m.url || '', date: m.base_date || m.effective_date || (isNum(m.base_year) ? `${m.base_year}년` : '') || (isNum(m.latest_month) ? `${String(m.latest_month).slice(0, 4)}.${String(m.latest_month).slice(4)}` : ''), license: m.license_type || '' };
  }
  const JUDGE = { hit: '해당', miss: '해당 안 함', na: '자료 없음' };
  function exportSheets(areas, ev, ctx, unit) {
    const idx = ctx.index, conds = ev.use.map(condOf), sts = conds.map(c => condState(c, ctx, unit)), srcs = conds.map(c => condSource(c, ctx)), keys = [], nums = srcs.map(x => {
      const k = JSON.stringify([x.name, x.url, x.date]); if (!keys.includes(k)) keys.push(k); return keys.indexOf(k) + 1; });
    const sido = a => ((idx.sido || []).find(x => String(x.code2) === String(a.sg.sido2)) || {}).name || '';
    const sgName = a => { const p = String(a.sg.parent || ''), pn = p.length === 5 ? ((idx.sigungu || []).find(x => String(x.code5) === p) || {}).name : ''; return [pn, a.sg.name].filter(Boolean).join(' '); };
    const head = ['시도', '시군구', '코드', '동', ...conds.flatMap(c => [`${c.n} 값`, `${c.n} 해당`]), '전체 해당 여부', '출처 번호'];
    const row = a => [sido(a), sgName(a), a.code, a.dong ? a.name : '', ...conds.flatMap((c, i) => {
      const v = sts[i].ok ? c.get(a, ctx) : null, has = v !== null && v !== undefined;
      return [has ? v : '', !sts[i].ok || !has ? '자료 없음' : TEST[c.op](v, sts[i].th) ? '해당' : '해당 안 함']; }), JUDGE[ev.res.get(a.code)] || '', [...new Set(nums)].sort((x, y) => x - y).join(', ')];
    const byCode = list => sortAreas(list, 'code').map(row);
    const cond = [['출처 번호', '조건', '조건 문구(기준)', '값의 단위', '출처', 'URL', '기준일', '이용조건', '비고']];
    conds.forEach((c, i) => cond.push([nums[i], c.n, chipLabel(c, ctx, sts[i]), UNIT[unit], srcs[i].name, srcs[i].url, srcs[i].date, srcs[i].license, [c.ref ? '참고 구간(공식 기준 아님)' : '', c.sgLevel ? '시·군·구 단위 값' : '', c.src === 'forecast' ? '추세 외삽(판정 아님)' : ''].filter(Boolean).join(' · ')]));
    cond.push([]); cond.push(['', NOTE, '결과는 조건에 해당하는 곳을 행정코드 순으로 적은 것이며 순위·점수가 아닙니다. 결정은 담당자가 합니다.']);
    return [{ name: '해당 지역', rows: [head, ...byCode(ev.hits)], widths: [14, 18, 12, 14, ...conds.flatMap(() => [14, 12]), 14, 10] },
      { name: '범위 전체', rows: [head, ...byCode(areas)], widths: [14, 18, 12, 14, ...conds.flatMap(() => [14, 12]), 14, 10] },
      { name: '조건·출처', rows: cond, widths: [8, 22, 40, 12, 44, 44, 12, 18, 30] }];
  }
  function boundaryState(scope, sgGeo, emd) {
    if (scope.sg) return emd ? 'empty' : 'loading';
    return sgGeo === undefined ? 'loading' : 'empty';
  }
  // ── 업무별 바로 가기(#gov): 프리셋 = 기존 찾기 조건의 묶음(docs/gov/public_officer_usecases.md 부록 B). 결과는 조건에 해당하는 곳 전부(코드·가나다 순)이며 점수·순위·추천이 아니다(D13·D17) ──
  // 안전 인프라는 공식 기준이 없어 찾기 조건으로 만들지 않는다(값 임계치로 걸러 목록을 내면 D17이 금지한 하위 목록과 같다). 설치 현황 카드는 동 상세의 안전 인프라 묶음으로 보낸다
  // 법령·사업명은 부록 B 문구 그대로. 미확인 조문은 법무 확인 뒤 지운다
  const DECIDE = '결정은 담당자가 합니다';
  const GOV_NOTE = '업무를 고르면 조건이 켜지고 맞는 동과 근거서가 나옵니다. 점수·순위를 매기지 않습니다.';
  const PRESETS = [
    { id: 'cctv', e: '🎥', n: 'CCTV·보안등 설치 검토', ask: 'CCTV·보안등 추가 설치 검토 자료를 요구받았을 때', give: '동별 설치 현황 사실(밀도·경찰관서까지 거리). 범죄·안전 수준이 아닙니다.', conds: [], note: '조건 없음 · 동을 고르면 안전 인프라 카드로', action: 'safe', law: '개인정보 보호법 제25조' },
    { id: 'yearend', e: '💰', n: '연말 소규모 정비 검토', ask: '연말에 남은 예산, 근거 있는 소규모 정비 사업을 찾을 때', give: '노후·쇠퇴·생활 기준에 해당하는 동 목록과 첨부용 근거서', conds: ['aging', 'met', ['parkLow', 'libFar']], law: '지방재정법 제37조(투자심사)·제50조(이월)' },
    { id: 'depop', e: '🏳', n: '지방소멸대응기금 현황표', ask: '지방소멸대응기금 투자계획서에 현황표가 필요할 때', give: '인구감소·고령·청년 변화 표', conds: [['depop', 'concern'], 'pop30'], condsEmd: ['aged'], law: '지방소멸대응기금(행안부), 인구감소지역 지원 특별법' },
    { id: 'housing', e: '🏚', n: '노후주거지 후보 추리기', ask: '노후주거지 정비·도시재생 공모 전에 후보 동을 추릴 때', give: '쇠퇴 요건과 노후 건축물 기준을 함께 충족하는 동 목록', conds: ['aging', 'met', 'pop30', 'biz10'], law: '노후주거지정비 지원사업(국토부), 도시재생 활성화 및 지원에 관한 특별법' },
    { id: 'soc', e: '🌳', n: '공원·도서관 민원 회신', ask: "'우리 동네는 왜 공원·도서관이 없나' 민원에 회신할 때", give: '기준 대비 현황과 출처', conds: [['parkLow', 'libFar', 'hospLow']], law: '도시공원 및 녹지 등에 관한 법률 시행규칙 제4조, 생활SOC 최저기준' },
    { id: 'brief', e: '📄', n: '의회·감사 근거서', ask: "의회·감사에서 '근거가 뭐냐'고 물을 때", give: '출처·기준일·계산식이 붙은 근거서', conds: [], note: '조건 없음 · 동을 고르면 사업 근거서로', action: 'brief', law: '지방자치법 제49조·제142조·제150조' },
  ];
  const presetOf = id => PRESETS.find(p => p.id === id) || null;
  // 프리셋의 조건 목록: 읍·면·동 범위(unit emd)면 condsEmd를 덧붙인다. 묶음(배열)은 복사한다
  const presetConds = (p, unit) => p.conds.map(g => (Array.isArray(g) ? [...g] : g)).concat(unit === 'emd' ? p.condsEmd || [] : []);
  function govHTML(ctx, scopeName) {
    const unit = scopeName ? 'emd' : 'sg', lbl = id => { const c = condOf(id); return c.e + ' ' + (ctx && ctx.index ? chipLabel(c, ctx, condState(c, ctx, unit)) : c.n); };
    const condText = p => p.note || presetConds(p, unit).map(g => (Array.isArray(g) ? g.map(lbl).join(' 또는 ') : lbl(g))).join(' + ') + (unit !== 'emd' && p.condsEmd ? ` (+ 읍·면·동 범위에서 ${p.condsEmd.map(lbl).join(', ')})` : '');
    return `<p class="gov-note">${esc(GOV_NOTE)}<br>범위: ${scopeName ? `<b>${esc(scopeName)}</b> 안 읍·면·동` : '<b>시·도와 시·군·구를 먼저 고르세요</b>'}</p>` +
      `<ul class="gov-cards">${PRESETS.map(p => `<li><button type="button" class="gov-card" data-gov-preset="${esc(p.id)}" aria-label="${esc(p.n)}"><span class="gov-e" aria-hidden="true">${p.e}</span><span class="gov-n">${esc(p.n)}</span><b>${esc(p.ask)}</b><span class="gov-why">→ ${esc(p.give)}</span><span class="gov-d">${esc(DECIDE)}</span></button><details class="gov-more"><summary>조건·근거 법령</summary><span class="gov-c">${esc(condText(p))}</span><span class="gov-law">${esc(p.law)}</span></details></li>`).join('')}</ul>`;
  }
  const api = { REF, GROUPS, CONDS, NOTE, ESTATE_NOTE, PAGE_SIZE, PRESETS, GOV_NOTE, DECIDE, condOf, condState, tagsOf, areasOf, evaluate, sortAreas, paginate, pageRange, shapes, chipsHTML, resultHTML, hashOf, boundaryState, presetOf, presetConds, govHTML, condSource, exportSheets };
  if (node) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewFind = api;

  // ── 브라우저 ──
  const root = document.getElementById('findApp'); if (!root) return;
  const fetchJson = url => (window.renewFetch ? window.renewFetch(url) : fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const st = { sel: [], by: 'code', page: 1, scope: { sido: '', sg: '' }, ctx: { index: null }, sgGeo: null, emd: new Map(), svgKey: '', lastSg: null, lastDong: null, hint: '', govKey: '' };
  const gov = document.querySelector('#gov [data-gov]');
  root.innerHTML = `<div class="fd-scope" data-fd-scope></div><div class="fd-grid"><div class="fd-left" data-fd-chips></div><div class="fd-right"><div data-fd-out></div><div class="fd-map" data-fd-map><div class="fd-wait" data-state="loading" role="status"><img src="mascot/crew/saeum-waiting.svg" width="104" height="104" alt="" aria-hidden="true"><p>경계 자료를 불러오는 중입니다.</p></div></div><div data-fd-list></div></div></div>`;
  const $ = s => root.querySelector(s);
  const unit = () => (st.scope.sg ? 'emd' : 'sg');
  // 시·군·구 범위의 읍·면·동 파일(지도 지연 로드와 같은 캐시). 아직이면 null
  function emdCtx(code5) {
    if (st.emd.has(code5)) return st.emd.get(code5);
    st.emd.set(code5, null);
    const c = st.ctx;
    Promise.all([fetchJson(`data/national/emd/${code5}.json`), fetchJson(`data/national/emd/${code5}.geojson`), c.living ? fetchJson(`data/national/living/${code5}.json`) : null, c.forecastIdx ? fetchJson(`data/national/forecast/${code5}.json`) : null])
      .then(([json, geo, lv, fc]) => { st.emd.set(code5, { json: json && Array.isArray(json.dongs) ? json : { dongs: [] }, geo: geo && Array.isArray(geo.features) ? geo : null, lv, fc }); render(); });
    return null;
  }
  function scopeHTML() {
    const idx = st.ctx.index, sido = st.scope.sido, leaves = sido ? M.leavesOf(idx, sido) : [];
    const pname = s => { const p = String(s.parent || ''); return p.length === 5 ? ((idx.sigungu.find(x => String(x.code5) === p) || {}).name || '') + ' ' : ''; };
    return `<label class="map-select">범위<select data-fd-sido><option value="">전국</option>${(idx.sido || []).map(s => `<option value="${esc(s.code2)}"${String(s.code2) === sido ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` +
      (sido ? `<label class="map-select">시·군·구<select data-fd-sg><option value="">시·도 전체</option>${leaves.map(s => `<option value="${esc(s.code5)}"${String(s.code5) === st.scope.sg ? ' selected' : ''}>${esc(pname(s) + s.name)}</option>`).join('')}</select></label>` : '') +
      `<span class="map-step">단위 ${esc(UNIT[unit()])}</span>` + (st.hint ? `<p class="fd-hint" role="status">${esc(st.hint)}</p>` : '');
  }
  function render() {
    const c0 = st.ctx; if (!c0.index) return;
    let ctx = c0, e = null;
    if (st.scope.sg) { e = emdCtx(st.scope.sg); ctx = { ...c0, emd: e && e.json, lv: e && e.lv, forecast: e && e.fc }; }
    $('[data-fd-scope]').innerHTML = scopeHTML();
    $('[data-fd-chips]').innerHTML = chipsHTML(st.sel, ctx, unit());
    renderGov(ctx);
    if (st.scope.sg && !e) { $('[data-fd-out]').innerHTML = '<p class="fd-wait" data-state="loading" role="status">읍·면·동 자료를 불러오는 중입니다.</p>'; $('[data-fd-list]').innerHTML = ''; return; }
    const areas = areasOf(st.scope, ctx), ev = evaluate(areas, st.sel, ctx, unit());
    const [head, list] = resultHTML(ev, areas, ctx, unit(), st.by, st.page).split(LIST_MARK); // 큰 숫자 → 지도 → 목록 순서로 놓는다
    $('[data-fd-out]').innerHTML = head; $('[data-fd-list]').innerHTML = list || '';
    drawSvg(areas, ev, e);
    root.querySelectorAll('[data-count]').forEach(el => (M.countUp ? M.countUp(el) : null));
  }
  function drawSvg(areas, ev, e) {
    const box = $('[data-fd-map]'), key = st.scope.sg || ('s' + st.scope.sido);
    const feats = st.scope.sg ? (e && e.geo ? e.geo.features : null) : st.sgGeo ? st.sgGeo.features.filter(f => areas.some(a => a.code === String((f.properties || {}).code))) : null;
    if (!feats) { if (st.svgKey !== 'wait') { const state = boundaryState(st.scope, st.sgGeo, e); box.innerHTML = `<p class="fd-wait" data-state="${state}" role="status">${state === 'loading' ? '경계를 불러오는 중입니다.' : '경계 자료가 없습니다. 목록으로 보세요.'}</p>`; st.svgKey = 'wait'; } return; }
    if (st.svgKey !== key) {
      const sh = shapes(feats, 600);
      box.innerHTML = `<svg class="fd-svg" viewBox="0 0 ${sh.w} ${sh.h}" role="img" aria-label="${esc(UNIT[unit()])} 경계 지도. 조건에 맞는 곳은 진하게, 나머지는 흐리게. 아래 목록과 같습니다."><defs><pattern id="fdHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#eef2f0"/><line x1="0" y1="0" x2="0" y2="6" stroke="#9aa6a1" stroke-width="1.5"/></pattern></defs>` +
        sh.paths.map(p => `<path data-code="${esc(p.code)}" d="${p.d}"><title>${esc(p.name)}</title></path>`).join('') + `</svg><p class="fd-legend"><i class="is-hit"></i>조건에 맞음 <i class="is-miss"></i>맞지 않음 <i class="is-na"></i>자료 없음</p>`;
      st.svgKey = key;
    }
    box.querySelectorAll('path[data-code]').forEach(p => { const r = ev.res.get(p.dataset.code) || 'na'; p.setAttribute('class', 'is-' + r); });
  }
  // 업무별 바로 가기: 카드 → 그 조건으로 찾기. 범위는 찾기에서 고른 시·군·구, 없으면 지도에서 마지막으로 연 시·군·구, 그것도 없으면 선택 안내
  const scopeName = () => { const s = st.scope.sg ? (st.ctx.index.sigungu || []).find(x => String(x.code5) === st.scope.sg) : null; return s ? s.name : null; };
  function renderGov(ctx) {
    if (!gov) return;
    const key = `${st.scope.sg}:${ctx.lv ? 'L' : ''}${ctx.living ? 'I' : ''}${ctx.designations ? 'D' : ''}`; if (key === st.govKey) return; st.govKey = key;
    gov.innerHTML = govHTML(ctx, scopeName());
  }
  function trackHash() {
    const r = M.parseHash(location.hash), idx = st.ctx.index; if (!r || !idx) return;
    const leaf = r.gu || r.sigungu, s = leaf ? M.leavesOf(idx).find(x => String(x.code5) === String(leaf)) : null;
    if (s) st.lastSg = { sido: String(s.sido2), sg: String(s.code5) };
    st.lastDong = r.dong || null;
  }
  // 지도 해시로 보낸다. 같은 해시면 hashchange를 직접 내서 workspace.js가 지도 패널을 열게 한다
  function goMap(hash) { if (location.hash !== hash) location.hash = hash; else dispatchEvent(new HashChangeEvent('hashchange')); }
  function applyPreset(id) {
    const p = presetOf(id); if (!p) return;
    const sg = st.scope.sg || (st.lastSg && st.lastSg.sg), r = sg ? M.leafRoute(st.ctx.index, sg) : null, mapHash = r ? M.toHash({ ...r, dong: st.lastDong }) : '#map';
    if (p.action === 'safe') { if (M.showGroup) M.showGroup('safe'); goMap(mapHash); return; }
    if (p.action === 'brief') { if (M.setReportMode) M.setReportMode('brief'); if (st.lastDong) location.hash = '#report'; else goMap(mapHash); return; } // 동이 이미 골라져 있으면 근거서로 바로
    if (!st.scope.sg && st.lastSg) st.scope = { ...st.lastSg };
    st.sel = presetConds(p, unit()); st.page = 1;
    st.hint = st.scope.sg ? '' : '시·도와 시·군·구를 고르면 그 안 읍·면·동에서 찾습니다.';
    render();
    const f = root.querySelector(st.scope.sg ? '[data-fd-out]' : '[data-fd-sido]'); if (!f) return;
    // 작업공간 규칙: 화면을 강제로 스크롤하지 않는다(모바일 탭 전환이 표시를 바꾼다). 초점만 옮긴다
    (st.scope.sg ? root.querySelector('[data-fd-sort="code"]') : f)?.focus({ preventScroll: true });
  }
  const openMore = () => document.getElementById('findMore')?.setAttribute('open', ''); // 업무를 고르거나 #find로 오면 접힌 조건 칸을 연다
  if (/^#find/.test(location.hash)) openMore();
  if (gov) gov.addEventListener('click', ev => { const b = ev.target.closest('[data-gov-preset]'); if (b) { openMore(); applyPreset(b.dataset.govPreset); } });
  addEventListener('hashchange', trackHash);
  // 지금 화면의 조건·범위 그대로 XLSX를 만든다(이 브라우저 안에서만)
  function exportXlsx() {
    const msg = root.querySelector('[data-fd-xlsx-msg]'), say = t => { if (msg) msg.textContent = t; };
    let ctx = st.ctx; if (st.scope.sg) { const e = emdCtx(st.scope.sg); if (!e) { say('읍·면·동 자료를 불러오는 중입니다. 잠시 뒤 다시 눌러 주세요.'); return; } ctx = { ...st.ctx, emd: e.json, lv: e.lv, forecast: e.fc }; }
    const areas = areasOf(st.scope, ctx), ev = evaluate(areas, st.sel, ctx, unit());
    if (!ev.use.length) { say('조건을 하나 이상 고른 뒤 눌러 주세요.'); return; }
    const d = new Date(), p = n => String(n).padStart(2, '0'), day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const sg = st.scope.sg ? (st.ctx.index.sigungu || []).find(x => String(x.code5) === st.scope.sg) : null, sd = st.scope.sido ? (st.ctx.index.sido || []).find(x => String(x.code2) === st.scope.sido) : null;
    const name = `지역찾기_${DG.safeName(sg ? sg.name : sd ? sd.name : '전국')}_${day}.xlsx`;
    try { say(`${name} (${Math.max(1, Math.round(DG.saveBytes(name, DG.xlsxBytes(exportSheets(areas, ev, ctx, unit()), day), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') / 1024))}KB)를 내려받았습니다. 이 브라우저에서 만들었고 서버로 보내지 않았습니다.`); }
    catch (err) { say(`XLSX를 만들지 못했습니다: ${err.message}`); }
  }
  // OR 묶음 안의 칩을 끄면 그 칩만 빠진다(한 개 남으면 보통 조건이 된다)
  const dropId = (sel, id) => sel.map(g => (Array.isArray(g) ? g.filter(x => x !== id) : g)).filter(g => (Array.isArray(g) ? g.length : g !== id)).map(g => (Array.isArray(g) && g.length === 1 ? g[0] : g));
  root.addEventListener('click', ev => {
    if (ev.target.closest('[data-fd-relax]')) {
      const removed = st.sel.pop(), rid = Array.isArray(removed) ? removed[0] : removed; st.page = 1; render();
      root.querySelector(`[data-fd-cond="${CSS.escape(rid || '')}"]`)?.focus({ preventScroll: true }); return;
    }
    const b = ev.target.closest('[data-fd-cond]');
    if (b) { const id = b.dataset.fdCond, on = st.sel.flat().includes(id); if (b.getAttribute('aria-disabled') === 'true' && !on) return; st.sel = on ? dropId(st.sel, id) : [...st.sel, id]; st.page = 1; render(); root.querySelector(`[data-fd-cond="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); return; }
    if (ev.target.closest('[data-fd-xlsx]')) { exportXlsx(); return; }
    const s = ev.target.closest('[data-fd-sort]'); if (s) { st.by = s.dataset.fdSort; st.page = 1; render(); root.querySelector(`[data-fd-sort="${st.by}"]`)?.focus({ preventScroll: true }); return; }
    const p = ev.target.closest('[data-fd-page]');
    if (p && !p.disabled) {
      const current = Number(root.querySelector('[aria-current="page"]')?.dataset.fdPage || st.page);
      if (p.dataset.fdPage === 'prev' || p.dataset.fdPage === 'next') st.page = current + (p.dataset.fdPage === 'next' ? 1 : -1);
      else st.page = Number(p.dataset.fdPage);
      render(); root.querySelector('[data-fd-list-start]')?.focus({ preventScroll: true }); return;
    }
    const shape = ev.target.closest('path[data-code]');
    if (shape && !st.scope.sg) { const sg = (st.ctx.index.sigungu || []).find(x => String(x.code5) === shape.dataset.code); if (sg) { st.scope = { sido: String(sg.sido2), sg: String(sg.code5) }; st.page = 1; render(); } return; }
    if (shape && st.scope.sg) { const r = M.leafRoute(st.ctx.index, st.scope.sg); if (r) location.hash = M.toHash({ ...r, dong: shape.dataset.code }); return; }
    // 해시를 바꾸면 map.js가 그 단계로 그리고 workspace.js가 지도 패널을 연다.
    if (ev.target.closest('[data-fd-go]')) return;
  });
  root.addEventListener('change', ev => {
    const s = ev.target.closest('select'); if (!s) return;
    if ('fdSido' in s.dataset) { st.scope = { sido: s.value, sg: '' }; st.page = 1; }
    else if ('fdSg' in s.dataset) { st.scope = { sido: st.scope.sido, sg: s.value }; st.page = 1; }
    if (st.scope.sg) st.hint = '';
    render(); root.querySelector(s.hasAttribute('data-fd-sido') ? '[data-fd-sido]' : '[data-fd-sg]')?.focus({ preventScroll: true });
  });
  const ok = (j, k) => (j && Array.isArray(j[k]) ? j : null);
  Promise.all(['index.json', 'living/index.json', 'designations.json', 'migration.json', 'forecast/index.json', 'realestate.json'].map(f => fetchJson('data/national/' + f)))
    .then(([index, li, des, mig, fi, re]) => {
      st.ctx = { index: ok(index, 'sigungu'), living: ok(li, 'indicators'), designations: ok(des, 'items'), migration: ok(mig, 'sigungu'), forecastIdx: ok(fi, 'horizons'), realestate: ok(re, 'sigungu') };
      if (!st.ctx.index) { root.innerHTML = '<div class="fd-empty" data-state="error" role="alert"><img src="mascot/crew/ieum-search.svg" width="104" height="104" alt="" aria-hidden="true"><p>전국 원장 자료를 불러오지 못했습니다.<br>네트워크를 확인한 뒤 다시 열어 주세요.</p></div>'; return; }
      st.sgGeo = undefined; trackHash(); render();
      fetchJson('data/national/sigungu.geojson').then(g => { st.sgGeo = g && Array.isArray(g.features) ? g : null; st.svgKey = ''; render(); });
    });
})();
