// 리뉴맵 랜딩: 분석(측정 ID가 있을 때만), 버튼 클릭 기록, 문의 폼 전송.
(function () {
  var gaId = (document.querySelector('meta[name="ga-id"]') || {}).content;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (gaId) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', gaId);
  }
  function track(name) { if (gaId) gtag('event', name); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (el && el.tagName === 'A') track(el.dataset.track);
  });

  var form = document.querySelector('form.contact');
  if (!form) return;
  var err = form.querySelector('.form-error');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var missing = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (f) {
      return f.type === 'checkbox' ? !f.checked : !f.value.trim();
    });
    var email = form.elements.email;
    if (missing.length || (email.value && !email.checkValidity())) {
      err.textContent = missing.length ? '필수 항목을 모두 입력하고 개인정보 수집에 동의해 주세요.' : '이메일 주소 형식을 확인해 주세요.';
      err.hidden = false;
      (missing[0] || email).focus();
      return;
    }
    err.hidden = true;
    track('form_submit');
    var data = new FormData(form);
    var endpoint = form.dataset.endpoint;
    if (endpoint) {
      fetch(endpoint, { method: 'POST', body: data })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          location.href = 'thanks.html';
        })
        .catch(function () {
          err.textContent = '전송에 실패했습니다. 잠시 후 다시 시도하거나 ' + form.dataset.mailto + '로 메일을 보내 주세요.';
          err.hidden = false;
        });
      return;
    }
    // 수신 서버가 없을 때: 메일 앱으로 내용을 넘기고 감사 페이지로 이동
    // 동의 기록(consent_texts.md 공통 규칙 5): 문구 버전·동의 항목·시각을 메일 끝에 남긴다. 사이트 서버에는 아무것도 저장하지 않는다
    var agree = form.elements.agree, optin = form.elements.optin;
    var consent = '동의: ' + (agree && agree.dataset.consent || 'C1') + ' 필수' + (optin ? ', 선택 수신 ' + (optin.checked ? '예' : '아니오') + '(' + (optin.dataset.consent || 'C5') + ')' : '') + ', ' + new Date().toISOString();
    var body = ['소속: ' + data.get('org'), '담당자: ' + data.get('name'), '이메일: ' + data.get('email'), '전화(선택): ' + (data.get('tel') || '없음'),
      '유형: ' + data.get('type'), '', data.get('message') || '', '', consent].join('\n');
    location.href = 'mailto:' + form.dataset.mailto + '?subject=' + encodeURIComponent('[리뉴맵 상담] ' + data.get('org')) +
      '&body=' + encodeURIComponent(body);
    setTimeout(function () { location.href = 'thanks.html'; }, 800);
  });
})();
