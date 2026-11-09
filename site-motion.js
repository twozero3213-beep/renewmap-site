/* 사이트 공통 움직임 v4(첫 화면 home-motion.js의 머리띠·읽기 선·드러나기를 문서 화면에도). 2026-11-07.
   스크립트가 없거나 '동작 줄이기'면 아무것도 숨기지 않는다. 문서 화면의 제목 묶음만 어두운 띠로 감싸고, 도구 화면(지도·현장)은 머리띠만 바꾼다. */
(function () {
  'use strict';
  const doc = document, root = doc.documentElement, body = doc.body;
  if (!body) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!still) root.classList.add('motion');
  const main = doc.getElementById('main');
  // 도구 화면: 현장 앱·신청요건·지도 탐색은 띠·드러나기를 넣지 않는다(일하는 화면이 움직이면 방해가 된다)
  const tool = /\/field\//.test(location.pathname) || /explore\.html$/.test(location.pathname);

  // ── 문서 화면 첫 띠: 위치 표시·제목·바로 뒤 짧은 글을 한 띠로 ──
  if (main && !tool && main.classList.contains('page')) {
    const h1 = [...main.children].find((el) => el.tagName === 'H1');
    if (h1) {
      const band = doc.createElement('div');
      band.className = 'pg-band';
      const parts = [];
      let el = h1.previousElementSibling;
      if (el && el.classList.contains('breadcrumb')) parts.push(el);
      parts.push(h1);
      el = h1.nextElementSibling;
      while (el && el.tagName === 'P' && parts.length < 5) { parts.push(el); el = el.nextElementSibling; }
      main.insertBefore(band, parts[0]);
      parts.forEach((p) => band.appendChild(p));
    }
  }

  // ── 읽은 만큼 차는 선과 머리띠 판 ──
  const long = !tool && doc.documentElement.scrollHeight > window.innerHeight * 1.6;
  let prog = null;
  if (long) {
    prog = doc.createElement('div');
    prog.className = 'read-prog';
    prog.setAttribute('aria-hidden', 'true');
    body.prepend(prog);
  }
  let ticking = false;
  let pending = [];   // 아직 안 드러난 요소(빠르게 지나쳐 관찰자가 놓친 것을 스크롤에서 마저 연다)
  const onScroll = () => {
    ticking = false;
    body.classList.toggle('scrolled', window.scrollY > 8);
    if (pending.length) pending = pending.filter((el) => (el.getBoundingClientRect().top < window.innerHeight * 0.92 ? (el.classList.add('in'), false) : !el.classList.contains('in')));
    if (prog) {
      const h = doc.documentElement.scrollHeight - window.innerHeight;
      prog.style.setProperty('--p', h > 0 ? (window.scrollY / h).toFixed(4) : '0');
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // ── 스크롤로 드러나기(문서 화면만, 이미 자기 드러나기가 있는 요소는 건너뜀) ──
  if (!still && !tool && main && 'IntersectionObserver' in window) {
    const sel = 'h2, h3, .table-wrap, details, .card, figure, article, main > ul, main > ol, section > ul, section > ol, .wrap > ul, .wrap > ol, form';
    const targets = [...main.querySelectorAll(sel)].filter((el) => !el.closest('[data-reveal], .pg-band, .about-top, nav, header') && !el.hasAttribute('data-reveal'));
    const vh = window.innerHeight;
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top < vh) return;   // 처음 화면에 보이는 것은 그대로 둔다
      el.classList.add('rv');
      const k = el.parentElement ? [...el.parentElement.children].indexOf(el) % 4 : 0;
      el.style.setProperty('--k', k);
    });
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    pending = targets.filter((el) => el.classList.contains('rv'));
    pending.forEach((el) => io.observe(el));
    // 페이지 안 이동(#목차)으로 건너뛴 요소가 숨은 채 남지 않게
    window.addEventListener('hashchange', () => doc.querySelectorAll('.rv:not(.in)').forEach((el) => el.classList.add('in')));
  }
})();
