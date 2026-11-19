// 음식점 상권 변화 유형 화면. 정적 파일(data/shop_change_busan.json, 있으면 data/shop_change_gyeongnam.json)만 받고 표는 이 기기에서 만든다.
// 2026-11-16 우지예: 양산·거제를 더했다. 고르는 칸을 '부산광역시'·'경상남도' 묶음으로 나누고, 경남을 고르면 그 시 평균과 견준 표를 보인다.
// 경남 파일을 못 받으면 부산만 보인다(부산 화면은 예전과 같다)
(function () {
  "use strict";
  const S = window.RenewShop;
  const $ = (id) => document.getElementById(id);
  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const n = (x) => (x === null || x === undefined ? "" : Number(x).toLocaleString("ko-KR"));
  const docs = { busan: null, gn: null };
  let last = null;
  const docOf = (key) => docs[key.split(":")[0]];

  function draw(key) {
    const doc = docOf(key), gu = key.split(":")[1];
    const rows = S.rowsFor(doc, gu);
    const gn = !!doc.kinds.general.city_avg;
    last = { doc, gu, rows };
    $("outTitle").textContent = `${gu} ${gn ? "법정동·읍면" : "법정동"} ${n(rows.length)}곳`;
    const avg = S.avgName(doc, gu);
    $("outBase").textContent = `인허가 기준일 ${doc.ref_date} · ${avg}(일반음식점) 운영 ${S.avgOf(doc, "general", gu).open_avg_m}개월, 폐업 ${S.avgOf(doc, "general", gu).closed_avg_m}개월 · ${avg}(휴게음식점) 운영 ${S.avgOf(doc, "rest", gu).open_avg_m}개월, 폐업 ${S.avgOf(doc, "rest", gu).closed_avg_m}개월`
      + (gn ? " · 읍·면은 리를 나누지 않고 읍·면 전체를 한 줄로 셉니다" : "");
    $("dongHead").textContent = gn ? "법정동·읍면" : "법정동";
    $("rows").replaceChildren(...rows.map((o) => {
      const tr = document.createElement("tr");
      const td = (t) => { const c = document.createElement("td"); c.textContent = t ?? ""; return c; };
      tr.append(td(S.dongText(o)));
      for (const k of S.KINDS) {
        const r = o[k];
        tr.append(td(r ? S.typeText(r, doc.min_n) : "자료 없음"), td(r ? `${n(r.n_open)}곳 · ${r.open_avg_m ?? "-"}개월` : ""), td(r ? `${n(r.n_closed)}곳 · ${r.closed_avg_m ?? "-"}개월` : ""));
      }
      return tr;
    }));
    $("src").textContent = `출처: ${doc.source} · ${doc.license} · 방법: ${doc.method}` + (doc.differs_from_busan ? ` · 부산과 다른 점: ${doc.differs_from_busan}` : "");
    $("out").hidden = false;
  }

  function group(label, key, doc, pick) {
    const g = document.createElement("optgroup");
    g.label = label;
    g.append(...S.gus(doc).map((name) => { const o = new Option(name, `${key}:${name}`); o.selected = name === pick; return o; }));
    return g;
  }

  const get = (f) => fetch(`../data/${f}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  get("shop_change_busan.json").then((d) => {
    docs.busan = d;
    const list = S.gus(d), pick = list.includes("중구") ? "중구" : list[0];
    $("gu").replaceChildren(group("부산광역시", "busan", d, pick));
    say("");
    return get("shop_change_gyeongnam.json").then((g) => { docs.gn = g; $("gu").append(group("경상남도", "gn", g, null)); }).catch(() => {});
  }).catch(() => say("상권 자료를 불러오지 못했습니다.\n인터넷 연결을 확인해 주세요.", true));

  $("f").addEventListener("submit", (e) => { e.preventDefault(); if (docs.busan) draw($("gu").value); });
  $("csv").addEventListener("click", () => {
    if (!last) return;
    RenewSave.saveFile(`${last.gu}_음식점_상권변화유형_${last.doc.ref_date}.csv`, [S.toCSV(last.doc, last.gu, last.rows)], "text/csv;charset=utf-8");
  });
})();
