// 현장 기록 화면. 사진 → 위치(±m, 손 보정) → 행정동(오프라인 경계) → 그 동의 공식 현황 → 저장 → 1쪽 문서(한글·PDF)·원본 ZIP.
// 기록·사진·문서는 이 기기(IndexedDB)에만 둔다. 내보내기·공유는 기기에서 파일로만 한다.
(function () {
  "use strict";
  const R = window.FieldRecord, S = window.FieldStore, E = window.FieldEvidence, D = window.RenewDocgen;
  const $ = (id) => document.getElementById(id);
  const MAX_SIDE = 1280;      // 사진 긴 변. 줄여 저장해 기기 공간과 내보내기 크기를 아낀다
  const DATA = "../data/";
  let pos = null;             // 지금 쓰는 위치 {lat,lng,accuracy}
  let gps = null;             // 기기가 처음 준 위치(보정 전)
  let corrected = false;
  let place = null;           // E.makeLocator().locate 결과 + 공식 현황
  let pending = [];           // 이번 기록에 붙일 사진 [{id, blob, url}]
  let edit = null;            // 편집 중 사진 {canvas(원본), boxes:[], drag, start}
  let draft = null;           // 손 보정 중 핀 {lat,lng}
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; };

  function say(text, err) { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; }
  let toastTimer = 0;
  function toast(text, actLabel, act) {
    const t = $("toast"), b = $("toastAct");
    $("toastText").textContent = text; b.hidden = !actLabel; b.textContent = actLabel || "";
    b.onclick = act ? () => { t.hidden = true; act(); } : null;
    t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }
  const badge = () => { $("recBadge").hidden = !(edit || pending.length); };

  // ── 자료(오프라인 경계·현황). 서비스 워커가 처음 받은 파일을 저장해 둔다
  const getJson = (p) => fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const L = E.makeLocator((p) => getJson("national/" + p));
  const templates = getJson("report_templates.json").then((t) => D.setTemplates(t)).catch(() => null);

  function locLine() {
    if (!pos) return;
    const fix = corrected ? " · 보정됨" : "";
    $("locLine").textContent = `현재 위치로 기록합니다 · 오차 약 ${Math.round(pos.accuracy || 0)}m${fix}`;
    $("fix").disabled = false;
  }
  async function lookup() {
    const at = pos;
    $("dongLine").textContent = "행정동을 찾는 중입니다.";
    try {
      const r = await L.locate(at.lat, at.lng, at.accuracy);
      if (at !== pos) return;                                   // 그 사이 위치가 바뀌었으면 버린다
      if (!r || !r.code) { place = r ? { ...r, rows: [] } : null; $("dongLine").textContent = "이 위치의 행정동을 찾지 못했습니다.\n지번을 적어 두면 문서에 함께 남습니다."; $("facts").hidden = true; return; }
      const [emd, living, livingIdx, idx] = await Promise.all([L.get(`emd/${r.code5}.json`), L.get(`living/${r.code5}.json`).catch(() => null), L.get("living/index.json").catch(() => null), L.get("index.json").catch(() => null)]);
      if (at !== pos) return;
      const sg = idx && (idx.sigungu || []).find((s) => s.code5 === r.code5), sido = sg && (idx.sido || []).find((s) => s.code2 === sg.sido2);
      const b = idx && idx.boundary_source;
      place = { ...r, sido: sido ? sido.name : "", rows: E.pickIndicators(r.code, emd, living, livingIdx), boundary: b ? { name: b.name, year: b.year, license: b.license_type } : null };
      $("dongLine").textContent = `${place.sido} ${r.sgName} ${r.name}${r.nearby.length ? `\n경계 근처입니다. ${r.nearby.map((x) => x.name).join("·")}일 수도 있습니다.` : ""}`.trim();
      drawFacts();
    } catch (e) { $("dongLine").textContent = "행정동 자료를 불러오지 못했습니다.\n인터넷에 한 번 연결되면 다음부터는 오프라인에서도 찾습니다."; }
  }
  function drawFacts() {
    const ul = $("factList"); ul.textContent = "";
    for (const r of place.rows) {
      const li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("small");
      li.append(`${r.label} `); b.textContent = r.value; s.textContent = `출처 ${D.displayName(r.src.source_name)} · 기준일 ${D.govDate(r.reference_date)}`;
      li.append(b, s); ul.append(li);
    }
    $("facts").hidden = !place.rows.length;
  }
  function locate() {
    if (!navigator.geolocation) { $("locLine").textContent = "위치를 받지 못했습니다.\n아래 '자세히'에 지번을 적어 주세요."; return; }
    $("locLine").textContent = "위치를 받는 중입니다.";
    navigator.geolocation.getCurrentPosition((p) => {
      gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      pos = { ...gps }; corrected = false; locLine(); lookup();
    }, () => { if (!pos) $("locLine").textContent = "위치를 받지 못했습니다.\n아래 '자세히'에 지번을 적어 주세요."; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }
  $("gps").addEventListener("click", locate);

  // ── 손 보정: 그 시군구의 행정동 경계를 m 평면에 그리고, 누른 곳으로 핀을 옮긴다(배경 지도 없이 오프라인에서 된다)
  const NS = "http://www.w3.org/2000/svg";
  function drawPin() {
    const svg = $("pinMap"), P = E.plane(gps.lat, gps.lng), R0 = Math.max(400, Math.round((gps.accuracy || 30) * 4));
    svg.setAttribute("viewBox", `${-R0} ${-R0} ${2 * R0} ${2 * R0}`);
    svg.textContent = "";
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
    for (const f of (place && place.emd && place.emd.features) || []) {
      const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const d = polys.flat().map((ring) => "M" + ring.map(([x, y]) => P.toXY(x, y).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z").join("");
      el("path", { d, class: "area" + (place && String(f.properties.code) === place.code ? " here" : "") });
      const c = D.repPoint(f);
      if (c) { const [x, y] = P.toXY(c.lon, c.lat); if (Math.abs(x) < R0 && Math.abs(y) < R0) el("text", { x: x.toFixed(1), y: y.toFixed(1), "font-size": (R0 / 11).toFixed(1) }).textContent = f.properties.name; }
    }
    el("circle", { cx: 0, cy: 0, r: Math.max(1, gps.accuracy || 0), class: "acc" });
    const [x, y] = P.toXY(draft.lng, draft.lat);
    el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: (R0 / 30).toFixed(1), class: "dot" });
    return P;
  }
  let plane = null;
  $("fix").addEventListener("click", () => { if (!gps) return; draft = { lat: pos.lat, lng: pos.lng }; $("pinBox").hidden = false; plane = drawPin(); });
  $("pinMap").addEventListener("click", (e) => {
    const svg = $("pinMap"), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse()), [lng, lat] = plane.toLngLat(p.x, p.y);
    draft = { lat, lng }; drawPin();
  });
  document.querySelectorAll("[data-nudge]").forEach((b) => b.addEventListener("click", () => {
    const [dx, dy] = b.dataset.nudge.split(",").map(Number), [x, y] = plane.toXY(draft.lng, draft.lat), [lng, lat] = plane.toLngLat(x + dx, y + dy);
    draft = { lat, lng }; drawPin();
  }));
  $("pinOk").addEventListener("click", () => {
    pos = { lat: draft.lat, lng: draft.lng, accuracy: gps.accuracy }; corrected = true;
    $("pinBox").hidden = true; locLine(); lookup();
  });
  $("pinCancel").addEventListener("click", () => { $("pinBox").hidden = true; });

  // ── 사진: 처음 한 번 촬영 사실 표시 안내 → 읽기 → 줄이기(EXIF는 캔버스를 거치며 사라진다) → 가림(모자이크) → JPEG로 붙이기
  const NOTICE_KEY = "renewmap-field-notice-v1";
  function beforeShot(e) {
    if (e.target !== e.currentTarget) return;                  // 라벨 안 입력칸으로 다시 들어온 클릭
    if (!pos) locate();
    if (store(NOTICE_KEY)) { badgeOn(); return; }
    e.preventDefault();
    const dlg = $("notice"), target = e.currentTarget.htmlFor;
    $("noticeOk").onclick = () => { store(NOTICE_KEY, "1"); dlg.close(); badgeOn(); $(target).click(); };
    dlg.showModal();
  }
  const badgeOn = () => { $("recBadge").hidden = false; };
  document.querySelectorAll(".pick label").forEach((l) => l.addEventListener("click", beforeShot));
  async function loadImage(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c;
  }
  function pixelate(ctx, src, b) {
    const w = Math.max(1, Math.round(b.w)), h = Math.max(1, Math.round(b.h)), cell = Math.max(10, Math.round(Math.max(w, h) / 8));
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(w / cell)); t.height = Math.max(1, Math.round(h / cell));
    t.getContext("2d").drawImage(src, b.x, b.y, w, h, 0, 0, t.width, t.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t, 0, 0, t.width, t.height, b.x, b.y, w, h);
    ctx.imageSmoothingEnabled = true;
  }
  function paint(guide) {
    const cv = $("cv"), ctx = cv.getContext("2d");
    ctx.drawImage(edit.canvas, 0, 0);
    const boxes = edit.drag ? [...edit.boxes, edit.drag] : edit.boxes;
    for (const b of boxes) pixelate(ctx, edit.canvas, b);
    if (guide && edit.drag) { ctx.strokeStyle = "#d7f988"; ctx.lineWidth = 3; ctx.strokeRect(edit.drag.x, edit.drag.y, edit.drag.w, edit.drag.h); }
  }
  function point(e) {
    const cv = $("cv"), r = cv.getBoundingClientRect();
    return { x: Math.min(cv.width, Math.max(0, (e.clientX - r.left) * cv.width / r.width)), y: Math.min(cv.height, Math.max(0, (e.clientY - r.top) * cv.height / r.height)) };
  }
  async function startEdit(file) {
    if (!file) return;
    try {
      const canvas = await loadImage(file);
      edit = { canvas, boxes: [], drag: null, start: null };
      const cv = $("cv"); cv.width = canvas.width; cv.height = canvas.height;
      $("safe").checked = false; $("attach").disabled = true; $("editor").hidden = false;
      paint(false); say(""); badge();
    } catch (e) { say("사진을 읽지 못했습니다.\n다른 사진으로 다시 해 보세요.", true); }
  }
  function closeEdit() { edit = null; $("editor").hidden = true; $("shot").value = ""; $("album").value = ""; badge(); }

  const cv = $("cv");
  cv.addEventListener("pointerdown", (e) => { if (!edit) return; cv.setPointerCapture(e.pointerId); const p = point(e); edit.start = p; edit.drag = { x: p.x, y: p.y, w: 0, h: 0 }; });
  cv.addEventListener("pointermove", (e) => {
    if (!edit || !edit.drag) return;
    const p = point(e), s = edit.start;
    edit.drag = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    paint(true);
  });
  cv.addEventListener("pointerup", () => { if (!edit || !edit.drag) return; if (edit.drag.w > 12 && edit.drag.h > 12) edit.boxes.push(edit.drag); edit.drag = null; paint(false); });
  cv.addEventListener("pointercancel", () => { if (edit) { edit.drag = null; paint(false); } });
  $("auto").addEventListener("click", async () => {
    const cur = edit; if (!cur) return;
    $("auto").disabled = true; say("얼굴·번호판을 찾는 중입니다.\n처음에는 도구를 받느라 시간이 걸립니다.");
    try {
      const r = await window.FieldDetect.findAll(cur.canvas);
      if (edit !== cur) return;                       // 그 사이 사진을 닫았거나 바꿨으면 버린다
      cur.boxes.push(...r.faces, ...r.plates); paint(false);
      const none = !r.faces.length && !r.plates.length;
      say(`얼굴·번호판으로 보이는 곳 ${r.faces.length + r.plates.length}곳을 가렸습니다.\n놓친 곳은 손가락으로 문질러 가리세요.${r.errors.length ? "\n(" + r.errors.join(" / ") + ")" : ""}`, none && r.errors.length > 0);
    } catch (e) { say("자동 찾기를 쓰지 못했습니다.\n직접 가려 주세요.", true); }
    $("auto").disabled = false;
  });
  $("undo").addEventListener("click", () => { if (edit) { edit.boxes.pop(); paint(false); } });
  $("cancel").addEventListener("click", closeEdit);
  $("safe").addEventListener("change", () => { $("attach").disabled = !$("safe").checked; });
  $("shot").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("album").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("attach").addEventListener("click", () => {
    if (!edit) return;
    if (!$("safe").checked) { say("사진을 붙이기 전에 '가릴 곳을 모두 확인했습니다'를 눌러 주세요.", true); return; }
    if (pending.length >= R.MAX_PHOTOS) { say(`사진은 한 기록에 ${R.MAX_PHOTOS}장까지 붙일 수 있습니다.`, true); return; }
    paint(false);
    $("cv").toBlob((blob) => {   // 캔버스에서 새로 만든 JPEG라 원본의 위치·기기 정보(EXIF)가 없다
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      pending.push({ id, blob, url: URL.createObjectURL(blob) });
      closeEdit(); drawThumbs(); say("");
    }, "image/jpeg", 0.82);
  });
  function drawThumbs() {
    const box = $("thumbs"); box.textContent = "";
    pending.forEach((p, i) => {
      const f = document.createElement("figure"), img = document.createElement("img"), x = document.createElement("button");
      img.src = p.url; img.alt = `붙인 사진 ${i + 1}`;
      x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", `사진 ${i + 1} 빼기`);
      x.addEventListener("click", () => { URL.revokeObjectURL(p.url); pending.splice(i, 1); drawThumbs(); });
      f.append(img, x); box.append(f);
    });
    badge();
  }

  // ── 고르기(칩): 대상 유형·자료와 비교. 저장값은 원장 상태 그대로, 화면은 쉬운 말
  function chips(box, name, values, labels, checked) {
    for (const v of values) {
      const l = document.createElement("label"), i = document.createElement("input");
      i.type = "radio"; i.name = name; i.value = v; i.checked = v === checked;
      l.append(i, labels ? labels[v] : v); box.append(l);
    }
  }
  const picked = (name) => (document.querySelector(`input[name="${name}"]:checked`) || {}).value || "";
  chips($("targets"), "target", R.TARGETS);
  chips($("statuses"), "status", ["추가확인", "확인", "충돌"], R.STATUS_LABEL, "추가확인");
  $("item").append(new Option("고르지 않음", ""));
  for (const v of R.ITEMS) $("item").append(new Option(v, v));

  // ── 저장
  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      // 붙인 사진은 '가림 확인' 칸을 거쳐야 pending에 들어오므로 photoSafe는 그 확인을 뜻한다
      const dong = place && place.code ? { code: place.code, name: place.name, sgName: place.sgName, sido: place.sido, nearby: place.nearby.map((x) => x.name), boundary: place.boundary } : null;
      const rec = R.makeRecord({ pnu: $("pnu").value, jibun: $("jibun").value, target: picked("target"), item: $("item").value, observed: $("observed").value,
        status: picked("status"), memo: $("memo").value, photos: pending.map((p) => p.id), photoSafe: true,
        ...(pos ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, corrected, gps } : {}), dong, indicators: dong ? place.rows : [] }, new Date());
      await S.tx(["records", "photos"], "readwrite", (rs, ps) => { for (const p of pending) ps.add({ id: p.id, blob: p.blob }); return rs.add(rec); });
      for (const p of pending) URL.revokeObjectURL(p.url);
      pending = []; drawThumbs();
      for (const id of ["observed", "memo"]) $(id).value = "";
      say("");
      toast("저장했습니다.", "되돌리기", async () => { await S.deleteRecord(rec); toast("저장을 되돌렸습니다."); render(); });
      await render();
    } catch (err) { say(err.message, true); }
  });

  // ── 1쪽 문서: 한글(HWPX)은 바로 받고 보관함에도 남긴다. PDF는 인쇄 창에서 'PDF로 저장'
  async function docOf(rec) {
    await templates;
    const images = [];
    for (const id of rec.photos || []) {
      const blob = await S.photo(id); if (!blob) continue;
      const bmp = await createImageBitmap(blob);
      images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height, src: URL.createObjectURL(blob) });
      bmp.close();
    }
    return { doc: E.buildFieldDoc(rec, images), images };
  }
  async function hwpx(rec) {
    try {
      const { doc, images } = await docOf(rec), bytes = D.hwpxBytes(doc), name = `${E.fileName(rec)}.hwpx`;
      images.forEach((i) => URL.revokeObjectURL(i.src));
      D.saveBytes(name, bytes, "application/hwp+zip");
      await S.addDoc({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, kind: "hwpx", created_at: new Date().toISOString(), record_id: rec.id, blob: new Blob([bytes], { type: "application/hwp+zip" }) });
      toast(`${name} 파일을 받았습니다.\n보관함에서 다시 받을 수 있습니다.`);
    } catch (e) { toast("문서를 만들지 못했습니다.\nPDF로 저장해 보세요."); }
  }
  async function pdf(rec) {
    try {
      const { doc, images } = await docOf(rec), box = $("printDoc");
      box.innerHTML = D.docHTML(doc).html;
      document.body.classList.add("printing");
      const done = () => { document.body.classList.remove("printing"); box.textContent = ""; images.forEach((i) => URL.revokeObjectURL(i.src)); };
      window.addEventListener("afterprint", done, { once: true });
      toast("인쇄 창이 열립니다.\n'PDF로 저장'을 고르세요.");
      await Promise.all([...box.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
      window.print();
    } catch (e) { toast("문서를 만들지 못했습니다."); }
  }

  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  async function render() {
    const rows = await S.records();
    $("today").textContent = `오늘 ${rows.filter((r) => isToday(r.recorded_at)).length}건`;
    const ul = $("list"); ul.textContent = "";
    for (const r of rows) {
      const li = document.createElement("li"), b = document.createElement("b"), m = document.createElement("div"), acts = document.createElement("div");
      b.textContent = `${r.dong ? `${r.dong.sgName} ${r.dong.name}` : r.jibun || r.pnu || R.NO_PARCEL} · ${r.target || r.item || "기록"}`;
      m.className = "meta";
      m.textContent = `${E.localTime(r.recorded_at)}${r.accuracy_m !== null && r.accuracy_m !== undefined ? ` · ±${Math.round(r.accuracy_m)}m` : ""}${r.corrected ? " · 보정됨" : ""}${r.parcel ? ` · ${r.parcel}` : ""}${r.photos && r.photos.length ? ` · 사진 ${r.photos.length}장` : ""}`;
      acts.className = "row";
      for (const [label, fn] of [["한글 1쪽 받기", hwpx], ["PDF로 저장", pdf]]) {
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "ghost"; btn.textContent = label;
        btn.addEventListener("click", () => fn(r)); acts.append(btn);
      }
      li.append(b, m, acts); ul.append(li);
    }
  }

  // ── 내보내기: records.json + photos/<id>.jpg 를 ZIP 하나로. 공유는 같은 ZIP을 기기의 공유 창으로 넘긴다
  async function buildZip() {
    const rows = await S.records(), entries = [{ name: "records.json", data: JSON.stringify(R.exportDoc(rows, new Date()), null, 2) }];
    for (const r of rows) for (const id of r.photos || []) { const b = await S.photo(id); if (b) entries.push({ name: `photos/${id}.jpg`, data: new Uint8Array(await b.arrayBuffer()) }); }
    const day = new Date().toISOString();
    return { name: `renewmap-field-${day.slice(0, 10)}.zip`, bytes: D.zipStore(entries, day) };
  }
  $("exp").addEventListener("click", async () => { const z = await buildZip(); D.saveBytes(z.name, z.bytes, "application/zip"); });
  $("share").addEventListener("click", async () => {
    const z = await buildZip(), file = new File([z.bytes], z.name, { type: "application/zip" });
    try { await navigator.share({ files: [file], title: "리뉴맵 현장 기록" }); } catch (e) { if (e.name !== "AbortError") toast("공유하지 못했습니다.\n모두 내보내기(ZIP)를 쓰세요."); }
  });
  if (navigator.canShare && navigator.canShare({ files: [new File([""], "a.zip", { type: "application/zip" })] })) $("share").hidden = false;

  // 팀에 올리기: upload-config.js가 채워진 경우에만 보인다. 팀 코드는 이 기기에만 기억한다
  const CFG = window.FIELD_UPLOAD;
  if (window.FieldUpload.isConfigured(CFG)) {
    $("upBox").hidden = false;
    $("teamCode").value = store("renewmap-team-code") || "";
    $("up").addEventListener("click", async () => {
      $("up").disabled = true;
      try {
        let dev = store("renewmap-device"); if (!dev) { dev = crypto.randomUUID(); store("renewmap-device", dev); }
        const z = await buildZip(), path = await window.FieldUpload.send(CFG, $("teamCode").value, dev, z.bytes, new Date());
        store("renewmap-team-code", $("teamCode").value.trim());
        say(`올렸습니다(${path.split("/").pop()}).\n올린 뒤에도 기기의 기록은 그대로 남습니다.`);
      } catch (e) { say(e.message, true); }
      $("up").disabled = false;
    });
  }

  if (!store("renewmap-field-intro")) { $("intro").hidden = false; store("renewmap-field-intro", "1"); }
  // 위치 권한이 이미 있으면 바로 받는다. 처음이면 사진 찍기·'현재 위치 받기'를 누를 때 한 번 묻는다
  if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then((s) => { if (s.state === "granted") locate(); }).catch(() => {});
  render().catch(() => say("이 브라우저에서는 기기 저장소를 쓸 수 없습니다.", true));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
