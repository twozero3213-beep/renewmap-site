/* 긴 안내·출처·사업 화면의 차례(2026-11-13 v6).
   왜: 11-12에는 주제를 한 장씩 넘겨 보게 했는데(재생 사업 1/9, 출처 1/12, 소개 1/17), 11-13 페르소나 8명이 모두
   "나란히 비교·인쇄·찾기(Ctrl+F)가 안 된다"고 했다. 이제 본문은 전부 펼쳐 두고, 맨 위에 주제 차례만 단다.
   차례는 자바스크립트가 없으면 생기지 않고, 본문과 원문 앵커는 그대로다. */
(function () {
  'use strict';
  // 제목에 <br>이 있으면 textContent가 낱말을 붙인다. 화면에 그려진 글(innerText)을 먼저 쓴다
  function textOf(el) {
    if (!el) return '';
    const t = typeof el.innerText === 'string' && el.innerText.trim() ? el.innerText : el.textContent;
    return (t || '').replace(/\s+/g, ' ').trim();
  }
  // h1·h2가 없는 묶음(데이터 출처 첫 표)은 표 영역 이름(aria-label)을 쓴다. 끝의 ' 표'는 차례에서 군더더기라 뺀다
  function titleOf(section) {
    const region = section.querySelector('.table-wrap');
    const label = region && region.getAttribute && region.getAttribute('aria-label');
    return section.dataset.pageLabel || textOf(section.querySelector('h1,h2')) || (label ? label.replace(/\s*표$/, '') : '') || '자료 목록';
  }
  // 바로 아래 section을 주제로 본다. section이 없으면 h2(또는 첫 표)마다 section으로 묶는다
  function topics(root, doc) {
    const sections = Array.from(root.children).filter(node => node.tagName === 'SECTION');
    if (sections.length) return sections;
    const groups = [];
    let group;
    Array.from(root.children).forEach(node => {
      if (node.tagName === 'H2' || (!group && node.classList.contains('table-wrap'))) {
        group = doc.createElement('section');
        root.insertBefore(group, node);
        groups.push(group);
      }
      if (group) group.appendChild(node);
    });
    return groups;
  }
  function init(root) {
    const doc = root.ownerDocument;
    const list = topics(root, doc);
    list.forEach((s, i) => { if (!s.id) s.id = 'topic-' + (i + 1); });
    // v8: data-fold-from="n"이면 n번째 주제부터 제목만 보이는 접는 칸(대표 지적: 스크롤이 너무 길다 — 소개 13.5화면, 재생 사업 7.6화면).
    // 본문은 그대로 문서 안에 있고(찾기·앵커 유지), 차례·링크로 들어오면 그 칸을 열고, 인쇄할 때는 모두 연다
    const from = root.dataset && root.dataset.foldFrom !== undefined ? Number(root.dataset.foldFrom) : -1;
    if (from >= 0) { fold(list.slice(from), doc); return null; }   // 접는 칸 목록이 곧 차례라 차례를 따로 달지 않는다
    // 표가 곧 차례인 쪽(재생 사업: 비교표가 사업마다 링크)은 차례를 따로 만들지 않는다(v7 6회차: 밑줄 링크 10개가 표를 770px 아래로 밀었다)
    if (list.length < 3 || 'noToc' in root.dataset) return null;
    const nav = doc.createElement('nav'), ol = doc.createElement('ol');
    nav.className = 'cp-toc'; nav.setAttribute('aria-label', '이 쪽의 차례');
    list.forEach(s => {
      const li = doc.createElement('li'), a = doc.createElement('a');
      a.href = '#' + s.id; a.textContent = titleOf(s); li.append(a); ol.append(li);
    });
    nav.append(ol);
    // 첫 주제가 쪽 제목(h1) 묶음이면 차례는 그 뒤에 둔다(소개 화면에서 차례가 제목보다 먼저 보이던 것)
    const after = list[0].querySelector('h1') && list[1] ? list[1] : list[0];
    root.insertBefore(nav, after);
    return nav;
  }
  function fold(list, doc) {
    for (const s of list) {
      const h = s.querySelector('h2');
      if (!h) continue;
      // 구획 안의 격자(.wrap) 안에 접는 칸을 둔다(밖에 두면 접힌 줄이 화면 끝에서 끝까지 퍼졌다)
      const box = s.querySelector(':scope > .wrap') || s;
      const d = doc.createElement('details'), sum = doc.createElement('summary');
      d.className = 'cp-fold';
      if (s.hasAttribute && s.hasAttribute('data-fold-open')) d.open = true;   // 직접 써 보는 예시가 든 구획(소개의 동네 비교)은 펼친 채로
      sum.append(h);
      d.append(sum, ...Array.from(box.childNodes));
      box.append(d);
    }
  }
  // 주소의 #앵커가 접힌 칸 안(또는 그 칸을 담은 주제)을 가리키면 연다
  function openFor(doc, hash) {
    const el = hash && hash.length > 1 ? doc.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (!el) return;
    const det = el.closest('details.cp-fold') || el.querySelector(':scope > details.cp-fold');
    if (det) det.open = true;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { init, titleOf, textOf };
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-content-book]').forEach(root => init(root));
    openFor(document, location.hash);
    window.addEventListener('hashchange', () => openFor(document, location.hash));
    window.addEventListener('beforeprint', () => document.querySelectorAll('details.cp-fold').forEach(d => { d.open = true; }));
  }
})();
