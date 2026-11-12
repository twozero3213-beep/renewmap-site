/* 과업에 저장된 변경표의 정확한 판을 읽어 최초 조사와 재방문을 연결한다. */
(function (root) {
  "use strict";
  const M = root.RenewRevisitReport;
  const originalName = "실적서식_원본.xlsx",
    completedName = "실적서식_작성본.xlsx";
  const templateVersion = "revisit-template-v1";
  const isRevisit = (file) =>
    file.template_version === M.VERSION ||
    file.template_version === templateVersion;
  const conditions = ["area", "start", "end", "weather", "method", "context"];
  const $ = (id) => document.getElementById(id);
  const conditionEl = (side, key) =>
    $("rv" + side + key[0].toUpperCase() + key.slice(1));
  const canonical = (value) => root.RenewTasks.canonical(value);

  function mount({ run, task, versions, attach, notify }) {
    let loadedFor = "",
      selected = "",
      report = null,
      firstSurvey = null,
      pickedSha = "",
      afterField = "",
      fromRecord = null;
    let savedPhotos = [],
      newBlobs = new Map(),
      records = [],
      sources = new Map();
    const panel = $("revisitReport");
    const msg = (text) => {
      $("rvMsg").textContent = text;
    };
    const perform = (fn) =>
      run(async () => {
        try {
          await fn();
          notify($("rvMsg").textContent || $("rvSummary").textContent);
        } catch (e) {
          msg(e.message);
          throw e;
        }
      });
    function stage(name) {
      for (const section of panel.querySelectorAll("[data-rv-section]"))
        section.hidden = section.dataset.rvSection !== name;
      for (const button of panel.querySelectorAll("[data-rv-stage]")) {
        if (button.dataset.rvStage === name)
          button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      }
    }
    for (const button of panel.querySelectorAll("[data-rv-stage]"))
      button.addEventListener("click", () => stage(button.dataset.rvStage));
    $("rvEditor").addEventListener(
      "invalid",
      (e) => {
        const section = e.target.closest("[data-rv-section]");
        if (section) stage(section.dataset.rvSection);
      },
      true,
    );
    async function blobFor(base, hash) {
      const entry = await root.FieldStore.doc(
        "task-file:" + base.id + ":" + hash,
      );
      if (
        !(entry?.blob instanceof Blob) ||
        (await root.RenewTasks.hash(await entry.blob.arrayBuffer())) !== hash
      )
        throw new Error("연결 파일이 없거나 원래 지문과 다릅니다.");
      return entry.blob;
    }
    async function meta(blob, name, expected) {
      if (
        !(blob instanceof Blob) ||
        !blob.size ||
        blob.size > root.TaskFiles.MAX
      )
        throw new Error("20MB 이하의 비어 있지 않은 파일을 선택하세요.");
      const sha256 = await root.RenewTasks.hash(await blob.arrayBuffer());
      if (expected && expected !== sha256)
        throw new Error("현장 사진의 실제 바이트가 기록 지문과 다릅니다.");
      return { name, sha256, size: blob.size };
    }
    function sourceRow() {
      return firstSurvey?.rows.find((r) => r.id === $("rvRow").value);
    }
    function editRow() {
      return report?.rows.find((r) => r.id === selected);
    }
    function firstRecord(row) {
      return records.find((r) => r.id === row?.field_id);
    }
    function showPhotos() {
      $("rvPhotoList").textContent = savedPhotos.length
        ? "재방문 사진 " +
          savedPhotos.length +
          "장 · " +
          savedPhotos.map((p) => p.name).join(", ")
        : "연결된 재방문 사진 없음";
    }
    function siteMatches(before, record) {
      if (!before || !record || record.id === before.field_id) return false;
      if (before.field_id) {
        const native = firstRecord(before);
        const site = native?.site_id || before.field_id;
        return record.site_id
          ? record.site_id === site
          : record.visit_previous_id === before.field_id;
      }
      // 최초 변경표에 조사 기록 식별자가 없는 수기 자료는 지번·필지번호가 일치할 때만 가져온다.
      return [record.pnu, record.jibun].some(
        (value) => typeof value === "string" && value.trim() === before.subject,
      );
    }
    function dateOf(record) {
      if (record.visit?.date) return record.visit.date;
      const d = new Date(record.recorded_at);
      if (!Number.isFinite(d.getTime()))
        throw new Error("현장 기록의 조사일을 확인하세요.");
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
      }).format(d);
    }
    function applyConditions(side, values = {}, fixed = false) {
      for (const key of conditions) {
        const el = conditionEl(side, key);
        el.value = values?.[key] || "";
        el.readOnly = fixed && !!values?.[key];
      }
    }
    function getConditions(side) {
      return Object.fromEntries(
        conditions.map((key) => [key, conditionEl(side, key).value.trim()]),
      );
    }
    function clearAfter() {
      afterField = "";
      savedPhotos = [];
      newBlobs.clear();
      for (const id of [
        "rvCompletion",
        "rvDate",
        "rvResult",
        "rvReason",
        "rvPhotos",
        "rvSheet",
        "rvCell",
        "rvText",
        "rvTemplate",
        "rvRecord",
      ])
        $(id).value = "";
      $("rvFormName").value = "준공 후 실적보고서";
      $("rvSameSite").checked = false;
      applyConditions("After");
      showPhotos();
    }
    function setFirst(row, edit = null) {
      const native = firstRecord(row),
        visit = native?.visit;
      const fromField = edit
        ? edit.initial_conditions_source === "field_record"
        : !!(
            visit &&
            dateOf(native) === row.observed_on &&
            conditions.some((k) => visit[k])
          );
      const values = edit?.initial_conditions || (fromField ? visit : {});
      applyConditions("Before", values, fromField);
      fromRecord = fromField ? getConditions("Before") : null;
      $("rvConditionSource").textContent = fromField
        ? "최초 현장 기록의 값은 고정됩니다. 빈 칸을 원자료로 보완하면 작성자 기재로 저장됩니다."
        : "최초 조건은 원자료를 확인해 보완하세요. 확인할 수 없는 조건은 비워 두세요.";
      $("rvInitial").textContent = row
        ? [
            row.subject + " · 최초 조사일 " + row.observed_on,
            "관찰 결과: " + row.after,
            "변경 사유: " + row.reason,
            "최초 사진 " +
              row.photos.length +
              "장" +
              (row.photos.length
                ? " · " + row.photos.map((p) => p.name).join(", ")
                : ""),
          ].join("\n")
        : "연결할 조사 행이 없습니다.";
    }
    async function loadSurvey(base, sha) {
      const info = sources.get(sha);
      if (!info)
        throw new Error("최초 변경표를 현재 과업 이력에서 찾을 수 없습니다.");
      if (!info.ledger) {
        info.blob = await blobFor(base, sha);
        info.ledger = root.RenewSurveyChange.read(base, await info.blob.text());
        const origin = versions().find(
          (v) =>
            v.hash === info.ledger.source_hash &&
            v.revision === info.ledger.source_revision,
        );
        if (!origin || canonical(origin.spec) !== canonical(info.ledger.spec))
          throw new Error("최초 변경표의 판본과 과업이 일치하지 않습니다.");
      }
      return info;
    }
    async function chooseSurvey(base, sha, rowId) {
      firstSurvey = (await loadSurvey(base, sha)).ledger;
      pickedSha = sha;
      $("rvSource").value = sha;
      $("rvRow").replaceChildren(
        ...firstSurvey.rows.map(
          (r) => new Option(r.subject + " · " + r.observed_on, r.id),
        ),
      );
      if (rowId) $("rvRow").value = rowId;
    }
    async function chooseVisit(base, id) {
      selected = id || "";
      const row = editRow();
      clearAfter();
      $("rvRepairPanel").hidden = !row;
      $("rvRepairBase").checked = false;
      $("rvComparison").hidden = !row;
      $("rvComparison").textContent = row
        ? [row.comparison.status, ...row.comparison.reasons].join(" · ")
        : "";
      await chooseSurvey(
        base,
        row?.survey_sha256 || sources.keys().next().value,
        row?.survey_row_id,
      );
      setFirst(sourceRow(), row);
      if (row) {
        for (const [key, field] of Object.entries({
          completed_on: "rvCompletion",
          observed_on: "rvDate",
          result: "rvResult",
          reason: "rvReason",
          form: "rvFormName",
          sheet: "rvSheet",
          slot: "rvCell",
          submit_text: "rvText",
        }))
          $(field).value = row[key] || "";
        applyConditions("After", row.revisit_conditions);
        afterField = row.field_id || "";
        $("rvRecord").value = afterField;
        savedPhotos = [...row.photos];
        $("rvSameSite").checked = true;
        showPhotos();
      }
      $("rvPick").value = selected;
      $("rvTemplateInfo").textContent = report?.template
        ? "저장한 실적서식 원본: " + report.template.name
        : "기관 원본을 선택하면 시트와 빈 셀에 기입합니다.";
    }
    async function evidence(base, rows) {
      const docs = new Map(),
        photos = new Map();
      for (const row of rows) {
        const source = await loadSurvey(base, row.survey_sha256);
        docs.set(row.survey_sha256, {
          sha256: row.survey_sha256,
          blob: source.blob,
        });
        const initial = source.ledger.rows.find(
          (r) => r.id === row.survey_row_id,
        );
        if (!initial)
          throw new Error("최초 조사 행과 해당 버전이 연결되지 않습니다.");
        for (const photo of [...initial.photos, ...row.photos]) {
          if (!photos.has(photo.sha256))
            photos.set(photo.sha256, {
              ...photo,
              blob:
                newBlobs.get(photo.sha256) ||
                (await blobFor(base, photo.sha256)),
            });
        }
      }
      return { docs: [...docs.values()], photos: [...photos.values()] };
    }
    async function refresh() {
      const base = task();
      if (base?.hash === loadedFor) return;
      loadedFor = "";
      report = null;
      firstSurvey = null;
      sources = new Map();
      newBlobs.clear();
      $("rvEditor").hidden = true;
      $("rvComparison").hidden = true;
      $("rvDownload").hidden = true;
      $("rvDownloadForm").hidden = true;
      $("rvSummary").textContent = base
        ? "먼저 조사 변경·보완 근거표에 최초 조사 행을 저장하세요."
        : "과업 계획을 먼저 저장하세요.";
      if (!base || !panel.open) return;
      for (const version of versions()) {
        if (canonical(version.spec) !== canonical(base.spec)) continue;
        for (const a of version.artifacts) {
          if (
            a.template_version === root.RenewSurveyChange.VERSION &&
            a.name === "조사변경근거.json" &&
            a.sha256 === a.input_hash &&
            !sources.has(a.sha256)
          )
            sources.set(a.sha256, { revision: version.revision });
        }
      }
      if (!sources.size) return;
      const family = base.artifacts.filter(isRevisit),
        art = family.find((a) => a.name === "재방문대조.json");
      if (family.length && !art)
        throw new Error("재방문 원장 파일이 없습니다.");
      if (art) {
        const blob = await blobFor(base, art.sha256);
        report = M.read(base, await blob.text());
        if (
          !family.some((a) => a.name === "재방문실적보고서.xlsx") ||
          family.some((a) => a.input_hash !== art.sha256) ||
          (report.template &&
            (!family.some(
              (a) =>
                a.name === originalName && a.sha256 === report.template.sha256,
            ) ||
              !family.some((a) => a.name === completedName)))
        )
          throw new Error("실적보고서와 재방문 근거 파일의 판본이 다릅니다.");
        const refs = await evidence(base, report.rows);
        await M.verify(base, report, refs.docs, refs.photos, versions());
      }
      records = await root.FieldStore.records();
      $("rvSource").replaceChildren(
        ...[...sources.entries()].map(
          ([id, item]) =>
            new Option("과업 v" + item.revision + " · " + id.slice(0, 10), id),
        ),
      );
      $("rvRecord").replaceChildren(
        new Option("기록 선택", ""),
        ...records.map(
          (r) =>
            new Option(
              [
                r.visit?.date || String(r.recorded_at || "").slice(0, 10),
                r.jibun || r.pnu || r.target || r.id,
              ]
                .filter(Boolean)
                .join(" · "),
              r.id,
            ),
        ),
      );
      $("rvPick").replaceChildren(
        new Option("새 재방문", ""),
        ...(report?.rows || []).map(
          (r) => new Option(r.initial.subject + " · " + r.observed_on, r.id),
        ),
      );
      if (!report?.rows.some((r) => r.id === selected)) selected = "";
      await chooseVisit(base, selected);
      loadedFor = base.hash;
      $("rvSummary").textContent = report
        ? "저장한 재방문 " +
          report.rows.length +
          "건. 같은 지점의 최초 기록과 준공 후 결과를 대조합니다."
        : "최초 조사 행을 선택해 같은 지점의 준공 후 관찰을 기록하세요.";
      $("rvEditor").hidden = false;
      $("rvDownload").hidden = !report;
      $("rvDownloadForm").hidden = !report?.template;
      msg("");
    }
    async function importRecord() {
      const record = records.find((r) => r.id === $("rvRecord").value);
      if (!record) throw new Error("가져올 재방문 기록을 선택하세요.");
      if (!siteMatches(sourceRow(), record))
        throw new Error(
          "최초 조사와 같은 지점으로 확인된 현장 기록을 선택하세요.",
        );
      const date = dateOf(record),
        refs = [],
        blobs = new Map();
      for (const [i, id] of (record.photos || []).entries()) {
        const expected = record.photo_sha256?.[id];
        if (!expected) throw new Error("재방문 사진에 확인된 지문이 없습니다.");
        const blob = await root.FieldStore.photo(id);
        refs.push(await meta(blob, "재방문-" + (i + 1) + ".jpg", expected));
        blobs.set(expected, blob);
      }
      if (!refs.length)
        throw new Error(
          "기록에 재방문 사진이 없습니다. 사진을 직접 선택하세요.",
        );
      $("rvDate").value = date;
      $("rvResult").value = [record.observed, record.memo, record.status]
        .filter(Boolean)
        .join(" · ");
      applyConditions("After", record.visit);
      savedPhotos = refs;
      newBlobs = blobs;
      afterField = record.id;
      $("rvPhotos").value = "";
      $("rvSameSite").checked = false;
      showPhotos();
      msg("재방문 기록을 불러왔습니다. 지점과 관찰 내용을 확인해 주세요.");
    }
    async function save() {
      const base = task(),
        initial = sourceRow();
      if (!base || loadedFor !== base.hash || !initial)
        throw new Error("최초 조사와 과업을 다시 불러오세요.");
      if (!$("rvSameSite").checked)
        throw new Error("최초 조사와 같은 관찰 지점인지 확인해 주세요.");
      const uploaded = [...$("rvPhotos").files];
      let photos = savedPhotos.slice();
      if (uploaded.length) {
        photos = [];
        afterField = "";
        for (const file of uploaded) {
          const ref = await meta(file, file.name);
          photos.push(ref);
          newBlobs.set(ref.sha256, file);
        }
      }
      const result = $("rvResult").value.trim(),
        reason = $("rvReason").value.trim();
      const beforeConditions = getConditions("Before");
      const row = {
        id: selected || crypto.randomUUID(),
        survey_sha256: $("rvSource").value,
        survey_row_id: initial.id,
        site_key: initial.id,
        completed_on: $("rvCompletion").value,
        observed_on: $("rvDate").value,
        initial_conditions: beforeConditions,
        initial_conditions_source:
          fromRecord && canonical(beforeConditions) === canonical(fromRecord)
            ? "field_record"
            : "user_transcribed",
        revisit_conditions: getConditions("After"),
        result,
        reason,
        photos,
        field_id: afterField,
        form: $("rvFormName").value.trim(),
        sheet: $("rvSheet").value.trim(),
        slot: $("rvCell").value.trim(),
        submit_text:
          $("rvText").value.trim() ||
          [
            initial.subject,
            initial.observed_on + " " + initial.after,
            $("rvDate").value + " " + result,
            reason,
          ].join(" · "),
      };
      const rows = [...(report?.rows || [])];
      const index = rows.findIndex((r) => r.id === row.id);
      if (index < 0) rows.push(row);
      else rows[index] = row;
      const refs = await evidence(base, rows),
        upload = $("rvTemplate").files[0];
      const template = upload
        ? await meta(upload, upload.name)
        : report?.template || null;
      const packet = await M.build(
        base,
        rows,
        refs.docs,
        refs.photos,
        versions(),
        template,
      );
      const xlsx = packet.files.find((f) => f.name === "재방문실적보고서.xlsx");
      xlsx.blob = await root.RenewRevisitPhotos.embed(
        xlsx.blob,
        packet.photoPairs,
      );
      Object.assign(xlsx, await meta(xlsx.blob, xlsx.name));
      if (template) {
        const original = upload || (await blobFor(base, template.sha256));
        const data = await root.RenewSurveyTemplate.fill(
          new File([original], template.name),
          packet.entries,
        );
        const output = new Blob([data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        for (const [name, blob] of [
          [originalName, original],
          [completedName, output],
        ]) {
          const info = await meta(blob, name);
          packet.files.push({
            ...info,
            blob,
            input_hash: packet.inputHash,
            comparison_hash: null,
            template_version: templateVersion,
            blockers: packet.blockers,
          });
        }
      }
      selected = row.id;
      await attach(base, packet.files);
      msg(
        "재방문 " +
          rows.length +
          "건을 전후 사진과 함께 실적보고서에 저장했습니다.",
      );
    }
    async function download(name) {
      const base = task(),
        art = base?.artifacts.find((a) => isRevisit(a) && a.name === name);
      if (!art) throw new Error("저장한 실적보고서가 없습니다.");
      const blob = await blobFor(base, art.sha256);
      root.RenewDocgen.saveBytes(
        name,
        new Uint8Array(await blob.arrayBuffer()),
        blob.type,
      );
      msg(name + " 파일을 받았습니다.");
    }
    panel.addEventListener("toggle", () => {
      if (panel.open) perform(refresh);
    });
    $("rvPick").addEventListener("change", () =>
      perform(async () => {
        await chooseVisit(task(), $("rvPick").value);
        stage("Before");
      }),
    );
    $("rvSource").addEventListener("change", () =>
      perform(async () => {
        const edit = editRow();
        if (edit) {
          const sha = $("rvSource").value;
          try {
            if (!$("rvRepairBase").checked)
              throw new Error(
                "최초 조사 판을 바꾸려면 보완판 교체를 선택하세요.",
              );
            const source = await loadSurvey(task(), sha);
            const fixed = source.ledger.rows.find(
              (r) => r.id === edit.survey_row_id,
            );
            if (
              source.revision <= sources.get(edit.survey_sha256).revision ||
              !fixed ||
              fixed.subject !== edit.initial.subject ||
              fixed.requirement_id !== edit.initial.requirement_id
            )
              throw new Error(
                "같은 조사 행·대상·요구 항목이 있는 후속 보완판을 선택하세요.",
              );
            await chooseSurvey(task(), sha, fixed.id);
            setFirst(fixed);
            $("rvSameSite").checked = false;
            $("rvComparison").hidden = true;
            msg(
              "보완판의 최초 조사일 " +
                fixed.observed_on +
                "과 사진 " +
                fixed.photos.length +
                "장을 확인하세요. 재방문과 비교할 조건을 확인한 뒤 저장하세요.",
            );
          } catch (error) {
            $("rvSource").value = pickedSha;
            throw error;
          }
          return;
        }
        clearAfter();
        await chooseSurvey(task(), $("rvSource").value);
        setFirst(sourceRow());
      }),
    );
    $("rvRepairBase").addEventListener("change", () =>
      perform(async () => {
        const edit = editRow();
        if (
          edit &&
          !$("rvRepairBase").checked &&
          pickedSha !== edit.survey_sha256
        ) {
          await chooseSurvey(task(), edit.survey_sha256, edit.survey_row_id);
          setFirst(sourceRow(), edit);
          $("rvSameSite").checked = false;
          msg("저장했던 최초 조사 판으로 되돌렸습니다.");
        }
      }),
    );
    $("rvRow").addEventListener("change", () => {
      const edit = editRow();
      if (edit) {
        $("rvRow").value = edit.survey_row_id;
        msg("저장된 재방문의 최초 조사 행은 고정됩니다.");
        return;
      }
      clearAfter();
      setFirst(sourceRow());
    });
    for (const input of [
      $("rvDate"),
      $("rvResult"),
      ...conditions.map((k) => conditionEl("After", k)),
    ])
      input.addEventListener("input", () => {
        if (afterField) {
          afterField = "";
          $("rvRecord").value = "";
        }
      });
    $("rvImport").addEventListener("click", () => perform(importRecord));
    $("rvEditor").addEventListener("submit", (e) => {
      e.preventDefault();
      const invalid = [...e.currentTarget.elements].find(
        (control) => control.willValidate && !control.validity.valid,
      );
      if (invalid) {
        const section = invalid.closest("[data-rv-section]");
        if (section) stage(section.dataset.rvSection);
        invalid.reportValidity();
        return;
      }
      perform(save);
    });
    $("rvDownload").addEventListener("click", () =>
      perform(() => download("재방문실적보고서.xlsx")),
    );
    $("rvDownloadForm").addEventListener("click", () =>
      perform(() => download(completedName)),
    );
    return { refresh };
  }
  root.RenewRevisitUI = { mount, isRevisit };
})(window);
