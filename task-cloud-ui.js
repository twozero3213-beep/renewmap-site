(function(root){
  'use strict';
  function mount(options){
    let callback=typeof root.RenewTaskAuthCallback==='function'?root.RenewTaskAuthCallback():null;
    delete root.RenewTaskAuthCallback;
    if(root.RenewTaskCloudConfig===undefined||root.RenewTaskCloudConfig===null)return null;
    let client,markerWarning,markerFailed=false,markerUnreadable=false;
    const markerKey='renewmap-shared-task-ids-v1',known=new Set();
    try{
      const stored=root.localStorage.getItem(markerKey);
      if(stored){
        if(stored.length>1100000)throw Error('shared marker size');
        const ids=JSON.parse(stored);
        if(!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)))throw Error('shared marker format');
        for(const id of ids)known.add(id);
      }
    }catch(_){markerUnreadable=true;}
    function paintMarker(){
      if(markerWarning)markerWarning.textContent=markerUnreadable
        ?'공유 과업 잠금 기록을 읽지 못했습니다. 로그인하여 서버 권한을 확인하기 전에는 과업을 수정할 수 없습니다. 기존 파일의 열람·백업은 가능합니다.'
        :markerFailed?'서버 작업과 별개로 이 기기의 공유 과업 잠금 표식을 저장하지 못했습니다. 이 탭의 잠금은 유지됩니다. 새로고침 뒤에는 로그인하여 서버 과업을 다시 확인하세요.':'';
    }
    function rememberShared(id){
      known.add(id);
      try{if(known.size>10000)throw Error('shared marker count');root.localStorage.setItem(markerKey,JSON.stringify([...known]));markerFailed=false;}
      catch(_){markerFailed=true;}
      paintMarker();
    }
    try{client=root.RenewTaskCloud.create(root.RenewTaskCloudConfig,{knownTaskIds:[...known],requireAuthentication:markerUnreadable,onShared:rememberShared});}
    catch(_){if(typeof options.notify==='function')options.notify('서버 연결 설정을 확인하지 못했습니다. 기기 보관은 계속 이용할 수 있습니다.');return null;}
    if(!client.available())return null;
    for(const key of ['getBackup','restoreBackup','run','notify'])if(typeof options[key]!=='function')throw new Error('공동 보관 화면의 연결 함수를 확인해 주세요.');
    const doc=root.document,main=doc.getElementById('main')||doc.querySelector('main');
    if(!main)return null;
    if(doc.getElementById('taskCloud'))return doc.getElementById('taskCloud');
    const el=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const details=el('details');details.id='taskCloud';
    details.append(el('summary','서버 공동 보관'));
    const notice=el('p','서버 설정이 있는 환경에서만 이용합니다. 실제 연결 여부는 이메일 인증 후 확인합니다. 로그인 계정은 서버 보관·접근 기록의 주체입니다. 문서에 적힌 외부 검토자의 신원·전자서명·기관 승인은 별도 확인 대상입니다.');notice.className='task-help';details.append(notice);
    markerWarning=el('p');markerWarning.id='cloudMarkerWarning';markerWarning.setAttribute('role','status');details.append(markerWarning);paintMarker();
    const status=el('p');status.id='cloudUser';status.setAttribute('aria-live','polite');details.append(status);
    function field(label,id,type='text'){
      const wrap=el('label',label),input=el('input');input.id=id;input.type=type;input.autocomplete='off';wrap.htmlFor=id;wrap.append(input);return{wrap,input};
    }
    function button(text,id){const b=el('button',text);b.type='button';b.id=id;return b;}
    details.append(el('p','현재 로그인 메일은 서버 운영팀에 등록된 주소에만 발송됩니다. 일반 고객의 이메일 가입은 별도 메일 서버 설정 이후에 제공할 수 있습니다.'));
    const linkPanel=el('div'),linkStatus=el('p'),accept=button('이메일 링크 로그인 완료','cloudLinkConfirm'),discard=button('이 로그인 링크 취소','cloudLinkCancel');
    linkPanel.id='cloudLinkPanel';linkPanel.hidden=true;linkStatus.id='cloudLinkUser';linkStatus.setAttribute('aria-live','polite');linkPanel.append(linkStatus,accept,discard);details.append(linkPanel);
    function clearLink(){linkPanel.hidden=true;linkStatus.textContent='';}
    const authForm=el('form'),email=field('로그인 이메일','cloudEmail','email'),code=field('숫자 코드가 있는 메일만 · 인증 코드','cloudCode');
    email.input.maxLength=254;code.input.maxLength=10;code.input.inputMode='numeric';code.input.autocomplete='one-time-code';
    const send=button('로그인 메일 받기','cloudSendCode'),login=button('숫자 코드로 로그인','cloudLogin'),logout=button('로그아웃','cloudLogout');
    authForm.append(email.wrap,send,code.wrap,login,logout);authForm.addEventListener('submit',event=>event.preventDefault());details.append(authForm);
    details.append(el('p','로그아웃해도 이 기기에 저장한 과업과 파일은 남습니다. 공동 기기에서는 별도 백업과 기기 보관 정책을 확인해 주세요.'));
    const sync=button('현재 과업 서버 보관','cloudSync'),list=button('서버 과업 목록','cloudList'),pull=button('선택 과업을 기기에 복원','cloudPull');
    const remoteLabel=el('label','서버 과업'),remote=el('select');remote.id='cloudTaskPick';remoteLabel.htmlFor=remote.id;remoteLabel.append(remote);
    details.append(sync,list,remoteLabel,pull);
    const memberForm=el('form'),member=field('구성원의 인증 계정 ID(UUID)','cloudMemberId'),roleLabel=el('label','부여할 역할'),role=el('select');
    member.input.maxLength=36;role.id='cloudMemberRole';roleLabel.htmlFor=role.id;
    for(const [value,text]of [['viewer','열람'],['reviewer','검토'],['editor','편집'],['','권한 해제']])role.add(new Option(text,value));roleLabel.append(role);
    const grant=button('현재 과업 구성원 권한 변경','cloudMember');memberForm.append(member.wrap,roleLabel,grant);memberForm.addEventListener('submit',event=>event.preventDefault());details.append(memberForm);
    details.append(el('p','이 기기에서 선택한 과업에 계정 ID를 직접 등록합니다. 서버의 소유자 권한 검사를 통과해야 하며, 이메일 초대는 보내지 않습니다. 소유자는 변경할 수 없습니다.'));
    let busy=false,lastUser=null;
    function clearRows(){remote.replaceChildren(new Option('서버 과업을 조회해 주세요',''));}
    function paint(){const u=client.user(),id=u?.id||null;if(lastUser!==id)clearRows();lastUser=id;status.textContent=u?`로그인 이메일: ${u.email} · 인증 계정 ID: ${u.id}`:'로그인하지 않았습니다. 서버 보관 여부는 아직 확인하지 않았습니다.';}
    async function perform(fn){
      if(busy)return;busy=true;
      const controls=[...details.querySelectorAll('button,input,select')];controls.forEach(e=>{e.disabled=true;});
      try{await options.run(fn);}finally{busy=false;controls.forEach(e=>{e.disabled=false;});paint();}
    }
    send.addEventListener('click',()=>perform(async()=>{client.discardLink();clearLink();await client.requestCode(email.input.value.trim());options.notify('로그인 메일을 요청했습니다. 메일의 링크를 열고 표시된 이메일을 확인한 뒤 로그인 완료를 눌러 주세요. 숫자 코드가 포함된 메일은 코드로도 인증할 수 있습니다.');}));
    login.addEventListener('click',()=>perform(async()=>{client.discardLink();clearLink();try{await client.verifyCode(email.input.value.trim(),code.input.value.trim());options.notify('이메일 계정을 인증했습니다. 서버 과업의 접근 권한은 작업할 때 확인합니다.');}finally{code.input.value='';}}));
    logout.addEventListener('click',()=>perform(async()=>{clearLink();try{await client.logout();options.notify('서버 로그아웃을 요청하고 로그인 정보를 지웠습니다. 기기 사본은 유지됩니다.');}finally{email.input.value='';code.input.value='';clearRows();}}));
    sync.addEventListener('click',()=>perform(async()=>{const backup=await options.getBackup();await client.sync(backup);options.notify('인증 계정 권한으로 현재 과업을 서버에 보관했습니다. 기기 사본도 유지됩니다.');}));
    list.addEventListener('click',()=>perform(async()=>{const rows=await client.list();clearRows();for(const row of rows)remote.add(new Option(`${row.title} · v${row.revision} · ${row.role}`,row.id));options.notify(`접근 가능한 서버 과업 ${rows.length}건을 불러왔습니다.`);}));
    pull.addEventListener('click',()=>perform(async()=>{const id=remote.value;if(!id)throw new Error('기기에 복원할 서버 과업을 선택해 주세요.');const backup=await client.get(id);await options.restoreBackup(backup);options.notify('검사한 서버 과업을 기기에 복원했습니다. 기관 승인 진위는 별도 확인 대상입니다.');}));
    grant.addEventListener('click',()=>perform(async()=>{const memberId=member.input.value.trim(),memberRole=role.value||null,backup=await options.getBackup();if(!backup?.manifest?.id)throw new Error('기기에서 과업을 먼저 선택해 주세요.');await client.member(backup.manifest.id,memberId,memberRole);options.notify('서버 과업의 구성원 권한을 변경했습니다. 이메일은 보내지 않았습니다.');}));
    accept.addEventListener('click',()=>perform(async()=>{const u=client.acceptLink();clearLink();email.input.value=u.email;options.notify('확인한 이메일 계정으로 로그인했습니다. 서버 과업의 접근 권한은 작업할 때 확인합니다.');}));
    discard.addEventListener('click',()=>perform(async()=>{client.discardLink();clearLink();options.notify('로그인 링크를 폐기했습니다. 기기의 과업과 파일은 유지됩니다.');}));
    details.assertCanChange=(id,actions)=>client.assertCanChange(id,actions);
    clearRows();paint();main.append(details);
    if(callback){
      details.open=true;
      if(callback.error){callback=null;options.notify('로그인 링크가 만료됐거나 유효하지 않습니다. 새 로그인 메일을 받아 주세요.');}
      else root.setTimeout(()=>perform(async()=>{
        const pair=callback;callback=null;
        const u=await client.prepareLink(pair);
        linkStatus.textContent=`서버가 확인한 로그인 이메일: ${u.email}. 본인이 요청한 계정인지 확인하세요. 아직 서버 로그인은 완료하지 않았습니다.`;
        linkPanel.hidden=false;
        options.notify('로그인 링크의 이메일을 확인한 뒤 이메일 링크 로그인 완료를 눌러 주세요.');
      }),0);
    }
    return details;
  }
  const api={mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.RenewTaskCloudUI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
