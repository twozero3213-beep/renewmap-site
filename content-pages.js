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
    if (list.length < 3) return null;
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
  if (typeof module !== 'undefined' && module.exports) module.exports = { init, titleOf, textOf };
  if (typeof document !== 'undefined') document.querySelectorAll('[data-content-book]').forEach(root => init(root));
})();
