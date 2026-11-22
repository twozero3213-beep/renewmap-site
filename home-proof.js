/* 홈 첫 화면 오른쪽 '근거표 한 조각'(r19, 09_총괄_설계.md 2절·08c 쟁점 2). 숫자는 HTML에 적지 않고
   data/proof_sample.json(backend/scripts/export_proof_sample.py가 대상지 계산으로 만든 반여동 실제 계산)을 읽어 그린다.
   자료가 없거나 모양이 다르면 조각을 그리지 않는다(지어낸 숫자 금지, 원칙 4). 건물 이름·관리번호·세대수는 자료에도 없다 */
(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : ''; };
  const ok = (d) => !!(d && Array.isArray(d.columns) && d.columns.length === 7 && Array.isArray(d.rows) && d.rows.length
    && d.rows.every((r) => Array.isArray(r) && r.length === 7) && d.check_cells && Number.isFinite(d.check_cells.n) && Number.isFinite(d.check_cells.m)
    && d.missing && Number.isFinite(d.missing.count) && d.source);
  // '20년 넘음' 칸의 추가확인은 상태 꼬리표 모양으로(5절: 기존 .tag.check가 새 모양이 된다). 까닭은 마지막 칸 글로
  const cell = (v, i) => (i === 5 && v === '추가확인' ? '<span class="tag check">추가확인</span>' : esc(v));
  // 건물별 표 모양(rm6.css .rm-btable, 대상지 계산 결과 redev.js btableHTML과 같은 글자). 찾음·주용도·구조는 주소 아래 작은 줄로 모아
  // 오른쪽 5칸 폭에서도 네 칸이 다 들어가고(가로로 밀지 않는다, 13 H1), 휴대폰은 줄마다 카드
  const sub = (a) => a.slice(1, 4).map(esc).join(' · ');
  const table = (cols, rows) => `<table class="rm-btable"><thead><tr><th scope="col">${esc(cols[0])}<small>${sub(cols)}</small></th>${cols.slice(4).map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>`
    + rows.map((r) => `<tr><th scope="row">${esc(r[0])}<small>${sub(r)}</small></th>${r.slice(4).map((v, i) => `<td data-k="${esc(cols[i + 4])}">${cell(v, i + 4)}</td>`).join('')}</tr>`).join('')
    + '</tbody></table>';
  // 못 찾은 주소는 칸에 넣지 않고 한 줄로(까닭별 개수). 08c: '대장에 없는 주소 n개(계산 제외)'
  function missLine(m) {
    if (!m.count) return '';
    const by = new Map();
    for (const it of m.items || []) by.set(it.reason, (by.get(it.reason) || 0) + 1);
    const why = by.size === 1 ? [...by.keys()][0] : [...by].map(([r, n]) => `${r} ${n}개`).join(', ');
    return `<b>못 찾은 주소 ${m.count}개</b>는 계산에서 뺐습니다.${why ? ` 까닭: ${esc(why)}.` : ''}`;
  }
  function html(d) {
    if (!ok(d)) return '';
    const c = d.check_cells, s = d.source, sum = d.summary || {};
    const kinds = (c.kinds || []).map((k) => `<li>${esc(k.label)} ${esc(k.n)}칸 → ${esc(k.next)}</li>`).join('');
    const where = d.dong && d.dong.name ? `${esc(d.dong.name)} 예시 결과` : '예시 결과';
    return `<header class="h7-proof-head"><p class="h7-proof-badge">${esc(d.badge)}</p><h2 id="proofTitle">${where}</h2>`
      + `<p class="h7-proof-check">구청이 확인할 칸 <span class="rm-mark">${esc(c.n)}칸</span> / 전체 ${esc(c.m)}칸</p></header>`
      + table(d.columns, d.rows)
      // r23(13 M5): 표 아래 세 문단(못 찾은 주소·전체 결과·표 설명)을 한 문단으로 줄여 한눈 띠를 데스크톱 첫 화면 안으로 올린다. 표 설명은 펼침 안 '표'
      + `<p class="h7-proof-sum">${[Array.isArray(sum.aging_lines) && sum.aging_lines[0] ? `주소 ${esc((d.input || []).length || '')}개 전체 결과: ${esc(sum.aging_lines[0])}.` : '', missLine(d.missing)].filter(Boolean).join(' ')}</p>`
      + `<details class="h7-proof-src"><summary>이 숫자는 어디서 왔나요?</summary><dl>`
      + `<dt>표</dt><dd>${esc(d.caption)} ${esc(d.duplicates || '')}</dd>`
      + `<dt>자료</dt><dd>${esc(s.name)}</dd><dt>이용 조건</dt><dd>${esc(s.license)}</dd>`
      + `<dt>자료 기준</dt><dd>${esc(day(s.reference_date))} 기준</dd>${s.retrieved_at ? `<dt>조회한 날</dt><dd>${esc(day(s.retrieved_at))}</dd>` : ''}`
      + `<dt>세는 기준</dt><dd>${esc(c.rule || '')}${kinds ? `<ul>${kinds}</ul>` : ''}</dd></dl></details>`;
  }
  const api = { html, ok, day };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  const fig = root.document && root.document.getElementById('proof');
  if (!fig) return;
  fetch('data/proof_sample.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { const h = html(d); if (!h) throw new Error('proof_sample'); fig.innerHTML = h; fig.removeAttribute('aria-busy'); })
    .catch(() => { fig.hidden = true; });   // 자료가 없으면 조각을 그리지 않는다(09 2절). 왼쪽 글과 단추만으로도 쓸 수 있다
})(typeof window !== 'undefined' ? window : globalThis);
