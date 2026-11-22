/* 동네 현황 지도의 안전·재난·기후 층. 자료는 data/safety_climate.json 하나다(backend/scripts/export_safety_climate.py, 설명 docs/data/safety_climate_2026-11-22.md).
   좌표가 있는 자료는 지도 위 작은 점, 좌표 없는 목록은 고른 동 카드에 코드·이름으로 맞춘 줄, 구·군·시·도 자료는 그 구·군·시·도 목록으로 보인다.
   값으로 동·구를 칠하거나 줄 세우지 않는다(자료 note). 파일이 약 2.3MB라 층을 펼치거나 ?layer=safety(?preset=safety)로 들어올 때만 받는다.
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부(map.js가 만든 Leaflet 지도와 고른 동 카드에 붙는다). util.js·map.js 다음에 싣는다. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./util.js') : root && root.RenewUtil);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewSafety = api;
})(typeof window !== 'undefined' ? window : null, function (U) {
  'use strict';
  const { esc } = U;
  const DATA_URL = 'data/safety_climate.json', LAW_URL = 'data/law_sources.json';
  const NOTE = '참고용 자료입니다. 시설이 많다고 안전하다는 뜻이 아닙니다. 판단은 구청·담당 기관이 합니다.';
  // shortcut: 자료를 받기 전에 동 카드에 묶음을 둘지 정해야 해서 자료 범위(부산 16개 구·군, 거제 38090, 양산 38100)를 적어 둔다. 범위가 늘면 고친다(시험이 자료의 sgg와 대조한다)
  const IN_SCOPE = /^(21\d{3}|38090|38100)/;
  // 점 색은 자료를 가르는 표시일 뿐 값이 아니다. 동 색(크림·갈색)과 섞이지 않는 짙은 중간색
  const COLORS = ['#2f4b7c', '#1f6f6a', '#6a4c93', '#4a5560', '#7a5a1f', '#8a3b5c'];
  const want = search => { const p = new URLSearchParams(search || ''); return p.get('layer') === 'safety' || p.get('preset') === 'safety'; };
  const sets = data => data.layers.map(l => ({ src: data.sources[l.source], fields: l.fields, rows: l.rows }));
  const isPoint = s => s.fields.includes('lat') && s.fields.includes('lng');
  const at = (s, f) => s.fields.indexOf(f);
  // 지도에 찍을 수 있는 줄(국가안전대진단은 좌표 없는 줄이 섞여 있다)
  const mapped = s => s.rows.filter(r => Number.isFinite(r[at(s, 'lat')]) && Number.isFinite(r[at(s, 'lng')]));
  const num = n => Number(n).toLocaleString('ko-KR');
  // 오픈API로 받은 자료는 기준일·파일 일자가 없어 받은 날을 적는다
  const dateText = src => (src.base_date ? `기준일 ${src.base_date}` : src.file_date ? `파일 일자 ${src.file_date}` : `받은 날 ${String(src.retrieved_at || '').slice(0, 10)}`);
  // 이름 맞춤의 뿌리: 행정동 '동대신1동', 법정동 '동대신동2가', 산불 자료의 '서대신'·'하청'(하청면)을 같은 뿌리로 본다
  const core = n => U.dongStem(String(n || '').trim().replace(/\d+가$/, '')).replace(/(동|읍|면|리|가)$/, '');
  const dongKeys = name => new Set([name, ...U.members(name)].map(core).filter(Boolean));
  // 해마다 센 값은 '2020년 6건'처럼 한 줄로. 원자료 줄 수를 센 값과 원자료가 센 표가 섞여 있어(SCHEMA.md) 무엇을 센 수인지 작은 글로 붙인다
  const COUNT = { cases: ['건', '응급실 감시 신고 수'], infected: ['건', '병든 나무로 적힌 조사 기록 수'], fires: ['건', '화재 건수, 발화요인을 모두 더한 값'],
    patients: ['명', '건강보험 진료 환자 수, 원자료가 가린 칸을 넣지 않고 더해 실제보다 적을 수 있음'] };
  const countField = s => s.fields.find(f => COUNT[f]);
  const isYearly = s => at(s, 'year') >= 0 && !!countField(s);
  function yearSums(s, rows) {
    const iy = at(s, 'year'), f = countField(s), ic = at(s, f), m = new Map();
    rows.forEach(r => { const o = m.get(String(r[iy])) || { n: 0, k: 0 }; if (Number.isFinite(r[ic])) { o.n += r[ic]; o.k++; } m.set(String(r[iy]), o); });
    // 그해 칸이 모두 가려졌으면(null) 0이 아니라 '가림'
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([y, o]) => `${y}년 ${o.k ? num(o.n) + COUNT[f][0] : '가림'}`).join(' · ');
  }
  const yearHTML = x => `<b>${esc(x.s.src.kind)}</b> ${esc(yearSums(x.s, x.rows))} <small>(${COUNT[countField(x.s)][1]})</small>`;
  const has = (s, ...fs) => fs.some(f => s.fields.includes(f));
  const unitWord = s => (has(s, 'month') ? '개월' : has(s, 'disease') ? '종' : has(s, 'date', 'year', 'start') ? '건' : '곳');
  // 목록 한 줄: 코드·지역 칸은 빼고, 값만으로 뜻이 안 서는 칸에만 이름을 붙인다
  const SKIP = new Set(['sgg', 'sigungu', 'sido', 'dong', 'bjd10', 'lat', 'lng']);
  const LABEL = { jibun: '지번', year: '연도', area_ha: '면적(ha)', area_m2: '면적(㎡)', shelter: '대피소', designated: '지정일', released: '해제일', ref_date: '자료 기준일', date: '일자', time: '시각',
    event: '발생 기간', checked: '점검일', capacity: '수용 인원', last_regular: '최근 정기점검', last_precise: '최근 정밀점검', last_diag: '최근 정밀안전진단', de_date: 'D·E등급 지정일',
    next_check: '다음 점검', use_limit: '사용 제한', notice: '주민 알림', confirmed: '확진', deaths: '사망', cases: '발생', area: '방제 면적', start: '시작일', end: '종료일', trees: '방제 본수',
    dispatches: '출동', transports: '이송 건수', illness: '질병', non_illness: '질병 외', traffic: '교통사고', non_trauma: '비외상성 손상', injury: '사고부상', other: '기타',
    sensor: '센서', items: '관측 항목', first: '처음', last: '마지막', rows: '관측 기록 수' };
  // 같은 칸 이름이 자료마다 뜻이 다를 때만 자료 번호로 덮는다(국가안전대진단의 target은 대상 시설 종류다)
  const LABEL_OF = { '15133362.done': '정비 완료', '15133362.target': '정비 대상', '15045361.patients': '이송 인원', '15013202.grade': '등급' };
  const rowText = (fields, row, id) => fields.map((f, i) => [f, row[i]]).filter(([f, v]) => !SKIP.has(f) && v != null && v !== '')
    .map(([f, v]) => { const l = LABEL_OF[`${id}.${f}`] || LABEL[f], t = typeof v === 'number' ? num(v) : String(v); return l ? `${l} ${t}` : t; }).join(' · ');
  const rowsHTML = (s, rows) => `<ul class="sl-rows">${rows.map(r => `<li>${esc(rowText(s.fields, r, s.src.id))}</li>`).join('')}</ul>`;
  // 법령 근거: law_sources.json에서 이 자료 번호를 datasets에 적은 조문만. 없으면 아무것도 적지 않는다
  function lawHTML(laws, id) {
    const hits = ((laws && laws.sources) || []).filter(e => Array.isArray(e.datasets) && e.datasets.includes(id) && /^https:\/\//.test(e.url_current || ''));
    return hits.map(e => ` · 근거: <a href="${esc(e.url_current)}" target="_blank" rel="noopener">${esc(e.name)} ${esc(e.article)}</a>`).join('');
  }
  const srcLine = (s, laws) => `<small class="sl-src">출처 ${esc(s.src.org)} ${/^https:\/\//.test(s.src.url || '') ? `<a href="${esc(s.src.url)}" target="_blank" rel="noopener">${esc(s.src.name)}</a>` : esc(s.src.name)} · ${esc(dateText(s.src))}${lawHTML(laws, s.src.id)}</small>`;

  // 이 동 안의 점 시설 수. 그 자료가 덮는 시·도의 동에만 줄을 둔다(부산 자료를 양산 동에 '0곳'으로 적지 않는다)
  function pointCounts(data, code) {
    return sets(data).filter(isPoint).map(s => { const i = at(s, 'dong'); return { s, n: s.rows.filter(r => r[i] === code).length, here: s.rows.some(r => String(r[i] || '').slice(0, 2) === code.slice(0, 2)) }; })
      .filter(x => x.here);
  }
  // 좌표 없는 목록에서 이 동의 줄. 행정동 코드 칸(dong)이 차 있으면 코드로, 아니면 같은 구·군 안의 읍·면·동·리 이름으로 맞춘다(byName).
  // 법정동 코드(bjd10)만 있는 자료는 names(법정동 코드 → 이름, 생활 지표 파일의 bjdong_cells)로 이름을 찾아 맞춘다. names가 없으면 맞추지 않는다.
  // 주소처럼 적힌 칸(재해위험지구 '암남동 산108번지', 병해충 방제 '부산광역시 서구 암남동')은 그 안의 동·읍·면 낱말로 맞춘다
  const PLACE = ['place', 'area_name'];
  function dongMatches(data, code, name, names) {
    const sg = code.slice(0, 5), keys = dongKeys(name), out = [];
    for (const s of sets(data)) {
      const iD = at(s, 'dong'), iS = at(s, 'sgg'), iE = at(s, 'emd'), iR = at(s, 'ri'), iB = at(s, 'bjd10'), iP = s.fields.findIndex(f => PLACE.includes(f));
      if (isPoint(s) || (iD < 0 && iE < 0 && iB < 0 && iP < 0)) continue;
      let byName = false;
      const rows = s.rows.filter(r => {
        if (iD >= 0 && r[iD]) return r[iD] === code;
        if (iB < 0 && r[iS] !== sg) return false;
        const ns = iB >= 0 ? [names && names.get(r[iB])] : iE >= 0 || iR >= 0 ? [(iE >= 0 && r[iE]) || (iR >= 0 && r[iR])]
          : String(r[iP] || '').split(/\s+/).filter(w => /(동|읍|면|가)$/.test(w));
        const hit = ns.some(n => !!n && keys.has(core(n)));
        byName = byName || hit;
        return hit;
      });
      if (rows.length) out.push({ s, rows, byName });
    }
    return out;
  }
  // 이 구·군의 이름과 시·도 이름(자료의 sgg·sigungu·sido 칸에서)
  function placeOf(data, code5) {
    const p = { sg: '', sido: '' };
    for (const s of sets(data)) {
      const i = at(s, 'sgg'), r = i >= 0 && s.rows.find(x => x[i] === code5);
      if (!r) continue;
      if (!p.sg && at(s, 'sigungu') >= 0) p.sg = r[at(s, 'sigungu')];
      if (!p.sido && at(s, 'sido') >= 0) p.sido = r[at(s, 'sido')];
    }
    return p;
  }
  // 동보다 넓은 자료(level sg·sido). 구·군 칸(sgg)이 있고 동 이름·코드 칸이 없으면 구·군, 주소 칸이 있는 자료도 구·군 안 모든 줄을 함께 둔다.
  // 구·군 칸이 없는 자료: 소방서(거제소방서)·열섬 센서(중구)는 이름으로 구·군에, 시·도 칸('부산')·발령 지역('부산광역시·경상남도')은 시·도에 둔다
  function sgItems(data, code5) {
    const { sg, sido } = placeOf(data, code5), short = sg.replace(/(시|군|구)$/, '');
    const rule = s => {
      const f = n => at(s, n);
      if (f('sgg') >= 0) return f('dong') < 0 && f('emd') < 0 && f('bjd10') < 0 && ['sg', r => r[f('sgg')] === code5];
      if (f('station') >= 0) return ['sg', r => !!short && String(r[f('station')]).startsWith(short)];
      if (f('sensor') >= 0) return ['sg', r => !!sg && r[f('name')] === sg];
      if (f('sido') >= 0) return ['sido', r => !!sido && U.sidoShort(r[f('sido')]) === U.sidoShort(sido)];
      if (f('areas') >= 0) return ['sido', r => !!sido && String(r[f('areas')]).split('·').includes(sido)];
      return false;
    };
    return sets(data).filter(s => !isPoint(s)).map(s => { const r = rule(s); return r && { s, level: r[0], rows: s.rows.filter(r[1]) }; }).filter(x => x && x.rows.length);
  }
  // 펼칠 때 채우는 구·군·시·도 목록(공공시설물 안전등급은 구·군 하나에 수백 줄이다)
  function moreHTML(data, id, code5) {
    const x = sgItems(data, code5).find(y => y.s.src.id === id);
    return x ? rowsHTML(x.s, x.rows) : '';
  }
  function cardHTML(data, laws, code, name, names) {
    const li = (head, s) => `<li>${head}${srcLine(s, laws)}</li>`;
    const pts = pointCounts(data, code), hits = dongMatches(data, code, name, names), up = sgItems(data, code.slice(0, 5));
    const ptHTML = pts.length ? `<h4 class="sl-h">이 동 안 시설 <small>지도 점과 같은 자료</small></h4><ul class="sl-list">${pts.map(x => li(`<b>${esc(x.s.src.kind)} ${num(x.n)}곳</b>`, x.s)).join('')}</ul>` +
      '<p class="sl-none">행정동 경계 부근 시설은 이웃 동으로 셀 수 있습니다.</p>' : '';
    const hitHTML = `<h4 class="sl-h">이 동 코드·이름으로 찾은 목록</h4>` + (hits.length
      ? `<ul class="sl-list">${hits.map(x => li(isYearly(x.s) ? `${yearHTML(x)}${x.byName ? ' <small>이름으로 맞춤</small>' : ''}`
        : `<details><summary><b>${esc(x.s.src.kind)} ${num(x.rows.length)}${unitWord(x.s)}</b>${x.byName ? ' <small>이름으로 맞춤</small>' : ''}</summary>${rowsHTML(x.s, x.rows)}</details>`, x.s)).join('')}</ul>` +
        (hits.some(x => x.byName) ? '<p class="sl-none">이름으로 맞춤: 원자료의 읍·면·동·리 이름으로 붙였습니다. 한 법정동이 여러 행정동에 걸치면 그 동들에 모두 보입니다.</p>' : '')
      : '<p class="sl-none">좌표 없는 목록에서 이 동 코드·이름과 맞는 줄이 없습니다.</p>');
    // 세 줄 이하(시·도 정비 현황, 소방서 한 곳 등)는 바로 보이고, 그보다 길면 펼칠 때 채운다
    const upLi = x => li(isYearly(x.s) ? `${yearHTML(x)}${x.s.src.blank_sigungu ? '<br><small>2018년까지는 원자료에 구·군 칸이 빈 줄이 많아 빠진 건이 있습니다.</small>' : ''}`
      : x.rows.length <= 3 ? `<b>${esc(x.s.src.kind)}</b>${rowsHTML(x.s, x.rows)}`
      : `<details data-sl-more="${esc(x.s.src.id)}"><summary><b>${esc(x.s.src.kind)} ${num(x.rows.length)}${unitWord(x.s)}</b> <small>펼치면 목록</small></summary></details>`, x.s);
    const upHTML = (level, head, small) => { const xs = up.filter(x => x.level === level); return xs.length ? `<h4 class="sl-h">${head} <small>${small}</small></h4><ul class="sl-list">${xs.map(upLi).join('')}</ul>` : ''; };
    const { sg, sido } = placeOf(data, code.slice(0, 5));
    return `<p class="sl-note">${esc(NOTE)}</p>${ptHTML}${hitHTML}` + upHTML('sg', `${esc(sg || '구·군')} 전체 자료`, '구·군 단위 자료와 구·군 안 모든 줄') +
      upHTML('sido', `${esc(sido || '시·도')} 전체 자료`, '구·군으로 나누지 않은 자료');
  }
  const colorOf = (data, id) => COLORS[sets(data).filter(isPoint).findIndex(s => s.src.id === id) % COLORS.length];
  // '준비 중'인 자료(pending)와 이용조건 때문에 미룬 자료(held)를 접은 칸 하나에
  function pendingHTML(data) {
    // 미룬 자료(held)의 까닭 글은 수집 기록용이라(활용신청 경과 등) 이름만 한 줄로 모은다. 까닭은 docs/data/safety_climate_2026-11-22.md에 있다
    const pending = data.pending || [], held = data.held || [], n = pending.length + held.length;
    return n ? `<details class="sl-pend"><summary>아직 넣지 못한 자료 ${n}가지</summary><ul>${pending.map(x => `<li><b>${esc(x.name)}</b> ${esc(x.reason)}</li>`).join('')}` +
      (held.length ? `<li><b>찾았지만 넣지 않은 자료</b> 이용조건 표시가 서로 다르거나 지역을 가를 수 없는 등의 이유로 넣지 않았습니다: ${held.map(x => esc(x.name)).join(', ')}</li>` : '') + '</ul></details>' : '';
  }
  // 지도 위 층 단추 안쪽: 주제(topics) 묶음마다 점 자료 하나에 확인란 하나
  function controlHTML(data, on) {
    const pts = sets(data).filter(isPoint);
    const count = s => { const m = mapped(s).length, off = s.rows.length - m; return `${num(m)}곳${off ? `(좌표 없는 ${num(off)}곳은 지도에 없음)` : ''}`; };
    const cardOnly = data.topics.filter(t => !pts.some(s => s.src.topic === t.id)).map(t => t.label);
    return `<p class="sl-note">${esc(NOTE)}</p>` + data.topics.map(t => [t, pts.filter(s => s.src.topic === t.id)]).filter(g => g[1].length).map(([t, list]) =>
      `<fieldset class="sl-topic"><legend>${esc(t.label)}</legend>${list.map(s => `<label class="sl-opt"><input type="checkbox" data-sl-id="${esc(s.src.id)}"${on.has(s.src.id) ? ' checked' : ''}>` +
        `<i class="sl-sw" data-bg="${colorOf(data, s.src.id)}" aria-hidden="true"></i><span>${esc(s.src.kind)} <small>${count(s)} · ${esc(s.src.org)} · ${esc(dateText(s.src))}</small></span></label>`).join('')}</fieldset>`).join('') +
      `<p class="sl-none">점을 누르면 이름과 출처·일자가 보입니다. 동을 고르면 동 카드 끝에 그 동의 안전·재난·기후 자료가 붙습니다.${cardOnly.length ? ` 좌표가 없는 자료(${esc(cardOnly.join(', '))})는 동 카드에만 있습니다.` : ''}</p>` + pendingHTML(data);
  }
  function tipHTML(s, row) {
    const v = f => row[at(s, f)], label = s.src.detail_label;
    // 이름·세부 말고 다른 칸이 있는 자료(국가안전대진단: 연도·대상·분야·결과·점검일)는 한 줄로 더한다
    const rest = s.fields.map((f, i) => [f, row[i]]).filter(([f]) => f !== 'name' && f !== 'detail'), more = rowText(rest.map(x => x[0]), rest.map(x => x[1]), s.src.id);
    return `<b>${esc(v('name'))}</b>${v('detail') ? `<br>${label ? `${esc(label)}: ` : ''}${esc(v('detail'))}` : ''}${more ? `<br>${esc(more)}` : ''}<br><small>${esc(s.src.kind)} · 출처 ${esc(s.src.org)} ${esc(s.src.name)} · ${esc(dateText(s.src))}</small>`;
  }
  const api = { DATA_URL, NOTE, IN_SCOPE, COLORS, want, sets, isPoint, core, dongKeys, yearSums, rowText, lawHTML, pointCounts, dongMatches, sgItems, moreHTML, cardHTML, colorOf, pendingHTML, controlHTML, tipHTML };
  if (typeof document === 'undefined') return api;

  // ── 브라우저 ──
  let data = null, laws = null, loading = null, failed = false, wantAll = want(location.search), map = null, box = null, card = null;
  const on = new Set(), groups = new Map(), names = new Map();
  const WAIT = '<p class="sl-none" role="status">자료를 불러오는 중입니다.</p>', FAIL = '<p class="sl-none" role="alert">자료를 받지 못했습니다. 접었다가 다시 펼쳐 주세요.</p>';
  function load() {
    if (data || loading) return loading || Promise.resolve();
    failed = false;
    loading = Promise.all([U.fetchJson(DATA_URL), U.fetchJson(LAW_URL, true)]).then(([d, l]) => {
      loading = null;
      if (d && Array.isArray(d.sources) && Array.isArray(d.layers) && Array.isArray(d.topics)) { data = d; laws = l; } else failed = true;
      if (data && wantAll) { sets(data).filter(isPoint).forEach(s => on.add(s.src.id)); wantAll = false; }
      paint();
    });
    paint();
    return loading;
  }
  const waitHTML = () => (failed ? FAIL : WAIT);
  function paint() {
    if (box) {
      const b = box.querySelector('.sl-in');
      b.innerHTML = data ? controlHTML(data, on) : waitHTML();
      b.querySelectorAll('[data-bg]').forEach(i => { i.style.background = i.dataset.bg; });   // CSP: style 속성 대신 CSSOM
    }
    if (card) fillCard();
    sync();
  }
  // 점 층은 자료마다 한 번만 만들고 켜고 끄기만 한다. SVG로 둔다(수질 점과 같다): 별도 Canvas는 빈 곳의 동 누르기까지 가로막는다
  function sync() {
    if (!map || !data) return;
    const L = window.L;
    sets(data).filter(isPoint).forEach(s => {
      const id = s.src.id;
      let g = groups.get(id);
      if (on.has(id) && !g) {
        const ia = at(s, 'lat'), io = at(s, 'lng'), style = { pane: 'safety', radius: 4, weight: 1, color: '#fff', fillColor: colorOf(data, id), fillOpacity: 0.95 };
        g = L.layerGroup(mapped(s).map(r => L.circleMarker([r[ia], r[io]], style).bindTooltip(() => tipHTML(s, r), { className: 'sl-tip' })));
        groups.set(id, g);
      }
      if (g) { if (on.has(id)) g.addTo(map); else g.remove(); }
    });
  }
  function attach(m) {
    if (!m || map) return;
    map = m;
    const L = window.L, c = L.control({ position: 'topleft' });
    map.createPane('safety').style.zIndex = 455;   // 수질 점(450) 위, 동 이름(460) 아래. 동 층을 다시 그려도 덮이지 않는다
    c.onAdd = () => {
      box = L.DomUtil.create('details', 'sl-ctl leaflet-bar');
      box.innerHTML = '<summary>안전·재난·기후 시설</summary><div class="sl-in"></div>';
      L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
      // 펼친 칸은 지도 높이 안에서 스크롤한다(휴대폰 지도는 약 350px이라 넘치면 아래가 잘렸다)
      box.addEventListener('toggle', () => { if (!box.open) return; box.querySelector('.sl-in').style.maxHeight = Math.max(100, map.getSize().y - box.offsetTop - box.firstElementChild.offsetHeight - 40) + 'px'; load(); });
      box.addEventListener('change', e => { const id = e.target.dataset && e.target.dataset.slId; if (!id) return; if (e.target.checked) on.add(id); else on.delete(id); sync(); });
      return box;
    };
    c.addTo(map);
    // 주소로 오면 점은 모두 켠다. 단추 칸은 넓은 화면에서만 펼친다(휴대폰은 펼치면 지도를 거의 덮는다)
    // 2026-11-22 공개판 실측: 넓은 화면에서 펼쳐 두면 지도의 약 4분의 1(320×594px)을 덮었다. 주소로 와도 점만 켜고 칸은 접어 둔다
    paint();
  }
  // 고른 동 카드 끝에 붙인다(map.js render가 카드를 다시 그릴 때마다 부른다). 같은 동이면 같은 칸을 다시 붙여 펼침 상태를 지킨다
  function fillCard() {
    const code = card.dataset.code, sg = code.slice(0, 5), inner = card.querySelector('.sl-in');
    if (!data) { inner.innerHTML = waitHTML(); return; }
    if (!names.has(sg)) {
      names.set(sg, null);
      const url = `data/national/living/${sg}.json`;
      U.fetchJson(url).then(j => {
        if (!j && U.fetchFailed(url)) { names.delete(sg); return; }   // 받지 못함(통신 끊김)은 다음에 카드를 그릴 때 다시 받는다. 파일 없음(404)은 이름표 없음으로 둔다
        names.set(sg, new Map(((j && j.bjdong_cells) || []).map(b => [b.code10, b.name])));
        if (card && card.dataset.code.startsWith(sg)) fillCard();
      });
    }
    inner.innerHTML = cardHTML(data, laws, code, card.dataset.name, names.get(sg));
  }
  api.card = (panel, code, name) => {
    if (!IN_SCOPE.test(code)) return;
    if (!card || card.dataset.code !== code) {
      card = document.createElement('details');
      card.className = 'sl-card'; card.dataset.code = code; card.dataset.name = name;
      card.innerHTML = '<summary>안전·재난·기후 자료 <small>참고용</small></summary><div class="sl-in"></div>';
      card.addEventListener('toggle', e => {
        const d = e.target;
        if (d === card) { if (card.open) load(); return; }
        if (d.open && d.dataset.slMore && !d.dataset.filled && data) { d.dataset.filled = '1'; d.insertAdjacentHTML('beforeend', moreHTML(data, d.dataset.slMore, code.slice(0, 5))); }
      }, true);
      card.open = on.size > 0 || wantAll;   // 층을 켠 채로(또는 ?layer=safety로) 동을 고르면 펼쳐 둔다
      fillCard();
    }
    (panel.querySelector('.mp-body') || panel).append(card);
  };
  if (wantAll) load();
  const ready = () => attach(window.RenewMap && window.RenewMap.getMap && window.RenewMap.getMap());
  document.addEventListener('renew-map', ready);
  ready();
  return api;
});
