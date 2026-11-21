/* 쇠퇴 3요건(도시재생법 시행령 제17조)을 요건 단위로 본다(2026-11-13 v7).
   요건마다 길이 둘(가목·나목)이고, 한 길이라도 기준 해당이면 해당, 모든 길이 비해당이면 비해당, 그 밖은 확정 불가.
   backend/renewmap/export/dong_brief.py의 DECLINE_CRITERIA·DECLINE_REQS와 같은 규칙이다(그쪽 시험이 rules.decline과 대조한다).
   왜: 홈 카드·지도 카드가 30년 감소율 한 길만 보여, '3년 연속 감소'로 충족한 동은 머리의 'N개 해당'과 줄이 어긋났다(11-13 평가 6회차). */
(function (root) {
  'use strict';
  const REQS = [
    { key: 'pop', name: '인구 감소', paths: [['DECLINE_POP_DROP30Y_PCT', 'ge', 20, '30년 최대 대비 20% 이상 감소'], ['DECLINE_POP_DECL3IN5', 'eq', 1, '최근 5년 중 3년 연속 감소']] },
    { key: 'biz', name: '사업체 감소', paths: [['DECLINE_BIZ_DROP10Y_PCT', 'ge', 5, '10년 최대 대비 5% 이상 감소'], ['DECLINE_BIZ_DECL3IN5', 'eq', 1, '최근 5년 중 3년 연속 감소']] },
    { key: 'aging', name: '20년 이상 건축물', paths: [['DECLINE_AGING_20Y_PCT', 'ge', 50, '준공 20년 이상 건축물 50% 이상']] },
  ];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  // value(지표 코드) → 숫자 또는 null. 돌려주는 것: 요건마다 { key, name, status: 'over'|'in'|'none', via: 해당한 길(없으면 null), rate: 첫 길(감소율·비율) 값 }
  function evaluate(value) {
    return REQS.map((r) => {
      const res = r.paths.map(([code, op, thr, text]) => { const v = num(value(code)); return { code, text, v, hit: v === null ? null : op === 'ge' ? v >= thr : v === thr }; });
      const hit = res.find((p) => p.hit === true);
      return { key: r.key, name: r.name, status: hit ? 'over' : res.every((p) => p.hit === false) ? 'in' : 'none', via: hit || null, rate: res[0].v };
    });
  }
  // 원장 셀 → 셈에 쓸 값. 비공개이거나 상태가 미확정(추가확인·충돌·폐기)이면 null(dong_brief judge·docgen judge와 같다).
  // v9: 홈·지도 카드는 값만 보고 '기준 해당'이라 했는데 동 페이지·1쪽 문서는 '확정 불가'였다(박달동·호현동 노후 비율)
  const UNSETTLED = ['추가확인', '충돌', '폐기'];
  const cellValue = (c) => (!c || c.value_hidden_reason || UNSETTLED.includes(c.status) ? null : num(c.value));
  // 요건 충족 수(하한) 셀 → 'over' | 'in' | 'none'. 정해지지 않은 요건 수 = 3 − sample_n(없으면 3).
  // D1(2026-11-20 대표 승인): 하한 ≥ 2면 셀 상태가 미확정이어도 'over', 상한(하한 + 정해지지 않은 요건) < 2면 'in', 그 밖 'none'
  // (dong_brief judge_met_count·docgen judgeMetCount와 같다, met-count.test.cjs. v9: 지도는 1개면 바로 '기준 안'이라 523곳이 문서와 달랐다)
  function metStatus(c) {
    const v = !c || c.value_hidden_reason ? null : num(c.value);
    if (v === null) return 'none';
    if (v >= 2) return 'over';
    return v + (3 - (num(c.sample_n) ?? 0)) < 2 ? 'in' : 'none';
  }
  // 'over'인데 정해지지 않은 요건이 남았거나 셀이 미확정이면 화면에 '기준 해당(하한)'(docgen OVER_FLOOR와 같은 때)
  const metFloor = (c) => metStatus(c) === 'over' && ((num(c.sample_n) ?? 0) < 3 || UNSETTLED.includes(c.status));
  // r16 공통 사전: 결론 머리 한 벌(홈 카드·지도 카드·동 쪽이 같은 글). n = 확정된 기준 해당 요건 수(하한), m = 추가확인 요건 수.
  // state를 주면 그 판단(지도의 지난 해·check_years 규칙)을 따르고, 없으면 metStatus와 같은 규칙으로 정한다.
  // 왜: '1개 해당'이 탈락으로 읽혔다 → 추가확인이 남으면 언제나 '최소 n개 해당 · 추가확인 m개'
  const MIN_MET = 2;
  const MET_CHIP = { over: '기준 해당', floor: '기준 해당(하한)', in: '해당 안 함', none: '추가확인' };
  const MET_LAW = `도시재생활성화지역 지정 요건은 3요건 중 ${MIN_MET}개 이상입니다(「도시재생 활성화 및 지원에 관한 특별법」 제13조·같은 법 시행령 제17조).`;
  function metHead(n, m, state) {
    if (num(n) === null) return { state: 'none', chip: MET_CHIP.none, head: '쇠퇴 3요건 · 추가확인', plain: '세 가지 기준 모두 더 확인해야 합니다', sub: '자료가 모자라 아직 셀 수 없습니다.', least: false };
    const k = num(m) !== null && m > 0 ? m : 0;
    const st = state || (n >= MIN_MET ? (k ? 'floor' : 'over') : n + k < MIN_MET ? 'in' : 'none');
    const tail = st === 'none' ? (k ? `추가확인 ${k}개` : MET_CHIP.none) : st === 'in' && k ? `추가확인 ${k}개 · ${MET_CHIP.in}` : MET_CHIP[st];
    const least = !!k && st !== 'in';
    const sub = { over: `3요건 중 ${MIN_MET}개 이상입니다.`, floor: `확정된 요건만 세어도 ${MIN_MET}개 이상입니다.`,
      in: k ? `추가확인 ${k}개가 모두 해당해도 ${MIN_MET}개에 못 미칩니다.` : '', none: k ? `추가확인 ${k}개는 아직 정하지 못해 세지 않았습니다. 정해지면 더 늘 수 있습니다.` : '자료가 모자라 아직 정하지 못했습니다.' }[st];
    // r19(09 3절): 지도 화면 머리는 쉬운 문장(plain). head는 홈 카드·동 쪽이 쓰는 꼴 그대로 둔다
    const plain = least ? `세 가지 중 ${n}가지는 기준을 넘었고, ${k}가지는 더 확인해야 합니다` : `세 가지 중 ${n}가지가 기준을 넘었습니다`;
    return { state: st, chip: MET_CHIP[st], head: `쇠퇴 3요건 중 ${least ? '최소 ' : ''}${n}개 해당 · ${tail}`, plain, sub, least };
  }
  const api = { REQS, evaluate, cellValue, metStatus, metFloor, MIN_MET, MET_CHIP, MET_LAW, metHead };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DeclineReq = api;
})(typeof self !== 'undefined' ? self : this);
