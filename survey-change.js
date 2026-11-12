(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./tasks.js'), require('./docgen.js'));
  } else {
    root.RenewSurveyChange = factory(root.RenewTasks, root.RenewDocgen);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (tasks, docgen) {
  'use strict';
  const SCHEMA = 'renewmap-survey-change-v1';
  const VERSION = 'survey-change-v1';
  const LIMIT = 20 * 1024 * 1024;
  const labels = Object.freeze({add: '추가', exclude: '제외', hold: '보류'});
  const required = (ok, message) => { if (!ok) throw new Error(message); };

  function text(value, label, max = 2000, optional = false) {
    required(typeof value === 'string' && value.length <= max &&
      !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffe\uffff]/.test(value) &&
      (optional || value.trim()), label + ' 입력을 확인해 주세요.');
    return value.trim();
  }
  function id(value) {
    required(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value), '기록 식별자를 확인해 주세요.');
    return value;
  }
  function date(value, label) {
    const time = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? Date.parse(value + 'T00:00:00Z') : NaN;
    required(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value, label + ' 날짜를 확인해 주세요.');
    return value;
  }
  function sha(value) {
    required(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), '파일 SHA-256 지문을 확인해 주세요.');
    return value;
  }
  function fileMeta(item) {
    const name = text(item?.name, '파일 이름', 240);
    required(name !== '.' && name !== '..' && !/[\\/:<>"|?*\x00-\x1f]/.test(name), '파일 이름에 허용되지 않는 문자가 있습니다.');
    const meta = {name, sha256: sha(item.sha256)};
    if (item.size !== undefined) {
      required(Number.isSafeInteger(item.size) && item.size > 0 && item.size <= LIMIT, '파일 크기를 확인해 주세요.');
      meta.size = item.size;
    }
    return meta;
  }
  function validateRow(task, row) {
    required(row && typeof row.change === 'string' && Object.hasOwn(labels, row.change), '추가·제외·보류 중 하나를 선택해 주세요.');
    required(task?.spec?.requirements?.some(r => r.id === row.requirement_id), '현재 과업의 요구 항목을 지정해 주세요.');
    const sheet = text(row.sheet ?? '', '시트명', 31, true);
    let slot = text(row.slot, '제출서식 칸', 200);
    if (sheet) {
      required(!/[\\/*?:\[\]]/.test(sheet), '엑셀 시트 이름을 확인해 주세요.');
      const match = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/.exec(slot.toUpperCase());
      required(match && [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) <= 16384 &&
        Number(match[2]) <= 1048576, '제출서식 셀 주소를 확인해 주세요.');
      slot = match[1] + match[2];
    }
    required(Array.isArray(row.photos) && row.photos.length <= 8, '행별 사진은 8장까지 연결할 수 있습니다.');
    const photos = row.photos.map(fileMeta);
    required(row.change === 'hold' || photos.length, '추가·제외 행은 현장 사진을 한 장 이상 연결해 주세요.');
    required(new Set(photos.map(p => p.sha256)).size === photos.length, '같은 사진이 한 행에 중복되었습니다.');
    return {
      id: id(row.id), requirement_id: id(row.requirement_id), subject: text(row.subject, '조사 대상', 300),
      change: row.change, source: text(row.source, '기존 자료 출처'), baseline_file: row.baseline_file == null ? null : fileMeta(row.baseline_file),
      as_of: date(row.as_of, '기존 자료 기준일'),
      before: text(row.before, '기존 자료 내용'), observed_on: date(row.observed_on, '관찰·확인 시도일'),
      after: text(row.after, '현장 결과'), reason: text(row.reason, '변경·보류 사유'), field_id: text(row.field_id ?? '', '현장 기록 번호', 200, true),
      form: text(row.form, '제출서식명', 200), sheet, slot, submit_text: text(row.submit_text, '제출서식 기입문'), photos
    };
  }
  function ledgerFor(task, rows, template) {
    required(Array.isArray(rows) && rows.length > 0 && rows.length <= 500, '근거표에 조사 행을 1~500건 입력해 주세요.');
    required(Number.isSafeInteger(task?.revision) && task.revision > 0 && task.spec, '과업의 원본 버전을 확인해 주세요.');
    const meta = template == null ? null : fileMeta(template);
    if (meta) required(meta.size && /\.xlsx$/i.test(meta.name), '기관 제출서식 원본 XLSX를 확인해 주세요.');
    const normalized = rows.map(row => validateRow(task, row));
    required(new Set(normalized.map(r => r.id)).size === rows.length, '근거표에서 조사 행 번호가 중복되었습니다.');
    const cells = new Set();
    for (const row of normalized) {
      if (!row.sheet) {
        required(!meta, '원본 제출서식에 연결할 시트명과 셀 주소를 각 행에 입력해 주세요.');
        continue;
      }
      const key = row.sheet.toLowerCase() + '!' + row.slot;
      required(!cells.has(key), '두 행이 같은 제출서식 셀을 가리킵니다.');
      cells.add(key);
    }
    const spec = {title: text(task.spec.title, '과업명', 200), program: text(task.spec.program, '사업 유형', 200),
      guideline: text(task.spec.guideline, '지침 판본'), scope: text(task.spec.scope, '범위')};
    required(Array.isArray(task.spec.requirements) && task.spec.requirements.length <= 100, '과업 명세를 확인해 주세요.');
    spec.requirements = task.spec.requirements.map(r => ({
      id: id(r.id), title: text(r.title, '항목명', 200), source: text(r.source, '지침 근거'), unit: text(r.unit, '공간 단위', 200)
    }));
    return {schema: SCHEMA, task_id: id(task.id), source_revision: task.revision, source_hash: sha(task.hash), spec, template: meta, rows: normalized};
  }
  function read(task, value) {
    if (typeof value === 'string') {
      required(value.length <= LIMIT, '근거표 원본이 너무 큽니다.');
      value = JSON.parse(value);
    }
    required(value?.schema === SCHEMA && value.task_id === task?.id &&
      value.source_revision <= task.revision && (value.source_revision !== task.revision || value.source_hash === task.hash),
      '현재 과업의 근거표 원본이 아닙니다.');
    const ledger = ledgerFor({id: value.task_id, revision: value.source_revision, hash: value.source_hash, spec: value.spec},
      value.rows, value.template);
    required(tasks.canonical(ledger) === tasks.canonical(value), '근거표 원본의 형식이 달라졌습니다.');
    return ledger;
  }
  function sheets(ledger) {
    const specs = new Map(ledger.spec.requirements.map(r => [r.id, r]));
    const submission = [['조사 행', '과업', '지침 판본', '조사 범위', '요구 항목', '제출서식', '시트', '기입 칸', '기입문', '처리 상태']];
    const changes = [['조사 행', '조사 대상', '처리 상태', '기존 자료 출처', '자료 기준일', '기존 자료 내용', '관찰·확인 시도일', '현장 결과', '처리 사유', '현장 기록 번호', '공간 단위', '기존 자료 파일', '기존 자료 SHA-256', '납품 ZIP 안의 기준 자료']];
    const photos = [['조사 행', '조사 대상', '관찰·확인 시도일', '사진 이름', 'SHA-256', '납품 ZIP 안의 파일']];
    for (const r of ledger.rows) {
      const requirement = specs.get(r.requirement_id);
      submission.push([r.id, ledger.spec.title, ledger.spec.guideline, ledger.spec.scope, requirement.title, r.form, r.sheet, r.slot, r.submit_text, labels[r.change]]);
      changes.push([r.id, r.subject, labels[r.change], r.source, r.as_of, r.before, r.observed_on, r.after, r.reason, r.field_id, requirement.unit,
        r.baseline_file?.name, r.baseline_file?.sha256, r.baseline_file && 'files/' + r.baseline_file.sha256]);
      for (const p of r.photos) photos.push([r.id, r.subject, r.observed_on, p.name, p.sha256, 'files/' + p.sha256]);
    }
    return [
      {name:'제출서식 연결', rows:submission, widths:[20,24,32,26,22,26,20,18,55,12]},
      {name:'변경·보완 근거', rows:changes, widths:[20,25,12,40,15,34,18,34,48,24,16,30,68,72]},
      {name:'사진 대조', rows:photos, widths:[20,25,18,30,68,72]}
    ];
  }
  async function pictureExtension(blob) {
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
    if ([137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return 'png';
    if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8)) === 'WEBP') return 'webp';
    throw new Error('현장 사진은 JPEG·PNG·WebP 파일을 선택해 주세요.');
  }
  function linkedFiles(refs, supplied, label) {
    const wanted = new Set(refs.map(p => p.sha256));
    required(Array.isArray(supplied) && supplied.length <= 500, label + ' 원본 목록을 확인해 주세요.');
    const files = new Map();
    for (const file of supplied) {
      const meta = fileMeta(file);
      required(wanted.has(meta.sha256) && file.blob instanceof Blob && file.blob.size > 0 &&
        file.blob.size <= LIMIT && (meta.size === undefined || meta.size === file.blob.size), label + ' 원본을 확인해 주세요.');
      if (!files.has(meta.sha256)) files.set(meta.sha256, {name:meta.name, blob:file.blob});
      else required(files.get(meta.sha256).blob === file.blob, '같은 지문의 ' + label + ' 원본이 중복되었습니다.');
    }
    for (const ref of refs) {
      const file = files.get(ref.sha256);
      required(file && (ref.size === undefined || ref.size === file.blob.size), '행에 연결된 ' + label + ' 원본·크기가 다릅니다.');
    }
    return files;
  }
  async function build(task, rows, photos, template = null, baselines = []) {
    const ledger = ledgerFor(task, rows, template);
    const images = linkedFiles(ledger.rows.flatMap(r => r.photos), photos, '사진');
    const sourceFiles = linkedFiles(ledger.rows.map(r => r.baseline_file).filter(Boolean), baselines, '기준 자료');
    required(images.size + sourceFiles.size + (template ? 4 : 2) <= 100, '과업에 연결할 파일 수를 확인해 주세요.');
    const json = tasks.canonical(ledger);
    const raw = new Blob([json], {type:'application/json'});
    const files = [{name:'조사변경근거.json', blob:raw}];
    const when = ledger.rows.reduce((max, r) => r.observed_on > max ? r.observed_on : max, ledger.rows[0].observed_on);
    const xlsx = docgen.xlsxBytes(sheets(ledger), when + 'T00:00:00Z');
    files.push({name:'조사변경근거.xlsx', blob:new Blob([xlsx], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})});
    const total = [...files, ...images.values(), ...sourceFiles.values()].reduce((n, f) => n + f.blob.size, ledger.template?.size || 0);
    required(total <= LIMIT, '근거표와 원본 파일 합계는 20MB 이하여야 합니다.');
    for (const [hash, {blob}] of images) {
      const ext = await pictureExtension(blob);
      files.push({name:'조사사진_' + hash + '.' + ext, blob, expected:hash});
    }
    for (const [hash, {name,blob}] of sourceFiles) {
      files.push({name:'조사원본_' + hash + '_' + name.slice(-160), blob, expected:hash});
    }
    const holdCount = ledger.rows.filter(r => r.change === 'hold').length;
    const blockers = holdCount ? ['현장 확인 보류 ' + holdCount + '건'] : [];
    const inputHash = await tasks.hash(await raw.arrayBuffer());
    const artifacts = [];
    for (const {name, blob, expected} of files) {
      const digest = blob === raw ? inputHash : await tasks.hash(await blob.arrayBuffer());
      required(!expected || expected === digest, '연결 지문이 사진·기준 자료의 실제 파일과 다릅니다.');
      artifacts.push({name, blob, sha256:digest, size:blob.size, input_hash:inputHash,
        comparison_hash:null, template_version:VERSION, blockers:[...blockers]});
    }
    const entries = ledger.rows.filter(r => r.sheet).map(r => ({sheet:r.sheet, cell:r.slot, text:r.submit_text}));
    return {ledger, files:artifacts, inputHash, blockers, entries};
  }
  return {SCHEMA, VERSION, labels, validateRow, read, build};
});
