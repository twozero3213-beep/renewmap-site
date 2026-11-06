// 부산 조례 제5조②2 나·다·라목 참고 계산(1365 트윈의 호수밀도·주택접도율·과소필지 분석을 흡수, 2026-11-07).
// 판정이 아니다: 규칙(BSN-ORD-2025.10)이 승인 전이고, 대장·토지특성으로는 조례 정의를 다 채우지 못해 값은 늘 범위(하한~상한)로 낸다.
// 화면의 '현장 확인' 상태는 바꾸지 않고, 그 옆에 범위와 빠진 것을 적는다. 기기 안에서만 계산한다.
// 정의(조례 제2조, 2018 전부개정 본문 2차 인용 — 현행 원문 대조 전):
//   8호 호수밀도 = 구역면적 1ha당 건축물 동수. 공동주택은 세대수가 가장 많은 층의 세대를 1동씩 센다(그 층 외 세대는 안 셈).
//   9호 주택접도율 = 폭 4m 이상 도로에 접한 건축물 수 ÷ 구역 안 건축물 수 × 100.
//   과소필지 = 건축법 제57조①의 분할제한면적 이하, 세장형 = 대지폭 3m 미만, 부정형.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ParcelRef = factory();
})(this, function () {
  "use strict";
  // 건축법 시행령 제80조 분할제한면적(㎡). 부산 건축 조례가 더 크게 정했는지는 확인 전이라 시행령 값만 쓴다
  const SPLIT_MIN = [["주거", 60], ["상업", 150], ["공업", 150], ["녹지", 200]];
  const SPLIT_OTHER = 60;
  const ROAD_SURE = /광대|중로|소로/;   // 8m 이상 도로에 접함 → 폭 4m 이상이 확실
  const ROAD_MAYBE = /세로[^(]*\(가\)/;  // 8m 미만, 차량 통행 가능. 4m 이상인지는 도로 폭을 봐야 안다 → 상한에만
  // 세로(불)은 차량이 못 다니는 길이라 4m 미만으로 센다 [해석]. 1365 트윈 부암동 결과(42.86%)도 이렇게 셀 때와 맞는다(39/92=42.4%)
  const ROAD_NONE = /세로[^(]*\(불\)|맹지/;
  const SHAPE_IRREG = /부정형/;
  const SHAPE_MAYBE = /삼각|자루/;      // 조례의 부정형에 드는지 정의가 없어 상한에만 넣는다

  const ha = (m2) => m2 / 10000;
  const pct = (n, d) => (d ? (n / d) * 100 : null);

  // 브이월드 토지특성 응답(vw-frame.js land) → PNU로 찾는 표. 저장하지 않고 이 계산에만 쓴다(약관 제19조)
  function fromRows(rows) {
    return new Map((rows || []).map((r) => [r.pnu, { area: r.area, road: r.road || "", shape: r.shape || "", zone: r.zone || "", dae: !!r.dae }]));
  }
  // 조회할 PNU 앞 15자리(법정동+산구분+본번). 같은 본번은 한 번에 묻는다
  const prefixes = (pnus) => [...new Set(pnus.filter((p) => /^\d{19}$/.test(p || "")).map((p) => p.slice(0, 15)))];
  const splitMin = (zone) => (SPLIT_MIN.find(([k]) => zone.includes(k)) || [null, SPLIT_OTHER])[1];

  // 나목: 하한은 공동주택을 1동으로, 상한은 공동주택 세대 전부를 동으로 센다(세대가 가장 많은 층의 세대수는 표제부에 없다).
  // 대장에 없는 기존무허가건축물(조례상 포함)은 셀 수 없어 하한도 실제보다 작을 수 있다
  function houseDensity(buildings, areaM2) {
    if (!(areaM2 > 0)) return null;
    let lo = 0, hi = 0;
    for (const b of buildings) {
      const apt = b.main_use === "공동주택";
      lo += 1;
      hi += apt && b.hhld > 1 ? b.hhld : 1;
    }
    return { lo: lo / ha(areaM2), hi: hi / ha(areaM2), n: buildings.length, area: areaM2, aptNoHhld: buildings.filter((b) => b.main_use === "공동주택" && !(b.hhld > 0)).length };
  }

  // 다목: 건물마다 대지의 도로접면. 하한은 8m 이상 도로 접면만, 상한은 세로(가)·자료 없음까지 접한 것으로 본다
  function roadFrontage(buildings, parcels) {
    let sure = 0, maybe = 0, none = 0, missing = 0;
    for (const b of buildings) {
      const p = b.pnu && parcels.get(b.pnu);
      if (!p || !p.road) { missing++; continue; }
      if (ROAD_SURE.test(p.road)) sure++;
      else if (ROAD_MAYBE.test(p.road)) maybe++;
      else if (ROAD_NONE.test(p.road)) none++;
      else missing++;
    }
    const n = buildings.length;
    return { lo: pct(sure, n), hi: pct(sure + maybe + missing, n), n, sure, maybe, none, missing };
  }

  // 라목: 목록의 지번 중 지목 '대' 필지. 하한은 분할제한면적 이하 또는 부정형, 상한은 삼각·자루형까지. 세장형(폭 3m 미만)은 폭 자료가 없어 못 센다
  function smallLots(pnus, parcels) {
    const seen = new Set();
    let n = 0, small = 0, irreg = 0, both = 0, maybe = 0;
    for (const id of pnus) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const p = parcels.get(id);
      if (!p || !p.dae) continue;   // 조례 라목은 '건축대지' 필지를 센다 → 지목 '대'만
      n++;
      const s = p.area !== null && p.area <= splitMin(p.zone), ir = SHAPE_IRREG.test(p.shape);
      if (s) small++;
      if (ir) irreg++;
      if (s && ir) both++;
      if (!s && !ir && SHAPE_MAYBE.test(p.shape)) maybe++;
    }
    const lo = small + irreg - both;
    return { lo: pct(lo, n), hi: pct(lo + maybe, n), n, small, irreg, maybe, notDae: seen.size - n };
  }

  const f1 = (v) => (v === null || v === undefined ? "-" : v.toFixed(1));
  function texts({ density, road, lots }) {
    return {
      density: density ? `${f1(density.lo)}~${f1(density.hi)}동/ha(건물 ${density.n}동, 면적 ${Math.round(density.area).toLocaleString("ko-KR")}㎡). 공동주택 세대층·기존무허가 미반영` : "구역 면적을 넣으면 범위를 계산합니다",
      road: road.n ? `${f1(road.lo)}~${f1(road.hi)}%(${road.n}동 중 8m 이상 도로 접면 ${road.sure}, 세로(가) ${road.maybe}, 세로(불)·맹지 ${road.none}, 자료 없음 ${road.missing}). 세로의 폭 4m 여부는 현장 확인` : "건물이 없습니다",
      lots: lots.n ? `${f1(lots.lo)}~${f1(lots.hi)}%(대지 ${lots.n}필지 중 분할제한면적 이하 ${lots.small}, 부정형 ${lots.irreg}, 삼각·자루형 ${lots.maybe}). 세장형(폭 3m 미만)은 도면 확인` : "목록에 지목 '대' 필지가 없습니다",
    };
  }

  return { fromRows, prefixes, splitMin, houseDensity, roadFrontage, smallLots, texts, SPLIT_MIN, SPLIT_OTHER };
});
