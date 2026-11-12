/* 긴 안내와 출처 표를 주제별로 읽되, 원문 앵커와 인쇄 자료는 보존한다. */
(function () {
  'use strict';
  function pageForHash(pages, hash, doc) {
    let id;
    try { id = decodeURIComponent((hash || '').replace(/^#/, '')); } catch (_) { return -1; }
    const target = id && (doc.getElementById(id) || (id.startsWith('dashboard/') && doc.getElementById('dashboard')));
    return target ? pages.findIndex(page => page === target || page.contains(target)) : -1;
  }
  function groupedPages(root, doc) {
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
  // 2026-11-12: 제목에 <br>이 있으면 textContent가 낱말을 붙인다('동네를 고치는 일에믿을 수 있는'). 화면에 그려진 글(innerText)을 먼저 쓴다
  function textOf(el) {
    if (!el) return '';
    const t = typeof el.innerText === 'string' && el.innerText.trim() ? el.innerText : el.textContent;
    return (t || '').replace(/\s+/g, ' ').trim();
  }
  // 2026-11-12: 주제 이름. h1·h2가 없는 묶음(데이터 출처 첫 표)은 '자료 목록'으로만 보여 다른 표와 구분이 안 됐다.
  // 표 영역의 이름(aria-label, 예: '공공데이터 원천 표')을 다음 후보로 쓴다. 끝의 ' 표'는 목차에서 군더더기라 뺀다
  function titleOf(page) {
    const region = page.querySelector('.table-wrap');
    const label = region && region.getAttribute && region.getAttribute('aria-label');
    return page.dataset.pageLabel || textOf(page.querySelector('h1,h2')) || (label ? label.replace(/\s*표$/, '') : '') || '자료 목록';
  }
  // 2026-11-12: 나눈 쪽마다 '안에 무엇이 있는지'를 보이려고 항목 이름을 뽑는다.
  // 왜: '자료 목록 1~9', '여덟 가지 원칙 1~4'처럼 번호만 붙어 바로 찾기에서 고를 수가 없었다(사용자 지적 2026-11-12).
  // 표 줄은 첫 칸, 카드는 제목. 괄호 설명은 모두 빼고(이름 중간의 '(옛 통계청)'도), 그다음 첫 칸이
  // 둘째 칸(제공 기관)으로 시작하면 겹치는 기관 이름을 뺀다. 괄호 앞에서 자르면 '국가데이터처'만 남아 구분이 안 됐다
  const MAX_NAME = 20;
  // 괄호 안 괄호('(KOSIS 행정구역(읍면동)별 인구)')도 있어 안쪽부터 여러 번 지운다
  function dropParens(s) {
    let prev;
    do { prev = s; s = s.replace(/\([^()]*\)/g, ' '); } while (s !== prev);
    return s.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function itemName(node, isRow) {
    let name;
    if (isRow) {
      const cells = Array.from(node.children || []);
      name = dropParens(textOf(cells[0]));
      const owner = textOf(cells[1]);
      if (owner && name.length > owner.length && name.startsWith(owner) && /[\s_]/.test(name[owner.length])) name = name.slice(owner.length + 1);
    } else {
      name = textOf(node.querySelector && node.querySelector('h2,h3,h4,strong'));
    }
    name = dropParens(name).replace(/[.。]$/, '').trim();
    return name.length > MAX_NAME ? name.slice(0, MAX_NAME - 1) + '…' : name;
  }
  function splitPage(page, doc) {
    const table = page.querySelector('tbody');
    const grid = page.querySelector('.eth-grid');
    const articles = page.querySelectorAll('.qa');
    const container = table || grid || (articles.length > 1 && articles[0].parentElement);
    const items = table ? Array.from(table.children) : grid ? Array.from(grid.children) : Array.from(articles);
    const size = table ? 4 : grid ? 2 : 1;
    if (!container || items.length <= size) return [page];
    const template = page.cloneNode(true);
    const pages = [];
    const title = titleOf(page);
    for (let start = 0; start < items.length; start += size) {
      const part = start ? template.cloneNode(true) : page;
      if (start) {
        part.id = page.id + '-' + (start / size + 1);
        part.removeAttribute('aria-labelledby');
        part.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      }
      const holder = table ? part.querySelector('tbody') : grid ? part.querySelector('.eth-grid') : part.querySelector('.qa').parentElement;
      const old = table || grid ? Array.from(holder.children) : Array.from(part.querySelectorAll('.qa'));
      const marker = doc.createTextNode('');
      holder.insertBefore(marker, old[0]);
      old.forEach(node => node.remove());
      items.slice(start, start + size).forEach(node => holder.insertBefore(node, marker));
      marker.remove();
      const question = !table && !grid && items[start].querySelector('h3')?.textContent.trim();
      // 표·카드 쪽은 그 쪽에 든 항목 이름을 ' · '로 잇는다. 이름을 못 뽑으면 예전처럼 '제목 번호'로 둔다
      const names = question ? [] : items.slice(start, start + size).map(node => itemName(node, !!table)).filter(Boolean);
      part.dataset.pageLabel = question || (names.length ? names.join(' · ') : title + ' ' + (start / size + 1));
      // 바로 찾기에서 같은 주제의 쪽을 한 묶음(optgroup)으로 보이게 주제 이름을 남긴다
      part.dataset.pageGroup = title;
      if (start) pages[pages.length - 1].after(part);
      pages.push(part);
    }
    return pages;
  }
  function init(root, win) {
    const doc = root.ownerDocument;
    let pages = groupedPages(root, doc);
    pages.forEach((page, i) => { if (!page.id) page.id = 'topic-' + (i + 1); });
    pages = pages.flatMap(page => splitPage(page, doc));
    if (pages.length < 2) return;
    pages.forEach(page => page.classList.add('content-page'));
    const nav = doc.createElement('nav');
    nav.className = 'content-pager';
    nav.setAttribute('aria-label', '주제별 페이지 이동');
    const label = doc.createElement('label');
    label.htmlFor = 'contentTopic'; label.textContent = '바로 찾기';
    const select = doc.createElement('select'); select.id = 'contentTopic';
    // 2026-11-12: 여러 쪽으로 나뉜 주제는 주제 이름을 묶음 제목(optgroup)으로 달아 '대제목'이 보이게 한다.
    // 나뉘지 않은 주제는 예전처럼 한 줄이다. 번호는 '이전·다음'의 'n / 전체'와 맞추려고 그대로 이어서 센다
    let group = null, groupName = null;
    pages.forEach((page, i) => {
      const option = doc.createElement('option'); option.value = String(i);
      option.textContent = (i + 1) + '. ' + (page.dataset.pageLabel || titleOf(page));
      const name = page.dataset.pageGroup || null;
      if (!name) { group = null; groupName = null; select.appendChild(option); return; }
      if (name !== groupName) {
        group = doc.createElement('optgroup');
        group.label = name + ' (' + pages.filter(p => p.dataset.pageGroup === name).length + '쪽)';
        select.appendChild(group); groupName = name;
      }
      group.appendChild(option);
    });
    const controls = doc.createElement('div'); controls.className = 'content-pager-controls';
    const prev = doc.createElement('button'); prev.type = 'button'; prev.textContent = '이전';
    const next = doc.createElement('button'); next.type = 'button'; next.textContent = '다음';
    const status = doc.createElement('span'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    controls.append(prev, status, next); nav.append(label, select, controls);
    root.insertBefore(nav, pages[0]);
    root.classList.add('content-book-ready');
    let active = 0;
    function show(index, moveFocus) {
      active = Math.max(0, Math.min(pages.length - 1, index));
      pages.forEach((page, i) => { page.hidden = i !== active; });
      select.value = String(active); prev.disabled = active === 0; next.disabled = active === pages.length - 1;
      status.textContent = (active + 1) + ' / ' + pages.length;
      if (moveFocus) {
        const heading = pages[active].querySelector('h1,h2') || pages[active];
        heading.tabIndex = -1; heading.focus({ preventScroll: true });
        nav.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
    function navigate(index) {
      if (index < 0 || index >= pages.length) return;
      win.history.pushState(null, '', '#' + encodeURIComponent(pages[index].id));
      show(index, true);
    }
    select.addEventListener('change', () => navigate(Number(select.value)));
    prev.addEventListener('click', () => navigate(active - 1));
    next.addEventListener('click', () => navigate(active + 1));
    function restore() {
      const index = pageForHash(pages, win.location.hash, doc);
      show(index < 0 ? 0 : index, false);
    }
    win.addEventListener('hashchange', restore);
    win.addEventListener('popstate', restore);
    // 링크 기본 동작 전에 펼쳐야 브라우저가 숨겨졌던 대상까지 이동한다.
    doc.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const url = new URL(link.href, win.location.href);
      if (url.origin !== win.location.origin || url.pathname !== win.location.pathname || !url.hash) return;
      const index = pageForHash(pages, url.hash, doc);
      if (index >= 0) show(index, false);
    });
    let closedBeforePrint = null;
    win.addEventListener('beforeprint', () => {
      pages.forEach(page => { page.hidden = false; });
      if (closedBeforePrint) return;
      closedBeforePrint = Array.from(doc.querySelectorAll('main details:not([open])'));
      closedBeforePrint.forEach(detail => { detail.open = true; });
    });
    win.addEventListener('afterprint', () => {
      closedBeforePrint?.forEach(detail => { detail.open = false; });
      closedBeforePrint = null;
      show(active, false);
    });
    restore();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { pageForHash, init };
  if (typeof document !== 'undefined') document.querySelectorAll('[data-content-book]').forEach(root => init(root, window));
})();
