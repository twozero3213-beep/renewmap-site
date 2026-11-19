/* 이 브라우저 안에서 만든 파일을 바로 내려받는 공용 도구(서버로 보내지 않는다). 브라우저에서는 window.RenewSave, 노드 시험에서는 require('./save-file.js').
   이번에 합치지 않은 것: docgen.saveBytes(docgen을 싣는 화면 공용·field SW 셸 파일), overlay.js saveCsv(explore.html은 W2-E1 소유, 다음 회차), viewer.js(문서 객체 주입 시험), app.js 상담 초안(여러 화면 공용, ?v= 없음), field/twin-app.js(SW 셸 파일이라 셸 목록·지문을 함께 바꿔야 한다) */
(function (root) {
  'use strict';
  // 주소는 10초 뒤 푼다. 전에 가장 길던 값(twin 10초)이라 짧아지는 곳이 없고, 느린 기기에서 받기 전에 풀리지 않게 한다
  function saveFile(name, parts, type) {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob(parts, { type }));
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  const api = { saveFile };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewSave = api;
})(typeof window !== 'undefined' ? window : globalThis);
