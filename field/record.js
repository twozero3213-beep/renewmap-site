// 현장 확인 기록 한 건을 만들고 검증한다. 화면·저장소와 무관한 순수 함수라 node --test로 검사한다.
// 원장 확인 상태(backend/renewmap/ledger/cell.py Status)의 현장 입력 3종만 쓴다. 모르면 '추가확인'(CLAUDE.md 원칙 4).
(function (root) {
  "use strict";
  const STATUSES = ["확인", "충돌", "추가확인"];
  // 현장에서 보고 적는 항목. 숫자 판정은 하지 않고 본 것만 적는다.
  const ITEMS = ["사용승인일", "주용도", "층수", "연면적", "세대수", "공실·폐가 여부(관찰)", "기타"];
  const GOAL = 30; // 90일 계획의 현장 확인 목표 건수
  const MAX_PHOTOS = 5; // 한 기록에 붙이는 사진 수(기기 저장 공간·내보내기 크기 때문)
  // 소유자·거주자 개인정보는 저장하지 않는다(CLAUDE.md 3장). 메모에 전화번호·주민등록번호 꼴이 있으면 거부한다.
  const PERSONAL = [/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/, /\b\d{6}[-\s]?[1-4]\d{6}\b/];

  function clean(v) { return String(v == null ? "" : v).trim(); }

  function makeRecord(input, now, id) {
    const status = clean(input.status) || "추가확인";
    if (!STATUSES.includes(status)) throw new Error("확인 상태는 확인·충돌·추가확인 중 하나여야 한다");
    const item = clean(input.item);
    if (!ITEMS.includes(item)) throw new Error("확인 항목을 고른다");
    const pnu = clean(input.pnu);
    const jibun = clean(input.jibun);
    if (pnu && !/^\d{19}$/.test(pnu)) throw new Error("PNU는 19자리 숫자다");
    if (!pnu && !jibun) throw new Error("PNU 또는 지번을 적는다");
    const observed = clean(input.observed);
    if (status !== "추가확인" && !observed) throw new Error("확인·충돌은 본 값을 적어야 한다(모르면 추가확인)");
    const memo = clean(input.memo);
    if (PERSONAL.some((re) => re.test(memo) || re.test(observed))) throw new Error("개인정보로 보이는 숫자가 있어 저장하지 않는다");
    // 사진은 기록과 따로 저장하고 기록에는 id만 둔다. 얼굴·차량번호·소유자 정보가 없거나 가렸다는 확인 없이는 붙이지 않는다
    const photos = Array.isArray(input.photos) ? input.photos.map(clean).filter(Boolean) : [];
    if (photos.length > MAX_PHOTOS) throw new Error(`사진은 한 기록에 ${MAX_PHOTOS}장까지 붙일 수 있다`);
    if (photos.length && input.photoSafe !== true) throw new Error("사진에 얼굴·차량번호·소유자 정보가 없거나 가렸는지 확인해야 한다");
    const lat = input.lat == null || input.lat === "" ? null : Number(input.lat);
    const lng = input.lng == null || input.lng === "" ? null : Number(input.lng);
    if ((lat === null) !== (lng === null) || [lat, lng].some((x) => x !== null && !Number.isFinite(x))) throw new Error("위치는 위도·경도를 함께 적는다");
    return {
      id: id || (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : String(now.getTime())),
      recorded_at: now.toISOString(), pnu: pnu || null, jibun: jibun || null, item, observed: observed || null,
      status, memo: memo || null, photos, lat, lng,
      accuracy_m: lat === null || input.accuracy == null ? null : Number(input.accuracy),
    };
  }

  function exportDoc(records, now) {
    return {
      kind: "현장 확인 기록(원장 셀 아님 — 사람이 검토해 확인 이력으로 올린다)", app_version: "0.1.0",
      exported_at: now.toISOString(), count: records.length, goal: GOAL,
      personal_data: "없음(소유자·거주자 항목 미수집). 사진은 EXIF를 지우고 가림 확인을 거친 것만 포함", records,
    };
  }

  const api = { STATUSES, ITEMS, GOAL, MAX_PHOTOS, makeRecord, exportDoc };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FieldRecord = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
