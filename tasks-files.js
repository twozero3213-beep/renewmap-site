(function(root,factory){'use strict';const api=factory(typeof module==='object'&&module.exports?require('./tasks.js'):root.RenewTasks);if(typeof module==='object'&&module.exports)module.exports=api;else root.TaskFiles=api;})(typeof globalThis!=='undefined'?globalThis:this,function(T){
  'use strict';
  const MAX=20*1024*1024, MAX_FILES=500, MAX_JSON=40*1024*1024, HEX=/^[a-f0-9]{64}$/;
  function needed(history){const out=new Set();for(const r of history){for(const a of r.artifacts||[])out.add(a.sha256);for(const c of r.checks||[])if(HEX.test(c.evidence_sha256||''))out.add(c.evidence_sha256);if(r.decision)out.add(r.decision.evidence.sha256);}return out;}
  function to64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  function fields(value,names){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));}
  function fileName(name){if(typeof name!=='string'||!name.trim()||name.length>240||['.','..'].includes(name.trim())||/[\x00-\x1f\x7f/\\:]/.test(name))throw new Error('백업 파일 이름이 올바르지 않습니다.');return name;}
  function textSize(text){if(typeof text!=='string'||text.length>MAX_JSON||new TextEncoder().encode(text).byteLength>MAX_JSON)throw new Error('백업이 너무 큽니다.');}
  function declaredSizes(history){const sizes=new Map();for(const r of history)for(const f of [...r.artifacts,...(r.decision?[r.decision.evidence]:[])]){if(sizes.has(f.sha256)&&sizes.get(f.sha256)!==f.size)throw new Error('같은 파일의 크기 기록이 다릅니다.');sizes.set(f.sha256,f.size);}return sizes;}
  function from64(s){
    if(typeof s!=='string'||s.length>Math.ceil(MAX/3)*4||s.length%4)throw new Error('백업 파일의 데이터 형식이 올바르지 않습니다.');
    const pad=s.endsWith('==')?2:s.endsWith('=')?1:0,body=s.slice(0,s.length-pad),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    if(/[^A-Za-z0-9+/]/.test(body)||(pad===2&&alphabet.indexOf(body.at(-1))%16!==0)||(pad===1&&alphabet.indexOf(body.at(-1))%4!==0))throw new Error('백업 파일의 데이터 형식이 올바르지 않습니다.');
    if(s.length/4*3-pad>MAX)throw new Error('파일 크기는 20MB 이하여야 합니다.');
    return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  }
  async function make(history,entries){
    const manifest=await T.manifest(history),wanted=needed(manifest.history),sizes=declaredSizes(manifest.history),files=[];let size=0;
    if(wanted.size>MAX_FILES)throw new Error('백업 파일은 500개 이하여야 합니다.');
    for(const sha of wanted){
      const e=entries.find(x=>x.sha256===sha);if(!e||!e.blob)throw new Error('연결된 파일이 없습니다. 원본 파일을 보관함에서 확인해 주세요.');
      const name=fileName(e.name),bytes=new Uint8Array(await e.blob.arrayBuffer());size+=bytes.length;
      if(size>MAX)throw new Error('묶음의 파일 합계는 20MB 이하여야 합니다.');
      if((sizes.has(sha)&&sizes.get(sha)!==bytes.length)||await T.hash(bytes)!==sha)throw new Error('보관 파일의 해시 또는 크기가 기록과 다릅니다.');
      files.push({sha256:sha,name,base64:to64(bytes)});
    }
    const backup={schema:'renewmap-task-backup-v1',manifest,files};textSize(JSON.stringify(backup));return backup;
  }
  async function read(text){
    textSize(text);const b=JSON.parse(text);
    if(!fields(b,['schema','manifest','files'])||b.schema!=='renewmap-task-backup-v1'||!Array.isArray(b.files)||b.files.length>MAX_FILES||!b.manifest)throw new Error('리뉴맵 과업 백업 형식이 아닙니다.');
    const manifest=await T.manifest(b.manifest.history);if(T.canonical(manifest)!==T.canonical(b.manifest))throw new Error('백업의 납품 목록과 이력이 다릅니다.');
    const wanted=needed(manifest.history),sizes=declaredSizes(manifest.history),seen=new Set(),files=[];let size=0;
    for(const f of b.files){
      if(!fields(f,['sha256','name','base64'])||!HEX.test(f.sha256)||seen.has(f.sha256)||!wanted.has(f.sha256))throw new Error('백업 파일 목록이 올바르지 않습니다.');
      fileName(f.name);const bytes=from64(f.base64);size+=bytes.length;
      if(size>MAX||(sizes.has(f.sha256)&&sizes.get(f.sha256)!==bytes.length)||await T.hash(bytes)!==f.sha256)throw new Error('백업 파일이 변경됐거나 크기 제한을 넘었습니다.');
      seen.add(f.sha256);files.push({...f,bytes});
    }
    if(seen.size!==wanted.size)throw new Error('백업에 필요한 파일이 빠져 있습니다.');return{manifest,files};
  }
  return{MAX,needed,make,read,from64};
});
