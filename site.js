/* 공통 반응형 메뉴. 링크는 자바스크립트 없이도 그대로 동작한다. */
(function () {
  'use strict';
  if (document.currentScript?.hasAttribute('data-field-update-only')) return;
  const inField = /\/field\//.test(location.pathname);
  const nested = inField || /\/dong\//.test(location.pathname);
  const atHome = !nested && /(?:\/|\/index\.html)$/.test(location.pathname);
  // 404.html은 어느 깊이의 없는 주소에서도 같은 글로 열린다 → 상대 경로 대신 body data-base(절대 경로)를 쓰고, 지금 위치 표시는 하지 않는다
  const fixedBase = document.body?.dataset?.base;
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
    const base = fixedBase || (nested ? '../' : '');
    const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const here = location.pathname + location.hash;
    // v7(2026-11-13): 머리 메뉴와 같은 이름·순서(평가: 위는 '동네 진단·현장 기록', 아래는 '지도·현장'이라 다른 곳인 줄 알았다). 홈은 로고로 간다
    // R1(2026-11-13): 아래 탭은 넷(홈·동네 진단·현장 기록·보관함, DESIGN.md). 다섯 칸이 머리 '메뉴' 시트와 같은 목록이라 두 벌로 보였다.
    // 순위·재생 사업·구역 계산은 머리 '메뉴'에서 연다
    const tabs = [['index.html', '홈', 'M3 11l9-8 9 8M5 9.5V20h14V9.5', /^(?!.*\/(?:field|dong)\/)[^#]*\/(?:index\.html)?(?:#.*)?$/],
      ['explore.html#map', '동네 진단', 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15', /explore\.html|\/dong\//],
      ['field/', '현장 기록', 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6', /\/field\/(?:index\.html)?$/],
      ['box.html', '보관함', 'M3 8h18v12H3zM3 8l2-4h14l2 4M9 13h6', /box\.html$/],
    ];
    const current = fixedBase ? -1 : tabs.findIndex(t => t[3].test(here));
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
  // 건물 나이 4D·보관함·데이터 출처는 꼬리글(모든 화면)·지도 단추·아래 탭바로 들어간다.
  // HTML에 적힌 옛 메뉴는 자바스크립트가 없을 때를 위해 남기고 rm6.css가 숨긴다
  const header = document.querySelector('header.top .wrap');
  if (header && !header.querySelector('.rm-nav')) {
    const base = fixedBase || (nested ? '../' : '');
    const path = fixedBase ? '' : location.pathname;
    const items = [['explore.html', '동네 진단', /explore\.html$|\/dong\//], ['rank.html', '동네 비교 점수', /rank\.html$/], ['programs.html', '재생 사업', /programs\.html$/],
      ['field/redev.html', '구역 계산', /\/field\/redev\.html$/], ['field/', '현장 기록', /\/field\/(?:index\.html)?$/]];
    const nav = document.createElement('nav');
    nav.className = 'rm-nav'; nav.id = 'rm-nav'; nav.setAttribute('aria-label', '주요 메뉴');
    const link = (href, text, on, cls) => { const a = document.createElement('a'); a.href = base + href; a.textContent = text; if (on) a.setAttribute('aria-current', 'page'); if (cls) a.className = cls; return a; };
    for (const [href, text, re] of items) nav.append(link(href, text, re.test(path)));
    nav.append(link('about.html#contact', '시범 과업 상담', false, 'rm-cta'));
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
    const body = `페이지: ${location.pathname}\n내용: ${String(e.message || '').slice(0, 200)}\n무엇을 누르다 생겼는지 적어 주세요.`;
    const a = document.createElement('a');
    a.href = 'mailto:renewmapteam@gmail.com?subject=' + encodeURIComponent('[리뉴맵] 화면 문제 알림') + '&body=' + encodeURIComponent(body);
    a.textContent = '알리기';
    const p = document.createElement('p');
    p.className = 'err-banner';
    p.setAttribute('role', 'alert');
    p.append('화면이 제대로 열리지 않았습니다. 새로고침해도 같으면 알려 주세요. ', a);
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

// 현장 화면 직행과 홈 복귀 모두 기존 오프라인 판의 갱신을 확인한다. 기록 저장소는 건드리지 않는다.
(function () {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !document.currentScript?.src || document.body?.dataset?.base) return;   // 404(data-base)는 현장 주소 아래에서 열려도 오프라인 판을 다루지 않는다
  const sw = navigator.serviceWorker, scope = new URL('field/', document.currentScript.src);
  const inField = location.pathname.startsWith(scope.pathname);
  const home = new URL('./', document.currentScript.src).pathname;
  if (!inField && location.pathname !== home && location.pathname !== home + 'index.html') return;
  const recording = location.pathname === scope.pathname || location.pathname === scope.pathname + 'index.html';
  let hadController = !!sw.controller, busy = false, changed = false;
  const notice = (text, refresh) => {
    if (!inField) return;
    let box = document.getElementById('fieldUpdate');
    if (!box) { box = document.createElement('p'); box.id = 'fieldUpdate'; box.className = 'err-banner'; box.setAttribute('role', 'status'); document.body.append(box); }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost';
    button.textContent = refresh ? '새 버전으로 열기' : '다시 확인';
    button.addEventListener('click', () => refresh ? location.reload() : check());
    box.replaceChildren(text + ' ', button);
  };
  sw.addEventListener('controllerchange', () => {
    if (hadController && inField) {
      changed = true;
      if (!recording) {
        document.documentElement.dataset.fieldStale = 'true';
        const main = document.querySelector('main');
        main?.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach(button => { button.disabled = true; });
        document.dispatchEvent(new Event('renewmap-field-updated'));
      }
      notice(recording ? '새 버전이 나왔습니다. 입력 중인 내용을 저장한 뒤 새 버전으로 열어 주세요. 저장한 기록과 사진은 그대로 남습니다.' : '새 버전이 나와 이전 계산과 내보내기를 멈췄습니다. 입력한 내용을 복사해 두고 새 버전에서 다시 계산해 주세요. 저장한 기록과 사진은 그대로 남습니다.', true);
    }
    hadController = !!sw.controller;
  });
  document.addEventListener('submit', event => {
    if (changed && inField && !recording) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  for (const type of ['input', 'change']) document.addEventListener(type, event => {
    if (changed && inField && !recording) event.stopImmediatePropagation();
  }, true);
  document.addEventListener('click', event => {
    if (changed && inField && !recording && event.target.closest('main button, main [download], main input[type="submit"], main input[type="button"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  async function check() {
    if (busy || !navigator.onLine) return;
    busy = true;
    try {
      const previous = await sw.getRegistration(scope.href);
      if (!inField && !previous) return;
      const registration = await sw.register(new URL('sw.js', scope).href, { scope: scope.href, updateViaCache: 'none' });
      await registration.update();
      if (!changed) document.getElementById('fieldUpdate')?.remove();
    } catch (_) {
      if (!changed) notice('새 버전 확인을 마치지 못했습니다. 지금 버전으로 계속 쓸 수 있고, 연결되면 다시 확인합니다.', false);
    } finally { busy = false; }
  }
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  check();
})();

/* 방문 분석(핵클)은 중지했다. SDK의 자동 URL 수집·수집 중지 동작을 검증한 뒤에만 재개한다. */
