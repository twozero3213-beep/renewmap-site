const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./tasks.js');
const F = require('./tasks-files.js');
const options = {id:'legacy-work-test',actor:'합성 기록자',at:'2026-11-14T00:00:00.000Z'};
const spec = {title:'합성 과업',program:'합성 사업',guideline:'합성 지침',scope:'합성 범위',requirements:[{id:'r1',title:'합성 항목',source:'합성 출처',unit:'행정동'}]};
async function fixture() {
  const entries=await Promise.all(['원본','보완본','해소확인','점검결과','점검확인'].map(async(name)=>{
    const blob=new Blob(['합성 '+name]);return {name:name+'.txt',blob,sha256:await T.hash(await blob.arrayBuffer())};
  }));
  const evidence=i=>({name:entries[i].name,sha256:entries[i].sha256,size:entries[i].blob.size});
  const artifact=i=>({...evidence(i),input_hash:null,comparison_hash:null,template_version:null,blockers:[]});
  const history=[await T.create(spec,options)];
  const add=async(type,payload)=>{const r=await T.revise(history.at(-1),{type,payload},options);history.push(r);return r;};
  await add('check',{checks:[{id:'r1',result:'match',source:'합성 원본',page:'1쪽',unit:'행정동',note:'',evidence_sha256:entries[0].sha256}]});
  await add('attach',{artifacts:[artifact(0)]});
  const issue={id:'i1',requirement_id:'r1',artifact_sha256:entries[0].sha256,location:'자료 B3',row_id:'합성 조사 1',comment:'제외 사유 보완',assignee:'합성 작성자'};
  const followup={id:'f1',requirement_id:'r1',issue_id:'',title:'준공 후 시설 운영 확인',due_on:'2026-12-01',assignee:'합성 점검자'};
  const decision={reviewer:'합성 검토자',role:'합성 역할',decided_on:'2026-11-14',evidence:evidence(2),note:'합성 시험이며 실제 기관 승인 아님'};
  return {entries,evidence,artifact,history,add,issue,followup,decision};
}
test('기존 V1 해시와 manifest는 새 필드 없이 그대로 재현된다',async()=>{
  const r=await T.create(spec,options);
  assert.equal(r.hash,'65dadc4f31d0177364381d208ccf3e76d0749af47f1d177c3cce05024d7f694d');
  assert.equal(Object.hasOwn(r,'work'),false);assert.equal(Object.hasOwn(await T.manifest([r]),'work'),false);
  assert.deepEqual(T.work(r),{issues:[],followups:[]});
});
test('의견은 원판·파일·칸에 고정되고 보완 제출만으로 승인할 수 없다',async()=>{
  const f=await fixture(), source=f.history.at(-1);
  const opened=await f.add('issue_open',f.issue);
  assert.equal(opened.work.issues[0].source.hash,source.hash);
  assert.equal(opened.work.issues[0].source.artifact.sha256,f.entries[0].sha256);
  assert.equal(opened.work.issues[0].source.location,'자료 B3');
  await assert.rejects(f.add('approve',f.decision),/미해결/);
  await assert.rejects(f.add('issue_reply',{id:'i1',note:'그대로',evidence:f.evidence(0)}),/다른 보완본/);
  await f.add('attach',{artifacts:[f.artifact(0),f.artifact(1)]});
  await f.add('issue_reply',{id:'i1',note:'제외 사유 보완',evidence:f.evidence(1)});
  await assert.rejects(f.add('approve',f.decision),/미해결/);
  await f.add('issue_resolve',{id:'i1',note:'보완 근거 확인',evidence:f.evidence(2)});
  const approved=await f.add('approve',f.decision);assert.equal(approved.state,'approved');
  await f.add('issue_reopen',{id:'i1',note:'추가 상충 근거 발견'});
  assert.equal(approved.work.issues[0].status,'resolved');assert.equal(f.history.at(-1).work.issues[0].status,'open');
  await assert.rejects(f.add('approve',f.decision),/미해결/);
  assert.equal(await T.verify(f.history),true);
});
test('없는 대상·중복·누락·보완 전 해소·잘못된 파일을 거절한다',async()=>{
  const f=await fixture();
  for(const issue of [{...f.issue,requirement_id:'other'},{...f.issue,artifact_sha256:'f'.repeat(64)},{...f.issue,location:''},{...f.issue,assignee:''}]) await assert.rejects(f.add('issue_open',issue));
  await f.add('issue_open',f.issue);await assert.rejects(f.add('issue_open',f.issue));
  await assert.rejects(f.add('issue_resolve',{id:'i1',note:'확인',evidence:f.evidence(2)}));
  for(const evidence of [{...f.evidence(1),name:'../escape'},{...f.evidence(1),size:0},{...f.evidence(1),sha256:'invalid'},f.evidence(1)]) await assert.rejects(f.add('issue_reply',{id:'i1',note:'보완',evidence}));
});
test('계획 수정이나 현재 보완본 교체로 미해소 의견을 우회하지 못한다',async()=>{
  const f=await fixture();await f.add('issue_open',f.issue);
  await f.add('attach',{artifacts:[f.artifact(1)]});await f.add('issue_reply',{id:'i1',note:'새 보완본',evidence:f.evidence(1)});
  await f.add('issue_resolve',{id:'i1',note:'해소 확인',evidence:f.evidence(2)});
  await f.add('attach',{artifacts:[f.artifact(0)]});
  assert.match(T.workBlockers(f.history.at(-1))[0],/현재 납품/);await assert.rejects(f.add('approve',f.decision));
  await f.add('issue_reopen',{id:'i1',note:'원본으로 교체됨'});
  await f.add('edit',{spec:{...spec,scope:'변경된 합성 범위'}});
  assert.equal(f.history.at(-1).work.issues[0].status,'open');assert.equal(await T.verify(f.history),true);
});
test('후속점검의 기한·담당 변경과 제출·확인은 분리되며 미래 점검은 승인 차단이 아니다',async()=>{
  const f=await fixture();await f.add('followup_open',f.followup);
  const pending=f.history.at(-1);await f.add('approve',f.decision);assert.equal(f.history.at(-1).state,'approved');
  await assert.rejects(f.add('followup_reschedule',{id:'f1',due_on:'2026-02-30',assignee:'새 담당',note:'변경'}));
  await assert.rejects(f.add('followup_reschedule',{id:'f1',due_on:f.followup.due_on,assignee:f.followup.assignee,note:'같음'}));
  await f.add('followup_reschedule',{id:'f1',due_on:'2026-12-02',assignee:'새 담당',note:'인계와 기한 변경'});
  assert.equal(pending.work.followups[0].due_on,'2026-12-01');
  await assert.rejects(f.add('followup_verify',{id:'f1',note:'먼저 확인',evidence:f.evidence(4)}));
  await f.add('followup_submit',{id:'f1',note:'현장 점검 결과',evidence:f.evidence(3)});
  assert.equal(T.isOverdue(f.history.at(-1).work.followups[0],'2026-12-03'),true);
  await assert.rejects(f.add('followup_reschedule',{id:'f1',due_on:'2026-12-10',assignee:'새 담당',note:'제출 후 기한변경'}));
  await f.add('followup_verify',{id:'f1',note:'증빙 대조 완료',evidence:f.evidence(4)});
  assert.equal(T.isOverdue(f.history.at(-1).work.followups[0],'2026-12-03'),false);
  await f.add('followup_reopen',{id:'f1',note:'후속 불일치'});assert.equal(f.history.at(-1).work.followups[0].status,'open');
  assert.equal(await T.verify(f.history),true);
});
test('현재·과거 증빙 모두 백업에 포함되고 누락·바이트 변조를 거절한다',async()=>{
  const f=await fixture();await f.add('issue_open',f.issue);await f.add('attach',{artifacts:[f.artifact(1)]});
  await f.add('issue_reply',{id:'i1',note:'보완',evidence:f.evidence(1)});await f.add('issue_resolve',{id:'i1',note:'해소',evidence:f.evidence(2)});
  await f.add('followup_open',{...f.followup,issue_id:'i1'});await f.add('followup_submit',{id:'f1',note:'결과',evidence:f.evidence(3)});await f.add('followup_verify',{id:'f1',note:'확인',evidence:f.evidence(4)});
  await f.add('issue_reopen',{id:'i1',note:'재검토'});await f.add('followup_reopen',{id:'f1',note:'다시 점검'});
  const b=await F.make(f.history,f.entries), restored=await F.read(JSON.stringify(b));
  assert.equal(restored.files.length,5);assert.deepEqual(restored.manifest.history,f.history);
  const bad=structuredClone(b);bad.files.pop();await assert.rejects(F.read(JSON.stringify(bad)));
  await assert.rejects(F.make(f.history,f.entries.slice(0,4)));
  const tampered=structuredClone(b);tampered.files[2].base64=btoa('different');await assert.rejects(F.read(JSON.stringify(tampered)));
});
test('지문을 다시 계산해도 해소 상태·출처·담당 변경의 조작은 재현 검증에서 거절한다',async()=>{
  const f=await fixture();await f.add('issue_open',f.issue);await f.add('followup_open',f.followup);
  for(const mutate of [r=>{r.work.issues[0].status='resolved';},r=>{r.work.issues[0].source.hash='a'.repeat(64);},r=>{r.work.followups[0].assignee='바꾼 담당';},r=>{delete r.work;}]) {
    const h=structuredClone(f.history),r=h.at(-1);mutate(r);const {hash,...body}=r;r.hash=await T.hash(T.canonical(body));await assert.rejects(T.verify(h));
  }
});
