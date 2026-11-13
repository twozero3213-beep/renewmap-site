(function (root) {
  'use strict';
  const model = root.RenewSurveyChange;
  const originalName = '제출서식_원본.xlsx';
  const completedName = '제출서식_작성본.xlsx';
  const templateVersion = 'survey-change-template-v1';
  const isSurvey = file => file.template_version === model.VERSION || file.template_version === templateVersion;

  function mount({run, task, versions, attach, notify}) {
    const el = id => document.getElementById(id);
    const panel = el('surveyChanges');
    let ledger = null, loadedFor = null, selected = '', fieldId = '', references = [], images = new Map();
    const message = value => { el('changeMsg').textContent = value; };
    const controls = {
      requirement_id:'changeRequirement', subject:'changeSite', source:'changeSource', as_of:'changeCutoff',
      before:'changeBefore', observed_on:'changeObserved', after:'changeAfter', change:'changeKind',
      reason:'changeReason', form:'changeFormName', sheet:'changeSheet', slot:'changeCell', submit_text:'changeSubmitText',
    };

    function perform(fn) {
      return run(async () => {
        try { await fn(); notify(el('changeMsg').textContent || el('changeSummary').textContent); }
        catch (error) { message(error.message); throw error; }
      });
    }
    function showPhotos() {
      el('changePhotoList').textContent = references.length
        ? '연결된 사진 ' + references.length + '장 · ' + references.map(p => p.name).join(', ')
        : '연결된 사진 없음';
    }
    function pickRow(id) {
      const row = ledger?.rows.find(r => r.id === id);
      selected = row?.id || '';
      for (const [key, control] of Object.entries(controls)) {
        el(control).value = row?.[key] ?? (key === 'change' ? 'hold' : key === 'requirement_id' ? task()?.spec.requirements[0]?.id || '' : '');
      }
      fieldId = row?.field_id || '';
      el('changeRecord').value = fieldId;
      references = [...(row?.photos || [])];
      images.clear();
      el('changePhotos').value = '';
      el('changeBaselineFile').value = '';
      el('changeBaselineInfo').textContent = row?.baseline_file ? '연결한 원본: ' + row.baseline_file.name : '파일을 선택하면 해당 행의 출처와 함께 보관합니다.';
      el('changeTemplate').value = '';
      showPhotos();
    }
    async function readBlob(base, digest) {
      const entry = await root.FieldStore.doc('task-file:' + base.id + ':' + digest);
      if (!(entry?.blob instanceof Blob) || await root.RenewTasks.hash(await entry.blob.arrayBuffer()) !== digest)
        throw new Error('보관 파일이 없거나 지문이 달라 처리를 중단했습니다.');
      return entry.blob;
    }
    async function refresh() {
      const base = task(), keep = selected;
      if (base && loadedFor === base.hash) return;
      loadedFor = null;
      ledger = null;
      images.clear();
      references = [];
      el('changeForm').hidden = true;
      el('changeDownload').hidden = true;
      el('changeDownloadForm').hidden = true;
      el('changeSummary').textContent = base ? '기존 자료와 현장 결과를 대조하여 제출할 변경 사항을 행별로 저장하세요.' : '과업 계획을 먼저 저장하세요.';
      if (!base || !panel.open) return;
      const artifact = base.artifacts.find(a => isSurvey(a) && a.name === '조사변경근거.json');
      if (artifact) {
        const file = await readBlob(base, artifact.sha256);
        ledger = model.read(base, await file.text());
        const source = versions().find(r => r.hash === ledger.source_hash && r.revision === ledger.source_revision);
        const related = base.artifacts.filter(isSurvey);
        const hashes = new Set(related.map(a => a.sha256));
        const references = ledger.rows.flatMap(row => [...row.photos, ...(row.baseline_file ? [row.baseline_file] : [])]);
        if (!source || root.RenewTasks.canonical(source.spec) !== root.RenewTasks.canonical(ledger.spec) ||
          related.some(a => a.input_hash !== artifact.sha256) || references.some(ref => !hashes.has(ref.sha256)) ||
          !related.some(a => a.name === '조사변경근거.xlsx') || (ledger.template &&
          (!related.some(a => a.name === originalName && a.sha256 === ledger.template.sha256) ||
           !related.some(a => a.name === completedName)))) {
          ledger = null;
          throw new Error('근거표의 원본 과업·사진·서식 버전이 납품 이력과 다릅니다.');
        }
      }
      const rows = ledger?.rows || [];
      const held = rows.filter(r => r.change === 'hold').length;
      el('changeSummary').textContent = rows.length
        ? '저장한 변경 ' + rows.length + '건 · 보류 ' + held + '건. 행을 선택하면 자료와 제출 칸을 수정할 수 있습니다.'
        : '원자료와 현장에서 다른 점을 한 건씩 저장하세요.';
      el('changeDownload').hidden = !rows.length;
      el('changeDownloadForm').hidden = !ledger?.template;
      el('changeTemplateInfo').textContent = ledger?.template
        ? '보관한 원본: ' + ledger.template.name + ' · 다른 파일을 고르면 전체 행을 새 양식에 다시 기입합니다.'
        : '지정된 XLSX가 없으면 리뉴맵 근거표를 작성합니다.';
      el('changeRequirement').replaceChildren(...base.spec.requirements.map(r => new Option(r.title, r.id)));
      const records = await root.FieldStore.records();
      el('changeRecord').replaceChildren(new Option('기록 선택', ''), ...records.map(r =>
        new Option([r.recorded_at && root.RenewDocgen.localDate(r.recorded_at), r.target, r.pnu || r.jibun || r.id].filter(Boolean).join(' · '), r.id)));
      el('changePick').replaceChildren(new Option('새 조사 행', ''), ...rows.map(r =>
        new Option(model.labels[r.change] + ' · ' + r.subject, r.id)));
      el('changePick').value = rows.some(r => r.id === keep) ? keep : '';
      pickRow(el('changePick').value);
      el('changeForm').hidden = false;
      loadedFor = base.hash;
      message('');
    }
    async function reference(file, name, expected) {
      if (!(file instanceof Blob) || !file.size || file.size > root.TaskFiles.MAX)
        throw new Error('사진·원본 파일의 크기를 확인해 주세요. 각 파일은 20MB 이하여야 합니다.');
      const hash = await root.RenewTasks.hash(await file.arrayBuffer());
      if (expected && expected !== hash) throw new Error('현장에 보관한 사진과 기록의 지문이 다릅니다.');
      return {name, size:file.size, sha256:hash};
    }
    async function importRecord() {
      const record = (await root.FieldStore.records()).find(r => r.id === el('changeRecord').value);
      if (!record) throw new Error('가져올 현장 기록을 선택해 주세요.');
      const localImages = new Map(), photos = [];
      for (const [index, id] of (record.photos || []).entries()) {
        const blob = await root.FieldStore.photo(id);
        if (!record.photo_sha256?.[id]) throw new Error('기록에 사진 지문이 없습니다. 사진을 직접 확인한 뒤 추가해 주세요.');
        const info = await reference(blob, '현장사진-' + (index + 1) + '.jpg', record.photo_sha256[id]);
        if (!localImages.has(info.sha256)) { photos.push(info); localImages.set(info.sha256, blob); }
      }
      const date = new Date(record.recorded_at);
      if (!Number.isFinite(date.getTime())) throw new Error('현장 기록일을 확인해 주세요.');
      el('changeObserved').value = record.visit?.date || root.RenewDocgen.localDate(date);
      el('changeSite').value = record.pnu || record.jibun || record.facility?.name || record.target;
      el('changeAfter').value = [record.observed, record.memo, record.status].filter(Boolean).join(' · ');
      fieldId = record.id;
      references = photos;
      images = localImages;
      el('changePhotos').value = '';
      showPhotos();
      message('현장 기록을 불러왔습니다. 변경 구분과 사유를 확인하고 저장하세요.');
    }
    async function save() {
      const base = task();
      if (!base || loadedFor !== base.hash) throw new Error('과업 계획과 직전 근거표를 다시 불러오세요.');
      const fields = Object.fromEntries(Object.entries(controls).map(([key, id]) => [key, el(id).value.trim()]));
      fields.submit_text ||= model.labels[fields.change] + ' · ' + fields.after + ' · ' + fields.reason;
      const used = new Map(references.map(photo => [photo.sha256,photo]));
      for (const file of el('changePhotos').files) {
        const info = await reference(file, file.name);
        used.set(info.sha256,info);
        images.set(info.sha256,file);
      }
      const baselineUpload = el('changeBaselineFile').files[0];
      const oldRow = ledger?.rows.find(r => r.id === selected);
      const baseline = baselineUpload ? await reference(baselineUpload,baselineUpload.name) : oldRow?.baseline_file || null;
      const row = model.validateRow(base, {...fields,id:selected || crypto.randomUUID(),field_id:fieldId,
        photos:[...used.values()],baseline_file:baseline});
      const rows = (ledger?.rows || []).slice();
      const index = rows.findIndex(old => old.id === row.id);
      if (index < 0) rows.push(row); else rows[index] = row;
      const photos = new Map();
      for (const r of rows) for (const photo of r.photos) {
        if (!photos.has(photo.sha256)) photos.set(photo.sha256, {
          ...photo, blob:images.get(photo.sha256) || await readBlob(base,photo.sha256)
        });
      }
      const upload = el('changeTemplate').files[0];
      const template = upload ? await reference(upload,upload.name) : ledger?.template || null;
      const baselines = new Map();
      for (const item of rows) {
        const ref = item.baseline_file;
        if (ref && !baselines.has(ref.sha256)) {
          const blob = baselineUpload && baseline.sha256 === ref.sha256 ? baselineUpload : await readBlob(base,ref.sha256);
          baselines.set(ref.sha256,{...ref,blob});
        }
      }
      const packet = await model.build(base,rows,[...photos.values()],template,[...baselines.values()]);
      if (template) {
        const blob = upload || await readBlob(base,template.sha256);
        const bytes = await root.RenewSurveyTemplate.fill(new File([blob],template.name), packet.entries);
        const output = new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        for (const [name, file] of [[originalName,blob],[completedName,output]]) {
          const info = await reference(file,name);
          packet.files.push({...info,blob:file,input_hash:packet.inputHash,comparison_hash:null,
            template_version:templateVersion, blockers:packet.blockers});
        }
      }
      selected = row.id;
      await attach(base,packet.files);
      const status = rows.length + '건의 근거표와 연결 파일을 새 버전으로 저장했습니다.';
      message(status);
      notify(status);
    }
    async function download(name) {
      const base = task(), file = base?.artifacts.find(a => isSurvey(a) && a.name === name);
      if (!file) throw new Error('저장한 파일이 없습니다.');
      const blob = await readBlob(base,file.sha256);
      root.RenewDocgen.saveBytes(name,new Uint8Array(await blob.arrayBuffer()),blob.type);
      message(name + ' 파일을 받았습니다.');
    }
    panel.addEventListener('toggle', () => { if (panel.open) perform(refresh); });
    el('changePick').addEventListener('change', () => pickRow(el('changePick').value));
    el('changeImport').addEventListener('click', () => perform(importRecord));
    el('changeClearPhotos').addEventListener('click', () => {
      references = []; images.clear(); el('changePhotos').value = ''; showPhotos();
    });
    el('changeForm').addEventListener('submit', event => { event.preventDefault(); perform(save); });
    el('changeDownload').addEventListener('click', () => perform(() => download('조사변경근거.xlsx')));
    el('changeDownloadForm').addEventListener('click', () => perform(() => download(completedName)));
    return {refresh};
  }
  root.RenewSurveyChangeUI = {mount,isSurvey};
})(window);
