// 리뉴맵 랜딩: 분석(측정 ID가 있을 때만), 버튼 클릭 기록, 문의 전송·초안 내보내기.
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
  var status = form.querySelector('.form-status');
  var fallback = form.querySelector('[data-contact-fallback]');
  var preview = form.querySelector('[data-contact-draft]');
  var submit = form.querySelector('[type="submit"]');
  var copy = form.querySelector('[data-copy-inquiry]');
  var download = form.querySelector('[data-download-inquiry]');
  // 캐시된 이전 HTML에서는 초기화 오류 뒤 기본 GET 제출이 살아나지 않게 막는다.
  if (!submit || !err || !status || !fallback || !preview || !copy || !download) {
    if (submit) submit.disabled = true;
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    if (err) {
      err.textContent = '문의 양식이 갱신되었습니다. 작성한 내용을 따로 복사한 뒤 새로고침해 주세요.';
      err.hidden = false;
    }
    return;
  }
  var endpoint = form.dataset.endpoint;
  // 스크립트가 막히면 기본 GET 제출로 문의 내용이 주소에 노출되지 않도록 HTML에서 비활성화한다.
  submit.disabled = false;
  copy.disabled = false;
  download.disabled = false;
  fallback.hidden = !!endpoint;
  submit.textContent = endpoint ? '문의 보내기' : '메일 초안 열기(직접 전송 필요)';

  document.querySelectorAll('[data-pilot-inquiry]').forEach(function (button) {
    button.addEventListener('click', function () {
      form.elements.type.value = '99만원 유료 파일럿 견적 요청';
      var message = form.elements.message;
      if (!message.value.trim()) {
        message.value = '과업 1건, 행정동 1곳의 유료 파일럿 견적을 요청합니다.\n' +
          '대상 자치구·행정동: \n공모·과업 이름: \n희망 기준일·접수 일정: \n보유 자료: \n\n' +
          '시범 제안가 99만원(VAT 별도), 계약 전 확정.\n' +
          '범위: 신청요건 근거 1쪽과 출처·추가확인 조서(HWPX·PDF·XLSX), 초안 검토 후 보완 1회.\n' +
          '추가 동·새 기준일·새 지표·경계안 3종, 신규 현장조사·출장·전문가 승인은 별도 협의합니다.';
        status.textContent = '유료 파일럿 문의 유형과 범위 초안을 넣었습니다. 대상 동과 보유 자료를 적어 주세요.';
      } else {
        status.textContent = '유료 파일럿 문의 유형을 선택했습니다. 작성하신 문의 내용은 그대로 두었습니다.';
      }
      message.focus();
    });
  });

  function valid() {
    var missing = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (f) {
      return f.type === 'checkbox' ? !f.checked : !f.value.trim();
    });
    var email = form.elements.email;
    if (missing.length || (email.value && !email.checkValidity())) {
      err.textContent = missing.length ? '필수 항목을 모두 입력하고 개인정보 수집에 동의해 주세요.' : '이메일 주소 형식을 확인해 주세요.';
      err.hidden = false;
      (missing[0] || email).focus();
      return false;
    }
    err.hidden = true;
    return true;
  }

  function draft() {
    var data = new FormData(form);
    // 동의 버전·시각은 사용자가 내보내는 초안에만 포함하고 사이트에 저장하지 않는다.
    var agree = form.elements.agree, optin = form.elements.optin;
    var consent = '동의: ' + (agree && agree.dataset.consent || 'C1') + ' 필수' + (optin ? ', 선택 수신 ' + (optin.checked ? '예' : '아니오') + '(' + (optin.dataset.consent || 'C5') + ')' : '') + ', ' + new Date().toISOString();
    var body = ['소속: ' + data.get('org'), '담당자: ' + data.get('name'), '이메일: ' + data.get('email'), '전화(선택): ' + (data.get('tel') || '없음'),
      '유형: ' + data.get('type'), '', data.get('message') || '', '', consent].join('\n');
    var subject = '[리뉴맵 상담] ' + data.get('org');
    return { body: body, subject: subject, text: '받는 사람: ' + form.dataset.mailto + '\n제목: ' + subject + '\n\n' + body };
  }

  function manualCopy(text) {
    preview.value = text;
    preview.hidden = false;
    preview.focus();
    preview.select();
    status.textContent = '자동 복사를 사용할 수 없습니다. 아래 초안을 직접 복사하거나 TXT로 저장해 메일 앱에서 보내 주세요.';
  }

  copy.addEventListener('click', function () {
    if (!valid()) return;
    var text = draft().text;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      manualCopy(text);
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      track('form_draft_copy');
      status.textContent = '받는 주소와 문의 초안을 복사했습니다. 메일 앱에 붙여 넣고 직접 보내 주세요.';
    }).catch(function () { manualCopy(text); });
  });

  download.addEventListener('click', function () {
    if (!valid()) return;
    var text = draft().text;
    try {
      var url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = '리뉴맵_문의초안.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      track('form_draft_download');
      status.textContent = '문의 초안 TXT 저장을 요청했습니다. 저장한 내용을 메일 앱에 붙여 넣고 직접 보내 주세요.';
    } catch (error) {
      manualCopy(text);
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!valid()) return;
    if (endpoint) {
      submit.disabled = true;
      fetch(endpoint, { method: 'POST', body: new FormData(form) })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          track('form_submit');
          location.href = 'thanks.html';
        })
        .catch(function () {
          err.textContent = '전송에 실패했습니다. 다시 시도하거나 문의 초안을 복사·저장해 ' + form.dataset.mailto + '로 직접 보내 주세요.';
          err.hidden = false;
          fallback.hidden = false;
        })
        .finally(function () { submit.disabled = false; });
      return;
    }
    var inquiry = draft();
    status.textContent = '메일 앱 열기를 요청했습니다. 메일 앱에서 직접 보내야 합니다. 이 화면에서는 발송·접수 여부를 확인할 수 없습니다.';
    try {
      location.href = 'mailto:' + form.dataset.mailto + '?subject=' + encodeURIComponent(inquiry.subject) + '&body=' + encodeURIComponent(inquiry.body);
      track('form_draft_open');
    } catch (error) {
      status.textContent = '메일 앱을 열 수 없습니다. 문의 초안을 복사하거나 TXT로 저장해 메일 앱에서 직접 보내 주세요.';
    }
  });
})();
