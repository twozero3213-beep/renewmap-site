// 오래된 창고·공장 목록 화면. 법정동 건물 파일(정적)만 받고 계산은 이 기기에서 한다.
(function () {
  "use strict";
  const I = window.RenewIdle;
  const $ = (id) => document.getElementById(id);
  const DATA = "../data/";
  const getJson = (p) => fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const n = (x) => Number(x).toLocaleString("ko-KR");
  let last = null, requestId = 0;
  function clearBuildingResult(message) {
    requestId++;
    last = null;
    $("out").hidden = true;
    $("csv").disabled = true;
    say(message);
  }
  const selectBuilding = () => clearBuildingResult("선택한 법정동의 창고·공장을 보려면 목록 보기를 눌러 주세요.");
  $("dong").addEventListener("change", selectBuilding);
  function drawVacant(g, src) {
    const unit = g.unit || "행정동", house = g.unit ? "채" : "호";
    const count = (v) => Number.isFinite(v) ? n(v) : "자료 없음";   // 양산·거제 원자료는 한 채 한 줄
    // 표 아래 설명도 단위에 맞춘다(부산 문구 '행정동 단위라 경계가 다를 수 있다'는 양산·거제에는 틀린 말)
    const note = $("vacantNote");
    const lines = g.unit
      ? ["시가 올린 빈집 목록을 법정동(읍·면은 리)별로 세기만 했습니다.", "주소는 싣지 않고, 등급 구분은 시마다 다릅니다."]
      : ["구가 빈집 실태조사·정비계획으로 올린 값을 고치지 않고 옮겼습니다.", "행정동 단위라 위 법정동 목록과 경계가 다를 수 있습니다."];
    if (note) note.replaceChildren(lines[0], document.createElement("br"), lines[1]);   // innerHTML을 쓰지 않는다(문구도 글자로만)
    const th = (t) => { const c = document.createElement("th"); c.scope = "col"; c.textContent = t; return c; };
    const head = document.createElement("tr"); head.append(th(unit), th(`빈집 수(${house})`), ...g.grade_names.map(th));
    $("vacantHead").replaceChildren(head);
    $("vacantRows").replaceChildren(...g.rows.map((r) => {
      const tr = document.createElement("tr");
      for (const v of [r.dong, count(r.total), ...g.grade_names.map((_, i) => count(r.grades?.[i]))]) {
        const c = document.createElement("td"); c.textContent = v; tr.append(c);
      }
      return tr;
    }));
    $("vacantTitle").textContent = `${g.gu_name} 공개 빈집 수 ${n(g.total)}${house}`;
    const basis = $("vacantBase");
    basis.replaceChildren(g.title, ` · 기준일 ${I.vacantBase(g)} · ${src.license_type}`);
    if (typeof g.url === "string" && /^https:\/\//.test(g.url)) {
      const link = document.createElement("a");
      link.href = g.url;
      link.textContent = "공개 원자료 보기";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      basis.append(" · ", link);
    }
    $("vacantResult").hidden = false;
  }

  Promise.all(["vacant_busan.json", "vacant_gyeongnam.json"].map((path) => getJson(path).catch(() => null))).then((sources) => {
    const records = sources.flatMap((src) => Array.isArray(src?.gus) ? src.gus.map((g) => ({ g, src })) : []);
    const status = $("vacantStatus");
    if (!records.length) {
      status.textContent = "빈집 집계를 불러오지 못했습니다.";
      return;
    }
    status.textContent = sources.some((src) => !Array.isArray(src?.gus)) ? "일부 지역의 빈집 집계를 불러오지 못했습니다." : "";
    const select = $("vacantGu");
    select.replaceChildren(...records.map(({ g }) => new Option(g.gu_name, g.gu)));
    const update = () => {
      const record = records.find(({ g }) => g.gu === select.value);
      if (record) drawVacant(record.g, record.src);
    };
    select.addEventListener("change", update);
    select.disabled = false;
    update();
  });

  // 구·군 → 법정동 목록(buildings/index.json). 처음 고른 곳은 영도구 청학동(창고·공장이 가장 많은 동)
  // 2026-11-15 우지예: 부산 + 경남 양산시·거제시(PR #122 대용량 자료). 이 화면은 판정 없이 주용도·경과연수만 세므로
  // 조례가 없는 시도 열 수 있다. 종로·광명(시험용 비교 자료)은 열지 않으려고 시도를 코드 앞 두 자리로 골라 둔다
  const REGIONS = [["26", "부산광역시"], ["48", "경상남도"]];
  getJson("buildings/index.json").then((idx) => {
    const gus = idx.sigungu.filter((s) => REGIONS.some(([p]) => s.code.startsWith(p)) && s.dongs.length);
    const opts = (items, pick) => items.map(([v, t]) => { const o = new Option(t, v); o.selected = v === pick; return o; });
    const fill = (sel, items, pick) => sel.replaceChildren(...opts(items, pick));
    const showDongs = (gu, pick) => fill($("dong"), gus.find((s) => s.code === gu).dongs.map((d) => [d.code, d.name]), pick);
    // 시도별 묶음(optgroup). 목록 이름의 시도 앞말('경상남도 양산시')은 묶음 제목과 겹치므로 뗀다
    const availableRegions = REGIONS.filter(([prefix]) => gus.some(s => s.code.startsWith(prefix)));
    document.querySelector('label[for="gu"]').textContent = "구·군(" + availableRegions.map(([, label]) => label === "부산광역시" ? "부산" : label).join("·") + ")";
    $("gu").replaceChildren(...availableRegions.map(([p, label]) => {
      const g = document.createElement("optgroup"); g.label = label;
      g.append(...opts(gus.filter((s) => s.code.startsWith(p)).map((s) => [s.code, s.name.replace(label + " ", "")]), "26200"));
      return g;
    }));
    showDongs("26200", "2620012000");
    $("gu").addEventListener("change", () => { showDongs($("gu").value); selectBuilding(); });
  }).catch(() => say("구·군 목록을 불러오지 못했습니다.\n영도구 청학동만 볼 수 있습니다.", true));

  function draw(res, file) {
    const label = (g) => g === "unknown" ? "추가확인(완공된 날 없음)" : I.LABEL[g];   // 화면은 쉬운 말, 받는 CSV는 I.LABEL 그대로
    $("outTitle").textContent = `${res.name} 창고·공장 ${n(res.rows.length)}동`;
    $("outBase").textContent = `전체 ${n(res.total)}동 중 주용도에 창고·공장이 들어간 건물 · 건축물대장 기준일 ${res.hub} · 경과 기준일 ${res.ref}`;
    $("outCount").replaceChildren(...["old", "unknown", "young"].map((g) => { const li = document.createElement("li"); li.textContent = `${label(g)} ${n(res.count[g])}동`; return li; }));
    $("rows").replaceChildren(...res.rows.map((r) => {
      const tr = document.createElement("tr");
      const td = (t) => { const c = document.createElement("td"); c.textContent = t ?? ""; return c; };
      const go = document.createElement("td");
      if (r.pnu) { const a = document.createElement("a"); a.href = `./?pnu=${encodeURIComponent(r.pnu)}&jibun=${encodeURIComponent(r.jibun || "")}`; a.textContent = "기록하기"; go.append(a); }
      tr.append(td(r.jibun), td(r.main_use), td(r.use_apr_day || (r.use_apr_span || []).join("~") || "없음"), td(r.tot_area == null ? "" : n(r.tot_area)), td(label(r.group)), go);
      return tr;
    }));
    $("outSource").textContent = `출처: ${file.source} · ${file.license}`;
    $("out").hidden = false;
    $("csv").disabled = false;
  }

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearBuildingResult("건축물대장 자료를 여는 중입니다.");
    const id = requestId, code = $("dong").value;
    try {
      const file = await getJson(`buildings/${code}.json`);
      if (id !== requestId) return;
      const res = I.list(file);
      draw(res, file);
      last = res;
      say(res.rows.length ? "" : `${file.name}에는 주용도가 창고·공장인 건물이 없습니다.`);
    } catch {
      if (id !== requestId) return;
      clearBuildingResult("");
      say("건축물대장 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true);
    }
  });

  $("csv").addEventListener("click", () => {
    if (!last) return;
    // 서울 날짜(sv-SE = YYYY-MM-DD). toISOString은 UTC라 한국 0~9시에 전날이 된다. 이 쪽은 docgen.js(localDate)를 싣지 않는다
    RenewSave.saveFile(`${last.name}_창고공장_목록_${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}.csv`, [I.toCSV(last)], "text/csv;charset=utf-8");
  });
})();
