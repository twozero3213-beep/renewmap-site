/* 사업성 간이 계산(D24, 2026-11-07). 정비사업 비례율 = (종후자산 − 총사업비) / 종전자산 × 100.
   입력값으로만 계산하는 추정이다. 감정평가(감정평가법)·투자 권유가 아니다. 분양가 기본값만 실거래(시·군·구 아파트 ㎡당 중위가)에서 온다 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewBiz = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  // 출처 없는 가정값은 화면에 '가정'으로 표시하고 사용자가 바꾼다
  const DEFAULTS = { area: 10000, far: 250, netRatio: 70, price: 600, cost: 280, underRatio: 40, otherRatio: 20, before: '' };

  // 금액 단위: 만원. 면적: ㎡. 비율 입력은 %
  function feasibility(x) {
    const n = k => Number(x[k]);
    for (const k of ['area', 'far', 'netRatio', 'price', 'cost', 'underRatio', 'otherRatio']) {
      if (!Number.isFinite(n(k)) || n(k) < 0) return { error: `${k} 값이 숫자가 아닙니다` };
    }
    const above = n('area') * n('far') / 100;                     // 지상 연면적
    const total = above * (1 + n('underRatio') / 100);            // 공사 연면적(지하 포함)
    const net = above * n('netRatio') / 100;                      // 분양 전용면적 합
    const after = net * n('price');                               // 종후자산(분양 총액)
    const build = total * n('cost');
    const other = build * n('otherRatio') / 100;
    const cost = build + other;
    const profit = after - cost;                                  // 종전자산에 돌아갈 몫
    const before = x.before === '' || x.before === null || x.before === undefined ? null : Number(x.before) * 10000;   // 억원 → 만원
    const ratio = before && before > 0 ? (profit / before) * 100 : null;
    const sens = [-10, 0, 10].map(p => {
      const a = net * n('price') * (1 + p / 100);
      return { pct: p, ratio: before && before > 0 ? ((a - cost) / before) * 100 : null, profit: a - cost };
    });
    return { above, total, net, after, build, other, cost, profit, before, ratio, sens };
  }

  const won = v => (v === null ? '입력 없음' : `${(v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`);
  const pct = v => (v === null ? '종전자산을 넣으면 계산' : `${v.toFixed(1)}%`);
  const m2 = v => `${Math.round(v).toLocaleString('ko-KR')}㎡`;

  function resultHTML(r) {
    if (r.error) return `<p class="warn">${r.error}</p>`;
    const rows = [['지상 연면적', m2(r.above)], ['공사 연면적(지하 포함)', m2(r.total)], ['분양 전용면적 합', m2(r.net)],
      ['종후자산(분양 총액)', won(r.after)], ['공사비', won(r.build)], ['기타 사업비', won(r.other)], ['총사업비', won(r.cost)],
      ['종전자산에 돌아갈 몫(종후 − 사업비)', won(r.profit)], ['종전자산 총액', won(r.before)], ['추정 비례율', pct(r.ratio)]];
    const sens = r.sens.map(s => `<tr><td>분양가 ${s.pct > 0 ? '+' : ''}${s.pct}%</td><td class="num">${won(s.profit)}</td><td class="num">${pct(s.ratio)}</td></tr>`).join('');
    return `<table class="kv"><tbody>${rows.map(([a, b]) => `<tr><th scope="row">${a}</th><td class="num">${b}</td></tr>`).join('')}</tbody></table>`
      + `<h3>분양가가 달라지면</h3><table class="grid"><thead><tr><th scope="col">경우</th><th scope="col">종전자산 몫</th><th scope="col">비례율</th></tr></thead><tbody>${sens}</tbody></table>`;
  }

  function init() {
    const form = document.getElementById('bizForm'), out = document.getElementById('bizOut'), note = document.getElementById('bizPriceNote');
    const read = () => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, form.elements[k].value]));
    const draw = () => { out.innerHTML = resultHTML(feasibility(read())); };
    for (const [k, v] of Object.entries(DEFAULTS)) form.elements[k].value = v;
    form.addEventListener('input', draw);
    form.addEventListener('submit', e => { e.preventDefault(); draw(); });
    draw();
    const code7 = new URLSearchParams(location.search).get('dong');
    if (!code7 || !/^\d{8}$/.test(code7)) return;
    fetch('data/national/scores.json').then(r => r.json()).then(s => {
      const d = s.dongs[code7], p = d && d.price;
      if (!p || p.apt_m2_median === null || p.apt_m2_median === undefined) { note.textContent = `${d ? d.name : code7}: 시·군·구 아파트 실거래 ㎡당 중위가가 없어 가정값을 그대로 둡니다.`; return; }
      form.elements.price.value = Math.round(p.apt_m2_median);
      note.textContent = `${d.name}이 속한 시·군·구 아파트 매매 실거래 ㎡당 중위가 ${p.apt_m2_median.toLocaleString('ko-KR')}만원(${p.apt_ref}, 전용면적 기준${p.apt_pooled ? ', 시 전체' : ''})을 분양가 기본값으로 넣었습니다. 새 아파트 분양가는 보통 이보다 높거나 낮을 수 있습니다.`;
      draw();
    }).catch(() => { note.textContent = '실거래 자료를 불러오지 못해 가정값을 그대로 둡니다.'; });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return { DEFAULTS, feasibility, resultHTML };
});
