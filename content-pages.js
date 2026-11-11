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
    const title = page.dataset.pageLabel || page.querySelector('h1,h2')?.textContent || '자료 목록';
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
      part.dataset.pageLabel = question || title + ' '  + (start / size + 1);
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
    pages.forEach((page, i) => {
      const option = doc.createElement('option'); option.value = String(i);
      option.textContent = (i + 1) + '. ' + (page.dataset.pageLabel || page.querySelector('h1,h2')?.textContent || '자료 목록');
      select.appendChild(option);
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
