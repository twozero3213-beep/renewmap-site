/* 건물 나이 4D 보기(2026-11-13): 부산 법정동 건물을 입체로 세우고, 연도를 움직이면 사용승인일 기준으로 지어지고 낡아 가는 모습을 보여 준다.
   외곽선·높이는 GIS건물통합정보(data/bldg_outline), 사용승인일·용도는 건축물대장 표제부(data/buildings). 둘은 관리 건축물대장 PK(mgm_bld_pk)로 잇는다.
   연수는 '지금 있는 건물이 그대로 있다'고 보고 사용승인 연도를 빼는 달력 계산이다. 철거·신축 예측이 아니다(redev.js 도달 날짜와 같은 원칙). */
(function (root) {
  'use strict';
  const YEAR_FROM = 1960;
  // v7: 동네 찾기 지도와 같은 따뜻한 단계색(새 건물은 옅은 크림, 오래될수록 벽돌색). 날짜 없는 건물은 차가운 회색으로 따로 구분한다
  // v7 7회차: 30년 이상 한 단계면 원도심이 다 같은 적갈색이라 올해 화면에서 차이가 안 보였다 → 40년 이상을 더 짙게 나눈다
  const BANDS = [[0, '#f0e3c4', '20년 미만'], [20, '#e09a4c', '20~29년'], [30, '#a8452a', '30~39년'], [40, '#5c2214', '40년 이상']];
  const NO_DATE = '#b9bec5';

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
  // 지금 기준선 위면 그 상태가 이어져 온 첫해, 아래면 앞으로 처음 닿는 해(v9: 건물이 적던 옛날 잠깐 넘은 1973년을 잡아
  // 홈의 '2028년에 닿음'과 어긋났다). 홈 목록(export_crossing_soon.py)도 같은 규칙
  function sinceYear(blds, thr, from, now, to) {
    const p0 = stats(blds, now).pct20;
    if (p0 === null) return null;
    if (p0 < thr) return crossYear(blds, thr, now + 1, to);
    let y = now;
    while (y > from) { const p = stats(blds, y - 1).pct20; if (p === null || p < thr) break; y--; }
    return y;
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
    return ['case', ['<', ['get', 'y'], 1], NO_DATE, ['step', age, BANDS[0][1], ...BANDS.slice(1).flatMap(([edge, color]) => [edge, color])]];
  }
  // 그해까지 지어진 건물과 날짜 없는 건물만 보인다
  const filterExpr = (year) => ['<=', ['get', 'y'], year];

  // 동네 찾기 지도에서 넘어온 좌표(?lat&lng) → 그 자리를 담은 법정동. 외곽선 색인(bldg_outline/index.json)의 bbox로 고르고, 여럿이면 bbox 중심이 가장 가까운 동
  function dongAt(index, lng, lat) {
    let best = null, bestD = Infinity;
    for (const [code, f] of Object.entries(index.files || {})) {
      const [x0, y0, x1, y1] = f.bbox;
      if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
      const d = (lng - (x0 + x1) / 2) ** 2 + (lat - (y0 + y1) / 2) ** 2;
      if (d < bestD) { bestD = d; best = code; }
    }
    return best;
  }

  const api = { YEAR_FROM, BANDS, NO_DATE, aprYear, stats, crossYear, sinceYear, features, colorExpr, filterExpr, dongAt };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.Time4D = api;

  // ── 화면 ──
  const $ = (id) => document.getElementById(id);
  if (!document.getElementById('t4App')) return;
  const NOW = new Date().getFullYear(), TO = NOW + 20;
  const getJson = (p) => fetch(`data/${p}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  // ?y=: 홈 '곧 노후 요건에 닿는 동네'에서 오면 그 해부터 연다(범위 밖이면 올해)
  const y0 = Number(new URLSearchParams(location.search).get('y'));
  let map = null, blds = [], fileMeta = null, year = y0 >= YEAR_FROM && y0 <= TO ? y0 : NOW, timer = null;
  const fmt = (n) => (n === null ? '-' : n.toLocaleString('ko-KR'));

  const slider = $('t4Year');
  slider.min = String(YEAR_FROM); slider.max = String(TO); slider.value = String(year);
  $('t4Ends').textContent = `${YEAR_FROM}년 ~ ${TO}년 · 올해 뒤는 지금 건물 그대로일 때`;
  // 색 칸은 CSSOM으로 칠한다(style 속성은 CSP가 막는다)
  $('t4Legend').replaceChildren(...[...BANDS.map(([, c, t]) => [c, t]), [NO_DATE, '사용승인일 없음']].map(([c, t]) => {
    const li = document.createElement('li'), i = document.createElement('i');
    i.style.background = c; li.append(i, t); return li;
  }));

  function paint() {
    $('t4YearOut').textContent = `${year}년`;
    $('t4TagL').textContent = `${year}년`;
    const sn = stats(blds, NOW);
    $('t4CmpNote').textContent = s0Line(year, sn);
    slider.setAttribute('aria-valuetext', `${year}년`);
    const s = stats(blds, year);
    $('t4Built').textContent = fmt(s.built);
    $('t4P20').textContent = s.pct20 === null ? '-' : `${s.pct20}%`;
    $('t4P30').textContent = s.pct30 === null ? '-' : `${s.pct30}%`;
    $('t4Future').hidden = year <= NOW;
    $('t4App').classList.toggle('is-future', year > NOW);   // 올해 뒤는 지도 위에도 '가정' 표시(10회차: 미래 캡처가 사실처럼 돌 수 있다)
    // 동 목록·구역 계산의 대장 건물 수와 여기 숫자의 차이(사용승인일 없는 건물)를 그 자리에서 밝힌다(v7 평가: 5,207과 5,144가 왜 다른지 몰랐다)
    $('t4NoDate').textContent = s.noDate ? `사용승인일이 없는 ${fmt(s.noDate)}동은 회색으로 세우고 비율에서 뺍니다.` : '';
    if (map && map.getLayer('b3d')) {
      map.setPaintProperty('b3d', 'fill-extrusion-color', colorExpr(year));
      map.setFilter('b3d', filterExpr(year));
    }
  }
  // 나란히 볼 때 왼쪽 패널에 두 해의 20년 이상 비율 변화를 한 줄로(v7 7회차: 고른 해 숫자만 있어 변화량이 없었다)
  function s0Line(y, sn) {
    const s = stats(blds, y);
    return s.pct20 === null || sn.pct20 === null ? '' : `20년 이상: ${y}년 ${s.pct20}% → 올해 ${sn.pct20}%`;
  }
  function marks() {
    const y50 = sinceYear(blds, 50, YEAR_FROM, NOW, TO), y67 = sinceYear(blds, 66.7, YEAR_FROM, NOW, TO);
    // 닿는 해를 누르면 그해로 옮긴다(v7: 숫자만 있어 그해 모형을 보려면 막대를 손으로 맞춰야 했다)
    const line = (y, what) => (y === null ? `<li>${what}: ${TO}년까지 닿지 않음</li>`
      : `<li>${what}: <button type="button" class="t4-jump" data-y="${y}">${y}년${y > NOW ? '' : '부터'}</button>${y > NOW ? ' (지금 건물 그대로일 때)' : ' 지금까지'}</li>`);
    $('t4Marks').innerHTML = line(y50, '20년 이상 건물 절반 넘음') + line(y67, '20년 이상 건물 3분의 2 넘음');
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
      lastGj = gj;
      if (map2) map2.getSource('b').setData(gj);
      map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 0, pitch: 55, bearing: -20, duration: 0 });
      map.setZoom(map.getZoom() + 0.6);   // 기울여 보면 화면 아래쪽이 비어 한 단계 당겨 본다
      $('t4Status').textContent = `${bf.name} 건물을 세웠습니다. 부속 건물까지 모두 세우고, 숫자는 날짜 있는 주건축물로 셉니다.`;
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

  // 지도 하나를 세운다. yearOf: 이 지도가 보여 줄 해(본 지도 = 막대의 해, 비교 지도 = 올해)
  function buildMap(container, yearOf, nav) {
    return new Promise((ok) => {
      // v7(2026-11-13): 빈 바탕 대신 OpenFreeMap 배경 지도(키·사용량 제한 없음, 상용 가능)에 한국어 이름을 먼저 싣고(vendor/openfreemap/positron.json),
      // Mapterhorn 지형으로 산자락 음영을 깐다. 부산은 산이 많아 음영이 없으면 건물이 어디에 붙어 있는지 읽히지 않았다.
      // 한글은 배경 지도 글꼴 파일에 없어 화면 글꼴(Pretendard)로 그린다(localIdeographFontFamily)
      const map = new maplibregl.Map({
        container, style: 'vendor/openfreemap/positron.json', attributionControl: false,
        pitch: 55, bearing: -20, center: [129.13, 35.2], zoom: 15, maxPitch: 75,
        localIdeographFontFamily: '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
      });
      if (nav) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '국토교통부 GIS건물통합정보 · 건축물대장' }));
      // 'load'는 배경 타일·지형까지 다 받은 뒤라 첫 화면이 7초 넘게 비었다. 모양(style)만 오면 건물을 바로 세운다
      map.once('style.load', () => {
        const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol').id;
        map.addSource('dem', { type: 'raster-dem', tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'], encoding: 'terrarium', tileSize: 512, maxzoom: 12,
          attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>' });
        map.addLayer({ id: 'relief', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.4, 'hillshade-shadow-color': '#7d828a', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#5b6068' } }, 'building');
        map.addSource('b', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'b3d', type: 'fill-extrusion', source: 'b', filter: filterExpr(yearOf()),
          paint: { 'fill-extrusion-color': colorExpr(yearOf()), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.96, 'fill-extrusion-vertical-gradient': true } }, firstLabel);
        // 건물을 누르면 사용승인 연도·고른 해 기준 연수·용도·높이. 글은 DOM으로 넣는다(대장 값이 HTML로 해석되지 않게)
        map.on('click', 'b3d', (e) => {
          const p = e.features[0].properties, box = document.createElement('div');
          box.className = 't4-pop';
          const line = (k, v) => { const r = document.createElement('p'), b = document.createElement('b'); b.textContent = k; r.append(b, ` ${v}`); return r; };
          const yr = yearOf();
          box.append(line('사용승인', p.y > 0 ? `${p.y}년 · ${yr}년에 ${yr - p.y}년째` : p.y === 0 ? '날짜 없음' : '건축물대장과 잇지 못함'),
            line('용도', p.use || '-'), line('높이', `${Math.round(p.h)}m`));
          new maplibregl.Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(box).addTo(map);
        });
        map.on('mouseenter', 'b3d', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'b3d', () => { map.getCanvas().style.cursor = ''; });
        // 해가 남서쪽 높이 떠 있는 빛: 건물 옆면에 명암이 생겨 높낮이가 읽힌다
        map.setLight({ anchor: 'map', position: [1.4, 210, 35], color: '#ffffff', intensity: 0.5 });
        map.setSky({ 'sky-color': '#dde6ec', 'horizon-color': '#f6f5f2', 'sky-horizon-blend': 0.6, 'fog-color': '#f6f5f2', 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85 });
        // 출처 글은 접은 채로 시작한다(평가: 휴대폰에서 연도 막대를 덮었다). (i)를 누르면 펼쳐진다
        map.once('load', () => map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
        ok(map);
      });
      map.on('error', () => {});
    });
  }
  let readyP = null;
  function ready() {
    if (readyP) return readyP;
    if (!window.maplibregl) return Promise.reject(new Error('maplibre'));
    maplibregl.setWorkerUrl('vendor/maplibre/maplibre-gl-csp-worker.js');
    readyP = buildMap('t4Map', () => year, true).then((m) => { map = m; });
    return readyP;
  }
  // 올해와 비교(v7, S-Map 연도 비교처럼): 오른쪽에 올해 모형을 하나 더 세우고 두 지도의 시점을 같이 움직인다. 왼쪽은 막대의 해
  let map2 = null, map2P = null, lastGj = null, syncing = false;
  const camOf = (m) => ({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() });
  const sync = (a, b) => a.on('move', () => { if (syncing) return; syncing = true; b.jumpTo(camOf(a)); syncing = false; });
  $('t4Cmp').addEventListener('click', async () => {
    const on = $('t4Cmp').getAttribute('aria-pressed') !== 'true';
    $('t4Cmp').setAttribute('aria-pressed', String(on));
    $('t4App').classList.toggle('is-compare', on);
    await ready();
    map.resize();
    if (!on) return;
    if (!map2P) map2P = buildMap('t4Map2', () => NOW, false).then((m) => { map2 = m; sync(map, m); sync(m, map); });
    await map2P;
    map2.resize();
    if (lastGj) map2.getSource('b').setData(lastGj);
    map2.jumpTo(camOf(map));
  });

  function stop() { if (timer) { clearInterval(timer); timer = null; } $('t4Play').setAttribute('aria-pressed', 'false'); $('t4Play').textContent = '연도 돌려 보기'; }
  // 올해(처음 화면)에서 누르면 1960년부터 올해까지 동네가 지어지는 모습을 돌린다. 미래(올해 뒤)는 막대를 옮긴 뒤 누를 때만 돌린다(v7: 처음 누르면 미래만 돌아 '지어지는 모습'이 안 보였다)
  $('t4Play').addEventListener('click', () => {
    if (timer) return stop();
    if (year >= TO || year === NOW) year = YEAR_FROM;
    const end = year < NOW ? NOW : TO;
    $('t4Play').setAttribute('aria-pressed', 'true'); $('t4Play').textContent = '멈춤';
    timer = setInterval(() => { year += 1; slider.value = String(year); paint(); if (year >= end) stop(); }, 140);
  });
  slider.addEventListener('input', () => { stop(); year = Number(slider.value); paint(); });
  $('t4Now').addEventListener('click', () => { stop(); year = NOW; slider.value = String(year); paint(); });
  $('t4Marks').addEventListener('click', (e) => { const b = e.target.closest('[data-y]'); if (!b) return; stop(); year = Number(b.dataset.y); slider.value = String(year); paint(); });

  // 구·군 → 법정동(buildings/index.json, 부산만). 지도에서 좌표로 왔으면 그 자리의 동부터
  const q = new URLSearchParams(location.search);
  const at = q.has('lat') && q.has('lng') ? [Number(q.get('lng')), Number(q.get('lat'))] : null;
  Promise.all([getJson('buildings/index.json'), at ? getJson('bldg_outline/index.json') : null]).then(([idx, outlineIdx]) => {
    const gus = idx.sigungu.filter((s) => s.code.startsWith('26') && s.dongs.length);
    const fill = (sel, items, pick) => sel.replaceChildren(...items.map(([v, t]) => { const o = new Option(t, v); o.selected = v === pick; return o; }));
    const dongs = (gu, pick) => fill($('t4Dong'), gus.find((s) => s.code === gu).dongs.map((d) => [d.code, d.name]), pick);   // v7: 건물 수는 숫자판 하나로만(평가: 한 화면에 건물 수가 셋)
    const near = outlineIdx ? dongAt(outlineIdx, at[0], at[1]) : null;
    const want = q.get('bjd') || near || '2635010300';
    if (at && !near) {
      $('t4Status').textContent = '지도에서 보던 자리는 아직 4D 자료가 없습니다(부산만 있습니다). 대신 반여동을 보여 줍니다.';
      const v = document.querySelector('a[href^="field/city3d.html"]');
      if (v) v.href = `field/city3d.html?lat=${at[1].toFixed(5)}&lng=${at[0].toFixed(5)}`;
    }
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
