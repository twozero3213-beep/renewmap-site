// 납품 최종 바이트·고정 입력·기준일 비교를 기기에 보관한다. 해시는 승인·서명 진위를 증명하지 않는다.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RenewTaskLink = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const MAX_BYTES = 20 * 1024 * 1024;
  const MIME = {hwpx:'application/hwp+zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',json:'application/json'};
  const BLOCKING = ['자료 없음','출처·계산 충돌','폐기된 셀','공개 셀의 근거 미기록','규칙·산식 승인 대기'];
  const enc = new TextEncoder();
  function text(value, label, max) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}을 확인해 주세요.`);
    return value;
  }
  async function hash(blob) {
    if (!root.crypto?.subtle) throw new Error('SHA-256을 사용할 수 없습니다. HTTPS에서 다시 여세요.');
    return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function capture(request, options = {}) {
    const inputJSON = text(request.inputJSON,'고정 입력 JSON',MAX_BYTES);
    JSON.parse(inputJSON);
    const comparisonJSON = JSON.stringify(request.comparison === undefined ? null : request.comparison);
    if (typeof comparisonJSON !== 'string') throw new Error('기준일 비교를 JSON으로 보관할 수 없습니다.');
    const templateVersion = text(request.templateVersion,'문서 양식 버전',200), c = request.context;
    if (!c || typeof c.code !== 'string' || !/^\d{8}$/.test(c.code) || !Number.isInteger(c.year)) throw new Error('문서 지역·기준연도를 확인해 주세요.');
    const context = {code:c.code,region:text(c.region,'지역명',200),year:c.year};
    if (!Array.isArray(request.reviewRows)) throw new Error('자료 점검 목록이 필요합니다.');
    const blockers = [];
    for (const title of BLOCKING) {
      const row = request.reviewRows.find(r=>Array.isArray(r) && r[0]===title);
      if (!row || typeof row[1]!=='string' || !/^\d+건$/.test(row[1])) throw new Error('자료 점검 건수와 필수 항목을 확인해 주세요.');
      if (parseInt(row[1],10)>0) blockers.push(title);
    }
    if (!Array.isArray(request.files) || !request.files.length || request.files.length>98) throw new Error('연결할 파일 목록을 확인해 주세요.');
    let total = 0;
    const files = request.files.map(file=>{
      const name = text(file.name,'파일명',240), kind = file.kind, bytes = file.bytes;
      if (!['hwpx','docx','pptx','xlsx'].includes(kind) || !name.toLowerCase().endsWith('.'+kind) || /[\\/\u0000-\u001f\u007f]/.test(name)) throw new Error('파일 이름이나 형식을 확인해 주세요.');
      if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes) && !(bytes instanceof Blob)) throw new Error('최종 파일 바이트가 필요합니다.');
      const size = bytes instanceof Blob ? bytes.size : bytes.byteLength;
      if (!size || size>MAX_BYTES || (total+=size)>MAX_BYTES) throw new Error('파일 묶음은 합계 20MB까지 보관합니다.');
      return {name,kind,blob:new Blob([bytes],{type:MIME[kind]})};
    });
    files.push({name:`${c.code}.input.json`,kind:'json',blob:new Blob([enc.encode(inputJSON)],{type:MIME.json})},
      {name:`${c.code}.comparison.json`,kind:'json',blob:new Blob([enc.encode(comparisonJSON)],{type:MIME.json})});
    if (new Set(files.map(f=>f.name)).size!==files.length || files.reduce((sum,f)=>sum+f.blob.size,0)>MAX_BYTES) throw new Error('파일명이 중복되었거나 파일 묶음이 20MB를 넘었습니다.');
    const [inputHash,comparisonHash] = await Promise.all([hash(files.at(-2).blob),hash(files.at(-1).blob)]);
    const artifacts = await Promise.all(files.map(async f=>({...f,sha256:await hash(f.blob),size:f.blob.size,input_hash:inputHash,comparison_hash:comparisonHash,template_version:templateVersion,blockers:blockers.slice()})));
    const packet = {id:root.crypto.randomUUID(),kind:'task-packet',created_at:new Date().toISOString(),context,files:artifacts};
    let store = options.store || root.FieldStore;
    if (!store && typeof window !== 'undefined') { await import('./field/store.js'); store = root.FieldStore; }
    if (typeof store?.addDoc !== 'function') throw new Error('이 브라우저에서는 기기 저장소를 사용할 수 없습니다.');
    await store.addDoc(packet);
    return packet;
  }
  return {capture,MAX_BYTES};
});
