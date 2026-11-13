// 집계구로 다시 보기 화면. 판정 묶음(oa_decline_busan.json)은 한 번, 경계(oa/{행정동}.json)는 고른 동만 받는다.
(function () {
  "use strict";
  const O = window.RenewOA;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const getJson = (p) => fetch("../data/" + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const n = (x) => (x === null || x === undefined ? "–" : Number(x).toLocaleString("ko-KR"));
  let data = null, dong = null;

  const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const swatch = (g) => { const s = svg("svg", { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": "true" }); s.append(svg("rect", { width: 14, height: 14, rx: 3, fill: O.FILL[g], stroke: "#7a9089" })); return s; };

  function select(oa) {
    for (const p of $("map").querySelectorAll("path")) p.setAttribute("stroke-width", p.dataset.oa === oa ? "3" : "0.8");
    const tr = $("rows").querySelector(`tr[data-oa="${oa}"]`);
    for (const r of $("rows").children) r.removeAttribute("aria-current");
    if (tr) { tr.setAttribute("aria-current", "true"); tr.scrollIntoView({ block: "nearest" }); }
  }

  function drawMap(shapes) {
    const P = O.projector(shapes), box = svg("svg", { viewBox: `0 0 ${P.width} ${P.height}`, width: "100%", role: "img", "aria-label": `${dong.name} 집계구 ${dong.oas.length}개 경계` });
    for (const o of dong.oas) {
      const polys = shapes[o.oa];
      if (!polys) continue;
      const p = svg("path", { d: P.path(polys), fill: O.FILL[O.groupOf(o)], stroke: "#14302c", "stroke-width": "0.8", "fill-rule": "evenodd", tabindex: "0" });
      p.dataset.oa = o.oa;
      p.append(svg("title", {})); p.lastChild.textContent = `${o.oa} · ${O.LABEL[O.groupOf(o)]}`;
      p.addEventListener("click", () => select(o.oa));
      p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(o.oa); } });
      box.append(p);
    }
    $("map").replaceChildren(box);
  }

  function draw() {
    const s = O.summary(dong), y = data.years, i19 = y.indexOf(2019);
    $("outTitle").textContent = `${dong.sigungu_name} ${dong.name} 집계구 ${dong.oas.length}개`;
    $("outBase").textContent = `행정동 쇠퇴 확정된 요건 수 ${dong.met_count ?? "값 없음"} / 3 · 기준일 ${dong.met_ref || "–"} · 집계구 값 ${y[0]}~${y[y.length - 1]}년`;
    $("outCount").replaceChildren(...[2, 1, 0, "check"].map((g) => { const li = document.createElement("li"); li.append(swatch(g), ` ${O.LABEL[g]} ${s[g]}개`); return li; }));
    $("rows").replaceChildren(...dong.oas.map((o) => {
      const tr = document.createElement("tr"); tr.dataset.oa = o.oa;
      const td = (t) => { const c = document.createElement("td"); c.textContent = t; return c; };
      const first = td(""); first.title = o.oa; first.append(swatch(O.groupOf(o)), ` …${o.oa.slice(-6)}`);   // 앞 8자리는 행정동이라 같다. 전체 코드는 CSV·title에
      tr.append(first, td(`${n(o.pop[i19])} → ${n(o.pop[o.pop.length - 1])}`), td(O.yn(o.pop_req.consecutive_3y_in_5y)), td(o.pop_req.verdict),
        td(O.pct(o.biz_req.peak_drop_pct_10y)), td(O.yn(o.biz_req.consecutive_3y_in_5y)), td(o.biz_req.verdict), td(`${o.met}개`));
      tr.addEventListener("click", () => select(o.oa));
      return tr;
    }));
    $("src").textContent = `출처: ${data.source} · ${data.license_type} · 판정 규칙 ${data.rule}(승인 전). ${data.note}`;
    $("out").hidden = false;
  }

  async function show(code) {
    dong = data.dongs.find((d) => d.code === code);
    $("map").replaceChildren();
    if (!dong) { $("out").hidden = true; return say(""); }
    if (!dong.oas.length) { $("out").hidden = true; return say(`${dong.name}은 SGIS에서 집계구 값을 받지 못했습니다.`, true); }
    say("집계구 경계를 여는 중입니다.");
    draw();
    try {
      const shapes = await getJson(`oa/${code}.json`);
      if (dong?.code !== code) return;
      drawMap(shapes); say("");
    } catch (err) {
      if (dong?.code !== code) return;
      $("map").replaceChildren(); say("집계구 경계를 열지 못했습니다.\n표는 그대로 볼 수 있습니다.", true);
    }
  }

  getJson("oa_decline_busan.json").then((d) => {
    data = d;
    $("dong").replaceChildren(new Option("행정동을 고르세요", ""), ...data.dongs.map((x) => new Option(`${x.sigungu_name} ${x.name} (충족 ${x.met_count ?? "값 없음"}개)`.trim(), x.code)));
    $("dong").disabled = false;
    $("dong").addEventListener("change", () => show($("dong").value));
  }).catch(() => say("집계구 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true));

  $("csv").addEventListener("click", () => {
    if (!dong) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([O.toCSV(data, dong)], { type: "text/csv;charset=utf-8" }));
    // 서울 날짜(sv-SE = YYYY-MM-DD). toISOString은 UTC라 한국 0~9시에 전날이 된다. 이 쪽은 docgen.js(localDate)를 싣지 않는다
    a.download = `${dong.name}_집계구_쇠퇴요건_${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
})();
