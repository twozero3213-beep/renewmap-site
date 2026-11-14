(function(root){
  'use strict';
  // 분석 스크립트보다 먼저 주소의 인증 정보를 지우고 한 번만 메모리로 넘긴다.
  const hash=root.location.hash;
  const params=new URLSearchParams(hash.slice(1));
  if(!['access_token','refresh_token','error','error_code','error_description'].some(name=>params.has(name)))return;
  root.history.replaceState(null,'',root.location.pathname+root.location.search);
  let pending={error:true};
  if(hash.length<=32768){
    const single=name=>params.getAll(name).length===1;
    const valid=value=>typeof value==='string'&&value.length>0&&value.length<=8192&&!/[\x00-\x20\x7f]/.test(value);
    if(!['error','error_code','error_description'].some(name=>params.has(name))&&single('access_token')&&single('refresh_token')&&single('token_type')&&single('type')&&params.get('token_type')==='bearer'&&['magiclink','signup'].includes(params.get('type'))&&valid(params.get('access_token'))&&valid(params.get('refresh_token')))
      pending={access_token:params.get('access_token'),refresh_token:params.get('refresh_token')};
  }
  root.RenewTaskAuthCallback=()=>{const value=pending;pending=null;return value;};
})(globalThis);
