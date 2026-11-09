/* 도시재생 사업 찾기: 사업 유형별 요건과, 한 동의 공식 자료를 그 요건에 맞대 보는 표.
   요건 문구는 아래 SOURCES의 공식 문서에서 옮겼다. 판정이 아니다. 행정동 값은 사업 구역 값이 아니므로 맞대 본 결과는 후보를 추리는 참고용이다.
   자료로 정할 수 없는 요건(활성화지역 고시, 면적, 저층 주거 비율, 빈집)은 항상 '확인 필요'로 둔다. */
(function (root) {
  'use strict';
  const SOURCES = {
    g2027: { name: '2027년 도시재생 신규사업 평가 가이드라인(국토교통부, 2026.9.)', url: 'https://www.krihs.re.kr/board.es?mid=a60504000000&bid=0077&list_no=398642&act=view' },
    n2026: { name: '국토교통부 도시재생 신규사업 공모 안내(2026.2.)', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148959125' },
    fund: { name: '행정안전부 지방소멸대응기금 안내', url: 'https://www.mois.go.kr/frt/sub/a06/b06/localextinctionFund/screen.do' },
  };
  const SCHEDULE = [['1차 사전컨설팅', '2026년 11월까지'], ['2차 사전컨설팅', '접수 전까지'], ['신청서 접수', '2026.12.28~12.30'], ['사업 평가', '2027년 1~3월'], ['결과 발표', '2027년 4월 이후']];
  const ZONE = { kind: 'human', t: '전략계획상 도시재생활성화지역(접수 마감일 기준)', how: '전략계획 고시에서 확인' };
  const LOWRISE = { kind: 'human', t: '저층 주거용 건축물이 전체의 3분의 2 이상', how: '구역 건축물대장으로 계산' };
  const OLD2 = { kind: 'oldDecline', t: '인구·사업체·노후 요건 중 노후 포함 2개 이상' };
  const REDEV = ['field/redev.html', '구역 요건 계산(부산)'];
  const PROGRAMS = [
    { id: 'special', name: '지역특화재생', owner: '국토교통부', aim: '역사·문화·산업 같은 지역 고유자산으로 도시 브랜드, 상권, 창업을 키웁니다.', money: '4년, 국비 최대 150억원', src: 'g2027', page: 27, needs: [ZONE], use: '지역 자산과 상권 변화를 동 단위로 보고 기초조사 표를 채웁니다.' },
    { id: 'recognize', name: '도시재생 인정사업', owner: '국토교통부', aim: '기반시설 설치·정비, 건축물 리모델링 같은 점 단위 소규모 사업을 빠르게 추진합니다.', money: '3년, 국비 최대 50억원', src: 'g2027', page: 43, needs: [{ kind: 'human', t: '전략계획 수립 지역이면서 활성화계획 미수립 지역', how: '전략계획 고시에서 확인' }, { kind: 'infraOrDecline', t: '기초생활인프라 국가적 최저기준 미달, 또는 쇠퇴요건 2개 이상' }, { kind: 'human', t: '사업 면적 10만㎡ 미만', how: '사업 구역으로 계산' }], use: '쇠퇴요건 값과 생활 시설 현황을 근거 문서로 묶습니다.' },
    { id: 'oldres', name: '노후주거지정비 일반정비형', owner: '국토교통부', aim: '노후 저층 주거지에 기반·편의시설을 공급하고 민간 주택정비를 지원합니다.', money: '5년, 국비 최대 150억원', src: 'g2027', page: 36, needs: [ZONE, LOWRISE, OLD2, { kind: 'human', t: '5만~10만㎡(권장)', how: '사업 구역으로 계산' }], tool: REDEV, use: '구역 건축물로 저층 주거·노후 요건을 계산합니다.' },
    { id: 'vacant', name: '노후주거지정비 빈집정비형', owner: '국토교통부', aim: '빈집이 밀집한 노후 저층 주거지의 정주환경을 개선합니다.', money: '4년, 국비 최대 50억원', src: 'g2027', page: 36, needs: [ZONE, LOWRISE, OLD2, { kind: 'human', t: '1만㎡ 미만 구역에 빈집 10호 이상 또는 빈집 면적 20% 이상, 다른 법령의 정비사업 없음', how: '빈집 실태조사로 확인' }, { kind: 'human', t: '5만㎡ 내외(권장)', how: '사업 구역으로 계산' }], tool: REDEV, use: '구역 건축물을 계산하고 현장 기록으로 빈집을 남깁니다.' },
    { id: 'innovation', name: '도시재생 혁신지구', owner: '국토교통부', aim: '쇠퇴지역에 주거·상업·복지·행정 기능을 모으고 산업과 기업을 유치합니다.', money: '5년, 국비 최대 250억원(2026 공고)', src: 'n2026', needs: [{ kind: 'human', t: '2027 신규사업 가이드라인 대상 3종에는 없음. 공고문의 요건 확인', how: '해당 연도 공고문으로 확인' }], use: '후보 지역의 쇠퇴·인구·상권 현황을 근거로 냅니다.' },
    { id: 'fund', name: '지방소멸대응기금', owner: '행정안전부', aim: '인구감소지역과 관심지역의 투자계획에 기금을 배분합니다.', money: '연 1조원 규모, 배분액은 평가에 따름', src: 'fund', needs: [{ kind: 'desig', t: '인구감소지역 또는 관심지역(시·군·구 지정)' }], use: '인구·고령·청년 변화 현황표를 만듭니다.' },
  ];
  // 2027 가이드라인 p.42 기반·편의시설 현황. 없는 자료는 없다고 적는다
  const SOC = [
    ['도로·접도율', '구역 내', null], ['주차장', '구역 내', null], ['무인택배함·쓰레기처리장', '구역 내', null], ['CCTV', '구역 내', 'CCTV_PER_KM2'],
    ['유치원', '구역 반경 500m', null], ['초등학교', '구역 반경 500m', 'ELEM_SCHOOL_NEAREST_M'], ['어린이집', '구역 반경 500m', null], ['노인복지시설', '구역 반경 500m', 'SENIOR_HALL_COUNT'],
    ['건강생활센터', '구역 반경 500m', null], ['도서관(공공·사립·작은)', '구역 반경 500m', 'LIB_NEAREST_M'], ['생활체육시설', '구역 반경 500m', null], ['생활권공원', '구역 반경 500m', 'PARK_COUNT'],
    ['문화예술회관·전시시설', '기초 지자체', null], ['경기장·체육관·수영장', '기초 지자체', null], ['거점공원', '기초 지자체', 'PARK_AREA_PER_CAPITA'], ['사회복지관·노인복지관', '기초 지자체', null],
    ['보건소', '기초 지자체', null], ['응급실 운영 의료기관', '기초 지자체', 'ER_NEAREST_M'],
  ];
  const STATE = { ok: '자료상 맞음', no: '자료상 안 맞음', check: '확인 필요' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => typeof v === 'number' && Number.isFinite(v);

  // rows: map.js dongRows 결과 → 사업 요건에 쓰는 값만
  function factsOf(rows) {
    const val = c => { const r = rows.find(x => x.ind.code === c); return r ? r.value : null; };
    const d = rows.find(x => x.ind.src === 'designations');
    return { met: val('DECLINE_MET_COUNT'), aging: val('DECLINE_AGING_20Y_PCT'), shortfall: val('STD_SHORTFALL_COUNT'), desig: d ? d.value : null };
  }
  function checkNeed(n, f) {
    if (n.kind === 'human') return { state: 'check', note: n.how };
    if (n.kind === 'infraOrDecline') {
      if (num(f.met) && f.met >= 2) return { state: 'ok', note: `쇠퇴요건 ${f.met}개(하한)` };
      return { state: 'check', note: `쇠퇴요건 ${num(f.met) ? f.met : '값 없음'}개(하한)${num(f.shortfall) ? `, 생활 기준 해당 ${f.shortfall}개(초안, 국가 최저기준 전체 아님)` : ''}` };
    }
    if (n.kind === 'oldDecline') {
      if (!num(f.aging)) return { state: 'check', note: '노후 건축물 값 없음' };
      const pct = `노후 건축물 ${Math.round(f.aging * 10) / 10}%`;
      if (f.aging < 50) return { state: 'no', note: `${pct}, 기준 50%` };
      return num(f.met) && f.met >= 2 ? { state: 'ok', note: `${pct}, 쇠퇴요건 ${f.met}개(하한)` } : { state: 'check', note: `${pct}, 쇠퇴요건 ${num(f.met) ? f.met : '값 없음'}개(하한)` };
    }
    if (n.kind === 'desig') {
      if (f.desig === '인구감소지역' || f.desig === '관심지역') return { state: 'ok', note: f.desig };
      if (f.desig === '미지정') return { state: 'no', note: '미지정' };
      return { state: 'check', note: f.desig || '지정 자료 없음' };
    }
    return { state: 'check', note: '' };
  }
  function checkProgram(p, f) {
    const needs = p.needs.map(n => ({ ...n, ...checkNeed(n, f) }));
    const ok = needs.filter(n => n.state === 'ok').length, blocked = needs.some(n => n.state === 'no');
    return { program: p, needs, ok, blocked, candidate: !blocked && ok > 0 };
  }
  const checkAll = f => PROGRAMS.map(p => checkProgram(p, f));

  const srcLine = p => `<a href="${esc(SOURCES[p.src].url)}" rel="noopener">${esc(SOURCES[p.src].name)}</a>${p.page ? ` p.${p.page}` : ''}`;
  const scheduleHTML = () => `<dl class="pg-sched">${SCHEDULE.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

  // 사업 목록 화면(programs.html)
  function listHTML(base) {
    return PROGRAMS.map(p => `<section class="pg-item" id="${esc(p.id)}"><h2>${esc(p.name)}</h2><p class="pg-meta">${esc(p.owner)}, ${esc(p.money)}</p><p>${esc(p.aim)}</p>` +
      `<h3>신청 요건</h3><ul>${p.needs.map(n => `<li>${esc(n.t)}</li>`).join('')}</ul><h3>리뉴맵에서 하는 일</h3><p>${esc(p.use)}</p>` +
      `<p class="pg-acts"><a class="btn ghost" href="${esc(base)}explore.html">동네로 맞춰 보기</a>${p.tool ? `<a class="btn ghost" href="${esc(base)}${esc(p.tool[0])}">${esc(p.tool[1])}</a>` : ''}</p><p class="pg-src">출처 ${srcLine(p)}</p></section>`).join('');
  }
  // 동 하나에 맞대 본 표(지도 화면 문서 칸)
  function dongHTML(name, rows) {
    const list = checkAll(factsOf(rows));
    return `<section class="pg-dong"><h3>${esc(name)}에 맞대 본 도시재생 사업</h3><p class="pg-warn">판정이 아닙니다. 행정동 자료로 맞대 본 참고이고, 실제 요건은 사업 구역 기준으로 다시 확인합니다.</p>` +
      list.map(c => `<div class="pg-card"><h4><a href="programs.html#${esc(c.program.id)}">${esc(c.program.name)}</a><small>${esc(c.program.money)}</small></h4><ul>${c.needs.map(n => `<li class="is-${n.state}"><b>${STATE[n.state]}</b><span>${esc(n.t)}${n.note ? `<small>${esc(n.note)}</small>` : ''}</span></li>`).join('')}</ul></div>`).join('') + `</section>`;
  }
  // 2027 가이드라인 기반·편의시설 현황표. value는 map.js가 지표 단위에 맞춰 만든 글자
  function socRows(rows, format) {
    return SOC.map(([item, scope, code]) => {
      const r = code ? rows.find(x => x.ind.code === code) : null, has = r && r.value !== null && r.value !== undefined;
      return { item, scope, label: r ? r.ind.label : '', value: has ? format(r) : '', source: has ? r.ind.source || '' : '', status: !code ? '자료 없음, 현장·대장 조사' : has ? '행정동 값, 구역 기준 재조사' : '값 없음' };
    });
  }
  function socHTML(rows, format) {
    const list = socRows(rows, format), have = list.filter(r => r.value).length;
    return `<section class="pg-dong"><h3>기반·편의시설 현황 초안</h3><p class="pg-warn">2027 가이드라인 p.42 항목 ${list.length}개 중 ${have}개에 행정동 값이 있습니다. 시설명과 위치, 구역 단위 조사는 담당자가 채웁니다.</p>` +
      `<p><button type="button" class="btn ghost" data-soc-csv>CSV 받기</button></p><div class="table-wrap" tabindex="0" role="region" aria-label="기반·편의시설 현황"><table><thead><tr><th scope="col">시설</th><th scope="col">조사 범위</th><th scope="col">행정동 값</th><th scope="col">상태</th></tr></thead><tbody>` +
      list.map(r => `<tr><th scope="row">${esc(r.item)}</th><td class="nw">${esc(r.scope)}</td><td>${r.value ? `${esc(r.label)} ${esc(r.value)}` : '–'}</td><td>${esc(r.status)}</td></tr>`).join('') + `</tbody></table></div></section>`;
  }
  function socCSV(name, rows, format) {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    return '﻿' + [['행정동', '시설', '조사 범위', '지표', '행정동 값', '출처', '상태'].map(q).join(','), ...socRows(rows, format).map(r => [name, r.item, r.scope, r.label, r.value, r.source, r.status].map(q).join(','))].join('\r\n');
  }

  const api = { PROGRAMS, SOURCES, SCHEDULE, SOC, factsOf, checkNeed, checkProgram, checkAll, scheduleHTML, listHTML, dongHTML, socRows, socHTML, socCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.RenewPrograms = api;
  const box = document.getElementById('programs');
  if (box) { box.innerHTML = listHTML(''); const s = document.getElementById('schedule'); if (s) s.innerHTML = scheduleHTML(); }
})(typeof window !== 'undefined' ? window : globalThis);
