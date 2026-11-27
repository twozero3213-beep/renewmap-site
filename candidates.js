/* 후보 검토: 지도에서 고정한 원장 사본과 업무 메모만 이 기기에 보관한다. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.RenewCandidates = api; api.init(root); }
})(typeof window !== 'undefined' ? window : null, function (U) {
  'use strict';
  const KEY = 'renewmap.candidates.v1', STAGES = [['review', '검토 중'], ['field', '현장 확인 예정'], ['proposal', '제안 준비'], ['hold', '보류']];
  const text = x => typeof x === 'string' && x.length <= 4000;
  // 저장 시각(UTC ISO)을 한국 날짜로: UTC 표기는 업무 화면에서 낯설고, 한국 0~9시에 저장하면 전날로 보였다(r16)
  const KST_DAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
  const kstDay = iso => { const p = Object.fromEntries(KST_DAY.formatToParts(new Date(iso)).map(x => [x.type, x.value])); return `${p.month}월 ${p.day}일`; };
  function validate(row) {
    if (!row || !/^\d{8}$/.test(row.code) || !text(row.name) || !/^#map\/\d{2}\/\d{5}(?:\/\d{5})?\/\d{8}$/.test(row.route) || row.route.split('/').pop() !== row.code
      || (row.map_year != null && (!Number.isInteger(row.map_year) || row.map_year < 1000 || row.map_year > 9999))
      || !STAGES.some(([key]) => key === row.stage) || !text(row.note) || row.note.length > 1000
      || !/^\d{4}-\d\d-\d\dT/.test(row.saved_at) || !Number.isFinite(Date.parse(row.saved_at)) || !Array.isArray(row.items) || row.items.length > 200
      || row.items.some(x => !x || !['c', 'l', 'u', 't', 's'].every(k => text(x[k])) || (x.v !== null && !U.isNum(x.v) && !text(x.v) && typeof x.v !== 'boolean')
        || (x.d !== null && !text(x.d)) || [x.basis, x.evidence].some(b => b != null && (Array.isArray(b) || typeof b !== 'object' || Object.values(b).some(v => v !== null && !text(v)))))) {
      throw new Error('후보 기록 형식을 확인하지 못했습니다. 기존 기록은 그대로 보존했습니다.');
    }
    if (new Set(row.items.map(x => x.c)).size !== row.items.length) {
      throw new Error('지표 코드가 중복되어 비교할 수 없습니다. 기존 기록은 그대로 보존했습니다.');
    }
    if (row.history !== undefined) {
      if (!Array.isArray(row.history) || row.history.some(prior => !prior || prior.code !== row.code || Object.hasOwn(prior, 'history'))) {
        throw new Error('이전 후보 기록의 형식을 확인하지 못했습니다.');
      }
      row.history.forEach(validate);
    }
    return row;
  }
  function load(storage) {
    const raw = storage.getItem(KEY);
    if (raw === null) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || new Set(rows.map(r => r?.code)).size !== rows.length) throw new Error('후보 목록 형식을 확인하지 못했습니다.');
    return rows.map(validate);
  }
  function snapshotRecord(snapshot, route, rows, mapYear, stage, note) {
    const items = snapshot.items.map(x => {
      const c = rows.find(r => r.ind.code === x.c)?.cell;
      return { ...x, evidence: x.basis && c ? Object.fromEntries(['source_name', 'retrieved_at', 'license_type', 'cell_id', 'snapshot_id'].map(k => [k, c[k] ?? null])) : null };
    });
    return { code: snapshot.code, name: snapshot.name, saved_at: snapshot.saved_at, route, map_year: mapYear, stage, note, items };
  }
  function save(storage, snapshot, route, rows, mapYear) {
    const list = load(storage);
    if (list.some(r => r.code === snapshot.code)) return false;
    const row = validate(snapshotRecord(snapshot, route, rows, mapYear, 'review', ''));
    storage.setItem(KEY, JSON.stringify([row, ...list]));
    return true;
  }
  const revisionOf = row => (row.history?.length ?? 0) + 1;
  function revise(storage, snapshot, route, rows, mapYear, expectedRevision) {
    const list = load(storage), index = list.findIndex(r => r.code === snapshot.code);
    if (index < 0) throw new Error('후보를 찾지 못했습니다. 보관함을 다시 열어 주세요.');
    const current = list[index];
    if (revisionOf(current) !== expectedRevision) throw new Error('후보에 새 기록이 생겼습니다. 보관함에서 다시 열어 주세요.');
    if (current.map_year != null && current.map_year !== mapYear) throw new Error('기존 기록의 지도 연도를 선택한 뒤 다시 저장해 주세요.');
    const { history = [], ...prior } = current;
    const next = validate({
      ...snapshotRecord(snapshot, route, rows, mapYear, current.stage, current.note),
      history: [...history, prior],
    });
    list[index] = next;
    storage.setItem(KEY, JSON.stringify(list));
    return next;
  }
  function withCandidateWrite(work) {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(KEY, work) : Promise.resolve().then(work);
  }
  function update(storage, code, stage, note, expectedRevision) {
    const list = load(storage), index = list.findIndex(r => r.code === code);
    if (index < 0) throw new Error('후보를 찾지 못했습니다. 목록을 다시 열어 주세요.');
    if (expectedRevision !== undefined && revisionOf(list[index]) !== expectedRevision) throw new Error('후보에 새 기록이 생겼습니다. 보관함에서 다시 열어 주세요.');
    list[index] = validate({ ...list[index], stage, note });
    storage.setItem(KEY, JSON.stringify(list));
  }
  const candidateName = r => `${r.name} (${r.code})`;
  const valueText = item => !item || item.v === null ? '자료 없음' : item.t;
  const yearText = row => row.map_year === undefined ? '미기록' : row.map_year === null ? '자동 선택' : `${row.map_year}년`;
  // CSV 칸 규칙(엑셀이 식으로 읽을 칸 막기)은 util.js csvCell 한 곳에 둔다
  const cell = U.csvCell;
  const COMPARISON_FIELDS = [
    ['출처', x => [x.evidence?.source_name, x.basis.source_url]],
    ['기준일', x => [x.d]], ['단위', x => [x.u]],
    ['산식', x => [x.basis.formula_id, x.basis.formula_text]],
    ['규칙 버전', x => [x.basis.rule_version]], ['공간 단위', x => [x.basis.spatial_unit]],
  ];
  function comparisonConditions(rows, code) {
    const items = rows.map(r => r.items.find(x => x.c === code));
    return COMPARISON_FIELDS.map(([label, read]) => {
      const values = items.map(x => {
        const parts = x?.basis ? read(x) : [];
        return parts.length && parts.every(v => typeof v === 'string' && v.trim()) ? JSON.stringify(parts.map(v => v.trim())) : null;
      });
      const different = new Set(values.filter(v => v !== null)).size > 1;
      const unknown = rows.length < 2 || values.some(v => v === null);
      // OD1(r16 2차): 정하지 못한 비교 조건도 공통 사전의 '추가확인'(옛 '미확인')
      return [label, different ? (unknown ? '차이 · 추가확인 포함' : '차이') : unknown ? '추가확인' : '같음'];
    });
  }
  function csv(rows, { includeNotes = false } = {}) {
    const conditions = new Map(rows.flatMap(r => r.items.map(x => [x.c, null])));
    for (const code of conditions.keys()) conditions.set(code, comparisonConditions(rows, code).map(([, status]) => status));
    const out = [['지역 코드', '후보 동', '검토 단계', '메모', '저장 시각', '지도 경로', '항목', '값', '단위', '표시값', '기준일', '상태', '출처', '출처 URL', '조회시각', '산식 ID', '산식', '규칙 버전', '공간 단위', '원장 지역 코드', '이용조건', '셀 ID', 'snapshot_id', ...COMPARISON_FIELDS.map(([label]) => `비교 ${label}`), '지도 선택 연도']];
    for (const r of rows) for (const x of r.items) out.push([r.code, r.name, STAGES.find(([k]) => k === r.stage)[1], includeNotes ? r.note : '', r.saved_at, r.route,
      x.l, x.v, x.u, valueText(x), x.d, x.s, x.evidence?.source_name, x.basis?.source_url, x.evidence?.retrieved_at, x.basis?.formula_id,
      x.basis?.formula_text, x.basis?.rule_version, x.basis?.spatial_unit, x.basis?.area_code, x.evidence?.license_type, x.evidence?.cell_id, x.evidence?.snapshot_id,
      ...conditions.get(x.c), yearText(r)]);
    return '\uFEFF' + out.map(r => r.map(cell).join(',')).join('\r\n');
  }
  function comparisonHTML(rows, indicators = [...new Map(rows.flatMap(r => r.items.map(x => [x.c, x.l]))).entries()]) {
    if (rows.length < 2) return '<p>후보 2~3곳을 골라 같은 항목을 나란히 확인하세요.</p>';
    return '<p>저장 당시 값을 보여 줍니다.<br>기준일·산식·공간 단위가 다를 수 있어 차이·순위는 계산하지 않습니다.<br>조건 메타의 같음은 정확도·승인을 보장하지 않습니다.</p><div class="table-wrap" tabindex="0" role="region" aria-label="후보별 근거 비교"><table class="rp-tbl"><thead><tr><th scope="col">항목</th>'
      + rows.map(r => `<th scope="col">${U.esc(candidateName(r))}<br><small>${U.esc(kstDay(r.saved_at))} 저장<br>지도 연도 ${U.esc(yearText(r))}</small></th>`).join('') + '<th scope="col">비교 조건</th></tr></thead><tbody>'
      + indicators.map(([code, label]) => '<tr><th scope="row">' + U.esc(label) + '</th>' + rows.map(r => {
        const x = r.items.find(i => i.c === code);
        return `<td>${U.esc(valueText(x))}<br><small>${U.esc(x?.d || '기준일 추가확인')}<br>${U.esc(x?.s || '상태 추가확인')}<br>${U.esc(x?.basis?.spatial_unit || '공간 단위 추가확인')}<br>${U.esc(x?.evidence?.source_name || '출처 추가확인')}</small></td>`;
      }).join('') + '<td><small>' + comparisonConditions(rows, code).map(([name, status]) => U.esc(`${name}: ${status}`)).join('<br>') + '</small></td></tr>').join('') + '</tbody></table></div>';
  }
  // 동 비교 XLSX(11-14 페르소나: '동 비교 화면이 없다' → 보관함 비교 표를 표 파일로). 비교 표와 같은 저장 당시 값만 옮기고
  // 차이·순위·합산은 계산하지 않는다(D13). 숫자 칸은 숫자로 둬 엑셀에서 바로 쓰게 한다. 글 칸은 inlineStr이라 식으로 실행되지 않는다
  function compareSheets(rows, { includeNotes = false } = {}) {
    const indicators = [...new Map(rows.flatMap(r => r.items.map(x => [x.c, x.l]))).entries()];
    const val = x => (x && typeof x.v === 'number' && Number.isFinite(x.v) ? x.v : valueText(x));
    const cmp = [['항목', ...rows.flatMap(r => ['값', '단위', '기준일'].map(label => `${candidateName(r)} ${label}`)), '비교 조건'],
      ...indicators.map(([code, label]) => [label, ...rows.flatMap(r => { const x = r.items.find(i => i.c === code); return [val(x), x?.u || '', x?.d || '기준일 추가확인']; }),
        comparisonConditions(rows, code).map(([n, s]) => `${n}: ${s}`).join(', ')]),
      [], ['판정·순위가 아닙니다. 저장 당시 값이며 기준일·산식·공간 단위가 다를 수 있습니다.']];
    const src = [['후보 동', '항목', '출처', '출처 URL', '기준일', '이용조건', '셀 ID', '후보 지역 코드', '지표 코드', '상태',
      '조회시각', '산식 ID', '산식', '규칙 버전', '공간 단위', '원장 지역 코드', 'snapshot_id'],
      ...rows.flatMap(r => r.items.map(x => [r.name, x.l, x.evidence?.source_name ?? '', x.basis?.source_url ?? '', x.d ?? '',
        x.evidence?.license_type ?? '', x.evidence?.cell_id ?? '', r.code, x.c, x.s, x.evidence?.retrieved_at ?? '',
        x.basis?.formula_id ?? '', x.basis?.formula_text ?? '', x.basis?.rule_version ?? '', x.basis?.spatial_unit ?? '',
        x.basis?.area_code ?? '', x.evidence?.snapshot_id ?? '']))];
    const review = [['지역 코드', '후보 동', '검토 단계', '검토 메모', '저장 시각', '지도 선택 연도'],
      ...rows.map(r => [r.code, r.name, STAGES.find(([key]) => key === r.stage)[1], includeNotes ? r.note : '', r.saved_at, yearText(r)]),
      [], [includeNotes ? '메모는 수정할 수 있는 사용자 기록이며 기관의 선정·승인 이력이 아닙니다.' : '선택 옵션에서 검토 메모를 포함할 수 있습니다.']];
    return [{ name: '비교', rows: cmp, widths: [28, ...rows.flatMap(() => [18, 18, 20]), 44] }, { name: '출처', rows: src, widths: [14, 28, 40, 50, 12, 18, 30, 16, 22, 16, 26, 20, 38, 19, 14, 16, 30] }, { name: '검토 기록', rows: review, widths: [16, 20, 18, 60, 28, 18] }];
  }
  function historyHTML(row) {
    const history = row.history || [];
    if (!history.length) return '';
    const versions = history.map((prior, index) => {
      const stage = STAGES.find(([key]) => key === prior.stage)[1];
      const items = prior.items.map(item => `<tr><th scope="row">${U.esc(item.l)}</th><td>${U.esc(valueText(item))}</td><td>${U.esc(item.d || '기준일 추가확인')}</td><td>${U.esc(item.s)}</td><td>${U.esc(item.evidence?.source_name || '출처 추가확인')}</td></tr>`).join('');
      return `<details data-candidate-version="${index + 1}"><summary>${index + 1}번째 기록 · ${kstDay(prior.saved_at)} 저장 · ${prior.items.length}개 항목</summary><p class="meta">지도 연도 ${U.esc(yearText(prior))} · ${stage}</p><p>검토 메모</p><p style="white-space:pre-wrap">${U.esc(prior.note || '메모 없음')}</p><div class="table-wrap" tabindex="0" role="region" aria-label="이전 기록의 지표"><table class="rp-tbl"><thead><tr><th scope="col">항목</th><th scope="col">값</th><th scope="col">자료 기준일</th><th scope="col">상태</th><th scope="col">출처</th></tr></thead><tbody>${items}</tbody></table></div></details>`;
    }).reverse().join('');
    return `<details data-candidate-history><summary>이전 기록 ${history.length}개 보기</summary>${versions}</details>`;
  }
  function init(root) {
    const host = root.document.querySelector('[data-candidates]');
    if (!host) return;
    const list = host.querySelector('[data-candidate-list]'), msg = host.querySelector('[data-candidate-msg]'), out = host.querySelector('[data-candidate-compare]');
    const selected = new Set();
    const pager = root.RenewListPages.create(list, '검토 후보', render);
    if (!out.id) out.id = 'candidateComparison';
    const comparisonPager = root.RenewListPages.create(out, '비교 지표', renderComparison);
    const xbtn = host.querySelector('[data-candidate-xlsx]'), fold = out.closest('details');
    const say = t => { msg.textContent = t; };
    const notes = host.querySelector('[data-candidate-include-notes]');
    if (notes) notes.checked = false;
    const exportOptions = () => ({ includeNotes: notes?.checked === true });
    const csvButton = host.querySelector('[data-candidate-csv]');
    const acts = host.querySelector('[data-candidate-acts]');
    const clearComparison = () => {
      out.replaceChildren();
      if (xbtn) xbtn.disabled = true;
    };
    function renderComparison(rows) {
      try {
        const chosen = (rows || load(root.localStorage)).filter(r => selected.has(r.code));
        const indicators = chosen.length < 2 ? [] : [...new Map(chosen.flatMap(r => r.items.map(x => [x.c, x.l]))).entries()];
        out.innerHTML = comparisonHTML(chosen, comparisonPager.slice(indicators));
        if (xbtn) xbtn.disabled = chosen.length < 2;
        if (fold && chosen.length >= 2) fold.open = true;   // 2곳을 고르면 접힌 비교 표를 연다(있는 줄 몰랐다)
        return true;
      } catch (e) { clearComparison(); say('비교를 열지 못했습니다. ' + e.message); return false; }
    }
    function render() {
      try {
        const rows = load(root.localStorage);
        list.innerHTML = pager.slice(rows).map(r => `<li><label><input type="checkbox" data-candidate-select="${r.code}"${selected.has(r.code) ? ' checked' : ''}> ${U.esc(candidateName(r))} 비교 선택</label>`
          + `<p class="meta">${r.history?.length ? `${revisionOf(r)}번째 기록 · ` : ''}${U.esc(kstDay(r.saved_at))} 저장 · 지도 연도 ${U.esc(yearText(r))} · ${r.items.length}개 항목 · ${STAGES.find(([k]) => k === r.stage)[1]}</p><a href="explore.html${r.map_year == null ? '' : `?y=${r.map_year}`}${r.route}">지도에서 다시 보기</a>`
          + ` <a data-candidate-revise href="explore.html?candidate=${r.code}&amp;rev=${revisionOf(r)}${r.map_year == null ? '' : `&amp;y=${r.map_year}`}${r.route}">자료 다시 확인</a>`
          + `<details><summary>단계·메모 편집</summary><form data-candidate-edit="${r.code}" data-candidate-revision="${revisionOf(r)}"><label>검토 단계<select name="stage">${STAGES.map(([k, v]) => `<option value="${k}"${r.stage === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`
          + `<label>검토 메모<textarea name="note" maxlength="1000" rows="2">${U.esc(r.note)}</textarea></label><button type="submit">단계·메모 저장</button></form></details>${historyHTML(r)}</li>`).join('')
          || '<li class="box-empty-card"><p><b>아직 담은 후보가 없습니다.</b><br>동네 현황에서 동을 골라 ‘보관함에 담기’를 누르세요.</p><a class="btn" href="explore.html#map">동네 현황 열기</a></li>';
        renderComparison(rows);
        csvButton.disabled = !rows.length;
        // 2026-11-19: 받을 것이 없으면 내보내기·비교 칸을 숨긴다(빈 보관함에 쓸 수 없는 단추 둘과 접힌 칸이 먼저 보였다)
        if (acts) acts.hidden = !rows.length;
        if (xbtn) xbtn.hidden = rows.length < 2;
        if (fold) fold.hidden = rows.length < 2;
      } catch (e) {
        list.replaceChildren(); clearComparison(); csvButton.disabled = true;
        if (acts) acts.hidden = true;
        if (fold) fold.hidden = true;
        say('후보를 열지 못했습니다. ' + e.message);
      }
    }
    list.addEventListener('change', e => {
      const code = e.target.dataset.candidateSelect;
      if (!code) return;
      if (e.target.checked && selected.size >= 3) { e.target.checked = false; say('비교는 한 번에 3곳까지 선택합니다.'); return; }
      e.target.checked ? selected.add(code) : selected.delete(code);
      comparisonPager.reset();
      if (renderComparison()) say(selected.size >= 2 ? `${selected.size}곳 선택 · 아래 비교 표를 열었습니다` : `${selected.size}곳 선택`);
    });
    list.addEventListener('submit', async e => {
      const form = e.target.closest('[data-candidate-edit]'); if (!form) return;
      e.preventDefault();
      try {
        const code = form.dataset.candidateEdit, version = Number(form.dataset.candidateRevision);
        const { value: stage } = form.elements.stage, { value: note } = form.elements.note;
        await withCandidateWrite(() => update(root.localStorage, code, stage, note, version));
        render();
        list.querySelector(`[data-candidate-edit="${code}"]`).parentElement.querySelector('summary').focus({ preventScroll: true });
        say('검토 단계와 메모를 저장했습니다. 저장 당시 수치는 유지됩니다.');
      } catch (err) { say('저장하지 못했습니다. ' + err.message); }
    });
    csvButton.addEventListener('click', () => {
      try {
        const rows = load(root.localStorage).filter(r => !selected.size || selected.has(r.code));
        root.RenewDocgen.saveBytes('리뉴맵_검토후보.csv', new TextEncoder().encode(csv(rows, exportOptions())), 'text/csv;charset=utf-8');
        say(selected.size ? `선택한 ${rows.length}곳의 근거 CSV를 받았습니다.` : `후보 전체 ${rows.length}곳의 근거 CSV를 받았습니다.`);
      } catch (err) { say('내보내지 못했습니다. ' + err.message); }
    });
    if (xbtn) xbtn.addEventListener('click', () => {
      try {
        const rows = load(root.localStorage).filter(r => selected.has(r.code));
        if (rows.length < 2) { say('비교할 후보를 2~3곳 고르세요.'); return; }
        const D = root.RenewDocgen;
        D.saveBytes('리뉴맵_후보비교.xlsx', D.xlsxBytes(compareSheets(rows, exportOptions()), new Date()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        say(`고른 ${rows.length}곳의 비교 XLSX를 받았습니다.`);
      } catch (err) { say('내보내지 못했습니다. ' + err.message); }
    });
    render();
  }
  return { KEY, STAGES, load, save, revise, revisionOf, withCandidateWrite, update, csv, csvCell: cell, comparisonHTML, compareSheets, init };
});
