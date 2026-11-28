(function (root) {
  'use strict';
  const util = typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil;
  const { isNum, esc, plainSource } = util;
  const GROUPS = ['주거비', '출퇴근(직선거리·역·버스)', '밤길 안전시설', '아이', '의료', '생활·여가'];
  const HOUSING = { APT: '아파트', RH: '연립다세대', OFFI: '오피스텔', ALL: '전체' };
  const RENT_CODES = ['JEONSE_M2_MED', 'WOLSE_MED'];
  const RELOC_CODES = ['PEDS_CLINIC_COUNT', 'PEDS_NEAREST_M', 'SUBWAY_AM_PEAK_BOARD'];
  const RENT_MIN_N = 5;
  const RULE = 'RELOC-RANK-2026.11-v2';
  // 기본값(대표 확인 대기): 반경 안 동이 적을 때 넓힐 최소 후보 30곳. 기본 반경 10km는 relocate.html의 선택값(hunt 2026-11-20 C03 권고).
  const RADIUS_MIN_N = 30;
  // shortcut: 대표점 간격 4km 이상 기준의 고정 목록, 행정동 경계가 바뀌면 자료에서 계산
  const WIDE_DONGS = ['21120580', '21510120', '21510130', '21510111', '21120561', '21510110']; // 가덕도동·장안읍·정관읍·일광읍·녹산동·기장읍
  // 다섯째 값(ref): 화면에 참고로만 보이고 점수에는 넣지 않는 항목. 승차 인원은 역 거리와 무관하고, 의원 수는 전문의 여부를 모른다(hunt C02).
  const FACTORS = [
    ['JEONSE_M2_MED', '전세 보증금 ㎡당 중위값', 0, true], ['WOLSE_MED', '월세 중위값(보증금 별도)', 0, true],
    ['OFFICE_KM', '회사 동까지 직선거리', 1, true], ['SUBWAY_NEAREST_M', '도시철도역 직선거리', 1, true], ['BUS_STOP_DENSITY', '버스정류장 밀도', 1, false], ['SUBWAY_AM_PEAK_BOARD', '아침 시간 역 승차 인원', 1, true, true],
    ['STREETLIGHT_PER_KM2', '보안등 밀도', 2, false], ['CCTV_PER_KM2', 'CCTV 밀도', 2, false], ['EMERGENCY_BELL_PER_KM2', '안전비상벨 밀도', 2, false], ['POLICE_NEAREST_M', '경찰관서 직선거리', 2, true],
    ['ELEM_SCHOOL_NEAREST_M', '초등학교 직선거리', 3, true], ['KINDER_NEAREST_M', '유치원 직선거리', 3, true], ['CHILDCARE_NEAREST_M', '어린이집 직선거리', 3, true],
    // r16: 새 지표 '소아청소년과 전문의가 있는 기관 수'와 섞이지 않게 진료과목 기준임을 이름에 적는다
    ['PEDS_CLINIC_COUNT', '소아청소년과 진료 의원 수(진료과목 기준)', 3, false, true], ['PEDS_NEAREST_M', '소아청소년과 진료과목 기관 직선거리(전문의 여부 반영 안 함)', 4, true],
    ['HOSP_PER10K', '인구 1만 명당 병원·의원', 4, false], ['ER_NEAREST_M', '응급의료센터 직선거리', 4, true], ['PHARM_NIGHT_COUNT', '평일 21시 이후 영업 등록 약국', 4, false],
    ['PARK_AREA_PER_CAPITA', '1인당 도시공원 면적', 5, false], ['SPORTS_CENTER_NEAREST_M', '실내 생활체육시설 직선거리', 5, true], ['LIB_NEAREST_M', '공공도서관 직선거리', 5, true], ['STORE_FOOD_COUNT', '음식 업소 수', 5, false]
  ].map(([code, label, group, lower, ref = false]) => ({ code, label, group, lower, ref }));
  // 기본값(대표 확인 대기): 그룹 중요도 [주거비, 출퇴근, 밤길, 아이, 의료, 생활·여가]는 근거 자료 없는 규범값이다.
  // 이름에 적힌 그룹이 명목 비중 상위가 되게 맞췄다(hunt 2026-11-20 C03 A3 권고안).
  const PRESETS = [
    { label: '주거비와 출퇴근', housing: 'OFFI', groups: [5, 5, 1, 0, 1, 1], note: '회사 동 반경 안에서 주거비와 출퇴근 항목을 중심으로 비교합니다.' },
    { label: '출퇴근과 돌봄', housing: 'APT', groups: [1, 5, 1, 4, 1, 1], note: '회사 동 반경 안에서 출퇴근과 학교·돌봄 시설을 중심으로 비교합니다.' },
    { label: '학교와 돌봄', housing: 'APT', groups: [1, 1, 1, 5, 1, 1], note: '회사 동 반경 안에서 초등학교와 돌봄 시설을 중심으로 비교합니다. 학교 배정·통학로는 별도 확인이 필요합니다.' },
    { label: '교통과 생활·여가', housing: 'APT', groups: [1, 4, 1, 0, 1, 4], note: '회사 동 반경 안에서 대중교통과 도서관·공원 등 생활·여가 시설을 중심으로 비교합니다.' },
    { label: '의료와 생활·여가', housing: 'APT', groups: [1, 1, 1, 0, 5, 4], note: '회사 동 반경 안에서 의료와 생활·여가 시설을 중심으로 비교합니다.' }
  ].map(p => ({ ...p, weights: Object.fromEntries(FACTORS.map(f => [f.code, f.ref ? 0 : p.groups[f.group]])) }));

  const CONDITION_FORMAT = 'renewmap-relocate-conditions-v1';
  const CONDITION_FACTORS = FACTORS.filter(f => !f.ref);
  function readConditions(data) {
    if (data?.format !== CONDITION_FORMAT || typeof data.office !== 'string' || !/^21\d{6}$/.test(data.office) ||
        !Number.isInteger(data.preset) || !PRESETS[data.preset] || typeof data.housing !== 'string' || !Object.hasOwn(HOUSING, data.housing) ||
        !['5', '10', '15', 'all'].includes(data.radius) || !data.weights || Array.isArray(data.weights) ||
        Object.keys(data.weights).length !== CONDITION_FACTORS.length ||
        CONDITION_FACTORS.some(f => !Object.hasOwn(data.weights, f.code) || !Number.isInteger(data.weights[f.code]) || data.weights[f.code] < 0 || data.weights[f.code] > 5) ||
        !CONDITION_FACTORS.some(f => data.weights[f.code] > 0)) return null;
    const inputBasis = data.basis;
    if (inputBasis !== undefined && (!inputBasis || typeof inputBasis.rule !== 'string' ||
        !/^RELOC-RANK-\d{4}\.\d{2}-v\d+$/.test(inputBasis.rule) || typeof inputBasis.distance !== 'string' ||
        !/^reloc-office:[a-f0-9]{64}$/.test(inputBasis.distance))) return null;
    const weights = Object.fromEntries(FACTORS.map(f => [f.code, f.ref ? 0 : data.weights[f.code]]));
    const basis = inputBasis ? { rule: inputBasis.rule, distance: inputBasis.distance } : null;
    return { office: data.office, preset: data.preset, housing: data.housing, radius: data.radius, weights, basis };
  }

  function conditionBasisNote(basis, distance) {
    if (!basis) return '저장 당시의 거리 자료·계산 규칙 기록이 없습니다.';
    const changed = [];
    if (basis.distance !== distance) changed.push('거리 자료');
    if (basis.rule !== RULE) changed.push('계산 규칙');
    return changed.length ? `저장 당시와 다른 항목은 ${changed.join('·')}입니다.` : '저장 당시와 거리 자료·계산 규칙이 일치합니다.';
  }

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
    let sum = 0, total = 0, missing = 0, used = 0, missingWeight = 0;
    weights.forEach((w, i) => {
      if (!Number.isInteger(w) || w < 0 || w > 5) throw new Error('중요도는 0~5 정수여야 합니다.');
      if (!w) return;
      if (!isNum(values[i])) { missing++; missingWeight += w; return; }
      sum += values[i] * w; total += w; used++;
    });
    return { score: total ? sum / total : null, missing, used, usedWeight: total, missingWeight };
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
        throw new Error('행정동 거리 자료의 코드와 출처를 확인할 수 없습니다.');
      }
      cells.set(row.code7, !c.value_hidden_reason && !['폐기', '충돌'].includes(c.status) && isNum(c.value) && c.value >= 0 ? c : null);
    }
    return cells;
  }

  // 대중교통 대략 시간: {code7: {lo, hi, route, lc, hc}}. 파일이 없거나 회사 동이 다르면 null(카드에서 줄을 숨긴다)
  function transitTimes(doc, officeCode) {
    if (!doc || doc.office_code !== officeCode || !Array.isArray(doc.dongs)) return null;
    const out = new Map();
    for (const row of doc.dongs) {
      const lc = row.cells?.find(c => c.indicator_code === 'TRANSIT_MIN_LO'), hc = row.cells?.find(c => c.indicator_code === 'TRANSIT_MIN_HI');
      if (lc && hc && isNum(lc.value) && isNum(hc.value)) out.set(row.code7, { lo: lc.value, hi: hc.value, route: String(lc.note || '').split(': ').slice(1).join(': '), lc, hc, caution: doc.caution });
    }
    return out;
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

  // ['202607', ...] → '2026년 7~10월'. 끊긴 달은 구간마다 나눠 쓴다.
  function monthSpan(months) {
    const runs = [];
    for (const o of [...months].sort().map(m => +m.slice(0, 4) * 12 + +m.slice(4) - 1)) {
      const r = runs[runs.length - 1];
      if (r && o === r[1] + 1) r[1] = o; else runs.push([o, o]);
    }
    return runs.map(([a, b]) => {
      const [y1, m1, y2, m2] = [Math.floor(a / 12), a % 12 + 1, Math.floor(b / 12), b % 12 + 1];
      return a === b ? `${y1}년 ${m1}월` : y1 === y2 ? `${y1}년 ${m1}~${m2}월` : `${y1}년 ${m1}월~${y2}년 ${m2}월`;
    }).join('·');
  }

  // 유형별 전월세 원장의 조회 창(rent.months)과 실제 수록 월(by_type.*.available_months)을 화면 문장으로 바꾼다.
  function rentPeriod(rent) {
    const ok = m => Array.isArray(m) && m.length > 0 && new Set(m).size === m.length && m.every(v => /^20\d{2}(0[1-9]|1[0-2])$/.test(v));
    const window = rent?.months, types = ['APT', 'RH', 'OFFI'].map(t => rent?.by_type?.[t.toLowerCase()]?.available_months);
    if (!ok(window) || !types.every(m => ok(m) && m.every(v => window.includes(v)))) throw new Error('전월세 수록 기간을 확인하지 못했습니다.');
    const covered = types.every(m => [...m].sort().join() === [...types[0]].sort().join())
      ? `${monthSpan(types[0])} 계약 ${types[0].length}개월`
      : ['APT', 'RH', 'OFFI'].map((t, i) => `${HOUSING[t]} ${monthSpan(types[i])} ${types[i].length}개월`).join(', ');
    return { covered, window: `${monthSpan(window)} ${window.length}개월`, partial: types.some(m => m.length < window.length) };
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
    const rentWeighted = factors.filter(f => RENT_CODES.includes(f.code) && weights[f.code] > 0).map(f => f.code);
    return rows.map((d, i) => {
      const values = factors.map((f, n) => normalized[n][i]);
      const rentMissing = rentWeighted.filter(code => !d.cells[code]);
      // 주거비 중요도가 켜져 있는데 그 주거비 값이 모두 없는 동은 점수와 관계없이 자료 있는 동 뒤에 둔다(hunt C02, 결측 처리 자체는 그대로).
      const noRent = rentWeighted.length > 0 && rentMissing.length === rentWeighted.length;
      return { ...d, rentMissing, noRent, ...weightedScore(values, factors.map(f => weights[f.code])), factors: factors.map((f, n) => ({ ...f, label: d.rent[f.code] ? `${HOUSING[d.rent[f.code].type]} ${f.label}` : f.label, normalized: values[n], weight: weights[f.code], cell: d.cells[f.code] })) };
    }).sort(byRank(d => d.score));
  }

  const byRank = score => (a, b) => a.noRent - b.noRent || (score(b) ?? -1) - (score(a) ?? -1) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

  // 회사 동 대표점에서 직선 r km 안 동만 남긴다. 그 수가 minN보다 적으면 가까운 minN곳으로 넓힌다. 순서는 ranked 그대로.
  function gateByRadius(ranked, r, minN = RADIUS_MIN_N) {
    const km = d => d.cells.OFFICE_KM?.value;
    if (!isNum(r)) return { list: ranked, widened: false };
    const inside = ranked.filter(d => isNum(km(d)) && km(d) <= r);
    if (inside.length >= minN) return { list: inside, widened: false };
    const near = new Set(ranked.filter(d => isNum(km(d))).sort((a, b) => km(a) - km(b) || (a.code < b.code ? -1 : 1)).slice(0, minN).map(d => d.code));
    return { list: ranked.filter(d => near.has(d.code)), widened: true };
  }

  // 그룹별 명목 비중(그룹 중요도 합 ÷ 전체 중요도 합, %). 반올림 합이 100이 되게 나머지가 큰 그룹부터 1씩 더한다.
  function groupShares(weights) {
    const total = FACTORS.reduce((s, f) => s + (weights[f.code] || 0), 0);
    if (!total) return null;
    const raw = GROUPS.map((_, n) => 100 * FACTORS.reduce((s, f) => s + (f.group === n ? weights[f.code] || 0 : 0), 0) / total);
    const groups = raw.map(Math.floor);
    raw.map((v, i) => [v - groups[i], i]).sort((a, b) => b[0] - a[0]).slice(0, 100 - groups.reduce((a, b) => a + b, 0)).forEach(([, i]) => groups[i]++);
    return { groups, office: Math.round(100 * (weights.OFFICE_KM || 0) / total) };
  }

  // 중요도를 항목마다 U(0.5,1.5)배로 runs번 흔들어 다시 셈한 순위의 5~95% 구간. 같은 seedText면 같은 결과(mulberry32).
  // 기준 순위는 흔든 경우 가운데 하나이므로 구간에 넣어 a ≤ 표시 순위 ≤ b를 지킨다.
  function rankRanges(list, seedText, runs = 200, top = 10) {
    let a = 2166136261;
    for (let i = 0; i < seedText.length; i++) a = Math.imul(a ^ seedText.charCodeAt(i), 16777619);
    const rand = () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const n = Math.min(top, list.length), ranks = Array.from({ length: n }, () => []);
    for (let run = 0; run < runs; run++) {
      const mult = (list[0]?.factors || []).map(() => 0.5 + rand());
      list.map((d, i) => {
        let sum = 0, total = 0;
        d.factors.forEach((f, k) => { if (f.weight > 0 && isNum(f.normalized)) { sum += f.normalized * f.weight * mult[k]; total += f.weight * mult[k]; } });
        return { i, code: d.code, noRent: d.noRent, s: total ? sum / total : null };
      }).sort(byRank(o => o.s)).forEach((o, rank) => { if (o.i < n) ranks[o.i].push(rank + 1); });
    }
    return ranks.map((r, i) => {
      r.sort((x, y) => x - y);
      return [Math.min(r[Math.floor(0.05 * (runs - 1))], i + 1), Math.max(r[Math.ceil(0.95 * (runs - 1))], i + 1)];
    });
  }

  const api = { FACTORS, PRESETS, normalize, weightedScore, rankDongs, gateByRadius, groupShares, rankRanges, officeDistances, makeDongs, rentChoice, monthSpan, rentPeriod, transitTimes, supportStatus, readConditions, conditionBasisNote };   // 2026-11-21 transitTimes: 시험용
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root.document) return;
  root.RenewRelocate = api;
  const $ = id => document.getElementById(id);
  let dongs = [], presetIndex = 0, weights = { ...PRESETS[0].weights }, compared = false, adjusted = false;
  // 2026-11-21: transit = 회사 동까지 대중교통 대략 시간(reloc/transit, export_transit_busan.py). 없거나 못 받으면 null — 점수·순위에는 쓰지 않고 카드에 참고로만 보인다
  let distances = null, transit = null, requestId = 0, rentText = '', rentMonths = {};
  let conditionReadId = 0, distanceSnapshot = null;
  const emptyResults = $('results').innerHTML; // 결과를 비울 때 450px 빈자리 대신 처음 안내 상자를 되살린다.
  const stageLabel = () => `${PRESETS[presetIndex].label} · 주거 ${HOUSING[$('housingType').value]}` + (adjusted ? ' · 중요도 직접 조정' : '');
  const radiusKm = () => +$('radiusKm').value || null; // '전체'(all)·빈 값은 null
  const format = (value, unit) => isNum(value) ? `${value.toLocaleString('ko-KR', { maximumFractionDigits: unit === 'km' ? 2 : 1 })}${unit ? ` ${unit}` : ''}` : '자료 없음';
  const valueText = f => `${f.label} ${format(f.cell?.value, f.cell?.unit)}${RENT_CODES.includes(f.code) && f.cell ? ` (표본 ${f.cell.sample_n}건)` : ''}`;
  const rentReasons = d => RENT_CODES.map((code, i) => {
    const { cell, type, reason } = d.rent[code];
    const span = !cell ? '' : type === 'ALL' ? ' · 기존 3개월 자료' : ` · 수록 ${rentMonths[type]}/${rentMonths.window}개월`;
    return `${i ? '월세' : '전세'}: ${reason}${cell ? ` · 표본 ${cell.sample_n}건` : ''}${span}`;
  }).join(' / ');
  const rentFlag = d => {
    if (!d.rentMissing.length) return '';
    if (d.noRent) return '주거비 자료 없음 · 주거비 미반영 · 자료 있는 동 뒤에 배치';
    const name = d.rentMissing[0] === 'WOLSE_MED' ? '월세' : '전세'; // noRent가 아니면 빠진 주거비 항목은 하나뿐이다.
    return `주거비 자료 없음(${name}) · ${name} 미반영`;
  };
  const shareText = () => {
    const s = groupShares(weights);
    return s ? `명목 비중: ${GROUPS.map((g, n) => `${g.replace(/\(.*\)/, '')} ${s.groups[n]}%${n === 1 ? `(회사 거리 ${s.office}%)` : ''}`).join(' · ')} (자료 없는 항목이 있는 동은 다름)` : '';
  };
  const comparisonText = f => f.normalized === 50 ? '부산 내 비교에서 중간' : `부산 내 비교에서 ${((f.normalized > 50) !== f.lower) ? '높은' : '낮은'} 편`;
  // 원장 상태(D3)는 요건 상태와 다른 축이라 화면(home-live·동 쪽)과 같은 '사람 대조' 낱말로 보인다(OD1 r16 2차: 원값 '미확인'을 그대로 쓰지 않는다)
  const LEDGER_WORD = { 미확인: '사람 대조 전', 확인중: '사람 대조 중', 확인: '사람 대조 완료', 폐기: '쓰지 않음' };
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
  // 출퇴근 대략 시간 한 줄(점수 미반영). 범위로만 보이고 '길 안내 아님'을 함께 적는다
  function transitLine(d) {
    const t = transit?.get(d.code);
    if (!t) return '';
    return `
      <p class="relocate-transit" data-cell-id="${esc(t.lc.cell_id || '')}">대중교통 대략 <b>${t.lo === t.hi ? t.lo : `${t.lo}~${t.hi}`}분</b>${t.route && t.route !== '걷기' ? `<span class="relocate-coverage">${esc(t.route)}</span>` : ''}<span class="relocate-coverage">참고 · 점수 미반영</span></p>`;
  }
  function transitEvidence(d) {
    const t = transit?.get(d.code);
    return t ? `
      <p class="relocate-evidence-distance">대중교통 대략 ${t.lo}~${t.hi}분 (${esc(t.route)})${evidence(t.lc)}<small class="relocate-source">${esc(t.caution || '')}</small></p>` : '';
  }
  // 2026-11-21 주거 지원 제도 안내: 금액·날짜는 data/housing_support.json에서 읽고, 접수 상태만 오늘 날짜로 계산한다(자격 판정 아님)
  function supportStatus(item, today) {
    const monthDay = ymd => `${+ymd.slice(5, 7)}월 ${+ymd.slice(8, 10)}일`;   // 노드 시험에서도 쓰이게 함수 안에 둔다(바깥 const는 화면 전용 구간이라 초기화 전)
    if (today < item.start) return `접수 전(${monthDay(item.start)} 시작)`;
    if (today <= item.end) return `접수 중(${monthDay(item.end)} 마감)`;
    return '올해 접수 마감';
  }
  function supportTable(doc, today) {
    if (!doc?.items?.length) return '<p class="relocate-help">지원 제도 안내를 불러오지 못했습니다.</p>';
    const rows = doc.items.map(it => `<tr><th scope="row">${esc(it.name)}</th><td>${esc(it.who)}</td><td>${esc(it.what)}</td><td>${esc(it.how)}</td>
      <td><b>${esc(supportStatus(it, today))}</b><small class="relocate-source"><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.source)}</a>${it.verified ? '' : ' · 세부 조건 원문 확인 필요'}</small></td></tr>`).join('');
    return `<p class="relocate-help">${esc(doc.caution)} (확인일 ${esc(doc.checked_at)})</p>
      <div class="relocate-support-scroll"><table class="relocate-support-table"><thead><tr><th scope="col">제도</th><th scope="col">누구</th><th scope="col">무엇</th><th scope="col">신청</th><th scope="col">지금 상태</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const basisCounts = d => `${d.used}/${d.used + d.missing}개`;
  const basisWeights = d => `${d.usedWeight}/${d.usedWeight + d.missingWeight}`;
  const missingLabels = d => d.factors.filter(f => f.weight > 0 && !isNum(f.normalized)).map(f => esc(f.label));
  function card(d, index, range) {
    const { reasons, trade } = highlights(d);
    const flag = rentFlag(d);
    const pending = missingLabels(d);
    // 처음에는 순위·점수·거리·항목 이름만 보이고, 값의 출처·기준일은 '근거 보기' 안에 모두 남긴다.
    return `<article class="relocate-card"><div class="relocate-card-head"><span class="relocate-rank">${index + 1}</span><h3>${esc(d.district)} ${esc(d.name)}</h3><strong class="relocate-score">${d.score.toFixed(0)}<span>점</span></strong></div>${flag ? `
      <p class="relocate-flag">${flag}</p>` : ''}
      <p class="relocate-distance" data-cell-id="${esc(d.cells.OFFICE_KM?.cell_id || '')}">회사 동까지 직선거리 <b>${format(d.cells.OFFICE_KM?.value, 'km')}</b><span class="relocate-coverage">순위 범위 ${range[0]}~${range[1]}위</span></p>${transitLine(d)}
      <p class="relocate-help relocate-score-basis">점수 반영 ${basisCounts(d)} · 중요도 합 ${basisWeights(d)}</p>
      <p class="relocate-top"><b>점수에 기여한 항목</b> ${reasons.map(f => esc(f.label)).join(' · ')}</p>${trade ? `
      <p class="relocate-top"><b>함께 살필 점</b> ${esc(trade.label)}</p>` : ''}
      <details class="relocate-evidence rm-disclosure"><summary>근거 보기 · 전체 ${FACTORS.length}개 항목</summary>
      <p class="relocate-evidence-distance">회사 동까지 직선거리 ${format(d.cells.OFFICE_KM?.value, 'km')}${evidence(d.cells.OFFICE_KM)}</p>${transitEvidence(d)}
      ${pending.length ? `<h4>자료가 없어 점수에서 빠진 항목</h4><ul class="relocate-pending">${pending.map(label => `<li>${label}</li>`).join('')}</ul>` : ''}
      <p class="relocate-help relocate-rent-reasons">${esc(rentReasons(d))}</p>
      <h4>점수에 기여한 항목</h4><ul class="relocate-reasons">${reasons.map(f => `<li>${esc(valueText(f))}<small class="relocate-source">${comparisonText(f)}</small>${evidence(f.cell)}</li>`).join('')}</ul>
      <div class="relocate-trade"><b>함께 살필 점</b><p>${trade ? esc(valueText(trade)) : '비교할 다른 항목이 없습니다. 중요도를 더 켜서 함께 살펴보세요.'}</p>${trade ? evidence(trade.cell) : ''}</div>
      <h4>전체 ${FACTORS.length}개 항목</h4><dl>${d.factors.map(f => `<div><dt>${esc(f.label)} <span>${f.ref ? '참고 · 점수 미반영' : `중요도 ${f.weight} · ${f.lower ? '낮을수록' : '높을수록'} 높은 점수`}</span></dt><dd><b>${format(f.cell?.value, f.cell?.unit)}</b>${f.ref ? '' : ` · ${isNum(f.normalized) ? `부산 내 ${f.normalized.toFixed(1)}점` : '계산 제외'}`}${evidence(f.cell)}<small>자료 상태: ${esc(LEDGER_WORD[f.cell?.status] || f.cell?.status || '자료 없음')}${RENT_CODES.includes(f.code) && f.cell ? ` · 표본 ${f.cell.sample_n}건` : ''}</small>${f.cell?.note ? `<p>${esc(f.cell.note)}</p>` : ''}${f.cell?.formula_text ? `<p>원값 산식: ${esc(f.cell.formula_text)}</p>` : ''}</dd></div>`).join('')}</dl></details></article>`;
  }
  function printSheet(top, office, ranges, scope) {
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
      const flag = rentFlag(d);
      const pending = missingLabels(d);
      return `<tr><td>${i + 1}</td><th scope="row">${esc(d.district)} ${esc(d.name)}${flag ? `<br><small>${flag}</small>` : ''}</th><td>${d.score.toFixed(0)}</td><td>${ranges[i][0]}~${ranges[i][1]}위</td><td data-cell-id="${esc(d.cells.OFFICE_KM?.cell_id || '')}">${format(d.cells.OFFICE_KM?.value, 'km')}${ref(d.cells.OFFICE_KM)}</td><td>${reasons.map(f => `${esc(valueText(f))}${ref(f.cell)}`).join('<br>')}<br><small>${esc(rent)}</small></td><td>${trade ? `${esc(valueText(trade))}${ref(trade.cell)}` : '다른 활성 항목 없음'}${pending.length ? `<small class="relocate-print-pending">점수에서 빠진 항목: ${pending.join(' · ')}</small>` : ''}</td><td>${basisCounts(d)}<br>${basisWeights(d)}</td></tr>`;
    }).join('');
    $('printSheet').innerHTML = `<h1>부산 이전 직원 동네 비교</h1><h2>회사: ${esc(office.district)} ${esc(office.name)} · ${esc(stageLabel())}</h2><p>${esc(scope)} · 행정동 대표점 사이 직선거리(이동시간 아님)</p>
      <p class="relocate-print-rule">${RULE} · 반경 ${radiusKm() ? `${radiusKm()}km` : '부산 전체'} · ${esc(shareText())}</p>
      <table><thead><tr><th>순위</th><th>행정동</th><th>점수</th><th>순위 범위</th><th>회사 동까지</th><th>점수에 기여한 항목</th><th>함께 살필 점</th><th>반영 항목<br>중요도 합</th></tr></thead><tbody>${rows}</tbody></table>
      <p>분모는 선택한 전체 항목 수와 중요도 합입니다. * 선택 유형의 표본 5건 미만 또는 자료 없음으로 대체. 오피스텔→연립다세대→전체, 아파트·연립다세대→전체 순. 전체도 부족하면 계산 제외.</p>
      <p class="relocate-print-weights">중요도(0~5): ${FACTORS.filter(f => !f.ref).map(f => `${esc(f.label)} ${weights[f.code]}`).join(' / ')}</p>
      <p>산식: Σ(부산 내 백분위 × 중요도) ÷ Σ(값이 있는 항목의 중요도). 동률은 평균 순위, 모두 같으면 50점. 결측·중요도 0 제외. 주거비 중요도가 켜져 있는데 주거비 값이 모두 없는 동은 자료 있는 동 뒤에 둠. 동점은 행정동 코드순. 순위 범위는 중요도를 ±50% 바꿔 다시 셈한 순위의 90% 구간(200회, 지금 순위 포함)이며 자료 오차는 반영하지 않음.</p>
      <ol class="relocate-print-sources">${sources.map(s => `<li>${sourceMarkup(s)}</li>`).join('')}</ol>
      <p>원천 자료의 기준일은 항목마다 다릅니다. 거리·밀도는 산·도로·배차·학교 배정·시설 이용 가능 여부를 반영하지 않습니다. 아침 시간 역 승차 인원은 최근접 부산교통공사 역의 월~금 195일(공휴일 포함), 오전 7~9시 평균 승차 인원이며 열차 혼잡도가 아닙니다. 승차 인원은 참고로만 보이며 점수 미반영입니다. 밤길 안전시설 수와 밀도만으로 안전을 판정할 수 없습니다. 소아청소년과는 진료과목 기재 기준이며 전문의 여부·진료시간은 반영하지 않았습니다. 소아청소년과 의원 수는 참고로만 보이며 점수 미반영입니다. 월세 보증금 별도, 주택 구성 차이 유의. ${esc(rentText)} 전체 유형 대체값은 기존 3개월 자료입니다. 학원·유흥·단란주점·문화시설은 자료 추가 예정으로 점수 제외.</p>
      <p>동네 단위 공공데이터 통계이며 특정 매물을 추천하거나 중개하지 않습니다. 거리 파일의 요청 주소에는 선택한 회사 행정동 코드가 들어갑니다. 검색어와 중요도는 이 기기에서만 처리합니다. 점수는 선택한 조건에 따른 참고 계산입니다. 감정평가, 투자 권유, 공식 안전 판정에는 쓰지 않습니다.</p>`;
  }
  function clearResults(message) {
    compared = false;
    $('results').innerHTML = emptyResults; $('printSheet').replaceChildren(); $('printButton').disabled = true; $('saveConditions').disabled = true;
    $('resultStatus').textContent = message; $('resultShares').textContent = '';
  }
  function render() {
    const office = dongs.find(d => d.code === $('officeDong').value);
    if (!office || !distances) { clearResults('회사 동의 거리 자료가 필요합니다.'); return; }
    const housing = $('housingType').value, r = radiusKm();
    const ranked = rankDongs(dongs, weights, FACTORS, distances, housing).filter(d => isNum(d.score));
    const { list, widened } = gateByRadius(ranked, r);
    const top = list.slice(0, 10);
    if (!top.length) { clearResults('점수에 반영할 항목이 없습니다. 중요도를 하나 이상 켜 주세요.'); return; }
    const ranges = rankRanges(list, [office.code, presetIndex, housing, r, ...FACTORS.map(f => weights[f.code])].join('|'));
    const scope = !r ? `부산 ${dongs.length}개 동 중 상위 ${top.length}곳`
      : widened ? `반경 ${r}km 안 동이 적어 가까운 ${list.length}곳으로 넓혔습니다. 그중 상위 ${top.length}곳`
      : `회사 동 대표점에서 직선 반경 ${r}km 안 ${list.length}개 동 중 상위 ${top.length}곳`;
    compared = true;
    $('resultStatus').textContent = `${office.district} ${office.name} 출근 · ${stageLabel()} · ${scope}.${WIDE_DONGS.includes(office.code) ? ' 큰 행정동이라 대표점 거리 오차가 큽니다.' : ''}${ranked.length < dongs.length ? ` 계산할 자료가 없는 ${dongs.length - ranked.length}개 동은 제외했습니다.` : ''}`;
    $('resultShares').textContent = shareText();
    $('results').innerHTML = top.map((d, i) => card(d, i, ranges[i])).join('');
    printSheet(top, office, ranges, scope + (WIDE_DONGS.includes(office.code) ? ' · 큰 행정동이라 대표점 거리 오차가 큼' : '')); $('printButton').disabled = false; $('saveConditions').disabled = false;
  }
  $('lifeStages').innerHTML = PRESETS.map((p, i) => `<button type="button" data-preset="${i}" aria-pressed="${i === 0}">${esc(p.label)}</button>`).join('');
  $('stageHelp').textContent = PRESETS[0].note;
  $('housingType').value = PRESETS[0].housing;
  $('weightSliders').innerHTML = GROUPS.map((g, n) => `<fieldset><legend>${g}</legend>${FACTORS.filter(f => f.group === n && !f.ref).map(f => `<label class="relocate-slider" for="weight-${f.code}"><span>${esc(f.label)}</span><output id="out-${f.code}" for="weight-${f.code}">${weights[f.code]}</output><input type="range" id="weight-${f.code}" data-factor="${f.code}" min="0" max="5" step="1" value="${weights[f.code]}"></label>`).join('')}</fieldset>`).join('');
  function showConditionWeights() {
    for (const b of $('lifeStages').children) b.setAttribute('aria-pressed', String(+b.dataset.preset === presetIndex));
    for (const f of CONDITION_FACTORS) { $(`weight-${f.code}`).value = weights[f.code]; $(`out-${f.code}`).value = weights[f.code]; }
    $('stageHelp').textContent = PRESETS[presetIndex].note;
  }
  $('lifeStages').addEventListener('click', e => {
    const button = e.target.closest('[data-preset]'); if (!button) return;
    presetIndex = +button.dataset.preset; weights = { ...PRESETS[presetIndex].weights }; adjusted = false;
    showConditionWeights();
    $('housingType').value = PRESETS[presetIndex].housing;
    if (compared) render();
  });
  for (const id of ['housingType', 'radiusKm']) $(id).addEventListener('change', () => { if (compared) render(); });
  $('weightSliders').addEventListener('input', e => {
    const code = e.target.dataset.factor; if (!code) return;
    weights[code] = +e.target.value; $(`out-${code}`).value = weights[code]; adjusted = true;
    if (compared) render();
  });
  function officeOptions() {
    const previous = $('officeDong').value, q = $('officeQuery').value.replace(/\s/g, '');
    const filtered = dongs.filter(d => `${d.district}${d.name}`.includes(q));
    $('officeDong').innerHTML = `<option value="">${filtered.length ? '행정동을 선택해 주세요' : '검색 결과가 없습니다'}</option>` + filtered.map(d => `<option value="${esc(d.code)}">${esc(d.district)} ${esc(d.name)}</option>`).join('');
    if (filtered.some(d => d.code === previous)) $('officeDong').value = previous;
    // 검색 결과가 한 곳이면 그 동을 바로 고른다(목록에서 다시 골라야 비교 단추가 켜졌다, r16)
    else if (filtered.length === 1) { $('officeDong').value = filtered[0].code; loadOfficeDistances(); }
    else if (previous) loadOfficeDistances();
    $('dataStatus').textContent = `부산 ${dongs.length}개 행정동 · 검색 결과 ${filtered.length}개`;
  }
  $('officeQuery').addEventListener('input', officeOptions);
  async function loadOfficeDistances(savedBasis) {
    const id = ++requestId, code = $('officeDong').value;
    if (savedBasis === undefined) $('conditionStatus').textContent = '';
    distances = null;
    distanceSnapshot = null;
    transit = null;
    $('compareButton').disabled = true;
    clearResults(code ? '회사 동의 거리 자료를 불러오는 중입니다.' : '회사가 있는 행정동을 선택해 주세요.');
    if (!/^21[0-9]{6}$/.test(code) || !dongs.some(d => d.code === code)) return;
    try {
      const doc = await util.fetchJson(`data/national/reloc/office/${code}.json`);
      if (id !== requestId || code !== $('officeDong').value) return;
      distances = officeDistances(doc, code, dongs);
      transit = transitTimes(await util.fetchJson(`data/national/reloc/transit/${code}.json`, true), code);   // 참고 자료라 못 받아도 비교는 막지 않는다
      if (id !== requestId || code !== $('officeDong').value) return;
      distanceSnapshot = doc.snapshot_id;
      $('compareButton').disabled = false;
      $('resultStatus').textContent = '생활 조건을 고른 뒤 동네 비교를 눌러 주세요.';
      if (savedBasis !== undefined) {
        $('conditionStatus').textContent = `조건을 불러왔습니다. ${conditionBasisNote(savedBasis, distanceSnapshot)} 현재 공개 자료로 다시 비교해 주세요.`;
      }
    } catch (e) {
      if (id !== requestId) return;
      clearResults(e.message + ' 새로고침해 다시 시도해 주세요.');
      if (savedBasis !== undefined) $('conditionStatus').textContent = '조건을 불러왔습니다. 거리 자료를 대조하지 못했습니다.';
    }
  }
  $('officeDong').addEventListener('change', () => loadOfficeDistances());
  // 주거 지원 제도 표: 비교와 따로 바로 그린다. 오늘 날짜는 한국 시간 기준(접수 상태 계산용)
  util.fetchJson('data/housing_support.json', true).then(doc => {
    $('housingSupport').innerHTML = supportTable(doc, new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  });
  $('relocateForm').addEventListener('submit', e => {
    e.preventDefault(); render();
    if (compared) $('resultsTitle').scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  $('printButton').addEventListener('click', () => root.print());
  $('saveConditions').addEventListener('click', () => {
    if (!compared) return;
    const data = {
      format: CONDITION_FORMAT, office: $('officeDong').value, preset: presetIndex,
      housing: $('housingType').value, radius: $('radiusKm').value,
      weights: Object.fromEntries(CONDITION_FACTORS.map(f => [f.code, weights[f.code]])),
      basis: { rule: RULE, distance: distanceSnapshot },
    };
    root.RenewSave.saveFile('리뉴맵_정착비교_조건.json', [JSON.stringify(data, null, 2) + '\n'], 'application/json;charset=utf-8');
    $('conditionStatus').textContent = '비교 조건 파일 다운로드를 시작했습니다.';
  });
  $('conditionFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const id = ++conditionReadId;
    let condition;
    try {
      if (file.size <= 16384) condition = readConditions(JSON.parse(await file.text()));
    } catch { /* 검증을 통과한 조건만 아래에서 적용한다. */ }
    if (id !== conditionReadId) return;
    if (!condition || !dongs.some(d => d.code === condition.office)) {
      $('conditionStatus').textContent = '조건 파일을 열지 못했습니다. 리뉴맵에서 저장한 정착비교 조건 JSON을 골라 주세요.';
      return;
    }
    presetIndex = condition.preset;
    weights = condition.weights;
    adjusted = CONDITION_FACTORS.some(f => weights[f.code] !== PRESETS[presetIndex].weights[f.code]);
    showConditionWeights();
    $('housingType').value = condition.housing;
    $('radiusKm').value = condition.radius;
    $('officeQuery').value = '';
    officeOptions();
    $('officeDong').value = condition.office;
    loadOfficeDistances(condition.basis);
    $('conditionStatus').textContent = '조건을 불러왔습니다. 거리 자료를 대조하는 중입니다.';
  });
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
      const period = rentPeriod(reloc.rent); // 아래 수록 개월 수는 이 검증을 통과한 원장 값이다.
      rentMonths = { window: reloc.rent.months.length, ...Object.fromEntries(['APT', 'RH', 'OFFI'].map(t => [t, reloc.rent.by_type[t.toLowerCase()].available_months.length])) };
      const short = `유형별 전월세 중위값은 ${period.covered} 자료입니다.`;
      rentText = short + (period.partial ? ` 조회한 ${period.window} 가운데 나머지 달은 수록되지 않았습니다.` : '');
      $('rentPeriod').textContent = short;
      $('rentMethod').textContent = rentText;
      dongs = makeDongs(busan, [...documents, reloc]);
      officeOptions();
      for (const id of ['officeQuery', 'officeDong', 'conditionFile']) $(id).disabled = false;
    } catch (e) {
      $('dataStatus').textContent = `${e.message} 새로고침해 다시 시도해 주세요.`;
      $('resultStatus').textContent = '자료를 모두 불러온 뒤 비교할 수 있습니다.';
    }
  }
  load();
})(typeof window !== 'undefined' ? window : globalThis);
