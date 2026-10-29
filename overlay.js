/* 우리 파일 얹기: 부서 엑셀·CSV 대장을 같은 지도에 겹친다. 파일은 이 브라우저 메모리에서만 처리한다(서버 전송·저장 없음).
   위쪽은 노드 시험용 순수 함수(파일 읽기·열 인식·좌표 변환·집계), 아래쪽은 화면 연결부다.
   외부 라이브러리 없음: XLSX는 ZIP+XML을 직접 읽고, 좌표 변환은 TM 투영 역변환 공식을 직접 구현했다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewOverlay = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAX_FILE = 50 * 1024 * 1024, MAX_ROWS = 200000, MAX_COLS = 200, MAX_UNZIP = 120 * 1024 * 1024, MAX_DRAW = 20000, MAX_LABELS = 300;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── 1. 글자 판별 · CSV ──
  // BOM이 있으면 그대로, 없으면 UTF-8로 엄격히 읽어 보고 깨지면 CP949(euc-kr)로 읽는다
  function decodeText(input) {
    const u = input instanceof Uint8Array ? input : new Uint8Array(input);
    const has = (...b) => b.every((v, i) => u[i] === v);
    if (has(0xEF, 0xBB, 0xBF)) return { text: new TextDecoder('utf-8').decode(u), encoding: 'UTF-8' };
    if (has(0xFF, 0xFE)) return { text: new TextDecoder('utf-16le').decode(u), encoding: 'UTF-16' };
    if (has(0xFE, 0xFF)) return { text: new TextDecoder('utf-16be').decode(u), encoding: 'UTF-16' };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u), encoding: 'UTF-8' }; }
    catch (e) { return { text: new TextDecoder('euc-kr').decode(u), encoding: 'CP949' }; }
  }
  function parseCSV(text) {
    const s = String(text).replace(/^﻿/, '');
    const head = s.slice(0, (s.search(/[\r\n]/) + 1 || s.length + 1) - 1).replace(/"[^"]*"/g, '');
    const count = ch => head.split(ch).length - 1;
    const d = [',', '\t', ';'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }
  // 2차원 배열 → { headers, rows, excluded }. 빈 제목은 '열N', 중복 제목은 '(2)'를 붙인다
  function toTable(grid) {
    const g = grid.filter(r => r.some(v => String(v).trim() !== ''));
    if (g.length < 2) throw new Error('제목 줄과 자료 줄이 있는 파일이 필요합니다.');
    const width = g.reduce((m, r) => Math.max(m, r.length), 0);
    if (width > MAX_COLS) throw new Error(`열이 ${MAX_COLS}개를 넘어 읽지 않습니다.`);
    if (g.length - 1 > MAX_ROWS) throw new Error(`행이 ${MAX_ROWS.toLocaleString('ko-KR')}개를 넘어 읽지 않습니다.`);
    const seen = new Map();
    const headers = Array.from({ length: width }, (_, c) => {
      let h = String(g[0][c] == null ? '' : g[0][c]).trim() || `열${c + 1}`;
      const n = (seen.get(h) || 0) + 1; seen.set(h, n);
      return n > 1 ? `${h}(${n})` : h;
    });
    const rows = g.slice(1).map(r => Array.from({ length: width }, (_, c) => (r[c] == null ? '' : String(r[c]).trim())));
    return { headers, rows, excluded: new Set() };
  }

  // ── 2. XLSX(ZIP + XML 최소 파서) ──
  async function inflateRaw(u8, limit) {
    if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다. 엑셀에서 CSV로 저장해 올려 주세요.');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(u8).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader(), chunks = []; let n = 0;
    for (;;) {
      const { done, value } = await r.read(); if (done) break;
      n += value.length; if (n > limit) { r.cancel().catch(() => {}); throw new Error('압축을 푼 크기가 너무 큽니다.'); }
      chunks.push(value);
    }
    const out = new Uint8Array(n); let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
  }
  function zipEntries(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('엑셀(xlsx) 파일이 아닙니다. CSV 또는 .xlsx 파일을 올려 주세요.');
    const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    if (count === 0xFFFF || p === 0xFFFFFFFF) throw new Error('너무 큰 ZIP 형식은 읽지 않습니다.');
    const dec = new TextDecoder('utf-8'), map = new Map();
    for (let k = 0; k < count; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('엑셀 파일 구조가 깨져 있습니다.');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      map.set(dec.decode(u8.subarray(p + 46, p + 46 + nl)), { flags, method, csize, usize, off });
      p += 46 + nl + el + cl;
    }
    return map;
  }
  async function zipRead(u8, map, name) {
    const ent = map.get(name); if (!ent) return null;
    if (ent.flags & 1) throw new Error('암호가 걸린 파일은 읽을 수 없습니다. 암호를 풀고 저장해 올려 주세요.');
    if (ent.usize > MAX_UNZIP) throw new Error('압축을 푼 크기가 너무 큽니다.');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (ent.off + 30 > u8.length || dv.getUint32(ent.off, true) !== 0x04034b50) throw new Error('엑셀 파일 구조가 깨져 있습니다.');
    const start = ent.off + 30 + dv.getUint16(ent.off + 26, true) + dv.getUint16(ent.off + 28, true);
    const data = u8.subarray(start, start + ent.csize);
    if (ent.method === 0) return new TextDecoder('utf-8').decode(data);
    if (ent.method === 8) return new TextDecoder('utf-8').decode(await inflateRaw(data, MAX_UNZIP));
    throw new Error('지원하지 않는 압축 방식입니다.');
  }
  const xmlText = s => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, t) => (t[0] === '#' ? String.fromCodePoint(t[1] === 'x' ? parseInt(t.slice(2), 16) : +t.slice(1)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[t]));
  const attrs = str => { const o = {}; str.replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (_, k, v) => { o[k] = xmlText(v); return ''; }); return o; };
  // <t>…</t> 글자 조각을 이어 붙인다(rPh 발음 표기는 뺀다)
  const tText = x => { let s = ''; x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g, (_, t) => { s += t || ''; return ''; }); return xmlText(s); };
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  function sheetGrid(xml, shared) {
    const grid = []; let maxC = 0;
    xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (_, a, inner) => {
      const at = attrs(a), m = /^([A-Z]+)(\d+)$/.exec(at.r || ''); if (!m || inner == null) return '';
      const r = +m[2] - 1, c = colIndex(m[1]); if (r > MAX_ROWS) throw new Error(`행이 ${MAX_ROWS.toLocaleString('ko-KR')}개를 넘어 읽지 않습니다.`);
      if (c >= MAX_COLS) throw new Error(`열이 ${MAX_COLS}개를 넘어 읽지 않습니다.`);
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner); let val = '';
      if (at.t === 's') val = v ? shared[+v[1]] || '' : '';
      else if (at.t === 'inlineStr') val = tText(inner);
      else if (at.t === 'b') val = v && v[1] === '1' ? 'TRUE' : 'FALSE';
      else if (at.t === 'e') val = '';
      else val = v ? xmlText(v[1]) : '';
      (grid[r] = grid[r] || [])[c] = val; if (c + 1 > maxC) maxC = c + 1;
      return '';
    });
    return Array.from(grid, r => Array.from({ length: maxC }, (_, c) => (r && r[c] != null ? r[c] : '')));
  }
  async function parseXlsx(input) {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input), map = zipEntries(u8);
    const wb = await zipRead(u8, map, 'xl/workbook.xml');
    if (wb == null) throw new Error('엑셀(xlsx) 파일이 아닙니다. CSV 또는 .xlsx 파일을 올려 주세요.');
    const rels = {}; ((await zipRead(u8, map, 'xl/_rels/workbook.xml.rels')) || '').replace(/<Relationship\b([^>]*?)\/?>/g, (_, a) => { const at = attrs(a); rels[at.Id] = at.Target; return ''; });
    const sst = await zipRead(u8, map, 'xl/sharedStrings.xml'), shared = [];
    if (sst) sst.replace(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, (_, t) => { shared.push(tText(t || '')); return ''; });
    const sheets = []; const list = [];
    wb.replace(/<sheet\b([^>]*?)\/?>/g, (_, a) => { list.push(attrs(a)); return ''; });
    for (const s of list) {
      if (/hidden/i.test(s.state || '')) continue;
      const t = rels[s['r:id']]; if (!t) continue;
      const xml = await zipRead(u8, map, t[0] === '/' ? t.slice(1) : 'xl/' + t); if (xml == null) continue;
      const rows = sheetGrid(xml, shared); if (rows.length >= 2) sheets.push({ name: s.name || '시트', rows });
    }
    if (!sheets.length) throw new Error('자료가 있는 시트를 찾지 못했습니다. 제목 줄과 자료 줄이 있어야 합니다.');
    return sheets;
  }
  // 파일 바이트 → { encoding, sheets:[{ name, rows }] }
  async function readFileBytes(input, name) {
    const u = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (u.length > MAX_FILE) throw new Error('파일이 50MB를 넘어 읽지 않습니다.');
    if (u.length >= 4 && u[0] === 0xD0 && u[1] === 0xCF && u[2] === 0x11 && u[3] === 0xE0) throw new Error('예전 형식(.xls)은 읽지 않습니다. 엑셀에서 ‘.xlsx’ 또는 ‘CSV UTF-8’로 저장해 올려 주세요.');
    if (u.length >= 4 && u[0] === 0x50 && u[1] === 0x4B) return { encoding: 'XLSX', sheets: await parseXlsx(u) };
    if (/\.xlsx$/i.test(name || '')) throw new Error('엑셀(xlsx) 파일이 아닙니다. CSV 또는 .xlsx 파일을 올려 주세요.');
    const { text, encoding } = decodeText(u), rows = parseCSV(text);
    return { encoding, sheets: [{ name: '', rows }] };
  }

  // ── 3. 숫자 · 개인정보 열 ──
  function toNum(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return NaN;
    if (s.includes(',') ? !/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) : !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s.replace(/,/g, ''));
  }
  const PII_HEAD = [
    [/주민(등록)?번호|rrn|ssn|resident.?reg/i, '주민등록번호'],
    [/전화|연락처|휴대|핸드폰|폰번호|\btel\b|phone|mobile|\bfax\b|팩스/i, '전화번호'],
    [/이메일|e-?mail/i, '이메일'],
    [/^(이름|성명|성함|name)$|성명|성함|이름\(|소유자|소유주|신청인|민원인|세대주|거주자|임차인|대표자|담당자|작성자|입주자|제보자|(관리|담당|소유|대표|신청)자명|\bowner\b|applicant/i, '이름'],
    [/생년월일|생일|birth/i, '생년월일'],
    [/계좌|account.?(no|num)/i, '계좌번호'],
  ];
  const rrnOk = v => { const m = /(?<!\d)(\d{2})(\d{2})(\d{2})-?([1-8])\d{6}(?!\d)/.exec(v); return !!m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31; };
  const PHONE_RE = /(?<![\d.])0(?:1[016-9]|2|[3-6][1-5]|70)-?\d{3,4}-?\d{4}(?!\d)/, MAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
  const sample = (rows, c, max = 3000) => { const out = []; for (let i = 0; i < rows.length && out.length < max; i++) { const v = rows[i][c]; if (v !== '') out.push(v); } return out; };
  // 제목 또는 값 모양으로 개인정보 가능 열을 찾는다. 값 검사는 주민번호 1건, 전화·이메일 10% 이상
  function findPII(table) {
    const found = [];
    table.headers.forEach((h, c) => {
      if (table.excluded.has(c)) return;
      let why = (PII_HEAD.find(([re]) => re.test(h)) || [])[1];
      if (!why) {
        const vals = sample(table.rows, c, 2000);
        if (vals.some(rrnOk)) why = '주민등록번호 모양';
        else if (vals.length && vals.filter(v => PHONE_RE.test(v)).length / vals.length >= 0.1) why = '전화번호 모양';
        else if (vals.length && vals.filter(v => MAIL_RE.test(v)).length / vals.length >= 0.1) why = '이메일 모양';
      }
      if (why) found.push({ c, header: h, reason: why });
    });
    return found;
  }
  // 표시·집계에서 빼고, 값도 메모리에서 비운다
  function excludeColumns(table, found) {
    found.forEach(f => { table.excluded.add(f.c); table.rows.forEach(r => { r[f.c] = ''; }); });
    return table;
  }

  // ── 4. 열 자동 인식 ──
  const SIDO_RE = '(?:1[1]|2[1-69]|3[1-9]|4[1-8]|5[0-2])';
  const ADM8 = new RegExp(`^${SIDO_RE}\\d{6}$`), BJD10 = new RegExp(`^${SIDO_RE}\\d{8}$`);
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  function detectColumns(table) {
    const cols = [];
    table.headers.forEach((h, c) => {
      if (table.excluded.has(c)) return;
      const vals = sample(table.rows, c), nums = vals.map(toNum).filter(Number.isFinite);
      cols.push({ c, h, vals, nums, numeric: vals.length > 0 && nums.length / vals.length >= 0.8, med: median(nums) });
    });
    const within = (col, lo, hi) => col.numeric && col.med >= lo && col.med <= hi;
    const pick = (re, test) => cols.find(k => re.test(k.h) && test(k));
    let lat = pick(/위도|latitude|\blat\b|^lat/i, k => within(k, 33, 132)), lon = pick(/경도|longitude|\blon\b|\blng\b|^lon|^lng/i, k => within(k, 33, 132));
    if (lat && lon && lat.med > 100 && lon.med < 100) [lat, lon] = [lon, lat]; // 제목과 값이 거꾸로면 바로잡는다
    if (lat && !within(lat, 33, 39)) lat = null;
    if (lon && !within(lon, 124, 132)) lon = null;
    const x = pick(/(^|[^a-z0-9])x([^a-z0-9]|$)|x좌표|좌표x|easting|동서/i, k => k.numeric), y = pick(/(^|[^a-z0-9])y([^a-z0-9]|$)|y좌표|좌표y|northing|남북/i, k => k.numeric);
    let xy = null, crs = 5186;
    if (x && y && x !== y) {
      if (within(x, 124, 132) && within(y, 33, 39)) { if (!lat && !lon) { lon = x; lat = y; } } // X/Y 이름이지만 값은 경위도
      else { xy = { x, y }; if (x.med >= 600000 && y.med >= 1200000) crs = 5179; }
    }
    const code = re => cols.find(k => k.vals.length && k.vals.filter(v => re.test(v)).length / k.vals.length >= 0.9);
    const adm = code(ADM8), bjd = code(BJD10), addr = cols.find(k => /주소|지번|소재지|address/i.test(k.h));
    const used = new Set([lat, lon, xy && xy.x, xy && xy.y, adm, bjd].filter(Boolean).map(k => k.c));
    const numeric = cols.filter(k => k.numeric && !used.has(k.c)).map(k => k.c);
    const method = lat && lon ? 'latlon' : xy ? 'xy' : adm ? 'adm8' : bjd ? 'bjd10' : addr ? 'addr' : 'latlon';
    return { method, lat: lat ? lat.c : -1, lon: lon ? lon.c : -1, x: xy ? xy.x.c : -1, y: xy ? xy.y.c : -1, crs, adm: adm ? adm.c : -1, bjd: bjd ? bjd.c : -1, addr: addr ? addr.c : -1, numeric };
  }

  // ── 5. 좌표 변환(TM 투영 역변환 + 7-파라미터 변환) ──
  const ELL = { GRS80: { a: 6378137, f: 1 / 298.257222101 }, BESSEL: { a: 6377397.155, f: 1 / 299.1528128 }, WGS84: { a: 6378137, f: 1 / 298.257223563 } };
  // 5174는 EPSG:5191(Molodensky-Badekas, coordinate frame) 변환값을 쓴다. 5186·5179는 KGD2002라 WGS84와 같게 본다
  const CRS = {
    5186: { label: 'EPSG:5186 중부원점(GRS80)', ell: 'GRS80', lat0: 38, lon0: 127, k0: 1, x0: 200000, y0: 600000 },
    5179: { label: 'EPSG:5179 UTM-K', ell: 'GRS80', lat0: 38, lon0: 127.5, k0: 0.9996, x0: 1000000, y0: 2000000 },
    5174: { label: 'EPSG:5174 Bessel 중부원점(구 도면)', ell: 'BESSEL', lat0: 38, lon0: 127 + 10.405 / 3600, k0: 1, x0: 200000, y0: 500000,
      shift: { t: [-145.907, 505.034, 685.756], r: [-1.162, 2.347, 1.592], s: 6.342e-6, p: [-3159521.31, 4068151.32, 3748113.85] } },
  };
  const RAD = Math.PI / 180;
  function tmInverse(E, N, p) {
    const { a, f } = ELL[p.ell], e2 = f * (2 - f), es = Math.sqrt(e2), n = f / (2 - f);
    const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64 + n ** 6 / 256);
    const b = [n / 2 - 2 / 3 * n ** 2 + 37 / 96 * n ** 3 - n ** 4 / 360, n ** 2 / 48 + n ** 3 / 15 - 437 / 1440 * n ** 4, 17 / 480 * n ** 3 - 37 / 840 * n ** 4, 4397 / 161280 * n ** 4];
    const p0 = p.lat0 * RAD, M0 = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p0 - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p0)
      + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p0) - 35 * e2 ** 3 / 3072 * Math.sin(6 * p0));
    const xi = (N - p.y0 + p.k0 * M0) / (p.k0 * A), eta = (E - p.x0) / (p.k0 * A);
    let xi1 = xi, eta1 = eta;
    b.forEach((bj, j) => { const k = 2 * (j + 1); xi1 -= bj * Math.sin(k * xi) * Math.cosh(k * eta); eta1 -= bj * Math.cos(k * xi) * Math.sinh(k * eta); });
    const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1)), psi = Math.atanh(Math.sin(chi));
    let phi = chi;
    for (let i = 0; i < 8; i++) phi = Math.atan(Math.sinh(psi + es * Math.atanh(es * Math.sin(phi)))); // 등각위도 → 지리위도
    return [phi, p.lon0 * RAD + Math.atan2(Math.sinh(eta1), Math.cos(xi1))];
  }
  function besselToWgs84(phi, lam, sh) {
    const { a, f } = ELL.BESSEL, e2 = f * (2 - f), nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const S = [nu * Math.cos(phi) * Math.cos(lam), nu * Math.cos(phi) * Math.sin(lam), nu * (1 - e2) * Math.sin(phi)];
    const d = S.map((v, i) => v - sh.p[i]), [rx, ry, rz] = sh.r.map(v => v * RAD / 3600), k = 1 + sh.s;
    const T = [sh.p[0] + sh.t[0] + k * (d[0] + rz * d[1] - ry * d[2]), sh.p[1] + sh.t[1] + k * (-rz * d[0] + d[1] + rx * d[2]), sh.p[2] + sh.t[2] + k * (ry * d[0] - rx * d[1] + d[2])];
    const w = ELL.WGS84, we2 = w.f * (2 - w.f), pr = Math.hypot(T[0], T[1]);
    let ph = Math.atan2(T[2], pr * (1 - we2));
    for (let i = 0; i < 6; i++) { const N = w.a / Math.sqrt(1 - we2 * Math.sin(ph) ** 2), h = pr / Math.cos(ph) - N; ph = Math.atan2(T[2], pr * (1 - we2 * N / (N + h))); }
    return [ph, Math.atan2(T[1], T[0])];
  }
  // x(동서), y(남북) 미터 → [위도, 경도] (WGS84 도). 모르는 좌표계·숫자 아님은 NaN
  function toWgs84(epsg, x, y) {
    const p = CRS[epsg];
    if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return [NaN, NaN];
    let [phi, lam] = tmInverse(x, y, p);
    if (p.shift) [phi, lam] = besselToWgs84(phi, lam, p.shift);
    return [phi / RAD, lam / RAD];
  }
  const inKorea = (lat, lon) => lat >= 32.5 && lat <= 39 && lon >= 124 && lon <= 132.3; // 마라도~백령도·독도를 덮는 넉넉한 상자
  // 표의 위치 열 → 지도에 놓을 점. 범위 밖·빈 값은 따로 센다. x/y를 바꿨을 때 더 잘 맞으면 swapHint로 알린다
  function locate(table, o) {
    const conv = (a, b) => (o.method === 'latlon' ? [a, b] : toWgs84(o.crs, a, b));
    const ca = o.method === 'latlon' ? o.lat : o.x, cb = o.method === 'latlon' ? o.lon : o.y;
    const pts = []; let empty = 0, outside = 0, swapped = 0;
    table.rows.forEach((r, i) => {
      const a = toNum(r[ca]), b = toNum(r[cb]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) { empty++; return; }
      const [lat, lon] = o.swap ? conv(b, a) : conv(a, b);
      if (inKorea(lat, lon)) pts.push({ i, lat, lon }); else outside++;
      const [l2, o2] = o.swap ? conv(a, b) : conv(b, a);
      if (inKorea(l2, o2)) swapped++;
    });
    return { pts, empty, outside, total: table.rows.length, swapHint: swapped > pts.length && swapped > 0 };
  }

  // ── 6. 동별 집계 ──
  function ringArea(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; }
  // GeoJSON feature 목록 → 점-다각형·중심 계산용 개체
  function compileFeatures(features) {
    return features.filter(f => f && f.geometry && /Polygon/.test(f.geometry.type)).map(f => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const bb = [Infinity, Infinity, -Infinity, -Infinity]; let big = null, bigA = -1;
      polys.forEach(poly => { poly[0].forEach(([x, y]) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }); const a = Math.abs(ringArea(poly[0])); if (a > bigA) { bigA = a; big = poly[0]; } });
      let cx = 0, cy = 0, A = 0; // 가장 큰 고리의 도형 중심(shoelace)
      for (let i = 0, j = big.length - 1; i < big.length; j = i++) { const w = big[j][0] * big[i][1] - big[i][0] * big[j][1]; A += w; cx += (big[j][0] + big[i][0]) * w; cy += (big[j][1] + big[i][1]) * w; }
      const center = A ? [cy / (3 * A), cx / (3 * A)] : [(bb[1] + bb[3]) / 2, (bb[0] + bb[2]) / 2];
      const pr = f.properties || {};
      return { code: String(pr.code == null ? '' : pr.code), name: String(pr.name == null ? '' : pr.name), polys, bb, center };
    }).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  }
  function inRing(x, y, ring) {
    let ins = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  function featureAt(feats, lat, lon) {
    for (const f of feats) {
      if (lon < f.bb[0] || lon > f.bb[2] || lat < f.bb[1] || lat > f.bb[3]) continue;
      if (f.polys.some(poly => inRing(lon, lat, poly[0]) && !poly.slice(1).some(h => inRing(lon, lat, h)))) return f;
    }
    return null;
  }
  // items: [{ code(동 코드 또는 null), v(숫자 또는 NaN) }] → 코드 순 표. 경계가 80개를 넘으면 점이 있는 곳만 보인다
  function aggregate(feats, items) {
    const byCode = new Map(feats.map(f => [f.code, { code: f.code, name: f.name, count: 0, sum: 0, valued: 0 }]));
    let outside = 0;
    items.forEach(it => { const g = byCode.get(it.code); if (!g) { outside++; return; } g.count++; if (Number.isFinite(it.v)) { g.sum += it.v; g.valued++; } });
    const all = [...byCode.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)).map(g => ({ ...g, sum: Number(g.sum.toFixed(6)) }));
    return { rows: feats.length > 80 ? all.filter(g => g.count > 0) : all, outside };
  }
  const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(rows, valueLabel) {
    const head = ['코드', '이름', '점 개수'].concat(valueLabel ? [`${valueLabel} 합계`] : []);
    return [head].concat(rows.map(g => [g.code, g.name, g.count].concat(valueLabel ? [g.sum] : []))).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  const api = { CRS, MAX_DRAW, MAX_LABELS, decodeText, parseCSV, toTable, parseXlsx, readFileBytes, toNum, findPII, excludeColumns, detectColumns, tmInverse, toWgs84, inKorea, locate, compileFeatures, featureAt, aggregate, toCsv };
  if (typeof document === 'undefined') return api;

  // ── 7. 브라우저 ──
  // map.js가 만든 Leaflet 지도를 얻으려고 Leaflet이 실릴 때 init hook을 건다(map.js는 지도 객체를 내보내지 않는다)
  const maps = [];
  (function hookLeaflet() {
    let hooked = false;
    const hook = () => { if (window.L && window.L.Map && !hooked) { hooked = true; window.L.Map.addInitHook(function () { maps.push(this); }); } };
    const D = window.RenewDashboard;
    if (window.L) hook();
    else if (D && typeof D.loadLeaflet === 'function') { const orig = D.loadLeaflet; D.loadLeaflet = function () { return orig.apply(this, arguments).then(v => { hook(); return v; }); }; }
  })();
  const liveMap = () => maps.filter(m => m._container && m._container.isConnected).pop() || null;

  function boot() {
    const app = document.getElementById('overlayApp'); if (!app) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COLORS = { 남색: '#1f4e9c', 주황: '#b45309', 보라: '#6d3fa0', 청록: '#0b7a75', 진회색: '#374151' }, SIZES = { 작게: 4, 보통: 6, 크게: 9 };
    const S = { sheets: null, table: null, pii: [], det: null, method: null, pts: null, codes: null, loc: null, agg: null, valueLabel: '' };
    let group = null, timer = 0;

    app.innerHTML = `<details class="ov" id="overlay"><summary>우리 파일 얹기<small>부서 엑셀·CSV 대장을 같은 지도에</small></summary>
<div class="ov-body">
<div class="ov-privacy"><p><strong>파일은 이 브라우저 안에서만 처리합니다.</strong></p><p>서버로 보내지 않고, 저장하지 않습니다.</p><p>새로고침하거나 ‘지우기’를 누르면 사라집니다.</p></div>
<div class="ov-pick"><label for="ovFile">엑셀(.xlsx) 또는 CSV 파일</label><input id="ovFile" type="file" accept=".xlsx,.csv,.txt"><p class="ov-hint">글자 깨짐은 UTF-8·CP949를 자동으로 가립니다.<br>예전 .xls는 엑셀에서 .xlsx로 저장해 올려 주세요.</p></div>
<p class="ov-status" role="status" aria-live="polite" data-ov-status></p>
<div data-ov-after hidden>
<p class="ov-info" data-ov-info></p>
<div class="ov-sheet" data-ov-sheet hidden><label for="ovSheet">시트</label><select id="ovSheet"></select></div>
<div class="ov-warn" role="alert" data-ov-pii hidden></div>
<fieldset class="ov-fs" data-ov-loc><legend>1. 위치를 어떻게 읽을까요</legend></fieldset>
<div class="ov-scroll" tabindex="0" role="region" aria-label="파일 앞부분 미리보기" data-ov-prev></div>
<fieldset class="ov-fs" data-ov-style><legend>2. 모양</legend></fieldset>
<div class="ov-actions"><button type="button" class="btn" data-ov-place>지도에 얹기</button><button type="button" class="btn ghost" data-ov-clear>지우기</button></div>
<div data-ov-result></div>
</div></div></details>`;
    const $ = sel => app.querySelector(sel);
    const status = (msg, bad) => { const el = $('[data-ov-status]'); el.textContent = msg || ''; el.classList.toggle('is-bad', !!bad); };
    const opts = (cols, sel, blank) => (blank ? '<option value="-1">선택 안 함</option>' : '') + cols.map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${esc(S.table.headers[c])}</option>`).join('');
    const allCols = () => S.table.headers.map((_, c) => c).filter(c => !S.table.excluded.has(c));
    const val = name => { const el = app.querySelector(`[name="${name}"]`); return el ? el.value : ''; };
    const pickedMethod = () => { const r = app.querySelector('[name="ovMethod"]:checked'); return r ? r.value : 'latlon'; };

    function reset() {
      clearLayer(); Object.assign(S, { sheets: null, table: null, pii: [], det: null, pts: null, codes: null, loc: null, agg: null, valueLabel: '' });
      $('[data-ov-after]').hidden = true; $('[data-ov-result]').innerHTML = ''; status('');
    }
    function clearLayer() { if (group) { group.remove(); group = null; } }

    function buildForms() {
      const T = S.table, d = S.det, cols = allCols();
      $('[data-ov-info]').textContent = `${S.fileName} · ${T.rows.length.toLocaleString('ko-KR')}행 · ${T.headers.length}열 · ${S.encoding === 'XLSX' ? '엑셀 통합 문서' : '글자 ' + S.encoding}`;
      const pii = $('[data-ov-pii]');
      pii.hidden = !S.pii.length;
      pii.innerHTML = S.pii.length ? `<p><strong>개인정보일 수 있는 열을 제외했습니다.</strong></p><ul>${S.pii.map(f => `<li>‘${esc(f.header)}’ — ${esc(f.reason)}</li>`).join('')}</ul><p>이 열은 미리보기·지도·집계·내려받기에서 빠지고, 값도 메모리에서 지웠습니다.</p><p>시설 이름 열이라면 제목을 ‘시설명’처럼 바꿔 다시 올려 주세요.</p>` : '';
      const radio = (v, t, note) => `<label class="ov-radio"><input type="radio" name="ovMethod" value="${v}"${d.method === v ? ' checked' : ''}> <span><b>${t}</b><small>${note}</small></span></label>`;
      $('[data-ov-loc]').innerHTML = `<legend>1. 위치를 어떻게 읽을까요</legend>
${radio('latlon', '위도·경도', 'WGS84 도(EPSG:4326)')}
<div class="ov-sel" data-ov-m="latlon"><label>위도 열<select name="ovLat">${opts(cols, d.lat, true)}</select></label><label>경도 열<select name="ovLon">${opts(cols, d.lon, true)}</select></label></div>
${radio('xy', 'X·Y 좌표(미터)', '내부 도면: 중부원점·구 중부원점·UTM-K')}
<div class="ov-sel" data-ov-m="xy"><label>X(동서) 열<select name="ovX">${opts(cols, d.x, true)}</select></label><label>Y(남북) 열<select name="ovY">${opts(cols, d.y, true)}</select></label>
<label>좌표계<select name="ovCrs">${Object.keys(CRS).map(k => `<option value="${k}"${+k === d.crs ? ' selected' : ''}>${CRS[k].label}</option>`).join('')}</select></label>
<label class="ov-check"><input type="checkbox" name="ovSwap"> X와 Y 열 바꿔 읽기</label>
<p class="ov-hint">5186과 5174는 값 범위가 비슷해 자동으로 가릴 수 없습니다.<br>도면의 좌표계를 확인해 고르세요. 변환 결과가 한국 범위 밖이면 알려 드립니다.</p></div>
${radio('adm8', '행정동 코드(8자리)', '동별로 모아 동 중심에 표시')}
<div class="ov-sel" data-ov-m="adm8"><label>행정동 코드 열<select name="ovAdm">${opts(cols, d.adm, true)}</select></label></div>
${radio('bjd10', '법정동 코드(10자리)', '행정동 경계와 일대일이 아니라 앞 5자리(시군구)까지만 모읍니다')}
<div class="ov-sel" data-ov-m="bjd10"><label>법정동 코드 열<select name="ovBjd">${opts(cols, d.bjd, true)}</select></label></div>
${radio('addr', '지번 주소', '좌표가 없는 파일')}
<div class="ov-sel" data-ov-m="addr"><p class="ov-hint"><strong>좌표 없음: 지오코딩은 외부 전송이라 하지 않음.</strong><br>주소를 좌표로 바꾸려면 파일 내용을 외부 서버로 보내야 하므로 이 기능에서는 하지 않습니다.<br>위도·경도나 X·Y 좌표 열, 또는 행정동 코드 열을 함께 담아 올려 주세요.</p></div>`;
      const num = d.numeric;
      $('[data-ov-style]').innerHTML = `<legend>2. 모양</legend>
<div class="ov-sel"><label>색<select name="ovColor">${Object.keys(COLORS).map(k => `<option>${k}</option>`).join('')}</select></label>
<label>크기<select name="ovSize">${Object.keys(SIZES).map(k => `<option${k === '보통' ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
<label>숫자 열(크기·합계)<select name="ovNum">${opts(num, -1, true)}</select></label>
<label>라벨 열<select name="ovLabel">${opts(cols, -1, true)}</select></label></div>
<p class="ov-hint">숫자 열을 고르면 점 크기가 값에 비례하고, 동별 표에 합계가 붙습니다.<br>크기는 값의 크기일 뿐 평가나 순위가 아닙니다.</p>`;
      const shown = cols.slice(0, 8);
      $('[data-ov-prev]').innerHTML = `<table class="ov-table"><caption>앞 5행 (처음 ${shown.length}열)</caption><thead><tr>${shown.map(c => `<th scope="col">${esc(T.headers[c])}</th>`).join('')}</tr></thead><tbody>${T.rows.slice(0, 5).map(r => `<tr>${shown.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      syncMethod();
    }
    function syncMethod() { const m = pickedMethod(); app.querySelectorAll('[data-ov-m]').forEach(el => { el.hidden = el.dataset.ovM !== m; }); }

    async function load(file) {
      reset();
      if (!file) return;
      status('읽는 중입니다…');
      try {
        const r = await readFileBytes(await file.arrayBuffer(), file.name);
        S.sheets = r.sheets; S.encoding = r.encoding; S.fileName = file.name;
        const sel = $('#ovSheet'); sel.innerHTML = S.sheets.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');
        $('[data-ov-sheet]').hidden = S.sheets.length < 2;
        useSheet(0);
      } catch (e) { reset(); status(e.message || '파일을 읽지 못했습니다.', true); }
    }
    function useSheet(i) {
      clearLayer(); S.pts = S.codes = S.agg = null; $('[data-ov-result]').innerHTML = '';
      S.table = toTable(S.sheets[i].rows);
      S.pii = findPII(S.table); excludeColumns(S.table, S.pii);
      S.det = detectColumns(S.table);
      $('[data-ov-after]').hidden = false; buildForms();
      status(`${S.table.rows.length.toLocaleString('ko-KR')}행을 읽었습니다. 위치 읽는 방법을 확인한 뒤 ‘지도에 얹기’를 누르세요.`);
    }

    // ── 지도 연결 ──
    function visibleFeatures(len) {
      const map = liveMap(), seen = new Map(); if (!map) return [];
      map.eachLayer(l => { const f = l.feature, c = f && f.properties && String(f.properties.code); if (f && f.geometry && c && c.length === len && !seen.has(c)) seen.set(c, f); });
      return compileFeatures([...seen.values()]);
    }
    const styleOf = () => ({ color: COLORS[val('ovColor')] || '#1f4e9c', base: SIZES[val('ovSize')] || 6, num: +val('ovNum'), label: +val('ovLabel') });
    const rowNum = (i, c) => (c >= 0 ? toNum(S.table.rows[i][c]) : NaN);
    function drawLayer(fit) {
      const map = liveMap(), L = window.L; clearLayer();
      if (!map || !L) return;
      if (!map.getPane('rmOverlay')) map.createPane('rmOverlay').style.zIndex = 620;
      const st = styleOf(), renderer = L.canvas({ pane: 'rmOverlay', padding: 0.5 }); group = L.layerGroup().addTo(map);
      let dots = []; // { lat, lon, size(원 반지름 기준값), text }
      if (S.method === 'latlon' || S.method === 'xy') dots = (S.pts || []).map(p => ({ lat: p.lat, lon: p.lon, v: rowNum(p.i, st.num), text: st.label >= 0 ? S.table.rows[p.i][st.label] : '', i: p.i }));
      else if (S.codes) {
        const feats = new Map(visibleFeatures(S.method === 'adm8' ? 8 : 5).map(f => [f.code, f])), agg = new Map();
        S.codes.forEach(c => { const g = agg.get(c.code) || { n: 0, sum: 0 }; g.n++; if (Number.isFinite(c.v)) g.sum += c.v; agg.set(c.code, g); });
        agg.forEach((g, code) => { const f = feats.get(code); if (f) dots.push({ lat: f.center[0], lon: f.center[1], v: st.num >= 0 ? g.sum : g.n, text: `${f.name} ${g.n}건`, bubble: true }); });
      }
      const over = dots.length > MAX_DRAW; if (over) dots = dots.slice(0, MAX_DRAW);
      const max = dots.reduce((m, d) => (Number.isFinite(d.v) && d.v > m ? d.v : m), 0), scaled = st.num >= 0 || dots.some(d => d.bubble);
      const bounds = [];
      dots.forEach((d, k) => {
        const r = scaled ? 3 + 13 * Math.sqrt(Math.max(0, Number.isFinite(d.v) ? d.v : 0) / (max || 1)) : st.base;
        const m = L.circleMarker([d.lat, d.lon], { renderer, radius: r, color: '#ffffff', weight: 1.2, fillColor: st.color, fillOpacity: 0.85 }).addTo(group);
        bounds.push([d.lat, d.lon]);
        const tipEl = () => { const el = document.createElement('span'); el.textContent = [d.text, Number.isFinite(d.v) && !d.bubble ? `${S.valueLabel || '값'} ${d.v.toLocaleString('ko-KR')}` : '', d.i != null ? `${d.i + 2}행` : ''].filter(Boolean).join(' · '); return el; };
        if (st.label >= 0 && d.text && k < MAX_LABELS) m.bindTooltip(tipEl(), { permanent: true, direction: 'right', className: 'ov-label', opacity: 0.95 });
        else m.on('mouseover click', ev => { if (!ev.target.getTooltip()) ev.target.bindTooltip(tipEl(), { direction: 'top' }); ev.target.openTooltip(); });
      });
      if (fit && bounds.length) { map.fitBounds(L.latLngBounds(bounds).pad(0.1), { maxZoom: 17 }); (map.getContainer().scrollIntoView || (() => {})).call(map.getContainer(), { block: 'center', behavior: reduced ? 'auto' : 'smooth' }); }
      S.drawn = { n: dots.length, over, scaled, max, labelsCut: st.label >= 0 && dots.length > MAX_LABELS };
    }
    function result() {
      const st = styleOf(), out = $('[data-ov-result]'); S.valueLabel = st.num >= 0 ? S.table.headers[st.num] : '';
      const lines = [];
      if (S.loc) {
        const l = S.loc; lines.push(`<li>읽은 행 ${l.total.toLocaleString('ko-KR')}건 중 <b>${l.pts.length.toLocaleString('ko-KR')}건</b>을 지도에 얹었습니다.</li>`);
        if (l.empty) lines.push(`<li>좌표가 비어 있거나 숫자가 아닌 행 ${l.empty.toLocaleString('ko-KR')}건은 뺐습니다.</li>`);
        if (l.outside) lines.push(`<li class="is-warn">변환한 위치가 한국 범위 밖인 행 ${l.outside.toLocaleString('ko-KR')}건은 뺐습니다. 좌표계를 확인하세요.</li>`);
        if (l.swapHint) lines.push('<li class="is-warn">X와 Y를 바꾸면 더 많은 행이 한국 범위에 들어옵니다. ‘X와 Y 열 바꿔 읽기’를 확인하세요.</li>');
      } else if (S.codes) lines.push(`<li>코드가 있는 행 ${S.codes.length.toLocaleString('ko-KR')}건을 모아 중심에 표시했습니다.</li>`);
      if (S.drawn) {
        if (S.drawn.over) lines.push(`<li class="is-warn">점이 많아 처음 ${MAX_DRAW.toLocaleString('ko-KR')}개만 그렸습니다. 아래 집계는 전체 행 기준입니다.</li>`);
        if (S.drawn.labelsCut) lines.push(`<li>라벨은 처음 ${MAX_LABELS}개만 항상 보입니다. 나머지는 점에 올리면 보입니다.</li>`);
        if (S.drawn.scaled && S.drawn.max) lines.push(`<li>점 크기는 ${esc(S.valueLabel || '개수')} 값에 비례합니다(최댓값 ${S.drawn.max.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}). 평가나 순위가 아닙니다.</li>`);
      }
      let table = '';
      const coordMode = S.method === 'latlon' || S.method === 'xy';
      const len = S.method === 'bjd10' ? 5 : 8, feats = visibleFeatures(len);
      if (!liveMap()) table = '<p class="ov-hint">지도가 아직 준비되지 않았습니다. 지도가 나타난 뒤 다시 눌러 주세요.</p>';
      else if (!feats.length) table = `<p class="ov-hint"><strong>동별 집계를 하려면 시군구를 먼저 고르세요.</strong><br>지도에서 시군구를 누르면 그 지역의 읍·면·동 경계가 나타나고, 표가 만들어집니다.</p>`;
      else {
        const items = coordMode ? (S.pts || []).map(p => { const f = featureAt(feats, p.lat, p.lon); return { code: f ? f.code : null, v: rowNum(p.i, st.num) }; })
          : (S.codes || []).map(c => ({ code: c.code, v: c.v }));
        S.agg = aggregate(feats, items);
        const a = S.agg, showSum = st.num >= 0, sumF = n => n.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
        table = `<h3 class="ov-h">${len === 8 ? '동별' : '시군구별'} 집계</h3><div class="ov-scroll" tabindex="0" role="region" aria-label="집계 표"><table class="ov-table"><caption>코드 순 · 순위 아님</caption><thead><tr><th scope="col">코드</th><th scope="col">이름</th><th scope="col" class="num">점 개수</th>${showSum ? `<th scope="col" class="num">${esc(S.valueLabel)} 합계</th>` : ''}</tr></thead><tbody>${a.rows.map(g => `<tr><td>${esc(g.code)}</td><td>${esc(g.name)}</td><td class="num">${g.count.toLocaleString('ko-KR')}</td>${showSum ? `<td class="num">${sumF(g.sum)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
          + (a.outside ? `<p class="ov-hint">${a.outside.toLocaleString('ko-KR')}건은 지금 보이는 지역 밖이라 표에 넣지 않았습니다.</p>` : '')
          + `<button type="button" class="btn" data-ov-csv>집계 CSV 내려받기</button>`;
      }
      out.innerHTML = (lines.length ? `<ul class="ov-notes">${lines.join('')}</ul>` : '') + table;
    }
    function place() {
      const T = S.table; if (!T) return;
      S.method = pickedMethod(); S.pts = S.codes = S.loc = S.agg = null;
      if (S.method === 'addr') { status('좌표 없음: 지오코딩은 외부 전송이라 하지 않음. 위도·경도, X·Y, 행정동 코드 중 하나를 쓰세요.', true); $('[data-ov-result]').innerHTML = ''; clearLayer(); return; }
      const st = styleOf();
      if (S.method === 'latlon' || S.method === 'xy') {
        const o = S.method === 'latlon' ? { method: 'latlon', lat: +val('ovLat'), lon: +val('ovLon') } : { method: 'xy', x: +val('ovX'), y: +val('ovY'), crs: +val('ovCrs'), swap: app.querySelector('[name="ovSwap"]').checked };
        const a = S.method === 'latlon' ? [o.lat, o.lon] : [o.x, o.y];
        if (a.some(c => !(c >= 0))) { status('위치 열을 두 개 모두 골라 주세요.', true); return; }
        S.loc = locate(T, o); S.pts = S.loc.pts;
        if (!S.pts.length) { status('지도에 얹을 수 있는 점이 없습니다. 열과 좌표계를 확인하세요.', true); $('[data-ov-result]').innerHTML = ''; result(); clearLayer(); return; }
      } else {
        const c = +val(S.method === 'adm8' ? 'ovAdm' : 'ovBjd'), re = S.method === 'adm8' ? ADM8 : BJD10;
        if (!(c >= 0)) { status('코드 열을 골라 주세요.', true); return; }
        S.codes = T.rows.map((r, i) => ({ code: String(r[c]).trim(), v: rowNum(i, st.num) })).filter(x => re.test(x.code)).map(x => ({ ...x, code: S.method === 'bjd10' ? x.code.slice(0, 5) : x.code }));
        if (!S.codes.length) { status('올바른 코드가 없습니다. 자릿수와 열을 확인하세요.', true); return; }
      }
      if (!liveMap()) status('지도가 아직 준비되지 않았습니다. 잠시 뒤 다시 눌러 주세요.', true);
      else status('지도에 얹었습니다.');
      S.valueLabel = st.num >= 0 ? T.headers[st.num] : '';
      drawLayer(true); result();
    }
    function download() {
      if (!S.agg) return;
      const blob = new Blob(['﻿', toCsv(S.agg.rows, S.valueLabel)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '우리파일_동별집계.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    app.addEventListener('change', ev => {
      const t = ev.target;
      if (t.id === 'ovFile') { load(t.files && t.files[0]); t.value = ''; }
      else if (t.id === 'ovSheet') { try { useSheet(+t.value); } catch (e) { status(e.message, true); } }
      else if (t.name === 'ovMethod') syncMethod();
      else if (S.table && /^ov(Color|Size|Num|Label)$/.test(t.name || '') && (S.pts || S.codes)) { S.valueLabel = styleOf().num >= 0 ? S.table.headers[styleOf().num] : ''; drawLayer(false); result(); }
    });
    app.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-ov-place')) place();
      else if (b.hasAttribute('data-ov-clear')) { reset(); $('#ovFile').value = ''; status('지웠습니다. 메모리에 남은 파일이 없습니다.'); }
      else if (b.hasAttribute('data-ov-csv')) download();
    });
    const box = $('details');
    box.addEventListener('dragover', ev => { ev.preventDefault(); });
    box.addEventListener('drop', ev => { ev.preventDefault(); box.open = true; load(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]); });
    // 시군구를 바꿔 동 경계가 달라지면 표를 다시 만든다(우리 점은 .feature가 없어 걸러진다)
    const watch = () => {
      const map = liveMap(); if (!map || map.__ovWatched) return;
      map.__ovWatched = true;
      map.on('layeradd layerremove', e => { if (!e.layer.feature || !(S.pts || S.codes)) return; clearTimeout(timer); timer = setTimeout(() => { if (S.table && (S.pts || S.codes)) { if (!(S.method === 'latlon' || S.method === 'xy')) drawLayer(false); result(); } }, 300); });
    };
    const poll = setInterval(() => { if (liveMap()) { watch(); clearInterval(poll); } }, 1000); // 지도는 나중에 만들어진다. 걸고 나면 멈춘다
    if (location.hash === '#overlay') box.open = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  return api;
});
