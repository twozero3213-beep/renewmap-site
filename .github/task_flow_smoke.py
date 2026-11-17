"""합성 과업의 오류·보류·대조·파일·검토·백업 복원을 실제 브라우저에서 검사한다."""
import argparse
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
                expect(page.locator('[data-panel="' + panel + '"]')).to_be_visible()
                expect(page.locator('[data-step="' + panel + '"]')).to_have_attribute('aria-current', 'step')
                if detail:
                    expect(page.locator('#' + detail)).to_have_attribute('open', '')
                expect(page.locator('#taskMsg')).to_contain_text(re.compile(r'과업.*저장'))
                assert page.evaluate('async()=> (await TaskStore.list()).length') == 0
            result['checks'].append('direct_workflow_links_open_without_creating_records')
            page.goto(base + 'tasks.html?step=delivery#handoverSummary', wait_until='networkidle')
            expect(page.locator('#newTask')).to_be_enabled()
            expect(page.locator('#handoverSummary')).to_be_visible()
            assert page.evaluate('async()=> (await TaskStore.list()).length') == 0
            page.locator('#handoverTask').click()
            expect(page.locator('#handoverStatus')).to_contain_text('요약을 만들지 못했습니다')
            expect(page.locator('#handoverPreview')).to_be_hidden()
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
            page.locator('#planForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("v1")')
            page.locator('#checkForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("C 입력 오류")')
            result['checks'].append('invalid_C')
            page.locator('#checkResult').select_option('pending')
            page.locator('#checkNote').fill('합성 근거 보완 대기')
            page.locator('#checkForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("B 근거 부족")')
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
                        assert hashlib.sha256(z.read(name)).hexdigest() == name.split('/')[1]
            result['checks'].append('backup_zip_actual_bytes')
            assert page.evaluate('async()=> (await TaskStore.history(document.querySelector("#taskPick").value)).at(-1).hash') == manifest['head_hash']
            result['checks'].append('handover_matches_zip_and_preserves_history')
            for width, zoom in [(1280, 1), (360, 1), (390, 1), (768, 1), (1440, 1), (320, 1), (640, 2)]:
                page.set_viewport_size({'width': width, 'height': 900})
                page.evaluate('(z) => document.documentElement.style.zoom=String(z)', zoom)
                for step in range(3):
                    page.locator(f'[data-step="{step}"]').click()
                    assert page.evaluate('() => document.documentElement.scrollWidth<=innerWidth+1')
                if width in (390, 1440):
                    page.locator('#handoverSummary').screenshot(path=str(args.output / f'handover-{width}.png'))
                page.screenshot(path=str(args.output / f'tasks-{width}-{zoom}.png'))
            result['checks'].append('layout_320_360_390_768_1280_1440_zoom200')
            downloads = []
            page.on('download', lambda d: downloads.append(d.suggested_filename))
            page.evaluate('''async()=>{
              const id=document.querySelector('#taskPick').value;
              const file=(await FieldStore.docs()).find(x=>x.kind==='task-file' && x.task_id===id);
              if(!file)throw Error('시험 파일 없음');
              await FieldStore.deleteDoc(file.id);
            }''')
            page.locator('#downloadHandover').click()
            expect(page.locator('#handoverStatus')).to_contain_text('요약을 만들지 못했습니다')
            expect(page.locator('#handoverPreview')).to_be_hidden()
            expect(page.locator('#zipTask')).to_be_enabled()
            page.locator('#zipTask').click()
            expect(page.locator('#taskMsg')).to_contain_text('연결된 파일이 없습니다')
            expect(page.locator('#zipTask')).to_be_enabled()
            assert not downloads, downloads
            assert page.evaluate('async()=> (await TaskStore.history(document.querySelector("#taskPick").value)).at(-1).hash') == manifest['head_hash']
            result['checks'].append('missing_file_blocks_txt_zip_and_stale_preview')
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
            expect(q.locator('#revisitReport')).to_have_attribute('open', '')
            assert q.evaluate('async(id)=>(await TaskStore.history(id)).at(-1).hash', task_id) == actual
            result['checks'].append('direct_revisit_preserves_selected_task_and_history')
            map_context=browser.new_context(accept_downloads=True,service_workers='block')
            m=map_context.new_page()
            m.on('pageerror',lambda e:result['errors'].append(str(e)))
            m.goto(base+'explore.html?report=brief&panel=evidence#map/21/21090/21090700',wait_until='load')
            m.locator('[data-task-package]').first.wait_for(timeout=60000)
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
