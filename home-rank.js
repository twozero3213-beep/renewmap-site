/* 홈 '동네 순위' 미리보기(2026-11-13 v8). data/national/rank_top.json(export_rank_top.py가 scores.json에서 뽑은 상위 10곳)을 읽어
   목록마다 5곳을 그린다. 점수를 새로 셈하지 않는다. 동을 누르면 지도에서 그 동을 연다.
   왜: 대표 지적 — 사람들이 가장 궁금해하는 순위가 꼬리글 맨 아래에 있어 찾기 힘들었다 */
(function (root) {
  'use strict';
  const SHOW = 5;
  const { esc } = typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil;
  // 한 목록 → <li> 줄들(순수 함수, 시험용)
  // 무게를 바꿔 다시 셈한 순위 구간(rank_top.json rank_range, 출처 scores_range.json). 없으면 빈 글
  const rangeText = (r) => (Array.isArray(r) && r.length === 2 ? (r[0] === r[1] ? ` · 무게 바꿔도 ${r[0]}위` : ` · 무게 바꾸면 ${r[0]}~${r[1]}위`) : '');
  function itemsHTML(rows, n = SHOW) {
    return (rows || []).slice(0, n).map((r, i) => `<li><a href="explore.html#map/${esc(String(r.code7).slice(0, 2))}/${esc(r.code5)}/${esc(r.code7)}">` +
      `<span class="h6-rank-n">${i + 1}</span><b>${esc(r.name)}</b><span class="h6-rank-sg">${esc(r.sgg)}${esc(rangeText(r.rank_range))}</span><em>${Number(r.score).toFixed(1)}</em></a></li>`).join('');
  }
  // 곧 노후 요건에 닿는 동네(crossing_soon.json, export_crossing_soon.py): 해·동·지금 비율을 4D 주소로 잇는다
  function soonHTML(rows, n = 8) {
    return (rows || []).slice(0, n).map((r) => `<li><a href="time4d.html?bjd=${esc(r.bjd)}&amp;y=${esc(r.cross_year)}"><em>${esc(r.cross_year)}년</em>` +
      `<b>${esc(r.name)}</b><span class="h6-rank-sg">${esc(r.sgg)} · 지금 ${Number(r.now_pct20).toFixed(1)}%</span></a></li>`).join('');
  }
  const api = { itemsHTML, soonHTML };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  const soon = root.document && root.document.querySelector('[data-crossing]');
  if (soon) fetch('data/national/crossing_soon.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { soon.innerHTML = soonHTML(d.rows); }).catch(() => { soon.innerHTML = '<li class="h6-rank-wait">목록을 불러오지 못했습니다.</li>'; });
  const doc = root.document, lists = doc && doc.querySelectorAll('[data-rank]');
  if (!lists || !lists.length) return;
  fetch('data/national/rank_top.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    lists.forEach((ol) => { const l = d.lists && d.lists[ol.dataset.rank]; ol.innerHTML = l ? itemsHTML(l.rows) : ''; });
  }).catch(() => { lists.forEach((ol) => { ol.innerHTML = '<li class="h6-rank-wait">순위를 불러오지 못했습니다. 전체 순위에서 보세요.</li>'; }); });
})(typeof self !== 'undefined' ? self : this);
