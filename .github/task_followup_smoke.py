"""합성 과업으로 의견·보완·해소, 후속 점검, 판 이력·파일 복원을 실제 UI에서 대조한다."""
import argparse
import base64
import functools
import hashlib
import json
import re
import threading
import zipfile
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from revisit_report_smoke import attachment, download, restore
from survey_change_smoke import run as create_survey


def run(browser, base, out, baseline):
    initial = json.loads(baseline.read_text('utf-8'))
    old = initial['manifest']['history']
    assert old[-1]['spec']['title'] == '합성 조사 변경 검증', '합성 검증 백업만 사용합니다.'
    assert old[-1]['state'] == 'approved'
    source_sha = attachment(old[-1], '일반첨부.txt')
    original_files = {f['sha256']: base64.b64decode(f['base64']) for f in initial['files']}
    contexts, errors, evidence = [], [], {}

    def new_page():
        ctx = browser.new_context(accept_downloads=True, service_workers='block', viewport={'width': 390, 'height': 844})
        contexts.append(ctx)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        return page

    page = new_page()
    try:
        restore(page, base, baseline, len(old))
        revision = len(old)

        def history():
            return page.evaluate("async()=>await TaskStore.history(document.querySelector('#taskPick').value)")

        def version(number):
            try:
                expect(page.locator('#taskState')).to_contain_text(re.compile(r'v' + str(number) + r'(?:\D|$)'), timeout=15000)
                expect(page.locator('#newTask')).to_be_enabled()
            except AssertionError as exc:
                raise AssertionError(page.locator('#workMsg').inner_text() + ' / ' + page.locator('#taskMsg').inner_text()) from exc

        def work(kind, selected=None, action=None):
            page.locator('[data-step="3"]').click()
            page.locator('#workKind').select_option(kind)
            if page.locator('#workBrowse').get_attribute('open') is None:
                page.locator('#workBrowse summary').click()
            page.locator('#workFilter').select_option('all')
            if selected is None:
                page.locator('#workNew').click()
            else:
                page.locator('#workPick').select_option(selected)
            if action:
                page.locator('#workAction').select_option(action)

        def upload(name, content):
            evidence[hashlib.sha256(content).hexdigest()] = content
            page.locator('#workEvidence').set_input_files({'name': name, 'mimeType': 'text/plain', 'buffer': content})

        def save(bump=1):
            nonlocal revision
            page.locator('#workSave').click()
            version(revision + bump)
            revision += bump
            return history()[-1]

        def decide(allowed):
            nonlocal revision
            page.locator('[data-step="2"]').click()
            panel = page.locator('#decisionDetails')
            if panel.get_attribute('open') is None:
                panel.locator('summary').click()
            for key, value in {'decisionReviewer': '합성 최종 검토자', 'decisionRole': '책임자',
                               'decisionDate': date.today().isoformat(), 'decisionNote': '검토 의견과 후속 점검 이력 검수'}.items():
                page.locator('#' + key).fill(value)
            page.locator('#decisionFile').set_input_files({'name': '최종검토.txt', 'mimeType': 'text/plain', 'buffer': b'QA final verification'})
            page.locator('#decisionForm button').click()
            if allowed:
                revision += 1
                version(revision)
                expect(page.locator('#taskState')).to_contain_text('최종 승인 기록됨')
            else:
                expect(page.locator('#taskMsg')).to_contain_text('미해결')
                expect(page.locator('#newTask')).to_be_enabled()
                assert len(history()) == revision

        page.locator('#taskActor').fill('합성 의견 검토자')
        work('issue')
        page.locator('#workRequirement').select_option(old[-1]['spec']['requirements'][0]['id'])
        page.locator('#workArtifact').select_option(source_sha)
        for key, value in {'workLocation': '합성 제출자료 B2', 'workRowId': '합성-001',
                           'workComment': '최초 조사와 현장 보완 사유를 대조해 주세요.', 'workAssignee': '합성 조사 작성자'}.items():
            page.locator('#' + key).fill(value)
        opened = save()
        issue = opened['work']['issues'][0]
        issue_id = issue['id']
        assert issue['source']['revision'] == len(old) and issue['source']['hash'] == old[-1]['hash']
        assert issue['source']['artifact']['sha256'] == source_sha
        assert opened['decision'] is None
        decide(False)

        page.locator('#taskActor').fill('합성 조사 작성자')
        work('issue', issue_id, 'reply')
        page.locator('#workNote').fill('파일명만 바뀐 원본으로는 보완할 수 없어야 합니다.')
        page.locator('#workEvidence').set_input_files({'name': '원본이름변경.txt', 'mimeType': 'text/plain', 'buffer': original_files[source_sha]})
        page.locator('#workSave').click()
        expect(page.locator('#workMsg')).to_contain_text('원본과 다른')
        expect(page.locator('#newTask')).to_be_enabled()
        assert len(history()) == revision
        work('issue', issue_id, 'reply')
        page.locator('#workNote').fill('이력 저장 실패 때 파일만 남지 않아야 합니다.')
        page.locator('#workEvidence').set_input_files({'name': '실패검사.txt', 'mimeType': 'text/plain', 'buffer': b'QA uncommitted correction'})
        files_before = page.evaluate('async()=> (await FieldStore.docs()).length')
        page.evaluate("()=>{window.qaFastForward=TaskStore.fastForward;TaskStore.fastForward=async()=>{throw new Error('QA injected history failure')};}")
        try:
            page.locator('#workSave').click()
            expect(page.locator('#workMsg')).to_contain_text('QA injected history failure')
            expect(page.locator('#newTask')).to_be_enabled()
            assert len(history()) == revision
            assert page.evaluate('async()=> (await FieldStore.docs()).length') == files_before
        finally:
            page.evaluate('()=>{TaskStore.fastForward=window.qaFastForward;delete window.qaFastForward;}')
        work('issue', issue_id, 'reply')
        page.locator('#workNote').fill('제출자료의 추가 사유와 기준일을 보완했습니다.')
        upload('보완본1.txt', b'QA revised evidence one')
        replied = save(2)
        assert replied['work']['issues'][0]['status'] == 'submitted'
        assert replied['work']['issues'][0]['source'] == issue['source']

        page.locator('#taskActor').fill('합성 의견 검토자')
        work('issue', issue_id, 'resolve')
        page.locator('#workNote').fill('보완본의 추가 사유와 기준일 대조를 완료했습니다.')
        upload('해소확인1.txt', b'QA resolution confirmation one')
        resolved = save()
        assert resolved['work']['issues'][0]['status'] == 'resolved'

        future = (date.today() + timedelta(days=30)).isoformat()
        past = (date.today() - timedelta(days=1)).isoformat()
        work('followup')
        page.locator('#workRequirement').select_option(issue['requirement_id'])
        page.locator('#workIssue').select_option(issue_id)
        for key, value in {'workTitle': '준공 후 같은 지점의 현황 재점검', 'workDue': future, 'workAssignee': '합성 현장 담당자'}.items():
            page.locator('#' + key).fill(value)
        follow = save()['work']['followups'][0]
        follow_id = follow['id']
        assert follow['issue_id'] == issue_id
        decide(True)
        first_approval = history()[-1]

        work('issue', issue_id, 'reopen')
        page.locator('#workNote').fill('새 현장자료가 들어와 변경 사유를 재검토합니다.')
        reopened = save()
        assert reopened['work']['issues'][0]['resolution'] is None
        decide(False)
        page.locator('#taskActor').fill('합성 조사 작성자')
        work('issue', issue_id, 'reply')
        page.locator('#workNote').fill('추가 현장자료를 반영한 두 번째 보완본입니다.')
        upload('보완본2.txt', b'QA revised evidence two')
        save(2)
        page.locator('#taskActor').fill('합성 의견 검토자')
        work('issue', issue_id, 'resolve')
        page.locator('#workNote').fill('두 번째 보완본과 최초 근거를 다시 대조했습니다.')
        upload('해소확인2.txt', b'QA resolution confirmation two')
        save()

        work('followup', follow_id, 'reschedule')
        for key, value in {'workDue': past, 'workAssignee': '합성 대체 담당자', 'workNote': '인계에 따라 담당과 기한을 조정합니다.'}.items():
            page.locator('#' + key).fill(value)
        scheduled = save()['work']['followups'][0]
        assert scheduled['due_on'] == past and scheduled['assignee'] == '합성 대체 담당자'
        assert scheduled['schedule']['note'] == '인계에 따라 담당과 기한을 조정합니다.'
        page.locator('#workFilter').select_option('overdue')
        expect(page.locator('#workList')).to_contain_text(follow['title'])
        for action, actor, name, content in [
            ('submit', '합성 대체 담당자', '후속점검1.txt', b'QA followup inspection one'),
            ('verify', '합성 의견 검토자', '후속확인1.txt', b'QA followup verification one'),
        ]:
            page.locator('#taskActor').fill(actor)
            work('followup', follow_id, action)
            page.locator('#workNote').fill('지정 지점의 후속 점검 근거를 기록합니다.')
            upload(name, content)
            save()
        assert history()[-1]['work']['followups'][0]['status'] == 'verified'
        page.locator('#workFilter').select_option('overdue')
        expect(page.locator('#workList')).not_to_contain_text(follow['title'])
        work('followup', follow_id, 'reopen')
        page.locator('#workNote').fill('관찰 조건이 달라져 다시 확인합니다.')
        save()
        work('followup', follow_id, 'reschedule')
        for key, value in {'workDue': future, 'workAssignee': '합성 재점검 담당자', 'workNote': '강우 뒤 같은 지점을 재방문합니다.'}.items():
            page.locator('#' + key).fill(value)
        save()
        for action, name, content in [
            ('submit', '후속점검2.txt', b'QA followup inspection two'),
            ('verify', '후속확인2.txt', b'QA followup verification two'),
        ]:
            page.locator('#taskActor').fill('합성 재점검 담당자' if action == 'submit' else '합성 의견 검토자')
            work('followup', follow_id, action)
            page.locator('#workNote').fill('재방문 자료와 관찰 조건을 확인했습니다.')
            upload(name, content)
            save()
        decide(True)
        page.locator('[data-step="2"]').click()
        archive = download(page, 'zipTask', out / 'followup.zip')
        backup = download(page, 'backupTask', out / 'followup.json')
        with zipfile.ZipFile(archive) as zipped:
            manifest = json.loads(zipped.read('manifest.json'))
            files = {name[6:]: zipped.read(name) for name in zipped.namelist() if name.startswith('files/')}
        current = manifest['history'][-1]
        assert manifest['history'][:len(old)] == old
        assert first_approval in manifest['history'] and first_approval['state'] == 'approved'
        assert all(files[sha] == data for sha, data in {**original_files, **evidence}.items())
        assert all(hashlib.sha256(data).hexdigest() == sha for sha, data in files.items())
        assert current['work']['issues'][0]['source'] == issue['source']
        assert current['work']['issues'][0]['status'] == 'resolved'
        assert current['work']['followups'][0]['status'] == 'verified'

        fresh = new_page()
        incomplete = json.loads(backup.read_text('utf-8'))
        missing_sha = hashlib.sha256(b'QA resolution confirmation one').hexdigest()
        incomplete['files'] = [item for item in incomplete['files'] if item['sha256'] != missing_sha]
        fresh.goto(base + 'tasks.html', wait_until='networkidle')
        fresh.locator('[data-step="2"]').click()
        fresh.get_by_text('백업 복원', exact=True).click()
        fresh.locator('#restoreFile').set_input_files({'name': '누락백업.json', 'mimeType': 'application/json',
                                                      'buffer': json.dumps(incomplete, ensure_ascii=False).encode('utf-8')})
        fresh.locator('#restoreTask').click()
        expect(fresh.locator('#taskMsg')).to_contain_text('빠져')
        expect(fresh.locator('#newTask')).to_be_enabled()
        expect(fresh.locator('#taskPick')).to_have_value('')
        files_before_restore = fresh.evaluate('async()=> (await FieldStore.docs()).length')
        fresh.locator('#restoreFile').set_input_files(backup)
        fresh.evaluate("()=>{window.qaRestore=TaskStore.restore;TaskStore.restore=async()=>{throw new Error('QA injected restore failure')};}")
        try:
            fresh.locator('#restoreTask').click()
            expect(fresh.locator('#taskMsg')).to_contain_text('QA injected restore failure')
            expect(fresh.locator('#newTask')).to_be_enabled()
            assert fresh.evaluate('async()=> (await FieldStore.docs()).length') == files_before_restore
            expect(fresh.locator('#taskPick')).to_have_value('')
            assert fresh.evaluate('async()=> (await TaskStore.list()).length') == 0
        finally:
            fresh.evaluate('()=>{TaskStore.restore=window.qaRestore;delete window.qaRestore;}')
        restore(fresh, base, backup, revision)
        fresh.locator('[data-step="3"]').click()
        fresh.locator('#workKind').select_option('issue')
        fresh.locator('#workPick').select_option(issue_id)
        expect(fresh.locator('#workDetail')).to_contain_text('합성 제출자료 B2')
        fresh.locator('#workKind').select_option('followup')
        fresh.locator('#workPick').select_option(follow_id)
        expect(fresh.locator('#workDetail')).to_contain_text('합성 재점검 담당자')
        fresh.set_viewport_size({'width': 320, 'height': 800})
        assert fresh.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        fresh.screenshot(path=str(out / 'followup-320.png'), animations='disabled')
        fresh.locator('[data-step="2"]').click()
        restored = json.loads(download(fresh, 'backupTask', out / 'restored.json').read_text('utf-8'))
        assert restored['manifest'] == manifest
        restored_files = {f['sha256']: base64.b64decode(f['base64']) for f in restored['files']}
        assert restored_files == files
        assert not errors, errors
        return {'checks': ['source_version_and_file_pinned', 'open_issue_blocks_approval', 'same_bytes_reply_rejected_atomically',
                           'failed_history_write_leaves_no_orphan_file', 'failed_restore_leaves_no_orphan_files_or_head', 'revised_file_and_resolution',
                           'future_followup_allows_approval', 'reopen_requires_new_resolution', 'deadline_assignee_reason',
                           'overdue_filter', 'followup_submit_verify_reopen', 'original_and_previous_approval_preserved',
                           'all_evidence_bytes_in_zip', 'missing_old_resolution_file_rejected', 'fresh_restore_identical', 'mobile_320'],
                'revisions': revision, 'evidence_files': len(files), 'errors': errors,
                'scope': '합성 자료·독립 브라우저·기기 내 검증. 서버의 실제 계정 권한은 별도 검증.'}
    finally:
        for ctx in contexts:
            ctx.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base')
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--channel')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[1]

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    server = None
    try:
        if not args.base:
            site = root / 'landing' if (root / 'landing').exists() else root
            server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
            threading.Thread(target=server.serve_forever, daemon=True).start()
        base = (args.base or f'http://127.0.0.1:{server.server_port}/').rstrip('/') + '/'
        with sync_playwright() as pw:
            browser = pw.chromium.launch(**({'channel': args.channel} if args.channel else {}))
            baseline = args.baseline
            if baseline is None:
                workdir = args.output / 'baseline'
                workdir.mkdir(exist_ok=True)
                create_survey(browser, base, workdir)
                baseline = workdir / 'survey.json'
            result = run(browser, base, args.output, baseline)
            browser.close()
        (args.output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        if server:
            server.shutdown()
            server.server_close()
