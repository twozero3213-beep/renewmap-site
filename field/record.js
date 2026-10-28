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
  const TARGETS = ["보도", "계단", "옹벽·축대", "공원", "건물 외관", "빈 건물 외관", "주거지 골목", "보안등", "기타"];
  // 현장 확인 항목: 공공데이터로 확인 못 하는 것(docs/research/redevelopment_literature_2026-10-28.md 3장·4장 ③). 판정이 아니라 본 것을 적는 칸이다
  const CHECK_TARGETS = ["건물 외관", "빈 건물 외관", "주거지 골목"];
  const CHECKS = [
    { id: "road", label: "접도 상태", hint: "건물 앞 길의 폭, 막다른 길인지" },
    { id: "unregistered", label: "무허가 건축물 여부", hint: "건축물대장에 없어 보이는 건물이나 덧지은 부분" },
    { id: "facility", label: "설비 상태", hint: "배관·전선·물받이" },
    { id: "exterior", label: "외관 상태", hint: "벽 균열, 마감 떨어짐" },
  ];
  const CHECK_MEMO_MAX = 80;
  const NO_PARCEL = "지번 미확인";
  const GOAL = 30; // 90일 계획의 현장 확인 목표 건수
  const MAX_PHOTOS = 5; // 한 기록에 붙이는 사진 수(기기 저장 공간·내보내기 크기 때문)
  // 소유자·거주자 개인정보는 저장하지 않는다(CLAUDE.md 3장). backend/renewmap/learning/schema.py PII_PATTERNS와 같은 규칙이다.
  // 파이썬 \w는 한글도 글자로 보므로 이메일은 \p{L}\p{N}로 옮겼다
  const PLATE_HANGUL = "가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주아바사자배하허호";
  const PII_PATTERNS = {
    전화번호: /(?<!\d)0(?:1[016789]|2|[3-6][1-5]|70)[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/,
    주민등록번호: /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\s]?[1-8]\d{6}(?!\d)/,
    이메일: /[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+/u,
    // 글자를 번호판 용도 글자로 좁혀 '101동 1234호' 같은 주소를 잡지 않게 한다
    차량번호: new RegExp(`(?<!\\d)\\d{2,3}\\s?[${PLATE_HANGUL}]\\s?\\d{4}(?!\\d)`),
  };
  const personalKinds = (text) => Object.keys(PII_PATTERNS).filter((k) => PII_PATTERNS[k].test(String(text || "")));
  function rejectPersonal(...texts) {
    const kinds = [...new Set(texts.flatMap(personalKinds))];
    if (kinds.length) throw new Error(`${kinds.join("·")}처럼 보이는 글자가 있습니다.\n개인정보는 저장하지 않습니다.\n지우고 다시 저장해 주세요.`);
  }
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));

  function clean(v) { return String(v == null ? "" : v).trim(); }
  const num = (v) => (v == null || v === "" ? null : Number(v));
  // 공식 현황 한 행. 가져온 파일에서 온 값도 이 칸만 글자로 남긴다
  const cleanInd = (i) => {
    const s = (i && i.src) || {};
    return { code: clean(i && i.code), label: clean(i && i.label), value: clean(i && i.value), reference_date: clean(i && i.reference_date), status: clean(i && i.status) || null,
      // 해명서 부록용. 이전 기록·가져온 파일에는 없을 수 있다
      num: Number.isFinite(num(i && i.num)) ? num(i.num) : null, unit: clean(i && i.unit), formula: clean(i && i.formula), rule_version: clean(i && i.rule_version), spatial_unit: clean(i && i.spatial_unit), cell_id: clean(i && i.cell_id),
      src: { source_name: clean(s.source_name), source_url: clean(s.source_url), reference_date: clean(s.reference_date), retrieved_at: clean(s.retrieved_at), license_type: clean(s.license_type) || "미표시" } };
  };

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
    // 길이 상한: 가져온 파일의 아주 긴 글이 개인정보 검사(정규식)를 오래 붙잡지 않게 한다
    if (memo.length > 500 || observed.length > 200) throw new Error("메모는 500자, 본 값은 200자까지 적을 수 있습니다.");
    rejectPersonal(memo, observed);
    // 확인자(93팀 흡수: 아키플랜 '자격 기반 신뢰'). 소속·직위만 받는다. 이름·서명은 결재 문서에서 한다
    const checker = clean(input.checker);
    if (checker.length > 40) throw new Error("확인자는 소속·직위만 40자까지 적어 주세요.");
    rejectPersonal(checker);
    // 사진은 기록과 따로 저장하고 기록에는 id만 둔다. 얼굴·차량번호·소유자 정보가 없거나 가렸다는 확인 없이는 붙이지 않는다
    const photos = Array.isArray(input.photos) ? input.photos.map(clean).filter(Boolean) : [];
    // 같은 자리 묶음(A4). site_id는 묶음 첫 기록의 id라 이전 기록을 고치지 않는다. 이전 기록 사진은 고른 것만 1쪽에 넣는다
    const site = clean(input.site_id);
    if (site && !ID_RE.test(site)) throw new Error("같은 자리 묶음 번호가 올바르지 않습니다.");
    const prevPhotos = site && Array.isArray(input.prev_photos) ? input.prev_photos.map(clean).filter((x) => ID_RE.test(x)) : [];
    if (photos.length + prevPhotos.length > MAX_PHOTOS) throw new Error(`사진은 한 기록에 ${MAX_PHOTOS}장까지 붙일 수 있습니다.`);
    if (photos.length && input.photoSafe !== true) throw new Error("사진을 붙이기 전에 '가릴 곳을 모두 확인했습니다'를 눌러 주세요.");
    // 현장 확인 항목: 대상 유형이 맞을 때 본 항목만 목록 순서로 남긴다. 사진은 이 기록에 붙인 사진만 가리킨다
    const checks = !CHECK_TARGETS.includes(target) || !Array.isArray(input.checks) ? [] : CHECKS.map((c) => (input.checks || []).find((x) => x && clean(x.id) === c.id)).filter(Boolean).map((x) => {
      const m = clean(x.memo);
      if (m.length > CHECK_MEMO_MAX) throw new Error(`확인 항목 메모는 ${CHECK_MEMO_MAX}자까지 적을 수 있습니다.`);
      rejectPersonal(m);
      return { id: clean(x.id), memo: m || null, photo: photos.includes(clean(x.photo)) ? clean(x.photo) : null };
    });
    // 작성자가 고른 건물(N1). 건물 파일의 표제부 칸만 옮긴다(소유자 항목은 원천 파일에도 없다)
    const b = input.building, bs = (b && b.src) || {};
    const building = b && /^\d{10}$/.test(clean(b.bjd10)) && (!clean(b.pnu) || /^\d{19}$/.test(clean(b.pnu))) ? {
      pnu: clean(b.pnu) || null, jibun: clean(b.jibun) || null, bjd10: clean(b.bjd10), bjd_name: clean(b.bjd_name), use_apr_day: isDay(clean(b.use_apr_day)) ? clean(b.use_apr_day).slice(0, 10) : null,
      main_use: clean(b.main_use) || null, structure: clean(b.structure) || null, floors: Number.isInteger(num(b.floors)) ? num(b.floors) : null, reference_date: isDay(clean(b.reference_date)) ? clean(b.reference_date).slice(0, 10) : null,
      src: { source_name: clean(bs.source_name), source_url: clean(bs.source_url), reference_date: isDay(clean(b.reference_date)) ? clean(b.reference_date).slice(0, 10) : "", retrieved_at: clean(bs.retrieved_at), license_type: clean(bs.license_type) || "미표시" },
    } : null;
    const accuracy = lat === null ? null : num(input.accuracy);
    // 손으로 옮긴 위치는 '보정됨'으로 남기고 기기가 처음 준 좌표를 함께 둔다(바꾼 이력을 지우지 않는다)
    const corrected = lat !== null && input.corrected === true;
    const g = input.gps || {};
    const dong = input.dong && /^\d{8}$/.test(clean(input.dong.code)) ? {
      code: clean(input.dong.code), name: clean(input.dong.name), sgName: clean(input.dong.sgName), sido: clean(input.dong.sido),
      nearby: Array.isArray(input.dong.nearby) ? input.dong.nearby.map(clean).filter(Boolean) : [],
      boundary: input.dong.boundary ? { name: clean(input.dong.boundary.name), year: num(input.dong.boundary.year), license: clean(input.dong.boundary.license) || null } : null,
    } : null;
    return {
      id: id || (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : String(now.getTime())),
      recorded_at: now.toISOString(), pnu: pnu || null, jibun: jibun || null, parcel: pnu || jibun ? null : NO_PARCEL,
      target, item: item || null, observed: observed || null, status, memo: memo || null, photos, lat, lng,
      accuracy_m: Number.isFinite(accuracy) ? accuracy : null, corrected,
      gps_original: corrected && Number.isFinite(num(g.lat)) && Number.isFinite(num(g.lng)) ? { lat: num(g.lat), lng: num(g.lng), accuracy_m: num(g.accuracy) } : null,
      dong, indicators: lat !== null && dong && Array.isArray(input.indicators) ? input.indicators.slice(0, 8).map(cleanInd) : [],
      checks, building, checker: checker || null,
      site_id: site || null, site_prev: site && Array.isArray(input.site_prev) ? input.site_prev.map(clean).filter(isDay).sort() : [],
      site_radius_m: site && Number.isFinite(num(input.site_radius_m)) ? num(input.site_radius_m) : null, prev_photos: prevPhotos,
      // 기록할 때 쓴 자료 묶음(A3). 새 묶음을 받아도 이 기록의 숫자는 그대로다
      data_snapshot: input.snapshot && /^[0-9a-f]{64}$/.test(clean(input.snapshot.hash)) ? { hash: clean(input.snapshot.hash), generated_at: clean(input.snapshot.generated_at) || null } : null,
    };
  }

  function exportDoc(records, now) {
    return {
      kind: "현장 확인 기록(원장 셀 아님 — 사람이 검토해 확인 이력으로 올린다)", app_version: "0.2.0",
      exported_at: now.toISOString(), count: records.length, goal: GOAL,
      personal_data: "없음(소유자·거주자 항목 미수집). 사진은 EXIF를 지우고 가림 확인을 거친 것만 포함", records,
    };
  }

  // 자주 쓰는 한 줄(A2): 방금 쓴 것을 맨 앞에 두고, 8개를 넘기면 가장 오래 안 쓴 것부터 뺀다. 개인정보 꼴은 받지 않는다
  const PHRASES_MAX = 8;
  function rememberPhrase(list, text) {
    const t = clean(text).slice(0, 80);
    if (!t) return list || [];
    rejectPersonal(t);
    return [t, ...(list || []).filter((x) => x !== t)].slice(0, PHRASES_MAX);
  }

  // ── ZIP 가져오기(A4): 이 앱이 내보낸 ZIP(docgen.zipStore, 압축 없음: records.json + photos/<id>.jpg)만 받는다
  const LIMITS = { zip: 100 * 2 ** 20, json: 10 * 2 ** 20, photo: 8 * 2 ** 20, entries: 3000 };
  const NOT_OURS = "리뉴맵 현장 기록에서 내보낸 ZIP이 아닙니다.";
  const okName = (n) => n === "records.json" || /^photos\/[A-Za-z0-9_-]{1,64}\.jpg$/.test(n);
  function readZip(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 22) throw new Error(NOT_OURS);
    if (bytes.length > LIMITS.zip) throw new Error("파일이 너무 큽니다.\n100MB 이하만 가져올 수 있습니다.");
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), bad = () => new Error(NOT_OURS);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw bad();
    const n = dv.getUint16(end + 10, true), cdOff = dv.getUint32(end + 16, true);
    if (n > LIMITS.entries || cdOff + dv.getUint32(end + 12, true) > end) throw bad();
    const files = new Map(), dec = new TextDecoder("utf-8", { fatal: true });
    for (let k = 0, p = cdOff; k < n; k++) {
      if (p + 46 > end || dv.getUint32(p, true) !== 0x02014b50) throw bad();
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
      let name;
      try { name = dec.decode(bytes.subarray(p + 46, p + 46 + nl)); } catch (e) { throw bad(); }
      p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
      // 경로 탈출(../, 절대 경로)·모르는 파일은 이름만 보고 거절한다
      if (!okName(name)) throw new Error("ZIP 안에 받을 수 없는 파일 이름이 있습니다.");
      if (method !== 0 || size !== usize || files.has(name)) throw bad();
      if (size > (name === "records.json" ? LIMITS.json : LIMITS.photo)) throw new Error("ZIP 안의 파일이 너무 큽니다.");
      if (off + 30 > cdOff || dv.getUint32(off, true) !== 0x04034b50) throw bad();
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      if (start + size > cdOff) throw bad();
      files.set(name, bytes.subarray(start, start + size));
    }
    return files;
  }
  const isJpeg = (b) => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  // 기록마다 makeRecord로 다시 검사한다(개인정보 꼴·형식이 틀리면 그 기록만 건너뛴다). 가져온 기록에는 '가져옴' 표시를 붙인다
  function parseImport(bytes, now) {
    const files = readZip(bytes), j = files.get("records.json");
    if (!j) throw new Error(NOT_OURS);
    let doc;
    try { doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(j)); } catch (e) { throw new Error(NOT_OURS); }
    if (!doc || !/^현장 확인 기록/.test(String(doc.kind)) || !Array.isArray(doc.records)) throw new Error(NOT_OURS);
    const records = [], photos = new Map();
    let skipped = 0;
    for (const r of doc.records) {
      try {
        if (!r || !ID_RE.test(String(r.id)) || !isDay(String(r.recorded_at))) throw new Error("형식");
        const own = Array.isArray(r.photos) ? r.photos.map(String) : [];
        const got = (id) => files.get(`photos/${id}.jpg`);
        if (!own.every((id) => isJpeg(got(id)))) throw new Error("사진 없음");
        const g = r.gps_original || {};
        const rec = makeRecord({ pnu: r.pnu, jibun: r.jibun, target: r.target, item: r.item, observed: r.observed, status: r.status, memo: r.memo,
          photos: own, photoSafe: true, lat: r.lat, lng: r.lng, accuracy: r.accuracy_m, corrected: r.corrected === true, gps: { lat: g.lat, lng: g.lng, accuracy: g.accuracy_m },
          dong: r.dong, indicators: r.indicators, site_id: r.site_id, site_prev: r.site_prev, site_radius_m: r.site_radius_m,
          prev_photos: Array.isArray(r.prev_photos) ? r.prev_photos.filter((id) => isJpeg(got(id))) : [], snapshot: r.data_snapshot, checks: r.checks, building: r.building, checker: r.checker }, new Date(r.recorded_at), String(r.id));
        rec.imported = true; rec.imported_at = now.toISOString();
        for (const id of [...rec.photos, ...rec.prev_photos]) photos.set(id, got(id));
        records.push(rec);
      } catch (e) { skipped++; }
    }
    return { records, photos, skipped };
  }

  // ── GIS 내보내기(N2): 기록 한 건 = 점 하나. 좌표는 WGS84(EPSG:4326) 그대로 둔다. 사진은 빼고 ZIP 안 파일 이름만 적는다
  const checkLabel = (id) => (CHECKS.find((c) => c.id === id) || { label: id }).label;
  const photoFile = (id) => `photos/${id}.jpg`;
  const GIS_FIELDS = [
    ["id", "기록 번호", (r) => r.id],
    ["recorded", "기록 시각(UTC, ISO 8601)", (r) => r.recorded_at],
    ["target", "무엇을 봤나(대상 유형)", (r) => r.target],
    ["memo", "한 줄 메모", (r) => r.memo],
    ["status", "자료와 비교(확인·충돌·추가확인. 판정 아님)", (r) => r.status],
    ["item", "대조 항목", (r) => r.item],
    ["observed", "본 값", (r) => r.observed],
    ["acc_m", "위치 오차(m, 기기 값)", (r) => r.accuracy_m],
    ["corrected", "작성자가 위치를 옮겼는지(true·false)", (r) => !!r.corrected],
    ["adm_code", "행정동 코드(SGIS 8자리)", (r) => r.dong && r.dong.code],
    ["adm_name", "행정동 이름", (r) => r.dong && r.dong.name],
    ["sgg_name", "시군구 이름", (r) => r.dong && r.dong.sgName],
    ["pnu", "필지 번호(PNU 19자리)", (r) => r.pnu],
    ["jibun", "지번", (r) => r.jibun],
    ["bjd_code", "법정동 코드(10자리, 행정동에서 근사해 작성자가 고른 건물의 것)", (r) => r.building && r.building.bjd10],
    ["bld_apr", "사용승인일(건축물대장 표제부)", (r) => r.building && r.building.use_apr_day],
    ["bld_use", "주용도(건축물대장)", (r) => r.building && r.building.main_use],
    ["bld_struct", "구조(건축물대장)", (r) => r.building && r.building.structure],
    ["bld_floors", "지상층수(건축물대장)", (r) => r.building && r.building.floors],
    ["bld_ref", "건축물대장 기준일", (r) => r.building && r.building.reference_date],
    ["bld_src", "건축물대장 출처", (r) => r.building && r.building.src.source_name],
    ["bld_lic", "건축물대장 이용조건", (r) => r.building && r.building.src.license_type],
    ["checks", "현장 확인 항목(판정 아님). '항목: 메모 [사진 파일]'을 ' | '로 구분", (r) => (r.checks || []).map((c) => `${checkLabel(c.id)}: ${c.memo || "메모 없음"}${c.photo ? ` [${photoFile(c.photo)}]` : ""}`).join(" | ")],
    ["checker", "확인자(소속·직위)", (r) => r.checker],
    ["photos", "사진 파일 이름(함께 내보낸 ZIP 안). ' | '로 구분", (r) => (r.photos || []).map(photoFile).join(" | ")],
    ["site_id", "같은 지점 묶음 번호", (r) => r.site_id],
  ];
  const gisProps = (r) => Object.fromEntries(GIS_FIELDS.map(([k, , f]) => { const v = f(r); return [k, v === undefined || v === "" ? null : v]; }));
  function toGeoJSON(records, now) {
    return {
      type: "FeatureCollection", name: "renewmap_field",
      description: "리뉴맵 현장 확인 기록. 좌표계 WGS84(EPSG:4326, 경도·위도 순). 판정이 아니다. 위치가 없는 기록은 geometry가 null이다. 사진은 넣지 않고 파일 이름만 적었다",
      exported_at: now.toISOString(), fields: Object.fromEntries(GIS_FIELDS.map(([k, d]) => [k, d])),
      features: (records || []).map((r) => ({ type: "Feature", id: r.id, geometry: Number.isFinite(r.lat) && Number.isFinite(r.lng) ? { type: "Point", coordinates: [r.lng, r.lat] } : null, properties: gisProps(r) })),
    };
  }
  // 엑셀에서 수식으로 읽히는 글(=, +, -, @로 시작)은 앞에 '를 붙인다. 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다
  const csvCell = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // CSV(UTF-8 BOM): 엑셀에서 한글이 깨지지 않게 BOM을 붙인다. 줄 끝은 CRLF
  function toCSV(records) {
    const head = ["lng", "lat", ...GIS_FIELDS.map(([k]) => k)];
    const rows = (records || []).map((r) => { const p = gisProps(r); return [Number.isFinite(r.lng) ? r.lng : null, Number.isFinite(r.lat) ? r.lat : null, ...GIS_FIELDS.map(([k]) => p[k])].map(csvCell).join(","); });
    return "﻿" + [head.join(","), ...rows].join("\r\n") + "\r\n";
  }

  const api = { CHECKS, CHECK_TARGETS, CHECK_MEMO_MAX, GIS_FIELDS, toGeoJSON, toCSV, STATUSES, STATUS_LABEL, ITEMS, TARGETS, NO_PARCEL, GOAL, MAX_PHOTOS, PII_PATTERNS, personalKinds, makeRecord, exportDoc, PHRASES_MAX, rememberPhrase, LIMITS, readZip, parseImport };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FieldRecord = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
