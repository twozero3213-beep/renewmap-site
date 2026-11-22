/* 예산 우선 검토(2026-11-22 밤, 대표 지시: 남은 예산을 가장 시급한 곳에 쓰도록 한눈에).
   data/national/budget.json(scripts/export_budget.py)을 받아, 고른 시·군·구의 읍·면·동을 '켜진 시급 신호 수 × 주민 수'로 그린다.
   - 순서: 켜진 신호 수가 많은 곳 → 같으면 주민이 많은 곳. 신호가 하나도 없는 곳은 주민이 많아도 뒤로 간다.
   - 주민 수는 예산이 닿는 사람 수(주민등록 인구)로만 쓴다. 선거·정당 자료는 쓰지 않는다.
   - 신호는 켜짐(채운 칸)·꺼짐(빈 고리)·자료 없음(점선 칸) 세 가지. 색으로 동네를 칠하지 않고 신호 모양으로만 보인다.
   util.js 다음에 싣는다. 외부 요청 없음. 막대·점 위치는 SVG 속성(CSP: 인라인 style 금지). */
(function (root) {
  'use strict';
  const { esc, isNum } = (typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil) || {};
  const n = v => Number(v).toLocaleString('ko-KR');
  const THEMES = [
    { id: 'all', label: '전체 신호', ids: null },
    { id: 'renew', label: '노후·재개발(쇠퇴 세 기준)', ids: ['old', 'pop', 'biz'] },
    { id: 'care', label: '고령·돌봄', ids: ['aged', 'walk', 'er'] },
    { id: 'base', label: '생활 기반(공원·응급·보행)', ids: ['park', 'er', 'walk'] },
  ];
  // 신호 그림(선 그림)
  const ICON = {
    old: 'M4 21V6l8-3 8 3v15M9 21v-4h6v4',
    pop: 'M8 7a3 3 0 1 0 0 .01M4 20c0-3 2-5 4-5s4 2 4 5M16 10v8M13 15l3 3 3-3',
    biz: 'M4 9l1-5h14l1 5M5 9v11h14V9M9 20v-6h6v6',
    aged: 'M12 5a2 2 0 1 0 0 .01M12 8v6l-3 6M12 14l3 6M9 10h6M17 11v9',
    park: 'M12 3l5 8h-3l4 6H6l4-6H7zM12 17v4',
    er: 'M4 7h16v12H4zM12 10v6M9 13h6',
    walk: 'M13 4a2 2 0 1 0 0 .01M10 21l2-7 3 3v4M8 11l3-3 3 2 3 1',
  };
  const svg = (d, cls) => `<svg class="${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

  function valid(d) {
    return !!d && Array.isArray(d.signals) && d.signals.length > 0 && Array.isArray(d.sgg) && Array.isArray(d.dongs) && Array.isArray(d.sido);
  }

  // 주제에 든 신호의 자리(0~6)
  function picks(d, theme) {
    const t = THEMES.find(x => x.id === theme) || THEMES[0];
    return d.signals.map((s, i) => (!t.ids || t.ids.includes(s.id) ? i : -1)).filter(i => i >= 0);
  }

  // 고른 시·군·구의 동: {code7, name, pop, on:[1|0|null…](주제 신호만), count, vals}
  // 순서: 켜진 수 많은 곳 → 주민 많은 곳 → 이름(같은 값이 섞여도 늘 같은 순서)
  function rows(d, code5, theme) {
    const si = d.sgg.findIndex(g => g.code5 === code5);
    if (si < 0) return [];
    const at = picks(d, theme);
    return d.dongs.filter(x => x[2] === si).map(x => {
      const on = at.map(i => x[4][i]);
      return { code7: x[0], name: x[1], pop: x[3], on, count: on.filter(v => v === 1).length, vals: at.map(i => x[5][i]) };
    }).sort((a, b) => b.count - a.count || (b.pop || 0) - (a.pop || 0) || a.name.localeCompare(b.name, 'ko'));
  }

  // 산점도: 가로 주민 수, 세로 켜진 신호 수. 같은 줄의 점은 동 순서로 위아래를 조금씩 벌린다(겹침 줄이기)
  // w: 그림이 들어갈 실제 너비(px). viewBox를 그 너비로 잡아 휴대폰에서도 글자가 12px로 보이게 한다
  function scatter(list, maxSig, w) {
    const W = Math.max(300, Math.min(1000, Math.round(w || 640))), H = W < 480 ? 260 : 300, L = 36, R = 12, T = 30, B = 40;
    const pops = list.map(r => r.pop).filter(isNum);
    const maxPop = Math.max(1, ...pops);
    const x = p => L + (W - L - R) * (p / maxPop);
    const y = c => T + (H - T - B) * (1 - c / Math.max(1, maxSig));
    const midX = x(maxPop / 2), midY = y(maxSig / 2);
    const dots = list.filter(r => isNum(r.pop)).map((r, i) => {
      const jy = ((i % 5) - 2) * 3;
      return `<circle class="bd-dot${r.count === 0 ? ' is-none' : ''}" cx="${x(r.pop).toFixed(1)}" cy="${(y(r.count) + jy).toFixed(1)}" r="6"><title>${esc(r.name)} · 주민 ${n(r.pop)}명 · 신호 ${r.count}개</title></circle>`;
    }).join('');
    // 이름표는 먼저 볼 곳 셋까지. 앞 이름표와 겹치면 건너뛴다(휴대폰에서 '재송2동우2동'처럼 붙었다)
    const boxes = [];
    const top = list.filter(r => isNum(r.pop) && r.count > 0).slice(0, 3).map(r => {
      const wd = r.name.length * 12 + 6, right = x(r.pop) > W - 120;
      const x0 = right ? Math.min(x(r.pop) + 9, W - R - 4) - wd : Math.min(x(r.pop) + 9, W - R - 4), y0 = y(r.count) - 21;
      if (boxes.some(b => x0 < b[0] + b[2] && b[0] < x0 + wd && y0 < b[1] + 14 && b[1] < y0 + 14)) return '';
      boxes.push([x0, y0, wd]);
      return `<text class="bd-lab" x="${Math.min(x(r.pop) + 9, W - R - 4).toFixed(1)}" y="${(y(r.count) - 9).toFixed(1)}" text-anchor="${right ? 'end' : 'start'}">${esc(r.name)}</text>`;
    }).join('');
    const ticksY = Array.from({ length: maxSig + 1 }, (_, c) => `<text class="bd-ax" x="${L - 8}" y="${(y(c) + 4).toFixed(1)}" text-anchor="end">${c}</text>`
      + `<line class="bd-grid" x1="${L}" x2="${W - R}" y1="${y(c).toFixed(1)}" y2="${y(c).toFixed(1)}"/>`).join('');
    return `<svg class="bd-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="읍·면·동 ${list.length}곳을 주민 수와 켜진 신호 수로 놓은 그림. 오른쪽 위일수록 주민이 많고 신호가 많습니다. 아래 목록과 같은 내용입니다.">`
      + `<rect class="bd-hot" x="${midX.toFixed(1)}" y="${T}" width="${(W - R - midX).toFixed(1)}" height="${(midY - T).toFixed(1)}"/>`
      + `<text class="bd-hot-t" x="${(W - R - 6).toFixed(1)}" y="${T + 16}" text-anchor="end">${W < 480 ? '먼저 볼 곳' : '먼저 볼 곳 · 주민 많고 신호 많음'}</text>`
      + ticksY
      + `<line class="bd-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`
      + `<line class="bd-grid" x1="${midX.toFixed(1)}" x2="${midX.toFixed(1)}" y1="${T}" y2="${H - B}"/>`
      + `<text class="bd-ax" x="${L}" y="${H - B + 18}">0명</text><text class="bd-ax" x="${midX.toFixed(1)}" y="${H - B + 18}" text-anchor="middle">${n(Math.round(maxPop / 2))}명</text><text class="bd-ax" x="${W - R}" y="${H - B + 18}" text-anchor="end">${n(maxPop)}명</text>`
      + `<text class="bd-ax-t" x="${((L + W - R) / 2).toFixed(0)}" y="${H - 6}" text-anchor="middle">주민 수 →</text>`
      + `<text class="bd-ax-t" x="4" y="14">↑ 켜진 신호 수</text>`
      + dots + top + '</svg>';
  }

  // 신호 칸: 켜짐 = 채운 칸 안 그림, 꺼짐 = 작은 빈 고리, 자료 없음 = 점선 칸. 색이 아니라 모양으로 갈린다
  const chip = (v, s, named) => {
    const pre = named ? `${esc(s.label)} ` : '';
    return v === 1 ? `<span class="bd-c is-on" role="img" aria-label="${pre}해당">${svg(ICON[s.id], 'bd-c-i')}</span>`
      : v === 0 ? `<span class="bd-c is-off" role="img" aria-label="${pre}해당 없음"></span>`
      : `<span class="bd-c is-na" role="img" aria-label="${pre}자료 없음"></span>`;
  };
  // 가로 막대(SVG 속성으로 길이: CSP 인라인 style 금지)
  const meter = (v, max) => `<svg class="bd-m" aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none"><rect class="bd-m-bg" width="100" height="8"/><rect class="bd-m-v" width="${max > 0 && v > 0 ? Math.max(3, Math.round(v / max * 100)) : 0}" height="8"/></svg>`;

  // 신호 띠: 신호마다 이 시·군·구 읍·면·동 가운데 켜진 곳 수. 동네를 줄 세우지 않고 신호별로 세기만 한다
  function strip(d, list, theme) {
    const at = picks(d, theme);
    return `<ul class="bd-strip" aria-label="신호별로 켜진 읍·면·동 수(전체 ${list.length}곳)">` + at.map((i, k) => {
      const s = d.signals[i], on = list.filter(r => r.on[k] === 1).length;
      return `<li>${svg(ICON[s.id], 'bd-ico')}<span class="bd-st-l">${esc(s.label)}</span><b class="bd-st-n">${on}<small>/${list.length}곳</small></b>${meter(on, list.length)}</li>`;
    }).join('') + '</ul>';
  }

  // 먼저 볼 곳: 신호가 켜진 곳 앞 셋을 카드로(이름·켜진 수·신호 일곱 칸·주민 막대)
  function firsts(d, list, code5, theme) {
    const at = picks(d, theme), top = list.filter(r => r.count > 0).slice(0, 3);
    if (!top.length) return '';
    const maxPop = Math.max(1, ...list.map(r => r.pop).filter(isNum));
    return '<ol class="bd-first" aria-label="먼저 볼 곳">' + top.map(r => `<li><a class="bd-f-a" href="explore.html#map/${esc(code5.slice(0, 2))}/${esc(code5)}/${esc(r.code7)}">${esc(r.name)}</a>`
      + `<b class="bd-f-c" role="img" aria-label="신호 ${at.length}개 중 ${r.count}개">${r.count}<small>/${at.length}</small></b>`
      + `<span class="bd-f-s">${r.on.map((v, k) => chip(v, d.signals[at[k]], true)).join('')}</span>`
      + `<span class="bd-f-p">${meter(r.pop, maxPop)}<span>주민 ${isNum(r.pop) ? `${n(r.pop)}명` : '자료 없음'}</span></span></li>`).join('') + '</ol>';
  }

  // 출처·기준일 한 줄(숫자 곁에 늘 둔다)
  function srcLine(d) {
    const b = (d.sources || []).map(s => String(s.base)).sort();
    return `<p class="bd-src-l">공공데이터 ${b.length}종 · 기준 ${esc(b[0] || '')}${b.length > 1 ? `~${esc(b[b.length - 1])}` : ''} </p>`;
  }

  // 신호 표: 동 × 신호 칸(그림·빈 고리·점선) + 주민 수 막대 + 그 동 지도 링크
  // narrow: 휴대폰 너비면 주민 수를 만 단위로 줄여 신호 열이 한 화면에 들게
  function table(d, list, code5, theme, from, to, narrow) {
    const people = p => (narrow && p >= 10000 ? `${(Math.round(p / 1000) / 10).toLocaleString('ko-KR')}만` : n(p));
    const at = picks(d, theme), maxPop = Math.max(1, ...list.map(r => r.pop).filter(isNum));
    // 휴대폰에서는 신호 이름을 그림만 남기고 글은 화면낭독기용으로 둔다(열 일곱이 한 화면에 들게)
    const headPop = narrow ? '' : '<th scope="col">주민 수</th>';
    const head = at.map(i => `<th scope="col" aria-label="${esc(d.signals[i].label)}"><span class="bd-th" aria-hidden="true">${svg(ICON[d.signals[i].id], 'bd-ico')}<span class="bd-th-t">${esc(d.signals[i].label)}</span></span></th>`).join('');
    const body = list.slice(from, to).map((r, k) => {
      const w = isNum(r.pop) ? Math.max(2, Math.round(r.pop / maxPop * 100)) : 0;
      const pop = isNum(r.pop) ? `${people(r.pop)}명` : '자료 없음';
      return `<tr><th scope="row"><span class="bd-no">${from + k + 1}</span><a href="explore.html#map/${esc(code5.slice(0, 2))}/${esc(code5)}/${esc(r.code7)}">${esc(r.name)}</a>${narrow ? `<small class="bd-pop-s">${pop}</small>` : ''}</th>`
        + (narrow ? '' : `<td class="bd-pop"><span class="bd-bar" aria-hidden="true"><i data-w="${w}"></i></span>${pop}</td>`)
        + `<td class="bd-cnt">${r.count}</td>${r.on.map((v, j) => `<td>${chip(v, d.signals[at[j]])}</td>`).join('')}</tr>`;
    }).join('');
    return `<table class="bd-table" aria-label="읍·면·동별 켜진 신호와 주민 수"><thead><tr><th scope="col">${narrow ? '읍·면·동 · 주민' : '읍·면·동'}</th>${headPop}<th scope="col">${narrow ? '신호' : '신호 수'}</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // 시·군·구 칸: 주민 합계·동 수·생활 범죄·정비사업·인구감소지역
  function context(d, code5) {
    const g = d.sgg.find(x => x.code5 === code5);
    if (!g) return '';
    const list = d.dongs.filter(x => d.sgg[x[2]] === g);
    const pop = list.reduce((a, x) => a + (isNum(x[3]) ? x[3] : 0), 0);
    const crimes = d.sgg.map(x => x.crime_per_1k).filter(isNum).sort((a, b) => a - b);
    const med = crimes.length ? crimes[Math.floor(crimes.length / 2)] : null;
    const card = (k, v, s) => `<li><span class="bd-k">${k}</span><b class="bd-v">${v}</b><span class="bd-s">${s}</span></li>`;
    return '<ul class="bd-ctx">'
      + card('주민 수', `${n(pop)}명`, `읍·면·동 ${list.length}곳`)
      + card('생활 범죄', isNum(g.crime_per_1k) ? `천 명당 ${g.crime_per_1k}건` : '자료 없음', isNum(med) ? `전국 시·군·구 가운데값 ${med}건` : '')
      + card('정비사업 구역', isNum(g.redev_zones) ? `${n(g.redev_zones)}곳` : '자료 없음', '')
      + card('인구감소지역', g.depop ? esc(g.depop) : '지정 없음', '행정안전부 고시')
      + '</ul>';
  }

  function legend(d, theme) {
    return '<ul class="bd-legend">' + picks(d, theme).map(i => {
      const s = d.signals[i];
      return `<li>${svg(ICON[s.id], 'bd-ico')}<b>${esc(s.label)}</b><span>${esc(s.rule)}</span><small>${esc(s.status)} · ${esc(s.basis)}</small></li>`;
    }).join('') + '</ul>';
  }

  function render(d, code5, theme, w) {
    if (!valid(d)) return '';
    const g = d.sgg.find(x => x.code5 === code5);
    if (!g) return '';
    const list = rows(d, code5, theme), maxSig = picks(d, theme).length;
    const sido = (d.sido.find(s => s.code2 === g.sido) || {}).name || '';
    const first = firsts(d, list, code5, theme);
    // 먼저 볼 곳 이름은 제목 대신 카드로 보인다(글 줄이기)
    return `<h2 class="bd-h">${esc(sido)} ${esc(g.name)}</h2>`
      + context(d, code5)
      + strip(d, list, theme) + srcLine(d)
      + (first ? `<h3 class="bd-sub">먼저 볼 곳</h3>${first}` : '')
      + `<figure class="bd-fig">${scatter(list, maxSig, w)}<figcaption>점 하나 = 읍·면·동 · 빈 점 = 신호 없음</figcaption></figure>`
      + `<div class="bd-wrap">${table(d, list, code5, theme, 0, 10, w < 480)}</div>`
      + (list.length > 10 ? `<details class="bd-more"><summary>나머지 ${list.length - 10}곳 보기</summary><div class="bd-wrap">${table(d, list, code5, theme, 10, list.length, w < 480)}</div></details>` : '')
      + `<details class="bd-rules"><summary>신호 기준과 출처</summary>${legend(d, theme)}<ul class="bd-src">${(d.sources || []).map(s => `<li>${esc(s.for)}: ${esc(s.name)} · ${esc(s.base)}</li>`).join('')}</ul></details>`;
  }

  const api = { THEMES, valid, picks, rows, scatter, table, context, strip, firsts, render };
  if (typeof module === 'object' && module.exports) module.exports = api;

  // 브라우저 연결부
  if (!root || !root.document || !esc) return;
  const doc = root.document;
  function start() {
    const box = doc.querySelector('[data-budget]');
    if (!box) return;
    const body = box.querySelector('#bdBody'), sido = box.querySelector('#bdSido'), sgg = box.querySelector('#bdSgg'), theme = box.querySelector('#bdTheme');
    const say = box.querySelector('#bdSay'), print = box.querySelector('#bdPrint');
    const fail = () => { body.innerHTML = '<p class="bd-wait">자료를 불러오지 못했습니다. 같은 지표는 우리 동네 지도에서 봅니다.</p>'; };
    root.RenewUtil.fetchJson('data/national/budget.json').then(d => {
      if (!valid(d)) return fail();
      const q = new URLSearchParams(root.location.search);
      const opt = (el, list) => { el.textContent = ''; for (const [v, t] of list) { const o = doc.createElement('option'); o.value = v; o.textContent = t; el.appendChild(o); } };
      opt(theme, THEMES.map(t => [t.id, t.label]));
      opt(sido, d.sido.map(s => [s.code2, s.name]));
      const want = d.sgg.some(g => g.code5 === q.get('sgg')) ? q.get('sgg') : '21090';
      const fillSgg = (code2, pick) => {
        const list = d.sgg.filter(g => g.sido === code2);
        opt(sgg, list.map(g => [g.code5, g.name]));
        sgg.value = list.some(g => g.code5 === pick) ? pick : (list[0] || {}).code5;
      };
      sido.value = want.slice(0, 2);
      fillSgg(sido.value, want);
      theme.value = THEMES.some(t => t.id === q.get('theme')) ? q.get('theme') : 'all';
      const draw = (announce) => {
        const h = render(d, sgg.value, theme.value, body.clientWidth - 26);   // 그림 칸 안쪽 여백(12px×2+테두리)
        if (!h) return fail();
        body.innerHTML = h;
        for (const i of body.querySelectorAll('.bd-bar i[data-w]')) i.style.width = i.getAttribute('data-w') + '%';
        box.classList.add('is-ready');
        try { root.history.replaceState(null, '', `?sgg=${sgg.value}&theme=${theme.value}`); } catch (e) { /* 파일로 열면 주소를 못 바꾼다 */ }
        if (announce && say) say.textContent = `${sgg.options[sgg.selectedIndex].textContent} · ${theme.options[theme.selectedIndex].textContent}로 바꿨습니다`;
      };
      for (const el of [sido, sgg, theme]) el.disabled = false;
      sido.addEventListener('change', () => { fillSgg(sido.value, ''); draw(true); });
      sgg.addEventListener('change', () => draw(true));
      theme.addEventListener('change', () => draw(true));
      draw(false);
      // 휴대폰을 돌리거나 창 크기가 크게 바뀌면 다시 그린다(그림 글자 크기·만 단위 표기가 너비를 따른다)
      let lastW = body.clientWidth, wait = 0;
      root.addEventListener('resize', () => {
        clearTimeout(wait);
        wait = setTimeout(() => { if (Math.abs(body.clientWidth - lastW) > 80) { lastW = body.clientWidth; draw(false); } }, 200);
      });
      if (print) {
        print.hidden = false;
        print.addEventListener('click', () => {
          box.setAttribute('data-print', `리뉴맵 예산 우선 검토 · ${sgg.options[sgg.selectedIndex].textContent} · ${theme.options[theme.selectedIndex].textContent} · ${new Date().toLocaleDateString('sv-SE')} 출력`);
          root.print();
        });
      }
    }).catch(fail);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : this);
