/* 앱 홈의 동네 찾기. data/national/dong_index.json([동코드8, 동, 시군구코드5, 시군구, 시도])에서 이름으로 찾아 탐색 지도로 보낸다.
   순서는 자료 순서(코드 순) 그대로이고, 값 크기로 줄 세우지 않는다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.init(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAX = 8;
  const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  // 홈에서 들어오면 기본 보고서는 '1쪽 요약'(?report=onepage, find.js entryReportMode). 동까지 정해지면 탐색이 문서 패널을 바로 연다(심사 06: 동 이름 → 1쪽 한글 3번 안에)
  // report: 열 문서 종류. 재생 사업 화면의 같은 찾기 칸은 'programs'(그 동에 맞는 사업 표)로 보낸다(form data-report)
  const route = (r, report = 'onepage') => `explore.html?report=${report}#map/${r.sido}/${r.sgg}${r.dong ? '/' + r.dong : ''}`;

  // 동 판별은 util.js dongHit(법정동 이름 '우동'·'해운대 우동'도). 화면에서는 util.js가 이 파일 뒤에 실려 부를 때 꺼낸다
  const U = () => (typeof window !== 'undefined' && window.RenewUtil) || require('./util.js');
  const byName = (a, b) => a.sgg.localeCompare(b.sgg) || a.label.localeCompare(b.label, 'ko', { numeric: true });   // 반여1·2·3동 순(전에는 코드 순이라 2·3·1·4)
  // 동 이름이 같거나(법정동 이름 포함) 포함된 곳, 시군구 이름이 맞는 곳(시군구 화면). 띄어쓰기는 무시한다.
  function find(index, query, max = MAX) {
    const q = norm(query);
    if (!q || !Array.isArray(index)) return [];
    const exact = [], fuzzy = [], seenSgg = new Set(), hit = U().dongHit;
    for (const [code, dong, sgg, sggName, sido] of index) {
      const row = { label: dong, sub: `${sido} ${sggName}`, sido: code.slice(0, 2), sgg, dong: code };
      if (hit(query, dong, [sido, sggName])) exact.push(row);
      else if (norm(sggName) === q && !seenSgg.has(sgg)) { seenSgg.add(sgg); exact.push({ label: sggName, sub: `${sido} 시군구`, sido: row.sido, sgg, dong: '' }); }   // 시군구 이름은 동 수십 개 대신 한 줄
      else if (norm(sido + sggName + dong).includes(q)) fuzzy.push(row);
    }
    return (exact.length ? exact : fuzzy).sort(byName).slice(0, max);
  }

  // 문구: docs/design/redesign_2026-10-27.md 5.1. 한 문장씩 줄을 바꾼다(.home-msg white-space: pre-line)
  const MSG = {
    empty: '동 이름이나 구 이름을 적어 주세요.',
    none: '찾지 못했습니다.\n동 이름이나 구 이름으로 다시 찾아 보세요.',
    many: (n, same) => `${same ? '같은 이름이' : '맞는 곳이'} ${n}곳 있습니다.\n하나를 고르세요.`,   // v9: 우동→국우동·사우동처럼 다른 이름에도 '같은 이름'이라 했다
    fail: '동네 목록을 불러오지 못했습니다.\n인터넷 연결을 확인하고 다시 시도해 주세요.',
  };

  function init(win) {
    const doc = win.document, form = doc.getElementById('homeSearch');
    if (!form) return;
    const input = doc.getElementById('homeQ'), hits = doc.getElementById('homeHits'), msg = doc.getElementById('homeMsg'), report = form.dataset.report || 'onepage';
    let index = null, loading = null;
    // 실패하면 다음 입력·검색 때 다시 받는다
    // R3 12: 홈은 home-live.js도 같은 dong_index.json(225KB)을 받아 두 번 내려받았다 → util.js의 renewFetch(주소별 약속 한 개)를 같이 쓴다.
    // home.js가 util.js보다 먼저 실려(defer는 DOMContentLoaded 직전에 차례로 돈다) 아직 renewFetch가 없으므로 DOMContentLoaded까지 기다린다. 시험용 가짜 화면에는 없어 fetch로 받는다
    const ready = (doc.readyState === 'loading' || doc.readyState === 'interactive') ? new Promise(res => doc.addEventListener('DOMContentLoaded', res, { once: true })) : Promise.resolve();
    const getIndex = () => ready.then(() => (win.renewFetch ? win.renewFetch('data/national/dong_index.json') : fetch('data/national/dong_index.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })));
    const load = () => loading || (loading = getIndex()
      .then(d => { index = Array.isArray(d) ? d : null; if (!index) loading = null; return index; }).catch(() => { loading = null; return null; }));
    load();
    const show = rows => {
      hits.classList.toggle('fresh', !hits.childElementCount);   // 처음 나타날 때만 움직이고, 고쳐 칠 때는 바로 바꾼다
      hits.textContent = '';
      for (const r of rows) {
        const li = doc.createElement('li'), a = doc.createElement('a'), s = doc.createElement('small');
        a.href = route(r, report); a.textContent = r.label; s.textContent = r.sub; a.append(s); li.append(a); hits.append(li);
      }
    };
    input.addEventListener('input', async () => {
      msg.textContent = '';
      if (!index) await load();
      if (!index) return;
      const rows = input.value.trim().length >= 2 ? find(index, input.value, 6) : [];
      show(rows);
      if (rows.length) msg.textContent = `후보 ${rows.length}곳`;
    });
    // 키보드: ↓로 후보 목록에 들어가 ↑↓로 옮기고, Esc는 목록만 닫는다(v9 접근성: ↓가 안 먹고 Esc가 적은 글을 지웠다)
    const links = () => [...hits.querySelectorAll('a')];
    input.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown' && links().length) { ev.preventDefault(); links()[0].focus(); }
      else if (ev.key === 'Escape' && hits.childElementCount) { ev.preventDefault(); show([]); msg.textContent = ''; }
    });
    hits.addEventListener('keydown', ev => {
      const ls = links(), i = ls.indexOf(doc.activeElement);
      if (i < 0) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const j = i + (ev.key === 'ArrowDown' ? 1 : -1); (j < 0 ? input : ls[Math.min(j, ls.length - 1)]).focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); show([]); msg.textContent = ''; input.focus(); }   // 목록도 닫는다(v9 2차: 한 번 더 눌러야 닫혔다)
    });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!input.value.trim()) { msg.textContent = MSG.empty; input.focus(); return; }
      if (!(await load())) { msg.textContent = MSG.fail; return; }
      const rows = find(index, input.value);
      if (!rows.length) { show([]); msg.textContent = MSG.none; return; }
      if (rows.length === 1) { win.location.href = route(rows[0], report); return; }
      show(rows); msg.textContent = MSG.many(rows.length, rows.every(r => r.label === rows[0].label));
    });
    if (form.dataset.pick) initPick(win, form, load, report);
  }
  // 2026-11-13 우지예: 재생 사업 화면에서 이름을 몰라도 고를 수 있게 '시·도 → 구·군 → 동' 고르기(form data-pick). 시범 지역 부산을 먼저 고른 채로 연다.
  // 목록은 같은 dong_index.json에서 만들고, 구·군·동은 가나다순(반여1·2·3동처럼 숫자는 숫자 순). 동을 고르면 찾기와 같은 곳(route)으로 간다
  const ko = (a, b) => a.localeCompare(b, 'ko', { numeric: true });
  function pickLists(index, sido, sgg) {
    const sidos = [...new Map(index.map(r => [r[0].slice(0, 2), r[4]])).entries()].sort((a, b) => ko(a[1], b[1]));
    const sggs = [...new Map(index.filter(r => r[0].slice(0, 2) === sido).map(r => [r[2], r[3]])).entries()].sort((a, b) => ko(a[1], b[1]));
    const dongs = index.filter(r => r[2] === sgg).map(r => [r[0], r[1]]).sort((a, b) => ko(a[1], b[1]));
    return { sidos, sggs, dongs };
  }
  // 고르기 칸(#88 검토 반영): 목록은 init의 load()로 한 번만 받고, 이름은 new Option(글자 그대로)으로 넣고,
  // 동을 고르기만 해서는 이동하지 않는다(화살표로 훑다 쪽이 넘어갔다, WCAG 3.2.2) → '이 동 보기' 단추로 이동
  function initPick(win, form, load, report) {
    const doc = win.document, box = doc.createElement('div');
    box.className = 'pick-row'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', '목록에서 동 고르기');
    box.innerHTML = '<span class="pick-or">또는 목록에서</span><select aria-label="시·도"></select><select aria-label="구·군"></select><select aria-label="동"></select><button type="button" class="btn ghost" disabled>이 동 보기</button>';
    form.querySelector('.home-search-row').after(box);
    const [sSel, gSel, dSel] = box.querySelectorAll('select'), go = box.querySelector('button');
    const fill = (sel, list, first) => sel.replaceChildren(...(first ? [new Option(first, '')] : []), ...list.map(([v, l]) => new Option(l, v)));
    let index = null, sido = form.dataset.pick, sgg = '';
    const paint = () => {
      const L = pickLists(index, sido, sgg);
      fill(sSel, L.sidos); sSel.value = sido; fill(gSel, L.sggs, '구·군 고르기'); gSel.value = sgg; fill(dSel, L.dongs, '동 고르기');
      dSel.disabled = !sgg; go.disabled = true;
    };
    load().then(d => { if (!d) { box.remove(); return; } index = d; paint(); });
    sSel.onchange = () => { sido = sSel.value; sgg = ''; paint(); };
    gSel.onchange = () => { sgg = gSel.value; paint(); dSel.focus(); };
    dSel.onchange = () => { go.disabled = !dSel.value; };
    go.onclick = () => { if (dSel.value) win.location.href = route({ sido, sgg, dong: dSel.value }, report); };
  }
  return { find, route, norm, init, MSG, pickLists };
});
