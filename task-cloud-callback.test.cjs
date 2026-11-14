const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'task-cloud-callback.js'),'utf8');
function run(hash){
 const calls=[],root={URLSearchParams,location:{hash,pathname:'/renewmap-site/tasks.html',search:'?id=synthetic'},history:{replaceState(...args){calls.push(args);}}};
 for(const name of ['localStorage','sessionStorage'])Object.defineProperty(root,name,{get(){throw Error('storage access');}});
 vm.runInNewContext(source,root);return{root,calls};
}
test('이메일 링크 토큰을 주소에서 먼저 지우고 한 번만 메모리로 넘긴다',()=>{
 const {root,calls}=run('#access_token=synthetic-access&refresh_token=synthetic-refresh&token_type=bearer&type=magiclink');
 assert.deepEqual(calls,[[null,'','/renewmap-site/tasks.html?id=synthetic']]);
 assert.deepEqual(JSON.parse(JSON.stringify(root.RenewTaskAuthCallback())),{access_token:'synthetic-access',refresh_token:'synthetic-refresh'});
 assert.equal(root.RenewTaskAuthCallback(),null);
});
test('오류·중복·비정상·지원하지 않는 링크도 주소에서 제거하고 원문은 넘기지 않는다',()=>{
 for(const hash of ['#error=synthetic-secret&error_description=synthetic-secret','#access_token=a&access_token=b&refresh_token=c&token_type=bearer&type=magiclink','#access_token=a&refresh_token=b&token_type=bearer&type=recovery','#access%5Ftoken=a&refresh_token=b','#access_token='+ 'x'.repeat(33000)]){
  const {root,calls}=run(hash);assert.equal(calls.length,1);assert.equal(JSON.stringify(root.RenewTaskAuthCallback()),'{"error":true}');
 }
});
test('일반 문서 앵커는 변경하지 않고 콜백 스크립트는 분석보다 먼저 동기로 실행한다',()=>{
 const {root,calls}=run('#taskWork');assert.equal(calls.length,0);assert.equal(root.RenewTaskAuthCallback,undefined);
 const html=fs.readFileSync(require('node:path').join(__dirname,'tasks.html'),'utf8');
 assert.ok(html.indexOf('frame-guard.js')<html.indexOf('task-cloud-callback.js'));
 assert.ok(html.indexOf('task-cloud-callback.js')<html.indexOf('site.js'));
 assert.match(html,/<script src="task-cloud-callback\.js[^\"]*"><\/script>/);
});
