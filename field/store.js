// 이 기기 저장소(IndexedDB). 현장 화면과 보관함이 같이 쓴다. 어디로도 보내지 않는다.
// records: 현장 기록, photos: 가린 사진(JPEG), docs: 만든 문서(한글·ZIP) — {id, name, kind, created_at, record_id, blob}
(function (root) {
  "use strict";
  const NAME = "renewmap-field", VERSION = 3, STORES = ["records", "photos", "docs"];
  let opening = null;
  function db() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const q = indexedDB.open(NAME, VERSION);
      q.onupgradeneeded = () => { for (const s of STORES) if (!q.result.objectStoreNames.contains(s)) q.result.createObjectStore(s, { keyPath: "id" }); };
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => { opening = null; reject(q.error); };
    });
    return opening;
  }
  async function tx(stores, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(stores, mode);
      const r = fn(...stores.map((s) => t.objectStore(s)));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const newest = (key) => (a, b) => String(b[key]).localeCompare(String(a[key]));
  const api = {
    tx,
    records: () => tx(["records"], "readonly", (s) => s.getAll()).then((a) => a.sort(newest("recorded_at"))),
    docs: () => tx(["docs"], "readonly", (s) => s.getAll()).then((a) => a.sort(newest("created_at"))),
    photo: (id) => tx(["photos"], "readonly", (s) => s.get(id)).then((r) => r && r.blob),
    doc: (id) => tx(["docs"], "readonly", (s) => s.get(id)),
    addDoc: (d) => tx(["docs"], "readwrite", (s) => s.put(d)),
    deleteDoc: (id) => tx(["docs"], "readwrite", (s) => s.delete(id)),
    // 같은 사진을 가져온 기록·재방문이 참조할 수 있어 미참조 사진만 지운다. 만든 문서는 보관함에 남는다.
    deleteRecord: (rec) => tx(["records", "photos"], "readwrite", (rs, ps) => {
      const q = rs.getAll();
      q.onsuccess = () => {
        const used = new Set(q.result.filter((r) => r.id !== rec.id).flatMap((r) => [...(r.photos || []), ...(r.prev_photos || [])]));
        for (const p of rec.photos || []) if (!used.has(p)) ps.delete(p);
        rs.delete(rec.id);
      };
      return q;
    }),
  };
  root.FieldStore = api;
})(typeof window !== "undefined" ? window : this);
