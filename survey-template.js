// 원본 서식의 시트·서식·인쇄 설정을 보존하기 위해 지정한 워크시트 XML의 빈 칸만 바꾼다.
(function () {
  "use strict";
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const OFFICE =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const MAX_FILE = 10 * 1024 * 1024;
  let loading;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!loading)
      loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "vendor/office/jszip.min.js";
        script.onload = () => resolve(window.JSZip);
        script.onerror = () => {
          loading = null;
          script.remove();
          reject(new Error("제출서식 읽기 도구를 불러오지 못했습니다."));
        };
        document.head.append(script);
      });
    return loading;
  }
  function address(value) {
    const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(value);
    if (match) {
      const column = [...match[1]].reduce(
        (n, ch) => n * 26 + ch.charCodeAt(0) - 64,
        0,
      );
      if (column <= 16384 && Number(match[2]) <= 1048576)
        return { col: column, row: Number(match[2]), letters: match[1] };
    }
    throw new Error("셀 주소를 B3처럼 입력해 주세요.");
  }
  const elements = (node, tag) =>
    Array.from(node.getElementsByTagNameNS(NS, tag));
  function readXML(zip, path, budget) {
    const part = zip.file(path);
    if (!part) throw new Error("제출서식에 필요한 문서 항목이 없습니다.");
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      const stream = part.internalStream("uint8array");
      stream.on("data", (chunk) => {
        size += chunk.length;
        budget.remaining -= chunk.length;
        if (size > MAX_FILE || budget.remaining < 0) {
          stream.pause();
          reject(new Error("제출서식 시트가 너무 큽니다."));
        } else chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", async () => {
        try {
          const source = await new Blob(chunks).text();
          if (/<!DOCTYPE|<!ENTITY/i.test(source))
            throw new Error("사용할 수 없는 XML 형식입니다.");
          const doc = new DOMParser().parseFromString(
            source,
            "application/xml",
          );
          if (doc.getElementsByTagName("parsererror").length)
            throw new Error("제출서식 XML을 읽을 수 없습니다.");
          resolve(doc);
        } catch (error) {
          reject(error);
        }
      });
      stream.resume();
    });
  }
  function putCell(doc, pos, text, ranges) {
    const at = address(pos);
    for (const [start, end] of ranges) {
      if (
        at.row >= start.row &&
        at.row <= end.row &&
        at.col >= start.col &&
        at.col <= end.col &&
        (at.row !== start.row || at.col !== start.col)
      )
        throw new Error("병합된 칸은 왼쪽 위 셀을 지정해 주세요.");
    }
    const data = elements(doc, "sheetData")[0];
    if (!data) throw new Error("제출서식의 시트에 입력할 수 없습니다.");
    const rows = elements(data, "row");
    let row = rows.find((el) => Number(el.getAttribute("r")) === at.row);
    if (!row) {
      row = doc.createElementNS(NS, "row");
      row.setAttribute("r", String(at.row));
      data.insertBefore(
        row,
        rows.find((el) => Number(el.getAttribute("r")) > at.row) || null,
      );
    }
    const cells = elements(row, "c");
    let cell = cells.find((el) => el.getAttribute("r") === pos);
    if (!cell) {
      cell = doc.createElementNS(NS, "c");
      cell.setAttribute("r", pos);
      row.insertBefore(
        cell,
        cells.find((el) => address(el.getAttribute("r")).col > at.col) ||
          Array.from(row.children).find((el) => el.localName === "extLst") ||
          null,
      );
    } else if (
      elements(cell, "f").length ||
      [...elements(cell, "v"), ...elements(cell, "t")].some(
        (el) => el.textContent.length,
      )
    ) {
      throw new Error(
        pos + "에 기존 값이나 수식이 있습니다. 빈 입력 칸을 지정해 주세요.",
      );
    }
    cell.setAttribute("t", "inlineStr");
    for (const el of [...elements(cell, "is"), ...elements(cell, "v")])
      el.remove();
    const inline = doc.createElementNS(NS, "is"),
      value = doc.createElementNS(NS, "t");
    value.setAttributeNS(
      "http://www.w3.org/XML/1998/namespace",
      "xml:space",
      "preserve",
    );
    value.textContent = text;
    inline.appendChild(value);
    cell.insertBefore(inline, cell.firstChild);
    row.removeAttribute("spans");
    const dim = elements(doc, "dimension")[0];
    if (dim) {
      const [first, last = first] = dim
        .getAttribute("ref")
        .split(":")
        .map(address);
      const minCol = first.col <= at.col ? first.letters : at.letters,
        maxCol = last.col >= at.col ? last.letters : at.letters;
      dim.setAttribute(
        "ref",
        minCol +
          Math.min(first.row, at.row) +
          ":" +
          maxCol +
          Math.max(last.row, at.row),
      );
    }
  }
  async function fill(file, entries) {
    if (
      !(file instanceof Blob) ||
      !file.size ||
      file.size > MAX_FILE ||
      !/\.xlsx$/i.test(file.name || "")
    )
      throw new Error("10MB 이하의 XLSX 제출서식을 선택해 주세요.");
    if (!Array.isArray(entries) || !entries.length || entries.length > 500)
      throw new Error("제출 칸은 1~500개로 지정해 주세요.");
    const bySheet = new Map();
    for (const e of entries) {
      if (
        !e ||
        typeof e.sheet !== "string" ||
        !e.sheet.trim() ||
        typeof e.cell !== "string" ||
        typeof e.text !== "string" ||
        !e.text.trim() ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(e.text)
      )
        throw new Error("제출할 시트·셀·기입 문구를 확인해 주세요.");
      const pos = e.cell.trim().toUpperCase();
      address(pos);
      if (!bySheet.has(e.sheet)) bySheet.set(e.sheet, new Map());
      const cells = bySheet.get(e.sheet);
      if (cells.has(pos))
        throw new Error("같은 제출 칸에 두 행을 기입할 수 없습니다.");
      const value = e.text;
      if (value.length > 32767)
        throw new Error("한 칸에 넣을 글이 너무 깁니다.");
      cells.set(pos, value);
    }
    const Zip = await loadZip(),
      zip = await Zip.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files);
    if (
      names.length > 2500 ||
      names.some((n) => /vbaProject|^_xmlsignatures\/|^xl\/activeX\//i.test(n))
    )
      throw new Error(
        "매크로·서명 서식이나 복잡한 서식은 빈 XLSX 사본을 사용해 주세요.",
      );
    const budget = { remaining: 32 * 1024 * 1024 };
    const workbook = await readXML(zip, "xl/workbook.xml", budget),
      rels = await readXML(zip, "xl/_rels/workbook.xml.rels", budget);
    const relationships = Array.from(
      rels.getElementsByTagNameNS(REL, "Relationship"),
    );
    const serialize = (doc) => new XMLSerializer().serializeToString(doc);
    for (const [sheetName, cells] of bySheet) {
      const sheet = elements(workbook, "sheet").find(
        (s) => s.getAttribute("name") === sheetName,
      );
      const relationship =
        sheet &&
        relationships.find(
          (r) => r.getAttribute("Id") === sheet.getAttributeNS(OFFICE, "id"),
        );
      if (
        !relationship ||
        relationship.getAttribute("Type") !== OFFICE + "/worksheet" ||
        relationship.getAttribute("TargetMode") === "External"
      )
        throw new Error("지정한 시트를 찾지 못했습니다: " + sheetName);
      const target = relationship.getAttribute("Target").replace(/^\/xl\//, "");
      if (!/^worksheets\/[^\\/:%?#]+\.xml$/.test(target))
        throw new Error("지원하지 않는 워크시트 경로입니다.");
      const path = "xl/" + target,
        doc = await readXML(zip, path, budget);
      if (elements(doc, "sheetProtection").length)
        throw new Error("입력할 수 있는 보호 해제된 서식을 선택해 주세요.");
      const ranges = elements(doc, "mergeCell").map((el) => {
        const [first, last = first] = el
          .getAttribute("ref")
          .split(":")
          .map(address);
        return [first, last];
      });
      for (const [pos, text] of cells) putCell(doc, pos, text, ranges);
      zip.file(path, serialize(doc));
    }
    const result = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });
    if (result.length > MAX_FILE)
      throw new Error("기입한 제출서식이 10MB를 넘습니다.");
    return result;
  }
  window.RenewSurveyTemplate = Object.freeze({ fill });
})();
