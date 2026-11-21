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

  // r16: 접수 서버가 없어 메일이 유일한 상담 길이다. 소개 상담 칸·감사 화면의 '주소 복사'
  document.querySelectorAll('[data-copy-addr]').forEach(function (button) {
    var out = button.parentNode.querySelector('[data-copy-addr-status]');
    var say = function (text) { if (out) out.textContent = text; };
    button.addEventListener('click', function () {
      var manual = function () { say('자동 복사를 쓸 수 없습니다. 주소를 직접 복사해 주세요.'); };
      if (!navigator.clipboard || !navigator.clipboard.writeText) { manual(); return; }
      navigator.clipboard.writeText(button.dataset.copyAddr).then(function () { say('복사했습니다.'); }, manual);
    });
  });
  // 감사 화면: 접수 서버로 보낸 뒤(?sent=1)에만 '받았습니다'. 주소로 바로 열면 메일로 받는다는 안내(r16: 메일 앱만 연 사람에게 '접수되었습니다'라 했다)
  var sent = /[?&]sent=1(&|$)/.test(location.search || '');
  document.querySelectorAll('[data-thanks]').forEach(function (el) { el.hidden = (el.dataset.thanks === 'sent') !== sent; });

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
  // r16 B12: 회신 칸과 개인정보 동의는 접수 서버가 있을 때만 보이고 받는다. 메일로 보낼 때는 메일 앱이 보낸 사람 주소를 붙이고 이 화면은 아무것도 받지 않는다
  form.querySelectorAll('[data-server-only]').forEach(function (el) { el.hidden = !endpoint; });
  // 접수 서버가 있을 때만 보내기가 주 단추다. 없으면 HTML 그대로(문의 내용 복사가 주 단추, 메일 앱은 보조)
  if (endpoint) { submit.textContent = '문의 보내기'; submit.className = 'btn'; }

  document.querySelectorAll('[data-pilot-inquiry]').forEach(function (button) {
    button.addEventListener('click', function () {
      form.elements.type.value = '견적';
      var message = form.elements.message;
      if (!message.value.trim()) {
        // 가격 문장은 홈·소개·범위 1쪽과 같은 글자(app.test). 파일은 받지 않으므로 보유 자료 칸을 두지 않는다
        message.value = '과업 1건·행정동 1곳·기준일 1개의 시범 과업 견적서를 요청합니다.\n' +
          '대상 동: \n공모·용역 종류: \n필요한 때: \n\n' +
          '시범 제안가 99만원(부가세가 붙어도 총액 108만 9천원 이내, 최종 금액은 계약 전 확정)\n' +
          '시범 과업은 과업 1건에 한 번 내는 값입니다. 매달 내는 값이 아닙니다.\n' +
          '범위: 검토 납품본(사람이 출처 자료로 다시 확인한 검토표), 초안 검토 후 보완 1회.\n' +
          '추가 동·새 기준일·새 지표·구역안 비교, 새 현장조사·출장·전문가 검토는 별도 협의합니다.';
        status.textContent = '시범 과업 문의 유형과 범위 초안을 넣었습니다. 대상 동, 공모·용역 종류, 필요한 때를 적어 주세요.';
      } else {
        status.textContent = '시범 과업 문의 유형을 선택했습니다. 작성하신 문의 내용은 그대로 두었습니다.';
      }
      message.focus();
    });
  });

  // r16 접근성: 빠진 칸마다 aria-invalid, 안내는 빠진 칸 이름을 적고, 고친 칸은 바로 표시를 지운다
  var email = form.elements.email, flagged = [];
  var required = Array.prototype.slice.call(form.querySelectorAll('[required]')).filter(function (f) { return endpoint || !f.closest('[data-server-only]'); });
  function need(list) {
    var names = list.filter(function (f) { return f.type !== 'checkbox'; }).map(function (f) { return f.dataset.label || f.name; });
    var agree = names.length < list.length;
    // 칸 이름(소속·담당자 이름·이메일·내용)은 모두 받침으로 끝나 '을'
    return (names.length ? names.join(', ') + (agree ? '을 입력하고 ' : '을 입력해 주세요.') : '') + (agree ? '개인정보 수집·이용에 동의해 주세요.' : '');
  }
  function mark(list) {
    flagged.forEach(function (f) { f.removeAttribute('aria-invalid'); });
    flagged = list;
    list.forEach(function (f) { f.setAttribute('aria-invalid', 'true'); });
  }
  required.forEach(function (f) {
    f.addEventListener(f.type === 'checkbox' ? 'change' : 'input', function () {
      if (flagged.indexOf(f) < 0) return;
      f.removeAttribute('aria-invalid');
      flagged = flagged.filter(function (x) { return x !== f; });
      if (flagged.length) err.textContent = need(flagged); else err.hidden = true;
    });
  });
  function valid() {
    var missing = required.filter(function (f) {
      return f.type === 'checkbox' ? !f.checked : !f.value.trim();
    });
    var badEmail = !missing.length && email.value && !email.checkValidity();
    if (missing.length || badEmail) {
      mark(badEmail ? [email] : missing);
      err.textContent = badEmail ? '이메일 주소 형식을 확인해 주세요.' : need(missing);
      err.hidden = false;
      (missing[0] || email).focus();
      return false;
    }
    mark([]);
    err.hidden = true;
    return true;
  }

  function draft() {
    var data = new FormData(form);
    var value = function (name) { return String(data.get(name) || '').trim(); };
    // 적은 칸만 담는다. 동의 기록(C1·C5)은 접수 서버 경로의 몫이라 메일 본문에 넣지 않는다(r16 B12: 내부 코드가 본문에 보였다)
    var head = [['소속', 'org'], ['담당자', 'name'], ['이메일', 'email'], ['전화', 'tel'], ['유형', 'type']]
      .filter(function (f) { return value(f[1]); }).map(function (f) { return f[0] + ': ' + value(f[1]); });
    var body = head.concat('', value('message')).join('\n');
    var subject = '[리뉴맵 상담] ' + (value('org') || value('type'));
    return { body: body, subject: subject, text: '받는 사람: ' + form.dataset.mailto + '\n제목: ' + subject + '\n\n' + body };
  }

  function manualCopy(text) {
    preview.value = text;
    preview.hidden = false;
    preview.focus();
    preview.select();
    status.textContent = '자동 복사를 쓸 수 없습니다. 아래 내용을 직접 복사하거나 TXT로 저장해 메일로 보내 주세요.';
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
      status.textContent = '복사했습니다. ' + form.dataset.mailto + '으로 보내 주세요.';
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
      status.textContent = 'TXT 저장을 요청했습니다. 저장한 내용을 메일에 붙여 위 주소로 보내 주세요.';
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
          location.href = 'thanks.html?sent=1';
        })
        .catch(function () {
          err.textContent = '문의를 보내지 못했습니다. 다시 시도하거나 문의 내용을 복사해 ' + form.dataset.mailto + '으로 직접 보내 주세요.';
          err.hidden = false;
          fallback.hidden = false;
        })
        .finally(function () { submit.disabled = false; });
      return;
    }
    var inquiry = draft();
    // 이 화면은 메일 앱만 연다. 보냈는지는 알 수 없어 접수라고 쓰지 않는다
    status.textContent = '메일 앱 열기를 요청했습니다. 메일 앱에서 보내기를 눌러야 보내집니다. 열리지 않았다면 문의 내용을 복사해 위 주소로 직접 보내 주세요. 이 화면에서는 보냈는지 확인할 수 없습니다.';
    try {
      location.href = 'mailto:' + form.dataset.mailto + '?subject=' + encodeURIComponent(inquiry.subject) + '&body=' + encodeURIComponent(inquiry.body);
      track('form_draft_open');
    } catch (error) {
      status.textContent = '메일 앱을 열 수 없습니다. 문의 내용을 복사하거나 TXT로 저장해 메일로 직접 보내 주세요.';
    }
  });
})();
