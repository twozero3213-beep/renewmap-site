const test=require('node:test');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const path=require('node:path');
const p=path.join(__dirname,'task-cloud-ui.js');
const UI=existsSync(p)?require(p):null;
test('서버 설정이 없으면 DOM·인증 클라이언트·네트워크에 접근하지 않는다',()=>{
 assert.ok(UI,'조건부 공동 보관 화면이 구현되어야 합니다');
 const old=globalThis.RenewTaskCloud;globalThis.RenewTaskCloud={create(){throw Error('must not create')}};
 try{for(const value of [undefined,null]){globalThis.RenewTaskCloudConfig=value;assert.equal(UI.mount({}),null);}}finally{delete globalThis.RenewTaskCloudConfig;if(old)globalThis.RenewTaskCloud=old;else delete globalThis.RenewTaskCloud;}
});
test('잘못된 서버 설정은 알리고 로컬 화면을 건드리지 않는다',()=>{
 assert.ok(UI,'조건부 공동 보관 화면이 구현되어야 합니다');
 const old=globalThis.RenewTaskCloud;globalThis.RenewTaskCloud={create(){throw Error('invalid config')}};globalThis.RenewTaskCloudConfig={url:'invalid'};const messages=[];
 try{assert.equal(UI.mount({notify:message=>messages.push(message)}),null);assert.equal(messages.length,1);}finally{delete globalThis.RenewTaskCloudConfig;if(old)globalThis.RenewTaskCloud=old;else delete globalThis.RenewTaskCloud;}
});

test('연결이 없는 환경도 전달받은 링크 토큰은 한 번 소비하고 전역 참조를 지운다',()=>{
 let consumed=0;globalThis.RenewTaskAuthCallback=()=>{consumed++;return {access_token:'synthetic-access',refresh_token:'synthetic-refresh'};};
 globalThis.RenewTaskCloudConfig=null;
 try{assert.equal(UI.mount({}),null);assert.equal(consumed,1);assert.equal(globalThis.RenewTaskAuthCallback,undefined);}
 finally{delete globalThis.RenewTaskCloudConfig;delete globalThis.RenewTaskAuthCallback;}
});
