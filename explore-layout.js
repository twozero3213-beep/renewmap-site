/* 동네 찾기 넓은 화면 배치(2026-11-13 v7): 왼쪽 패널 + 화면 전체 지도.
   왜: 경쟁 서비스 REA 분해(PLATEAU VIEW·Kepler·디스코·밸류맵)에서 공통으로, 지도를 화면 높이 전체로 두고 페이지 스크롤을 없애
   휠을 지도 확대에만 쓰게 했다. 우리 화면은 지도 위에 조작층 다섯 줄이 쌓여 지도가 y≈445에서 시작했다(11-13 평가).
   map.js가 만든 요소를 다시 만들지 않고 자리만 옮긴다(참조는 그대로 살아 있다). 1100px 미만은 원래 순서 그대로 둔다.
   고른 동의 세부(.map-panel)는 지도 오른쪽 위에 떠 있게 둔다: 왼쪽 패널 아래로 밀리면 조작 줄을 지나 내려야 보였다. */
(function () {
  'use strict';
  const wide = window.matchMedia('(min-width: 1100px)');
  const inner = document.querySelector('#map .workspace-panel-inner');
  const app = document.getElementById('mapApp');
  if (!inner || !app) return;
  let done = false;

  function build() {
    const stage = app.querySelector('.map-stage');
    if (!stage || !stage.querySelector('.map-canvas')) return false;
    const side = document.createElement('aside');
    side.className = 'mx-side';
    side.setAttribute('aria-label', '지도 조작과 선택한 동');
    const shell = document.createElement('div');
    shell.className = 'mx';
    // 틀은 #mapApp 안에 둔다: map.js가 칩·재생·닫기 단추의 클릭·입력을 #mapApp 한 곳에서 받는다(이벤트 위임). 밖으로 빼면 넓은 화면에서 단추가 먹지 않았다
    app.append(shell);
    const pick = ['#heroSearch', '#heroLive', '#mapApp > .map-top', '#mapApp > .map-bottom', '#map .hero-head', '.hero-basis', '#overlayApp'];
    for (const sel of pick) { const el = inner.querySelector(sel); if (el) side.append(el); }
    const map = document.createElement('div');
    map.className = 'mx-map';
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
  // 창을 좁히면 새로고침 없이도 패널이 지도를 가리지 않게 한 줄 쌓기로 바꾼다(CSS가 .mx-on을 1100px 이상에서만 쓴다)
  if (wide.addEventListener) wide.addEventListener('change', () => { start(); fit(); window.dispatchEvent(new Event('resize')); });
})();
