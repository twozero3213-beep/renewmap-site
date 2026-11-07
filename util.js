/* 화면 스크립트가 함께 쓰는 작은 도구: HTML 이스케이프, 숫자 확인, 같은 주소를 한 번만 받는 JSON 캐시.
   전에는 일곱 파일이 같은 함수를 따로 복사해 썼고, JSON 캐시는 hero.js 안에 있어 map.js·find.js가 hero.js에 기대었다.
   노드 시험에서는 require('./util.js'), 브라우저에서는 window.RenewUtil. 다른 화면 스크립트보다 먼저 싣는다. */
(function (root) {
  'use strict';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  // low: 지도 화면이 renewAfter(첫 지도에 필요한 목록·경계)를 걸어 두면 그 뒤에 받는다. 느린 망에서 보조 자료가 첫 지도와 대역을 나눠 쓰지 않게 한다
  const cache = {};
  const fetchJson = (url, low) => cache[url] || (cache[url] = (low && root.renewAfter ? root.renewAfter : Promise.resolve())
    .then(() => fetch(url, { cache: 'no-cache', priority: low ? 'low' : 'auto' })).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const api = { esc, isNum, fetchJson };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.RenewUtil = api; root.renewFetch = fetchJson; }
})(typeof window !== 'undefined' ? window : globalThis);
