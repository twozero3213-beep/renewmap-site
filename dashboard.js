/* 리뉴맵 동네 노후도 대시보드. 화면 숫자는 data/dashboard.json(원장 셀 export)에서만 온다(SCHEMA.md).
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부다. 빌드 없이 <script>로 싣는다. */
(function () {
  'use strict';
  const BASES = [['COUNT', '동수'], ['AREA', '연면적'], ['HH', '세대']];
  const YEARS = [20, 30];
  const STATUS_CLASS = { '확인': 'ok', '충돌': 'conflict', '추가확인': 'check' };
  const NOTE = '건축물대장 기준 노후 건축물 비율이며, 판정 결과가 아닙니다.';
  const nf = d => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byCode = (a, b) => String(a.code).localeCompare(String(b.code));
  const isNum = v => typeof v === 'number' && Number.isFinite(v);

  // 소수 한 자리까지. 카운트업 중 자릿수가 흔들리지 않게 목표값의 자릿수를 고정해 쓴다
  function digitsOf(v) { return Math.round(v * 10) % 10 === 0 ? 0 : 1; }
  function formatValue(v, unit, d) { return isNum(v) ? nf(d ?? digitsOf(v)).format(v) + (unit || '') : null; }
  function shortHash(h) { return /^[0-9a-f]{8,}$/i.test(h || '') ? h.slice(0, 8) : '–'; }
  function cellOf(dong, years, basis) {
    return ((dong && dong.cells) || []).find(c => c.indicator_code === `AGING_${years}Y_${basis}`) || null;
  }
  // 값이 숨겨졌거나(null) 셀이 없으면 숫자를 만들지 않고 이유를 보여 준다
  function cellView(cell) {
    if (!cell) return { value: null, text: '셀 없음', note: '이 지표의 원장 셀이 아직 없습니다.', status: '셀 없음', cls: 'none' };
    const text = formatValue(cell.value, cell.unit);
    return {
      value: text ? cell.value : null,
      text: text || (cell.value_hidden_reason ? '비공개' : '결측'),
      note: text ? '' : (cell.value_hidden_reason || '원천 자료에 값이 없습니다.'),
      status: cell.status || '미확인',
      cls: STATUS_CLASS[cell.status] || 'none',
    };
  }
  function barRatio(v) { return isNum(v) ? Math.min(1, Math.max(0, v / 100)) : 0; }

  function parseHash(hash) {
    const m = /^#dashboard(?:\/(\d{5}))?(?:\/(\d{10}))?$/.exec(String(hash || ''));
    return m ? { sigungu: m[1] || null, dong: m[2] || null } : null;
  }
  function toHash(sg, dong) { return '#dashboard' + (sg ? '/' + sg + (dong ? '/' + dong : '') : ''); }

  // 선택 상태 결정. 순서는 언제나 코드 순(D13: 값으로 줄 세우지 않는다)
  function resolve(data, route) {
    if (!data || !Array.isArray(data.sigungu) || !data.sigungu.length) return { kind: 'empty' };
    const gus = [...data.sigungu].sort(byCode), r = route || {};
    const sigungu = gus.find(g => g.code === r.sigungu) || gus.find(g => g.status === '수집됨') || gus[0];
    if (sigungu.status !== '수집됨') return { kind: 'planned', gus, sigungu };
    const dongs = (Array.isArray(data.dongs) ? data.dongs : []).filter(d => d.sigungu_code === sigungu.code).sort(byCode);
    if (!dongs.length) return { kind: 'nodong', gus, sigungu };
    return { kind: 'dong', gus, sigungu, dongs, dong: dongs.find(d => d.code === r.dong) || dongs[0] };
  }
  function refDates(data) {
    const all = new Set();
    ((data && data.dongs) || []).forEach(d => (d.cells || []).forEach(c => c.reference_date && all.add(String(c.reference_date).slice(0, 10))));
    const list = [...all].sort();
    return !list.length ? '–' : list.length === 1 ? list[0] : `${list[0]} ~ ${list[list.length - 1]}`;
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : null; }
  function detailRows(cell) {
    if (!cell) return [];
    const none = '기록 없음', v = cellView(cell);
    const rows = [
      ['값', v.note ? `${v.text} · ${v.note}` : v.text],
      ['출처', cell.source_name || none, safeUrl(cell.source_url)],
      ['기준일', cell.reference_date ? String(cell.reference_date).slice(0, 10) : none],
      ['조회시각', cell.retrieved_at ? String(cell.retrieved_at).slice(0, 16).replace('T', ' ') : none],
      ['계산식', cell.formula_text || none],
      ['규칙 버전', cell.rule_version || none],
      ['표본수', isNum(cell.sample_n) ? nf(0).format(cell.sample_n) : none],
      ['포괄률', isNum(cell.coverage) ? formatValue(cell.coverage, '%') : null],
      ['공간 단위', cell.spatial_unit],
      ['기준연도', cell.base_year],
      ['이용조건', cell.license_type || '공공누리 유형 미표시'],
      ['상태', v.status],
      ['비고', cell.note],
    ];
    return rows.filter(r => r[1] !== null && r[1] !== undefined && r[1] !== '');
  }

  function ariaFor(dong, years) {
    return `${dong.name} 노후 건축물 비율. ` + BASES.map(([b, label]) =>
      label + ' ' + years.map(y => `${y}년 ${cellView(cellOf(dong, y, b)).text}`).join(', ')).join('. ') + '.';
  }
  // 동 하나: 3기준 × 20·30년 막대. 축은 0~100% 고정
  function barsSVG(dong) {
    const x0 = 40, w = 196, rowH = 80, H = BASES.length * rowH + 22;
    let out = '';
    [0, 50, 100].forEach(t => {
      const x = x0 + w * t / 100;
      out += `<line class="dash-grid" x1="${x}" x2="${x}" y1="24" y2="${H - 20}"/><text class="dash-axis" x="${x}" y="${H - 4}" text-anchor="middle">${t}${t === 100 ? '%' : ''}</text>`;
    });
    BASES.forEach(([b, label], i) => {
      const y = 4 + i * rowH;
      out += `<text class="dash-row" x="0" y="${y + 14}">${label}</text>`;
      YEARS.forEach((yr, j) => {
        const v = cellView(cellOf(dong, yr, b)), by = y + 22 + j * 26, bw = (w * barRatio(v.value)).toFixed(1);
        out += `<rect class="dash-track${v.value === null ? ' is-hidden' : ''}" x="${x0}" y="${by}" width="${w}" height="20" rx="6"/>`;
        if (v.value !== null) out += `<rect class="dash-fill y${yr}" x="${x0}" y="${by}" width="${bw}" height="20" rx="6" style="transition-delay:${(i * 2 + j) * 70}ms"/>`;
        out += `<text class="dash-yr" x="${x0 - 6}" y="${by + 15}" text-anchor="end">${yr}년</text>`;
        out += `<text class="dash-val" x="300" y="${by + 15}" text-anchor="end">${esc(v.text)}</text>`;
      });
    });
    return `<svg class="dash-bars" viewBox="0 0 300 ${H}" role="img" aria-label="${esc(ariaFor(dong, YEARS))}">${out}</svg>`;
  }
  // 같은 구의 동들을 같은 축으로 나란히(법정동 코드 순, 순위 표시 없음)
  function compareHTML(dongs, year, selected) {
    return [...dongs].sort(byCode).map(d => {
      let bars = '';
      BASES.forEach(([b, label], i) => {
        const v = cellView(cellOf(d, year, b)), y = i * 22;
        bars += `<text class="dash-row s" x="0" y="${y + 12}">${label}</text><rect class="dash-track${v.value === null ? ' is-hidden' : ''}" x="48" y="${y + 2}" width="196" height="12" rx="4"/>`;
        if (v.value !== null) bars += `<rect class="dash-fill b-${b}" x="48" y="${y + 2}" width="${(196 * barRatio(v.value)).toFixed(1)}" height="12" rx="4"/>`;
        bars += `<text class="dash-val s" x="300" y="${y + 12}" text-anchor="end">${esc(v.text)}</text>`;
      });
      return `<li class="${d.code === selected ? 'is-sel' : ''}"><button type="button" class="dash-cmp-name" data-dong="${esc(d.code)}" aria-pressed="${d.code === selected}">${esc(d.name)}</button>` +
        `<svg viewBox="0 0 300 66" role="img" aria-label="${esc(ariaFor(d, [year]))}">${bars}</svg></li>`;
    }).join('');
  }
  function bigCardsHTML(dong, year, open) {
    return BASES.map(([b, label]) => {
      const cell = cellOf(dong, year, b), v = cellView(cell), code = `AGING_${year}Y_${b}`;
      const num = v.value === null ? `<span class="v is-text">${esc(v.text)}</span>`
        : `<span class="v" data-count="${v.value}">${esc(formatValue(v.value, '', digitsOf(v.value)))}</span><span class="u">${esc(cell.unit || '')}</span>`;
      return `<button type="button" class="dash-big" data-ind="${code}" aria-expanded="${open === code}" aria-controls="dashDetail" aria-label="${label} 기준 ${year}년 노후율 ${esc(v.text)}, 근거 보기">` +
        `<span class="k">${label}</span><span class="n">${num}</span><span class="tag ${v.cls}">${esc(v.status)}</span><span class="more">근거 보기</span></button>`;
    }).join('');
  }
  function detailHTML(cell, title) {
    const rows = detailRows(cell).map(([k, val, href]) =>
      `<div><dt>${esc(k)}</dt><dd>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(val)}</a>` : esc(val)}</dd></div>`).join('');
    return `<div class="dash-detail-head"><h4>${esc(title)}</h4><button type="button" class="dash-close" data-close>닫기</button></div><dl>${rows}</dl>`;
  }
  function emptyHTML(title, lines) {
    return `<div class="dash-empty" role="status"><svg viewBox="0 0 120 80" aria-hidden="true"><rect x="8" y="44" width="20" height="28" rx="4"/><rect x="36" y="28" width="20" height="44" rx="4"/><rect x="64" y="52" width="20" height="20" rx="4"/><rect x="92" y="36" width="20" height="36" rx="4"/></svg>` +
      `<h3>${esc(title)}</h3>${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  }

  // ── 지도(단계구분도) ──
  // 구간은 0~100% 고정 20%p 간격이다. 구 안의 상대 비교(분위)로 바꾸면 색이 곧 줄 세우기가 되므로 쓰지 않는다(D13)
  const MAP_STEPS = [20, 40, 60, 80];
  // 녹색 단색 명도 단계: 색상(hue) 구분에 기대지 않아 적록 색맹에서도 밝기로 읽힌다
  const MAP_COLORS = ['#e4f2eb', '#a9d6c1', '#62ae91', '#21846a', '#0b4f42'];
  const MAP_NULL = '#c3ccc9';
  const MAP_NOTE = '색은 노후 건축물 비율 구간이며, 판정이 아닙니다.';
  function binIndex(v) {
    if (!isNum(v)) return -1;
    let i = 0;
    while (i < MAP_STEPS.length && v >= MAP_STEPS[i]) i++;
    return i;
  }
  function legendItems() {
    const edges = [0, ...MAP_STEPS, 100];
    return MAP_COLORS.map((color, i) => ({ color, label: `${edges[i]}~${edges[i + 1]}%` }))
      .concat({ color: MAP_NULL, label: '비공개·결측', hidden: true });
  }
  function validCenter(c) {
    return Array.isArray(c) && c.length === 2 && isNum(c[0]) && isNum(c[1]) && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180;
  }
  // resolve() 결과 + 경계 GeoJSON → 동마다 색·문구·도형. 경계가 없는 동은 중심점, 둘 다 없으면 지도에서 뺀다(목록에는 남는다)
  function mapModel(v, year, basis, geo) {
    if (!v || v.kind !== 'dong') return { drawable: false, items: [] };
    const feats = new Map(((geo && Array.isArray(geo.features)) ? geo.features : [])
      .filter(f => f && f.geometry && f.properties && f.properties.code != null)
      .map(f => [String(f.properties.code), f]));
    const items = v.dongs.map(d => {
      const cell = cellOf(d, year, basis), cv = cellView(cell), bin = binIndex(cv.value);
      return {
        code: d.code, name: d.name, text: cv.text, bin, color: bin < 0 ? MAP_NULL : MAP_COLORS[bin],
        ref: cell && cell.reference_date ? String(cell.reference_date).slice(0, 10) : '기록 없음',
        feature: feats.get(String(d.code)) || null, center: validCenter(d.center) ? d.center : null,
      };
    });
    return { drawable: items.some(it => it.feature || it.center), items };
  }
  function basisLabel(basis) { return (BASES.find(b => b[0] === basis) || [, basis])[1]; }
  function tooltipHTML(it, year, basis) {
    return `<b>${esc(it.name)}</b><br>${year}년 · ${esc(basisLabel(basis))} 기준 ${esc(it.text)}<br>기준일 ${esc(it.ref)}`;
  }
  function legendHTML() {
    return `<ul class="dash-map-legend" aria-label="지도 색 구간">${legendItems().map(l =>
      `<li><i class="${l.hidden ? 'is-hidden' : ''}" style="background:${l.color}"></i>${esc(l.label)}</li>`).join('')}</ul>` +
      `<p class="dash-map-note">${MAP_NOTE}</p>`;
  }

  const api = { BASES, NOTE, formatValue, digitsOf, shortHash, cellOf, cellView, barRatio, parseHash, toHash, resolve, refDates, safeUrl, detailRows, barsSVG, compareHTML, bigCardsHTML, detailHTML, emptyHTML,
    MAP_STEPS, MAP_COLORS, MAP_NULL, binIndex, legendItems, validCenter, mapModel, tooltipHTML, legendHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewDashboard = api;

  const root = document.getElementById('dashboard'), app = root && root.querySelector('#dashApp');
  if (!app) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { data: null, route: parseHash(location.hash) || {}, year: 20, open: null, seen: reduced, view: 'card', basis: 'COUNT', geo: undefined, mapErr: false };
  // 손가락이 주 입력인 기기: 한 손가락은 페이지 스크롤, 두 손가락(핀치)으로 지도 이동·확대
  const coarse = matchMedia('(pointer: coarse)').matches;
  // Leaflet 1.9.4(BSD-2-Clause). 지도 보기를 처음 열 때만 싣는다. 해시는 cdnjs 원본에서 계산한 SRI다
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  let leafletP = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return leafletP || (leafletP = new Promise((ok, fail) => {
      const tag = (name, attrs) => { const el = Object.assign(document.createElement(name), attrs, { crossOrigin: 'anonymous' }); el.onerror = fail; document.head.appendChild(el); return el; };
      tag('link', { rel: 'stylesheet', href: LEAFLET + 'leaflet.css', integrity: 'sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w==' });
      tag('script', { src: LEAFLET + 'leaflet.js', integrity: 'sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg==' }).onload = ok;
    }).catch(e => { leafletP = null; throw e; }));
  }
  let mapState = {};
  function dropMap() { if (mapState.map) mapState.map.remove(); mapState = {}; }
  function mapBodyHTML(v) {
    const d = v.dong, it = mapModel(v, state.year, state.basis, state.geo).items.find(x => x.code === d.code);
    const seg = (key, list, cur, label) => `<div class="dash-seg" role="group" aria-label="${label}">${list.map(([val, txt]) =>
      `<button type="button" data-${key}="${val}" aria-pressed="${cur === val}">${txt}</button>`).join('')}</div>`;
    return `<div class="dash-panel dash-map-wrap"><div class="dash-panel-head"><h3>${esc(v.sigungu.name)} 노후율 지도 <small>법정동</small></h3>` +
      `<div class="dash-map-ctl">${seg('year', YEARS.map(y => [y, y + '년']), state.year, '노후 기준 연수')}${seg('basis', BASES, state.basis, '노후율 기준')}</div></div>` +
      `<div data-map-slot></div>` +
      `<p class="dash-map-hint">${coarse ? '두 손가락으로 지도를 움직이고 확대합니다.' : '끌어서 움직이고, + − 버튼으로 확대합니다.'}<br>지도 대신 아래 동 이름을 눌러도 됩니다.</p>` +
      legendHTML() +
      `<div class="dash-chips dash-dongs dash-map-list" role="group" aria-label="${esc(v.sigungu.name)} 법정동">${v.dongs.map(x =>
        `<button type="button" class="dash-chip" data-dong="${esc(x.code)}" aria-pressed="${x.code === d.code}">${esc(x.name)}</button>`).join('')}</div>` +
      `<p class="dash-map-sel" aria-live="polite"><b>${esc(d.name)}</b> ${state.year}년 · ${esc(basisLabel(state.basis))} 기준 <b>${esc(it.text)}</b><br>기준일 ${esc(it.ref)} · <button type="button" class="dash-link" data-view="card">카드에서 근거 보기</button></p></div>`;
  }
  // innerHTML을 새로 그린 뒤 지도 자리(slot)를 채운다. 같은 구면 Leaflet 지도를 그대로 옮겨 붙여 확대·위치를 유지한다
  function drawMap(v) {
    const slot = app.querySelector('[data-map-slot]');
    if (!slot) { dropMap(); return; }
    const wait = msg => { slot.className = 'dash-map is-wait'; slot.textContent = msg; };
    if (state.geo === undefined) {
      wait('지도를 불러오는 중입니다.');
      fetch('data/dong_boundaries.geojson', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
        .then(g => { state.geo = g && Array.isArray(g.features) ? g : null; render(); });
      return;
    }
    const model = mapModel(v, state.year, state.basis, state.geo);
    if (!model.drawable) { dropMap(); slot.outerHTML = emptyHTML('지도 데이터 준비 중', ['동 경계와 중심 좌표를 준비하고 있습니다.', '아래 동 이름을 누르면 숫자를 볼 수 있습니다.']); return; }
    if (state.mapErr) { slot.outerHTML = emptyHTML('지도를 불러오지 못했습니다', ['네트워크를 확인한 뒤 다시 열어 주세요.', '아래 동 이름으로는 계속 볼 수 있습니다.']); return; }
    if (!window.L) {
      wait('지도를 불러오는 중입니다.');
      loadLeaflet().then(() => render(),() => { state.mapErr = true; render(); });
      return;
    }
    const L = window.L, label = `${v.sigungu.name} 법정동 ${state.year}년 ${basisLabel(state.basis)} 기준 노후율 지도. 아래 동 목록으로도 고를 수 있습니다.`;
    if (mapState.map && mapState.sg === v.sigungu.code) {
      slot.replaceWith(mapState.el);
      mapState.map.invalidateSize();
    } else {
      dropMap();
      const el = document.createElement('div');
      el.className = 'dash-map';
      el.setAttribute('role', 'region');
      slot.replaceWith(el);
      const map = L.map(el, { dragging: !coarse, scrollWheelZoom: false, zoomSnap: 0.5 });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      mapState = { el, map, sg: v.sigungu.code, layer: L.featureGroup().addTo(map), fit: true };
    }
    mapState.el.setAttribute('aria-label', label);
    const { layer } = mapState;
    layer.clearLayers();
    model.items.forEach(it => {
      const sel = it.code === v.dong.code;
      const style = { color: sel ? '#153c39' : it.bin < 0 ? '#4f625d' : '#ffffff', weight: sel ? 3 : 1.5, fillColor: it.color, fillOpacity: 0.78, dashArray: it.bin < 0 ? '4 3' : null };
      const shape = it.feature ? L.geoJSON(it.feature, { style })
        : it.center ? L.circleMarker(it.center, { ...style, radius: sel ? 16 : 13 }) : null;
      if (!shape) return;
      shape.bindTooltip(tooltipHTML(it, state.year, state.basis), { sticky: !!it.feature });
      shape.on('click', () => go({ sigungu: v.sigungu.code, dong: it.code }));
      layer.addLayer(shape);
    });
    if (mapState.fit) { mapState.map.fitBounds(layer.getBounds().pad(0.15), { maxZoom: 15 }); mapState.fit = false; }
  }

  function countUp(el) {
    const target = +el.dataset.count, d = digitsOf(target), f = nf(d), t0 = performance.now(), dur = 900;
    const tick = t => {
      const p = Math.min(1, (t - t0) / dur), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = f.format(target * e);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function play() {
    if (!state.seen) return;
    if (reduced) { app.classList.add('is-in'); return; }
    app.classList.remove('is-in');
    void app.offsetWidth; // 막대가 0에서 다시 차오르게 스타일을 한 번 확정한다
    app.classList.add('is-in');
    app.querySelectorAll('[data-count]').forEach(countUp);
  }
  function meta(data) {
    root.querySelector('[data-meta]').innerHTML =
      `<span>기준일 <b>${esc(data ? refDates(data) : '–')}</b></span><span>스냅샷 <b class="mono">${esc(shortHash(data && data.snapshot_hash))}</b></span><span class="note">설명: ${NOTE}</span>`;
  }
  function render(focusSel) {
    const v = resolve(state.data, state.route);
    meta(state.data);
    if (v.kind === 'empty') {
      app.innerHTML = emptyHTML('데이터 준비 중', ['원장에서 내보낸 숫자만 이 자리에 보여 드립니다.', '준비되면 구·동을 골라 볼 수 있습니다.']);
      return;
    }
    const chips = v.gus.map(g => {
      const planned = g.status !== '수집됨';
      return `<button type="button" class="dash-chip${planned ? ' is-planned' : ''}" data-sg="${esc(g.code)}" aria-pressed="${g.code === v.sigungu.code}">${esc(g.name)}${planned ? '<small>예정</small>' : ''}</button>`;
    }).join('');
    let body;
    if (v.kind === 'planned') body = emptyHTML(`${v.sigungu.name} · 수집 예정`, ['이 구는 수집 예정입니다.', '자료를 모으기 전에는 숫자를 보여 드리지 않습니다.']);
    else if (v.kind === 'nodong') body = emptyHTML(`${v.sigungu.name} · 동 자료 준비 중`, ['이 구의 동별 원장 셀이 아직 없습니다.']);
    else if (state.view === 'map') body = mapBodyHTML(v);
    else {
      const d = v.dong, cell = state.open && d.cells ? d.cells.find(c => c.indicator_code === state.open) : null;
      const openLabel = state.open ? state.open.replace(/AGING_(\d+)Y_(\w+)/, (_, y, b) => `${y}년 노후 · ${(BASES.find(x => x[0] === b) || [, b])[1]} 기준`) : '';
      const yearSeg = cls => `<div class="dash-seg ${cls}" role="group" aria-label="노후 기준 연수">${YEARS.map(y => `<button type="button" data-year="${y}" aria-pressed="${state.year === y}">${y}년</button>`).join('')}</div>`;
      body = `<div class="dash-chips dash-dongs" role="group" aria-label="${esc(v.sigungu.name)} 법정동">${v.dongs.map(x => `<button type="button" class="dash-chip" data-dong="${esc(x.code)}" aria-pressed="${x.code === d.code}">${esc(x.name)}</button>`).join('')}</div>` +
        `<div class="dash-main"><div class="dash-panel"><div class="dash-panel-head"><h3>${esc(d.name)} <small>${esc(d.unit || '')} · ${esc(d.code)}</small></h3>${yearSeg('')}</div>` +
        `<p class="dash-cap">${state.year}년 이상 된 건축물 비율입니다.<br>숫자를 누르면 근거가 열립니다.</p><div class="dash-bigs">${bigCardsHTML(d, state.year, state.open)}</div>` +
        `<div id="dashDetail" class="dash-detail"${cell || state.open ? '' : ' hidden'}>${state.open ? (cell ? detailHTML(cell, `${d.name} · ${openLabel}`) : detailHTML(null, `${d.name} · ${openLabel} · 셀 없음`)) : ''}</div></div>` +
        `<div class="dash-panel"><div class="dash-panel-head"><h3>20년·30년 × 3기준</h3><p class="dash-legend"><i class="y20"></i>20년 <i class="y30"></i>30년</p></div>${barsSVG(d)}</div></div>` +
        `<div class="dash-panel dash-cmp-wrap"><div class="dash-panel-head"><h3>${esc(v.sigungu.name)} 동별 나란히 보기 <small>법정동 코드 순</small></h3>${yearSeg('s')}</div>` +
        `<p class="dash-legend"><i class="b-COUNT"></i>동수 <i class="b-AREA"></i>연면적 <i class="b-HH"></i>세대</p><ul class="dash-cmp">${compareHTML(v.dongs, state.year, d.code)}</ul></div>`;
    }
    const viewSeg = `<div class="dash-seg dash-view" role="group" aria-label="보기 방식">${[['map', '지도'], ['card', '카드']].map(([k, t]) =>
      `<button type="button" data-view="${k}" aria-pressed="${state.view === k}">${t}</button>`).join('')}</div>`;
    if (mapState.el) mapState.el.remove(); // 다시 그리는 동안 Leaflet 지도를 떼어 두었다가 drawMap()에서 붙인다
    app.innerHTML = `<div class="dash-chips dash-gus" role="group" aria-label="부산 구·군">${chips}</div>${viewSeg}${body}`;
    if (v.kind === 'dong' && state.view === 'map') drawMap(v); else dropMap();
    // 고른 칩이 가로 스크롤 밖에 있으면 칩 줄만 옮긴다(페이지는 움직이지 않는다)
    app.querySelectorAll('.dash-chips').forEach(row => {
      const on = row.querySelector('[aria-pressed="true"]');
      if (on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 24);
    });
    const f = focusSel && app.querySelector(focusSel);
    if (f) f.focus({ preventScroll: true });
    play();
  }
  function go(route, focusSel) {
    state.route = route; state.open = null;
    const v = resolve(state.data, route);
    if (v.kind !== 'empty') history.replaceState(null, '', toHash(v.sigungu.code, v.dong && v.dong.code));
    render(focusSel);
  }
  app.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sg) go({ sigungu: b.dataset.sg }, `[data-sg="${b.dataset.sg}"]`);
    else if (b.dataset.dong) go({ sigungu: state.route.sigungu || resolve(state.data, state.route).sigungu.code, dong: b.dataset.dong }, `.dash-dongs [data-dong="${b.dataset.dong}"]`);
    else if (b.dataset.year) { state.year = +b.dataset.year; state.open = null; render(`${b.closest('.s') ? '.dash-seg.s ' : '.dash-seg:not(.s) '}[data-year="${b.dataset.year}"]`); }
    else if (b.dataset.view) { state.view = b.dataset.view; state.open = null; render(`.dash-view [data-view="${b.dataset.view}"]`); }
    else if (b.dataset.basis) { state.basis = b.dataset.basis; render(`[data-basis="${b.dataset.basis}"]`); }
    else if (b.dataset.ind) { state.open = state.open === b.dataset.ind ? null : b.dataset.ind; render(`[data-ind="${b.dataset.ind}"]`); }
    else if (b.hasAttribute('data-close')) { const ind = state.open; state.open = null; render(`[data-ind="${ind}"]`); }
  });
  addEventListener('hashchange', () => {
    const r = parseHash(location.hash);
    if (r && (r.sigungu !== state.route.sigungu || r.dong !== state.route.dong)) { state.route = r; state.open = null; render(); }
  });
  new IntersectionObserver((entries, io) => entries.forEach(en => {
    if (!en.isIntersecting) return;
    state.seen = true; play(); io.disconnect();
  }), { threshold: 0.2 }).observe(app);

  render();
  fetch('data/dashboard.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(data => {
      state.data = data;
      render();
      if (parseHash(location.hash) && location.hash !== '#dashboard') root.scrollIntoView({ block: 'start' });
    });
})();
