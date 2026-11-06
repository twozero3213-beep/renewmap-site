// 음식점 상권 변화 유형 화면. 정적 파일 하나(data/shop_change_busan.json)만 받고 표는 이 기기에서 만든다.
(function () {
  "use strict";
  const S = window.RenewShop;
  const $ = (id) => document.getElementById(id);
  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const n = (x) => (x === null || x === undefined ? "" : Number(x).toLocaleString("ko-KR"));
  let doc = null, last = null;

  function draw(gu) {
    const rows = S.rowsFor(doc, gu);
    last = { gu, rows };
    $("outTitle").textContent = `${gu} 법정동 ${n(rows.length)}곳`;
    $("outBase").textContent = `인허가 기준일 ${doc.ref_date} · 부산 평균(일반음식점) 운영 ${doc.kinds.general.busan.open_avg_m}개월, 폐업 ${doc.kinds.general.busan.closed_avg_m}개월 · 부산 평균(휴게음식점) 운영 ${doc.kinds.rest.busan.open_avg_m}개월, 폐업 ${doc.kinds.rest.busan.closed_avg_m}개월`;
    $("rows").replaceChildren(...rows.map((o) => {
      const tr = document.createElement("tr");
      const td = (t) => { const c = document.createElement("td"); c.textContent = t ?? ""; return c; };
      tr.append(td(o.dong));
      for (const k of S.KINDS) {
        const r = o[k];
        tr.append(td(r ? S.typeText(r, doc.min_n) : "자료 없음"), td(r ? `${n(r.n_open)}곳 · ${r.open_avg_m ?? "-"}개월` : ""), td(r ? `${n(r.n_closed)}곳 · ${r.closed_avg_m ?? "-"}개월` : ""));
      }
      return tr;
    }));
    $("src").textContent = `출처: ${doc.source} · ${doc.license} · 방법: ${doc.method}`;
    $("out").hidden = false;
  }

  fetch("../data/shop_change_busan.json").then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((d) => {
    doc = d;
    const list = S.gus(d), pick = list.includes("중구") ? "중구" : list[0];
    $("gu").replaceChildren(...list.map((g) => { const o = new Option(g, g); o.selected = g === pick; return o; }));
    say("");
  }).catch(() => say("상권 자료를 불러오지 못했습니다.\n인터넷 연결을 확인해 주세요.", true));

  $("f").addEventListener("submit", (e) => { e.preventDefault(); if (doc) draw($("gu").value); });
  $("csv").addEventListener("click", () => {
    if (!last) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([S.toCSV(doc, last.gu, last.rows)], { type: "text/csv;charset=utf-8" }));
    a.download = `${last.gu}_음식점_상권변화유형_${doc.ref_date}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
})();
