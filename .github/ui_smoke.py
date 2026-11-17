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
          for(const [code,name,value] of [['21090700','합성 후보 A',0],['21090701','합성 후보 B',-2.81]]) {
            const basis={source_url:'https://example.org/a',area_code:code,formula_id:'synthetic',formula_text:'합성 산식',rule_version:'synthetic',spatial_unit:'행정동'};
            const item={c:'POP',l:'합성 비율',u:'%',v:value,t:value+'%',s:'미확인',d:'2025-12-31',basis};
            C.save(localStorage,{code,name,saved_at:'2026-11-17T01:00:00.000Z',items:[item,{c:'MISSING',l:'미수집 항목',u:'%',v:null,t:'확인 필요',s:'추가확인',d:null,basis:null}]},'#map/21/21090/'+code,
              [{ind:{code:'POP'},cell:{source_name:'합성기관',retrieved_at:'2026-11-17T00:00:00Z',license_type:'합성',cell_id:'synthetic-'+code,snapshot_id:'synthetic'}}]);
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
            assert a == ['21090700','합성 후보 A','보류','=1+2\n원천 자료 추가확인','2026-11-17T01:00:00.000Z']
            comparison = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            values = [float(v.text) for v in comparison.findall('.//s:v',ns)]
            assert 0 in values and -2.81 in values
            assert '자료 없음' in ''.join(comparison.itertext())
            for name in archive.namelist():
                if re.fullmatch(r'xl/worksheets/sheet\d+\.xml',name):
                    assert not ET.fromstring(archive.read(name)).findall('.//s:f',ns), '문자열 메모가 수식으로 실행됩니다.'
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
                            assert page.locator('#city3dRetry').is_visible()
                            recovery = page.locator('#city3dRecovery a[href="../explore.html"]')
                            assert recovery.is_visible(), '3D 실패 시 2D 지도 복귀 링크가 없습니다.'
                            if page.evaluate('() => window.City3dLoad.state') == 'ready':
                                assert page.locator('#vmap canvas').count() > 0, '준비 상태인데 지도 캔버스가 없습니다.'
                                assert page.locator('#views').is_visible()
                            else:
                                assert '3D 지도 응답을 받지 못했습니다' in page.locator('#message').inner_text()
                                assert page.locator('#vmap').is_hidden()
                                assert page.locator('#views').is_hidden()
                                assert page.locator('#loading').is_hidden()
                        else:
                            page.evaluate('() => document.fonts.ready')
                            page.wait_for_load_state('networkidle', timeout=15000)
                        if route=='about.html':   # 2026-11-14 디자인 2차: 소개의 구 칩 대시보드를 한 문단 + '건물 나이 4D로 보기' 단추로 바꿨다
                            page.wait_for_selector('main h1')
                        if route=='privacy.html':
                            page.wait_for_timeout(1800)
                            page.evaluate("location.hash='analytics'")
                            page.get_by_text('핵클 방문 분석을 중지했습니다.', exact=False).wait_for(state='visible')
                            page.evaluate("location.hash='%'")
                        if route=='rank.html':
                            page.wait_for_selector('#rankOut tbody tr')
                        if route=='explore.html' and not args.base:
                            page.wait_for_selector('#mapApp .leaflet-tile-pane img[src*="tile.openstreetmap.org"]',state='attached')
                            page.wait_for_function('() => [...document.querySelectorAll("#mapApp .leaflet-tile-pane img")].some(img => img.complete && img.naturalWidth>0)')
                            assert not page.locator('#mapApp .map-naver').count()
                        check(route, width)
                        if route == 'box.html':
                            verify_reusable_evidence(page,args.output,width)
                            check(route,width,'reusable_evidence')
                        if route == 'index.html':
                            page.locator('main a[href="about.html#usesTitle"]').click()
                            page.wait_for_url(base+'about.html#usesTitle', wait_until='networkidle')
                            page.evaluate('() => document.fonts.ready')
                            assert page.locator('#how > .wrap > .about-use').count() == 5
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
                                page.locator('#how > .wrap > .about-use a[href="'+href+'"]').click()
                                page.wait_for_url(base+href, wait_until='networkidle')
                                page.wait_for_selector('#newTask')
                                page.evaluate('() => document.fonts.ready')
                                page.wait_for_function('() => !document.querySelector("#newTask").disabled')
                                assert page.locator('[data-panel="'+panel+'"]').is_visible()
                                if detail:
                                    assert page.locator('#'+detail).is_visible()
                                    if entry in ('survey', 'revisit'):
                                        assert page.locator('#'+detail).evaluate('(el) => el.open')
                                assert page.evaluate('async()=> (await TaskStore.list()).length') == 0
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
                            selector=page.get_by_role('navigation', name='동네 순위 페이지', exact=True).locator('select')
                            last=selector.locator('option').last.get_attribute('value')
                            assert int(last)==(ranked+19)//20, '페이지 수가 전국 점수 자료와 다릅니다.'
                            selector.select_option(last)
                            assert 1<=page.locator('#rankOut tbody tr').count()<=20
                            assert page.locator('#rankOut tbody tr').last.locator('td').first.inner_text()==str(ranked)
                            check(route, width)
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
