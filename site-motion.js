/* 사이트 공통 움직임 v4. 2026-11-07.
   스크립트가 없거나 '동작 줄이기'면 아무것도 숨기지 않는다. 문서 화면의 제목 묶음만 띠로 감싸고, 도구 화면(지도·현장)은 건드리지 않는다.
   2026-11-20 C08: 화면에 효과가 없던 읽기 선·body.scrolled·스크롤 드러나기(.rv)를 지웠다(모든 문서 화면에서 강제 리플로만 일으켰다) */
(function () {
  'use strict';
  const doc = document, root = doc.documentElement, body = doc.body;
  if (!body) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!still) root.classList.add('motion');
  const main = doc.getElementById('main');
  // 도구 화면: 현장 앱·신청요건·지도 탐색은 띠를 넣지 않는다(일하는 화면이 움직이면 방해가 된다)
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
})();
