/* 리뉴맵 전국 드릴다운 지도. 전국 › 광역 › 기초 › (일반구·행정시) › 읍·면·동 — 법적 체계 그대로(SCHEMA.md '행정구역 체계').
   값은 data/national/index.json(시군구 summary)·emd/{code5}.json(행정동 시계열)에서만 온다. 합산·평균·순위를 만들지 않는다.
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
  // 구간은 시행령 제17조 기준값에 고정한다(값 순 정렬·분위 금지, D13). 기준 아래는 회청색 2단계, 위는 주황→진홍 3단계.
  // 요건 충족 수는 Okabe-Ito 노랑·주황·진홍: 색상과 밝기가 함께 바뀌어 색각 이상에서도 읽힌다.
  const NULL_COLOR = '#9aa6a1';
  const BELOW = ['#e3e9ee', '#9fb4c7'], ABOVE = ['#f5b060', '#e07a1f', '#b3261e'];
  const MET = ['#d3dbd7', '#f0e442', '#e69f00', '#d55e00'];
  const DIVERGE = ['#0b7f6f', '#8fcfc3', '#e9ecea', '#f2a07a', '#b3261e']; // 개선 청록 ↔ 악화 진홍, 가운데 중성
  const INDICATORS = [
    { code: 'DECLINE_AGING_20Y_PCT', label: '노후건축물비율', unit: '%', edges: [30, 50, 60, 70], colors: [...BELOW, ...ABOVE],
      title: '20년 이상 건축물 비율 · 기준 50%(시행령 제17조)', worseUp: true, domain: [0, 100] },
    { code: 'DECLINE_MET_COUNT', label: '요건 충족 수(하한)', unit: '개', edges: [1, 2, 3], colors: MET, labels: ['0개', '1개', '2개', '3개'],
      title: '시행령 제17조 요건 충족 수 · 확정된 요건만 센 하한(사업체 요건은 2022년까지만 있어 미확정) · 판정 아님', worseUp: true, domain: [0, 3], dEdges: [-1.5, -0.5, 0.5, 1.5], dLabels: ['2개 이상 줄어듦', '1개 줄어듦', '변화 없음', '1개 늘어남', '2개 이상 늘어남'] },
    { code: 'DECLINE_POP_DROP30Y_PCT', label: '인구 감소율(30년)', unit: '%', edges: [0, 10, 20, 30], colors: [BELOW[0], BELOW[1], ...ABOVE],
      title: '주민등록 인구 30년 최대 대비 감소율 · 기준 20%(시행령 제17조) · KOSIS', worseUp: true, domain: [-20, 60] },
    { code: 'DECLINE_POP_CHANGE_PCT', label: '인구변화율', unit: '%', edges: [-20, -10, 0, 10], colors: [ABOVE[2], ABOVE[1], ABOVE[0], BELOW[1], BELOW[0]],
      title: '주민등록 인구 변화율 · 기준 −20%(시행령 제17조)', worseUp: false, domain: [-50, 50] },
    { code: 'DECLINE_BIZ_DROP10Y_PCT', label: '사업체 감소율', unit: '%', edges: [0, 5, 10, 20], colors: [BELOW[0], BELOW[1], ...ABOVE],
      title: '사업체 10년 최대 대비 감소율 · 기준 5%(시행령 제17조)', worseUp: true, domain: [-20, 40] },
  ];
  const MODES = [['now', '현재'], ['trend', '5년 변화']];
  const indOf = code => INDICATORS.find(i => i.code === code) || INDICATORS[0];
  const keyOf = (ind, mode) => (mode === 'trend' ? ind.code + '_DELTA5Y' : ind.code);
  function binIndex(v, edges) {
    if (!isNum(v)) return -1;
    let i = 0;
    while (i < edges.length && v >= edges[i]) i++;
    return i;
  }
  const pm = v => (v < 0 ? '−' + Math.abs(v) : String(v));
  function edgeLabels(edges, unit) {
    return edges.map((e, i) => (i === 0 ? `${pm(e)}${unit} 미만` : `${pm(edges[i - 1])}~${pm(e)}${unit}`)).concat(`${pm(edges[edges.length - 1])}${unit} 이상`);
  }
  // 지표+모드 → 구간·색·범례 글자. 추세는 발산형(개선↔악화), 지표의 방향(worseUp)에 따라 뒤집는다
  function scaleFor(ind, mode) {
    if (mode === 'trend') {
      const edges = ind.dEdges || [-10, -3, 3, 10], unit = ind.dEdges ? '' : '%p';
      const labels = ind.dLabels || ['10%p 이상 줄어듦', '3~10%p 줄어듦', '±3%p 안', '3~10%p 늘어남', '10%p 이상 늘어남'];
      return { edges, colors: ind.worseUp ? DIVERGE : [...DIVERGE].reverse(), labels, unit, title: `${ind.label} 5년 변화 · 청록 개선 · 진홍 악화` };
    }
    return { edges: ind.edges, colors: ind.colors, labels: ind.labels || edgeLabels(ind.edges, ind.unit), unit: ind.unit, title: ind.title };
  }
  const colorOf = (v, scale) => { const b = binIndex(v, scale.edges); return b < 0 ? NULL_COLOR : scale.colors[b]; };
  function legendItems(ind, mode) {
    const s = scaleFor(ind, mode);
    return s.colors.map((color, i) => ({ color, label: s.labels[i] })).concat({ color: NULL_COLOR, label: '자료 없음·비공개', hatch: true });
  }
  // 추세 화살표: 값이 늘면 ▲, 줄면 ▼. 개선/악화는 지표 방향으로 정한다
  function trendText(delta, ind) {
    if (!isNum(delta)) return null;
    if (Math.abs(delta) < 1e-9) return { arrow: '→', word: '변화 없음', cls: 'same' };
    const up = delta > 0, worse = up === ind.worseUp;
    return { arrow: up ? '▲' : '▼', word: worse ? '악화' : '개선', cls: worse ? 'worse' : 'better' };
  }

  // ── 해시·단계 ──
  // #map/26/26350/2635057000 · 일반구: #map/41/41110/41111/4111151000 (2자리 시도, 5자리 기초, 5자리 일반구·행정시, 7~10자리 동)
  function parseHash(hash) {
    const m = /^#map((?:\/\d+)*)$/.exec(String(hash || ''));
    if (!m) return null;
    const r = { sido: null, sigungu: null, gu: null, dong: null };
    for (const p of m[1].split('/').filter(Boolean)) {
      if (p.length === 2 && !r.sido) r.sido = p;
      else if (p.length === 5 && r.sido && !r.sigungu && p.startsWith(r.sido)) r.sigungu = p;
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

  // ── 모델 ──
  // 시군구 색: index.json summary 값만 쓴다(행정동 값을 모아 계산하지 않는다)
  function summaryOf(sg, key) {
    const s = sg && sg.summary && sg.summary[key];
    return s && typeof s === 'object' ? { value: isNum(s.value) ? s.value : null, year: s.year ?? null, status: s.status || null } : { value: null, year: null, status: null };
  }
  function sigunguModel(sgs, ind, mode) {
    const scale = scaleFor(ind, mode), key = keyOf(ind, mode);
    return (sgs || []).map(sg => { const s = summaryOf(sg, key); return { code: String(sg.code5), name: sg.name, kind: sg.kind || null, value: s.value, year: s.year, status: s.status, text: fmt(s.value, scale.unit) || '자료 없음', color: colorOf(s.value, scale), bbox: sg.bbox || null }; });
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
  function dongModel(emd, ind, mode, year) {
    const scale = scaleFor(ind, mode), key = keyOf(ind, mode), dongs = (emd && Array.isArray(emd.dongs) ? emd.dongs : []);
    const unmatched = new Set(((emd && emd.unmatched) || []).map(u => String(u && typeof u === 'object' ? u.code : u)));
    return dongs.map(d => {
      const s = seriesOf(d, key), y = year ?? latestYear(s), v = y === null ? null : valueAt(s, y);
      return { code: String(d.code7 ?? d.code), name: d.name, kind: d.kind || null, value: v, year: y, text: fmt(v, scale.unit) || '자료 없음', color: colorOf(v, scale), unmatched: unmatched.has(String(d.code7 ?? d.code)) };
    });
  }
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
    const dom = scale.edges === ind.edges ? ind.domain : [scale.edges[0], scale.edges[scale.edges.length - 1]]; // 추세는 발산 구간 양끝
    const lo = Math.min(dom[0], ...vals.map(v => v.value)), hi = Math.max(dom[1], ...vals.map(v => v.value)), span = hi - lo || 1;
    const X = v => pad + (v - lo) / span * (W - 2 * pad);
    const ticks = scale.edges.filter(e => e >= lo && e <= hi).map(e => `<line class="map-strip-tick" x1="${X(e).toFixed(1)}" x2="${X(e).toFixed(1)}" y1="4" y2="${H - 4}"/>`).join('');
    const dots = vals.map((it, i) => `<circle class="${it.code === selected ? 'is-sel' : ''}" cx="${X(it.value).toFixed(1)}" cy="${(H / 2 + ((i % 3) - 1) * 6).toFixed(1)}" r="${it.code === selected ? 6 : 4}" fill="${it.color}"><title>${esc(it.name)} ${esc(it.text)}</title></circle>`).join('');
    const sel = vals.find(it => it.code === selected);
    return `<svg class="map-strip" viewBox="0 0 ${W} ${H}" role="img" aria-label="같은 시군구 ${vals.length}개 동의 분포${sel ? `, 선택한 ${esc(sel.name)} ${esc(sel.text)}` : ''}. 순위가 아닙니다.">${ticks}${dots}</svg>`;
  }
  function tooltipHTML(it, ind, mode, year, source) {
    const t = mode === 'trend' ? trendText(it.value, ind) : null;
    return `<b>${esc(it.name)}</b>${it.kind ? ` <small>${esc(it.kind)}</small>` : ''}<br>${esc(ind.label)}${mode === 'trend' ? ' 5년 변화' : ''} ${esc(it.text)}${t ? ` ${t.arrow} ${t.word}` : ''}<br>${it.year ? `${esc(it.year)}년 · ` : ''}${esc(source || SOURCE_DEFAULT)}`;
  }
  function legendHTML(ind, mode, source, year) {
    const s = scaleFor(ind, mode);
    return `<div class="map-legend"><p class="map-legend-title">${esc(s.title)}</p><ul aria-label="지도 색 구간">${legendItems(ind, mode).map(l =>
      `<li><i class="${l.hatch ? 'is-hatch' : ''}" style="background:${l.color}"></i>${esc(l.label)}</li>`).join('')}</ul>` +
      `<p class="map-legend-note">판정 아님 · 출처 ${esc(source || SOURCE_DEFAULT)} · 기준연도 ${esc(year ?? '자료 없음')}</p></div>`;
  }
  const liveText = (v, it, ind, mode) => `${v.crumbs.map(c => c.label).join(' › ')}${it ? ` › ${it.name}. ${ind.label}${mode === 'trend' ? ' 5년 변화' : ''} ${it.text}${it.year ? `, ${it.year}년` : ''}.` : `. ${v.step ? v.step + ' 단계' : ''}`}`;

  const api = { INDICATORS, MODES, NULL_COLOR, SOURCE_DEFAULT, indOf, keyOf, binIndex, edgeLabels, scaleFor, colorOf, legendItems, trendText, parseHash, toHash, childrenOf, resolve, summaryOf, sigunguModel, seriesOf, valueAt, latestYear, yearsOf, dongModel, sparkline, strip, tooltipHTML, legendHTML, liveText, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewMap = api;

  // ── 브라우저 ──
  const app = document.getElementById('mapApp'); if (!app) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, coarse = matchMedia('(pointer: coarse)').matches;
  const fetchJson = url => (window.renewFetch ? window.renewFetch(url) : fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const state = { route: parseHash(location.hash) || {}, ind: INDICATORS[0].code, mode: 'now', year: null, playing: false, index: undefined, sgGeo: undefined, sidoGeo: undefined, dash: null, mapErr: false };
  const emdCache = new Map(); // code5 → Promise<{geo, json}> : 행정동은 시군구별 지연 로드, 한 번만
  function loadEmd(code5) {
    let p = emdCache.get(code5);
    if (!p) {
      p = Promise.all([fetchJson(`data/national/emd/${code5}.geojson`), fetchJson(`data/national/emd/${code5}.json`)])
        .then(([geo, json]) => {
          // 경계 파일이 아직 없고 .json이 FeatureCollection이면 경계로만 쓴다(값 없음 → 빗금)
          if (!geo && json && Array.isArray(json.features)) geo = json;
          p.done = { geo: geo && Array.isArray(geo.features) ? geo : null, json: json && Array.isArray(json.dongs) ? json : null }; return p.done; });
      emdCache.set(code5, p);
    }
    return p;
  }
  // 받아 둔 행정동 자료. 아직이면 null을 주고, 도착하면 한 번만 다시 그린다
  const emdOf = code5 => { const p = loadEmd(code5); if (p.done) return p.done; if (!p.hooked) { p.hooked = true; p.then(() => render()); } return null; };
  let timer = null;

  function emptyHTML(title, lines, mascot) {
    return `<div class="map-empty" role="status">${mascot ? '<img src="mascot/taggy-waiting.svg" width="120" height="148" alt="" aria-hidden="true">' : ''}<h3>${esc(title)}</h3>${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  }
  const seg = (key, list, cur, label) => `<div class="dash-seg map-seg" role="group" aria-label="${label}">${list.map(([val, txt]) => `<button type="button" data-${key}="${val}" aria-pressed="${cur === val}">${txt}</button>`).join('')}</div>`;
  const selectHTML = (key, label, list, cur, top) => `<label class="map-select">${label}<select data-${key}>${top ? `<option value="">${top}</option>` : ''}${list.map(o => `<option value="${esc(o.code)}" ${String(o.code) === String(cur) ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`;

  // 현재 단계에서 지도에 색을 칠할 항목(시군구 summary 또는 행정동)과 연도 범위
  function model(v) {
    const ind = indOf(state.ind);
    if (v.level === 'emd') {
      const e = emdOf(v.emdCode);
      if (e === null) return { kind: 'wait' };
      if (!e.json && !e.geo) return { kind: 'noemd' };
      const json = e.json || { dongs: [] }, years = yearsOf(json), year = state.year !== null && years && state.year >= years.min && state.year <= years.max ? state.year : null;
      const items = dongModel(json, ind, state.mode, year);
      return { kind: 'emd', items, years, year: year ?? (items.find(i => i.year)?.year ?? null), geo: e.geo, json, nodata: !e.json };
    }
    const list = v.level === 'nation' ? state.index.sigungu.filter(s => !s.parent || String(s.parent).length === 2) : v.children;
    const items = sigunguModel(list, ind, state.mode);
    return { kind: 'sg', items, year: items.find(i => i.year)?.year ?? null };
  }
  function panelHTML(v, m) {
    const ind = indOf(state.ind), scale = scaleFor(ind, state.mode), src = state.index.source && state.index.source.name;
    if (m.kind === 'wait') return `<div class="map-panel-wait">행정동 자료를 불러오는 중입니다.</div>`;
    if (m.kind === 'noemd') return emptyHTML(`${v.crumbs[v.crumbs.length - 1].label} · 행정동 자료 준비 중`, ['이 지역의 행정동 시계열이 아직 없습니다.', '준비되기 전에는 숫자를 보여 드리지 않습니다.']);
    if (m.kind === 'emd' && m.nodata) return emptyHTML(`${v.crumbs[v.crumbs.length - 1].label} · 행정동 자료 준비 중`, ['경계는 있지만 지표 시계열이 아직 없습니다.', '준비되기 전에는 숫자를 보여 드리지 않습니다.']);
    if (m.kind !== 'emd') return `<p class="map-guide"><b>${esc(v.step)} 단계</b>입니다.<br>지도에서 ${v.level === 'nation' ? '시·도' : v.level === 'gu' ? '일반구·행정시' : '시·군·구'}를 누르거나 아래 목록에서 고르세요.<br>색은 ${esc(ind.label)}${state.mode === 'trend' ? ' 5년 변화' : ''}의 고정 구간이며 판정이 아닙니다.</p>`;
    const it = m.items.find(x => x.code === v.dong);
    if (!it) return `<p class="map-guide">동을 누르면 2000년부터의 시계열과 출처가 열립니다.</p><h4 class="map-h4">${esc(v.crumbs[v.crumbs.length - 1].label)} 동 분포 <small>순위 아님 · ${esc(m.year ?? '')}년</small></h4>${strip(m.items, null, ind, scale)}` + hubHTML(v);
    const dong = m.json.dongs.find(d => String(d.code7 ?? d.code) === it.code), cells = Array.isArray(dong.cells) ? dong.cells : [];
    const cell = cells.find(c => c.indicator_code === keyOf(ind, state.mode)) || cells.find(c => c.indicator_code === ind.code) || null;
    const num = isNum(it.value) ? `<b data-count="${it.value}">${esc(nf(digitsOf(it.value)).format(0))}</b><small>${esc(scale.unit)}</small>` : `<b class="is-text">${esc(it.text)}</b>`;
    const t = state.mode === 'trend' ? trendText(it.value, ind) : null;
    const sparks = INDICATORS.slice(1).map(i => { const s = seriesOf(dong, i.code), d5 = valueAt(seriesOf(dong, i.code + '_DELTA5Y'), m.year), tt = trendText(d5, i);
      return `<div class="map-spark-row"><div class="map-spark-head"><span>${esc(i.label)}</span><b>${esc(fmt(valueAt(s, m.year), i.unit) || '자료 없음')}</b>${tt ? `<em class="map-trend ${tt.cls}">${tt.arrow} 5년 ${esc(fmt(d5, i.dEdges ? '' : '%p'))} ${tt.word}</em>` : ''}</div>${sparkline(s, m.year, i.label)}</div>`; }).join('');
    const D = window.RenewDashboard, rows = D && cell ? D.detailRows(cell) : [];
    const detail = rows.length ? `<details class="map-detail"><summary>출처·기준일·계산식 보기</summary><dl>${rows.map(([k, val, href]) => `<div><dt>${esc(k)}</dt><dd>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(val)}</a>` : esc(val)}</dd></div>`).join('')}</dl></details>`
      : `<p class="map-note">이 지표의 원장 셀 상세가 아직 없습니다.</p>`;
    return `<h3 class="map-h3">${esc(it.name)} <small>${esc(it.kind || '행정동')} · ${esc(it.code)}</small></h3>` +
      `<p class="map-bignum"><span class="k">${esc(ind.label)}${state.mode === 'trend' ? ' 5년 변화' : ''} · ${esc(m.year ?? '')}년</span><span class="n">${num}${t ? ` <em class="map-trend ${t.cls}">${t.arrow} ${t.word}</em>` : ''}</span>${cell && cell.status ? `<span class="tag ${({ '확인': 'ok', '충돌': 'conflict', '추가확인': 'check' })[cell.status] || 'none'}">${esc(cell.status)}</span>` : ''}</p>` +
      `<h4 class="map-h4">2000~2024 시계열</h4>${sparks}` +
      `<h4 class="map-h4">${esc(v.crumbs[v.crumbs.length - 1].label)} 동 분포 <small>순위 아님 · ${esc(m.year ?? '')}년</small></h4>${strip(m.items, it.code, ind, scale)}` +
      detail + hubHTML(v);
  }
  // 건축HUB 3기준(dashboard.json, 법정동)은 수집된 시군구에서만 별도 섹션으로. 행정동 값과 합치지 않는다
  function hubHTML(v) {
    const D = window.RenewDashboard, dash = state.dash;
    if (!D || !dash || !v.emdCode) return '';
    const node = v.gu || v.sigungu, mois = node ? String(node.mois_code5 || node.code5) : v.emdCode; // dashboard.json은 행안부 코드
    const sg = (dash.sigungu || []).find(s => String(s.code) === mois && s.status === '수집됨'); if (!sg) return '';
    const dongs = (dash.dongs || []).filter(d => d.sigungu_code === sg.code).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    return `<h4 class="map-h4">건축물대장 3기준 <small>법정동 · 건축HUB</small></h4><p class="map-note">법정동은 행정동과 경계가 달라 따로 보여 줍니다.<br>이름을 누르면 카드 보기에서 근거가 열립니다.</p>` +
      `<ul class="map-hub">${dongs.map(d => { const c = D.cellView(D.cellOf(d, 20, 'COUNT')); return `<li><a href="#dashboard/${esc(sg.code)}/${esc(d.code)}">${esc(d.name)}</a><span>20년 동수 ${esc(c.text)}</span></li>`; }).join('')}</ul>`;
  }
  function render() {
    const v = resolve(state.index, state.route);
    if (state.index === undefined) { app.innerHTML = `<div class="map-canvas is-wait">전국 자료를 불러오는 중입니다.</div>`; return; }
    if (v.level === 'empty') { document.body.classList.add('map-empty'); app.innerHTML = emptyHTML('전국 데이터 준비 중', ['원장에서 내보낸 숫자만 이 자리에 보여 드립니다.', '준비되면 전국에서 읍·면·동까지 내려가 볼 수 있습니다.'], true); return; }
    document.body.classList.remove('map-empty');
    const ind = indOf(state.ind), m = model(v), src = state.index.source && state.index.source.name;
    const it = m.kind === 'emd' && v.dong ? m.items.find(x => x.code === v.dong) : null;
    const crumbs = `<nav class="map-crumbs" aria-label="현재 위치"><ol>${v.crumbs.map((c, i) => i === v.crumbs.length - 1 && !it ? `<li aria-current="page">${esc(c.label)}</li>` : `<li><a href="${esc(c.hash)}">${esc(c.label)}</a></li>`).join('')}${it ? `<li aria-current="page">${esc(it.name)}</li>` : ''}</ol><span class="map-step">${esc(v.step)} 단계</span></nav>`;
    const ctl = `<div class="map-ctl">${seg('ind', INDICATORS.map(i => [i.code, i.label]), state.ind, '지표')}${seg('mode', MODES, state.mode, '현재 또는 5년 변화')}` +
      (m.kind === 'emd' && m.years ? `<div class="map-year"><button type="button" class="map-play" data-play aria-pressed="${state.playing}" aria-label="${state.playing ? '재생 멈춤' : `${m.years.min}년부터 ${m.years.max}년까지 재생`}">${state.playing ? '❚❚' : '▶'}</button><label>연도 <b>${esc(m.year ?? '')}</b><input type="range" data-year min="${m.years.min}" max="${m.years.max}" step="1" value="${m.year ?? m.years.max}"></label></div>` : `<p class="map-year-note">시군구 색은 최신 연도(${esc(m.year ?? '자료 없음')}) 기준입니다.</p>`) + '</div>';
    const opts = (list, key) => list.map(x => ({ code: x[key], name: x.name }));
    const sidoSel = selectHTML('sido', '시·도', opts(state.index.sido || [], 'code2'), v.sido && v.sido.code2, '전국');
    const kids = v.sido ? childrenOf(state.index, v.sido.code2) : [];
    const sgSel = kids.length && !(v.sido.kind === '특별자치시' && kids.length === 1) ? selectHTML('sg', '시·군·구', opts(childrenOf(state.index, v.sido.code2), 'code5'), v.sigungu && v.sigungu.code5, '고르기') : '';
    const guSel = v.sigungu && childrenOf(state.index, v.sigungu.code5).length ? selectHTML('gu', '일반구·행정시', opts(childrenOf(state.index, v.sigungu.code5), 'code5'), v.gu && v.gu.code5, '고르기') : '';
    const chips = m.kind === 'emd' ? `<div class="dash-chips dash-dongs map-list" role="group" aria-label="읍·면·동">${m.items.map(x => `<button type="button" class="dash-chip" data-dong="${esc(x.code)}" aria-pressed="${x.code === v.dong}">${esc(x.name)}</button>`).join('')}</div>` : '';
    const canvas = state.mapErr ? emptyHTML('지도를 불러오지 못했습니다', ['네트워크를 확인한 뒤 다시 열어 주세요.', '아래 목록으로는 계속 고를 수 있습니다.']) : '<div data-map-slot></div>';
    app.innerHTML = `<div class="map-grid"><div class="map-main">${crumbs}${ctl}${canvas}` +
      `<p class="map-hint">${coarse ? '두 손가락으로 지도를 움직이고 확대합니다.' : '끌어서 움직이고, + − 버튼으로 확대합니다.'}<br>지도 대신 아래 목록으로도 고를 수 있습니다.</p>` +
      legendHTML(ind, state.mode, src, m.year) + `<div class="map-selects">${sidoSel}${sgSel}${guSel}</div>${chips}<p class="map-live" aria-live="polite">${esc(liveText(v, it, ind, state.mode))}</p></div>` +
      `<aside class="map-panel" aria-label="선택한 지역의 숫자">${panelHTML(v, m)}</aside></div>`;
    if (!state.mapErr) drawMap(v, m);
    app.querySelectorAll('[data-count]').forEach(countUp);
  }
  function countUp(el) {
    const target = +el.dataset.count, d = digitsOf(target), f = nf(d), t0 = performance.now(), dur = 700;
    if (reduced) { el.textContent = f.format(target); return; }
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); el.textContent = f.format(target * e); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // Leaflet 지도는 한 번 만들고 render()마다 자리(slot)에 다시 붙인다. 시군구 GeoJSON 레이어도 한 번만 만든다
  let M = null;
  function drawMap(v, m) {
    const slot = app.querySelector('[data-map-slot]'); if (!slot) return;
    const wait = msg => { slot.className = 'map-canvas is-wait'; slot.textContent = msg; };
    if (state.sgGeo === undefined) { wait('경계를 불러오는 중입니다.'); return; }
    if (!state.sgGeo) { slot.outerHTML = emptyHTML('경계 자료 준비 중', ['시군구 경계가 아직 없습니다.', '아래 목록으로 숫자는 볼 수 있습니다.']); return; }
    const D = window.RenewDashboard;
    if (!window.L) { wait('지도를 불러오는 중입니다.'); (D ? D.loadLeaflet() : Promise.reject()).then(render, () => { state.mapErr = true; render(); }); return; }
    const L = window.L, ind = indOf(state.ind), src = state.index.source && state.index.source.name;
    if (!M) {
      const el = document.createElement('div'); el.className = 'map-canvas'; el.setAttribute('role', 'region');
      el.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="rmHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#d4dbd8"/><line x1="0" y1="0" x2="0" y2="6" stroke="#6b7a75" stroke-width="2"/></pattern></defs></svg>');
      slot.replaceWith(el);
      const map = L.map(el, { dragging: !coarse, scrollWheelZoom: false, zoomSnap: 0.5, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      const sido = state.sidoGeo ? L.geoJSON(state.sidoGeo, { interactive: false, style: { color: '#153c39', weight: 2, fill: false } }).addTo(map) : null;
      const sg = L.geoJSON(state.sgGeo, { style: { weight: 1, color: '#fff' }, onEachFeature: (f, layer) => {
        layer.bindTooltip(() => { const it = M.sgItems.get(String(f.properties.code)); return it ? tooltipHTML(it, indOf(state.ind), state.mode, null, src) : `<b>${esc(f.properties.name)}</b>`; }, { sticky: true });
        layer.on('click', () => { const code = String(f.properties.code), s = sgOf(state.index, code); if (!s || !M.sgItems.has(code)) return; const r = { sido: String(s.sido2) };
          if (String(s.parent || '').length === 5) { r.sigungu = String(s.parent); r.gu = code; } else if (state.route.sido === r.sido) r.sigungu = code;
          go(r); });
      } }).addTo(map);
      M = { el, map, sg, sido, emd: null, emdCode: null, sgItems: new Map(), fitKey: null };
    } else { slot.replaceWith(M.el); M.map.invalidateSize(); }
    M.el.setAttribute('aria-label', `${v.crumbs.map(c => c.label).join(' › ')} ${ind.label} 지도. 아래 목록으로도 고를 수 있습니다.`);
    // 시군구 레이어: 현재 단계의 항목만 색, 나머지는 옅게
    M.sgItems = new Map((m.kind === 'sg' ? m.items : []).map(it => [it.code, it]));
    const active = new Set(M.sgItems.keys()), inEmd = m.kind === 'emd';
    M.sg.eachLayer(l => { const code = String((l.feature.properties || {}).code), it = M.sgItems.get(code), on = active.has(code);
      l.setStyle(on ? { fillColor: it.value === null ? 'url(#rmHatch)' : it.color, fillOpacity: 0.8, color: '#fff', weight: 1, dashArray: it.value === null ? '4 3' : null }
        : { fillColor: '#c9d3cf', fillOpacity: inEmd ? 0.05 : 0.15, color: '#fff', weight: 0.5, dashArray: null });
      if (on) l.bringToFront(); });
    // 행정동 레이어: 시군구가 바뀔 때만 다시 만들고, 연도·지표는 setStyle로만 바꾼다(CSS transition 300ms)
    if (inEmd && m.geo) {
      if (!M.emd || M.emdCode !== v.emdCode) {
        if (M.emd) M.emd.remove();
        M.emd = L.geoJSON(m.geo, { style: { weight: 1.5, color: '#fff' }, onEachFeature: (f, layer) => {
          layer.bindTooltip(() => { const it = M.emdItems.get(String((f.properties || {}).code)); return it ? tooltipHTML(it, indOf(state.ind), state.mode, it.year, src) : `<b>${esc((f.properties || {}).name)}</b><br>지표와 코드가 맞지 않는 동`; }, { sticky: true });
          layer.on('click', () => { const code = String((f.properties || {}).code); if (M.emdItems.has(code)) go({ ...state.route, dong: code }); });
        } }).addTo(M.map);
        M.emdCode = v.emdCode;
      }
      M.emdItems = new Map(m.items.map(it => [it.code, it]));
      M.emd.eachLayer(l => { const code = String((l.feature.properties || {}).code), it = M.emdItems.get(code), sel = code === v.dong;
        l.setStyle({ fillColor: !it || it.value === null ? 'url(#rmHatch)' : it.color, fillOpacity: 0.82, color: sel ? '#153c39' : '#fff', weight: sel ? 3 : 1.5, dashArray: !it || it.value === null ? '4 3' : null });
        if (sel) l.bringToFront(); });
    } else if (M.emd) { M.emd.remove(); M.emd = null; M.emdCode = null; }
    // 단계가 바뀔 때만 화면을 맞춘다(연도 재생 중에는 움직이지 않는다)
    const key = v.level + ':' + m.kind + ':' + (v.emdCode || (v.sigungu && v.sigungu.code5) || (v.sido && v.sido.code2) || ''); // 행정동 자료가 도착하면 그때 다시 맞춘다
    if (M.fitKey !== key) {
      M.fitKey = key;
      let b = null;
      if (inEmd && M.emd) b = M.emd.getBounds();
      else { const fg = L.featureGroup(); M.sg.eachLayer(l => { if (active.has(String((l.feature.properties || {}).code))) fg.addLayer(l); }); b = fg.getLayers().length ? fg.getBounds() : M.sg.getBounds(); }
      if (b && b.isValid()) M.map.fitBounds(b.pad(0.08), { maxZoom: 14, animate: !reduced });
    }
  }
  function go(route, focusSel) {
    stopPlay();
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
  app.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#map"]');
    if (a) { e.preventDefault(); go(parseHash(a.getAttribute('href')) || {}); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ind) { state.ind = b.dataset.ind; render(); app.querySelector(`[data-ind="${b.dataset.ind}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.mode) { state.mode = b.dataset.mode; render(); app.querySelector(`[data-mode="${b.dataset.mode}"]`)?.focus({ preventScroll: true }); }
    else if (b.dataset.dong) go({ ...state.route, dong: b.dataset.dong }, `.map-list [data-dong="${b.dataset.dong}"]`);
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
  addEventListener('hashchange', () => { const r = parseHash(location.hash); if (r) { state.route = r; render(); } });

  render();
  Promise.all([fetchJson('data/national/index.json'), fetchJson('data/dashboard.json')]).then(([index, dash]) => {
    state.index = index && Array.isArray(index.sigungu) ? index : null; state.dash = dash;
    render();
    if (!state.index) return;
    if (parseHash(location.hash) && location.hash !== '#map') app.scrollIntoView({ block: 'start' });
    Promise.all([fetchJson('data/national/sigungu.geojson'), fetchJson('data/national/sido.geojson')]).then(([sg, sido]) => {
      state.sgGeo = sg && Array.isArray(sg.features) ? sg : null; state.sidoGeo = sido && Array.isArray(sido.features) ? sido : null; render();
    });
  });
})();
