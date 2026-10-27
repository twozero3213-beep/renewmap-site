/* 납품 도구: PDF는 브라우저 인쇄, HWPX·DOCX·XLSX·PPTX는 docgen.js가 이 브라우저에서 바로 만든다(map.js의 download). 상태 문구는 사실만 적는다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewReport = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const FORMATS = ['hwpx', 'pdf', 'xlsx', 'docx', 'pptx'];
  // detail: { file, size, message } (done·error일 때)
  function exportStateHTML(format, status, detail) {
    const supported = FORMATS.includes(format), d = detail || {};
    const label = supported ? format.toUpperCase() : esc(format);
    const state = supported ? status : 'unavailable';
    if (state === 'error') return `<p class="export-state is-error" role="alert"><strong>${label} 납품 오류</strong> ${d.message ? esc(d.message) : '파일을 만들지 못했습니다. 다시 시도해 주세요.'}</p>`;
    if (state === 'done' && format !== 'pdf') return `<p class="export-state is-ready" role="status"><strong>${label} 파일을 내려받았습니다</strong> ${esc(d.file || '')}${d.size ? ` (${Math.max(1, Math.round(d.size / 1024))}KB)` : ''}<br>이 브라우저에서 만들었고 서버로 보내지 않았습니다.${format === 'hwpx' ? ' 한/글에서 열어 쪽 번호와 글꼴을 한 번 확인해 주세요.' : ''}</p>`;
    if (state === 'ready' && format === 'pdf') return `<p class="export-state is-ready" role="status"><strong>PDF 인쇄 가능</strong> 기존 브라우저 인쇄 창에서 PDF로 저장할 수 있습니다.</p>`;
    if (state === 'ready') return `<p class="export-state is-ready" role="status"><strong>${label} 바로 만들기 가능</strong> 이 브라우저에서 만들어 내려받습니다. 서버로 보내지 않습니다.</p>`;
    if (state === 'empty') return `<p class="export-state" role="status"><strong>${label}</strong> 지역을 선택한 뒤 만들 수 있습니다.</p>`;
    if (format === 'pdf') return `<p class="export-state" role="status"><strong>PDF</strong> 지역을 선택한 뒤 브라우저 인쇄로 만들 수 있습니다.</p>`;
    if (supported) return `<p class="export-state" role="status"><strong>${label}</strong> 지역을 선택한 뒤 이 브라우저에서 바로 만들 수 있습니다.</p>`;
    return `<p class="export-state is-unavailable" role="status"><strong>${label} 준비 중</strong> 아직 파일을 만들지 않습니다. 실제 생성 기능이 완성되면 제공합니다.</p>`;
  }
  function init() {
    const report = document.getElementById('reportApp');
    const tools = document.querySelector('[data-export-tools]');
    if (!report || !tools) return;
    const status = tools.querySelector('[data-export-status]');
    const button = f => tools.querySelector(`[data-export-format="${f}"]`);
    const pdf = button('pdf'), hwpx = button('hwpx'), xlsx = button('xlsx'), docx = button('docx'), pptx = button('pptx');
    let anchor = null, shown = false;
    function paint(ready) { status.innerHTML = FORMATS.map(f => exportStateHTML(f, ready ? 'ready' : 'unavailable')).join(''); }
    function sync() {
      const ready = Boolean(report.querySelector('[data-print]')), dl = report.querySelector('[data-dl]');
      pdf.disabled = !ready;
      [hwpx, xlsx, docx, pptx].forEach(b => { if (b) b.disabled = !dl; });
      // 보고서가 다시 그려질 때만 안내를 처음 문구로 돌린다(복사 버튼 글자가 바뀔 때마다 지우지 않는다)
      if (dl !== anchor || !shown) { anchor = dl; shown = true; paint(ready); }
    }
    pdf.addEventListener('click', () => report.querySelector('[data-print]')?.click());
    [hwpx, xlsx, docx, pptx].forEach(b => b && b.addEventListener('click', () => {
      const fn = window.RenewMap && window.RenewMap.download;
      if (fn) fn(b.dataset.exportFormat); else status.innerHTML = exportStateHTML(b.dataset.exportFormat, 'error', { message: '문서 생성기를 불러오지 못했습니다. 페이지를 새로 고쳐 주세요.' });
    }));
    document.addEventListener('renew-export', e => { const d = e.detail || {}; status.innerHTML = exportStateHTML(d.format, d.status, d); });
    new MutationObserver(sync).observe(report, { childList: true, subtree: true });
    sync();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return { exportStateHTML };
});
