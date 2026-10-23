/* 리뉴맵 첫 화면: 실데이터 카운트업, 자동 재생 제품 시연(4단계), 1분 판정 예시.
   화면 숫자는 data/dashboard.json(원장 export)·data/national/index.json에서만 온다. 없으면 '준비 중'.
   위쪽은 노드 시험용 순수 함수, 아래쪽은 브라우저 연결부다. */
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const nf = d => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d) => (isNum(v) ? nf(d).format(v) : null);
  const day = s => (s ? String(s).slice(0, 10) : null);
  const BANYEO = '2635010300'; // 해운대구 반여동(법정동). 시연·판정 예시에 쓰는 실제 동 1곳

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
  // 히어로 카운트업 3개. 값이 없으면 value null → 화면은 '준비 중'
  function heroStats(dash, index) {
    const dongs = dash && Array.isArray(dash.dongs) ? dash.dongs : [];
    const b = dongs.map(d => d.buildings_total).filter(isNum);
    const sg = index && Array.isArray(index.sigungu) ? index.sigungu : [];
    const emd = index && isNum(index.emd_count) ? index.emd_count
      : sg.length && sg.every(s => isNum(s.emd_count)) ? sg.reduce((a, s) => a + s.emd_count, 0) : null;
    const sources = new Set(dongs.flatMap(d => (d.cells || []).map(c => c.source_name).filter(Boolean)));
    if (index && index.source && index.source.name) sources.add(index.source.name);
    const where = dash && dash.sigungu ? dash.sigungu.filter(s => s.status === '수집됨').map(s => s.name).join('·') : '';
    return [
      { key: 'buildings', label: '수집한 건축물', value: b.length ? b.reduce((a, x) => a + x, 0) : null, unit: '동', note: where ? `건축물대장 표제부 · ${where} ${dongs.length}개 법정동` : '건축물대장 표제부' },
      { key: 'emd', label: '전국 행정동', value: emd, unit: '개', note: index && index.source ? `${index.source.name || '도시재생종합정보체계'} 기준` : '도시재생종합정보체계 쇠퇴진단지표' },
      { key: 'sources', label: '공공 출처', value: sources.size || null, unit: '곳', note: '숫자마다 출처·기준일을 기록' },
    ];
  }
  // 시연 4단계. 값은 반여동 셀에서만. 없으면 '준비 중'
  function demoStages(dash) {
    const dong = pickDong(dash), rows = verdictRows(dong), sum = verdictSummary(rows), name = dong ? dong.name : '동 이름 준비 중';
    const aging = rows[2], hash = dash && /^[0-9a-f]{8,}$/i.test(dash.snapshot_hash || '') ? dash.snapshot_hash.slice(0, 16) : null;
    const srcShort = s => (s ? String(s).replace(/\(.*$/, '').replace(/^국토교통부 /, '') : '출처 준비 중');
    const cards = rows.map((r, i) => `<div class="src-card" style="--i:${i}"><b>${esc(r.src)}</b><span>${esc(r.name === '노후' ? '20년 이상 ' + r.valueText : r.valueText)}</span>` +
      `<em class="cell-tag">${esc(r.source ? srcShort(r.source) : '출처 대기')} · ${esc(r.ref || '기준일 대기')}</em></div>`).join('');
    const checks = rows.map((r, i) => `<li class="${r.status === '충족' ? 'met' : r.status === '미충족' ? 'no' : 'chk'}" style="--i:${i}"><i aria-hidden="true"></i><span>${esc(r.name)} <small>${esc(r.valueText)} · 기준 ${r.min}%</small></span><b>${esc(r.status)}</b></li>`).join('');
    return [
      { name: '자료 수집', html: `<p class="demo-cap">${esc(name)} · 공공데이터를 원장 셀로 쌓습니다.</p><div class="src-stack">${cards}</div><div class="ledger-box" aria-hidden="true"><span></span><span></span><span></span></div>` },
      { name: '법정 판정', html: `<p class="demo-cap">쇠퇴 3요건 · ${esc(RULE.state)}</p><ul class="chk">${checks}</ul><p class="flip-wrap"><span class="flip"><span class="front">계산 중</span><span class="back tag ${sum.label === '추가확인' ? 'check' : 'ok'}">${esc(sum.text)}</span></span></p>` },
      { name: '현장 확인', html: `<p class="demo-cap">${esc(name)} · 사진·위치·시각을 함께 남깁니다.</p><div class="field"><svg viewBox="0 0 220 120" aria-hidden="true"><path class="road" d="M0 70h220M80 0v120M150 20v100"/><circle class="pin-shadow" cx="110" cy="76" r="8"/><path class="pin" d="M110 36c-11 0-18 8-18 18 0 14 18 30 18 30s18-16 18-30c0-10-7-18-18-18z"/><circle class="pin-eye" cx="110" cy="54" r="6"/></svg>` +
        `<span class="chip photo" style="--i:0">사진 SHA-256</span><span class="chip gps" style="--i:1">GPS 정확도 기준 15m 이내</span><span class="chip time" style="--i:2">확인 시각 기록</span>` +
        `<span class="flip st"><span class="front tag none">미확인</span><span class="back tag ok">확인</span></span></div>` },
      { name: '보고서', html: `<p class="demo-cap">HWPX 보고서 · 각주마다 출처와 기준일이 찍힙니다.</p><div class="doc"><i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i><i class="s" style="--i:3"></i>` +
        `<p class="foot" style="--i:4">¹ ${esc(aging.source ? srcShort(aging.source) : '출처 준비 중')} · 기준일 ${esc(aging.ref || '준비 중')}</p>` +
        `<p class="hash">스냅샷 <code data-type="${esc(hash || '')}">${hash ? '' : '준비 중'}</code></p></div>` },
    ];
  }

  const api = { RULE, REQS, BANYEO, pickDong, verdictRows, verdictSummary, heroStats, demoStages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  window.RenewHero = api;

  // JSON을 한 번만 받아 hero.js·map.js가 같이 쓴다. 404·오류는 null
  const cache = {};
  window.renewFetch = url => cache[url] || (cache[url] = fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);

  function countUp(el, target, unit) {
    const f = nf(0), t0 = performance.now(), dur = 1400;
    const show = v => { el.textContent = f.format(v); };
    if (reduced) { show(target); return; }
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); show(Math.round(target * e)); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function stats(dash, index) {
    const box = $('heroStats'); if (!box) return;
    box.innerHTML = heroStats(dash, index).map(s => `<div class="stat"><span class="k">${esc(s.label)}</span>` +
      (s.value === null ? `<span class="v is-text">준비 중</span>` : `<span class="v"><b data-count="${s.value}">0</b><small>${esc(s.unit)}</small></span>`) +
      `<span class="n">${esc(s.note)}</span></div>`).join('');
    box.querySelectorAll('[data-count]').forEach(el => countUp(el, +el.dataset.count));
  }
  let timer = null, step = 0;
  function demo(dash) {
    const box = $('heroDemo'); if (!box) return;
    const stages = demoStages(dash);
    box.innerHTML = `<div class="demo-frame" aria-hidden="false">${stages.map((s, i) => `<section class="demo-stage" data-i="${i}" aria-label="${esc(s.name)}">${s.html}</section>`).join('')}</div>` +
      `<div class="demo-dots" role="group" aria-label="시연 단계">${stages.map((s, i) => `<button type="button" data-step="${i}" aria-pressed="false"><i aria-hidden="true"></i>${esc(s.name)}</button>`).join('')}</div>` +
      `<p class="demo-live" aria-live="polite"></p>`;
    const taggy = $('heroTaggy'), FACE = ['default', 'check', 'field', 'confirmed'];
    const face = i => { if (!taggy || reduced) return; taggy.classList.add('is-swap'); setTimeout(() => { taggy.src = `mascot/taggy-${FACE[i]}.svg`; taggy.classList.remove('is-swap'); }, 300);
      if (i === 1) setTimeout(() => { if (step === 1) { taggy.classList.add('is-swap'); setTimeout(() => { taggy.src = 'mascot/taggy-confirmed.svg'; taggy.classList.remove('is-swap'); }, 300); } }, 1800); }; // 판정: check → confirmed
    const show = i => {
      step = i; face(i);
      box.querySelectorAll('.demo-stage').forEach((el, j) => el.classList.toggle('is-on', j === i));
      box.querySelectorAll('[data-step]').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      box.querySelector('.demo-live').textContent = `${i + 1}단계 ${stages[i].name}`;
      const code = box.querySelector('.demo-stage.is-on .hash code');
      if (code && code.dataset.type) {
        const full = code.dataset.type; code.textContent = reduced ? full : '';
        if (!reduced) { let k = 0; const t = setInterval(() => { code.textContent = full.slice(0, ++k); if (k >= full.length) clearInterval(t); }, 45); }
      }
    };
    const next = () => { show((step + 1) % stages.length); };
    const run = () => { clearInterval(timer); if (!reduced) timer = setInterval(next, 2500); };
    box.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) { show(+b.dataset.step); run(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else run(); });
    show(0); run();
  }
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
  const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { threshold: 0.2 });
  const reveal = () => document.querySelectorAll('[data-reveal]').forEach(el => (reduced ? el.classList.add('is-in') : io.observe(el)));

  Promise.all([window.renewFetch('data/dashboard.json'), window.renewFetch('data/national/index.json')]).then(([dash, index]) => {
    stats(dash, index); demo(dash); verdict(dash); reveal();
  });
})();
