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
  // 요건 충족 수(하한) 셀 → 'over' | 'in' | 'none'. 정해지지 않은 요건(3 − sample_n)을 모두 해당으로 쳐도 2개에 못 미칠 때만 'in'
  // (dong_brief judge_met_count·docgen judgeMetCount와 같다. v9: 지도는 1개면 바로 '기준 안'이라 523곳이 문서와 달랐다)
  function metStatus(c) {
    const v = cellValue(c);
    if (v === null) return 'none';
    if (v >= 2) return 'over';
    return v + (3 - (num(c.sample_n) ?? 0)) >= 2 ? 'none' : 'in';
  }
  const api = { REQS, evaluate, cellValue, metStatus };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DeclineReq = api;
})(typeof self !== 'undefined' ? self : this);
