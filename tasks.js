// 기기 안 과업 이력이다. 해시는 변경 탐지이며 서명·승인서 진위·서버 권한을 보증하지 않는다.
(function (root) {
  'use strict';
  const SCHEMA = 'renewmap-task-v1', MAX_ATTEMPTS = 3, MAX_HISTORY = 1000;
  const RECORD_KEYS = ['schema','id','revision','previous_hash','hash','spec','checks','attempts','state','artifacts','decision','actor','at','action'];
  const HEX = /^[a-f0-9]{64}$/;
  function fail(message) { throw new Error(message); }
  function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('JSON 객체가 필요합니다.');
    if (Object.getOwnPropertySymbols(value).length) fail('JSON이 아닌 필드입니다.');
    for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) if (!('value' in d)) fail('실행 가능한 필드는 허용하지 않습니다.');
    return value;
  }
  function keys(value, allowed, required = allowed) {
    object(value);
    if (Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value,k))) fail('필드가 없거나 알 수 없는 필드가 있습니다.');
  }
  function canonical(value) {
    const seen = new Set();
    function walk(v) {
      if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
      if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
      if (!v || typeof v !== 'object' || seen.has(v)) fail('JSON으로 저장할 수 없는 값입니다.');
      seen.add(v);
      let out;
      if (Array.isArray(v)) {
        if (Object.keys(v).length !== v.length) fail('비어 있거나 추가 속성이 있는 배열입니다.');
        out = '[' + Array.from(v,walk).join(',') + ']';
      } else { object(v); out = '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+walk(v[k])).join(',') + '}'; }
      seen.delete(v); return out;
    }
    return walk(value);
  }
  const copy = value => JSON.parse(canonical(value));
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  async function hash(value) {
    let bytes;
    if (typeof value === 'string') bytes = new TextEncoder().encode(value);
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
    else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength));
    else fail('지문 입력은 문자열 또는 파일 바이트여야 합니다.');
    if (!globalThis.crypto || !globalThis.crypto.subtle) fail('이 환경에서는 SHA-256을 사용할 수 없습니다. HTTPS에서 다시 여세요.');
    return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  }
  function text(value, label, max = 1000, optional = false) {
    if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(label+'을(를) 확인해 주세요.');
    return value.trim();
  }
  function list(value,label,max=100) { if (!Array.isArray(value) || value.length>max) fail(label+' 목록을 확인해 주세요.'); return value; }
  function unique(rows,key,label) { const values=rows.map(r=>r[key]); if (new Set(values).size!==values.length) fail(label+'이(가) 중복되었습니다.'); }
  function digest(value,label,optional=false) { if (optional && (value===null || value==='')) return null; if (typeof value!=='string' || !HEX.test(value)) fail(label+' SHA-256을 확인해 주세요.'); return value; }
  function timestamp(value) {
    if (value === undefined) return new Date().toISOString();
    const d = value instanceof Date ? value : new Date(value);
    if (typeof value !== 'string' && !(value instanceof Date) || !Number.isFinite(d.getTime())) fail('기록 시각을 확인해 주세요.');
    return d.toISOString();
  }
  function date(value) {
    if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00.000Z')) || new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value) fail('결정일을 확인해 주세요.');
    return value;
  }
  function taskId(value) { if (typeof value!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('과업 ID를 확인해 주세요.'); return value; }
  function plan(value) {
    keys(value,['title','program','guideline','scope','requirements']);
    const requirements=list(value.requirements,'필수 항목').map(r=>{
      keys(r,['id','title','source','unit']);
      return { id:taskId(r.id), title:text(r.title,'항목명',200), source:text(r.source,'지침 근거'), unit:text(r.unit,'조사 단위',200) };
    });
    if (!requirements.length) fail('필수 항목을 하나 이상 입력해 주세요.'); unique(requirements,'id','필수 항목 ID');
    return { title:text(value.title,'과업명',200), program:text(value.program,'사업 유형',200), guideline:text(value.guideline,'지침 판본',2000), scope:text(value.scope,'분석 범위',2000), requirements };
  }
  function checkRows(value,spec) {
    const rows=list(value,'대조 항목').map(r=>{
      keys(r,['id','result','source','page','unit','note','evidence_sha256'],['id','result']);
      if (!spec.requirements.some(q=>q.id===r.id) || !['match','pending','conflict','invalid'].includes(r.result)) fail('알 수 없는 대조 항목이나 결과입니다.');
      const out={id:r.id,result:r.result};
      for(const name of ['source','page','unit','note','evidence_sha256']) out[name]=text(r[name]===undefined?'':r[name],name,name==='note'?4000:2000,true);
      return out;
    });
    unique(rows,'id','대조 항목 ID');
    return spec.requirements.map(q=>{
      const r=rows.find(row=>row.id===q.id);
      if(!r) return { id:q.id,result:'invalid',source:'',page:'',unit:'',note:'필수 대조 항목이 누락되었습니다.',evidence_sha256:'' };
      const badMatch=r.result==='match' && (!r.source || !r.page || r.unit!==q.unit || !HEX.test(r.evidence_sha256));
      if(badMatch || (r.result!=='match' && !r.note)) return {...r,result:'invalid',note:r.note || '대조 근거·쪽·단위·지문 또는 보류 사유가 불충분합니다.'};
      return r;
    });
  }
  function checkState(checks) { return !checks.length?'planned':checks.some(c=>c.result==='invalid')?'invalid':checks.every(c=>c.result==='match')?'ready':'hold'; }
  function files(value) {
    const rows=list(value,'납품 파일').map(f=>{
      keys(f,['name','sha256','size','input_hash','comparison_hash','template_version','blockers']);
      if (!Number.isSafeInteger(f.size) || f.size<=0) fail('파일 크기를 확인해 주세요.');
      return { name:text(f.name,'파일명',240),sha256:digest(f.sha256,'파일'),size:f.size,input_hash:digest(f.input_hash,'입력',true),comparison_hash:digest(f.comparison_hash,'비교 자료',true),template_version:f.template_version===null?null:text(f.template_version,'양식 버전',200,true)||null,blockers:list(f.blockers,'미해결 사유').map(b=>text(b,'미해결 사유',1000)) };
    });
    if(!rows.length) fail('납품 파일을 하나 이상 선택해 주세요.'); unique(rows,'name','파일명'); return rows;
  }
  function review(value) {
    keys(value,['reviewer','role','decided_on','evidence','note']); keys(value.evidence,['name','sha256','size']);
    if(!Number.isSafeInteger(value.evidence.size) || value.evidence.size<=0) fail('검토 증빙 크기를 확인해 주세요.');
    return {reviewer:text(value.reviewer,'검토자',200),role:text(value.role,'검토 역할',200),decided_on:date(value.decided_on),evidence:{name:text(value.evidence.name,'검토 증빙명',240),sha256:digest(value.evidence.sha256,'검토 증빙'),size:value.evidence.size},note:text(value.note,'검토 내용',4000)};
  }
  function work(record) { return copy(record.work || {issues:[],followups:[]}); }
  function workEvidence(record) {
    const w=work(record), result=[];
    for(const item of w.issues) for(const k of ['reply','resolution']) if(item[k]) result.push(item[k].evidence);
    for(const item of w.followups) for(const k of ['submission','verification']) if(item[k]) result.push(item[k].evidence);
    return result;
  }
  function workBlockers(record) {
    return work(record).issues.flatMap(item=>item.status!=='resolved' ? ['검토 의견 미해소: '+item.comment] :
      record.artifacts.some(f=>f.sha256===item.reply.evidence.sha256&&f.size===item.reply.evidence.size) ? [] : ['해소 확인한 보완본이 현재 납품에 없습니다: '+item.comment]);
  }
  function isOverdue(item,today) { date(today); return item.status!=='verified' && item.due_on<today; }
  function workFile(value) {
    keys(value,['name','sha256','size']); const name=text(value.name,'증빙 파일명',240);
    if(['.','..'].includes(name)||/[\x00-\x1f\x7f/\\:]/.test(name)||!Number.isSafeInteger(value.size)||value.size<=0||value.size>20*1024*1024) fail('증빙 파일명·크기를 확인해 주세요.');
    return {name,sha256:digest(value.sha256,'증빙 파일'),size:value.size};
  }
  function workChange(current,type,input,actor,at) {
    const w=work(current), issue=type.startsWith('issue_'), group=issue?'issues':'followups', stamp={actor,at};
    keys(w,['issues','followups']); list(w.issues,'검토 의견'); list(w.followups,'후속 점검');
    const id=taskId(input.id), index=w[group].findIndex(r=>r.id===id); let item=index<0?null:w[group][index], payload;
    if(type==='issue_open'||type==='followup_open') {
      if(item||w[group].length>=100) fail('이미 있는 기록 ID이거나 기록 한도 100건을 넘었습니다.');
      const requirement_id=taskId(input.requirement_id);
      if(!current.spec.requirements.some(r=>r.id===requirement_id)) fail('현재 과업의 필수 항목을 선택해 주세요.');
      const assignee=text(input.assignee,'담당자',200), source={revision:current.revision,hash:current.hash};
      if(issue) {
        keys(input,['id','requirement_id','artifact_sha256','location','row_id','comment','assignee']);
        const sha=digest(input.artifact_sha256,'검토 대상'), artifact=current.artifacts.find(f=>f.sha256===sha);
        if(!artifact) fail('현재 납품 파일에서 검토할 자료를 선택해 주세요.');
        payload={id,requirement_id,artifact_sha256:sha,location:text(input.location,'쪽·셀·문단',200),row_id:text(input.row_id,'조사 행 ID',200,true),comment:text(input.comment,'검토 의견',4000),assignee};
        item={id,requirement_id,source:{...source,artifact:{name:artifact.name,sha256:artifact.sha256,size:artifact.size},location:payload.location,row_id:payload.row_id},comment:payload.comment,assignee,status:'open',opened:stamp,reply:null,resolution:null,reopened:null};
      } else {
        keys(input,['id','requirement_id','issue_id','title','due_on','assignee']);
        const issue_id=text(input.issue_id,'연결 의견 ID',100,true), due_on=date(input.due_on);
        if(due_on<'0001-01-01'||issue_id&&!w.issues.some(r=>r.id===issue_id&&r.requirement_id===requirement_id)) fail('점검 기한이나 연결할 의견을 확인해 주세요.');
        payload={id,requirement_id,issue_id,title:text(input.title,'점검 내용',1000),due_on,assignee};
        item={...payload,source,status:'open',opened:stamp,schedule:null,submission:null,verification:null,reopened:null};
      }
      w[group].push(item);
    } else {
      if(!item) fail('수정할 의견·점검 기록이 없습니다.');
      if(type==='followup_reschedule') {
        keys(input,['id','due_on','assignee','note']);
        payload={id,due_on:date(input.due_on),assignee:text(input.assignee,'담당자',200),note:text(input.note,'기한·담당 변경 사유',4000)};
        if(item.status!=='open'||payload.due_on<'0001-01-01'||payload.due_on===item.due_on&&payload.assignee===item.assignee) fail('열린 점검의 기한·담당자를 실제로 변경해 주세요. 제출·확인한 점검은 먼저 다시 여세요.');
        item={...item,due_on:payload.due_on,assignee:payload.assignee,schedule:{note:payload.note,...stamp}};
      } else if(type==='issue_reopen'||type==='followup_reopen') {
        keys(input,['id','note']); payload={id,note:text(input.note,'다시 여는 사유',4000)};
        if(item.status==='open') fail('이미 열린 기록입니다.');
        item={...item,status:'open',reopened:{note:payload.note,...stamp},...(issue?{reply:null,resolution:null}:{submission:null,verification:null})};
      } else {
        keys(input,['id','note','evidence']); payload={id,note:text(input.note,'처리 내용',4000),evidence:workFile(input.evidence)};
        const event={note:payload.note,evidence:payload.evidence,...stamp};
        if(type==='issue_reply') {
          if(!['open','submitted'].includes(item.status)) fail('해소된 의견은 먼저 다시 여세요.');
          if(payload.evidence.sha256===item.source.artifact.sha256||!current.artifacts.some(f=>f.sha256===payload.evidence.sha256&&f.size===payload.evidence.size&&f.name===payload.evidence.name)) fail('원본과 다른 보완본을 현재 납품 파일에 먼저 연결해 주세요.');
          item={...item,status:'submitted',reply:event,resolution:null};
        } else if(type==='issue_resolve') {
          if(item.status!=='submitted'||!current.artifacts.some(f=>f.sha256===item.reply.evidence.sha256&&f.size===item.reply.evidence.size)) fail('현재 납품에 연결된 보완 답변을 먼저 제출해 주세요.');
          item={...item,status:'resolved',resolution:event};
        } else if(type==='followup_submit') {
          if(!['open','submitted'].includes(item.status)) fail('확인한 점검은 먼저 다시 여세요.');
          item={...item,status:'submitted',submission:event,verification:null};
        } else if(type==='followup_verify') {
          if(item.status!=='submitted') fail('점검 결과를 먼저 제출해 주세요.');
          item={...item,status:'verified',verification:event};
        } else fail('알 수 없는 의견·점검 행동입니다.');
      }
      w[group][index]=item;
    }
    return {value:w,payload};
  }
  async function signed(body) { return freeze({...body,hash:await hash(canonical(body))}); }
  async function create(spec, options={}) {
    const s=plan(spec), actor=text(options.actor,'기록자',200), at=timestamp(options.at);
    const id=taskId(options.id===undefined?globalThis.crypto.randomUUID():options.id);
    return signed({schema:SCHEMA,id,revision:1,previous_hash:null,spec:s,checks:[],attempts:0,state:'planned',artifacts:[],decision:null,actor,at,action:{type:'create',payload:{spec:s}}});
  }
  async function validRecord(record) {
    keys(record,[...RECORD_KEYS,'work'],RECORD_KEYS);
    if(record.schema!==SCHEMA || !Number.isSafeInteger(record.revision) || record.revision<1 || !Number.isInteger(record.attempts) || record.attempts<0 || record.attempts>MAX_ATTEMPTS) fail('과업 버전 형식이 잘못되었습니다.');
    taskId(record.id); digest(record.hash,'과업');
    if(record.revision===1 ? record.previous_hash!==null : !HEX.test(record.previous_hash)) fail('이전 버전 지문이 잘못되었습니다.');
    if(!['planned','invalid','hold','ready','approved','rejected'].includes(record.state) || record.at!==timestamp(record.at)) fail('과업 상태·시각이 잘못되었습니다.');
    const {hash:given,...body}=record;
    if(await hash(canonical(body))!==given) fail('과업 이력 지문이 불일치합니다.');
  }
  async function revise(current, action, options={}) {
    const c=copy(current); await validRecord(c); keys(action,['type','payload']);
    const actor=text(options.actor,'기록자',200), at=timestamp(options.at);
    if(at<c.at) fail('이전 버전보다 기록 시각이 빠릅니다.');
    let spec=c.spec, checks=c.checks, attempts=c.attempts, state=c.decision?checkState(c.checks):c.state, artifacts=c.artifacts, decision=null, payload, currentWork=c.work;
    if(action.type==='edit') {
      keys(action.payload,['spec']); spec=plan(action.payload.spec);
      if(canonical(spec)===canonical(c.spec)) fail('같은 계획으로는 새 계획을 시작할 수 없습니다. 실제 변경을 입력해 주세요.');
      checks=[]; attempts=0; state='planned'; artifacts=[]; payload={spec};
    } else if(action.type==='check') {
      keys(action.payload,['checks']); if(attempts>=MAX_ATTEMPTS) fail('재검증 한도 3회에 도달했습니다. 계획을 실제로 수정하거나 근거 부족으로 보류하세요.');
      checks=checkRows(action.payload.checks,spec); attempts++; state=checkState(checks); artifacts=[]; payload={checks:copy(action.payload.checks)};
    } else if(action.type==='attach') {
      keys(action.payload,['artifacts']); artifacts=files(action.payload.artifacts); payload={artifacts};
    } else if(action.type==='approve' || action.type==='reject') {
      payload=review(action.payload);
      if(!artifacts.length) fail('검토할 납품 파일이 없습니다.');
      if(action.type==='approve' && (state!=='ready' || artifacts.some(f=>f.blockers.length) || workBlockers(c).length)) fail('근거 대조·검토 의견·파일의 미해결 사유가 없어야 승인 기록을 남길 수 있습니다.');
      decision={kind:action.type,...payload,artifact_set_hash:await hash(canonical(artifacts))}; state=action.type==='approve'?'approved':'rejected';
    } else if(['issue_open','issue_reply','issue_resolve','issue_reopen','followup_open','followup_reschedule','followup_submit','followup_verify','followup_reopen'].includes(action.type)) {
      const changed=workChange(c,action.type,action.payload,actor,at); currentWork=changed.value; payload=changed.payload;
    } else fail('알 수 없는 과업 행동입니다.');
    return signed({schema:SCHEMA,id:c.id,revision:c.revision+1,previous_hash:c.hash,spec,checks,attempts,state,artifacts,decision,actor,at,action:{type:action.type,payload},...(currentWork?{work:currentWork}:{})});
  }
  async function verify(history) {
    const h=copy(list(history,'과업 이력',MAX_HISTORY)); if(!h.length) fail('과업 이력이 비어 있습니다.');
    let previous=null;
    for(const r of h) {
      await validRecord(r); let rebuilt;
      if(!previous) {
        if(r.revision!==1 || r.action.type!=='create') fail('과업 첫 이력이 없습니다.');
        keys(r.action,['type','payload']); keys(r.action.payload,['spec']);
        rebuilt=await create(r.action.payload.spec,{id:r.id,actor:r.actor,at:r.at});
      } else {
        if(r.id!==previous.id || r.revision!==previous.revision+1 || r.previous_hash!==previous.hash) fail('과업 이력 체인이 불일치합니다.');
        rebuilt=await revise(previous,r.action,{actor:r.actor,at:r.at});
      }
      if(canonical(r)!==canonical(rebuilt)) fail('과업 상태 전이와 저장 이력이 불일치합니다.'); previous=r;
    }
    return true;
  }
  async function manifest(history) {
    const h=copy(history); await verify(h); const c=h[h.length-1];
    return freeze({schema:'renewmap-delivery-v1',id:c.id,revision:c.revision,head_hash:c.hash,spec:c.spec,state:c.state,attempts:c.attempts,artifacts:c.artifacts,artifact_set_hash:await hash(canonical(c.artifacts)),decision:c.decision,history:h});
  }
  const api={SCHEMA,MAX_ATTEMPTS,canonical,hash,create,revise,verify,manifest,work,workEvidence,workBlockers,isOverdue};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.RenewTasks=api;
})(typeof window!=='undefined'?window:globalThis);
