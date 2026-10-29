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
  function init() {
    const workspace = document.querySelector('[data-workspace]');
    if (!workspace) return;
    const tabs = [...workspace.querySelectorAll('[data-workspace-tab]')];
    let active = normalizePanel(workspace.dataset.activePanel);
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
      if (active === 'filters') workspace.dataset.filtersOpen = ''; // 데스크톱은 '업무별'을 한 번 연 뒤부터 업무 패널을 지도 옆에 둔다
      tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.workspaceTab === active)));
      if (focusTab) tabs.find(tab => tab.dataset.workspaceTab === active)?.focus();
    }
    // 데스크톱에서 한 번 연 업무 패널을 다시 접는다(감사 김봉진4). 휴대폰은 하단 탭으로 바꾸므로 단추를 숨긴다(v4.css)
    workspace.querySelector('[data-filters-close]')?.addEventListener('click', () => {
      delete workspace.dataset.filtersOpen;
      show('map', true);
      history.replaceState(null, '', '#map');
    });
    tabs.forEach(tab => tab.addEventListener('click', () => {
      const name = normalizePanel(tab.dataset.workspaceTab);
      show(name);
      const target = name === 'filters' ? 'find' : name === 'evidence' ? 'report' : 'map';
      history.replaceState(null, '', `#${target}`);
    }));
    document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
      const name = link.getAttribute('href');
      if (/^#(map(?:\/|$)|find$|gov$|report$)/.test(name)) show(panelFromHash(name));
    }));
    window.addEventListener('hashchange', () => show(panelFromHash(location.hash)));
    document.addEventListener('keydown', event => {
      // Escape는 패널을 숨기지 않고 지금 탭으로 초점만 돌린다(지도 시트 닫기는 map.js가 한다)
      if (event.key !== 'Escape' || !window.matchMedia('(max-width: 1099px)').matches) return;
      tabs.find(tab => tab.dataset.workspaceTab === active)?.focus();
    });
    show(panelFromHash(location.hash));
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return { normalizePanel, panelFromHash };
});
