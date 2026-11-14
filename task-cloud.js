// Auth REST 계약: supabase.com/docs/guides/auth/auth-email-passwordless
// 세션은 메모리에만 둔다. 계정 인증과 문서에 적은 외부 검토자의 신원은 별개다.
(function(root,factory){
  'use strict';
  const common=typeof module==='object'&&module.exports;
  const api=factory(common?require('./tasks.js'):root.RenewTasks,common?require('./tasks-files.js'):root.TaskFiles);
  if(common)module.exports=api;else root.RenewTaskCloud=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(T,B){
  'use strict';
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const TASK=/^[a-zA-Z0-9_-]{1,100}$/,HEX=/^[a-f0-9]{64}$/;
  const STATES=['planned','invalid','hold','ready','approved','rejected'];
  const ROLES=['owner','editor','reviewer','viewer'];
  function fail(message){throw new Error(message);}
  function mail(value){if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||/[\x00-\x1f\x7f]/.test(value))fail('이메일 주소를 확인해 주세요.');return value.trim().toLowerCase();}
  function taskId(id){if(typeof id!=='string'||!TASK.test(id))fail('과업 ID를 확인해 주세요.');return id;}
  function configuration(value){
    if(value===undefined||value===null||(typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0))return null;
    if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'url')||!Object.hasOwn(value,'publishableKey'))fail('클라우드 연결 설정을 확인해 주세요.');
    let url;try{url=new URL(value.url);}catch(_){fail('클라우드 서버 주소를 확인해 주세요.');}
    if(typeof value.url!=='string'||url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname)||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)fail('공식 HTTPS 클라우드 서버 주소만 사용할 수 있습니다.');
    if(typeof value.publishableKey!=='string'||value.publishableKey.length>512||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.publishableKey))fail('브라우저용 공개 키만 사용할 수 있습니다. 서버 비밀 키는 사용할 수 없습니다.');
    return {url:url.origin,key:value.publishableKey};
  }
  function remoteError(status){
    const messages={401:'로그인이 만료됐습니다. 다시 인증해 주세요.',403:'이 과업을 처리할 권한이 없습니다.',409:'서버의 과업 이력이 달라 동기화를 중단했습니다.',413:'전송할 과업 묶음이 너무 큽니다.',429:'인증 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.'};
    const e=new Error(messages[status]||(status>=500?'클라우드 서버가 응답하지 못했습니다. 잠시 뒤 다시 시도해 주세요.':'클라우드 요청이 거절됐습니다. 입력과 권한을 확인해 주세요.'));e.status=status;return e;
  }
  function token(value){return typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=8192&&!/[\x00-\x20\x7f]/.test(value);}
  function authSession(value,expectedEmail,expectedId){
    if(!value||typeof value!=='object'||!token(value.access_token)||!token(value.refresh_token)||!value.user||!UUID.test(value.user.id||''))fail('유효한 로그인 응답을 받지 못했습니다. 다시 인증해 주세요.');
    let email;try{email=mail(value.user.email);}catch(_){fail('유효한 로그인 응답을 받지 못했습니다. 다시 인증해 주세요.');}
    if(expectedEmail&&email!==expectedEmail||expectedId&&value.user.id!==expectedId)fail('로그인 계정이 일치하지 않습니다. 다시 인증해 주세요.');
    return {access:value.access_token,refresh:value.refresh_token,id:value.user.id,email};
  }
  function create(config,options={}){
    const cfg=configuration(config),fetcher=options.fetch||globalThis.fetch;
    let session=null,pendingLink=null,generation=0,refreshing=null;
    const available=()=>!!cfg;
    const user=()=>session?{id:session.id,email:session.email}:null;
    function configured(){if(!cfg)fail('클라우드 연결이 설정되지 않았습니다. 이 기기의 과업 보관을 이용해 주세요.');if(typeof fetcher!=='function')fail('이 환경에서는 클라우드 연결을 사용할 수 없습니다.');}
    function authenticated(expected){configured();if(!session||expected!==undefined&&expected!==generation)fail('로그인이 필요합니다. 이메일 인증을 다시 해 주세요.');return generation;}
    async function request(path,body,bearer,noContent=false,method='POST'){
      configured();const headers={apikey:cfg.key,'Content-Type':'application/json'};if(bearer)headers.Authorization='Bearer '+bearer;
      let response;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try{
        try{response=await fetcher(cfg.url+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});}
        catch(_){fail('클라우드에 연결하지 못했습니다. 네트워크를 확인해 주세요.');}
        if(!response||!Number.isInteger(response.status))fail('유효한 클라우드 응답을 받지 못했습니다.');
        if(!response.ok)throw remoteError(response.status);
        if(noContent&&response.status===204)return null;
        if(!/\bapplication\/(?:[a-z0-9.-]+\+)?json\b/i.test(response.headers.get('Content-Type')||''))fail('유효한 클라우드 응답을 받지 못했습니다.');
        let text;try{text=await response.text();}catch(_){fail('클라우드 응답을 읽지 못했습니다. 다시 시도해 주세요.');}
        if(!text||text.length>40*1024*1024||new TextEncoder().encode(text).length>40*1024*1024)fail('클라우드 응답이 비어 있거나 너무 큽니다.');
        try{return JSON.parse(text);}catch(_){fail('유효한 클라우드 응답을 받지 못했습니다.');}
      }finally{clearTimeout(timer);}
    }
    async function refresh(epoch){
      authenticated(epoch);if(refreshing&&refreshing.epoch===epoch)return refreshing.promise;
      const old=session,entry={epoch,promise:null};
      entry.promise=(async()=>{
        try{
          const data=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:old.refresh});
          authenticated(epoch);session=authSession(data,old.email,old.id);
        }catch(error){if(generation===epoch){session=null;generation++;}throw error;}
        finally{if(refreshing===entry)refreshing=null;}
      })();refreshing=entry;return entry.promise;
    }
    async function rpc(name,body,expected){
      const epoch=authenticated(expected),access=session.access;
      let data;
      try{data=await request('/rest/v1/rpc/'+name,body,access);}
      catch(error){
        if(error.status!==401)throw error;
        authenticated(epoch);if(session.access===access)await refresh(epoch);
        authenticated(epoch);
        try{data=await request('/rest/v1/rpc/'+name,body,session.access);}
        catch(retryError){if(retryError.status===401&&generation===epoch){session=null;generation++;}throw retryError;}
      }
      authenticated(epoch);return data;
    }
    const ids=options.knownTaskIds||[];
    if(!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string'||!TASK.test(id)))fail('공유 과업 잠금 기록을 확인해 주세요.');
    const knownShared=new Set(ids);
    function shared(id){knownShared.add(id);if(typeof options.onShared==='function')options.onShared(id);}
    const api={
      available,user,
      prepareLink:async(value)=>{
        configured();
        const epoch=++generation;session=null;pendingLink=null;refreshing=null;
        if(!value||!token(value.access_token)||!token(value.refresh_token))fail('로그인 링크가 유효하지 않습니다. 새 로그인 메일을 받아 주세요.');
        const pair={access_token:value.access_token,refresh_token:value.refresh_token};
        const verified=await request('/auth/v1/user',null,pair.access_token,false,'GET');
        if(generation!==epoch)fail('인증 중 로그인이 변경됐습니다. 새 로그인 메일을 받아 주세요.');
        pendingLink=authSession({...pair,user:verified});
        return {id:pendingLink.id,email:pendingLink.email};
      },
      acceptLink:()=>{
        if(!pendingLink)fail('확인할 로그인 링크가 없습니다. 새 로그인 메일을 받아 주세요.');
        session=pendingLink;pendingLink=null;generation++;refreshing=null;return user();
      },
      discardLink:()=>{pendingLink=null;generation++;},
      requestCode:async(email)=>{configured();email=mail(email);await request('/auth/v1/otp',{email,create_user:true});return true;},
      verifyCode:async(email,code)=>{
        configured();email=mail(email);if(typeof code!=='string'||!/^\d{6,10}$/.test(code))fail('이메일로 받은 숫자 인증 코드를 확인해 주세요.');
        const epoch=++generation;session=null;pendingLink=null;
        const data=await request('/auth/v1/verify',{email,token:code,type:'email'});
        if(generation!==epoch)fail('인증 중 로그인이 변경됐습니다. 다시 인증해 주세요.');
        session=authSession(data,email);return user();
      },
      logout:async()=>{
        const previous=session;session=null;pendingLink=null;generation++;refreshing=null;
        if(!previous)return;
        await request('/auth/v1/logout?scope=local',{},previous.access,true);
      },
      sync:async(backup)=>{
        const epoch=authenticated();let text;
        try{text=JSON.stringify(backup);}catch(_){fail('과업 백업 형식을 확인해 주세요.');}
        const checked=await B.read(text),safe=JSON.parse(text);authenticated(epoch);
        const canonical_history=checked.manifest.history.map(r=>{const {hash,...body}=r;return T.canonical(body);});
        const canonical_artifacts=checked.manifest.history.map(r=>T.canonical(r.artifacts));
        const result=await rpc('renewmap_sync_task',{backup:safe,canonical_history,canonical_artifacts},epoch);shared(checked.manifest.id);return result;
      },
      assertCanChange:async(id,actions)=>{
        id=taskId(id);
        const names=['create','edit','check','hold','attach','approve','reject','issue_open','issue_reply','issue_resolve','issue_reopen','followup_open','followup_reschedule','followup_submit','followup_verify','followup_reopen'];
        if(!Array.isArray(actions)||!actions.length||actions.some(type=>!names.includes(type)))fail('저장할 과업 행동을 확인해 주세요.');
        if(!cfg)return true;
        if(!session){if(knownShared.has(id)||options.requireAuthentication)fail('서버에 연결된 과업이거나 공유 여부를 확인할 수 없습니다. 다시 로그인한 뒤 수정해 주세요.');return true;}
        const rows=await api.list(),row=rows.find(r=>r.id===id);
        if(!row){if(knownShared.has(id))fail('공유 과업의 현재 권한을 확인할 수 없어 수정을 중단했습니다.');return true;}
        const review=['approve','reject','issue_resolve','issue_reopen','followup_verify','followup_reopen'];
        const edit=['issue_reply','followup_open','followup_reschedule','followup_submit'];
        if(row.role==='viewer'||actions.some(type=>review.includes(type)&&!['owner','reviewer'].includes(row.role)||edit.includes(type)&&!['owner','editor'].includes(row.role)))
          fail('현재 계정 역할로 이 변경을 서버에 저장할 수 없습니다. 기기 판본을 만들지 않았습니다.');
        return true;
      },
      list:async()=>{
        const rows=await rpc('renewmap_list_tasks',{});
        if(!Array.isArray(rows)||rows.length>10000)fail('서버의 과업 목록 형식을 확인해 주세요.');
        const safe=rows.map(r=>{
          if(!r||!TASK.test(r.id||'')||typeof r.title!=='string'||!r.title.trim()||r.title.length>200||!STATES.includes(r.state)||!Number.isSafeInteger(r.revision)||r.revision<1||!HEX.test(r.head_hash||'')||!UUID.test(r.owner_id||'')||!ROLES.includes(r.role)||typeof r.updated_at!=='string'||!Number.isFinite(Date.parse(r.updated_at)))fail('서버의 과업 목록 형식을 확인해 주세요.');
          return {id:r.id,title:r.title,state:r.state,revision:r.revision,head_hash:r.head_hash,owner_id:r.owner_id,role:r.role,updated_at:r.updated_at};
        });
        for(const row of safe)shared(row.id);return safe;
      },
      get:async(id)=>{
        const epoch=authenticated();id=taskId(id);const backup=await rpc('renewmap_get_task',{task_id:id},epoch);
        const text=JSON.stringify(backup),checked=await B.read(text);authenticated(epoch);
        if(checked.manifest.id!==id)fail('요청한 과업과 서버 응답이 다릅니다.');shared(id);return JSON.parse(text);
      },
      member:async(id,memberId,role)=>{
        const epoch=authenticated();id=taskId(id);
        if(typeof memberId!=='string'||!UUID.test(memberId)||role!==null&&!['editor','reviewer','viewer'].includes(role))fail('구성원 계정 ID와 역할을 확인해 주세요.');
        return rpc('renewmap_task_member',{task_id:id,member_id:memberId,member_role:role},epoch);
      },
    };
    return api;
  }
  return {create};
});
