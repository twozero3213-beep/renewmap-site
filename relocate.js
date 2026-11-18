(function (root) {
  'use strict';
  const util = typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil;
  const { isNum, esc, plainSource } = util;
  const GROUPS = ['주거비', '출퇴근(직선거리·역·버스)', '밤길 안전시설', '아이', '의료', '생활·여가'];
  const HOUSING = { APT: '아파트', RH: '연립다세대', OFFI: '오피스텔', ALL: '전체' };
  const RENT_CODES = ['JEONSE_M2_MED', 'WOLSE_MED'];
  const RELOC_CODES = ['PEDS_CLINIC_COUNT', 'PEDS_NEAREST_M', 'SUBWAY_AM_PEAK_BOARD'];
  const RENT_MIN_N = 5;
  const FACTORS = [
    ['JEONSE_M2_MED', '전세 보증금 ㎡당 중위값', 0, true], ['WOLSE_MED', '월세 중위값(보증금 별도)', 0, true],
    ['OFFICE_KM', '회사 동까지 직선거리', 1, true], ['SUBWAY_NEAREST_M', '도시철도역 직선거리', 1, true], ['BUS_STOP_DENSITY', '버스정류장 밀도', 1, false], ['SUBWAY_AM_PEAK_BOARD', '아침 시간 역 승차 인원', 1, true],
    ['STREETLIGHT_PER_KM2', '보안등 밀도', 2, false], ['CCTV_PER_KM2', 'CCTV 밀도', 2, false], ['EMERGENCY_BELL_PER_KM2', '안전비상벨 밀도', 2, false], ['POLICE_NEAREST_M', '경찰관서 직선거리', 2, true],
    ['ELEM_SCHOOL_NEAREST_M', '초등학교 직선거리', 3, true], ['KINDER_NEAREST_M', '유치원 직선거리', 3, true], ['CHILDCARE_NEAREST_M', '어린이집 직선거리', 3, true],
    ['PEDS_CLINIC_COUNT', '소아청소년과 진료과목 의원 수', 3, false], ['PEDS_NEAREST_M', '소아청소년과 진료과목 기관 직선거리', 4, true],
    ['HOSP_PER10K', '인구 1만 명당 병원·의원', 4, false], ['ER_NEAREST_M', '응급의료센터 직선거리', 4, true], ['PHARM_NIGHT_COUNT', '평일 21시 이후 영업 등록 약국', 4, false],
    ['PARK_AREA_PER_CAPITA', '1인당 도시공원 면적', 5, false], ['SPORTS_CENTER_NEAREST_M', '실내 생활체육시설 직선거리', 5, true], ['LIB_NEAREST_M', '공공도서관 직선거리', 5, true], ['STORE_FOOD_COUNT', '음식 업소 수', 5, false]
  ].map(([code, label, group, lower]) => ({ code, label, group, lower }));
  const PRESETS = [
    { label: '주거비와 출퇴근', housing: 'OFFI', groups: [5, 5, 3, 0, 2, 3], note: '주거비와 출퇴근에 무게를 둡니다.' },
    { label: '출퇴근과 돌봄', housing: 'APT', groups: [3, 5, 3, 4, 2, 3], note: '회사 동과의 거리, 대중교통, 학교·돌봄 시설에 무게를 둡니다.' },
    { label: '학교와 돌봄', housing: 'APT', groups: [3, 3, 4, 5, 3, 4], note: '초등학교와 돌봄 시설에 무게를 둡니다. 학교 배정·통학로는 별도 확인이 필요합니다.' },
    { label: '교통과 생활·여가', housing: 'APT', groups: [3, 4, 4, 0, 3, 4], note: '대중교통, 도서관, 공원 등 생활·여가 시설을 함께 봅니다.' },
    { label: '의료와 생활·여가', housing: 'APT', groups: [3, 2, 3, 0, 5, 4], note: '의료와 생활·여가에 무게를 둡니다.' }
  ].map(p => ({ ...p, weights: Object.fromEntries(FACTORS.map(f => [f.code, p.groups[f.group]])) }));

  function normalize(values, lower) {
    const sorted = values.filter(isNum).sort((a, b) => a - b);
    return values.map(v => {
      if (!isNum(v)) return null;
      if (sorted.length === 1 || sorted[0] === sorted[sorted.length - 1]) return 50;
      const first = sorted.indexOf(v), last = sorted.lastIndexOf(v);
      const percentile = 100 * (first + last) / 2 / (sorted.length - 1);
      return lower ? 100 - percentile : percentile;
    });
  }

  function weightedScore(values, weights) {
    let sum = 0, total = 0, missing = 0, used = 0;
    weights.forEach((w, i) => {
      if (!Number.isInteger(w) || w < 0 || w > 5) throw new Error('중요도는 0~5 정수여야 합니다.');
      if (!w) return;
      if (!isNum(values[i])) { missing++; return; }
      sum += values[i] * w; total += w; used++;
    });
    return { score: total ? sum / total : null, missing, used };
  }

  function officeDistances(doc, officeCode, dongs) {
    const codes = new Set(dongs.map(d => d.code));
    if (!/^21[0-9]{6}$/.test(officeCode) || !codes.has(officeCode) || doc?.office_code !== officeCode ||
        !Array.isArray(doc.dongs) || doc.dongs.length !== codes.size || !/^reloc-office:[0-9a-f]{64}$/.test(doc.snapshot_id)) {
      throw new Error('선택한 회사 동의 거리 자료를 확인할 수 없습니다.');
    }
    const cells = new Map();
    for (const row of doc.dongs) {
      const c = row.cells?.[0];
      if (!codes.has(row.code7) || cells.has(row.code7) || row.cells?.length !== 1 || c?.indicator_code !== 'OFFICE_KM' ||
          c.area_code !== row.code7 || c.unit !== 'km' || c.snapshot_id !== doc.snapshot_id ||
          c.cell_id !== `${officeCode}:${row.code7}:OFFICE_KM:${doc.snapshot_id.slice(-12)}` ||
          (row.code7 === officeCode && isNum(c.value) && c.value !== 0) || !c.source_url || !c.source_name || !c.reference_date || !c.retrieved_at || !c.rule_version || !c.formula_text) {
        throw new Error('행정동 거리 원장의 코드와 출처를 확인할 수 없습니다.');
      }
      cells.set(row.code7, !c.value_hidden_reason && !['폐기', '충돌'].includes(c.status) && isNum(c.value) && c.value >= 0 ? c : null);
    }
    return cells;
  }

  function makeDongs(index, documents) {
    const living = new Map();
    for (const d of documents.flatMap(doc => doc.dongs)) living.set(d.code7, [...(living.get(d.code7) || []), ...d.cells]);
    const codes = [...FACTORS.map(f => f.code), ...RENT_CODES.flatMap(code => ['APT', 'RH', 'OFFI'].map(type => `${code}_${type}`))];
    return index.filter(row => row[2].startsWith('21')).map(([code, name, sigungu, district]) => {
      const cells = living.get(code) || [];
      const usable = cells.filter(c => !c.value_hidden_reason && !['폐기', '충돌'].includes(c.status));
      return { code, name, sigungu, district, cells: Object.fromEntries(codes.map(code => {
        const matches = cells.filter(c => c.indicator_code === code);
        return [code, matches.length === 1 && usable.includes(matches[0]) ? matches[0] : null];
      })) };
    });
  }

  function rentChoice(cells, code, housing) {
    if (!Object.hasOwn(HOUSING, housing)) throw new Error('주거 유형을 확인해 주세요.');
    const types = housing === 'OFFI' ? ['OFFI', 'RH', 'ALL'] : housing === 'ALL' ? ['ALL'] : [housing, 'ALL'];
    const skipped = [];
    for (const type of types) {
      const cell = cells[type === 'ALL' ? code : `${code}_${type}`];
      if (isNum(cell?.value) && cell.value >= 0 && Number.isInteger(cell.sample_n) && cell.sample_n >= RENT_MIN_N) {
        return { cell, type, reason: skipped.length ? `${skipped.join('·')} 표본 5건 미만 또는 자료 없음 → ${HOUSING[type]} 중위값 대체` : `${HOUSING[type]} 중위값` };
      }
      skipped.push(HOUSING[type]);
    }
    return { cell: null, type: housing, reason: `${skipped.join('·')} 표본 5건 미만 또는 자료 없음 · 계산 제외` };
  }

  function rankDongs(dongs, weights, factors = FACTORS, distances = null, housing = 'ALL') {
    const rows = dongs.map(d => {
      const cells = { ...d.cells };
      const rent = Object.fromEntries(RENT_CODES.map(code => [code, rentChoice(cells, code, housing)]));
      for (const code of RENT_CODES) cells[code] = rent[code].cell;
      cells.OFFICE_KM = distances?.get(d.code) ?? null;
      return { ...d, cells, rent };
    });
    const normalized = factors.map(f => normalize(rows.map(d => {
      const v = d.cells[f.code]?.value;
      return isNum(v) && v >= 0 ? v : null;
    }), f.lower));
    return rows.map((d, i) => {
      const values = factors.map((f, n) => normalized[n][i]);
      return { ...d, ...weightedScore(values, factors.map(f => weights[f.code])), factors: factors.map((f, n) => ({ ...f, label: d.rent[f.code] ? `${HOUSING[d.rent[f.code].type]} ${f.label}` : f.label, normalized: values[n], weight: weights[f.code], cell: d.cells[f.code] })) };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  }

  const api = { FACTORS, PRESETS, normalize, weightedScore, rankDongs, officeDistances, makeDongs, rentChoice };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root.document) return;
  root.RenewRelocate = api;
  const $ = id => document.getElementById(id);
  let dongs = [], presetIndex = 0, weights = { ...PRESETS[0].weights }, compared = false, adjusted = false;
  let distances = null, requestId = 0;
  const stageLabel = () => `${PRESETS[presetIndex].label} · 주거 ${HOUSING[$('housingType').value]}` + (adjusted ? ' · 중요도 직접 조정' : '');
  const format = (value, unit) => isNum(value) ? `${value.toLocaleString('ko-KR', { maximumFractionDigits: unit === 'km' ? 2 : 1 })}${unit ? ` ${unit}` : ''}` : '자료 없음';
  const valueText = f => `${f.label} ${format(f.cell?.value, f.cell?.unit)}${RENT_CODES.includes(f.code) && f.cell ? ` (표본 ${f.cell.sample_n}건)` : ''}`;
  const rentReasons = d => RENT_CODES.map((code, i) => `${i ? '월세' : '전세'}: ${d.rent[code].reason}`).join(' / ');
  const comparisonText = f => f.normalized === 50 ? '부산 내 비교에서 중간' : `부산 내 비교에서 ${((f.normalized > 50) !== f.lower) ? '높은' : '낮은'} 편`;
  const sourceText = c => `${plainSource(c?.source_name || '출처 미기록')} · ${c?.indicator_code === 'OFFICE_KM' ? '경계 기준연도 ' + c.base_year + ' · 연말 표기' : '기준일'} ${c?.reference_date || '미기록'}`;
  const sourceMarkup = text => esc(text).replace(/\d{4}-\d{2}-\d{2}/g, '<span class="relocate-date">$&</span>');
  function evidence(c) {
    const text = sourceMarkup(sourceText(c));
    const link = c?.source_url && /^https?:\/\//.test(c.source_url) ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
    return `<small class="relocate-source">${link}</small>`;
  }
  function highlights(d) {
    const active = d.factors.filter(f => f.weight > 0 && isNum(f.normalized));
    const reasons = [...active].sort((a, b) => b.normalized * b.weight - a.normalized * a.weight || a.code.localeCompare(b.code)).slice(0, 3);
    const rest = active.filter(f => !reasons.includes(f));
    const trade = rest.sort((a, b) => a.normalized - b.normalized || a.code.localeCompare(b.code))[0];
    return { reasons, trade };
  }
  function card(d, index) {
    const { reasons, trade } = highlights(d);
    return `<article class="relocate-card"><div class="relocate-card-head"><span class="relocate-rank">${index + 1}</span><h3>${esc(d.district)} ${esc(d.name)}</h3><strong class="relocate-score">${d.score.toFixed(1)}<span>점</span></strong></div>
      <p class="relocate-distance" data-cell-id="${esc(d.cells.OFFICE_KM?.cell_id || '')}">회사 동까지 직선거리 <b>${format(d.cells.OFFICE_KM?.value, 'km')}</b></p>${evidence(d.cells.OFFICE_KM)}
      <p class="relocate-coverage">반영 ${d.used}개 · 자료 누락 ${d.missing}개</p>
      <p class="relocate-help relocate-rent-reasons">${esc(rentReasons(d))}</p>
      <h4>점수에 기여한 항목</h4><ul class="relocate-reasons">${reasons.map(f => `<li>${esc(valueText(f))}<small class="relocate-source">${comparisonText(f)}</small>${evidence(f.cell)}</li>`).join('')}</ul>
      <div class="relocate-trade"><b>함께 살필 점</b><p>${trade ? esc(valueText(trade)) : '비교할 다른 항목이 없습니다. 중요도를 더 켜서 함께 살펴보세요.'}</p>${trade ? evidence(trade.cell) : ''}</div>
      <details class="relocate-evidence"><summary>근거 보기 · 전체 ${FACTORS.length}개 항목</summary><dl>${d.factors.map(f => `<div><dt>${esc(f.label)} <span>중요도 ${f.weight} · ${f.lower ? '낮을수록' : '높을수록'} 높은 점수</span></dt><dd><b>${format(f.cell?.value, f.cell?.unit)}</b> · ${isNum(f.normalized) ? `부산 내 ${f.normalized.toFixed(1)}점` : '계산 제외'}${evidence(f.cell)}<small>자료 상태: ${esc(f.cell?.status || '자료 없음')}${RENT_CODES.includes(f.code) && f.cell ? ` · 표본 ${f.cell.sample_n}건` : ''}</small>${f.cell?.note ? `<p>${esc(f.cell.note)}</p>` : ''}${f.cell?.formula_text ? `<p>원값 산식: ${esc(f.cell.formula_text)}</p>` : ''}</dd></div>`).join('')}</dl></details></article>`;
  }
  function printSheet(top, office) {
    const sources = [];
    const ref = c => {
      const text = sourceText(c);
      let i = sources.indexOf(text);
      if (i < 0) { i = sources.length; sources.push(text); }
      return `<sup>[${i + 1}]</sup>`;
    };
    const rows = top.map((d, i) => {
      const { reasons, trade } = highlights(d);
      const rent = RENT_CODES.map((code, n) => `${n ? '월세' : '전세'} ${d.rent[code].cell ? HOUSING[d.rent[code].type] + (d.rent[code].reason.includes('대체') ? '*' : '') : '자료 없음'}`).join(' / ');
      return `<tr><td>${i + 1}</td><th scope="row">${esc(d.district)} ${esc(d.name)}</th><td>${d.score.toFixed(1)}</td><td data-cell-id="${esc(d.cells.OFFICE_KM?.cell_id || '')}">${format(d.cells.OFFICE_KM?.value, 'km')}${ref(d.cells.OFFICE_KM)}</td><td>${reasons.map(f => `${esc(valueText(f))}${ref(f.cell)}`).join('<br>')}<br><small>${esc(rent)}</small></td><td>${trade ? `${esc(valueText(trade))}${ref(trade.cell)}` : '다른 활성 항목 없음'}</td><td>${d.missing}</td></tr>`;
    }).join('');
    $('printSheet').innerHTML = `<h1>부산 이전 직원 동네 비교</h1><h2>회사: ${esc(office.district)} ${esc(office.name)} · ${esc(stageLabel())}</h2><p>부산 ${dongs.length}개 행정동 중 상위 ${top.length}곳 · 행정동 대표점 사이 직선거리(이동시간 아님)</p>
      <table><thead><tr><th>순위</th><th>행정동</th><th>점수</th><th>회사 동까지</th><th>점수에 기여한 항목</th><th>함께 살필 점</th><th>누락</th></tr></thead><tbody>${rows}</tbody></table>
      <p>* 선택 유형의 표본 5건 미만 또는 자료 없음으로 대체. 오피스텔→연립다세대→전체, 아파트·연립다세대→전체 순. 전체도 부족하면 계산 제외.</p>
      <p class="relocate-print-weights">중요도(0~5): ${FACTORS.map(f => `${esc(f.label)} ${weights[f.code]}`).join(' / ')}</p>
      <p>산식: Σ(부산 내 백분위 × 중요도) ÷ Σ(값이 있는 항목의 중요도). 동률은 평균 순위, 모두 같으면 50점. 결측·중요도 0 제외. 동점은 행정동 코드순.</p>
      <ol class="relocate-print-sources">${sources.map(s => `<li>${sourceMarkup(s)}</li>`).join('')}</ol>
      <p>원천 자료의 기준일은 항목마다 다릅니다. 거리·밀도는 산·도로·배차·학교 배정·시설 이용 가능 여부를 반영하지 않습니다. 아침 시간 역 승차 인원은 최근접 부산교통공사 역의 월~금 195일(공휴일 포함), 오전 7~9시 평균 승차 인원이며 열차 혼잡도가 아닙니다. 밤길 안전시설 수와 밀도만으로 안전을 판정할 수 없습니다. 소아청소년과는 진료과목 기재 기준이며 전문의·진료시간은 미확인입니다. 월세 보증금 별도, 주택 구성 차이 유의. 유형별 임대차는 12개월 창 중 4개월만 수록, 전체 유형 대체값은 기존 3개월 자료입니다. 학원·유흥·단란주점·문화시설은 자료 추가 예정으로 점수 제외.</p>
      <p>동네 단위 공공데이터 통계이며 특정 매물을 추천하거나 중개하지 않습니다. 거리 파일의 요청 주소에는 선택한 회사 행정동 코드가 들어갑니다. 검색어와 중요도는 이 기기에서만 처리합니다. 점수는 선택한 조건에 따른 참고 계산입니다. 감정평가, 투자 권유, 공식 안전 판정에는 쓰지 않습니다.</p>`;
  }
  function clearResults(message) {
    compared = false;
    $('results').replaceChildren(); $('printSheet').replaceChildren(); $('printButton').disabled = true;
    $('resultStatus').textContent = message;
  }
  function render() {
    const office = dongs.find(d => d.code === $('officeDong').value);
    if (!office || !distances) { clearResults('회사 동의 거리 자료가 필요합니다.'); return; }
    const ranked = rankDongs(dongs, weights, FACTORS, distances, $('housingType').value).filter(d => isNum(d.score));
    const top = ranked.slice(0, 10);
    if (!top.length) { clearResults('점수에 반영할 항목이 없습니다. 중요도를 하나 이상 켜 주세요.'); return; }
    compared = true;
    $('resultStatus').textContent = `${office.district} ${office.name} 출근 · ${stageLabel()} · 부산 ${dongs.length}개 동 중 상위 ${top.length}곳. ${ranked.length < dongs.length ? `계산할 자료가 없는 ${dongs.length - ranked.length}개 동은 제외했습니다.` : ''}`;
    $('results').innerHTML = top.map(card).join('');
    printSheet(top, office); $('printButton').disabled = false;
  }
  $('lifeStages').innerHTML = PRESETS.map((p, i) => `<button type="button" data-preset="${i}" aria-pressed="${i === 0}">${esc(p.label)}</button>`).join('');
  $('stageHelp').textContent = PRESETS[0].note;
  $('housingType').value = PRESETS[0].housing;
  $('weightSliders').innerHTML = GROUPS.map((g, n) => `<fieldset><legend>${g}</legend>${FACTORS.filter(f => f.group === n).map(f => `<label class="relocate-slider" for="weight-${f.code}"><span>${esc(f.label)}</span><output id="out-${f.code}" for="weight-${f.code}">${weights[f.code]}</output><input type="range" id="weight-${f.code}" data-factor="${f.code}" min="0" max="5" step="1" value="${weights[f.code]}"></label>`).join('')}</fieldset>`).join('');
  $('lifeStages').addEventListener('click', e => {
    const button = e.target.closest('[data-preset]'); if (!button) return;
    presetIndex = +button.dataset.preset; weights = { ...PRESETS[presetIndex].weights }; adjusted = false;
    for (const b of $('lifeStages').children) b.setAttribute('aria-pressed', String(b === button));
    for (const f of FACTORS) { $(`weight-${f.code}`).value = weights[f.code]; $(`out-${f.code}`).value = weights[f.code]; }
    $('stageHelp').textContent = PRESETS[presetIndex].note;
    $('housingType').value = PRESETS[presetIndex].housing;
    if (compared) render();
  });
  $('housingType').addEventListener('change', () => { if (compared) render(); });
  $('weightSliders').addEventListener('input', e => {
    const code = e.target.dataset.factor; if (!code) return;
    weights[code] = +e.target.value; $(`out-${code}`).value = weights[code]; adjusted = true;
    if (compared) render();
  });
  function officeOptions() {
    const previous = $('officeDong').value, q = $('officeQuery').value.replace(/\s/g, '');
    const filtered = dongs.filter(d => `${d.district}${d.name}`.includes(q));
    $('officeDong').innerHTML = `<option value="">${filtered.length ? '행정동을 선택해 주세요' : '검색 결과가 없습니다'}</option>` + filtered.map(d => `<option value="${d.code}">${esc(d.district)} ${esc(d.name)}</option>`).join('');
    if (filtered.some(d => d.code === previous)) $('officeDong').value = previous;
    else if (previous) loadOfficeDistances();
    $('dataStatus').textContent = `부산 ${dongs.length}개 행정동 · 검색 결과 ${filtered.length}개`;
  }
  $('officeQuery').addEventListener('input', officeOptions);
  async function loadOfficeDistances() {
    const id = ++requestId, code = $('officeDong').value;
    distances = null;
    $('compareButton').disabled = true;
    clearResults(code ? '회사 동의 거리 자료를 불러오는 중입니다.' : '회사가 있는 행정동을 선택해 주세요.');
    if (!/^21[0-9]{6}$/.test(code) || !dongs.some(d => d.code === code)) return;
    try {
      const doc = await util.fetchJson(`data/national/reloc/office/${code}.json`);
      if (id !== requestId || code !== $('officeDong').value) return;
      distances = officeDistances(doc, code, dongs);
      $('compareButton').disabled = false;
      $('resultStatus').textContent = '생활 조건을 고른 뒤 동네 비교를 눌러 주세요.';
    } catch (e) {
      if (id === requestId) clearResults(e.message + ' 새로고침해 다시 시도해 주세요.');
    }
  }
  $('officeDong').addEventListener('change', loadOfficeDistances);
  $('relocateForm').addEventListener('submit', e => {
    e.preventDefault(); render();
    if (compared) $('resultsTitle').scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  $('printButton').addEventListener('click', () => root.print());
  async function load() {
    try {
      const [index, definitions, reloc] = await Promise.all([util.fetchJson('data/national/dong_index.json'), util.fetchJson('data/national/living/index.json'), util.fetchJson('data/national/reloc/busan.json')]);
      if (!Array.isArray(index) || !Array.isArray(definitions?.indicators)) throw new Error('행정동 목록·지표 정의를 불러오지 못했습니다.');
      if (FACTORS.some(f => f.code !== 'OFFICE_KM' && !RELOC_CODES.includes(f.code) && !definitions.indicators.some(d => d.code === f.code))) throw new Error('지표 정의가 바뀌어 계산을 중단했습니다.');
      const busan = index.filter(row => row[2].startsWith('21'));
      const documents = await Promise.all([...new Set(busan.map(row => row[2]))].map(code => util.fetchJson(`data/national/living/${code}.json`)));
      if (!busan.length || documents.some(d => !Array.isArray(d?.dongs))) throw new Error('부산 일부 지역 자료를 불러오지 못했습니다.');
      const relocCodes = [...RELOC_CODES, ...RENT_CODES.flatMap(code => ['APT', 'RH', 'OFFI'].map(type => `${code}_${type}`))];
      if (reloc?.rent?.min_n !== RENT_MIN_N || !Array.isArray(reloc?.dongs) || reloc.dongs.length !== busan.length
        || new Set(reloc.dongs.map(d => d.code7)).size !== busan.length
        || busan.some(row => !reloc.dongs.some(d => d.code7 === row[0] && Array.isArray(d.cells)
          && relocCodes.every(code => d.cells.filter(c => c.indicator_code === code).length === 1)))) throw new Error('소아청소년과·주거 유형 자료를 확인하지 못했습니다.');
      dongs = makeDongs(busan, [...documents, reloc]);
      officeOptions();
      for (const id of ['officeQuery', 'officeDong']) $(id).disabled = false;
    } catch (e) {
      $('dataStatus').textContent = `${e.message} 새로고침해 다시 시도해 주세요.`;
      $('resultStatus').textContent = '자료를 모두 불러온 뒤 비교할 수 있습니다.';
    }
  }
  load();
})(typeof window !== 'undefined' ? window : globalThis);
