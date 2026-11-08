/* 화면 스크립트가 함께 쓰는 작은 도구: HTML 이스케이프, 숫자 확인, 같은 주소를 한 번만 받는 JSON 캐시.
   전에는 일곱 파일이 같은 함수를 따로 복사해 썼고, JSON 캐시는 hero.js 안에 있어 map.js·find.js가 hero.js에 기대었다.
   노드 시험에서는 require('./util.js'), 브라우저에서는 window.RenewUtil. 다른 화면 스크립트보다 먼저 싣는다. */
(function (root) {
  'use strict';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  // low: 지도 화면이 renewAfter(첫 지도에 필요한 목록·경계)를 걸어 두면 그 뒤에 받는다. 느린 망에서 보조 자료가 첫 지도와 대역을 나눠 쓰지 않게 한다
  // 2026-11-08: 줄여 저장한 원장 셀(cell_pack)을 받자마자 원래 모양으로 되돌린다(cellpack.js). 화면 코드는 c.source_name 등을 그대로 읽는다.
  // cellpack.js를 싣지 않은 페이지가 줄인 파일을 받으면 출처 칸이 비어 보이므로, 조용히 넘기지 않고 오류를 낸다
  const nodeCP = typeof module === 'object' && module.exports ? require('./cellpack.js') : null;
  const unpackCells = j => {
    const cp = nodeCP || root.RenewCellPack;
    if (!cp) { if (j && typeof j === 'object' && 'cell_pack' in j) throw new Error('cellpack.js를 util.js보다 먼저 실어야 한다'); return j; }
    return cp.unpack(j);
  };
  const cache = {};
  const fetchJson = (url, low) => cache[url] || (cache[url] = (low && root.renewAfter ? root.renewAfter : Promise.resolve())
    .then(() => fetch(url, { cache: 'no-cache', priority: low ? 'low' : 'auto' })).then(r => (r.ok ? r.json() : null)).then(unpackCells)
    .catch(e => { if (root.console && e instanceof Error && /cell_pack|cellpack|출처 번호/.test(e.message)) console.error(url, e); return null; }));
  const api = { esc, isNum, fetchJson, unpackCells };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.RenewUtil = api; root.renewFetch = fetchJson; }
})(typeof window !== 'undefined' ? window : globalThis);
