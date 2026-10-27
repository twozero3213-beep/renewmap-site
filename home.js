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
  const route = r => `explore.html#map/${r.sido}/${r.sgg}${r.dong ? '/' + r.dong : ''}`;

  // 동 이름이 같거나 포함된 곳, 시군구 이름이 맞는 곳(시군구 화면). 띄어쓰기는 무시한다.
  function find(index, query, max = MAX) {
    const q = norm(query);
    if (!q || !Array.isArray(index)) return [];
    const exact = [], fuzzy = [], seenSgg = new Set();
    for (const [code, dong, sgg, sggName, sido] of index) {
      const row = { label: dong, sub: `${sido} ${sggName}`, sido: code.slice(0, 2), sgg, dong: code };
      if (norm(dong) === q) exact.push(row);
      else if (norm(sggName) === q && !seenSgg.has(sgg)) { seenSgg.add(sgg); exact.push({ label: sggName, sub: `${sido} 시군구`, sido: row.sido, sgg, dong: '' }); }   // 시군구 이름은 동 수십 개 대신 한 줄
      else if (norm(sido + sggName + dong).includes(q)) fuzzy.push(row);
    }
    return (exact.length ? exact : fuzzy).slice(0, max);
  }

  // 문구: docs/design/redesign_2026-10-27.md 5.1. 한 문장씩 줄을 바꾼다(.home-msg white-space: pre-line)
  const MSG = {
    empty: '동 이름이나 구 이름을 적어 주세요.',
    none: '찾지 못했습니다.\n동 이름이나 구 이름으로 다시 찾아 보세요.',
    many: n => `같은 이름이 ${n}곳 있습니다.\n하나를 고르세요.`,
    fail: '동네 목록을 불러오지 못했습니다.\n인터넷 연결을 확인하고 다시 시도해 주세요.',
  };

  // 숫자 올리기: 진행률 p(0~1)에서 보일 값(ease-out). 끝은 항상 최종값
  const countAt = (n, p) => Math.round(n * (1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3)));

  // 움직임 3곳(문서 쌓기·3단계 켜기·숫자 올리기). 화면에 들어올 때 한 번만. 감속 설정·IO 없음이면 완성 상태 그대로 둔다(home.css)
  function motion(win) {
    const doc = win.document;
    if (typeof win.IntersectionObserver !== 'function' || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const once = (el, threshold, fn) => {
      if (!el) return;
      const io = new win.IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold });
      io.observe(el);
    };
    const hero = doc.getElementById('heroDoc'), steps = doc.getElementById('steps'), stats = doc.getElementById('stats');
    if (hero) hero.classList.add('is-anim');
    if (steps) steps.classList.add('is-anim');
    once(hero, 0.3, () => hero.classList.add('is-play'));
    once(steps, 0.4, () => steps.classList.add('is-on'));
    const nums = stats ? [...stats.querySelectorAll('[data-count]')] : [];
    nums.forEach(el => { el.textContent = '0'; });
    once(stats, 0.5, () => {
      const t0 = win.performance.now();
      const tick = now => {
        const p = (now - t0) / 800;
        nums.forEach(el => { el.textContent = countAt(+el.dataset.count, p).toLocaleString('ko-KR'); });
        if (p < 1) win.requestAnimationFrame(tick);
      };
      win.requestAnimationFrame(tick);
    });
  }

  function init(win) {
    const doc = win.document, form = doc.getElementById('homeSearch');
    motion(win);
    if (!form) return;
    const input = doc.getElementById('homeQ'), hits = doc.getElementById('homeHits'), msg = doc.getElementById('homeMsg');
    let index = null, loading = null;
    // 실패하면 다음 입력·검색 때 다시 받는다
    const load = () => loading || (loading = fetch('data/national/dong_index.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { index = Array.isArray(d) ? d : null; return index; }).catch(() => { loading = null; return null; }));
    load();
    const show = rows => {
      hits.classList.toggle('fresh', !hits.childElementCount);   // 처음 나타날 때만 움직이고, 고쳐 칠 때는 바로 바꾼다
      hits.textContent = '';
      for (const r of rows) {
        const li = doc.createElement('li'), a = doc.createElement('a'), s = doc.createElement('small');
        a.href = route(r); a.textContent = r.label; s.textContent = r.sub; a.append(s); li.append(a); hits.append(li);
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
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!input.value.trim()) { msg.textContent = MSG.empty; input.focus(); return; }
      if (!(await load())) { msg.textContent = MSG.fail; return; }
      const rows = find(index, input.value);
      if (!rows.length) { show([]); msg.textContent = MSG.none; return; }
      if (rows.length === 1) { win.location.href = route(rows[0]); return; }
      show(rows); msg.textContent = MSG.many(rows.length);
    });
  }
  return { find, route, norm, init, MSG, countAt };
});
