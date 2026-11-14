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
  // R2(2026-11-13): 숫자 원칙·하지 않는 일·숫자 하나의 기록은 근거 읽는 법(evidence.html) 끝으로 옮겼다
  if (atHome && /^#(?:valuesTitle|notTitle|ledger)$/.test(location.hash)) {
    location.replace('evidence.html' + location.hash);
    return;
  }
  if (atHome && /^#(?:evidence-demo|verdict|problem|how|howTitle|case|dashboard(?:\/.*)?|scope|faq|contact)$/.test(location.hash)) {
    location.replace('about.html' + location.hash);
    return;
  }
  // 주 메뉴 4개(redesign 4장): 찾기·업무별·현장·보관함. 모든 화면에서 같은 이름·순서. 현장 화면은 한 단계 아래 폴더라 앞에 ../를 붙인다
  if (typeof document.createElement === 'function' && document.body && !document.querySelector('.tabbar')) {
    const base = nested ? '../' : '';
    const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const here = location.pathname + location.hash;
    // v7(2026-11-13): 머리 메뉴와 같은 이름·순서(평가: 위는 '동네 찾기·현장 기록', 아래는 '지도·현장'이라 다른 곳인 줄 알았다). 홈은 로고로 간다
    // R1(2026-11-13): 아래 탭은 넷(홈·동네 찾기·현장 기록·보관함, DESIGN.md). 다섯 칸이 머리 '메뉴' 시트와 같은 목록이라 두 벌로 보였다.
    // 순위·재생 사업·구역 계산은 머리 '메뉴'에서 연다
    const tabs = [['index.html', '홈', 'M3 11l9-8 9 8M5 9.5V20h14V9.5', /^(?!.*\/(?:field|dong)\/)[^#]*\/(?:index\.html)?(?:#.*)?$/],
      ['explore.html#map', '동네 찾기', 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15', /explore\.html|\/dong\//],
      ['field/', '현장 기록', 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6', /\/field\/(?:index\.html)?$/],
      ['box.html', '보관함', 'M3 8h18v12H3zM3 8l2-4h14l2 4M9 13h6', /box\.html$/],
    ];
    const current = tabs.findIndex(t => t[3].test(here));
    const nav = document.createElement('nav');
    nav.className = 'tabbar';
    nav.setAttribute('aria-label', '주 메뉴');
    nav.innerHTML = tabs.map(([href, label, d], i) => `<a href="${base}${href}"${i === current ? ' aria-current="page"' : ''}>${i === current ? '<i class="tab-ind" aria-hidden="true"></i>' : ''}${ico(d)}<span>${label}</span></a>`).join('');
    document.body.appendChild(nav);
    // 같은 화면 안에서 #gov ↔ #map으로 옮겨도 현재 탭 표시를 맞춘다
    if (typeof window !== 'undefined') window.addEventListener('hashchange', () => {
      const now = tabs.findIndex(t => t[3].test(location.pathname + location.hash));
      nav.querySelectorAll('a').forEach((a, i) => { a.toggleAttribute('aria-current', i === now); if (i === now) a.setAttribute('aria-current', 'page'); a.querySelector('.tab-ind')?.remove(); if (i === now) a.insertAdjacentHTML('afterbegin', '<i class="tab-ind" aria-hidden="true"></i>'); });
    });
  }
  // 머리 메뉴(2026-11-13 v6→v7): 하는 일 순서의 한 벌. v7에서 넷과 상담 하나로 줄였다(정돈된 경쟁 서비스는 3~5개).
  // 건물 4D·보관함·데이터 출처는 꼬리글(모든 화면)·지도 단추·아래 탭바로 들어간다.
  // HTML에 적힌 옛 메뉴는 자바스크립트가 없을 때를 위해 남기고 rm6.css가 숨긴다
  const header = document.querySelector('header.top .wrap');
  if (header && !header.querySelector('.rm-nav')) {
    const base = nested ? '../' : '';
    const path = location.pathname;
    const items = [['explore.html', '동네 찾기', /explore\.html$|\/dong\//], ['rank.html', '동네 순위', /rank\.html$/], ['programs.html', '재생 사업', /programs\.html$/],
      ['field/redev.html', '구역 계산', /\/field\/redev\.html$/], ['field/', '현장 기록', /\/field\/(?:index\.html)?$/]];
    const nav = document.createElement('nav');
    nav.className = 'rm-nav'; nav.id = 'rm-nav'; nav.setAttribute('aria-label', '주요 메뉴');
    const link = (href, text, on, cls) => { const a = document.createElement('a'); a.href = base + href; a.textContent = text; if (on) a.setAttribute('aria-current', 'page'); if (cls) a.className = cls; return a; };
    for (const [href, text, re] of items) nav.append(link(href, text, re.test(path)));
    nav.append(link('about.html#contact', '시범 상담', false, 'rm-cta'));
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'rm-menu-btn'; btn.textContent = '메뉴';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'rm-nav');
    btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open); btn.textContent = open ? '닫기' : '메뉴'; });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && nav.classList.contains('is-open')) { btn.click(); btn.focus(); } });
    // 시트 뒤 가림(rm6.css body::after)이나 본문을 누르면 닫는다
    document.addEventListener('click', (ev) => { if (nav.classList.contains('is-open') && !ev.target.closest('header.top')) btn.click(); });
    header.append(btn, nav);
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

/* 동 페이지 '인용 한 줄 복사'(R4 4). 새 파일·인라인 스크립트 없이 이 파일의 위임 처리 하나로 한다(CSP script-src 'self').
   navigator.clipboard가 막히면(권한·http) 글을 선택해 두고 직접 복사하게 안내한다. 결과는 aria-live 칸(role=status)으로 알린다. */
(function () {
  if (typeof document === 'undefined' || !document.addEventListener) return;   // 메뉴 시험(vm)은 document 없이, 또는 가짜 document로 이 파일을 돌린다
  document.addEventListener('click', ev => {
    const btn = ev.target.closest && ev.target.closest('[data-copy-cite]');
    const cite = btn && document.getElementById('cite');
    if (!cite) return;
    const say = document.querySelector('[data-copy-status]'), tell = t => { if (say) say.textContent = t; };
    const select = () => { const r = document.createRange(); r.selectNodeContents(cite); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); tell('복사하지 못해 글을 선택해 두었습니다. Ctrl+C로 복사해 주세요.'); };
    // R5 7: 복사한 글만 따로 떨어져도 어느 쪽 값인지 찾게 끝에 쪽 주소(canonical, 없으면 현재 주소에서 # 뒤를 뗀 것)를 붙인다
    const canon = document.querySelector('link[rel="canonical"]'), page = canon && canon.href ? canon.href : location.href.split('#')[0];
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cite.textContent.trim() + ' ' + page).then(() => tell('복사했습니다.'), select);
    else select();
  });
})();

/* 방문 분석(핵클, 모두의 창업 스타터 플랜). 키 파일(hackle-key.js)은 사이트 저장소에만 있어 원본·로컬에서는 아무것도 보내지 않는다.
   이 브라우저에서 끈 경우(privacy.html)·전역 개인정보 보호 신호(GPC)·추적 안 함(DNT)이면 SDK를 아예 불러오지 않는다.
   이벤트에는 회원 번호·검색어·파일 이름을 담지 않는다(개인정보처리방침 1-4). */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !document.currentScript) return;
  // 인증 토큰·검토 증거를 다루는 과업 화면에는 외부 분석 코드를 실행하지 않는다.
  if (/\/tasks\.html$/.test(location.pathname)) return;
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
  const disabled = () => off() || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  if (disabled()) return;
  const load = (src, then) => { const s = document.createElement('script'); s.src = src; s.onload = then; document.head.appendChild(s); };
  load(base + 'hackle-key.js', () => {
    if (disabled()) return;
    const key = window.RENEWMAP_HACKLE_KEY;
    if (!key) return;
    load(base + 'vendor/hackle-12.2.1.min.js', () => {
      if (disabled()) return;
      const client = window.Hackle && window.Hackle.createInstance(key);
      if (!client) return;
      const track = (k, props) => { if (!disabled()) client.track({ key: k, properties: Object.assign({ page: page() }, props) }); };
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
