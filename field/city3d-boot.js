// 브이월드 웹지엘 3D 지도 API 3.0을 읽어 들인다. 그 스크립트가 document.write로 3D 엔진 파일을 더 붙이므로
// 페이지를 읽는 도중(이 파일 자리)에 넣어야 한다. 키는 vworld-key.js(사이트 저장소에만 있음)에서 읽고, 등록 주소에서만 동작한다.
// 브이월드 건물은 화면에 그때그때 띄우기만 하고 저장하지 않는다(약관 제19조, docs/research/soc_datasets_2026-11-07.md)
(function () {
  "use strict";
  // 외부 SDK가 문서 읽기를 멈춰도 이 감시와 복귀 동작은 먼저 실행돼 있어야 한다.
  let state = "loading", timer;
  const clear = () => { clearTimeout(timer); window.removeEventListener("error", sdkError, true); };
  const fail = () => {
    if (state !== "loading") return;
    state = "failed"; clear();
    for (const id of ["vmap", "views", "loading"]) { const el = document.getElementById(id); if (el) el.hidden = true; }
    const message = document.getElementById("message");
    message.textContent = "브이월드 3D 지도 응답을 받지 못했습니다.\n다시 시도하거나 2D 지도에서 확인해 주세요.";
    message.className = "msg err";
    const back = document.getElementById("city3dRecovery");   // 다시 시도·2D 지도는 실패했을 때만 보인다(정상으로 열려도 늘 보였다)
    if (back) back.hidden = false;
  };
  const sdkError = (event) => {
    const script = event.target;
    if (script && script.tagName === "SCRIPT" && script.src && new URL(script.src, location.href).hostname === "map.vworld.kr") fail();
  };
  window.City3dLoad = {
    get state() { return state; },
    fail,
    ready() { if (state === "failed") return false; state = "ready"; clear(); return true; },
  };
  document.getElementById("city3dRetry").addEventListener("click", (event) => { event.preventDefault(); location.reload(); });
  window.addEventListener("error", sdkError, true);
  timer = setTimeout(fail, 15000);
  const key = window.RENEWMAP_VWORLD_KEY || "";
  if (!/^[A-Za-z0-9-]+$/.test(key)) { fail(); return; }
  // https에서는 키에 등록한 서비스 주소를 domain으로 같이 보낸다(vw-frame.js의 DOMAIN과 같은 값)
  const domain = encodeURIComponent("https://twozero3213-beep.github.io/renewmap-site/");
  document.write(`<script src="https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${key}&domain=${domain}"><\/script>`);
})();
