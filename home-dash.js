/* 홈 대시보드(2026-11-22 밤, 대표 지시: 동네 5~10년 자료를 한눈에): [data-dash="safety"]에 고른 구·군의 시설 수와 해마다 값 막대를 그린다.
   숫자는 data/home_dashboard.json(scripts/export_home_dashboard.py)에서만 온다. 못 받으면 '불러오지 못했다'고 적고 지도·출처 화면을 알려 준다.
   고른 한 곳의 해마다 값만 그린다. 값으로 구·군을 줄 세우거나 칠하지 않는다. 막대 높이는 data-h로 두고 JS가 style.height로 옮긴다(CSP: 인라인 style 금지).
   util.js 다음에 싣는다. 외부 요청 없음. */
(function (root) {
  'use strict';
  const { esc, isNum } = (typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil) || {};
  const n = v => Number(v).toLocaleString('ko-KR');
  const svg = d => `<svg class="hd-ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  // 시설 수 칸의 그림(선 그림, 일러스트 아님): 무더위는 해, 한파는 눈 결정
  const ICON = {
    cool: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    cold: 'M12 2v20M4.9 7l14.2 10M4.9 17l14.2-10',
    shade: 'M3 12a9 9 0 0 1 18 0zM12 12v8M9 20h6',
    slope: 'M3 20h18M5 20l6-9 4 5 4-7',
    weak: 'M12 3l9 16H3zM12 10v4M12 17h.01',
    care: 'M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z',
  };

  function valid(d) {
    return !!d && Array.isArray(d.areas) && d.areas.length > 0 && d.areas.every(a => a && a.code && a.name)
      && Array.isArray(d.series) && d.series.every(s => s && Array.isArray(s.years) && s.years.length > 0 && s.values && typeof s.values === 'object')
      && Array.isArray(d.kpis) && d.kpis.every(k => k && k.values && typeof k.values === 'object');
  }

  // 막대 높이(%): 가장 큰 값을 100으로. 값이 모두 0이면 0. 0이 아닌 값은 보이게 최소 2
  function heights(vals) {
    const max = Math.max(0, ...vals.filter(isNum));
    return vals.map(v => (!isNum(v) || max === 0 ? 0 : v === 0 ? 0 : Math.max(2, Math.round(v / max * 100))));
  }

  const orgs = list => (list || []).map(x => esc(x.org)).filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');

  function srcLine(s) {
    const base = s.base_date ? ` · 기준일 ${esc(s.base_date)}` : ' · 기준일 준비 중';
    const notes = (s.notes || []).map(t => `<br>${esc(t)}`).join('');
    return `<p class="hd-src">출처: ${orgs(s.sources)}${base}${notes}</p>`;
  }

  // area: 화면 이름(캡처·인쇄해도 어느 곳 자료인지 보이게 제목 앞에 붙인다)
  function chart(s, code, area) {
    const vals = s.values[code];
    if (!Array.isArray(vals) || vals.length !== s.years.length) return '';
    const hs = heights(vals), last = vals.length - 1, many = vals.length > 6;   // 7개부터는 숫자가 겹쳐 비교하는 해·가장 큰 해만
    const peak = vals.indexOf(Math.max(...vals));
    const md = (s.base_date || '').slice(5).split('-').map(Number);   // '2025-09-25' → 9월 25일
    const partial = s.partial_last && md.length === 2 && md.every(Boolean) ? `(${esc(s.years[last])}년은 ${md[0]}월 ${md[1]}일까지)` : '';
    const first = 0, lastFull = s.partial_last && last > 0 ? last - 1 : last;
    const at = i => `${esc(s.years[i])}년 ${n(vals[i])}${esc(s.unit)}`;
    const delta = `${at(first)} → ${at(lastFull)}`;
    // 첫 해와 마지막 해만 보면 가운데 큰 해를 놓친다(예: 재선충 2018년). 가장 큰 해가 비교하는 두 해·맨 끝 해(숫자가 이미 보인다)가 아니면 한 줄 더 적는다
    const peakLine = vals[peak] > 0 && ![first, lastFull, last].includes(peak) ? `가장 많은 해 ${at(peak)}` : '';
    const notes = [peakLine, partial, s.stale ? '기준일이 2년 넘게 지난 자료입니다' : ''].filter(Boolean);
    const isKey = i => i === first || i === lastFull || i === peak || i === last;
    const bars = vals.map((v, i) => {
      const key = isKey(i);
      const showV = !many || key;
      // 연도 글자는 하나 걸러. 단 보이는 해(key) 바로 옆이면 숨긴다('23'24'25가 붙어 한 덩어리로 읽혔다)
      const showY = !many || key || (i % 2 === 0 && !isKey(i - 1) && !isKey(i + 1));
      return `<li${i === last && s.partial_last ? ' class="is-partial"' : ''}><span class="hd-v${showV ? '' : ' is-quiet'}">${n(v)}</span>`
        + `<span class="hd-col"><i data-h="${hs[i]}"></i></span><span class="hd-y${showY ? '' : ' is-quiet'}">’${esc(s.years[i].slice(2))}</span></li>`;
    }).join('');
    const name = `${area ? `${esc(area)} · ` : ''}${esc(s.label)}`;
    const table = `<div class="sr-only"><table><caption>${name}(${esc(s.unit)})</caption><tr><th scope="row">연도</th>${s.years.map(y => `<td>${esc(y)}</td>`).join('')}</tr>`
      + `<tr><th scope="row">값</th>${vals.map(v => `<td>${n(v)}</td>`).join('')}</tr></table></div>`;
    return `<figure class="hd-chart"><figcaption><b>${name}</b><span class="hd-delta">${delta}</span>${notes.map(t => `<span class="hd-note">${t}</span>`).join('')}</figcaption>`
      + `<ol class="hd-bars" aria-hidden="true">${bars}</ol>${table}${srcLine(s)}</figure>`;
  }

  // 해마다 비교할 수 없어 그리지 않은 자료(빈칸 대신 까닭을 적는다)
  function heldList(d) {
    const items = (d.held || []).map(h => `<p><b>${esc(h.label)}</b> (${esc(h.org)}) ${esc(h.why)}</p>`).join('');
    return items ? `<div class="hd-chart hd-held"><b class="hd-held-t">막대로 그리지 않은 자료</b>${items}</div>` : '';
  }

  function kpiList(d, code) {
    const items = d.kpis.map(k => {
      const v = k.values[code];
      // 어느 자료도 다루지 않는 곳(null)은 0이 아니라 준비 중(예: 부산시 쉼터 자료는 거제·양산을 다루지 않는다)
      if (v === null || v === undefined) return `<li>${svg(ICON[k.id] || ICON.weak)}<span class="hd-k">${esc(k.label)}</span><b class="hd-n hd-none">준비 중</b><span class="hd-s">이 지역 자료를 구하는 중</span></li>`;
      if (!isNum(v)) return '';
      // 고른 곳을 다루는 자료의 기관만(부산 전체에 양산시 기관이 뜨지 않게). codes가 없는 옛 파일은 모두 적는다
      const who = orgs((k.sources || []).filter(x => !Array.isArray(x.codes) || x.codes.includes(code)));
      return `<li>${svg(ICON[k.id] || ICON.weak)}<span class="hd-k">${esc(k.label)}</span><b class="hd-n">${n(v)}<small>${esc(k.unit)}</small></b>`
        + `<span class="hd-s">${who}${k.base_date ? ` · <span class="hd-d">${esc(k.base_date)}</span>` : ' · 기준일 준비 중'}</span></li>`;
    }).join('');
    return items ? `<ul class="hd-kpis">${items}</ul>` : '';
  }

  function render(d, code) {
    const area = valid(d) && d.areas.find(a => a.code === code);
    if (!area) return '';
    const charts = d.series.map(s => chart(s, code, area.name)).filter(Boolean).join('');
    // 시설 수 묶음에도 지역 이름(인쇄·캡처한 쪽만 떼어 붙여도 어느 곳 숫자인지 보이게)
    return `<h3 class="hd-area">${esc(area.name)} · 지금 있는 시설</h3>${kpiList(d, code)}<div class="hd-charts">${charts}${heldList(d)}</div>`;
  }

  const api = { valid, heights, chart, kpiList, heldList, render };
  if (typeof module === 'object' && module.exports) module.exports = api;

  // 브라우저 연결부: 자리([data-dash])가 있고 util.js가 있을 때만
  if (!root || !root.document || !esc) return;
  const doc = root.document;
  function grow(box) {
    for (const i of box.querySelectorAll('.hd-bars i[data-h]')) i.style.height = i.getAttribute('data-h') + '%';
  }
  function start() {
    const box = doc.querySelector('[data-dash="safety"]');
    if (!box) return;
    const body = box.querySelector('#dashBody'), pick = box.querySelector('#dashArea');
    const say = box.querySelector('#dashSay'), print = box.querySelector('#dashPrint');
    if (!body || !pick) return;
    const fail = () => { body.innerHTML = '<p class="hd-wait">대시보드 자료를 불러오지 못했습니다. 같은 자료는 아래 안전·재난 지도와 데이터 출처 화면에서 봅니다.</p>'; };
    root.RenewUtil.fetchJson('data/home_dashboard.json').then(d => {
      if (!valid(d)) return fail();
      // 시·도별 묶음: 거제·양산이 '부산 전체' 아래 부산 구·군처럼 보이지 않게(대표 지적 2026-11-22 밤)
      pick.textContent = '';
      const groups = new Map();
      for (const a of d.areas) {
        const key = a.sido || '';
        if (!groups.has(key)) {
          const g = key ? doc.createElement('optgroup') : pick;
          if (key) { g.label = key; pick.appendChild(g); }
          groups.set(key, g);
        }
        const o = doc.createElement('option');
        o.value = a.code; o.textContent = a.name;
        groups.get(key).appendChild(o);
      }
      const draw = (announce) => {
        const h = render(d, pick.value);
        if (!h) return;
        body.innerHTML = h; grow(body); box.classList.add('is-ready');
        // 화면낭독기에는 바뀐 지역만 한 줄로 알린다(카드·표 전체를 다시 읽지 않게)
        if (announce && say) say.textContent = `${pick.options[pick.selectedIndex].textContent} 자료로 바꿨습니다`;
      };
      pick.value = d.areas[0].code;
      pick.disabled = false;
      pick.addEventListener('change', () => draw(true));
      draw(false);
      if (print) {
        print.hidden = false;
        // 인쇄는 대시보드만(home6.css @media print의 html.print-dash). 출처·기준일이 그대로 따라간다
        print.addEventListener('click', () => {
          // 인쇄 머리: 고른 곳과 출력한 날(home6.css #dash::before가 data-print를 쓴다)
          box.setAttribute('data-print', `리뉴맵 우리 동네 안전·기후 · ${pick.options[pick.selectedIndex].textContent} · ${new Date().toLocaleDateString('sv-SE')} 출력`);
          doc.documentElement.classList.add('print-dash');
          root.addEventListener('afterprint', () => doc.documentElement.classList.remove('print-dash'), { once: true });
          root.print();
        });
      }
    }).catch(fail);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : this);
