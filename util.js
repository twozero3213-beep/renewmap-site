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
  // 2026-11-20 CQ-08: 404(파일 없음)만 '없음'이고, 통신 끊김·5xx·깨진 JSON은 '받지 못함'이다. 반환은 둘 다 null로 두고(받는 쪽이 값을 그대로 쓴다) 실패만 따로 기억한다.
  // 전에는 둘을 구분하지 못해 일시적인 통신 실패가 칩에 '수집 중', 근거서에 '파일 없음'으로 적혔다
  const failed = new Set();
  const fetchJson = (url, low) => cache[url] || (cache[url] = (low && root.renewAfter ? root.renewAfter : Promise.resolve())
    .then(() => fetch(url, { cache: 'no-cache', priority: low ? 'low' : 'auto' })).then(r => (r.ok ? r.json() : r.status === 404 ? null : Promise.reject(new Error('HTTP ' + r.status)))).then(unpackCells)
    .then(v => { failed.delete(url); return v; }, e => { failed.add(url); if (root.console && e instanceof Error && /cell_pack|cellpack|출처 번호/.test(e.message)) console.error(url, e); return null; })
    .then(v => { if (v === null) delete cache[url]; return v; }));   // 실패는 기억하지 않는다(v9: 한 번 끊기면 새로 고칠 때까지 그 자료가 계속 '없음'이었다)
  const fetchFailed = url => failed.has(url);
  // CSV 한 칸(candidates.js와 같은 규칙). 엑셀은 =+-@·탭·CR로 시작하는 칸을 식으로 읽어 막되, '-2.81' 같은 순수 숫자는 그대로 둔다
  const CSV_NUM = /^-?\d+(?:\.\d+)?$/;
  const csvCell = value => { const t = String(value ?? ''); return '"' + (CSV_NUM.test(t.trim()) ? t : t.replace(/^[\s﻿]*[=+@\t\r-]/, "'$&")).replace(/"/g, '""') + '"'; };
  // 동 이름 찾기(홈·동네 순위·동네 찾기 공통). 행정동은 법정동 이름에 번호를 붙인 것이 많아('우1동', '광안2동'),
  // 사람들이 아는 법정동 이름('우동')이나 구 이름을 붙인 말('해운대 우동')로도 찾게 한다(v9 페르소나: 세 화면 모두 못 찾았다)
  const flat = s => String(s || '').replace(/[\s·]+/g, '').toLowerCase();
  const dongStem = name => String(name || '').replace(/제?\d+(?:\.\d+)?동$/, '동');
  const shortName = s => String(s || '').replace(/(특별자치시|특별자치도|특별시|광역시|도|시|군|구)$/, '');
  // r16: 묶은 행정동 이름의 각 이름. '용담·명암·산성동' → 용담동·명암동·산성동, '종로1·2·3·4가동' → 종로1가동…종로4가동(전에는 '명암동'으로 못 찾았다)
  function members(name) {
    const s = String(name || ''); if (!s.includes('·')) return [];
    const n = /^(.+?)(\d+)((?:·\d+)+)(가동|동|읍|면)$/.exec(s);
    if (n) return [n[2], ...n[3].split('·').filter(Boolean)].map(d => n[1] + d + n[4]);
    const parts = s.split('·').filter(Boolean), kind = (/(동|읍|면)$/.exec(parts[parts.length - 1]) || [])[1];
    return kind ? parts.map(p => (p.endsWith(kind) ? p : p + kind)) : [];
  }
  // q가 이 동을 가리키나. region: 그 동의 시·도, 시·군·구 이름들(앞에 붙여 적은 지역 이름을 걸러 낸다)
  function dongHit(q, name, region = []) {
    const f = flat(q), keys = [name, dongStem(name), ...members(name).flatMap(x => [x, dongStem(x)])].map(flat);
    if (!f) return false;
    if (keys.includes(f)) return true;
    // 일반구 시는 시·군·구 이름이 '창원시 성산구' 한 칸이라 낱말로도 쪼갠다('창원 중앙동'·'성산구 중앙동', r16 회귀 검토)
    const toks = region.flatMap(x => [x, ...String(x || '').split(/\s+/)]).flatMap(x => [flat(x), flat(shortName(x))]).filter(t => t.length > 1).sort((a, b) => b.length - a.length);
    return keys.some(k => f.length > k.length && f.endsWith(k) && !toks.reduce((p, t) => p.split(t).join(''), f.slice(0, -k.length)));
  }
  // 시·도 짧은 이름(전국 목록에 붙인다. v9: '동구 송림2동'(인천)이 부산 '동구 초량6동' 옆에 시·도 없이 섞였다)
  const SIDO_SHORT = { 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남' };
  const sidoShort = name => SIDO_SHORT[name] || String(name || '').replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '');
  // 출처 문구에서 저장소 경로·내부 판본 번호를 걷어 낸다(생활 지표 원장에 'docs/RULES_VERSIONS.md SOC-2019.01 [대조 필요]'가 들어 있다).
  // docgen.js plainSource와 같은 식이다(현장 화면은 util.js를 안 실어 거기 한 벌 더 있다. 시험이 둘을 대조한다)
  const plainSource = s => String(s || '').replace(/,?\s*docs\/\S+\.md(?:\s+[A-Z]+-[\d.]+)?/g, '').replace(/\[대조 필요\]/g, '(기준 원문 대조 필요)')
    .replace(/\[2차 인용, 원문 문서 미열람\]/g, '(2차 인용, 원문 미확인)').replace(/\[([^\]]+)\]/g, '($1)');
  // 받침에 맞는 조사(은/는·이/가). 끝의 괄호·숫자·기호는 건너뛰고 마지막 한글로 본다. 한글이 없으면 '은(는)'처럼 둘 다(#85: 세 곳에 따로 있던 계산을 하나로)
  const josa = (word, a = '은', b = '는') => {
    const ch = String(word).replace(/\([^)]*\)$/, '').replace(/[^가-힣]+$/, '').slice(-1);
    return ch ? ((ch.charCodeAt(0) - 0xAC00) % 28 ? a : b) : `${a}(${b})`;
  };
  // R3 11: 사업체 감소율 0%는 '마지막 해 사업체 수가 최근 10년 중 가장 많다'는 뜻이다(식: (10년 최대 − 마지막 해) ÷ 10년 최대). 0이 채운 값처럼 읽혔다.
  // 시계열로 실제 확인되는 때만 말한다(지어내지 않는다). 파이썬 export_dong_pages.biz_zero_note와 같은 글이다
  const bizZeroNote = (points, rate) => {
    if (rate !== 0) return '';
    const pts = (points || []).filter(p => p && isNum(p[1])), last = pts[pts.length - 1];
    if (!last || Math.max(...pts.filter(p => p[0] > last[0] - 10).map(p => p[1])) !== last[1]) return '';
    return `${last[0]}년 사업체 수(${last[1].toLocaleString('ko-KR')}개)가 최근 10년 중 가장 많아 감소율이 0%입니다.`;
  };
  const BIZ_BOUNDARY = '사업체 출처 경계: 2019년까지는 쇠퇴진단지표(전국사업체조사 조사 기반), 2020년부터는 SGIS 전국사업체조사(등록 기반)라 이어서 비교할 때는 주의가 필요합니다.';
  // r16 공통 사전: 추가확인 셀의 까닭 한 줄. 원장 note의 '추가확인:' 뒤 글을 화면 문장으로 옮긴다(새 숫자는 note에 있는 것만).
  // tag: '전국 공통'(모든 동이 같은 규칙 문제, 사람이 풀 수 없음) | '이 동 자료'(이 동의 출처 자료 문제). 화면은 '(tag) text'로 쓴다
  const BIZ_WHY = '2020년에 사업체 통계 방식이 바뀌어 10년 비교가 끊깁니다. 계산 방법을 정하기 전까지 추가확인으로 둡니다.';
  const WHY = [
    [/사업체 출처 경계/, () => ['전국 공통', BIZ_WHY]],
    [/행정동 경계 변경 추정\(([^)]*)\)/, m => {
      const hits = [...m[1].matchAll(/(\d{4})년 같은 시·군·구 코드 변동, 그 해 인구 ([−+-]?[\d.]+%)/g)];
      return ['이 동 자료', `${hits.map(h => h[1]).join('·')}년 무렵 동 경계가 바뀐 것으로 보입니다(그해 인구 ${hits.map(h => h[2]).join('·')}). 경계 전후를 이어 비교하지 않습니다.`];
    }],
    [/(\d+)년 창 중 (\d{4})년부터 자료[^—]*— 하한 ([−-]?[\d.]+%)/, m => ['이 동 자료', `${m[2]}년부터만 자료가 있어 ${m[1]}년 비교를 다 하지 못합니다. 있는 기간만 센 감소율은 ${m[3]}입니다.`]],
    [/(\d+)년 창 중 빈 해 있음 — 하한 ([−-]?[\d.]+%)/, m => ['이 동 자료', `${m[1]}년 비교 기간에 빈 해가 있습니다. 있는 해만 센 감소율은 ${m[2]}입니다.`]],
    // '10년 사업체 시계열 결측'은 10년 비교 기간, '2015년 …'은 그 해
    [/(\d+)년 (사업체|인구) 시계열 결측/, m => ['이 동 자료', m[1].length === 4 ? `${m[1]}년 ${m[2]} 수가 출처에 없습니다.` : `${m[1]}년 비교에 필요한 ${m[2]} 수가 출처에 빠져 있습니다.`]],
    [/최근 (\d+)개년 (사업체|인구) 결측/, m => ['이 동 자료', `최근 ${m[1]}년 중 ${m[2]} 수가 빠진 해가 있습니다.`]],
    [/(\d{4})년 SGIS 경계에 없는 코드/, m => ['이 동 자료', `${m[1]}년 행정동 경계에 없는 동 코드입니다.`]],
    [/정비사업 이주·철거/, () => ['이 동 자료', '정비사업 이주·철거로 인구가 줄었을 수 있습니다.']],
    [/원천 값 없음/, () => ['이 동 자료', '출처에 이 해 값이 없습니다.']],
    [/미확정 요건 (\d+)개(\([^)]*\))?는 세지 않음/, m => ['이 동 자료', `정하지 못한 요건 ${m[1]}개${m[2] || ''}는 세지 않았습니다.`]],
  ];
  function checkWhy(cell) {
    if (!cell || cell.status !== '추가확인' || cell.value_hidden_reason) return null;
    const note = String(cell.note || ''), i = note.lastIndexOf('추가확인:');
    const raw = i < 0 ? '' : note.slice(i + 5).trim();
    if (!raw) return null;
    for (const [re, to] of WHY) { const m = re.exec(raw); if (m) { const [tag, text] = to(m); return { tag, text }; } }
    return { tag: '이 동 자료', text: raw };
  }
  // r19(09 5절): 추가확인 값은 큰 숫자 자리에 짧은 까닭을 쓴다(예: '경계 변경으로 비교 끊김'). 원장 note의 '추가확인:' 뒤 글로 고르고, 모르는 글은 한 가지 말
  const WHY_SHORT = [[/사업체 출처 경계/, '2020년 통계 방식이 바뀌어 비교 끊김'], [/행정동 경계 변경 추정/, '경계 변경으로 비교 끊김'], [/년 창 중 \d{4}년부터 자료/, '비교 기간 자료가 모자람'],
    [/년 창 중 빈 해 있음/, '비교 기간에 빈 해가 있음'], [/시계열 결측|개년 (사업체|인구) 결측|원천 값 없음/, '출처에 값이 빠짐'], [/SGIS 경계에 없는 코드/, '경계에 없는 동 코드'],
    [/정비사업 이주·철거/, '정비사업 이주·철거'], [/미확정 요건/, '정하지 못한 요건이 있음']];
  function whyShort(cell) {
    if (!checkWhy(cell)) return null;
    const note = String(cell.note || ''), raw = note.slice(note.lastIndexOf('추가확인:') + 5), hit = WHY_SHORT.find(([re]) => re.test(raw));
    return hit ? hit[1] : '출처 자료를 더 확인해야 함';
  }
  const api = { esc, isNum, roundD, fmt2, plainSource, fetchJson, fetchFailed, csvCell, unpackCells, flat, dongStem, members, dongHit, sidoShort, josa, bizZeroNote, BIZ_BOUNDARY, BIZ_WHY, checkWhy, whyShort };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.RenewUtil = api; root.renewFetch = fetchJson; }
})(typeof window !== 'undefined' ? window : globalThis);
