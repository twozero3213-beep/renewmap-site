/* 공개 출처 표의 원래 행과 링크로 검색한다. */
(function () {
  'use strict';
  const normalize = text => text.normalize('NFC').toLowerCase();
  const termsOf = query => normalize(query).trim().split(/\s+/).filter(Boolean);
  const matchesSource = (text, terms) => terms.every(term => text.includes(term));

  function formatSources(items, labels) {
    const blocks = items.map(({ values, url }) =>
      [...values.map((value, index) => `${labels[index]} · ${value}`), `원문 · ${url}`].join('\n'));
    return [
      '리뉴맵 데이터 출처 · 검색 결과 ' + items.length.toLocaleString('ko-KR') + '건',
      '리뉴맵의 출처 표에 기록된 내용입니다. 재이용 전 원자료의 이용 조건을 확인하세요.',
      '', blocks.join('\n\n'), '',
    ].join('\n');
  }

  if (typeof module === 'object' && module.exports) module.exports = { termsOf, matchesSource, formatSources };
  if (typeof document === 'undefined') return;

  const finder = document.getElementById('sourceFinder');
  if (!finder) return;
  const query = document.getElementById('sourceQuery'), count = document.getElementById('sourceCount');
  const actions = document.getElementById('sourceActions'), download = document.getElementById('sourceDownload');
  const save = window.RenewSave;
  const groups = Array.from(document.querySelectorAll('[data-source-table]'), wrapper => {
    const details = wrapper.parentElement.tagName === 'DETAILS' ? wrapper.parentElement : null;
    const labels = Array.from(wrapper.querySelectorAll('thead th'), cell => cell.textContent.trim());
    const rows = Array.from(wrapper.querySelectorAll('tbody tr'), row => {
      const values = Array.from(row.cells, cell => cell.textContent.trim());
      const url = row.querySelector('a[href]').getAttribute('href');
      return { row, values, url, text: normalize([...values, url].join(' ')) };
    });
    return { container: details || wrapper, details, labels, rows, wasOpen: false };
  });
  if (!groups.length) return;
  let filtering = false;

  function update() {
    const terms = termsOf(query.value), active = terms.length > 0;
    const results = [];
    for (const group of groups) {
      if (active && !filtering && group.details) group.wasOpen = group.details.open;
      let matches = 0;
      for (const item of group.rows) {
        item.row.hidden = !matchesSource(item.text, terms);
        if (!item.row.hidden) { matches++; if (active) results.push(item); }
      }
      group.container.hidden = active && matches === 0;
      if (group.details) {
        if (active && matches) group.details.open = true;
        if (!active && filtering) group.details.open = group.wasOpen;
      }
    }
    filtering = active;
    count.textContent = active ? (results.length ? `출처 ${results.length}건을 찾았습니다.` : '맞는 출처가 없습니다. 다른 검색어를 입력해 주세요.') : '';
    actions.hidden = !save || !results.length;
    return results;
  }

  finder.hidden = false;
  query.addEventListener('input', event => { if (!event.isComposing) update(); });
  query.addEventListener('compositionend', update);
  if (save) download.addEventListener('click', () => {
    const items = update();
    if (items.length) save.saveFile('리뉴맵_검색_출처_기록.txt', [formatSources(items, groups[0].labels)], 'text/plain;charset=utf-8');
  });
})();
