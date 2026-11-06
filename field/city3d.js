// 현재 건물 3D 보기. 브이월드 3D 지도(국토교통부 3D 건물)를 띄우기만 한다. 리뉴맵은 건물 형상을 받거나 저장하지 않는다.
// 시작 위치: 주소 끝 ?lat=35.19&lng=129.12 (부산·한국 범위만). 없으면 해운대구 재송동·반여동 일대
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const say = (t, err) => { $("message").textContent = t; $("message").className = err ? "msg err" : "msg"; };
  const q = new URLSearchParams(location.search), lat = Number(q.get("lat")), lng = Number(q.get("lng"));
  const at = lat > 33 && lat < 39 && lng > 124 && lng < 132 ? [lng, lat] : [129.1245, 35.1960];
  if (typeof window.vw === "undefined") {
    $("vmap").hidden = true;
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
    // initPosition만으로는 시작 위치가 반영되지 않았다(2026-11-07 공개 사이트: 360km 높이 한반도 전체로 열림). 초기화 뒤 카메라를 직접 옮긴다
    const C = window.Cesium, cam = window.ws3d && ws3d.viewer && ws3d.viewer.camera;
    if (C && cam) cam.setView({ destination: C.Cartesian3.fromDegrees(at[0], at[1] - 0.012, 800), orientation: { heading: 0, pitch: C.Math.toRadians(-45), roll: 0 } });
    say("국토교통부 브이월드 3D 건물입니다.\n마우스로 끌어 옮기고 휠로 확대·축소합니다.");
  };
  map.start();
  say("브이월드 3D 지도를 여는 중입니다.\n건물은 가까이 갈수록 그려집니다.");
})();
