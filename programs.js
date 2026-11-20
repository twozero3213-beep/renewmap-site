/* 재생 사업: 사업 유형별 요건과, 한 동의 공식 자료를 그 요건에 맞춰 보는 표.
   요건 문구는 아래 SOURCES의 공식 문서에서 옮겼다. 판정이 아니다. 행정동 값은 사업 구역 값이 아니므로 맞대 본 결과는 후보를 추리는 참고용이다.
   자료로 정할 수 없는 요건(활성화지역 고시, 면적, 저층 주거 비율, 빈집)은 항상 '확인 필요'로 둔다. */
(function (root) {
  'use strict';
  const SOURCES = {
    g2027: { name: '2027년 도시재생 신규사업 평가 가이드라인(국토교통부, 2026.9.)', url: 'https://www.krihs.re.kr/board.es?mid=a60504000000&bid=0077&list_no=398642&act=view' },
    n2026: { name: '국토교통부 도시재생 신규사업 공모 안내(2026.2.)', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148959125' },
    fund: { name: '행정안전부 지방소멸대응기금 평가·배분체계 개편(2026.4.)', url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148962676' },
    mss: { name: '중소벤처기업부 공고 제2026-199호 지역상권육성 사업', url: 'https://www.mss.go.kr/site/smba/ex/bbs/View.do?bcIdx=1066882&cbIdx=310&parentSeq=1066882' },
    industrial: { name: '국토교통부 2026년 노후 산업단지 재생사업 공모 보도자료(2026.10.27.)', url: 'https://www.korea.kr/briefing/pressReleaseView.do?newsId=156786578' },
    rural: { name: '농림축산식품부 농촌공간계획 활성화 방안(2025.2.)', url: 'https://www.mafra.go.kr/home/5109/subview.do' },
  };
  const SCHEDULE = [['1차 사전컨설팅', '2026년 11월까지'], ['2차 사전컨설팅', '접수 전까지'], ['신청서 접수', '2026.12.28~12.30'], ['사업 평가', '2027년 1~3월'], ['결과 발표', '2027년 4월 이후']];
  const ZONE = { kind: 'human', t: '전략계획상 도시재생활성화지역(접수 마감일 기준)', how: '전략계획 고시에서 확인' };
  const LOWRISE = { kind: 'human', t: '저층 주거용 건축물이 전체의 3분의 2 이상', how: '구역 건축물대장으로 계산' };
  const OLD2 = { kind: 'oldDecline', t: '인구·사업체·노후 요건 중 노후 포함 2개 이상' };
  const REDEV = ['field/redev.html', '구역 요건 계산(부산)'];
  const CORE = ['special', 'oldres', 'vacant', 'recognize'];   // 국토부 2027 도시재생 신규 공모 유형(compareHTML 주석)
  const PROGRAMS = [
    { id: 'special', name: '지역특화재생', owner: '국토교통부', aim: '역사·문화·산업 같은 지역 고유자산으로 도시 브랜드, 상권, 창업을 키웁니다.', money: '4년, 국비 최대 150억원', src: 'g2027', page: 27, needs: [ZONE], use: '지역 자산과 상권 변화를 동 단위로 보고 기초조사 표를 채웁니다.' },
    { id: 'recognize', name: '도시재생 인정사업', owner: '국토교통부', aim: '기반시설 설치·정비, 건축물 리모델링 같은 점 단위 소규모 사업을 빠르게 추진합니다.', money: '3년, 국비 최대 50억원', src: 'g2027', page: 44, needs: [{ kind: 'human', t: '전략계획 수립 지역이면서 활성화계획 미수립 지역', how: '전략계획 고시에서 확인' }, { kind: 'infraOrDecline', t: '기초생활인프라 국가적 최저기준 미달, 또는 쇠퇴요건 2개 이상' }, { kind: 'human', t: '사업 면적 10만㎡ 미만', how: '사업 구역으로 계산' }], use: '쇠퇴요건 값과 생활 시설 현황을 근거 문서로 묶습니다.' },
    { id: 'oldres', name: '노후주거지정비 일반정비형', owner: '국토교통부', aim: '노후 저층 주거지에 기반·편의시설을 공급하고 민간 주택정비를 지원합니다.', money: '5년, 국비 최대 150억원', src: 'g2027', page: 36, needs: [ZONE, LOWRISE, OLD2, { kind: 'human', t: '5만~10만㎡(권장)', how: '사업 구역으로 계산' }], tool: REDEV, use: '구역 건축물로 저층 주거·노후 요건을 계산합니다.' },
    { id: 'vacant', name: '노후주거지정비 빈집정비형', owner: '국토교통부', aim: '빈집이 밀집한 노후 저층 주거지의 정주환경을 개선합니다.', money: '4년, 국비 최대 50억원', src: 'g2027', page: 36, needs: [ZONE, LOWRISE, OLD2, { kind: 'human', t: '1만㎡ 미만 구역에 빈집 10호 이상 또는 빈집 면적 20% 이상, 다른 법령의 정비사업 없음', how: '빈집 실태조사로 확인' }, { kind: 'human', t: '5만㎡ 내외(권장)', how: '사업 구역으로 계산' }], tool: REDEV, use: '구역 건축물을 계산하고 현장 기록으로 빈집을 남깁니다.' },
    { id: 'innovation', name: '도시재생 혁신지구', owner: '국토교통부', aim: '쇠퇴지역에 주거·상업·복지·행정 기능을 모으고 산업과 기업을 유치합니다.', money: '5년, 국비 최대 250억원(2026 공고)', src: 'n2026', needs: [{ kind: 'human', t: '2027 신규사업 가이드라인 대상 3종에는 없음. 공고문의 요건 확인', how: '해당 연도 공고문으로 확인' }], use: '후보 지역의 쇠퇴·인구·상권 현황을 근거로 냅니다.' },
    { id: 'fund', name: '지방소멸대응기금', owner: '행정안전부', aim: '일자리, 주거, 돌봄처럼 인구 유입과 정주 여건을 바꾸는 투자계획에 기금을 배분합니다.<br>2027년 투자계획은 지방정부가 6~7월에 냈고, 다음 기회는 2028년 계획입니다.', money: '연 1조원 규모, 2027년부터 평가에 따라 평균의 최대 2배~2분의 1', src: 'fund', needs: [{ kind: 'desig', t: '인구감소지역 또는 관심지역(시·군·구 지정)' }], use: '인구·고령·청년 변화 현황표를 만듭니다.' },
    { id: 'shop', name: '지역상권 육성사업', owner: '중소벤처기업부', aim: '지역 자원을 살린 상권을 글로컬, 로컬테마, 유망골목 유형으로 키웁니다.<br>2026년 접수는 5월에 끝났고, 2030년까지 추가 선정 계획이 있습니다.', money: '2026 공고 1곳당 글로컬 최대 50억원, 로컬테마 최대 40억원, 유망골목 최대 5억원', src: 'mss', needs: [{ kind: 'human', t: '광역 지방정부가 신청, 지방정부·상인조직·상권기획자 컨소시엄', how: '해당 연도 공고문으로 확인' }, { kind: 'human', t: '글로컬·로컬테마는 서울 외, 유망골목은 로컬창업기업 집적지 또는 골목형상점가', how: '상권 지정 현황으로 확인' }, { kind: 'human', t: '로컬테마·유망골목은 신청 구역 상인 50% 이상 동의', how: '상인 동의서로 확인' }], use: '사업체 증감과 상가 업소 수로 후보 상권을 추립니다.' },
    { id: 'industrial', name: '노후 산업단지 재생사업', owner: '국토교통부', aim: '착공 후 20년이 지난 산업단지의 도로·주차장·공원·녹지 같은 기반시설을 정비하고 늘립니다.', money: '기반시설 정비·확충 비용의 50%, 국비 최대 500억원', src: 'industrial', needs: [{ kind: 'human', t: '착공 후 20년이 지난 산업단지(준공 후 20년 우대)', how: '산업단지 현황으로 확인' }, { kind: 'human', t: '지방정부가 제안서 제출(2026년 공모 11월 24일 마감, 3곳 선정)', how: '해당 연도 공모 공고로 확인' }], use: '산업단지 단위 판정은 아직 없습니다. 주변 동의 사업체 변화를 참고할 수 있습니다.' },
    { id: 'rural', name: '농촌공간 재구조화·재생 계획', owner: '농림축산식품부', aim: '농촌을 포함한 시·군이 10년 단위 기본계획으로 농촌재생활성화지역과 농촌특화지구를 정합니다.', money: '기본계획 수립 대상 139개 시·군, 농촌협약 통합지원 최대 400억원(2026년 확대 계획)', src: 'rural', needs: [{ kind: 'human', t: '농촌을 포함한 시·군(광역시의 군 포함)', how: '관할 구역으로 확인' }, { kind: 'human', t: '2027년부터 기본계획 수립을 전제로 농촌사업 지원', how: '해당 시·군 계획 상태로 확인' }], use: '읍·면 단위 인구와 생활시설 현황을 기초조사 표로 모읍니다. 농촌 전용 지표는 아직 없습니다.' },
  ];
  // 2027 가이드라인 p.42 기반·편의시설 현황. 없는 자료는 없다고 적는다
  const SOC = [
    ['도로·접도율', '구역 내', null], ['주차장', '구역 내', null], ['무인택배함·쓰레기처리장', '구역 내', null], ['CCTV', '구역 내', 'CCTV_PER_KM2'],
    // 2026-11-13: 유치원 거리 셀(KINDER_NEAREST_M, 부산만)이 생겨 연결
    ['유치원', '구역 반경 500m', 'KINDER_NEAREST_M'], ['초등학교', '구역 반경 500m', 'ELEM_SCHOOL_NEAREST_M'], ['어린이집', '구역 반경 500m', 'CHILDCARE_NEAREST_M'], ['노인복지시설', '구역 반경 500m', 'SENIOR_HALL_COUNT'],
    ['건강생활센터', '구역 반경 500m', null], ['도서관(공공·사립·작은)', '구역 반경 500m', 'LIB_NEAREST_M'], ['생활체육시설', '구역 반경 500m', null], ['생활권공원', '구역 반경 500m', 'PARK_COUNT'],
    ['문화예술회관·전시시설', '기초 지자체', null], ['경기장·체육관·수영장', '기초 지자체', null], ['거점공원', '기초 지자체', 'PARK_AREA_PER_CAPITA'], ['사회복지관·노인복지관', '기초 지자체', null],
    ['보건소', '기초 지자체', 'HEALTH_CENTER_NEAREST_M'], ['응급실 운영 의료기관', '기초 지자체', 'ER_NEAREST_M'],
  ];
  const STATE = { ok: '자료상 맞음', no: '자료상 안 맞음', check: '확인 필요' };
  const { esc, isNum: num, fmt2, csvCell } = typeof module === 'object' && module.exports ? require('./util.js') : root.RenewUtil;

  // rows: map.js dongRows 결과 → 사업 요건에 쓰는 값만
  function factsOf(rows) {
    const val = c => { const r = rows.find(x => x.ind.code === c); return r ? r.value : null; };
    const d = rows.find(x => x.ind.src === 'designations');
    return { met: val('DECLINE_MET_COUNT'), aging: val('DECLINE_AGING_20Y_PCT'), shortfall: val('STD_SHORTFALL_COUNT'), desig: d ? d.value : null };
  }
  // 미확정 셀은 확정 낱말로 나가지 않는다. decline-req.js·docgen.js와 같은 목록, 1쪽 요약과 같은 낱말 '확정 불가'
  const UNSETTLED = ['추가확인', '충돌', '폐기'];
  const metTxt = f => (num(f.met) ? `${f.met}개` : f.metHeld ? '확정 불가' : '값 없음');
  // 사업 판정에 쓰는 값: 그 해 충족 수·노후 셀이 미확정(셀 상태, 지난 해는 check_years)이면 값이 있어도 판정에 쓰지 않는다.
  // 지도 머리(추가확인)·1쪽(확정 불가)과 같은 규칙. 3차 검증: 사직동처럼 충족 수 하한 2·추가확인인 동이 비교표에서만 '자료상 맞음'이었다
  function settledFacts(rows, dong, unsettled) {
    const f = factsOf(rows);
    const isHeld = unsettled || (code => { const r = rows.find(x => x.ind.code === code); if (r && r.cell) return UNSETTLED.includes(r.cell.status); return !!r && num(r.year) && ((((dong || {}).check_years || {})[code]) || []).includes(r.year); });
    const metHeld = isHeld('DECLINE_MET_COUNT'), agingHeld = isHeld('DECLINE_AGING_20Y_PCT');
    return { ...f, met: metHeld ? null : f.met, aging: agingHeld ? null : f.aging, metHeld, agingHeld };
  }
  function checkNeed(n, f) {
    if (n.kind === 'human') return { state: 'check', note: n.how };
    if (n.kind === 'infraOrDecline') {
      if (num(f.met) && f.met >= 2) return { state: 'ok', note: `쇠퇴요건 ${f.met}개(하한)` };
      return { state: 'check', note: `쇠퇴요건 ${metTxt(f)}(하한)${num(f.shortfall) ? `, 생활 기준 해당 ${f.shortfall}개(초안, 국가 최저기준 전체 아님)` : ''}` };
    }
    if (n.kind === 'oldDecline') {
      if (!num(f.aging)) return { state: 'check', note: `노후 건축물 ${f.agingHeld ? '확정 불가' : '값 없음'}` };
      const pct = `노후 건축물 ${Math.round(f.aging * 10) / 10}%`;
      if (f.aging < 50) return { state: 'no', note: `${pct}, 기준 50%` };
      return num(f.met) && f.met >= 2 ? { state: 'ok', note: `${pct}, 쇠퇴요건 ${f.met}개(하한)` } : { state: 'check', note: `${pct}, 쇠퇴요건 ${metTxt(f)}(하한)` };
    }
    if (n.kind === 'desig') {
      // 고시의 공식 이름으로 적고, 인구활력+지역은 종전 지정의 지원이 유지되는 분류(고시 부칙 제3조)라 기금 대상으로 본다
      // (v9 2차: 송림2동이 '확인 필요 · 인구활력+'로만 나왔다)
      if (f.desig === '인구감소지역') return { state: 'ok', note: '인구감소지역' };
      if (f.desig === '관심지역') return { state: 'ok', note: '인구감소관심지역' };
      if (f.desig === '인구활력+') return { state: 'ok', note: '인구활력+지역(종전 지정의 지원 유지, 고시 부칙 제3조)' };
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
  // 2026-11-19: 비교 표와 그 아래 목록이 같은 사업을 두 번 적어 쪽이 3,245px(휴대폰 6,706px)였다 → 목록 하나.
  //     넓은 화면은 왼쪽 목록(이름·맡는 곳·지원 규모)과 오른쪽 상세(요건·목적·하는 일·출처), 휴대폰은 사업마다 펼치기. 요건 줄과 출처는 한 번씩만 나온다.
  //     2026-11-13 우지예 확인: 국토부 2027 도시재생 신규 공모는 3개 유형(지역특화재생·노후주거지정비(일반·빈집)·인정사업)이라 두 묶음으로 나눈다
  function listHTML(base) {
    const line = s => esc(s).replace(/&lt;br&gt;/g, ' ');
    const item = p => { const id = esc(p.id); return `<h3 class="pgx-head" id="${id}"><button type="button" id="pgxb-${id}" aria-expanded="false" aria-controls="pgxd-${id}"><span class="pgx-name">${esc(p.name)}</span><span class="pgx-meta">${esc(p.owner)} · ${esc(p.money)}</span></button></h3>` +
      `<div class="pgx-body" id="pgxd-${id}" role="region" aria-labelledby="pgxb-${id}" hidden><p class="pgx-title" aria-hidden="true">${esc(p.name)}</p>` +
      `<h4>신청 요건 <small>공식 문서 옮김</small></h4><ul>${p.needs.map(n => `<li>${esc(n.t)}</li>`).join('')}</ul>` +
      `<dl><div><dt>목적</dt><dd>${line(p.aim)}</dd></div><div><dt>리뉴맵에서 하는 일</dt><dd>${line(p.use)}${p.tool ? ` <a href="${esc(base)}${esc(p.tool[0])}">${esc(p.tool[1])}</a>` : ''}</dd></div>` +
      `<div><dt>출처</dt><dd class="pg-src">${srcLine(p)}</dd></div></dl></div>`; };
    const core = PROGRAMS.filter(p => CORE.includes(p.id)), rest = PROGRAMS.filter(p => !CORE.includes(p.id));
    const group = (t, sub, list) => `<h2 class="pgx-group">${esc(t)}<small>${esc(sub)}</small></h2>${list.map(item).join('')}`;
    return group(`도시재생 공모 ${core.length}종`, '국토교통부 2027년 도시재생 신규 공모. 3개 유형(노후주거지정비는 일반정비형·빈집정비형 2가지). 국토교통부 2026-09-11 공고, 연말까지 접수', core) +
      group(`함께 볼 사업 ${rest.length}종`, '도시재생 신규 공모와 따로 신청합니다. 맡는 곳·시기가 사업마다 다릅니다', rest);
  }
  // 넓은 화면은 상세가 늘 하나 열려 있다(오른쪽 칸이 비지 않게). 휴대폰은 사업마다 따로 펼치고 접는다. 주소 #사업id(지도 문서 칸 링크)는 그 사업을 연다
  function initList(box, win) {
    const heads = [...box.querySelectorAll('.pgx-head button')], wide = win.matchMedia('(min-width: 1024px)');
    const isOn = b => b.getAttribute('aria-expanded') === 'true';
    const set = (b, on) => { b.setAttribute('aria-expanded', String(on)); box.querySelector('#' + b.getAttribute('aria-controls')).hidden = !on; };
    const only = b => heads.forEach(x => set(x, x === b));
    const sync = () => { if (wide.matches) only(heads.find(isOn) || heads[0]); };
    const fromHash = () => { const b = heads.find(x => '#' + x.parentElement.id === win.location.hash); if (b) { if (wide.matches) only(b); else set(b, true); } };
    heads.forEach(b => b.addEventListener('click', () => (wide.matches ? only(b) : set(b, !isOn(b)))));
    fromHash(); sync();
    wide.addEventListener('change', sync);
    win.addEventListener('hashchange', fromHash);
  }
  // '목록에서 고르기'(home.js initPick이 만든 시·도·구·동 칸)는 글자 단추로 연다. 찾기 칸 하나가 첫 행동이다
  function initPickToggle(doc) {
    const form = doc.getElementById('homeSearch'), t = form && form.querySelector('.pgx-pick-toggle'), row = form && form.querySelector('.pick-row');
    if (!t || !row) return;
    row.id = 'pgxPick'; t.setAttribute('aria-controls', row.id); t.hidden = false;
    t.addEventListener('click', () => {
      if (!row.isConnected) { t.hidden = true; return; }   // 목록을 못 받으면 home.js가 칸을 지운다
      const on = !form.classList.contains('is-pick');
      form.classList.toggle('is-pick', on); t.setAttribute('aria-expanded', String(on));
      if (on) row.querySelector('select').focus();
    });
  }
  // 동 하나에 맞대 본 표(지도 화면 문서 칸)
  // 사업마다 한 줄 결론(v9 2차 마을기업 대표: '확인 필요'가 18번 나와 받을 수 있는 사업이 무엇인지 답을 못 얻었다)
  function verdictOf(c) {
    const nCheck = c.needs.filter(n => n.state === 'check').length;
    if (c.blocked) return { cls: 'no', text: '자료로 보면 맞지 않는 요건이 있습니다. 다른 길(구역 조정 등)이 있는지 구청에 물어보세요.' };
    if (c.candidate) return { cls: 'ok', text: `자료로 맞는 요건 ${c.ok}개${nCheck ? `, 구청 확인이 필요한 요건 ${nCheck}개` : ''}. 해볼 만한 후보입니다.` };
    return { cls: 'check', text: '자료만으로는 정할 수 있는 요건이 없습니다. 구청에 공고 요건을 물어보세요.' };
  }
  function dongHTML(name, rows, dong) {
    const list = checkAll(settledFacts(rows, dong)), vs = list.map(verdictOf), nOk = vs.filter(v => v.cls === 'ok').length, nNo = vs.filter(v => v.cls === 'no').length;
    return `<section class="pg-dong"><h3>${esc(name)} 사업 요건 대조</h3>` +
      `<p class="pg-sum">해볼 만한 후보 <b>${nOk}개</b> · 구청 확인이 필요한 사업 ${list.length - nOk - nNo}개 · 맞지 않는 요건이 있는 사업 ${nNo}개<br><small>물어볼 곳: 시·군·구 도시재생 담당 부서, 도시재생지원센터. 행정동 자료로 맞대 본 참고라 실제 요건은 사업 구역 기준으로 다시 확인합니다.</small></p>` +
      list.map((c, i) => `<div class="pg-card"><h4><a href="programs.html#${esc(c.program.id)}">${esc(c.program.name)}</a><small>${esc(c.program.money)}</small></h4><p class="pg-verdict is-${vs[i].cls}">${esc(vs[i].text)}</p><ul>${c.needs.map(n => `<li class="is-${n.state}"><b>${STATE[n.state]}</b><span>${esc(n.t)}${n.note ? `<small>${esc(n.note)}</small>` : ''}</span></li>`).join('')}</ul></div>`).join('') + `</section>`;
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
      `<p class="pg-acts"><button type="button" class="btn ghost" data-soc-csv>CSV 받기</button><a class="btn ghost" href="field/redev.html">구역을 그려 시설 세기(부산)</a></p><div class="table-wrap" tabindex="0" role="region" aria-label="기반·편의시설 현황"><table><thead><tr><th scope="col">시설</th><th scope="col">조사 범위</th><th scope="col">행정동 값</th><th scope="col">상태</th></tr></thead><tbody>` +
      list.map(r => `<tr><th scope="row">${esc(r.item)}</th><td class="nw">${esc(r.scope)}</td><td>${r.value ? `${esc(r.label)} ${esc(r.value)}` : '–'}</td><td>${esc(r.status)}</td></tr>`).join('') + `</tbody></table></div></section>`;
  }
  function socCSV(name, rows, format) {
    const q = csvCell;   // 행정동·출처·시설 칸은 외부 공공데이터에서 온다: '='로 시작하면 엑셀이 식으로 읽는다(CQ-07)
    return '﻿' + [['행정동', '시설', '조사 범위', '지표', '행정동 값', '출처', '상태'].map(q).join(','), ...socRows(rows, format).map(r => [name, r.item, r.scope, r.label, r.value, r.source, r.status].map(q).join(','))].join('\r\n');
  }

  // 시·군·구 안 동을 나란히(코드 순, 순위·배분 아님). 자료로 갈리는 요건만 칸으로 둔다
  // 표가 쓰는 셀의 지표 코드. 순서가 열 순서다(머리 기준연도·표 아래 각주·CSV 출처 열이 모두 같은 셀을 본다)
  const DIST_CODES = ['DECLINE_MET_COUNT', 'DECLINE_AGING_20Y_PCT', 'DECLINE_BIZ_DROP10Y_PCT', 'DECLINE_BIZ_DECL3IN5', 'DECLINE_POP_DROP30Y_PCT', 'DECLINE_POP_DECL3IN5'];
  const cellIn = (it, code) => { const r = it.rows.find(x => x.ind.code === code); return (r && r.cell) || (it.cells || []).find(c => c && c.indicator_code === code) || null; };
  function districtRows(items) {
    return items.map(it => {
      // 표의 해는 머리(충족 수) 줄의 해다. 셀(최신 해)은 그 해일 때만 쓰고, 지난 해는 그 해 줄·시계열과 check_years(원장이 그 해 정하지 못한 길)를 본다.
      // 3차 검증: 셀이 비었는데 지도 줄의 지난 해 값(2014년 13.05%)이 '(2025)' 머리 아래 나왔고, 연도 막대를 지난 해로 두면 2025 셀 값·상태가 섞였다
      const { name, rows } = it, f = factsOf(rows), hy = (rows.find(x => x.ind.code === 'DECLINE_MET_COUNT') || {}).year;
      const cellAt = c => { const x = cellIn(it, c); return x && (!num(hy) || x.base_year === hy) ? x : null; };
      const held = c => num(hy) && (((it.check_years || {})[c]) || []).includes(hy);
      const atYear = c => { const p = (((it.series || {})[c]) || []).find(q => q[0] === hy); return p && num(p[1]) ? p[1] : null; };
      const val = c => { const x = cellAt(c); if (x) return num(x.value) && !x.value_hidden_reason ? x.value : null; if (held(c)) return null; const r = rows.find(y => y.ind.code === c); return r && (!num(hy) || !num(r.year) || r.year === hy) ? r.value : null; };
      const flag = c => { const x = cellAt(c); if (x) return num(x.value) && !x.value_hidden_reason ? x.value : null; return held(c) || !num(hy) ? null : atYear(c); };
      const unset = c => { const x = cellAt(c); return x ? UNSETTLED.includes(x.status) : held(c); }, g = settledFacts(rows, it, unset);
      const state = (id, kind) => checkNeed(PROGRAMS.find(p => p.id === id).needs.find(n => n.kind === kind), g).state;
      return { name, year: num(hy) ? hy : null, met: f.met, aging: f.aging, biz: val('DECLINE_BIZ_DROP10Y_PCT'), bizDecl: flag('DECLINE_BIZ_DECL3IN5'), pop: val('DECLINE_POP_DROP30Y_PCT'), popDecl: flag('DECLINE_POP_DECL3IN5'), shortfall: f.shortfall,
        recognize: state('recognize', 'infraOrDecline'), oldres: state('oldres', 'oldDecline'), cells: DIST_CODES.map(cellAt), held: DIST_CODES.map(held) };
    });
  }
  // 소수 둘째 자리까지는 1쪽 요약과 같은 fmt2(2026-11-18: 표는 86.4%, 1쪽은 86.36%로 달랐다)
  const pct = v => (num(v) ? `${fmt2(v)}%` : '–'), cnt = v => (num(v) ? `${v}개` : '–'), yes = v => (v === 1 ? '해당' : v === 0 ? '아님' : '–');
  // 머리에 기준연도를 붙인다: 열의 셀 중 처음 만나는 base_year(셀마다 기준이 같은 한 해)
  const baseOf = (list, i) => { const c = list.map(r => r.cells[i]).find(x => x && x.base_year != null), y = list.map(r => r.year).find(num); return c ? `(${c.base_year})` : y ? `(${y})` : ''; };   // 셀이 없는 지난 해는 표의 해
  const districtHead = (list, unit) => ['읍·면·동', '쇠퇴요건(하한)', `노후 건축물${baseOf(list, 1)}${unit}`, `사업체 10년 최대 대비 감소율${baseOf(list, 2)}${unit}`, '사업체 최근 5년 중 3년 연속 감소', `인구 30년 최대 대비 감소율${baseOf(list, 4)}${unit}`, '인구 최근 5년 중 3년 연속 감소',
    '생활 기준 해당(초안)', '인정사업 쇠퇴·기반 요건', '노후주거지 쇠퇴 요건'];
  const unsetOf = (r, i) => { const c = r.cells[i]; return c && UNSETTLED.includes(c.status) ? c.status : r.held && r.held[i] ? '추가확인' : ''; };   // i: DIST_CODES 순번. 지난 해는 check_years
  const withSt = (text, st) => (st ? `${text} (${st})` : text), flagTxt = (v, st) => (st ? '확정 불가' : yes(v));
  // 표 머리의 해(첫 셀의 해, 셀이 없으면 표의 해). 행의 해가 다르면(폐지·개편 동: 시계열이 2022~2024에 끝남) 동 이름에 그 해를 붙인다(3차 검증)
  const headYear = list => { const c = list.map(r => r.cells.find(Boolean)).find(Boolean); return c ? c.base_year : list.map(r => r.year).find(num); };
  const nameOf = (r, hy) => (num(r.year) && num(hy) && r.year !== hy ? `${r.name}(${r.year}년)` : r.name);
  const districtCells = (r, hy) => [nameOf(r, hy), withSt(cnt(r.met), unsetOf(r, 0)), withSt(pct(r.aging), unsetOf(r, 1)), withSt(pct(r.biz), unsetOf(r, 2)), flagTxt(r.bizDecl, unsetOf(r, 3)), withSt(pct(r.pop), unsetOf(r, 4)), flagTxt(r.popDecl, unsetOf(r, 5)), cnt(r.shortfall), STATE[r.recognize], STATE[r.oldres]];
  // 사업체 수는 공표가 한 해 늦다: 각주에 자료연도를 달려고 docgen.js(buildBrief)와 같은 규칙으로 {last, ref}를 만든다. series가 없으면 null
  function bizYears(items) {
    for (const it of items) {
      const c = cellIn(it, 'DECLINE_BIZ_DROP10Y_PCT'), ref = +String((c && c.reference_date) || '').slice(0, 4);
      const last = Math.max(0, ...(((it.series || {}).DECLINE_BIZ_TOTAL) || []).filter(p => p[1] !== null && p[1] !== undefined).map(p => p[0]));
      if (c && !c.value_hidden_reason && last && last < ref) return { last, ref };
    }
    return null;
  }
  // DG(docgen)가 있으면 열 머리에 출처 번호 [n]을 달고 표 아래에 1쪽 요약과 같은 출처·기준일 각주를 단다
  function districtHTML(place, items, DG) {
    const list = districtRows(items), src = DG && DG.Sources ? new DG.Sources() : null, head = districtHead(list, '').map((h, i) => {
      const c = i >= 1 && i <= 6 ? list.map(r => r.cells[i - 1]).find(Boolean) : null;   // 머리 1~6열이 DIST_CODES 0~5와 짝이다
      return h + (src && c ? src.ref(c) : '');
    });
    const biz = bizYears(items), hy = headYear(list), noCells = !list.some(r => r.cells.some(Boolean));
    // 지난 해 표는 원장 셀이 없다(공개 셀은 최신 해만). 출처를 비워 두지 않고 값이 어디서 왔는지 한 줄로 밝힌다
    const foot = src && src.list.length ? `<p class="pg-foot">${src.list.map((s, n) => esc(DG.sourceLine(n + 1, s, biz))).join('<br>')}</p>`
      : src && noCells && num(hy) ? `<p class="pg-foot">${esc(`${hy}년 값은 동 시계열에서 옮겼습니다. 원장 셀(출처·기준일·셀 번호)은 최신 해만 공개하므로 출처 각주는 최신 해 표에 있습니다.`)}</p>` : '';
    return `<section class="pg-dong"><h3>${esc(place)} 동별 사업 요건 비교</h3><p class="pg-warn">동을 행정동 코드 순으로 나란히 둔 표입니다. 순위나 사업 배분 추천이 아닙니다.<br>활성화지역, 면적, 저층 주거 비율은 동 자료로 정할 수 없어 각 사업 구역에서 확인합니다.</p>` +
      `<p class="pg-acts"><button type="button" class="btn ghost" data-district-csv>CSV 받기</button></p><div class="table-wrap" tabindex="0" role="region" aria-label="동별 사업 요건 비교"><table><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
      list.map(r => { const c = districtCells(r, hy); return `<tr><th scope="row">${esc(c[0])}</th>${c.slice(1).map(x => `<td class="nw">${esc(x)}</td>`).join('')}</tr>`; }).join('') + `</tbody></table></div>${foot}</section>`;
  }
  // CSV: 값은 % 기호 없는 숫자(머리에 단위)로, 뒤에 이 행의 값이 나온 셀의 기준일·출처·셀 번호를 둔다
  function districtCSV(items) {
    const q = csvCell, list = districtRows(items), uniq = a => [...new Set(a.filter(Boolean))].join('; ');
    const num2 = v => (num(v) ? fmt2(v) : ''), flag = (v, st) => (st ? '확정 불가' : v === 1 ? '해당' : v === 0 ? '아님' : '');
    const h = districtHead(list, '(%)');   // 값 열 바로 뒤에 원장 status 열
    const head = [h[0], h[1], '쇠퇴요건 상태', h[2], '노후 건축물 상태', h[3], '사업체 감소율 상태', h[4], '사업체 3년 연속 감소 상태', h[5], '인구 감소율 상태', h[6], '인구 3년 연속 감소 상태', ...h.slice(7), '기준일', '출처', '셀 번호'];
    const stat = (r, i) => (r.cells[i] && r.cells[i].status) || (r.held && r.held[i] ? '추가확인' : '');
    const hy = headYear(list);
    return '﻿' + [head.map(q).join(','), ...list.map(r => {
      const cs = r.cells.filter(Boolean), c = districtCells(r, hy);
      const from = cs.length ? uniq(cs.map(x => x.source_name)) : num(r.year) ? `동 시계열 ${r.year}년(원장 셀은 최신 해만 공개)` : '';
      return [c[0], num(r.met) ? r.met : '', stat(r, 0), num2(r.aging), stat(r, 1), num2(r.biz), stat(r, 2), flag(r.bizDecl, unsetOf(r, 3)), stat(r, 3), num2(r.pop), stat(r, 4), flag(r.popDecl, unsetOf(r, 5)), stat(r, 5), num(r.shortfall) ? r.shortfall : '', c[8], c[9], uniq(cs.map(x => x.reference_date)), from, uniq(cs.map(x => x.cell_id))].map(q).join(',');
    })].join('\r\n');
  }
  const api = { districtRows, districtHTML, districtCSV, PROGRAMS, SOURCES, SCHEDULE, SOC, factsOf, checkNeed, checkProgram, checkAll, scheduleHTML, listHTML, dongHTML, socRows, socHTML, socCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.RenewPrograms = api;
  const box = document.getElementById('programs');
  if (box) {
    box.innerHTML = listHTML(''); initList(box, root); initPickToggle(document);
    const s = document.getElementById('schedule'); if (s) s.innerHTML = scheduleHTML();
  }
})(typeof window !== 'undefined' ? window : globalThis);
