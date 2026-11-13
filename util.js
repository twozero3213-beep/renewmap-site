/* 화면 스크립트가 함께 쓰는 작은 도구: HTML 이스케이프, 숫자 확인, 같은 주소를 한 번만 받는 JSON 캐시.
   전에는 일곱 파일이 같은 함수를 따로 복사해 썼고, JSON 캐시는 hero.js 안에 있어 map.js·find.js가 hero.js에 기대었다.
   노드 시험에서는 require('./util.js'), 브라우저에서는 window.RenewUtil. 다른 화면 스크립트보다 먼저 싣는다. */
(function (root) {
  'use strict';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  // 소수 d자리 반올림. 딱 절반이면 짝수 쪽(파이썬 round·dong_brief fmt_num과 같다). docgen.js roundD와 같은 식이다(현장 화면은 util.js를 안 실어 거기 한 벌 더 있다. 시험이 둘을 대조한다)
  // v9: 홈은 11.125를 11.13, 동 페이지·1쪽 문서는 11.12로 적었다
  function roundD(v, d) {
    const t = v * 2 ** (d + 1);
    if (Number.isInteger(t) && Math.abs(t) % 2 === 1) { const f = Math.floor(v * 10 ** d); return (f % 2 === 0 ? f : f + 1) / 10 ** d; }
    return Number(v.toFixed(d));
  }
  // 요건 비율은 어디서나 소수 둘째 자리까지(1쪽 문서·동 페이지와 같게. v9: 지도 카드만 83%, 나머지는 82.96%)
  const fmt2 = v => roundD(v, 2).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
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
    .catch(e => { if (root.console && e instanceof Error && /cell_pack|cellpack|출처 번호/.test(e.message)) console.error(url, e); return null; })
    .then(v => { if (v === null) delete cache[url]; return v; }));   // 실패는 기억하지 않는다(v9: 한 번 끊기면 새로 고칠 때까지 그 자료가 계속 '없음'이었다)
  const api = { esc, isNum, roundD, fmt2, fetchJson, unpackCells };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.RenewUtil = api; root.renewFetch = fetchJson; }
})(typeof window !== 'undefined' ? window : globalThis);
