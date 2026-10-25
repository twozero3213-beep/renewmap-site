/* 실제 생성 경로가 있는 PDF 인쇄만 실행한다. HWPX·XLSX는 준비 상태를 속이지 않는다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewReport = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function exportStateHTML(format, status) {
    const supported = ['hwpx', 'pdf', 'xlsx'].includes(format);
    const label = supported ? format.toUpperCase() : esc(format);
    const state = supported ? status : 'unavailable';
    if (state === 'error') return `<p class="export-state is-error" role="alert"><strong>${label} 납품 오류</strong> 파일을 만들지 못했습니다. 다시 시도해 주세요.</p>`;
    if (state === 'ready' && format === 'pdf') return `<p class="export-state is-ready" role="status"><strong>PDF 인쇄 가능</strong> 기존 브라우저 인쇄 창에서 PDF로 저장할 수 있습니다.</p>`;
    if (format === 'pdf') return `<p class="export-state" role="status"><strong>PDF</strong> 지역을 선택한 뒤 브라우저 인쇄로 만들 수 있습니다.</p>`;
    return `<p class="export-state is-unavailable" role="status"><strong>${label} 준비 중</strong> 아직 파일을 만들지 않습니다. 실제 생성 기능이 완성되면 제공합니다.</p>`;
  }
  function init() {
    const report = document.getElementById('reportApp');
    const tools = document.querySelector('[data-export-tools]');
    if (!report || !tools) return;
    const status = tools.querySelector('[data-export-status]');
    const pdf = tools.querySelector('[data-export-format="pdf"]');
    function sync() {
      const ready = Boolean(report.querySelector('[data-print]'));
      pdf.disabled = !ready;
      status.innerHTML = exportStateHTML('pdf', ready ? 'ready' : 'unavailable');
    }
    pdf.addEventListener('click', () => report.querySelector('[data-print]')?.click());
    new MutationObserver(sync).observe(report, { childList: true, subtree: true });
    sync();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
  return { exportStateHTML };
});
