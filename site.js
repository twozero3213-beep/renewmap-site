/* 공통 반응형 메뉴. 링크는 자바스크립트 없이도 그대로 동작한다. */
(function () {
  'use strict';
  const inField = /\/field\/(?:index\.html)?$/.test(location.pathname);
  const atHome = !inField && /(?:\/|\/index\.html)$/.test(location.pathname);
  if (atHome && /^#(?:find|gov|report|map(?:\/|$))/.test(location.hash)) {
    location.replace('explore.html' + location.hash);
    return;
  }
  // 홈이 한 화면으로 줄면서 긴 소개는 about.html로 옮겼다. 이미 공유된 #how 같은 주소를 그대로 연결한다
  if (atHome && /^#(?:evidence-demo|verdict|problem|how|ledger|case|dashboard|scope|faq|contact)$/.test(location.hash)) {
    location.replace('about.html' + location.hash);
    return;
  }
  // 주 메뉴 4개(redesign 4장): 찾기·업무별·현장·보관함. 모든 화면에서 같은 이름·순서. 현장 화면은 한 단계 아래 폴더라 앞에 ../를 붙인다
  if (typeof document.createElement === 'function' && document.body && !document.querySelector('.tabbar')) {
    const base = inField ? '../' : '';
    const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const here = location.pathname + location.hash;
    const tabs = [['index.html', '찾기', 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L21 21', /\/(?:index\.html)?$|explore\.html(?!#(?:gov|find))/],
      ['explore.html#gov', '업무별', 'M4 7h16v12H4zM9 7V5h6v2M4 12h16', /explore\.html#(?:gov|find)/],
      ['field/', '현장', 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6', /\/field\/(?:index\.html)?$/],
      ['box.html', '보관함', 'M4 5h16v4H4zM5 9v10h14V9M10 13h4', /box\.html$/]];
    const current = tabs.findIndex(t => t[3].test(here) && (t[0] !== 'index.html' || !inField));
    const nav = document.createElement('nav');
    nav.className = 'tabbar';
    nav.setAttribute('aria-label', '주 메뉴');
    nav.innerHTML = tabs.map(([href, label, d], i) => `<a href="${base}${href}"${i === current ? ' aria-current="page"' : ''}>${i === current ? '<i class="tab-ind" aria-hidden="true"></i>' : ''}${ico(d)}<span>${label}</span></a>`).join('');
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
