// 보관함: 이 기기(IndexedDB)의 받은 문서·현장 기록을 다시 받거나 지운다. 지울 때는 한 번 더 묻는다.
(function () {
  "use strict";
  const S = window.FieldStore, D = window.RenewDocgen, R = window.FieldRecord;
  const $ = (id) => document.getElementById(id);
  const say = (t) => { $("boxMsg").textContent = t; };
  const day = (iso) => { const t = new Date(iso); return `${t.getFullYear()}. ${t.getMonth() + 1}. ${t.getDate()}. ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };
  const MIME = { hwpx: "application/hwp+zip", zip: "application/zip" };
  function row(title, meta, acts) {
    const li = document.createElement("li"), b = document.createElement("b"), m = document.createElement("span"), a = document.createElement("div");
    b.textContent = title; m.className = "meta"; m.textContent = meta; a.className = "acts";
    for (const [label, fn, cls, aria] of acts) {
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = label; if (cls) btn.className = cls; if (aria) btn.setAttribute("aria-label", aria);
      btn.addEventListener("click", fn); a.append(btn);
    }
    li.append(b, m, a);
    return li;
  }
  const empty = (ul, text, href, label) => {
    const li = document.createElement("li"), p = document.createElement("p"), a = document.createElement("a");
    p.className = "box-empty"; p.textContent = text; a.href = href; a.textContent = label; li.append(p, a); ul.append(li);
  };
  // 결재 결과(학습 고리 1단계): 5단계 + 닫힌 사유 + 학습 동의. 고를 때마다 이 기기에만 저장한다
  function outcomeBox(d) {
    const o = d.outcome || {}, box = document.createElement("div"), sel = document.createElement("select"), why = document.createElement("fieldset"), ok = document.createElement("label"), cb = document.createElement("input");
    box.className = "outcome";
    sel.setAttribute("aria-label", `${d.name} 결재 결과`);
    for (const [v, l] of [["", "결재 결과 고르기"], ...R.OUTCOME_STATUS]) { const op = document.createElement("option"); op.value = v; op.textContent = l; op.selected = (o.status || "") === v; sel.append(op); }
    const lg = document.createElement("legend"); lg.textContent = "사유(해당하는 것 모두)"; why.append(lg);
    for (const [v, l] of R.REASON_CODES) { const lb = document.createElement("label"), c = document.createElement("input"); c.type = "checkbox"; c.value = v; c.checked = (o.reasons || []).includes(v); lb.append(c, document.createTextNode(l)); why.append(lb); }
    cb.type = "checkbox"; cb.checked = !!o.consent; ok.className = "consent"; ok.append(cb, document.createTextNode("리뉴맵 개선에 이 결과를 쓰는 데 동의(문서 내용·위치는 보내지 않음)"));
    const sync = () => { why.hidden = !R.NEEDS_REASON.includes(sel.value); ok.hidden = !sel.value; const e = box.querySelector(".exemplar"); if (e) e.hidden = sel.value !== "approved"; };
    const save = async () => {
      sync();
      const next = R.setOutcome(d, sel.value, [...why.querySelectorAll("input:checked")].map((c) => c.value), cb.checked, new Date());
      await S.addDoc(next); d.outcome = next.outcome; sync(); say(next.outcome ? "결재 결과를 이 기기에 저장했습니다." : "결재 결과를 지웠습니다."); tally();
    };
    sel.addEventListener("change", save); why.addEventListener("change", save); cb.addEventListener("change", save);
    sync(); box.append(sel, why, ok);
    if (Array.isArray(d.blocks) && d.blocks.length) {   // 4단계: 고친 한글 파일을 올리면 블록마다 고친 비율만 남긴다
      const up = document.createElement("label"), f = document.createElement("input"), info = document.createElement("span");
      f.type = "file"; f.accept = ".hwpx"; up.className = "edit-up"; info.className = "meta";
      info.textContent = d.block_edits ? `고친 부분 ${d.block_edits.filter((b) => b.edit_ratio >= 0.05).length}곳 / ${d.block_edits.length}곳` : "결재에 올린 최종 한글 파일을 올리면 고친 부분을 셉니다(이 기기 안에서만).";
      up.append(document.createTextNode("고친 한글 파일 올리기 "), f);
      f.addEventListener("change", async () => {
        try {
          const text = await R.hwpxText(new Uint8Array(await f.files[0].arrayBuffer())), edits = R.blockEdits(d.blocks, text);
          const next = { ...d, block_edits: edits, edited_text: text }; await S.addDoc(next); Object.assign(d, next);
          info.textContent = `고친 부분 ${edits.filter((b) => b.edit_ratio >= 0.05).length}곳 / ${edits.length}곳`; say("고친 부분을 셌습니다.\n파일 내용은 이 기기에만 남습니다.");
        } catch (e) { say(e.message || "파일을 읽지 못했습니다."); }
      });
      box.append(up, info);
    }
    const ex = document.createElement("button"); ex.type = "button"; ex.className = "ghost exemplar"; ex.textContent = "승인 사례로 내보내기";
    ex.addEventListener("click", () => {   // 6단계: 본문이 들어가므로 매번 묻는다
      if (!confirm("이 문서의 본문을 승인 사례 파일로 받습니다.\n리뉴맵 문장 개선에 쓰입니다.\n개인정보가 없는지 확인했나요?")) return;
      try {
        const rec = lastRecs.find((r) => r.id === d.record_id), x = R.exemplarOf(d, rec, rec && rec.checker, new Date());
        D.saveBytes(`exemplar_${x.emd || "nodong"}_${x.approved_on.replace(/-/g, "")}_${String(d.id).slice(0, 6)}.json`, JSON.stringify(x, null, 1), "application/json");
        say("승인 사례 파일을 받았습니다.");
      } catch (e) { say(e.message); }
    });
    box.append(ex);
    return box;
  }
  const withOutcome = (d, li) => { li.append(outcomeBox(d)); return li; };
  let lastDocs = [], lastRecs = [];
  function tally() {
    const n = (k) => lastDocs.filter((d) => d.outcome && d.outcome.status === k).length, rec = lastDocs.filter((d) => d.outcome).length;
    $("outcomeSum").textContent = rec ? `결과 기록 ${rec}건 · 채택 ${n("approved")} · 고쳐서 씀 ${n("edited")} · 반려 ${n("rejected")} · 개선 동의 ${lastDocs.filter((d) => d.outcome && d.outcome.consent).length}` : "1쪽을 결재에 올린 뒤 결과를 고르면 여기에 모입니다.";
  }
  // 기록 한 건의 원본 ZIP(records.json + 가린 사진)
  async function recordZip(rec) {
    const entries = [{ name: "records.json", data: JSON.stringify(R.exportDoc([rec], new Date()), null, 2) }];
    for (const id of rec.photos || []) { const b = await S.photo(id); if (b) entries.push({ name: `photos/${id}.jpg`, data: new Uint8Array(await b.arrayBuffer()) }); }
    return D.zipStore(entries, new Date().toISOString());
  }
  async function render() {
    const [docs, recs] = await Promise.all([S.docs(), S.records()]);
    lastDocs = docs; lastRecs = recs;
    const du = $("docs"), ru = $("recs");
    $("boxStats").innerHTML = R.statsHTML(R.stats(recs, new Date()), [["받은 문서", docs.length]]);   // 개수 요약(순위 아님)
    du.textContent = ""; ru.textContent = "";
    if (!docs.length) empty(du, "아직 받은 문서가 없습니다.\n현장 기록을 저장하고 1쪽 문서를 받아 보세요.", "field/", "현장 기록하기");
    for (const d of docs) du.append(withOutcome(d, row(d.name, `${day(d.created_at)} 받음`, [
      ["다시 받기", () => D.saveBytes(d.name, d.blob, MIME[d.kind] || "application/octet-stream"), "", `${d.name} 다시 받기`],
      ["지우기", async () => { if (!confirm(`${d.name} 문서를 지울까요?\n지운 문서는 되살릴 수 없습니다.`)) return; await S.deleteDoc(d.id); say("문서를 지웠습니다."); render(); }, "del", `${d.name} 지우기`],
    ])));
    tally();
    if (!recs.length) empty(ru, "아직 저장한 현장 기록이 없습니다.", "field/", "현장 기록하기");
    for (const r of recs) {
      const where = r.dong ? `${r.dong.sgName} ${r.dong.name}` : r.jibun || r.pnu || R.NO_PARCEL;
      ru.append(row(`${where} · ${r.target || r.item || "기록"}`, `${day(r.recorded_at)}${r.photos && r.photos.length ? ` · 사진 ${r.photos.length}장` : ""}${r.corrected ? " · 위치 보정됨" : ""}`, [
        ["원본 ZIP 받기", async () => D.saveBytes(`renewmap-field-${r.recorded_at.slice(0, 10)}-${r.id.slice(0, 8)}.zip`, await recordZip(r), MIME.zip), "", `${where} 기록 원본 받기`],
        ["지우기", async () => { if (!confirm("이 현장 기록과 사진을 지울까요?\n지운 기록은 되살릴 수 없습니다.")) return; await S.deleteRecord(r); say("기록을 지웠습니다."); render(); }, "del", `${where} 기록 지우기`],
      ]));
    }
  }
  // 동의한 결과만 JSONL로 받는다(사람이 직접 리뉴맵에 보낼 때만 쓰인다. 자동 전송 없음)
  $("outcomeExp").addEventListener("click", () => {
    const { text, n } = R.outcomesJSONL(lastDocs, lastRecs);
    if (!n) { say("개선에 동의한 결과가 없습니다."); return; }
    D.saveBytes(`renewmap-outcomes-${new Date().toISOString().slice(0, 10)}.jsonl`, text, "application/x-ndjson");
    say(`동의한 결과 ${n}건을 받았습니다.`);
  });
  render().catch(() => { $("docs").textContent = ""; $("recs").textContent = ""; say("이 브라우저에서는 기기 저장소를 쓸 수 없습니다."); });   // 뼈대를 지운다
})();
