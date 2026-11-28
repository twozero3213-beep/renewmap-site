/* 조건·지도·근거 패널의 표시 상태만 전환한다. 데이터와 기존 지도 상태는 각 모듈이 소유한다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewWorkspace = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  // 보고서 종류는 map.js REPORT_MODES 하나만 쓴다(v9: map·find·workspace 두 곳에 따로 적혀, 하나만 늘리면 나머지가 조용히 버렸다).
  // 브라우저에서는 map.js가 먼저 실린다(explore.html defer 순서)
  const reportKeys = () => ((typeof window !== 'undefined' && window.RenewMap) || require('./map.js')).REPORT_MODES.map(x => x[0]);
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
    const legacy = panelFromHash(hash), params = new URLSearchParams(search || '');
    if (legacy !== 'map') return legacy;
    if (!params.has('panel') && reportKeys().includes(params.get('report')) && /^#map\/\d{2}\/\d{5}(?:\/\d{5})?\/\d{8}$/.test(hash || '')) return 'evidence';
    // r16 M17: 재생 사업 화면의 구 단위 찾기(?report=programs#map/시도/시군구)는 그 구의 동별 사업 요건 대조표를 연다(전에는 지도에 머물렀다)
    if (!params.has('panel') && params.get('report') === 'programs' && /^#map\/\d{2}\/\d{5}(?:\/\d{5})?$/.test(hash || '')) return 'evidence';
    if (params.get('preset') === 'safety') return 'map';   // 안전·재난·기후 층은 조건 찾기가 아니라 지도 층이다(safety-layer.js가 켠다)
    return normalizePanel(params.get('panel'));
  }
  function panelURL(href, panel, mapHash, reportMode) {
    const url = new URL(href), name = normalizePanel(panel);
    if (reportKeys().includes(reportMode)) url.searchParams.set('report', reportMode);
    if (name === 'map' && !url.searchParams.has('report')) url.searchParams.delete('panel');
    else url.searchParams.set('panel', name);
    url.hash = /^#map(?:\/\d+)*$/.test(mapHash || '') ? mapHash : '#map';
    return url.pathname + url.search + url.hash;
  }
  // 홈 '반여1동 4-1 표 초안 보기'(?frag=MLIT-DECLINE)로 오면 '양식에 붙일 표 조각' 주제를 연다. map.js는 아는 조각 id일 때만 그 양식을 미리 고르므로,
  // 고른 값이 주소와 같은 조각 주제만 찾는다(모르는 id·조각 칸이 아직 없으면 -1)
  const fragTopicIndex = (parts, wanted) => (wanted ? parts.findIndex(part => part.matches('.rp-frag') && part.querySelector('[data-frag-preset]')?.value === wanted) : -1);
  function initReportPages(workspace) {
    const report = document.getElementById('reportApp'), pager = workspace.querySelector('[data-report-pages]');
    if (!report || !pager) return;
    const select = pager.querySelector('[data-report-topic]'), previous = pager.querySelector('[data-report-prev]'), next = pager.querySelector('[data-report-next]'), position = pager.querySelector('[data-report-position]');
    // 넓은 화면은 주제를 모두 세로 목차로 보인다(지금 주제 aria-current, 본 주제는 점 표시). 이전·고르기·다음 줄은 좁은 화면이 그대로 쓴다
    const toc = document.createElement('nav'), tocList = document.createElement('ol'), tocTitle = document.createElement('p');
    toc.className = 'ws-toc'; toc.setAttribute('aria-label', '문서 주제 목차'); toc.hidden = true;
    tocTitle.className = 'ws-toc-title'; tocTitle.textContent = '문서 주제';
    toc.append(tocTitle, tocList); pager.before(toc);   // 읽는 순서: 제목 → 목차 → 본문(넓은 화면 자리는 CSS 격자가 정한다)
    let parts = [], page = 0, fragWanted = new URLSearchParams(location.search).get('frag'), picked = false;   // picked: 사람이 주제를 고른 적이 있다
    const seen = new Set();
    function show(index, focus) {
      if (focus) { fragWanted = null; picked = true; }   // 사람이 주제를 고르면 주소의 조각으로 다시 끌고 가지 않는다
      page = Math.max(0, Math.min(index, parts.length - 1));
      seen.add(page);
      parts.forEach((part, i) => part.classList.toggle('workspace-report-hidden', parts.length > 1 && i !== page));
      select.value = String(page);
      previous.disabled = page === 0;
      next.disabled = page >= parts.length - 1;
      position.textContent = parts.length ? `주제 ${page + 1}/${parts.length}` : '';
      [...tocList.children].forEach((item, i) => {
        const button = item.firstElementChild;
        if (i === page) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
        button.dataset.state = i === page ? 'current' : seen.has(i) ? 'seen' : 'new';
      });
      if (parts[page]?.matches('details.rp-src')) parts[page].open = true;
      if (focus) {
        const heading = parts[page]?.querySelector('h3, summary, .rp-ai-head');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
        (pager.offsetParent ? pager : report).scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
    function sync() {
      const current = [...report.children].filter(element => element.matches('.rp-g, .rp-src, .rp-ai'));
      if (current.length === parts.length && current.every((element, i) => element === parts[i])) return;
      const label = select.selectedOptions[0]?.textContent;
      parts = current;
      seen.clear();
      const names = parts.map((part, i) => part.matches('.rp-ai') ? '문장 다듬기' : part.querySelector('h3, summary')?.textContent.trim() || `주제 ${i + 1}`);
      select.replaceChildren(...names.map((name, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = name;
        return option;
      }));
      tocList.replaceChildren(...names.map((name, i) => {
        const item = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.textContent = name;
        button.addEventListener('click', () => show(i, true));
        item.append(button);
        return item;
      }));
      pager.hidden = parts.length < 2;
      toc.hidden = parts.length < 2;
      const remembered = [...select.options].findIndex(option => option.textContent === label);
      const firstFacts = parts.findIndex(part => !part.matches('.rp-snap, .rp-frag, .rp-src, .rp-ai'));
      // r16: 지도 서랍의 '4-1 표 초안 보기'는 주소를 바꾸지 않고 map.js가 report.dataset.fragWant에 적는다(주소의 ?frag=와 같은 일)
      const fragAt = fragTopicIndex(parts, fragWanted || report.dataset.fragWant || null);
      if (fragAt >= 0) { fragWanted = null; delete report.dataset.fragWant; }
      // r16: 4-1 표·근거서를 열면 처음 주제는 4-1 표 초안(근거서 첫 장 '1. 현황'이 먼저 보여 표를 찾아 넘겨야 했다)
      const first41 = fragTopicIndex(parts, 'MLIT-DECLINE');
      // (4-1 표 칸은 문서 도구가 온 뒤에 생겨, 그 전에 연 첫 주제를 기억으로 붙잡지 않게 사람이 고르기 전까지는 4-1 표가 먼저)
      show(fragAt >= 0 ? fragAt : !picked && first41 >= 0 ? first41 : remembered >= 0 ? remembered : Math.max(0, firstFacts), false);
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
    const overlayButton = workspace.querySelector('[data-overlay-load]');
    // 2026-11-20 C18: #overlay는 map.js가 접힌 '도구' 칸(details.map-tools) 안으로 옮긴다 → 바로가기로 오면 도구 칸도 열고 그 칸으로 한 번 옮긴다(새 해시는 만들지 않는다)
    let overlayJump = false;
    const openOverlay = overlay => {
      overlay.open = true;
      const tools = overlay.closest('details.map-tools'); if (tools) tools.open = true;
      if (overlayJump) { overlayJump = false; overlay.scrollIntoView({ block: 'start' }); }
    };
    overlayButton?.addEventListener('click', async () => {
      overlayButton.disabled = true;
      overlayButton.textContent = '파일 도구를 불러오는 중입니다.';
      try {
        await import('./overlay.js?v=20261127-gis-input');
        const overlay = document.getElementById('overlay'); openOverlay(overlay);
        overlay.querySelector('summary').focus({ preventScroll: true });
      } catch (error) {
        const slot = document.getElementById('overlayApp'); slot.setAttribute('role', 'alert');
        slot.textContent = '파일 도구를 불러오지 못했습니다. 새로고침한 뒤 다시 열어 주세요.';
      }
    });
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
      if (active === 'filters' && !window.RenewFind) import('./find.js?v=20261128-r95-2').catch(() => {
        const slot = document.getElementById('findApp'); slot.setAttribute('role', 'alert');
        slot.textContent = '조건 도구를 불러오지 못했습니다. 새로고침한 뒤 다시 열어 주세요.';
      });
      workspace.dataset.activePanel = active;
      workspace.querySelectorAll('[data-workspace-panel]').forEach(panel => { panel.hidden = panel.dataset.workspacePanel !== active; });
      tabs.forEach(tab => {
        const selected = tab.dataset.workspaceTab === active;
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
      if (mode) { navigate('evidence', false, undefined, mode.dataset.rpMode); markDocCards(); return; }
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const hash = link.getAttribute('href');
      if (!/^#(map(?:\/|$)|find$|gov$|report$)/.test(hash)) return;
      event.preventDefault();
      navigate(panelFromHash(hash), false, hash, link.dataset.setMode);
      // R4 1: '1쪽 근거 문서 보기' 같은 링크를 누르면 눌렀던 단추가 숨은 패널에 있어 초점이 BODY로 돌아갔다 → 문서 패널 제목으로 옮긴다(화면도 그리로 간다)
      if (link.classList.contains('dc-card')) { markDocCards(); return; } // 문서 카드는 같은 패널 안이라 초점을 카드에 둔다
      if (hash === '#report') { const heading = document.getElementById('reportTitle'); if (heading) { heading.tabIndex = -1; heading.focus(); } }
    });
    function markDocCards() {
      const mode = new URLSearchParams(location.search).get('report') || 'report';
      workspace.querySelectorAll('.dc-card[data-set-mode]').forEach(card => {
        if (card.dataset.setMode === mode) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
      });
    }
    const restore = () => {
      if (/^#map(?:\/\d+)*$/.test(location.hash)) mapHash = location.hash;
      window.RenewMap?.setReportMode(new URLSearchParams(location.search).get('report') || 'report');
      markDocCards();
      show(panelFromLocation(location.hash, location.search));
      if (location.hash === '#overlay') {
        overlayJump = true;
        const overlay = document.getElementById('overlay');
        if (overlay) openOverlay(overlay); else overlayButton?.click();
      }
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
  const api = { normalizePanel, panelFromHash, panelFromLocation, panelURL, fragTopicIndex };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return api;
});
