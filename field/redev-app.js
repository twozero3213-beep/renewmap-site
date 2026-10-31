// 입안요건 사전검토 화면. 법정동 건물 파일(정적)만 받고, 붙여 넣은 목록·결과는 기기 밖으로 보내지 않는다.
(function () {
  "use strict";
  const R = window.Redev, D = window.RenewDocgen;
  const $ = (id) => document.getElementById(id);
  const DATA = "../data/";
  const getJson = (p) => fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const templates = getJson("report_templates.json").then((t) => D.setTemplates(t));
  let last = null;   // {res, m, file}

  // 구·군 → 법정동 목록(buildings/index.json). 부산 조례 기준만 계산하므로 부산(26)만 싣는다. 목록을 못 받으면 HTML의 해운대구 8개 동 그대로 쓴다
  const BUSAN = "26";
  getJson("buildings/index.json").then((idx) => {
    const gus = idx.sigungu.filter((s) => s.code.startsWith(BUSAN) && s.dongs.length);
    if (!gus.length) return;
    const fill = (sel, items, pick) => sel.replaceChildren(...items.map(([v, t]) => { const o = new Option(t, v); o.selected = v === pick; return o; }));
    const showDongs = (gu, pick) => fill($("dong"), gus.find((s) => s.code === gu).dongs.map((d) => [d.code, `${d.name} (${d.count.toLocaleString("ko-KR")}동)`]), pick);
    fill($("gu"), gus.map((s) => [s.code, s.name]), "26350");
    showDongs("26350", $("dong").value);
    $("gu").addEventListener("change", () => showDongs($("gu").value));
    const n = gus.reduce((s, g) => s + g.dongs.length, 0);
    $("coverage").textContent = `부산 ${gus.length}개 구·군 ${n}개 법정동의 건축물대장을 담았습니다. 다른 시·도는 그 조례를 확인한 뒤 엽니다.`;
  }).catch(() => {});

  const say = (text, err) => { $("msg").textContent = text; $("msg").className = err ? "msg err" : "msg"; };
  const today = () => { const t = new Date(), p = (n) => String(n).padStart(2, "0"); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; };
  const opt = () => ({ secret: $("secret").checked });
  const fileName = (ext) => `${opt().secret ? "대외비_" : ""}${last.file.name}_입안요건_사전검토_승인전_${today()}.${ext}`;

  // 예시: 고른 법정동의 모든 지번을 넣고 계산한다(사업계획서의 반여동 숫자를 버튼 하나로 다시 얻는다). 특정 구역을 짚지 않으려고 동 전체만 쓴다
  $("demo").addEventListener("click", async () => {
    let file;
    try { file = await getJson(`buildings/${$("dong").value}.json`); } catch (err) { return say("건축물대장 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
    $("list").value = [...new Set(file.buildings.map((b) => b.jibun).filter(Boolean))].join("\n");
    $("area").value = "";
    $("f").requestSubmit();
  });

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = R.parseList($("list").value);
    if (!p.items.length) return say("지번을 한 줄에 하나씩 넣어 주세요.", true);
    const areaRaw = $("area").value.trim(), areaM2 = areaRaw === "" ? null : Number(areaRaw);
    if (areaM2 !== null && !(areaM2 >= 0)) return say("구역 면적은 숫자로 넣어 주세요.", true);
    say("건축물대장 자료를 여는 중입니다.");
    let file;
    try { file = await getJson(`buildings/${$("dong").value}.json`); } catch (err) { return say("건축물대장 자료를 열지 못했습니다.\n인터넷 연결을 확인해 주세요.", true); }
    const m = R.match(p.items, file);
    if (!m.buildings.length) return say(`목록에서 찾은 건물이 없습니다.\n${file.name} 지번이 맞는지 확인해 주세요.`, true);
    const res = R.review(m.buildings, { ref: file.age_reference_date, district: $("district").checked, areaM2 });
    last = { res, m, file };
    const skipped = [...(p.bad.length ? [`지번으로 읽지 못한 칸 ${p.bad.length}개`] : []), ...(m.missing.length ? [`대장에 없는 지번 ${m.missing.length}개(${m.missing.slice(0, 5).join(", ")}${m.missing.length > 5 ? " 등" : ""})`] : []),
      ...(m.otherDong.length ? [`다른 법정동 ${m.otherDong.length}개`] : [])];
    say(skipped.length ? `제외: ${skipped.join(" · ")}` : "");
    $("outBase").textContent = `${file.name} 건물 ${res.n}동 · 기준 ${res.thr}% · 경과 기준일 ${D.govDate(res.ref)} · 건축물대장 기준일 ${D.govDate(file.hub_reference_date)}`;
    $("viz").innerHTML = R.summaryHTML(res);   // 그림 요약(종합 판정 아님)
    $("lines").replaceChildren(...res.lines.map((l) => {
      const li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("small");
      li.dataset.status = l.status;
      b.textContent = `${l.label} · ${l.status}`;
      s.textContent = `기준 ${l.rule} · 이 목록 ${l.value} · ${l.basis}`;
      li.append(b, s);
      if (l.field && l.status === R.CHECK) {   // 현장에서 볼 수 있는 줄은 현장 기록으로 바로 넘긴다(같은 앱, 항목이 미리 골라진다)
        const a = document.createElement("a");
        a.href = `./?check=${l.field}`; a.textContent = "현장 기록으로 확인하기";
        li.append(a);
      }
      return li;
    }));
    $("out").hidden = false;
    $("out").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const doc = async () => { await templates; return R.buildDoc(last.res, last.m, last.file, today(), opt()); };
  $("hwpx").addEventListener("click", async () => {
    try { D.saveBytes(fileName("hwpx"), D.hwpxBytes(await doc()), "application/hwp+zip"); } catch (err) { say("문서를 만들지 못했습니다.\nPDF로 저장해 보세요.", true); }
  });
  $("pdf").addEventListener("click", async () => {
    const box = $("printDoc");
    box.innerHTML = D.docHTML(await doc()).html;
    document.body.classList.add("printing");
    window.addEventListener("afterprint", () => { document.body.classList.remove("printing"); box.textContent = ""; }, { once: true });
    window.print();
  });
  $("csv").addEventListener("click", () => D.saveBytes(fileName("csv"), R.toCSV(last.res, last.file, opt()), "text/csv;charset=utf-8"));
  $("sample").addEventListener("click", () => D.saveBytes(fileName("csv").replace("_사전검토_", "_수기대조표본_"), R.sampleCSV(last.res, last.file, opt()), "text/csv;charset=utf-8"));
  // 현장 앱(sw.js)이 이 쪽도 맡는다. 새 판이 자리를 잡으면 옛 계산 파일로 문서를 받지 않게 새로고침을 알린다
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener("controllerchange", () => say("계산 파일의 새 판을 받았습니다. 새로고침한 뒤 다시 계산하세요."));
})();
