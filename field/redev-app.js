// 입안요건 사전검토 화면. 법정동 건물 파일(정적)만 받고, 붙여 넣은 목록·결과는 기기 밖으로 보내지 않는다.
(function () {
  "use strict";
  const R = window.Redev, D = window.RenewDocgen;
  const $ = (id) => document.getElementById(id);
  const DATA = "../data/";
  const getJson = (p) => fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((j) => window.RenewCellPack.unpack(j));
  // 실패해도 계산은 쓸 수 있다. 문서 만들기에서 양식이 없다는 오류로 알린다(app.js와 같음)
  const templates = getJson("report_templates.json").then((t) => D.setTemplates(t)).catch(() => null);
  // 법정동 건물 파일은 큰 동이 2.8MB(연산동 12,474동)라 계산마다 다시 받아 풀면 경계안 비교가 느려진다. 계산 함수는 파일을 고치지 않으므로
  // 풀어 둔 것을 다시 쓴다. ponytail: 최근 8개만 두고 오래된 것부터 버린다(전 동을 다 열어도 메모리가 계속 늘지 않게)
  const buildingCache = new Map();
  const getBuildings = (code) => {
    if (buildingCache.has(code)) { const p = buildingCache.get(code); buildingCache.delete(code); buildingCache.set(code, p); return p; }
    const p = getJson(`buildings/${code}.json`).catch((err) => { buildingCache.delete(code); throw err; });
    buildingCache.set(code, p);
    if (buildingCache.size > 8) buildingCache.delete(buildingCache.keys().next().value);
    return p;
  };
  let last = null;   // {res, m, file}

  // 구·군 → 법정동 목록(buildings/index.json). 부산 조례 기준만 계산하므로 부산(26)만 싣는다. 목록을 못 받으면 HTML의 해운대구 8개 동 그대로 쓴다
  const BUSAN = "26";
  const index = getJson("buildings/index.json").catch(() => null);
  index.then((idx) => {
    if (!idx) return;
    const gus = idx.sigungu.filter((s) => s.code.startsWith(BUSAN) && s.dongs.length);
    if (!gus.length) return;
    const fill = (sel, items, pick) => sel.replaceChildren(...items.map(([v, t]) => { const o = new Option(t, v); o.selected = v === pick; return o; }));
    const showDongs = (gu, pick) => fill($("dong"), gus.find((s) => s.code === gu).dongs.map((d) => [d.code, `${d.name} (건물 ${d.count.toLocaleString("ko-KR")}동)`]), pick);
    // 2026-11-13: 건물 나이 4D·동 페이지에서 ?bjd=법정동코드로 오면 그 구·동을 고른 채 연다(11-13 3차: 어디서 와도 동이 이어지지 않음)
    const want = new URLSearchParams(location.search).get("bjd");
    const from = want && gus.find((s) => s.dongs.some((d) => d.code === want));
    fill($("gu"), gus.map((s) => [s.code, s.name]), from ? from.code : "26350");
    showDongs(from ? from.code : "26350", from ? want : $("dong").value);
    $("gu").addEventListener("change", () => { showDongs($("gu").value); centreDraw(); });
    restoreDraft(gus, showDongs);
    const n = gus.reduce((s, g) => s + g.dongs.length, 0);
    $("coverage").textContent = `부산 ${gus.length}개 구·군 ${n}개 법정동의 건축물대장을 담았습니다. 다른 시·도는 그 조례를 확인한 뒤 엽니다.`;
  }).catch(() => {});

  // 행정동 쇠퇴 값은 전국 지도 자료(national/emd)에 있다. 건축물대장과 시군구 코드 체계가 달라 구·군 이름으로 잇는다
  const national = getJson("national/index.json").catch(() => null);
  async function showDongDecline(file) {
    const box = $("dongDecline"), sel = $("hdong"), out = $("hdongOut");
    box.hidden = true; out.replaceChildren();
    try {
      const [idx, nat] = await Promise.all([index, national]);
      const gu = idx && idx.sigungu.find((s) => s.code === String(file.bjd10).slice(0, 5));
      const nsg = gu && nat && nat.sigungu.find((s) => s.sido2 === "21" && s.name === gu.name);
      if (!nsg) throw new Error("no sigungu");
      const emd = await getJson(`national/emd/${nsg.code5}.json`);
      if (last.file !== file) return;   // 그사이 다른 목록을 계산했다
      const near = R.dongCandidates(file.name, emd.dongs), rest = emd.dongs.filter((d) => !near.includes(d));
      sel.replaceChildren(new Option("행정동을 고르세요", ""), ...[...near, ...rest].map((d) => new Option(d.name, d.code7)));
      const show = () => {
        const d = emd.dongs.find((x) => x.code7 === sel.value);
        if (d) out.innerHTML = R.dongDeclineHTML(d); else out.replaceChildren();
        $("basis").innerHTML = R.basisHTML(last.res, file, d || null);   // 쇠퇴지표 기준연도는 고른 행정동 셀에서
      };
      sel.onchange = show;
      if (near.length === 1) sel.value = near[0].code7;
      show();
      box.hidden = false;
    } catch (err) {
      if (last.file !== file) return;
      sel.replaceChildren();
      out.textContent = "행정동 값을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.";
      box.hidden = false;
    }
  }

  // 고른 동 + 목록이 가리키는 다른 법정동(PNU 앞 10자리, 지번 앞 동 이름은 같은 구·군 안에서 찾음). 신청 구역이 동 경계를 넘을 때.
  // 고른 동은 목록이 가리킬 때만 넣는다(동·PNU 없는 지번이 있거나 그 동의 PNU·이름). 다른 동에 그린 PNU 목록이 '감천동·반여동'처럼
  // 건물 없는 동 이름까지 달고 나오던 것(11-13)
  async function loadFor(items, code) {
    const idx = await index, gu = idx && idx.sigungu.find((s) => s.code === code.slice(0, 5));
    const byName = new Map((gu ? gu.dongs : []).map((d) => [d.name, d.code]));
    const known = new Set(idx ? idx.sigungu.flatMap((s) => s.dongs.map((d) => d.code)) : []);
    const want = (it) => (it.pnu ? it.pnu.slice(0, 10) : it.dong ? byName.get(it.dong) : code);
    const codes = items.some((it) => want(it) === code) ? [code] : [];
    for (const it of items) {
      const c = want(it);
      if (c && known.has(c) && !codes.includes(c) && codes.length < R.MERGE_MAX) codes.push(c);
    }
    if (!codes.length) codes.push(code);
    const files = await Promise.all(codes.map(getBuildings));
    return files.length === 1 ? files[0] : R.mergeFiles(files);
  }

  // 입력 자동 저장: 지번 목록·구역 면적·고른 동을 이 기기에만 남겨, 브라우저를 닫거나 계산이 끊긴 뒤 다시 열면 이어서 계산한다
  const DRAFT_KEY = "renewmap-redev-draft";
  // area.dataset.src = "drawn": 면적 칸을 그린 구역에서 채웠다(사람이 고치면 지운다). 결과에 '입력값'이 아니라 '그린 구역에서 계산'으로 적는다
  const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ gu: $("gu").value, dong: $("dong").value, list: $("list").value, area: $("area").value, areaSrc: $("area").dataset.src || "" })); } catch (e) { /* 저장을 막은 브라우저는 이어 쓰기만 안 된다 */ } };
  function restoreDraft(gus, showDongs) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { d = null; }
    if (!d || !d.list || $("list").value.trim()) return;
    const gu = gus.find((s) => s.code === d.gu);
    if (gu && gu.dongs.some((x) => x.code === d.dong)) { $("gu").value = d.gu; showDongs(d.gu, d.dong); }
    $("list").value = d.list; $("area").value = d.area || "";
    if (d.area && d.areaSrc === "drawn") $("area").dataset.src = "drawn";
    say("지난번에 넣은 목록을 불러왔습니다.\n새로 시작하려면 목록 칸을 비우세요.");
  }
  $("area").addEventListener("input", () => { delete $("area").dataset.src; });   // saveDraft보다 먼저
  ["list", "area", "dong"].forEach((id) => $(id).addEventListener("input", saveDraft));
  $("dong").addEventListener("change", saveDraft);

  const n0 = (x) => x.toLocaleString("ko-KR");   // 개수는 늘 천 단위 쉼표
  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const today = () => D.localDate();
  const opt = () => ({ secret: $("secret").checked });
  const fileName = (ext, file = last.file, options = opt(), day = today()) => `${options.secret ? "대외비_" : ""}${file.name}_입안요건_사전검토_승인전_${day}.${ext}`;

  // 예시: 고른 법정동의 모든 지번을 넣고 계산한다(사업계획서의 반여동 숫자를 버튼 하나로 다시 얻는다). 특정 구역을 짚지 않으려고 동 전체만 쓴다
  $("demo").addEventListener("click", async () => {
    let file;
    try { file = await getBuildings($("dong").value); } catch (err) { return say("건축물대장 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
    $("list").value = [...new Set(file.buildings.map((b) => b.jibun).filter(Boolean))].join("\n");
    $("area").value = ""; delete $("area").dataset.src;
    $("f").requestSubmit();
  });

  // 파일은 이 기기에서만 읽는다. 한국어 엑셀 CSV는 EUC-KR이 많아 UTF-8로 깨지면 다시 읽는다
  $("listFile").addEventListener("change", async () => {
    const f = $("listFile").files[0];
    $("listFileName").textContent = f ? f.name : "고른 파일 없음";
    if (!f) return;
    const buf = await f.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("euc-kr").decode(buf);
    let got;
    try { got = R.listFromFile(f.name, text); } catch (err) { return say("파일을 읽지 못했습니다.\nCSV나 GeoJSON인지 확인해 주세요.", true); }
    if (got.n === 0) return say("파일에서 PNU나 지번 열을 찾지 못했습니다.", true);
    $("list").value = got.text;
    saveDraft();
    say(got.n === null ? `${f.name}을 목록에 넣었습니다.` : `${f.name}에서 ${n0(got.n)}필지를 넣었습니다.${got.skipped ? `\nPNU·지번이 없는 ${n0(got.skipped)}개는 뺐습니다.` : ""}`);
  });

  // 나·다·라목 참고 범위: 브이월드 토지특성을 격리 창(vw-frame)으로 그때그때 묻는다. 약관 제19조(저장·제공 금지)로 파일을 만들지 않는다.
  // 키가 없는 주소(로컬)·조회 실패면 null → 예전처럼 '현장 확인'만 쓴다
  async function parcelText(items, blds, areaM2) {
    if (typeof ParcelRef === "undefined" || !VW) return null;
    const pnus = [...items.map((it) => it.pnu).filter(Boolean), ...blds.map((b) => b.pnu).filter(Boolean)];
    const pres = ParcelRef.prefixes(pnus);
    if (!pres.length) return null;
    say(`토지특성(도로접면·필지 면적)을 브이월드에서 묻는 중입니다. 본번 ${n0(pres.length)}곳.`);
    // 토지특성은 해마다 7월 무렵 공시된다. 작년 판이 아직 없으면 그 전 해로 묻는다
    let r = await vwAsk({ land: pres, year: String(new Date().getFullYear() - 1) }, 90000);
    if (r && !r.error && r.rows && !r.rows.length) r = await vwAsk({ land: pres, year: String(new Date().getFullYear() - 2) }, 90000);
    if (!r || r.error || !r.rows || !r.rows.length) return null;
    const map = ParcelRef.fromRows(r.rows);
    return ParcelRef.texts({ density: ParcelRef.houseDensity(blds, areaM2), road: ParcelRef.roadFrontage(blds, map), lots: ParcelRef.smallLots(pnus, map) });
  }


  // ── 지도에서 영역 그리기(T20, D24 경쟁사 흡수: 부동산플래닛 영역 그리기·Prom 구역계). 필지 조회는 격리된 창(vw-frame.html)이 한다
  const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
  const loadLeaflet = () => window.L ? Promise.resolve() : new Promise((ok, fail) => {
    const tag = (name, attrs) => { const el = Object.assign(document.createElement(name), attrs, { crossOrigin: "anonymous" }); el.onerror = fail; document.head.appendChild(el); return el; };
    tag("link", { rel: "stylesheet", href: LEAFLET + "leaflet.css", integrity: "sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w==" });
    tag("script", { src: LEAFLET + "leaflet.js", integrity: "sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg==" }).onload = ok;
  });
  const VW = /^[A-Za-z0-9-]+$/.test(window.RENEWMAP_VWORLD_KEY || "") ? window.RENEWMAP_VWORLD_KEY : "";
  let drawMap = null, drawPts = [], drawLine = null, vwFrame = null, vwSeq = 0;
  const vwWait = new Map();
  window.addEventListener("message", (e) => {
    if (!vwFrame || e.source !== vwFrame.contentWindow) return;
    const done = vwWait.get(e.data && e.data.id);
    if (done) { vwWait.delete(e.data.id); done(e.data); }
  });
  const vwAsk = (msg, ms = 25000) => new Promise((ok) => {
    const send = () => { const id = ++vwSeq; vwWait.set(id, ok); vwFrame.contentWindow.postMessage({ id, ...msg }, "*"); setTimeout(() => { if (vwWait.delete(id)) ok({ error: "시간 초과" }); }, ms); };
    if (vwFrame) return send();
    vwFrame = document.createElement("iframe");
    vwFrame.hidden = true; vwFrame.title = "브이월드 필지 조회"; vwFrame.setAttribute("sandbox", "allow-scripts"); vwFrame.src = "vw-frame.html";
    vwFrame.addEventListener("load", send, { once: true });
    document.body.append(vwFrame);
  });
  // 2026-11-13 우지예: 처음 쓰면 그리기가 어렵다(선만 보여 어디까지가 영역인지, 몇 번째 점인지, 선이 꼬였는지 모름).
  //     → 3점부터 영역을 옅게 칠하고, 꼭짓점에 번호를 달아 끌어서 고칠 수 있게 하고, 지금 할 일·꼬임 경고를 한 줄로 보인다.
  //     값 계산(필지·면적·SHP)은 그대로 drawPts를 쓴다
  let drawFill = null, drawMarks = [];
  const drawSay = () => {
    const n = drawPts.length, bad = n > 3 && R.ringCrosses(drawPts), el = $("drawStep");
    el.textContent = n === 0 ? "① 지도를 확대해 구역을 찾은 뒤, 구역 가장자리 한 곳을 누르세요."
      : n < 3 ? `② 가장자리를 따라 한 방향으로 계속 누르세요. 지금 꼭짓점 ${n}개(3개부터 영역이 됩니다).`
      : bad ? `선이 서로 겹칩니다. 번호 점을 끌어 옮기거나 '마지막 점 지우기'를 누르세요. (꼭짓점 ${n}개)`
      : `③ 꼭짓점 ${n}개. 마지막 점과 1번 점은 자동으로 이어집니다. 다 그렸으면 '영역 안 필지 넣기'를 누르세요.`;
    el.classList.toggle("is-warn", !!bad);
    $("drawDone").disabled = n < 3 || bad;
  };
  const redraw = () => {
    drawLine.setLatLngs(drawPts.length > 2 ? [...drawPts, drawPts[0]] : drawPts);
    drawFill.setLatLngs(drawPts.length > 2 ? drawPts : []);
    drawMarks.forEach((m) => m.remove());
    drawMarks = drawPts.map((p, i) => window.L.marker(p, { draggable: true, keyboard: false, title: `${i + 1}번 꼭짓점(끌어서 옮기기)`,
      icon: window.L.divIcon({ className: "draw-pt" + (i === 0 ? " is-first" : ""), html: `<span>${i + 1}</span>`, iconSize: [44, 44] }) })   // 보이는 원은 26px, 누르는 칸은 44px(#89 검토)
      .on("drag", (e) => { const ll = e.target.getLatLng(); drawPts[i] = [ll.lat, ll.lng]; drawLine.setLatLngs(drawPts.length > 2 ? [...drawPts, drawPts[0]] : drawPts); drawFill.setLatLngs(drawPts.length > 2 ? drawPts : []); })
      .on("dragend", () => redraw())
      .addTo(drawMap));
    $("socOut").hidden = true;   // 영역이 바뀌면 지난 SOC 표는 맞지 않는다
    drawSay();
  };
  // 그리기 지도를 고른 법정동에 맞춘다. 건물 파일에는 좌표가 없어 외곽선 색인(bldg_outline/index.json, 39KB)의 동별 상자만 한 번 받는다.
  // 색인을 못 받으면 처음엔 부산 전체를 보이고, 동을 바꿔도 움직이지 않는다
  let outline = null;
  const centreDraw = async (first = false) => {
    const idx = await (outline || (outline = getJson("bldg_outline/index.json").catch(() => { outline = null; return null; })));
    if (!drawMap) return;
    const b = idx && R.dongBounds($("dong").value, idx.files);   // 받는 사이에 동을 바꿨을 수 있어 받은 뒤에 읽는다
    if (b) drawMap.fitBounds(b, { maxZoom: 17 }); else if (first) drawMap.setView([35.16, 129.06], 12);
  };
  $("dong").addEventListener("change", () => centreDraw());
  $("drawOpen").addEventListener("click", async () => {
    $("drawBox").hidden = false;
    if (drawMap) return;
    try { await loadLeaflet(); } catch (err) { return say("지도를 불러오지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
    const L = window.L;
    // 누르기는 꼭짓점 찍기라 두 번 누르기 확대는 끈다. 휠 확대는 지도를 누른 뒤에만, 확대는 필지가 보이는 19(배경 타일 끝)까지
    drawMap = L.map($("drawMap"), { scrollWheelZoom: false, doubleClickZoom: false, maxZoom: 19, zoomControl: false });
    L.control.zoom({ zoomInTitle: "확대", zoomOutTitle: "축소" }).addTo(drawMap);
    centreDraw(true);
    drawMap.on("click", () => drawMap.scrollWheelZoom.enable()); drawMap.on("mouseout", () => drawMap.scrollWheelZoom.disable());
    if (VW) L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VW}/Base/{z}/{y}/{x}.png`, { maxZoom: 19, attribution: "&copy; 국토교통부 브이월드" }).addTo(drawMap);
    else L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(drawMap);
    drawFill = L.polygon([], { stroke: false, fillColor: "#0b6b75", fillOpacity: 0.15, interactive: false }).addTo(drawMap);   // 영역 옅게(redraw 주석)
    drawLine = L.polyline([], { color: "#0b6b75", weight: 3, interactive: false }).addTo(drawMap);
    drawSay();
    drawMap.on("click", (e) => { if (drawPts.length < 100) { drawPts.push([e.latlng.lat, e.latlng.lng]); redraw(); } });
  });
  $("drawUndo").addEventListener("click", () => { if (drawLine) { drawPts.pop(); redraw(); } });
  $("drawClear").addEventListener("click", () => { if (drawLine) { drawPts = []; redraw(); } });
  $("drawDone").addEventListener("click", async () => {
    const wkt = R.polygonWKT(drawPts);
    if (!wkt) return say("꼭짓점을 3개 이상 찍어 주세요.", true);
    if (!VW) return say("이 주소에서는 브이월드 필지 조회를 쓸 수 없습니다.\n공개 사이트에서 다시 시도해 주세요.", true);
    $("drawDone").disabled = true; say("브이월드에서 영역 안 필지를 찾는 중입니다.");
    let r = await vwAsk({ wkt });
    // 브이월드는 짧은 사이 여러 번 부르면 요청을 거절한다(v9 2차: 연속 4번 '조회 실패'). 한 번 쉬었다 다시 묻는다
    if (r.error === "조회 실패") { say("브이월드가 잠시 응답하지 않아 다시 묻는 중입니다."); await new Promise((ok) => setTimeout(ok, 2000)); r = await vwAsk({ wkt }); }
    drawSay();   // 조회 중에 점을 끌어 선이 꼬였을 수 있어 단추 상태를 다시 맞춘다(#89 검토)
    if (r.error) return say(`필지를 찾지 못했습니다(${r.error}).\n브이월드 조회가 몰리면 잠시 거절됩니다. 1분쯤 뒤에 다시 눌러 주세요.`, true);
    if (!r.pnus.length) return say("영역 안에서 필지를 찾지 못했습니다.", true);
    $("list").value = r.pnus.join("\n");
    $("area").value = Math.round(R.polygonAreaM2(drawPts));   // 그린 선 기준 면적. 고시 면적이 있으면 사람이 고친다
    $("area").dataset.src = "drawn";
    saveDraft();
    say(`영역 안 ${n0(r.pnus.length)}필지를 넣었습니다.${r.total > r.pnus.length ? `\n전체 ${n0(r.total)}필지 중 1,000필지까지만 넣었습니다. 영역을 나눠 주세요.` : ""}\n경계에 걸친 필지도 들어가니 목록을 확인해 주세요.`);
  });

  $("shpSave").addEventListener("click", () => {
    const zip = R.boundaryShpZip(drawPts, today());
    if (!zip) return say("꼭짓점을 3개 이상 찍고, 선이 서로 겹치지 않게 그려 주세요.", true);
    D.saveBytes(`사업구역경계_EPSG5174_${today()}.zip`, zip, "application/zip");
    say("구역 경계 SHP를 받았습니다.\n제출 전에 GIS에서 연속지적도와 겹쳐 맞춰 주세요.");
  });

  // 지역 SOC 현황표(흡수 6번). 그린 꼭짓점과 시설 점은 이 기기에서만 맞대 본다. 브이월드는 부르지 않는다
  let soc = null;
  const socReady = () => soc || (soc = getJson("soc_busan.json").catch((err) => { soc = null; throw err; }));
  $("socRun").addEventListener("click", async () => {
    if (!R.polygonWKT(drawPts)) return say("꼭짓점을 3개 이상 찍어 주세요.", true);
    let data;
    try { data = await socReady(); } catch (err) { return say("시설 자료를 불러오지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
    const { rows } = R.socCount(data, drawPts);
    $("socBody").replaceChildren(...rows.map((r) => {
      const tr = document.createElement("tr");
      for (const [i, v] of [r.kind, r.n.toLocaleString("ko-KR"), r.near.toLocaleString("ko-KR"), R.socTypes(r) || "-", R.socDates(r) || "-"].entries()) {
        const c = document.createElement(i ? "td" : "th");
        if (!i) c.scope = "row";
        c.textContent = v;
        tr.append(c);
      }
      return tr;
    }));
    $("socOut").hidden = false;
    say(`영역 안 시설 ${rows.reduce((s, r) => s + r.n, 0).toLocaleString("ko-KR")}곳을 셌습니다.`);
  });
  $("socCsv").addEventListener("click", async () => {
    if (!R.polygonWKT(drawPts)) return say("꼭짓점을 3개 이상 찍어 주세요.", true);
    try { D.saveBytes(`지역SOC현황_${today()}.csv`, R.socCSV(await socReady(), drawPts, today()), "text/csv;charset=utf-8"); }
    catch (err) { say("CSV를 만들지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
  });

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    saveDraft();
    const p = R.parseList($("list").value);
    if (!p.items.length) return say("지번을 한 줄에 하나씩 넣어 주세요.", true);
    const areaRaw = $("area").value.trim(), areaM2 = areaRaw === "" ? null : Number(areaRaw);
    if (areaM2 !== null && !(areaM2 >= 0)) return say("구역 면적은 숫자로 넣어 주세요.", true);
    const refIn = $("ref").value;
    say("건축물대장 자료를 여는 중입니다.");
    let file;
    try { file = await loadFor(p.items, $("dong").value); } catch (err) { return say("건축물대장 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
    const m = R.match(p.items, file);
    if (!m.buildings.length) return say(`목록에서 찾은 건물이 없습니다.\n${file.name} 지번이 맞는지 확인해 주세요.`, true);
    // 기준일은 자료 기준일보다 앞설 수 없다. 그 사이에 지은 건물을 대장 스냅숏으로는 가려낼 수 없어 분모가 틀어진다
    if (refIn && refIn < file.age_reference_date) return say(`경과 기준일은 자료 기준일(${D.govDate(file.age_reference_date)}) 이후로 넣어 주세요.\n그 전 날짜는 그 뒤에 지은 건물이 섞여 바르게 셀 수 없습니다.`, true);
    // 나·다·라목 참고 범위(1365 트윈의 호수밀도·접도율·과소필지 흡수). 토지특성 파일이 없거나 못 받으면 예전처럼 '현장 확인'만 쓴다
    const parcel = await parcelText(p.items, m.buildings, areaM2);
    const res = R.review(m.buildings, { ref: refIn || file.age_reference_date, district: $("district").checked, areaM2, areaDrawn: $("area").dataset.src === "drawn", parcel });
    last = { res, m, file };
    const skipped = [...(p.bad.length ? [`지번으로 읽지 못한 칸 ${n0(p.bad.length)}개`] : []), ...(m.missing.length ? [`대장에 없는 지번 ${n0(m.missing.length)}개(${m.missing.slice(0, 5).join(", ")}${m.missing.length > 5 ? " 등" : ""})`] : []),
      ...(m.otherDong.length ? [`계산에 넣지 못한 다른 동 지번 ${n0(m.otherDong.length)}개(같은 구·군 법정동 이름이 아니거나 ${R.MERGE_MAX}개 동을 넘음: ${m.otherDong.slice(0, 3).join(", ")}${m.otherDong.length > 3 ? " 등" : ""})`] : [])];
    say(skipped.length ? `제외: ${skipped.join(" · ")}` : "");
    $("outAnswer").textContent = R.answerText(res);
    $("outBase").textContent = `${file.name} 건물 ${n0(res.n)}동 · 기준 ${res.thr}% · 경과 기준일 ${D.govDate(res.ref)} · 건축물대장 기준일 ${D.govDate(file.hub_reference_date)}`;
    $("basis").innerHTML = R.basisHTML(res, file);   // 분모·기준시점·현장 확인 비율(행정동을 고르면 쇠퇴지표 기준연도까지)
    $("viz").innerHTML = R.summaryHTML(res);   // 그림 요약(종합 판정 아님)
    $("lines").replaceChildren(...res.lines.map((l) => {
      const li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("small");
      li.dataset.status = l.status;
      b.textContent = `${l.label} · ${l.status}`;
      s.textContent = `기준 ${l.rule} · 이 목록 ${l.value} · ${l.basis}`;
      li.append(b, s);
      if (l.field && l.status === R.CHECK) {   // 현장에서 볼 수 있는 줄은 현장 기록으로 바로 넘긴다(같은 앱, 항목이 미리 골라진다)
        const a = document.createElement("a");
        a.href = `./?check=${l.field}`; a.textContent = "현장 기록으로 확인하기";
        li.append(a);
      }
      return li;
    }));
    renderTodo(res);
    showDongDecline(file);
    $("out").hidden = false;
    // 실제 결과가 생기면 견본 그림은 뺀다(휴대폰에서 결과 위를 가림). 제목으로 초점·스크롤을 옮겨 위 두 줄 답부터 읽게 한다
    document.querySelector(".redev-sample").hidden = true;
    $("outTitle").focus({ preventScroll: true });
    $("out").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 확인할 건물 → 현장 기록(같은 앱). 링크에 PNU·지번을 실어 보내고, 돌아오면 이 기기의 현장 기록을 PNU로 붙여 보여 준다
  const TODO_SHOW = 30;
  async function renderTodo(res) {
    const recs = window.FieldStore ? await window.FieldStore.records().catch(() => []) : [];
    const t = R.todoList(res, recs), box = $("todo");
    if (!t.items.length) { box.replaceChildren(); return; }
    const h = document.createElement("h3"), p = document.createElement("p"), ul = document.createElement("ul");
    h.textContent = `확인할 건물 ${n0(t.items.length)}동 · 현장 기록이 붙은 건물 ${n0(t.withRecord)}동`;
    p.className = "hint"; p.textContent = "사용승인일이 없는 건물입니다. 목조·블록·벽돌·조적부터 보입니다. 판정에는 쓰지 않고 확인 순서만 정합니다.";
    ul.className = "todo-list";
    for (const it of t.items.slice(0, TODO_SHOW)) {
      const li = document.createElement("li"), s = document.createElement("span");
      s.textContent = `${it.b.jibun || "지번 없음"} · ${it.b.structure || "구조 없음"} · ${it.b.main_use || "용도 없음"}`;
      li.append(s);
      if (it.records.length) {
        const r = document.createElement("b");
        r.textContent = `현장 기록 ${it.records.length}건(최근 ${D.govDate(D.localDate(it.records[0].recorded_at))})`;
        li.append(r);
      } else if (it.b.pnu) {
        const a = document.createElement("a");
        a.href = `./?check=unregistered&pnu=${it.b.pnu}&jibun=${encodeURIComponent(it.b.jibun || "")}`; a.textContent = "현장 기록으로 보내기";
        li.append(a);
      }
      ul.append(li);
    }
    box.replaceChildren(h, p, ul);
    if (t.items.length > TODO_SHOW) { const more = document.createElement("p"); more.className = "hint"; more.textContent = `나머지 ${(t.items.length - TODO_SHOW).toLocaleString("ko-KR")}동은 건물별 근거 CSV에 있습니다.`; box.append(more); }
  }

  // 경계안: 지번 목록 글과 법정동만 이 기기(localStorage)에 둔다. 볼 때마다 같은 건물 파일로 다시 센다(저장한 숫자를 믿지 않음)
  const PLAN_KEY = "renewmap-redev-plans";
  const loadPlans = () => { try { return JSON.parse(localStorage.getItem(PLAN_KEY) || "[]"); } catch (e) { return []; } };
  const savePlans = (ps) => { try { localStorage.setItem(PLAN_KEY, JSON.stringify(ps)); return true; } catch (e) { return false; } };
  const planSay = (text, err) => { $("planMsg").textContent = text; $("planMsg").className = err ? "msg err" : "msg"; };
  async function renderPlans() {
    const ps = loadPlans();
    $("plans").hidden = !ps.length;
    if (!ps.length) return;
    try {
      const plans = await Promise.all(ps.map(async (p) => {
        const items = R.parseList(p.list).items, file = await loadFor(items, p.dong), m = R.match(items, file);
        return { name: p.name, res: R.review(m.buildings, { ref: p.ref && p.ref > file.age_reference_date ? p.ref : file.age_reference_date, district: p.district }), keys: R.planKeys(m.buildings), dongName: file.name };
      }));
      $("planTable").innerHTML = R.compareHTML(R.comparePlans(plans));
      $("planList").replaceChildren(...plans.map((p, i) => {
        const li = document.createElement("li"), b = document.createElement("button");
        li.textContent = `${p.name} · ${p.dongName} ${p.res.n.toLocaleString("ko-KR")}동 `;
        b.type = "button"; b.className = "ghost"; b.textContent = "지우기";
        b.addEventListener("click", () => { savePlans(loadPlans().filter((_, j) => j !== i)); renderPlans(); });
        li.append(b);
        return li;
      }));
    } catch (err) { planSay("경계안을 다시 세지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
  }
  $("savePlan").addEventListener("click", () => {
    const ps = loadPlans();
    if (ps.length >= R.PLAN_MAX) return planSay(`경계안은 ${R.PLAN_MAX}개까지 비교해요. 하나를 지우고 넣어 주세요.`, true);
    const name = `경계안 ${["A", "B", "C"].find((x) => !ps.some((p) => p.name === `경계안 ${x}`))}`;
    if (!savePlans([...ps, { name, dong: last.file.bjd10, list: $("list").value, district: $("district").checked, ref: last.res.ref }])) return planSay("이 브라우저는 저장을 막아 두었습니다.", true);
    planSay(`${name}으로 저장했어요.`);
    renderPlans().then(() => $("plans").scrollIntoView({ behavior: "smooth", block: "start" }));
  });
  renderPlans();

  const applicationArgs = async () => {
    const current = last, day = today(), options = opt();
    const records = window.FieldStore ? await window.FieldStore.records() : [];
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(current.file)));
    const dataHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    return [current.res, current.m, current.file, day, { ...options, records, dataHash }];
  };
  $("consultHwpx").addEventListener("click", async () => {
    try {
      const args = await applicationArgs();
      await templates;
      D.saveBytes(fileName("hwpx", args[2], args[4], args[3]).replace("_입안요건_사전검토_", "_사전컨설팅_부록_"), D.hwpxBytes(R.buildConsultDoc(...args)), "application/hwp+zip");
    } catch (err) { say("부록을 만들지 못했습니다.\n신청요건 근거 CSV 끝에도 같은 질의가 있습니다.", true); }
  });
  $("applicationHwpx").addEventListener("click", async () => {
    try {
      const args = await applicationArgs();
      await templates;
      D.saveBytes(fileName("hwpx", args[2], args[4], args[3]).replace("_입안요건_사전검토_", "_신청요건_근거_"), D.hwpxBytes(R.buildApplicationDoc(...args)), "application/hwp+zip");
    } catch (err) { say("신청요건 문서를 만들지 못했습니다.\n신청요건 근거 CSV로 받아 보세요.", true); }
  });
  $("applicationCsv").addEventListener("click", async () => {
    try { const args = await applicationArgs(); D.saveBytes(fileName("csv", args[2], args[4], args[3]).replace("_입안요건_사전검토_", "_신청요건_근거_"), R.applicationCSV(...args), "text/csv;charset=utf-8"); say("신청요건 근거 CSV를 받았습니다."); }
    catch (err) { say("신청요건 근거 CSV를 만들지 못했습니다.\n이 기기의 현장 기록 저장소를 확인해 주세요.", true); }
  });
  const doc = async () => { await templates; return R.buildDoc(last.res, last.m, last.file, today(), opt()); };
  $("hwpx").addEventListener("click", async () => {
    try { D.saveBytes(fileName("hwpx"), D.hwpxBytes(await doc()), "application/hwp+zip"); } catch (err) { say("문서를 만들지 못했습니다.\nPDF로 저장해 보세요.", true); }
  });
  $("pdf").addEventListener("click", async () => {
    const box = $("printDoc");
    try { box.innerHTML = D.docHTML(await doc()).html; } catch (err) { return say("문서를 만들지 못했습니다.\n새로고침한 뒤 다시 해 보세요.", true); }
    document.body.classList.add("printing");
    window.addEventListener("afterprint", () => { document.body.classList.remove("printing"); box.textContent = ""; }, { once: true });
    window.print();
  });
  $("csv").addEventListener("click", () => D.saveBytes(fileName("csv"), R.toCSV(last.res, last.file, opt()), "text/csv;charset=utf-8"));
  $("sample").addEventListener("click", () => D.saveBytes(fileName("csv").replace("_사전검토_", "_수기대조표본_"), R.sampleCSV(last.res, last.file, opt()), "text/csv;charset=utf-8"));
  // 현장 앱(sw.js)이 이 쪽도 맡는다. 새 판이 자리를 잡으면 옛 계산 파일로 문서를 받지 않게 새로고침을 알린다
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener("controllerchange", () => say("계산 파일의 새 판을 받았습니다. 새로고침한 뒤 다시 계산하세요."));
})();
