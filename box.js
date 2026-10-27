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
  // 기록 한 건의 원본 ZIP(records.json + 가린 사진)
  async function recordZip(rec) {
    const entries = [{ name: "records.json", data: JSON.stringify(R.exportDoc([rec], new Date()), null, 2) }];
    for (const id of rec.photos || []) { const b = await S.photo(id); if (b) entries.push({ name: `photos/${id}.jpg`, data: new Uint8Array(await b.arrayBuffer()) }); }
    return D.zipStore(entries, new Date().toISOString());
  }
  async function render() {
    const [docs, recs] = await Promise.all([S.docs(), S.records()]);
    const du = $("docs"), ru = $("recs");
    du.textContent = ""; ru.textContent = "";
    if (!docs.length) empty(du, "아직 받은 문서가 없습니다.\n현장 기록을 저장하고 1쪽 문서를 받아 보세요.", "field/", "현장 기록하기");
    for (const d of docs) du.append(row(d.name, `${day(d.created_at)} 받음`, [
      ["다시 받기", () => D.saveBytes(d.name, d.blob, MIME[d.kind] || "application/octet-stream"), "", `${d.name} 다시 받기`],
      ["지우기", async () => { if (!confirm(`${d.name} 문서를 지울까요?\n지운 문서는 되살릴 수 없습니다.`)) return; await S.deleteDoc(d.id); say("문서를 지웠습니다."); render(); }, "del", `${d.name} 지우기`],
    ]));
    if (!recs.length) empty(ru, "아직 저장한 현장 기록이 없습니다.", "field/", "현장 기록하기");
    for (const r of recs) {
      const where = r.dong ? `${r.dong.sgName} ${r.dong.name}` : r.jibun || r.pnu || R.NO_PARCEL;
      ru.append(row(`${where} · ${r.target || r.item || "기록"}`, `${day(r.recorded_at)}${r.photos && r.photos.length ? ` · 사진 ${r.photos.length}장` : ""}${r.corrected ? " · 위치 보정됨" : ""}`, [
        ["원본 ZIP 받기", async () => D.saveBytes(`renewmap-field-${r.recorded_at.slice(0, 10)}-${r.id.slice(0, 8)}.zip`, await recordZip(r), MIME.zip), "", `${where} 기록 원본 받기`],
        ["지우기", async () => { if (!confirm("이 현장 기록과 사진을 지울까요?\n지운 기록은 되살릴 수 없습니다.")) return; await S.deleteRecord(r); say("기록을 지웠습니다."); render(); }, "del", `${where} 기록 지우기`],
      ]));
    }
  }
  render().catch(() => say("이 브라우저에서는 기기 저장소를 쓸 수 없습니다."));
})();
