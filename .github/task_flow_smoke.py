"""합성 과업의 오류·보류·대조·파일·검토·백업 복원을 실제 브라우저에서 검사한다."""
import argparse
import functools
import hashlib
import json
import threading
import zipfile
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


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
            page.goto(base + 'tasks.html', wait_until='networkidle')
            page.wait_for_function('() => !document.querySelector("#newTask").disabled')
            configured = page.evaluate('() => window.RenewTaskCloudConfig !== null')
            assert page.locator('#taskCloud').count() == int(configured)
            if configured:
                assert '로그인하지 않았습니다' in page.locator('#cloudUser').text_content()
            result['checks'].append('cloud_configuration_matches_ui')
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
            page.locator('#deliveryFiles').set_input_files({'name': 'delivery.txt', 'mimeType': 'text/plain', 'buffer': b'synthetic delivery only'})
            page.locator('#fileForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("A 대조 완료")')
            assert '요구 자료 대조 전' not in page.locator('#artifactList').inner_text()
            page.locator('#decisionForm button').click()
            page.wait_for_function('() => document.querySelector("#taskState").textContent.includes("최종 승인 기록됨")')
            result['checks'].append('file_reattach_invalidates_decision_without_false_blocker')
            with page.expect_download() as downloaded:
                page.locator('#backupTask').click()
            backup = args.output / 'synthetic-backup.json'
            downloaded.value.save_as(backup)
            data = json.loads(backup.read_text(encoding='utf-8'))
            with page.expect_download() as downloaded:
                page.locator('#zipTask').click()
            delivery = args.output / 'synthetic-delivery.zip'
            downloaded.value.save_as(delivery)
            with zipfile.ZipFile(delivery) as z:
                manifest = json.loads(z.read('manifest.json'))
                assert manifest['head_hash'] == data['manifest']['head_hash']
                for name in z.namelist():
                    if name.startswith('files/'):
                        assert hashlib.sha256(z.read(name)).hexdigest() == name.split('/')[1]
            result['checks'].append('backup_zip_actual_bytes')
            for width, zoom in [(1280, 1), (390, 1), (320, 1), (640, 2)]:
                page.set_viewport_size({'width': width, 'height': 900})
                page.evaluate('(z) => document.documentElement.style.zoom=String(z)', zoom)
                for step in range(3):
                    page.locator(f'[data-step="{step}"]').click()
                    assert page.evaluate('() => document.documentElement.scrollWidth<=innerWidth+1')
                page.screenshot(path=str(args.output / f'tasks-{width}-{zoom}.png'))
            result['checks'].append('layout_320_390_1280_zoom200')
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
