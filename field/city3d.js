// 현재 건물 3D 보기. 브이월드 3D 지도(국토교통부 3D 건물)를 띄우기만 한다. 리뉴맵은 건물 형상을 받거나 저장하지 않는다.
// 시작 위치: 주소 끝 ?lat=35.19&lng=129.12 (부산·한국 범위만). 없으면 해운대구 재송동·반여동 일대
// 2026-11-12 고침(회의 "안 끊기고 조감도 잘 보이게"): 보기 단추·한 바퀴 돌기·불러오는 중 표시·장소 이름표 기본 끔을
// city3d-controls.js로 붙인다. 근거와 측정값은 docs/quality/city3d_baseline_2026-11-12.md
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const say = (t, err) => { $("message").textContent = t; $("message").className = err ? "msg err" : "msg"; };
  const at = window.City3dViews.startPoint(location.search);
  if (typeof window.vw === "undefined") {
    $("vmap").hidden = true;
    for (const id of ["views", "loading"]) { const el = $(id); if (el) el.hidden = true; }
    return say("브이월드 3D 지도를 불러오지 못했습니다.\n이 주소에서는 쓸 수 없거나 인터넷 연결이 끊겼습니다.\n공개 사이트에서 다시 열어 주세요.", true);
  }
  const map = new vw.Map();
  map.setOption({
    mapId: "vmap",
    // 남쪽 1.2km 위 800m 높이에서 북쪽을 45도로 내려다본다. 건물 높이가 바로 보이게
    initPosition: new vw.CameraPosition(new vw.CoordZ(at[0], at[1] - 0.012, 800), new vw.Direction(0, -45, 0)),
    logo: true, navigation: true,
  });
  vw.ws3dInitCallBack = () => {
    // 브이월드는 이 함수를 부른 '뒤'에 자기 방식으로 initPosition으로 옮긴다(VWViewerStartup.v30: ws3dInitCallBack → lookat.moveTo).
    // 그 결과가 요청 위치와 달랐다(2026-11-07 공개 사이트: 3km 남쪽 2km 높이, 산만 보임). 그 이동이 끝난 다음 차례에 카메라를 직접 옮긴다
    setTimeout(() => {
      const C = window.Cesium, v = window.ws3d && ws3d.viewer;
      if (!C || !v || v.isDestroyed?.() || !v.cesiumWidget?.scene) return;
      const cam = v.camera; if (!cam) return;
      cam.cancelFlight();
      const goStart = () => cam.setView({ destination: C.Cartesian3.fromDegrees(at[0], at[1] - 0.012, 800), orientation: { heading: 0, pitch: C.Math.toRadians(-45), roll: 0 } });
      goStart();
      // 2026-11-13 우지예: 공개 사이트에서 첫 화면이 부산이 아니라 대구·포항·울산이 보이는 높은 하늘이었다(화면 확인).
      //     왜: 브이월드가 자기 시작 이동(lookat.moveTo)을 우리 setView 뒤에 한 번 더 끝내는 경우가 있다(위 주석과 같은 원인, 느린 회선에서 더 늦게 끝남).
      //     → 처음 8초 동안 카메라 이동이 끝날 때마다, 사람이 아직 손대지 않았고 시작점에서 5km 넘게 떨어져 있으면 시작점으로 되돌린다
      const start = C.Cartesian3.fromDegrees(at[0], at[1] - 0.012, 800);
      let touched = false;
      const el = v.canvas || document.getElementById("vmap");
      ["pointerdown", "wheel", "touchstart", "keydown"].forEach((ev) => el && el.addEventListener && el.addEventListener(ev, () => { touched = true; }, { once: true, passive: true }));
      if (document.querySelectorAll) document.querySelectorAll("[data-view], #orbit, #labels").forEach((b) => b.addEventListener("click", () => { touched = true; }, { once: true }));
      const recheck = () => { if (!touched && !v.isDestroyed?.() && C.Cartesian3.distance && cam.positionWC && C.Cartesian3.distance(cam.positionWC, start) > 5000) { cam.cancelFlight(); goStart(); } };
      const off = cam.moveEnd && cam.moveEnd.addEventListener ? cam.moveEnd.addEventListener(recheck) : null;
      [600, 1500, 3000].forEach((ms) => setTimeout(recheck, ms));
      setTimeout(() => off && off(), 8000);
      window.City3dControls.attach(v, C, at, document);
    }, 0);
    say("국토교통부 브이월드 3D 건물입니다.\n마우스로 끌어 옮기고 휠로 확대·축소합니다. 위 단추로 조감도·위에서·가까이·한 바퀴 돌기를 고를 수 있습니다.");
  };
  map.start();
  say("브이월드 3D 지도를 여는 중입니다.\n건물은 가까이 갈수록 그려집니다.");
})();
