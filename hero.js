/* 리뉴맵 1분 판정 예시와 스크롤 등장, JSON 공용 캐시. 첫 화면 지도·검색·자동 재생은 map.js가 맡는다.
   화면 숫자는 data/dashboard.json(원장 export)에서만 온다. 없으면 '준비 중'.
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부다. */
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const nf = d => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d) => (isNum(v) ? nf(d).format(v) : null);
  const day = s => (s ? String(s).slice(0, 10) : null);
  const BANYEO = '2635010300'; // 해운대구 반여동(법정동). 판정 예시에 쓰는 실제 동 1곳

  // 초안 규칙 decline-3req-v0.1(backend/renewmap/rules/decline.py)의 기준값을 '설명'에만 쓴다.
  // 판정은 사람이 승인한 백엔드 규칙이 한다. 여기서는 셀 값과 기준값을 나란히 보여 줄 뿐이다.
  const RULE = { id: 'decline-3req-v0.1', law: '도시재생 활성화 및 지원에 관한 특별법 시행령 제17조', state: '초안 · 승인 대기' };
  const REQS = [
    { name: '인구', text: '30년 최대 대비 20% 이상 감소 또는 5년 중 3년 연속 감소', ind: 'DECLINE_POP_DROP30Y_PCT', min: 20, src: '주민등록 인구' },
    { name: '사업체', text: '10년 최대 대비 5% 이상 감소 또는 5년 중 3년 연속 감소', ind: 'DECLINE_BIZ_DROP10Y_PCT', min: 5, src: '사업체 조사' },
    { name: '노후', text: '준공 20년 이상 건축물 50% 이상', ind: 'AGING_20Y_COUNT', min: 50, src: '건축물대장' },
  ];
  const cellOf = (dong, ind) => ((dong && dong.cells) || []).find(c => c.indicator_code === ind) || null;
  function pickDong(dash) {
    const dongs = dash && Array.isArray(dash.dongs) ? dash.dongs : [];
    return dongs.find(d => d.code === BANYEO) || dongs[0] || null;
  }
  // 요건별 행: 셀이 없거나 값이 숨겨지면 '추가확인'. 값이 있으면 기준값과 비교한 방향만 적는다
  function verdictRows(dong) {
    return REQS.map(r => {
      const c = cellOf(dong, r.ind), v = c && isNum(c.value) ? c.value : null;
      const status = v === null ? '추가확인' : v >= r.min ? '충족' : '미충족';
      return { name: r.name, text: r.text, src: r.src, min: r.min, value: v, valueText: v === null ? (c && c.value_hidden_reason ? '비공개' : '자료 준비 중') : fmt(v, 1) + '%',
        status, ref: c ? day(c.reference_date) : null, source: c ? c.source_name : null, cell: c };
    });
  }
  // decline_verdict()와 같은 셈: 2개 이상 충족이면 충족 방향, 결측을 더해 2개가 될 수 있으면 추가확인, 아니면 미충족 방향
  function verdictSummary(rows) {
    const met = rows.filter(r => r.status === '충족').length, check = rows.filter(r => r.status === '추가확인').length;
    const label = met >= 2 ? '충족 방향' : met + check >= 2 ? '추가확인' : '미충족 방향';
    return { met, check, label, text: `${met}/3 충족 · ${check} 추가확인 → ${label}` };
  }
  // ── 아래 섹션 그림: 숫자는 원장 파일에서만. 없으면 '–' ──
  // 공공 출처 수: index.json(쇠퇴·경계·인구·사업체)·living/index.json(생활 지표, 파생 'std' 제외)·정밀 사례 셀의 출처 이름을 겹치지 않게 센다
  function problemStats(index, li, cell, D) {
    const names = new Set();
    for (const k of ['source', 'boundary_source', 'pop_source', 'biz_source']) { const n = index && index[k] && index[k].name; if (n) names.add(String(n)); }
    for (const [k, v] of Object.entries((li && li.sources) || {})) if (k !== 'std' && v && v.name) names.add(String(v.name));
    if (cell && cell.source_name) names.add(String(cell.source_name));
    const fields = cell && D ? D.detailRows(cell).length : null;
    return { sources: names.size || null, emd: index && isNum(index.emd_count) ? index.emd_count : null, fields };
  }
  const PARTS = ['출처', '기준일', '계산식', '규칙 버전', '표본수', '이용조건'];   // 업무 화면은 이모지 없이 글자만(D22)
  // 원장 셀 해부도: 가운데 값, 둘레에 근거 항목 6개를 선으로 잇는다. 값·항목은 detailRows(cell) 그대로
  function anatomyHTML(dong, cell, D) {
    if (!dong || !cell || !D) return null;
    const v = D.cellView(cell), rows = D.detailRows(cell), get = k => (rows.find(r => r[0] === k) || [])[1];
    const parts = PARTS.filter((k) => get(k)).map((k, i) => `<li class="anat-p p${i}"><b>${esc(k)}</b><span>${esc(get(k))}</span></li>`).join('');
    const ys = [16.7, 50, 83.3], lines = ys.map(y => `<line x1="31" y1="${y}" x2="38" y2="50"/><line x1="69" y1="${y}" x2="62" y2="50"/>`).join('');
    return `<svg class="anat-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>` +
      `<div class="anat-core"><p class="anat-k">${esc(dong.name)} · 준공 20년 이상 건축물 비율(동수 기준)</p><p class="anat-v">${esc(v.text)}</p><span class="tag ${esc(v.cls === 'none' ? 'check' : v.cls)}">${esc(v.status)}</span><p class="anat-cap">실제 원장 셀 1개 · ${esc(dong.unit || '')} ${esc(dong.code)}</p></div>` +
      `<ul class="anat-parts">${parts}</ul>`;
  }
  const api = { RULE, REQS, BANYEO, pickDong, verdictRows, verdictSummary, problemStats, anatomyHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewHero = api;

  // JSON을 한 번만 받아 hero.js·map.js가 같이 쓴다. 404·오류는 null
  const cache = {};
  window.renewFetch = url => cache[url] || (cache[url] = fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);

  function verdict(dash) {
    const box = $('verdictCards'); if (!box) return;
    const dong = pickDong(dash);
    if (!dong) { box.innerHTML = `<p class="verdict-empty" role="status">예시 동의 원장 셀이 준비되면 이 자리에 보입니다.<br>숫자를 지어내지 않습니다.</p>`; return; }
    const rows = verdictRows(dong), sum = verdictSummary(rows);
    const cls = { '충족': 'ok', '미충족': 'conflict', '추가확인': 'check' };
    box.innerHTML = `<p class="verdict-head"><b>${esc(dong.name)}</b> <small>${esc(dong.unit || '')} · ${esc(dong.code)}</small></p>` +
      `<div class="verdict-grid">${rows.map(r => `<article class="verdict-card ${cls[r.status]}" data-reveal><span class="tag ${cls[r.status]}">${esc(r.status)}</span><h3>${esc(r.name)} 요건</h3>` +
        `<p class="v">${esc(r.valueText)}</p><p class="d">기준: ${esc(r.text)}.</p>` +
        `<p class="proof">${r.source ? `출처 ${esc(r.source)}.<br>기준일 ${esc(r.ref || '기록 없음')}.` : '이 요건의 원장 셀이 아직 없습니다.<br>추정으로 채우지 않습니다.'}</p></article>`).join('')}</div>` +
      `<p class="verdict-sum" aria-live="polite"><span class="tag ${sum.label === '추가확인' ? 'check' : sum.label === '충족 방향' ? 'ok' : 'conflict'}">${esc(sum.text)}</span></p>` +
      `<p class="verdict-note">초안 규칙 ${esc(RULE.id)}(${esc(RULE.state)}) · ${esc(RULE.law)}.<br>법정 판정이 아니라 셀 값과 기준값을 나란히 둔 화면입니다.<br>판정은 사람이 조문을 보고 승인한 규칙으로만 합니다.</p>`;
  }
  const count = el => (window.RenewMap && window.RenewMap.countUp ? window.RenewMap.countUp(el) : (el.textContent = el.dataset.count));
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); en.target.querySelectorAll('[data-count]').forEach(count); io.unobserve(en.target); } }), { threshold: 0.15 }) : null;
  const reveal = () => document.querySelectorAll('[data-reveal]').forEach(el => (reduced || !io ? el.classList.add('is-in') : io.observe(el)));
  reveal();

  function sections(dash, index, li) {
    const D = window.RenewDashboard, dong = pickDong(dash), cell = D && dong ? D.cellOf(dong, 20, 'COUNT') : null;
    const st = problemStats(index, li, cell, D);
    document.querySelectorAll('[data-stat]').forEach(el => {
      const n = st[el.dataset.stat]; if (!isNum(n)) return;
      el.dataset.count = n; el.dataset.ck = 'st-' + el.dataset.stat;
      if (reduced || el.closest('.is-in')) count(el);
    });
    const src = document.querySelector('[data-stat-src]');
    if (src) src.textContent = `숫자 출처: data/national/index.json·living/index.json(전국 지표 묶음), data/dashboard.json(${dong ? dong.name : '정밀 사례'} 셀).`;
    const box = $('ledgerAnat'), html = anatomyHTML(dong, cell, D);
    if (box && html) { box.innerHTML = html; box.classList.add('is-real'); }
  }
  Promise.all(['data/dashboard.json', 'data/national/index.json', 'data/national/living/index.json'].map(window.renewFetch)).then(([dash, index, li]) => { verdict(dash); sections(dash, index, li); reveal(); });
})();
