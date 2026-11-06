// 브이월드 웹지엘 3D 지도 API 3.0을 읽어 들인다. 그 스크립트가 document.write로 3D 엔진 파일을 더 붙이므로
// 페이지를 읽는 도중(이 파일 자리)에 넣어야 한다. 키는 vworld-key.js(사이트 저장소에만 있음)에서 읽고, 등록 주소에서만 동작한다.
// 브이월드 건물은 화면에 그때그때 띄우기만 하고 저장하지 않는다(약관 제19조, docs/research/soc_datasets_2026-11-07.md)
(function () {
  "use strict";
  const key = window.RENEWMAP_VWORLD_KEY || "";
  if (!/^[A-Za-z0-9-]+$/.test(key)) return;
  document.write(`<script src="https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${key}"><\/script>`);
})();
