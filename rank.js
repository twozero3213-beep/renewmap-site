/* 동네 점수·순위(D24, 2026-11-07). data/national/scores.json(export_scores.py)을 읽어 고른 범위·점수로 줄 세운다.
   점수 계산은 서버 스크립트가 한 번만 한다. 화면은 정렬·거르기만 한다(같은 순위가 문서와 화면에서 달라지지 않게) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewRank = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const { esc } = typeof module !== 'undefined' && module.exports ? require('./util.js') : window.RenewUtil;
  const KINDS = {
    total: { label: '동네 점수', get: d => d.total },
    safety: { label: '치안 점수', get: d => d.sub.safety },
    living: { label: '생활 편의', get: d => d.sub.living },
    vitality: { label: '인구 활력', get: d => d.sub.vitality },
    housing: { label: '주거 노후도(낮을수록 높음)', get: d => d.sub.housing },
    renewal: { label: '재생 필요 점수', get: d => d.renewal },
  };
  const fmt = v => (v === null || v === undefined ? '없음' : Number(v).toFixed(1));

  // [{code7, d, score}] 높은 점수부터. 같은 점수는 코드 순. scope: 'all' | 시도 2자리 | 시군구 5자리
  function rows(scores, kind, scope) {
    const get = KINDS[kind].get, out = [];
    for (const [code7, d] of Object.entries(scores.dongs)) {
      if (scope !== 'all' && !(scope.length === 2 ? code7.startsWith(scope) : d.code5 === scope)) continue;
      const s = get(d);
      if (s !== null && s !== undefined) out.push({ code7, d, score: s });
    }
    out.sort((a, b) => b.score - a.score || (a.code7 < b.code7 ? -1 : 1));
    return out;
  }

  // 무게를 바꿔 다시 계산한 순위의 5~95% 구간(scores_range.json, export_scores.py 민감도). scope는 rows와 같다
  const scopeKey = scope => (scope === 'all' ? 'nat' : scope.length === 2 ? 'sido' : 'sg');
  // range가 undefined면 아직 받는 중('…'), null이면 자료 없음('–'). 받는 중을 '없음'처럼 보이지 않게 나눈다(2026-11-08)
  function rangeText(range, code7, kind, scope) {
    if (range === undefined) return '…';
    const r = range && range.dongs && range.dongs[code7] && range.dongs[code7][kind] && range.dongs[code7][kind][scopeKey(scope)];
    return r ? `${r[0].toLocaleString('ko-KR')}~${r[1].toLocaleString('ko-KR')}` : '–';
  }

  function tableHTML(list, kind, names, limit, range, scope, offset = 0) {
    const head = `<thead><tr><th scope="col">순위</th><th scope="col">행정동</th><th scope="col">${esc(KINDS[kind].label)}</th><th scope="col">무게를 바꾼<br><small>순위 범위</small></th><th scope="col">생활 편의</th><th scope="col">인구 활력</th><th scope="col">주거 노후도</th><th scope="col">치안</th><th scope="col">범죄 발생률<br><small>1,000명당·시군구</small></th></tr></thead>`;
    const body = list.slice(0, limit).map((r, i) => {
      const s = r.d.sub, sp = r.d.safety_parts || {};
      return `<tr><td class="num">${offset + i + 1}</td><td><a href="dong/${esc(r.code7)}.html">${esc(names(r))}</a></td><td class="num"><b>${fmt(r.score)}</b></td><td class="num nw">${esc(rangeText(range, r.code7, kind, scope || 'all'))}</td>`
        + `<td class="num">${fmt(s.living)}</td><td class="num">${fmt(s.vitality)}</td><td class="num">${fmt(s.housing)}</td><td class="num">${fmt(s.safety)}</td>`
        + `<td class="num">${sp.crime_rate_per_1k === null || sp.crime_rate_per_1k === undefined ? '없음' : esc(sp.crime_rate_per_1k)}</td></tr>`;
    }).join('');
    return `<table class="grid rank-table"><caption>선택한 범위의 행정동 순위</caption>${head}<tbody>${body}</tbody></table>`;
  }

  function init() {
    const $ = id => document.getElementById(id);
    const kindSel = $('rankKind'), sidoSel = $('rankSido'), sgSel = $('rankSg'), out = $('rankOut'), msg = $('rankMsg'), sens = $('rankSens');
    let scores = null, idx = null, range, pager;   // range: undefined=받는 중, null=없음
    const sgName = code5 => (idx.sigungu.find(s => s.code5 === code5) || {}).name || code5;
    const names = r => `${sgName(r.d.code5)} ${r.d.name}`;
    function draw() {
      const scope = sgSel.value || sidoSel.value || 'all';
      const list = rows(scores, kindSel.value, scope);
      const page = pager.slice(list), offset = page.length ? list.indexOf(page[0]) : 0;
      msg.textContent = page.length ? `점수가 있는 ${list.length.toLocaleString('ko-KR')}개 동 중 ${(offset + 1).toLocaleString('ko-KR')}–${(offset + page.length).toLocaleString('ko-KR')}위를 보입니다.` : '선택한 범위에 점수가 있는 동이 없습니다.';
      out.innerHTML = tableHTML(page, kindSel.value, names, page.length, range, scope, offset);
      const sm = range && range.sensitivity && range.sensitivity.summary && range.sensitivity.summary[kindSel.value];
      sens.textContent = sm ? `${KINDS[kindSel.value].label} 전국 순위는 무게만 바꿔도 범위 폭이 중앙값 ${sm.median_width_nat.toLocaleString('ko-KR')}위입니다. 기준 상위 10곳 중 무게를 바꿔도 95% 이상 상위 10 안에 남는 곳은 ${sm.top10_stay}곳입니다.` : kindSel.value === 'housing' ? '주거 노후도는 지표가 하나라 바꿀 무게가 없습니다.' : '';
    }
    function fillSg() {
      const s2 = sidoSel.value;
      sgSel.innerHTML = '<option value="">시·군·구 전체</option>' + (s2 ? idx.sigungu.filter(s => s.sido2 === s2)
        .map(s => `<option value="${esc(s.code5)}">${esc(s.name)}</option>`).join('') : '');
      sgSel.disabled = !s2;
    }
    // 2026-11-08 속도: 순위 범위(scores_range.json, 압축 풀면 1MB)를 기다리지 않고 점수·목록이 오면 표부터 그린다.
    // 범위 열은 '…'로 두었다가 도착하면 다시 그린다. 받는 양은 같고 표가 먼저 보인다
    const rangeP = fetch('data/national/scores_range.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([fetch('data/national/scores.json').then(r => r.json()), fetch('data/national/index_core.json').then(r => r.json())])
      .then(([s, i]) => {
        scores = s; idx = i;
        sidoSel.innerHTML = '<option value="">전국</option>' + i.sido.map(x => `<option value="${esc(x.code2)}">${esc(x.name)}</option>`).join('');
        const q = new URLSearchParams(location.search);
        if (Object.hasOwn(KINDS, q.get('kind'))) kindSel.value = q.get('kind');
        if (q.get('sido')) sidoSel.value = q.get('sido');
        fillSg();
        if (q.get('sg')) sgSel.value = q.get('sg');
        pager = window.RenewListPages.create(out, '동네 순위', draw);
        const reset = () => { pager.reset(); draw(); };
        kindSel.onchange = reset; sgSel.onchange = reset;
        sidoSel.onchange = () => { fillSg(); reset(); };
        draw();
        rangeP.then(g => { range = g; draw(); });
      })
      .catch(() => { msg.textContent = '점수 자료를 불러오지 못했습니다. 새로고침해 주세요.'; });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return { KINDS, rows, tableHTML, rangeText };
});
