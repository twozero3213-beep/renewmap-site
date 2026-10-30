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
  // localStorage가 막힌 브라우저(사생활 모드 등)에서는 기억 기능만 끄고 기록 저장은 그대로 된다
  const canStore = (() => { try { localStorage.setItem("renewmap-probe", "1"); localStorage.removeItem("renewmap-probe"); return true; } catch (e) { return false; } })();
  const storeJson = (k, v) => { if (v !== undefined) return store(k, JSON.stringify(v)); try { return JSON.parse(store(k)) || null; } catch (e) { return null; } };

  function say(text, err) { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; }
  let toastTimer = 0;
  function toast(text, actLabel, act, ok) {
    const t = $("toast"), b = $("toastAct");
    t.classList.toggle("ok", !!ok);
    if (ok) { t.hidden = true; void t.offsetWidth; }   // 이미 떠 있어도 체크 표시를 다시 그린다
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
    const m = Math.round(pos.accuracy || 0), chip = $("accChip");
    $("locLine").textContent = `현재 위치로 기록합니다${fix}`;
    // 오차 칩: 20m 이하·50m 이하·그보다 넓음. 색은 보조이고 숫자가 본 정보다
    chip.textContent = `오차 약 ${m}m`; chip.dataset.q = m <= 20 ? "good" : m <= 50 ? "ok" : "wide"; chip.hidden = false;
    $("fix").disabled = false;
  }
  async function lookup() {
    clearParcel();
    const at = pos;
    $("dongLine").textContent = "행정동을 찾는 중입니다.";
    try {
      const r = await L.locate(at.lat, at.lng, at.accuracy);
      if (at !== pos) return;                                   // 그 사이 위치가 바뀌었으면 버린다
      if (!r || !r.code) { place = r ? { ...r, rows: [] } : null; drawBld(null); $("dongLine").textContent = "이 위치의 행정동을 찾지 못했습니다.\n지번을 적어 두면 문서에 함께 남습니다."; $("facts").hidden = true; return; }
      const [emd, living, livingIdx, idx] = await Promise.all([L.get(`emd/${r.code5}.json`), L.get(`living/${r.code5}.json`).catch(() => null), L.get("living/index.json").catch(() => null), L.get("index.json").catch(() => null)]);
      if (at !== pos) return;
      const sg = idx && (idx.sigungu || []).find((s) => s.code5 === r.code5), sido = sg && (idx.sido || []).find((s) => s.code2 === sg.sido2);
      const b = idx && idx.boundary_source;
      place = { ...r, sido: sido ? sido.name : "", rows: E.pickIndicators(r.code, emd, living, livingIdx), boundary: b ? { name: b.name, year: b.year, license: b.license_type } : null,
        snapshot: idx && idx.snapshot_hash ? { hash: idx.snapshot_hash, generated_at: idx.generated_at } : null };
      drawBld(E.bjdongCandidates(r.code, r.name, living));
      $("dongLine").textContent = `${place.sido} ${r.sgName} ${r.name}${r.nearby.length ? `\n경계 근처입니다. ${r.nearby.map((x) => x.name).join("·")}일 수도 있습니다.` : ""}`.trim();
      drawFacts();
    } catch (e) { drawBld(null); $("dongLine").textContent = "행정동 자료를 불러오지 못했습니다.\n인터넷에 한 번 연결되면 다음부터는 오프라인에서도 찾습니다."; }
  }
  function drawFacts() {
    const ul = $("factList"); ul.textContent = "";
    for (const r of place.rows) {
      const li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("small");
      li.append(`${r.label} `); b.textContent = r.value; s.textContent = `출처 ${D.displayName(r.src.source_name)} · 기준일 ${D.govDate(r.reference_date)} · 이용조건 ${E.lic(r.src.license_type)}`;
      li.append(b, s); ul.append(li);
    }
    // 자료 기준일(A3): 오프라인에서도 기기에 받아 둔 파일로 보인다
    const old = E.oldestDate(place.rows), snap = place.snapshot;
    $("factsBase").textContent = [old ? `가장 오래된 자료 기준일 ${D.govDate(old)}` : "", snap && snap.generated_at ? `받은 자료 묶음 ${D.govDate(snap.generated_at.slice(0, 10))}` : ""].filter(Boolean).join("\n");
    $("facts").hidden = !place.rows.length;
  }

  // ── 가까운 건물(N1): 행정동에서 근사한 법정동의 건물 자료(buildings/{법정동}.json)를 지번으로 찾는다. 사람이 고르기 전에는 채우지 않는다.
  // 건물 자료는 처음 찾을 때 받고(서비스 워커가 오프라인용으로 저장), 위치는 기기 밖으로 보내지 않는다(받는 파일 이름은 법정동 코드뿐)
  let bjds = [], chosen = null;
  const bldFiles = new Map();
  const bldGet = (code) => { if (!bldFiles.has(code)) bldFiles.set(code, getJson(`buildings/${code}.json`).catch(() => { bldFiles.delete(code); return null; })); return bldFiles.get(code); };
  const line = (text, cls) => { const li = document.createElement("li"); li.textContent = text; if (cls) li.className = cls; return li; };
  function drawBld(cands) {
    bjds = cands || []; chosen = null; $("bldQ").value = ""; $("bldList").textContent = ""; $("bldPicked").hidden = true;
    $("bld").hidden = !place;
    $("bldFind").hidden = !bjds.length;
    $("bldNote").textContent = bjds.length
      ? `법정동 ${bjds.map((b) => b.name).join("·")}의 건축물대장에서 찾습니다.\n법정동은 행정동에서 근사해 골랐습니다.\n건물 자료에 좌표가 없어 사진 위치로 거리를 재지 못합니다.\n지번을 적으면 3동까지 보여 줍니다.`
      : "이 지역은 건물 자료가 아직 없습니다.\n지번은 아래 '자세히'에 직접 적어 주세요.";
  }
  function pickedText() {
    $("bldPicked").hidden = !chosen;
    if (chosen) $("bldPicked").textContent = `자동 채움 · 건축물대장 기준일 ${D.govDate(chosen.reference_date)}\n${chosen.bjd_name} ${chosen.jibun || ""} · 사용승인 ${chosen.use_apr_day ? D.govDate(chosen.use_apr_day) : "자료 없음"} · ${chosen.main_use || "-"} · ${chosen.structure || "-"} · ${chosen.floors === null ? "층수 자료 없음" : `지상 ${chosen.floors}층`}\n지번이나 필지 번호를 고치면 자동 채움을 지웁니다.`;
  }
  const same = (b, f) => !!chosen && chosen.bjd10 === f.bjd10 && chosen.jibun === b.jibun && chosen.main_use === b.main_use && chosen.use_apr_day === b.use_apr_day && chosen.floors === b.floors;
  async function searchBld() {
    const q = $("bldQ").value, files = (await Promise.all(bjds.map((b) => bldGet(b.code10)))).filter(Boolean);
    if (q !== $("bldQ").value) return;                                  // 그 사이 더 적었으면 버린다
    const ul = $("bldList"), { hits, total } = E.findBuildings(files, q);
    ul.textContent = "";
    if (!q.trim()) return;
    if (!files.length) { ul.append(line("건물 자료를 불러오지 못했습니다.\n인터넷에 한 번 연결되면 다음부터는 오프라인에서도 찾습니다.", "hint")); return; }
    if (!hits.length) { ul.append(line("그 지번의 건물을 찾지 못했습니다.\n지번만 적어 두어도 문서에 남습니다.", "hint")); return; }
    for (const { b, f } of hits) {
      const li = document.createElement("li"), btn = document.createElement("button"), on = same(b, f);
      btn.type = "button"; btn.className = on ? "" : "ghost"; btn.setAttribute("aria-pressed", String(on));
      btn.textContent = `${f.name} ${b.jibun}${b.name ? ` ${b.name}` : ""}\n${b.main_use || "-"} · ${b.structure || "-"} · ${b.floors === null ? "층수 자료 없음" : `지상 ${b.floors}층`} · 사용승인 ${b.use_apr_day ? D.govDate(b.use_apr_day) : "자료 없음"}`;
      btn.addEventListener("click", () => {
        chosen = on ? null : E.buildingFill(b, f);
        $("jibun").value = chosen ? chosen.jibun || "" : ""; $("pnu").value = chosen ? chosen.pnu || "" : "";
        pickedText(); searchBld();
      });
      li.append(btn); ul.append(li);
    }
    if (total > hits.length) ul.append(line(`같은 본번 건물이 ${total}동 있습니다.\n지번 뒤에 건물 이름을 더 적으면 좁혀집니다.`, "hint"));
  }
  $("bldQ").addEventListener("input", searchBld);

  // ── 필지 찾기(선택): 격리된 창(vw-frame.html, sandbox allow-scripts)이 브이월드 연속지적도에 좌표 1개를 묻는다.
  // 받은 지번·PNU는 사람이 보는 칸에 채우고(고칠 수 있음), 경계는 핀 지도에만 그리고 저장하지 않는다(브이월드 약관 제19조)
  const VW_KEY = window.RENEWMAP_VWORLD_KEY || "";   // 배포 때 사이트 저장소에만 넣는 vworld-key.js(등록 주소에서만 동작)
  let vwFrame = null, vwSeq = 0, parcel = null;
  const vwWait = new Map();
  window.addEventListener("message", (e) => {
    if (!vwFrame || e.source !== vwFrame.contentWindow) return;
    const done = vwWait.get(e.data && e.data.id);
    if (done) { vwWait.delete(e.data.id); done(e.data); }
  });
  function vwAsk(lng, lat) {
    return new Promise((ok) => {
      const send = () => {
        const id = ++vwSeq; vwWait.set(id, ok);
        vwFrame.contentWindow.postMessage({ id, lng, lat }, "*");   // 받는 쪽이 같은 출처가 아니라(sandbox) '*'만 된다. 보내는 것은 좌표뿐
        setTimeout(() => { if (vwWait.delete(id)) ok({ error: "시간 초과" }); }, 12000);
      };
      if (vwFrame) return send();
      vwFrame = document.createElement("iframe");
      vwFrame.hidden = true; vwFrame.title = "브이월드 필지 조회"; vwFrame.setAttribute("sandbox", "allow-scripts"); vwFrame.src = "vw-frame.html";
      vwFrame.addEventListener("load", send, { once: true });
      document.body.append(vwFrame);
    });
  }
  function clearParcel() { parcel = null; $("parcelLine").hidden = true; }
  $("parcelBox").hidden = !VW_KEY;
  $("parcelFind").addEventListener("click", async () => {
    if (!pos) return;
    const btn = $("parcelFind"), out = $("parcelLine");
    btn.disabled = true; out.hidden = false; out.textContent = "브이월드에 묻는 중입니다.";
    const r = await vwAsk(pos.lng, pos.lat), p = r.props ? E.parcelFrom(r.props) : null;
    btn.disabled = false;
    if (!p) { parcel = null; out.textContent = r.error === "필지 없음" ? "이 위치에서 필지를 찾지 못했습니다.\n지번을 직접 적어 주세요." : "필지를 찾지 못했습니다.\n인터넷 연결을 확인하거나 지번을 직접 적어 주세요."; return; }
    parcel = { ...p, rings: E.ringsFrom(r.geometry) };
    out.textContent = `${p.addr || p.jibun} · PNU ${p.pnu}\n브이월드 연속지적도에서 찾았습니다.\n위치 오차만큼 옆 필지일 수 있으니 확인해 주세요.`;
    $("jibun").value = p.jibun; $("pnu").value = p.pnu; chosen = null; pickedText();
    $("bldQ").value = p.jibun; searchBld();
    if (!$("pinBox").hidden) plane = drawPin();
  });
  // 사람이 지번·필지 번호를 고치면 자동 채움을 지운다(고친 값이 이긴다)
  for (const id of ["jibun", "pnu"]) $(id).addEventListener("input", () => {
    if (!chosen || ($("jibun").value === (chosen.jibun || "") && $("pnu").value === (chosen.pnu || ""))) return;
    chosen = null; pickedText(); searchBld(); say("직접 고쳐서 건물 자동 채움을 지웠습니다.");
  });

  // ── 새 공식 자료 점검(A3): 인터넷이 될 때 index.json의 묶음 해시를 기기에 받아 둔 것과 비교한다. 다르면 세션에 한 번만 알린다
  async function checkData() {
    try {
      if (!navigator.onLine || sessionStorage.getItem("renewmap-data-checked")) return;
      sessionStorage.setItem("renewmap-data-checked", "1");
    } catch (e) { return; }
    try {
      // no-cache: 서비스 워커 캐시를 건너뛰고 서버에 바뀌었는지만 묻는다(안 바뀌었으면 304)
      const [cur, latest] = await Promise.all([L.get("index.json"), fetch(DATA + "national/index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null))]);
      $("newData").hidden = !E.isNewData(cur, latest);
    } catch (e) { /* 오프라인·일시 오류면 다음 세션에 다시 본다 */ }
  }
  // 받기: 기기에 받아 둔 행정동 경계·현황 파일만 지우고 다시 연다. 저장한 기록은 숫자를 기록 안에 갖고 있어 바뀌지 않는다
  $("newDataGet").addEventListener("click", async () => {
    $("newDataGet").disabled = true;
    try {
      for (const k of await caches.keys()) {
        const c = await caches.open(k);
        for (const q of await c.keys()) if (/\/data\/national\//.test(q.url)) await c.delete(q);
      }
      location.reload();
    } catch (e) { $("newDataGet").disabled = false; toast("새 자료를 받지 못했습니다.\n잠시 뒤 다시 해 보세요."); }
  });

  // ── 같은 자리 이전 기록(A4): 위치가 정해지면 반경 안 기록을 거리·날짜 순으로 보여 준다. 묶기는 새 기록에만 site_id를 붙인다
  let site = null;            // 이번 기록을 묶을 지점 {id, from(이전 기록), photos:Set(1쪽에 넣을 이전 사진)}
  let nearUrls = [];
  const RADIUS_KEY = "renewmap-field-radius";
  const radius = () => Number($("radius").value) || 50;
  $("radius").value = ["20", "30", "50", "100"].includes(store(RADIUS_KEY)) ? store(RADIUS_KEY) : "50";
  $("radius").addEventListener("change", () => { store(RADIUS_KEY, $("radius").value); drawNear(); });
  function siteText() {
    $("siteLine").hidden = !site;
    if (site) $("siteLine").textContent = `같은 지점으로 묶었습니다.\n이전 기록 ${E.localTime(site.from.recorded_at)}${site.photos.size ? ` · 이전 사진 ${site.photos.size}장을 1쪽에 넣습니다` : ""}`;
  }
  async function drawNear() {
    nearUrls.forEach((u) => URL.revokeObjectURL(u)); nearUrls = [];
    const ul = $("nearList"); ul.textContent = "";
    if (!pos) { $("near").hidden = true; return; }
    const at = pos, near = E.nearbyRecords(await S.records(), at.lat, at.lng, radius());
    if (at !== pos) return;
    if (site && !near.some((x) => E.siteOf(x.rec) === site.id)) { site = null; siteText(); }
    $("near").hidden = !near.length;
    $("nearSum").textContent = `이 근처 이전 기록 ${near.length}건 (반경 ${radius()}m)`;
    for (const { rec, dist } of near) {
      const li = document.createElement("li"), body = document.createElement("div"), head = document.createElement("b"), meta = document.createElement("div"), btn = document.createElement("button");
      const first = rec.photos && rec.photos[0] && await S.photo(rec.photos[0]);
      if (first) { const img = document.createElement("img"), u = URL.createObjectURL(first); nearUrls.push(u); img.src = u; img.alt = `${E.localTime(rec.recorded_at)} 기록 사진`; li.append(img); }
      else { const blank = document.createElement("span"); blank.className = "blank"; li.append(blank); }
      head.textContent = `${E.localTime(rec.recorded_at)} · ${rec.target}${rec.imported ? " · 가져옴" : ""}`;
      meta.className = "meta";
      meta.textContent = `${dist}m 떨어짐 · 그때 오차 ${rec.accuracy_m === null ? "자료 없음" : `±${Math.round(rec.accuracy_m)}m`} · 지금 오차 ±${Math.round(at.accuracy || 0)}m${rec.memo ? `\n${rec.memo}` : ""}`;
      const bound = site && site.from.id === rec.id;
      btn.type = "button"; btn.className = "ghost"; btn.textContent = bound ? "묶기 풀기" : "같은 지점으로 묶기";
      btn.addEventListener("click", () => { site = bound ? null : { id: E.siteOf(rec), from: rec, photos: new Set() }; siteText(); drawNear(); });
      body.append(head, meta, btn);
      // 묶은 기록의 사진 중 1쪽에 넣을 것만 고른다(기본은 넣지 않음)
      if (bound) (rec.photos || []).forEach((id, i) => {
        const l = document.createElement("label"), c = document.createElement("input"), t = document.createElement("span");
        l.className = "check"; c.type = "checkbox"; c.checked = site.photos.has(id); t.textContent = `이전 사진 ${i + 1}을 1쪽에 넣기`;
        c.addEventListener("change", () => {
          if (c.checked && pending.length + site.photos.size >= R.MAX_PHOTOS) { c.checked = false; say(`사진은 한 기록에 ${R.MAX_PHOTOS}장까지 붙일 수 있습니다.`, true); return; }
          if (c.checked) site.photos.add(id); else site.photos.delete(id);
          siteText();
        });
        l.append(c, t); body.append(l);
      });
      li.append(body); ul.append(li);
    }
  }
  function locate() {
    if (!navigator.geolocation) { $("locLine").textContent = "위치를 받지 못했습니다.\n아래 '자세히'에 지번을 적어 주세요."; return; }
    $("locLine").textContent = "위치를 받는 중입니다.";
    const wait = (on) => { document.body.classList.toggle("gps-wait", on); $("gps").setAttribute("aria-busy", String(on)); };
    wait(true);
    navigator.geolocation.getCurrentPosition((p) => {
      wait(false);
      gps ={ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      pos = { ...gps }; corrected = false; locLine(); lookup(); drawNear();
    }, () => { wait(false); if (!pos) $("locLine").textContent = "위치를 받지 못했습니다.\n아래 '자세히'에 지번을 적어 주세요."; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }
  $("gps").addEventListener("click", locate);

  // ── 손 보정: 그 시군구의 행정동 경계를 m 평면에 그리고, 누른 곳으로 핀을 옮긴다(배경 지도 없이 오프라인에서 된다)
  const NS = "http://www.w3.org/2000/svg";
  // 배경지도(브이월드 WMTS, 웹 메르카토르 256px 조각). 키는 배포 때 사이트 저장소에만 넣는 vworld-key.js에 있다(등록 주소에만 동작).
  // 조각 요청은 대략 위치를 브이월드에 보내므로 사용자가 켤 때만 받는다. 조각 모서리를 m 평면에 대어 놓는다(수백 m 안에서는 오차가 작다)
  const BASEMAP = "renewmap-field-basemap";
  const tileLng = (x, n) => (x / n) * 360 - 180, tileLat = (y, n) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  function drawTiles(el, P, R0) {
    const z = Math.min(18, Math.max(7, Math.floor(Math.log2((40075016 * Math.cos((gps.lat * Math.PI) / 180)) / R0)))), n = 2 ** z;
    const [w, nLat] = P.toLngLat(-R0, -R0), [e, sLat] = P.toLngLat(R0, R0);
    const tx = (lng) => Math.floor(((lng + 180) / 360) * n), ty = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n); };
    for (let x = tx(w); x <= tx(e); x++) for (let y = ty(nLat); y <= ty(sLat); y++) {
      const [x0, y0] = P.toXY(tileLng(x, n), tileLat(y, n)), [x1, y1] = P.toXY(tileLng(x + 1, n), tileLat(y + 1, n));
      el("image", { href: `https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/Base/${z}/${y}/${x}.png`, x: x0.toFixed(1), y: y0.toFixed(1), width: (x1 - x0).toFixed(1), height: (y1 - y0).toFixed(1), preserveAspectRatio: "none", class: "tile" });
    }
  }
  if (VW_KEY) {
    $("basemapBox").hidden = false;
    $("basemap").checked = store(BASEMAP) === "1";
    $("basemapNote").hidden = !$("basemap").checked;
    $("basemap").addEventListener("change", () => { store(BASEMAP, $("basemap").checked ? "1" : "0"); $("basemapNote").hidden = !$("basemap").checked; if (draft) drawPin(); });
  }
  function drawPin() {
    const svg = $("pinMap"), P = E.plane(gps.lat, gps.lng), R0 = Math.max(400, Math.round((gps.accuracy || 30) * 4));
    svg.setAttribute("viewBox", `${-R0} ${-R0} ${2 * R0} ${2 * R0}`);
    svg.textContent = "";
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
    const tiles = !!VW_KEY && $("basemap").checked;
    svg.classList.toggle("tiles", tiles);
    if (tiles) drawTiles(el, P, R0);
    for (const f of (place && place.emd && place.emd.features) || []) {
      const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const d = polys.flat().map((ring) => "M" + ring.map(([x, y]) => P.toXY(x, y).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z").join("");
      el("path", { d, class: "area" + (place && String(f.properties.code) === place.code ? " here" : "") });
      const c = D.repPoint(f);
      if (c) { const [x, y] = P.toXY(c.lon, c.lat); if (Math.abs(x) < R0 && Math.abs(y) < R0) el("text", { x: x.toFixed(1), y: y.toFixed(1), "font-size": (R0 / 11).toFixed(1) }).textContent = f.properties.name; }
    }
    for (const ring of (parcel && parcel.rings) || []) el("path", { d: "M" + ring.map(([lng, lat]) => P.toXY(lng, lat).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z", class: "parcel" });
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
    $("pinBox").hidden = true; locLine(); lookup(); drawNear();
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
  $("cancel").addEventListener("click", () => { linkNext = null; closeEdit(); });
  $("safe").addEventListener("change", () => { $("attach").disabled = !$("safe").checked; });
  $("shot").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("album").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("attach").addEventListener("click", () => {
    if (!edit) return;
    if (!$("safe").checked) { say("사진을 붙이기 전에 '가릴 곳을 모두 확인했습니다'를 눌러 주세요.", true); return; }
    if (pending.length + (site ? site.photos.size : 0) >= R.MAX_PHOTOS) { say(`사진은 한 기록에 ${R.MAX_PHOTOS}장까지 붙일 수 있습니다.`, true); return; }
    paint(false);
    $("cv").toBlob((blob) => {   // 캔버스에서 새로 만든 JPEG라 원본의 위치·기기 정보(EXIF)가 없다
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      pending.push({ id, blob, url: URL.createObjectURL(blob) });
      const link = linkNext; linkNext = null;
      closeEdit(); drawThumbs(); say("");
      if (link) { $(`ck-${link}`).checked = true; $(`ck-${link}`).dispatchEvent(new Event("change")); $(`ckp-${link}`).value = id; }
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
    drawCheckPhotos(); badge();
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
  // 대상 유형은 마지막에 고른 값을 미리 고른다. 상태는 미리 고르지 않는다(늘 '모름'에서 시작. 앞 기록의 '같음'이 따라붙지 않게)
  const TARGET_KEY = "renewmap-field-last-target", PHRASE_KEY = "renewmap-field-phrases-v1", CHECKER_KEY = "renewmap-field-checker";
  $("checker").value = store(CHECKER_KEY) || "";   // 같은 담당자가 계속 쓰므로 지난 값을 채워 둔다
  chips($("targets"), "target", R.TARGETS, null, R.TARGETS.includes(store(TARGET_KEY)) ? store(TARGET_KEY) : undefined);
  chips($("statuses"), "status", ["추가확인", "확인", "충돌"], R.STATUS_LABEL, "추가확인");
  // ── 현장 확인 항목: 대상 유형이 건물 외관·주거지 골목 등일 때만 보인다. 항목마다 한 줄 메모와 붙인 사진 하나를 잇는다. 판정어·점수는 없다
  let linkNext = null;          // '이 항목 사진 찍기'로 들어간 경우, 다음에 붙이는 사진을 그 항목에 잇는다
  for (const c of R.CHECKS) {
    const li = document.createElement("li"), l = document.createElement("label"), cb = document.createElement("input"), t = document.createElement("span"), more = document.createElement("div");
    l.className = "check"; l.htmlFor = cb.id = `ck-${c.id}`; cb.type = "checkbox"; t.textContent = `${c.label} (${c.hint})`;
    more.className = "ck-more"; more.hidden = true;
    const ml = document.createElement("label"), m = document.createElement("input"), pl = document.createElement("label"), sel = document.createElement("select"), shot = document.createElement("button");
    ml.htmlFor = m.id = `ckm-${c.id}`; ml.textContent = "본 것 한 줄 (선택)"; m.maxLength = R.CHECK_MEMO_MAX; m.autocomplete = "off"; m.placeholder = "이름·전화번호는 적지 마세요";
    pl.htmlFor = sel.id = `ckp-${c.id}`; pl.textContent = "이 항목의 사진";
    shot.type = "button"; shot.className = "ghost"; shot.textContent = "이 항목 사진 찍기";
    shot.addEventListener("click", () => { linkNext = c.id; document.querySelector('label[for="shot"]').click(); });
    cb.addEventListener("change", () => { more.hidden = !cb.checked; });
    l.append(cb, t); more.append(ml, m, pl, sel, shot); li.append(l, more); $("checkList").append(li);
  }
  function drawCheckPhotos() {
    for (const c of R.CHECKS) {
      const sel = $(`ckp-${c.id}`), v = sel.value;
      sel.textContent = ""; sel.append(new Option("사진 없음", ""));
      pending.forEach((p, i) => sel.append(new Option(`사진 ${i + 1}`, p.id)));
      sel.value = pending.some((p) => p.id === v) ? v : "";
    }
  }
  const checkTarget = () => { $("checkBox").hidden = !R.CHECK_TARGETS.includes(picked("target")); };
  $("targets").addEventListener("change", checkTarget);
  checkTarget(); drawCheckPhotos();
  const readChecks = () => R.CHECKS.filter((c) => $(`ck-${c.id}`).checked).map((c) => ({ id: c.id, memo: $(`ckm-${c.id}`).value, photo: $(`ckp-${c.id}`).value }));
  function clearChecks() {
    for (const c of R.CHECKS) { $(`ck-${c.id}`).checked = false; $(`ckm-${c.id}`).value = ""; $(`ckp-${c.id}`).value = ""; $(`ck-${c.id}`).closest("li").querySelector(".ck-more").hidden = true; }
  }
  // 입안요건 사전검토(redev.html)의 '현장 확인' 줄에서 왔으면(?check=road) 그 항목을 미리 고른다. 대상 유형은 그 항목이 보이는 '주거지 골목'
  const fromCheck = R.CHECKS.find((c) => c.id === new URLSearchParams(location.search).get("check"));
  if (fromCheck) {
    const t = document.querySelector('input[name="target"][value="주거지 골목"]');
    t.checked = true; checkTarget(); $("checkBox").open = true;
    $(`ck-${fromCheck.id}`).checked = true; $(`ck-${fromCheck.id}`).closest("li").querySelector(".ck-more").hidden = false;
    // 위쪽 안내가 다 그려진 뒤에 내려야 자리가 맞는다. html의 smooth 스크롤은 배포 화면에서 움직이지 않은 적이 있어(2026-10-30) 바로 옮긴다
    const show = () => $(`ck-${fromCheck.id}`).closest("li").scrollIntoView({ block: "center", behavior: "instant" });
    if (document.readyState === "complete") show(); else window.addEventListener("load", show, { once: true });
  }
  $("item").append(new Option("고르지 않음", ""));
  for (const v of R.ITEMS) $("item").append(new Option(v, v));

  // ── 자주 쓰는 한 줄(A2): 대상 유형별로 이 기기(localStorage)에만 둔다. ZIP 내보내기에 넣지 않는다(개인 습관 정보)
  const phrases = () => storeJson(PHRASE_KEY) || {};
  const tKey = () => picked("target") || "기타";
  function drawPhrases() {
    const box = $("phrases"), list = phrases()[tKey()] || [];
    box.textContent = "";
    for (const text of list) {
      const b = document.createElement("button");
      let timer = 0, long = false;
      b.type = "button"; b.textContent = text; b.setAttribute("aria-label", `메모에 붙이기: ${text}`);
      const stop = () => clearTimeout(timer);
      b.addEventListener("pointerdown", () => { long = false; timer = setTimeout(() => {
        long = true; const all = phrases(); all[tKey()] = (all[tKey()] || []).filter((x) => x !== text); storeJson(PHRASE_KEY, all); drawPhrases(); toast("자주 쓰는 한 줄을 지웠습니다.");
      }, 650); });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        if (long) return;
        const m = $("memo"); m.value = m.value.trim() ? `${m.value.trim()} ${text}` : text;
        const all = phrases(); all[tKey()] = R.rememberPhrase(all[tKey()], text); storeJson(PHRASE_KEY, all);   // 쓴 것을 맨 앞으로
      });
      box.append(b);
    }
    $("phraseBox").hidden = !list.length;
  }
  if (canStore) {
    $("keepBox").hidden = false;
    $("targets").addEventListener("change", () => { store(TARGET_KEY, picked("target")); drawPhrases(); });
    drawPhrases();
  }

  // ── 저장
  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      // 붙인 사진은 '가림 확인' 칸을 거쳐야 pending에 들어오므로 photoSafe는 그 확인을 뜻한다
      const dong = place && place.code ? { code: place.code, name: place.name, sgName: place.sgName, sido: place.sido, nearby: place.nearby.map((x) => x.name), boundary: place.boundary } : null;
      const rec = R.makeRecord({ pnu: $("pnu").value, jibun: $("jibun").value, target: picked("target"), item: $("item").value, observed: $("observed").value,
        status: picked("status"), memo: $("memo").value, checker: $("checker").value, photos: pending.map((p) => p.id), photoSafe: true, checks: readChecks(), building: chosen,
        ...(pos ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, corrected, gps } : {}), dong, indicators: dong ? place.rows : [], snapshot: dong ? place.snapshot : null,
        ...(site ? { site_id: site.id, site_radius_m: radius(), prev_photos: [...site.photos],
          site_prev: (await S.records()).filter((r) => E.siteOf(r) === site.id).map((r) => r.recorded_at) } : {}) }, new Date());
      // 자주 쓰는 한 줄 저장은 기록 저장보다 먼저 검사한다(개인정보 꼴이면 둘 다 저장하지 않는다)
      const keep = canStore && $("keepPhrase").checked && rec.memo ? R.rememberPhrase(phrases()[rec.target], rec.memo) : null;
      await S.tx(["records", "photos"], "readwrite", (rs, ps) => { for (const p of pending) ps.add({ id: p.id, blob: p.blob }); return rs.add(rec); });
      for (const p of pending) URL.revokeObjectURL(p.url);
      pending = []; drawThumbs();
      for (const id of ["observed", "memo"]) $(id).value = "";
      if (keep) { const all = phrases(); all[rec.target] = keep; storeJson(PHRASE_KEY, all); drawPhrases(); }
      store(TARGET_KEY, rec.target);
      store(CHECKER_KEY, rec.checker || "");
      // 다음 기록은 '모름'에서 시작한다
      document.querySelector('input[name="status"][value="추가확인"]').checked = true; $("item").value = ""; $("keepPhrase").checked = false; clearChecks();
      site = null; siteText(); drawNear();
      say("");
      toast("저장했습니다.", "되돌리기", async () => { await S.deleteRecord(rec); toast("저장을 되돌렸습니다."); render(); }, true);
      await render();
    } catch (err) { say(err.message, true); }
  });

  // ── 1쪽 문서: 한글(HWPX)은 바로 받고 보관함에도 남긴다. PDF는 인쇄 창에서 'PDF로 저장'
  // ids: [[사진 id, 이전 기록 날짜 또는 null]]. 날짜가 undefined면(그 기록이 지워짐) 뺀다
  async function loadImages(ids) {
    const images = [];
    for (const [id, prev] of ids) {
      if (prev === undefined) continue;
      const blob = await S.photo(id); if (!blob) continue;
      const bmp = await createImageBitmap(blob);
      images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height, src: URL.createObjectURL(blob), ...(prev ? { prev } : {}) });
      bmp.close();
    }
    return images;
  }
  async function docOf(rec) {
    await templates;
    const all = (rec.prev_photos || []).length || rec.site_id ? await S.records() : [];
    // 이 기록 사진 다음에, 묶을 때 고른 같은 자리 이전 기록 사진(그 기록이 지워졌으면 뺀다)
    const images = await loadImages([...(rec.photos || []).map((id) => [id, null]), ...(rec.prev_photos || []).map((id) => [id, (all.find((r) => (r.photos || []).includes(id)) || {}).recorded_at])]);
    return { doc: E.buildFieldDoc(rec, images, E.prevAtSite(all, rec)), images };
  }
  async function hwpx(rec) {
    try {
      const { doc, images } = await docOf(rec), bytes = D.hwpxBytes(doc), name = `${E.fileName(rec)}.hwpx`;
      images.forEach((i) => URL.revokeObjectURL(i.src));
      D.saveBytes(name, bytes, "application/hwp+zip");
      await S.addDoc({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, kind: "hwpx", created_at: new Date().toISOString(), record_id: rec.id, blocks: R.blockSnapshot(doc), blob: new Blob([bytes], { type: "application/hwp+zip" }) });
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

  // 해명서 부록: 지표별 출처·기준일·판본·참고선·가림 기록. 1쪽과 같은 기록의 숫자만 쓴다
  async function explainer(rec) {
    try {
      await templates;
      const refs = await fetch("../data/national/ref_lines.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const doc = E.buildExplainer(rec, new Date(), refs), bytes = D.hwpxBytes(doc), name = `${E.fileName(rec)}_해명서부록.hwpx`;
      D.saveBytes(name, bytes, "application/hwp+zip");
      await S.addDoc({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, kind: "hwpx", created_at: new Date().toISOString(), record_id: rec.id, blocks: R.blockSnapshot(doc), blob: new Blob([bytes], { type: "application/hwp+zip" }) });
      toast(`${name} 파일을 받았습니다.
보관함에서 다시 받을 수 있습니다.`);
    } catch (e) { toast("해명서 부록을 만들지 못했습니다."); }
  }

  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  async function render() {
    let rows = await S.records();
    $("stats").innerHTML = R.statsHTML(R.stats(rows, new Date()));   // 개수 요약(순위 아님)
    // 같은 지점끼리 모아 보기: 지점은 최근 기록 순, 지점 안은 날짜 순(전·후 비교의 바탕). 순위·점수는 없다
    const group = new Map();
    for (const r of rows) { const k = E.siteOf(r); if (!group.has(k)) group.set(k, []); group.get(k).push(r); }
    if ($("bySite").checked) rows = [...group.values()].flatMap((g) => g.slice().reverse());
    $("today").textContent = `오늘 ${rows.filter((r) => isToday(r.recorded_at)).length}건`;
    const ul = $("list"); ul.textContent = "";
    for (const r of rows) {
      const li = document.createElement("li"), b = document.createElement("b"), m = document.createElement("div"), acts = document.createElement("div");
      b.textContent = `${r.dong ? `${r.dong.sgName} ${r.dong.name}` : r.jibun || r.pnu || R.NO_PARCEL} · ${r.target || r.item || "기록"}`;
      m.className = "meta";
      m.textContent = `${E.localTime(r.recorded_at)}${r.accuracy_m !== null && r.accuracy_m !== undefined ? ` · ±${Math.round(r.accuracy_m)}m` : ""}${r.corrected ? " · 보정됨" : ""}${r.parcel ? ` · ${r.parcel}` : ""}${r.photos && r.photos.length ? ` · 사진 ${r.photos.length}장` : ""}${group.get(E.siteOf(r)).length > 1 ? ` · 같은 지점 ${group.get(E.siteOf(r)).length}건` : ""}${r.imported ? " · 가져옴" : ""}`;
      acts.className = "row";
      for (const [label, fn] of [["한글 1쪽 받기", hwpx], ["PDF로 저장", pdf], ["해명서 부록 받기", explainer]]) {
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "ghost"; btn.textContent = label;
        btn.addEventListener("click", () => fn(r)); acts.append(btn);
      }
      const pick = document.createElement("label"), pc = document.createElement("input"), pt = document.createElement("span");
      pick.className = "check"; pc.type = "checkbox"; pc.checked = gisPick.has(r.id); pt.textContent = "GIS로 받을 기록으로 고르기";
      pc.addEventListener("change", () => { if (pc.checked) gisPick.add(r.id); else gisPick.delete(r.id); });
      pick.append(pc, pt);
      li.append(b, m, acts, pick); ul.append(li);
    }
  }
  // ── GIS 내보내기(N2): 고른 기록(없으면 모두)을 GeoJSON·CSV로. 사진은 빼고 사진 파일 이름만 적는다
  const gisPick = new Set();
  async function gisRows() { const all = await S.records(), some = all.filter((r) => gisPick.has(r.id)); return some.length ? some : all; }
  const stamp = () => { const t = new Date(); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}_${pad2(t.getHours())}${pad2(t.getMinutes())}`; };
  const pad2 = (n) => String(n).padStart(2, "0");
  $("geojson").addEventListener("click", async () => { const rows = await gisRows(); D.saveBytes(`renewmap-field-${stamp()}.geojson`, JSON.stringify(R.toGeoJSON(rows, new Date()), null, 2), "application/geo+json"); toast(`${rows.length}건을 GeoJSON으로 받았습니다.`); });
  $("csv").addEventListener("click", async () => { const rows = await gisRows(); D.saveBytes(`renewmap-field-${stamp()}.csv`, R.toCSV(rows), "text/csv;charset=utf-8"); toast(`${rows.length}건을 CSV로 받았습니다.`); });
  // 사진대지: GIS와 같은 고르기(없으면 모두). 오래된 기록부터
  $("sheet").addEventListener("click", async () => {
    try {
      await templates;
      const rows = (await gisRows()).slice().sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at))), items = [];
      for (const rec of rows) items.push({ rec, images: await loadImages((rec.photos || []).map((id) => [id, null])) });
      const doc = E.buildPhotoSheet(items, new Date());
      items.forEach((x) => x.images.forEach((i) => URL.revokeObjectURL(i.src)));
      if (!doc.photos) { toast("사진이 있는 기록이 없습니다."); return; }
      const name = `현장사진대지_${stamp()}.hwpx`, bytes = D.hwpxBytes(doc);
      D.saveBytes(name, bytes, "application/hwp+zip");
      await S.addDoc({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, kind: "hwpx", created_at: new Date().toISOString(), blocks: R.blockSnapshot(doc), blob: new Blob([bytes], { type: "application/hwp+zip" }) });
      toast(`사진 ${doc.photos}장으로 사진대지를 받았습니다.\n보관함에서 다시 받을 수 있습니다.`);
    } catch (e) { toast("사진대지를 만들지 못했습니다."); }
  });

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

  $("bySite").addEventListener("change", () => render());

  // ── ZIP 가져오기(A4): 같은 id는 건너뛰고, 이미 있는 사진도 덮어쓰지 않는다. 가져온 기록에는 '가져옴'이 붙는다
  $("importZip").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      if (f.size > R.LIMITS.zip) throw new Error("파일이 너무 큽니다.\n100MB 이하만 가져올 수 있습니다.");
      const got = R.parseImport(new Uint8Array(await f.arrayBuffer()), new Date()), have = new Set((await S.records()).map((r) => r.id));
      let added = 0, same = 0;
      for (const rec of got.records) {
        if (have.has(rec.id)) { same++; continue; }
        try {
          await S.tx(["records", "photos"], "readwrite", (rs, ps) => {
            for (const id of [...rec.photos, ...rec.prev_photos]) { const q = ps.count(id); q.onsuccess = () => { if (!q.result) ps.add({ id, blob: new Blob([got.photos.get(id)], { type: "image/jpeg" }) }); }; }
            return rs.add(rec);
          });
          added++;
        } catch (err) { same++; }
      }
      toast(`${added}건을 가져왔습니다.${same ? `\n이미 있는 ${same}건은 건너뛰었습니다.` : ""}${got.skipped ? `\n형식이 맞지 않는 ${got.skipped}건은 받지 않았습니다.` : ""}`);
      await render(); drawNear();
    } catch (err) { toast(err.message); }
  });

  if (!store("renewmap-field-intro")) { $("intro").hidden = false; store("renewmap-field-intro", "1"); }
  // 위치 권한이 이미 있으면 바로 받는다. 처음이면 사진 찍기·'현재 위치 받기'를 누를 때 한 번 묻는다
  if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then((s) => { if (s.state === "granted") locate(); }).catch(() => {});
  render().catch(() => say("이 브라우저에서는 기기 저장소를 쓸 수 없습니다.", true));
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    // ready는 앱 셸을 다 저장한 서비스 워커가 켜져야 풀린다. 현장에 나가기 전에 오프라인으로 열리는지 보이게 한다(감사 이수진2)
    navigator.serviceWorker.ready.then(() => { $("ready").hidden = false; });
  }
  // 홈 화면 추가(감사 이수진3). 크롬·삼성 인터넷은 beforeinstallprompt를 주고, iOS 사파리는 주지 않아 공유 메뉴를 한 번 안내한다
  let installAsk = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installAsk = e; $("install").hidden = false; });
  window.addEventListener("appinstalled", () => { $("install").hidden = true; });
  $("installGo").addEventListener("click", () => { $("install").hidden = true; if (installAsk) installAsk.prompt(); installAsk = null; });
  if (navigator.standalone === false && !store("renewmap-field-install")) {
    $("installMsg").textContent = "사파리 아래의 공유 버튼 → '홈 화면에 추가'를 누르면 앱처럼 바로 열립니다.";
    $("installGo").textContent = "알겠습니다";
    $("install").hidden = false;
    store("renewmap-field-install", "1");
  }
  checkData();
  window.addEventListener("online", checkData);
})();
