// 실적보고서 시트에는 축소 그림을 싣고 원본은 납품 ZIP의 파일 지문으로 찾는다.
(function () {
  "use strict";
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const office =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const pkg = "http://schemas.openxmlformats.org/package/2006/relationships";
  const drawing =
    "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
  const art = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const maxBytes = 20 * 1024 * 1024;
  const mime =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  async function thumbnail(blob, maxW = 220, maxH = 140, quality = 0.82) {
    if (!(blob instanceof Blob) || !blob.size || blob.size > maxBytes)
      throw new Error("사진 파일의 크기를 확인해 주세요. 각 파일은 20MB 이하여야 합니다.");
    let bitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      throw new Error(
        "사진을 열지 못했습니다. 유효한 JPEG·PNG·WebP 사진을 선택해 주세요.",
      );
    }
    try {
      const scale = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const jpg = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!jpg) throw new Error("보고서용 사진을 만들지 못했습니다.");
      return {
        bytes: await jpg.arrayBuffer(),
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      bitmap.close();
    }
  }

  function anchor(id, mediaId, col, row, width, height) {
    const x = width * 9525,
      y = height * 9525;
    const section = col === 1 ? "최초 조사" : "준공 후 재방문";
    return `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from><xdr:ext cx="${x}" cy="${y}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="사진 ${id}" descr="${section}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId${mediaId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${x}" cy="${y}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  }

  async function xml(zip, path) {
    const item = zip.file(path);
    if (!item) throw new Error("실적보고서의 사진 시트를 찾을 수 없습니다.");
    const doc = new DOMParser().parseFromString(
      await item.async("string"),
      "application/xml",
    );
    if (doc.getElementsByTagName("parsererror").length)
      throw new Error("실적보고서 XML이 손상되었습니다.");
    return doc;
  }

  // 이 함수에는 리뉴맵이 방금 생성한 보고서만 전달한다. 기관 원본 서식은 별도 경로에서 기입한다.
  async function embed(workbook, pairs) {
    if (
      !(workbook instanceof Blob) ||
      workbook.size > maxBytes ||
      !Array.isArray(pairs)
    )
      throw new Error("실적보고서 입력을 확인해 주세요.");
    const Zip = await window.RenewSurveyTemplate.loadZip();
    const zip = await Zip.loadAsync(await workbook.arrayBuffer());
    const path = "xl/worksheets/sheet3.xml";
    const book = await xml(zip, "xl/workbook.xml");
    const sheet = await xml(zip, path);
    const rows = [...sheet.getElementsByTagNameNS(main, "row")].slice(1);
    if (
      book.getElementsByTagNameNS(main, "sheet")[2]?.getAttribute("name") !==
        "전후 사진" ||
      rows.length !== pairs.length ||
      zip.file("xl/worksheets/_rels/sheet3.xml.rels")
    )
      throw new Error("실적보고서 사진 행과 원본 목록이 다릅니다.");
    const parts = { date: zip.file(path).date, createFolders: false };
    const serializer = new XMLSerializer();
    const media = new Map(),
      anchors = [];
    let bytes = 0;
    for (const [index, pair] of pairs.entries()) {
      const row = Number(rows[index].getAttribute("r")) - 1;
      if (row !== index + 1)
        throw new Error("실적보고서의 사진 행 번호가 다릅니다.");
      for (const [col, blob] of [
        [1, pair.before],
        [2, pair.after],
      ]) {
        if (!blob) continue;
        if (!media.has(blob)) {
          const image = await thumbnail(blob);
          const id = media.size + 1;
          bytes += image.bytes.byteLength;
          if (bytes > maxBytes)
            throw new Error("보고서 사진 묶음이 너무 큽니다.");
          zip.file("xl/media/revisit" + id + ".jpg", image.bytes, parts);
          media.set(blob, { id, width: image.width, height: image.height });
        }
        const img = media.get(blob);
        anchors.push(
          anchor(anchors.length + 1, img.id, col, row, img.width, img.height),
        );
        rows[index].setAttribute("ht", "110");
        rows[index].setAttribute("customHeight", "1");
      }
    }
    if (!anchors.length) return workbook;
    for (const c of sheet.getElementsByTagNameNS(main, "col")) {
      if (["2", "3"].includes(c.getAttribute("min")))
        c.setAttribute("width", "34");
    }
    const ref = sheet.createElementNS(main, "drawing");
    ref.setAttributeNS(office, "r:id", "rIdPhotos");
    sheet.documentElement.appendChild(ref);
    zip.file(path, serializer.serializeToString(sheet), parts);
    const types = await xml(zip, "[Content_Types].xml");
    const ns = types.documentElement.namespaceURI;
    const jpg = types.createElementNS(ns, "Default");
    jpg.setAttribute("Extension", "jpg");
    jpg.setAttribute("ContentType", "image/jpeg");
    types.documentElement.insertBefore(jpg, types.documentElement.firstChild);
    const override = types.createElementNS(ns, "Override");
    override.setAttribute("PartName", "/xl/drawings/revisit.xml");
    override.setAttribute(
      "ContentType",
      "application/vnd.openxmlformats-officedocument.drawing+xml",
    );
    types.documentElement.appendChild(override);
    zip.file("[Content_Types].xml", serializer.serializeToString(types), parts);
    zip.file(
      "xl/worksheets/_rels/sheet3.xml.rels",
      `<Relationships xmlns="${pkg}"><Relationship Id="rIdPhotos" Type="${office}/drawing" Target="../drawings/revisit.xml"/></Relationships>`,
      parts,
    );
    zip.file(
      "xl/drawings/revisit.xml",
      `<xdr:wsDr xmlns:xdr="${drawing}" xmlns:a="${art}" xmlns:r="${office}">${anchors.join("")}</xdr:wsDr>`,
      parts,
    );
    const rels = [...media.values()].map(
      (img) =>
        `<Relationship Id="rId${img.id}" Type="${office}/image" Target="../media/revisit${img.id}.jpg"/>`,
    );
    zip.file(
      "xl/drawings/_rels/revisit.xml.rels",
      `<Relationships xmlns="${pkg}">${rels.join("")}</Relationships>`,
      parts,
    );
    const result = await zip.generateAsync({
      type: "blob",
      mimeType: mime,
      compression: "DEFLATE",
    });
    if (result.size > maxBytes)
      throw new Error("사진을 포함한 실적보고서가 20MB를 넘습니다.");
    return result;
  }
  // PNG·WebP에 위치·설명이 들어갈 수 있는 덩어리가 있는가. 모양이 어긋나면 있다고 본다(다시 만든다)
  function hasMeta(b) {
    const tag = (p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    const be = (p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    const le = (p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
    if (b.length > 8 && b[0] === 0x89 && tag(1) === "PNG\r") {
      for (let p = 8; p + 8 <= b.length; p += 12 + be(p)) {
        const t = tag(p + 4);
        if (["eXIf", "tEXt", "zTXt", "iTXt"].includes(t)) return true;
        if (t === "IEND") return false;
      }
      return true;
    }
    if (b.length > 12 && tag(0) === "RIFF" && tag(8) === "WEBP") {
      for (let p = 12; p + 8 <= b.length; p += 8 + le(p + 4) + (le(p + 4) & 1)) {
        if (["EXIF", "XMP "].includes(tag(p))) return true;
      }
      return false;
    }
    return true;
  }

  // 직접 고른 사진 중 메타데이터(GPS·기기 정보)가 있는 것만 캔버스로 다시 만들어 지운다(privacy.html 약속과 같게).
  // 메타데이터가 없는 사진은 바이트를 그대로 둔다: 현장 기록 지문(photo_sha256)과 원본 파일 지문이 그대로여야 한다
  // (2026-11-28 공개판 survey_change_smoke가 PNG까지 다시 만든 것을 잡았다). JPEG는 현장 기록과 같은 checkPhoto로, PNG·WebP는 덩어리 이름으로 본다.
  async function clean(file) {
    const R = window.FieldRecord;
    if (file instanceof Blob && file.size) {
      const type = file.type || "";
      if (R && /^image\/jpeg$/i.test(type)) {
        try {
          R.checkPhoto(new Uint8Array(await file.arrayBuffer()));
          return file;
        } catch {
          // 메타데이터가 있거나 손상된 JPEG → 아래에서 다시 만든다(못 열면 thumbnail이 알린다)
        }
      } else if (/^image\/(png|webp)$/i.test(type) && !hasMeta(new Uint8Array(await file.arrayBuffer()))) {
        return file;
      }
    }
    const image = await thumbnail(file, 2560, 2560, 0.9);
    const name = String(file.name || "사진").replace(/\.[^.]*$/, "") + ".jpg";
    return new File([image.bytes], name, { type: "image/jpeg" });
  }
  window.RenewRevisitPhotos = Object.freeze({ embed, clean });
})();
