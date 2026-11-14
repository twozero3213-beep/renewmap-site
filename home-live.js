/* 홈 첫 화면 '지금 이 동네' 카드(2026-11-13 v6). 숫자는 HTML에 적지 않고 원장 셀(national/emd/{시군구}.json)에서 그대로 읽는다(원칙 1).
   보여 주는 셀: 요건 충족 수(DECLINE_MET_COUNT), 인구 감소율 30년, 사업체 감소율 10년, 준공 20년 이상 건축물 비율.
   기준선은 지도(map.js INDICATORS)와 같은 도시재생법 시행령 제17조 문구다. 값이 없으면 0을 만들지 않고 '추가확인'(원칙 4). */
(function (root) {
  'use strict';
  const ROWS = [
    ['DECLINE_POP_DROP30Y_PCT', '인구 감소', 20, '기준 30년 최대 대비 20% 이상 감소'],
    ['DECLINE_BIZ_DROP10Y_PCT', '사업체 감소', 5, '기준 10년 최대 대비 5% 이상 감소'],
    ['DECLINE_AGING_20Y_PCT', '20년 이상 건축물', 50, '기준 50% 이상'],
  ];
  const MET = 'DECLINE_MET_COUNT';
  // 1쪽 문서·동 페이지와 같은 자릿수(소수 둘째 자리)로 보인다(11-13 3차: 홈 83%, 문서 82.96%로 달라 보임)
  const { fmt2: fmt, bizZeroNote, BIZ_BOUNDARY } = typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil;
  // 한 동의 셀들 → 카드에 쓸 값(순수 함수, 시험용). 상태는 요건 단위(decline-req.js: 30년·10년 감소율 또는 '최근 5년 중 3년 연속 감소' 중 하나라도 해당이면 해당).
  // v7(11-13 6회차): 감소율 한 길만 보고 '추가확인'을 붙여, 연속 감소로 해당한 동은 머리의 'N개 해당'과 줄이 어긋났다
  const DR = typeof module === 'object' && module.exports ? require('./decline-req.js') : root.DeclineReq;
  function summarize(cells, series) {
    const by = new Map((cells || []).map((c) => [c.indicator_code, c]));
    const met = by.get(MET), val = (code) => DR.cellValue(by.get(code));   // 미확정·비공개 셀은 셈에 안 쓴다(문서·동 페이지와 같게)
    const reqs = DR.evaluate(val);
    return {
      met: met && typeof met.value === 'number' ? met.value : null,
      rows: ROWS.map(([code, label, , std], i) => {
        const q = reqs[i], c = by.get(code) || null;
        // 감소율의 바탕인 총수 셀이 비어 있으면 같은 줄 작은 글에 밝힌다(11-13 2차: 동 페이지는 '사업체 수 자료 없음'인데 홈은 0%만 보였다)
        const base = code === 'DECLINE_BIZ_DROP10Y_PCT' ? by.get('DECLINE_BIZ_TOTAL') : code === 'DECLINE_POP_DROP30Y_PCT' ? by.get('DECLINE_POP_TOTAL') : null;
        const noBase = !!(base && base.value === null);
        const viaConsec = q.via && /DECL3IN5$/.test(q.via.code);
        // 감소율은 국토부 쇠퇴진단 원천이 직접 준 값이다. 바탕 총수(2025년 사업체 수 등)가 아직 원천에 없어도 그 값으로 판단한다 —
        // 동 페이지·지도·1쪽 문서가 모두 그렇게 한다. v9: 홈만 '추가확인'으로 바꿔, 사업체 총수가 빈 2,238개 동에서 화면끼리 어긋났다
        const unsure = q.status === 'none';
        const text = viaConsec ? '3년 연속 감소' : q.rate === null ? '–' : `${fmt(q.rate)}%`;   // 상태 칸이 '추가확인'이라 값 칸에 또 쓰지 않는다(v9: 두 번 읽혔다)
        const who = label.replace(' 감소', '');
        // 총수가 비면 같은 줄에 밝힌다. 0은 채운 값이 아니라 원천 감소율이라는 것도 같이(8회차: '0으로 채우지 않는다'와 부딪혀 보였다)
        // R2 11: '총수는 원천에 없음 · 0%'가 지어낸 0처럼 읽혔다 → 감소율이 기관 공표값이고 총수가 공표 전임을 문장으로
        const year = String((base && base.reference_date) || '').slice(0, 4);
        // 11-14 페르소나: 셀이 derived(F-DECLINE-BIZ-01, 공표된 사업체 수로 계산)인데 '기관 공표값'이라 적었다
        const baseNote = noBase ? `감소율은 공표된 ${who} 수로 리뉴맵이 계산한 값입니다. ${year ? year + '년 ' : ''}${who} 수는 아직 공표 전입니다.` : '';
        // R3 11: 감소율 0%의 뜻(그 해 사업체 수가 10년 중 최대)을 같은 줄에, 출처 경계는 출처 기록 접기에(boundary)
        const zero = code === 'DECLINE_BIZ_DROP10Y_PCT' && !viaConsec ? bizZeroNote((series || {}).DECLINE_BIZ_TOTAL, q.rate) : '';
        const notes = [viaConsec ? '최근 5년 중 3년 연속 감소로 해당' : '', zero, baseNote].filter(Boolean);
        return { code, label, std, value: q.rate, text, over: unsure ? null : q.status === 'over', cell: c, note: notes.join(' · '), boundary: zero ? BIZ_BOUNDARY : '' };
      }),
      ref: met ? met.reference_date : null,
    };
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

  function row(r) {
    const li = doc.createElement('li'), s = doc.createElement('span'), b = doc.createElement('b'), sm = doc.createElement('small');
    s.textContent = r.label; b.textContent = r.text; sm.textContent = r.note ? `${r.std} · ${r.note}` : r.std;
    li.className = r.over === null ? 'is-none' : r.over ? 'is-over' : 'is-under';
    const tag = doc.createElement('i'); tag.textContent = r.over === null ? '추가확인' : r.over ? '기준 해당' : '해당 안 함';
    li.append(s, b, tag, sm); return li;
  }
  // 근거 영수증: '20년 넘은 건축물' 셀 하나의 원장 기록을 그대로 펼친다(값을 만들거나 고치지 않는다)
  function prov(cells, name, boundary) {
    const dl = $('h6ReceiptList'); if (!dl) return;
    dl.replaceChildren();
    $('h6ReceiptDong').textContent = name;
    const c = cells.find((x) => x.indicator_code === 'DECLINE_AGING_20Y_PCT');
    if (!c) { const d = doc.createElement('div'); d.textContent = '이 동은 출처 기록이 없습니다.'; dl.append(d); return; }
    // 사람에게 보이는 줄과 내부 식별자(셀 번호·규칙 판본)를 나눈다. 상태·[미확인]은 무엇이 아직인지 말로 푼다(11-13 3차)
    const state = { 미확인: '공식 통계 원값 그대로(사람 검토 전)', 확인: '리뉴맵 담당자가 출처와 대조함', 추가확인: '자료가 모자라 확인이 더 필요함' }[c.status] || c.status;
    // 9회차: '확인하지 못함'이 신뢰를 깎는 대표 예시로 읽혔다. 사실대로 '원천 기관이 계산해 공표한 값'임을 말한다(리뉴맵이 다시 계산하지 않는다)
    const formula = String(c.formula_text || '').replace(/\s*\[미확인\]/g, '(출처 기관이 계산해 공표한 값, 리뉴맵은 다시 계산하지 않음)');
    const rows = [['값', c.value === null ? '추가확인' : `${fmt(c.value)}${c.unit || ''}`], ['출처', c.source_name], ['출처 주소', c.source_url],
      ['기준일', c.reference_date], ['조회 시각', String(c.retrieved_at || '').slice(0, 16).replace('T', ' ')], ['계산식', formula],
      ['공간 단위', c.spatial_unit], ['이용 조건', c.license_type], ['상태', state]];
    for (const [k, v] of rows) {
      if (v === undefined || v === null || v === '') continue;
      const box = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd');
      dt.textContent = k; dd.textContent = v; box.append(dt, dd); dl.append(box);
    }
    const more = doc.createElement('details'), sum = doc.createElement('summary'), code = doc.createElement('p');
    sum.textContent = '기록 번호'; code.textContent = `셀 번호 ${c.cell_id} · 규칙 판본 ${c.rule_version}`;
    more.className = 'h6-receipt-ids'; more.append(sum, code); dl.append(more);
    if (boundary) { const b = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd'); dt.textContent = '사업체 자료'; dd.textContent = boundary; b.append(dt, dd); dl.insertBefore(b, more); }
  }
  async function show(code8) {
    card.setAttribute('aria-busy', 'true');
    try {
      const list = await idx();
      const hit = list.find((x) => x[0] === code8);
      if (!hit) throw new Error('no dong');
      const [code, name, sgg, sggName, sido] = hit;
      const un = await sgFile(sgg);
      const dong = (un.dongs || []).find((d) => d.code7 === code);
      const s = summarize(dong ? dong.cells : [], dong ? dong.series : null);
      $('h6LiveName').textContent = name;
      $('h6LiveWhere').textContent = `${sido} ${sggName}`;
      $('h6Met').textContent = s.met === null ? '추가확인' : `${s.met}개 해당`;
      $('h6Rows').replaceChildren(...s.rows.map(row));
      prov(dong ? dong.cells : [], name, s.rows.map((r) => r.boundary).find(Boolean));
      const sidoCode = sgg.slice(0, 2), hash = `#map/${sidoCode}/${sgg}/${code}`;
      $('h6Go').href = `explore.html?report=onepage${hash}`;
      $('h6Prog').href = `explore.html?report=programs${hash}`;
      $('h6Note').textContent = `도시재생법 시행령 제17조 기준으로 셈한 참고 계산입니다${s.ref ? `(기준일 ${s.ref})` : ''}. 판정은 담당 기관이 원문과 대조해 정합니다.`;
      doc.querySelectorAll('.h6-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dong === code8)));
    } catch (e) {
      $('h6Met').textContent = '불러오지 못함';
      $('h6Note').textContent = '자료를 불러오지 못했습니다. 인터넷 연결을 확인하거나 동네 찾기에서 열어 보세요.';
    } finally { card.removeAttribute('aria-busy'); }
  }
  doc.querySelectorAll('.h6-chip').forEach((b) => b.addEventListener('click', () => show(b.dataset.dong)));
  show('21090700');
})(typeof window !== 'undefined' ? window : globalThis);
