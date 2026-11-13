/* 동네 점수·순위(D24, 2026-11-07). data/national/scores.json(export_scores.py)을 읽어 고른 범위·점수로 줄 세운다.
   점수 계산은 서버 스크립트가 한 번만 한다. 화면은 정렬·거르기만 한다(같은 순위가 문서와 화면에서 달라지지 않게) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewRank = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const { esc, dongHit, sidoShort, josa } = typeof module !== 'undefined' && module.exports ? require('./util.js') : window.RenewUtil;
  const KINDS = {
    total: { label: '동네 점수', get: d => d.total },
    safety: { label: '치안 점수', get: d => d.sub.safety },
    living: { label: '생활 편의', get: d => d.sub.living },
    vitality: { label: '인구 활력', get: d => d.sub.vitality },
    housing: { label: '주거 노후도(점수가 낮을수록 낡음)', get: d => d.sub.housing },
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

  // 재생 필요 점수의 재료(scores.json renewal_parts, 지표별 백분위). 재생 순위에서는 이 넷을 세부 열로 보인다(v9: 1위인 이유가 표에 없었다)
  const RENEWAL_COLS = [['DECLINE_AGING_20Y_PCT', '20년 넘은 건물'], ['DECLINE_POP_CHANGE_PCT', '인구 변화율(원천, 기간 미확인)'], ['DECLINE_BIZ_DROP10Y_PCT', '사업체 감소'], ['POP_AGED65_PCT', '고령 인구']];
  // rankAt(i): 화면 i번째 줄의 실제 순위(낮은 점수부터 볼 때). 없으면 offset + i + 1
  function tableHTML(list, kind, names, limit, range, scope, offset = 0, found = null, rankAt = null) {
    const renew = kind === 'renewal' && list.some(r => r.d.renewal_parts);
    // R1 8: 표 머리는 두 줄 이하. 단위·읽는 법은 열 제목마다 적지 않고 표 제목(caption)에 한 번
    // R3 7: 고른 점수 종류가 세부 열과 같으면(주거 노후도·생활 편의 등) 그 열은 뺀다. 같은 숫자가 한 줄에 두 번 나왔다
    const SUB = [['living', '생활 편의'], ['vitality', '인구 활력'], ['housing', '주거 노후도'], ['safety', '치안']].filter(([k]) => k !== kind);
    const cols = renew ? RENEWAL_COLS.map(([, l]) => `<th scope="col">${esc(l)}</th>`).join('')
      : SUB.map(([, l]) => `<th scope="col">${l}</th>`).join('') + '<th scope="col">범죄 발생률</th>';
    const unit = renew ? '세부 열은 전국 백분위이고 클수록 쇠퇴 신호가 강합니다.' : '주거 노후도는 점수가 낮을수록 낡았고, 범죄 발생률은 시·군·구 값(주민 1,000명당)입니다.';
    const head = `<thead><tr><th scope="col">순위</th><th scope="col">행정동</th><th scope="col">${esc(KINDS[kind].label.replace(/\(.*\)$/, ''))}</th><th scope="col">비중을 바꿔도 나오는 순위</th>${cols}</tr></thead>`;
    const body = list.slice(0, limit).map((r, i) => {
      const s = r.d.sub, sp = r.d.safety_parts || {}, rp = r.d.renewal_parts || {};
      return `<tr${r.code7 === found ? ' class="is-found" id="rankFoundRow"' : ''}><td class="num">${rankAt ? rankAt(offset + i) : offset + i + 1}</td><td><a href="dong/${esc(r.code7)}.html">${esc(names(r))}</a></td><td class="num"><b>${fmt(r.score)}</b></td><td class="num nw">${esc(rangeText(range, r.code7, kind, scope || 'all'))}</td>`
        + (renew ? RENEWAL_COLS.map(([c]) => `<td class="num">${fmt(rp[c])}</td>`).join('')
          : SUB.map(([k]) => `<td class="num">${fmt(s[k])}</td>`).join('')
          + `<td class="num">${sp.crime_rate_per_1k === null || sp.crime_rate_per_1k === undefined ? '없음' : esc(sp.crime_rate_per_1k)}</td>`) + '</tr>';
    }).join('');
    return `<table class="grid rank-table"><caption>선택한 범위의 행정동 순위 <small>· '비중을 바꿔도 나오는 순위'는 지표 비중을 바꿔 다시 셈한 순위의 90% 구간입니다. ${unit}</small></caption>${head}<tbody>${body}</tbody></table>`;
  }

  // '우리 동네 몇 위?'(2026-11-13 v8): 줄 세운 목록에서 이름으로 찾는다. 띄어쓰기 무시, 이름이 꼭 같은 동을 먼저, 없으면 이름에 든 첫 동. 없으면 -1
  // region(r): 그 동의 시·군·구 이름들. 법정동 이름('우동')·구를 붙인 말('해운대 우동')도 util.js dongHit로 찾는다(v9 페르소나)
  function findRank(list, names, q, region = () => []) {
    const norm = s => String(s || '').replace(/\s+/g, '');
    const k = norm(q);
    if (!k) return -1;
    const exact = list.findIndex(r => dongHit(q, r.d.name, region(r)) || norm(names(r)) === k);
    return exact >= 0 ? exact : list.findIndex(r => norm(names(r)).includes(k));
  }

  function init() {
    const $ = id => document.getElementById(id);
    const kindSel = $('rankKind'), sidoSel = $('rankSido'), sgSel = $('rankSg'), out = $('rankOut'), msg = $('rankMsg'), sens = $('rankSens');
    const ascBox = $('rankAsc');
    let scores = null, idx = null, range, pager, found = null;
    // 낮은 점수부터 보기(2026-11-14 페르소나: '주거 노후도'는 점수가 낮을수록 낡았는데 1위가 가장 덜 낡은 동이라 위 3곳만 고르면 거꾸로 됐다).
    // 줄 순서만 뒤집고 순위 번호·순위 범위는 높은 점수 기준 그대로 둔다
    const ordered = full => (ascBox && ascBox.checked ? { list: [...full].reverse(), rankAt: j => full.length - j } : { list: full, rankAt: null });   // range: undefined=받는 중, null=없음. found: 찾은 동 코드
    const sgName = code5 => (idx.sigungu.find(s => s.code5 === code5) || {}).name || code5;
    // 전국을 볼 때는 시·도를 앞에 붙인다(같은 '동구'·'서구'가 여러 시·도에 있다)
    const sidoOf = code7 => sidoShort((idx.sido.find(x => x.code2 === String(code7).slice(0, 2)) || {}).name);
    const names = r => `${sidoSel.value ? '' : sidoOf(r.code7) + ' '}${sgName(r.d.code5)} ${r.d.name}`;
    function draw() {
      const scope = sgSel.value || sidoSel.value || 'all';
      const { list, rankAt } = ordered(rows(scores, kindSel.value, scope));
      const page = pager.slice(list), offset = page.length ? list.indexOf(page[0]) : 0, rk = j => (rankAt ? rankAt(j) : j + 1).toLocaleString('ko-KR');
      msg.textContent = page.length ? `점수가 있는 ${list.length.toLocaleString('ko-KR')}개 동 중 ${rk(offset)}–${rk(offset + page.length - 1)}위를 ${rankAt ? '낮은 점수부터 ' : ''}보입니다.` : '선택한 범위에 점수가 있는 동이 없습니다.';
      out.innerHTML = tableHTML(page, kindSel.value, names, page.length, range, scope, offset, found, rankAt);
      // 고른 조건·쪽을 주소에 적는다. 동을 눌렀다 뒤로 오거나 새로 고쳐도 그대로(v9: 늘 '재생 필요·부산·1쪽'으로 돌아갔다)
      if (typeof history !== 'undefined' && history.replaceState && location.href) {   // 시험용 가짜 화면에는 주소가 없다
        const u = new URL(location.href), set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
        u.searchParams.set('kind', kindSel.value); u.searchParams.set('sido', sidoSel.value); set('sg', sgSel.value); set('ord', ascBox ? (ascBox.checked ? 'asc' : kindSel.value === 'housing' ? 'desc' : '') : ''); set('page', pager.page > 1 ? pager.page : '');
        if (u.href !== location.href) history.replaceState(null, '', u);
      }
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
        // 2026-11-13: 재생 서비스라 기본은 '재생 필요 점수', 시범 지역 부산(11-13 평가: 전국 '동네 점수' 1위가 과천이라 방향이 반대로 읽힘). ?sido= 로 전국을 본다
        kindSel.value = Object.hasOwn(KINDS, q.get('kind')) ? q.get('kind') : 'renewal';
        if (ascBox) ascBox.checked = q.get('ord') === 'asc' || (!q.has('ord') && kindSel.value === 'housing');
        sidoSel.value = q.has('sido') ? q.get('sido') : (i.sido.some(x => x.code2 === '21') ? '21' : '');
        fillSg();
        if (q.get('sg')) sgSel.value = q.get('sg');
        kindSel.disabled = sidoSel.disabled = false;   // 자료가 온 뒤에만 고른다(불러오는 중에 고른 값이 기본값으로 덮였다, v9)
        pager = window.RenewListPages.create(out, '동네 순위', draw, Math.max(1, Number(q.get('page')) || 1), 20, { below: true, quiet: true });
        const findForm = $('rankFind'), foundMsg = $('rankFound');   // 찾기 칸이 없는 화면(시험용 가짜 화면 포함)에서도 표는 그린다
        const reset = () => { pager.reset(); found = null; if (foundMsg) foundMsg.textContent = ''; draw(); };
        if (findForm) $('rankNames').innerHTML = Object.values(s.dongs).map(d => `<option value="${esc(d.name)}">`).filter((v, n, a) => a.indexOf(v) === n).join('');
        if (findForm) findForm.addEventListener('submit', e => {
          e.preventDefault();
          const { list, rankAt } = ordered(rows(scores, kindSel.value, sgSel.value || sidoSel.value || 'all')), q = $('rankQ').value, at = findRank(list, names, q, r => [sgName(r.d.code5), (idx.sido.find(x => x.code2 === String(r.code7).slice(0, 2)) || {}).name]);   // '부산 우동'처럼 시·도를 붙여 적어도(교차 검토)
          if (at < 0) { found = null; foundMsg.textContent = `찾지 못했습니다. 동 이름이나 구 이름으로 다시 찾아 보세요. 시·도를 '전국'으로 바꾸면 전국에서 찾습니다.`; draw(); return; }
          found = list[at].code7; pager.goTo(Math.floor(at / 20) + 1); draw();
          // 순위(여러 지표를 합친 점수)와 쇠퇴 3요건 해당 수는 다른 잣대다. 둘이 엇갈려 보여도 모순이 아니라고 같은 자리에서 밝힌다(v9: 홈 '2개 해당'과 '178위'가 모순으로 읽혔다)
          // 2026-11-13 우지예: '점수는 여러 지표를 합친 비교값이라…' 문장이 무슨 뜻인지 어렵다는 지적 → 순위 한 문장, 왜 신청요건과 다른지 한 문장, 어디서 보는지 한 문장으로 풀어 씀
          // 첫 문장만 굵게: CSS ::first-line은 화면의 첫 줄에만 걸려 휴대폰에서 문장 중간에 끊겼다(#87 검토) → <b>와 글 마디로 나눈다
          const nm = names(list[at]), b = document.createElement('b');
          b.textContent = `${nm}${josa(nm)} ${list.length.toLocaleString('ko-KR')}개 동 중 ${(rankAt ? rankAt(at) : at + 1).toLocaleString('ko-KR')}위입니다(${KINDS[kindSel.value].label} ${fmt(list[at].score)}점).`;
          foundMsg.replaceChildren(b, document.createElement('br'), '이 순위는 여러 지표를 합친 점수로 줄 세운 것이라, 공모 신청요건(쇠퇴 3요건)을 몇 개 채우는지와는 다른 기준입니다. 신청요건은 표에서 동 이름을 눌러 확인하세요.');
          const tr = document.getElementById('rankFoundRow'); if (tr) tr.scrollIntoView({ block: 'center' });
        });
        kindSel.onchange = () => { if (ascBox) ascBox.checked = kindSel.value === 'housing'; reset(); };
        sgSel.onchange = reset;
        if (ascBox) ascBox.onchange = reset;
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
  return { KINDS, rows, tableHTML, rangeText, findRank };
});
