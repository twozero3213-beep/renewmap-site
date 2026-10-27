/* 리뉴맵 문서 생성기: 브라우저(와 노드)에서 HWPX·XLSX·복사용 표·지도 이미지를 만든다. 외부 라이브러리 없음, 서버 전송 없음.
   문서 내용은 backend/renewmap/export/dong_brief.py(build·build_doc)를, HWPX 구조는 export/hwpx.py(python-hwpx 출력)를 그대로 옮겼다.
   문장 템플릿은 backend/renewmap/report_quality/templates.py와 같은 문구다(landing/data/report_templates.json이 생기면 setTemplates로 바꿀 수 있다).
   숫자는 원장 셀 값과 기준값·템플릿 상수뿐이다. 점수·순위·합산을 만들지 않는다(D13). 위쪽은 노드 시험용 순수 함수, 아래쪽 saveBytes·copyToClipboard·svgToPng만 브라우저 전용이다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewDocgen = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // ══════════════════════════════════════ 바이트·ZIP(STORE)·CRC32
  const enc = new TextEncoder();
  const bytes = d => (typeof d === 'string' ? enc.encode(d) : d);
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(data) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // MS-DOS 시각. 같은 입력이면 같은 바이트가 되도록 현재 시각을 쓰지 않고 when(YYYY-MM-DD)을 쓴다. 없으면 1980-01-01
  function dosStamp(when) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(when || ''));
    const y = m ? Math.min(Math.max(+m[1], 1980), 2107) : 1980, mo = m ? +m[2] : 1, d = m ? +m[3] : 1;
    return { date: ((y - 1980) << 9) | (mo << 5) | d, time: 0 };
  }
  // entries: [{ name, data(string|Uint8Array) }] → Uint8Array. 압축하지 않는다(method 0). 파일명은 UTF-8(플래그 0x0800)
  function zipStore(entries, when) {
    const { date, time } = dosStamp(when), files = entries.map(e => ({ name: bytes(e.name), data: bytes(e.data) }));
    files.forEach(f => { f.crc = crc32(f.data); });
    const total = files.reduce((n, f) => n + 30 + f.name.length + f.data.length + 46 + f.name.length, 22), out = new Uint8Array(total), dv = new DataView(out.buffer);
    let p = 0; const offsets = [];
    for (const f of files) {
      offsets.push(p);
      dv.setUint32(p, 0x04034b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, 0x0800, true); dv.setUint16(p + 8, 0, true);
      dv.setUint16(p + 10, time, true); dv.setUint16(p + 12, date, true); dv.setUint32(p + 14, f.crc, true);
      dv.setUint32(p + 18, f.data.length, true); dv.setUint32(p + 22, f.data.length, true); dv.setUint16(p + 26, f.name.length, true); dv.setUint16(p + 28, 0, true);
      out.set(f.name, p + 30); out.set(f.data, p + 30 + f.name.length); p += 30 + f.name.length + f.data.length;
    }
    const cd = p;
    files.forEach((f, i) => {
      dv.setUint32(p, 0x02014b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, 20, true); dv.setUint16(p + 8, 0x0800, true); dv.setUint16(p + 10, 0, true);
      dv.setUint16(p + 12, time, true); dv.setUint16(p + 14, date, true); dv.setUint32(p + 16, f.crc, true);
      dv.setUint32(p + 20, f.data.length, true); dv.setUint32(p + 24, f.data.length, true); dv.setUint16(p + 28, f.name.length, true);
      dv.setUint16(p + 30, 0, true); dv.setUint16(p + 32, 0, true); dv.setUint16(p + 34, 0, true); dv.setUint16(p + 36, 0, true); dv.setUint32(p + 38, 0, true); dv.setUint32(p + 42, offsets[i], true);
      out.set(f.name, p + 46); p += 46 + f.name.length;
    });
    dv.setUint32(p, 0x06054b50, true); dv.setUint16(p + 4, 0, true); dv.setUint16(p + 6, 0, true); dv.setUint16(p + 8, files.length, true); dv.setUint16(p + 10, files.length, true);
    dv.setUint32(p + 12, p - cd, true); dv.setUint32(p + 16, cd, true); dv.setUint16(p + 20, 0, true);
    return out;
  }

  // ══════════════════════════════════════ 문장 양식(landing/data/report_templates.json) — 원본은 backend/scripts/export_templates.py
  // 파이썬(report_quality/templates.py)과 이 파일이 같은 JSON을 읽는다. 양식을 바꾸려면 JSON이 아니라 원본 스크립트를 고친다.
  class BriefError extends Error {}
  let T = null;
  const setTemplates = json => { T = json && typeof json === 'object' ? json : null; };
  const getTemplates = () => T;
  const tpl = () => { if (!T) throw new BriefError('문서 양식 파일(data/report_templates.json)을 아직 불러오지 못했다'); return T; };
  const FMT = () => (T && T.format) || {};
  const NO_DATA_DEFAULT = '자료 없음';
  const noData = () => FMT().no_data || NO_DATA_DEFAULT;

  // ══════════════════════════════════════ 글자·서식(dong_brief.py 옮김)
  const BANNED_GLYPHS = '—–−…›→';                      // 한글 뷰어·모바일에서 깨진다. 허용: ㎡ ㎢ % %p · ~
  const GLYPH_MAP = { '—': '-', '–': '-', '−': '-', '…': '', '›': '>', '→': '>' };
  // 백엔드 dong_brief.clean()과 같게: 금지 글리프 치환 + 본문 안 ISO 날짜를 공문서 표기로
  const clean = s => String(s).replace(/[—–−…›→]/g, c => GLYPH_MAP[c]).replace(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g, (m, y, mo, d) => `${+y}. ${+mo}. ${+d}.`);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const xe = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const he = s => xe(s).replace(/"/g, '&quot;');
  const commas = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Python round(v, d)는 정확히 중간인 값(x.125 등)을 짝수 쪽으로 맞춘다. JS toFixed는 올린다. 정확한 중간값은 v = (홀수)/2^(d+1) 꼴뿐이다
  function roundD(v, d) {
    const t = v * 2 ** (d + 1);
    if (Number.isInteger(t) && Math.abs(t) % 2 === 1) { const f = Math.floor(v * 10 ** d); return (f % 2 === 0 ? f : f + 1) / 10 ** d; }
    return Number(v.toFixed(d));
  }
  function fmtNum(v) {
    if (typeof v === 'boolean') return String(+v);
    if (typeof v === 'number') {
      const d = FMT().max_decimals ?? 2;
      if (Number.isInteger(v)) return (v < 0 ? '-' : '') + commas(String(Math.abs(v)));
      const r = roundD(v, d);
      if (r === 0) {   // Python '.2g': 지수가 -4보다 작으면 지수 표기, 아니면 소수 표기에서 끝의 0을 뗀다
        const [m, e] = v.toExponential(1).split('e'), exp = +e, mant = m.replace(/\.?0+$/, '');
        return exp < -4 ? `${mant}e-${String(-exp).padStart(2, '0')}` : Number(v.toPrecision(2)).toFixed(Math.max(0, 1 - exp)).replace(/\.?0+$/, '');
      }
      const [a, b] = Math.abs(r).toFixed(d).split('.'), frac = b.replace(/0+$/, '');
      return (r < 0 ? '-' : '') + commas(a) + (frac ? '.' + frac : '');
    }
    return String(v);
  }
  const hidden = c => !!(c && c.value_hidden_reason);
  function fmtCell(c) {
    if (c === null || c === undefined) return noData();
    if (hidden(c)) return (FMT().hidden || '비공개({reason})').replace('{reason}', c.value_hidden_reason);
    return c.value === null || c.value === undefined ? noData() : fmtNum(c.value);
  }
  const licenseOf = c => c.license_type || '미표시';
  // 2026-10-26 → '2026. 10. 26.' (행정업무규정 제7조제5항). 형식이 아니면 그대로
  function govDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? `${+m[1]}. ${+m[2]}. ${+m[3]}.` : (s || '');
  }
  function josa(word, eun = '은', neun = '는') {
    const w = String(word).trim().replace(/\([^)]*\)$/, '').trimEnd(), ch = w ? w[w.length - 1] : '';
    return ch >= '가' && ch <= '힣' ? ((ch.charCodeAt(0) - 0xAC00) % 28 ? eun : neun) : '은(는)';
  }
  const NO_SPACE_UNITS = () => FMT().no_space_units || ['%', '%p', '㎡', '㎢', 'm', '개', '명', '건', '대'];
  const NO_SPACE_PREFIX = () => FMT().no_space_prefixes || ['%', '㎡', '개/', '대/', '만원'];
  const noSpace = u => NO_SPACE_UNITS().includes(u) || NO_SPACE_PREFIX().some(p => u.startsWith(p));
  function valueWithUnit(c) {
    if (!c || hidden(c) || c.value === null || c.value === undefined) return fmtCell(c);
    const u = c.unit || '', flag = FMT().flag || { unit: '여부(1/0)', 1: '있음', 0: '없음' };
    if (u === flag.unit) return c.value === 1 ? flag[1] : flag[0];
    return `${fmtCell(c)}${noSpace(u) ? '' : ' '}${u}`;
  }
  const tight = s => { const m = /^(\S+) (\S+)$/.exec(s); return !m || !noSpace(m[2]) ? s : m[1] + m[2]; };
  const fill = (tp, kw) => clean(tp.replace(/\{(\w+)\}/g, (m, k) => { const all = { ...(T && T.consts), ...kw }; return k in all ? String(all[k]) : m; }));
  const sentenceLen = s => s.replace(/\[\d+\]/g, '').length;
  const usable = c => !!c && !hidden(c) && c.value !== null && c.value !== undefined;
  // 원본 기관명이 앞에 오도록 표시 이름을 만든다(기관명으로 시작하지 않는 표준데이터만 앞에 붙인다)
  const displayName = name => { const d = ((T && T.display_names) || []).find(x => String(name).startsWith(x.match)); return d ? d.prefix + name : name; };

  // ══════════════════════════════════════ 상수(dong_brief.py 옮김)
  const TITLE_BRIEF = '{dong} 기초조사 근거 자료';
  const PURPOSES = { 예산: '예산 요구 근거 자료', 공모: '공모 사전 검토 자료', 민원: '민원 회신 참고 자료' };
  const SAFETY_DISCLAIMER = '이 수치는 시설 현황이며 범죄 발생이나 안전 수준을 의미하지 않습니다.';
  const UNSETTLED = () => FMT().unsettled_status || ['추가확인', '충돌', '폐기'];
  const SENTENCE_MAX = 60;
  const SRC_HEAD = ref => `출처: 국토교통부·행정안전부·통계청 등 공공데이터(${ref}) · 가공: 리뉴맵`;   // 화면용 머리말. 원본 기관명이 앞, 가공(리뉴맵)이 뒤
  const GROUPS = [
    ['정비 신호', ['DECLINE_AGING_20Y_PCT', 'DECLINE_AGING_20Y_PCT_DELTA5Y', 'DECLINE_BIZ_TOTAL', 'DECLINE_BIZ_TOTAL_DELTA5Y', 'DECLINE_BIZ_DROP10Y_PCT', 'DECLINE_BIZ_DECL3IN5', 'DECLINE_MET_COUNT', 'DEPOP_STATUS']],
    ['인구 변화', ['DECLINE_POP_TOTAL', 'DECLINE_POP_CHANGE_PCT', 'DECLINE_POP_CHANGE_PCT_DELTA5Y', 'DECLINE_POP_DROP30Y_PCT', 'DECLINE_POP_DECL3IN5', 'POP_AGED65_PCT', 'POP_AGED65_PCT_DELTA5Y', 'POP_YOUTH_PCT', 'POP_YOUTH_PCT_DELTA5Y', 'YOUTH_NET_MIGRATION', 'YOUTH_NET_MIGRATION_PER1K']],
    ['생활 여건', ['HOSP_CLINIC_COUNT', 'HOSP_PER10K', 'LIB_NEAREST_M', 'PARK_AREA_PER_CAPITA', 'PARK_COUNT', 'ER_NEAREST_M', 'BUS_STOP_DENSITY']],
    ['안전 인프라', ['CCTV_PER_KM2', 'STREETLIGHT_PER_KM2', 'POLICE_NEAREST_M']],
    ['부동산(시군구)', ['APT_TRADE_COUNT', 'APT_PRICE_M2_MEDIAN', 'APT_PRICE_M2_YOY_PCT', 'APT_TRADE_COUNT_YOY_PCT']],
    ['전망', []],
  ];
  const EXCLUDED = ['STD_SHORTFALL_COUNT'];
  const LABEL = {
    DECLINE_AGING_20Y_PCT: '준공 20년 이상 건축물 비율', DECLINE_AGING_20Y_PCT_DELTA5Y: '노후건축물 비율 5년 차이', DECLINE_BIZ_TOTAL: '사업체 수',
    DECLINE_BIZ_TOTAL_DELTA5Y: '사업체 수 5년 차이', DECLINE_BIZ_DROP10Y_PCT: '10년 최대 대비 사업체 감소율', DECLINE_BIZ_DECL3IN5: '최근 5년 중 3년 연속 사업체 감소(1=있음)',
    DECLINE_MET_COUNT: '쇠퇴 3요건 중 확정된 충족 수(하한)', DEPOP_STATUS: '인구감소지역 지정 구분(시군구)', DECLINE_POP_TOTAL: '주민등록 인구', DECLINE_POP_CHANGE_PCT: '인구변화율',
    DECLINE_POP_CHANGE_PCT_DELTA5Y: '인구변화율 5년 차이', DECLINE_POP_DROP30Y_PCT: '30년 최대 대비 인구 감소율', DECLINE_POP_DECL3IN5: '최근 5년 중 3년 연속 인구 감소(1=있음)',
    DECLINE_POP_TOTAL_CHANGE_PCT: '기준연도 대비 인구 변화율', YOUTH_NET_MIGRATION: '청년층 순이동자 수(시군구)', YOUTH_NET_MIGRATION_PER1K: '청년층 순이동률(시군구)',
    APT_TRADE_COUNT: '아파트 매매 신고 건수(시군구·월)', APT_PRICE_M2_MEDIAN: '아파트 ㎡당 중위 거래가(시군구·월)', APT_PRICE_M2_YOY_PCT: '아파트 ㎡당 중위가 전년 동기 대비(시군구)',
    APT_TRADE_COUNT_YOY_PCT: '아파트 매매 건수 전년 동기 대비(시군구)',
  };
  // 쇠퇴지역 3요건(도시재생법 시행령 제17조). [지표 코드, 비교, 기준값, 항목 이름]
  const DECLINE_CRITERIA = [
    ['DECLINE_POP_DROP30Y_PCT', 'ge', 20.0, '인구: 30년 최대 대비 감소율'], ['DECLINE_POP_DECL3IN5', 'eq', 1, '인구: 최근 5년 중 3년 연속 감소'],
    ['DECLINE_BIZ_DROP10Y_PCT', 'ge', 5.0, '사업체: 10년 최대 대비 감소율'], ['DECLINE_BIZ_DECL3IN5', 'eq', 1, '사업체: 최근 5년 중 3년 연속 감소'],
    ['DECLINE_AGING_20Y_PCT', 'ge', 50.0, '노후: 준공 20년 이상 건축물 비율'],
  ];
  const DECLINE_N_REQ = 3, DECLINE_MIN_MET = 2, DECLINE_PREFIX = '쇠퇴 3요건 · ';
  // 법령 이름은 backend/renewmap/rules/decline.py RULE_VERSION과 같다(docgen.test.cjs가 파이썬 원본을 읽어 대조한다). 규칙 id·승인 여부는 JSON(decline_rule)에서
  const DECLINE_LAW = '도시재생 활성화 및 지원에 관한 특별법 시행령 제17조';
  const OVER = '기준 해당', INSIDE = '기준 비해당', UNKNOWN = '확정 불가', PENDING_SUFFIX = '(승인 전 참고)';
  const LIVING_CODES = new Set([...GROUPS[2][1], ...GROUPS[3][1], 'POP_AGED65_PCT', 'POP_AGED65_PCT_DELTA5Y', 'POP_YOUTH_PCT', 'POP_YOUTH_PCT_DELTA5Y']);
  const SERIES = ['DECLINE_POP_TOTAL', 'DECLINE_AGING_20Y_PCT', 'DECLINE_BIZ_TOTAL'], SERIES_YEARS = 10;

  // ══════════════════════════════════════ 수집(dong_brief.build 옮김)
  function labelOf(code, cell, livingLabels) {
    if (livingLabels[code]) return livingLabels[code];
    const m = /^FORECAST_(.+?)_H(\d+)(?:_(LO|HI))?$/.exec(code);
    if (m) {
      const base = LABEL[m[1]] || m[1], year = ((cell || {}).reference_date || '').slice(0, 4), when = year ? `${year}년` : `${m[2]}년 뒤`;
      return `${base} ${when} 전망` + ({ LO: ' 하한', HI: ' 상한' }[m[3]] || '');
    }
    return LABEL[code] || code;
  }
  function forecastKey(code) {
    const m = /^FORECAST_(.+?)_H(\d+)(?:_(LO|HI))?$/.exec(code);
    return m ? [m[1], +m[2], { undefined: 0, LO: 1, HI: 2 }[m[3]]] : [code, 0, 0];
  }
  const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
  const checkNote = c => { const n = c.note || '', i = n.indexOf('추가확인:'); return i >= 0 ? n.slice(i + '추가확인:'.length).trim() : ''; };
  function findSg(rows, sg, names) {
    for (const key of [sg.code5, sg.parent]) {
      const r = (rows || []).find(x => x.code5 === key);
      if (r) return [r, key === sg.code5 ? null : (names.get(key) || key)];
    }
    return [null, null];
  }
  function unmatchedReason(layer, sg) {
    for (const key of [sg.code5, sg.parent]) {
      const u = (layer.unmatched || []).find(x => x.code5 === key);
      if (u) return u.reason || '원천과 잇지 못함';
    }
    return '해당 시군구 항목 없음';
  }

  // src: { index, emd, living(시군구 파일|null), livingIdx, forecast(시군구 파일|null), forecastIdx, designations, migration, realestate }
  function buildBrief(code8, src, opt) {
    tpl();
    const o = opt || {}, idx = src.index;
    if (!idx) throw new BriefError('index.json이 없다');
    if (o.purpose && !PURPOSES[o.purpose]) throw new BriefError(`purpose는 ${Object.keys(PURPOSES).join('|')} 중 하나: ${o.purpose}`);
    const code5 = String(code8).slice(0, 5), sg = (idx.sigungu || []).find(s => s.code5 === code5), emd = src.emd;
    if (!sg || !emd) throw new BriefError(`시군구 ${code5}(${code8})의 index/emd 자료가 없다`);
    const dong = (emd.dongs || []).find(d => String(d.code7 ?? d.code) === String(code8));
    if (!dong) throw new BriefError(`행정동 ${code8}이(가) emd/${code5}.json에 없다`);
    const years = (Array.isArray(emd.cells_years) && emd.cells_years.length ? emd.cells_years : [...new Set((dong.cells || []).map(c => c.base_year))]).slice().sort((a, b) => a - b);
    const year = o.year ?? years[years.length - 1];
    if (!years.includes(year)) throw new BriefError(`기준연도 ${year}의 셀이 없다. 가능한 연도: ${years}`);
    const names = new Map((idx.sigungu || []).map(s => [s.code5, s.name]));

    const byCode = new Map((dong.cells || []).filter(c => c.base_year === year).map(c => [c.indicator_code, c]));
    const missing = new Map();
    const livingIdx = src.livingIdx || null, living = src.living || null;
    const livingLabels = Object.fromEntries(((livingIdx || {}).indicators || []).map(i => [i.code, i.label]));
    const ld = ((living || {}).dongs || []).find(d => String(d.code7 ?? d.code) === String(code8));
    const whyLiving = !livingIdx || !living ? '생활 지표 층 파일 없음' : '생활 지표에 이 행정동 항목 없음';
    ((ld || {}).cells || []).forEach(c => byCode.set(c.indicator_code, c));

    const fc = src.forecast || null, fidx = src.forecastIdx || null;
    const fd = ((fc || {}).dongs || []).find(d => String(d.code7 ?? d.code) === String(code8));
    const fcodes = [];
    ((fd || {}).cells || []).forEach(c => { byCode.set(c.indicator_code, c); fcodes.push(c.indicator_code); });

    const facts = new Map(), viaNames = new Map(), dep = src.designations || null;
    if (dep) {
      const [row, via] = findSg(dep.items, sg, names);
      if (row) { (row.cells || []).forEach(c => byCode.set(c.indicator_code, c)); if (via) viaNames.set('DEPOP_STATUS', via); }
      else {
        const s = dep.source;
        facts.set('DEPOP_STATUS', { value: '지정 목록에 없음', unit: '구분', reference_date: s.effective_date, source_name: s.name, source_url: s.url, retrieved_at: s.retrieved_at,
          rule_version: s.rule_version, license: s.license_type, formula: String(dep.note).split('. ')[0].replace(/\.+$/, '') });
      }
    } else missing.set('DEPOP_STATUS', '인구감소지역 지정 층 파일 없음');
    for (const [layer, label, codes] of [[src.migration, '청년 순이동', ['YOUTH_NET_MIGRATION', 'YOUTH_NET_MIGRATION_PER1K']],
      [src.realestate, '아파트 실거래', ['APT_TRADE_COUNT', 'APT_PRICE_M2_MEDIAN', 'APT_PRICE_M2_YOY_PCT', 'APT_TRADE_COUNT_YOY_PCT']]]) {
      if (!layer) { codes.forEach(k => missing.set(k, `${label} 층 파일 없음`)); continue; }
      const [row, via] = findSg(layer.sigungu, sg, names);
      if (!row) { codes.forEach(k => missing.set(k, `${label}: ${unmatchedReason(layer, sg)}`)); continue; }
      (row.cells || []).forEach(c => { byCode.set(c.indicator_code, c); if (via) viaNames.set(c.indicator_code, via); });
    }

    const items = [], seen = new Set();
    for (const [group, list] of GROUPS) {
      const codes = group === '전망' ? fcodes.slice().sort((a, b) => cmpKey(forecastKey(a), forecastKey(b))) : list;
      for (const code of codes) {
        seen.add(code);
        const cell = byCode.get(code) || null;
        let label = labelOf(code, cell, livingLabels);
        if (viaNames.has(code)) label += ` — 상위 ${viaNames.get(code)} 단위`;
        if (!cell && !facts.has(code) && !missing.has(code)) missing.set(code, LIVING_CODES.has(code) ? whyLiving : '원장에 셀 없음');
        items.push({ group, code, label, cell, fact: facts.get(code) || null });
      }
    }
    if (!fcodes.length) {
      items.push({ group: '전망', code: 'FORECAST', label: '추세 전망', cell: null, fact: null });
      missing.set('FORECAST', !fidx || !fc ? '추세 전망 층 파일 없음' : '추세 전망 대상에서 제외됨');
    }
    for (const [code, c] of byCode) if (!seen.has(code) && !EXCLUDED.includes(code)) items.push({ group: '기타', code, label: labelOf(code, c, livingLabels), cell: c, fact: null });
    const cells = items.filter(i => i.cell).map(i => (hidden(i.cell) ? { ...i.cell, value: null } : i.cell));
    Object.entries((fd || {}).excluded || {}).forEach(([code, why]) => missing.set(`FORECAST:${code}`, `전망 제외(${LABEL[code] || code}): ${why}`));

    const crit = criteriaTable(items, livingIdx, byCode);
    const ser = seriesTable(dong, byCode, year, idx, missing);
    const todo = todoTable(items, crit, missing, fd, fidx, cells);

    const sido = (idx.sido || []).find(s => s.code2 === sg.sido2) || { name: sg.sido2 };
    const path = ['전국', sido.name];
    if (sg.parent && names.has(sg.parent)) path.push(names.get(sg.parent));
    if (sido.kind !== '특별자치시') path.push(sg.name);
    path.push(dong.name);
    const subject = o.purpose ? PURPOSES[o.purpose] : '사실 자료와 기준 대비';
    return { code8: String(code8), dongName: dong.name, dongKind: dong.kind || null, year, region: path.slice(1).join(' '), sgName: sg.name, sido: sido.name, items, missing, fidx, cells,
      crit, ser, todo, subject, writtenOn: o.writtenOn || '', snapshot: idx.snapshot_hash, geo: o.geo || null, series: dong.series || {} };
  }

  function judge(cell, op, thr) {
    if (!cell || hidden(cell) || cell.value === null || cell.value === undefined || UNSETTLED().includes(cell.status)) return UNKNOWN;
    const v = cell.value, hit = op === 'ge' ? v >= thr : op === 'lt' ? v < thr : v === thr;
    return hit ? OVER : INSIDE;
  }
  function judgeMetCount(cell) {
    const base = judge(cell, 'ge', DECLINE_MIN_MET);
    if (base !== INSIDE) return base;
    const undecided = DECLINE_N_REQ - (cell.sample_n !== null && cell.sample_n !== undefined ? cell.sample_n : 0);
    return cell.value + undecided >= DECLINE_MIN_MET ? UNKNOWN : INSIDE;
  }
  const verdictOf = (v, status) => (String(status).includes('승인 대기') && v !== UNKNOWN ? v + PENDING_SUFFIX : v);
  const ruleApproved = () => !!(T && T.decline_rule && T.decline_rule.approved);

  // 표 2 기준 대비. rule: 코드 → { cond, verdict, status }
  function criteriaTable(items, livingIdx, by) {
    const rows = [['항목', '값', '기준', '기준 출처·설명', '기준 상태', '해당 여부']], rule = new Map();
    const val = code => { const c = by.get(code) || null; return [c, valueWithUnit(c)]; };
    const dStatus = ruleApproved() ? '법정' : '법정(규칙 승인 대기)', dSrc = `${DECLINE_LAW} · 규칙 ${(T.decline_rule || {}).id}`;
    for (const [code, op, thr, name] of DECLINE_CRITERIA) {
      const [c, v] = val(code), unit = c ? c.unit : '', cond = op === 'ge' ? `${fmtNum(thr)}${unit} 이상` : '해당 구간 있음', ver = verdictOf(judge(c, op, thr), dStatus);
      rows.push([`${DECLINE_PREFIX}${name}`, v, cond, dSrc, dStatus, ver]); rule.set(code, { cond, verdict: ver, status: dStatus });
    }
    const [mc, mv] = val('DECLINE_MET_COUNT'), mcCond = `${DECLINE_N_REQ}개 중 ${DECLINE_MIN_MET}개 이상`, mcVer = verdictOf(judgeMetCount(mc), dStatus);
    rows.push([`${DECLINE_PREFIX}충족 요건 수`, mv, mcCond, `${dSrc}. 값은 확정된 충족 수의 하한`, dStatus, mcVer]); rule.set('DECLINE_MET_COUNT', { cond: mcCond, verdict: mcVer, status: dStatus });
    for (const ind of (livingIdx || {}).indicators || []) {
      const std = ind.standard;
      if (!std || std.value === null || std.value === undefined) continue;
      const [c, v] = val(ind.code), ge = std.direction === 'above_bad', cond = `${fmtNum(std.value)}${ind.unit} ${ge ? '이상' : '미만'}`, ver = verdictOf(judge(c, ge ? 'ge' : 'lt', std.value), std.status);
      rows.push([ind.label, v, cond, `${std.source} — ${std.text}`, std.status, ver]); rule.set(ind.code, { cond, verdict: ver, status: std.status });
    }
    for (const code of GROUPS[3][1]) {
      const [, v] = val(code), it = items.find(i => i.code === code);
      rows.push([`${it ? it.label : code} (안전 인프라)`, v, '기준 없음', '시설 위치의 사실 지표(D17). 범죄·치안 점수가 아니며 비교하지 않는다', '기준 없음', '비교 안 함']);
    }
    return { rows, rule };
  }
  const sameNum = (a, b) => (a === null || a === undefined || b === null || b === undefined ? (a ?? null) === (b ?? null) : Math.abs(a - b) <= Math.max(1e-9 * Math.max(Math.abs(a), Math.abs(b)), 1e-9));
  function seriesTable(dong, by, year, idx, missing) {
    const ys = Array.from({ length: SERIES_YEARS }, (_, k) => year - SERIES_YEARS + 1 + k), rows = [['지표(단위)', ...ys.map(String)]], raw = [rows[0].slice()];
    for (const code of SERIES) {
      const c = by.get(code) || null, label = c ? `${LABEL[code]}(${c.unit})` : LABEL[code];
      if (!c) { rows.push([label, ...ys.map(() => '셀 없음')]); raw.push(rows[rows.length - 1]); missing.set(`SERIES:${code}`, `${LABEL[code]} 시계열: 같은 지표의 기준연도 셀이 없어 표시하지 않음`); continue; }
      if (hidden(c)) { rows.push([label, ...ys.map(() => `비공개(${c.value_hidden_reason})`)]); raw.push(rows[rows.length - 1]); continue; }
      const s = new Map(((dong.series || {})[code] || []).map(p => [p[0], p[1]]));
      if (!sameNum(s.get(year), c.value)) { rows.push([label, ...ys.map(() => '표시 안 함')]); raw.push(rows[rows.length - 1]); missing.set(`SERIES:${code}`, `${LABEL[code]} 시계열: ${year}년 값이 셀 값과 달라 표시하지 않음`); continue; }
      rows.push([label, ...ys.map(y => (s.get(y) === null || s.get(y) === undefined ? '없음' : fmtNum(s.get(y))))]);
      raw.push([label, ...ys.map(y => (s.get(y) === null || s.get(y) === undefined ? '없음' : s.get(y)))]);
    }
    const notes = ["'없음'은 자료 없음(null)이다. 추정·보간하지 않았다.", `${year}년 값은 표 1의 같은 지표 셀 값과 일치하는 경우에만 싣는다.`];
    const b = idx.biz_source || {};
    if (b.csv_years_before && b.register_based_from) notes.push(`사업체 수는 ${b.csv_years_before}년까지 조사기반, ${b.register_based_from}년부터 등록기반이라 두 구간을 이어 비교할 때 주의한다.`);
    return { rows, raw, notes };
  }
  function todoTable(items, crit, missing, fd, fidx, cells) {
    const rows = [['구분', '항목', '사유', '담당자가 확인할 것']];
    for (const it of items) {
      const c = it.cell;
      if (!c) { if (!it.fact) rows.push([it.group, it.label, `${noData()}: ${missing.get(it.code) || '원장에 셀 없음'}`, '원천 기관 자료 유무와 층 파일 갱신 여부']); continue; }
      const st = c.status;
      if (hidden(c)) rows.push([it.group, it.label, `비공개: ${c.value_hidden_reason}`, '재배포 허용 범위(D16)']);
      else if (c.value === null || c.value === undefined) rows.push([it.group, it.label, `${noData()}(값 null, 상태 ${st})`, '원천 기관 자료 유무']);
      if (st === '충돌') rows.push([it.group, it.label, '상태 충돌: 두 출처 또는 산식과 지정 결과가 다름', '원천 값 대조']);
      else if (st === '추가확인' && it.group !== '전망') { const extra = checkNote(c); rows.push([it.group, it.label, '상태 추가확인' + (extra ? `: ${extra}` : ''), '원천 자료·산식 대조']); }
    }
    const pending = crit.rows.slice(1).filter(r => r[4].includes('승인 대기')), decline = pending.filter(r => r[0].startsWith(DECLINE_PREFIX));
    if (decline.length) rows.push(['기준 대비', `${DECLINE_PREFIX.replace(/[ ·]+$/, '')} 기준 ${decline.length}개 항목`, `기준 상태 ${decline[0][4]}: ${decline[0][3]}`, '시행령 조문과 규칙 승인 여부']);
    for (const r of pending) if (!decline.includes(r)) rows.push(['기준 대비', r[0], `기준 상태 ${r[4]}`, '기준 원문 대조와 승인 여부']);
    if (items.some(i => i.group === '전망' && i.cell) && !(fidx || {}).approved) rows.push(['전망', '추세 전망 전체', '산식 승인 전 초안', '산식 승인 여부와 백테스트 오차 구간']);
    for (const [k, why] of missing) {
      if (k.startsWith('FORECAST:') || k.startsWith('SERIES:')) { const code = k.split(':').slice(1).join(':'); rows.push([k.startsWith('FORECAST:') ? '전망' : '시계열', LABEL[code] || code, why, '제외·불일치 사유']); }
    }
    const n = cells.filter(c => c.status === '미확인').length;
    if (n) rows.push(['전체', "상태 '미확인' 셀", `${n}건: 사람이 원천과 대조하기 전 자료`, '대조 후 상태 갱신']);
    if (rows.length === 1) rows.push(['-', '-', '확인 필요 항목 없음', '-']);
    return { rows };
  }

  // ══════════════════════════════════════ 공문서 구조(dong_brief.build_doc·build_onepage 옮김)
  // 출처 번호: 같은 출처·기준일·조회일·이용조건이면 같은 번호. 전망 셀의 reference_date는 전망 대상일. 표시 이름은 원본 기관명이 앞
  class Sources {
    constructor() { this.list = []; this.idx = new Map(); }
    number(d, forecast) {
      if (!d) return 0;
      const lic = ('license_type' in d ? d.license_type : d.license) || '미표시', name = displayName(d.source_name),
        key = JSON.stringify([name, d.source_url, d.reference_date, (d.retrieved_at || '').slice(0, 10), lic, !!forecast]);
      if (!this.idx.has(key)) { this.idx.set(key, this.list.length + 1); this.list.push({ name, url: d.source_url, reference_date: d.reference_date, retrieved_at: (d.retrieved_at || '').slice(0, 10), license: lic, forecast: !!forecast }); }
      return this.idx.get(key);
    }
    ref(d, forecast) { const n = this.number(d, forecast); return n ? `[${n}]` : ''; }
    // 문장이 여러 셀을 쓰면 셀마다 출처 번호를 단다(같은 출처면 한 번). 예 '[2][1]'은 작은 번호부터 '[1][2]'
    refs(ds, forecast) { return [...new Set(ds.map(d => this.number(d, forecast)).filter(Boolean))].sort((a, b) => a - b).map(n => `[${n}]`).join(''); }
  }
  const block = (kind, text = '', extra = {}) => ({ kind, text, rows: [], widths: [], caption: '', small: false, ...extra });
  const refsIn = s => [...String(s).matchAll(/\[(\d+)\]/g)].map(m => +m[1]);
  // 글자 모양 나누기(dong_brief.text_runs와 같은 규칙): '[1][2]' → 위 첨자 '[1,2]', 요약 문장의 '숫자+단위' → 굵게.
  // 단위가 붙은 숫자만 굵게 하고 괄호 안(기준값)·이름 속 숫자(반여1동·3요건)·연도는 그대로 둔다
  const RUN_RE = /(\[\d+\](?:\[\d+\])*)|(\([^)]*\))|((?<![\p{L}\p{N}_.,])\d[\d,]*(?:\.\d+)?(?:%p|%|㎡\/인|㎡|km|m|[명개곳건호배]))/gu;
  function textRuns(text, emph) {
    const t = String(text), out = []; let pos = 0;
    for (const m of t.matchAll(RUN_RE)) {
      const [, ref, , num] = m;
      if (!ref && !(num && emph)) continue;
      if (m.index > pos) out.push([t.slice(pos, m.index), '']);
      out.push(ref ? [`[${ref.match(/\d+/g).join(',')}]`, 'sup'] : [num, 'b']);
      pos = m.index + m[0].length;
    }
    if (pos < t.length || !out.length) out.push([t.slice(pos), '']);
    return out;
  }
  const finish = blocks => { for (const b of blocks) { b.text = clean(b.text); b.rows = b.rows.map(r => r.map(x => clean(String(x)))); b.caption = clean(b.caption); } return blocks; };
  const sourceLine = (n, s) => `[${n}] ${s.name}. ${s.forecast ? '전망 대상일' : '기준일'} ${govDate(s.reference_date)} 조회일 ${govDate(s.retrieved_at)} 이용조건 ${s.license}.`;

  // 요약 문장 3~5개(템플릿 순서 고정). 셀이 없으면 그 문장은 건너뛴다. 근거서와 1쪽 요약이 같이 쓴다
  function summaryLines(brief, byCode, facts, src, crit, nTodo, fallback) {
    const S = tpl().summary, year = brief.year, dong = brief.dongName, sg = brief.sgName;
    const verdicts = new Map(crit.rows.slice(1).map(r => [r[0], r[5]])), aging = DECLINE_CRITERIA.find(x => x[0] === 'DECLINE_AGING_20Y_PCT');
    const agingV = verdicts.get(`${DECLINE_PREFIX}${aging[3]}`) || UNKNOWN, pending = agingV.includes(PENDING_SUFFIX), lines = [];
    for (const { codes, template } of S.items) {
      const cs = codes.map(c => byCode.get(c) || null), fact = codes.length === 1 && !cs[0] ? facts.get(codes[0]) || null : null;
      if (!fact && !cs.every(usable)) continue;
      const ref = src.refs(fact ? [fact] : cs), v = fact ? fact.value : valueWithUnit(cs[0]);
      const s = fill(template, { year, dong, sg, v, v2: cs.length > 1 ? valueWithUnit(cs[1]) : '', thr: `${fmtNum(aging[2])}%`, verdict: S.verdict[agingV.replace(PENDING_SUFFIX, '')], min_met: DECLINE_MIN_MET, ref });
      if (sentenceLen(s) <= SENTENCE_MAX) lines.push(s);
      if (lines.length >= S.max - (pending ? 1 : 0)) break;
    }
    if (pending) lines.push(S.pending);
    if (lines.length < S.min) lines.push(fill(fallback || S.fallback, { n: nTodo }));
    return lines;
  }

  function buildDoc(brief) {
    const TP = tpl();
    if (!brief.items || !brief.items.length) throw new BriefError('buildBrief()로 만든 brief가 아니어서 항목 정보가 없다');
    const src = new Sources(), byCode = new Map(brief.items.filter(i => i.cell).map(i => [i.code, i.cell])), facts = new Map(brief.items.filter(i => i.fact).map(i => [i.code, i.fact]));
    const crit = brief.crit, todo = brief.todo, ser = brief.ser, blocks = [], parts = {};
    const dong = brief.dongName, year = brief.year, sg = brief.sgName;

    blocks.push(block('title', fill(TITLE_BRIEF, { dong })));
    const box = block('box', '', { rows: [['목적', brief.subject], ['대상 지역', brief.region], ['기준연도', `${year}년`], ['작성일', govDate(brief.writtenOn)], ['작성 근거', TP.overview_basis]], widths: [22, 78] });
    blocks.push(box); parts.box = box;

    blocks.push(block('h1', '1. 요약'));
    parts.summary = summaryLines(brief, byCode, facts, src, crit, todo.rows.length - 1).map((t, i) => { const b = block('para', t, { refs: refsIn(t), emph: true, strong: i === 0 }); blocks.push(b); return b; });

    blocks.push(block('h1', '2. 현황'));
    const sub = '가나다라마바사'; let k = 0;
    for (const [group] of GROUPS.slice(0, -1)) {
      const its = brief.items.filter(i => i.group === group);
      if (!its.some(i => i.cell || i.fact)) continue;
      blocks.push(block('h2', `${sub[k]}. ${group}`)); k++;
      ((TP.group_lead || {})[group] || []).forEach(t => blocks.push(block('para', fill(t, { sg }))));
      if (group === '안전 인프라') blocks.push(block('para', SAFETY_DISCLAIMER));
      let n = 0; const rows = [['지표', '값', '기준일', '출처']];
      for (const it of its) {
        const c = it.cell, f = it.fact;
        if (c) {
          const ref = src.ref(c);
          rows.push([it.label, valueWithUnit(c), govDate(c.reference_date), ref]);
          if (n < TP.generic_per_group && usable(c)) {
            const s = fill(TP.generic, { label: it.label, josa: josa(it.label), v: valueWithUnit(c), ref });
            if (sentenceLen(s) <= SENTENCE_MAX) { blocks.push(block('para', s)); n++; }
          }
        } else if (f) rows.push([it.label, f.value, govDate(f.reference_date), src.ref(f)]);
        else rows.push([it.label, noData(), '-', '-']);
      }
      blocks.push(block('table', '', { rows, widths: [42, 22, 24, 12], caption: `표 ${k}. ${group}` }));   // 기준일이 한 줄에 들어가는 폭
    }

    blocks.push(block('h1', '3. 기준 대비'));
    const mark = ((T && T.onepage) || {}).pending_mark || '*';   // 표 안에서는 '(승인 전 참고)'를 *로 줄이고 표 아래 문장이 뜻을 적는다(1쪽 요약과 같은 표기)
    const critRows = [['항목', '값', '기준', '해당 여부', '기준 상태'], ...crit.rows.slice(1).map(r => [r[0], tight(r[1]), r[2], r[5].replace(PENDING_SUFFIX, mark), r[4]])];
    const critBlock = block('table', '', { rows: critRows, widths: [33, 12, 16, 17, 22], caption: `표 ${k + 1}. 기준 대비` });
    blocks.push(critBlock); parts.crit = critBlock;
    TP.criteria_notes.forEach(s => blocks.push(block('para', s)));

    blocks.push(block('h1', '4. 확인이 필요한 사항'));
    for (const r of todo.rows.slice(1)) blocks.push(block('bullet', r[1] === '-' ? '확인이 필요한 항목이 없다.' : fill(TP.todo, { label: r[1], reason: r[2].replace(/\.+$/, ''), todo: r[3] })));

    const fcItems = brief.items.filter(i => i.group === '전망' && i.cell);
    if (fcItems.length) {
      blocks.push(block('h1', '5. 추세 전망'));
      const rows = [['지표', '전망값', '하한', '상한', '출처']], byKey = new Map();
      for (const i of fcItems) { const [base, h, kind] = forecastKey(i.code), key = JSON.stringify([base, h]); if (!byKey.has(key)) byKey.set(key, { base, h, d: {} }); byKey.get(key).d[kind] = i; }
      const keys = [...byKey.values()].sort((a, b) => cmpKey([a.base, a.h], [b.base, b.h]));
      for (const { d } of keys) {
        const mid = d[0]; if (!mid) continue;
        const ref = src.ref(mid.cell, true), vals = [mid, d[1], d[2]].map(x => (x ? valueWithUnit(x.cell) : noData()));
        rows.push([mid.label, ...vals, ref]);
        const s = fill(TP.forecast_lead, { label: mid.label, v: vals[0], lo: vals[1], hi: vals[2], ref });
        if (sentenceLen(s) <= SENTENCE_MAX) blocks.push(block('para', s));
      }
      const method = (brief.fidx || {}).method || '미표시';
      TP.forecast_notes.forEach(s => blocks.push(block('para', fill(s, { method }))));
      blocks.push(block('table', '', { rows, widths: [36, 16, 16, 16, 16], caption: `표 ${k + 2}. 추세 전망` }));
    }

    const years = ser.rows[0].slice(1), sRows = [['연도', ...ser.rows.slice(1).map(r => r[0])], ...years.map((y, j) => [y, ...ser.rows.slice(1).map(r => r[1 + j])])];
    blocks.push(block('h1', '붙임 1. 최근 10년 시계열'));
    blocks.push(block('table', '', { rows: sRows, widths: [16, ...Array(sRows[0].length - 1).fill(28)], caption: '붙임 1 표. 연도별 값' }));
    ser.notes.forEach(s => blocks.push(block('para', s.replace('표 1의', '2장 표의'))));

    const fRows = [['지표', '계산식', '규칙 버전']], seenF = new Set();
    for (const it of brief.items) { const c = it.cell; if (c && !seenF.has(c.formula_id)) { seenF.add(c.formula_id); fRows.push([it.label, `${c.formula_id}: ${c.formula_text}`, c.rule_version]); } }
    brief.items.filter(i => i.fact).forEach(i => fRows.push([i.label, i.fact.formula, i.fact.rule_version]));
    blocks.push(block('h1', '붙임 2. 계산식·규칙 버전'));
    blocks.push(block('table', '', { rows: fRows, widths: [26, 56, 18], caption: '붙임 2 표. 지표별 계산식' }));
    // 붙임 3. 출처 목록: 본문 [n]의 주석. 문서 맨 끝에 작은 글자로 둔다
    blocks.push(block('h1', '붙임 3. 출처 목록'));
    src.list.forEach((s, n) => { blocks.push(block('para', sourceLine(n + 1, s), { small: true })); blocks.push(block('para', s.url, { small: true })); });   // '끝' 표시는 쓰지 않는다

    finish(blocks);
    return { kind: 'full', title: blocks[0].text, blocks, sources: src.list, cells: brief.cells, snapshot: brief.snapshot, templateVersion: TP.version, footer: `리뉴맵 · 원장 ${String(brief.snapshot).slice(0, 8)} · `,
      parts, src, brief, writtenOn: brief.writtenOn, sizes: 'full', byCode, facts };
  }
  const docText = d => d.blocks.map(b => (b.kind === 'images' ? b.text : b.kind === 'table' || b.kind === 'box' ? `${b.caption}\n${b.rows.map(r => r.join('\t')).join('\n')}` : b.text)).join('\n');

  // ── 1쪽 요약: 요약 5문장 + 기준 대비 표(8행 이하) + 출처 5개 이하('끝' 표시 없음). 양식은 JSON의 onepage(파이썬 build_onepage와 같다)
  // 기준 대비 행 이름 → 지표 코드(출처 번호를 달 셀을 찾는다)
  function rowCodes(items) {
    const m = new Map(DECLINE_CRITERIA.map(([code, , , name]) => [`${DECLINE_PREFIX}${name}`, code]));
    m.set(`${DECLINE_PREFIX}충족 요건 수`, 'DECLINE_MET_COUNT');
    items.forEach(i => m.set(i.label, i.code));
    return m;
  }
  // 분량 추정(A4 세로). 본문 영역은 HWPX 기본 여백에서 머리말·꼬리말(15mm씩)까지 뺀 가장 좁은 경우. dong_brief.estimate_height_mm와 같은 값이다. 실제 쪽 수는 PDF로 확인한다
  const ONEPAGE_SLACK_MM = 8, PAGE_MM = 297 - (20 + 15) - (15 + 15), PAGE_W_MM = 210 - 2 * 30, MM = 0.3528;
  const charW = c => (c.codePointAt(0) > 0x2E80 ? 1 : /\d/.test(c) ? 0.5 : ' .,:;'.includes(c) ? 0.3 : '()[]'.includes(c) ? 0.35 : 0.55);   // 전각 = 1
  const linesOf = (text, widthMm, sizePt) => { let w = 0; for (const c of String(text)) w += charW(c); return Math.max(1, Math.ceil(w / Math.max(widthMm / (sizePt * MM), 1))); };
  function estimateHeightMm(doc) {
    const z = doc.kind === 'onepage' ? tpl().onepage.sizes : docSizes();
    const ln = { body: z.body * 1.6 * MM, lead: z.lead * 1.6 * MM, table: z.table * 1.4 * MM, small: z.small * 1.6 * MM };
    let h = 0;
    for (const b of doc.blocks) {
      if (b.kind === 'title') h += z.title * 1.6 * MM + 12 * MM;
      else if (b.kind === 'images') { const per = b.perRow || 2, w = (PAGE_W_MM - per * 2) / per; h += Math.ceil(b.images.length / per) * (Math.min(40, w * 0.75) + 2) + (b.text ? linesOf(b.text, PAGE_W_MM, z.small) * z.small * 1.6 * MM + 6 * MM : 0); }
      else if (b.kind === 'h1' || b.kind === 'h2') h += z[b.kind] * 1.6 * MM + 3 * MM;     // 장 제목 위 간격은 앞 문단 뒤 간격이 대신한다(dong_brief.estimate_height_mm와 같다)
      else if (b.kind === 'table' || b.kind === 'box') {
        const tot = b.widths.reduce((a, x) => a + x, 0) || 100;
        if (b.caption) h += ln.table + 2 * MM;
        for (const r of b.rows) h += Math.max(...r.map((c, i) => linesOf(c, PAGE_W_MM * b.widths[i] / tot - 3.6, z.table))) * ln.table + 4 * MM;
        h += 'gap' in z ? z.gap * 1.6 * MM + 2 * MM : ln.body + 6 * MM;      // 표 뒤 빈 문단
      } else { const k = b.small ? 'small' : b.strong ? 'lead' : 'body'; h += linesOf(b.text, PAGE_W_MM, z[k]) * ln[k] + 6 * MM; }
    }
    return h;
  }
  function buildOnepage(brief) {
    const TP = tpl(), one = TP.onepage;
    if (!brief.items || !brief.items.length) throw new BriefError('buildBrief()로 만든 brief가 아니어서 항목 정보가 없다');
    const byCode = new Map(brief.items.filter(i => i.cell).map(i => [i.code, i.cell])), facts = new Map(brief.items.filter(i => i.fact).map(i => [i.code, i.fact]));
    const crit = brief.crit, todo = brief.todo, rc = rowCodes(brief.items), picked = crit.rows.slice(1).filter(r => r[2] !== '기준 없음').slice(0, one.table_max_rows), mark = one.pending_mark;
    const label = r0 => (r0 === `${DECLINE_PREFIX}충족 요건 수` ? '쇠퇴 3요건 충족 요건 수' : r0.startsWith(DECLINE_PREFIX) ? r0.slice(DECLINE_PREFIX.length) : r0);
    const make = nRows => {
      let src = new Sources();
      const lines = summaryLines(brief, byCode, facts, src, crit, todo.rows.length - 1, one.fallback);
      const trial = new Sources(); trial.list = src.list.map(s => ({ ...s })); trial.idx = new Map(src.idx);
      let rows = picked.slice(0, nRows).map(r => { const c = byCode.get(rc.get(r[0])); return [label(r[0]), c ? valueWithUnit(c) : tight(r[1]), r[2], r[5].replace(PENDING_SUFFIX, mark), trial.ref(c || facts.get(rc.get(r[0]))) || '-']; });
      let head = one.table_columns, widths = one.table_widths;
      if (trial.list.length <= one.sources_max) src = trial;     // 출처가 5개를 넘으면 표의 출처 열을 빼고 요약 문장의 출처만 싣는다
      else { head = head.slice(0, -1); widths = one.table_widths_no_ref; rows = rows.map(r => r.slice(0, -1)); }
      if (src.list.length > one.sources_max) throw new BriefError('요약 문장의 출처가 5개를 넘는다');
      const k = one.overview_keys.map((key, i) => [key, [brief.region, `${brief.year}년`, govDate(brief.writtenOn), TP.overview_basis][i]]);
      const h1 = one.headings, summary = lines.map((t, i) => block('para', t, { refs: refsIn(t), emph: true, strong: i === 0 })), critBlock = block('table', '', { rows: [head, ...rows], widths, caption: '표 1. 기준 대비' });
      const blocks = [block('title', one.title.replace('{dong}', brief.dongName)), block('box', '', { rows: k, widths: [22, 78] }), block('h1', h1[0]), ...summary, block('h1', h1[1]), critBlock,
        block('para', one.note.join(' ')), block('h1', h1[2]), ...src.list.map((s, n) => block('para', sourceLine(n + 1, s), { small: true }))];
      finish(blocks);
      return { kind: 'onepage', title: blocks[0].text, blocks, sources: src.list, cells: brief.cells, snapshot: brief.snapshot, templateVersion: TP.version, footer: `리뉴맵 · 원장 ${String(brief.snapshot).slice(0, 8)} · `,
        parts: { box: blocks[1], summary, crit: critBlock }, src, brief, writtenOn: brief.writtenOn, sizes: 'onepage', onepage: true, byCode, facts, rows: nRows };
    };
    const nMin = Math.min(picked.length, DECLINE_CRITERIA.length + 1);          // 쇠퇴 3요건 행(5개 + 충족 수)은 줄이지 않는다
    let doc;
    for (let n = picked.length; n >= nMin; n--) { doc = make(n); if (estimateHeightMm(doc) <= PAGE_MM - ONEPAGE_SLACK_MM) break; }
    return doc || make(0);
  }
  // 문장 복사: [n]을 원본 기관명이 앞에 오는 출처 문구로 풀어 양식에 붙여도 출처가 남게 한다
  function sentenceText(doc, b) {
    return b.text.replace(/\[(\d+)\]/g, (m, n) => { const s = doc.sources[n - 1]; return s ? ` (출처: ${s.name}, ${s.forecast ? '전망 대상일' : '기준일'} ${govDate(s.reference_date)})` : ''; });
  }

  // ══════════════════════════════════════ HWPX(export/hwpx.py 구조)
  const NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
  const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
  const FONT_DOTUM = '함초롬돋움';
  // 글꼴·글자 크기는 JSON(doc_style·onepage.sizes)이라 파이썬 hwpx.build_doc과 같다: 나눔고딕, 제목·결론 문장 크고 굵게, 출처 작게.
  // 줄간격 160%·문단 뒤 6pt, 표 140%. 글자 높이 = pt × 100
  const DOC_STYLE_DEFAULT = { font: '나눔고딕', sizes: { title: 20, h1: 15, h2: 13, lead: 13, body: 11, table: 10, small: 8.5 } };
  const docStyle = () => (tpl() && tpl().doc_style) || DOC_STYLE_DEFAULT;
  const docSizes = () => docStyle().sizes;
  const BASE = { ls: 160, tls: 140, after: 600, gapAfter: 600, top: 5668 };
  // 1쪽 요약은 글자 크기를 onepage.sizes로 줄인다. 표 뒤 빈 줄은 gap 크기, 문단 뒤 2pt
  const sizesFor = doc => (doc.sizes === 'onepage' ? { ...BASE, gap: docSizes().body, ...docSizes(), ...((tpl().onepage || {}).sizes || {}), gapAfter: 200 } : { ...BASE, gap: docSizes().body, ...docSizes() });
  // [이름, 크기 키, 굵게, 위 첨자]. 앞 7개 id는 예전과 같다
  const CHAR_DEF = [['table', 'table', 0, 0], ['title', 'title', 1, 0], ['h1', 'h1', 1, 0], ['h2', 'h2', 1, 0], ['body', 'body', 0, 0], ['small', 'small', 0, 0], ['gap', 'gap', 0, 0],
    ['lead', 'lead', 1, 0], ['table_b', 'table', 1, 0], ['body_b', 'body', 1, 0], ['body_sup', 'body', 0, 1], ['lead_sup', 'lead', 0, 1], ['table_sup', 'table', 0, 1]];
  const CH = Object.fromEntries(CHAR_DEF.map(([k], i) => [k, i]));
  const charKey = (ch, look) => (!look || (look === 'b' && CHAR_DEF[CH[ch]][2]) ? ch : `${ch}_${look}`);
  const PARA_ORDER = ['cell', 'title', 'para', 'h1', 'h2', 'bullet', 'small', 'gap', 'footer', 'cell_c', 'lead'], PR = Object.fromEntries(PARA_ORDER.map((k, i) => [k, i]));
  const SHORT_CELL = 14;     // hwpx.SHORT_CELL과 같다: 본문 칸이 모두 짧은 열(값·기준일·출처 번호)은 가운데 정렬
  const TYP = '<hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>';
  const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];
  const same7 = v => ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map(k => `${k}="${v}"`).join(' ');
  const charPr = (id, pt, bold, sup) => `<hh:charPr id="${id}" height="${Math.round(pt * 100)}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef ${same7(1)}/><hh:ratio ${same7(100)}/><hh:spacing ${same7(0)}/><hh:relSz ${same7(100)}/><hh:offset ${same7(0)}/>${bold ? '<hh:bold/>' : ''}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>${sup ? '<hh:supscript/>' : ''}</hh:charPr>`;
  const bf = (id, lines, fill) => { const t = lines ? 'SOLID' : 'NONE', w = lines ? '0.12 mm' : '0.1 mm', b = n => `<hh:${n} type="${t}" width="${w}" color="#000000"/>`;
    return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>${b('leftBorder')}${b('rightBorder')}${b('topBorder')}${b('bottomBorder')}<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${fill ? `<hc:fillBrush><hc:winBrush faceColor="${fill}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : ''}</hh:borderFill>`; };
  // 문단 종류 → [정렬, 왼쪽 들여쓰기(HWPUNIT), 문단 뒤(HWPUNIT), 다음 문단과 붙임, 줄간격 %, 문단 보호(쪽에서 안 나눔)].
  // 한글은 모두 어절 단위로 줄을 바꾼다(W3C klreq): 낱말 가운데서 줄이 끊기지 않는다
  function paraSpec(S) {
    return {
      cell: ['LEFT', 0, 0, 0, S.tls, 0], cell_c: ['CENTER', 0, 0, 0, S.tls, 0], title: ['CENTER', 0, 1200, 0, S.ls, 1], para: ['JUSTIFY', 0, S.after, 0, S.ls, 1],
      lead: ['LEFT', 0, S.after, 0, S.ls, 1], h1: ['LEFT', 0, 300, 1, S.ls, 1], h2: ['LEFT', 1134, 300, 1, S.ls, 1], bullet: ['LEFT', 1134, S.after, 0, S.ls, 1],
      small: ['LEFT', 0, S.after, 0, S.ls, 1], gap: ['JUSTIFY', 0, S.gapAfter, 0, S.ls, 0], footer: ['CENTER', 0, 0, 0, S.ls, 0],
    };
  }
  const paraPr = (id, [align, left, next, keep, ls, keepLines]) => {
    const m = `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="${left}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="${next}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${ls}" unit="HWPUNIT"/>`;
    return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="1" keepWithNext="${keep}" keepLines="${keepLines}" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${m}</hp:case><hp:default>${m}</hp:default></hp:switch><hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
  };
  function headerXml(S) {
    const faces = LANGS.map(l => `<hh:fontface lang="${l}" fontCnt="2"><hh:font id="0" face="${FONT_DOTUM}" type="TTF" isEmbedded="0">${TYP}</hh:font><hh:font id="1" face="${xe(docStyle().font)}" type="TTF" isEmbedded="0">${TYP}</hh:font></hh:fontface>`).join('');
    const nump = [['DIGIT', '^1.', 0], ['HANGUL_SYLLABLE', '^2.', 0], ['DIGIT', '^3)', 0], ['HANGUL_SYLLABLE', '^4)', 0], ['DIGIT', '(^5)', 0], ['HANGUL_SYLLABLE', '(^6)', 0], ['CIRCLED_DIGIT', '^7', 1], ['CIRCLED_HANGUL_SYLLABLE', '^8', 1]]
      .map(([f, t, c], i) => `<hh:paraHead start="1" level="${i + 1}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="${f}" charPrIDRef="4294967295" checkable="${c}">${t}</hh:paraHead>`).join('');
    const spec = paraSpec(S);
    return `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<hh:head ${NS} version="1.5" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>` +
      `<hh:fontfaces itemCnt="7">${faces}</hh:fontfaces>` +
      `<hh:borderFills itemCnt="4">${bf(1, 0)}${bf(2, 0, 'none')}${bf(3, 1)}${bf(4, 1, '#D9D9D9')}</hh:borderFills>` +
      `<hh:charProperties itemCnt="${CHAR_DEF.length}">${CHAR_DEF.map(([, size, bold, sup], i) => charPr(i, S[size], bold, sup)).join('')}</hh:charProperties>` +
      `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>` +
      `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">${nump}</hh:numbering></hh:numberings>` +
      `<hh:paraProperties itemCnt="${PARA_ORDER.length}">${PARA_ORDER.map((k, i) => paraPr(i, spec[k])).join('')}</hh:paraProperties>` +
      `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="${PR.para}" charPrIDRef="${CH.body}" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList>` +
      `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption><hh:metaTag>{"name":""}</hh:metaTag><hh:trackchageConfig flags="56"/></hh:head>`;
  }

  const TEXT_W = 42520;      // A4 59528 - 좌우 여백 8504×2
  // 사진: 한 줄에 2장(글자처럼 취급), 높이 40mm 이하. 1mm = 283.46 HWPUNIT, 화면 1px = 75 HWPUNIT
  const HU_MM = 283.46, PIC_GAP = 566, PIC_MAX_H = Math.round(40 * HU_MM);
  // 한 줄 장수(perRow: 2 또는 4)로 너비를 나누고, 높이는 40mm를 넘지 않게 비율을 지킨다
  function picSize(px, py, perRow) { const k = Math.min(Math.floor((TEXT_W - perRow * PIC_GAP) / perRow) / px, PIC_MAX_H / py); return [Math.round(px * k), Math.round(py * k)]; }
  const picXml = (n, id, img, perRow) => {
    const [w, h] = picSize(img.w, img.h, perRow || 2), dw = img.w * 75, dh = img.h * 75, m = '<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>';
    return `<hp:pic id="${id}" zOrder="${n}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id + 1}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${w >> 1}" centerY="${h >> 1}" rotateimage="1"/><hp:renderingInfo>${m}</hp:renderingInfo>` +
      `<hc:img binaryItemIDRef="image${n}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${dw}" top="0" bottom="${dh}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${dw}" dimheight="${dh}"/><hp:effects/>` +
      `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="${PIC_GAP}" top="0" bottom="${PIC_GAP}"/><hp:shapeComment>${xe(img.caption || '')}</hp:shapeComment></hp:pic>`;
  };
  const docImages = doc => doc.blocks.filter(b => b.kind === 'images').flatMap(b => b.images);
  function sectionXml(doc) {
    const S = sizesFor(doc);
    let seq = 0;
    const nid = () => (++seq * 2654435761) & 0x7FFFFFFF;       // 순번 기반 id: 같은 입력이면 같은 파일
    const runXml = (ch, t) => `<hp:run charPrIDRef="${CH[ch]}">${t === '' ? '<hp:t/>' : `<hp:t>${xe(t)}</hp:t>`}</hp:run>`;
    // runs: textRuns 결과([글자, ''|'b'|'sup']). 없으면 text 한 덩어리
    const para = (kind, text, ch, runs) => `<hp:p id="${nid()}" paraPrIDRef="${PR[kind]}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${(runs || [[text, '']]).map(([t, look]) => runXml(charKey(ch, look), t)).join('')}</hp:p>`;
    // refs: 칸 안 '[1]'을 위 첨자로 쓴다(현장 1쪽 머리 요약 상자)
    const cellP = (text, bold, center, refs) => {
      const t = String(text).replace(/\s*\n\s*/g, ' ');
      return `<hp:p paraPrIDRef="${PR[center ? 'cell_c' : 'cell']}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0" id="${nid()}">${refs ? textRuns(t).map(([x, look]) => runXml(charKey('table', look), x)).join('') : runXml(bold ? 'table_b' : 'table', t)}</hp:p>`;
    };
    const footer = `<hp:footer id="9813498" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="BOTTOM" linkListIDRef="0" linkListNextIDRef="0" textWidth="${TEXT_W}" textHeight="4252" hasTextRef="0" hasNumRef="0"><hp:p paraPrIDRef="${PR.footer}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0" id="516765611"><hp:run charPrIDRef="${CH.table}"><hp:t>${xe(doc.footer)}</hp:t></hp:run><hp:run charPrIDRef="${CH.table}"><hp:ctrl><hp:autoNum num="1" numType="PAGE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/></hp:autoNum></hp:ctrl></hp:run><hp:run charPrIDRef="${CH.table}"><hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl></hp:run></hp:p></hp:subList></hp:footer>`;
    const secPr = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="${S.top}" bottom="4252"/></hp:pagePr>` +
      `<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
      `<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>` +
      ['BOTH', 'EVEN', 'ODD'].map(t => `<hp:pageBorderFill type="${t}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`).join('') +
      `${footer}<hp:footerApply applyPageType="BOTH" idRef="9813498"/></hp:secPr>`;
    const title = doc.blocks[0];
    let out = `<hp:p id="0" paraPrIDRef="${PR.title}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${CH.title}">${secPr}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl><hp:t>${xe(title.text)}</hp:t><hp:ctrl>${footer}</hp:ctrl></hp:run></hp:p>`;
    const table = (rows, widths, caption, header, refs) => {
      const n = rows[0].length, tot = widths.reduce((a, b) => a + b, 0) || 1, w = widths.slice(0, n).map(x => Math.round(TEXT_W * x / tot));
      w[n - 1] += TEXT_W - w.reduce((a, b) => a + b, 0);
      // 칸 안 여백 좌우 2mm·위아래 1mm(hwpx.CELL_MARGIN). 머리글·개요 항목은 굵게, 짧은 값 열은 가운데
      const short = rows[0].map((_, c) => header && c > 0 && rows.slice(1).every(row => String(row[c]).length <= SHORT_CELL));
      const rowH = 282, cell = (t, r, c) => {
        const head = header ? r === 0 : c === 0;
        return `<hp:tc name="" header="${header && r === 0 ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="1" borderFillIDRef="${head ? 4 : 3}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${cellP(t, head, (header && r === 0) || short[c], refs && !head)}</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${w[c]}" height="${rowH}"/><hp:cellMargin left="567" right="567" top="283" bottom="283"/></hp:tc>`;
      };
      const cap = caption ? `<hp:caption side="TOP" fullSz="0" width="8504" gap="850" lastWidth="${TEXT_W}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="${nid()}" paraPrIDRef="${PR.cell}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${CH.table_b}"><hp:t>${xe(caption)}</hp:t></hp:run></hp:p></hp:subList></hp:caption>` : '';
      return `<hp:p id="${nid()}" paraPrIDRef="${PR.cell}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${CH.table}"><hp:tbl id="${nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="${header ? 1 : 0}" rowCnt="${rows.length}" colCnt="${n}" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="${TEXT_W}" widthRelTo="ABSOLUTE" height="${rowH * rows.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${cap}<hp:inMargin left="510" right="510" top="141" bottom="141"/>` +
        rows.map((r, ri) => `<hp:tr>${r.map((t, ci) => cell(t, ri, ci)).join('')}</hp:tr>`).join('') + `</hp:tbl></hp:run></hp:p>`;
    };
    let picN = 0;
    for (const b of doc.blocks.slice(1)) {
      if (b.kind === 'images') {
        out += `<hp:p id="${nid()}" paraPrIDRef="${PR.cell}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${b.images.map(img => `<hp:run charPrIDRef="${CH.body}">${picXml(++picN, nid(), img, b.perRow)}<hp:t/></hp:run>`).join('')}</hp:p>`;
        if (b.text) out += para('small', b.text, 'small');
      }
      else if (b.kind === 'box') { out += table(b.rows, b.widths, '', false, b.refs) + para('gap', '', 'gap'); }
      else if (b.kind === 'table') { out += table(b.rows, b.widths, b.caption, true) + para('gap', '', 'gap'); }
      else if (b.kind === 'h1') out += para('h1', b.text, 'h1');
      else if (b.kind === 'h2') out += para('h2', b.text, 'h2');
      else if (b.kind === 'bullet') out += para('bullet', '', 'body', [['- ', ''], ...textRuns(b.text)]);
      else if (b.small) out += para('small', b.text, 'small');                      // 출처 목록(주석): 작은 글자
      else if (b.strong) out += para('lead', '', 'lead', textRuns(b.text));         // 결론 문장(두괄식): 굵고 크게
      else out += para('para', '', 'body', textRuns(b.text, b.emph));
    }
    return `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<hs:sec ${NS}>${out}</hs:sec>`;
  }
  function hwpxBytes(doc) {
    const S = sizesFor(doc), when = doc.writtenOn || '', iso = /^\d{4}-\d{2}-\d{2}/.test(when) ? `${when.slice(0, 10)}T00:00:00Z` : '1980-01-01T00:00:00Z';
    const prv = docText(doc).replace(/\t/g, ' ').slice(0, 1000), imgs = docImages(doc);
    const imgItems = imgs.map((_, i) => `<opf:item id="image${i + 1}" href="BinData/image${i + 1}.jpg" media-type="image/jpg" isEmbeded="1"/>`).join('');
    const hpf = `${DECL}<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${xe(doc.title)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">RENEWMAP</opf:meta><opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/><opf:meta name="lastsaveby" content="text">RENEWMAP</opf:meta><opf:meta name="CreatedDate" content="text">${iso}</opf:meta><opf:meta name="ModifiedDate" content="text">${iso}</opf:meta><opf:meta name="keyword" content="text"/></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/>${imgItems}</opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
    const rdf = (about, type) => `<rdf:Description rdf:about="${about}"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#${type}"/></rdf:Description>`;
    const part = f => `<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="${f}"/></rdf:Description>`;
    return zipStore([
      { name: 'mimetype', data: 'application/hwp+zip' },
      { name: 'version.xml', data: `${DECL}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="13, 0, 0, 1408 WIN32LEWindows_10"/>` },
      { name: 'Contents/header.xml', data: headerXml(S) },
      { name: 'Contents/section0.xml', data: sectionXml(doc) },
      { name: 'Preview/PrvText.txt', data: prv },
      { name: 'settings.xml', data: `${DECL}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>` },
      { name: 'META-INF/container.rdf', data: `${DECL}<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${part('Contents/header.xml')}${rdf('Contents/header.xml', 'HeaderFile')}${part('Contents/section0.xml')}${rdf('Contents/section0.xml', 'SectionFile')}${rdf('', 'Document')}</rdf:RDF>` },
      { name: 'Contents/content.hpf', data: hpf },
      { name: 'META-INF/container.xml', data: `${DECL}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>` },
      { name: 'META-INF/manifest.xml', data: `${DECL}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>` },
      ...imgs.map((img, i) => ({ name: `BinData/image${i + 1}.jpg`, data: img.bytes })),
    ], when);
  }

  // ══════════════════════════════════════ XLSX(OpenXML 최소 구성, inlineStr)
  const colName = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const sheetName = (s, used) => { let n = String(s).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || '시트'; while (used.has(n)) n = n.slice(0, 28) + '_' + used.size; used.add(n); return n; };
  // sheets: [{ name, rows: [[string|number|null]], widths?: [number] }] 첫 줄은 머리글(굵게·고정·필터)
  function xlsxBytes(sheets, when) {
    const used = new Set(), list = sheets.map(s => ({ ...s, name: sheetName(s.name, used) }));
    const cellXml = (v, r, c, head) => {
      const ref = `${colName(c)}${r + 1}`, s = head ? 1 : 2;
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(String(v).slice(0, 32000))}</t></is></c>`;
    };
    const sheetXml = sh => {
      const ncol = Math.max(1, ...sh.rows.map(r => r.length)), w = sh.widths || [];
      const cols = `<cols>${Array.from({ length: ncol }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${w[i] || 16}" customWidth="1"/>`).join('')}</cols>`;
      return `${DECL}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>` +
        sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(v, ri, ci, ri === 0)).join('')}</row>`).join('') + `</sheetData>` +
        (sh.rows.length > 1 ? `<autoFilter ref="A1:${colName(ncol - 1)}${sh.rows.length}"/>` : '') + `</worksheet>`;
    };
    const files = [
      { name: '[Content_Types].xml', data: `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `${DECL}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((s, i) => `<sheet name="${he(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `${DECL}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ];
    return zipStore(files, when);
  }

  // 한 동의 대표점: 가장 큰 폴리곤의 무게중심(EPSG:4326). 오목해서 밖에 떨어지면 그 위도의 가장 넓은 안쪽 구간 가운데
  function repPoint(feature) {
    const g = feature && feature.geometry; if (!g) return null;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; if (!polys.length) return null;
    const area = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
    const big = polys.map(p => p[0]).filter(r => r && r.length > 3).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0]; if (!big) return null;
    const A = area(big); let cx = 0, cy = 0;
    for (let i = 0; i < big.length - 1; i++) { const f = big[i][0] * big[i + 1][1] - big[i + 1][0] * big[i][1]; cx += (big[i][0] + big[i + 1][0]) * f; cy += (big[i][1] + big[i + 1][1]) * f; }
    cx /= 6 * A; cy /= 6 * A;
    const xs = (y) => { const out = []; for (let i = 0; i < big.length - 1; i++) { const [x1, y1] = big[i], [x2, y2] = big[i + 1]; if ((y1 <= y) !== (y2 <= y)) out.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1)); } return out.sort((a, b) => a - b); };
    const inside = (x, y) => { const s = xs(y); for (let i = 0; i + 1 < s.length; i += 2) if (x >= s[i] && x <= s[i + 1]) return true; return false; };
    if (!inside(cx, cy)) { const s = xs(cy); let best = null; for (let i = 0; i + 1 < s.length; i += 2) if (!best || s[i + 1] - s[i] > best[1] - best[0]) best = [s[i], s[i + 1]]; if (best) cx = (best[0] + best[1]) / 2; }
    return { lat: +cy.toFixed(6), lon: +cx.toFixed(6) };
  }

  // 한 동 근거서 통합표(XLSX): 현황·기준 대비·시계열·출처. 모든 시트 첫 열에 code8
  function workbookSheets(doc) {
    const b = doc.brief, src = doc.src, rp = b.geo ? repPoint(b.geo) : null, kind = '행정동';
    const head = ['code8', '동'];
    const status = [[...head, '행정구역 구분(법정동/행정동)', '대표점 위도(EPSG:4326)', '대표점 경도(EPSG:4326)', '지표 묶음', '지표', '값', '단위', '값의 공간 단위', '기준일', '상태', '출처 번호', '출처', '라이선스']];
    for (const it of b.items) {
      const c = it.cell, f = it.fact, g = [b.code8, b.dongName, kind, rp ? rp.lat : null, rp ? rp.lon : null, it.group, clean(it.label)];
      if (c) status.push([...g, usable(c) && isNum(c.value) ? c.value : fmtCell(c), c.unit, c.spatial_unit || '', govDate(c.reference_date), c.status, src.number(c, it.group === '전망'), c.source_name, licenseOf(c)]);
      else if (f) status.push([...g, f.value, f.unit, '시군구', govDate(f.reference_date), '-', src.number(f), f.source_name, f.license]);
      else status.push([...g, noData(), '-', '', '-', '-', '', '-', '-']);
    }
    status.push([]); status.push([b.code8, b.dongName, tpl().overview_basis]);
    const crit = [[...head, ...b.crit.rows[0]], ...b.crit.rows.slice(1).map(r => [b.code8, b.dongName, ...r.map(clean)])];
    const ser = [[...head, ...b.ser.raw[0]], ...b.ser.raw.slice(1).map(r => [b.code8, b.dongName, ...r])];
    ser.push([]); b.ser.notes.forEach(n => ser.push([b.code8, b.dongName, n]));
    const so = [[...head, '출처 번호', '지표', '출처', 'URL', '기준일(전망은 대상일)', '조회일', '이용조건', '계산식', '규칙 버전', '셀 ID']];
    for (const it of b.items) {
      const c = it.cell, f = it.fact; if (!c && !f) continue;
      const d = c || f;
      so.push([b.code8, b.dongName, src.number(d, it.group === '전망'), clean(it.label), d.source_name, d.source_url, govDate(d.reference_date), govDate((d.retrieved_at || '').slice(0, 10)), c ? licenseOf(c) : f.license,
        c ? `${c.formula_id}: ${c.formula_text}` : f.formula, c ? c.rule_version : f.rule_version, c ? c.cell_id : '']);
    }
    so.push([]); so.push([b.code8, b.dongName, 'snapshot_hash', b.snapshot]);
    return [
      { name: '현황', rows: status, widths: [11, 12, 12, 13, 13, 12, 34, 14, 8, 12, 12, 9, 8, 40, 16] },
      { name: '기준 대비', rows: crit, widths: [11, 12, 38, 14, 14, 44, 18, 20] },
      { name: '시계열', rows: ser, widths: [11, 12, 34, ...Array(SERIES_YEARS).fill(10)] },
      { name: '출처', rows: so, widths: [11, 12, 8, 34, 40, 50, 12, 12, 16, 50, 16, 26] },
    ];
  }
  const workbookBytes = doc => xlsxBytes(workbookSheets(doc), doc.writtenOn);

  // ══════════════════════════════════════ 복사용 표 조각(HWP·엑셀 붙여넣기)
  const cellText = s => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  // text/html(table)과 text/plain(탭 구분)을 함께 만든다. 열 머리가 있으면 <thead>
  function tablePayload(rows, caption, header = true) {
    const tr = (r, tag) => `<tr>${r.map(c => `<${tag}>${xe(cellText(c))}</${tag}>`).join('')}</tr>`;
    const body = header ? `<thead>${tr(rows[0], 'th')}</thead><tbody>${rows.slice(1).map(r => tr(r, 'td')).join('')}</tbody>` : `<tbody>${rows.map(r => tr(r, 'td')).join('')}</tbody>`;
    return { html: `<meta charset="utf-8"><table border="1" cellspacing="0" cellpadding="4">${caption ? `<caption>${xe(cellText(caption))}</caption>` : ''}${body}</table>`, text: rows.map(r => r.map(cellText).join('\t')).join('\n') };
  }
  const sentencePayload = text => ({ html: `<meta charset="utf-8"><p>${xe(cellText(text))}</p>`, text: cellText(text) });
  // env를 바꿔 끼울 수 있게 해 둔다(시험). 먼저 ClipboardItem으로 두 형식을 함께 쓰고, 막히면 copy 이벤트로 같은 두 형식을 싣는다
  async function copyToClipboard(p, env) {
    const e = env || (typeof window !== 'undefined' ? window : {}), nav = e.navigator;
    if (nav && nav.clipboard && typeof nav.clipboard.write === 'function' && e.ClipboardItem) {
      try {
        const Blob_ = e.Blob || Blob;
        await nav.clipboard.write([new e.ClipboardItem({ 'text/html': new Blob_([p.html], { type: 'text/html' }), 'text/plain': new Blob_([p.text], { type: 'text/plain' }) })]);
        return 'rich';
      } catch (err) { /* 권한·보안 컨텍스트 문제: 아래 대체 경로 */ }
    }
    const d = e.document;
    if (d && typeof d.execCommand === 'function') {
      const on = ev => { ev.clipboardData.setData('text/html', p.html); ev.clipboardData.setData('text/plain', p.text); ev.preventDefault(); };
      d.addEventListener('copy', on, { once: true });
      const ok = d.execCommand('copy'); d.removeEventListener('copy', on);
      if (ok) return 'event';
    }
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') { await nav.clipboard.writeText(p.text); return 'text'; }
    throw new Error('clipboard unavailable');
  }

  // ── 양식에 붙일 조각(dong_brief.build_fragments 옮김). 정의는 JSON의 fragments, 이 함수는 같은 규칙으로 해석한다
  // 조각 = 문장 5개 이하 + 표 1개(5열 이하) + 출처 줄. 출처 번호는 조각 안에서 1부터 새로 매긴다(양식에 붙이면 이 조각만 남기 때문)
  class LocalRefs {
    constructor() { this.items = []; }
    ref(d, forecast) {
      if (!d) return '';
      const name = displayName(d.source_name), key = JSON.stringify([name, d.reference_date, !!forecast]);
      let i = this.items.findIndex(x => x.key === key);
      if (i < 0) { this.items.push({ key, name, date: d.reference_date, forecast: !!forecast }); i = this.items.length - 1; }
      return `[${i + 1}]`;
    }
    refs(ds) { const out = []; for (const d of ds) { const r = this.ref(d); if (r && !out.includes(r)) out.push(r); } return out.sort((a, b) => +a.slice(1, -1) - +b.slice(1, -1)).join(''); }
    lines(foot) { return this.items.map((x, n) => `[${n + 1}] ${x.name}. ${x.forecast ? '전망 대상일' : '기준일'} ${govDate(x.date)}`).concat([foot]); }
  }
  // 가장 먼 지평의 전망 셀 { mid, lo, hi }. 전망값이 없거나 숨김이면 null
  function forecastCells(byCode, base) {
    const re = new RegExp(`^FORECAST_${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_H(\\d+)(?:_(LO|HI))?$`), best = new Map();
    for (const [code, c] of byCode) { const m = re.exec(code); if (m) { const h = +m[1]; if (!best.has(h)) best.set(h, {}); best.get(h)[{ undefined: 'mid', LO: 'lo', HI: 'hi' }[m[2]]] = c; } }
    for (const h of [...best.keys()].sort((a, b) => b - a)) if (usable(best.get(h).mid)) return best.get(h);
    return null;
  }
  const pend = (v, spec) => (spec.pending && !ruleApproved() && v !== UNKNOWN ? v + PENDING_SUFFIX : v);
  const verdictCell = (spec, by) => pend(judge(by.get(spec.code) || null, spec.op, spec.thr), spec);
  // 값은 확정된 충족 수의 하한이라 확정 못 한 요건(n_req - sample_n)이 남으면 '비해당'으로 단정하지 않는다
  function countVerdictCell(spec, by) {
    const c = by.get(spec.code) || null; let v = judge(c, 'ge', spec.thr);
    if (v === INSIDE && spec.n_req - (c.sample_n || 0) + c.value >= spec.thr) v = UNKNOWN;
    return pend(v, spec);
  }
  function tableCell(sp, by, facts, refs, fc) {
    if (typeof sp === 'string') return sp;
    const [k, a] = Object.entries(sp)[0];
    if (k === 'forecast') { const m = fc && fc.mid; return !m ? noData() : { mid: valueWithUnit(m), date: govDate(m.reference_date), ref: refs.ref(m, true) }[a]; }
    if (k === 'verdict') return verdictCell(a, by);
    if (k === 'count_verdict') return countVerdictCell(a, by);
    const c = by.get(a) || null, f = facts.get(a) || null, d = c || f;
    if (k === 'value') return !c && f ? f.value : valueWithUnit(c);
    if (k === 'date') return d ? govDate(d.reference_date) : '-';
    return refs.ref(d) || '-';          // k === 'ref'
  }
  function buildFragments(brief, ids) {
    const TP = tpl(), out = [];
    if (!brief.items || !brief.items.length) throw new BriefError('buildBrief()로 만든 brief가 아니어서 항목 정보가 없다');
    const by = new Map(brief.items.filter(i => i.cell).map(i => [i.code, i.cell])), facts = new Map(brief.items.filter(i => i.fact).map(i => [i.code, i.fact]));
    for (const frag of TP.fragments || []) {
      if (ids && !ids.includes(frag.id)) continue;
      for (const v of frag.variants) {
        const refs = new LocalRefs(), sents = []; let fcUsed = false;
        for (const sp of v.sentences) {
          if ((sp.when === 'rule_pending' && ruleApproved()) || (sp.when === 'forecast_used' && !fcUsed)) continue;
          const kw = { dong: brief.dongName, sg: brief.sgName, year: brief.year, v: '', v2: '', lo: '', hi: '', ref: '' };
          if (sp.forecast) {
            const f = forecastCells(by, sp.forecast); if (!f) continue;
            Object.assign(kw, { year: f.mid.reference_date.slice(0, 4), v: valueWithUnit(f.mid), lo: valueWithUnit(f.lo), hi: valueWithUnit(f.hi), ref: refs.ref(f.mid, true) });
          } else if (sp.codes && sp.codes.length) {
            const cs = sp.codes.map(c => by.get(c) || null), fact = sp.codes.length === 1 && !cs[0] ? facts.get(sp.codes[0]) || null : null;
            if (!fact && !cs.every(usable)) continue;
            Object.assign(kw, { v: fact ? fact.value : valueWithUnit(cs[0]), v2: cs.length > 1 ? valueWithUnit(cs[1]) : '', ref: refs.refs(fact ? [fact] : cs) });
          }
          const s = fill(sp.template, kw);
          if (sentenceLen(s) <= SENTENCE_MAX) { sents.push({ text: s, formItem: sp.form_item || '' }); fcUsed = fcUsed || !!sp.forecast; }
        }
        const tb = v.table, fc = forecastCells(by, 'DECLINE_POP_TOTAL');
        const rows = [tb.columns.slice(), ...tb.rows.map(r => r.map(sp => clean(String(tableCell(sp, by, facts, refs, fc)))))];
        out.push({ id: frag.id, variant: v.id, title: `${frag.title} · ${v.title}`, form: frag.form, verified: frag.verified, formItem: tb.form_item || '', lead: `${brief.region} ${brief.year}년 기준`,
          sentences: sents.map(x => clean(x.text)), formItems: sents.map(x => x.formItem), caption: tb.caption, rows, widths: tb.widths, sources: refs.lines(v.source_foot).map(clean) });
      }
    }
    return out;
  }
  // 드롭다운 항목: 양식 3종, 변형이 둘 이상이면 변형 고르기
  const fragmentChoices = () => ((tpl().fragments) || []).map(f => ({ id: f.id, title: f.title, form: f.form, verified: f.verified, variants: f.variants.map(v => ({ id: v.id, title: v.title })) }));
  // 조각 전체(문장·표·출처)를 한 번에 복사하는 내용
  function fragmentPayload(fr) {
    const t = tablePayload(fr.rows, fr.caption);
    return { html: `<meta charset="utf-8"><p>${xe(fr.lead)}</p>${fr.sentences.map(s => `<p>${xe(s)}</p>`).join('')}${t.html.replace('<meta charset="utf-8">', '')}${fr.sources.map(s => `<p>${xe(s)}</p>`).join('')}`,
      text: [fr.lead, ...fr.sentences, fr.caption, t.text, ...fr.sources].join('\n') };
  }
  function fragmentHTML(fr) {
    const tbl = docHTML({ blocks: [block('table', '', { rows: fr.rows, widths: fr.widths, caption: fr.caption })], parts: {} }, { copy: true }).html;
    return `<div class="dg-frag"><p class="dg-lead">${he(fr.lead)}${fr.verified ? ` · 양식 확인 상태: ${he(fr.verified)}` : ''}</p><p class="dg-small">${he(fr.form)}</p>` +
      fr.sentences.map((s, i) => `<p class="dg-p">${he(s)}<small class="dg-fi">${fr.formItems[i] ? `양식 항목: ${he(fr.formItems[i])}` : ''}</small><button type="button" class="dg-copy-s" data-frag-sentence="${i}">${COPY_SENT}</button></p>`).join('') +
      tbl + fr.sources.map(s => `<p class="dg-small">${he(s)}</p>`).join('') + `<p><button type="button" class="btn ghost dg-copy" data-frag-all>조각 전체 복사(문장·표·출처)</button></p></div>`;
  }

  // ══════════════════════════════════════ 화면용 HTML(1쪽 요약·인쇄). 인라인 style 속성을 쓰지 않는다(CSP)
  const COPY_TABLE = '📋 표 복사(HWP/엑셀 붙여넣기)', COPY_SENT = '문장 복사';
  const runsHTML = (text, emph) => textRuns(text, emph).map(([t, look]) => (look === 'b' ? `<b>${he(t)}</b>` : look === 'sup' ? `<sup class="dg-ref">${he(t)}</sup>` : he(t))).join('');
  function docHTML(doc, o) {
    const opt = o || {}, tables = [];
    let out = '', sec = '';
    const flush = () => { if (sec) { out += sec; sec = ''; } };
    for (const b of doc.blocks) {
      if (b.kind === 'title') out += `<h3 class="dg-title">${he(b.text)}</h3>`;
      else if (b.kind === 'images') out += `<div class="dg-photos">${b.images.map(i => `<figure><img src="${he(i.src || '')}" alt="${he(i.caption)}"><figcaption>${he(i.caption)}</figcaption></figure>`).join('')}</div><p class="dg-small">${he(b.text)}</p>`;
      else if (b.kind === 'box') out += `<table class="dg-box"><tbody>${b.rows.map(r => `<tr><th scope="row">${he(r[0])}</th><td>${b.refs ? runsHTML(r[1]) : he(r[1])}</td></tr>`).join('')}</tbody></table>`;
      else if (b.kind === 'table') {
        const n = tables.push(b) - 1;
        out += `<div class="dg-tbl"><div class="dg-tbl-h" aria-live="polite"><b>${he(b.caption)}</b>${opt.copy ? `<button type="button" class="btn ghost dg-copy" data-copy-table="${n}">${COPY_TABLE}</button>` : ''}</div><div class="table-wrap"><table class="dg-table"><thead><tr>${b.rows[0].map(c => `<th scope="col">${he(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.slice(1).map(r => `<tr>${r.map(c => `<td>${he(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
      }
      else if (b.kind === 'h1') out += `<h4 class="dg-h1">${he(b.text)}</h4>`;
      else if (b.kind === 'h2') out += `<h5 class="dg-h2">${he(b.text)}</h5>`;
      else if (b.kind === 'bullet') out += `<p class="dg-bullet">- ${runsHTML(b.text)}</p>`;
      else out += `<p class="${b.cls === 'src' ? 'dg-src' : b.small ? 'dg-small' : b.strong ? 'dg-p dg-key' : 'dg-p'}">${b.small || b.cls === 'src' ? he(b.text) : runsHTML(b.text, b.emph)}${opt.copy && doc.parts && doc.parts.summary && doc.parts.summary.includes(b) ? `<button type="button" class="dg-copy-s" data-copy-sentence="${doc.parts.summary.indexOf(b)}">${COPY_SENT}</button>` : ''}</p>`;
    }
    flush();
    return { html: out, tables };
  }

  // ══════════════════════════════════════ 지도 이미지(PNG): 타일 없이 경계·색·범례·출처만
  // model: { features, colorOf(code)→색|null, title, subtitle, legend: [{ color, label, hatch }], std, source, base, labels?: bool }
  const FONT_STACK = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  function projectFeatures(features, W) {
    const rings = f => { const g = f && f.geometry; return !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []; };
    const feats = (features || []).filter(f => rings(f).length);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of feats) for (const r of rings(f)) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (!feats.length) return { w: W, h: 0, paths: [] };
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), s = W / (((x1 - x0) * k) || 1), h = Math.max(1, Math.round((y1 - y0) * s));
    const paths = feats.map(f => {
      const d = rings(f).map(r => { let prev = ''; const pts = []; for (const [x, y] of r) { const p = `${((x - x0) * k * s).toFixed(1)} ${((y1 - y) * s).toFixed(1)}`; if (p !== prev) pts.push(p); prev = p; } return pts.length > 2 ? 'M' + pts.join('L') + 'Z' : ''; }).join('');
      return { code: String((f.properties || {}).code), name: String((f.properties || {}).name || ''), d };
    }).filter(p => p.d);
    return { w: W, h, paths };
  }
  function wrapText(s, max) {
    const out = []; let line = '';
    for (const ch of String(s)) { line += ch; if (line.length >= max && /\s|[,.·)]/.test(ch)) { out.push(line.trim()); line = ''; } }
    if (line.trim()) out.push(line.trim());
    return out;
  }
  function mapSvg(model) {
    const W = 1200, M = 40, MW = W - M * 2, sh = projectFeatures(model.features, MW), mapH = Math.min(Math.max(sh.h, 240), 1100), sc = sh.h > mapH ? mapH / sh.h : 1;
    const head = [model.title, model.subtitle].filter(Boolean), legend = model.legend || [];
    const footLines = [model.std, `출처 ${model.source || '-'}${model.base ? ` · ${model.base}` : ''}`, `배경 지도 제외(경계·색만 표시) · 판정 아님 · 가공: 리뉴맵`, model.osm ? '© OpenStreetMap contributors' : null].filter(Boolean).flatMap(t => wrapText(clean(t), 70));
    const top = M + 34 + (model.subtitle ? 28 : 0) + 14, legendH = Math.ceil(legend.length / 3) * 28 + 8, H = Math.round(top + mapH * 1 + 16 + legendH + footLines.length * 24 + M);
    const paths = sh.paths.map(p => `<path d="${p.d}" fill="${model.colorOf(p.code) || 'url(#hatch)'}" stroke="#ffffff" stroke-width="${sh.paths.length > 80 ? 0.6 : 1.4}"/>`).join('');
    const leg = legend.map((l, i) => `<g transform="translate(${M + (i % 3) * (MW / 3)} ${top + mapH + 16 + Math.floor(i / 3) * 28})"><rect width="22" height="16" rx="3" fill="${l.hatch ? 'url(#hatch)' : l.color}" stroke="#6b7a75" stroke-width="0.8"/><text x="30" y="13" font-size="15" fill="#153c39">${xe(clean(l.label))}</text></g>`).join('');
    const foot = footLines.map((t, i) => `<text x="${M}" y="${top + mapH + 16 + legendH + 18 + i * 24}" font-size="${i === 0 && model.std ? 15 : 14}" fill="#4f625d">${xe(t)}</text>`).join('');
    const title = `<text x="${M}" y="${M + 22}" font-size="26" font-weight="700" fill="#153c39">${xe(clean(head[0] || ''))}</text>${model.subtitle ? `<text x="${M}" y="${M + 52}" font-size="16" fill="#4f625d">${xe(clean(model.subtitle))}</text>` : ''}`;
    const body = `<g transform="translate(${M} ${top}) scale(${sc})">${paths}</g>`;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT_STACK}'><defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#d4dbd8"/><line x1="0" y1="0" x2="0" y2="6" stroke="#6b7a75" stroke-width="2"/></pattern></defs><rect width="${W}" height="${H}" fill="#ffffff"/>${title}${body}${leg}${foot}</svg>`, width: W, height: H };
  }

  // ══════════════════════════════════════ 브라우저 전용: 저장·PNG
  const safeName = s => String(s).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'renewmap';
  // ══════════════════════════════════════ DOCX·PPTX (같은 doc 블록에서 만든다. HWPX·XLSX와 숫자·문장이 같다)
  const OX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const CT_OPEN = 'application/vnd.openxmlformats-officedocument.';
  const rels = list => `${OX}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

  function docxBytes(doc) {
    const FONT = '나눔고딕';
    // 1쪽 요약은 글자·간격·여백을 줄여 Word에서도 1쪽에 담는다(HWPX는 sizesFor로 같은 일을 한다)
    const OP = !!doc.onepage, PT = OP ? { body: 9.5, tbl: 8.5, h1: 11, h2: 10, title: 16, small: 7.5, strong: 10.5, line: 270, gap: 70, margin: 850 } : { body: 11, tbl: 9.5, h1: 14, h2: 12, title: 20, small: 8.5, strong: 12.5, line: 340, gap: 120, margin: 1134 };
    const run = (t, look, pt, bold, color) => `<w:r><w:rPr>${bold || look === 'b' ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${pt ? `<w:sz w:val="${Math.round(pt * 2)}"/>` : ''}${look === 'sup' ? '<w:vertAlign w:val="superscript"/>' : ''}</w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
    const p = (runs, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? PT.gap : o.after}" w:line="${o.line || PT.line}" w:lineRule="auto"/>${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="200"/>` : ''}${o.center ? '<w:jc w:val="center"/>' : ''}</w:pPr>${runs}</w:p>`;
    const W = 11906 - 2 * PT.margin;   // A4 본문 폭(여백 2cm), 1/20pt
    const table = (rows, widths, header) => {
      const n = rows[0].length, tot = widths.reduce((a, b) => a + b, 0) || 1, w = widths.slice(0, n).map(x => Math.round(W * x / tot)); w[n - 1] += W - w.reduce((a, b) => a + b, 0);
      const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('');
      const cell = (t, r, c) => { const head = header ? r === 0 : c === 0; return `<w:tc><w:tcPr><w:tcW w:w="${w[c]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E7ECEA"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${p(run(String(t).replace(/\s*\n\s*/g, ' '), '', PT.tbl, head), { after: 0, line: PT.line - 60 })}</w:tc>`; };
      return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${w.map(x => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${rows.map((r, ri) => `<w:tr>${header && ri === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${r.map((t, ci) => cell(t, ri, ci)).join('')}</w:tr>`).join('')}</w:tbl>`;
    };
    const runsOf = (text, emph, pt, bold) => textRuns(text, emph).map(([t, look]) => run(t, look, pt, bold)).join('');
    let body = '';
    for (const b of doc.blocks) {
      if (b.kind === 'title') body += p(run(b.text, '', PT.title, true), { style: 'Title', center: true, after: PT.gap * 2 });
      else if (b.kind === 'box') body += table(b.rows, b.widths, false) + p('', { after: PT.gap });
      else if (b.kind === 'table') body += (b.caption ? p(run(b.caption, '', PT.tbl + 0.5, true), { keep: true, after: 40 }) : '') + table(b.rows, b.widths, true) + p('', { after: PT.gap });
      else if (b.kind === 'h1') body += p(run(b.text, '', PT.h1, true), { style: 'Heading1', keep: true, before: PT.gap * 2, after: PT.gap });
      else if (b.kind === 'h2') body += p(run(b.text, '', PT.h2, true), { style: 'Heading2', keep: true, before: PT.gap, after: 60 });
      else if (b.kind === 'bullet') body += p(run('- ', '', PT.body) + runsOf(b.text, false, PT.body), { ind: 340 });
      else if (b.small) body += p(run(b.text, '', PT.small), { after: 30, line: PT.line - 60 });
      else if (b.strong) body += p(runsOf(b.text, true, PT.strong, true), { after: PT.gap });
      else body += p(runsOf(b.text, b.emph, PT.body));
    }
    const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${PT.margin}" w:right="${PT.margin}" w:bottom="${PT.margin}" w:left="${PT.margin}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const styles = `${OX}<w:styles ${NS_W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault></w:docDefaults>`
      + ['Normal|Normal|', 'Title|Title|<w:keepNext/>', 'Heading1|heading 1|<w:keepNext/><w:outlineLvl w:val="0"/>', 'Heading2|heading 2|<w:keepNext/><w:outlineLvl w:val="1"/>'].map(s => { const [id, name, ppr] = s.split('|'); return `<w:style w:type="paragraph" w:styleId="${id}"${id === 'Normal' ? ' w:default="1"' : ''}><w:name w:val="${name}"/>${id === 'Normal' ? '' : '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'}${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}</w:style>`; }).join('') + '</w:styles>';
    const ftr = `${OX}<w:ftr ${NS_W}>${p(run(doc.footer || '', '', 8, false, '595959'), { center: true, after: 0 })}</w:ftr>`;
    const iso = /^\d{4}-\d{2}-\d{2}/.test(doc.writtenOn || '') ? `${doc.writtenOn.slice(0, 10)}T00:00:00Z` : '1980-01-01T00:00:00Z';
    return zipStore([
      { name: '[Content_Types].xml', data: `${OX}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${CT_OPEN}wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${CT_OPEN}wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="${CT_OPEN}wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `${OX}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `${OX}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(doc.title)}</dc:title><dc:creator>RENEWMAP</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created></cp:coreProperties>` },
      { name: 'word/document.xml', data: `${OX}<w:document ${NS_W}><w:body>${body}${sect}</w:body></w:document>` },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/footer1.xml', data: ftr },
      { name: 'word/_rels/document.xml.rels', data: rels([['rId1', 'styles', 'styles.xml'], ['rId2', 'footer', 'footer1.xml']]) },
    ], doc.writtenOn || '');
  }

  // PPTX: 장(h1)마다 슬라이드를 만들고, 줄·표가 많으면 이어서 다음 슬라이드로 넘긴다. 출처 목록도 슬라이드로 넣어 숫자의 출처가 빠지지 않게 한다.
  function pptxBytes(doc) {
    const SW = 12192000, SH = 6858000, M = 457200, FONT = '나눔고딕', MAX_LINES = 7, MAX_ROWS = 8;
    const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const rp = (pt, bold, color, sup) => `<a:rPr lang="ko-KR" sz="${Math.round(pt * 100)}"${bold ? ' b="1"' : ''}${sup ? ' baseline="30000"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${color || '153C39'}"/></a:solidFill><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/></a:rPr>`;
    const para = (runs, o = {}) => `<a:p><a:pPr${o.bullet ? ' marL="285750" indent="-285750"' : ''}><a:spcBef><a:spcPts val="${o.before || 0}"/></a:spcBef>${o.bullet ? '<a:buFont typeface="Arial"/><a:buChar char="-"/>' : '<a:buNone/>'}</a:pPr>${runs}</a:p>`;
    const runsOf = (text, pt, bold, color) => textRuns(text, false).map(([t, look]) => `<a:r>${rp(pt, bold || look === 'b', color, look === 'sup')}<a:t>${xe(t)}</a:t></a:r>`).join('');
    let sid = 1;
    const box = (name, x, y, w, h, paras) => `<p:sp><p:nvSpPr><p:cNvPr id="${++sid}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
    const ROW_H = 400000;
    const tableFrame = (rows, widths) => {
      const n = rows[0].length, tot = widths.reduce((a, b) => a + b, 0) || 1, W = SW - 2 * M, w = widths.slice(0, n).map(x => Math.round(W * x / tot)); w[n - 1] += W - w.reduce((a, b) => a + b, 0);
      const cell = (t, r) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(`<a:r>${rp(r === 0 ? 11 : 10.5, r === 0)}<a:t>${xe(String(t).replace(/\s*\n\s*/g, ' '))}</a:t></a:r>`)}</a:txBody><a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="ctr">${['L', 'R', 'T', 'B'].map(s => `<a:ln${s} w="6350"><a:solidFill><a:srgbClr val="808080"/></a:solidFill></a:ln${s}>`).join('')}${r === 0 ? '<a:solidFill><a:srgbClr val="E7ECEA"/></a:solidFill>' : ''}</a:tcPr></a:tc>`;
      return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${++sid}" name="표"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${M}" y="1150000"/><a:ext cx="${W}" cy="${ROW_H * rows.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${w.map(x => `<a:gridCol w="${x}"/>`).join('')}</a:tblGrid>${rows.map((r, ri) => `<a:tr h="${ROW_H}">${r.map(t => cell(t, ri)).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    };
    const slides = [];   // {title, lines:[{text,bullet,bold,size,color,before}], table}
    let cur = null;
    const open = title => { cur = { title, lines: [], table: null }; slides.push(cur); };
    const flush = () => { if (cur && !cur.lines.length && !cur.table) slides.pop(); cur = null; };
    const again = () => { const t = cur.title; flush(); open(t); };
    open(doc.title);
    for (const b of doc.blocks.slice(1)) {
      if (b.kind === 'h1') { flush(); open(b.text); }
      else if (b.kind === 'h2') { if (cur.table || cur.lines.length >= MAX_LINES) again(); cur.lines.push({ text: b.text, bold: true, size: 17, before: 600 }); }
      else if (b.kind === 'table' || b.kind === 'box') {
        const head = b.kind === 'table' ? [b.rows[0]] : [], body = b.kind === 'table' ? b.rows.slice(1) : b.rows;
        for (let i = 0; i < Math.max(body.length, 1); i += MAX_ROWS) {
          if (cur.lines.length || cur.table) again();
          cur.table = { rows: [...head, ...body.slice(i, i + MAX_ROWS)], widths: b.widths };
          if (b.caption) cur.lines.push({ text: b.caption, size: 12, bold: true });
        }
        again();
      } else {
        if (cur.table || cur.lines.length >= MAX_LINES) again();
        cur.lines.push({ text: b.text, bullet: b.kind === 'bullet', size: b.small ? 10 : b.strong ? 19 : 16, bold: !!b.strong, color: b.small ? '595959' : null });
      }
    }
    flush();
    const total = slides.length;
    const grpXml = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    const slideXml = (s, i) => {
      sid = 1;
      const title = box('제목', M, 300000, SW - 2 * M, 700000, para(`<a:r>${rp(i === 0 ? 30 : 26, true, '006F5B')}<a:t>${xe(s.title)}</a:t></a:r>`));
      const table = s.table ? tableFrame(s.table.rows, s.table.widths) : '';
      const y = s.table ? 1150000 + ROW_H * s.table.rows.length + 150000 : 1200000;
      const lines = s.lines.length ? box('본문', M, y, SW - 2 * M, SH - y - 600000, s.lines.map(l => para(runsOf(l.text, l.size || 16, l.bold, l.color), { bullet: l.bullet, before: l.before || 400 })).join('')) : '';
      const foot = box('쪽·출처', M, SH - 480000, SW - 2 * M, 380000, para(`<a:r>${rp(9, false, '595959')}<a:t>${xe(`${doc.footer || ''} · ${i + 1}/${total}`)}</a:t></a:r>`));
      return `${OX}<p:sld ${ns}><p:cSld><p:spTree>${grpXml}${title}${table}${lines}${foot}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    };
    const clr = ['dk1 000000', 'lt1 FFFFFF', 'dk2 153C39', 'lt2 F2F5F3', 'accent1 006F5B', 'accent2 D7F988', 'accent3 8A4B00', 'accent4 2E7D5E', 'accent5 4F625D', 'accent6 102F2D', 'hlink 006F5B', 'folHlink 4F625D'].map(s => { const [n, v] = s.split(' '); return `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`; }).join('');
    const fills = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3), lns = '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3);
    const theme = `${OX}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="리뉴맵"><a:themeElements><a:clrScheme name="리뉴맵">${clr}</a:clrScheme><a:fontScheme name="리뉴맵"><a:majorFont><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="리뉴맵"><a:fillStyleLst>${fills}</a:fillStyleLst><a:lnStyleLst>${lns}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fills}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
    const master = `${OX}<p:sldMaster ${ns}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${grpXml}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
    const layout = `${OX}<p:sldLayout ${ns} type="blank" preserve="1"><p:cSld name="빈 화면"><p:spTree>${grpXml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    const pres = `${OX}<p:presentation ${ns} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
    const ov = (part, ct) => `<Override PartName="${part}" ContentType="${CT_OPEN}${ct}+xml"/>`;
    return zipStore([
      { name: '[Content_Types].xml', data: `${OX}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ov('/ppt/presentation.xml', 'presentationml.presentation.main')}${ov('/ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster')}${ov('/ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout')}${ov('/ppt/theme/theme1.xml', 'theme')}${slides.map((_, i) => ov(`/ppt/slides/slide${i + 1}.xml`, 'presentationml.slide')).join('')}</Types>` },
      { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
      { name: 'ppt/presentation.xml', data: pres },
      { name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...slides.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]) },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: master },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: layout },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
      { name: 'ppt/theme/theme1.xml', data: theme },
      ...slides.flatMap((s, i) => [{ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(s, i) }, { name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) }]),
    ], doc.writtenOn || '');
  }

  function saveBytes(name, data, mime) {
    const blob = new Blob([data], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return blob.size;
  }
  // SVG 글을 data: 주소 그림으로 불러 캔버스에 그린다(CSP img-src data:, 블롭 주소 불필요). 같은 출처 글꼴이 없어 시스템 글꼴을 쓴다
  function svgToPng(svgText, width, height, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image(), k = scale || 2;
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = width * k; c.height = height * k;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => (b ? b.arrayBuffer().then(x => resolve(new Uint8Array(x))) : reject(new Error('png'))), 'image/png');
      };
      img.onerror = () => reject(new Error('svg'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    });
  }

  return {
    crc32, zipStore, dosStamp, BANNED_GLYPHS, clean, fmtNum, roundD, govDate, josa, valueWithUnit, fmtCell, hidden, usable, SRC_HEAD, SENTENCE_MAX, GROUPS, LABEL, DECLINE_CRITERIA, DECLINE_LAW, PURPOSES,
    setTemplates, getTemplates, displayName, BriefError, Sources, sourceLine, buildBrief, buildDoc, buildOnepage, estimateHeightMm, docText, sentenceText, sizesFor, textRuns, headerXml, sectionXml, hwpxBytes, docxBytes, pptxBytes, xlsxBytes, workbookSheets, workbookBytes, colName, repPoint,
    tablePayload, sentencePayload, copyToClipboard, buildFragments, fragmentChoices, fragmentPayload, fragmentHTML, docHTML, COPY_TABLE, COPY_SENT, projectFeatures, mapSvg, safeName, saveBytes, svgToPng, xe,
  };
});
