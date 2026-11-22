/* 한눈 띠(09 총괄 설계 4절): [data-glance="national"]에 전국 숫자와 시·도 17칸 격자를 그린다.
   숫자는 data/national/glance.json(scripts/export_glance.py가 원장에서 센 값)에서만 온다. 값이 없거나 못 받으면 그리지 않고
   section 안에 적어 둔 글(스크립트 없을 때의 문장)을 그대로 둔다. util.js 다음에 싣는다. 외부 요청 없음. */
(function (root) {
  'use strict';
  // util.js를 싣지 않은 쪽에서 오류를 내지 않게 비워 두고, 아래 브라우저 연결부가 RenewUtil이 없으면 그리지 않는다
  const { esc, isNum, sidoShort } = (typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil) || {};
  // 시·도 칸 배치: 북→남(줄), 서→동(칸)을 어림한 4칸 격자. 값으로 줄 세우지 않는다(08a)
  const LAYOUT = [['23', '11', '31', '32'], ['34', '29', '33', '37'], ['35', '25', '22', '26'], ['24', '36', '38', '21'], ['39']];
  // r27: 2,409곳은 '세 기준 중 2가지 이상'이지 인구 감소 수가 아니다(독립 점검). 제목은 카드 숫자 그대로 말한다
  const TITLE = '전국 동네 3곳 중 2곳이 쇠퇴 기준 2가지 이상이고, 5곳 중 4곳은 건물 절반이 20년을 넘었습니다';
  const MET_IND = 'DECLINE_MET_COUNT';   // map.js INDICATORS의 '기준을 넘은 수(확실한 것만)'
  const AGING_IND = 'DECLINE_AGING_20Y_PCT';   // map.js INDICATORS의 '20년 이상 건축물 비율'(기준선 50%)
  const n = v => v.toLocaleString('ko-KR');
  const pct = (a, b) => Math.round(a / b * 1000) / 10;
  const bar = (w, note) => `<span class="rm-glance-bar${note ? ' is-note' : ''}" aria-hidden="true"><i data-w="${w}"></i></span>`;
  const place = code => { for (let r = 0; r < LAYOUT.length; r++) { const c = LAYOUT[r].indexOf(code); if (c >= 0) return [r + 1, c + 1]; } return null; };

  function valid(d) {
    return !!d && isNum(d.dongs) && d.dongs > 0 && ['met2', 'aging50', 'pop30_check', 'biz_check', 'pickable', 'base_year'].every(k => isNum(d[k]))
      && Array.isArray(d.sido) && d.sido.length > 0 && d.sido.every(s => s && isNum(s.dongs) && s.dongs > 0 && isNum(s.met2));
  }

  function render(d) {
    if (!valid(d)) return '';
    const bizAll = d.biz_check === d.dongs;
    const cells = d.sido.map(s => ({ s, at: place(String(s.code2)) }))
      .sort((a, b) => (a.at ? a.at[0] * 10 + a.at[1] : 99) - (b.at ? b.at[0] * 10 + b.at[1] : 99))   // 격자 순서(읽는 순서 = 보이는 순서)
      // r23(13 M5·3절 결론): 홈 첫 화면 조작 요소 17개 중 8개가 이 칸이었다 → 칸은 막대만, 지도는 띠 아래 링크 하나('시·도별 동 보기')로 연다
      .map(({ s, at }) => `<li${at ? ` data-r="${at[0]}" data-c="${at[1]}"` : ''} data-sido="${esc(s.code2)}"><b>${esc(sidoShort(s.name))}</b>`
        + `<span>${n(s.met2)}/${n(s.dongs)}</span>${bar(pct(s.met2, s.dongs))}</li>`).join('');
    const gap = d.dongs - d.pickable;
    // r27(독립 점검): 카드 숫자의 출처 기관을 펼치지 않아도 보이게. 이름 첫 낱말(기관)만, 같은 기관은 한 번
    const orgs = (d.sources || []).map(s => (String(s.name).match(/^[^\s(]+/) || [''])[0]).filter((o, i, a) => o && a.indexOf(o) === i);
    const src = (d.sources || []).map(s => `<li>${esc(s.name)} · ${esc(s.base_year)}년 자료 · ${s.retrieved_at ? '조회 ' + esc(s.retrieved_at) : '조회일 기록 없음'}</li>`).join('');
    // r24(14 토스증권 REA): 지수 카드처럼 '이름 · 큰 숫자 · 분모 · 막대 · 왜?' 한 덩어리를 카드 셋으로. 카드 하나 = 링크 하나.
    // 주의 숫자(인구 30년 비교 끊김·사업체 추가확인)는 아래 '이 숫자는 어디서 왔나요?'에 그대로 둔다
    const card = (href, k, big, of, w, why) => `<li><a class="rm-kpi" href="${href}"><span class="rm-kpi-k">${k}</span>`
      + `<span class="rm-kpi-n"><b>${big}</b> / ${of}</span>${bar(w)}${why ? `<span class="rm-kpi-why"><b>왜 2가지?</b> ${why}</span>` : ''}</a></li>`;
    return `<h2>${TITLE}</h2>`
      + '<ul class="rm-kpis" tabindex="0" aria-label="전국 동네 숫자 카드">'
      + card(`explore.html?ind=${MET_IND}#map`, '쇠퇴 세 기준 중 2가지 이상 넘은 동', `${n(d.met2)}곳`, `${n(d.dongs)}곳`, pct(d.met2, d.dongs),
        '도시재생 지역 지정 조건이 세 기준 중 2가지 이상이라 그 수를 셉니다.')
      + card(`explore.html?ind=${AGING_IND}#map`, '20년 넘은 건물이 절반 이상인 동', `${n(d.aging50)}곳`, `${n(d.dongs)}곳`, pct(d.aging50, d.dongs), '')
      // r24b: 이 카드는 첫 카드(대상지 근거표)와 같은 곳이라 링크를 달지 않는다(09 8절 첫 화면 조작 요소 12개)
      + '<li><div class="rm-kpi is-cover"><span class="rm-kpi-k">건물별 계산이 되는 곳 · 부산</span><span class="rm-kpi-n"><b>254개 법정동</b></span>'
      + '<img src="img/v8/home-coverage.svg" width="300" height="318" alt="대한민국 시·도 지도에서 부산광역시만 색칠한 그림" loading="lazy"></div></li></ul>'
      + `<p class="rm-glance-tail">참고용 계산 · 확실한 것만 센 수(${bizAll ? '사업체 기준은' : '추가확인인 기준은'} 세지 않음) · 도시재생 지역 지정 판단이 아닙니다 · ${orgs.length ? `출처 ${orgs.map(esc).join('·')} · ` : ''}${d.base_year}년 자료</p>`
      + '<details class="rm-glance-sido"><summary>시·도별로 보기</summary>'
      // 13 H2: 넘은 곳은 지도와 같다. 전체는 값 없는 셀(경계 시점 차이)도 세어(export_glance.py) 지도 '값 있는 동'보다 많은 시·도가 있다(2025년 서울·인천·경기·전북 1~4곳)
      + '<p class="rm-glance-legend">막대 길이는 기준을 함께 넘은 읍·면·동의 비율입니다. 시·도의 동은 아래 \'시·도별 동 보기\'에서 같은 셈(기준을 넘은 수)으로 봅니다. '
      + '칸의 전체에는 경계 시점 차이로 값을 못 낸 동도 들어 있어, 지도의 \'값 있는 동\'보다 몇 곳 많을 수 있습니다.</p>'
      + `<ol class="rm-glance-grid">${cells}</ol></details>`
      // 13 H2: 칸 숫자와 같은 셈(세 기준 중 넘은 수, 확실한 것만)을 고른 지도로 연다. 첫 지표(20년 이상 건축물)로 열면 다른 숫자가 나왔다
      + `<p class="rm-glance-more"><a href="explore.html?ind=${MET_IND}#map">시·도별 동 보기</a></p>`
      + '<details class="rm-glance-src"><summary>이 숫자는 어디서 왔나요?</summary>'
      + '<p>법 제13조제4항은 도시재생활성화지역을 지정할 때 세 가지 기준(인구·사업체·오래된 건물) 가운데 2개 이상을 갖추라고 정합니다. '
      + '리뉴맵은 읍·면·동마다 그 기준값을 셌을 뿐 지정 여부를 판단하지 않습니다. '
      + `사업체 기준은 2020년 통계 방식이 바뀌어 ${bizAll ? '전국 모두' : n(d.biz_check) + '곳이'} 추가확인입니다. `
      + `인구 30년 비교가 끊긴 ${n(d.pop30_check)}곳은 5년 연속 감소 기준으로만 셌습니다.</p>`
      + `<p>분모는 값이 있는 읍·면·동 ${n(d.dongs)}곳입니다. 지도·검색에서 고를 수 있는 동은 ${isNum(d.boundary_year) ? d.boundary_year + '년 ' : ''}경계 기준 ${n(d.pickable)}곳${gap ? `(분할·신설 시점 차이 ${n(Math.abs(gap))}곳)` : ''}입니다.</p>`
      + (src ? `<ul>${src}</ul>` : '')
      + `<p>계산 규칙 상태: 조문 숫자 대조 전 · 계산 방법과 해석은 정하지 못함 · 참고용 계산${d.rule_version ? ` · 규칙 판 ${esc(d.rule_version)}` : ''}${d.snapshot_hash ? ` · 자료 지문 ${esc(String(d.snapshot_hash).slice(0, 12))}` : ''}</p></details>`;
  }

  if (typeof module === 'object' && module.exports) { module.exports = { render, LAYOUT, TITLE }; return; }
  const el = root.document && root.document.querySelector('[data-glance="national"]');
  if (!el || !root.RenewUtil) return;
  root.RenewUtil.fetchJson('data/national/glance.json').then(d => {
    const html = render(d);
    if (!html) { el.classList.add('rm-glance-off'); return; }
    el.innerHTML = html;
    // CSP style-src 'self'라 style 속성 대신 CSSOM으로 넣는다
    el.querySelectorAll('[data-w]').forEach(i => { i.style.width = i.dataset.w + '%'; });
    el.querySelectorAll('[data-r]').forEach(li => { li.style.gridRow = li.dataset.r; li.style.gridColumn = li.dataset.c; });
  });
})(typeof window !== 'undefined' ? window : globalThis);
