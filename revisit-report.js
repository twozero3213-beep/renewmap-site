(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./tasks.js"),
      require("./survey-change.js"),
      require("./docgen.js"),
      require("./field/evidence.js"),
    );
  } else {
    root.RenewRevisitReport = factory(
      root.RenewTasks,
      root.RenewSurveyChange,
      root.RenewDocgen,
      root.FieldEvidence,
    );
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (tasks, survey, docgen, evidence) {
    "use strict";
    const VERSION = "revisit-report-v1",
      SCHEMA = "renewmap-revisit-report-v1";
    const MAX = 20 * 1024 * 1024;
    const conditionLabels = {
      area: "관찰 구간",
      start: "시작 시각",
      end: "종료 시각",
      weather: "날씨",
      method: "관찰 방식",
      context: "특이사항",
    };
    const same = (a, b) => tasks.canonical(a) === tasks.canonical(b);
    const digest = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
    function requireValue(ok, message) {
      if (!ok) throw new Error(message);
    }

    function conditions(data) {
      const out = {};
      for (const [key, label] of Object.entries(conditionLabels)) {
        const value = data?.[key] ?? "";
        requireValue(
          typeof value === "string" &&
            value.length <= 500 &&
            !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffe\uffff]/.test(value),
          label + " 기록을 확인해 주세요.",
        );
        out[key] = /^(미확인|미상|미기록|모름|불명|알 수 없음)$/.test(
          value.trim(),
        )
          ? ""
          : value.trim();
      }
      for (const key of ["start", "end"])
        requireValue(
          !out[key] || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(out[key]),
          "관찰 시각은 24시간제 HH:MM으로 입력해 주세요.",
        );
      requireValue(
        !out.start || !out.end || out.start < out.end,
        "종료 시각은 시작 시각 이후여야 합니다.",
      );
      return out;
    }

    async function checkedLedger(task, inputs, sources, history, template) {
      requireValue(
        Array.isArray(inputs) && inputs.length && inputs.length <= 500,
        "재방문 행은 1~500건이어야 합니다.",
      );
      const rows = JSON.parse(tasks.canonical(inputs));
      const hashes = new Set(rows.map((r) => r.survey_sha256));
      requireValue(
        Array.isArray(sources) && sources.length === hashes.size,
        "참조하는 최초 조사 변경표 원본을 확인해 주세요.",
      );
      const sourceFiles = new Map();
      let size = 0;
      requireValue(
        same(history.at(-1), task),
        "현재 과업과 검증한 이력이 다릅니다.",
      );
      for (const item of sources) {
        const hash = item?.sha256,
          blob = item?.blob;
        requireValue(
          hashes.has(hash) &&
            digest(hash) &&
            !sourceFiles.has(hash) &&
            blob instanceof Blob &&
            blob.size > 0,
          "최초 조사 원본 또는 지문이 올바르지 않습니다.",
        );
        size += blob.size;
        requireValue(
          size <= MAX && (await tasks.hash(await blob.arrayBuffer())) === hash,
          "최초 조사 원본의 크기 또는 지문이 다릅니다.",
        );
        const carrier = history.find((version) =>
          version.artifacts.some(
            (a) =>
              a.name === "조사변경근거.json" &&
              a.template_version === survey.VERSION &&
              a.input_hash === hash &&
              a.sha256 === hash &&
              a.size === blob.size,
          ),
        );
        requireValue(
          carrier,
          "이 과업의 납품 이력에서 최초 조사 원본을 찾을 수 없습니다.",
        );
        const ledger = survey.read(carrier, await blob.text());
        const first = history[ledger.source_revision - 1];
        requireValue(
          first &&
            first.hash === ledger.source_hash &&
            same(first.spec, ledger.spec) &&
            first.revision < carrier.revision,
          "최초 조사 변경표의 과업 명세 또는 원본 버전이 다릅니다.",
        );
        sourceFiles.set(hash, { ledger, carrier });
      }
      if (template != null) {
        requireValue(
          typeof template.name === "string" &&
            template.name.length <= 240 &&
            /\.xlsx$/i.test(template.name) &&
            !/[\\/:"<>|?*\x00-\x1f]/.test(template.name) &&
            digest(template.sha256) &&
            Number.isSafeInteger(template.size) &&
            template.size > 0 &&
            template.size <= MAX,
          "기관 실적보고서 원본 파일을 확인해 주세요.",
        );
        template = {
          name: template.name,
          sha256: template.sha256,
          size: template.size,
        };
      }
      const ids = new Set(),
        cells = new Set();
      const normalized = rows.map((input) => {
        const { ledger, carrier } = sourceFiles.get(input.survey_sha256);
        const first = ledger.rows.find((r) => r.id === input.survey_row_id);
        requireValue(
          first && input.site_key === first.id,
          "최초 조사 행과 같은 지점인지 확인해 주세요.",
        );
        requireValue(!ids.has(input.id), "재방문 행 번호가 중복되었습니다.");
        ids.add(input.id);
        // 조사 대상·항목·원본 필드는 최초 납품 파일에서 가져오고, 날짜·사진·서식 칸의 입력 규칙은 변경표와 공유한다.
        const post = survey.validateRow(
          { spec: ledger.spec },
          {
            ...first,
            id: input.id,
            change: "add",
            as_of: input.completed_on,
            observed_on: input.observed_on,
            after: input.result,
            reason: input.reason,
            photos: input.photos,
            field_id: input.field_id || "",
            form: input.form,
            sheet: input.sheet,
            slot: input.slot,
            submit_text: input.submit_text,
          },
        );
        requireValue(
          first.observed_on <= post.as_of && post.as_of <= post.observed_on,
          "최초 조사일, 준공일, 재방문일의 순서를 확인해 주세요.",
        );
        requireValue(
          !post.photos.some((p) =>
            first.photos.some((before) => before.sha256 === p.sha256),
          ),
          "최초 사진을 재방문 사진으로 다시 사용할 수 없습니다.",
        );
        requireValue(
          first.photos.every((p) =>
            carrier.artifacts.some(
              (a) => a.sha256 === p.sha256 && (!p.size || p.size === a.size),
            ),
          ),
          "최초 조사 사진이 해당 납품 버전에 연결되지 않았습니다.",
        );
        requireValue(
          !template || post.sheet,
          "기관 실적보고서의 시트명과 셀을 입력해 주세요.",
        );
        if (post.sheet) {
          const key = post.sheet.toLowerCase() + "!" + post.slot;
          requireValue(
            !cells.has(key),
            "두 재방문 행이 같은 실적보고서 셀을 지정했습니다.",
          );
          cells.add(key);
        }
        const initial_conditions = conditions(input.initial_conditions),
          revisit_conditions = conditions(input.revisit_conditions);
        const origin = input.initial_conditions_source ?? "user_transcribed";
        requireValue(
          origin === "user_transcribed" ||
            (origin === "field_record" && first.field_id),
          "최초 조건의 출처를 확인해 주세요.",
        );
        const conditionRecord = origin === "field_record" ? first.field_id : "";
        requireValue(
          !input.initial_condition_record_id ||
            input.initial_condition_record_id === conditionRecord,
          "최초 조건의 현장 기록 번호가 일치하지 않습니다.",
        );
        const before = {
          id: first.id,
          site_id: first.id,
          visit: { ...initial_conditions, date: first.observed_on },
        };
        const after = {
          id: post.id,
          site_id: first.id,
          visit_previous_id: first.id,
          visit: { ...revisit_conditions, date: post.observed_on },
        };
        const comparison = evidence.compareVisits(after, before);
        return {
          id: post.id,
          survey_sha256: input.survey_sha256,
          survey_row_id: first.id,
          site_key: first.id,
          completed_on: post.as_of,
          observed_on: post.observed_on,
          initial_conditions_source: origin,
          initial_condition_record_id: conditionRecord,
          initial_conditions,
          revisit_conditions,
          result: post.after,
          reason: post.reason,
          photos: post.photos,
          form: post.form,
          sheet: post.sheet,
          slot: post.slot,
          submit_text: post.submit_text,
          field_id: post.field_id,
          initial: {
            subject: first.subject,
            observed_on: first.observed_on,
            result: first.after,
            photos: first.photos,
            field_id: first.field_id,
            reason: first.reason,
            change: first.change,
            requirement_id: first.requirement_id,
            source_revision: ledger.source_revision,
            source_hash: ledger.source_hash,
            delivery_revision: carrier.revision,
            delivery_hash: carrier.hash,
          },
          comparison,
        };
      });
      return {
        schema: SCHEMA,
        task_id: task.id,
        source_revision: task.revision,
        source_hash: task.hash,
        spec: task.spec,
        template,
        rows: normalized,
      };
    }

    function read(task, text) {
      const source = typeof text === "string" ? text : tasks.canonical(text);
      requireValue(source.length <= MAX, "재방문 자료가 너무 큽니다.");
      const ledger = JSON.parse(source);
      requireValue(
        ledger?.schema === SCHEMA &&
          ledger.task_id === task?.id &&
          Number.isSafeInteger(ledger.source_revision) &&
          ledger.source_revision > 0 &&
          ledger.source_revision <= task.revision &&
          digest(ledger.source_hash) &&
          (ledger.source_revision !== task.revision ||
            ledger.source_hash === task.hash) &&
          Array.isArray(ledger.rows) &&
          ledger.rows.length > 0 &&
          ledger.rows.length <= 500,
        "현재 과업의 재방문 자료가 아닙니다.",
      );
      return ledger;
    }

    function photoReferences(ledger) {
      const refs = new Map();
      for (const r of ledger.rows)
        for (const p of [...r.initial.photos, ...r.photos]) {
          if (refs.has(p.sha256) && refs.get(p.sha256).size && p.size)
            requireValue(
              refs.get(p.sha256).size === p.size,
              "같은 사진의 크기 기록이 다릅니다.",
            );
          if (!refs.has(p.sha256) || p.size) refs.set(p.sha256, p);
        }
      return refs;
    }
    async function checkedPhotos(ledger, supplied) {
      const refs = photoReferences(ledger);
      requireValue(
        Array.isArray(supplied) &&
          supplied.length === refs.size &&
          refs.size + (ledger.template ? 4 : 2) <= 100,
        "전후 사진 원본 수를 확인해 주세요.",
      );
      const files = new Map();
      let total = 0;
      for (const p of supplied) {
        const ref = refs.get(p.sha256),
          blob = p.blob;
        requireValue(
          ref &&
            !files.has(p.sha256) &&
            blob instanceof Blob &&
            blob.size > 0 &&
            (!ref.size || ref.size === blob.size),
          "전후 사진 원본·크기를 확인해 주세요.",
        );
        total += blob.size;
        requireValue(
          total <= MAX &&
            (await tasks.hash(await blob.arrayBuffer())) === p.sha256,
          "전후 사진의 실제 파일 지문 또는 크기가 다릅니다.",
        );
        const sig = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
        let ext;
        if (sig[0] === 255 && sig[1] === 216 && sig[2] === 255) ext = "jpg";
        else if (
          [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => sig[i] === n)
        )
          ext = "png";
        else if (
          String.fromCharCode(...sig.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...sig.slice(8)) === "WEBP"
        )
          ext = "webp";
        else throw new Error("JPEG·PNG·WebP 사진 원본을 연결해 주세요.");
        files.set(p.sha256, { blob, ext });
      }
      return files;
    }
    async function verify(task, value, sources, photos, history) {
      await tasks.verify(history);
      const ledger = read(task, value),
        original = history[ledger.source_revision - 1];
      requireValue(
        same(history.at(-1), task) && original?.hash === ledger.source_hash,
        "재방문 자료의 기록 버전이 다릅니다.",
      );
      const rebuilt = await checkedLedger(
        original,
        ledger.rows,
        sources,
        history.slice(0, original.revision),
        ledger.template,
      );
      requireValue(
        same(ledger, rebuilt),
        "최초 조사 원본과 재방문 대조 내용이 다릅니다.",
      );
      await checkedPhotos(ledger, photos);
      return ledger;
    }

    function blockersFor(rows) {
      const reasons = [];
      for (const r of rows) {
        const issues = [];
        if (r.initial.change === "hold") issues.push("최초 조사 보류");
        if (!r.initial.photos.length) issues.push("최초 사진 미확인");
        if (r.comparison.status === "비교 정보 부족")
          issues.push(r.comparison.status);
        if (issues.length)
          reasons.push(r.initial.subject + " · " + issues.join(", "));
      }
      // 동일 사유가 많아도 과업 승인 검사의 경계 안에 두고 세부 사유는 원장 행에 남긴다.
      return reasons.length
        ? ["재방문 보완 " + reasons.length + "건 · " + reasons[0]]
        : [];
    }
    function sheets(ledger) {
      const report = [
        [
          "과업",
          "조사 지점",
          "조사 행",
          "재방문 행",
          "실적보고 서식",
          "시트",
          "기입 칸",
          "기입 문구",
          "최초 조사일",
          "준공일",
          "준공 후 재방문일",
          "최초 관찰",
          "재방문 관찰",
          "변경 사유",
          "조건 대조",
          "차이·보완 사유",
          "최초조사 원본 SHA-256",
          "자료 해석 범위",
        ],
      ];
      const observations = [
        [
          "재방문 행",
          "동일 지점 식별자",
          "구분",
          "조사일",
          "관찰 결과",
          "관찰 구간",
          "시작",
          "종료",
          "날씨",
          "관찰 방식",
          "특이사항",
          "조건 출처",
          "현장기록 번호",
          "최초 근거표 납품 버전",
          "최초 조사 원본 과업 지문",
          "최초 근거표 경로",
        ],
      ];
      const images = [
        [
          "비교 행 / 지점",
          "최초 사진",
          "준공 후 재방문 사진",
          "최초 파일명 · SHA-256 · ZIP 원본",
          "재방문 파일명 · SHA-256 · ZIP 원본",
        ],
      ];
      const photoText = (p) =>
        p ? p.name + "\n" + p.sha256 + "\nfiles/" + p.sha256 : "사진 없음";
      for (const r of ledger.rows) {
        const first = r.initial;
        report.push([
          ledger.spec.title,
          first.subject,
          r.survey_row_id,
          r.id,
          r.form,
          r.sheet,
          r.slot,
          r.submit_text,
          first.observed_on,
          r.completed_on,
          r.observed_on,
          first.result,
          r.result,
          r.reason,
          r.comparison.status,
          r.comparison.reasons.join(" · "),
          r.survey_sha256,
          "두 시점의 관찰값을 비교함. 사업의 인과효과는 별도 검증." +
            (r.completed_on === first.observed_on ||
            r.completed_on === r.observed_on
              ? " 당일 준공은 작성자가 기재한 날짜이며 완료 시각은 미확인."
              : ""),
        ]);
        for (const initial of [true, false]) {
          const c = initial ? r.initial_conditions : r.revisit_conditions;
          observations.push([
            r.id,
            r.site_key,
            initial ? "최초" : "재방문",
            initial ? first.observed_on : r.observed_on,
            initial ? first.result : r.result,
            ...Object.keys(conditionLabels).map((k) => c[k] || "미확인"),
            initial
              ? r.initial_conditions_source === "field_record"
                ? "연결한 최초 현장 기록"
                : "재방문표 작성자가 기재"
              : "재방문 기록",
            initial ? first.field_id : r.field_id,
            first.delivery_revision,
            first.source_hash,
            "files/" + r.survey_sha256,
          ]);
        }
        for (let i = 0; i < Math.max(first.photos.length, r.photos.length); i++)
          images.push([
            r.id + " / " + first.subject,
            "",
            "",
            photoText(first.photos[i]),
            photoText(r.photos[i]),
          ]);
      }
      return [
        {
          name: "실적보고서",
          rows: report,
          widths: [
            25, 28, 26, 26, 25, 18, 14, 45, 16, 16, 18, 35, 35, 40, 24, 38, 70,
            56,
          ],
        },
        {
          name: "전후 관찰",
          rows: observations,
          widths: [
            25, 25, 14, 16, 40, 26, 10, 10, 18, 26, 26, 28, 25, 17, 70, 75,
          ],
        },
        { name: "전후 사진", rows: images, widths: [48, 24, 24, 70, 70] },
      ];
    }
    async function build(
      task,
      rows,
      sources,
      photos,
      history,
      template = null,
    ) {
      await tasks.verify(history);
      const ledger = await checkedLedger(
        task,
        rows,
        sources,
        history,
        template,
      );
      const images = await checkedPhotos(ledger, photos),
        blockers = blockersFor(ledger.rows);
      const json = new Blob([tasks.canonical(ledger)], {
        type: "application/json",
      });
      const date = ledger.rows.reduce(
        (m, r) => (r.observed_on > m ? r.observed_on : m),
        "",
      );
      const book = new Blob(
        [docgen.xlsxBytes(sheets(ledger), date + "T00:00:00Z")],
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      );
      const inputHash = await tasks.hash(await json.arrayBuffer());
      const material = [
        { name: "재방문대조.json", blob: json, sha256: inputHash },
        {
          name: "재방문실적보고서.xlsx",
          blob: book,
          sha256: await tasks.hash(await book.arrayBuffer()),
        },
      ];
      for (const [hash, { blob, ext }] of images)
        material.push({
          name: "재방문사진_" + hash + "." + ext,
          blob,
          sha256: hash,
        });
      const total = material.reduce(
        (sum, f) => sum + f.blob.size,
        ledger.template?.size || 0,
      );
      requireValue(total <= MAX, "재방문 묶음의 파일 합계가 20MB를 넘습니다.");
      const files = material.map((f) => ({
        ...f,
        size: f.blob.size,
        input_hash: inputHash,
        comparison_hash: null,
        template_version: VERSION,
        blockers: [...blockers],
      }));
      const entries = ledger.rows
        .filter((r) => r.sheet)
        .map((r) => ({ sheet: r.sheet, cell: r.slot, text: r.submit_text }));
      const photoPairs = ledger.rows.flatMap((r) =>
        Array.from(
          { length: Math.max(r.initial.photos.length, r.photos.length) },
          (_, i) => ({
            before: images.get(r.initial.photos[i]?.sha256)?.blob || null,
            after: images.get(r.photos[i]?.sha256)?.blob || null,
          }),
        ),
      );
      return { ledger, files, inputHash, blockers, entries, photoPairs };
    }
    return { VERSION, SCHEMA, read, verify, build };
  },
);
