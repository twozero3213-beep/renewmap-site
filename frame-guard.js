// 다른 사이트가 이 화면을 iframe으로 감싸면(클릭재킹) 최상위 창으로 연다.
// GitHub Pages는 X-Frame-Options·CSP frame-ancestors 응답 헤더를 넣을 수 없고, meta CSP의 frame-ancestors는 무시된다(감사 2026-10-29 H4).
// 같은 사이트 안의 iframe(현장 앱 field/vw-frame.html)은 그대로 둔다. 같은 출처여도 사이트 경로 밖 창이 넣은 것은 막는다(SEC-01).
// 모든 화면 <head>에서 동기로 도는 유일한 스크립트라 여기서 'js' 표시를 붙인다. 등장 효과는 이 표시가 있을 때만 숨겼다가 보인다(스크립트가 막혀도 내용은 보인다)
document.documentElement.classList.add('js');
(function () {
  if (window.top === window.self) return;
  // 같은 출처라도 이 사이트 경로 밖의 최상위 창이면(같은 계정의 다른 Pages 사이트) 막는다. 인라인 복사본은 src가 없어 문서 주소를 기준으로 한다
  let same = false;
  try {
    const base = new URL('.', (document.currentScript && document.currentScript.src) || document.baseURI).pathname;
    same = window.top.location.origin === window.location.origin && window.top.location.pathname.startsWith(base);
  } catch (e) { same = false; }
  if (same) return;
  try { window.top.location = window.location.href; } catch (e) { document.documentElement.style.display = 'none'; }
})();
