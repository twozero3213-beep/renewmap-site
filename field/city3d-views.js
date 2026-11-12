// 3D 화면의 '보기' 단추(조감도·위에서·가까이·한 바퀴)에 쓰는 카메라 값. 3D 엔진 없이 계산만 해서 node 테스트로 확인한다.
// 2026-11-12 추가. 왜: 회의(11-12) "조감도가 잘 보이게". 지금은 시작 장면 하나뿐이라 사용자가 마우스로 각도를 직접 맞춰야 했다.
// 시점 값은 docs/quality/city3d_baseline_2026-11-12.md의 측정 경로(1.1km·35도 한 바퀴)와 같은 범위에서 골랐다.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.City3dViews = factory();
})(this, function () {
  "use strict";
  // 이름: [화면 낱말, 내려다보는 각도(도, 음수 = 아래), 대상까지 거리(m)]
  // 조감도 35도·1.1km: 동 하나(대략 1km 안팎)가 화면에 들어오고 건물 높이 차가 보이는 각도
  // 위에서 89도: 90도 정각이면 엔진이 방향을 못 정해 화면이 튀어서 1도 남긴다
  // 가까이 30도·300m: 건물 몇 동의 층수·모양을 보는 거리(400m로 열어 보니 동 전체가 보여 줄였다, 2026-11-12)
  const PRESETS = {
    bird: { label: "조감도", pitch: -35, range: 1100 },
    top: { label: "위에서", pitch: -89, range: 1500 },
    near: { label: "가까이", pitch: -30, range: 300 },
  };
  // 한 바퀴 도는 데 걸리는 시간(초). 측정(12초 한 바퀴)보다 느리게 해 건물이 채워질 틈을 준다
  const ORBIT_SECONDS = 40;
  // 경과 시간(ms) → 바라보는 방향(도, 0~360). 시작 방향에서 이어서 돈다
  const orbitHeading = (startDeg, elapsedMs) => (((startDeg + (360 * elapsedMs) / (ORBIT_SECONDS * 1000)) % 360) + 360) % 360;
  // 주소 ?lat&lng 검사: 부산·한국 범위가 아니면 기본 위치(재송·반여)를 쓴다(city3d.js 원래 규칙 그대로)
  const HOME = [129.1245, 35.196];
  function startPoint(search) {
    const q = new URLSearchParams(search || ""), lat = Number(q.get("lat")), lng = Number(q.get("lng"));
    return lat > 33 && lat < 39 && lng > 124 && lng < 132 ? [lng, lat] : HOME.slice();
  }
  return { PRESETS, ORBIT_SECONDS, orbitHeading, startPoint, HOME };
});
