(function () {
  "use strict";
  const T = window.RenewTasks,
    S = window.TaskStore,
    F = window.FieldStore,
    B = window.TaskFiles,
    D = window.RenewDocgen,
    $ = (id) => document.getElementById(id);
  const labels = {
    planned: "검토용 초안",
    invalid: "C 입력 오류·검증 불가",
    hold: "B 근거 부족·판단 보류",
    ready: "A 대조 완료·담당자 검토 대기",
    approved: "최종 승인 기록됨(사용자 기록)",
    rejected: "최종 반려 기록됨(사용자 기록)",
  };
  let current = null,
    history = [],
    checks = [],
    selectedCheck = "",
    packets = [],
    busy = false;
  const say = (text) => {
    $("taskMsg").textContent = text;
  };
  const options = () => ({
    actor: $("taskActor").value.trim(),
    at: new Date().toISOString(),
  });
  const li = (text) => {
    const e = document.createElement("li");
    e.textContent = text;
    return e;
  };
  const filePages = window.RenewListPages.create(
    $("artifactList"),
    "납품 파일",
    renderArtifacts,
  );
  const historyPages = window.RenewListPages.create(
    $("taskHistory"),
    "과업 이력",
    renderHistory,
  );
  function step(n) {
    document.querySelectorAll("[data-panel]").forEach((e) => {
      e.hidden = e.dataset.panel !== String(n);
    });
    document.querySelectorAll("[data-step]").forEach((e) => {
      if (e.dataset.step === String(n)) e.setAttribute("aria-current", "step");
      else e.removeAttribute("aria-current");
    });
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    const controls = [
      ...document.querySelectorAll(
        "form button,form input,form select,form textarea,#taskPick,#taskActor,#newTask,#backupTask,#zipTask,#restoreTask,#restoreFile",
      ),
    ];
    controls.forEach((b) => {
      b.disabled = true;
    });
    say("처리 중입니다.");
    try {
      await fn();
    } catch (e) {
      say(e.message || "기록하지 못했습니다. 이전 버전은 유지됩니다.");
    } finally {
      busy = false;
      controls.forEach((b) => {
        b.disabled = false;
      });
    }
  }
  async function refreshList() {
    const rows = await S.list(),
      pick = $("taskPick");
    pick.textContent = "";
    pick.add(new Option("새 과업", ""));
    for (const r of rows)
      pick.add(
        new Option(
          `${r.spec.title} · v${r.revision} · ${labels[r.state]}`,
          r.id,
        ),
      );
    pick.value = current?.id || "";
  }
  function showSpec() {
    const spec = current?.spec;
    $("taskTitle").value = spec?.title || "";
    $("taskProgram").value = spec?.program || "";
    $("taskGuideline").value = spec?.guideline || "";
    $("taskScope").value = spec?.scope || "";
    $("taskRequirements").value = (spec?.requirements || [])
      .map((r) => `${r.title} | ${r.source} | ${r.unit}`)
      .join("\n");
  }
  function readSpec() {
    const prior = current?.spec.requirements || [];
    const lines = $("taskRequirements")
      .value.split(/\r?\n/)
      .filter((x) => x.trim());
    if (!lines.length || lines.length > 50)
      throw new Error("요구 항목은 1~50개로 적어 주세요.");
    const requirements = lines.map((line, i) => {
      const parts = line.split("|").map((x) => x.trim());
      if (parts.length !== 3 || parts.some((x) => !x))
        throw new Error(
          `${i + 1}번째 항목을 항목명 | 지정 출처 | 공간 단위 순서로 적어 주세요.`,
        );
      return {
        id: prior[i]?.id || crypto.randomUUID(),
        title: parts[0],
        source: parts[1],
        unit: parts[2],
      };
    });
    return {
      title: $("taskTitle").value.trim(),
      program: $("taskProgram").value.trim(),
      guideline: $("taskGuideline").value.trim(),
      scope: $("taskScope").value.trim(),
      requirements,
    };
  }
  function keepCheck() {
    if (!selectedCheck) return;
    const old = checks.find((c) => c.id === selectedCheck);
    const row = {
      id: selectedCheck,
      result: $("checkResult").value,
      source: $("checkSource").value.trim(),
      page: $("checkPage").value.trim(),
      unit: $("checkUnit").value.trim(),
      note: $("checkNote").value.trim(),
      evidence_sha256: $("checkHash").dataset.hash || "",
    };
    if (old) Object.assign(old, row);
    else checks.push(row);
  }
  function showCheck() {
    selectedCheck = $("checkPick").value;
    const req = current?.spec.requirements.find((r) => r.id === selectedCheck),
      row = checks.find((c) => c.id === selectedCheck);
    $("checkExpected").textContent = req
      ? `지정 출처: ${req.source} · 요구 단위: ${req.unit}`
      : "과업 계획을 먼저 저장해 주세요.";
    $("checkResult").value = row?.result || "pending";
    $("checkSource").value = row?.source || "";
    $("checkPage").value = row?.page || "";
    $("checkUnit").value = row?.unit || "";
    $("checkNote").value = row?.note || "";
    $("checkHash").dataset.hash = row?.evidence_sha256 || "";
    $("checkHash").textContent = row?.evidence_sha256
      ? `근거 파일 SHA-256: ${row.evidence_sha256}`
      : "근거 파일을 선택하면 지문이 기록됩니다.";
    $("checkFile").value = "";
  }
  function render() {
    $("taskState").textContent = current
      ? `${current.spec.title} · v${current.revision} · ${labels[current.state]} · 검증 ${current.attempts}/3회`
      : "새 과업을 설정하세요.";
    const pick = $("checkPick");
    pick.textContent = "";
    for (const r of current?.spec.requirements || [])
      pick.add(new Option(r.title, r.id));
    selectedCheck = pick.value;
    checks = structuredClone(current?.checks || []);
    showCheck();
    $("checkSummary").textContent = current?.checks?.length
      ? current.checks
          .map(
            (c) =>
              `${current.spec.requirements.find((r) => r.id === c.id)?.title || c.id}: ${c.result}${c.note ? " · " + c.note : ""}`,
          )
          .join("\n")
      : "";
    renderArtifacts();
    renderHistory();
    if (current?.decision)
      say(
        `검토 결정은 v${current.revision}의 파일 세트 ${current.decision.artifact_set_hash}에 연결돼 있습니다. 신원·서명 진위는 별도 확인 대상입니다.`,
      );
  }
  function renderArtifacts() {
    $("artifactList").textContent = "";
    for (const a of filePages.slice(current?.artifacts || [])) {
      const item = document.createElement("li"),
        details = document.createElement("details"),
        summary = document.createElement("summary"),
        meta = document.createElement("small");
      summary.textContent = `${a.name} · ${a.size.toLocaleString()} bytes${a.blockers?.length ? " · 승인 보류" : ""}`;
      meta.textContent = `SHA-256 ${a.sha256}${a.blockers?.length ? " · " + a.blockers.join(", ") : ""}`;
      details.append(summary, meta);
      item.append(details);
      $("artifactList").append(item);
    }
  }
  function renderHistory() {
    $("taskHistory").textContent = "";
    for (const r of historyPages.slice([...history].reverse()))
      $("taskHistory").append(
        li(
          `v${r.revision} · ${labels[r.state]} · ${r.action.type || r.action} · ${r.actor} · ${r.at} · ${r.hash}${r.decision ? " · 검토자 " + r.decision.reviewer + " · 결정일 " + r.decision.decided_on : ""}`,
        ),
      );
  }
  async function select(id) {
    history = id ? await S.history(id) : [];
    if (history.length) await T.verify(history);
    current = history.at(-1) || null;
    filePages.reset();
    historyPages.reset();
    showSpec();
    render();
    await refreshList();
    if (current) historyReplace(current.id);
  }
  function historyReplace(id) {
    const u = new URL(location.href);
    u.searchParams.set("id", id);
    u.searchParams.delete("packet");
    window.history.replaceState(null, "", u);
  }
  async function commit(type, payload, base = current) {
    if (!base) throw new Error("과업 계획을 먼저 저장해 주세요.");
    const next = await T.revise(base, { type, payload }, options());
    await S.append(next, base.hash);
    await select(base.id);
    return next;
  }
  async function storeFile(file, id) {
    if (!file || !file.size || file.size > B.MAX)
      throw new Error("비어 있지 않은 20MB 이하 파일을 선택해 주세요.");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      sha256 = await T.hash(bytes),
      entry = {
        id: `task-file:${id}:${sha256}`,
        kind: "task-file",
        task_id: id,
        name: file.name,
        sha256,
        size: bytes.length,
        created_at: new Date().toISOString(),
        blob: new Blob([bytes], {
          type: file.type || "application/octet-stream",
        }),
      };
    const old = await F.doc(entry.id);
    if (!old) {
      const held = (await F.docs()).filter(
        (d) => d.kind === "task-file" && d.task_id === id,
      );
      if (
        held.length >= 500 ||
        held.reduce((n, d) => n + d.size, 0) + entry.size > B.MAX
      )
        throw new Error("과업의 전체 보관 파일은 500개·20MB 이하여야 합니다.");
    }
    if (old && (await T.hash(await old.blob.arrayBuffer())) !== sha256)
      throw new Error("기존 보관 파일의 지문이 다릅니다.");
    if (!old) await F.addDoc(entry);
    return entry;
  }
  const artifact = (e, blockers = []) => ({
    name: e.name,
    sha256: e.sha256,
    size: e.size,
    input_hash: e.input_hash || null,
    comparison_hash: e.comparison_hash || null,
    template_version: e.template_version || null,
    blockers: e.blockers || blockers,
  });
  function mergeArtifacts(old, added) {
    const by = new Map(old.map((x) => [x.sha256, x]));
    for (const a of added) {
      const previous = by.get(a.sha256);
      by.set(
        a.sha256,
        previous
          ? {
              ...previous,
              blockers: [
                ...new Set([
                  ...(previous.blockers || []),
                  ...(a.blockers || []),
                ]),
              ],
            }
          : a,
      );
    }
    return [...by.values()];
  }
  async function loadPackets() {
    packets = (await F.docs()).filter((d) => d.kind === "task-packet");
    $("packetPick").textContent = "";
    $("packetPick").add(new Option("보고서 묶음을 선택하세요", ""));
    for (const p of packets)
      $("packetPick").add(
        new Option(
          `${p.context.region || p.context.code} · ${p.created_at}`,
          p.id,
        ),
      );
    const id = new URL(location.href).searchParams.get("packet");
    if (packets.some((p) => p.id === id)) {
      $("packetPick").value = id;
      step(2);
      say("보고서 묶음을 불러왔습니다. 과업 계획을 저장한 뒤 연결해 주세요.");
    }
  }
  async function backup() {
    if (!current) throw new Error("보관할 과업을 선택해 주세요.");
    const entries = (await F.docs()).filter(
      (d) => d.kind === "task-file" && d.task_id === current.id,
    );
    return B.make(history, entries);
  }
  $("planForm").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      const spec = readSpec();
      if (current) await commit("edit", { spec });
      else {
        const r = await T.create(spec, options());
        await S.append(r, null);
        await select(r.id);
      }
      say("새 계획 버전을 저장했습니다.");
      step(1);
    });
  });
  $("taskPick").addEventListener("change", () =>
    action(async () => {
      await select($("taskPick").value);
      say("과업을 불러왔습니다.");
    }),
  );
  $("newTask").addEventListener("click", () =>
    action(async () => {
      await select("");
      step(0);
      say("새 과업을 설정하세요.");
    }),
  );
  document
    .querySelectorAll("[data-step]")
    .forEach((b) =>
      b.addEventListener("click", () => step(Number(b.dataset.step))),
    );
  $("checkPick").addEventListener("change", () => {
    keepCheck();
    showCheck();
  });
  $("checkFile").addEventListener("change", () =>
    action(async () => {
      if (!current) throw new Error("과업을 먼저 저장해 주세요.");
      const id = current.id,
        req = selectedCheck,
        f = $("checkFile").files[0];
      const entry = await storeFile(f, id);
      if (current?.id !== id || selectedCheck !== req)
        throw new Error(
          "파일 준비 중 과업이나 항목이 바뀌었습니다. 다시 선택해 주세요.",
        );
      $("checkHash").dataset.hash = entry.sha256;
      $("checkHash").textContent = `근거 파일 SHA-256: ${entry.sha256}`;
      keepCheck();
      say("근거 파일을 이 기기에 보관했습니다.");
    }),
  );
  $("checkForm").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      keepCheck();
      await commit("check", { checks });
      say(`${labels[current.state]}로 기록했습니다. 미해결 항목을 확인하세요.`);
    });
  });
  $("fileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      if (!current) throw new Error("과업을 먼저 저장해 주세요.");
      const base = current,
        files = [...$("deliveryFiles").files];
      if (!files.length) throw new Error("연결할 파일을 선택해 주세요.");
      const added = [];
      for (const f of files) {
        const entry = await storeFile(f, base.id);
        added.push(
          artifact(
            entry,
            base.checks.length === base.spec.requirements.length &&
              base.checks.every((c) => c.result === "match")
              ? []
              : ["요구 자료 대조 전 첨부한 파일"],
          ),
        );
      }
      await commit(
        "attach",
        { artifacts: mergeArtifacts(base.artifacts, added) },
        base,
      );
      say("납품 파일의 정확한 지문을 새 버전에 연결했습니다.");
      $("deliveryFiles").value = "";
    });
  });
  $("packetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      if (!current) throw new Error("과업을 먼저 저장해 주세요.");
      const base = current,
        p = packets.find((p) => p.id === $("packetPick").value);
      if (!p) throw new Error("연결할 보고서 묶음을 선택해 주세요.");
      const added = [];
      for (const f of p.files) {
        const entry = await storeFile(new File([f.blob], f.name), base.id);
        if (entry.sha256 !== f.sha256)
          throw new Error("보고서 파일이 생성 당시와 다릅니다.");
        added.push(artifact({ ...f, ...entry }));
      }
      await commit(
        "attach",
        { artifacts: mergeArtifacts(base.artifacts, added) },
        base,
      );
      say(
        "실제 보고서·고정 입력·기준일 비교 파일을 연결했습니다. 승인 대기 사유는 파일 목록에 남습니다.",
      );
    });
  });
  $("decisionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      if (!current) throw new Error("과업을 먼저 저장해 주세요.");
      const base = current,
        entry = await storeFile($("decisionFile").files[0], base.id);
      await commit(
        $("decisionKind").value,
        {
          reviewer: $("decisionReviewer").value.trim(),
          role: $("decisionRole").value.trim(),
          decided_on: $("decisionDate").value,
          evidence: {
            name: entry.name,
            sha256: entry.sha256,
            size: entry.size,
          },
          note: $("decisionNote").value.trim(),
        },
        base,
      );
      say(
        "실제 검토 결정과 증빙을 해당 파일 버전에 기록했습니다. 신원·전자서명 인증은 별도입니다.",
      );
    });
  });
  $("backupTask").addEventListener("click", () =>
    action(async () => {
      const b = await backup();
      D.saveBytes(
        `renewmap-task-${current.id}-v${current.revision}.json`,
        JSON.stringify(b),
        "application/json",
      );
      say(
        "이력과 연결 파일을 포함한 백업을 받았습니다. 안전한 별도 위치에 보관해 주세요.",
      );
    }),
  );
  $("zipTask").addEventListener("click", () =>
    action(async () => {
      const b = await backup(),
        entries = [
          { name: "manifest.json", data: JSON.stringify(b.manifest, null, 2) },
          ...b.files.map((f) => ({
            name: `files/${f.sha256}`,
            data: B.from64(f.base64),
          })),
        ];
      D.saveBytes(
        `renewmap-delivery-${current.id}-v${current.revision}.zip`,
        D.zipStore(entries, new Date().toISOString()),
        "application/zip",
      );
      say("파일 지문·검토 이력이 담긴 납품 묶음을 받았습니다.");
    }),
  );
  $("restoreTask").addEventListener("click", () =>
    action(async () => {
      const f = $("restoreFile").files[0];
      if (!f || f.size > 40 * 1024 * 1024)
        throw new Error("40MB 이하의 JSON 백업을 선택해 주세요.");
      await restoreBackup(await f.text());
    }),
  );
  async function restoreBackup(value, forward = false) {
    const b = await B.read(
      typeof value === "string" ? value : JSON.stringify(value),
    );
    const existing = await S.history(b.manifest.id),
      incoming = b.manifest.history;
    if (existing.length && T.canonical(existing) !== T.canonical(incoming)) {
      if (
        !forward ||
        existing.length > incoming.length ||
        existing.some((r, i) => r.hash !== incoming[i]?.hash)
      )
        throw new Error(
          "같은 과업의 다른 이력이 있어 복원을 중단했습니다. 기존 과업은 유지됩니다.",
        );
    }
    for (const f of b.files)
      await storeFile(new File([f.bytes], f.name), b.manifest.id);
    if (forward) await S.fastForward(incoming);
    else await S.restore(incoming);
    await select(b.manifest.id);
    say(
      "이력·파일 지문 검사를 통과한 기록을 보관했습니다. 작성자 신원·기관 승인 진위는 별도 확인 대상입니다.",
    );
  }
  action(async () => {
    await select(new URL(location.href).searchParams.get("id") || "");
    await loadPackets();
    if (window.RenewTaskCloudUI)
      window.RenewTaskCloudUI.mount({
        getBackup: backup,
        restoreBackup: (b) => restoreBackup(b, true),
        run: action,
        notify: say,
      });
  });
})();
