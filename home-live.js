/* 홈 첫 화면 '지금 이 동네' 카드(2026-11-13 v6). 숫자는 HTML에 적지 않고 원장 셀(national/emd/{시군구}.json)에서 그대로 읽는다(원칙 1).
   보여 주는 셀: 요건 충족 수(DECLINE_MET_COUNT), 인구 감소율 30년, 사업체 감소율 10년, 준공 20년 이상 건축물 비율.
   기준선은 지도(map.js INDICATORS)와 같은 도시재생법 시행령 제17조 문구다. 값이 없으면 0을 만들지 않고 '추가확인'(원칙 4). */
(function (root) {
  'use strict';
  const ROWS = [
    ['DECLINE_POP_DROP30Y_PCT', '인구 감소', 20, '30년 중 가장 많던 해보다 20% 이상 감소, 또는 최근 5년 중 3년 이상 연속 감소'],
    ['DECLINE_BIZ_DROP10Y_PCT', '사업체 감소', 5, '10년 중 가장 많던 해보다 5% 이상 감소, 또는 최근 5년 중 3년 이상 연속 감소'],
    ['DECLINE_AGING_20Y_PCT', '20년 이상 건축물', 50, '준공 20년 이상 건축물이 전체의 50% 이상'],
  ];
  const MET = 'DECLINE_MET_COUNT';
  // 1쪽 문서·동 페이지와 같은 자릿수(소수 둘째 자리)로 보인다(11-13 3차: 홈 83%, 문서 82.96%로 달라 보임)
  const { fmt2: fmt, bizZeroNote, BIZ_BOUNDARY, checkWhy } = typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil;
  // 한 동의 셀들 → 카드에 쓸 값(순수 함수, 시험용). 상태는 요건 단위(decline-req.js: 30년·10년 감소율 또는 '최근 5년 중 3년 연속 감소' 중 하나라도 해당이면 해당).
  // v7(11-13 6회차): 감소율 한 길만 보고 '추가확인'을 붙여, 연속 감소로 해당한 동은 머리의 'N개 해당'과 줄이 어긋났다
  const DR = typeof module === 'object' && module.exports ? require('./decline-req.js') : root.DeclineReq;
  // D1(2026-11-20 대표 승인): 머리 판단은 지도 머리와 같다(decline-req metStatus·metFloor). 글은 r16 공통 사전 머리 글 한 벌(decline-req metHead):
  // 추가확인이 남으면 '최소 n개 해당 · 추가확인 m개'('1개 해당'만 쓰면 기준에 못 미친 것으로 읽었다). m은 정하지 못한 요건 수(3 − sample_n)
  // 바탕 총수 시계열에서 값이 있는 마지막 해(사업체 수는 기준일 해의 값이 아직 없을 수 있다). 지어내지 않고 원장 시계열에서만 읽는다
  const lastYear = (pts) => { const p = (pts || []).filter((x) => x && typeof x[1] === 'number').pop(); return p ? p[0] : null; };
  function summarize(cells, series) {
    const by = new Map((cells || []).map((c) => [c.indicator_code, c]));
    const met = by.get(MET), val = (code) => DR.cellValue(by.get(code));   // 미확정·비공개 셀은 셈에 안 쓴다(문서·동 페이지와 같게)
    const reqs = DR.evaluate(val);
    const metV = met && !met.value_hidden_reason && typeof met.value === 'number' ? met.value : null;
    const metState = metV === null ? null : DR.metFloor(met) ? 'floor' : DR.metStatus(met);
    const unknownN = met && typeof met.sample_n === 'number' ? Math.max(0, 3 - met.sample_n) : 3;
    const h = DR.metHead(metV, unknownN, metState);
    const s = {
      met: metV,
      metState,
      head: h.head,
      sub: h.sub,
      rows: ROWS.map(([code, label, , std], i) => {
        const q = reqs[i], c = by.get(code) || null;
        // 감소율의 바탕인 총수 셀이 비어 있으면 같은 줄 작은 글에 밝힌다(11-13 2차: 동 페이지는 '사업체 수 자료 없음'인데 홈은 0%만 보였다)
        const base = code === 'DECLINE_BIZ_DROP10Y_PCT' ? by.get('DECLINE_BIZ_TOTAL') : code === 'DECLINE_POP_DROP30Y_PCT' ? by.get('DECLINE_POP_TOTAL') : null;
        const noBase = !!(base && base.value === null);
        const viaConsec = q.via && /DECL3IN5$/.test(q.via.code);
        // 감소율은 국토부 쇠퇴진단 원천이 직접 준 값이다. 바탕 총수(2025년 사업체 수 등)가 아직 원천에 없어도 그 값으로 판단한다 —
        // 동 페이지·지도·1쪽 문서가 모두 그렇게 한다. v9: 홈만 '추가확인'으로 바꿔, 사업체 총수가 빈 2,238개 동에서 화면끼리 어긋났다
        const unsure = q.status === 'none';
        // r14 출시 감사: 미확정 셀은 판단에 쓰지 않지만 값은 4-1 표처럼 보인다(흐리게, 상태 칸 '추가확인'). 공개 보류 값은 그대로 숨긴다
        const raw = unsure && c && !c.value_hidden_reason && typeof c.value === 'number' ? c.value : null;
        const shown = q.rate === null ? raw : q.rate;
        const text = viaConsec ? '3년 연속 감소' : shown === null ? '–' : `${fmt(shown)}%`;
        const who = label.replace(' 감소', '');
        // 총수가 비면 같은 줄에 몇 년 자료인지 밝힌다(r16: 기준일 2025-12-31과 2024년 사업체 수를 한 줄에서 같은 해로 읽었다). 해는 원장 시계열에서만 읽는다
        const year = String((base && base.reference_date) || '').slice(0, 4);
        const y = noBase ? lastYear((series || {})[base.indicator_code]) : null;
        const baseNote = !noBase ? '' : y ? `${who} 수는 ${y}년 자료입니다(${y + 1}년 자료는 아직 공표 전).` : `${year ? year + '년 ' : ''}${who} 수는 아직 공표 전입니다.`;
        // R3 11: 감소율 0%의 뜻(그 해 사업체 수가 10년 중 최대)을 같은 줄에. 흐리게 보이는 추가확인 값에도 붙인다
        const isBiz = code === 'DECLINE_BIZ_DROP10Y_PCT';
        const zero = isBiz && !viaConsec ? bizZeroNote((series || {}).DECLINE_BIZ_TOTAL, shown) : '';
        // 설명은 가운뎃점으로 잇되, 문장('…입니다.') 뒤에는 겹치지 않는다(r16 4차 P10: '0%입니다. · 사업체 수는')
        const notes = [viaConsec ? '최근 5년 중 3년 이상 연속 감소로 기준 해당' : '', zero, baseNote].filter(Boolean);
        // 추가확인 줄의 까닭 한 줄(util.js checkWhy). 감소율 셀에 없으면 연속 감소 셀에서 찾고, 값이 아예 없으면 '값 없음'
        const why = !unsure ? null : DR.REQS[i].paths.map((p) => checkWhy(by.get(p[0]))).find(Boolean)
          || (!c || c.value === null ? { tag: '이 동 자료', text: '출처에 이 해 값이 없습니다.' } : null);
        const src = viaConsec ? q.via.code : code;   // 값을 누르면 펼칠 출처 기록 셀
        return { code, label, std, referenceDate: (viaConsec ? by.get(q.via.code) : c)?.reference_date, value: q.rate, text, over: unsure ? null : q.status === 'over', cell: c, src, srcCell: by.get(src) || null, note: notes.join(' · ').replace(/\. · /g, '. '), why, boundary: isBiz ? BIZ_BOUNDARY : '' };
      }),
      ref: met ? met.reference_date : null,
    };
    s.unknown = s.rows.filter((r) => r.over === null).length;
    return s;
  }
  const api = { summarize, ROWS };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.HomeLive = api;

  const doc = root.document, card = doc && doc.getElementById('h6Live');
  if (!card) return;
  const $ = (id) => doc.getElementById(id);
  const json = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  let index = null;
  // R3 12: home.js와 같은 약속을 쓴다(dong_index.json 225KB를 한 번만). 실패(null)는 예전처럼 오류로 던진다
  const idx = () => index || (index = root.renewFetch ? root.renewFetch('data/national/dong_index.json').then((d) => { if (!d) throw new Error('dong_index'); return d; }) : json('data/national/dong_index.json'));
  const cache = new Map();
  const sgFile = (sgg) => { if (!cache.has(sgg)) cache.set(sgg, json(`data/national/emd/${sgg}.json`).then((d) => root.RenewCellPack.unpack(d)).catch((e) => { cache.delete(sgg); throw e; })); return cache.get(sgg); };

  const calm = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = { cells: [], name: '' };
  function row(r) {
    const li = doc.createElement('li'), s = doc.createElement('span'), sm = doc.createElement('small');
    // r16: 값을 누르면 그 줄의 출처 기록이 아래 띠에 펼쳐진다(전에는 '숫자를 누르면 출처가 펼쳐집니다'인데 눌러도 아무 일이 없었다)
    const v = doc.createElement(r.srcCell ? 'button' : 'b');
    if (r.srcCell) { v.type = 'button'; v.className = 'h6-val'; v.setAttribute('aria-label', `${r.text}, ${r.label} 값의 출처 보기`); v.addEventListener('click', () => open(r)); }
    // r16 4차 P10: 기준·기준일·설명이 한 줄(130자 넘음)이라 읽히지 않았다 → 기준·기준일 한 줄, 설명(문장)은 다음 줄
    s.textContent = r.label; v.textContent = r.text; sm.textContent = [r.std, r.referenceDate && `기준일 ${r.referenceDate}`].filter(Boolean).join(' · ');
    if (r.note) sm.append(doc.createElement('br'), r.note);
    li.className = r.over === null ? 'is-none' : r.over ? 'is-over' : 'is-under';
    const tag = doc.createElement('i'); tag.textContent = r.over === null ? '추가확인' : r.over ? '기준 해당' : '해당 안 함';
    li.append(s, v, tag, sm);
    if (r.why) { const w = doc.createElement('small'); w.className = 'h6-row-why'; w.textContent = `(${r.why.tag}) ${r.why.text}`; li.append(w); }
    return li;
  }
  function open(r) {
    prov(cur.cells, cur.name, r.boundary, r.src, r.label);
    const box = $('h6Receipt'); if (!box) return;
    box.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
    box.focus({ preventScroll: true });   // 키보드로 누른 사람도 펼친 기록에서 이어 읽는다
  }
  // 근거 영수증: 카드 한 줄(기본은 20년 이상 건축물) 셀의 원장 기록을 그대로 펼친다(값을 만들거나 고치지 않는다)
  // 2026-11-19: 짧은 줄(값·출처·기준일·사람 대조)은 펼쳐 두고, 긴 줄(주소·계산식 등)과 기록 번호는 기록 아래 접이 하나에(휴대폰에서 기록 한 장이 화면 넷이었다)
  const SHOWN = new Set(['값', '출처', '기준일', '사람 대조', '상태']);
  // 원장 상태(D3)는 요건 상태와 다른 축이라 '사람 대조'로 부른다(r16 공통 사전 D)
  const CHECK = { 미확인: '사람 대조 전 · 출처 값을 그대로 옮겼고, 사람이 아직 원문과 대조하지 않았습니다.', 확인중: '사람 대조 중', 확인: '사람 대조 완료',
    충돌: '충돌 · 두 출처 값이 서로 다르거나, 계산 결과와 행정 지정이 서로 다릅니다.' };
  function prov(cells, name, boundary, code = 'DECLINE_AGING_20Y_PCT', label = '20년 이상 건축물') {
    const dl = $('h6ReceiptList'), more = $('h6ReceiptMore'), ids = $('h6ReceiptIds'); if (!dl || !more || !ids) return;
    dl.replaceChildren(); more.replaceChildren(); ids.textContent = '';
    $('h6ReceiptDong').textContent = name;
    $('h6ReceiptK').textContent = `${label} 값의 출처`;
    const c = cells.find((x) => x.indicator_code === code);
    if (!c) { const d = doc.createElement('div'); d.textContent = '이 동은 아직 출처 기록이 연결되지 않았습니다.'; dl.append(d); return; }
    const why = checkWhy(c);
    // OD1: 정해지지 않은 칸은 '추가확인(까닭 꼬리표)'(4-1 표·문서와 같은 꼴)
    const state = c.status === '추가확인' ? `추가확인${why ? `(${why.tag}) · ${why.text}` : ''}` : CHECK[c.status] || c.status;
    // 9회차: '확인하지 못함'이 신뢰를 깎는 대표 예시로 읽혔다. 사실대로 '원천 기관이 계산해 공표한 값'임을 말한다(리뉴맵이 다시 계산하지 않는다)
    const formula = String(c.formula_text || '').replace(/\s*\[미확인\]/g, '(출처 기관이 계산해 공표한 값, 리뉴맵은 다시 계산하지 않음)');
    const value = c.value === null ? '추가확인' : c.unit === '여부(1/0)' ? (c.value ? '있음' : '없음') : `${fmt(c.value)}${c.unit || ''}`;
    const asked = String(c.retrieved_at || '').slice(0, 10);
    const rows = [['값', value], ['출처', [c.source_name, asked && `조회 ${asked}`].filter(Boolean).join(' · ')], ['출처 주소', c.source_url],
      ['기준일', c.reference_date], ['계산식', formula], ['공간 단위', c.spatial_unit], ['이용 조건', c.license_type], [c.status === '추가확인' ? '상태' : '사람 대조', state]];
    if (boundary) rows.push(['사업체 자료', boundary]);
    for (const [k, v] of rows) {
      if (v === undefined || v === null || v === '') continue;
      const box = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd');
      dt.textContent = k; dd.textContent = v; box.append(dt, dd); (SHOWN.has(k) ? dl : more).append(box);
    }
    ids.textContent = `기록 번호 ${c.cell_id} · 규칙 판본 ${c.rule_version}`;
  }
  let last = '21090700';
  async function show(code8) {
    last = code8;
    card.setAttribute('aria-busy', 'true');
    $('h6Retry').hidden = true;
    try {
      const list = await idx();
      const hit = list.find((x) => x[0] === code8);
      if (!hit) { $('h6Met').textContent = ''; $('h6Sub').textContent = '이 지역의 쇠퇴 3요건 자료가 아직 없습니다.'; return; }
      const [code, name, sgg, sggName, sido] = hit;
      const un = await sgFile(sgg);
      const dong = (un.dongs || []).find((d) => d.code7 === code);
      const s = summarize(dong ? dong.cells : [], dong ? dong.series : null);
      cur = { cells: dong ? dong.cells : [], name };
      $('h6LiveName').textContent = name;
      $('h6LiveWhere').textContent = `${sido} ${sggName}`;
      $('h6Met').textContent = s.head;
      $('h6Sub').textContent = s.sub;
      $('h6Rows').replaceChildren(...s.rows.map(row));
      prov(cur.cells, name, '');
      const sidoCode = sgg.slice(0, 2), hash = `#map/${sidoCode}/${sgg}/${code}`;
      // 첫 화면 주 단추도 고른 동의 4-1 표로(r16: 카드는 새 동인데 단추만 반여1동이라 남의 동 표를 받았다). 첫 값은 HTML 그대로 반여1동(D29)
      const brief = `explore.html?report=brief&frag=MLIT-DECLINE${hash}`, top = $('h6Brief');
      if (top) { top.href = brief; top.textContent = `${name} 4-1 표 초안 보기`; }
      $('h6Go41').href = brief;
      $('h6Go').href = `explore.html?report=onepage${hash}`;
      $('h6Prog').href = `explore.html?report=programs${hash}`;
      doc.querySelectorAll('.h6-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dong === code8)));
      // 카드 전체를 다시 읽히지 않고 새 요지 한 문장만 읽힌다(2026-11-18 접근성 검토: 카드 전체가 aria-live라 표·출처까지 다시 읽혔다)
      const say = $('h6Say');
      if (say) say.textContent = `${name}, ${s.head}`;
    } catch (e) {
      $('h6Met').textContent = '';
      $('h6Sub').textContent = $('h6Say').textContent = '자료를 받지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
      $('h6Retry').hidden = false;
    } finally { card.removeAttribute('aria-busy'); }
  }
  $('h6Retry').addEventListener('click', () => show(last));
  // 휴대폰에서 칩을 누르면 새 카드가 칩 아래(아래 탭 뒤)에 있어 아무 일도 없어 보였다 → 카드를 화면 위쪽으로
  const narrow = () => root.matchMedia && root.matchMedia('(max-width: 959px)').matches;
  doc.querySelectorAll('.h6-chip').forEach((b) => b.addEventListener('click', () => {
    show(b.dataset.dong);
    if (narrow()) card.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
  }));
  show('21090700');
})(typeof window !== 'undefined' ? window : globalThis);
