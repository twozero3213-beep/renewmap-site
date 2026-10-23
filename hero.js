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
  const api = { RULE, REQS, BANYEO, pickDong, verdictRows, verdictSummary };
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
  const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { threshold: 0.2 });
  const reveal = () => document.querySelectorAll('[data-reveal]').forEach(el => (reduced ? el.classList.add('is-in') : io.observe(el)));

  window.renewFetch('data/dashboard.json').then(dash => { verdict(dash); reveal(); });
})();
