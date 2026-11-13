// 오래된 창고·공장 목록 화면. 법정동 건물 파일(정적)만 받고 계산은 이 기기에서 한다.
(function () {
  "use strict";
  const I = window.RenewIdle;
  const $ = (id) => document.getElementById(id);
  const DATA = "../data/";
  const getJson = (p) => fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const n = (x) => Number(x).toLocaleString("ko-KR");
  let last = null;
  // 구별 공개 빈집 수(data/vacant_busan.json). 공개 파일이 있는 구만 표를 보인다. 순서는 원자료 그대로
  const vacant = getJson("vacant_busan.json").catch(() => null);
  async function drawVacant(gu) {
    const d = await vacant, g = d && d.gus.find((x) => x.gu === gu), name = $("gu").selectedOptions[0] ? $("gu").selectedOptions[0].text : "";
    $("vacant").hidden = !g;
    $("vacantNone").hidden = !!g;
    if (!g) { $("vacantNone").textContent = `${name}의 행정동별 빈집 수 공개 파일은 찾지 못했습니다. 지금은 영도구·부산진구·해운대구만 있습니다.`; return; }
    const th = (t) => { const c = document.createElement("th"); c.scope = "col"; c.textContent = t; return c; };
    const head = document.createElement("tr"); head.append(th("행정동"), th("빈집 수(호)"), ...g.grade_names.map(th));
    $("vacantHead").replaceChildren(head);
    $("vacantRows").replaceChildren(...g.rows.map((r) => {
      const tr = document.createElement("tr");
      for (const v of [r.dong, n(r.total), ...(r.grades || []).map(n)]) { const c = document.createElement("td"); c.textContent = v; tr.append(c); }
      return tr;
    }));
    $("vacantTitle").textContent = `${g.gu_name} 행정동별 공개 빈집 수 ${n(g.total)}호`;
    $("vacantBase").textContent = `출처: ${g.title} · 기준일 ${g.base_date} · ${d.license_type}`;
  }

  // 구·군 → 법정동 목록(buildings/index.json, 부산만). 처음 고른 곳은 영도구 청학동(창고·공장이 가장 많은 동)
  getJson("buildings/index.json").then((idx) => {
    const gus = idx.sigungu.filter((s) => s.code.startsWith("26") && s.dongs.length);
    const fill = (sel, items, pick) => sel.replaceChildren(...items.map(([v, t]) => { const o = new Option(t, v); o.selected = v === pick; return o; }));
    const showDongs = (gu, pick) => fill($("dong"), gus.find((s) => s.code === gu).dongs.map((d) => [d.code, d.name]), pick);
    fill($("gu"), gus.map((s) => [s.code, s.name]), "26200");
    showDongs("26200", "2620012000");
    $("gu").addEventListener("change", () => { showDongs($("gu").value); drawVacant($("gu").value); });
    drawVacant("26200");
  }).catch(() => say("구·군 목록을 불러오지 못했습니다.\n영도구 청학동만 볼 수 있습니다.", true));

  function draw(res, file) {
    $("outTitle").textContent = `${res.name} 창고·공장 ${n(res.rows.length)}동`;
    $("outBase").textContent = `전체 ${n(res.total)}동 중 주용도에 창고·공장이 들어간 건물 · 건축물대장 기준일 ${res.hub} · 경과 기준일 ${res.ref}`;
    $("outCount").replaceChildren(...["old", "unknown", "young"].map((g) => { const li = document.createElement("li"); li.textContent = `${I.LABEL[g]} ${n(res.count[g])}동`; return li; }));
    $("rows").replaceChildren(...res.rows.map((r) => {
      const tr = document.createElement("tr");
      const td = (t) => { const c = document.createElement("td"); c.textContent = t ?? ""; return c; };
      const go = document.createElement("td");
      if (r.pnu) { const a = document.createElement("a"); a.href = `./?pnu=${encodeURIComponent(r.pnu)}&jibun=${encodeURIComponent(r.jibun || "")}`; a.textContent = "기록하기"; go.append(a); }
      tr.append(td(r.jibun), td(r.main_use), td(r.use_apr_day || (r.use_apr_span || []).join("~") || "없음"), td(r.tot_area == null ? "" : n(r.tot_area)), td(I.LABEL[r.group]), go);
      return tr;
    }));
    $("src").textContent = `출처: ${file.source} · ${file.license}`;
    $("out").hidden = false;
  }

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    say("건축물대장 자료를 여는 중입니다.");
    let file;
    try { file = await getJson(`buildings/${$("dong").value}.json`); } catch (err) { return say("건축물대장 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
    last = I.list(file);
    say(last.rows.length ? "" : `${file.name}에는 주용도가 창고·공장인 건물이 없습니다.`);
    draw(last, file);
  });

  $("csv").addEventListener("click", () => {
    if (!last) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([I.toCSV(last)], { type: "text/csv;charset=utf-8" }));
    // 기기 시간대 날짜(sv-SE = YYYY-MM-DD). toISOString은 UTC라 한국 0~9시에 전날이 된다. 이 쪽은 docgen.js(localDate)를 싣지 않는다
    a.download = `${last.name}_창고공장_목록_${new Date().toLocaleDateString("sv-SE")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
})();
