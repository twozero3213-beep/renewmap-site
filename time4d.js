/* 건물 나이 4D 보기(2026-11-13): 부산 법정동 건물을 입체로 세우고, 연도를 움직이면 사용승인일 기준으로 지어지고 낡아 가는 모습을 보여 준다.
   외곽선·높이는 GIS건물통합정보(data/bldg_outline), 사용승인일·용도는 건축물대장 표제부(data/buildings). 둘은 관리 건축물대장 PK(mgm_bld_pk)로 잇는다.
   연수는 '지금 있는 건물이 그대로 있다'고 보고 사용승인 연도를 빼는 달력 계산이다. 철거·신축 예측이 아니다(redev.js 도달 날짜와 같은 원칙). */
(function (root) {
  'use strict';
  const YEAR_FROM = 1960;
  const BANDS = [[0, '#b9e2cf', '20년 미만'], [20, '#e3a857', '20~29년'], [30, '#9c3d22', '30년 이상']];
  const NO_DATE = '#9aa6a1';

  // 사용승인 연도. 날짜가 없거나 1900년 전으로 적힌 것은 0(날짜 없음)
  function aprYear(b) {
    const s = b.use_apr_day || (Array.isArray(b.use_apr_span) ? b.use_apr_span[0] : '');
    const y = Number(String(s || '').slice(0, 4));
    return y >= 1900 ? y : 0;
  }

  // 그해 기준 통계. 분모는 그해까지 사용승인된 날짜 있는 건물(주건축물). 날짜 없는 건물은 따로 센다
  function stats(blds, year) {
    let built = 0, over20 = 0, over30 = 0, noDate = 0;
    for (const b of blds) {
      const y = aprYear(b);
      if (!y) { noDate++; continue; }
      if (y > year) continue;
      built++;
      if (year - y >= 20) over20++;
      if (year - y >= 30) over30++;
    }
    const pct = (n) => (built ? Math.round((n / built) * 1000) / 10 : null);
    return { year, built, over20, over30, noDate, pct20: pct(over20), pct30: pct(over30) };
  }

  // 20년 이상 비율이 thr(%)에 처음 닿는 해. from~to 안에 없으면 null
  function crossYear(blds, thr, from, to) {
    for (let y = from; y <= to; y++) { const s = stats(blds, y); if (s.pct20 !== null && s.pct20 >= thr) return y; }
    return null;
  }

  // 외곽선 파일 + 건축물대장 → GeoJSON. y: 사용승인 연도(0 = 날짜 없음, -1 = 대장과 못 이음), h: 높이(m)
  function features(outline, buildingFile) {
    const byPk = new Map((buildingFile.buildings || []).map((b) => [String(b.mgm_bld_pk), b]));
    const out = [];
    for (const [pk, , height, floors, , flat] of outline.items || []) {
      if (!Array.isArray(flat) || flat.length < 8) continue;
      const ring = [];
      for (let i = 0; i + 1 < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
      const b = pk ? byPk.get(String(pk)) : null;
      const f = Number(floors) || (b && Number(b.floors)) || 1;
      const h = Number(height) > 0 ? Number(height) : f * 3;
      out.push({ type: 'Feature', properties: { y: b ? aprYear(b) : -1, h: Math.min(h, 300), use: b ? b.main_use || '' : '' }, geometry: { type: 'Polygon', coordinates: [ring] } });
    }
    return { type: 'FeatureCollection', features: out };
  }

  // 그해 색. MapLibre 식으로 만든다(연도를 바꿀 때마다 다시 넣는다)
  function colorExpr(year) {
    const age = ['-', year, ['get', 'y']];
    return ['case', ['<', ['get', 'y'], 1], NO_DATE, ['step', age, BANDS[0][1], 20, BANDS[1][1], 30, BANDS[2][1]]];
  }
  // 그해까지 지어진 건물과 날짜 없는 건물만 보인다
  const filterExpr = (year) => ['<=', ['get', 'y'], year];

  const api = { YEAR_FROM, BANDS, NO_DATE, aprYear, stats, crossYear, features, colorExpr, filterExpr };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.Time4D = api;

  // ── 화면 ──
  const $ = (id) => document.getElementById(id);
  if (!document.getElementById('t4App')) return;
  const NOW = new Date().getFullYear(), TO = NOW + 20;
  const getJson = (p) => fetch(`data/${p}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  let map = null, blds = [], fileMeta = null, year = NOW, timer = null;
  const fmt = (n) => (n === null ? '-' : n.toLocaleString('ko-KR'));

  const slider = $('t4Year');
  slider.min = String(YEAR_FROM); slider.max = String(TO); slider.value = String(NOW);
  // 색 칸은 CSSOM으로 칠한다(style 속성은 CSP가 막는다)
  $('t4Legend').replaceChildren(...[...BANDS.map(([, c, t]) => [c, t]), [NO_DATE, '사용승인일 없음']].map(([c, t]) => {
    const li = document.createElement('li'), i = document.createElement('i');
    i.style.background = c; li.append(i, t); return li;
  }));

  function paint() {
    $('t4YearOut').textContent = `${year}년`;
    slider.setAttribute('aria-valuetext', `${year}년`);
    const s = stats(blds, year);
    $('t4Built').textContent = fmt(s.built);
    $('t4P20').textContent = s.pct20 === null ? '-' : `${s.pct20}%`;
    $('t4P30').textContent = s.pct30 === null ? '-' : `${s.pct30}%`;
    $('t4Future').hidden = year <= NOW;
    if (map && map.getLayer('b3d')) {
      map.setPaintProperty('b3d', 'fill-extrusion-color', colorExpr(year));
      map.setFilter('b3d', filterExpr(year));
    }
  }
  function marks() {
    const y50 = crossYear(blds, 50, YEAR_FROM, TO), y67 = crossYear(blds, 66.7, YEAR_FROM, TO);
    const line = (y, what) => (y === null ? `${what}: ${TO}년까지 닿지 않음` : `${what}: ${y}년${y > NOW ? '(지금 건물 그대로일 때)' : ''}`);
    $('t4Marks').innerHTML = `<li>${line(y50, '20년 이상 건물이 절반을 넘는 해')}</li><li>${line(y67, '20년 이상 건물이 3분의 2를 넘는 해')}</li>`;
  }

  async function load(code) {
    stop();
    $('t4Status').textContent = '건물을 불러오는 중입니다.';
    try {
      const [outline, bf] = await Promise.all([getJson(`bldg_outline/${code}.json`), getJson(`buildings/${code}.json`)]);
      blds = bf.buildings || [];
      fileMeta = { outline, bf };
      const gj = features(outline, bf);
      const bbox = bboxOf(gj);
      await ready();
      map.getSource('b').setData(gj);
      map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 0, pitch: 55, bearing: -20, duration: 0 });
      map.setZoom(map.getZoom() + 0.6);   // 기울여 보면 화면 아래쪽이 비어 한 단계 당겨 본다
      $('t4Status').textContent = `${bf.name} 건물 외곽선 ${fmt(gj.features.length)}개를 세웠습니다(부속 건물 포함).`;
      $('t4Name').textContent = bf.name;
      $('t4Src').innerHTML = `외곽선·높이: ${esc(outline.name)}(기준일 ${esc(outline.base_date)}, ${esc(outline.license_type)}) · 사용승인일: ${esc(bf.source)}(기준일 ${esc(bf.hub_reference_date)})`;
      marks(); paint();
    } catch (e) {
      $('t4Status').textContent = '이 동의 건물 자료를 불러오지 못했습니다. 다른 동을 골라 보세요.';
    }
  }
  // 건물이 몰린 곳에 맞춘다(외곽선 중심의 5~95% 범위). 산자락의 외딴 건물 몇 채 때문에 모형이 작아 보이던 것을 막는다
  function bboxOf(gj) {
    const xs = [], ys = [];
    for (const f of gj.features) { const [x, y] = f.geometry.coordinates[0][0]; xs.push(x); ys.push(y); }
    if (!xs.length) return [129.1, 35.15, 129.2, 35.25];
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
    return [q(xs, 0.1), q(ys, 0.1), q(xs, 0.9), q(ys, 0.9)];
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let readyP = null;
  function ready() {
    if (readyP) return readyP;
    readyP = new Promise((ok, fail) => {
      if (!window.maplibregl) return fail(new Error('maplibre'));
      maplibregl.setWorkerUrl('vendor/maplibre/maplibre-gl-csp-worker.js');
      map = new maplibregl.Map({
        container: 't4Map', attributionControl: false, pitch: 55, bearing: -20, center: [129.13, 35.2], zoom: 15, maxPitch: 75,
        style: { version: 8, sources: { b: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } }, layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#eef1ee' } },
          { id: 'b3d', type: 'fill-extrusion', source: 'b', paint: { 'fill-extrusion-color': colorExpr(year), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.94, 'fill-extrusion-vertical-gradient': true }, filter: filterExpr(year) },
        ] },
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '국토교통부 GIS건물통합정보 · 건축물대장' }));
      map.on('load', () => ok());
      map.on('error', () => {});
    });
    return readyP;
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } $('t4Play').setAttribute('aria-pressed', 'false'); $('t4Play').textContent = '연도 돌려 보기'; }
  $('t4Play').addEventListener('click', () => {
    if (timer) return stop();
    if (year >= TO) year = YEAR_FROM;
    $('t4Play').setAttribute('aria-pressed', 'true'); $('t4Play').textContent = '멈춤';
    timer = setInterval(() => { year += 1; slider.value = String(year); paint(); if (year >= TO) stop(); }, 140);
  });
  slider.addEventListener('input', () => { stop(); year = Number(slider.value); paint(); });
  $('t4Now').addEventListener('click', () => { stop(); year = NOW; slider.value = String(year); paint(); });

  // 구·군 → 법정동(buildings/index.json, 부산만)
  getJson('buildings/index.json').then((idx) => {
    const gus = idx.sigungu.filter((s) => s.code.startsWith('26') && s.dongs.length);
    const fill = (sel, items, pick) => sel.replaceChildren(...items.map(([v, t]) => { const o = new Option(t, v); o.selected = v === pick; return o; }));
    const dongs = (gu, pick) => fill($('t4Dong'), gus.find((s) => s.code === gu).dongs.map((d) => [d.code, `${d.name} (건물 ${d.count.toLocaleString("ko-KR")}동)`]), pick);
    const want = new URLSearchParams(location.search).get('bjd') || '2635010300';
    const gu0 = (gus.find((s) => s.dongs.some((d) => d.code === want)) || gus[0]).code;
    fill($('t4Gu'), gus.map((s) => [s.code, s.name]), gu0);
    dongs(gu0, want);
    $('t4Gu').addEventListener('change', () => { dongs($('t4Gu').value); load($('t4Dong').value); });
    const syncLinks = () => { const a = document.getElementById('t4Redev'); if (a) a.href = `field/redev.html?bjd=${$('t4Dong').value}`; };
    $('t4Dong').addEventListener('change', () => { history.replaceState(null, '', `?bjd=${$('t4Dong').value}`); syncLinks(); load($('t4Dong').value); });
    syncLinks();
    load($('t4Dong').value);
  }).catch(() => { $('t4Status').textContent = '동 목록을 불러오지 못했습니다.'; });
})(typeof self !== 'undefined' ? self : this);
