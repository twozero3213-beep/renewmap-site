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
    invalid: "C 입력 다시 확인",
    hold: "B 근거 부족 보류", // OD1(r16 2차): '판단 보류'는 요건 상태 낱말과 섞여 tasks-files.js 상태 이름과 같게
    ready: "A 대조 완료·담당자 검토 대기",
    approved: "최종 승인 기록됨(사용자 기록)",
    rejected: "최종 반려 기록됨(사용자 기록)",
  };
  let current = null,
    history = [],
    checks = [],
    selectedCheck = "",
    packets = [],
    busy = false,
    cloud = null;
  const receivedList = $("receivedList"), receivedFiles = $("receivedFiles"), receivedMore = $("receivedMore");
  const receivedControls = [receivedList, receivedFiles, receivedMore, $("receivedCheck"), $("receivedRequest"), $("receivedAdd")];
  let receivedState = null, receiving = false;
  function clearReceipt() {
    receivedState = null;
    $("receivedRequestSection").hidden = true;
    $("receivedStatus").textContent = "";
    $("receivedIssues").replaceChildren();
    $("receivedAddStatus").textContent = "";
    receivedMore.value = "";
  }
  for (const input of [receivedList, receivedFiles]) input.addEventListener("change", clearReceipt);
  if (location.hash === "#receivedDelivery") $("receivedDelivery").open = true;
  async function checkReceived(list, files, adding = false) {
    if (receiving) return;
    receiving = true;
    receivedControls.forEach(control => { control.disabled = true; });
    if (!adding) clearReceipt();
    const message = $(adding ? "receivedAddStatus" : "receivedStatus");
    message.textContent = "받은 목록과 파일을 대조하고 있습니다.";
    try {
      const result = await B.verifyDelivery(list, files);
      receivedState = {list, files, result};
      const basis = "목록 v" + result.revision + " · 이름 " + result.selected + "개 · 파일 " + result.count + "개";
      $("receivedStatus").textContent = result.issues.length
        ? basis + " 중 " + result.matched + "개 일치 · 확인 필요 " + result.issues.length + "건"
        : basis + "가 모두 일치합니다.";
      $("receivedIssues").replaceChildren(...result.issues.map(li));
      $("receivedRequestSection").hidden = !result.request;
      if (adding) {
        message.textContent = "보탠 파일과 앞서 고른 파일을 다시 대조했습니다.";
        if (!result.request) $("receivedStatus").focus();
      }
    } catch (error) {
      message.textContent = error.message || "받은 파일을 대조하지 못했습니다.";
    } finally {
      receiving = false;
      receivedMore.value = "";
      receivedControls.forEach(control => { control.disabled = false; });
    }
  }
  $("receivedCheck").addEventListener("click", () => checkReceived(receivedList.files[0], [...receivedFiles.files]));
  $("receivedRequest").addEventListener("click", () => {
    const result = receivedState?.result;
    if (receiving || !result?.request) return;
    D.saveBytes("renewmap-resend-v" + result.revision + ".txt", result.request, "text/plain;charset=utf-8");
  });
  $("receivedAdd").addEventListener("click", () => {
    if (receiving || !receivedState) return;
    const added = [...receivedMore.files], names = new Set(added.map(file => file.name));
    const allowed = new Set(receivedState.result.resend.map(row => row.basename));
    if (!added.length || names.size !== added.length || added.some(file => !allowed.has(file.name))) {
      $("receivedAddStatus").textContent = names.size !== added.length
        ? "같은 이름을 중복 선택했습니다. 다시 받은 파일을 이름별로 하나씩 골라 주세요."
        : "재전달 요청에 있는 이름의 파일만 골라 주세요.";
      receivedMore.value = "";
      return;
    }
    const kept = receivedState.files.filter(file => !names.has(file.name));
    checkReceived(receivedState.list, [...kept, ...added], true);
  });
  const deliveryPicks = new Set();
  let deliveryHead = null;
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
  const survey = window.RenewSurveyChangeUI.mount({
    run: action, task: () => current, versions: () => history,
    attach: (base, files) => attachReport(base, files, window.RenewSurveyChangeUI.isSurvey), notify: say,
  });
  const revisit = window.RenewRevisitUI.mount({
    run: action, task: () => current, versions: () => history,
    attach: (base, files) => attachReport(base, files, window.RenewRevisitUI.isRevisit), notify: say,
  });
  const followup = window.RenewTaskFollowupUI.mount({
    run: action, task: () => current, versions: () => history,
    commit: commitWork, notify: say,
  });
  const isReport = file => window.RenewSurveyChangeUI.isSurvey(file) || window.RenewRevisitUI.isRevisit(file);
  let at = 0;   // 지금 단계. 과업을 고르거나 비우면 같은 단계를 다시 그린다(계획 유무에 따라 빈 안내가 바뀐다)
  function step(n) {
    at = n;
    // 계획을 저장하기 전에는 2~4단계 빈 폼 대신 안내 하나(r16: 다 쓰고 나서야 '계획을 먼저 저장'을 만났다)
    const none = n > 0 && !current;
    $("taskNoPlan").hidden = !none;
    document.querySelectorAll("[data-panel]").forEach((e) => {
      e.hidden = none || e.dataset.panel !== String(n);
    });
    document.querySelectorAll(".task-steps [data-step]").forEach((e) => {
      if (e.dataset.step === String(n)) e.setAttribute("aria-current", "step");
      else e.removeAttribute("aria-current");
    });
  }
  async function action(fn, { readOnly = false } = {}) {
    if (busy) return;
    busy = true;
    const controls = [
      ...document.querySelectorAll(
        "form button,form input,form select,form textarea,#planSave,#taskPick,#taskActor,#newTask,#backupTask,#zipTask,#selectedDelivery,#artifactList input,#deliveryScopeFiles button,.list-pages [aria-controls=artifactList],#handoverTask,#downloadHandover,#downloadRecoveryHandover,#reconnectFile,#reconnectTaskFile,#restoreTask,#restoreFile,#taskWork button,#taskWork input,#taskWork select,#taskWork textarea",
      ),
    ];
    const prev = controls.map((b) => b.disabled);   // 끝나면 원래 상태로 되돌린다(처리 전부터 꺼 둔 단추를 켜지 않는다)
    controls.forEach((b) => {
      b.disabled = true;
    });
    const pending = "처리 중입니다.";
    say(pending);
    try {
      const run = readOnly ? fn : async () => {
        const before = new Set((await F.docs()).map(d => d.id));
        try { await fn(); }
        catch (error) {
          // 다른 탭과 직렬화하여 실패한 작업의 새 파일만 회수하고, 저장된 이력의 파일은 보존한다.
          const needed = new Map();
          for (const d of await F.docs()) if (d.kind === "task-file" && !before.has(d.id)) {
            if (!needed.has(d.task_id)) needed.set(d.task_id, B.needed(await S.history(d.task_id)));
            if (!needed.get(d.task_id).has(d.sha256)) await F.deleteDoc(d.id);
          }
          throw error;
        }
      };
      if (navigator.locks) await navigator.locks.request("renewmap-task-files", run);
      else await run();
      // 작업이 따로 결과를 알리지 않았으면 '처리 중'을 지운다(v9 QA: 끝난 뒤에도 계속 '처리 중입니다.'로 남았다)
      if ($("taskMsg").textContent === pending) say("");
    } catch (e) {
      say(e.message || "기록하지 못했습니다. 이전 버전은 유지됩니다.");
    } finally {
      busy = false;
      controls.forEach((b, i) => {
        b.disabled = prev[i];
      });
      syncDeliverySelection();
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
    // 줄을 지우거나 순서를 바꿔도 연결된 근거가 다른 항목으로 옮겨 가지 않게 ID는 줄 위치가 아니라 항목명으로 잇는다(같은 이름은 앞에서부터 한 번씩)
    const unused = [...(current?.spec.requirements || [])];
    const lines = $("taskRequirements")
      .value.split(/\r?\n/)
      .filter((x) => x.trim());
    if (!lines.length || lines.length > 50)
      throw new Error("요구 항목은 1~50개로 적어 주세요.");
    const requirements = lines.map((line, i) => {
      // 휴대폰 한글 자판은 세로줄(|)이 둘째 기호 화면에 있다 → 쉼표·탭도 받는다. 세로줄이 있으면 세로줄만, 없으면 탭, 그다음 쉼표로 나눈다(출처 이름 안 쉼표를 지킨다)
      const parts = line.split(line.includes("|") ? "|" : line.includes("\t") ? "\t" : ",").map((x) => x.trim());
      if (parts.length !== 3 || parts.some((x) => !x))
        throw new Error(
          `${i + 1}번째 항목을 항목명 | 지정 출처 | 공간 단위 순서로 적어 주세요. 쉼표나 탭으로 나눠도 됩니다.`,
        );
      const hit = unused.findIndex((r) => r.title === parts[0]);
      return {
        id: hit >= 0 ? unused.splice(hit, 1)[0].id : crypto.randomUUID(),
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
    showHash(row?.evidence_sha256);
    $("checkFile").value = "";
  }
  // 파일 확인값: 안내 글은 본문 글꼴, 해시 값만 고정폭(r16: 한글까지 고정폭이라 자간이 벌어졌고 '지문'은 생체 지문으로 읽혔다)
  function showHash(sha) {
    const code = document.createElement("code");
    code.textContent = sha || "";
    $("checkHash").replaceChildren(...(sha ? ["근거 파일 확인값(SHA-256): ", code] : ["근거 파일을 고르면 파일 확인값(SHA-256)을 남깁니다."]));
  }
  function clearHandover(message) {
    $("handoverStatus").textContent = message;
    $("handoverAttention").replaceChildren();
    $("handoverComparisonStatus").textContent = "";
    $("handoverChanges").replaceChildren();
    $("handoverPreview").hidden = true;
    $("downloadHandover").hidden = true;
    $("downloadRecoveryHandover").hidden = true;
    $("handoverRecovery").hidden = true;
    $("handoverRecoveryFiles").replaceChildren();
    $("reconnectFile").value = "";
  }
  function render() {
    clearHandover(current
      ? `선택한 v${current.revision}의 이력과 연결 파일을 검사한 뒤 요약을 확인하세요.`
      : "저장한 과업을 선택하면 인수인계 요약을 확인할 수 있습니다.");
    $("taskState").textContent = current
      ? `${current.spec.title} · v${current.revision} · ${labels[current.state]} · 대조 ${current.attempts}/3회`
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
              `${current.spec.requirements.find((r) => r.id === c.id)?.title || c.id}: ${B.checkResultLabels[c.result]}${c.note ? " · " + c.note : ""}`,
          )
          .join("\n")
      : "";
    renderArtifacts();
    renderHistory();
    const readiness = current ? T.approvalReadiness(current) : null;
    const blockers = [];
    let approval = "과업을 선택하면 저장된 승인 자료 조건을 확인할 수 있습니다.";
    if (readiness) {
      if (readiness.needsChecks) blockers.push("필수 항목의 근거 대조가 끝나지 않았습니다. 2 근거 대조에서 확인하세요.");
      if (readiness.missingFiles) blockers.push("검토할 납품 파일이 없습니다. 이 화면에서 파일을 연결하세요.");
      if (readiness.blockedFiles) blockers.push(`납품 파일 ${readiness.blockedFiles}개에 승인 보류 사유가 있습니다. 이 화면의 파일 목록에서 확인하세요.`);
      blockers.push(...readiness.work);
      const version = `열어 둔 과업 v${current.revision}`;
      if (current.decision) {
        const kind = current.decision.kind === "approve" ? "승인" : "반려";
        approval = `${version}에 ${kind} 기록이 있습니다.`;
        if (blockers.length) approval += " 저장된 승인 자료 조건에서 확인할 사유가 남아 있습니다.";
      } else if (blockers.length) {
        approval = `${version}의 저장된 승인 자료 조건에서 확인할 사유가 남아 있습니다.`;
      } else {
        approval = `${version}의 기록에 표시할 승인 보류 사유가 없습니다. 실제 검토 결정과 증빙은 아래에서 별도로 기록하세요.`;
      }
      if (readiness.work.length) {
        approval += "\n의견은 4 검토·후속 점검에서 확인하세요. 해소 확인에 쓰인 보완본이 현재 납품에서 빠졌다면 이 화면에서 그 파일을 다시 연결하세요.";
      }
      approval += "\n후속 점검 기한은 4 검토·후속 점검에서 따로 관리합니다.";
    }
    $("workApproval").textContent = approval;
    const reasons = $("workApprovalReasons");
    reasons.replaceChildren(...blockers.map((reason) => {
      const item = document.createElement("li");
      item.textContent = reason;
      return item;
    }));
    reasons.hidden = blockers.length === 0;
    if (current?.decision)
      say(
        `검토 결정은 v${current.revision}의 파일 세트 ${current.decision.artifact_set_hash}에 연결돼 있습니다. 신원·서명 진위는 별도 확인 대상입니다.`,
      );
  }
  function syncDeliverySelection() {
    const selected = (current?.artifacts || []).filter(file => deliveryPicks.has(file.name));
    const count = selected.length;
    const paths = new Set(selected.map(file => T.zipPath(file.sha256, file.name)));
    $("deliverySelection").textContent = count
      ? "전달 이름 " + count + "개 선택 · ZIP 파일 " + paths.size + "개"
      : "전달할 파일 0개 선택";
    $("deliveryScope").hidden = count === 0;
    if (!count) $("deliveryScope").open = false;
    $("deliveryScopeFiles").replaceChildren(...selected.map((file, index) => {
      const item = li(file.name + " "), remove = document.createElement("button");
      remove.type = "button";
      remove.disabled = busy;
      remove.textContent = "선택 해제";
      remove.setAttribute("aria-label", file.name + " 선택 해제");
      remove.addEventListener("click", () => {
        deliveryPicks.delete(file.name);
        renderArtifacts();
        const remaining = $("deliveryScopeFiles").querySelectorAll("button");
        (remaining[index] || remaining[index - 1] || $("artifactList").querySelector("input"))?.focus();
      });
      item.append(remove);
      return item;
    }));
    $("selectedDelivery").disabled = busy || count === 0;
  }
  function renderArtifacts() {
    const head = current?.hash ?? null;
    if (head !== deliveryHead) {
      deliveryPicks.clear();
      deliveryHead = head;
    }
    $("artifactList").textContent = "";
    for (const a of filePages.slice(current?.artifacts || [])) {
      const item = document.createElement("li"),
        details = document.createElement("details"),
        summary = document.createElement("summary"),
        meta = document.createElement("small");
      summary.textContent = `${a.name} · ${a.size.toLocaleString()} bytes${a.blockers?.length ? " · 승인 보류" : ""}`;
      meta.textContent = `SHA-256 ${a.sha256}${a.blockers?.length ? " · " + a.blockers.join(", ") : ""}`;
      const pick = document.createElement("label"), box = document.createElement("input");
      pick.className = "task-file-select";
      box.type = "checkbox";
      box.checked = deliveryPicks.has(a.name);
      box.setAttribute("aria-label", a.name + " 전달 선택");
      box.addEventListener("change", () => {
        if (box.checked) deliveryPicks.add(a.name);
        else deliveryPicks.delete(a.name);
        syncDeliverySelection();
      });
      pick.append(box, " 전달 선택");
      details.append(summary, meta);
      item.append(pick, details);
      $("artifactList").append(item);
    }
    syncDeliverySelection();
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
    step(at);
    await refreshList();
    await survey.refresh();
    await revisit.refresh();
    followup.refresh();
    if (current) historyReplace(current.id);
  }
  function historyReplace(id) {
    const u = new URL(location.href);
    u.searchParams.set("id", id);
    u.searchParams.delete("packet");
    window.history.replaceState(null, "", u);
  }
  async function commit(type, payload, base = current, beforeAppend) {
    if (!base) throw new Error("과업 계획을 먼저 저장해 주세요.");
    if (cloud) await cloud.assertCanChange(base.id, [type]);
    const next = await T.revise(base, { type, payload }, options());
    if (beforeAppend) await beforeAppend();
    await S.append(next, base.hash);
    await select(base.id);
    return next;
  }
  async function commitWork(type, payload, file, base) {
    if (!base) throw new Error("과업 계획을 먼저 저장해 주세요.");
    if (base.hash !== current?.hash)
      throw new Error("편집 중 과업이 바뀌었습니다. 기록을 다시 불러오세요.");
    if (cloud) await cloud.assertCanChange(base.id, type === "issue_reply" ? ["attach", type] : [type]);
    const prefix = history.slice(), added = [];
    let source = base, evidence;
    if (file) {
      if (!file.size || file.size > B.MAX)
        throw new Error("비어 있지 않은 20MB 이하 증빙 파일을 선택해 주세요.");
      evidence = {name:file.name,sha256:await T.hash(await file.arrayBuffer()),size:file.size};
      if (type === "issue_reply") {
        const existing = base.artifacts.find(a => a.name === evidence.name);
        if (existing && (existing.sha256 !== evidence.sha256 || existing.size !== evidence.size))
          throw new Error("원본을 보존할 수 있도록 보완 파일은 기존 납품 파일과 다른 이름을 사용하세요.");
        if (!existing) {
          source = await T.revise(base, {type:"attach",payload:{artifacts:[...base.artifacts,artifact(evidence)]}}, options());
          added.push(source);
        }
      }
    }
    const next = await T.revise(source, {type,payload:evidence ? {...payload,evidence} : payload}, options());
    added.push(next);
    // 보완본 연결과 답변은 함께 검증한 뒤 한 이력으로 저장하여 중간 판본만 남기지 않는다.
    if (file) {
      const stored = await storeFile(file, base.id);
      if (stored.sha256 !== evidence.sha256 || stored.size !== evidence.size)
        throw new Error("저장할 증빙의 파일 확인값·크기가 다릅니다.");
    }
    await S.fastForward([...prefix,...added]);
    await select(base.id);
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
      throw new Error("기존 보관 파일의 확인값이 다릅니다.");
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
    const result = old.slice();
    for (const a of added) {
      const index = result.findIndex(x => x.sha256 === a.sha256 && !isReport(x));
      if (index < 0) result.push(a);
      else {
        const previous = result[index];
        result[index] = {...previous, blockers:[...new Set([...previous.blockers,...a.blockers])]};
      }
    }
    return result;
  }
  async function attachReport(base, files, belongsToReport) {
    if (base.hash !== current?.hash) throw new Error("편집 중 과업이 바뀌었습니다. 근거표를 다시 불러오세요.");
    const kept = base.artifacts.filter(a => !belongsToReport(a));
    if (files.some(file => kept.some(a => a.name === file.name)))
      throw new Error("기존 일반 납품 파일과 근거표 파일 이름이 겹칩니다. 기존 파일을 다른 이름으로 연결하세요.");
    // 같은 바이트를 일반 첨부와 조사 증빙에 쓸 수 있다. 승인 보류와 이름은 각 납품 항목에 속한다.
    const next = [...kept, ...files.map(file => artifact(file))];
    const held = (await F.docs()).filter(d => d.task_id === base.id && d.kind === "task-file");
    const sizes = new Map(held.map(d => [d.sha256,d.size]));
    for (const f of files) sizes.set(f.sha256,f.size);
    if (sizes.size > 500 || [...sizes.values()].reduce((sum,size) => sum+size,0) > B.MAX)
      throw new Error("과업의 기존 파일을 포함하여 500개·20MB를 넘습니다.");
    await commit("attach", {artifacts:next}, base, async () => {
      for (const f of files) {
        const entry = await storeFile(new File([f.blob],f.name,{type:f.blob.type}),base.id);
        if (entry.sha256 !== f.sha256) throw new Error("저장할 조사 파일의 확인값이 다릅니다.");
      }
    });
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
  async function requireCurrentExport(id, hash) {
    const stored = await S.headHash(id);
    if (stored === hash && current?.id === id && current.hash === hash) return;
    const message = "과업판이 바뀌었습니다. 과업을 다시 열어 최신 판을 확인해 주세요.";
    clearHandover(message);
    throw Object.assign(new Error(message), { code: "TASK_EXPORT_STALE" });
  }
  async function exportInputs() {
    if (!current) throw new Error("보관할 과업을 선택해 주세요.");
    const base = current, versions = history.slice();
    await requireCurrentExport(base.id, base.hash);
    const entries = (await F.docs()).filter(
      (d) => d.kind === "task-file" && d.task_id === base.id,
    );
    return { base, versions, entries };
  }
  async function backup() {
    const { base, versions, entries } = await exportInputs();
    try {
      const saved = await B.make(versions, entries);
      await requireCurrentExport(base.id, base.hash);
      return saved;
    } catch (error) {
      if (error.code !== "TASK_EXPORT_STALE" && $("handoverRecovery").hidden && !$("handoverPreview").hidden)
        clearHandover("백업 파일을 확인할 수 없습니다. 인수인계 요약을 다시 만들어 주세요.");
      throw error;
    }
  }
  async function handover({ recover = true } = {}) {
    if (recover) clearHandover("이력과 연결 파일을 검사하고 있습니다.");
    try {
      const { base, versions, entries } = await exportInputs();
      let saved, manifest, issues = [];
      try {
        saved = await B.make(versions, entries);
        manifest = saved.manifest;
      } catch (error) {
        if (!recover || !["TASK_FILE_MISSING", "TASK_FILE_MISMATCH"].includes(error.code)) throw error;
        ({ manifest, issues } = await B.inspectRecovery(versions, entries));
        if (!issues.length) throw error;
      }
      const guide = await B.handover(manifest, D.localDate(), issues);
      await requireCurrentExport(base.id, base.hash);
      showHandover(guide);
      return { manifest, saved, guide };
    } catch (error) {
      if (error.code !== "TASK_EXPORT_STALE" && (recover || ($("handoverRecovery").hidden && !$("handoverPreview").hidden)))
        clearHandover("요약을 만들지 못했습니다. 안내된 파일이나 이력을 확인해 주세요.");
      throw error;
    }
  }
  function showHandover(guide) {
    const recovery = guide.recovery.length > 0;
    $("handoverStatus").textContent = recovery ? `복구용 인수인계 요약 · 연결 파일 ${guide.recovery.length}개 확인 필요 · ${guide.summary}` : guide.summary;
    $("handoverRecovery").hidden = !recovery;
    $("handoverRecoveryFiles").replaceChildren(...guide.recovery.map(file => {
      const item = li(file.label), sha = document.createElement("code");
      sha.textContent = file.sha;
      item.append(" / SHA-256 ", sha);
      return item;
    }));
    $("handoverAttention").replaceChildren(...guide.attention.map(li));
    $("handoverComparisonStatus").textContent = guide.comparison.summary;
    const changes = guide.comparison.items.map(item => item
      .replace(/^((?:이전 판에만 있는 파일|현재 판에만 있는 파일): ".*") \/ files\/[a-f0-9]{64}(?:\.[a-z0-9]{1,8})?$/, "$1")
      .replace(/^(파일 내용 변경: ".*") \/ 이전 files\/[a-f0-9]{64}(?:\.[a-z0-9]{1,8})? \/ 현재 files\/[a-f0-9]{64}(?:\.[a-z0-9]{1,8})?$/, "$1"));
    $("handoverChanges").replaceChildren(...(changes.length ? changes : ["기록 차이가 없거나 비교할 이전 승인 기록이 없습니다. 현재 판의 검토 상태는 위에서 확인하세요."]).map(li));
    $("handoverPreview").hidden = false;
    $("downloadHandover").hidden = recovery;
    $("downloadRecoveryHandover").hidden = !recovery;
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
      showHash(entry.sha256);
      keepCheck();
      say("근거 파일을 이 기기에 보관하고 파일 확인값을 남겼습니다.");
    }),
  );
  $("checkForm").addEventListener("submit", (e) => {
    e.preventDefault();
    action(async () => {
      keepCheck();
      const retained = current?.artifacts.filter(isReport) || [];
      if (retained.length) {
        if (cloud) await cloud.assertCanChange(current.id, ["check", "attach"]);
        // 같은 계획의 재검증에서도 조사 보류와 제출서식 연결을 함께 보존한다.
        const checked = await T.revise(current, {type:"check",payload:{checks}}, options());
        const next = await T.revise(checked, {type:"attach",payload:{artifacts:retained}}, options());
        await S.fastForward([...history,checked,next]);
        await select(next.id);
      } else await commit("check", { checks });
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
      say("납품 파일과 그 파일 확인값을 새 버전에 연결했습니다.");
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
        "실제 보고서·고정 입력·기준일 비교 파일을 연결했습니다. 보류 사유는 파일 목록에 남습니다.",
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
      const b = await backup(), data = JSON.stringify(b);
      await requireCurrentExport(b.manifest.id, b.manifest.head_hash);
      D.saveBytes(
        `renewmap-internal-backup-${b.manifest.id}-v${b.manifest.revision}.json`,
        data,
        "application/json",
      );
      say(
        "이력과 연결 파일을 포함한 백업을 받았습니다. 안전한 별도 위치에 보관해 주세요.",
      );
    }, { readOnly: true }),
  );
  $("noticeBackup").addEventListener("click", () => $("backupTask").click());   // 첫 줄 안내의 '백업 받기'는 3단계 단추와 같은 일
  $("handoverTask").addEventListener("click", () =>
    action(async () => {
      const { guide } = await handover();
      say(guide.recovery.length ? "복구용 요약을 열었습니다. 확인하지 못한 연결 파일이 있습니다."
        : "선택한 과업판의 인수인계 요약을 확인했습니다. 과업 이력은 바뀌지 않았습니다.");
    }, { readOnly: true }),
  );
  function downloadSummary(wantRecovery) {
    return action(async () => {
      const { manifest, guide } = await handover(), recovery = guide.recovery.length > 0;
      if (recovery !== wantRecovery) {
        const next = recovery ? "downloadRecoveryHandover" : "downloadHandover";
        say(recovery ? "연결 파일을 확인하지 못했습니다. 복구용 요약을 검토한 뒤 받으세요."
          : "연결 파일을 확인했습니다. 일반 인수인계 요약을 받으세요.");
        requestAnimationFrame(() => $(next).focus());
        return;
      }
      const kind = recovery ? "recovery" : "internal";
      D.saveBytes(`renewmap-${kind}-handover-${manifest.id}-v${manifest.revision}.txt`, guide.text, "text/plain;charset=utf-8");
      say(recovery ? "복구용 인수인계 요약을 받았습니다. 텍스트에는 복원용 파일이 들어 있지 않습니다."
        : "인수인계 요약을 받았습니다. 복원용 JSON 백업도 별도로 보관해 주세요.");
    }, { readOnly: true });
  }
  $("downloadHandover").addEventListener("click", () => downloadSummary(false));
  $("downloadRecoveryHandover").addEventListener("click", () => downloadSummary(true));
  $("selectedDelivery").addEventListener("click", () =>
    action(async () => {
      const base = current, names = [...deliveryPicks], versions = history.slice();
      if (!base || deliveryHead !== base.hash || !names.length)
        throw new Error("현재 판에서 전달할 파일을 선택해 주세요.");
      await requireCurrentExport(base.id, base.hash);
      const picked = new Set(names);
      const hashes = new Set(base.artifacts.filter(file => picked.has(file.name)).map(file => file.sha256));
      const entries = await Promise.all([...hashes].map(sha => F.doc(`task-file:${base.id}:${sha}`)));
      const selected = await B.selectedZip(versions, names, entries);
      const data = D.zipStore(selected.entries, D.localDate());
      await requireCurrentExport(base.id, base.hash);
      D.saveBytes(
        `renewmap-selected-v${selected.receipt.revision}.zip`,
        data,
        "application/zip",
      );
      say("선택한 파일 " + selected.receipt.selected_count + "개의 전달 묶음을 받았습니다.");
    }, { readOnly: true }),
  );
  $("zipTask").addEventListener("click", () =>
    action(async () => {
      const { saved: b, guide } = await handover({ recover: false });
      const data = D.zipStore(B.zipEntries(b, guide.text), D.localDate());
      await requireCurrentExport(b.manifest.id, b.manifest.head_hash);
      D.saveBytes(
        `renewmap-internal-history-${b.manifest.id}-v${b.manifest.revision}.zip`,
        data,
        "application/zip",
      );
      say("과거 판과 검토 기록이 담긴 내부 보관용 전체 이력 ZIP을 받았습니다.");
    }, { readOnly: true }),
  );
  $("reconnectTaskFile").addEventListener("click", () => {
    const file = $("reconnectFile").files[0], selected = current;
    action(async () => {
      if (!selected || $("handoverRecovery").hidden)
        throw new Error("복구할 과업을 선택하고 인수인계 요약을 먼저 열어 주세요.");
      const { base, entries } = await exportInputs();
      await requireCurrentExport(selected.id, selected.hash);
      const check = await B.inspectRecovery(await S.history(base.id), entries);
      if (!check.issues.length) {
        await handover();
        say("연결 파일이 이미 확인됐습니다. 일반 요약과 전체 백업을 받을 수 있습니다.");
        requestAnimationFrame(() => $("downloadHandover").focus());
        return;
      }
      const matched = await B.matchRecoveryFile(check, file);
      const id = ["task-file", base.id, matched.sha256].join(":");
      const prior = await F.doc(id);
      const saved = entries.find(row => row.sha256 === matched.sha256);
      if ((prior && (prior.kind !== "task-file" || prior.task_id !== base.id || prior.sha256 !== matched.sha256)) || prior?.id !== saved?.id)
        throw new Error("보관 파일의 연결 정보를 확인할 수 없습니다. 과업을 다시 열어 주세요.");
      const others = entries.filter(row => row.id !== id);
      if (others.length >= 500 || others.reduce((n, row) => n + (row.blob?.size ?? 0), matched.size) > B.MAX)
        throw new Error("과업의 전체 보관 파일은 500개·20MB 이하여야 합니다.");
      await requireCurrentExport(base.id, base.hash);
      // 원장과 일치하는 바이트만 해당 과업의 같은 저장 위치에 한 번 쓴다.
      await F.addDoc({ ...matched, id, kind: "task-file", task_id: base.id, created_at: prior?.created_at ?? new Date().toISOString() });
      const { guide } = await handover();
      const left = guide.recovery.length;
      say(left
        ? "원본 파일을 복구했습니다. 연결 파일 " + left + "개 확인이 남았습니다."
        : "원본 파일을 복구했습니다. 일반 요약과 전체 백업을 다시 받을 수 있습니다.");
      requestAnimationFrame(() => $(left ? "reconnectFile" : "downloadHandover").focus());
    });
  });
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
      "이력·파일 확인값 검사를 통과한 기록을 보관했습니다. 작성자 신원·기관 결정의 진위는 별도 확인 대상입니다.",
    );
  }
  action(async () => {
    await select(new URL(location.href).searchParams.get("id") || "");
    await loadPackets();
    const entry = new URL(location.href).searchParams.get("step");
    const panels = { survey: 1, revisit: 1, delivery: 2, review: 3 };
    if (Object.hasOwn(panels, entry)) {
      step(panels[entry]);
      if (entry === "survey") $("surveyChanges").open = true;
      if (entry === "revisit") $("revisitReport").open = true;
      if (entry === "delivery" && location.hash === "#handoverSummary" && current) {
        $("handoverHeading").focus({ preventScroll: true });
        $("handoverSummary").scrollIntoView({ block: "start" });
      }
    }
    if (window.RenewTaskCloudUI)
      cloud = window.RenewTaskCloudUI.mount({
        getBackup: backup,
        restoreBackup: (b) => restoreBackup(b, true),
        run: action,
        notify: say,
      });
  });
})();
