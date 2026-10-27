/* 공통 반응형 메뉴. 링크는 자바스크립트 없이도 그대로 동작한다. */
(function () {
  'use strict';
  const atHome = /(?:\/|\/index\.html)$/.test(location.pathname);
  if (atHome && /^#(?:find|gov|report|map(?:\/|$))/.test(location.hash)) {
    location.replace('explore.html' + location.hash);
    return;
  }
  // 홈이 한 화면으로 줄면서 긴 소개는 about.html로 옮겼다. 이미 공유된 #how 같은 주소를 그대로 연결한다
  if (atHome && /^#(?:evidence-demo|verdict|problem|how|ledger|case|dashboard|scope|faq|contact)$/.test(location.hash)) {
    location.replace('about.html' + location.hash);
    return;
  }
  // 앱처럼 쓰는 하단 탭(모바일). 링크는 자바스크립트 없이도 위 머리글 메뉴로 모두 열린다
  if (typeof document.createElement === 'function' && document.body && !document.querySelector('.tabbar')) {
    const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const tabs = [['index.html', '홈', 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10', /\/(?:index\.html)?$/], ['explore.html', '탐색', 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4', /explore\.html$/],
      ['docs.html', '문서', 'M4 6h7l2 2h7v11H4z', /docs\.html$/], ['field/', '현장', 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6', /\/field\/(?:index\.html)?$/]];
    const nav = document.createElement('nav');
    nav.className = 'tabbar';
    nav.setAttribute('aria-label', '앱 메뉴');
    nav.innerHTML = tabs.map(([href, label, d, re]) => `<a href="${href}"${re.test(location.pathname) ? ' aria-current="page"' : ''}>${ico(d)}<span>${label}</span></a>`).join('');
    document.body.appendChild(nav);
  }
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('site-menu');
  if (!toggle || !menu) return;
  const desktop = window.matchMedia('(min-width: 721px)');
  const close = focus => {
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    if (focus) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
  });
  menu.addEventListener('click', ev => { if (ev.target.closest('a')) close(false); });
  document.addEventListener('click', ev => {
    if (toggle.getAttribute('aria-expanded') === 'true' && !ev.target.closest('header.top')) close(false);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') close(true);
  });
  const onDesktop = ev => { if (ev.matches) close(false); };
  if (desktop.addEventListener) desktop.addEventListener('change', onDesktop);
  else desktop.addListener(onDesktop);
})();
