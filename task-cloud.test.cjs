const test=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const path=require('node:path');
const p=path.join(__dirname,'task-cloud.js');
const C=existsSync(p)?require(p):null;
const T=require('./tasks.js'),B=require('./tasks-files.js');
const config={url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_synthetic_test_only'};
const uid='11111111-1111-4111-8111-111111111111',email='synthetic@example.test';
const session=(n='one')=>({access_token:'synthetic-access-'+n,refresh_token:'synthetic-refresh-'+n,user:{id:uid,email}});
const response=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function api(){assert.ok(C,'클라우드 연결 모듈이 구현되어야 합니다');return C;}
function client(handler){const calls=[];const c=api().create(config,{fetch:async(url,opts)=>{calls.push({url,opts});return handler(url,opts,calls.length);}});return{c,calls};}
async function login(c){await c.verifyCode(email,'123456');}
async function backup(){const a=await T.create({title:'테스트 과업',program:'사업',guideline:'2027 공식 지침',scope:'행정동 전체',requirements:[{id:'r1',title:'인구',source:'공식표',unit:'동'}]},{id:'cloud-test',actor:'시험',at:'2026-11-12T00:00:00.000Z'});return JSON.parse(JSON.stringify(await B.make([a],[])));}

test('미설정 연결은 비활성이고 어떤 동작도 외부 요청을 보내지 않는다',async()=>{
 let calls=0;for(const cfg of [undefined,null,{}]){const c=api().create(cfg,{fetch:async()=>{calls++;throw Error('request')}});assert.equal(c.available(),false);assert.equal(c.user(),null);for(const fn of [()=>c.requestCode(email),()=>c.verifyCode(email,'123456'),()=>c.list(),()=>c.get('id'),()=>c.sync({}),()=>c.member('id',uid,'viewer')])await assert.rejects(fn());await c.logout();}assert.equal(calls,0);
});
test('다른 호스트·경로·비HTTPS·서비스 키와 부분 설정은 거절한다',()=>{
 const c=api();for(const url of ['http://abcdefghijklmnopqrst.supabase.co','https://supabase.co','https://abcdefghijklmnopqrst.supabase.co.evil.test','https://evil.test','https://name@abcdefghijklmnopqrst.supabase.co','https://abcdefghijklmnopqrst.supabase.co/path','https://abcdefghijklmnopqrst.supabase.co?key=x','https://abcdefghijklmnopqrst.supabase.co:444'])assert.throws(()=>c.create({...config,url}));
 for(const publishableKey of ['sb_secret_synthetic','service_role','eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.synthetic','sb_publishable_a\r\nInjected: header'])assert.throws(()=>c.create({...config,publishableKey}));
 assert.throws(()=>c.create({url:config.url}));
});
test('로그인 전 RPC와 잘못된 이메일·코드는 요청 전에 거절한다',async()=>{
 const {c,calls}=client(()=>response({}));for(const fn of [()=>c.list(),()=>c.get('id'),()=>c.sync({}),()=>c.member('id',uid,'viewer'),()=>c.requestCode('not-email'),()=>c.verifyCode(email,'x')])await assert.rejects(fn());assert.equal(calls.length,0);
});
test('여러 @가 있는 이메일은 서버에 보내지 않는다',async()=>{
 const {c,calls}=client(()=>response({}));await assert.rejects(c.requestCode('a@b@c.test'));assert.equal(calls.length,0);
});

test('붙여 넣은 이메일과 코드의 바깥 공백은 정리하고 내부 공백·제어문자는 거절한다',async()=>{
 const {c,calls}=client(url=>response(url.endsWith('/verify')?session():{}));
 await c.requestCode('  SYNTHETIC@EXAMPLE.TEST  ');assert.equal(JSON.parse(calls[0].opts.body).email,email);
 await c.verifyCode(' SYNTHETIC@EXAMPLE.TEST ',' 123456 ');assert.equal(c.user().email,email);
 for(const bad of ['synthetic @example.test','synthetic@example.test\n','a\t@example.test'])await assert.rejects(c.requestCode(bad));
 assert.equal(calls.length,2);
});

test('잘못되거나 만료된 코드와 메일 재요청 오류는 안전하고 구체적인 다음 행동을 안내한다',async()=>{
 for(const status of [400,401,403,422]){
  const {c}=client(()=>response({message:'synthetic-private-token '+email},status));
  await assert.rejects(c.verifyCode(email,'123456'),error=>error.message.includes('가장 최근')&&!error.message.includes(email)&&!error.message.includes('synthetic-private'));
  assert.equal(c.user(),null);
 }
 const limited=client(()=>response({message:'synthetic-private-token'},429));
 await assert.rejects(limited.c.requestCode(email),error=>error.message.includes('잠시 뒤')&&!error.message.includes('synthetic-private'));
 const unavailable=client(()=>response({message:'synthetic-private-token'},500));
 await assert.rejects(unavailable.c.requestCode(email),error=>error.message.includes('메일')&&!error.message.includes('synthetic-private'));
});
test('OTP는 공식 POST 몸체를 사용하고 토큰 없는 인증 응답은 실패한다',async()=>{
 const {c,calls}=client(url=>response(url.endsWith('/otp')?{}:{}));await c.requestCode(email);
 assert.equal(calls[0].url,config.url+'/auth/v1/otp');assert.deepEqual(JSON.parse(calls[0].opts.body),{email,create_user:true});assert.equal(calls[0].opts.headers.apikey,config.publishableKey);assert.equal(calls[0].opts.headers.Authorization,undefined);
 await assert.rejects(c.verifyCode(email,'123456'));assert.equal(c.user(),null);
});
test('인증 성공은 id·이메일만 반환하며 RPC에만 사용자 토큰을 전달한다',async()=>{
 const {c,calls}=client(url=>response(url.endsWith('/verify')?session():[]));
 assert.deepEqual(await c.verifyCode(email,'123456'),{id:uid,email});
 assert.deepEqual(JSON.parse(calls[0].opts.body),{email,token:'123456',type:'email'});
 const u=c.user();u.email='changed';assert.equal(c.user().email,email);assert.equal(c.session,undefined);
 await c.list();const r=calls[1];assert.equal(r.url,config.url+'/rest/v1/rpc/renewmap_list_tasks');assert.equal(r.opts.headers.Authorization,'Bearer synthetic-access-one');assert.equal(r.opts.headers.apikey,config.publishableKey);assert.equal(r.opts.credentials,'omit');assert.equal(r.opts.redirect,'error');assert.equal(r.opts.referrerPolicy,'no-referrer');assert.ok(!r.url.includes(email));
});
test('잘못된 OTP·401·5xx·네트워크 오류 본문에 담긴 비밀을 노출하지 않는다',async()=>{
 for(const status of [400,401,403,429,500]){const {c}=client(()=>response({message:'synthetic-secret-token '+email},status));await assert.rejects(c.verifyCode(email,'123456'),e=>!e.message.includes('synthetic-secret')&&!e.message.includes(email));assert.equal(c.user(),null);}
 const {c}=client(()=>{throw Error('synthetic-secret-token '+email)});await assert.rejects(c.requestCode(email),e=>!e.message.includes(email)&&!e.message.includes('synthetic-secret'));
});
test('빈·비JSON·잘못된 사용자 인증 응답을 성공으로 만들지 않는다',async()=>{
 for(const value of [{},null,{...session(),access_token:''},{...session(),refresh_token:''},{...session(),user:{id:uid,email:'other@example.test'}}]){const {c}=client(()=>response(value));await assert.rejects(c.verifyCode(email,'123456'));assert.equal(c.user(),null);}
 const {c}=client(()=>new Response('html',{status:200,headers:{'Content-Type':'text/html'}}));await assert.rejects(c.verifyCode(email,'123456'));
});
test('변조된 백업은 sync 요청을 전송하기 전에 거절한다',async()=>{
 const {c,calls}=client(()=>response(session()));await login(c);const b=await backup();b.manifest.history[0].state='approved';await assert.rejects(c.sync(b));assert.equal(calls.length,1);
});
test('sync는 검증한 백업과 해시 제외 정렬 본문·파일 목록을 보낸다',async()=>{
 const {c,calls}=client(url=>response(url.endsWith('/verify')?session():{id:'cloud-test',revision:1}));await login(c);const b=await backup();await c.sync(b);
 const q=calls[1],body=JSON.parse(q.opts.body),{hash,...record}=b.manifest.history[0];
 assert.equal(q.url,config.url+'/rest/v1/rpc/renewmap_sync_task');assert.deepEqual(body.backup,b);assert.deepEqual(body.canonical_history,[T.canonical(record)]);assert.deepEqual(body.canonical_artifacts,[T.canonical([])]);
});
test('get도 서버 백업의 파일 바이트와 이력을 검증한 뒤 반환한다',async()=>{
 const b=await backup(),{c,calls}=client(url=>response(url.endsWith('/verify')?session():b));await login(c);assert.deepEqual(await c.get('cloud-test'),b);assert.deepEqual(JSON.parse(calls[1].opts.body),{task_id:'cloud-test'});
 b.manifest.history[0].state='approved';await assert.rejects(c.get('cloud-test'));
});
test('권한 변경은 정해진 역할·UUID와 RPC 몸체만 보낸다',async()=>{
 const {c,calls}=client(url=>response(url.endsWith('/verify')?session():{ok:true}));await login(c);await c.member('cloud-test',uid,'viewer');assert.deepEqual(JSON.parse(calls[1].opts.body),{task_id:'cloud-test',member_id:uid,member_role:'viewer'});
 await c.member('cloud-test',uid,null);assert.equal(JSON.parse(calls[2].opts.body).member_role,null);await assert.rejects(c.member('cloud-test',uid,'service_role'));await assert.rejects(c.member('../x',uid,'viewer'));assert.equal(calls.length,3);
});
test('401은 메모리 refresh로 한 번만 재시도하며 계속 실패하면 세션을 지운다',async()=>{
 let refresh=0,rpcs=0;const {c}=client(url=>{if(url.endsWith('/verify'))return response(session());if(url.includes('/token?')){refresh++;return response(session('two'));}rpcs++;return response({},401);});await login(c);await assert.rejects(c.list());assert.equal(refresh,1);assert.equal(rpcs,2);assert.equal(c.user(),null);
});
test('refresh가 성공하면 새 토큰을 쓰고 다른 계정의 refresh 응답은 거절한다',async()=>{
 let rpcs=0;const {c,calls}=client(url=>url.endsWith('/verify')?response(session()):url.includes('/token?')?response(session('two')):response(++rpcs===1?{}:[],rpcs===1?401:200));await login(c);assert.deepEqual(await c.list(),[]);assert.deepEqual(JSON.parse(calls[2].opts.body),{refresh_token:'synthetic-refresh-one'});assert.equal(calls[3].opts.headers.Authorization,'Bearer synthetic-access-two');
 const x=client(url=>url.endsWith('/verify')?response(session()):url.includes('/token?')?response({...session('two'),user:{id:'22222222-2222-4222-8222-222222222222',email}}):response({},401));await login(x.c);await assert.rejects(x.c.list());assert.equal(x.c.user(),null);
});
test('logout 실패도 메모리 토큰을 즉시 폐기하고 다음 RPC를 막는다',async()=>{
 const {c,calls}=client(url=>response(url.endsWith('/verify')?session():{},url.includes('/logout')?500:200));await login(c);await assert.rejects(c.logout());assert.equal(c.user(),null);await assert.rejects(c.list());assert.equal(calls.length,2);assert.equal(calls[1].url,config.url+'/auth/v1/logout?scope=local');
});
test('로그아웃 중 도착한 이전 인증 응답은 세션을 되살리지 않는다',async()=>{
 let finish;const {c}=client(()=>new Promise(resolve=>{finish=resolve}));const pending=c.verifyCode(email,'123456');await Promise.resolve();await c.logout();finish(response(session()));await assert.rejects(pending);assert.equal(c.user(),null);
});
test('동시에 만료된 요청은 refresh를 공유하고 각 요청은 한 번만 재시도한다',async()=>{
 let refreshes=0;const {c,calls}=client((url,opts)=>{if(url.endsWith('/verify'))return response(session());if(url.includes('/token?')){refreshes++;return response(session('two'));}return opts.headers.Authorization==='Bearer synthetic-access-one'?response({},401):response([]);});await login(c);assert.deepEqual(await Promise.all([c.list(),c.list()]),[[],[]]);assert.equal(refreshes,1);assert.equal(calls.filter(q=>q.url.endsWith('renewmap_list_tasks')).length,4);
});
test('로그아웃 뒤 도착한 이전 계정 RPC 결과는 화면에 넘기지 않는다',async()=>{
 let finish;const {c}=client(url=>url.endsWith('/verify')?response(session()):url.includes('/logout')?response(null,204):new Promise(resolve=>{finish=resolve}));await login(c);const pending=c.list();await Promise.resolve();await c.logout();finish(response([]));await assert.rejects(pending);assert.equal(c.user(),null);
});
test('로그인·로그아웃은 브라우저 저장소에 접근하지 않는다',async()=>{
 const old=new Map();for(const key of ['localStorage','sessionStorage']){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,get(){throw Error('storage access forbidden')}});}
 try{const {c}=client(url=>url.endsWith('/verify')?response(session()):response(null,204));await login(c);await c.logout();assert.equal(c.user(),null);}finally{for(const [key,descriptor]of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
test('파일 바이트를 바꾼 유효한 이력의 백업도 sync 전에 거절한다',async()=>{
 const b=await backup(),a=b.manifest.history[0],bytes=new TextEncoder().encode('abc'),sha=await T.hash(bytes),next=await T.revise(a,{type:'attach',payload:{artifacts:[{name:'file.txt',sha256:sha,size:3,input_hash:null,comparison_hash:null,template_version:null,blockers:[]}]}},{actor:'시험',at:'2026-11-12T01:00:00.000Z'});
 const packet=JSON.parse(JSON.stringify(await B.make([a,next],[{name:'file.txt',sha256:sha,blob:new Blob([bytes])}])));packet.files[0].base64='YmFk';
 const {c,calls}=client(()=>response(session()));await login(c);await assert.rejects(c.sync(packet));assert.equal(calls.length,1);
});
test('백업 검증 도중 호출자 입력이 바뀌어도 전송할 사본은 바뀌지 않는다',async()=>{
 const {c,calls}=client(url=>response(url.endsWith('/verify')?session():{ok:true}));await login(c);const b=await backup(),pending=c.sync(b);b.manifest.history[0].state='approved';await pending;assert.equal(JSON.parse(calls[1].opts.body).backup.manifest.history[0].state,'planned');
});

test('이메일 링크는 서버 GET 사용자 검증 후 명시 수락 전까지 로그인되지 않는다',async()=>{
 const {c,calls}=client(()=>response({id:uid,email}));
 assert.deepEqual(await c.prepareLink(session()),{id:uid,email});assert.equal(c.user(),null);
 assert.equal(calls[0].url,config.url+'/auth/v1/user');assert.equal(calls[0].opts.method,'GET');assert.equal(calls[0].opts.body,undefined);
 assert.equal(calls[0].opts.headers.Authorization,'Bearer synthetic-access-one');
 await assert.rejects(c.list());assert.equal(calls.length,1);
 assert.deepEqual(c.acceptLink(),{id:uid,email});assert.throws(()=>c.acceptLink());
});
test('조작한 링크 사용자·서버 오류를 JWT 자체 정보나 원문 오류로 대체하지 않는다',async()=>{
 for(const bad of [{id:'invalid',email},{id:uid,email:'invalid'},{}]){
  const {c}=client(()=>response(bad));await assert.rejects(c.prepareLink(session()));assert.throws(()=>c.acceptLink());assert.equal(c.user(),null);
 }
 const {c}=client(()=>response({message:'synthetic-secret'},401));
 await assert.rejects(c.prepareLink(session()),error=>!error.message.includes('synthetic-secret'));assert.throws(()=>c.acceptLink());
});
test('링크 확인 취소·로그아웃·다른 코드 인증은 이전 링크의 세션 채택을 막는다',async()=>{
 const {c}=client(url=>response(url.endsWith('/user')?{id:uid,email}:session('two')));
 await c.prepareLink(session());c.discardLink();assert.throws(()=>c.acceptLink());
 await c.prepareLink(session());await c.logout();assert.throws(()=>c.acceptLink());
 await c.prepareLink(session());await login(c);assert.throws(()=>c.acceptLink());assert.equal(c.user().email,email);
 let finish;const delayed=client(()=>new Promise(resolve=>{finish=resolve;}));const pending=delayed.c.prepareLink(session());
 delayed.c.discardLink();finish(response({id:uid,email}));await assert.rejects(pending);assert.throws(()=>delayed.c.acceptLink());
});
test('링크에서 확인한 계정도 만료 시 같은 계정의 refresh만 사용한다',async()=>{
 let rpcs=0;const {c,calls}=client(url=>url.endsWith('/user')?response({id:uid,email}):url.includes('/token?')?response(session('two')):response(++rpcs===1?{}:[],rpcs===1?401:200));
 await c.prepareLink(session());c.acceptLink();await c.list();
 assert.equal(calls.at(-1).opts.headers.Authorization,'Bearer synthetic-access-two');
});
const remoteRow=role=>({id:'cloud-test',title:'합성 공유 과업',state:'ready',revision:1,head_hash:'a'.repeat(64),owner_id:uid,role,updated_at:'2026-11-14T00:00:00.000Z'});
test('공유 과업의 현재 역할로 저장할 수 없는 행동은 기기판 생성 전에 거절한다',async()=>{
 for(const role of ['owner','editor','reviewer','viewer']){
  const {c}=client(url=>response(url.endsWith('/verify')?session():[remoteRow(role)]));await login(c);
  for(const action of ['attach','issue_open','issue_reply','issue_resolve','followup_open','followup_reschedule','followup_submit','followup_verify']){
   const allowed=role==='owner'||role==='editor'&&!['issue_resolve','followup_verify'].includes(action)||role==='reviewer'&&['attach','issue_open','issue_resolve','followup_verify'].includes(action);
   if(allowed)assert.equal(await c.assertCanChange('cloud-test',[action]),true);else await assert.rejects(c.assertCanChange('cloud-test',[action]));
  }
 }
});
test('한 번 확인한 공유 과업은 로그아웃·권한 회수·네트워크 실패 때 수정하지 않는다',async()=>{
 let rows=[remoteRow('editor')],offline=false;
 const {c}=client(url=>{if(url.endsWith('/verify'))return response(session());if(url.includes('/logout'))return response(null,204);if(offline)throw Error('offline');return response(rows);});
 await login(c);await c.assertCanChange('cloud-test',['issue_reply']);rows=[];await assert.rejects(c.assertCanChange('cloud-test',['issue_reply']));
 offline=true;await assert.rejects(c.assertCanChange('new-task',['attach']));offline=false;
 await c.logout();await assert.rejects(c.assertCanChange('cloud-test',['issue_reply']));assert.equal(await c.assertCanChange('new-task',['attach']),true);
});

test('새 세션에 공유 과업 ID만 전달해도 로그인 전 분기 변경을 막는다',async()=>{
 const remembered=[],first=api().create(config,{onShared:id=>remembered.push(id),fetch:async url=>response(url.endsWith('/verify')?session():[remoteRow('editor')])});
 await login(first);await first.list();assert.deepEqual(remembered,['cloud-test']);
 const next=api().create(config,{knownTaskIds:remembered,fetch:async()=>{throw Error('must not request');}});
 await assert.rejects(next.assertCanChange('cloud-test',['issue_reply']));assert.equal(await next.assertCanChange('local-only',['attach']),true);
 assert.equal(next.user(),null);
 const unreadable=api().create(config,{requireAuthentication:true});await assert.rejects(unreadable.assertCanChange('local-only',['attach']));
});
