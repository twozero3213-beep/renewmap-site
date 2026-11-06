/* 첫 화면 v4 움직임(2026-11-07 대표 지시: 역동적·활동적·익사이팅, 사용 편의, 시각화).
   움직임은 뜻을 전한다: 지도는 리뉴맵이 처음 계산한 부산에서 전국으로 퍼지며 그려지고, 색은 실제 2024 쇠퇴진단지표 값이다.
   스크립트가 없거나 '동작 줄이기'면 모든 내용이 처음부터 보이고 움직이지 않는다(내용을 숨겨 두지 않는다). */
(function () {
  'use strict';
  const doc = document, root = doc.documentElement;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!still) root.classList.add('motion');
  const NS = 'http://www.w3.org/2000/svg';
  // map.js와 같은 색: 법정 기준(20년 이상 건축물 50%) 안쪽은 무채색, 넘은 쪽은 주황→갈색(D22)
  const bucket = (a) => (a === null ? 'na' : a < 50 ? (a < 25 ? 'b0' : a < 40 ? 'b1' : 'b2') : a < 65 ? 'o1' : a < 80 ? 'o2' : 'o3');

  // ── 1. 첫 화면 지도: 252개 시군구, 부산에서 멀어지는 순서로 그린다 ──
  const host = doc.getElementById('heroMap');
  if (host && window.fetch) {
    fetch('data/national/hero_map.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
      if (!m) return;
      const svg = doc.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', m.viewBox);
      svg.setAttribute('class', 'h-map-svg');
      svg.setAttribute('aria-hidden', 'true');
      const maxR = Math.max(...m.items.map((it) => it.r)) || 1;
      let over = 0;
      for (const it of m.items) {
        const p = doc.createElementNS(NS, 'path');
        p.setAttribute('d', it.d);
        p.setAttribute('class', 'h-map-p ' + bucket(it.a));
        p.style.setProperty('--t', (it.r / maxR).toFixed(3));
        const t = doc.createElementNS(NS, 'title');
        t.textContent = `${it.n} · 20년 이상 건축물 ${it.a === null ? '자료 없음' : it.a + '%'}`;
        p.appendChild(t);
        svg.appendChild(p);
        if (it.a !== null && it.a >= 50) over++;
      }
      // 부산에서 퍼지는 물결(그리는 순서를 눈으로 보여 준다)
      const [ox, oy] = m.origin;
      for (let i = 0; i < 3; i++) {
        const c = doc.createElementNS(NS, 'circle');
        c.setAttribute('cx', ox); c.setAttribute('cy', oy); c.setAttribute('r', 6);
        c.setAttribute('class', 'h-map-wave');
        c.style.setProperty('--i', i);
        svg.appendChild(c);
      }
      const dot = doc.createElementNS(NS, 'circle');
      dot.setAttribute('cx', ox); dot.setAttribute('cy', oy); dot.setAttribute('r', 4.5);
      dot.setAttribute('class', 'h-map-dot');
      svg.appendChild(dot);
      host.appendChild(svg);
      // 지도 아래 글: 그림이 말하는 것을 글로도 적는다(그림은 보조 기술에서 숨김)
      const cap = doc.getElementById('heroMapCap');
      if (cap) {
        const n = m.items.length;
        cap.innerHTML = `<b><span data-count="${over}">${over}</span> / ${n}</b> 시군구에서 준공 20년 이상 건축물이 절반을 넘습니다.<br><small>2024 쇠퇴진단지표 · 시군구 원장 값 그대로 · 부산에서 시작해 전국으로</small>`;
        count(cap.querySelector('[data-count]'), 2200);
      }
      requestAnimationFrame(() => host.classList.add('on'));
      // 마우스를 따라 지도가 살짝 기운다(태블릿·폰은 그대로)
      if (!still && window.matchMedia('(pointer: fine)').matches) {
        const hero = host.closest('.h-hero');
        hero && hero.addEventListener('pointermove', (e) => {
          const r = hero.getBoundingClientRect();
          host.style.setProperty('--rx', (((e.clientY - r.top) / r.height) - 0.5).toFixed(3));
          host.style.setProperty('--ry', (((e.clientX - r.left) / r.width) - 0.5).toFixed(3));
        });
      }
    }).catch(() => { /* 지도 파일을 못 받으면 글만 남는다 */ });
  }

  // 숫자 올리기(home.js countAt과 같은 곡선). 동작 줄이기면 최종값을 그대로 둔다
  function count(el, ms) {
    if (!el || still) return;
    const to = +el.dataset.count, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('ko-KR');
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  // ── 2. 출처 띠: 리뉴맵 숫자가 오는 공공데이터 원천. 흐르는 띠는 멈춤 단추로 세운다(WCAG 2.2.2) ──
  const band = doc.getElementById('srcBand');
  if (band) {
    const SRC = ['국토교통부 쇠퇴진단지표', '행정안전부 주민등록인구', '국가데이터처 전국사업체조사', '건축HUB 건축물대장', 'SGIS 행정구역경계',
      '부산 도시정비 조례 원문', '국토교통부 실거래가', '전국도시공원정보', '국가 수질측정망', '행정안전부 인구감소지역 고시', '공공데이터포털 빈집 현황'];
    const row = SRC.map((s) => `<li>${s}</li>`).join('');
    band.innerHTML = `<ul class="h-band-row">${row}</ul><ul class="h-band-row" aria-hidden="true">${row}</ul>`;
    const btn = doc.getElementById('srcBandBtn');
    if (btn) {
      btn.hidden = still;
      btn.addEventListener('click', () => {
        const paused = band.classList.toggle('paused');
        btn.textContent = paused ? '출처 띠 다시 흐르기' : '출처 띠 멈춤';
        btn.setAttribute('aria-pressed', String(paused));
      });
    }
  }

  // ── 3. 스크롤로 드러나기: 제목·줄·카드가 차례로 올라온다 ──
  if (!still && 'IntersectionObserver' in window) {
    const targets = doc.querySelectorAll('.v3 .h-sec h2, .h-lede, .h-rows > li, .h-steps > li, .h-prods > li, .h-val, .h-nots > li, .h-not-end, .h-stats > li, .h-cta-box');
    targets.forEach((el) => {
      el.classList.add('rv');
      const sib = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
      el.style.setProperty('--k', Math.min(sib, 6));
    });
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    targets.forEach((el) => io.observe(el));
  }

  // ── 4. 찍고·붙이고·받습니다: 세 단계 선이 스크롤만큼 찬다 ──
  const steps = doc.getElementById('steps');
  const prog = doc.getElementById('readProg');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const vh = window.innerHeight;
    if (steps) {
      const r = steps.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (vh * 0.8 - r.top) / (r.height + vh * 0.3)));
      steps.style.setProperty('--p', p.toFixed(3));
      [...steps.children].forEach((li, i, all) => li.classList.toggle('lit', p >= (i + 0.35) / all.length));
    }
    if (prog) {
      const h = doc.documentElement.scrollHeight - vh;
      prog.style.setProperty('--p', h > 0 ? (window.scrollY / h).toFixed(4) : '0');
    }
    doc.body.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // ── 5. 카드 조명: 포인터 자리를 밝힌다(누를 수 있는 카드라는 신호) ──
  if (!still && window.matchMedia('(pointer: fine)').matches) {
    doc.querySelectorAll('.h-prod').forEach((card) => card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
  }
})();
