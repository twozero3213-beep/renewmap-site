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
  // 동 이름 찾기(홈·동네 순위·동네 찾기 공통). 행정동은 법정동 이름에 번호를 붙인 것이 많아('우1동', '광안2동'),
  // 사람들이 아는 법정동 이름('우동')이나 구 이름을 붙인 말('해운대 우동')로도 찾게 한다(v9 페르소나: 세 화면 모두 못 찾았다)
  const flat = s => String(s || '').replace(/[\s·]+/g, '').toLowerCase();
  const dongStem = name => String(name || '').replace(/제?\d+(?:\.\d+)?동$/, '동');
  const shortName = s => String(s || '').replace(/(특별자치시|특별자치도|특별시|광역시|도|시|군|구)$/, '');
  // q가 이 동을 가리키나. region: 그 동의 시·도, 시·군·구 이름들(앞에 붙여 적은 지역 이름을 걸러 낸다)
  function dongHit(q, name, region = []) {
    const f = flat(q), keys = [flat(name), flat(dongStem(name))];
    if (!f) return false;
    if (keys.includes(f)) return true;
    const toks = region.flatMap(x => [flat(x), flat(shortName(x))]).filter(t => t.length > 1).sort((a, b) => b.length - a.length);
    return keys.some(k => f.length > k.length && f.endsWith(k) && !toks.reduce((p, t) => p.split(t).join(''), f.slice(0, -k.length)));
  }
  // 시·도 짧은 이름(전국 목록에 붙인다. v9: '동구 송림2동'(인천)이 부산 '동구 초량6동' 옆에 시·도 없이 섞였다)
  const SIDO_SHORT = { 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남' };
  const sidoShort = name => SIDO_SHORT[name] || String(name || '').replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '');
  // 출처 문구에서 저장소 경로·내부 판본 번호를 걷어 낸다(생활 지표 원장에 'docs/RULES_VERSIONS.md SOC-2019.01 [대조 필요]'가 들어 있다).
  // docgen.js plainSource와 같은 식이다(현장 화면은 util.js를 안 실어 거기 한 벌 더 있다. 시험이 둘을 대조한다)
  const plainSource = s => String(s || '').replace(/,?\s*docs\/\S+\.md(?:\s+[A-Z]+-[\d.]+)?/g, '').replace(/\[대조 필요\]/g, '(기준 원문 대조 필요)')
    .replace(/\[2차 인용, 원문 문서 미열람\]/g, '(2차 인용, 원문 미확인)').replace(/\[([^\]]+)\]/g, '($1)');
  const api = { esc, isNum, roundD, fmt2, plainSource, fetchJson, unpackCells, flat, dongStem, dongHit, sidoShort };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.RenewUtil = api; root.renewFetch = fetchJson; }
})(typeof window !== 'undefined' ? window : globalThis);
