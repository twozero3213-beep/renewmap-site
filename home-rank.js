/* 홈 '동네 순위' 미리보기(2026-11-13 v8). data/national/rank_top.json(export_rank_top.py가 scores.json에서 뽑은 상위 10곳)을 읽어
   목록마다 5곳을 그린다. 점수를 새로 셈하지 않는다. 동을 누르면 지도에서 그 동을 연다.
   왜: 대표 지적 — 사람들이 가장 궁금해하는 순위가 꼬리글 맨 아래에 있어 찾기 힘들었다 */
(function (root) {
  'use strict';
  const SHOW = 5;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 한 목록 → <li> 줄들(순수 함수, 시험용)
  function itemsHTML(rows, n = SHOW) {
    return (rows || []).slice(0, n).map((r, i) => `<li><a href="explore.html#map/${esc(String(r.code7).slice(0, 2))}/${esc(r.code5)}/${esc(r.code7)}">` +
      `<span class="h6-rank-n">${i + 1}</span><b>${esc(r.name)}</b><span class="h6-rank-sg">${esc(r.sgg)}</span><em>${Number(r.score).toFixed(1)}</em></a></li>`).join('');
  }
  const api = { itemsHTML };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  const doc = root.document, lists = doc && doc.querySelectorAll('[data-rank]');
  if (!lists || !lists.length) return;
  fetch('data/national/rank_top.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    lists.forEach((ol) => { const l = d.lists && d.lists[ol.dataset.rank]; ol.innerHTML = l ? itemsHTML(l.rows) : ''; });
  }).catch(() => { lists.forEach((ol) => { ol.innerHTML = '<li class="h6-rank-wait">순위를 불러오지 못했습니다. 전체 순위에서 보세요.</li>'; }); });
})(typeof self !== 'undefined' ? self : this);
