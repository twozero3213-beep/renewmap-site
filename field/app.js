// 현장 확인 기록 화면. IndexedDB(오프라인)에 기록과 사진을 저장하고, 내보내기·공유는 기기에서 파일로만 한다.
(function () {
  "use strict";
  const R = window.FieldRecord;
  const $ = (id) => document.getElementById(id);
  const MAX_SIDE = 1280;      // 사진 긴 변. 줄여 저장해 기기 공간과 내보내기 크기를 아낀다
  let pos = null;             // {lat,lng,accuracy}
  let pending = [];           // 이번 기록에 붙일 사진 [{id, blob, url}]
  let edit = null;            // 편집 중 사진 {canvas(원본), boxes:[], drag, start}

  function db() {
    return new Promise((resolve, reject) => {
      const q = indexedDB.open("renewmap-field", 2);
      q.onupgradeneeded = () => {
        if (!q.result.objectStoreNames.contains("records")) q.result.createObjectStore("records", { keyPath: "id" });
        if (!q.result.objectStoreNames.contains("photos")) q.result.createObjectStore("photos", { keyPath: "id" });
      };
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  }
  async function tx(stores, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(stores, mode);
      const r = fn(...stores.map((s) => t.objectStore(s)));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }
  const all = () => tx(["records"], "readonly", (s) => s.getAll()).then((a) => a.sort((x, y) => y.recorded_at.localeCompare(x.recorded_at)));
  const photoBlob = (id) => tx(["photos"], "readonly", (s) => s.get(id)).then((r) => r && r.blob);

  function say(text, err) { $("msg").textContent = text; $("msg").className = err ? "err" : ""; }

  async function render() {
    const rows = await all();
    $("prog").value = Math.min(rows.length, R.GOAL);
    $("count").textContent = `${rows.length}건 / 목표 ${R.GOAL}건`;
    const ul = $("list");
    ul.textContent = "";
    for (const r of rows) {
      const li = document.createElement("li");
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = r.status;
      li.append(tag, `${r.jibun || r.pnu} · ${r.item}${r.observed ? " · " + r.observed : ""}${r.photos && r.photos.length ? ` · 사진 ${r.photos.length}장` : ""}`);
      ul.append(li);
    }
  }
  function fill(sel, values) { for (const v of values) sel.append(new Option(v, v)); }

  // ── 사진: 읽기 → 줄이기(EXIF는 캔버스를 거치며 사라진다) → 가림(모자이크) → JPEG로 붙이기
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
      $("safe").checked = false; $("attach").disabled = true; $("editor").classList.add("on");
      paint(false); say("");
    } catch (e) { say("사진을 읽지 못했습니다. 다른 사진으로 다시 해 보세요.", true); }
  }
  function closeEdit() { edit = null; $("editor").classList.remove("on"); $("shot").value = ""; $("album").value = ""; }

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
    $("auto").disabled = true; say("얼굴·번호판을 찾는 중입니다. 처음에는 도구를 받느라 시간이 걸립니다.");
    try {
      const r = await window.FieldDetect.findAll(cur.canvas);
      if (edit !== cur) return;                       // 그 사이 사진을 닫았거나 바꿨으면 버린다
      cur.boxes.push(...r.faces, ...r.plates); paint(false);
      const none = !r.faces.length && !r.plates.length;
      say(`얼굴 ${r.faces.length}곳, 번호판 후보 ${r.plates.length}곳을 가렸습니다. 놓친 곳은 직접 끌어 가리세요.${r.errors.length ? " (" + r.errors.join(" / ") + ")" : ""}`, none && r.errors.length > 0);
    } catch (e) { say("자동 찾기를 쓰지 못했습니다. 직접 가려 주세요.", true); }
    $("auto").disabled = false;
  });
  $("undo").addEventListener("click", () => { if (edit) { edit.boxes.pop(); paint(false); } });
  $("cancel").addEventListener("click", closeEdit);
  $("safe").addEventListener("change", () => { $("attach").disabled = !$("safe").checked; });
  $("shot").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("album").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("attach").addEventListener("click", () => {
    if (!edit || !$("safe").checked) return;
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
  }

  $("gps").addEventListener("click", () => {
    if (!navigator.geolocation) return say("이 기기는 위치를 지원하지 않습니다. 위치 없이 저장할 수 있습니다.", true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        $("loc").value = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (±${Math.round(pos.accuracy)}m)`;
        say("");
      },
      () => say("위치를 못 받았습니다. 위치 없이 저장할 수 있습니다.", true), { enableHighAccuracy: true, timeout: 15000 });
  });

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      // 붙인 사진은 '가림 확인' 칸을 거쳐야 pending에 들어오므로 photoSafe는 그 확인을 뜻한다
      const rec = R.makeRecord({ pnu: $("pnu").value, jibun: $("jibun").value, item: $("item").value, observed: $("observed").value,
        status: $("status").value, memo: $("memo").value, photos: pending.map((p) => p.id), photoSafe: true, ...(pos || {}) }, new Date());
      await tx(["records", "photos"], "readwrite", (rs, ps) => { for (const p of pending) ps.add({ id: p.id, blob: p.blob }); return rs.add(rec); });
      for (const p of pending) URL.revokeObjectURL(p.url);
      pending = []; drawThumbs();
      for (const id of ["observed", "memo"]) $(id).value = "";
      say("저장했습니다.");
      await render();
    } catch (err) { say(err.message, true); }
  });

  // 내보내기: records.json + photos/<id>.jpg 를 ZIP 하나로. 공유는 같은 ZIP을 기기의 공유 창으로 넘긴다
  async function buildZip() {
    const rows = await all(), entries = [{ name: "records.json", data: JSON.stringify(R.exportDoc(rows, new Date()), null, 2) }];
    for (const r of rows) for (const id of r.photos || []) { const b = await photoBlob(id); if (b) entries.push({ name: `photos/${id}.jpg`, data: new Uint8Array(await b.arrayBuffer()) }); }
    const day = new Date().toISOString();
    return { name: `renewmap-field-${day.slice(0, 10)}.zip`, bytes: window.RenewDocgen.zipStore(entries, day) };
  }
  $("exp").addEventListener("click", async () => {
    const z = await buildZip(), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([z.bytes], { type: "application/zip" }));
    a.download = z.name; a.click(); URL.revokeObjectURL(a.href);
  });
  $("share").addEventListener("click", async () => {
    const z = await buildZip(), file = new File([z.bytes], z.name, { type: "application/zip" });
    try { await navigator.share({ files: [file], title: "리뉴맵 현장 확인 기록" }); } catch (e) { if (e.name !== "AbortError") say("공유하지 못했습니다. ZIP 내보내기를 쓰세요.", true); }
  });
  if (navigator.canShare && navigator.canShare({ files: [new File([""], "a.zip", { type: "application/zip" })] })) $("share").hidden = false;

  // 서버로 올리기: upload-config.js가 채워진 경우에만 보인다. 팀 코드는 이 기기에만 기억한다
  const CFG = window.FIELD_UPLOAD;
  if (window.FieldUpload.isConfigured(CFG)) {
    $("upBox").hidden = false;
    try { $("teamCode").value = localStorage.getItem("renewmap-team-code") || ""; } catch (e) { /* 저장 못 해도 입력은 된다 */ }
    $("up").addEventListener("click", async () => {
      $("up").disabled = true;
      try {
        let dev = null; try { dev = localStorage.getItem("renewmap-device"); if (!dev) { dev = crypto.randomUUID(); localStorage.setItem("renewmap-device", dev); } } catch (e) { dev = crypto.randomUUID(); }
        const z = await buildZip(), path = await window.FieldUpload.send(CFG, $("teamCode").value, dev, z.bytes, new Date());
        try { localStorage.setItem("renewmap-team-code", $("teamCode").value.trim()); } catch (e) { /* 무시 */ }
        say(`올렸습니다(${path.split("/").pop()}). 올린 뒤에도 기기의 기록은 그대로 남습니다.`);
      } catch (e) { say(e.message, true); }
      $("up").disabled = false;
    });
  }

  fill($("item"), R.ITEMS);
  fill($("status"), ["추가확인", "확인", "충돌"]);
  render().catch(() => say("이 브라우저에서는 기기 저장소를 쓸 수 없습니다.", true));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
