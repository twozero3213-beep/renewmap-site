"""합성 과업의 오류·보류·대조·파일·검토·백업 복원을 실제 브라우저에서 검사한다."""
import argparse
import base64
import functools
import hashlib
import json
import re
import threading
import zipfile
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base')
    ap.add_argument('--channel')
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[1]
    site = root / 'landing' if (root / 'landing').exists() else root
    server = None
    if not args.base:
        class Quiet(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
    base = args.base or f'http://127.0.0.1:{server.server_port}/'
    result = {'base': base, 'synthetic_only': True, 'checks': [], 'errors': []}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(**({'channel': args.channel} if args.channel else {}))
            ctx = browser.new_context(accept_downloads=True, service_workers='block', reduced_motion='reduce')
            page = ctx.new_page()
            page.on('pageerror', lambda e: result['errors'].append(str(e)))
            for entry, panel, detail in [('survey', '1', 'surveyChanges'),
                                         ('revisit', '1', 'revisitReport'),
                                         ('delivery', '2', None), ('review', '3', None)]:
                page.goto(base + 'tasks.html?step=' + entry, wait_until='networkidle')
                expect(page.locator('#newTask')).to_be_enabled()
                # r16: 저장한 과업이 없으면 2~4단계는 빈 폼 대신 안내 하나(과업을 고르거나 저장하는 길)를 보인다.
                # 들어온 단계는 그대로 표시한다. 과업이 있을 때 그 칸이 열리는 것은 아래 direct_revisit·direct_delivery가 본다
                expect(page.locator('.task-steps [data-step="' + panel + '"]')).to_have_attribute('aria-current', 'step')
                expect(page.locator('[data-panel="' + panel + '"]')).to_be_hidden()
                expect(page.locator('#taskNoPlan')).to_be_visible()
                expect(page.locator('#taskNoPlan')).to_contain_text(re.compile(r'과업.*저장'))
                expect(page.locator('#taskNoPlan')).to_contain_text('저장한 과업')
                if detail:
                    expect(page.locator('#' + detail)).to_have_attribute('open', '')
                assert page.evaluate('async()=> (await TaskStore.list()).length') == 0
            page.locator('#taskNoPlan button[data-step="0"]').click()
            expect(page.locator('[data-panel="0"]')).to_be_visible()
            expect(page.locator('#taskNoPlan')).to_be_hidden()
            result['checks'].append('direct_workflow_links_open_without_creating_records')
            page.goto(base + 'tasks.html?step=delivery#handoverSummary', wait_until='networkidle')
            expect(page.locator('#newTask')).to_be_enabled()
            # 과업 없이는 인수인계 요약 단추에 닿지 않는다(예전에는 눌러서 '요약을 만들지 못했습니다'를 봤다)
            expect(page.locator('#taskNoPlan')).to_be_visible()
            expect(page.locator('#handoverTask')).to_be_hidden()
            expect(page.locator('#handoverPreview')).to_be_hidden()
            assert page.evaluate('async()=> (await TaskStore.list()).length') == 0
            result['checks'].append('handover_entry_does_not_create_or_approve_task')
            page.goto(base + 'tasks.html?step=__proto__', wait_until='networkidle')
            expect(page.locator('[data-panel="0"]')).to_be_visible()
            result['checks'].append('unknown_workflow_keeps_plan_screen')
            page.goto(base + 'tasks.html', wait_until='networkidle')
            page.wait_for_function('() => !document.querySelector("#newTask").disabled')
            configured = page.evaluate('() => window.RenewTaskCloudConfig !== null')
            assert page.locator('#taskCloud').count() == int(configured)
            if configured:
                assert '로그인하지 않았습니다' in page.locator('#cloudUser').text_content()
            result['checks'].append('cloud_configuration_matches_ui')
            if configured:
                # 실제 메일을 보내지 않고 브라우저의 Enter·오류·재요청 동작만 검사한다.
                origin = page.evaluate('() => RenewTaskCloudConfig.url').rstrip('/')
                calls = {'otp': 0, 'verify': 0}

                def auth_response(route):
                    headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
                               'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS'}
                    if route.request.method == 'OPTIONS':
                        route.fulfill(status=204, headers=headers)
                        return
                    kind = route.request.url.rsplit('/', 1)[-1]
                    assert kind in calls, '예상하지 않은 합성 인증 요청입니다.'
                    calls[kind] += 1
                    route.fulfill(status=200 if kind == 'otp' else 400, headers=headers,
                                  body=json.dumps({} if kind == 'otp' else {'message': 'synthetic-detail-not-for-display'}))

                ctx.route(origin + '/auth/v1/**', auth_response)
                page.locator('#taskCloud summary').click()
                assert page.evaluate('async()=> (await TaskStore.list()).length') == 0
                page.locator('#cloudEmail').fill('synthetic-user@example.test')
                page.locator('#cloudEmail').press('Enter')
                expect(page.locator('#cloudMsg')).to_contain_text('로그인 메일을 요청했습니다')
                expect(page.locator('#cloudSendCode')).to_be_enabled()
                assert calls == {'otp': 1, 'verify': 0}
                assert page.locator('#taskPick').input_value() == ''
                result['checks'].append('cloud_request_without_task_intercepted')
                for index, control in enumerate(['cloudCode', 'cloudEmail'], 1):
                    page.locator('#cloudCode').fill('123456')
                    page.locator('#' + control).press('Enter')
                    expect(page.locator('#cloudMsg')).to_contain_text('가장 최근에 받은 코드')
                    expect(page.locator('#cloudLogin')).to_be_enabled()
                    expect(page.locator('#cloudCode')).to_have_value('')
                    assert calls == {'otp': 1, 'verify': index}
                result['checks'].append('cloud_enter_with_code_verifies_once_without_resend')
                expect(page.locator('#taskCloud #cloudMsg')).to_be_visible()
                expect(page.locator('#cloudMsg')).to_have_attribute('role', 'status')
                assert 'synthetic-detail-not-for-display' not in page.locator('#cloudMsg').inner_text()
                result['checks'].append('cloud_safe_error_visible_in_panel')
                page.locator('#cloudCode').fill('123456')
                page.locator('#cloudSendCode').click()
                expect(page.locator('#cloudMsg')).to_contain_text('로그인 메일을 요청했습니다')
                expect(page.locator('#cloudSendCode')).to_be_enabled()
                expect(page.locator('#cloudCode')).to_have_value('')
                assert calls == {'otp': 2, 'verify': 2}
                page.locator('#cloudCode').fill('123456')
                page.locator('#cloudEmail').fill('')
                expect(page.locator('#cloudCode')).to_have_value('')
                result['checks'].append('cloud_rerequest_and_email_change_clear_old_code')
                page.locator('#taskCloud summary').click()
            page.locator('#taskActor').fill('합성 검사 작성자')
            for selector, value in {'taskTitle': '합성 과업 — 실제 고객 자료 아님', 'taskProgram': '합성 사업 2026', 'taskGuideline': '합성 지침 v1 https://example.test', 'taskScope': '합성 행정동 경계', 'taskRequirements': '인구 현황 | 합성 지정 자료 | 행정동'}.items():
                page.locator('#' + selector).fill(value)
            page.locator('#planSave:visible, #planForm > .task-save-inline:visible').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("v1")')
            page.locator('#checkForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("C 입력 다시 확인")')
            expect(page.locator('#checkSummary')).to_contain_text('입력 다시 확인')
            result['checks'].append('invalid_C')
            page.locator('#checkResult').select_option('conflict')
            page.locator('#checkNote').fill('합성 근거 보완 대기')
            page.locator('#checkForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("B 근거 부족")')
            expect(page.locator('#checkSummary')).to_contain_text('근거 충돌')
            result['checks'].append('hold_B')
            page.locator('#checkResult').select_option('match')
            page.locator('#checkSource').fill('합성 지정 자료')
            page.locator('#checkPage').fill('합성 원문 1쪽')
            page.locator('#checkUnit').fill('행정동')
            page.locator('#checkFile').set_input_files({'name': 'basis.txt', 'mimeType': 'text/plain', 'buffer': b'synthetic basis only'})
            page.wait_for_function('() => document.querySelector("#checkHash").dataset.hash?.length===64')
            page.locator('#checkForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("A 대조 완료")')
            page.locator('#checkForm button').click()
            page.wait_for_function('() => document.querySelector("#taskMsg").textContent.includes("한도") || document.querySelector("#taskMsg").textContent.includes("3회")')
            result['checks'].extend(['ready_A', 'retry_limit'])
            page.locator('[data-step="2"]').click()
            page.locator('#deliveryFiles').set_input_files({'name': 'delivery.txt', 'mimeType': 'text/plain', 'buffer': b'synthetic delivery only'})
            page.locator('#fileForm button').click()
            page.wait_for_selector('#artifactList li')
            page.locator('#decisionDetails summary').click()
            page.locator('#decisionReviewer').fill('합성 검토자')
            page.locator('#decisionRole').fill('합성 책임자')
            page.locator('#decisionDate').fill(date.today().isoformat())
            page.locator('#decisionNote').fill('시험용 결정이며 실제 승인 증거가 아닙니다.')
            page.locator('#decisionFile').set_input_files({'name': 'review.txt', 'mimeType': 'text/plain', 'buffer': b'synthetic review fixture only'})
            page.locator('#decisionForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("최종 승인 기록됨")')
            result['checks'].append('decision_bound_to_files')
            page.locator('#handoverTask').click()
            expect(page.locator('#handoverPreview')).to_be_visible()
            page.locator('#deliveryFiles').set_input_files({'name': 'delivery.txt', 'mimeType': 'text/plain', 'buffer': b'synthetic delivery only'})
            page.locator('#fileForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("A 대조 완료")')
            assert '요구 자료 대조 전' not in page.locator('#artifactList').inner_text()
            expect(page.locator('#handoverPreview')).to_be_hidden()
            expect(page.locator('#downloadHandover')).to_be_hidden()
            result['checks'].append('new_revision_clears_previous_handover')
            page.locator('#handoverTask').click()
            expect(page.locator('#handoverPreview')).to_be_visible()
            page.locator('#handoverPreview details summary').click()
            expect(page.locator('#handoverComparisonStatus')).to_contain_text('승인 기록과 현재')
            expect(page.locator('#handoverChanges')).to_contain_text('기록 차이가 없거나')
            page.locator('#deliveryFiles').set_input_files({'name': 'delivery-revised.txt', 'mimeType': 'text/plain', 'buffer': b'synthetic revised delivery only'})
            page.locator('#fileForm button').click()
            expect(page.locator('#handoverPreview')).to_be_hidden()
            page.locator('#handoverTask').click()
            expect(page.locator('#handoverChanges')).to_contain_text('현재 판에만 있는 파일')
            expect(page.locator('#handoverChanges')).to_contain_text('delivery-revised.txt')
            assert not re.search(r'files/[a-f0-9]{64}', page.locator('#handoverChanges').inner_text())
            assert page.evaluate('async()=> (await TaskStore.history(document.querySelector("#taskPick").value)).at(-1).decision') is None
            result['checks'].append('handover_compares_approved_files_without_approving_current_revision')
            page.locator('#decisionForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("최종 승인 기록됨")')
            result['checks'].append('file_reattach_invalidates_decision_without_false_blocker')
            with page.expect_download() as downloaded:
                page.locator('#backupTask').click()
            backup = args.output / 'synthetic-backup.json'
            downloaded.value.save_as(backup)
            data = json.loads(backup.read_text(encoding='utf-8'))
            page.locator('#handoverTask').click()
            expect(page.locator('#handoverPreview')).to_be_visible()
            with page.expect_download() as downloaded:
                page.locator('#downloadHandover').click()
            guide_file = args.output / 'synthetic-handover.txt'
            downloaded.value.save_as(guide_file)
            guide = guide_file.read_text(encoding='utf-8')
            assert data['manifest']['head_hash'] in guide
            assert data['manifest']['history'][-1]['spec']['title'] in guide
            assert all('files/' + f['sha256'] in guide for f in data['files'])
            with page.expect_download() as downloaded:
                page.locator('#zipTask').click()
            delivery = args.output / 'synthetic-delivery.zip'
            downloaded.value.save_as(delivery)
            with zipfile.ZipFile(delivery) as z:
                manifest = json.loads(z.read('manifest.json'))
                assert manifest['head_hash'] == data['manifest']['head_hash']
                assert z.read('인수인계.txt') == guide_file.read_bytes()
                for name in z.namelist():
                    if name.startswith('files/'):
                        assert hashlib.sha256(z.read(name)).hexdigest() == name.split('/')[1].split('.')[0]   # r12: files/<sha>.<확장자>
            result['checks'].append('backup_zip_actual_bytes')
            selected = page.get_by_role('checkbox', name='delivery.txt 전달 선택', exact=True)
            selected.check()
            page.locator('#deliveryScope summary').click()
            expect(page.locator('#deliveryScopeFiles')).to_contain_text('delivery.txt')
            expect(page.locator('#deliverySelection')).to_contain_text('ZIP 파일 1개')
            with page.expect_download() as downloaded:
                page.locator('#selectedDelivery').click()
            selected_path = args.output / 'synthetic-selected.zip'
            downloaded.value.save_as(selected_path)
            with zipfile.ZipFile(selected_path) as chosen:
                receipt = json.loads(chosen.read('전달_파일_목록.json'))
                original, = receipt['files']
                assert original['name'] == 'delivery.txt'
                assert receipt['head_sha256'] == manifest['head_hash']
                index = chosen.read('전달_파일_목록.txt').decode('utf-8')
                assert original['name'] in index and original['path'] in index
                assert '승인 기록' in index
                assert original['size'] == len(chosen.read(original['path']))
                assert original['sha256'] == hashlib.sha256(chosen.read(original['path'])).hexdigest()
                assert 'delivery.txt' not in chosen.read('사용범위.txt').decode('utf-8')
                receipt_payload = chosen.read('전달_파일_목록.json')
                file_payload = chosen.read(original['path'])
            receiver = browser.new_context(service_workers='block')
            try:
                recipient = receiver.new_page()
                recipient.goto(base + 'tasks.html#receivedDelivery', wait_until='networkidle')
                expect(recipient.locator('#newTask')).to_be_enabled()
                requests = []
                receiver.on('request', lambda req: requests.append(req.method))
                recipient.locator('#receivedList').set_input_files({
                    'name': '전달_파일_목록.json', 'mimeType': 'application/json', 'buffer': receipt_payload,
                })
                expected_basename = original['path'].split('/')[-1]
                picker = recipient.locator('#receivedFiles')
                picker.set_input_files({'name': expected_basename, 'mimeType': 'application/octet-stream', 'buffer': file_payload})
                recipient.locator('#receivedCheck').click()
                expect(recipient.locator('#receivedStatus')).to_contain_text('모두 일치')
                picker.set_input_files({'name': 'renamed-delivery.txt', 'mimeType': 'application/octet-stream', 'buffer': file_payload})
                expect(recipient.locator('#receivedStatus')).to_have_text('')
                recipient.locator('#receivedCheck').click()
                expect(recipient.locator('#receivedIssues')).to_contain_text('누락')
                expect(recipient.locator('#receivedIssues')).to_contain_text('목록 밖')
                with recipient.expect_download() as requested:
                    recipient.locator('#receivedRequest').click()
                txt = args.output / 'synthetic-resend.txt'
                requested.value.save_as(txt)
                note = txt.read_text(encoding='utf-8')
                assert original['path'] in note and '누락' in note
                assert 'renamed-delivery.txt' not in note and original['name'] not in note
                recipient.locator('#receivedMore').set_input_files({
                    'name': expected_basename, 'mimeType': 'application/octet-stream', 'buffer': file_payload,
                })
                recipient.locator('#receivedAdd').click()
                expect(recipient.locator('#receivedStatus')).to_contain_text('1개 일치')
                expect(recipient.locator('#receivedIssues')).to_contain_text('목록 밖')
                expect(recipient.locator('#receivedRequest')).to_be_hidden()
                picker.set_input_files({
                    'name': expected_basename, 'mimeType': 'application/octet-stream', 'buffer': file_payload,
                })
                expect(recipient.locator('#receivedStatus')).to_have_text('')
                recipient.locator('#receivedCheck').click()
                expect(recipient.locator('#receivedStatus')).to_contain_text('모두 일치')
                result['checks'].append('recipient_downloads_minimal_resend_request_and_checks_replacement')
                digest = hashlib.sha256(receipt_payload).hexdigest()
                expect(recipient.locator('#receivedListSha')).to_have_text(digest)
                with recipient.expect_download() as matched:
                    recipient.locator('#receivedConfirmation').click()
                confirmation = args.output / 'synthetic-received-match.txt'
                matched.value.save_as(confirmation)
                text = confirmation.read_text(encoding='utf-8')
                assert digest in text and '실제 파일 1개 모두 일치' in text
                assert original['name'] not in text and original['path'] not in text
                manifest_changed = receipt_payload + b'\n'
                recipient.locator('#receivedList').set_input_files({
                    'name': '전달_파일_목록.json', 'mimeType': 'application/json', 'buffer': manifest_changed,
                })
                expect(recipient.locator('#receivedConfirmation')).to_be_hidden()
                expect(recipient.locator('#receivedListSha')).to_be_hidden()
                recipient.locator('#receivedCheck').click()
                expect(recipient.locator('#receivedListSha')).to_have_text(hashlib.sha256(manifest_changed).hexdigest())
                result['checks'].append('recipient_match_report_uses_exact_input_manifest_bytes')
                recipient.locator('#sentDelivery summary').click()
                sender_list = recipient.locator('#sentList')
                response_text = recipient.locator('#sentValue')
                sender_list.set_input_files({
                    'name': '전달_파일_목록.json', 'mimeType': 'application/json', 'buffer': receipt_payload,
                })
                response_text.fill(text)
                recipient.locator('#sentCheck').click()
                expect(recipient.locator('#sentStatus')).to_contain_text('목록과 결과 TXT가 일치합니다')
                expect(recipient.locator('#sentListSha')).to_have_text(digest)
                response_text.fill(text.replace('실제 파일 1개','실제 파일 2개').replace('목록 이름 1개','목록 이름 2개'))
                expect(recipient.locator('#sentListSha')).to_be_hidden()
                recipient.locator('#sentCheck').click()
                expect(recipient.locator('#sentStatus')).to_contain_text('확인값 일치')
                expect(recipient.locator('#sentStatus')).to_contain_text('다릅니다')
                result['checks'].append('sender_matches_real_recipient_report_without_accepting_changed_counts')
                sender_list.set_input_files([
                    {'name':'changed.json','mimeType':'application/json','buffer':manifest_changed},
                    {'name':'original.json','mimeType':'application/json','buffer':receipt_payload},
                    {'name':'invalid.json','mimeType':'application/json','buffer':b'{}'},
                    {'name':'copy.json','mimeType':'application/json','buffer':receipt_payload},
                ])
                response_text.fill(text)
                recipient.locator('#sentCheck').click()
                expect(recipient.locator('#sentStatus')).to_contain_text('일치 2개')
                expect(recipient.locator('#sentStatus')).to_contain_text('대조 못함 1개')
                expect(recipient.locator('#sentCopies')).to_contain_text('같은 원본의 사본 2개')
                candidates = recipient.locator('#sentCandidates li')
                expect(candidates.first).to_contain_text('original.json')
                expect(candidates.nth(1)).to_contain_text('copy.json')
                expect(candidates.nth(2)).to_contain_text('같은 판')
                expect(candidates.nth(3)).to_contain_text('대조 못함')
                result['checks'].append('sender_finds_identical_copies_in_mixed_batch_without_hiding_errors')
                assert recipient.evaluate('async()=>[(await TaskStore.list()).length,(await FieldStore.docs()).length]') == [0,0]
                assert not requests
            finally:
                receiver.close()
            result['checks'].append('recipient_checks_downloaded_file_without_task_or_transfer')
            page.get_by_role('button', name='delivery.txt 선택 해제', exact=True).click()
            expect(selected).not_to_be_checked()
            expect(page.locator('#selectedDelivery')).to_be_disabled()
            result['checks'].append('selected_scope_recipient_index_matches_zip_without_internal_files')
            assert page.evaluate('async()=> (await TaskStore.history(document.querySelector("#taskPick").value)).at(-1).hash') == manifest['head_hash']
            result['checks'].append('handover_matches_zip_and_preserves_history')
            for width, zoom in [(1280, 1), (360, 1), (390, 1), (768, 1), (1440, 1), (320, 1), (640, 2)]:
                page.set_viewport_size({'width': width, 'height': 900})
                page.evaluate('(z) => document.documentElement.style.zoom=String(z)', zoom)
                for step in range(3):
                    page.locator(f'.task-steps [data-step="{step}"]').click()   # r16: 안내 칸(#taskNoPlan)에도 data-step="0" 단추가 있다
                    assert page.evaluate('() => document.documentElement.scrollWidth<=innerWidth+1')
                if width in (390, 1440):
                    page.locator('#handoverSummary').screenshot(path=str(args.output / f'handover-{width}.png'))
                page.screenshot(path=str(args.output / f'tasks-{width}-{zoom}.png'))
            result['checks'].append('layout_320_360_390_768_1280_1440_zoom200')
            downloads = []
            page.on('download', lambda d: downloads.append(d.suggested_filename))
            recorded_file = next(f for f in manifest['history'][-1]['artifacts'] if f['name']=='delivery.txt')
            first_used = next(r['revision'] for r in manifest['history']
                              if any(f['sha256']==recorded_file['sha256'] for f in r['artifacts']))
            page.evaluate('''async (sha)=>{
              const id=document.querySelector('#taskPick').value;
              const fileId='task-file:'+id+':'+sha;
              if(!await FieldStore.doc(fileId))throw Error('시험 파일 없음');
              await FieldStore.deleteDoc(fileId);
            }''', recorded_file['sha256'])
            page.locator('#downloadHandover').click()
            expect(page.locator('#handoverStatus')).to_contain_text('복구용 인수인계 요약')
            expect(page.locator('#handoverPreview')).to_be_visible()
            expect(page.locator('#handoverRecovery')).to_be_visible()
            expect(page.locator('#downloadHandover')).to_be_hidden()
            expect(page.locator('#downloadRecoveryHandover')).to_be_visible()
            expect(page.locator('#downloadRecoveryHandover')).to_be_enabled()
            issues = page.locator('#handoverRecoveryFiles')
            expect(issues).to_contain_text('delivery.txt')
            expect(issues).to_contain_text('연결 파일 없음')
            expect(issues).to_contain_text('현재판에 연결')
            expect(issues).to_contain_text(f'사용 판: v{first_used}')
            expect(issues).to_contain_text(f"v{manifest['history'][-1]['revision']}")
            assert not downloads, downloads
            with page.expect_download() as downloaded:
                page.locator('#downloadRecoveryHandover').click()
            recovery = downloaded.value
            assert recovery.suggested_filename.startswith('renewmap-recovery-handover-')
            recovery_path = args.output / 'synthetic-handover-recovery.txt'
            recovery.save_as(recovery_path)
            recovery_text = recovery_path.read_text(encoding='utf-8')
            assert recovery_text.startswith('리뉴맵 복구용 인수인계 요약')
            assert recorded_file['sha256'] in recovery_text and manifest['head_hash'] in recovery_text
            for button in ('#zipTask', '#backupTask'):
                expect(page.locator(button)).to_be_enabled()
                page.locator(button).click()
                expect(page.locator('#taskMsg')).to_contain_text('연결된 파일이 없습니다')
                expect(page.locator(button)).to_be_enabled()
                assert downloads == [recovery.suggested_filename], downloads
            assert page.evaluate('async()=> (await TaskStore.history(document.querySelector("#taskPick").value)).at(-1).hash') == manifest['head_hash']
            result['checks'].append('missing_file_allows_recovery_txt_but_blocks_full_backup')
            original = next(f for f in json.loads(backup.read_text(encoding='utf-8'))['files']
                            if f['sha256']==recorded_file['sha256'])
            content = base64.b64decode(original['base64'])
            def choose(name, data):
                page.locator('#reconnectFile').set_input_files({
                    'name': name, 'mimeType': 'application/octet-stream', 'buffer': data,
                })
                page.locator('#reconnectTaskFile').click()
                expect(page.locator('#handoverTask')).to_be_enabled()

            choose(recorded_file['name'], bytes((b ^ 1 for b in content)))
            expect(page.locator('#taskMsg')).to_contain_text('확인값과 일치하지 않습니다')
            assert page.evaluate("""async sha=>{
              const id=document.querySelector('#taskPick').value;
              return !(await FieldStore.doc('task-file:'+id+':'+sha));
            }""", recorded_file['sha256'])
            choose('renamed-synthetic-source.bin', content)
            expect(page.locator('#taskMsg')).to_contain_text('원본 파일을 복구했습니다')
            expect(page.locator('#downloadHandover')).to_be_focused()
            expect(page.locator('#handoverRecovery')).to_be_hidden()
            expect(page.locator('#taskState')).to_contain_text('최종 승인 기록됨')
            with page.expect_download() as downloaded:
                page.locator('#zipTask').click()
            reconnected_zip = args.output / 'synthetic-reconnected.zip'
            downloaded.value.save_as(reconnected_zip)
            with zipfile.ZipFile(reconnected_zip) as z:
                assert json.loads(z.read('manifest.json')) == manifest
                member, = (n for n in z.namelist() if n.startswith('files/'+recorded_file['sha256']))
                assert z.read(member) == content
            result['checks'].append('reconnect_original_bytes_keeps_revision_and_approval')
            restored = browser.new_context(accept_downloads=True, service_workers='block')
            q = restored.new_page()
            q.on('pageerror', lambda e: result['errors'].append(str(e)))
            q.goto(base + 'tasks.html', wait_until='networkidle')
            q.locator('[data-step="2"]').click()
            q.get_by_text('백업 복원', exact=True).click()
            q.locator('#restoreFile').set_input_files(backup)
            q.locator('#restoreTask').click()
            q.wait_for_function('() => document.querySelector("#taskState").textContent.includes("최종 승인 기록됨")')
            q.wait_for_function('() => !document.querySelector("#newTask").disabled')
            actual = q.evaluate('async()=>{const id=document.querySelector("#taskPick").value;return (await TaskStore.history(id)).at(-1).hash;}')
            assert actual == manifest['head_hash']
            q.reload(wait_until='networkidle')
            q.wait_for_function('() => document.querySelector("#taskState").textContent.includes("최종 승인 기록됨")')
            result['checks'].append('restore_reload_identical_history')
            task_id = q.locator('#taskPick').input_value()
            q.goto(base + 'tasks.html?id=' + task_id + '&step=revisit', wait_until='networkidle')
            expect(q.locator('#newTask')).to_be_enabled()
            expect(q.locator('#taskPick')).to_have_value(task_id)
            expect(q.locator('#taskNoPlan')).to_be_hidden()
            expect(q.locator('[data-panel="1"]')).to_be_visible()
            expect(q.locator('#revisitReport')).to_have_attribute('open', '')
            expect(q.locator('#revisitReport > summary')).to_be_visible()
            assert q.evaluate('async(id)=>(await TaskStore.history(id)).at(-1).hash', task_id) == actual
            result['checks'].append('direct_revisit_preserves_selected_task_and_history')
            q.goto(base + 'tasks.html?id=' + task_id + '&step=delivery#handoverSummary', wait_until='networkidle')
            expect(q.locator('#newTask')).to_be_enabled()
            expect(q.locator('#handoverSummary')).to_be_visible()
            expect(q.locator('#handoverTask')).to_be_visible()
            assert q.evaluate('async(id)=>(await TaskStore.history(id)).at(-1).hash', task_id) == actual
            result['checks'].append('direct_delivery_opens_handover_for_selected_task')
            map_context=browser.new_context(accept_downloads=True,service_workers='block')
            if not args.base:
                # 검사 주소는 네이버 지도 키의 허용 도메인이 아니다. 인증에 실패한 SDK가 던지는 내부 오류를 화면 오류로 세지 않게 ui_smoke처럼 요청을 막고 대체 지도로 본다
                map_context.route('https://oapi.map.naver.com/openapi/v3/maps.js**', lambda route: route.abort())
            m=map_context.new_page()
            m.on('pageerror',lambda e:result['errors'].append(str(e)))
            m.goto(base+'explore.html?report=brief&panel=evidence#map/21/21090/21090700',wait_until='load')
            # 2026-11-19 FR-57 P05: '과업에 연결'은 접힌 '파일 더 보기'(details.rp-more-files) 안에 있다. 사용자처럼 열고 누른다
            m.wait_for_function("()=>{const b=document.querySelector('[data-task-package]');return b&&!b.disabled}",timeout=60000)   # 서식을 다 불러와 다시 그린 뒤에 연다
            m.evaluate("()=>{const d=document.querySelector('[data-task-package]').closest('details');if(d)d.open=true}")
            m.locator('[data-task-package]').first.click()
            m.wait_for_url('**/tasks.html?packet=*',timeout=60000)
            m.wait_for_function('() => document.querySelector("#packetPick").options.length>1')
            packet=m.evaluate('async()=>{const p=(await FieldStore.docs()).find(x=>x.kind==="task-packet");return {count:p.files.length,names:p.files.map(f=>f.name),allHashed:p.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)&&f.blob.size===f.size),ruleBlockers:p.files.some(f=>f.blockers.length>0)};}')
            assert packet['count']==6 and packet['allHashed'],packet
            assert packet['ruleBlockers'], 'Current unapproved rules must not become approved in a packet'
            result['checks'].append('real_map_four_formats_fixed_input_comparison_six_files')
            assert not result['errors'], result['errors']
            browser.close()
    finally:
        if server:
            server.shutdown()
            server.server_close()
        (args.output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
