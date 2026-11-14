(function (root) {
  'use strict';
  const T = root.RenewTasks;
  const $ = id => document.getElementById(id);
  const labels = {open:'처리 전',submitted:'확인 대기',resolved:'해소 확인',verified:'점검 확인 완료'};
  const actions = {
    issue_open:'새 검토 의견 등록',issue_reply:'보완 답변·파일 기록',issue_resolve:'해소 확인 기록',issue_reopen:'검토 의견 다시 열기',
    followup_open:'새 후속 점검 등록',followup_reschedule:'기한·담당자 변경',followup_submit:'점검 결과 제출',followup_verify:'점검 완료 확인',followup_reopen:'후속 점검 다시 열기',
  };
  const help = {
    reply:'원본과 다른 보완 파일을 연결합니다. 기존 납품 파일과 다른 이름으로 올려 주세요. 답변만으로 의견이 해소되지는 않습니다.',
    resolve:'보완 답변을 검토한 해소 확인 증빙을 남깁니다. 공동 보관에서는 소유자·검토 역할 계정만 이 처리를 저장할 수 있습니다.',
    reopen:'다시 확인해야 하는 이유를 남깁니다. 이전 답변과 확인 증빙은 과거 과업 이력에 보존됩니다.',
    reschedule:'기한이나 담당자가 실제로 달라져야 합니다. 변경 사유와 이전 기한·담당자는 과업 이력에 남습니다.',
    submit:'실제 점검 결과와 증빙을 연결합니다. 제출 후에도 담당자의 완료 확인이 필요합니다.',
    verify:'제출된 점검 결과를 확인한 증빙을 남깁니다. 공동 보관에서는 소유자·검토 역할 계정만 이 처리를 저장할 수 있습니다.',
  };
  function mount({run,task,versions,commit,notify}) {
    let selected = '', taskId = '';
    const panel = $('taskWork');
    const pages = root.RenewListPages.create($('workList'),'검토·후속 점검',renderRows);
    const historyPages = root.RenewListPages.create($('workHistory'),'선택 기록의 변경 이력',renderHistory);
    const kind = () => $('workKind').value;
    const work = () => task() ? T.work(task()) : {issues:[],followups:[]};
    const rows = () => work()[kind()==='issue'?'issues':'followups'];
    const item = () => rows().find(row=>row.id===selected);
    const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
    const overdue = row => kind()==='followup' && T.isOverdue(row,today());
    const title = row => kind()==='issue'?row.comment:row.title;
    const text = (tag,value) => { const e=document.createElement(tag);e.textContent=value;return e; };
    const message = value => { $('workMsg').textContent=value;notify(value); };
    const perform = fn => run(async()=>{try{await fn();}catch(error){$('workMsg').textContent=error.message;throw error;}});
    function fieldGroup(name,visible) {
      for(const node of panel.querySelectorAll('[data-work-fields="'+name+'"]')) node.hidden=!visible;
    }
    function allRows() {
      return rows().slice().sort((a,b)=>{
        const done = r => ['resolved','verified'].includes(r.status)?1:0;
        return done(a)-done(b) || (a.due_on||a.opened.at).localeCompare(b.due_on||b.opened.at) || a.id.localeCompare(b.id);
      });
    }
    function renderRows() {
      const filter=$('workFilter').value;
      const filtered=allRows().filter(row=>filter==='all'||filter===row.status||filter==='closed'&&['resolved','verified'].includes(row.status)||filter==='overdue'&&overdue(row));
      $('workList').replaceChildren();
      for(const row of pages.slice(filtered)) {
        const li=text('li',''),button=text('button',title(row).length>160?title(row).slice(0,160)+'…':title(row));button.type='button';
        button.addEventListener('click',()=>{choose(row.id);$('workAction').focus();});
        const meta=text('small',`${labels[row.status]} · 담당 ${row.assignee}${row.due_on?' · '+row.due_on:''}${overdue(row)?' · 기한 지남':''}`);
        if(overdue(row)) meta.className='work-overdue';
        li.append(button,meta);$('workList').append(li);
      }
      if(!filtered.length)$('workList').append(text('li','조건에 맞는 기록이 없습니다.'));
    }
    function renderHistory() {
      $('workHistory').replaceChildren();
      if(!selected)return;
      const records=versions().filter(v=>v.action.type.startsWith(kind()+'_')&&v.action.payload.id===selected).reverse();
      for(const record of historyPages.slice(records)) {
        const p=record.action.payload;
        $('workHistory').append(text('li',`v${record.revision} · ${actions[record.action.type]}\n${record.actor} · ${record.at}${p.note?'\n'+p.note:''}${p.due_on?'\n기한 '+p.due_on:''}${p.assignee?' · 담당 '+p.assignee:''}`));
      }
    }
    function evidenceButton(label,entry) {
      if(!entry)return;
      const button=text('button',label+' · '+entry.name);button.type='button';
      button.addEventListener('click',()=>perform(async()=>{
        const base=task(),file=await root.FieldStore.doc('task-file:'+base.id+':'+entry.sha256);
        if(!file?.blob || file.blob.size!==entry.size || await T.hash(await file.blob.arrayBuffer())!==entry.sha256)
          throw new Error('증빙 파일이 없거나 저장된 지문·크기가 다릅니다.');
        root.RenewDocgen.saveBytes(entry.name,file.blob,file.blob.type||'application/octet-stream');
        message('저장된 지문을 확인한 증빙 파일을 받았습니다.');
      }));
      $('workEvidenceLinks').append(button);
    }
    function renderDetail() {
      const row=item();$('workDetail').replaceChildren();$('workNotes').replaceChildren();$('workEvidenceLinks').replaceChildren();
      $('workEvidencePanel').hidden=!row;
      if(!row){renderHistory();return;}
      $('workNotes').append(text('p',(kind()==='issue'?'검토 의견':'점검 내용')+' · '+title(row)));
      const origin=versions().find(v=>v.revision===row.source.revision);
      const requirement=origin?.spec.requirements.find(r=>r.id===row.requirement_id);
      $('workDetail').append(text('strong',title(row).length>180?title(row).slice(0,180)+'…':title(row)),text('p',`${labels[row.status]} · 담당 ${row.assignee}${row.due_on?' · 확인 기한 '+row.due_on:''}${overdue(row)?' · 기한 지남':''}`));
      if(overdue(row))$('workDetail').lastElementChild.className='work-overdue';
      $('workDetail').append(text('p',`연결 항목 ${requirement?.title||row.requirement_id} · 최초 연결 v${row.source.revision}`));
      if(kind()==='issue'){
        $('workDetail').append(text('p',`${row.source.artifact.name} · ${row.source.location}${row.source.row_id?' · 조사 행 '+row.source.row_id:''}`));
        evidenceButton('검토 원본',row.source.artifact);
      } else if(row.issue_id) {
        const issue=work().issues.find(r=>r.id===row.issue_id);
        $('workDetail').append(text('p','연결 검토 의견 '+(issue?.comment||row.issue_id)));
      }
      for(const [key,label]of [['reply','보완 답변'],['resolution','해소 확인'],['submission','점검 결과'],['verification','점검 확인'],['schedule','기한·담당 변경'],['reopened','다시 연 사유']]) {
        if(row[key]){
          $('workNotes').append(text('p',`${label} · ${row[key].note}\n기록 ${row[key].actor} · ${row[key].at}`));
          evidenceButton(label,row[key].evidence);
        }
      }
      const digest=text('small','최초 연결 과업 지문 '+row.source.hash);digest.className='task-hash';$('workEvidenceLinks').append(digest);
      renderHistory();
    }
    function renderFields() {
      const row=item(),which=$('workAction').value,fresh=!row,isIssue=kind()==='issue';
      fieldGroup('new',fresh);fieldGroup('issue-new',fresh&&isIssue);fieldGroup('followup-new',fresh&&!isIssue);
      fieldGroup('schedule',fresh||which==='reschedule');fieldGroup('due',!isIssue&&(fresh||which==='reschedule'));
      fieldGroup('update',!fresh);fieldGroup('evidence',['reply','resolve','submit','verify'].includes(which));
      const required={workRequirement:fresh,workArtifact:fresh&&isIssue,workLocation:fresh&&isIssue,workComment:fresh&&isIssue,workTitle:fresh&&!isIssue,workAssignee:fresh||which==='reschedule',workDue:!isIssue&&(fresh||which==='reschedule'),workNote:!fresh,workEvidence:['reply','resolve','submit','verify'].includes(which)};
      for(const [id,value]of Object.entries(required))$(id).required=value;
      $('workActionHelp').textContent=help[which]||'';
      $('workSave').textContent=actions[kind()+'_'+which];
    }
    function choose(id) {
      selected=id;$('workPick').value=id;historyPages.reset();
      for(const key of ['workComment','workLocation','workRowId','workTitle','workNote','workEvidence'])$(key).value='';
      const row=item(),isIssue=kind()==='issue';
      $('workAssignee').value=row?.assignee||'';$('workDue').value=row?.due_on||'';
      const available=!row?['open']:isIssue?(row.status==='open'?['reply']:row.status==='submitted'?['resolve','reply','reopen']:['reopen']):(row.status==='open'?['submit','reschedule']:row.status==='submitted'?['verify','submit','reopen']:['reopen']);
      $('workAction').replaceChildren(...available.map(action=>new Option(actions[kind()+'_'+action],action)));
      renderFields();renderDetail();
    }
    function refreshIssuePick() {
      const value=$('workIssue').value,requirement=$('workRequirement').value;
      const linked=work().issues.filter(row=>row.requirement_id===requirement);
      $('workIssue').replaceChildren(new Option('별도 후속 점검',''),...linked.map(row=>new Option(row.comment.slice(0,80),row.id)));
      $('workIssue').value=linked.some(row=>row.id===value)?value:'';
    }
    function refresh() {
      const base=task(),isIssue=kind()==='issue';
      if(taskId!==base?.id){selected='';taskId=base?.id||'';pages.reset();}
      $('workScope').textContent=root.RenewTaskCloudConfig
        ?'기기 사본에 먼저 기록합니다. 서버 공동 보관에서 로그인 후 저장해야 계정 권한 검사를 통과한 기록이 됩니다. 담당자 이름과 기록 작성자 입력은 신원·전자서명 인증이 아닙니다.'
        :'기기 내 기록입니다. 공동 보관 서버가 연결되지 않아 계정 인증·공유·역할 검증은 수행하지 않습니다. 담당자 이름은 업무 표기이며 알림을 보내지 않습니다.';
      const state=work(),pending=state.issues.filter(r=>r.status!=='resolved').length,late=state.followups.filter(r=>T.isOverdue(r,today())).length;
      $('workSummary').textContent=base?`미해소 의견 ${pending}건 · 후속 점검 ${state.followups.length}건 · 기한 지난 점검 ${late}건`:'과업 계획과 검토할 납품 파일을 먼저 저장하세요.';
      $('workNew').textContent=isIssue?'새 검토 의견':'새 후속 점검';
      $('workPick').replaceChildren(new Option('새 기록',''),...allRows().map(r=>new Option(`${labels[r.status]} · ${title(r).slice(0,70)}`,r.id)));
      $('workRequirement').replaceChildren(...(base?.spec.requirements||[]).map(r=>new Option(r.title,r.id)));
      const seen=new Set(),unique=(base?.artifacts||[]).filter(a=>{if(seen.has(a.sha256))return false;seen.add(a.sha256);return true;});
      $('workArtifact').replaceChildren(new Option('파일을 선택하세요',''),...unique.map(a=>new Option(a.name+' · '+a.sha256.slice(0,10),a.sha256)));
      refreshIssuePick();
      choose(rows().some(r=>r.id===selected)?selected:'');renderRows();
    }
    $('workRequirement').addEventListener('change',refreshIssuePick);
    $('workKind').addEventListener('change',()=>{selected='';pages.reset();$('workFilter').value='all';refresh();});
    $('workPick').addEventListener('change',()=>choose($('workPick').value));
    $('workNew').addEventListener('click',()=>{choose('');$('workRequirement').focus();});
    $('workFilter').addEventListener('change',()=>{pages.reset();renderRows();});
    $('workAction').addEventListener('change',()=>{ $('workNote').value='';$('workEvidence').value='';renderFields(); });
    $('workForm').addEventListener('submit',event=>{
      event.preventDefault();
      const base=task(),which=$('workAction').value,type=kind()+'_'+which,id=selected||crypto.randomUUID();
      let payload={id};
      if(which==='open')payload=kind()==='issue'
        ?{id,requirement_id:$('workRequirement').value,artifact_sha256:$('workArtifact').value,location:$('workLocation').value.trim(),row_id:$('workRowId').value.trim(),comment:$('workComment').value.trim(),assignee:$('workAssignee').value.trim()}
        :{id,requirement_id:$('workRequirement').value,issue_id:$('workIssue').value,title:$('workTitle').value.trim(),due_on:$('workDue').value,assignee:$('workAssignee').value.trim()};
      else {
        payload.note=$('workNote').value.trim();
        if(which==='reschedule'){payload.due_on=$('workDue').value;payload.assignee=$('workAssignee').value.trim();}
      }
      const file=['reply','resolve','submit','verify'].includes(which)?$('workEvidence').files[0]:null;
      perform(async()=>{selected=id;await commit(type,payload,file,base);message(actions[type]+'을 새 과업 버전에 저장했습니다. 기기 기록의 서버 보관은 별도로 확인하세요.');});
    });
    return {refresh};
  }
  root.RenewTaskFollowupUI={mount};
})(typeof window==='object'?window:globalThis);
