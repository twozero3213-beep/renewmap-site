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
    // r19(09 6절 1): 머리 메뉴 셋(대상지 계산·동네 현황·현장 사진 기록)에 홈·보관함을 더한 다섯. 순위·재생 사업은 꼬리글 도구 줄에서 연다
    // r23(13 M8): 휴대폰에는 머리 '상담하기'가 메뉴 시트 안에만 있어 아래 탭의 보관함 자리에 상담하기를 둔다. 보관함은 꼬리글·지도 '보관함에 담기'로 연다
    const tabs = [['index.html', '홈', 'M3 11l9-8 9 8M5 9.5V20h14V9.5', /^(?!.*\/(?:field|dong)\/)[^#]*\/(?:index\.html)?(?:#.*)?$/],
      ['field/redev.html', '대상지 계산', 'M5 3h14v18H5zM8 7h8M8 11h2M14 11h2M8 15h2M14 15h2', /\/field\/redev\.html$/],
      ['explore.html#map', '우리 동네', 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zM9 3v15M15 6v15', /explore\.html|\/dong\//],
      ['field/', '현장 사진', 'M4 8h4l1.5-2h5L16 8h4v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6', /\/field\/(?:index\.html)?$/],
      ['about.html#contact', '상담하기', 'M4 5h16v11H10l-6 4zM8 9h8M8 12h5', /about\.html#contact$/],
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
  // 연도별 건물 나이·보관함·데이터 출처는 꼬리글(모든 화면)·지도 단추·아래 탭바로 들어간다.
  // HTML에 적힌 옛 메뉴는 자바스크립트가 없을 때를 위해 남기고 rm6.css가 숨긴다
  const header = document.querySelector('header.top .wrap');
  if (header && !header.querySelector('.rm-nav')) {
    const base = fixedBase || (nested ? '../' : '');
    const path = fixedBase ? '' : location.pathname;
    // R11(C18·D30 B): 부산 이전 직원 비교는 주 메뉴에서 뺐다. 홈 '다른 도구 더 보기'와 꼬리글 도구 줄에서 연다
    // r19(09 6절 1): 셋과 상담 하나. 동네 비교 점수·재생 사업은 꼬리글 도구 줄과 동네 현황 안에서 연다
    // r24(14 토스증권 REA 쟁점 3): 토스증권 '홈 · 피드 · 주식 골라보기 · 내 계좌'처럼 할 일 이름. 동네 골라보기 = 우리 동네의 조건 칸(?panel=filters)
    // r24b(09 8절 조작 요소 12개): 홈은 로고가, 현장 사진은 휴대폰 아래 탭·홈 카드·꼬리글이 맡아 넓은 화면 머리에서는 뺀다
    const filters = /[?&]panel=filters/.test(fixedBase ? '' : location.search);
    const items = [['explore.html#map', '우리 동네', filters ? /^$/ : /explore\.html$|\/dong\//],
      ['explore.html?panel=filters', '동네 골라보기', filters ? /explore\.html$/ : /^$/], ['field/redev.html', '대상지 계산', /\/field\/redev\.html$/]];
    const nav = document.createElement('nav');
    nav.className = 'rm-nav'; nav.id = 'rm-nav'; nav.setAttribute('aria-label', '주요 메뉴');
    const link = (href, text, on, cls) => { const a = document.createElement('a'); a.href = base + href; a.textContent = text; if (on) a.setAttribute('aria-current', 'page'); if (cls) a.className = cls; return a; };
    for (const [href, text, re] of items) nav.append(link(href, text, re.test(path)));
    // 동 이름 검색칸(넓은 화면, 홈에서는 본문 첫 칸과 겹쳐 숨긴다). 스크립트가 늦어도 동네 현황이 ?q=로 찾는다(map.js)
    const find = document.createElement('form');
    find.className = 'rm-nav-find'; find.action = base + 'explore.html'; find.setAttribute('role', 'search');
    find.innerHTML = '<label class="sr-only" for="rmNavQ">동 이름 검색</label><input id="rmNavQ" name="q" type="search" placeholder="동 이름 검색" enterkeyhint="search" autocomplete="off">';
    // 대상지 계산·현장·문서 쪽은 CSP가 form-action 'none'이라 폼 전송이 막힌다(r24 재점검 H1) → 주소 이동으로 연다. 빈 칸이면 동네 현황만
    find.addEventListener('submit', (ev) => { ev.preventDefault(); const q = find.querySelector('input').value.trim(); location.assign(find.action + (q ? '?q=' + encodeURIComponent(q) : '')); });
    nav.append(find);
    // r16: 휴대폰 메뉴 시트에서도 '무엇이고 얼마인지'를 찾게 상담 단추 위에 글 링크 한 줄(넓은 화면 머리 줄에서는 rm6.css가 숨긴다). 주 메뉴 목록·순서는 그대로
    const more = document.createElement('p');
    more.className = 'rm-nav-more';
    more.append(link('about.html', '서비스 소개'), ' · ', link('about.html#scope', '비용과 범위'));
    nav.append(more, link('about.html#contact', '상담하기', false, 'rm-cta'));
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'rm-menu-btn'; btn.textContent = '메뉴';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'rm-nav');
    btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open); btn.textContent = open ? '닫기' : '메뉴'; });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && nav.classList.contains('is-open')) { btn.click(); btn.focus(); } });
    // 시트 뒤 가림(rm6.css body::after)이나 본문을 누르면 닫는다
    document.addEventListener('click', (ev) => { if (nav.classList.contains('is-open') && !ev.target.closest('header.top')) btn.click(); });
    // r16 M11: Tab으로 시트 끝을 넘어가면 초점이 가림 뒤 본문으로 가 보이지 않았다(WCAG 2.4.11) → 초점이 머리 밖으로 나가면 닫는다. 창 전환(relatedTarget 없음)으로는 닫지 않는다
    header.addEventListener('focusout', (ev) => { if (nav.classList.contains('is-open') && ev.relatedTarget && !header.contains(ev.relatedTarget)) btn.click(); });
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
  // 11-20 판정(C16·C17): 확인 실패는 본문 끝 글 흐름의 한 줄(단추 없음)이라 사진 단추를 밀지도 가리지도 않고, 이미 있으면 다시 그리거나 다시 읽지 않는다.
  // 새 판 알림은 계산을 멈추는 급한 안내라 화면 아래 고정 띠로 두고, 높이(--err-h)를 알려 rm6.css가 그만큼 문서 끝을 비우게 한다(가린 초점 0). 초점은 옮기지 않는다
  const notice = (text, refresh) => {
    if (!inField) return;
    let box = document.getElementById('fieldUpdate');
    if (!refresh) {
      if (box) return;
      box = document.createElement('p'); box.id = 'fieldUpdate'; box.className = 'hint'; box.setAttribute('role', 'status');
      (document.getElementById('main') || document.body).append(box);
      box.textContent = text;   // 붙인 뒤에 채워야 알림 칸으로 읽힌다
      return;
    }
    box?.remove();
    box = document.createElement('p'); box.id = 'fieldUpdate'; box.className = 'err-banner'; box.setAttribute('role', 'status');
    document.body.append(box);
    new ResizeObserver(() => document.documentElement.style.setProperty('--err-h', box.offsetHeight + 'px')).observe(box);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost';
    button.textContent = '새 버전으로 열기';
    button.addEventListener('click', () => location.reload());
    const kids = [text + ' ', button];
    if (recording) {   // 기록 화면은 저장할 수 있으니 닫을 수 있다. 계산을 멈춘 화면은 닫을 수 없다
      const close = document.createElement('button'); close.type = 'button'; close.className = 'ghost rm-dismiss'; close.textContent = '닫기';
      close.setAttribute('aria-label', '안내 닫기');
      close.addEventListener('click', () => box.remove());
      kids.push(close);
    }
    box.replaceChildren(...kids);
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
  const blockedNote = () => {
    const settings = document.querySelector('details.settings');
    if (!settings || document.getElementById('fieldOfflineOff')) return;
    const p = document.createElement('p'); p.id = 'fieldOfflineOff'; p.className = 'hint';
    p.textContent = '오프라인 저장을 막은 브라우저입니다. 인터넷이 없을 때는 이 화면을 새로 고치지 말고 그대로 쓰세요.';
    settings.append(p);
  };
  async function check() {
    if (busy || !navigator.onLine) return;
    busy = true;
    try {
      const previous = await sw.getRegistration(scope.href);
      if (!inField && !previous) return;
      const registration = await sw.register(new URL('sw.js', scope).href, { scope: scope.href, updateViaCache: 'none' });
      await registration.update();
      if (!changed) document.getElementById('fieldUpdate')?.remove();
    } catch (err) {
      // r16: 기관 정책·사생활 보호 모드가 등록 자체를 막으면(SecurityError) 매번 뜨는 경고는 고장처럼 보였다 → 현장 기록 '설정' 안에 한 번만 조용히 적는다. 연결 실패는 지금 안내 그대로
      if (err && err.name === 'SecurityError') blockedNote();
      else if (!changed) notice('새 버전 확인을 마치지 못했습니다. 지금 버전으로 계속 쓸 수 있고, 연결이 돌아오거나 이 화면으로 다시 돌아오면 다시 확인합니다.', false);
    } finally { busy = false; }
  }
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  check();
})();

/* 방문 분석(핵클)은 중지했다. SDK의 자동 URL 수집·수집 중지 동작을 검증한 뒤에만 재개한다. */
