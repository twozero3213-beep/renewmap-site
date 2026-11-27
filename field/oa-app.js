// 집계구로 다시 보기 화면. 판정 묶음(oa_decline_busan.json)은 한 번, 경계(oa/{행정동}.json)는 고른 동만 받는다.
(function () {
  "use strict";
  const O = window.RenewOA;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const getJson = (p) => fetch("../data/" + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const n = (x) => (x === null || x === undefined ? "–" : Number(x).toLocaleString("ko-KR"));
  let data = null, dong = null, selected = null, requestId = 0;
  const LABEL = O.LABEL;   // 상태어는 oa.js 한 곳에서 정해 화면과 받는 CSV가 같다
  const requested = new URLSearchParams(location.search).get("dong");
  const originCode = /^\d{7,10}$/.test(requested || "") ? requested : null;
  if (requested !== null) {
    $("origin").hidden = false;
    $("originNote").textContent = originCode ? `지도에서 요청한 행정동 코드 ${originCode}의 자료를 확인합니다.` : "행정동 코드 형식이 올바르지 않아 선택을 복원하지 않았습니다.";
    if (originCode) {
      $("originBack").href = `../explore.html#map/${originCode.slice(0, 2)}/${originCode.slice(0, 5)}/${originCode}`;
      $("originBack").textContent = "선택한 행정동 지도로 돌아가기";
    }
  }

  const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const swatch = (g) => { const s = svg("svg", { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": "true" }); s.append(svg("rect", { width: 14, height: 14, rx: 3, fill: O.FILL[g], stroke: "#7a9089" })); return s; };

  function markPath(path, active) {
    path.setAttribute("stroke-width", active ? "3" : "0.8");
    path.setAttribute("aria-pressed", String(active));
  }

  function select(oa) {
    selected = dong?.oas.find((o) => o.oa === oa) || null;
    if (!selected) return;
    for (const p of $("map").querySelectorAll("path")) markPath(p, p.dataset.oa === oa);
    for (const row of $("rows").children) {
      const active = row.dataset.oa === oa;
      row.querySelector("button").setAttribute("aria-pressed", String(active));
      if (active) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
    const title = $("oaDetailTitle");
    title.textContent = `${dong.name} 집계구 ${oa} 연도별 자료`;
    $("oaSeries").replaceChildren(...data.years.map((year, i) => {
      const tr = document.createElement("tr"), th = document.createElement("th");
      th.scope = "row"; th.textContent = `${year}년`;
      tr.append(th, td(selected.pop[i] == null ? "자료 없음" : n(selected.pop[i])),
        td(selected.biz[i] == null ? "자료 없음" : n(selected.biz[i])));
      return tr;
    }));
    $("oaDetailSource").textContent = `${data.source} · ${data.license_type} · 계산 규칙 ${data.rule} · 참고용 계산`;
    $("oaReasons").replaceChildren(...[["인구", selected.pop_req], ["사업체", selected.biz_req]].map(([label, rule]) => {
      const li = document.createElement("li"), status = document.createElement("strong");
      status.textContent = `${label} ${O.verdict(rule)}`;
      li.append(status, ` · ${rule.basis || "사유 기록 없음"}`);
      return li;
    }));
    $("oaDetail").hidden = false;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "start" });
  }

  function drawMap(shapes) {
    const P = O.projector(shapes), box = svg("svg", { viewBox: `0 0 ${P.width} ${P.height}`, width: "100%", role: "group", "aria-label": `${dong.name} 집계구 ${dong.oas.length}개 경계` });
    for (const o of dong.oas) {
      const polys = shapes[o.oa];
      if (!polys) continue;
      const p = svg("path", { d: P.path(polys), fill: O.FILL[O.groupOf(o)], stroke: "#14302c", "stroke-width": "0.8", "fill-rule": "evenodd", tabindex: "0", role: "button", "aria-label": `집계구 ${o.oa} 연도별 자료 보기` });
      p.dataset.oa = o.oa;
      markPath(p, selected?.oa === o.oa);
      p.append(svg("title", {})); p.lastChild.textContent = `${o.oa} · ${LABEL[O.groupOf(o)]}`;
      p.addEventListener("click", () => select(o.oa));
      p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(o.oa); } });
      box.append(p);
    }
    $("map").replaceChildren(box);
  }

  const td = (t) => { const c = document.createElement("td"); c.textContent = t; return c; };
  function draw() {
    const s = O.summary(dong), y = data.years, i19 = y.indexOf(2019);
    $("outTitle").textContent = `${dong.sigungu_name} ${dong.name} 집계구 ${dong.oas.length}개`;
    $("outBase").textContent = `이 자료에 기록된 행정동 요건 수 ${dong.met_count ?? "값 없음"} / 3 · 기준일 ${dong.met_ref || "–"} · 집계구 값 ${y[0]}~${y[y.length - 1]}년 · 원래 지도의 최신 결과와 기준일을 비교하세요.`;
    $("outCount").replaceChildren(...[2, 1, 0, "check"].map((g) => { const li = document.createElement("li"); li.append(swatch(g), ` ${LABEL[g]} ${s[g]}개`); return li; }));
    $("rows").replaceChildren(...dong.oas.map((o) => {
      const tr = document.createElement("tr"); tr.dataset.oa = o.oa;
      const first = td(""), button = document.createElement("button");
      button.type = "button"; button.className = "ghost";
      button.setAttribute("aria-label", `집계구 ${o.oa} 연도별 자료 보기`);
      button.setAttribute("aria-pressed", "false");
      button.append(swatch(O.groupOf(o)), ` …${o.oa.slice(-6)}`);
      first.append(button);
      tr.append(first, td(`${n(o.pop[i19])} → ${n(o.pop[o.pop.length - 1])}`), td(O.yn(o.pop_req.consecutive_3y_in_5y)), td(O.verdict(o.pop_req)),
        td(O.pct(o.biz_req.peak_drop_pct_10y)), td(O.yn(o.biz_req.consecutive_3y_in_5y)), td(O.verdict(o.biz_req)), td(`${o.met}개`));
      tr.addEventListener("click", () => select(o.oa));
      return tr;
    }));
    $("src").textContent = `출처: ${data.source} · ${data.license_type} · 계산 규칙 ${data.rule}(조문 숫자 대조 전 · 계산 방법과 해석은 정하지 못함 · 참고용 계산). ${data.note}`;
    $("out").hidden = false;
  }

  async function show(code) {
    const id = ++requestId;
    dong = data.dongs.find((d) => d.code === code);
    selected = null;
    $("oaDetail").hidden = true;
    $("map").replaceChildren();
    if (!dong) { $("out").hidden = true; return say(""); }
    if (!dong.oas.length) { $("out").hidden = true; return say(`${dong.name}은 SGIS에서 집계구 값을 받지 못했습니다.`, true); }
    say("집계구 경계를 여는 중입니다.");
    draw();
    try {
      const shapes = await getJson(`oa/${code}.json`);
      if (id !== requestId) return;
      drawMap(shapes); say("");
    } catch {
      if (id !== requestId) return;
      $("map").replaceChildren(); say("집계구 경계를 열지 못했습니다.\n표는 그대로 볼 수 있습니다.", true);
    }
  }

  // 2026-11-15 우지예: 경남 양산·거제(oa_decline_gyeongnam.json, PR #125)를 같은 목록에 붙인다. 두 파일은 같은 방법·규칙·연도로 만들어
  // 출처·규칙 문구(data.source·rule·years)가 같다 → 동만 이어 붙이고 시도 묶음(optgroup)으로 나눈다. 경남 파일을 못 받으면 부산만 보인다
  // 2026-11-16: 경상도 파일이 양산·거제에서 경남·경북 전체(96개 동)로 넓어졌다. 시도 묶음을 동의 시군구 코드 앞 두 자리(SGIS 37 경북·38 경남)로 나눈다
  const GROUPS = [["oa_decline_busan.json", "부산광역시"], ["oa_decline_gyeongnam.json", "경상도"]];
  const SIDO_OF = { "37": "경상북도", "38": "경상남도" };
  const bySido = (ds) => Object.entries(ds.reduce((o, x) => { const k = SIDO_OF[String(x.sigungu || x.code).slice(0, 2)] || "경상도"; (o[k] = o[k] || []).push(x); return o; }, {})).sort((p, q) => p[0].localeCompare(q[0], "ko"));
  Promise.all(GROUPS.map(([f], i) => getJson(f).catch((err) => { if (i === 0) throw err; return null; }))).then(([d, ...rest]) => {
    data = d;
    const sets = [[GROUPS[0][1], d.dongs], ...rest.flatMap((x) => (x && x.rule === d.rule && x.years.join() === d.years.join() ? bySido(x.dongs) : []))];
    data = { ...d, dongs: sets.flatMap(([, ds]) => ds) };
    const incomplete = rest.some((x) => !x || x.rule !== d.rule || x.years.join() !== d.years.join());
    $("coverage").textContent = `불러온 목록: ${sets.filter(([, ds]) => ds.length).map(([label, ds]) => `${label} ${ds.length}개 동`).join(" · ") || "없음"}. 목록에 있는 동의 자료만 확인할 수 있습니다.${incomplete ? " 일부 지역 자료를 확인할 수 없어 이 목록에 포함하지 않았습니다." : ""}`;
    const opt = (x) => new Option(`${x.sigungu_name} ${x.name} (기준 해당 ${x.met_count ?? "값 없음"}개)`.trim(), x.code);
    $("dong").replaceChildren(new Option("행정동을 고르세요", ""), ...sets.map(([label, ds]) => { const g = document.createElement("optgroup"); g.label = label; g.append(...ds.map(opt)); return g; }));
    $("dong").disabled = false;
    $("dong").addEventListener("change", () => show($("dong").value));
    // 링크의 값·판정은 받지 않는다. 요청한 동이 없으면 다른 동을 대신 고르지 않고 원래 지도로 돌아갈 수 있게 한다.
    if (originCode) {
      const selected = data.dongs.find((x) => x.code === originCode);
      $("originNote").textContent = selected ? `지도에서 선택한 ${selected.sigungu_name} ${selected.name}입니다. 행정동 결과는 원래 지도에서 확인하세요.` : `요청한 행정동(코드 ${originCode})의 집계구 자료는 현재 불러온 목록에 없습니다. 다른 동의 자료를 원래 동의 결과로 사용할 수 없습니다.`;
      if (selected) { $("dong").value = originCode; show(originCode); }
    }
  }).catch(() => {
    $("coverage").textContent = "자료 범위를 확인하지 못했습니다.";
    say("집계구 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true);
  });

  function saveCsv(oa) {
    if (!dong?.oas.length) return;
    // 서울 날짜(sv-SE = YYYY-MM-DD). 자정부터 오전 9시까지 UTC로 이름을 붙이면 전날이 된다.
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const name = oa ? `${dong.name}_집계구_${oa}_${date}.csv` : `${dong.name}_집계구_쇠퇴요건_${date}.csv`;
    RenewSave.saveFile(name, [O.toCSV(data, dong, oa)], "text/csv;charset=utf-8");
  }
  $("csv").addEventListener("click", () => saveCsv());
  $("oaCsv").addEventListener("click", () => { if (selected) saveCsv(selected.oa); });
})();
