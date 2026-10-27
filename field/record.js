// 현장 확인 기록 한 건을 만들고 검증한다. 화면·저장소와 무관한 순수 함수라 node --test로 검사한다.
// 원장 확인 상태(backend/renewmap/ledger/cell.py Status)의 현장 입력 3종만 쓴다. 모르면 '추가확인'(CLAUDE.md 원칙 4).
// 위치만으로 저장할 수 있다(2026-10-27 현장 확인 근거 1쪽). 지번·PNU가 없으면 '지번 미확인'으로 남기고 원장에는 잇지 않는다.
(function (root) {
  "use strict";
  const STATUSES = ["확인", "충돌", "추가확인"];
  // 화면에서는 쉬운 말로 보인다. 저장값은 원장 상태 그대로다(redesign 7장 6).
  const STATUS_LABEL = { 확인: "자료와 같음", 충돌: "자료와 다름", 추가확인: "모름" };
  // 대조 항목(선택). 숫자 판정은 하지 않고 본 것만 적는다.
  const ITEMS = ["사용승인일", "주용도", "층수", "연면적", "세대수", "공실·폐가 여부(관찰)", "기타"];
  // 무엇을 봤나(대상 유형). 고정 목록(expert_panel 9-1 4단계)
  const TARGETS = ["보도", "계단", "옹벽·축대", "공원", "빈 건물 외관", "보안등", "기타"];
  const NO_PARCEL = "지번 미확인";
  const GOAL = 30; // 90일 계획의 현장 확인 목표 건수
  const MAX_PHOTOS = 5; // 한 기록에 붙이는 사진 수(기기 저장 공간·내보내기 크기 때문)
  // 소유자·거주자 개인정보는 저장하지 않는다(CLAUDE.md 3장). 메모에 전화번호·주민등록번호 꼴이 있으면 거부한다.
  const PERSONAL = [/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/, /\b\d{6}[-\s]?[1-4]\d{6}\b/];

  function clean(v) { return String(v == null ? "" : v).trim(); }
  const num = (v) => (v == null || v === "" ? null : Number(v));

  function makeRecord(input, now, id) {
    const status = clean(input.status) || "추가확인";
    if (!STATUSES.includes(status)) throw new Error("확인 상태는 확인·충돌·추가확인 중 하나여야 합니다.");
    const item = clean(input.item);
    if (item && !ITEMS.includes(item)) throw new Error("대조 항목을 목록에서 골라 주세요.");
    if (status !== "추가확인" && !item) throw new Error("무엇을 자료와 비교했는지 대조 항목을 골라 주세요.");
    const target = clean(input.target) || "기타";
    if (!TARGETS.includes(target)) throw new Error("무엇을 봤는지 목록에서 골라 주세요.");
    const pnu = clean(input.pnu);
    const jibun = clean(input.jibun);
    if (pnu && !/^\d{19}$/.test(pnu)) throw new Error("필지 번호(PNU)는 19자리 숫자입니다.");
    const lat = num(input.lat), lng = num(input.lng);
    if ((lat === null) !== (lng === null) || [lat, lng].some((x) => x !== null && !Number.isFinite(x))) throw new Error("위치는 위도·경도를 함께 적습니다.");
    if (lat === null && !pnu && !jibun) throw new Error("위치를 켜거나 지번을 적어 주세요.");
    const observed = clean(input.observed);
    if (status !== "추가확인" && !observed) throw new Error("본 값을 적어 주세요.\n모르면 '모름'을 고르세요.");
    const memo = clean(input.memo);
    if (PERSONAL.some((re) => re.test(memo) || re.test(observed))) throw new Error("전화번호나 주민등록번호처럼 보이는 숫자가 있습니다.\n지우고 다시 저장해 주세요.");
    // 사진은 기록과 따로 저장하고 기록에는 id만 둔다. 얼굴·차량번호·소유자 정보가 없거나 가렸다는 확인 없이는 붙이지 않는다
    const photos = Array.isArray(input.photos) ? input.photos.map(clean).filter(Boolean) : [];
    if (photos.length > MAX_PHOTOS) throw new Error(`사진은 한 기록에 ${MAX_PHOTOS}장까지 붙일 수 있습니다.`);
    if (photos.length && input.photoSafe !== true) throw new Error("사진을 붙이기 전에 '가릴 곳을 모두 확인했습니다'를 눌러 주세요.");
    const accuracy = lat === null ? null : num(input.accuracy);
    // 손으로 옮긴 위치는 '보정됨'으로 남기고 기기가 처음 준 좌표를 함께 둔다(바꾼 이력을 지우지 않는다)
    const corrected = lat !== null && input.corrected === true;
    const g = input.gps || {};
    const dong = input.dong && /^\d{8}$/.test(clean(input.dong.code)) ? {
      code: clean(input.dong.code), name: clean(input.dong.name), sgName: clean(input.dong.sgName), sido: clean(input.dong.sido),
      nearby: Array.isArray(input.dong.nearby) ? input.dong.nearby.map(clean).filter(Boolean) : [], boundary: input.dong.boundary || null,
    } : null;
    return {
      id: id || (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : String(now.getTime())),
      recorded_at: now.toISOString(), pnu: pnu || null, jibun: jibun || null, parcel: pnu || jibun ? null : NO_PARCEL,
      target, item: item || null, observed: observed || null, status, memo: memo || null, photos, lat, lng,
      accuracy_m: Number.isFinite(accuracy) ? accuracy : null, corrected,
      gps_original: corrected && Number.isFinite(num(g.lat)) && Number.isFinite(num(g.lng)) ? { lat: num(g.lat), lng: num(g.lng), accuracy_m: num(g.accuracy) } : null,
      dong, indicators: lat !== null && dong && Array.isArray(input.indicators) ? input.indicators : [],
    };
  }

  function exportDoc(records, now) {
    return {
      kind: "현장 확인 기록(원장 셀 아님 — 사람이 검토해 확인 이력으로 올린다)", app_version: "0.2.0",
      exported_at: now.toISOString(), count: records.length, goal: GOAL,
      personal_data: "없음(소유자·거주자 항목 미수집). 사진은 EXIF를 지우고 가림 확인을 거친 것만 포함", records,
    };
  }

  const api = { STATUSES, STATUS_LABEL, ITEMS, TARGETS, NO_PARCEL, GOAL, MAX_PHOTOS, makeRecord, exportDoc };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FieldRecord = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
