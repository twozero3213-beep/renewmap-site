/* 조건·지도·근거 패널의 표시 상태만 전환한다. 데이터와 기존 지도 상태는 각 모듈이 소유한다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewWorkspace = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function normalizePanel(name) {
    return ['filters', 'map', 'evidence'].includes(name) ? name : 'map';
  }
  function panelFromHash(hash) {
    const value = String(hash || '').replace(/^#/, '').split('/')[0];
    if (value === 'find' || value === 'gov') return 'filters';
    if (value === 'report') return 'evidence';
    return 'map';
  }
  function panelFromLocation(hash, search) {
    const legacy = panelFromHash(hash);
    return legacy !== 'map' ? legacy : normalizePanel(new URLSearchParams(search || '').get('panel'));
  }
  function panelURL(href, panel, mapHash, reportMode) {
    const url = new URL(href), name = normalizePanel(panel);
    if (['report', 'brief', 'onepage', 'programs'].includes(reportMode)) url.searchParams.set('report', reportMode);
    if (name === 'map' && !url.searchParams.has('report')) url.searchParams.delete('panel');
    else url.searchParams.set('panel', name);
    url.hash = /^#map(?:\/\d+)*$/.test(mapHash || '') ? mapHash : '#map';
    return url.pathname + url.search + url.hash;
  }
  function initReportPages(workspace) {
    const report = document.getElementById('reportApp'), pager = workspace.querySelector('[data-report-pages]');
    if (!report || !pager) return;
    const select = pager.querySelector('[data-report-topic]'), previous = pager.querySelector('[data-report-prev]'), next = pager.querySelector('[data-report-next]'), position = pager.querySelector('[data-report-position]');
    let parts = [], page = 0;
    function show(index, focus) {
      page = Math.max(0, Math.min(index, parts.length - 1));
      parts.forEach((part, i) => part.classList.toggle('workspace-report-hidden', parts.length > 1 && i !== page));
      select.value = String(page);
      previous.disabled = page === 0;
      next.disabled = page >= parts.length - 1;
      position.textContent = parts.length ? `${page + 1} / ${parts.length}` : '';
      if (parts[page]?.matches('details.rp-src')) parts[page].open = true;
      if (focus) {
        const heading = parts[page]?.querySelector('h3, summary, .rp-ai-head');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
        pager.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
    function sync() {
      const current = [...report.children].filter(element => element.matches('.rp-g, .rp-src, .rp-ai'));
      if (current.length === parts.length && current.every((element, i) => element === parts[i])) return;
      const label = select.selectedOptions[0]?.textContent;
      parts = current;
      select.replaceChildren(...parts.map((part, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = part.matches('.rp-ai') ? '문장 다듬기' : part.querySelector('h3, summary')?.textContent.trim() || `주제 ${i + 1}`;
        return option;
      }));
      pager.hidden = parts.length < 2;
      const remembered = [...select.options].findIndex(option => option.textContent === label);
      const firstFacts = parts.findIndex(part => !part.matches('.rp-snap, .rp-frag, .rp-src, .rp-ai'));
      show(remembered >= 0 ? remembered : Math.max(0, firstFacts), false);
    }
    previous.addEventListener('click', () => show(page - 1, true));
    next.addEventListener('click', () => show(page + 1, true));
    select.addEventListener('change', () => show(Number(select.value), true));
    let closedBeforePrint = null;
    window.addEventListener('beforeprint', () => {
      if (closedBeforePrint) return;
      closedBeforePrint = [...report.querySelectorAll('details:not([open])')];
      closedBeforePrint.forEach(detail => { detail.open = true; });
    });
    window.addEventListener('afterprint', () => {
      closedBeforePrint?.forEach(detail => { detail.open = false; });
      closedBeforePrint = null;
    });
    new MutationObserver(sync).observe(report, { childList: true, subtree: true });
    sync();
  }
  function init() {
    const workspace = document.querySelector('[data-workspace]');
    if (!workspace) return;
    const tabs = [...workspace.querySelectorAll('[data-workspace-tab]')];
    let active = normalizePanel(workspace.dataset.activePanel);
    let mapHash = /^#map(?:\/\d+)*$/.test(location.hash) ? location.hash : '#map';
    workspace.dataset.workspaceReady = '';
    workspace.querySelectorAll('[data-workspace-panel]').forEach(panel => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `workspace-${panel.dataset.workspacePanel}-tab`);
      panel.tabIndex = 0;
    });
    function syncStates() {
      workspace.querySelectorAll('.map-empty, .map-panel-wait, .map-canvas').forEach(element => {
        const failed = element.classList.contains('map-empty') && /못했습니다/.test(element.textContent);
        const waiting = element.classList.contains('map-panel-wait') || element.classList.contains('is-wait');
        element.dataset.state = failed ? 'error' : waiting ? 'loading' : element.classList.contains('map-empty') ? 'empty' : 'ready';
      });
    }
    new MutationObserver(syncStates).observe(workspace, { childList: true, subtree: true });
    syncStates();
    function show(name, focusTab) {
      active = normalizePanel(name);
      workspace.dataset.activePanel = active;
      workspace.querySelectorAll('[data-workspace-panel]').forEach(panel => { panel.hidden = panel.dataset.workspacePanel !== active; });
      tabs.forEach(tab => {
        const selected = tab.dataset.workspaceTab === active;
        tab.setAttribute('aria-pressed', String(selected));
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      if (focusTab) tabs.find(tab => tab.dataset.workspaceTab === active)?.focus();
      if (active === 'map') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
    function navigate(name, focusTab, routeHash, reportMode) {
      if (/^#map(?:\/\d+)*$/.test(routeHash || '')) mapHash = routeHash;
      else if (/^#map(?:\/\d+)*$/.test(location.hash)) mapHash = location.hash;
      const previousURL = location.href, previousHash = location.hash;
      const target = panelURL(location.href, name, mapHash, reportMode);
      if (target !== location.pathname + location.search + location.hash) history.pushState(null, '', target);
      show(name, focusTab);
      if (previousHash !== location.hash) window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previousURL, newURL: location.href }));
    }
    api.navigate = (name, hash, reportMode) => navigate(name, false, hash, reportMode);
    workspace.querySelector('[data-filters-close]')?.addEventListener('click', () => {
      navigate('map', true);
    });
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => navigate(tab.dataset.workspaceTab));
      tab.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
        if (target < 0) return;
        event.preventDefault();
        navigate(tabs[target].dataset.workspaceTab, true);
      });
    });
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const mode = event.target.closest('[data-rp-mode]');
      if (mode) { navigate('evidence', false, undefined, mode.dataset.rpMode); return; }
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const hash = link.getAttribute('href');
      if (!/^#(map(?:\/|$)|find$|gov$|report$)/.test(hash)) return;
      event.preventDefault();
      if (hash === '#find') document.getElementById('findMore')?.setAttribute('open', '');
      navigate(panelFromHash(hash), false, hash, link.dataset.setMode);
    });
    const restore = () => {
      if (/^#map(?:\/\d+)*$/.test(location.hash)) mapHash = location.hash;
      show(panelFromLocation(location.hash, location.search));
    };
    window.addEventListener('hashchange', restore);
    window.addEventListener('popstate', restore);
    document.addEventListener('keydown', event => {
      // Escape는 패널을 숨기지 않고 지금 탭으로 초점만 돌린다(지도 시트 닫기는 map.js가 한다)
      if (event.key !== 'Escape') return;
      tabs.find(tab => tab.dataset.workspaceTab === active)?.focus();
    });
    initReportPages(workspace);
    restore();
  }
  const api = { normalizePanel, panelFromHash, panelFromLocation, panelURL };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return api;
});
