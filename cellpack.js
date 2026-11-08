/* 줄여 저장한 원장 셀(cell_pack v1)을 원래 모양으로 되돌린다. 2026-11-08 추가.
   왜: 공개 JSON 셀의 절반 가까이가 같은 파일 안에서 되풀이되는 출처·이용조건·계산식이라, 파이썬(backend/renewmap/export/cellpack.py)이
   그 묶음을 파일 맨 위 cell_pack.prov에 한 번만 적고 셀에는 번호(_p)만 남긴다. 모든 셀에 있는 칸 중 흔한 값은 cell_pack.omit에 둔다.
   화면 코드는 그대로 c.source_name 등을 읽으면 된다: util.js fetchJson과 현장앱 getJson이 받자마자 이 함수를 거친다.
   규칙은 파이썬 unpack과 같다(둘을 함께 고친다). _p가 없는 셀은 원래 모양 셀로 보고 그대로 둔다. 줄이지 않은 파일도 그대로 통과한다.
   노드 시험에서는 require('./cellpack.js'), 브라우저에서는 window.RenewCellPack. */
(function (root) {
  'use strict';
  const PACK_KEY = 'cell_pack', REF_KEY = '_p', VERSION = 1;
  const isCellList = v => Array.isArray(v) && v.length > 0 && v.every(x => x && typeof x === 'object' && !Array.isArray(x) && ('cell_id' in x || REF_KEY in x));
  const clone = v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  function eachCellList(o, fn) {
    if (Array.isArray(o)) { for (const x of o) eachCellList(x, fn); return; }
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) { const v = o[k]; if (isCellList(v)) fn(v); else eachCellList(v, fn); }
  }
  // 그 자리에서 고치고 같은 객체를 돌려준다(큰 파일을 복사하지 않는다). null·배열·줄이지 않은 파일은 그대로
  function unpack(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !(PACK_KEY in doc)) return doc;
    const pk = doc[PACK_KEY]; delete doc[PACK_KEY];
    if (!pk || pk.v !== VERSION) throw new Error(`cell_pack 버전 ${pk && pk.v}은 모른다(이 코드는 v${VERSION})`);
    const prov = pk.prov || [], omit = pk.omit || {}, omitKeys = Object.keys(omit);
    eachCellList(doc, cells => {
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!(REF_KEY in c)) continue;
        const p = c[REF_KEY];
        if (!Number.isInteger(p) || p < 0 || p >= prov.length) throw new Error(`셀 ${c.cell_id}의 출처 번호 ${p}가 출처표(${prov.length}개) 밖이다`);
        const full = Object.assign({}, prov[p]);
        for (const k of omitKeys) if (!(k in c)) full[k] = clone(omit[k]);
        for (const k of Object.keys(c)) if (k !== REF_KEY) full[k] = c[k];
        cells[i] = full;
      }
    });
    return doc;
  }
  const api = { unpack, PACK_KEY, REF_KEY, VERSION };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.RenewCellPack = api;
})(typeof window !== 'undefined' ? window : globalThis);
