/* 동 페이지 '회의용으로 크게 인쇄하기'(2026-11-13). 자바스크립트가 없으면 단추를 숨긴 채 둔다. 인쇄 모양은 rm6.css @media print */
(function () {
  'use strict';
  for (const b of document.querySelectorAll('[data-print]')) {
    b.hidden = false;
    b.addEventListener('click', () => window.print());
  }
  // 쪽마다 동 이름·기준일(R7 4). 글자는 동마다 달라 CSS 파일에 못 적으니, 인쇄 직전 같은 출처 스타일시트에 @page 머리 상자를 CSSOM으로 끼운다
  // (CSP style-src 'self'는 인라인 <style>만 막는다). 머리 상자를 모르는 브라우저는 규칙이 안 들어가고 첫 쪽 제목만 남는다
  const head = document.querySelector('.print-head');
  if (!head) return;
  const q = s => '"' + s.replace(/[\\"\n]/g, ' ') + '"';
  const name = head.querySelector('b'), when = head.querySelector('span');
  let done = false;
  window.addEventListener('beforeprint', () => {
    if (done || !name) return;
    const sheet = [...document.styleSheets].find(s => /rm6\.css/.test(s.href || ''));
    if (!sheet) return;
    try {
      sheet.insertRule('@media print { @page { @top-left { content: ' + q(name.textContent) + '; font: 700 20pt Pretendard, sans-serif; color: #000; width: 62%; border-bottom: 1.5pt solid #000; } @top-right { content: ' + q(when ? when.textContent : '') + '; font: 14pt Pretendard, sans-serif; color: #000; width: 38%; border-bottom: 1.5pt solid #000; } } }', sheet.cssRules.length);
      done = true;
    } catch (e) { /* 머리 상자 문법을 못 읽는 브라우저 */ }
  });
})();
