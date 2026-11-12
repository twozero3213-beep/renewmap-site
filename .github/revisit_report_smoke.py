"""최초 조사 행과 준공 후 재방문을 실제 UI로 연결하여 실적 XLSX와 납품 이력을 검사한다."""
import argparse
import base64
import functools
import hashlib
import io
import json
import posixpath
import re
import threading
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.etree import ElementTree as ET

from playwright.sync_api import expect, sync_playwright
from survey_change_smoke import MAIN, OFFICE, PKG, fixture, run as create_survey


def attachment(version, name):
    return next(item['sha256'] for item in version['artifacts'] if item['name'] == name)


def restore(page, base, path, revision):
    page.goto(base+'tasks.html',wait_until='networkidle')
    page.locator('[data-step="2"]').click()
    page.get_by_text('백업 복원',exact=True).click()
    page.locator('#restoreFile').set_input_files(path)
    page.locator('#restoreTask').click()
    expect(page.locator('#taskState')).to_contain_text(f'v{revision}',timeout=15000)
    expect(page.locator('#newTask')).to_be_enabled()


def download(page, button, path):
    with page.expect_download() as pending:
        page.locator('#'+button).click()
    pending.value.save_as(path)
    return path


def open_report(page):
    page.locator('[data-step="1"]').click()
    panel=page.locator('#revisitReport')
    if panel.get_attribute('open') is None:
        panel.locator('summary').first.click()


def change(page, key, value):
    control=page.locator('#'+key)
    if control.evaluate("el=>el.tagName==='SELECT'"):
        control.select_option(label=value)
    else:
        control.fill(value)


def check_preview_images(book):
    def linked(part, rel_id):
        rel_name=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
        rel=next(r for r in ET.fromstring(book.read(rel_name)) if r.get('Id')==rel_id)
        target=rel.attrib['Target']
        return target[1:] if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(part),target))
    workbook='xl/workbook.xml'
    sheet=next(s for s in ET.fromstring(book.read(workbook)).iter('{'+MAIN+'}sheet') if s.attrib['name']=='전후 사진')
    part=linked(workbook,sheet.attrib['{'+OFFICE+'}id'])
    drawing=ET.fromstring(book.read(part)).find('{'+MAIN+'}drawing')
    assert drawing is not None, '전후 사진 시트에 실제 그림 관계가 없습니다.'
    drawing_part=linked(part,drawing.attrib['{'+OFFICE+'}id'])
    images={}
    for anchor in ET.fromstring(book.read(drawing_part)):
        col=anchor.findtext('./{*}from/{*}col')
        blip=anchor.find('.//{*}blip')
        if col is not None and blip is not None:
            images[int(col)]=book.read(linked(drawing_part,blip.attrib['{'+OFFICE+'}embed']))
    assert 1 in images and 2 in images and images[1]!=images[2], '전후 사진의 B/C열 연결이 다릅니다.'
    assert all(data.startswith(bytes.fromhex('ffd8ff')) for data in images.values()), 'JPEG 미리보기 파일 형식이 아닙니다.'


def run(browser,base,out,baseline):
    baseline_data=json.loads(baseline.read_text('utf-8'))
    previous=baseline_data['manifest']['history']
    start=len(previous)
    assert previous[-1]['spec']['title']=='합성 조사 변경 검증', '합성 조사 검증 백업만 사용할 수 있습니다.'
    survey_sha=attachment(previous[-1],'조사변경근거.json')
    archive_files={f['sha256']:base64.b64decode(f['base64']) for f in baseline_data['files']}
    survey=json.loads(archive_files[survey_sha])
    original=next(r for r in survey['rows'] if r['field_id']=='qa-survey-field-1')
    before_sha=original['photos'][0]['sha256']
    assert original['observed_on']=='2026-11-02'
    contexts=[]
    errors=[]
    def new_page():
        ctx=browser.new_context(accept_downloads=True,service_workers='block',viewport={'width':390,'height':844})
        contexts.append(ctx)
        p=ctx.new_page()
        p.on('pageerror',lambda e:errors.append(str(e)))
        return p
    try:
        page=new_page()
        restore(page,base,baseline,start)
        change(page,'taskActor','합성 재방문 담당자')
        # 같은 지점과 관계없는 기록도 동시에 저장해, 다른 장소를 섞는 경로를 검사한다.
        encoded=page.evaluate("""async ({field_id,subject}) => {
            const canvas=document.createElement('canvas');canvas.width=canvas.height=3;
            const pen=canvas.getContext('2d');pen.fillStyle='green';pen.fillRect(0,0,3,3);
            const blob=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg'));
            const sha=await RenewTasks.hash(await blob.arrayBuffer()),photo='qa-revisit-jpeg';
            const record={id:'qa-linked-revisit',site_id:field_id,visit_previous_id:field_id,
                recorded_at:'2026-11-12T00:20:00Z',target:'건물',jibun:subject,status:'기록',
                observed:'보행로 단차 해소',memo:'강우 뒤 확인',
                visit:{date:'2026-11-12',area:'합성 건물 정면',start:'09:00',end:'09:20',
                       weather:'비',method:'직접 관찰',context:'행사 없음'},
                photos:[photo],photo_sha256:{[photo]:sha}};
            await FieldStore.tx(['records','photos'],'readwrite',(rs,ps)=>{
                ps.put({id:photo,blob});rs.put(record);return rs.put({...record,id:'qa-other-revisit',
                    site_id:'other-site',visit_previous_id:'other-record',jibun:'다른 합성 지번'});
            });
            return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
        }""",original)
        after_image=base64.b64decode(encoded)
        after_sha=hashlib.sha256(after_image).hexdigest()
        assert after_sha!=before_sha
        open_report(page)
        page.locator('#rvSource').select_option(survey_sha)
        page.locator('#rvRow').select_option(original['id'])
        def phase(which):
            page.locator('#rvPage'+which).click()
        def conditions(prefix):
            for part,value in {'Area':'합성 건물 정면','Start':'09:00','End':'09:20','Weather':'맑음',
                               'Method':'직접 관찰','Context':'행사 없음'}.items():
                change(page,prefix+part,value)
        conditions('rvBefore')
        phase('After')
        wrong_id='qa-other-revisit'
        if page.locator('#rvRecord option[value="'+wrong_id+'"]').count():
            page.locator('#rvRecord').select_option(wrong_id)
            page.locator('#rvImport').click()
            expect(page.locator('#rvMsg')).to_contain_text(re.compile('지점|장소|연결|최초|이전'))
        conditions('rvAfter')
        for part,value in {'Completion':'2026-11-10','Date':'2026-11-09','Reason':'보행로 단차 정비',
                           'Result':'통행 단차가 해소됨'}.items():
            change(page,'rv'+part,value)
        page.locator('#rvSameSite').check()
        page.locator('#rvPhotos').set_input_files({'name':'준공후.jpg','mimeType':'image/jpeg','buffer':after_image})
        phase('Report')
        for part,value in {'FormName':'합성 준공 실적보고서','Sheet':'제출','Cell':'B5','Text':'=재방문 보고 1판'}.items():
            change(page,'rv'+part,value)
        template=fixture()
        page.locator('#rvTemplate').set_input_files({'name':'합성 실적.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':template})
        def save(revision):
            page.locator('#rvSave').click()
            try:
                expect(page.locator('#taskState')).to_contain_text(f'v{revision}',timeout=12000)
                expect(page.locator('#newTask')).to_be_enabled()
            except AssertionError as exc:
                raise AssertionError(page.locator('#rvMsg').inner_text()+' / '+page.locator('#taskMsg').inner_text()) from exc
        page.locator('#rvSave').click()
        expect(page.locator('#newTask')).to_be_enabled()
        assert page.evaluate('async()=>(await TaskStore.history(document.querySelector("#taskPick").value)).length')==start
        phase('After')
        change(page,'rvCompletion','2026-11-05')
        phase('Report')
        save(start+1)
        page.locator('#rvPick').select_option(index=1)
        phase('After')
        page.locator('#rvRecord').select_option('qa-linked-revisit')
        page.locator('#rvImport').click()
        expect(page.locator('#rvDate')).to_have_value('2026-11-12')
        expect(page.locator('#rvAfterWeather')).to_have_value('비')
        change(page,'rvReason','강우 뒤 변경 사항 재확인')
        page.locator('#rvSameSite').check()
        phase('Report')
        change(page,'rvText','=재방문 보고 2판')
        save(start+2)
        def decide():
            page.locator('[data-step="2"]').click()
            panel=page.locator('#decisionDetails')
            if panel.get_attribute('open') is None:
                panel.locator('summary').click()
            for key,value in {'decisionReviewer':'합성 검토자','decisionRole':'책임자','decisionDate':'2026-11-12',
                              'decisionNote':'실적보고서 검수 시험'}.items():
                change(page,key,value)
            page.locator('#decisionFile').set_input_files({'name':'review.txt','mimeType':'text/plain','buffer':b'QA review'})
            page.locator('#decisionForm button').click()
            expect(page.locator('#newTask')).to_be_enabled()
        decide()
        expect(page.locator('#taskState')).to_contain_text('최종 승인 기록됨')
        held_sha=attachment(previous[5],'조사변경근거.json')
        held_row=next(r for r in json.loads(archive_files[held_sha])['rows'] if r['change']=='hold')
        assert not held_row['photos']
        open_report(page)
        page.locator('#rvPick').select_option(index=0)
        phase('Before')
        page.locator('#rvSource').select_option(held_sha)
        page.locator('#rvRow').select_option(held_row['id'])
        conditions('rvBefore')
        phase('After')
        for part,value in {'Completion':'2026-11-05','Date':'2026-11-10','Reason':'보완한 현장 자료 대조','Result':'정비 후 재방문'}.items():
            change(page,'rv'+part,value)
        conditions('rvAfter')
        page.locator('#rvPhotos').set_input_files({'name':'준공후.jpg','mimeType':'image/jpeg','buffer':after_image})
        page.locator('#rvSameSite').check()
        phase('Report')
        for part,value in {'FormName':'합성 준공 실적보고서','Sheet':'제출','Cell':'C5','Text':'보완 대상'}.items():
            change(page,'rv'+part,value)
        save(start+4)
        decide()
        expect(page.locator('#taskMsg')).to_contain_text('미해결')
        expect(page.locator('#taskState')).to_contain_text(f'v{start+4}')
        # 실제 조사 화면에서 같은 행의 보완 사진을 새 판에 추가한다.
        page.locator('[data-step="1"]').click()
        survey_panel=page.locator('#surveyChanges')
        if survey_panel.get_attribute('open') is None:
            survey_panel.locator('summary').first.click()
        page.locator('#changePick').select_option(held_row['id'])
        page.locator('#changeClearPhotos').click()
        blue=page.evaluate("""() => {
            const c=document.createElement('canvas');c.width=c.height=3;
            const pen=c.getContext('2d');pen.fillStyle='blue';pen.fillRect(0,0,3,3);
            return c.toDataURL('image/jpeg').split(',')[1];
        }""")
        repaired_photo=base64.b64decode(blue)
        page.locator('#changePhotos').set_input_files({'name':'보완최초.jpg','mimeType':'image/jpeg','buffer':repaired_photo})
        change(page,'changeReason','동일 대상 최초 조사 사진 보완')
        page.locator('#changeSave').click()
        expect(page.locator('#taskState')).to_contain_text(f'v{start+5}')
        expect(page.locator('#newTask')).to_be_enabled()
        repaired_sha=page.evaluate("""async()=> (await TaskStore.history(document.querySelector('#taskPick').value))
            .at(-1).artifacts.find(a=>a.name==='조사변경근거.json').sha256""")
        assert repaired_sha not in (held_sha,survey_sha)
        open_report(page)
        page.locator('#rvPick').select_option(index=2)
        phase('Before')
        page.locator('#rvRepairBase').check()
        page.locator('#rvSource').select_option(repaired_sha)
        expect(page.locator('#rvRow')).to_have_value(held_row['id'])
        conditions('rvBefore')
        phase('After')
        expect(page.locator('#rvSameSite')).not_to_be_checked()
        page.locator('#rvSameSite').check()
        phase('Report')
        save(start+6)
        decide()
        expect(page.locator('#taskState')).to_contain_text('최종 승인 기록됨')
        page.locator('[data-step="2"]').click()
        archive=download(page,'zipTask',out/'revisit.zip')
        backup=download(page,'backupTask',out/'revisit.json')
        with zipfile.ZipFile(archive) as z:
            m=json.loads(z.read('manifest.json'))
            files={p[6:]:z.read(p) for p in z.namelist() if p.startswith('files/')}
        assert all(hashlib.sha256(data).hexdigest()==sha for sha,data in files.items())
        assert files[before_sha]==archive_files[before_sha] and files[after_sha]==after_image
        assert m['history'][:start]==previous and len(m['history'])==start+7
        for index,version in enumerate(m['history'][start:start+2],1):
            report=json.loads(files[attachment(version,'재방문대조.json')])
            row,=report['rows']
            assert (row['survey_sha256'],row['survey_row_id'],row['site_key'])==(survey_sha,original['id'],original['id'])
            assert row['initial']['subject']==original['subject'] and row['initial']['observed_on']==original['observed_on']
            assert row['initial']['source_hash']==survey['source_hash'] and row['initial']['source_revision']==survey['source_revision']
            carrier=previous[row['initial']['delivery_revision']-1]
            assert carrier['hash']==row['initial']['delivery_hash'] and attachment(carrier,'조사변경근거.json')==survey_sha
            assert row['initial']['photos'][0]['sha256']==before_sha and row['photos'][0]['sha256']==after_sha
            assert row['completed_on']=='2026-11-05'
            assert row['observed_on']==('2026-11-09' if index==1 else '2026-11-12')
            assert row['comparison']['status']==('기록한 조건 일치' if index==1 else '관찰 조건 다름')
            if index==2:
                assert row['field_id']=='qa-linked-revisit' and row['reason']=='강우 뒤 변경 사항 재확인'
                assert '날씨 다름' in row['comparison']['reasons'] and '요일 다름' in row['comparison']['reasons']
            with zipfile.ZipFile(io.BytesIO(files[attachment(version,'재방문실적보고서.xlsx')])) as book:
                check_preview_images(book)
                texts=' '.join(''.join(ET.fromstring(book.read(n)).itertext())
                               for n in book.namelist() if n.startswith('xl/worksheets/') and n.endswith('.xml'))
                for value in [original['subject'],before_sha,after_sha,original['observed_on'],row['observed_on'],
                              row['completed_on'],row['reason'],row['comparison']['status'],'합성 건물 정면']:
                    assert value in texts,value
            with zipfile.ZipFile(io.BytesIO(files[attachment(version,'실적서식_작성본.xlsx')])) as book:
                cells={el.get('r'):el for el in ET.fromstring(book.read('xl/worksheets/sheet1.xml')).iter('{'+MAIN+'}c')}
                assert cells['B5'].get('t')=='inlineStr' and ''.join(cells['B5'].itertext())==f'=재방문 보고 {index}판'
                assert cells['D1'].find('{'+MAIN+'}f').text=='1+2'
            assert files[attachment(version,'실적서식_원본.xlsx')]==template
            assert attachment(version,'조사변경근거.json')==survey_sha
        signed,held,updated_survey,fixed,approved=m['history'][-5:]
        assert signed['state']==approved['state']=='approved' and signed['decision'] and approved['decision']
        assert held['decision'] is None and fixed['decision'] is None
        assert attachment(signed,'재방문대조.json')==attachment(m['history'][start+1],'재방문대조.json')
        assert any('보류' in b for a in held['artifacts'] for b in a['blockers'])
        assert attachment(updated_survey,'재방문대조.json')==attachment(held,'재방문대조.json')
        assert any('보류' in b for a in updated_survey['artifacts'] for b in a['blockers'])
        assert not any(a['blockers'] for a in approved['artifacts'])
        def report_rows(version):
            return json.loads(files[attachment(version,'재방문대조.json')])['rows']
        old,new=report_rows(held)[1],report_rows(approved)[1]
        assert old['id']==new['id'] and old['survey_row_id']==new['survey_row_id']==held_row['id']
        assert old['survey_sha256']==held_sha and new['survey_sha256']==repaired_sha
        assert old['initial']['change']=='hold' and not old['initial']['photos']
        assert new['initial']['change']=='add' and files[new['initial']['photos'][0]['sha256']]==repaired_photo
        assert old['photos']==new['photos'] and old['reason']==new['reason']
        p=new_page()
        restore(p,base,backup,start+7)
        open_report(p)
        p.locator('#rvPick').select_option(index=1)
        p.locator('#rvPageAfter').click()
        expect(p.locator('#rvReason')).to_have_value('강우 뒤 변경 사항 재확인')
        p.locator('#rvPageReport').click()
        assert download(p,'rvDownloadForm',out/'restored.xlsx').read_bytes()==files[attachment(m['history'][-1],'실적서식_작성본.xlsx')]
        p.set_viewport_size({'width':320,'height':800})
        p.locator('#rvPageReport').scroll_into_view_if_needed()
        assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        p.screenshot(path=str(out/'revisit-report-320.png'),animations='disabled')
        assert not errors,errors
        return {'checks':['wrong_site_filtered_or_rejected','linked_field_revisit_import','precompletion_visit_rejected','bound_original_row_and_ledger',
                          'both_dated_photo_bytes','before_after_preview_links_B_C','matching_and_changed_conditions','report_sheet_dates_conditions_reason',
                          'designated_xlsx_cell_literal','source_and_previous_reports_preserved','delivery_zip_hashes',
                          'held_initial_blocks_approval','same_row_repaired_source_releases_blocker','prior_signed_report_preserved',
                          'fresh_restore_download_identical','mobile_320'], 'revisions':len(m['history']),'errors':errors}
    finally:
        for ctx in contexts:
            ctx.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--base')
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--channel')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
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
            baseline=args.baseline
            if baseline is None:
                work=args.output/'baseline';work.mkdir(exist_ok=True)
                create_survey(browser,base,work)
                baseline=work/'survey.json'
            result=run(browser,base,args.output,baseline)
            browser.close()
        (args.output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False))
    finally:
        if server: server.shutdown();server.server_close()
