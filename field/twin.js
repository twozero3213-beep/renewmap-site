// 계획 장면은 원장·법정 판정과 분리한다. 실측되지 않은 배치를 현황으로 승격하지 않는다.
(function(root) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./record.js') : root.FieldRecord;
  const LIMIT = 20 * 1024 * 1024; // shortcut: 모델당 20MB, 큰 구역 모델이 필요하면 타일 스트리밍으로 전환
  const slots = ['current','A','B'];
  function text(v, label, required=true) {
    if(typeof v !== 'string' || v.length>500 || (required && !v.trim()) || R.personalKinds(v).length) throw Error(`${label}: 빈 값·개인정보 없이 500자 이내로 적어 주세요.`);
    return v.trim();
  }
  function day(v) {
    if(typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v) throw Error('유효한 날짜가 필요합니다.');
    return v;
  }
  function phases(p) {
    const out={};
    for(const k of ['demolition','construction','completion']) out[k]=p[k] ? day(p[k]) : '';
    const a=Object.values(out).filter(Boolean);
    if(a.some((d,i)=>i && d<=a[i-1])) throw Error('철거·착공·준공 날짜는 순서대로 서로 다르게 입력하세요.');
    return out;
  }
  function stage(d,p) {
    day(d); p=phases(p);
    if(p.completion && d>=p.completion) return '준공';
    if(p.construction && d>=p.construction) return '공사';
    if(p.demolition && d>=p.demolition) return '철거';
    return Object.values(p).some(Boolean) ? '현재' : '단계 미입력';
  }
  function placement(p) {
    const out={};
    for(const [k,min,max] of [['longitude',-180,180],['latitude',-90,90],['height',-10000,100000],['heading',-360,360],['pitch',-180,180],['roll',-180,180],['scale',Number.MIN_VALUE,10000]]) {
      if(p[k]==null || p[k]==='' || !Number.isFinite(Number(p[k])) || Number(p[k])<min || Number(p[k])>max) throw Error(`배치 값 ${k}의 범위와 빈 칸을 확인하세요.`);
      out[k]=Number(p[k]);
    }
    return out;
  }
  function checkGLB(bytes) {
    if(!(bytes instanceof Uint8Array) || bytes.length<20 || bytes.length>LIMIT) throw Error('GLB 2.0 파일은 모델당 20MB까지 받습니다.');
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(dv.getUint32(0,true)!==0x46546c67 || dv.getUint32(4,true)!==2 || dv.getUint32(8,true)!==bytes.length) throw Error('GLB 헤더·크기를 확인하세요.');
    let json=null;
    for(let off=12;off<bytes.length;) {
      if(off+8>bytes.length) throw Error('GLB 청크가 잘렸습니다.');
      const n=dv.getUint32(off,true), type=dv.getUint32(off+4,true);
      if(n%4 || off+8+n>bytes.length || (off===12 && type!==0x4e4f534a)) throw Error('GLB 청크 형식을 확인하세요.');
      if(type===0x4e4f534a) {
        if(json) throw Error('GLB JSON 청크가 중복됐습니다.');
        json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(off+8,off+8+n)));
      }
      off+=8+n;
    }
    if(json?.asset?.version!=='2.0') throw Error('GLB 2.0만 지원합니다.');
    // 확장 속성에 숨긴 경로도 막아 현장 파일이 임의의 외부 서버를 부르지 않게 한다.
    const pending=[json];
    while(pending.length) {
      const obj=pending.pop();
      if(!obj || typeof obj!=='object') continue;
      for(const [k,v] of Object.entries(obj)) {
        if(/(uri|url)$/i.test(k) && v) throw Error('외부 URI 없이 텍스처·버퍼를 내장한 GLB로 다시 내보내 주세요.');
        if(v && typeof v==='object') pending.push(v);
      }
    }
    return json;
  }
  const modelKey=m=>R.sha256Hex(new TextEncoder().encode(JSON.stringify([m.sha256,placement(m.placement),m.pnu,m.building_id,m.origin,m.reference_date,m.kind])));
  function recordMatch(m,r) {
    if(!m.pnu || m.pnu!==(r.pnu || r.building?.pnu)) return '대응 미확인';
    return m.building_id && m.building_id===r.building?.mgm_bld_pk ? '건물 ID 일치' : '필지만 일치';
  }
  function verification(m,v,now=new Date().toISOString()) {
    if(!v.record_id || !Array.isArray(v.photo_sha256) || !v.photo_sha256.length || v.photo_sha256.some(h=>!/^[a-f0-9]{64}$/.test(h))) throw Error('사진 해시가 있는 현장 기록을 먼저 선택하세요.');
    for(const k of ['reference_m','model_m']) if(v[k]==='' || !Number.isFinite(Number(v[k])) || Number(v[k])<=0) throw Error('실측 길이와 모델 길이를 양수(m)로 입력하세요.');
    if(!Number.isFinite(Date.parse(now))) throw Error('대조 기록 시각이 필요합니다.');
    return {model_key:modelKey(m),record_id:text(v.record_id,'기록 ID'),photo_sha256:[...v.photo_sha256],checker:text(v.checker,'확인자 소속·직위'),basis:text(v.basis,'기준점·치수 대조 근거'),reference_m:Number(v.reference_m),model_m:Number(v.model_m),difference_m:Number(v.model_m)-Number(v.reference_m),recorded_at:now,status:'최종검수 전'};
  }
  function model(m) {
    if(!m || typeof m!=='object') throw Error('모델 정보가 필요합니다.');
    if(!/^data:model\/gltf-binary;base64,[A-Za-z0-9+/]+=*$/.test(m.data || '') || m.data.length>Math.ceil(LIMIT/3)*4+40) throw Error('모델 내장 데이터가 잘못됐거나 20MB를 넘습니다.');
    const bytes=Uint8Array.from(atob(m.data.split(',')[1]),c=>c.charCodeAt(0));
    checkGLB(bytes);
    if(R.sha256Hex(bytes)!==m.sha256) throw Error('모델 SHA-256이 파일과 다릅니다.');
    if(!['현황 자료(미검수)','추정','계획'].includes(m.kind)) throw Error('모델 자료 구분이 필요합니다.');
    if(m.pnu && !/^\d{19}$/.test(m.pnu)) throw Error('PNU는 19자리입니다.');
    return {name:text(m.name,'모델 이름'),data:m.data,sha256:m.sha256,source:text(m.source,'출처·제작자'),license:text(m.license,'이용조건'),reference_date:day(m.reference_date),kind:m.kind,origin:text(m.origin,'모델 원점·축·단위'),pnu:m.pnu || '',building_id:text(m.building_id || '','대장 건물 ID',false),placement:placement(m.placement)};
  }
  function scene(v) {
    if(v?.schema!=='renewmap-scene-v1' || !slots.includes(v.selection)) throw Error('리뉴맵 장면 파일이 아닙니다.');
    const models={};
    for(const k of slots) if(v.models?.[k]) {
      models[k]=model(v.models[k]);
      if((k==='current') === (models[k].kind==='계획')) throw Error('현재 자료와 계획안 구분을 확인하세요.');
    }
    const out={schema:v.schema,selection:v.selection,date:day(v.date),phases:phases(v.phases || {}),models,verifications:[]};
    if(!Array.isArray(v.verifications) || v.verifications.length>1000) throw Error('현장 대조 기록 형식을 확인하세요.');
    for(const x of v.verifications) {
      if(!/^[a-f0-9]{64}$/.test(x.model_key || '')) throw Error('대조한 모델 판을 확인하세요.');
      const proof=verification({sha256:'0'.repeat(64),placement:{longitude:0,latitude:0,height:0,heading:0,pitch:0,roll:0,scale:1},pnu:'',building_id:''},x,x.recorded_at);
      proof.model_key=x.model_key; out.verifications.push(proof);
    }
    if(v.camera) {
      out.camera={};
      for(const k of ['position','direction','up']) {
        if(!Array.isArray(v.camera[k]) || v.camera[k].length!==3 || !v.camera[k].every(Number.isFinite)) throw Error('카메라 좌표를 확인하세요.');
        out.camera[k]=v.camera[k];
      }
      if(Math.hypot(...out.camera.direction)<.9 || Math.hypot(...out.camera.up)<.9) throw Error('카메라 방향을 확인하세요.');
    }
    return out;
  }
  const api={LIMIT,slots,day,phases,stage,placement,checkGLB,modelKey,recordMatch,verification,model,scene};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.RenewTwin=api;
})(typeof globalThis!=='undefined' ? globalThis : this);
