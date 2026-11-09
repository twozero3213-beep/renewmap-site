/* 공통 반응형 메뉴. 링크는 자바스크립트 없이도 그대로 동작한다. */
(function () {
  'use strict';
  const inField = /\/field\//.test(location.pathname);
  const nested = inField || /\/dong\//.test(location.pathname);
  const atHome = !nested && /(?:\/|\/index\.html)$/.test(location.pathname);
  if (atHome && /^#(?:find|gov|report|map(?:\/|$))/.test(location.hash)) {
    location.replace('explore.html' + location.hash);
    return;
  }
  // 홈이 한 화면으로 줄면서 긴 소개는 about.html로 옮겼다. 이미 공유된 #how 같은 주소를 그대로 연결한다
  if (atHome && /^#(?:evidence-demo|verdict|problem|how|howTitle|valuesTitle|notTitle|ledger|case|dashboard(?:\/.*)?|scope|faq|contact)$/.test(location.hash)) {
    location.replace('about.html' + location.hash);
    return;
  }
  // 주 메뉴 4개(redesign 4장): 찾기·업무별·현장·보관함. 모든 화면에서 같은 이름·순서. 현장 화면은 한 단계 아래 폴더라 앞에 ../를 붙인다
  if (typeof document.createElement === 'function' && document.body && !document.querySelector('.tabbar')) {
    const base = nested ? '../' : '';
    const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const here = location.pathname + location.hash;
    const tabs = [['index.html', '홈', 'M3 10L12 3l9 7M5 9v12h5v-7h4v7h5V9', /\/(?:index\.html)?$/],
      ['explore.html#map', '지도', 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15', /explore\.html/],
      ['field/', '현장', 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6', /\/field\//],
      ['box.html', '보관함', 'M4 5h16v4H4zM5 9v10h14V9M10 13h4', /box\.html$/]];
    const current = tabs.findIndex(t => t[3].test(here) && (t[0] !== 'index.html' || !nested));
    const nav = document.createElement('nav');
    nav.className = 'tabbar';
    nav.setAttribute('aria-label', '주 메뉴');
    nav.innerHTML = tabs.map(([href, label, d], i) => `<a href="${base}${href}"${i === current ? ' aria-current="page"' : ''}>${i === current ? '<i class="tab-ind" aria-hidden="true"></i>' : ''}${ico(d)}<span>${label}</span></a>`).join('');
    document.body.appendChild(nav);
    // 같은 화면 안에서 #gov ↔ #map으로 옮겨도 현재 탭 표시를 맞춘다
    if (typeof window !== 'undefined') window.addEventListener('hashchange', () => {
      const now = tabs.findIndex(t => t[3].test(location.pathname + location.hash) && (t[0] !== 'index.html' || !nested));
      nav.querySelectorAll('a').forEach((a, i) => { a.toggleAttribute('aria-current', i === now); if (i === now) a.setAttribute('aria-current', 'page'); a.querySelector('.tab-ind')?.remove(); if (i === now) a.insertAdjacentHTML('afterbegin', '<i class="tab-ind" aria-hidden="true"></i>'); });
    });
  }
  const header = document.querySelector('header.top .wrap');
  if (header && !header.querySelector('nav')) {
    const base = nested ? '../' : '';
    const links = document.createElement('nav');
    links.className = 'quick-menu';
    links.setAttribute('aria-label', '서비스 안내');
    links.innerHTML = [['about.html', '서비스 소개'], ['evidence.html', '근거와 방법'], ['data.html', '데이터 출처']].map(([href, text]) => '<a href="' + base + href + '"' + (location.pathname.endsWith('/' + href) ? ' aria-current="page"' : '') + '>' + text + '</a>').join('');
    header.appendChild(links);
  }
  if (header && typeof ResizeObserver === 'function') {
    const top = header.closest('header');
    new ResizeObserver(() => document.documentElement.style.setProperty('--site-header-h', top.getBoundingClientRect().height + 'px')).observe(top);
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

// 우리 스크립트가 멈추면 사용자에게 알리고 신고 메일을 연다(감사 김범석2). 오류 수집 서버는 두지 않는다(기록은 서버로 보내지 않는다는 원칙)
(function () {
  if (typeof window === 'undefined') return;   // 메뉴 시험(vm)은 window 없이 이 파일을 돌린다
  let shown = false;
  window.addEventListener('error', e => {
    // 다른 사이트 스크립트(지도 SDK 등)와 파일 못 받음(e.error 없음)은 빼고, 이 사이트 파일에서 난 예외만 알린다
    if (shown || !e.error || !String(e.filename || '').startsWith(location.origin) || !document.body) return;
    shown = true;
    const body = `화면: ${location.pathname}\n오류: ${String(e.message || '').slice(0, 200)}\n무엇을 누르다 났는지 적어 주세요.`;
    const a = document.createElement('a');
    a.href = 'mailto:renewmapteam@gmail.com?subject=' + encodeURIComponent('[리뉴맵] 화면 오류') + '&body=' + encodeURIComponent(body);
    a.textContent = '오류 알리기';
    const p = document.createElement('p');
    p.className = 'err-banner';
    p.setAttribute('role', 'alert');
    p.append('화면에 오류가 났습니다. 새로고침해도 계속되면 ', a, '를 눌러 주세요.');
    document.body.append(p);
  });
})();

/* 방문 분석(핵클, 모두의 창업 스타터 플랜). 키 파일(hackle-key.js)은 사이트 저장소에만 있어 원본·로컬에서는 아무것도 보내지 않는다.
   이 브라우저에서 끈 경우(privacy.html)·전역 개인정보 보호 신호(GPC)·추적 안 함(DNT)이면 SDK를 아예 불러오지 않는다.
   이벤트에는 회원 번호·검색어·파일 이름을 담지 않는다(개인정보처리방침 1-4). */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !document.currentScript) return;
  const base = new URL('.', document.currentScript.src).href, OFF = 'renewmap-analytics-off';
  const off = () => { try { return localStorage.getItem(OFF) === '1'; } catch (e) { return false; } };
  const page = () => location.pathname.replace(/^.*\/renewmap-site\//, '/').replace(/\/index\.html$/, '/') || '/';
  // 개인정보처리방침의 '방문 분석 끄기' 버튼
  document.querySelectorAll('[data-analytics-toggle]').forEach(btn => {
    const show = () => { btn.textContent = off() ? '이 브라우저에서 방문 분석 켜기' : '이 브라우저에서 방문 분석 끄기'; };
    show();
    btn.addEventListener('click', () => { try { off() ? localStorage.removeItem(OFF) : localStorage.setItem(OFF, '1'); } catch (e) { /* 저장 못 하면 바뀌지 않는다 */ } show(); });
  });
  // 개인정보처리방침 '변경 7일 전 공지'를 지킨다: 2026-11-07 공지, 11-14 시행(로폼 AI 법무질의 2026-11-06 기록, docs/legal)
  if (Date.now() < Date.parse('2026-11-14T00:00:00+09:00')) return;
  if (off() || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;
  const load = (src, then) => { const s = document.createElement('script'); s.src = src; s.onload = then; document.head.appendChild(s); };
  load(base + 'hackle-key.js', () => {
    const key = window.RENEWMAP_HACKLE_KEY;
    if (!key) return;
    load(base + 'vendor/hackle-12.2.1.min.js', () => {
      const client = window.Hackle && window.Hackle.createInstance(key);
      if (!client) return;
      const track = (k, props) => client.track({ key: k, properties: Object.assign({ page: page() }, props) });
      // 내려받기는 모두 <a download>를 눌러서 일어난다(docgen·overlay·viewer·현장 앱). 형식만 남기고 파일 이름은 보내지 않는다
      document.addEventListener('click', ev => {
        const a = ev.target.closest && ev.target.closest('a');
        if (!a) return;
        if (a.hasAttribute('download')) track('download_document', { format: ((a.download || '').split('.').pop() || 'unknown').toLowerCase() });
        else if (/#contact$/.test(a.getAttribute('href') || '')) track('click_contact', {});
      }, true);
      document.addEventListener('submit', ev => {
        if (ev.target.id === 'homeSearch') track('search_dong', {});
        else if (ev.target.id === 'f' && /redev\.html$/.test(location.pathname)) track('run_redev_check', {});
      }, true);
    });
  });
})();
