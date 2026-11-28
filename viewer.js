/* 문서 열기(docs.html): 한글(hwp·hwpx)·워드·엑셀·파워포인트·PDF·그림·글을 이 기기 안에서 열어 보여 준다. 서버로 보내지 않는다.
   열기 도구는 vendor/에 같이 둔 오픈소스(rhwp MIT, pdf.js·SheetJS·docx-preview Apache-2.0, JSZip MIT)이고, 필요한 형식을 열 때만 불러온다.
   문서에 지정된 순서와 표시 상태를 미리보기와 내려받는 글에 함께 적용한다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.init(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const KINDS = { hwp: 'hwp', hwpx: 'hwp', docx: 'docx', xlsx: 'sheet', xls: 'sheet', xlsb: 'sheet', ods: 'sheet', csv: 'sheet', pptx: 'pptx', pdf: 'pdf',
    png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', webp: 'img', txt: 'text', md: 'text', json: 'text', odt: 'odt' };
  const kindOf = name => KINDS[(/\.([A-Za-z0-9]+)$/.exec(String(name || '')) || [])[1]?.toLowerCase()] || null;
  const PAGE_STEP = 10, ROW_CAP = 500;
  // 한국어 csv·txt는 UTF-8이 아닌 경우(엑셀 기본 저장 CP949)가 많아, UTF-8로 안 읽히면 EUC-KR로 읽는다
  function decodeText(bytes) {
    const u8 = new Uint8Array(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); } catch (e) { return new TextDecoder('euc-kr').decode(u8); }
  }

  // XML 글에서 지정한 태그 안의 글자만 차례로 모은다(태그 이름의 접두사는 무시)
  function xmlTexts(xml, tag) {
    const out = [], re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${tag}>`, 'g');
    let m; while ((m = re.exec(xml))) out.push(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'));
    return out;
  }
  const visibleSheets = (wb) => wb.SheetNames.filter((_, i) => !wb.Workbook?.Sheets?.[i]?.Hidden);

  async function presentationText(zip, parser) {
    const read = async (path) => {
      const entry = zip.file(path);
      if (!entry) throw new Error('슬라이드 목록이나 원본 슬라이드를 찾지 못했습니다.');
      const xml = parser.parseFromString(await entry.async('string'), 'application/xml');
      if (xml.getElementsByTagNameNS('*', 'parsererror').length) throw new Error('슬라이드 자료를 읽지 못했습니다.');
      return xml.documentElement;
    };
    const relationships = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'];
    const drawing = ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'];
    const presentation = await read('ppt/presentation.xml');
    const list = [...presentation.children].find((e) => e.localName === 'sldIdLst' && e.namespaceURI === presentation.namespaceURI);
    const ids = [...(list?.children || [])].filter((e) => e.localName === 'sldId' && e.namespaceURI === presentation.namespaceURI);
    if (!ids.length) return [];
    const rels = await read('ppt/_rels/presentation.xml.rels');
    const byId = new Map(Array.from(rels.children, (e) => [e.getAttribute('Id'), e]));
    const base = new URL('https://package.invalid/ppt/presentation.xml');
    const slides = [];
    for (const [i, slideId] of ids.entries()) {
      const id = relationships.map((ns) => slideId.getAttributeNS(ns, 'id')).find(Boolean);
      const rel = byId.get(id), target = rel?.getAttribute('Target');
      if (!target || rel.getAttribute('TargetMode') === 'External' || !relationships.some((ns) => rel.getAttribute('Type') === `${ns}/slide`)) {
        throw new Error('문서에 적힌 슬라이드 연결을 확인하지 못했습니다.');
      }
      const path = new URL(target, base);
      if (path.origin !== base.origin || path.search || path.hash) throw new Error('문서 안의 슬라이드 경로를 확인하지 못했습니다.');
      const slide = await read(decodeURIComponent(path.pathname.slice(1)));
      if (slide.localName !== 'sld' || slide.namespaceURI !== presentation.namespaceURI) throw new Error('슬라이드 자료를 읽지 못했습니다.');
      const hidden = ['0', 'false'].includes(slide.getAttribute('show'));
      const lines = hidden ? [] : [...slide.getElementsByTagNameNS('*', 't')].filter((e) => drawing.includes(e.namespaceURI)).map((e) => e.textContent);
      slides.push({ number: i + 1, hidden, lines });
    }
    return slides;
  }

  function init(win) {
    const doc = win.document, $ = id => doc.getElementById(id);
    const input = $('docFile'), stage = $('docStage'), bar = $('docBar'), status = $('docStatus'), drop = $('docDrop');
    const identity = $('docIdentity'), hashButton = $('docHashButton'), hashStatus = $('docHashStatus'), hashValue = $('docHashValue');
    const hashCompare = $('docHashCompare'), expectedHash = $('docExpectedHash'), compareStatus = $('docCompareStatus');
    const loaded = {};
    const loadScript = src => loaded[src] || (loaded[src] = new Promise((ok, no) => { const s = doc.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' 불러오기 실패')); doc.head.append(s); }));
    let cur = null, epoch = 0; // {file, text: () => Promise<string>, canPrint}
    const syncPrint = () => {
      const ready = !!cur && (!cur.canPrint || cur.canPrint());
      $('docPrint').disabled = !ready;
      stage.classList.toggle('doc-print-incomplete', !ready);
    };
    const say = (t, err) => { status.textContent = t; status.className = err ? 'doc-status err' : 'doc-status'; };
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const save = (name, data, mime) => { const u = URL.createObjectURL(new Blob([data], { type: mime })), a = el('a'); a.href = u; a.download = name; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
    const more = (stage, n, total, draw) => { // 비동기 렌더도 쪽 순서·완료 상태를 보존한다
      let shown = 0, pending = false; const btn = el('button', 'btn ghost', ''); btn.type = 'button';
      const next = async () => {
        if (pending) return;
        pending = true; btn.disabled = true; syncPrint();
        try { const end = Math.min(shown + PAGE_STEP, n); while (shown < end) { await draw(shown); shown++; } }
        finally { pending = false; btn.disabled = false; btn.textContent = `다음 ${PAGE_STEP}쪽 더 보기 (${shown}/${total})`; btn.hidden = shown >= n; syncPrint(); }
      };
      btn.addEventListener('click', () => next().catch(() => { if (cur?.stage === stage) say('다음 쪽을 그리지 못했습니다. 원본을 받아 문서 편집기에서 인쇄하세요.', true); }));
      stage.append(btn);
      return { ready: next(), canPrint: () => shown >= n && !pending };
    };

    const openers = {
      async hwp(bytes, file, stage) {
        const mod = await import('./vendor/rhwp/rhwp.js'); let ctx = null, last = '';
        win.measureTextWidth = (font, text) => { ctx = ctx || doc.createElement('canvas').getContext('2d'); if (font !== last) { ctx.font = font; last = font; } return ctx.measureText(text).width; };
        await mod.default({ module_or_path: 'vendor/rhwp/rhwp_bg.wasm' });
        const d = new mod.HwpDocument(new Uint8Array(bytes)), n = d.pageCount(), svgs = [];
        const pager = more(stage, n, n, async i => { const svg = d.renderPageSvg(i); svgs[i] = svg; const img = el('img', 'doc-page'); img.alt = `${i + 1}쪽`; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); stage.insertBefore(img, stage.lastChild); await img.decode(); });
        await pager.ready;
        return { pages: n, canPrint: pager.canPrint, text: async () => { const out = []; for (let i = 0; i < n; i++) out.push(xmlTexts(svgs[i] || d.renderPageSvg(i), 'text').join('')); return out.join('\n\n'); } };
      },
      async docx(bytes, file, stage) {
        await loadScript('vendor/office/jszip.min.js'); await loadScript('vendor/office/docx-preview.min.js');
        const box = el('div', 'doc-docx'); stage.append(box);
        await win.docx.renderAsync(bytes, box, null, { inWrapper: true, ignoreLastRenderedPageBreak: true });
        return { text: async () => box.innerText };
      },
      async sheet(bytes, file, stage) {
        await loadScript('vendor/office/xlsx.mini.min.js');
        const wb = /\.csv$/i.test(file.name) ? win.XLSX.read(decodeText(bytes), { type: 'string' }) : win.XLSX.read(bytes, { type: 'array', cellDates: true }), tabs = el('div', 'doc-tabs'), body = el('div', 'doc-sheet');
        const names = visibleSheets(wb);
        const utils = win.XLSX.utils, rangeOf = sheet => sheet['!ref'] ? utils.decode_range(sheet['!ref']) : null;
        const toolbar = el('div', 'doc-sheet-nav'), rangeStatus = el('span', 'doc-note');
        rangeStatus.setAttribute('role', 'status');
        const prev = el('button', 'doc-tab', '이전 행 묶음'), next = el('button', 'doc-tab', '다음 행 묶음');
        prev.type = next.type = 'button';
        const jump = el('form', 'doc-sheet-jump'), label = el('label', '', '행 번호');
        const rowInput = el('input'), go = el('button', 'doc-tab', '행으로 이동');
        rowInput.id = 'docSheetRow'; rowInput.type = 'number'; rowInput.inputMode = 'numeric'; rowInput.step = '1';
        label.htmlFor = rowInput.id; go.type = 'submit'; jump.noValidate = true;
        jump.append(label, rowInput, go);
        const pages = el('div', 'doc-sheet-pages');
        pages.append(prev, next);
        toolbar.append(rangeStatus, pages, jump);
        let sheet, bounds, first;
        const draw = (target = null) => {
          rowInput.removeAttribute('aria-invalid');
          body.textContent = '';
          toolbar.hidden = !bounds;
          if (!bounds) { body.append(el('p', 'doc-note', '이 시트에 표시할 행이 없습니다.')); return; }
          pages.hidden = bounds.e.r - bounds.s.r < ROW_CAP;
          rowInput.min = String(bounds.s.r + 1); rowInput.max = String(bounds.e.r + 1);
          const last = Math.min(first + ROW_CAP - 1, bounds.e.r);
          const range = utils.encode_range({ s: { ...bounds.s, r: first }, e: { ...bounds.e, r: last } });
          const rows = utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, range }), t = el('table');
          let focusRow = null;
          rows.forEach((values, i) => {
            const row = first + i + 1, tr = el('tr'), heading = el('th', '', String(row));
            heading.scope = 'row';
            tr.append(heading, ...values.map(value => el('td', '', value)));
            if (row === target) { tr.tabIndex = -1; focusRow = tr; }
            t.append(tr);
          });
          const scroll = el('div', 'doc-scroll'); scroll.append(t); body.append(scroll);
          prev.disabled = first <= bounds.s.r; next.disabled = last >= bounds.e.r;
          rangeStatus.textContent = `엑셀 ${first + 1}~${last + 1}행 · 시트 범위 ${bounds.s.r + 1}~${bounds.e.r + 1}행`;
          if (focusRow) {
            rangeStatus.textContent += ` · ${target}행으로 이동했습니다.`;
            focusRow.focus({ preventScroll: true }); focusRow.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        };
        const show = name => {
          sheet = wb.Sheets[name]; bounds = rangeOf(sheet); first = bounds?.s.r ?? 0;
          rowInput.value = '';
          rowInput.removeAttribute('aria-invalid');
          for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.s === name));
          draw();
        };
        jump.addEventListener('submit', event => {
          event.preventDefault();
          const row = rowInput.valueAsNumber;
          if (!bounds || !Number.isInteger(row) || row <= bounds.s.r || row > bounds.e.r + 1) {
            rowInput.setAttribute('aria-invalid', 'true');
            if (bounds) rangeStatus.textContent = `행 번호를 ${bounds.s.r + 1}~${bounds.e.r + 1} 사이의 정수로 입력해 주세요.`;
            rowInput.focus();
            return;
          }
          rowInput.removeAttribute('aria-invalid');
          first = bounds.s.r + Math.floor((row - 1 - bounds.s.r) / ROW_CAP) * ROW_CAP;
          draw(row);
        });
        prev.addEventListener('click', () => { first -= ROW_CAP; draw(); });
        next.addEventListener('click', () => { first += ROW_CAP; draw(); });
        const hidden = wb.SheetNames.length - names.length;
        if (hidden) stage.append(el('p', 'doc-note', `숨긴 시트 ${hidden}개는 미리보기와 글자 파일에서 제외했습니다. 원본 파일에서 확인할 수 있습니다.`));
        for (const name of names) { const b = el('button', 'doc-tab', name); b.type = 'button'; b.dataset.s = name; b.addEventListener('click', () => show(name)); tabs.append(b); }
        if (!names.length) { stage.append(el('p', 'doc-note', '표시할 시트가 없습니다.')); return { canPrint: () => false, text: null }; }
        stage.append(tabs, toolbar, body); show(names[0]);
        return { pages: names.length, canPrint: () => names.length === 1 && (!bounds || bounds.e.r - bounds.s.r < ROW_CAP),
          text: async () => names.map(n => `# ${n}\n${win.XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n') };
      },
      async pptx(bytes, file, stage) {
        await loadScript('vendor/office/jszip.min.js');
        const zip = await win.JSZip.loadAsync(bytes), slides = await presentationText(zip, new win.DOMParser());
        const visible = slides.filter((slide) => !slide.hidden);
        stage.append(el('p', 'doc-note', '파워포인트는 슬라이드별 글자만 보여 줍니다. 배치와 그림까지 보려면 원본을 받아 파워포인트나 이음오피스에서 여세요.'));
        if (visible.length < slides.length) stage.append(el('p', 'doc-note', `숨긴 슬라이드 ${slides.length - visible.length}장은 미리보기와 글자 파일에서 제외했습니다.`));
        if (!visible.length) stage.append(el('p', 'doc-note', '표시할 슬라이드가 없습니다.'));
        for (const { number, lines } of visible) {
          const card = el('section', 'doc-slide'); card.append(el('h3', '', `슬라이드 ${number}`));
          for (const line of lines.filter(Boolean)) card.append(el('p', '', line));
          stage.append(card);
        }
        return { pages: visible.length, canPrint: () => false,
          text: visible.length ? async () => visible.map(({ number, lines }) => `[슬라이드 ${number}]\n${lines.join('\n')}`).join('\n\n') : null };
      },
      async pdf(bytes, file, stage) {
        await loadScript('vendor/pdfjs/pdf.min.js'); // isEvalSupported:false: pdf.js 3.x 글꼴 처리의 코드 실행 취약점(CVE-2024-4367) 완화. 이 페이지 CSP도 unsafe-eval을 허용하지 않는다
        win.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        const pdf = await win.pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise, n = pdf.numPages, width = Math.min(stage.clientWidth || 360, 1200);   // 넓은 화면에서 쪽이 격자 폭(약 1,120px)까지 선명하게
        const pager = more(stage, n, n, async i => {
          const page = await pdf.getPage(i + 1), vp0 = page.getViewport({ scale: 1 }), scale = width / vp0.width, vp = page.getViewport({ scale }), dpr = win.devicePixelRatio || 1;
          const cv = el('canvas', 'doc-page'); cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr); cv.style.width = '100%'; cv.setAttribute('aria-label', `${i + 1}쪽`);
          stage.insertBefore(cv, stage.lastChild); await page.render({ canvasContext: cv.getContext('2d'), viewport: page.getViewport({ scale: scale * dpr }) }).promise;
        });
        await pager.ready;
        return { pages: n, canPrint: pager.canPrint, text: async () => { const out = []; for (let i = 1; i <= n; i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str).join(' ')); return out.join('\n\n'); } };
      },
      async img(bytes, file, stage) { const i = el('img', 'doc-page'); i.alt = file.name; i.src = URL.createObjectURL(new Blob([bytes], { type: file.type || 'image/*' })); stage.append(i); try { await i.decode(); } finally { URL.revokeObjectURL(i.src); } return { text: null }; },
      async text(bytes, file, stage) { const t = decodeText(bytes); stage.append(el('pre', 'doc-text', t.length > 200000 ? t.slice(0, 200000) + '\n…(이하 생략)' : t)); return { canPrint: () => t.length <= 200000, text: async () => t }; },
      async odt(bytes, file, stage) {
        await loadScript('vendor/office/jszip.min.js'); const zip = await win.JSZip.loadAsync(bytes), xml = await zip.files['content.xml'].async('string');
        const t = xml.replace(/<\/text:(?:p|h)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        stage.append(el('pre', 'doc-text', t)); return { text: async () => t };
      },
    };

    async function open(file) {
      const token = ++epoch, kind = kindOf(file.name), content = el('div', 'doc-content');
      stage.replaceChildren(content); bar.hidden = true; cur = null; syncPrint();
      identity.hidden = true;
      identity.open = false;
      hashButton.disabled = false;
      hashStatus.textContent = hashValue.textContent = '';
      hashCompare.hidden = true;
      expectedHash.value = compareStatus.textContent = '';
      if (!kind) { say(`${file.name}: 이 형식은 아직 열지 못합니다. 한글·워드·엑셀·파워포인트·PDF·그림·글 파일을 고르세요.`, true); return; }
      if (file.size > 60 * 1024 * 1024) { say('60MB가 넘는 파일은 열지 않습니다. 이음오피스 앱에서 여세요.', true); return; }
      say(`${file.name} 여는 중…`);
      try {
        const bytes = await file.arrayBuffer();
        if (token !== epoch) return;
        const res = await openers[kind](bytes, file, content);
        if (token !== epoch) return;
        cur = { file, text: res.text, canPrint: res.canPrint, stage: content }; syncPrint();
        say(`${file.name} · ${(file.size / 1024).toFixed(0)}KB${res.pages ? ` · ${res.pages}${kind === 'sheet' ? '시트' : kind === 'pptx' ? '장' : '쪽'}` : ''}`);
        bar.hidden = false; $('docText').hidden = !res.text;
        identity.hidden = false;
      } catch (err) { if (token !== epoch) return; stage.textContent = ''; say(`${file.name}: 열지 못했습니다(${err && err.message ? err.message : '파일이 손상됐거나 암호가 걸려 있습니다'}). 암호가 있으면 풀어서 다시 고르세요.`, true); }
    }
    input.addEventListener('change', () => { if (input.files[0]) open(input.files[0]); });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files[0]) open(e.dataTransfer.files[0]); });
    hashButton.addEventListener('click', async () => {
      const selected = cur;
      if (!selected || hashButton.disabled) return;
      if (!win.crypto?.subtle) {
        hashStatus.textContent = '이 환경에서는 확인값을 계산할 수 없습니다. HTTPS 주소를 확인해 주세요.';
        return;
      }
      hashButton.disabled = true;
      hashStatus.textContent = '확인값을 계산하고 있습니다.';
      try {
        const bytes = await selected.file.arrayBuffer();
        if (selected !== cur) return;
        const digest = await win.crypto.subtle.digest('SHA-256', bytes);
        if (selected !== cur) return;
        selected.hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
        hashValue.textContent = selected.hash;
        hashStatus.textContent = '원본 SHA-256을 계산했습니다.';
        hashCompare.hidden = false;
      } catch {
        if (selected !== cur) return;
        hashButton.disabled = false;
        hashStatus.textContent = '확인값을 계산하지 못했습니다. 다시 시도해 주세요.';
      }
    });
    expectedHash.addEventListener('input', () => { compareStatus.textContent = ''; });
    $('docCompareButton').addEventListener('click', () => {
      if (!cur?.hash) return;
      const received = expectedHash.value.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(received)) {
        compareStatus.textContent = 'SHA-256 확인값은 64자리의 숫자(0~9)와 영문(a~f)입니다.';
        return;
      }
      compareStatus.textContent = received === cur.hash
        ? '입력한 확인값이 현재 파일의 확인값과 같습니다.'
        : '일치하지 않습니다. 현재 파일과 받은 확인값을 다시 확인하세요.';
    });
    $('docOrig').addEventListener('click', () => cur && save(cur.file.name, cur.file, cur.file.type || 'application/octet-stream'));
    $('docText').addEventListener('click', async () => { const selected = cur; if (!selected?.text) return; save(selected.file.name.replace(/\.[^.]+$/, '') + '.txt', '﻿' + (await selected.text()), 'text/plain;charset=utf-8'); });
    $('docPrint').addEventListener('click', () => { syncPrint(); if (!$('docPrint').disabled) win.print(); });
    syncPrint();
  }
  return { kindOf, xmlTexts, visibleSheets, decodeText, init };
});
