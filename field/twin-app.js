(function() {
  'use strict';
  const T=RenewTwin, R=FieldRecord, $=id=>document.getElementById(id);
  const base='https://cdn.jsdelivr.net/npm/cesium@1.134.0/Build/Cesium/';
  let state={schema:'renewmap-scene-v1',selection:'current',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()),phases:{},models:{},verifications:[]};
  let viewer=null, primitives={}, records=[], photoURLs=[], photoEpoch=0, dirty=false;
  const placeKeys=['longitude','latitude','height','heading','pitch','roll','scale'];
  const message=(s,error=false)=>{ $('message').textContent=s; $('message').classList.toggle('err',error); };
  function action(fn) {
    return async e=>{
      e?.preventDefault();
      const controls=[...document.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);
      controls.forEach(([el])=>el.disabled=true);
      try { await fn(e); } catch(err) { message(err.message,true); }
      finally { controls.forEach(([el,disabled])=>el.disabled=disabled); sync(); }
    };
  }
  function matrix(m) {
    const C=Cesium,p=m.placement;
    return C.Transforms.headingPitchRollToFixedFrame(C.Cartesian3.fromDegrees(p.longitude,p.latitude,p.height),new C.HeadingPitchRoll(...['heading','pitch','roll'].map(k=>C.Math.toRadians(p[k]))));
  }
  async function prepare(models) {
    if(!viewer) return {};
    const out={};
    try {
      for(const k of T.slots) if(models[k]) {
        const m=models[k];
        out[k]=await Cesium.Model.fromGltfAsync({url:m.data,modelMatrix:matrix(m),scale:m.placement.scale,show:false});
        out[k].errorEvent.addEventListener(err=>message(`모델 표시 오류: ${err.message}`,true));
      }
      return out;
    } catch(err) { Object.values(out).forEach(p=>p.destroy()); throw Error(`모델을 표시하지 못했습니다. GLB 내용을 확인하세요: ${err.message}`); }
  }
  // 2026-11-12: 화면을 바꿀 일이 있을 때만 다시 그린다(requestRenderMode, 아래 Viewer 설정 주석). 모델 표시·색을 바꾼 뒤 이것을 부른다
  const redraw=()=>{ if(viewer && !viewer.isDestroyed()) viewer.scene.requestRender(); };
  function install(next) {
    if(!viewer) return;
    for(const p of Object.values(primitives)) viewer.scene.primitives.remove(p);
    primitives=next;
    for(const p of Object.values(next)) { viewer.scene.primitives.add(p); p.readyEvent?.addEventListener(redraw); }
    redraw();
  }
  // 2026-11-12: 조감도·위에서 보기(회의 "조감도가 잘 보이게"). 지금 보던 방향은 두고 각도·거리만 바꾼다.
  // 거리는 모델 크기(경계 구 반지름)의 배수로 정해 작은 조형물도 큰 단지도 화면에 알맞게 들어오게 한다
  const VIEWS={bird:{pitch:-35,k:5,min:60},top:{pitch:-89,k:6,min:80}};
  function view(kind) {
    const p=primitives[state.selection] || primitives.current, v=VIEWS[kind];
    if(!p?.ready) return focus();
    viewer.camera.flyToBoundingSphere(p.boundingSphere,{duration:1,offset:new Cesium.HeadingPitchRange(viewer.camera.heading,Cesium.Math.toRadians(v.pitch),Math.max(v.min,p.boundingSphere.radius*v.k))});
  }
  function focus() {
    const p=primitives[state.selection] || primitives.current;
    if(p?.ready) viewer.camera.flyToBoundingSphere(p.boundingSphere,{duration:0,offset:new Cesium.HeadingPitchRange(0,-.5,Math.max(20,p.boundingSphere.radius*4))});
    else {
      if(p && !p.ready) { const remove=p.readyEvent.addEventListener(()=>{remove();focus();}); }
      const m=state.models[state.selection] || state.models.current;
      if(m && viewer) viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(m.placement.longitude,m.placement.latitude,m.placement.height+200),orientation:{heading:0,pitch:-Cesium.Math.PI_OVER_TWO,roll:0}});
    }
  }
  function sync() {
    $('date').value=state.date;
    const s=T.stage(state.date,state.phases), selected=state.models[state.selection];
    $('stage').textContent=`${state.date} / ${s}${s==='공사' ? ' (계획 모델을 반투명으로 표시)' : ''}${!selected ? ' / 선택한 안의 모델 없음' : ''}`;
    for(const k of T.slots) if(primitives[k]) {
      primitives[k].show=state.selection==='current' ? k==='current' : s==='단계 미입력' ? k===state.selection : s==='현재' ? k==='current' : s==='철거' ? false : k===state.selection;
      primitives[k].color=Cesium.Color.WHITE.withAlpha(s==='공사' && k!=='current' ? .45 : 1);
    }
    redraw();
    const planDates=Object.values(state.phases).filter(Boolean).sort();
    const before=planDates.length ? new Date(Date.parse(planDates[0])-86400000).toISOString().slice(0,10) : state.date;
    const dates=[before,...planDates,...Object.values(state.models).map(m=>m.reference_date),state.date].sort();
    const lo=Date.parse(dates[0]),hi=Date.parse(dates.at(-1));
    $('timeline').max=String((hi-lo)/86400000); $('timeline').value=String((Date.parse(state.date)-lo)/86400000);
    $('timeline').dataset.start=dates[0]; $('timeline').disabled=hi===lo;
    $('start').disabled=!!viewer;
    for(const k of ['focus','bird','top','rotate','zoom']) $(k).disabled=!viewer;
    const proofs=selected ? state.verifications.filter(v=>v.model_key===T.modelKey(selected)) : [];
    $('verificationInfo').textContent=`이 모델·배치에 대한 대조 ${proofs.length}건, 다른 판의 대조 ${state.verifications.length-proofs.length}건.\n최종검수 전입니다. 허용오차·측량 기준은 승인되지 않았습니다.${proofs.length ? `\n최근 치수 차이(모델−현장): ${proofs.at(-1).difference_m.toFixed(4)}m` : ''}`;
    $('recordLocation').disabled=!records.find(r=>r.id===$('record').value && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  }
  function fill() {
    const m=state.models[state.selection];
    $('modelFile').value='';
    for(const k of ['source','license','reference','origin','pnu','building_id']) $(k).value=m?.[k==='reference' ? 'reference_date' : k] || '';
    $('kind').value=m?.kind || (state.selection==='current' ? '현황 자료(미검수)' : '계획');
    for(const k of placeKeys) $(k).value=m?.placement[k] ?? (k==='scale' ? 1 : ['heading','pitch','roll'].includes(k) ? 0 : '');
    $('modelInfo').textContent=m ? `${m.name}\n${m.kind}, 자료 기준일 ${m.reference_date}\nSHA-256 ${m.sha256}` : `${state.selection==='current' ? '현재' : state.selection+'안'} 모델 없음`;
    document.querySelector(`input[name=view][value="${state.selection}"]`).checked=true;
    for(const k of ['demolition','construction','completion']) $(k).value=state.phases[k] || '';
    sync(); showRecord();
  }
  $('start').onclick=action(async()=>{
    message('3D 엔진을 불러오는 중입니다.');
    if(!window.Cesium) {
      window.CESIUM_BASE_URL=base;
      // R3 14: 판 1.134.0 고정 파일의 sha384(jsDelivr 공개 sha256과 대조함). 파일이 바뀌면 브라우저가 실행·적용을 거부한다. 판을 올리면 두 값도 다시 계산한다
      const SRI={'Cesium.js':'sha384-LLAEyo5IccCQlVs0GUoxBYQ8sdsLCY+lPmN474d/bnEMnG8GykMkaCrQCmBrnR9d','Widgets/widgets.css':'sha384-ghEeMdcWWzRv/BPeUcX835vcKDGrxvROXisl/Btpv3GeekBUXTSPVcFJpI1Tcrgp'};
      const css=document.createElement('link'); css.rel='stylesheet'; css.href=base+'Widgets/widgets.css'; css.integrity=SRI['Widgets/widgets.css']; css.crossOrigin='anonymous'; document.head.append(css);
      await new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=base+'Cesium.js'; s.integrity=SRI['Cesium.js']; s.crossOrigin='anonymous'; s.onload=resolve; s.onerror=()=>{s.remove();reject(Error('3D 엔진을 받지 못했습니다. 인터넷 연결을 확인하세요. 현장 기록·장면 파일은 계속 사용할 수 있습니다.'));}; document.head.append(s); });
    }
    Cesium.Ion.defaultAccessToken='';
    try {
      // 2026-11-12: requestRenderMode — 카메라·모델이 바뀔 때만 다시 그린다. 왜: 기본값은 가만히 있어도 1초에 60번 그려
      // 노트북이 뜨거워지고 다른 입력(날짜 막대·입력 칸)이 버벅였다(회의 "안 끊기게"). 바꾼 뒤에는 redraw()로 알린다
      viewer=new Cesium.Viewer('globe',{requestRenderMode:true,maximumRenderTimeChange:Infinity,baseLayer:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,animation:false,timeline:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,skyBox:false,terrainProvider:new Cesium.EllipsoidTerrainProvider()});
      const imagery=new Cesium.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/',maximumLevel:19,credit:new Cesium.Credit('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',true)});
      imagery.errorEvent.addEventListener(()=>message('배경 지도를 받지 못했습니다. 모델 파일은 유지됩니다. 인터넷 연결을 확인하세요.',true));
      viewer.imageryLayers.addImageryProvider(imagery);
      viewer.scene.globe.depthTestAgainstTerrain=true;
      viewer.scene.renderError.addEventListener(()=>message('3D 표시가 중단됐습니다. WebGL과 기기 메모리를 확인하세요. 장면 파일을 먼저 보관해 주세요.',true));
      viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(129.0756,35.1796,40000)});
      viewer.screenSpaceEventHandler.setInputAction(click=>{
        const pos=viewer.camera.pickEllipsoid(click.position,viewer.scene.globe.ellipsoid);
        if(!pos) return;
        const c=Cesium.Cartographic.fromCartesian(pos);
        $('longitude').value=Cesium.Math.toDegrees(c.longitude).toFixed(8); $('latitude').value=Cesium.Math.toDegrees(c.latitude).toFixed(8);
        message('지도에서 경도·위도를 골랐습니다. 원점 고도를 입력하고 배치를 반영하세요.');
      },Cesium.ScreenSpaceEventType.LEFT_CLICK);
      install(await prepare(state.models));
      if(state.camera) viewer.camera.setView({destination:Cesium.Cartesian3.fromArray(state.camera.position),orientation:{direction:Cesium.Cartesian3.fromArray(state.camera.direction),up:Cesium.Cartesian3.fromArray(state.camera.up)}});
      else focus();
      message('3D 지도를 열었습니다. 지형·주변 건물은 미제공이며 모델 배치는 미검수입니다.');
    } catch(err) {
      if(viewer && !viewer.isDestroyed()) viewer.destroy(); viewer=null; primitives={}; $('globe').replaceChildren();
      throw Error(`3D 지도를 열지 못했습니다. 장면 파일과 현장 기록은 계속 쓸 수 있습니다. ${err.message}`);
    }
  });
  $('modelForm').onsubmit=action(async()=>{
    const old=state.models[state.selection], file=$('modelFile').files[0];
    if(!file && !old) throw Error('GLB 파일을 골라 주세요.');
    const m={...old,placement:Object.fromEntries(placeKeys.map(k=>[k,$(k).value]))};
    for(const k of ['source','license','kind','origin','pnu','building_id']) m[k]=$(k).value;
    m.reference_date=$('reference').value;
    if(state.selection!=='current' && m.kind!=='계획') throw Error('A안·B안은 계획 자료로 구분해 주세요.');
    if(state.selection==='current' && m.kind==='계획') throw Error('계획 모델은 A안이나 B안에 넣어 주세요.');
    if(file) {
      if(file.size>T.LIMIT) throw Error('GLB는 모델당 20MB까지 받습니다.');
      const bytes=new Uint8Array(await file.arrayBuffer()); T.checkGLB(bytes);
      m.name=file.name; m.sha256=R.sha256Hex(bytes);
      m.data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve('data:model/gltf-binary;base64,'+String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('모델 파일을 읽지 못했습니다.'));reader.readAsDataURL(file);});
    }
    const clean=T.model(m), models={...state.models,[state.selection]:clean}, next=await prepare(models);
    state.models=models; install(next); dirty=true; fill(); focus(); message('배치를 반영했습니다. 장면 파일을 받아 보관해 주세요.');
  });
  for(const el of document.querySelectorAll('input[name=view]')) el.onchange=()=>{state.selection=el.value;dirty=true;fill();};
  $('phases').onsubmit=action(()=>{state.phases=T.phases(Object.fromEntries(['demolition','construction','completion'].map(k=>[k,$(k).value])));dirty=true;message('사람이 입력한 계획 일정을 반영했습니다.');});
  $('date').onchange=()=>{try{state.date=T.day($('date').value);dirty=true;sync();}catch(err){message(err.message,true);$('date').value=state.date;}};
  $('timeline').oninput=()=>{state.date=new Date(Date.parse($('timeline').dataset.start)+Number($('timeline').value)*86400000).toISOString().slice(0,10);dirty=true;sync();};
  $('focus').onclick=focus;
  $('bird').onclick=()=>view('bird');
  $('top').onclick=()=>view('top');
  $('rotate').onclick=()=>{
    const p=primitives[state.selection] || primitives.current;
    if(p?.ready) viewer.camera.flyToBoundingSphere(p.boundingSphere,{duration:0,offset:new Cesium.HeadingPitchRange(viewer.camera.heading+Cesium.Math.toRadians(15),viewer.camera.pitch,Cesium.Cartesian3.distance(viewer.camera.position,p.boundingSphere.center))});
  };
  $('zoom').onclick=()=>viewer.camera.zoomIn(Math.max(1,viewer.camera.positionCartographic.height/4));
  $('export').onclick=action(()=>{
    if(viewer) state.camera=Object.fromEntries(['position','direction','up'].map(k=>[k,['x','y','z'].map(c=>viewer.camera[k][c])]));
    const blob=new Blob([JSON.stringify(T.scene(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`리뉴맵_3D4D_${state.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);dirty=false;message('장면 파일을 만들었습니다. 다운로드 완료를 확인해 주세요.');
  });
  $('import').onchange=action(async()=>{
    const f=$('import').files[0]; if(!f) return;
    if(f.size>85*1024*1024) throw Error('장면 파일은 85MB까지 받습니다.');
    const next=T.scene(JSON.parse(await f.text()));
    if(dirty && !confirm('현재 화면에 보관하지 않은 입력이 있습니다. 선택한 장면 파일로 바꿀까요?')) return;
    const models=await prepare(next.models); state=next; install(models);dirty=false;fill();
    if(viewer && state.camera) viewer.camera.setView({destination:Cesium.Cartesian3.fromArray(state.camera.position),orientation:{direction:Cesium.Cartesian3.fromArray(state.camera.direction),up:Cesium.Cartesian3.fromArray(state.camera.up)}}); else focus();
    message('장면 파일을 열었습니다. 가져온 현장 대조도 최종검수 전입니다.');
  });
  async function showRecord() {
    const epoch=++photoEpoch,r=records.find(x=>x.id===$('record').value),m=state.models[state.selection];
    photoURLs.forEach(u=>URL.revokeObjectURL(u));photoURLs=[];$('photos').replaceChildren();
    $('recordInfo').textContent=r ? `${r.recorded_at}\n${r.jibun || r.pnu || '지번 미확인'} / ${r.status}\n${m ? T.recordMatch(m,r) : '모델 없음'}\nGPS 정확도: ${r.accuracy_m ?? '미확인'}m. 사진은 기기 안에서만 읽습니다.` : '현장 기록을 선택하세요.';
    sync();
    if(!r) return;
    try {
      for(const id of (r.photos || []).slice(0,R.MAX_PHOTOS)) {
        const blob=await FieldStore.photo(id); if(epoch!==photoEpoch) return;
        if(blob instanceof Blob && blob.type==='image/jpeg') {const url=URL.createObjectURL(blob),img=document.createElement('img');photoURLs.push(url);img.src=url;img.alt=`${r.recorded_at} 현장 기록 사진`; $('photos').append(img);}
      }
    } catch(err) { message(`현장 사진을 읽지 못했습니다: ${err.message}`,true); }
  }
  $('recordsRefresh').onclick=action(async()=>{
    records=await FieldStore.records();$('record').replaceChildren(new Option(records.length ? '기록 선택' : '이 기기에 현장 기록 없음',''));
    for(const r of records) $('record').add(new Option(`${r.recorded_at} / ${r.jibun || r.pnu || '지번 미확인'}`,r.id));
    await showRecord();message(`현장 기록 ${records.length}건을 읽었습니다.`);
  });
  $('record').onchange=showRecord;
  $('recordLocation').onclick=()=>{const r=records.find(x=>x.id===$('record').value);if(r){$('longitude').value=r.lng;$('latitude').value=r.lat;message('GPS를 배치 입력에 옮겼습니다. 건물 원점·고도·위치 오차를 별도로 확인하세요.');}};
  $('verification').onsubmit=action(async()=>{
    const m=state.models[state.selection],r=records.find(x=>x.id===$('record').value);
    if(!m || !r || T.recordMatch(m,r)==='대응 미확인') throw Error('모델과 같은 PNU의 현장 기록을 선택하세요. 특정 건물 대응은 별도로 확인해야 합니다.');
    const v=Object.fromEntries(['reference_m','model_m','basis','checker'].map(k=>[k,$(k).value]));
    v.record_id=r.id;v.photo_sha256=[];
    for(const id of (r.photos || [])) {
      const blob=await FieldStore.photo(id);
      if(!(blob instanceof Blob) || blob.type!=='image/jpeg' || R.sha256Hex(new Uint8Array(await blob.arrayBuffer()))!==r.photo_sha256?.[id]) throw Error('현장 사진 파일과 기록의 해시를 대조하지 못했습니다. 원본 기록을 확인하세요.');
      v.photo_sha256.push(r.photo_sha256[id]);
    }
    state.verifications.push(T.verification(m,v));dirty=true;message('현장 대조 기록을 추가했습니다. 허용오차 판정과 최종검수는 별도입니다.');
  });
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  fill();
})();
