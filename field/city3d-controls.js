// 현재 건물 3D 보기의 조작 단추(보기·한 바퀴 돌기·장소 이름·불러오는 중 표시). 2026-11-12 추가.
// 왜 따로 뺐나: 브이월드 키가 공개 사이트 주소에서만 동작해 로컬에서 화면을 띄울 수 없다.
// 지도를 만드는 city3d.js와 떼어 두면, 이미 열린 공개 사이트 3D 화면에 이 파일만 붙여 동작을 확인할 수 있다.
// 근거·측정값: docs/quality/city3d_baseline_2026-11-12.md. 카메라 값: city3d-views.js
(function (root) {
  "use strict";
  // 브이월드가 넣는 3D 타일 묶음(건물 map4, 장소 이름 POI_BASE, 행정 경계 이름 POI_BOUND)
  const tilesets = (v) => { const p = v.scene.primitives, a = []; for (let i = 0; i < p.length; i++) { const x = p.get(i); if (x && x.maximumScreenSpaceError !== undefined) a.push(x); } return a; };
  // 장소 이름표(POI_BASE)를 기본으로 끈다. 왜: 같은 PC·같은 경로로 잰 조감도 한 바퀴에서
  // 장소 이름표를 끄면 초당 화면 44~51 → 54~60장, 50ms 넘는 멈춤 4~8번 → 1번으로 줄었다.
  // 구·동 경계 이름(POI_BOUND)만 끄면 차이가 없어서(47장·6번) 길 찾기에 쓰도록 남긴다.
  // 바닥·건물 세밀도, 타일 보관 크기를 바꾼 것은 차이가 없었다.
  function setLabels(v, on) {
    tilesets(v).filter((t) => /POI_BASE/i.test(String(t.basePath || ""))).forEach((t) => { t.show = on; });
    v.scene.requestRender();
  }

  function attach(v, C, at, doc) {
    const V = root.City3dViews, $ = (id) => doc.getElementById(id);
    // 지금 화면 가운데 땅 위의 점. 보기 단추를 눌러도 보던 곳을 벗어나지 않게 그 점을 중심으로 삼는다
    const centerOf = () => {
      const c = v.scene.canvas, mid = new C.Cartesian2(c.clientWidth / 2, c.clientHeight / 2);
      const p = (v.scene.pickPositionSupported && v.scene.pickPosition(mid)) || v.camera.pickEllipsoid(mid, v.scene.globe.ellipsoid);
      if (p) { const g = C.Cartographic.fromCartesian(p); return C.Cartesian3.fromDegrees(C.Math.toDegrees(g.longitude), C.Math.toDegrees(g.latitude), 0); }
      return C.Cartesian3.fromDegrees(at[0], at[1], 0);
    };

    let orbit = null;   // 한 바퀴 돌기 중이면 { stop }
    const orbitBtn = $("orbit");
    const stopOrbit = () => {
      if (!orbit) return;
      orbit.stop(); orbit = null;
      if (orbitBtn) { orbitBtn.setAttribute("aria-pressed", "false"); orbitBtn.textContent = "한 바퀴 돌기"; }
    };
    const startOrbit = () => {
      stopOrbit();
      const center = centerOf(), cam = v.camera, h0 = C.Math.toDegrees(cam.heading), p = V.PRESETS.bird, t0 = performance.now();
      let id = 0;
      const tick = (now) => {
        cam.lookAt(center, new C.HeadingPitchRange(C.Math.toRadians(V.orbitHeading(h0, now - t0)), C.Math.toRadians(p.pitch), p.range));
        v.scene.requestRender();
        id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
      // lookAt은 카메라를 대상에 묶는다. 멈출 때 풀어야 마우스로 다시 자유롭게 움직인다
      orbit = { stop: () => { cancelAnimationFrame(id); cam.lookAtTransform(C.Matrix4.IDENTITY); } };
      if (orbitBtn) { orbitBtn.setAttribute("aria-pressed", "true"); orbitBtn.textContent = "돌기 멈추기"; }
    };

    const bar = $("views");
    if (bar) {
      bar.hidden = false;
      bar.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => {
        stopOrbit();
        if (btn.dataset.view === "home") {
          v.camera.flyTo({ destination: C.Cartesian3.fromDegrees(at[0], at[1] - 0.012, 800), orientation: { heading: 0, pitch: C.Math.toRadians(-45), roll: 0 }, duration: 1.2 });
          return;
        }
        const p = V.PRESETS[btn.dataset.view];
        // 지금 보던 방향은 그대로 두고 각도·거리만 바꾼다. 갑자기 북쪽으로 돌면 어디를 보는지 놓친다
        v.camera.flyToBoundingSphere(new C.BoundingSphere(centerOf(), 1), {
          offset: new C.HeadingPitchRange(v.camera.heading, C.Math.toRadians(p.pitch), p.range), duration: 1.2,
        });
      }));
    }
    if (orbitBtn) orbitBtn.addEventListener("click", () => (orbit ? stopOrbit() : startOrbit()));
    // 사용자가 지도를 직접 움직이면 돌기를 멈춘다(돌기와 마우스 조작이 서로 카메라를 빼앗지 않게)
    ["pointerdown", "wheel", "touchstart"].forEach((ev) => v.scene.canvas.addEventListener(ev, stopOrbit, { passive: true }));

    const labels = $("labels");
    if (labels) { labels.checked = false; labels.addEventListener("change", () => setLabels(v, labels.checked)); }
    // 브이월드는 카메라가 움직이면 이름표 묶음을 스스로 다시 켠다(2026-11-12 공개 사이트에서 조감도로 옮긴 뒤 show=true로 돌아옴 확인).
    // 한 번 끄는 것으로는 안 되어 그리기 직전마다 맞춘다. 타일 묶음 3개를 훑는 일이라 부담은 없다
    v.scene.preRender.addEventListener(() => {
      if (labels && labels.checked) return;
      for (const t of tilesets(v)) if (t.show && /POI_BASE/i.test(String(t.basePath || ""))) t.show = false;
    });

    // 불러오는 중 표시: 받을 지도 조각이 남아 있으면 지도 위에 띄운다. 회색 화면이 '멈춤'으로 보이지 않게
    const box = $("loading");
    if (box) {
      const text = box.querySelector("span");
      // 붙일 때 이미 다 받았으면 알림이 다시 오지 않으니 바로 숨긴다
      if (v.scene.globe.tilesLoaded) box.hidden = true;
      v.scene.globe.tileLoadProgressEvent.addEventListener((left) => {
        box.hidden = left === 0;
        if (text) text.textContent = left > 0 ? `지도 조각 ${left}개를 받는 중입니다` : "";
      });
    }
    return { stopOrbit, startOrbit, isOrbiting: () => !!orbit };
  }
  root.City3dControls = { attach, setLabels, tilesets };
})(typeof window !== "undefined" ? window : this);
