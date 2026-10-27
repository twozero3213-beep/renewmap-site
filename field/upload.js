// 현장 확인 ZIP(기록+사진)을 쓰기 전용 저장소로 올린다. 순수 함수는 노드에서 시험한다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FieldUpload = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  const isConfigured = (c) => !!(c && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url || "") && c.key && c.bucket);
  // 올린 곳에서 서로 덮어쓰지 않도록 날짜 폴더 + 기기 번호 + 시각을 이름에 넣는다. 기기 번호는 이 기기에서 만든 무작위 값이다.
  const objectPath = (deviceId, now) => `inbox/${now.toISOString().slice(0, 10)}/${String(deviceId).replace(/[^A-Za-z0-9-]/g, "").slice(0, 36)}-${now.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}.zip`;
  const headers = (c, code) => ({ apikey: c.key, Authorization: `Bearer ${c.key}`, "x-team-code": code, "Content-Type": "application/zip", "x-upsert": "false" });
  async function send(c, code, deviceId, bytes, now, doFetch) {
    if (!isConfigured(c)) throw new Error("서버 올리기가 아직 설정되지 않았습니다");
    if (!String(code || "").trim()) throw new Error("팀 코드를 입력하세요");
    const path = objectPath(deviceId, now), res = await (doFetch || fetch)(`${c.url}/storage/v1/object/${c.bucket}/${path}`, { method: "POST", headers: headers(c, String(code).trim()), body: bytes });
    if (res.status === 401 || res.status === 403) throw new Error("팀 코드가 맞지 않거나 올릴 권한이 없습니다");
    if (!res.ok) throw new Error(`올리지 못했습니다(${res.status}). 잠시 뒤 다시 하거나 ZIP 내보내기를 쓰세요`);
    return path;
  }
  return { isConfigured, objectPath, headers, send };
});
