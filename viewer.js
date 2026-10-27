/* 문서 열기(docs.html): 한글(hwp·hwpx)·워드·엑셀·파워포인트·PDF·그림·글을 이 기기 안에서 열어 보여 준다. 서버로 보내지 않는다.
   열기 도구는 vendor/에 같이 둔 오픈소스(rhwp MIT, pdf.js·SheetJS·docx-preview Apache-2.0, JSZip MIT)이고, 필요한 형식을 열 때만 불러온다.
   위쪽(kindOf·xmlTexts·slideOrder)은 노드 시험용 순수 함수다. */
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
  // ppt/slides/slide2.xml, slide10.xml → 숫자 순서
  const slideOrder = names => names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/(\d+)\.xml$/)[1], 10) - parseInt(b.match(/(\d+)\.xml$/)[1], 10));

  function init(win) {
    const doc = win.document, $ = id => doc.getElementById(id);
    const input = $('docFile'), stage = $('docStage'), bar = $('docBar'), status = $('docStatus'), drop = $('docDrop');
    const loaded = {};
    const loadScript = src => loaded[src] || (loaded[src] = new Promise((ok, no) => { const s = doc.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' 불러오기 실패')); doc.head.append(s); }));
    let cur = null; // {file, text: () => Promise<string>}
    const say = (t, err) => { status.textContent = t; status.className = err ? 'doc-status err' : 'doc-status'; };
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const save = (name, data, mime) => { const u = URL.createObjectURL(new Blob([data], { type: mime })), a = el('a'); a.href = u; a.download = name; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
    const more = (n, total, draw) => { // 쪽·줄이 많으면 PAGE_STEP씩 이어서 그린다
      let shown = 0; const btn = el('button', 'btn ghost', ''); btn.type = 'button';
      const next = () => { for (let i = shown; i < Math.min(shown + PAGE_STEP, n); i++) draw(i); shown = Math.min(shown + PAGE_STEP, n); btn.textContent = `다음 ${PAGE_STEP}쪽 더 보기 (${shown}/${total})`; btn.hidden = shown >= n; };
      btn.addEventListener('click', next); stage.append(btn); next();
    };

    const openers = {
      async hwp(bytes) {
        const mod = await import('./vendor/rhwp/rhwp.js'); let ctx = null, last = '';
        win.measureTextWidth = (font, text) => { ctx = ctx || doc.createElement('canvas').getContext('2d'); if (font !== last) { ctx.font = font; last = font; } return ctx.measureText(text).width; };
        await mod.default({ module_or_path: 'vendor/rhwp/rhwp_bg.wasm' });
        const d = new mod.HwpDocument(new Uint8Array(bytes)), n = d.pageCount(), svgs = [];
        more(n, n, i => { const svg = d.renderPageSvg(i); svgs[i] = svg; const img = el('img', 'doc-page'); img.alt = `${i + 1}쪽`; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); stage.insertBefore(img, stage.lastChild); });
        return { pages: n, text: async () => { const out = []; for (let i = 0; i < n; i++) out.push(xmlTexts(svgs[i] || d.renderPageSvg(i), 'text').join('')); return out.join('\n\n'); } };
      },
      async docx(bytes) {
        await loadScript('vendor/office/jszip.min.js'); await loadScript('vendor/office/docx-preview.min.js');
        const box = el('div', 'doc-docx'); stage.append(box);
        await win.docx.renderAsync(bytes, box, null, { inWrapper: true, ignoreLastRenderedPageBreak: true });
        return { text: async () => box.textContent };
      },
      async sheet(bytes, file) {
        await loadScript('vendor/office/xlsx.mini.min.js');
        const wb = /\.csv$/i.test(file.name) ? win.XLSX.read(decodeText(bytes), { type: 'string' }) : win.XLSX.read(bytes, { type: 'array', cellDates: true }), tabs = el('div', 'doc-tabs'), body = el('div', 'doc-sheet');
        const show = name => {
          body.textContent = ''; const rows = win.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }), t = el('table');
          for (const r of rows.slice(0, ROW_CAP)) { const tr = el('tr'); for (const c of r) tr.append(el('td', '', c)); t.append(tr); }
          body.append(el('div', 'doc-scroll')); body.firstChild.append(t);
          if (rows.length > ROW_CAP) body.append(el('p', 'doc-note', `처음 ${ROW_CAP}줄만 보입니다(전체 ${rows.length}줄). 전체는 원본을 받아 엑셀이나 이음오피스에서 여세요.`));
          for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.s === name));
        };
        for (const name of wb.SheetNames) { const b = el('button', 'doc-tab', name); b.type = 'button'; b.dataset.s = name; b.addEventListener('click', () => show(name)); tabs.append(b); }
        stage.append(tabs, body); show(wb.SheetNames[0]);
        return { pages: wb.SheetNames.length, text: async () => wb.SheetNames.map(n => `# ${n}\n${win.XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n') };
      },
      async pptx(bytes) {
        await loadScript('vendor/office/jszip.min.js');
        const zip = await win.JSZip.loadAsync(bytes), names = slideOrder(Object.keys(zip.files)), texts = [];
        for (const n of names) texts.push(xmlTexts(await zip.files[n].async('string'), 't'));
        stage.append(el('p', 'doc-note', '파워포인트는 슬라이드별 글자만 보여 줍니다. 배치와 그림까지 보려면 원본을 받아 파워포인트나 이음오피스에서 여세요.'));
        texts.forEach((t, i) => { const c = el('section', 'doc-slide'); c.append(el('h3', '', `슬라이드 ${i + 1}`)); for (const line of t.filter(Boolean)) c.append(el('p', '', line)); stage.append(c); });
        return { pages: names.length, text: async () => texts.map((t, i) => `[슬라이드 ${i + 1}]\n${t.join('\n')}`).join('\n\n') };
      },
      async pdf(bytes) {
        await loadScript('vendor/pdfjs/pdf.min.js'); // isEvalSupported:false: pdf.js 3.x 글꼴 처리의 코드 실행 취약점(CVE-2024-4367) 완화. 이 페이지 CSP도 unsafe-eval을 허용하지 않는다
        win.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        const pdf = await win.pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise, n = pdf.numPages, width = Math.min(stage.clientWidth || 360, 900);
        more(n, n, async i => {
          const page = await pdf.getPage(i + 1), vp0 = page.getViewport({ scale: 1 }), scale = width / vp0.width, vp = page.getViewport({ scale }), dpr = win.devicePixelRatio || 1;
          const cv = el('canvas', 'doc-page'); cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr); cv.style.width = '100%'; cv.setAttribute('aria-label', `${i + 1}쪽`);
          stage.insertBefore(cv, stage.lastChild); await page.render({ canvasContext: cv.getContext('2d'), viewport: page.getViewport({ scale: scale * dpr }) }).promise;
        });
        return { pages: n, text: async () => { const out = []; for (let i = 1; i <= n; i++) out.push((await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str).join(' ')); return out.join('\n\n'); } };
      },
      async img(bytes, file) { const i = el('img', 'doc-page'); i.alt = file.name; i.src = URL.createObjectURL(new Blob([bytes], { type: file.type || 'image/*' })); stage.append(i); return { text: null }; },
      async text(bytes) { const t = decodeText(bytes); stage.append(el('pre', 'doc-text', t.length > 200000 ? t.slice(0, 200000) + '\n…(이하 생략)' : t)); return { text: async () => t }; },
      async odt(bytes) {
        await loadScript('vendor/office/jszip.min.js'); const zip = await win.JSZip.loadAsync(bytes), xml = await zip.files['content.xml'].async('string');
        const t = xml.replace(/<\/text:(?:p|h)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        stage.append(el('pre', 'doc-text', t)); return { text: async () => t };
      },
    };

    async function open(file) {
      const kind = kindOf(file.name); stage.textContent = ''; bar.hidden = true; cur = null;
      if (!kind) { say(`${file.name}: 이 형식은 아직 열지 못합니다. 한글·워드·엑셀·파워포인트·PDF·그림·글 파일을 고르세요.`, true); return; }
      if (file.size > 60 * 1024 * 1024) { say('60MB가 넘는 파일은 열지 않습니다. 이음오피스 앱에서 여세요.', true); return; }
      say(`${file.name} 여는 중…`);
      try {
        const res = await openers[kind](await file.arrayBuffer(), file);
        cur = { file, text: res.text };
        say(`${file.name} · ${(file.size / 1024).toFixed(0)}KB${res.pages ? ` · ${res.pages}${kind === 'sheet' ? '시트' : kind === 'pptx' ? '장' : '쪽'}` : ''}`);
        bar.hidden = false; $('docText').hidden = !res.text;
      } catch (err) { stage.textContent = ''; say(`${file.name}: 열지 못했습니다(${err && err.message ? err.message : '파일이 손상됐거나 암호가 걸려 있습니다'}). 암호가 있으면 풀어서 다시 고르세요.`, true); }
    }
    input.addEventListener('change', () => { if (input.files[0]) open(input.files[0]); });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files[0]) open(e.dataTransfer.files[0]); });
    $('docOrig').addEventListener('click', () => cur && save(cur.file.name, cur.file, cur.file.type || 'application/octet-stream'));
    $('docText').addEventListener('click', async () => { if (!cur || !cur.text) return; save(cur.file.name.replace(/\.[^.]+$/, '') + '.txt', '﻿' + (await cur.text()), 'text/plain;charset=utf-8'); });
    $('docPrint').addEventListener('click', () => win.print());
  }
  return { kindOf, xmlTexts, slideOrder, decodeText, init };
});
