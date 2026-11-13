"""공개 화면의 실제 배치·주제 이동·목록 길이를 배포 전에 검사한다."""
import argparse
import base64
import functools
import json
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
        height:document.documentElement.scrollHeight, longPage:!!document.querySelector('.cp-toc'), fold:!!document.querySelector('details.cp-fold'),
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
            context = browser.new_context(reduced_motion='reduce')
            if not args.base:
                # 검사 주소는 외부 지도 키의 허용 도메인이 아니다. 실패 복구를 모의하고 실주소 검사는 그대로 연결한다.
                context.route('https://oapi.map.naver.com/openapi/v3/maps.js**', lambda route: route.abort())
                context.route('https://api.vworld.kr/req/wmts/**', lambda route: route.abort())
                tile = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/bJ8AAAAASUVORK5CYII=')
                context.route('https://tile.openstreetmap.org/**', lambda route: route.fulfill(content_type='image/png', body=tile))
            page = context.new_page()
            errors = []
            missing = []
            # 브이월드 3D 뷰어(map.vworld.kr/js/ws3dmap) 안에서 나는 오류는 우리 코드가 아니고 헤드리스 WebGL에서 가끔만 난다(2026-11-13 두 번). 그 스크립트 안의 오류만 뺀다
            page.on('pageerror', lambda error: None if 'map.vworld.kr/js/ws3dmap/' in (error.stack or '') else errors.append(re.sub(r'\?[^\s)]*', '?[query omitted]', error.stack or str(error))))
            page.on('response', lambda res: missing.append(res.url) if res.status>=400 and res.url.startswith(base) and not res.url.endswith(('/field/naver-map-key.js','/field/vworld-key.js')) else None)

            def check(route, width, topic=None):
                row = {'route': route, 'width': width, 'topic': topic, **geometry(page)}
                results.append(row)
                assert row['scroll']<=width+1, row
                assert not any(row[k] for k in ['duplicateIds','crampedNav','exposedHidden','gridTables','misaligned']), row
                # 2026-11-13 v6: 한 장씩 넘기기를 없애고 본문을 펼친 쪽(맨 위 차례 .cp-toc)은 길어도 된다
                assert row['height'] < (60000 if row.get('longPage') else 8000 if row.get('fold') else 5000 if topic is not None else 10000), row   # v8: 접는 주제 쪽은 연 칸 하나 + 제목 줄들
                assert not errors, errors
                assert not missing, missing

            for width in [1280, 390]:
                page.set_viewport_size({'width': width, 'height': 900})
                for route in routes:
                    errors.clear()
                    missing.clear()
                    try:
                        response = page.goto(base+route, wait_until='load')
                        assert response and response.status==200, f'{route}: {response.status if response else None}'
                        page.evaluate('() => document.fonts.ready')
                        # 외부 3D 프레임은 타일 요청이 계속돼 networkidle이 준비 완료 조건이 아니다.
                        if route!='field/city3d.html':
                            page.wait_for_load_state('networkidle', timeout=15000)
                        if route=='about.html':   # 2026-11-14 디자인 2차: 소개의 구 칩 대시보드를 한 문단 + '건물 나이 4D로 보기' 단추로 바꿨다
                            page.wait_for_selector('main h1')
                        if route=='rank.html':
                            page.wait_for_selector('#rankOut tbody tr')
                        if route=='explore.html' and not args.base:
                            page.wait_for_selector('#mapApp .leaflet-tile-pane img[src*="tile.openstreetmap.org"]',state='attached')
                            page.wait_for_function('() => [...document.querySelectorAll("#mapApp .leaflet-tile-pane img")].some(img => img.complete && img.naturalWidth>0)')
                            assert not page.locator('#mapApp .map-naver').count()
                        check(route, width)
                        topic = page.locator('#contentTopic')
                        if topic.count():
                            count = topic.locator('option').count()
                            for i in range(count):
                                topic.select_option(str(i))
                                page.wait_for_timeout(30)
                                check(route, width, i)
                        if route=='rank.html':
                            # v6: 기본은 부산·재생 필요 점수, 한 쪽 20줄. 전국 줄 수는 ?kind=total&sido= 로 검사한다
                            page.goto(base+'rank.html?kind=total&sido=', wait_until='load')
                            page.wait_for_selector('#rankOut tbody tr')
                            assert page.locator('#rankOut tbody tr').count()==20
                            selector=page.get_by_role('navigation', name='동네 순위 페이지', exact=True).locator('select')
                            last=selector.locator('option').last.get_attribute('value')
                            assert int(last)==(ranked+19)//20
                            selector.select_option(last)
                            assert 1<=page.locator('#rankOut tbody tr').count()<=20
                            assert page.locator('#rankOut tbody tr').last.locator('td').first.inner_text()==str(ranked)
                            check(route, width)
                        page.screenshot(path=str(args.output/f'{route.replace("/","_")}-{width}.png'))
                    except Exception as error:
                        failures.append({'route': route, 'width': width, 'error': str(error)})
                        page.screenshot(path=str(args.output/f'failed-{route.replace("/","_")}-{width}.png'))
                    print(f'{width} {route}: {"FAIL" if failures and failures[-1]["route"]==route and failures[-1]["width"]==width else "OK"}', flush=True)
            context.close()
            browser.close()
    finally:
        if server:
            server.shutdown()
            server.server_close()
        (args.output/'result.json').write_text(json.dumps({'base':base,'map_fixture':None if args.base else 'Naver SDK/VWorld tile failure; OSM image fixture','checks':results,'failures':failures},ensure_ascii=False,indent=2),encoding='utf-8')
    assert not failures, f'{len(failures)}건 실패: {args.output / "result.json"}'


if __name__=='__main__':
    main()
