/* 외부 배경지도를 켰을 때만 네이버 지도 SDK를 요청한다. */
(function () {
  'use strict';
  let ready;
  window.renewLoadNaver = () => ready || (ready = new Promise(resolve => {
    let ended = false;
    const done = ok => { ended = true; clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => done(false), 5000);
    const config = document.createElement('script');
    config.fetchPriority = 'high';
    config.src = 'field/naver-map-key.js';
    config.onerror = () => done(false);
    config.onload = () => {
      if (ended) return;
      const key = window.RENEWMAP_NAVER_KEY;
      if (!/^[A-Za-z0-9]{6,40}$/.test(key || '')) { done(false); return; }
      window.navermap_authFailure = () => {
        window.renewNaverAuthFailed = true;
        done(false);
        window.dispatchEvent(new Event('renew-navermap-auth-failed'));
      };
      const sdk = document.createElement('script');
      sdk.fetchPriority = 'high';
      sdk.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${key}`;
      sdk.onload = () => done(!!window.naver?.maps?.Map);
      sdk.onerror = () => done(false);
      document.head.appendChild(sdk);
    };
    document.head.appendChild(config);
  }));
})();
