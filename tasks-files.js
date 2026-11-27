(function(root,factory){'use strict';const api=factory(typeof module==='object'&&module.exports?require('./tasks.js'):root.RenewTasks);if(typeof module==='object'&&module.exports)module.exports=api;else root.TaskFiles=api;})(typeof globalThis!=='undefined'?globalThis:this,function(T){
  'use strict';
  const MAX=20*1024*1024, MAX_FILES=500, MAX_JSON=40*1024*1024, HEX=/^[a-f0-9]{64}$/;
  const states={planned:'계획 기록',invalid:'입력 다시 확인',hold:'근거 부족 보류',ready:'대조 완료·검토 대기',approved:'승인 기록',rejected:'반려 기록'};
  // 파일명 안의 줄바꿈·방향 제어문자는 텍스트 문서의 구조를 바꾸지 못하게 표시한다.
  const quoteText=value=>JSON.stringify(value===null||value===undefined?'':String(value)).replace(/[\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
  const checkResultLabels={match:'대조 일치',pending:'추가확인',conflict:'근거 충돌',invalid:'입력 다시 확인'};
  function needed(history){const out=new Set();for(const r of history){for(const a of [...(r.artifacts||[]),...T.workEvidence(r)])out.add(a.sha256);for(const c of r.checks||[])if(HEX.test(c.evidence_sha256||''))out.add(c.evidence_sha256);if(r.decision)out.add(r.decision.evidence.sha256);}return out;}
  function to64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  function fields(value,names){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));}
  function fileName(name){if(typeof name!=='string'||!name.trim()||name.length>240||['.','..'].includes(name.trim())||/[\x00-\x1f\x7f/\\:]/.test(name))throw new Error('백업 파일 이름이 올바르지 않습니다.');return name;}
  function textSize(text){if(typeof text!=='string'||text.length>MAX_JSON||new TextEncoder().encode(text).byteLength>MAX_JSON)throw new Error('백업이 너무 큽니다.');}
  // 납품 ZIP과 인수인계 TXT가 같은 경로를 쓰도록 경로는 여기서만 만든다. 같은 바이트는 이력상 첫 이름의 확장자, 이름 없는 대조 지문은 확장자 없음.
  function filePaths(history){
    const paths=new Map();
    for(const r of history)for(const f of [...r.artifacts,...T.workEvidence(r),...(r.decision?[r.decision.evidence]:[])])if(!paths.has(f.sha256)){
      paths.set(f.sha256,T.zipPath(f.sha256,f.name));
    }
    for(const sha of needed(history))if(!paths.has(sha))paths.set(sha,'files/'+sha);
    return paths;
  }
  function zipEntries(backup,text){
    const paths=filePaths(backup.manifest.history);
    return [{name:'인수인계.txt',data:text},{name:'manifest.json',data:JSON.stringify(backup.manifest,null,2)},
      {name:'SHA256SUMS.txt',data:backup.files.map(f=>f.sha256+'  '+paths.get(f.sha256)+'\n').join('')},
      ...backup.files.map(f=>({name:paths.get(f.sha256),data:from64(f.base64)}))];
  }
  function declaredSizes(history){const sizes=new Map();for(const r of history)for(const f of [...r.artifacts,...T.workEvidence(r),...(r.decision?[r.decision.evidence]:[])]){if(sizes.has(f.sha256)&&sizes.get(f.sha256)!==f.size)throw new Error('같은 파일의 크기 기록이 다릅니다.');sizes.set(f.sha256,f.size);}return sizes;}
  function from64(s){
    if(typeof s!=='string'||s.length>Math.ceil(MAX/3)*4||s.length%4)throw new Error('백업 파일의 데이터 형식이 올바르지 않습니다.');
    const pad=s.endsWith('==')?2:s.endsWith('=')?1:0,body=s.slice(0,s.length-pad),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    if(/[^A-Za-z0-9+/]/.test(body)||(pad===2&&alphabet.indexOf(body.at(-1))%16!==0)||(pad===1&&alphabet.indexOf(body.at(-1))%4!==0))throw new Error('백업 파일의 데이터 형식이 올바르지 않습니다.');
    if(s.length/4*3-pad>MAX)throw new Error('파일 크기는 20MB 이하여야 합니다.');
    return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  }
  async function checkedBytes(entry,sha,size) {
    if(!entry?.blob)throw Object.assign(new Error('연결된 파일이 없습니다. 원본 파일을 보관함에서 확인해 주세요.'), {code:'TASK_FILE_MISSING',sha});
    if(entry.blob.size>MAX)throw new Error('파일 크기는 20MB 이하여야 합니다.');
    const bytes=new Uint8Array(await entry.blob.arrayBuffer());
    if((size!==undefined&&size!==bytes.length)||await T.hash(bytes)!==sha)
      throw Object.assign(new Error('보관 파일의 해시 또는 크기가 기록과 다릅니다.'), {code:'TASK_FILE_MISMATCH',sha});
    return bytes;
  }
  async function make(history,entries){
    const manifest=await T.manifest(history),wanted=needed(manifest.history),sizes=declaredSizes(manifest.history),files=[];let size=0;
    if(wanted.size>MAX_FILES)throw new Error('백업 파일은 500개 이하여야 합니다.');
    for(const sha of wanted){
      const e=entries.find(x=>x.sha256===sha), bytes=await checkedBytes(e,sha,sizes.get(sha));
      size+=bytes.length;
      if(size>MAX)throw new Error('묶음의 파일 합계는 20MB 이하여야 합니다.');
      files.push({sha256:sha,name:fileName(e.name),base64:to64(bytes)});
    }
    const backup={schema:'renewmap-task-backup-v1',manifest,files};textSize(JSON.stringify(backup));return backup;
  }
  async function selectedZip(history,names,entries) {
    if(!Array.isArray(names)||!names.length||new Set(names).size!==names.length)
      throw new Error('현재 판에서 전달할 파일을 선택해 주세요.');
    const picks=new Set(names);
    const manifest=await T.manifest(history);
    const chosen=manifest.artifacts.filter(file=>picks.has(file.name));
    if(chosen.length!==picks.size)throw new Error('현재 판에 없는 파일이 선택됐습니다. 다시 확인해 주세요.');
    if(chosen.length>MAX_FILES)throw new Error('전달 파일은 500개 이하여야 합니다.');
    const stored=new Map(entries.filter(Boolean).map(entry=>[entry.sha256,entry]));
    const byHash=new Map(), contents=new Map(), files=[];
    let total=0;
    for(const {name,sha256,size} of chosen) {
      let bytes=byHash.get(sha256);
      if(!bytes) {
        bytes=await checkedBytes(stored.get(sha256),sha256,size);
        byHash.set(sha256,bytes);
      }
      if(size!==bytes.length)throw new Error('같은 파일의 크기 기록이 다릅니다.');
      const path=T.zipPath(sha256,name);
      if(!contents.has(path)) {
        total+=bytes.length;
        if(total>MAX)throw new Error('묶음의 파일 합계는 20MB 이하여야 합니다.');
        contents.set(path,{sha256,bytes});
      }
      files.push({name,path,sha256,size});
    }
    const receipt={schema:'renewmap-selected-delivery-v1',revision:manifest.revision,head_sha256:manifest.head_hash,
      source_state:manifest.state,selected_count:files.length,current_count:manifest.artifacts.length,files};
    const index=[
      '선택 전달 파일 목록',
      '과업판 v'+receipt.revision+' · 사용자 검토 기록 · '+states[receipt.source_state],
      '선택 이름 '+files.length+'개 · files 폴더의 파일 '+contents.size+'개',
      '같은 ZIP 경로로 표시한 이름은 압축 안의 파일 하나를 가리킵니다.',
      '파일 확인값은 목록과 파일을 대조하는 데 사용합니다.',
      '자료의 사실 여부와 기관 승인은 별도 증빙으로 확인하세요.',
      '',
      ...receipt.files.flatMap(file=>[
        quoteText(file.name), '  ZIP 경로 '+file.path, '  '+file.size+'바이트',
      ]),
    ].join('\n')+'\n';
    return {receipt,entries:[
      {name:'사용범위.txt',data:[
        '선택 파일 전달 ZIP',
        '과업 판 v'+receipt.revision+' · 선택 목록 '+files.length+'개 · files 폴더에 든 파일 '+contents.size+'개',
        '원래 파일 이름과 ZIP 안의 경로는 전달_파일_목록.txt와 전달_파일_목록.json에서 확인하세요.',
        'SHA256SUMS.txt의 SHA-256은 압축을 푼 파일이 목록과 일치하는지 확인할 때 씁니다.',
        'ZIP을 푼 뒤 files 안의 이름을 유지하세요. 리뉴맵 과업·납품의 받은 전달 파일 대조에서 목록 JSON과 원본 파일을 고를 수 있습니다.',
        '자료 출처와 내용의 사실 여부, 기관 승인은 별도 증빙으로 확인하세요.',
        '보내기 전에 파일 이름과 내용의 개인정보를 확인하세요.',
      ].join('\n')+'\n'},
      {name:'전달_파일_목록.txt',data:index},
      {name:'전달_파일_목록.json',data:JSON.stringify(receipt,null,2)+'\n'},
      {name:'SHA256SUMS.txt',data:[...contents].map(([path,f])=>f.sha256+'  '+path+'\n').join('')},
      ...[...contents].map(([name,f])=>({name,data:f.bytes}))
    ]};
  }
  const MAX_DELIVERY_LIST=2*1024*1024;
  async function readDeliveryList(file) {
    if(!(file instanceof Blob)||!file.size||file.size>MAX_DELIVERY_LIST)
      throw new Error('압축을 푼 2MB 이하의 전달_파일_목록.json을 골라 주세요.');
    const bad=()=>new Error('리뉴맵 선택 전달 파일 목록의 형식을 확인해 주세요.');
    const bytes=await file.arrayBuffer();
    let receipt;
    try { receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
    catch (_) { throw bad(); }
    if(!fields(receipt,['schema','revision','head_sha256','source_state','selected_count','current_count','files'])||
       receipt.schema!=='renewmap-selected-delivery-v1'||!Number.isSafeInteger(receipt.revision)||receipt.revision<1||
       typeof receipt.head_sha256!=='string'||!HEX.test(receipt.head_sha256)||typeof receipt.source_state!=='string'||!Object.hasOwn(states,receipt.source_state)||
       !Array.isArray(receipt.files)||receipt.files.length<1||receipt.files.length>MAX_FILES||
       receipt.selected_count!==receipt.files.length||!Number.isSafeInteger(receipt.current_count)||
       receipt.current_count<receipt.selected_count)throw bad();
    const paths=new Map(), names=new Set(), sizes=new Map();
    let total=0;
    for(const row of receipt.files) {
      if(!fields(row,['name','path','sha256','size'])||typeof row.name!=='string'||!row.name.trim()||row.name.length>240||
         names.has(row.name)||typeof row.sha256!=='string'||!HEX.test(row.sha256)||
         row.path!==T.zipPath(row.sha256,row.name)||!Number.isSafeInteger(row.size)||row.size<1||row.size>MAX)throw bad();
      names.add(row.name);
      if(sizes.has(row.sha256)&&sizes.get(row.sha256)!==row.size)throw bad();
      sizes.set(row.sha256,row.size);
      const basename=row.path.slice('files/'.length), previous=paths.get(basename);
      if(previous)previous.names.push(row.name);
      else {
        paths.set(basename,{sha256:row.sha256,size:row.size,names:[row.name]});
        total+=row.size;
        if(total>MAX)throw bad();
      }
    }
    return {receipt,paths};
  }
  async function verifyDelivery(list,files) {
    const {receipt,paths}=await readDeliveryList(list);
    if(!Array.isArray(files)||files.length>MAX_FILES*2)
      throw new Error('한 번에 파일을 1,000개 이하로 골라 주세요.');
    const picked=new Map();
    for(const file of files) {
      if(!(file instanceof Blob)||typeof file.name!=='string'||!file.name||file.name.length>255)
        throw new Error('파일 선택창에서 압축을 푼 파일을 다시 골라 주세요.');
      if(!picked.has(file.name))picked.set(file.name,[]);
      picked.get(file.name).push(file);
    }
    const issues=[], resend=[];
    let matched=0;
    for(const [name,row] of paths) {
      const group=picked.get(name)||[], path='files/'+name;
      const label=row.names.map(quoteText).join(', ')+' / '+path;
      if(group.length>1) {
        issues.push('중복 · '+label+' / '+group.length+'개 선택');
        continue;
      }
      const file=group[0];
      if(file&&file.size===row.size&&await T.hash(await file.arrayBuffer())===row.sha256) {
        matched++;
        continue;
      }
      const reason=file?'불일치':'누락';
      issues.push(reason+' · '+label+(file?' / 크기 또는 SHA-256이 다릅니다.':''));
      resend.push({basename:name,path,size:row.size,reason});
    }
    for(const name of picked.keys())if(!paths.has(name))
      issues.push('목록 밖 · '+quoteText(name));
    const request=resend.length?[
      '리뉴맵 선택 납품 파일 재전달 요청',
      '받은 목록 v'+receipt.revision+' · 다시 받을 파일 '+resend.length+'개',
      '아래 ZIP 경로에 있는 원본 파일을 압축 안의 이름 그대로 다시 보내 주세요.',
      '',
      ...resend.map(row=>row.reason+' / '+row.path+' / '+row.size+'바이트'),
    ].join('\n')+'\n':'';
    return {revision:receipt.revision,selected:receipt.selected_count,count:paths.size,matched,issues,resend,request};
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
  function groupByBytes(files) {
    const groups=new Map();
    for(const file of files) {
      const key=file.sha256+':'+file.size;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(file);
    }
    return groups;
  }
  function fileRecordChanges(before,after) {
    return [['input_hash','입력 지문'],['comparison_hash','비교 지문'],['template_version','양식 판본'],['blockers','추가확인 사유']]
      .filter(([key])=>T.canonical(before[key])!==T.canonical(after[key])).map(([,label])=>label);
  }
  const FILE_ISSUE_LABELS={TASK_FILE_MISSING:'이 기기에 연결 파일 없음',TASK_FILE_MISMATCH:'파일 확인값 또는 크기 불일치'};
  async function inspectRecovery(history,entries) {
    const manifest=await T.manifest(history),wanted=needed(manifest.history),sizes=declaredSizes(manifest.history);
    textSize(T.canonical(manifest));
    if(wanted.size>MAX_FILES)throw new Error('백업 파일은 500개 이하여야 합니다.');
    const stored=new Map();
    for(const entry of entries)if(!stored.has(entry.sha256))stored.set(entry.sha256,entry);
    // 해시에 실패할 파일도 읽기 전에 합산해야 복구 진단이 백업의 읽기 범위를 넘지 않는다.
    let total=0;
    for(const sha of wanted) {
      const entry=stored.get(sha);
      if(!entry?.blob)continue;
      if(!(entry.blob instanceof Blob))throw new Error('보관 파일 형식을 확인하지 못했습니다.');
      if(entry.blob.size>MAX)throw new Error('파일 크기는 20MB 이하여야 합니다.');
      total+=entry.blob.size;
      if(total>MAX)throw new Error('묶음의 파일 합계는 20MB 이하여야 합니다.');
      fileName(entry.name);
    }
    const issues=[];
    for(const sha of wanted) {
      try { await checkedBytes(stored.get(sha),sha,sizes.get(sha)); }
      catch(error) {
        if(!Object.hasOwn(FILE_ISSUE_LABELS,error.code))throw error;
        issues.push({code:error.code,sha});
      }
    }
    return {manifest,issues};
  }
  async function matchRecoveryFile({manifest,issues},file) {
    if(!(file instanceof Blob)||!file.size||file.size>MAX)
      throw new Error('비어 있지 않은 20MB 이하 원본 파일을 선택해 주세요.');
    const bytes=await file.arrayBuffer(), sha=await T.hash(bytes);
    const issue=issues.find(item=>item.sha===sha&&Object.hasOwn(FILE_ISSUE_LABELS,item.code));
    const size=declaredSizes(manifest.history).get(sha);
    if(!issue||(size!==undefined&&size!==file.size))
      throw new Error('선택한 파일이 복구 목록의 확인값과 일치하지 않습니다. 목록에 있는 원본을 다시 골라 주세요.');
    const named=manifest.history.flatMap(record=>[
      ...record.artifacts,...T.workEvidence(record),...(record.decision?[record.decision.evidence]:[]),
    ]).find(record=>record.sha256===sha);
    const name=named?fileName(named.name):sha;
    return { sha256:sha, name, size:file.size, blob:new Blob([bytes],{type:'application/octet-stream'}) };
  }
  async function handover(manifest,today,issues=[]) {
    T.isOverdue({status:'verified',due_on:today},today);
    if(!Array.isArray(issues)||issues.length>MAX_FILES)throw new Error('연결 파일 확인 결과가 올바르지 않습니다.');
    const seen=new Set(),failures=issues.map(issue=>{
      if(!fields(issue,['code','sha'])||typeof issue.code!=='string'||!Object.hasOwn(FILE_ISSUE_LABELS,issue.code)||
        typeof issue.sha!=='string'||!HEX.test(issue.sha)||seen.has(issue.sha))throw new Error('연결 파일 확인 결과가 올바르지 않습니다.');
      seen.add(issue.sha);
      return {code:issue.code,sha:issue.sha};
    });
    const given=T.canonical(manifest);textSize(given);
    const checked=await T.manifest(JSON.parse(given).history);
    if(T.canonical(checked)!==given)throw new Error('인수인계의 납품 목록과 이력이 다릅니다.');
    const h=checked.history,c=h.at(-1),w=T.work(c),blockers=T.workBlockers(c),paths=filePaths(h);
    const sizes=declaredSizes(h),catalog=new Map([...needed(h)].map(sha=>[sha,new Map()]));
    for(const record of h)for(const file of [...record.artifacts,...T.workEvidence(record),...(record.decision?[record.decision.evidence]:[])]) {
      const names=catalog.get(file.sha256);if(!names.has(file.name))names.set(file.name,new Set());names.get(file.name).add(record.revision);
    }
    const affected=new Map(failures.map(({sha})=>[sha,[]]));
    if(affected.size)for(const record of h)for(const sha of needed([record]))affected.get(sha)?.push(record.revision);
    const recovery=failures.map(({sha,code})=>{
      const names=catalog.get(sha);
      if(!names)throw new Error('연결 파일 확인 결과가 과업 이력과 다릅니다.');
      const revisions=affected.get(sha), scope=revisions.includes(c.revision)?'현재판에 연결':'이전 이력에만 연결';
      const identity=names.size?[...names.keys()].map(quoteText).join(', '):'파일명 미기록';
      const label=FILE_ISSUE_LABELS[code]+' · '+identity+' / '+scope+' / 사용 판: '+revisions.map(v=>'v'+v).join(', ');
      return {sha,code,label};
    });
    const statuses={open:'처리 전',submitted:'확인 대기',resolved:'해소 확인',verified:'점검 확인 완료'};
    const pending=w.followups.filter(item=>item.status!=='verified'),overdue=pending.filter(item=>T.isOverdue(item,today));
    const approval=c.decision?(c.decision.kind==='approve'?'현재 승인 기록 있음':'현재 반려 기록 있음'):'현재 승인 기록 없음';
    const summary='v'+c.revision+' · '+states[c.state]+' · '+approval+' · 검토 의견 보류 '+blockers.length+'건 · 후속 점검 미완료 '+pending.length+'건(기한 지남 '+overdue.length+'건)';
    const remaining=c.spec.requirements.filter(item=>c.checks.find(row=>row.id===item.id)?.result!=='match').length;
    const blockedFiles=c.artifacts.filter(file=>file.blockers.length);
    const attention=[];
    if(remaining)attention.push('필수 항목 '+remaining+'건의 근거 대조가 남아 있습니다.');
    if(blockers.length)attention.push('검토 의견 '+blockers.length+'건의 보류 사유를 확인하세요. 해소된 보완본이 현재 납품에서 빠진 경우도 포함합니다.');
    if(!c.artifacts.length)attention.push('현재 판에 연결된 납품 파일이 없습니다.');
    else if(blockedFiles.length)attention.push('납품 파일 '+blockedFiles.length+'개의 추가확인 사유가 남아 있습니다.');
    if(overdue.length)attention.push('조회 기준일에 후속 점검 '+overdue.length+'건의 기한이 지났습니다. 담당자와 결과 확인이 필요합니다.');
    if(c.state==='rejected')attention.push('현재 반려 기록의 사유를 확인하고 보완한 판을 기록하세요.');
    else if(!c.decision&&c.state==='ready'&&c.artifacts.length&&!blockedFiles.length&&!blockers.length)attention.push('현재 납품 파일의 최종 검토 기록이 없습니다.');
    if(pending.length&&!overdue.length)attention.push('미완료 후속 점검 '+pending.length+'건의 담당자와 기한을 인계하세요. 미래 점검은 현재 승인 보류 사유와 구분합니다.');
    attention.splice(3);
    const baseline=[...h].reverse().find(row=>row.revision<c.revision&&row.decision?.kind==='approve');
    const comparison={summary:baseline?'v'+baseline.revision+' 승인 기록과 현재 v'+c.revision+' 비교':'비교할 이전 승인 기록이 없습니다.',items:[]};
    if(baseline) {
      const changed=comparison.items;
      for(const [key,label] of [['title','과업명'],['program','사업'],['guideline','지침·판본'],['scope','대상 범위']])
        if(baseline.spec[key]!==c.spec[key])changed.push('계획·요구 항목 변경: '+label+' / 이전 '+quoteText(baseline.spec[key])+' / 현재 '+quoteText(c.spec[key]));
      const oldRequirements=new Map(baseline.spec.requirements.map(row=>[row.id,row])),newRequirements=new Map(c.spec.requirements.map(row=>[row.id,row]));
      for(const id of new Set([...oldRequirements.keys(),...newRequirements.keys()])) {
        const before=oldRequirements.get(id),after=newRequirements.get(id);
        if(T.canonical(before||null)!==T.canonical(after||null)) {
          const describe=row=>row?quoteText(row.title)+' / 출처 '+quoteText(row.source)+' / 단위 '+quoteText(row.unit):'항목 없음';
          changed.push('계획·요구 항목 변경: 항목 '+quoteText(id)+' / 이전 '+describe(before)+' / 현재 '+describe(after));
        }
      }
      const oldChecks=new Map(baseline.checks.map(row=>[row.id,row])),newChecks=new Map(c.checks.map(row=>[row.id,row]));
      for(const id of new Set([...oldChecks.keys(),...newChecks.keys()])) {
        const before=oldChecks.get(id),after=newChecks.get(id);
        if(T.canonical(before||null)!==T.canonical(after||null)) {
          const fields=[['result','대조 결과'],['source','출처'],['page','쪽·셀'],['unit','단위'],['note','사유'],['evidence_sha256','근거 파일 지문']].filter(([key])=>before?.[key]!==after?.[key]).map(([,label])=>label);
          changed.push('근거 대조 기록 변경: 항목 '+quoteText(id)+' / 이전 '+(before?checkResultLabels[before.result]:'대조 기록 없음')+' / 현재 '+(after?checkResultLabels[after.result]:'대조 기록 없음')+' / 달라진 항목: '+fields.join(', '));
        }
      }
      const oldFiles=new Map(baseline.artifacts.map(file=>[file.name,file])),newFiles=new Map(c.artifacts.map(file=>[file.name,file]));
      const oldByBytes=groupByBytes(baseline.artifacts),newByBytes=groupByBytes(c.artifacts);
      const grouped=new Set();
      for(const [key,previous] of oldByBytes) {
        const next=newByBytes.get(key);
        if(!next)continue;
        const removed=previous.filter(file=>!newFiles.has(file.name)),added=next.filter(file=>!oldFiles.has(file.name));
        if(!removed.length&&!added.length)continue;
        if(previous.length===1&&next.length===1&&removed.length&&added.length) {
          const fields=fileRecordChanges(previous[0],next[0]);
          changed.push('파일 바이트 동일·이름 차이: '+quoteText(previous[0].name)+' → '+quoteText(next[0].name)+
            (fields.length?' / 연결 기록 변경: '+fields.join(', '):''));
        } else {
          const names=files=>files.map(file=>quoteText(file.name)).join(', ');
          changed.push('파일 바이트 동일·이름 목록 차이: 이전 '+names(previous)+' / 현재 '+names(next));
        }
        for(const file of [...removed,...added])grouped.add(file.name);
      }
      for(const name of new Set([...oldFiles.keys(),...newFiles.keys()])) {
        if(grouped.has(name))continue;
        const before=oldFiles.get(name),after=newFiles.get(name);
        if(!after)changed.push('이전 판에만 있는 파일: '+quoteText(name)+' / '+paths.get(before.sha256));
        else if(!before)changed.push('현재 판에만 있는 파일: '+quoteText(name)+' / '+paths.get(after.sha256));
        else if(before.sha256!==after.sha256)changed.push('파일 내용 변경: '+quoteText(name)+' / 이전 '+paths.get(before.sha256)+' / 현재 '+paths.get(after.sha256));
        else {
          const fields=fileRecordChanges(before,after);
          if(fields.length)changed.push('파일 바이트 동일·기록 변경: '+quoteText(name)+' / '+fields.join(', '));
        }
      }
      if(T.canonical(T.work(baseline))!==T.canonical(w))changed.push('검토 의견·후속 점검 기록 변경: 아래 상세 기록에서 담당자·기한·증빙을 확인하세요.');
    }
    const lines=[recovery.length?'리뉴맵 복구용 인수인계 요약':'리뉴맵 내부 보관용 인수인계','조회 기준일: '+today+' (Asia/Seoul)',summary,
      '사용자가 기록한 업무 내용입니다. 신원·전자서명·기관 승인이나 자료의 사실성을 인증하지 않습니다.',
      '공유 전에 이름·연락처·사진 등 개인정보와 전달받을 사람을 확인하세요.',
      '이력과 납품 목록의 일치를 검사한 요약입니다. 실제 파일의 존재·바이트는 전체 이력 ZIP 생성과 백업 JSON 복원에서 별도로 확인합니다.',
      '입력값은 따옴표로 묶고 줄바꿈·제어문자를 표시합니다. 원본 기록은 바꾸지 않습니다.',
      '', '1. 과업과 현재 판', '과업 ID: '+quoteText(c.id),'과업명: '+quoteText(c.spec.title),'사업: '+quoteText(c.spec.program),
      '지침·판본: '+quoteText(c.spec.guideline),'대상 범위: '+quoteText(c.spec.scope),'현재 판: v'+c.revision,'현재 이력 SHA-256: '+c.hash,
      '현재 파일 세트 SHA-256: '+checked.artifact_set_hash,'기록자: '+quoteText(c.actor),'기록 시각: '+quoteText(c.at),
      '', '2. 먼저 확인할 일',...(attention.length?attention.map((item,i)=>(i+1)+') '+item):['현재 기록에 표시할 남은 일이 없습니다. 업무 종결을 인증하는 뜻은 아닙니다.']),
      '', '3. 요구 항목별 근거 대조'];
    if(recovery.length)lines.splice(3,0,'확인하지 못한 연결 파일 '+recovery.length+'개가 있습니다. 이 요약은 복구 대상 확인용입니다. 전체 이력 ZIP과 복원용 JSON 백업은 만들 수 없습니다.',
      ...recovery.map(file=>file.label+' / 확인값(SHA-256): '+file.sha),'');
    lines.splice(lines.length-1,0,'이전 승인 기록과 달라진 점',comparison.summary,
      ...(baseline?['비교 기준 이력 SHA-256: '+baseline.hash]:[]),
      '같은 이름의 파일은 내용과 연결 기록을 비교합니다. 파일 확인값(SHA-256)과 크기가 같은 파일의 이름은 함께 보여 줍니다. 내용의 사실성이나 새 승인은 별도로 확인하세요.',
      ...(comparison.items.length?comparison.items:[baseline?'비교한 계획·근거 대조·납품 파일·검토 의견·후속 점검 기록이 같습니다. 같은 기록도 현재 판의 승인을 대신하지 않습니다.':'현재 판의 근거와 파일을 아래 요약에서 확인하세요.']), '');
    for(const item of c.spec.requirements) {
      const row=c.checks.find(r=>r.id===item.id);
      lines.push('항목 '+quoteText(item.id)+': '+quoteText(item.title),'요구 출처: '+quoteText(item.source)+' / 요구 단위: '+quoteText(item.unit),
        '대조 결과: '+(row?checkResultLabels[row.result]:'대조 기록 없음'));
      if(row)lines.push('실제 출처: '+quoteText(row.source)+' / 원문 쪽·셀: '+quoteText(row.page)+' / 실제 단위: '+quoteText(row.unit),
        '사유: '+quoteText(row.note),'근거 파일: '+(HEX.test(row.evidence_sha256||'')?paths.get(row.evidence_sha256):'연결 지문 없음'));
    }
    lines.push('', '4. 현재 결정과 이전 승인 기록');
    if(c.decision)lines.push('현재 결정: '+(c.decision.kind==='approve'?'승인 기록':'반려 기록'),
      '검토자: '+quoteText(c.decision.reviewer)+' / 역할: '+quoteText(c.decision.role)+' / 실제 결정일: '+quoteText(c.decision.decided_on),
      '결정 사유: '+quoteText(c.decision.note),'결정 대상 파일 세트: '+c.decision.artifact_set_hash,
      '결정 증빙: '+quoteText(c.decision.evidence.name)+' / '+paths.get(c.decision.evidence.sha256));
    else lines.push('현재 승인·반려 결정 기록이 없습니다.');
    const last=[...h].reverse().find(row=>row.decision?.kind==='approve');
    lines.push(last?'이력상 최근 승인 기록: v'+last.revision+' / 실제 결정일 '+quoteText(last.decision.decided_on)+' / 파일 세트 '+last.decision.artifact_set_hash:'이력상 승인 기록이 없습니다.');
    if(last&&last.revision!==c.revision)lines.push('이전 판의 승인은 현재 판의 승인으로 이어지지 않습니다.');
    lines.push('', '5. 현재 납품 파일');
    if(!c.artifacts.length)lines.push('연결된 납품 파일이 없습니다.');
    for(const file of c.artifacts)lines.push('파일명: '+quoteText(file.name)+' / 기록 크기 '+file.size+' bytes / '+paths.get(file.sha256),
      '입력 지문: '+(file.input_hash||'연결 없음')+' / 비교 지문: '+(file.comparison_hash||'연결 없음')+' / 양식 판본: '+quoteText(file.template_version),
      '추가확인: '+(file.blockers.length?file.blockers.map(quoteText).join('; '):'기록된 파일 보류 사유 없음'));
    lines.push('', '6. 검토 의견과 보완 근거');
    if(!w.issues.length)lines.push('검토 의견 기록이 없습니다.');
    for(const reason of blockers)lines.push('현재 승인 보류 사유(검토 의견): '+quoteText(reason));
    for(const item of w.issues) {
      const origin=h[item.source.revision-1],requirement=origin.spec.requirements.find(r=>r.id===item.requirement_id);
      lines.push('의견 '+quoteText(item.id)+': '+quoteText(item.comment)+' / '+statuses[item.status]+' / 담당 '+quoteText(item.assignee),
        '원본 판: v'+item.source.revision+' / '+item.source.hash+' / 당시 요구 항목 '+quoteText(requirement?.title||item.requirement_id),
        '원본 파일: '+quoteText(item.source.artifact.name)+' / '+paths.get(item.source.artifact.sha256),
        '쪽·셀·문단: '+quoteText(item.source.location)+' / 조사 행: '+quoteText(item.source.row_id));
      for(const [key,label] of [['reply','보완 답변'],['resolution','해소 확인'],['reopened','재개 사유']]) {
        const event=item[key];if(event)lines.push(label+': '+quoteText(event.note)+' / 기록자 '+quoteText(event.actor)+' / '+quoteText(event.at)+(event.evidence?' / '+quoteText(event.evidence.name)+' / '+paths.get(event.evidence.sha256):''));
      }
    }
    lines.push('', '7. 후속 점검', '미래 점검과 현재 납품의 승인 보류 사유는 별개입니다. 점검 결과 제출과 완료 확인도 구분합니다.');
    if(!w.followups.length)lines.push('후속 점검 기록이 없습니다.');
    for(const item of w.followups) {
      const origin=h[item.source.revision-1],requirement=origin.spec.requirements.find(r=>r.id===item.requirement_id);
      lines.push('점검 '+quoteText(item.id)+': '+quoteText(item.title)+' / '+statuses[item.status]+(T.isOverdue(item,today)?' / 기한 지남':''),
        '담당: '+quoteText(item.assignee)+' / 기한: '+item.due_on+' / 최초 연결 v'+item.source.revision+' / 당시 요구 항목 '+quoteText(requirement?.title||item.requirement_id),
        '연결 의견 ID: '+quoteText(item.issue_id));
      for(const [key,label] of [['schedule','기한·담당 변경 사유'],['submission','점검 결과'],['verification','완료 확인'],['reopened','재개 사유']]) {
        const event=item[key];if(event)lines.push(label+': '+quoteText(event.note)+' / 기록자 '+quoteText(event.actor)+' / '+quoteText(event.at)+(event.evidence?' / '+quoteText(event.evidence.name)+' / '+paths.get(event.evidence.sha256):''));
      }
    }
    lines.push('', '8. 전체 이력의 파일 목차', '현재 납품 파일 외에 과거 대조·보완·검토 증빙도 포함합니다. 같은 바이트가 다른 이름으로 기록된 경우 판별 이름을 모두 적습니다.');
    if(!catalog.size)lines.push('연결 파일 기록이 없습니다.');
    for(const [sha,names] of catalog) {
      lines.push(paths.get(sha)+' / 기록 크기: '+(sizes.has(sha)?sizes.get(sha)+' bytes':'미기록'));
      if(!names.size)lines.push('파일명: 대조 지문만 기록되어 이름이 없습니다.');
      for(const [name,revisions] of names)lines.push('파일명: '+quoteText(name)+' / 사용 판: '+[...revisions].map(v=>'v'+v).join(', '));
    }
    lines.push('', '9. 읽기와 복원',
      '이 TXT는 읽기용 요약입니다. ‘전체 이력 받기(ZIP · 내부 보관)’의 manifest.json에 전체 이력이 있고, files 폴더에 연결 파일이 <SHA-256>.<원래 확장자> 이름으로 들어 있습니다.',
      '원래 확장자가 영문·숫자 1~8자가 아니면 확장자를 붙이지 않습니다. ZIP 맨 위의 SHA256SUMS.txt는 sha256sum -c로 읽는 목록입니다.',
      '작업을 복원하려면 리뉴맵 과업·납품 화면에서 ‘백업 받기(JSON · 복원용)’로 받은 파일을 ‘백업 복원’에서 선택하세요.',
      'JSON 복원은 이력·파일 지문을 검사하며 같은 과업의 다른 이력을 덮어쓰지 않습니다. 기기 저장소를 지우기 전에 JSON 백업을 별도 위치에 보관하세요.',
      '파일 확인: ZIP을 푼 폴더에서 PowerShell로 아래 한 줄을 실행합니다. 아무것도 나오지 않으면 files 폴더의 파일마다 내용의 SHA-256이 파일 이름과 같습니다. 파일 수는 8절 목차와 같아야 합니다.',
      "Get-ChildItem files | % { if((Get-FileHash $_.FullName).Hash -ne $_.BaseName){'불일치 '+$_.Name} }",
      '과업 버전 확인값: manifest.json history에 적힌 각 hash는 그 버전에서 hash 칸을 뺀 정규 JSON(키 정렬, 공백 없음, UTF-8)의 SHA-256입니다.',
      '파일 확인값(SHA-256)은 파일이 바뀌었는지만 알려 줍니다. 작성자 신원·현장 촬영 사실·얼굴 가림·기관 승인과 내용이 사실인지는 증명하지 않습니다.');
    return {text:lines.join('\n')+'\n',summary,attention,comparison,recovery};
  }
  return{MAX,checkResultLabels,needed,filePaths,zipEntries,make,selectedZip,verifyDelivery,read,from64,handover,inspectRecovery,matchRecoveryFile};
});
