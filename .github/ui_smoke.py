"""공개 화면의 실제 배치·주제 이동·목록 길이를 배포 전에 검사한다."""
import argparse
import base64
import functools
import json
import zipfile
import xml.etree.ElementTree as ET
import re
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


def geometry(page):
    return page.evaluate("""() => {
      const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
      const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
      const tables=[...document.querySelectorAll('table')].filter(visible);
      return {width:innerWidth, scroll:document.documentElement.scrollWidth,
        height:document.documentElement.scrollHeight,
        duplicateIds:ids.filter((id,i)=>ids.indexOf(id)!==i),
        crampedNav:[...document.querySelectorAll('header .site-nav a')].filter(visible).filter(e=>e.getBoundingClientRect().height<44).map(e=>e.textContent),
        exposedHidden:[...document.querySelectorAll('[hidden]')].filter(visible).map(e=>e.id||e.className),
        gridTables:tables.filter(t=>getComputedStyle(t).display==='grid').map(t=>t.className),
        misaligned:tables.filter(t=>{
          const heads=[...t.tHead?.rows[0]?.cells||[]], rows=[...t.tBodies[0]?.rows||[]];
          if(!heads.length||!heads.every(c=>visible(c)&&c.colSpan===1)||getComputedStyle(t).display!=='table')return false;
          return rows.some(row=>row.cells.length===heads.length && [...row.cells].every(c=>c.colSpan===1) &&
            [...row.cells].some((c,i)=>Math.abs(c.getBoundingClientRect().x-heads[i].getBoundingClientRect().x)>1));
        }).map(t=>t.className)};
    }""")



def verify_reusable_evidence(page, output, width):
    original = page.evaluate('() => localStorage.getItem(RenewCandidates.KEY)')
    try:
        page.evaluate(r"""() => {
          const C=RenewCandidates;
          localStorage.setItem(C.KEY,'[]');
          for(const [code,name,value,year] of [['21090700','합성 후보 A',0],['21090701','합성 후보 B',-2.81,2024]]) {
            const basis={source_url:'https://example.org/a',area_code:code,formula_id:'synthetic',formula_text:'합성 산식',rule_version:'synthetic',spatial_unit:'행정동'};
            const item={c:'POP',l:'합성 비율',u:'%',v:value,t:value+'%',s:'미확인',d:'2025-12-31',basis};
            C.save(localStorage,{code,name,saved_at:'2026-11-17T01:00:00.000Z',items:[item,{c:'MISSING',l:'미수집 항목',u:'%',v:null,t:'확인 필요',s:'추가확인',d:null,basis:null}]},'#map/21/21090/'+code,
              [{ind:{code:'POP'},cell:{source_name:'합성기관',retrieved_at:'2026-11-17T00:00:00Z',license_type:'합성',cell_id:'synthetic-'+code,snapshot_id:'synthetic'}}],year);
          }
          C.update(localStorage,'21090700','hold','=1+2\n원천 자료 추가확인');
        }""")
        page.reload(wait_until='networkidle')
        page.wait_for_selector('[data-candidate-select]')
        for checkbox in page.locator('[data-candidate-select]').all():
            checkbox.check()
        before = page.evaluate('() => localStorage.getItem(RenewCandidates.KEY)')
        with page.expect_download() as downloaded:
            page.locator('[data-candidate-xlsx]').click()
        target = output / f'synthetic-candidate-comparison-{width}.xlsx'
        downloaded.value.save_as(target)
        ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        with zipfile.ZipFile(target) as archive:
            assert archive.testzip() is None
            book = ET.fromstring(archive.read('xl/workbook.xml'))
            assert [x.attrib['name'] for x in book.findall('s:sheets/s:sheet',ns)] == ['비교','출처','검토 기록']
            review = ET.fromstring(archive.read('xl/worksheets/sheet3.xml'))
            records = [[''.join(c.itertext()) for c in row] for row in review.findall('s:sheetData/s:row',ns)]
            a = next(r for r in records if r and r[0]=='21090700')
            assert records[0] == ['지역 코드','후보 동','검토 단계','검토 메모','저장 시각','지도 선택 연도']
            assert a == ['21090700','합성 후보 A','보류','','2026-11-17T01:00:00.000Z','미기록']
            b = next(r for r in records if r and r[0]=='21090701')
            assert b[-1] == '2024년'
            comparison = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            values = [float(v.text) for v in comparison.findall('.//s:v',ns)]
            assert 0 in values and -2.81 in values
            assert '자료 없음' in ''.join(comparison.itertext())
            for name in archive.namelist():
                if re.fullmatch(r'xl/worksheets/sheet\d+\.xml',name):
                    assert not ET.fromstring(archive.read(name)).findall('.//s:f',ns), '문자열 메모가 수식으로 실행됩니다.'
        note_option = page.locator('[data-candidate-include-notes]')
        assert not note_option.is_checked()
        note_option.check()
        with page.expect_download() as requested:
            page.locator('[data-candidate-xlsx]').click()
        with zipfile.ZipFile(requested.value.path()) as archive:
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet3.xml'))
            assert '=1+2\n원천 자료 추가확인' in ''.join(sheet.itertext())
            assert not sheet.findall('.//s:f', ns)
        note_option.uncheck()
        assert page.evaluate('() => localStorage.getItem(RenewCandidates.KEY)') == before
        page.context.grant_permissions(['clipboard-read','clipboard-write'])
        copied = page.evaluate(r"""async () => {
          const D=RenewDocgen;
          D.setTemplates(await (await fetch('data/report_templates.json')).json());
          const base={source_name:'합성기관',reference_date:'2025-12-31',value:0,unit:'%',status:'미확인'};
          const brief={dongName:'합성동',sgName:'합성구',region:'합성지역',year:2025,items:[
            {code:'DECLINE_POP_TOTAL',cell:{...base,value:100,unit:'명',source_url:'https://example.org/a'}},
            {code:'DECLINE_POP_DROP30Y_PCT',cell:{...base,source_url:'https://example.org/b'}}]};
          const before=JSON.stringify(brief),fragment=D.buildFragments(brief,['MLIT-DECLINE'])[0],payload=D.fragmentPayload(fragment);
          await D.copyToClipboard(payload);
          return {text:await navigator.clipboard.readText(),html:payload.html,unchanged:JSON.stringify(brief)===before};
        }""")
        assert copied['unchanged'] and '[1][2]' in copied['text']
        assert all(url in copied['text'] and url in copied['html'] for url in ['https://example.org/a','https://example.org/b'])
        (output / f'synthetic-source-fragment-{width}.txt').write_text(copied['text'],encoding='utf-8')
        page.locator('[data-candidates]').screenshot(path=str(output / f'candidate-review-{width}.png'))
    finally:
        page.evaluate('(value) => value===null?localStorage.removeItem(RenewCandidates.KEY):localStorage.setItem(RenewCandidates.KEY,value)', original)


def verify_document_actions(page, output, width, kind):
    if kind == 'box':
        doc_id = 'synthetic-outcome-regression'
        try:
            page.evaluate("""async id => FieldStore.addDoc({id,name:'합성 상태 검사.hwpx',kind:'hwpx',
              created_at:'2026-11-17T00:00:00Z',blob:new Blob(['synthetic'])})""",doc_id)
            for status in ['', 'approved', 'edited']:
                if status:
                    page.locator('select[aria-label="합성 상태 검사.hwpx 결재 결과"]').select_option(status)
                    page.wait_for_function('(id) => FieldStore.doc(id).then(d => d.outcome?.status === "'+status+'")',arg=doc_id)
                page.reload(wait_until='networkidle')
                select = page.locator('select[aria-label="합성 상태 검사.hwpx 결재 결과"]')
                select.wait_for(state='attached')
                export = select.locator('..').locator('.exemplar')
                assert export.is_visible() == (status == 'approved'), f'{status or "결과 없음"}: 채택 내보내기 표시 오류'
        finally:
            page.evaluate('(id) => FieldStore.deleteDoc(id)',doc_id)
            page.reload(wait_until='networkidle')
    else:
        import io
        content = io.BytesIO()
        with zipfile.ZipFile(content,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
            archive.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
            archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>합성 첫 문단</w:t></w:r></w:p><w:p><w:r><w:t>합성 둘째 문단</w:t></w:r></w:p></w:body></w:document>')
        page.locator('#docFile').set_input_files({'name':'synthetic.docx','mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':content.getvalue()})
        page.locator('#docText').wait_for(state='visible')
        with page.expect_download() as downloaded:
            page.locator('#docText').click()
        target = output / f'synthetic-docx-text-{width}.txt'
        downloaded.value.save_as(target)
        assert [line for line in target.read_text(encoding='utf-8-sig').splitlines() if line.strip()] == ['합성 첫 문단','합성 둘째 문단'], 'DOCX 글자 내보내기에 스타일 또는 불필요한 글자가 포함됐습니다.'


def verify_key_reconciliation(page, output, width):
    import csv
    import hashlib
    import io
    def workbook():
        content=io.BytesIO()
        with zipfile.ZipFile(content,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
            archive.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
            archive.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="자료" r:id="s1"/><sheet name="제목만" r:id="s2"/></sheets></workbook>')
            archive.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Target="worksheets/sheet2.xml"/></Relationships>')
            archive.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ID</t></is></c><c r="B1" t="inlineStr"><is><t>메모</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>001</t></is></c><c r="B2" t="inlineStr"><is><t>첫 자료</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>D</t></is></c></row><row r="5"><c r="A5" t="inlineStr"><is><t>D</t></is></c></row><row r="6"><c r="B6" t="inlineStr"><is><t>빈키</t></is></c></row><row r="7"><c r="A7" t="inlineStr"><is><t>=1+2</t></is></c></row></sheetData></worksheet>')
            archive.writestr('xl/worksheets/sheet2.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ID</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t></t></is></c></row></sheetData></worksheet>')
        return content.getvalue()
    tools = page.locator('[data-fold="tools"]')
    if not tools.evaluate('(el) => el.open'):
        tools.locator(':scope > summary').click()
    page.locator('[data-overlay-load]').click()
    a=workbook();b='키,이메일\n001,a@example.org\nD,b@example.org\nRIGHT,c@example.org\n=1+2,d@example.org\n'.encode()
    page.locator('#ovFile').set_input_files({'name':'synthetic-A.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':a})
    page.locator('[data-ov-join] summary').click()
    page.locator('#ovRefFile').set_input_files({'name':'synthetic-B.csv','mimeType':'text/csv','buffer':b})
    page.wait_for_function('() => document.querySelector("[name=ovKeyB]").options.length===2')
    page.locator('[name=ovKeyA]').select_option('0');page.locator('[name=ovKeyB]').select_option('0')
    page.locator('[data-ov-keys]').click()
    assert page.locator('[data-ov-key-result] tbody tr').count()==5
    assert '원본 엑셀 행 번호가 아닙니다' in page.locator('[data-ov-key-result] caption').inner_text()
    with page.expect_download() as downloaded:
        page.locator('[data-ov-keys-csv]').click()
    target=output/f'synthetic-key-review-{width}.csv';downloaded.value.save_as(target)
    text=target.read_text(encoding='utf-8-sig');rows=list(csv.reader(io.StringIO(text)))
    assert [r[1] for r in rows if r and r[0]=='# A 파일 SHA-256']==[hashlib.sha256(a).hexdigest()]
    assert [r[1] for r in rows if r and r[0]=='# B 파일 SHA-256']==[hashlib.sha256(b).hexdigest()]
    records=[r for r in rows if r and r[0] in ('A','B')]
    assert len(records)==9 and len([r for r in records if r[3]=='키 일치'])==4
    assert any(r[2]=='001' for r in records) and any(r[2]=="'=1+2" for r in records)
    assert 'example.org' not in text and '이메일' not in text
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    clipped=page.locator('[data-ov-join]').evaluate('''root => {
      const bounds=root.getBoundingClientRect();
      return [...root.querySelectorAll('p,label,input,select,button')].filter(e=>e.checkVisibility()&&!e.closest('.ov-scroll')).filter(e=>{const b=e.getBoundingClientRect();return b.right>bounds.right+1||b.left<bounds.left-1}).map(e=>e.id||e.tagName);
    }''')
    assert not clipped, f'대조 도구 안쪽 잘림: {clipped}'
    page.locator('[data-ov-join]').screenshot(path=str(output/f'synthetic-key-review-{width}.png'))
    page.locator('#ovSheet').select_option('1')
    assert page.locator('[data-ov-keys-csv]').is_disabled()
    assert page.locator('[data-ov-key-result]').inner_text()==''
    page.locator('[data-ov-keys]').click()
    assert page.locator('[data-ov-keys-csv]').is_disabled()
    page.locator('#ovSheet').select_option('0')
    page.locator('[name=ovKeyA]').select_option('0');page.locator('[name=ovKeyB]').select_option('0');page.locator('[data-ov-keys]').click()
    assert page.locator('[data-ov-keys-csv]').is_enabled()
    page.locator('[name=ovKeyB]').select_option('-1');assert page.locator('[data-ov-keys-csv]').is_disabled()
    page.locator('[name=ovKeyB]').select_option('0');page.locator('[data-ov-keys]').click()
    page.locator('#ovRefFile').set_input_files({'name':'replacement.csv','mimeType':'text/csv','buffer':b'ID\nNEW\n'})
    assert page.locator('[data-ov-keys-csv]').is_disabled()
    assert page.locator('[data-ov-key-result]').inner_text()==''
    assert page.locator('[data-ov-join] a').get_attribute('href')=='tasks.html?step=delivery'
    page.locator('[data-ov-clear]').click()


def verify_field_basis(page, output, width):
    original = page.evaluate('async () => JSON.stringify(await FieldStore.records())')
    ids = ['synthetic-basis-old', 'synthetic-basis-new']
    try:
        page.evaluate("""async ids => {
          const ind={code:'SYNTHETIC',label:'합성 비교 지표',value:'0%',num:0,unit:'%',spatial_unit:'행정동',formula:'old A/B',rule_version:'synthetic-v1',status:'추가확인',reference_date:'2025-12-31',src:{source_name:'합성 출처',source_url:'https://example.org/old',reference_date:'2025-12-31',retrieved_at:'2026-11-17T00:00:00Z',license_type:'미확인'}};
          const input={lat:35.2,lng:129.1,target:'보도',dong:{code:'21090700',name:'합성 비교 동',sgName:'합성 구',sido:'부산광역시'},indicators:[ind]};
          const old=FieldRecord.makeRecord(input,new Date('2026-11-17T00:00:00Z'),ids[0]);
          const current=FieldRecord.makeRecord({...input,site_id:ids[0],visit_previous_id:ids[0],indicators:[{...ind,formula:'new A/C',src:{...ind.src,source_url:'https://example.org/new'}}]},new Date('2026-11-18T00:00:00Z'),ids[1]);
          await FieldStore.tx(['records'],'readwrite',s=>{s.put(old);s.put(current)});
        }""",ids)
        page.reload(wait_until='networkidle')
        detail=page.locator('#list details').filter(has=page.get_by_text('지난 기록의 자료와 비교',exact=True))
        detail.locator('summary').click()
        text=detail.inner_text()
        for expected in ['synthetic-basis-old','표시값 차이 0개','기준 표기 차이 1개','출처 주소','old A/B','new A/C','https://example.org/old','https://example.org/new','0%']:
            assert expected in text, expected
        assert '모두 같음' not in text
        before=page.evaluate('async () => JSON.stringify(await FieldStore.records())')
        with page.expect_download() as downloaded:
            detail.locator('..').get_by_role('button',name='한글 기록·비교 받기',exact=True).click()
        target=output/f'synthetic-field-basis-{width}.hwpx';downloaded.value.save_as(target)
        with zipfile.ZipFile(target) as archive:
            assert archive.testzip() is None
            text=''.join(ET.fromstring(archive.read('Contents/section0.xml')).itertext())
            for expected in ['synthetic-basis-old','지난 기록의 자료와 비교','old A/B','new A/C','https://example.org/old','https://example.org/new']:
                assert expected in text, expected
        assert page.evaluate('async () => JSON.stringify(await FieldStore.records())')==before
    finally:
        page.evaluate("""async ids => {
          for(const r of await FieldStore.records())if(ids.includes(r.id))await FieldStore.deleteRecord(r);
          for(const d of await FieldStore.docs())if(ids.includes(d.record_id))await FieldStore.deleteDoc(d.id);
        }""",ids)
    assert page.evaluate('async () => JSON.stringify(await FieldStore.records())')==original


def verify_field_save_errors(page, width):
    # r16(M20): 아무것도 넣지 않은 기록은 저장하지 않고 무엇을 넣을지 알린다
    count=page.evaluate('async () => (await FieldStore.records()).length')
    page.locator('#f button.save').click()
    page.wait_for_function('() => document.querySelector("#msg").textContent.includes("무엇을 봤나요")')
    assert page.evaluate('async () => (await FieldStore.records()).length')==count,'빈 기록이 저장됐습니다.'
    # 대상을 고르고 위치 없이 저장하면 오류 문구와 지번 칸이 함께 보이고 칸이 열려 초점을 받는다
    page.locator('#targets label').first.click()
    page.locator('#f button.save').click()
    page.wait_for_function('() => document.activeElement.id==="jibun"')
    box=page.locator('#msg').bounding_box();vh=page.viewport_size['height']
    assert box and box['y']>=0 and box['y']+box['height']<=vh,(box,vh)
    assert page.locator('#msg').inner_text().strip(),'위치 없는 저장의 오류 문구가 비었습니다.'
    assert page.locator('#jibunBox').evaluate('el=>el.open'),'지번 칸이 열리지 않았습니다.'
    assert page.evaluate('async () => (await FieldStore.records()).length')==count,'위치 없는 기록이 저장됐습니다.'
    # 재방문을 누르면 날짜·시작이 기기 시계로 채워지고 구간·방식은 비어 있다
    rid='synthetic-visit-default'
    original=page.evaluate('async () => JSON.stringify(await FieldStore.records())')
    try:
        page.evaluate("""async id => { const r=FieldRecord.makeRecord({lat:35.2,lng:129.1,target:'보도'},new Date('2026-11-17T00:00:00Z'),id); await FieldStore.tx(['records'],'readwrite',s=>{s.put(r)}); }""",rid)
        page.reload(wait_until='networkidle')
        page.get_by_role('button',name='이 지점 재방문').first.click()
        assert page.locator('#visit-date').input_value()!='' and page.locator('#visit-start').input_value()!='','재방문 날짜·시작이 비었습니다.'
        assert page.locator('#visit-area').input_value()=='' and page.locator('#visit-method').input_value()=='','재방문 구간·방식이 이전 기록에서 채워졌습니다.'
    finally:
        page.evaluate("""async id => { for(const r of await FieldStore.records())if(r.id===id)await FieldStore.deleteRecord(r); }""",rid)
    assert page.evaluate('async () => JSON.stringify(await FieldStore.records())')==original


def verify_map_key(page, base):
    """넓은 화면 범례·연도가 왼쪽 숫자판(.mv-dash)에 있고 지도 위에는 카드가 없는지, 전국 첫 화면이 줌 7 이상인지,
    시·도로 열면 상세 경계 하나만 받는지, 고른 구의 동 이름 자리가 지도 칸 안인지.

    2026-11-20 UX2-01·GIS2-02: 지도 위 카드가 위쪽 밖으로 밀리고 초량2동을 가렸다. 2026-11-23: 카드를 왼쪽 숫자판으로 옮겼다(DESIGN 4.9,
    카드를 피하느라 전국 첫 화면이 줌 6이었다). 로컬은 OSM 바탕이라 네이버 경로는 배포 뒤 --base로 같은 검사를 돌린다."""
    rect = "s => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }"
    for width, height in [(1280, 800), (1024, 768)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto('about:blank')
        page.goto(base+'explore.html#map', wait_until='networkidle')
        page.wait_for_selector('#mapApp .mx-side .mv-dash .map-legend-line', state='visible')
        assert page.locator('#mapApp .mx-map .map-key').count() == 0, ('지도 위 범례 카드가 남음', width)
        page.wait_for_function("() => window.RenewMap && window.RenewMap.getMap() && window.RenewMap.getMap().getZoom() > 0")
        zoom = page.evaluate("() => window.RenewMap.getMap().getZoom()")
        assert width < 1280 or zoom >= 7, ('전국 첫 화면이 줌 7 아래', width, zoom)
        page.goto('about:blank')
        page.goto(base+'explore.html#map/21', wait_until='networkidle')
        page.wait_for_selector('#mapApp .mx-side .mv-dash .map-legend-line', state='visible')
        files = page.evaluate("() => performance.getEntriesByType('resource').map(e => e.name.split('?')[0].split('/').pop()).filter(n => n.endsWith('.geojson'))")
        assert [name for name in files if name.startswith('sigungu')] == ['sigungu-busan-overview.geojson'], ('부산 첫 화면 경계 파일', width, files)
        page.goto(base+'explore.html#map/21/21030', wait_until='networkidle')
        page.wait_for_function("() => [...document.querySelectorAll('#mapApp .map-dong-label')].some(e => e.textContent === '초량2동')")
        page.wait_for_timeout(1000)
        # 네이버 바탕(이름표 창 숨김)이나 겹침 빼기로 숨긴 이름표도 자리는 잰다
        center = page.evaluate("""() => { const pane = document.querySelector('#mapApp .leaflet-labels-pane');
          const el = [...pane.querySelectorAll('.map-dong-label')].find(e => e.textContent === '초량2동'), pd = pane.style.display, ed = el.style.display;
          pane.style.display = 'block'; el.style.display = ''; const b = el.getBoundingClientRect(); pane.style.display = pd; el.style.display = ed;
          return [(b.left+b.right)/2, (b.top+b.bottom)/2]; }""")
        box = page.evaluate(rect, '#mapApp .mx-map')
        assert box[0] <= center[0] <= box[2] and box[1] <= center[1] <= box[3], ('초량2동이 지도 칸 밖', width, center, box)
    page.set_viewport_size({'width': 1280, 'height': 900})


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--base', help='배포 후에는 실제 사이트 주소로 같은 검사를 실행한다')
    ap.add_argument('--channel', help='로컬에 설치된 msedge 또는 chrome')
    ap.add_argument('--output', type=Path, default=Path(tempfile.gettempdir())/'renewmap-ui-results')
    args = ap.parse_args()
    repo = Path(__file__).resolve().parents[1]
    site = repo/'landing' if (repo/'landing').is_dir() else repo
    routes = sorted(p.name for p in site.glob('*.html'))
    routes += ['dong/index.html', 'dong/21090700.html', 'dong/11010530.html']
    routes += sorted('field/'+p.name for p in (site/'field').glob('*.html') if p.name!='vw-frame.html')
    scores = json.loads((site/'data/national/scores.json').read_text(encoding='utf-8'))['dongs']
    ranked = sum(d.get('total') is not None for d in scores.values())
    oa_records = json.loads((site/'data/oa_decline_busan.json').read_text(encoding='utf-8'))['dongs']
    oa_known = min((d for d in oa_records if d['oas']), key=lambda d: len(d['oas']))
    args.output.mkdir(parents=True, exist_ok=True)
    server = None
    if not args.base:
        class Quiet(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def translate_path(self, path):
                if path.startswith('/renewmap-site/'):
                    path = path[len('/renewmap-site'):]
                return super().translate_path(path)
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
    base = (args.base or f'http://127.0.0.1:{server.server_port}/renewmap-site/').rstrip('/')+'/'
    results, failures = [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel=args.channel, headless=True)
            context = browser.new_context(reduced_motion='reduce', **({'service_workers':'block'} if not args.base else {}))
            analytics = []
            def block_analytics(route):
                analytics.append(route.request.url.split('?')[0])
                route.fulfill(content_type='application/javascript', body='/* 검사: 방문 분석 수집 차단 */')
            # 실서비스 검사에서도 고객 분석에 시험 이벤트를 보내지 않고, 로더 재도입을 실패로 잡는다.
            context.route('**/*hackle*', block_analytics)
            if not args.base:
                # 검사 주소는 외부 지도 키의 허용 도메인이 아니다. 실패 복구를 모의하고 실주소 검사는 그대로 연결한다.
                context.route('https://oapi.map.naver.com/openapi/v3/maps.js**', lambda route: route.abort())
                context.route('https://api.vworld.kr/req/wmts/**', lambda route: route.abort())
                tile = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bJ8AAAAASUVORK5CYII=')
                context.route('https://tile.openstreetmap.org/**', lambda route: route.fulfill(content_type='image/png', body=tile))
            errors = []
            missing = []

            def check(route, width, topic=None):
                row = {'route': route, 'width': width, 'topic': topic, **geometry(page)}
                if route == 'field/city3d.html':
                    row['provider_status'] = page.evaluate('() => window.City3dLoad.state')
                results.append(row)
                assert row['scroll']<=width+1, row
                assert not any(row[k] for k in ['duplicateIds','crampedNav','exposedHidden','gridTables','misaligned']), row
                assert row['height'] < (5000 if isinstance(topic, int) else 10000), row
                assert not errors, errors
                assert not missing, missing
                assert not analytics, f'중지한 방문 분석 요청: {analytics}'

            for width in [1280, 390]:
                for route in routes:
                    errors.clear()
                    missing.clear()
                    page = context.new_page()
                    page.set_viewport_size({'width': width, 'height': 900})
                    page.on('pageerror', lambda error: errors.append(re.sub(r'\?[^\s)]*', '?[query omitted]', error.stack or str(error))))
                    page.on('response', lambda res: missing.append(res.url) if res.status>=400 and res.url.startswith(base) and not res.url.endswith(('/field/naver-map-key.js','/field/vworld-key.js')) else None)
                    try:
                        response = page.goto(base+route, wait_until='commit' if route == 'field/city3d.html' else 'load')
                        assert response and response.status==200, f'{route}: {response.status if response else None}'
                        if route == 'field/city3d.html':
                            # 외부 SDK가 문서 파싱을 멈춰도 준비 또는 명시적 실패로 끝나야 한다.
                            page.wait_for_function("() => window.City3dLoad && ['ready','failed'].includes(window.City3dLoad.state)")
                            recovery = page.locator('#city3dRecovery a[href="../explore.html"]')
                            if page.evaluate('() => window.City3dLoad.state') == 'ready':
                                # r16(M30): 다시 시도·2D 지도는 실패했을 때만 보인다(정상으로 열려도 늘 보이던 것을 숨김)
                                assert page.locator('#city3dRecovery').is_hidden(), '3D가 정상으로 열렸는데 실패 안내 단추가 보입니다.'
                                assert page.locator('#vmap canvas').count() > 0, '준비 상태인데 지도 캔버스가 없습니다.'
                                assert page.locator('#views').is_visible()
                            else:
                                assert page.locator('#city3dRetry').is_visible(), '3D 실패 시 다시 시도 단추가 없습니다.'
                                assert recovery.is_visible(), '3D 실패 시 2D 지도 복귀 링크가 없습니다.'
                                assert '3D 지도 응답을 받지 못했습니다' in page.locator('#message').inner_text()
                                assert page.locator('#vmap').is_hidden()
                                assert page.locator('#views').is_hidden()
                                assert page.locator('#loading').is_hidden()
                        else:
                            page.evaluate('() => document.fonts.ready')
                            page.wait_for_load_state('networkidle', timeout=15000)
                        if route=='about.html':   # 2026-11-14 디자인 2차: 소개의 구 칩 대시보드를 한 문단 + '연도별 건물 나이로 보기' 단추로 바꿨다
                            page.wait_for_selector('main h1')
                        if route=='privacy.html':
                            page.wait_for_timeout(1800)
                            page.evaluate("location.hash='analytics'")
                            page.get_by_text('핵클 방문 분석을 중지했습니다.', exact=False).wait_for(state='visible')
                            page.evaluate("location.hash='%'")
                        if route=='rank.html':
                            page.wait_for_selector('#rankOut tbody tr')
                        if route=='explore.html':
                            page.goto(base+'explore.html#map/11/11060',wait_until='networkidle')
                            page.locator('[data-dong="11060920"]').wait_for(state='attached')
                            page.locator('[data-dong="11060920"]').click()
                            page.locator('.map-h3[data-code="11060920"]').wait_for(state='visible')
                            page.locator('.mp-info > summary').click()
                            assert page.locator('[data-boundary-missing]').is_visible(), '경계 없는 동을 선택했지만 누락 안내가 없습니다.'
                            check(route,width,'missing_boundary')
                            if not args.base:
                                # 같은 동에 늦게 자료가 오듯 패널을 다시 그려도 펼침과 키보드 초점이 남는다.
                                summary = page.locator('.mp-info > summary')
                                summary.focus()
                                summary.evaluate("""s => {
                                    window.RenewMap.setReportMode('brief');
                                    if (s.isConnected) throw new Error('동 카드가 다시 그려지지 않았습니다.');
                                }""")
                                # 비동기 재렌더링이 요소 참조를 바꿔도 현재 카드의 열림·초점을 같은 순간에 검사한다.
                                info = page.evaluate("""() => {
                                    const summaries = document.querySelectorAll('.mp-info > summary'), s = summaries[0];
                                    return {count:summaries.length, open:!!s?.parentElement.open, focused:document.activeElement===s,
                                            activeTag:document.activeElement?.tagName, hasFocus:document.hasFocus()};
                                }""")
                                assert info['count'] == 1 and info['open'] and info['focused'], info
                                other = page.locator('[data-dong]:not([data-dong="11060920"])').first.get_attribute('data-dong')
                                page.evaluate("code => {location.hash = location.hash.replace(/[0-9]+$/, code)}", other)
                                page.locator(f'.map-h3[data-code="{other}"]').wait_for(state='visible')
                                info = page.evaluate("""() => {
                                    const summaries = document.querySelectorAll('.mp-info > summary');
                                    return {count:summaries.length, open:!!summaries[0]?.parentElement.open,
                                            selected:summaries[0]?.closest('[data-panel]')?.querySelector('.map-h3[data-code]')?.dataset.code};
                                }""")
                                assert info['count'] == 1 and not info['open'] and info['selected'] == other, info
                                check(route,width,'dong_details_rerender')
                                page.goto(base+'explore.html?report=onepage#map/21/21090/21090700',wait_until='networkidle')
                                page.locator('[data-workspace-tab="evidence"]').click()
                                expect_doc = page.locator('#reportApp')
                                # r16 4차 P1: 문서 제목도 화면과 같은 '반여1동 근거 1쪽'이라 제목이 둘(화면 머리 .rp-title · 문서 미리보기 .dg-title)이다. 화면 머리를 본다
                                expect_doc.locator('h3.rp-title', has_text='반여1동 한 장 요약').wait_for(state='visible')
                                assert expect_doc.get_by_role('button',name='한글 파일로 받기',exact=True).is_visible()
                                expect_doc.locator('.rp-more-files > summary').click()
                                for label in ('PDF로 저장','엑셀로 받기','워드로 받기','파워포인트로 받기'):
                                    assert expect_doc.get_by_role('button',name=label,exact=True).is_visible()
                                # #267: 문서 종류 단추(.rp-mode)는 '받을 문서' 카드가 대신하고 숨는다(report-visual.css)
                                page.locator('#report .dc-card[data-set-mode="programs"]').click()
                                expect_doc.get_by_role('heading',name='반여1동에 맞는 재생 사업',exact=True).wait_for(state='visible')
                                card = expect_doc.locator('.pg-card').filter(has_text='노후주거지정비 일반정비형')
                                assert 'p.36' in card.locator('.pg-req-source').inner_text()
                                with page.expect_download() as file_info:
                                    card.locator('[data-program-review="oldres"]').click()
                                receipt = file_info.value.path().read_text(encoding='utf-8')
                                assert '대상 행정동 · 반여1동' in receipt and '구역 건축물대장으로 계산' in receipt
                                assert '공식 판정은 담당 기관이 합니다.' in receipt
                                assert card.locator('.pg-req-source a').get_attribute('href') in receipt
                                check(route,width,'program_review_download')
                                check(route,width,'document_mode_copy')
                            page.goto(base+route,wait_until='networkidle')
                        if route=='explore.html' and not args.base:
                            page.wait_for_selector('#mapApp .leaflet-container')
                            assert not page.locator('#mapApp .leaflet-tile-pane img').count()
                            page.get_by_role('button', name='배경지도 켜기', exact=True).click()
                            page.wait_for_selector('#mapApp .leaflet-tile-pane img[src*="tile.openstreetmap.org"]',state='attached')
                            page.wait_for_function('() => [...document.querySelectorAll("#mapApp .leaflet-tile-pane img")].some(img => img.complete && img.naturalWidth>0)')
                            assert not page.locator('#mapApp .map-naver').count()
                        check(route, width)
                        if route == 'field/index.html':
                            verify_field_basis(page,args.output,width)
                            check(route,width,'field_basis')
                            if width==390: verify_field_save_errors(page,width)
                        if route == 'explore.html':
                            verify_key_reconciliation(page,args.output,width)
                            check(route,width,'key_reconciliation')
                            if width == 1280:
                                verify_map_key(page,base)
                                check(route,width,'map_key')
                        if route in ('box.html','docs.html'):
                            verify_document_actions(page,args.output,width,'box' if route == 'box.html' else 'docs')
                            check(route,width,'document_actions')
                        if route == 'box.html':
                            verify_reusable_evidence(page,args.output,width)
                            check(route,width,'reusable_evidence')
                        if route == 'index.html':
                            # r13: 홈 첫 단추는 반여1동 4-1 표 초안(?frag=MLIT-DECLINE) 한 번에 열기
                            page.locator('main a[href*="frag=MLIT-DECLINE"]').first.click()
                            page.wait_for_url(re.compile(r'.*explore\.html\?report=brief&frag=MLIT-DECLINE.*'), wait_until='networkidle')
                            page.wait_for_selector('[data-frag-out] table', timeout=60000)
                            assert '4-1' in page.locator('[data-frag-out]').inner_text()
                            page.goto(base+'about.html#usesTitle', wait_until='networkidle')
                            page.evaluate('() => document.fonts.ready')
                            assert page.locator('#how > .wrap > .about-uses > .about-use').count() == 7   # r11: '두 자료를 같은 식별자로 맞춰 볼 때' 추가
                            check(route, width, 'role_entry')
                            page.goto(base+route, wait_until='networkidle')
                            entry = page.locator('main a[href="field/oa.html"]').first
                            assert entry.count(), '집계구 자료 확인 진입 링크가 없습니다.'
                            entry.evaluate('(a) => { const d=a.closest("details"); if(d)d.open=true; }')
                            entry.click()
                            page.wait_for_url(base+'field/oa.html', wait_until='networkidle')
                            page.wait_for_selector('#dong')
                            page.wait_for_function('() => !document.querySelector("#dong").disabled')
                            assert page.locator('#origin').is_hidden()
                            assert '불러온 목록' in page.locator('#coverage').inner_text()
                            check(route, width, 'oa_entry')
                            page.goto(base+route, wait_until='networkidle')
                        if route == 'about.html':
                            for entry, panel, detail in [('survey', '1', 'surveyChanges'), ('review', '3', None),
                                                         ('revisit', '1', 'revisitReport'), ('delivery', '2', 'handoverSummary')]:
                                href = 'tasks.html?step='+entry+('#handoverSummary' if entry == 'delivery' else '')
                                page.locator('#how .about-use a[href="'+href+'"]').click()
                                page.wait_for_url(base+href, wait_until='networkidle')
                                page.wait_for_selector('#newTask')
                                page.evaluate('() => document.fonts.ready')
                                page.wait_for_function('() => !document.querySelector("#newTask").disabled')
                                # r16: 저장한 과업이 없으면 2~4단계는 빈 폼 대신 안내 하나를 보인다. 들어온 단계는 그대로 표시하고,
                                # 과업을 고른 뒤 그 칸이 열리는 것은 task_flow_smoke(direct_revisit_preserves_selected_task_and_history)가 본다
                                assert page.locator('.task-steps [data-step="'+panel+'"]').get_attribute('aria-current') == 'step', f'{entry}: 들어온 단계가 표시되지 않았습니다.'
                                assert page.locator('#taskNoPlan').is_visible(), f'{entry}: 과업을 먼저 저장하라는 안내가 없습니다.'
                                assert page.locator('#taskNoPlan button[data-step="0"]').is_visible(), f'{entry}: 1단계로 가는 단추가 없습니다.'
                                assert page.locator('[data-panel="'+panel+'"]').is_hidden(), f'{entry}: 과업 없이 빈 폼이 열렸습니다.'
                                if entry in ('survey', 'revisit'):
                                    assert page.locator('#'+detail).evaluate('(el) => el.open'), f'{entry}: #{detail}가 펼쳐져 있지 않습니다.'
                                assert page.evaluate('async()=> (await TaskStore.list()).length') == 0, f'{entry}: 들어오기만 했는데 과업이 생겼습니다.'
                                check(route, width, 'role_'+entry)
                                page.goto(base+route, wait_until='networkidle')
                        if route == 'field/oa.html':
                            code = oa_known['code']
                            page.goto(base+route+'?dong='+code+'&met=3', wait_until='networkidle')
                            page.wait_for_function('() => !document.querySelector("#out").hidden')
                            assert page.locator('#dong').input_value() == code
                            assert oa_known['name'] in page.locator('#originNote').inner_text()
                            assert f"요건 수 {oa_known['met_count']} / 3" in page.locator('#outBase').inner_text()
                            expected_hash = f'#map/{code[:2]}/{code[:5]}/{code}'
                            assert page.locator('#originBack').get_attribute('href') == '../explore.html'+expected_hash
                            check(route, width, 'oa_supported')
                            page.locator('#originBack').click()
                            page.wait_for_url(base+'explore.html'+expected_hash, wait_until='networkidle')
                            assert page.evaluate('location.hash') == expected_hash
                            check(route, width, 'oa_return_map')
                            for query, message, href in [('99999999', '현재 불러온 목록에 없습니다', ''), ('javascript%3Aalert(1)', '코드 형식', '../explore.html')]:
                                page.goto(base+route+'?dong='+query, wait_until='networkidle')
                                page.wait_for_function('() => !document.querySelector("#dong").disabled')
                                assert page.locator('#dong').input_value() == ''
                                assert page.locator('#out').is_hidden()
                                assert message in page.locator('#originNote').inner_text()
                                if href:
                                    assert page.locator('#originBack').get_attribute('href') == href
                                check(route, width, 'oa_unavailable' if query == '99999999' else 'oa_invalid_code')
                            page.goto(base+route, wait_until='networkidle')
                        topic = page.locator('#contentTopic')
                        if topic.count():
                            count = topic.locator('option').count()
                            for i in range(count):
                                topic.select_option(str(i))
                                page.wait_for_timeout(30)
                                check(route, width, i)
                        if route=='rank.html':
                            # 기본은 재생 필요·부산이다. 전국 종합 점수의 전체 자료로 페이징을 대조한다.
                            page.locator('#rankKind').select_option('total')
                            page.locator('#rankSido').select_option('')
                            page.wait_for_selector('#rankOut tbody tr')
                            assert page.locator('#rankOut tbody tr').count()==20, '한 쪽에 20개를 보여야 합니다.'
                            selector=page.get_by_role('navigation', name='동네 비교 점수 페이지', exact=True).locator('select')
                            last=selector.locator('option').last.get_attribute('value')
                            assert int(last)==(ranked+19)//20, '페이지 수가 전국 점수 자료와 다릅니다.'
                            selector.select_option(last)
                            assert 1<=page.locator('#rankOut tbody tr').count()<=20
                            assert page.locator('#rankOut tbody tr').last.locator('td').first.inner_text()==str(ranked)
                            check(route, width)
                            page.locator('#rankQ').fill('중앙동')
                            page.locator('#rankFind button').click()
                            assert page.locator('#rankFoundRow').count() == 0
                            choices = page.locator('#rankMatch')
                            assert '서울 관악구' in choices.locator('option[value="11210610"]').inner_text()
                            choices.select_option('21010510')
                            page.locator('#rankChoices button').click()
                            found = page.locator('#rankFoundRow')
                            ordinal = found.locator('td').first.inner_text()
                            target = page.locator('#rankLink').get_attribute('href')
                            assert 'dong=21010510' in target and 'q=' not in target
                            page.goto(target, wait_until='domcontentloaded')
                            found.get_by_role('link', name='부산 중구 중앙동').wait_for(state='visible')
                            assert found.locator('td').first.inner_text() == ordinal
                            check(route, width, 'rank_same_name_link')
                        if route == 'data.html':
                            query = page.locator('#sourceQuery')
                            query.fill('폐쇄말소대장 표제부')
                            source_rows = page.locator('[data-source-table] tbody tr:visible')
                            assert source_rows.count() == 1
                            row = source_rows.first
                            condition = row.locator('td').nth(2).inner_text()
                            with page.expect_download() as pending:
                                page.locator('#sourceDownload').click()
                            txt = pending.value.path().read_text(encoding='utf-8')
                            assert '이용 조건 · ' + condition in txt
                            assert row.get_by_role('link').get_attribute('href') in txt
                            query.fill('')
                            assert page.locator('#sourceDownload').is_hidden()
                            check(route, width, 'source_catalog_download')
                        page.screenshot(path=str(args.output/f'{route.replace("/","_")}-{width}.png'))
                    except Exception as error:
                        failures.append({'route': route, 'width': width, 'error': str(error)})
                        page.screenshot(path=str(args.output/f'failed-{route.replace("/","_")}-{width}.png'))
                    finally:
                        # 이전 화면의 비동기 3D 작업이 다음 화면의 오류로 기록되지 않게 종료한다. 늦게 받은 오류도 원래 화면에 남긴다.
                        page.close()
                        if errors and not any(f['route'] == route and f['width'] == width for f in failures):
                            failures.append({'route': route, 'width': width, 'error': '\n'.join(errors)})
                    print(f'{width} {route}: {"FAIL" if failures and failures[-1]["route"]==route and failures[-1]["width"]==width else "OK"}', flush=True)
            context.close()
            browser.close()
    finally:
        if server:
            server.shutdown()
            server.server_close()
        (args.output/'result.json').write_text(json.dumps({'base':base,'map_fixture':None if args.base else 'Naver SDK/VWorld tile failure; OSM image fixture','analytics_fixture':'blocked and asserted absent (local and live)','checks':results,'failures':failures},ensure_ascii=False,indent=2),encoding='utf-8')
    assert not failures, f'{len(failures)}건 실패: {args.output / "result.json"}'


if __name__=='__main__':
    main()
