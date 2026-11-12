/* 동 페이지 '회의용으로 크게 인쇄하기'(2026-11-13). 자바스크립트가 없으면 단추를 숨긴 채 둔다. 인쇄 모양은 rm6.css @media print */
(function () {
  'use strict';
  for (const b of document.querySelectorAll('[data-print]')) {
    b.hidden = false;
    b.addEventListener('click', () => window.print());
  }
})();
