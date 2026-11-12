// 버전은 add만 한다. 최신 포인터는 같은 트랜잭션에서 비교 후 갱신한다.
(function (root) {
  'use strict';
  const T=typeof module==='object' && module.exports?require('./tasks.js'):root.RenewTasks;
  const NAME='renewmap-tasks', VERSION=1;
  let opening=null;
  const snapshot=value=>JSON.parse(T.canonical(value));
  function freeze(value) { if(value && typeof value==='object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function db() {
    if(!opening) opening=new Promise((resolve,reject)=>{
      if(!root.indexedDB) { reject(new Error('이 환경에서는 IndexedDB 과업 저장소를 사용할 수 없습니다.')); return; }
      const q=root.indexedDB.open(NAME,VERSION);
      q.onupgradeneeded=()=>{
        const d=q.result;
        if(!d.objectStoreNames.contains('revisions')) d.createObjectStore('revisions',{keyPath:['id','revision']}).createIndex('by_task','id');
        if(!d.objectStoreNames.contains('heads')) d.createObjectStore('heads',{keyPath:'id'});
      };
      q.onsuccess=()=>{ const d=q.result; d.onversionchange=()=>{ d.close(); opening=null; }; resolve(d); };
      q.onerror=()=>reject(q.error || new Error('과업 저장소를 열지 못했습니다.'));
      q.onblocked=()=>reject(new Error('다른 창에서 과업 저장소를 사용 중입니다. 다른 창을 닫고 다시 시도해 주세요.'));
    }).catch(error=>{ opening=null; throw error; });
    return opening;
  }
  async function read(store, query) {
    const d=await db();
    return new Promise((resolve,reject)=>{
      const t=d.transaction([store],'readonly'), q=query(t.objectStore(store));
      t.oncomplete=()=>resolve(q.result);
      t.onerror=t.onabort=()=>reject(t.error || new Error('과업 저장소를 읽지 못했습니다.'));
    });
  }
  async function history(id) {
    if(typeof id!=='string' || !id) throw new Error('과업 ID가 필요합니다.');
    const rows=await read('revisions',s=>s.index('by_task').getAll(id));
    return rows.sort((a,b)=>a.revision-b.revision).map(freeze);
  }
  async function write(candidate,records,expected,restore) {
    const d=await db();
    return new Promise((resolve,reject)=>{
      const t=d.transaction(['heads','revisions'],'readwrite'), heads=t.objectStore('heads'), revisions=t.objectStore('revisions');
      let failure=null;
      const stop=message=>{ failure=new Error(message); t.abort(); };
      t.oncomplete=()=>resolve(freeze(candidate));
      t.onerror=t.onabort=()=>reject(failure || t.error || new Error('과업 저장에 실패했습니다.'));
      const q=heads.get(candidate.id);
      q.onsuccess=()=>{
        const head=q.result;
        if(restore) {
          if(head) {
            if(head.hash===candidate.hash && head.revision===candidate.revision) return;
            stop('같은 ID의 다른 과업 이력이 있습니다. 기존 기록은 덮어쓰지 않습니다.'); return;
          }
        } else if((head?head.hash:null)!==expected || candidate.previous_hash!==expected || candidate.revision!==(head?head.revision+1:1)) {
          stop('다른 창에서 과업이 변경되었습니다. 최신 이력을 다시 불러오세요.'); return;
        }
        try {
          for(const record of records) revisions.add(record);
          if(restore || !head) heads.add(candidate); else heads.put(candidate);
        } catch(error) { failure=error; t.abort(); }
      };
    });
  }
  const api={
    list:async()=> (await read('heads',s=>s.getAll())).sort((a,b)=>b.at.localeCompare(a.at)).map(freeze),
    history,
    append:async(record,expectedPreviousHash)=>{
      if(expectedPreviousHash!==null && (typeof expectedPreviousHash!=='string' || !/^[a-f0-9]{64}$/.test(expectedPreviousHash))) throw new Error('이전 버전 지문을 명시해 주세요.');
      const candidate=snapshot(record), h=await history(candidate.id);
      await T.verify([...h,candidate]);
      return write(candidate,[candidate],expectedPreviousHash,false);
    },
    restore:async(historyValue)=>{
      const h=snapshot(historyValue); await T.verify(h);
      return write(h[h.length-1],h,null,true);
    },
  };
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.TaskStore=api;
})(typeof window!=='undefined'?window:globalThis);
