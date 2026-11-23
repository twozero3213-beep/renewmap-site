/* 동네 찾기 넓은 화면 배치(2026-11-13 v7): 왼쪽 패널 + 화면 전체 지도.
   왜: 경쟁 서비스 REA 분해(PLATEAU VIEW·Kepler·디스코·밸류맵)에서 공통으로, 지도를 화면 높이 전체로 두고 페이지 스크롤을 없애
   휠을 지도 확대에만 쓰게 했다. 우리 화면은 지도 위에 조작층 다섯 줄이 쌓여 지도가 y≈445에서 시작했다(11-13 평가).
   map.js가 만든 요소를 다시 만들지 않고 자리만 옮긴다(참조는 그대로 살아 있다). 1024px 미만은 원래 순서 그대로 둔다.
   2026-11-19(대표 지적: 왼쪽 패널이 1,498px로 길어 한참 내려야 했다): 왼쪽 패널을 세 칸으로 나눈다.
   위 = 검색·위치 줄(고정), 가운데 = 지표 고르기·현황 한 줄·지역 목록(이 칸만 스크롤), 아래 = 출처 한 줄·도구·바닥글 링크 한 줄(고정).
   고른 동의 세부(.map-panel)는 지도 오른쪽 서랍으로 둔다. 범례 한 줄과 연도 막대는 2026-11-23부터 왼쪽 숫자판(.mv-dash) 안이다. */
(function () {
  'use strict';
  const wide = window.matchMedia('(min-width: 1024px)');
  const inner = document.querySelector('#map .workspace-panel-inner');
  const app = document.getElementById('mapApp');
  if (!inner || !app) return;
  let done = false;
  const box = (tag, cls) => { const el = document.createElement(tag); el.className = cls; return el; };
  const take = sels => sels.map(s => inner.querySelector(s)).filter(Boolean);
  // 지도 화면에서는 바닥글을 숨기므로(map.css) 자주 찾는 세 링크만 패널 맨 아래 한 줄로 옮겨 단다. 주소는 바닥글의 것을 그대로 복사한다
  function footLinks() {
    const f = document.querySelector('body > footer');
    const links = f ? [f.querySelector('a[href="data.html"]'), f.querySelector('a[href="privacy.html"]'), f.querySelector('a[href^="mailto:"][href*="subject="]')].filter(Boolean) : [];
    if (!links.length) return null;
    const nav = box('nav', 'mx-links');
    nav.setAttribute('aria-label', '출처·개인정보·오류 신고');
    links.forEach((a, i) => { if (i) nav.append(' · '); nav.append(a.cloneNode(true)); });
    return nav;
  }

  function build() {
    const stage = app.querySelector('.map-stage');
    if (!stage || !stage.querySelector('.map-canvas')) return false;
    const side = box('aside', 'mx-side');
    side.setAttribute('aria-label', '지도 조작과 지역 목록');
    const shell = box('div', 'mx');
    // 틀은 #mapApp 안에 둔다: map.js가 칩·재생·닫기 단추의 클릭·입력을 #mapApp 한 곳에서 받는다(이벤트 위임). 밖으로 빼면 넓은 화면에서 단추가 먹지 않았다
    app.append(shell);
    const head = box('div', 'mx-head'), body = box('div', 'mx-scroll'), foot = box('div', 'mx-foot');
    head.append(...take(['#map .hero-head', '#heroSearch', '#mapApp > .map-where']));
    // 2026-11-23 대표 지적(한눈에 안 들어온다): 범례 한 줄·연도 막대를 지도 위 카드에서 빼 현황 숫자와 한 카드(숫자판)로 묶는다(DESIGN 4.9 '범례는 지도 밖').
    //   지도 위 카드를 피하느라 첫 화면이 줌 6으로 떨어져 한국이 화면 높이의 40%였다
    const dash = box('section', 'mv-dash');
    dash.setAttribute('aria-label', '지금 지도 요약');
    dash.append(...take(['#heroLive', '#mapApp > .map-legend-line-box', '#mapApp > .map-ctlbox']));
    body.append(...take(['#mapApp > .map-top']), dash, ...take(['#mapApp > .map-dongs']));
    foot.append(...take(['#mapApp > .map-bottom']));
    const links = footLinks(); if (links) foot.append(links);
    side.append(head, body, foot);
    const map = box('div', 'mx-map');
    map.append(stage);
    shell.append(side, map);
    document.body.classList.add('mx-on');
    fit();
    return true;
  }
  // 지도 높이 = 화면 높이 - 지도 위쪽(머리글·탭). 머리글 높이가 글꼴·줄바꿈에 따라 달라 직접 잰다
  function fit() {
    const shell = inner.querySelector('.mx');
    if (!shell) return;
    const top = Math.round(shell.getBoundingClientRect().top + window.scrollY) + 'px';
    if (shell.style.getPropertyValue('--mx-top') === top) return;   // 같은 값이면 resize를 다시 쏘지 않는다(속성 감시와 맞물려 도는 것 방지)
    shell.style.setProperty('--mx-top', top);
    window.dispatchEvent(new Event('resize'));   // Leaflet이 새 크기를 다시 잰다
  }
  function start() {
    if (done || !wide.matches) return;
    if (build()) { done = true; return; }
    const mo = new MutationObserver(() => { if (build()) { done = true; mo.disconnect(); } });
    mo.observe(app, { childList: true, subtree: true });
  }
  start();
  // workspace.js가 뒤에 실행되며 다른 패널을 숨기고 탭을 바꾸면 지도 위쪽 높이가 달라진다 → 다시 잰다
  const ws = document.querySelector('[data-workspace]');
  if (ws) new MutationObserver(() => { if (done) fit(); }).observe(ws, { attributes: true });
  window.addEventListener('load', () => { if (done) fit(); });
  // 창을 좁히면 새로고침 없이도 패널이 지도를 가리지 않게 한 줄 쌓기로 바꾼다(CSS가 .mx-on을 1024px 이상에서만 쓴다)
  if (wide.addEventListener) wide.addEventListener('change', () => { start(); fit(); window.dispatchEvent(new Event('resize')); });
})();
