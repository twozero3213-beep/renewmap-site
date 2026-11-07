// 현재 건물 3D 보기에서 건물을 누르면, 누른 자리의 GIS건물통합정보 외곽선(data/bldg_outline)으로 우리 건축물대장 행을 찾아 보여 준다.
// 브이월드 3D 건물에는 대장 번호가 없어서 위치로 잇는다. 외곽선 파일이 있는 법정동만 된다(2026-11-07: 부산 건축물대장 파일이 있는 법정동 254곳).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.City3dPick = factory();
})(this, function () {
  "use strict";
  // ring: [lng,lat,lng,lat,...] 바깥 고리. 짝홀 규칙
  function inRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inBox = (lng, lat, b) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
  // index: bldg_outline/index.json → 누른 자리를 담을 수 있는 법정동 코드들
  const candidates = (index, lng, lat) => Object.entries(index.files).filter(([, f]) => inBox(lng, lat, f.bbox)).map(([code]) => code);
  // file.items: [mgm_bld_pk, match, height_m, floors, pnu, ring]. 겹치면 작은 외곽선(안쪽 건물)을 고른다
  function pickItem(file, lng, lat) {
    const area = (r) => { let s = 0; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) s += (r[j] - r[i]) * (r[j + 1] + r[i + 1]); return Math.abs(s); };
    const hits = file.items.filter((it) => inRing(lng, lat, it[5]));
    return hits.length ? hits.reduce((a, b) => (area(b[5]) < area(a[5]) ? b : a)) : null;
  }
  const MATCH = { 1: "필지·사용승인일·연면적이 대장 한 건과 일치", 2: "필지·연면적이 대장 한 건과 일치", 3: "필지·사용승인일이 대장 한 건과 일치" };
  // 화면에 보일 줄 [이름, 값]. 대장을 못 찾으면 외곽선 자료의 값만 보인다
  function describe(item, bld, outline) {
    const [pk, match, h, floors, pnu] = item;
    const rows = [["필지(PNU)", pnu]];
    if (bld) {
      rows.push(["지번", bld.jibun], ["주용도", bld.main_use || "-"], ["구조", bld.structure || "-"],
        ["사용승인일", bld.use_apr_day ? `${bld.use_apr_day}${bld.age_years != null ? ` (${bld.age_years}년)` : ""}` : "대장에 없음"],
        ["층수(대장)", bld.floors != null ? `${bld.floors}층` : "-"], ["연면적(대장)", bld.tot_area != null ? `${Math.round(bld.tot_area).toLocaleString("ko-KR")}㎡` : "-"]);
      if (bld.hhld) rows.push(["세대수(대장)", `${bld.hhld}세대`]);
      rows.push(["대장 연결", MATCH[match] || "-"]);
    } else {
      rows.push(["건축물대장", pk ? "대장 파일에서 찾지 못함" : "이 외곽선과 한 건으로 맞는 대장 행이 없음(대장 미등록·부속건물·여러 동 중 하나일 수 있음, 현장 확인)"]);
      if (floors) rows.push(["지상층수(건물통합정보)", `${floors}층`]);
    }
    rows.push(["높이(대장 신고값)", h ? `${h}m` : "없음"], ["외곽선 자료", `${outline.name} · 기준일 ${outline.base_date} · ${outline.license_type}`]);
    return rows;
  }

  // 브라우저: 3D 지도가 준비되면 누르기를 잇는다. 테스트(node)에서는 건너뛴다
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const DATA = "../data/", cache = new Map();
    const get = (p) => { if (!cache.has(p)) cache.set(p, fetch(DATA + p).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).catch((e) => { cache.delete(p); throw e; })); return cache.get(p); };
    const show = (title, rows) => {
      const box = document.getElementById("pick");
      if (!box) return;
      box.querySelector("h2").textContent = title;
      box.querySelector("dl").replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
      box.hidden = false;
    };
    async function lookup(lng, lat) {
      let index;
      try { index = await get("bldg_outline/index.json"); } catch (e) { return show("건물 정보를 불러오지 못했습니다", [["안내", "인터넷 연결을 확인해 주세요."]]); }
      for (const code of candidates(index, lng, lat)) {
        const file = await get(`bldg_outline/${code}.json`);
        const it = pickItem(file, lng, lat);
        if (!it) continue;
        let bld = null;
        if (it[0]) bld = ((await get(`buildings/${code}.json`)).buildings || []).find((b) => b.mgm_bld_pk === it[0]) || null;
        return show(bld ? `${bld.jibun} ${bld.name || bld.main_use || "건물"}` : "대장과 잇지 못한 건물", describe(it, bld, file));
      }
      show("누른 자리의 건물 외곽선이 없습니다", [["안내", "건물 정보는 부산광역시만 준비돼 있습니다. 건물 지붕 가운데를 눌러 보세요."]]);
    }
    let tries = 0;
    const timer = setInterval(() => {
      const v = window.ws3d && window.ws3d.viewer, C = window.Cesium;
      if (++tries > 120) clearInterval(timer);
      if (!v || !C) return;
      clearInterval(timer);
      new C.ScreenSpaceEventHandler(v.scene.canvas).setInputAction((e) => {
        const p = (v.scene.pickPositionSupported && v.scene.pickPosition(e.position)) || v.camera.pickEllipsoid(e.position, v.scene.globe.ellipsoid);
        if (!p) return;
        const c = C.Cartographic.fromCartesian(p);
        lookup(C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude));
      }, C.ScreenSpaceEventType.LEFT_CLICK);
    }, 500);
  }
  return { inRing, candidates, pickItem, describe };
});
