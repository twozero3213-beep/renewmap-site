// 사진 자동 비식별 보조: 얼굴(MediaPipe BlazeFace)과 번호판 후보(Tesseract 숫자 읽기)를 찾아 가림 상자를 돌려준다.
// 모델·엔진은 landing/vendor/vision/에 같이 두었고 이 기기 안에서만 돈다(서버 전송 없음). 처음 쓸 때만 불러온다.
// 완벽하지 않다: 작게 찍힌 얼굴·가려진 번호판은 놓칠 수 있어, 앱은 자동 결과와 상관없이 사람의 가림 확인을 요구한다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) root.FieldDetect = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const BASE = new URL("../vendor/vision/", (typeof document !== "undefined" && document.currentScript && document.currentScript.src) || "http://localhost/field/detect.js").href;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // 상자를 사방으로 pad 비율만큼 키우고 사진 안으로 자른다
  function padBox(b, W, H, pad) {
    const dx = b.w * pad, dy = b.h * pad, x0 = clamp(b.x - dx, 0, W), y0 = clamp(b.y - dy, 0, H), x1 = clamp(b.x + b.w + dx, 0, W), y1 = clamp(b.y + b.h + dy, 0, H);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const area = (b) => b.w * b.h;
  function overlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  // 많이 겹치는 상자는 하나로 합친다(타일 검출이 같은 얼굴을 두 번 잡는 경우)
  function mergeBoxes(boxes, ratio = 0.5) {
    const out = [];
    for (const b of boxes) {
      const i = out.findIndex((o) => overlap(o, b) / Math.min(area(o), area(b)) >= ratio);
      if (i < 0) out.push({ ...b });
      else { const o = out[i], x0 = Math.min(o.x, b.x), y0 = Math.min(o.y, b.y), x1 = Math.max(o.x + o.w, b.x + b.w), y1 = Math.max(o.y + o.h, b.y + b.h); out[i] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
    }
    return out;
  }
  // 번호판 후보: 숫자 4~8자리 낱말. 한글 칸은 숫자 읽기에서 빠져 앞자리와 뒷자리가 붙어 나오기도(12가 3456 → 123456) 하고 떨어져 나오기도 한다.
  // 4자리만 나오면 왼쪽 앞자리·한글 칸까지 넓힌다. 건물 번호 같은 숫자도 가려질 수 있으나 가리는 쪽이 안전하다.
  // words: [{text, bbox:{x0,y0,x1,y1}}]
  function plateBoxes(words, W, H) {
    const out = [];
    for (const w of words || []) {
      const t = String(w.text || "").replace(/\s+/g, "");
      const bb = w.bbox;
      if (!bb || !/^\d{4,8}$/.test(t)) continue;
      const bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
      if (bh < 10 || bw < bh * 0.8 || bw > bh * 1.1 * t.length) continue;      // 너무 작거나 글자 모양이 아닌 상자는 건너뛴다
      const four = t.length === 4;
      out.push(padBox({ x: four ? bb.x0 - bw * 1.05 : bb.x0, y: bb.y0, w: four ? bw * 2.05 : bw, h: bh }, W, H, 0.18));
    }
    return mergeBoxes(out);
  }
  const wordsOf = (data) => {
    if (data.words && data.words.length) return data.words;
    const out = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) out.push(w);
    return out;
  };

  let facePromise = null, ocrPromise = null;
  function faceDetector() {
    return facePromise || (facePromise = (async () => {
      const mp = await import(BASE + "mediapipe/vision_bundle.mjs");
      const fileset = await mp.FilesetResolver.forVisionTasks(BASE + "mediapipe");
      return mp.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: BASE + "models/blaze_face_short_range.tflite", delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.35 });
    })().catch((e) => { facePromise = null; throw e; }));
  }
  // 얼굴: 전체 + 겹치는 2×2 조각(작게 찍힌 얼굴을 위해 확대해서)을 돌려 합친다
  async function findFaces(canvas) {
    const det = await faceDetector(), W = canvas.width, H = canvas.height, boxes = [];
    const run = (src, ox, oy, scale) => { for (const d of det.detect(src).detections) { const b = d.boundingBox; boxes.push({ x: ox + b.originX / scale, y: oy + b.originY / scale, w: b.width / scale, h: b.height / scale }); } };
    run(canvas, 0, 0, 1);
    const tw = Math.round(W * 0.6), th = Math.round(H * 0.6);
    for (const [ox, oy] of [[0, 0], [W - tw, 0], [0, H - th], [W - tw, H - th]]) {
      const t = document.createElement("canvas"); t.width = tw; t.height = th;
      t.getContext("2d").drawImage(canvas, ox, oy, tw, th, 0, 0, tw, th);
      run(t, ox, oy, 1);
    }
    return mergeBoxes(boxes).map((b) => padBox(b, W, H, 0.25));
  }
  function ocrWorker() {
    return ocrPromise || (ocrPromise = (async () => {
      await new Promise((ok, no) => { const s = document.createElement("script"); s.src = BASE + "tesseract/tesseract.min.js"; s.onload = ok; s.onerror = () => no(new Error("번호판 읽기 도구를 불러오지 못했다")); document.head.append(s); });
      const w = await window.Tesseract.createWorker("eng", 1, { workerPath: BASE + "tesseract/worker.min.js", corePath: BASE + "tesseract/core", langPath: BASE + "models", gzip: true, workerBlobURL: false });
      await w.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "6" });   // 6: 한 덩어리 글자 모드. 11(흩어진 글자)은 번호판 한 줄을 못 읽었다(2026-10-27 시험)
      return w;
    })().catch((e) => { ocrPromise = null; throw e; }));
  }
  // 전체와 겹치는 2×2 조각을 읽는다. 조각 좌표는 사진 좌표로 되돌려 합친다
  async function findPlates(canvas) {
    const w = await ocrWorker(), W = canvas.width, H = canvas.height, boxes = [];
    const read = async (src, ox, oy) => {
      const { data } = await w.recognize(src, {}, { blocks: true });
      for (const b of plateBoxes(wordsOf(data), src.width, src.height)) boxes.push({ x: b.x + ox, y: b.y + oy, w: b.w, h: b.h });
    };
    await read(canvas, 0, 0);
    const tw = Math.round(W * 0.6), th = Math.round(H * 0.6);
    for (const [ox, oy] of [[0, 0], [W - tw, 0], [0, H - th], [W - tw, H - th]]) {
      const t = document.createElement("canvas"); t.width = tw; t.height = th;
      t.getContext("2d").drawImage(canvas, ox, oy, tw, th, 0, 0, tw, th);
      await read(t, ox, oy);
    }
    return mergeBoxes(boxes).map((b) => padBox(b, W, H, 0));
  }
  // 둘 중 하나가 실패해도 다른 하나의 결과는 쓴다. 실패 사유는 errors에 담는다
  async function findAll(canvas) {
    const out = { faces: [], plates: [], errors: [] };
    try { out.faces = await findFaces(canvas); } catch (e) { out.errors.push("얼굴 찾기: " + (e && e.message ? e.message : e)); }
    try { out.plates = await findPlates(canvas); } catch (e) { out.errors.push("번호판 찾기: " + (e && e.message ? e.message : e)); }
    return out;
  }
  return { padBox, mergeBoxes, plateBoxes, wordsOf, findFaces, findPlates, findAll };
});
