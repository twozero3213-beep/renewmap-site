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
  let fixAt = 0;              // 지금 위치(GPS)를 받은 때(ms). 첫 기록의 위치가 다음 기록에 말없이 쓰이지 않게 화면에 보이고 저장 때 따진다(B11)
  let place = null;           // E.makeLocator().locate 결과 + 공식 현황
  let pending = [];           // 이번 기록에 붙일 사진 [{id, blob, url}]
  let edit = null;            // 편집 중 사진 {canvas(원본), boxes:[], drag, start}
  let photoLoadEpoch = 0;     // 늦게 열린 이전 사진이 새 사진·취소 결과를 덮지 않게 한다
  let draft = null;           // 손 보정 중 핀 {lat,lng}
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; };
  // localStorage가 막힌 브라우저(사생활 모드 등)에서는 기억 기능만 끄고 기록 저장은 그대로 된다
  const canStore = (() => { try { localStorage.setItem("renewmap-probe", "1"); localStorage.removeItem("renewmap-probe"); return true; } catch (e) { return false; } })();
  const storeJson = (k, v) => { if (v !== undefined) return store(k, JSON.stringify(v)); try { return JSON.parse(store(k)) || null; } catch (e) { return null; } };

  // 오류는 role=alert로 바로 읽히게 한다(2026-11-18 접근성 검토: 저장 실패가 status로만 뒤늦게 읽혔다). 역할을 먼저 바꾸고 글을 넣는다
  let toastTimer = 0;
  function say(text, err) {
    document.querySelector(".save-bar").prepend($("msg"));
    $("msg").setAttribute("role", err ? "alert" : "status"); $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg";
    // 직전 '저장했습니다' 토스트가 오류와 4초간 겹치며 칸을 덮지 않게 오류가 뜨면 닫는다(3차 UX2-05)
    if (err) { $("toast").hidden = true; clearTimeout(toastTimer); $("msg").scrollIntoView({ block: "nearest" }); }
  }
  // 칸 오류는 위 알림에 칸 수만 쓰고 문장은 칸 아래에만 둔다(한 칸일 때 같은 문장이 알림·aria-describedby로 두 번 읽혔다, 3차 UX2-05)
  const errText = (err) => (err.fields && err.fields.length ? `${err.fields.length}개 칸을 고쳐 주세요.` : err.message);
  // 검증 오류가 칸을 알려 주면 그 칸을 열고 오류 문구와 이어 준 뒤 초점을 준다
  function focusFields(fields) {
    const el = fields && fields[0] && $(fields[0].id);
    if (!el) return;
    for (let d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
    // 칸마다 자기 오류 문장을 아래에 두고 aria-describedby로 잇는다(첫 칸만 설명하던 것을 고침, 3차 UX2-05)
    for (const x of fields) {
      const t = $(x.id); if (!t) continue;
      let p = $("err-" + x.id);
      if (!p) { p = document.createElement("p"); p.id = "err-" + x.id; p.className = "msg err field-err"; t.after(p); }
      p.textContent = x.msg;
      t.setAttribute("aria-invalid", "true"); t.setAttribute("aria-describedby", p.id);
      t.addEventListener("input", () => { t.removeAttribute("aria-invalid"); t.removeAttribute("aria-describedby"); p.remove(); }, { once: true });
    }
    el.before($("msg"));
    el.focus();
  }
  function toast(text, actLabel, act, ok) {
    const t = $("toast"), b = $("toastAct");
    t.classList.toggle("ok", !!ok);
    if (ok) { t.hidden = true; void t.offsetWidth; }   // 이미 떠 있어도 체크 표시를 다시 그린다
    $("toastText").textContent = text; b.hidden = !actLabel; b.textContent = actLabel || "";
    b.onclick = act ? () => { t.hidden = true; act(); } : null;
    t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }
  const badge = () => { $("recBadge").hidden = !(edit || pending.length); };
  // 한 번 묻기(붙이지 않은 사진·묵은 위치·저장하지 않은 사진). 두 단추 중 하나를 누르면 닫는다. at: 이 칸 앞에 띄운다(기본은 저장 단추 앞)
  function ask(text, [yes, onYes], [no, onNo], at) {
    const box = $("ask");
    (at || document.querySelector("button.save")).before(box);
    $("askText").textContent = text; $("askYes").textContent = yes; $("askNo").textContent = no;
    $("askYes").onclick = () => { box.hidden = true; onYes(); };
    $("askNo").onclick = () => { box.hidden = true; onNo(); };
    box.hidden = false; $("toast").hidden = true;
    box.scrollIntoView({ block: "nearest" }); $("askYes").focus();
  }

  // ── 자료(오프라인 경계·현황). 서비스 워커가 처음 받은 파일을 저장해 둔다
  const getJson = (p) => fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  // 2026-11-08: national/emd·living 파일은 원장 셀을 줄여 저장한다(cell_pack). 받자마자 원래 모양으로 되돌린다(../cellpack.js, index.html에서 먼저 싣는다)
  const L = E.makeLocator((p) => getJson("national/" + p).then((j) => window.RenewCellPack.unpack(j)));
  const templates = getJson("report_templates.json").then((t) => D.setTemplates(t)).catch(() => null);

  // 위치 줄(B11): '14:02에 받은 위치(3분 전) · 오차 18m'. 5분이 넘으면 경고 색과 '지금 위치 다시 받기' 채운 단추, 저장 때 10분이 넘으면 한 번 묻는다.
  // 지난 시간은 화면 낭독기가 1분마다 읽지 않게 aria-hidden 칸에만 고쳐 쓰고(tickAge), 5분을 넘은 뒤(경고 상태)에만 줄 전체를 다시 써서 알린다
  const STALE_MS = 5 * 60000, ASK_MS = 10 * 60000;
  const ageMin = () => Math.floor((Date.now() - fixAt) / 60000);
  const agoText = () => (ageMin() < 1 ? "(방금)" : `(${ageMin()}분 전)`);
  const isStale = () => !!pos && Date.now() - fixAt > STALE_MS;   // 손으로 고친 위치도 정한 때(fixAt)부터 센다
  let locNote = "", staleShown = false, staleMin = -1;
  function locLine(note = "") {
    locNote = note;
    if (!pos) return;
    const m = Math.round(pos.accuracy || 0), stale = isStale(), line = $("locLine"), ago = document.createElement("span");
    staleShown = stale; staleMin = stale ? ageMin() : -1;
    ago.className = "loc-ago"; ago.setAttribute("aria-hidden", "true"); ago.textContent = stale ? "" : agoText();   // 묵었으면 아래 경고 줄이 지난 시간을 말한다
    line.textContent = `${D.localDate(fixAt, true).split(" ")[1]}에 받은 위치`;
    line.append(ago, ` · 오차 ${m}m${corrected ? " · 보정됨" : ""}${stale ? `\n${ageMin()}분 전에 받은 위치입니다.` : ""}${note ? `\n${note}` : ""}`);
    // 색은 보조이고 글이 본 정보다: 묵은 위치·넓은 오차(50m 초과)는 경고 색
    line.dataset.q = stale ? "stale" : m <= 20 ? "good" : m <= 50 ? "ok" : "wide";
    $("gps").textContent = "지금 위치 다시 받기"; $("gps").classList.toggle("ghost", !stale);
    $("fix").disabled = false;
    locSum();
  }
  function tickAge() {
    if (!pos) return;
    // 묵은 상태로 바뀌는 순간과 묵은 동안 분이 바뀔 때만 줄 전체를 다시 써서 읽게 한다(경고 줄의 'n분 전'이 맞도록)
    if (isStale() !== staleShown || (staleShown && ageMin() !== staleMin)) return locLine(locNote);
    if (staleShown) return;
    const ago = $("locLine").querySelector(".loc-ago");
    if (ago) ago.textContent = agoText();
  }
  setInterval(tickAge, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tickAge(); });
  // 접힌 위치·통계 한 줄(M22): '{구} {동} · 오차 {m}m · 이 동 통계 {n}개(출처·기준일 표시)가 기록에 함께 붙습니다'
  function locSum() {
    const n = place && place.rows ? place.rows.length : 0;
    $("locSum").textContent = [place && place.code ? `${place.sgName} ${place.name}` : "", pos ? `오차 ${Math.round(pos.accuracy || 0)}m` : "",
      n ? `이 동 통계 ${n}개(출처·기준일 표시)가 기록에 함께 붙습니다` : ""].filter(Boolean).join(" · ") || "위치와 이 동 통계";
  }
  async function lookup() {
    const filled = chosen || parcel;
    if (filled) for (const id of ["jibun", "pnu"]) if ($(id).value === (filled[id] || "")) $(id).value = "";
    clearParcel();
    place = null; drawBld(null); $("facts").hidden = true; locSum();
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
    } catch (e) { if (at !== pos) return; drawBld(null); $("dongLine").textContent = "행정동 자료를 불러오지 못했습니다.\n인터넷에 한 번 연결되면 다음부터는 오프라인에서도 찾습니다."; }
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
    locSum();
  }

  // ── 가까운 건물(N1): 행정동에서 근사한 법정동의 건물 자료(buildings/{법정동}.json)를 지번으로 찾는다. 사람이 고르기 전에는 채우지 않는다.
  // 건물 자료는 처음 찾을 때 받고(서비스 워커가 오프라인용으로 저장), 위치는 기기 밖으로 보내지 않는다(받는 파일 이름은 법정동 코드뿐)
  let bjds = [], chosen = null, bldOffset = 0, bldQuery = "", bldSearchSeq = 0;
  const bldPageSize = 3, bldFiles = new Map();
  const bldGet = (code) => { if (!bldFiles.has(code)) bldFiles.set(code, getJson(`buildings/${code}.json`).catch(() => { bldFiles.delete(code); return null; })); return bldFiles.get(code); };
  const line = (text, cls) => { const li = document.createElement("li"); li.textContent = text; if (cls) li.className = cls; return li; };
  function drawBld(cands) {
    bjds = cands || []; chosen = null; bldOffset = 0; bldQuery = ""; bldSearchSeq++;
    $("bldQ").value = ""; $("bldList").textContent = ""; $("bldPicked").hidden = true;
    $("bldPages").hidden = true; $("bldRange").textContent = "";
    $("bld").hidden = !place;
    $("bldFind").hidden = !bjds.length;
    $("bldNote").textContent = bjds.length
      ? `법정동 ${bjds.map((b) => b.name).join("·")}의 건축물대장에서 찾습니다.\n법정동은 행정동에서 근사해 골랐습니다.\n건물 자료에 좌표가 없어 사진 위치로 거리를 재지 못합니다.\n같은 본번에서 부번이 가까운 순으로 3동씩 보여 줍니다.`
      : "이 지역은 건물 자료가 아직 없습니다.\n지번은 위의 '위치를 못 받으면 지번으로 적기'에 직접 적어 주세요.";
  }
  function pickedText() {
    $("bldPicked").hidden = !chosen;
    if (chosen) $("bldPicked").textContent = `자동 채움 · 건축물대장 기준일 ${D.govDate(chosen.reference_date)}\n${chosen.bjd_name} ${chosen.jibun || ""} · 사용승인 ${chosen.use_apr_day ? D.govDate(chosen.use_apr_day) : "자료 없음"} · ${chosen.main_use || "-"} · ${chosen.structure || "-"} · ${chosen.floors === null ? "층수 자료 없음" : `지상 ${chosen.floors}층`}\n지번이나 필지 번호를 고치면 자동 채움을 지웁니다.`;
  }
  const same = (b, f) => {
    if (!chosen || chosen.bjd10 !== f.bjd10) return false;
    const id = R.buildingId(b.mgm_bld_pk), picked = R.buildingId(chosen.mgm_bld_pk);
    if (id !== null && picked !== null) return id === picked;
    return chosen.jibun === b.jibun && chosen.main_use === b.main_use && chosen.structure === b.structure && chosen.use_apr_day === b.use_apr_day && chosen.floors === b.floors;
  };
  async function searchBld() {
    const q = $("bldQ").value, seq = ++bldSearchSeq, ul = $("bldList");
    if (q !== bldQuery) { bldQuery = q; bldOffset = 0; }
    ul.textContent = ""; $("bldRange").textContent = ""; $("bldPages").hidden = true;
    if (!q.trim()) return;
    const validation = E.findBuildings([], q);
    if (validation.error) { ul.append(line(validation.error, "hint")); return; }
    const files = (await Promise.all(bjds.map((b) => bldGet(b.code10)))).filter(Boolean);
    if (seq !== bldSearchSeq) return;     // 이전 지번·페이지·법정동의 응답은 새 목록을 덮지 않는다
    const { hits, total } = E.findBuildings(files, q, bldPageSize, bldOffset);
    if (!files.length) { ul.append(line("건물 자료를 불러오지 못했습니다.\n자료 공개 범위와 연결 상태를 확인해 주세요. 지번은 직접 기록할 수 있습니다.", "hint")); return; }
    if (!hits.length) { ul.append(line("그 지번의 건물을 찾지 못했습니다.\n지번만 적어 두어도 문서에 남습니다.", "hint")); return; }
    for (const { b, f } of hits) {
      const li = document.createElement("li"), btn = document.createElement("button"), on = same(b, f);
      btn.type = "button"; btn.className = on ? "" : "ghost"; btn.setAttribute("aria-pressed", String(on));
      btn.textContent = `${f.name} ${b.jibun}\n${b.main_use || "주용도 자료 없음"} · ${b.structure || "구조 자료 없음"} · ${b.floors == null ? "층수 자료 없음" : `지상 ${b.floors}층`} · 사용승인 ${b.use_apr_day ? D.govDate(b.use_apr_day) : "자료 없음"}`;
      btn.addEventListener("click", () => {
        chosen = on ? null : E.buildingFill(b, f);
        $("jibun").value = chosen ? chosen.jibun || "" : ""; $("pnu").value = chosen ? chosen.pnu || "" : "";
        pickedText(); searchBld();
      });
      li.append(btn); ul.append(li);
    }
    $("bldRange").textContent = `같은 본번 ${total}동 중 ${bldOffset + 1}–${bldOffset + hits.length}동 · ${Math.floor(bldOffset / bldPageSize) + 1}/${Math.ceil(total / bldPageSize)}페이지`;
    $("bldPages").hidden = total <= bldPageSize;
    $("bldPrev").disabled = bldOffset === 0;
    $("bldNext").disabled = bldOffset + hits.length >= total;
  }
  $("bldQ").addEventListener("input", searchBld);
  $("bldPrev").addEventListener("click", () => { bldOffset = Math.max(0, bldOffset - bldPageSize); searchBld(); });
  $("bldNext").addEventListener("click", () => { bldOffset += bldPageSize; searchBld(); });

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
    const at = pos, r = await vwAsk(at.lng, at.lat), p = r.props ? E.parcelFrom(r.props) : null;
    btn.disabled = false;
    if (at !== pos) return;
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
      // 기기에 받아 둔 index.json이 없으면(처음 열기) 지금 받는 것이 곧 최신이라 비교할 것이 없다 → 받기만 한다(뒤의 위치 찾기가 같은 약속을 다시 쓴다)
      const url = DATA + "national/index.json";
      const hit = window.caches ? await caches.match(url).catch(() => null) : null;
      if (!hit) { await L.get("index.json"); return; }
      // 있으면 서버에 한 번만 묻는다. no-cache: 서비스 워커 캐시를 건너뛰고 바뀌었는지만 묻는다(안 바뀌었으면 304)
      const [cur, latest] = await Promise.all([hit.json(), fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null))]);
      $("newData").hidden = !E.isNewData(cur, latest);
    } catch (e) { /* 오프라인·일시 오류면 다음 세션에 다시 본다 */ }
  }
  // 받기: 기기에 받아 둔 행정동 경계·현황·건물 자료만 지우고 다시 연다(sw.js가 건물 파일도 계속 보관하므로 함께 지운다). 저장한 기록은 숫자를 기록 안에 갖고 있어 바뀌지 않는다
  $("newDataGet").addEventListener("click", async () => {
    $("newDataGet").disabled = true;
    try {
      for (const k of await caches.keys()) {
        if (!k.startsWith("renewmap-field-")) continue;
        const c = await caches.open(k);
        for (const q of await c.keys()) if (/\/data\/(national|buildings)\//.test(q.url)) await c.delete(q);
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
    $("unlinkVisit").hidden = !site;
    $("visitPrevious").textContent = E.revisitText(site && site.from);
    // 재방문 띠(M23): 사진 단추 바로 위에 어느 기록과 같은 지점인지. 재방문으로 들어온 동안은 '이 지점 재방문을 누르세요' 안내를 숨긴다
    $("visitBanner").hidden = !site; $("visitHow").hidden = !!site;
    if (site) $("visitBanner").textContent = `재방문 · ${D.localDate(site.from.recorded_at)} ${site.from.target || "기록"} 기록과 같은 지점`;
    if (site) $("siteLine").textContent = `같은 지점으로 묶었습니다.\n이전 기록 ${E.localTime(site.from.recorded_at)}${site.photos.size ? ` · 이전 사진 ${site.photos.size}장을 1쪽에 넣습니다` : ""}`;
  }
  // 반경 바꾸기·묶기·저장이 겹치면 앞선 호출이 await 뒤에 같은 목록에 이어 붙인다. 마지막 호출만 그린다
  let nearSeq = 0;
  async function drawNear() {
    const seq = ++nearSeq;
    nearUrls.forEach((u) => URL.revokeObjectURL(u)); nearUrls = [];
    const ul = $("nearList"); ul.textContent = "";
    if (!pos) { $("near").hidden = true; return; }
    const at = pos, near = E.nearbyRecords(await S.records(), at.lat, at.lng, radius());
    if (at !== pos || seq !== nearSeq) return;
    if (site && !near.some((x) => E.siteOf(x.rec) === site.id)) { site = null; siteText(); }
    $("near").hidden = !near.length;
    $("nearSum").textContent = `이 근처 이전 기록 ${near.length}건 (반경 ${radius()}m)`;
    for (const { rec, dist } of near) {
      const li = document.createElement("li"), body = document.createElement("div"), head = document.createElement("b"), meta = document.createElement("div"), btn = document.createElement("button");
      const first = rec.photos && rec.photos[0] && await S.photo(rec.photos[0]);
      if (seq !== nearSeq) return;
      if (first) { const img = document.createElement("img"), u = URL.createObjectURL(first); nearUrls.push(u); img.src = u; img.alt = `${E.localTime(rec.recorded_at)} 기록 사진`; img.width = 64; img.height = 64; li.append(img); }
      else { const blank = document.createElement("span"); blank.className = "blank"; li.append(blank); }
      head.textContent = `${E.localTime(rec.recorded_at)} · ${rec.target}${rec.imported ? " · 가져옴" : ""}`;
      meta.className = "meta";
      meta.textContent = `${dist}m 떨어짐 · 그때 오차 ${rec.accuracy_m === null ? "자료 없음" : `±${Math.round(rec.accuracy_m)}m`} · 지금 오차 ±${Math.round(at.accuracy || 0)}m${rec.memo ? `\n${rec.memo}` : ""}`;
      const bound = site && site.from.id === rec.id;
      btn.type = "button"; btn.className = "ghost"; btn.textContent = bound ? "묶기 풀기" : "같은 지점으로 묶기";
      btn.addEventListener("click", () => { site = bound ? null : { id: E.siteOf(rec), from: rec, radius: radius(), photos: new Set() }; siteText(); drawNear(); });
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
  // 위치 다듬기(2026-11-21): 휴대폰 GPS는 첫 값 뒤 몇 초 사이에 오차가 좁아진다. 첫 값을 바로 보여 주고
  // 최대 GPS_WAIT 동안 더 들으며 오차가 가장 작은 값만 쓴다. GPS_GOOD 이하가 오면 바로 멈춘다. 캐시 값은 받지 않는다(maximumAge 0)
  const GPS_GOOD = 15, GPS_WAIT = 15000, GPS_WIDE = 50;
  let gpsStop = null;                                               // 앞선 요청 끄기(다시 누르면 옛 요청의 타이머가 새 요청을 끊지 않게 요청마다 따로 쥔다)
  const NO_FIX = "위치를 받지 못했습니다.\n아래 '위치를 못 받으면 지번으로 적기'에 지번을 적어 주세요.";
  const DENIED = "위치 권한이 꺼져 있습니다. 주소창 왼쪽 자물쇠 → 위치 → 허용으로 켜거나, 지번으로 적어 주세요.";
  function locate() {
    if (!navigator.geolocation) { $("locLine").textContent = NO_FIX; return; }
    if (gpsStop) gpsStop();
    // 이전 위치가 있으면 지우지 않고 '받는 중'을 덧붙인다(받는 사이에 저장하면 어느 위치로 저장되는지 보이게)
    if (pos) locLine("새 위치를 받는 중입니다."); else $("locLine").textContent = "위치를 받는 중입니다.";
    const wait = (on) => { document.body.classList.toggle("gps-wait", on); $("gps").setAttribute("aria-busy", String(on)); };
    wait(true);
    let best = null, looked = null, timer = null, done = false, id = null, denied = false;
    const stop = () => {
      if (done) return false;
      done = true; clearTimeout(timer);
      if (id !== null) navigator.geolocation.clearWatch(id);
      if (gpsStop === stop) gpsStop = null;
      wait(false);
      return true;
    };
    gpsStop = stop;
    const finish = () => {
      if (!stop()) return;
      if (!best) {
        if (!pos) { $("locLine").textContent = denied ? DENIED : NO_FIX; return; }
        locLine(denied ? DENIED : "새 위치를 받지 못해 이전 위치를 그대로 씁니다.");   // '받는 중' 문구가 남지 않게
        return;
      }
      if (corrected) return locLine();                              // 사람이 고친 위치는 그대로 둔다
      locLine(best.accuracy > GPS_WIDE ? "오차가 넓습니다. 실외에서 휴대폰 위치(GPS)를 켜고 다시 받거나 '위치 고치기'로 맞춰 주세요." : "");
      if (looked !== best) { lookup(); drawNear(); }               // 처음 찾은 값보다 좁은 값으로 바뀌었으면 행정동을 다시 찾는다
    };
    id = navigator.geolocation.watchPosition((p) => {
      if (done) return;
      if (corrected && best) { stop(); return; }                   // 기다리는 사이 사람이 위치를 고쳤으면 그 값을 덮지 않고 듣기만 멈춘다
      const c = p.coords;
      if (best && c.accuracy >= best.accuracy) return;
      best = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy };
      gps = best; pos = { ...gps }; corrected = false; fixAt = Date.now();
      locLine(c.accuracy <= GPS_GOOD ? "" : "더 정확한 위치를 기다리는 중입니다.");
      if (!looked) { looked = best; lookup(); drawNear(); }      // 첫 값으로 바로 행정동을 찾아 기다리지 않게 한다
      if (c.accuracy <= GPS_GOOD) finish();
    }, (err) => { if (!best) { denied = !!err && err.code === 1; finish(); } }, { enableHighAccuracy: true, timeout: GPS_WAIT, maximumAge: 0 });
    timer = setTimeout(finish, GPS_WAIT);
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
    pos = { lat: draft.lat, lng: draft.lng, accuracy: gps.accuracy }; corrected = true; fixAt = Date.now();
    $("pinBox").hidden = true; locLine(); lookup(); drawNear();
  });
  $("pinCancel").addEventListener("click", () => { $("pinBox").hidden = true; });

  // ── 사진: 처음 한 번 촬영 사실 표시 안내 → 읽기 → 줄이기(EXIF는 캔버스를 거치며 사라진다) → 가림(모자이크) → JPEG로 붙이기
  const NOTICE_KEY = "renewmap-field-notice-v1";
  function beforeShot(e) {
    if (e.target !== e.currentTarget) return;                  // 라벨 안 입력칸으로 다시 들어온 클릭
    // 1분 넘은 위치는 찍을 때 새로 받는다(다른 건물로 걸어가 찍어도 첫 기록의 좌표가 남던 출시 차단 B11). 사람이 고친 위치는 그대로 둔다
    if (!corrected && (!pos || Date.now() - fixAt > 60000)) locate();
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
    const cv = $("cv");
    return window.FieldDetect.fitPoint(cv.getBoundingClientRect(), cv.width, cv.height, e.clientX, e.clientY);
  }
  async function startEdit(file) {
    if (!file) return;
    closeEdit();
    const epoch = photoLoadEpoch;
    try {
      const canvas = await loadImage(file);
      if (epoch !== photoLoadEpoch) return;
      edit = { canvas, boxes: [], drag: null, start: null, revision: 0, attaching: false };
      const cv = $("cv"); cv.width = canvas.width; cv.height = canvas.height;
      $("safe").checked = false; $("attach").disabled = true; $("editor").hidden = false;
      paint(false); say(""); badge(); syncSave();
      $("editor").scrollIntoView?.({ block: "start" });   // 사진·확인 칸·붙이기가 한 화면에 들어오게(M29)
    } catch (e) { if (epoch === photoLoadEpoch) say("사진을 읽지 못했습니다.\n다른 사진으로 다시 해 보세요.", true); }
  }
  function closeEdit() { photoLoadEpoch++; edit = null; $("editor").hidden = true; $("shot").value = ""; $("album").value = ""; badge(); syncSave(); }
  function invalidatePhotoCheck() {
    if (edit) edit.revision++;
    $("safe").checked = false; $("attach").disabled = true;
  }

  const cv = $("cv");
  cv.addEventListener("pointerdown", (e) => { if (!edit) return; invalidatePhotoCheck(); cv.setPointerCapture(e.pointerId); const p = point(e); edit.start = p; edit.drag = { x: p.x, y: p.y, w: 0, h: 0 }; });
  cv.addEventListener("pointermove", (e) => {
    if (!edit || !edit.drag) return;
    invalidatePhotoCheck();
    const p = point(e), s = edit.start;
    edit.drag = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    paint(true);
  });
  cv.addEventListener("pointerup", () => { if (!edit || !edit.drag) return; invalidatePhotoCheck(); if (edit.drag.w > 12 && edit.drag.h > 12) edit.boxes.push(edit.drag); edit.drag = null; paint(false); });
  cv.addEventListener("pointercancel", () => { if (edit) { invalidatePhotoCheck(); edit.drag = null; paint(false); } });
  $("auto").addEventListener("click", async () => {
    const cur = edit; if (!cur) return;
    invalidatePhotoCheck();
    $("auto").disabled = true; say("얼굴·번호판을 찾는 중입니다.\n처음에는 도구를 받느라 시간이 걸립니다.");
    try {
      const r = await window.FieldDetect.findAll(cur.canvas);
      if (edit !== cur) return;                       // 그 사이 사진을 닫았거나 바꿨으면 버린다
      invalidatePhotoCheck();
      cur.boxes.push(...r.faces, ...r.plates); paint(false);
      const none = !r.faces.length && !r.plates.length;
      say(`얼굴·번호판으로 보이는 곳 ${r.faces.length + r.plates.length}곳을 가렸습니다.\n놓친 곳은 끌어서(휴대폰은 손가락으로) 문질러 가리세요.${r.errors.length ? "\n(" + r.errors.join(" / ") + ")" : ""}`, none && r.errors.length > 0);
    } catch (e) { if (edit === cur) say("자동 찾기를 쓰지 못했습니다.\n직접 가려 주세요.", true); }
    finally { $("auto").disabled = false; }
  });
  $("undo").addEventListener("click", () => { if (edit) { edit.boxes.pop(); invalidatePhotoCheck(); paint(false); } });
  $("cancel").addEventListener("click", () => { linkNext = null; closeEdit(); });
  $("safe").addEventListener("change", () => { $("attach").disabled = !$("safe").checked || !edit || edit.attaching; });
  $("shot").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("album").addEventListener("change", (e) => startEdit(e.target.files[0]));
  $("attach").addEventListener("click", async () => {
    if (!edit || edit.attaching) return;
    if (!$("safe").checked) { say("사진을 붙이기 전에 '얼굴·번호판을 가린 곳을 모두 확인했습니다'를 눌러 주세요.", true); return; }
    if (pending.length + (site ? site.photos.size : 0) >= R.MAX_PHOTOS) { say(`사진은 한 기록에 ${R.MAX_PHOTOS}장까지 붙일 수 있습니다.`, true); return; }
    const cur = edit, revision = cur.revision, link = linkNext;
    cur.attaching = true; $("attach").disabled = true;
    paint(false);
    try {
        // 캔버스에서 새로 만든 JPEG라 원본 EXIF가 없다. 메모리 부족(null)과 동기 예외 모두 다시 시도할 수 있게 한다.
        const blob = await new Promise((resolve) => $("cv").toBlob(resolve, "image/jpeg", 0.82));
        if (!blob) throw new Error("no blob");
        const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        // FR-45: 가림을 마친 이 JPEG 바이트(저장·내보내기되는 그대로)의 SHA-256을 붙이는 순간 계산한다(2026-11-01).
        // 나중에 ZIP 가져오기·원장 확인 이력에서 사진이 바뀌지 않았는지 대조하는 근거가 된다
        const sha256 = R.sha256Hex(new Uint8Array(await blob.arrayBuffer()));
        if (edit !== cur || cur.revision !== revision || !$("safe").checked) return;
        pending.push({ id, blob, url: URL.createObjectURL(blob), sha256 });
        // 붙인 사진은 저장 전까지 이 기기 임시 칸에도 둔다(탭이 닫히거나 카메라 앱에서 돌아오며 다시 열려도 잃지 않게, M21)
        S.putDraft({ id, blob, sha256, created_at: new Date().toISOString() }).catch(() => {});
        linkNext = null;
        closeEdit(); drawThumbs(); say("");
        $("thumbs").scrollIntoView?.({ block: "center" });   // 방금 붙인 사진이 화면 위로 사라졌다(M22)
        if (link) { $(`ck-${link}`).checked = true; $(`ck-${link}`).dispatchEvent(new Event("change")); $(`ckp-${link}`).value = id; }
    } catch (e) { if (edit === cur) say("사진을 붙이지 못했습니다.\n다시 눌러 보세요.", true); }
    finally { cur.attaching = false; if (edit === cur) $("attach").disabled = !$("safe").checked; }
  });
  function drawThumbs() {
    const box = $("thumbs"); box.textContent = "";
    pending.forEach((p, i) => {
      const f = document.createElement("figure"), img = document.createElement("img"), x = document.createElement("button");
      img.src = p.url; img.alt = `붙인 사진 ${i + 1}`; img.width = 88; img.height = 88;
      x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", `사진 ${i + 1} 빼기`);
      x.addEventListener("click", () => { URL.revokeObjectURL(p.url); pending.splice(i, 1); S.deleteDraft(p.id).catch(() => {}); drawThumbs(); });
      f.append(img, x); box.append(f);
    });
    drawCheckPhotos(); badge(); syncSave();
  }
  // 크게 보기(M29): 가린 지금 상태 그대로 큰 그림으로 연다. 확대는 브라우저 손가락 확대를 쓴다
  let bigUrl = "";
  $("bigOpen").addEventListener("click", () => {
    if (!edit) return;
    paint(false);
    $("cv").toBlob((b) => {
      if (!b) return say("사진을 크게 열지 못했습니다.\n다시 눌러 보세요.", true);
      URL.revokeObjectURL(bigUrl); bigUrl = URL.createObjectURL(b); $("bigImg").src = bigUrl; $("bigDlg").showModal();
    }, "image/jpeg", 0.82);
  });
  $("bigClose").addEventListener("click", () => $("bigDlg").close());
  $("bigDlg").addEventListener("close", () => { $("bigImg").removeAttribute("src"); URL.revokeObjectURL(bigUrl); bigUrl = ""; $("bigOpen").focus(); });

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
  const TODO_KEY = "renewmap-redev-todo";   // 구역 계산의 '확인할 건물' 목록 [{pnu, jibun, structure, main_use}](redev-app.js가 쓴다)
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
  const fromPnu = /^\d{19}$/.test(new URLSearchParams(location.search).get("pnu") || "");
  if (fromCheck) {
    const t = document.querySelector('input[name="target"][value="주거지 골목"]');
    t.checked = true; checkTarget(); $("checkBox").open = true;
    $(`ck-${fromCheck.id}`).checked = true; $(`ck-${fromCheck.id}`).closest("li").querySelector(".ck-more").hidden = false;
    // 위쪽 안내가 다 그려진 뒤에 내려야 자리가 맞는다. html의 smooth 스크롤은 숨은 탭에서 멈추므로(2026-10-30 확인) 바로 옮긴다
    // 건물 하나를 확인하러 왔으면(?pnu=) 맨 위 '확인할 건물' 띠와 사진 단추가 먼저 보여야 해서 항목으로 내리지 않는다(M24)
    const show = () => $(`ck-${fromCheck.id}`).closest("li").scrollIntoView({ block: "center", behavior: "instant" });
    if (!fromPnu) { if (document.readyState === "complete") show(); else window.addEventListener("load", show, { once: true }); }
  }
  $("item").append(new Option("고르지 않음", ""));
  for (const v of R.ITEMS) $("item").append(new Option(v, v));
  // 입안요건의 '확인할 건물'에서 왔으면(?pnu=&jibun=) 그 건물을 채우고 항목을 사용승인일로 둔다. 기록의 pnu로 계산표에 다시 붙는다
  const fromBld = new URLSearchParams(location.search);
  if (fromPnu) { $("pnu").value = fromBld.get("pnu"); $("jibun").value = fromBld.get("jibun") || ""; $("item").value = "사용승인일"; checkBanner(fromBld.get("pnu"), fromBld.get("jibun") || ""); }
  // 구역 계산이 남긴 '확인할 건물' 목록(redev-app.js TODO_KEY)에서 이 건물의 구조·용도와 다음 건물을 찾는다. 목록이 없으면 받은 지번만 보인다
  function checkBanner(pnu, jibun) {
    const list = Array.isArray(storeJson(TODO_KEY)) ? storeJson(TODO_KEY) : [], i = list.findIndex((x) => x && x.pnu === pnu), cur = list[i] || { jibun };
    $("checkText").textContent = `확인할 건물: ${[cur.jibun || "지번 없음", cur.structure, cur.main_use].filter(Boolean).join(" · ")}${i >= 0 ? ` (${list.length.toLocaleString("ko-KR")}동 중 ${i + 1}번째)` : ""}`;
    const next = list[i + 1];
    if (i >= 0 && next && /^\d{19}$/.test(next.pnu || "")) {
      $("checkNext").href = `./?check=unregistered&pnu=${next.pnu}&jibun=${encodeURIComponent(next.jibun || "")}`;
      $("checkNext").setAttribute("aria-label", ["다음 건물", next.jibun, "열기"].filter(Boolean).join(" "));
      $("checkNext").hidden = false;
    }
    $("checkBanner").hidden = false;
  }

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
  $("keepBox").hidden = !canStore;   // 처음부터 보이게 두고 못 쓸 때만 숨긴다(C17: 늦게 펼쳐져 아래 칸을 밀었다)
  if (canStore) {
    $("targets").addEventListener("change", () => { store(TARGET_KEY, picked("target")); drawPhrases(); });
    drawPhrases();
  }

  for (const [prefix, fields, box] of [["fac", R.FACILITY_FIELDS, "facilityText"], ["visit", R.VISIT_FIELDS, "visitText"]]) {
    for (const [key, label, max] of fields) {
      const l = document.createElement("label"), input = document.createElement("input");
      l.htmlFor = input.id = prefix + "-" + key; l.textContent = label; input.maxLength = max; input.autocomplete = "off";
      $(box).append(l, input);
    }
  }
  for (const [id, options] of [["fac-observed_state", R.FACILITY_STATES], ["visit-weather", R.WEATHER]]) {
    $(id).append(new Option("고르지 않음", ""));   // r16 OD1: '미확인'은 상태어로 쓰지 않는다(빈 값 그대로)
    options.forEach((v) => $(id).append(new Option(v, v)));
  }
  for (const name of ["facility", "visit"]) $(name + "On").addEventListener("change", () => {
    $(name + "Fields").hidden = $(name + "Fields").disabled = !$(name + "On").checked;
  });
  $("unlinkVisit").addEventListener("click", () => { site = null; siteText(); drawNear(); });
  const readSurvey = (name, prefix, fields) => !$(name + "On").checked ? null : Object.fromEntries(fields.map((key) => [key, $(prefix + "-" + key).value]));
  const facilityKeys = [...R.FACILITY_FIELDS.map(([k]) => k), "source_date", "observed_state"];
  const visitKeys = [...R.VISIT_FIELDS.map(([k]) => k), "date", "start", "end", "weather", "passages", "staying"];
  function clearSurvey() {
    for (const name of ["facility", "visit"]) {
      $(name + "On").checked = false; $(name + "Fields").hidden = $(name + "Fields").disabled = true;
      $(name + "Fields").querySelectorAll("input, select").forEach((el) => { el.value = ""; });
    }
  }

  // 비운 종료 시각: 지금 시각이 시작보다 늦으면 지금 시각, 재방문을 누른 같은 분이면 시작+1분. 23:59 시작이나 시계가 더 이르면 비워 두어 검증이 알린다
  function autoEnd(start, now) {
    if (now > start) return now;
    if (now !== start || start >= "23:59") return "";
    const n = +start.slice(0, 2) * 60 + +start.slice(3) + 1;
    return String(n / 60 | 0).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  }

  // ── 저장
  // 저장 단추는 넣은 것이 있을 때만 채운 단추로 보인다. 빈 기록(사진·대상·메모·항목·관찰이 모두 없음)은 저장하지 않는다(M20: 빈 '기타' 기록이 쌓였다)
  const hasContent = () => !!(pending.length || edit || picked("target") || $("memo").value.trim() || readChecks().length || (site && site.photos.size)
    || $("visitOn").checked || $("facilityOn").checked || $("observed").value.trim());
  function syncSave() { const b = document.querySelector("button.save"); if (b) b.classList.toggle("ghost", !hasContent()); }
  $("f").addEventListener("input", syncSave); $("f").addEventListener("change", syncSave); syncSave();
  let saving = false, staleOk = false;
  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving) return;   // 두 번 누르기·장갑 연속 터치로 기록이 둘 생겼다(M20)
    // 고르고 붙이지 않은 사진이 저장에서 말없이 빠졌다(B12) → 붙이거나 빼고 저장하게 한 번 묻는다. 가림 확인 칸은 그대로 거친다
    if (edit) return ask("사진을 아직 붙이지 않았습니다.", ["가림 확인하고 붙이기", () => { $("editor").scrollIntoView({ block: "start" }); $("safe").focus(); }],
      ["사진 빼고 저장", () => { linkNext = null; closeEdit(); $("f").requestSubmit(); }]);
    if (!hasContent()) return say("사진을 찍거나 '무엇을 봤나요'를 하나 골라 주세요.", true);
    if (pos && !staleOk && Date.now() - fixAt > ASK_MS) return ask(`${ageMin()}분 전에 받은 위치로 저장할까요?`, ["지금 위치 다시 받기", locate],
      ["이 위치로 저장", () => { staleOk = true; $("f").requestSubmit(); }]);
    saving = true;
    const btn = document.querySelector("button.save");
    btn.disabled = true; btn.textContent = "저장하는 중입니다";
    // 지난 칸 오류를 지운다. 입력 없이 고쳐진 칸(자동으로 채운 종료 시각 등)이 사라진 문장을 가리키며 오류로 남지 않게 표시도 함께 뗀다
    document.querySelectorAll(".field-err").forEach((p) => p.remove());
    document.querySelectorAll('[aria-describedby^="err-"]').forEach((t) => { t.removeAttribute("aria-invalid"); t.removeAttribute("aria-describedby"); });
    let endNote = "";
    try {
      if ($("visitOn").checked && $("visit-start").value && !$("visit-end").value) {
        const hm = D.localDate(new Date(), true).split(" ")[1], end = autoEnd($("visit-start").value, hm);
        // 기기 시계가 아닌 값(시작+1분)도 들어가므로 저장 알림에 무엇을 넣었는지 밝힌다
        if (end) { $("visit-end").value = end; endNote = `\n종료 시각을 ${end === hm ? "지금 시각으로" : "시작 1분 뒤로"} 넣었습니다(${end}).`; }
      }
      // 붙인 사진은 '가림 확인' 칸을 거쳐야 pending에 들어오므로 photoSafe는 그 확인을 뜻한다
      const dong = place && place.code ? { code: place.code, name: place.name, sgName: place.sgName, sido: place.sido, nearby: place.nearby.map((x) => x.name), boundary: place.boundary } : null;
      const rec = R.makeRecord({ pnu: $("pnu").value, jibun: $("jibun").value, target: picked("target"), item: $("item").value, observed: $("observed").value,
        status: picked("status"), memo: $("memo").value, checker: $("checker").value, photos: pending.map((p) => p.id),
        photo_sha256: Object.fromEntries([...(site ? [...site.photos].map((id) => [id, site.from.photo_sha256?.[id]]) : []), ...pending.map((p) => [p.id, p.sha256])]),
        photo_sha256_source: site?.from.photo_sha256_source === "가져올 때 계산" ? "가져올 때 계산" : "촬영 시", photoSafe: true, checks: readChecks(), building: chosen,
        facility: readSurvey("facility", "fac", facilityKeys), visit: readSurvey("visit", "visit", visitKeys),
        ...(pos ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, corrected, gps } : {}), dong, indicators: dong ? place.rows : [], snapshot: dong ? place.snapshot : null,
        ...(site ? { site_id: site.id, visit_previous_id: site.from.id, site_radius_m: site.radius || null, prev_photos: [...site.photos],
          site_prev: (await S.records()).filter((r) => E.siteOf(r) === site.id).map((r) => r.recorded_at) } : {}) }, new Date());
      // 자주 쓰는 한 줄 저장은 기록 저장보다 먼저 검사한다(개인정보 꼴이면 둘 다 저장하지 않는다)
      const keep = canStore && $("keepPhrase").checked && rec.memo ? R.rememberPhrase(phrases()[rec.target], rec.memo) : null;
      await S.tx(["records", "photos", "drafts"], "readwrite", (rs, ps, ds) => { for (const p of pending) { ps.add({ id: p.id, blob: p.blob }); ds.delete(p.id); } return rs.add(rec); });
      const shots = pending.length, where = dong ? `${dong.sgName} ${dong.name}` : rec.jibun || "";
      for (const p of pending) URL.revokeObjectURL(p.url);
      pending = []; drawThumbs();
      for (const id of ["observed", "memo"]) $(id).value = "";
      if (keep) { const all = phrases(); all[rec.target] = keep; storeJson(PHRASE_KEY, all); drawPhrases(); }
      store(TARGET_KEY, rec.target);
      store(CHECKER_KEY, rec.checker || "");
      // 다음 기록은 '모름'에서 시작한다
      document.querySelector('input[name="status"][value="추가확인"]').checked = true; $("item").value = ""; $("keepPhrase").checked = false; clearChecks(); clearSurvey();
      site = null; siteText(); drawNear();
      say(""); staleOk = false;
      // 다음 기록은 새 위치로 시작한다(B11). 새 GPS 값이 오면 손으로 고친 위치도 바뀐다(locate 첫 값). 못 받으면 고친 위치와 '보정됨'을 함께 두어
      // 기록의 좌표와 보정 표시가 어긋나지 않게 한다. GPS를 한 번도 못 받았으면 권한을 다시 묻지 않는다
      if (gps) locate();
      scrollTo(0, 0);   // 다음 '사진 찍기'가 바로 보이게(M22: 저장 뒤 2,400px 아래에 남았다)
      toast(["저장했습니다.", [shots ? `사진 ${shots}장` : "", where].filter(Boolean).join(" · ")].filter(Boolean).join(" ") + endNote, "되돌리기", async () => {
        try { await S.deleteRecord(rec); toast("저장을 되돌렸습니다."); await render(); } catch (e) { toast("저장을 되돌리지 못했습니다.\n목록에서 확인해 주세요."); }
      }, true);
      recordPages.reset(); await render();
    } catch (err) { say(errText(err), true); focusFields(err.fields); }
    finally { saving = false; btn.disabled = false; btn.textContent = "저장"; syncSave(); }
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
  function surveyDetail(rec, prev) {
    const detail = document.createElement("details"), summary = document.createElement("summary");
    summary.textContent = "시설 이용 조건·관찰 기록"; detail.append(summary);
    for (const rows of [rec.facility ? [["항목", "이전 기록", "이번 기록"], ...E.facilityRows(rec, prev)] : [], rec.visit ? [["항목", "이전 관찰", "이번 관찰"], ...E.visitRows(rec, prev)] : []]) {
      if (!rows.length) continue;
      const wrap = document.createElement("div"), table = document.createElement("table");
      wrap.className = "survey-table";
      rows.forEach((row, i) => {
        const tr = document.createElement("tr");
        row.forEach((text, j) => { const cell = document.createElement(i === 0 || j === 0 ? "th" : "td"); if (cell.tagName === "TH") cell.scope = i === 0 ? "col" : "row"; cell.textContent = text; tr.append(cell); });
        table.append(tr);
      });
      wrap.append(table); detail.append(wrap);
    }
    if (rec.visit) {
      const result = document.createElement("p"), note = document.createElement("p");
      result.textContent = E.comparisonText(rec, prev);
      note.className = "hint";
      note.textContent = (prev ? `이전 기록: ${E.localTime(prev.recorded_at)} · ${prev.id}. ` : "") + "기록한 조건만 대조합니다. 관찰값 차이는 사업 효과나 고유 방문자 수가 아닙니다.";
      detail.append(result, note);
    }
    return detail;
  }
  function basisDetail(rec, prev) {
    const cmp = E.compareRows(rec, prev), detail = document.createElement("details"), summary = document.createElement("summary"), note = document.createElement("p");
    summary.textContent = "지난 기록의 자료와 비교"; note.textContent = `이전 기록: ${prev.id} · ${E.localTime(prev.recorded_at)}. ` + E.compareLine(prev, cmp); note.className = "hint";
    detail.append(summary, note);
    const wrap = document.createElement("div"), table = document.createElement("table"); wrap.className = "survey-table basis-table"; wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "지난 기록 자료 비교표, 좌우로 스크롤할 수 있습니다");
    const rows = E.basisRows(cmp);
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      row.forEach((text, j) => { const cell = document.createElement(i === 0 || j === 0 ? "th" : "td"); if (cell.tagName === "TH") cell.scope = i === 0 ? "col" : "row"; cell.textContent = text; tr.append(cell); });
      table.append(tr);
    });
    wrap.append(table); detail.append(wrap); return detail;
  }
  // 배포 직후 예전 HTML 캐시에 페이지 스크립트가 없어도 기록·내보내기를 유지한다.
  const recordPages = window.RenewListPages?.create($("list"), "현장 기록", () => render().catch(() => say("기록을 다시 불러오지 못했습니다. 새로고침해 주세요.", true))) || { reset() {}, slice: rows => rows };
  // 2026-11-14 우지예: 백업(ZIP 내보내기·공유)한 때를 이 기기에 적어 두고, 그 뒤에 저장한 기록 수를 목록 위에 알린다(index.html backupNag 주석).
  //     localStorage가 막힌 브라우저에서는 백업 때를 모르므로 기록이 있으면 늘 알린다(사라질 위험을 숨기지 않는다)
  const BACKUP_KEY = "renewmap-field-last-backup";
  const markBackup = () => { store(BACKUP_KEY, new Date().toISOString()); render().catch(() => {}); };
  function drawBackup(rows) {
    const last = store(BACKUP_KEY) || "", n = rows.filter((r) => String(r.recorded_at || "") > last).length;
    $("backupNag").hidden = n === 0;
    $("backupText").textContent = `백업하지 않은 기록이 ${n}건 있습니다.
기록은 이 기기의 이 브라우저에만 저장됩니다. 사이트 데이터를 지우거나 다른 기기·브라우저에서 열면 보이지 않습니다.${last ? `
마지막 백업 ${E.localTime(last)}` : ""}`;
  }
  async function render() {
    let rows = await S.records();
    drawBackup(rows);
    $("stats").innerHTML = R.statsHTML(R.stats(rows, new Date()));   // 개수 요약(순위 아님)
    // v7: 기록이 없으면 0·0·0 상자와 내보내기 단추 묶음 대신 안내 한 줄(평가: 빈 화면에서 단추 다섯 개가 가장 진했다)
    $("stats").hidden = $("listTools").hidden = rows.length === 0;
    $("listEmpty").hidden = rows.length > 0;
    // 같은 지점끼리 모아 보기: 지점은 최근 기록 순, 지점 안은 날짜 순(전·후 비교의 바탕). 순위·점수는 없다
    const group = new Map();
    for (const r of rows) { const k = E.siteOf(r); if (!group.has(k)) group.set(k, []); group.get(k).push(r); }
    if ($("bySite").checked) rows = [...group.values()].flatMap((g) => g.slice().reverse());
    $("today").textContent = `오늘 ${rows.filter((r) => isToday(r.recorded_at)).length}건`;
    const ul = $("list"); ul.textContent = "";
    for (const r of recordPages.slice(rows)) {
      const li = document.createElement("li"), b = document.createElement("b"), m = document.createElement("div"), acts = document.createElement("div");
      b.textContent = `${r.dong ? `${r.dong.sgName} ${r.dong.name}` : r.jibun || r.pnu || R.NO_PARCEL} · ${r.target || r.item || "기록"}`;
      m.className = "meta";
      m.textContent = `${E.localTime(r.recorded_at)}${r.accuracy_m !== null && r.accuracy_m !== undefined ? ` · ±${Math.round(r.accuracy_m)}m` : ""}${r.corrected ? " · 보정됨" : ""}${r.parcel ? ` · ${r.parcel}` : ""}${r.photos && r.photos.length ? ` · 사진 ${r.photos.length}장` : ""}${group.get(E.siteOf(r)).length > 1 ? ` · 같은 지점 ${group.get(E.siteOf(r)).length}건` : ""}${r.imported ? " · 가져옴" : ""}`;
      acts.className = "row";
      const prev = E.prevAtSite(rows, r);
      for (const [label, fn] of [[prev ? "한글 기록·비교 받기" : r.facility || r.visit ? "한글 기록 받기" : "한글 1쪽 받기", hwpx], ["PDF로 저장", pdf], ["해명서 부록 받기", explainer]]) {
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "ghost"; btn.textContent = label;
        btn.addEventListener("click", () => fn(r)); acts.append(btn);
      }
      const pick = document.createElement("label"), pc = document.createElement("input"), pt = document.createElement("span");
      pick.className = "check"; pc.type = "checkbox"; pc.checked = gisPick.has(r.id); pt.textContent = "GIS로 받을 기록으로 고르기";
      pc.addEventListener("change", () => { if (pc.checked) gisPick.add(r.id); else gisPick.delete(r.id); });
      pick.append(pc, pt);
      const revisit = document.createElement("button");
      revisit.type = "button"; revisit.className = "ghost"; revisit.textContent = "이 지점 재방문";
      revisit.addEventListener("click", () => {
        site = { id: E.siteOf(r), from: r, photos: new Set() }; siteText();
        const target = [...$("targets").querySelectorAll("input")].find((el) => el.value === r.target);
        if (target) { target.checked = true; $("targets").dispatchEvent(new Event("change")); }
        if (!pos) { $("jibun").value = r.jibun || ""; $("pnu").value = r.pnu || ""; }
        // M23: 관찰 조건은 켜지 않는다(사진만 다시 찍는 재방문이 빈 관찰 칸 두 개로 저장에 실패했다). 켜면 쓰도록 날짜·시작만 기기 시계로 채워 둔다
        const [today, hm] = D.localDate(new Date(), true).split(" ");
        if (!$("visit-date").value) $("visit-date").value = today;
        if (!$("visit-start").value) $("visit-start").value = hm;
        scrollTo(0, 0);   // 사진 단추와 그 위 재방문 띠가 보이게(관찰 칸으로 2,700px 내려가던 것)
        $("shot").focus({ preventScroll: true });   // 키보드 초점도 사진 찍기로(목록 아래에 남지 않게)
        if (!pos && !r.jibun && !r.pnu) toast("현재 위치를 받은 뒤 사진을 찍어 주세요.");
      });
      li.append(b, m);
      if (r.facility || r.visit) li.append(surveyDetail(r, prev));
      if (prev) li.append(basisDetail(r, prev));
      acts.append(revisit); li.append(acts, pick); ul.append(li);
    }
  }
  // ── GIS 내보내기(N2): 고른 기록(없으면 모두)을 GeoJSON·CSV로. 사진은 빼고 사진 파일 이름만 적는다
  const gisPick = new Set();
  async function gisRows() { const all = await S.records(), some = all.filter((r) => gisPick.has(r.id)); return some.length ? some : all; }
  const stamp = () => D.localDate(new Date(), true).replace(" ", "_").replace(":", "");
  $("geojson").addEventListener("click", async () => {
    try { const rows = await gisRows(); D.saveBytes(`renewmap-field-${stamp()}.geojson`, JSON.stringify(R.toGeoJSON(rows, new Date()), null, 2), "application/geo+json"); toast(`${rows.length}건을 GeoJSON으로 받았습니다.`); }
    catch (e) { toast("GeoJSON을 만들지 못했습니다."); }
  });
  $("csv").addEventListener("click", async () => {
    try { const rows = await gisRows(); D.saveBytes(`renewmap-field-${stamp()}.csv`, R.toCSV(rows), "text/csv;charset=utf-8"); toast(`${rows.length}건을 CSV로 받았습니다.`); }
    catch (e) { toast("CSV를 만들지 못했습니다."); }
  });
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
    const sent = new Set();
    for (const r of rows) for (const id of new Set([...(r.photos || []), ...(r.prev_photos || [])])) {
      const b = await S.photo(id), data = b ? new Uint8Array(await b.arrayBuffer()) : null;
      // 빠진·바뀐 사진을 성공한 백업으로 표시하면 복원할 때 기록이 사라진다. 하나라도 실패하면 ZIP 전체를 중단한다.
      R.checkPhoto(data, r.photo_sha256 && r.photo_sha256[id]);
      if (!sent.has(id)) { sent.add(id); entries.push({ name: `photos/${id}.jpg`, data }); }
    }
    const day = D.localDate();
    return { name: `renewmap-field-${day}.zip`, bytes: D.zipStore(entries, day) };
  }
  $("exp").addEventListener("click", async () => {
    try { const z = await buildZip(); D.saveBytes(z.name, z.bytes, "application/zip"); markBackup(); } catch (e) { toast(e.code === "FIELD_PHOTO" ? e.message : "ZIP을 만들지 못했습니다.\n잠시 뒤 다시 해 보세요."); }
  });
  $("backupNow").addEventListener("click", () => $("exp").click());
  $("share").addEventListener("click", async () => {
    try {
      const z = await buildZip(), file = new File([z.bytes], z.name, { type: "application/zip" });
      await navigator.share({ files: [file], title: "리뉴맵 현장 기록" });
      markBackup();   // 공유로 넘긴 ZIP도 백업으로 친다
    } catch (e) { if (e.name !== "AbortError") toast(e.code === "FIELD_PHOTO" ? e.message : "공유하지 못했습니다.\n모두 내보내기(ZIP)를 쓰세요."); }
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

  $("bySite").addEventListener("change", () => { recordPages.reset(); render(); });

  // ── ZIP 가져오기(A4): 같은 id는 건너뛰고, 이미 있는 사진도 덮어쓰지 않는다. 가져온 기록에는 '가져옴'이 붙는다
  $("importZip").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    const importResult = $("importResult");
    if (importResult) importResult.textContent = "ZIP과 사진을 확인하고 있습니다.";
    try {
      if (f.size > R.LIMITS.zip) throw new Error("파일이 너무 큽니다.\n100MB 이하만 가져올 수 있습니다.");
      const got = R.parseImport(new Uint8Array(await f.arrayBuffer()), new Date()), have = new Set((await S.records()).map((r) => r.id));
      let added = 0, same = 0, failed = 0, conflicts = 0, photoRejected = got.photoRejected || 0;
      const decoded = new Set();
      for (const rec of got.records) {
        if (have.has(rec.id)) { same++; continue; }
        let photoChanged = false, photoUnreadable = false;
        try {
          let conflict = false;
          const checked = new Set();
          for (const id of new Set([...rec.photos, ...rec.prev_photos])) {
            const existing = await S.photo(id);
            if (existing && R.sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== R.sha256Hex(got.photos.get(id))) { conflict = true; break; }
            if (existing) checked.add(id);
          }
          if (conflict) { conflicts++; continue; }
          for (const id of new Set([...rec.photos, ...rec.prev_photos])) if (!decoded.has(id)) {
            // 구조·해시 검사만으로 실제 사진인지는 알 수 없다. 원본을 바꾸지 않고 브라우저로 읽을 수 있는지 확인한다.
            try { await loadImage(new Blob([got.photos.get(id)], { type: "image/jpeg" })); decoded.add(id); }
            catch (err) { photoUnreadable = true; throw err; }
          }
          await S.tx(["records", "photos"], "readwrite", (rs, ps) => {
            for (const id of new Set([...rec.photos, ...rec.prev_photos])) {
              const q = ps.count(id);
              q.onsuccess = () => {
                if (q.result && !checked.has(id)) { photoChanged = true; q.transaction.abort(); return; }
                if (!q.result) ps.add({ id, blob: new Blob([got.photos.get(id)], { type: "image/jpeg" }) });
              };
            }
            return rs.add(rec);
          });
          added++;
        } catch (err) { if (photoChanged) conflicts++; else if (photoUnreadable) photoRejected++; else if (err.name === "ConstraintError") same++; else failed++; }
      }
      const result = `${added}건을 가져왔습니다.${same ? `\n이미 있는 ${same}건은 건너뛰었습니다.` : ""}${conflicts ? `\n사진 ID 충돌로 ${conflicts}건은 가져오지 못했습니다. 기존 사진은 보존했습니다. ZIP을 확인한 뒤 다시 가져오세요.` : ""}${failed ? `\n저장에 실패한 ${failed}건은 가져오지 못했습니다. 저장 공간·기기 저장소를 확인한 뒤 ZIP을 다시 가져오세요.` : ""}${got.skipped ? `\n형식이 맞지 않는 ${got.skipped}건은 받지 않았습니다.` : ""}${photoRejected ? `\n사진 누락·손상·메타데이터 검사로 ${photoRejected}건은 받지 않았습니다. 원본 ZIP을 보존하고 사진을 다시 골라 가린 뒤 저장해 주세요.` : ""}`;
      if (importResult) importResult.textContent = result;
      toast(result);
      await render(); drawNear();
    } catch (err) { if (importResult) importResult.textContent = err.message; toast(err.message); }
  });

  // 위치 권한이 이미 있으면 바로 받는다. 처음이면 사진 찍기·'현재 위치 받기'를 누를 때 한 번 묻는다
  if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then((s) => { if (s.state === "granted") locate(); }).catch(() => {});
  render().catch(() => say("이 브라우저에서는 기기 저장소를 쓸 수 없습니다.", true));
  // ── 가리기 도구 미리 받기(약 20MB). 첫 사진에서 받으면 현장 LTE에서 막힌다(심사 06 §7-5).
  // 서비스 워커가 KEEP 규칙으로 캐시하므로 워커가 이 화면을 맡은(controller) 뒤에만 받는다. 받은 비율은 알 수 없어 '받는 중'만 보인다
  let fetchingTools = false;
  async function toolsDone() {
    const urls = [];
    try { for (const k of await caches.keys()) for (const q of await (await caches.open(k)).keys()) urls.push(q.url); } catch (e) { return false; }
    return window.FieldDetect.isDone(urls);
  }
  async function showTools() {
    if (fetchingTools) return;
    const done = await toolsDone();
    if (fetchingTools) return;
    $("prefetchState").textContent = done ? "가리기 도구: 받음" : "가리기 도구: 안 받음";
    $("prefetch").disabled = done;
  }
  async function prefetchTools() {
    if (fetchingTools) return;
    if (!navigator.onLine) { toast("가리기 도구를 받으려면 인터넷에 연결해 주세요."); return; }
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) { toast("오프라인 준비가 끝난 뒤 다시 눌러 주세요."); return; }
    fetchingTools = true; $("prefetch").disabled = true; $("prefetchState").textContent = "가리기 도구: 받는 중";
    try { if (!(await toolsDone())) await window.FieldDetect.prefetch(); }
    catch (e) { toast("가리기 도구를 받지 못했습니다.\n인터넷을 확인하고 다시 해 보세요."); }
    finally { fetchingTools = false; showTools(); }
  }
  $("prefetch").addEventListener("click", prefetchTools);
  showTools();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => { $("ready").textContent = "오프라인 준비를 마치지 못했습니다.\n인터넷 연결과 브라우저 설정을 확인해 주세요."; });
    // 새 버전 안내는 site.js 고정 띠 하나로 한다. 여기서도 띄우던 토스트는 같은 말을 두 번 읽고, 띠 밑에 깔린 '새로고침' 단추로 초점이 갔다(11-20 C16)
    // ready는 앱 셸을 다 저장한 서비스 워커가 켜져야 풀린다. 현장에 나가기 전에 오프라인으로 열리는지 보이게 한다(감사 이수진2)
    navigator.serviceWorker.ready.then(() => { $("ready").textContent = "오프라인 준비됨.\n인터넷이 끊겨도 이 화면이 열립니다."; });
  } else { $("ready").textContent = "이 브라우저에서는 오프라인으로 열 수 없습니다.\n인터넷에 연결한 상태로 사용해 주세요."; }
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

  // ── 저장하지 않은 사진 지키기(M21). 붙인 사진·편집 중 사진이 있으면 떠나기 전에 브라우저가 묻는다(아래 탭·뒤로 가기에서 경고 없이 사라졌다)
  window.addEventListener("beforeunload", (e) => { if (pending.length || edit) { e.preventDefault(); e.returnValue = ""; } });
  // 탭이 닫혔다가 다시 열려도 붙인 사진은 임시 칸에 있다. 이어 쓸지 버릴지 한 번 묻는다
  S.drafts().then((ds) => {
    if (!ds.length || pending.length) return;
    ds.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    ask(`저장하지 않은 사진 ${ds.length}장이 있습니다.`, ["이어 쓰기", () => {
      pending.push(...ds.slice(0, R.MAX_PHOTOS).map((d) => ({ id: d.id, blob: d.blob, url: URL.createObjectURL(d.blob), sha256: d.sha256 })));
      drawThumbs();
    }], ["버리기", () => { S.clearDrafts().catch(() => {}); }], document.querySelector(".pick"));
  }).catch(() => {});
  // 넓은 화면은 위치·통계 칸을 펼쳐 둔다(예전 세 칸 배치 그대로). 휴대폰은 접힌 한 줄(M22)
  if (window.matchMedia && matchMedia("(min-width: 1024px)").matches) $("locBox").open = true;
  // 오프라인에서 현장 기록 밖으로 가면 브라우저 오류 화면이 떴다(manifest scope는 field/). 그 링크만 막고 알린다
  document.addEventListener("click", (e) => {
    const a = !navigator.onLine && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const u = new URL(a.href, location.href);
    if (u.protocol !== location.protocol || (u.origin === location.origin && u.pathname.startsWith(location.pathname.replace(/[^/]*$/, "")))) return;
    e.preventDefault(); toast("인터넷이 연결되면 열립니다. 현장 기록은 계속 쓸 수 있습니다.");
  }, true);
})();
