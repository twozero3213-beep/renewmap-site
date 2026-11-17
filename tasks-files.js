(function(root,factory){'use strict';const api=factory(typeof module==='object'&&module.exports?require('./tasks.js'):root.RenewTasks);if(typeof module==='object'&&module.exports)module.exports=api;else root.TaskFiles=api;})(typeof globalThis!=='undefined'?globalThis:this,function(T){
  'use strict';
  const MAX=20*1024*1024, MAX_FILES=500, MAX_JSON=40*1024*1024, HEX=/^[a-f0-9]{64}$/;
  function needed(history){const out=new Set();for(const r of history){for(const a of [...(r.artifacts||[]),...T.workEvidence(r)])out.add(a.sha256);for(const c of r.checks||[])if(HEX.test(c.evidence_sha256||''))out.add(c.evidence_sha256);if(r.decision)out.add(r.decision.evidence.sha256);}return out;}
  function to64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  function fields(value,names){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));}
  function fileName(name){if(typeof name!=='string'||!name.trim()||name.length>240||['.','..'].includes(name.trim())||/[\x00-\x1f\x7f/\\:]/.test(name))throw new Error('백업 파일 이름이 올바르지 않습니다.');return name;}
  function textSize(text){if(typeof text!=='string'||text.length>MAX_JSON||new TextEncoder().encode(text).byteLength>MAX_JSON)throw new Error('백업이 너무 큽니다.');}
  function declaredSizes(history){const sizes=new Map();for(const r of history)for(const f of [...r.artifacts,...T.workEvidence(r),...(r.decision?[r.decision.evidence]:[])]){if(sizes.has(f.sha256)&&sizes.get(f.sha256)!==f.size)throw new Error('같은 파일의 크기 기록이 다릅니다.');sizes.set(f.sha256,f.size);}return sizes;}
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
  async function handover(manifest,today) {
    T.isOverdue({status:'verified',due_on:today},today);
    const given=T.canonical(manifest);textSize(given);
    const checked=await T.manifest(JSON.parse(given).history);
    if(T.canonical(checked)!==given)throw new Error('인수인계의 납품 목록과 이력이 다릅니다.');
    const h=checked.history,c=h.at(-1),w=T.work(c),blockers=T.workBlockers(c);
    // 입력의 줄바꿈·방향 제어문자가 요약의 새 제목이나 결정을 꾸미지 못하게 출력에서만 인용한다.
    const q=value=>JSON.stringify(value===null||value===undefined?'':String(value)).replace(/[\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
    const states={planned:'계획 기록',invalid:'입력 오류',hold:'근거 부족 보류',ready:'대조 완료·검토 대기',approved:'승인 기록',rejected:'반려 기록'};
    const statuses={open:'처리 전',submitted:'확인 대기',resolved:'해소 확인',verified:'점검 확인 완료'};
    const results={match:'대조 일치',pending:'추가확인',conflict:'근거 상충',invalid:'입력 오류'};
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
        if(baseline.spec[key]!==c.spec[key])changed.push('계획·요구 항목 변경: '+label+' / 이전 '+q(baseline.spec[key])+' / 현재 '+q(c.spec[key]));
      const oldRequirements=new Map(baseline.spec.requirements.map(row=>[row.id,row])),newRequirements=new Map(c.spec.requirements.map(row=>[row.id,row]));
      for(const id of new Set([...oldRequirements.keys(),...newRequirements.keys()])) {
        const before=oldRequirements.get(id),after=newRequirements.get(id);
        if(T.canonical(before||null)!==T.canonical(after||null)) {
          const describe=row=>row?q(row.title)+' / 출처 '+q(row.source)+' / 단위 '+q(row.unit):'항목 없음';
          changed.push('계획·요구 항목 변경: 항목 '+q(id)+' / 이전 '+describe(before)+' / 현재 '+describe(after));
        }
      }
      const oldChecks=new Map(baseline.checks.map(row=>[row.id,row])),newChecks=new Map(c.checks.map(row=>[row.id,row]));
      for(const id of new Set([...oldChecks.keys(),...newChecks.keys()])) {
        const before=oldChecks.get(id),after=newChecks.get(id);
        if(T.canonical(before||null)!==T.canonical(after||null)) {
          const fields=[['result','대조 결과'],['source','출처'],['page','쪽·셀'],['unit','단위'],['note','사유'],['evidence_sha256','근거 파일 지문']].filter(([key])=>before?.[key]!==after?.[key]).map(([,label])=>label);
          changed.push('근거 대조 기록 변경: 항목 '+q(id)+' / 이전 '+(before?results[before.result]:'대조 기록 없음')+' / 현재 '+(after?results[after.result]:'대조 기록 없음')+' / 달라진 항목: '+fields.join(', '));
        }
      }
      const oldFiles=new Map(baseline.artifacts.map(file=>[file.name,file])),newFiles=new Map(c.artifacts.map(file=>[file.name,file]));
      for(const name of new Set([...oldFiles.keys(),...newFiles.keys()])) {
        const before=oldFiles.get(name),after=newFiles.get(name);
        if(!after)changed.push('이전 판에만 있는 파일: '+q(name)+' / files/'+before.sha256);
        else if(!before)changed.push('현재 판에만 있는 파일: '+q(name)+' / files/'+after.sha256);
        else if(before.sha256!==after.sha256)changed.push('파일 내용 변경: '+q(name)+' / 이전 files/'+before.sha256+' / 현재 files/'+after.sha256);
        else {
          const fields=[['input_hash','입력 지문'],['comparison_hash','비교 지문'],['template_version','양식 판본'],['blockers','추가확인 사유']].filter(([key])=>T.canonical(before[key])!==T.canonical(after[key])).map(([,label])=>label);
          if(fields.length)changed.push('파일 바이트 동일·기록 변경: '+q(name)+' / '+fields.join(', '));
        }
      }
      if(T.canonical(T.work(baseline))!==T.canonical(w))changed.push('검토 의견·후속 점검 기록 변경: 아래 상세 기록에서 담당자·기한·증빙을 확인하세요.');
    }
    const lines=['리뉴맵 납품 인수인계','조회 기준일: '+today+' (Asia/Seoul)',summary,
      '사용자가 기록한 업무 내용입니다. 신원·전자서명·기관 승인이나 자료의 사실성을 인증하지 않습니다.',
      '공유 전에 이름·연락처·사진 등 개인정보와 전달받을 사람을 확인하세요.',
      '이력과 납품 목록의 일치를 검사한 요약입니다. 실제 파일의 존재·바이트는 납품 묶음 생성과 JSON 복원 검사에서 별도로 확인합니다.',
      '입력값은 따옴표로 묶고 줄바꿈·제어문자를 표시합니다. 원본 기록은 바꾸지 않습니다.',
      '', '1. 과업과 현재 판', '과업 ID: '+q(c.id),'과업명: '+q(c.spec.title),'사업: '+q(c.spec.program),
      '지침·판본: '+q(c.spec.guideline),'대상 범위: '+q(c.spec.scope),'현재 판: v'+c.revision,'현재 이력 SHA-256: '+c.hash,
      '현재 파일 세트 SHA-256: '+checked.artifact_set_hash,'기록자: '+q(c.actor),'기록 시각: '+q(c.at),
      '', '2. 먼저 확인할 일',...(attention.length?attention.map((item,i)=>(i+1)+') '+item):['현재 기록에 표시할 남은 일이 없습니다. 업무 종결을 인증하는 뜻은 아닙니다.']),
      '', '3. 요구 항목별 근거 대조'];
    lines.splice(lines.length-1,0,'이전 승인 기록과 달라진 점',comparison.summary,
      ...(baseline?['비교 기준 이력 SHA-256: '+baseline.hash]:[]),
      '파일 이름을 기준으로 바이트 지문과 연결 기록을 비교합니다. 숫자의 의미·사실성이나 새 승인을 판정하지 않습니다.',
      ...(comparison.items.length?comparison.items:[baseline?'비교한 계획·근거 대조·납품 파일·검토 의견·후속 점검 기록이 같습니다. 같은 기록도 현재 판의 승인을 대신하지 않습니다.':'현재 판의 근거와 파일을 아래 요약에서 확인하세요.']), '');
    for(const item of c.spec.requirements) {
      const row=c.checks.find(r=>r.id===item.id);
      lines.push('항목 '+q(item.id)+': '+q(item.title),'요구 출처: '+q(item.source)+' / 요구 단위: '+q(item.unit),
        '대조 결과: '+(row?results[row.result]:'대조 기록 없음'));
      if(row)lines.push('실제 출처: '+q(row.source)+' / 원문 쪽·셀: '+q(row.page)+' / 실제 단위: '+q(row.unit),
        '사유: '+q(row.note),'근거 파일: '+(HEX.test(row.evidence_sha256||'')?'files/'+row.evidence_sha256:'연결 지문 없음'));
    }
    lines.push('', '4. 현재 결정과 이전 승인 기록');
    if(c.decision)lines.push('현재 결정: '+(c.decision.kind==='approve'?'승인 기록':'반려 기록'),
      '검토자: '+q(c.decision.reviewer)+' / 역할: '+q(c.decision.role)+' / 실제 결정일: '+q(c.decision.decided_on),
      '결정 사유: '+q(c.decision.note),'결정 대상 파일 세트: '+c.decision.artifact_set_hash,
      '결정 증빙: '+q(c.decision.evidence.name)+' / files/'+c.decision.evidence.sha256);
    else lines.push('현재 승인·반려 결정 기록이 없습니다.');
    const last=[...h].reverse().find(row=>row.decision?.kind==='approve');
    lines.push(last?'이력상 최근 승인 기록: v'+last.revision+' / 실제 결정일 '+q(last.decision.decided_on)+' / 파일 세트 '+last.decision.artifact_set_hash:'이력상 승인 기록이 없습니다.');
    if(last&&last.revision!==c.revision)lines.push('이전 판의 승인은 현재 판의 승인으로 이어지지 않습니다.');
    lines.push('', '5. 현재 납품 파일');
    if(!c.artifacts.length)lines.push('연결된 납품 파일이 없습니다.');
    for(const file of c.artifacts)lines.push('파일명: '+q(file.name)+' / 기록 크기 '+file.size+' bytes / files/'+file.sha256,
      '입력 지문: '+(file.input_hash||'연결 없음')+' / 비교 지문: '+(file.comparison_hash||'연결 없음')+' / 양식 판본: '+q(file.template_version),
      '추가확인: '+(file.blockers.length?file.blockers.map(q).join('; '):'기록된 파일 보류 사유 없음'));
    lines.push('', '6. 검토 의견과 보완 근거');
    if(!w.issues.length)lines.push('검토 의견 기록이 없습니다.');
    for(const reason of blockers)lines.push('현재 승인 보류 사유(검토 의견): '+q(reason));
    for(const item of w.issues) {
      const origin=h[item.source.revision-1],requirement=origin.spec.requirements.find(r=>r.id===item.requirement_id);
      lines.push('의견 '+q(item.id)+': '+q(item.comment)+' / '+statuses[item.status]+' / 담당 '+q(item.assignee),
        '원본 판: v'+item.source.revision+' / '+item.source.hash+' / 당시 요구 항목 '+q(requirement?.title||item.requirement_id),
        '원본 파일: '+q(item.source.artifact.name)+' / files/'+item.source.artifact.sha256,
        '쪽·셀·문단: '+q(item.source.location)+' / 조사 행: '+q(item.source.row_id));
      for(const [key,label] of [['reply','보완 답변'],['resolution','해소 확인'],['reopened','재개 사유']]) {
        const event=item[key];if(event)lines.push(label+': '+q(event.note)+' / 기록자 '+q(event.actor)+' / '+q(event.at)+(event.evidence?' / '+q(event.evidence.name)+' / files/'+event.evidence.sha256:''));
      }
    }
    lines.push('', '7. 후속 점검', '미래 점검과 현재 납품의 승인 보류 사유는 별개입니다. 점검 결과 제출과 완료 확인도 구분합니다.');
    if(!w.followups.length)lines.push('후속 점검 기록이 없습니다.');
    for(const item of w.followups) {
      const origin=h[item.source.revision-1],requirement=origin.spec.requirements.find(r=>r.id===item.requirement_id);
      lines.push('점검 '+q(item.id)+': '+q(item.title)+' / '+statuses[item.status]+(T.isOverdue(item,today)?' / 기한 지남':''),
        '담당: '+q(item.assignee)+' / 기한: '+item.due_on+' / 최초 연결 v'+item.source.revision+' / 당시 요구 항목 '+q(requirement?.title||item.requirement_id),
        '연결 의견 ID: '+q(item.issue_id));
      for(const [key,label] of [['schedule','기한·담당 변경 사유'],['submission','점검 결과'],['verification','완료 확인'],['reopened','재개 사유']]) {
        const event=item[key];if(event)lines.push(label+': '+q(event.note)+' / 기록자 '+q(event.actor)+' / '+q(event.at)+(event.evidence?' / '+q(event.evidence.name)+' / files/'+event.evidence.sha256:''));
      }
    }
    const sizes=declaredSizes(h),catalog=new Map([...needed(h)].map(sha=>[sha,new Map()]));
    for(const record of h)for(const file of [...record.artifacts,...T.workEvidence(record),...(record.decision?[record.decision.evidence]:[])]) {
      const names=catalog.get(file.sha256);if(!names.has(file.name))names.set(file.name,new Set());names.get(file.name).add(record.revision);
    }
    lines.push('', '8. 전체 이력의 파일 목차', '현재 납품 파일 외에 과거 대조·보완·검토 증빙도 포함합니다. 같은 바이트가 다른 이름으로 기록된 경우 판별 이름을 모두 적습니다.');
    if(!catalog.size)lines.push('연결 파일 기록이 없습니다.');
    for(const [sha,names] of catalog) {
      lines.push('files/'+sha+' / 기록 크기: '+(sizes.has(sha)?sizes.get(sha)+' bytes':'미기록'));
      if(!names.size)lines.push('파일명: 대조 지문만 기록되어 이름이 없습니다.');
      for(const [name,revisions] of names)lines.push('파일명: '+q(name)+' / 사용 판: '+[...revisions].map(v=>'v'+v).join(', '));
    }
    lines.push('', '9. 읽기와 복원',
      '이 TXT는 읽기용 요약입니다. 납품 ZIP의 manifest.json에 전체 이력이 있고 files/<SHA-256>에 연결 파일 바이트가 있습니다.',
      '작업을 복원하려면 별도로 받은 JSON 백업을 리뉴맵 과업·납품 화면의 백업 복원에서 선택하세요. 이 TXT나 납품 ZIP을 JSON 백업으로 넣지 마세요.',
      'JSON 복원은 이력·파일 지문을 검사하며 같은 과업의 다른 이력을 덮어쓰지 않습니다. 기기 저장소를 지우기 전에 JSON 백업을 별도 위치에 보관하세요.',
      '해시는 기록된 바이트의 변경을 찾는 수단입니다. 작성자 신원·현장 촬영 사실·얼굴 가림·기관 승인·법률 적합성을 증명하지 않습니다.');
    return {text:lines.join('\n')+'\n',summary,attention,comparison};
  }
  return{MAX,needed,make,read,from64,handover};
});
