"""합성 조사자료로 실제 UI·제출서식·수정 전 이력·납품 ZIP·기기 복원을 대조한다."""
import argparse
import base64
import functools
import hashlib
import io
import json
import re
import threading
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.etree import ElementTree as ET

from playwright.sync_api import expect, sync_playwright

MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh5sAAAAASUVORK5CYII=')


def fixture():
    parts = {
        '[Content_Types].xml': f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels': f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{OFFICE}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': f'<workbook xmlns="{MAIN}" xmlns:r="{OFFICE}"><sheets><sheet name="제출" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{OFFICE}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{MAIN}"><dimension ref="A1:D6"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>합성 신청서</t></is></c><c r="D1"><f>1+2</f><v>3</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="B6:C6"/></mergeCells></worksheet>',
    }
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, value in parts.items():
            z.writestr(name, value)
    return data.getvalue()


def run(browser, base, out):
    errors = []
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, service_workers='block')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base + 'tasks.html', wait_until='networkidle')

    def field(key, value):
        page.locator('#' + key).fill(value)

    def step(number):
        page.locator(f'[data-step="{number}"]').click()

    def version(number):
        try:
            expect(page.locator('#taskState')).to_contain_text(f'v{number}', timeout=15000)
            expect(page.locator('#newTask')).to_be_enabled()
        except Exception as exc:
            raise AssertionError(f'과업 v{number} 저장 실패: ' + page.locator('#taskMsg').inner_text()) from exc

    def download(button, name):
        with page.expect_download() as pending:
            page.locator('#' + button).click()
        path = out / name
        pending.value.save_as(path)
        return path

    def upload(control, name, content, mime='text/plain'):
        page.locator('#' + control).set_input_files({'name': name, 'mimeType': mime, 'buffer': content})

    expect(page.locator('#newTask')).to_be_enabled()
    for key, value in {
        'taskActor': '합성 작성자', 'taskTitle': '합성 조사 변경 검증', 'taskProgram': '합성 공모',
        'taskGuideline': '합성 지침 판본 1', 'taskScope': '합성 구역', 'taskRequirements': '빈집 조사 | 합성 목록 | 건물',
    }.items():
        field(key, value)
    page.locator('#planForm button').click()
    version(1)
    step(1)
    page.locator('#checkResult').select_option('match')
    field('checkSource', '합성 지정 자료')
    field('checkPage', '합성 원문 7쪽')
    field('checkUnit', '건물')
    upload('checkFile', 'basis.txt', b'synthetic requirement evidence')
    expect(page.locator('#checkHash')).to_have_attribute('data-hash', re.compile(r'^[a-f0-9]{64}$'))
    page.locator('#checkForm button').click()
    version(2)

    step(2)
    upload('deliveryFiles', '일반첨부.txt', b'keep unrelated delivery file')
    page.locator('#fileForm button').click()
    version(3)

    # 독립 브라우저의 실제 현장 보관함에 가상의 사진·방문 기록을 넣는다.
    record_id = 'qa-survey-field-1'
    field_sha = page.evaluate("""async id => {
        const canvas = document.createElement('canvas'); canvas.width=canvas.height=2;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
        const sha=await RenewTasks.hash(await blob.arrayBuffer());
        const photoId='qa-photo-1';
        await FieldStore.tx(['records','photos'],'readwrite',(records,photos)=>{
            photos.put({id:photoId,blob});
            return records.put({id, recorded_at:'2026-11-01T15:30:00Z', target:'건물', jibun:'합성 지번 1',
                observed:'현장 확인 완료', memo:'담장 재확인', status:'기록', photos:[photoId], photo_sha256:{[photoId]:sha}});
        });
        return sha;
    }""", record_id)
    step(1)
    page.locator('#surveyChanges summary').first.click()
    template = fixture()
    official = '관리번호,원자료상태\n합성-001,대조대상\n'.encode('utf-8-sig')
    source_sha = hashlib.sha256(official).hexdigest()
    png_sha = hashlib.sha256(PNG).hexdigest()
    rows = [('add', '추가', 'B2'), ('exclude', '제외', 'B3'), ('hold', '보류', 'B4')]
    for index, (kind, label, slot) in enumerate(rows):
        page.locator('#changePick').select_option(index=0)
        for key, value in {
            'changeSite': label + ' 합성 건물', 'changeSource': '합성 원목록 7쪽', 'changeCutoff': '2026-10-01',
            'changeBefore': '목록에 없음' if kind=='add' else '기존 목록 포함', 'changeObserved': '2026-11-01',
            'changeAfter': '합성 관찰 '+label, 'changeReason': '현장 재확인 '+label,
            'changeFormName': '합성 공모 신청서', 'changeSheet': '제출', 'changeCell': slot, 'changeSubmitText': '=합성 '+label,
        }.items():
            field(key, value)
        page.locator('#changeKind').select_option(kind)
        if index == 0:
            page.locator('#changeRecord').select_option(record_id)
            page.locator('#changeImport').click()
            expect(page.locator('#changeSite')).to_have_value('합성 지번 1')
            assert page.locator('#changeObserved').input_value() == '2026-11-02'
            assert '담장 재확인' in page.locator('#changeAfter').input_value()
            upload('changeBaselineFile', '합성원목록.csv', official, 'text/csv')
            upload('changeTemplate', '기관양식.xlsx', template, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        elif kind == 'exclude':
            upload('changePhotos', '현장.png', PNG, 'image/png')
        page.locator('#changeSave').click()
        version(4 + index)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    step(2)
    page.locator('#decisionDetails summary').click()
    field('decisionReviewer', '합성 검토자')
    field('decisionRole', '합성 책임자')
    field('decisionDate', '2026-11-03')
    field('decisionNote', '합성 증빙·기능 검수')
    upload('decisionFile', 'review.txt', b'synthetic decision evidence')
    page.locator('#decisionForm button').click()
    expect(page.locator('#taskMsg')).to_contain_text('미해결')
    version(6)

    step(1)
    page.locator('#changePick').select_option(index=3)
    assert page.locator('#changeKind').input_value() == 'hold'
    page.locator('#changeKind').select_option('add')
    field('changeObserved', '2026-11-03')
    field('changeAfter', '재방문으로 확인')
    field('changeReason', '재조사 보완 근거')
    field('changeSubmitText', '=합성 보완 완료')
    upload('changePhotos', '재방문.png', PNG, 'image/png')
    page.locator('#changeSave').click()
    version(7)
    step(2)
    page.locator('#decisionForm button').click()
    version(8)
    assert '최종 승인 기록됨' in page.locator('#taskState').inner_text()
    archive = download('zipTask', 'survey.zip')
    backup = download('backupTask', 'survey.json')

    with zipfile.ZipFile(archive) as z:
        manifest = json.loads(z.read('manifest.json'))
        files = {k[6:]:z.read(k) for k in z.namelist() if k.startswith('files/')}
    assert all(hashlib.sha256(body).hexdigest() == sha for sha, body in files.items())
    assert files[source_sha] == official and files[png_sha] == PNG and field_sha in files
    assert files[hashlib.sha256(template).hexdigest()] == template
    history = manifest['history']
    held, final = history[5], history[-1]
    assert len(history) == 8 and final['hash'] == manifest['head_hash']
    assert any('보류' in reason for a in held['artifacts'] for reason in a['blockers'])
    assert not any(a['blockers'] for a in final['artifacts'])
    assert any(a['name'] == '일반첨부.txt' for a in final['artifacts'])

    def body(version_record, name):
        item = next(a for a in version_record['artifacts'] if a['name'] == name)
        return files[item['sha256']]

    old_rows = json.loads(body(held, '조사변경근거.json'))['rows']
    new_rows = json.loads(body(final, '조사변경근거.json'))['rows']
    assert [r['change'] for r in old_rows] == ['add','exclude','hold']
    assert [r['change'] for r in new_rows] == ['add','exclude','add']
    assert [r['id'] for r in old_rows] == [r['id'] for r in new_rows]
    first, second, third = new_rows
    assert (first['field_id'],first['observed_on'],first['as_of']) == (record_id,'2026-11-02','2026-10-01')
    assert first['baseline_file']['sha256'] == source_sha and first['photos'][0]['sha256'] == field_sha
    assert second['photos'][0]['sha256'] == third['photos'][0]['sha256'] == png_sha
    assert old_rows[2]['photos'] == [] and third['reason'] == '재조사 보완 근거' and third['observed_on'] == '2026-11-03'

    def cells(book, part):
        data = ET.fromstring(book.read(part))
        return {c.get('r'): c for c in data.iter('{'+MAIN+'}c')}

    for record, last, source_rows in [(held,'=합성 보류',old_rows),(final,'=합성 보완 완료',new_rows)]:
        with zipfile.ZipFile(io.BytesIO(body(record,'제출서식_작성본.xlsx'))) as book:
            actual = cells(book, 'xl/worksheets/sheet1.xml')
            assert actual['D1'].find('{'+MAIN+'}f').text == '1+2'
            for slot, value in [('B2','=합성 추가'),('B3','=합성 제외'),('B4', last)]:
                assert actual[slot].get('t') == 'inlineStr' and ''.join(actual[slot].itertext()) == value
        with zipfile.ZipFile(io.BytesIO(body(record, '조사변경근거.xlsx'))) as book:
            sheet_bytes = b' '.join(book.read(p) for p in book.namelist() if p.startswith('xl/worksheets/'))
            for expected in [source_rows[0]['id'],source_sha,field_sha,png_sha,'2026-10-01','2026-11-02',source_rows[2]['reason']]:
                assert expected.encode() in sheet_bytes, expected
    bad = page.evaluate("""async data=>{
      const file=new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'입력.xlsx');
      const rejected=[];
      for(const cell of ['D1','C6','XFE1']) {
        try {await RenewSurveyTemplate.fill(file,[{sheet:'제출',cell,text:'합성'}]);rejected.push(false)}
        catch {rejected.push(true)}
      }
      return rejected;
    }""",base64.b64encode(template).decode())
    assert all(bad)

    fresh = browser.new_context(service_workers='block', accept_downloads=True, viewport={'width':320,'height':760})
    p = fresh.new_page()
    p.on('pageerror', lambda e: errors.append(str(e)))
    p.goto(base + 'tasks.html',wait_until='networkidle')
    p.locator('[data-step="2"]').click()
    p.get_by_text('백업 복원',exact=True).click()
    p.locator('#restoreFile').set_input_files(backup)
    p.locator('#restoreTask').click()
    expect(p.locator('#taskState')).to_contain_text('v8', timeout=15000)
    assert p.evaluate('async()=> (await TaskStore.history(document.querySelector("#taskPick").value)).at(-1).hash') == manifest['head_hash']
    p.locator('[data-step="1"]').click()
    p.locator('#surveyChanges summary').first.click()
    expect(p.locator('#changePick option')).to_have_count(4)
    p.locator('#changePick').select_option(index=3)
    assert p.locator('#changeReason').input_value() == '재조사 보완 근거'
    assert p.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    with p.expect_download() as restored_form:
        p.locator('#changeDownloadForm').click()
    restored = out / 'restored.xlsx'
    restored_form.value.save_as(restored)
    assert restored.read_bytes() == body(final, '제출서식_작성본.xlsx')
    assert not errors, errors
    ctx.close()
    fresh.close()
    return {'checks': ['add_exclude_hold','field_store_import_with_photo','source_file_sha_and_both_dates',
        'three_exact_template_cells','formula_and_merge_protection','hold_denies_decision','resolved_accepts_decision',
        'prior_blocker_and_prior_workbook_preserved','unrelated_attachment_retained','delivery_zip_hashes',
        'fresh_restore_workbook_identical','mobile_width_320_390'], 'revisions': len(history), 'errors': errors}


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--base')
    ap.add_argument('--channel')
    ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
    root=Path(__file__).resolve().parents[1]
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=None
    try:
        if not args.base:
            site=root/'landing' if (root/'landing').exists() else root
            server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(site)))
            threading.Thread(target=server.serve_forever,daemon=True).start()
        base=args.base or f'http://127.0.0.1:{server.server_port}/'
        with sync_playwright() as pw:
            browser=pw.chromium.launch(**({'channel':args.channel} if args.channel else {}))
            result=run(browser,base,args.output)
            browser.close()
        (args.output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False))
    finally:
        if server: server.shutdown();server.server_close()
