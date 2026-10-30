// 입안요건 사전검토 화면. 법정동 건물 파일(정적)만 받고, 붙여 넣은 목록·결과는 기기 밖으로 보내지 않는다.
(function () {
  "use strict";
  const R = window.Redev, D = window.RenewDocgen;
  const $ = (id) => document.getElementById(id);
  const DATA = "../data/";
  const getJson = (p) => fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  const templates = getJson("report_templates.json").then((t) => D.setTemplates(t));
  let last = null;   // {res, m, file}

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
})();
