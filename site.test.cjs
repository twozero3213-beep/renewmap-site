const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 머리글 하나(심사 06 7절 1, 2026-11-08): 모든 화면에 같은 5개(동네 찾기·현장 기록·신청요건·데이터 출처·시범 상담)와 꼬리글 한 벌. 스크립트 없이 동작한다
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const pages = ['evidence.html', 'index.html', 'explore.html', 'about.html', 'docs.html', 'ethics.html', 'privacy.html', 'rank.html', 'biz.html', 'data.html', 'rules.html', 'dong/index.html',
  'thanks.html', '404.html', 'programs.html',
  'field/index.html', 'field/redev.html', 'field/oa.html', 'field/idle.html', 'field/shop.html', 'field/twin.html', 'field/city3d.html'];

test('공통 머리글·꼬리글: 모든 공개 페이지에 같은 5개 메뉴(순서·이름)와 같은 꼬리글 링크', () => {
  // 2026-11-13 v6: 하는 일 순서의 한 벌(동네 찾기·재생 사업·구역 계산·현장 기록·건물 4D·데이터 출처·보관함·시범 상담)
  // 2026-11-13 v7: 메뉴는 넷과 상담 하나(경쟁 서비스 분해: 정돈된 곳은 3~5개). 건물 4D·보관함·데이터 출처는 꼬리글과 지도에서 들어간다
  // 2026-11-13 v8: 메뉴 다섯과 상담 하나. 사람들이 가장 궁금해하는 동네 순위를 메뉴로 올렸다(대표 지적: 맨 아래라 찾기 힘듦). 건물 4D·보관함·데이터 출처는 꼬리글과 지도에서
  const NAV = '<nav class="site-nav" aria-label="주요 메뉴"><a href="explore.html">동네 찾기</a><a href="rank.html">동네 순위</a><a href="programs.html">재생 사업</a><a href="field/redev.html">구역 계산</a><a href="field/">현장 기록</a><a href="about.html#contact">시범 상담</a></nav>';
  const REPORT_MAIL = 'mailto:renewmapteam@gmail.com?subject=' + encodeURIComponent('[리뉴맵] 숫자 오류 신고');
  // R2(2026-11-13) 꼬리글 한 벌: 도구·근거·리뉴맵 세 줄. 원본은 export_dong_pages.footer_html, 손으로 쓴 쪽·box·tasks·생성 쪽이 모두 같은 목록
  const FOOT = ['explore.html', 'rank.html', 'programs.html', 'field/redev.html', 'field/', 'time4d.html', 'box.html',
    'data.html', 'rules.html', 'evidence.html', 'dong/index.html', REPORT_MAIL,
    'about.html', 'about.html#contact', 'ethics.html', 'privacy.html', 'privacy.html#analytics', 'mailto:renewmapteam@gmail.com'];   // R4 13: 방문 분석 끄기
  const footOf = h => [...(/<footer>[\s\S]*?<div class="links">([\s\S]*?)<\/div>/.exec(h) || [])[1].matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/^\.\.\//, '').replace(/&amp;/g, '&'));
  for (const f of pages) {
    const inField = f.startsWith('field/'), up = f.includes('/') ? '../' : '';
    const h = read(f).replace(/ aria-current="page"/g, '').replace(/(href|src)="\/renewmap-site\//g, '$1="');
    const nav = /<nav class="site-nav"[\s\S]*?<\/nav>/.exec(h);
    assert.ok(nav, f + ' nav');
    const want = inField ? NAV.replace(/href="([^"]+)"/g, (m, h) => `href="${h === 'field/' ? './' : h.startsWith('field/') ? h.slice(6) : '../' + h}"`) : NAV.replace(/href="/g, 'href="' + up);
    assert.equal(nav[0], want, f);
    assert.match(h, /<header class="top"><div class="wrap"><a class="logo" href="(?:\.\.\/)?index\.html">RENEW<span>MAP<\/span><\/a><nav class="site-nav"/, f + ' 로고 뒤 메뉴');
    assert.match(h, /<a class="skip" href="#main">/, f + ' 건너뛰기');
    assert.deepEqual(footOf(h), FOOT, f + ' 꼬리글');
    assert.doesNotMatch(h, /id="site-menu"|class="menu-toggle"|header-cta/, f);
  }
  assert.match(read('site-v4.css'), /\.site-nav a \{[^}]*min-height: 44px/);
  // 머리 메뉴가 다른 보관함·과업 화면과 행정동 페이지도 같은 꼬리글(R2 2: box·tasks에는 꼬리글이 없었다)
  for (const f of ['box.html', 'tasks.html', 'dong/21090700.html', 'field/twin.html']) assert.deepEqual(footOf(read(f)), FOOT, f + ' 꼬리글');
  assert.doesNotMatch(FOOT.join(' '), /biz\.html|#tools/);   // '사업성 간이 계산'·'참고 도구'는 꼬리글에서 뺐다
});

test('404 내부 링크와 에셋은 최상위·field·dong 오류 주소에서 같은 실제 파일로 이어진다', () => {
  const html = read('404.html'), origin = 'https://twozero3213-beep.github.io', root = '/renewmap-site/';
  const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const missing of ['missing.html', 'field/missing.html', 'dong/deep/missing.html']) {
    for (const ref of refs) {
      if (ref.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
      const url = new URL(ref, origin + root + missing);
      assert.equal(url.pathname, new URL(ref, origin + root).pathname, missing + ': ' + ref);
      assert.ok(url.pathname.startsWith(root), ref);
      const file = path.join(__dirname, decodeURIComponent(url.pathname.slice(root.length)));
      assert.ok(fs.existsSync(file), ref);
    }
  }
  assert.match(html, /base-uri 'none'/);
  assert.doesNotMatch(html, /<base\b/);
  assert.doesNotMatch(html, /<script[^>]+src="[^"]*\/site\.js"/);
});

test('주 메뉴(아래 탭): 머리 메뉴와 같은 다섯을 모든 화면에 같은 이름으로 만들고, 찾기·업무별 화면에는 옛 머리글 메뉴가 없다', () => {
  for (const f of ['index.html', 'explore.html']) assert.doesNotMatch(read(f), /id="site-menu"|class="menu-toggle"|header-cta/, f);
  assert.match(read('field/index.html'), /<script src="\.\.\/site\.js"><\/script>/);
  assert.match(read('box.html'), /<script src="site\.js" defer><\/script>/);
  const vm = require('node:vm');
  const tabs = (pathname, hash) => {
    let nav = null;
    const document = { body: { appendChild: n => { nav = n; } }, createElement: () => ({ setAttribute(k, v) { this[k] = v; } }), querySelector: () => null, getElementById: () => null };
    vm.runInNewContext(read('site.js'), { location: { pathname, hash, replace() {} }, document });
    return [...nav.innerHTML.matchAll(/<a href="([^"]+)"( aria-current="page")?>.*?<span>([^<]+)<\/span><\/a>/g)].map(m => `${m[3]}${m[2] ? '*' : ''}:${m[1]}`);
  };
  // R1(2026-11-13): 아래 탭은 넷(홈·동네 찾기·현장 기록·보관함, DESIGN.md). 머리 '메뉴' 시트와 같은 다섯이 두 벌로 보였다
  const T = (p, cur) => ['홈:index.html', '동네 찾기:explore.html#map', '현장 기록:field/', '보관함:box.html']
    .map(x => { const [l, h] = x.split(':'); return `${l}${l === cur ? '*' : ''}:${p}${h}`; });
  assert.deepEqual(tabs('/renewmap-site/', ''), T('', '홈'));
  assert.deepEqual(tabs('/renewmap-site/index.html', '#tools'), T('', '홈'));
  assert.deepEqual(tabs('/renewmap-site/explore.html', '#gov'), T('', '동네 찾기'));
  assert.deepEqual(tabs('/renewmap-site/dong/21090700.html', ''), T('../', '동네 찾기'));
  assert.deepEqual(tabs('/renewmap-site/box.html', ''), T('', '보관함'));
  assert.deepEqual(tabs('/renewmap-site/field/', ''), T('../', '현장 기록'));
  assert.deepEqual(tabs('/renewmap-site/field/redev.html', ''), T('../', null));
  // 2026-11-13: 3D 같은 다른 field 화면은 '현장 기록'에 불을 켜지 않는다(11-13 평가: 신청요건 화면에서 현장이 켜져 헷갈림)
  assert.deepEqual(tabs('/renewmap-site/field/twin.html', ''), T('../', null));
  assert.match(read('site.js'), /aria-label', '주 메뉴'/);
  // R2 1: 넓은 화면 왼쪽 세로 막대(88px)는 rm6.css가 늘 숨겨 덮이는 원본 규칙을 지웠다. 넓은 화면은 머리 메뉴만
  assert.match(read('rm6.css'), /@media \(min-width: 1100px\) \{\s*\.tabbar \{ display: none; \}/);
  assert.doesNotMatch(read('styles.css'), /width: 88px/);
});

test('모바일 메뉴: 버튼으로 열고 Esc·외부 선택·링크·데스크톱 전환으로 닫는다', () => {
  const js = read('site.js');
  assert.match(js, /aria-expanded/);
  assert.match(js, /Escape/);
  assert.match(js, /matchMedia/);
  assert.match(js, /min-width: 721px/);
  assert.match(js, /closest\('header\.top'\)/);
  assert.match(js, /menu\.addEventListener\('click'/);
});

test('공통 반응형 스타일: 모바일에서 메뉴를 강제로 숨기기만 하지 않고 44px 목표 제공', () => {
  const css = read('styles.css');
  assert.match(css, /\.menu-toggle\s*\{/);
  assert.match(css, /\.menu-toggle\[aria-expanded="true"\]/);
  assert.match(css, /nav\.menu\.is-open\s*\{/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(read('map.css'), /\.fd-chip\s*\{[^}]*min-height:\s*44px/);
  assert.doesNotMatch(css, /@media \(max-width: 720px\) \{\s*nav\.menu \{ display: none; \}\s*\}/);
});

test('홈과 탐색 분리: 작업 ID는 탐색에만 있고 단계 메뉴와 기존 스크립트를 유지', () => {
  const home = read('about.html'), explore = read('explore.html');
  for (const id of ['mapApp', 'heroSearch', 'heroQ', 'heroPlaces', 'heroLive', 'findApp', 'reportApp']) {
    assert.equal((explore.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
  assert.doesNotMatch(home, /id="findApp"|id="reportApp"/);
  assert.match(home, /href="explore\.html#find"/);
  assert.match(home, /href="explore\.html#report"/);
  assert.doesNotMatch(home, /이 자리에 동네 보고서가 생깁니다/);
  assert.doesNotMatch(explore, /class="[^"]*workspace-steps[^"]*"|RENEWMAP EVIDENCE WORKSPACE/);
  assert.match(explore, /<link rel="canonical" href="https:\/\/twozero3213-beep\.github\.io\/renewmap-site\/explore\.html">/);
  assert.match(explore, /<script src="map\.js(?:\?[^\"]+)?" defer><\/script>/);
  assert.doesNotMatch(explore, /<script[^>]*src="find\.js"/);
  assert.match(read('workspace.js'), /import\('\.\/find\.js\?v=20261114-e2'\)/);
  for (const h of [home, explore]) {
    const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], '페이지 안 ID 중복');
  }
  // sitemap.xml은 사이트맵 인덱스(export_dong_pages.py): 일반 페이지는 sitemap-pages.xml, 행정동은 sitemap-dong.xml
  assert.match(read('sitemap.xml'), /<sitemapindex[\s\S]*renewmap-site\/sitemap-pages\.xml[\s\S]*renewmap-site\/sitemap-dong\.xml/);
  assert.match(read('sitemap-pages.xml'), /renewmap-site\/explore\.html/);
});

test('소개 페이지: 정의 문장·가치관 4·두 CTA·근거 시연이 첫 동선에 있고 캐릭터와 설명이 분리됨', () => {
  const h = read('about.html');
  // R2 10: h1은 메뉴·꼬리글과 같은 이름 '서비스 소개', 지금까지의 문장은 .sub
  assert.match(h, /<h1 id="heroTitle">서비스 소개<\/h1>\s*<p class="sub">도시재생 기초조사를 출처가 붙은 문서로 납품합니다\.<br>동네 숫자를 출처·기준일·이용조건과 함께 넘겨야 하는 일에 씁니다\.<\/p>/);   // R4 3
  const definition = /class="about-def">([^<]+)<\/p>/.exec(h)?.[1] || '';
  assert.match(definition, /도시재생·정비 용역사와 지자체 담당자/);
  assert.match(definition, /공개 자료와 현장 기록.*출처와 기준일.*근거 문서/);
  // 2026-11-13: '승인 전'이 무엇이고 어떻게 써도 되는지를 한 상자에 밝힌다(11-13 평가: '쓰지 마세요'만 반복돼 결과를 못 쓴다고 읽힘)
  assert.match(h, /class="about-stage rm-status rm-note"><b>지금 나오는 결과는 참고 계산입니다\.<\/b>[\s\S]*?승인하기 전이라 "참고 계산"으로 표기해 쓰고, 판정과 승인은 담당 기관이 합니다/);
  // R2 10: 접는 주제 12개 → 펼친 절 넷(하는 일·문서·비용과 범위·시범 상담). 숫자 원칙·하지 않는 일은 근거 읽는 법 끝으로(R2 9)
  assert.deepEqual([...h.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map(m => m[1]), ['하는 일', '문서', '비용과 범위', '시범 상담']);
  assert.doesNotMatch(h, /data-fold-from|class="sticky-cta|sticky-cta"/);
  const ev = read('evidence.html');
  for (const id of ['valuesTitle', 'notTitle']) assert.equal((ev.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  assert.equal((h.match(/id="howTitle"/g) || []).length, 1);
  const how = h.match(/<section id="how"[\s\S]*?<\/section>/)?.[0] || '';
  assert.equal((how.match(/<li>/g) || []).length, 3);
  assert.match(ev, /<section id="scope" aria-labelledby="notTitle"/);
  assert.match(h, /<section id="scope" aria-labelledby="scopeTitle">/);
  assert.match(h, /class="btn" href="explore\.html\?report=onepage#map\/21\/21090\/21090700"/);
  assert.match(h, /class="btn ghost" href="#scope"/);
  assert.match(h, /<dt>무료 공개 도구<\/dt>[\s\S]*?<dt>신청요건 근거 패키지\(시범 과업\)<\/dt>/);
  assert.match(h, /과업 1건, 행정동 1곳을 기준으로/);
  assert.doesNotMatch(h, /mascot\/crew/);
  assert.doesNotMatch(h, /id="findApp"|id="reportApp"/);
  assert.doesNotMatch(h, /class="hero-mascot" src="mascot\/taggy-default\.svg"/);
});

test('미리보기: npm dev가 외부 의존성 없는 정적 서버를 host·port 인자로 실행', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.dev, 'node dev-server.cjs');
  const server = fs.readFileSync(path.join(__dirname, '..', 'dev-server.cjs'), 'utf8');
  assert.match(server, /require\('node:http'\)/);
  assert.match(server, /--host/);
  assert.match(server, /--port/);
  assert.match(server, /landing/);
  assert.doesNotMatch(server, /\.\.\/|exec\(|spawn\(/);
});

test('브랜드 비주얼: 지정 색과 작업공간 위계·대시보드 가독성을 유지', () => {
  const common = read('styles.css'), hero = read('hero.css'), map = read('map.css'), dash = read('dashboard.css');
  for (const token of ['--bg: #f5f7f6', '--ink: #14302c', '--dim: #4a5c57', '--green: #0b6b75', '--lime: #d7f988', '--navy: #102f2d', '--shadow: 0 18px 50px rgba(16,47,45,.10)']) assert.ok(common.includes(token), token);
  assert.match(common, /font-variant-numeric:\s*tabular-nums/);
  // v9: .hero-audience·.explore-map은 쓰는 화면이 없어 규칙째 지웠다(죽은 CSS 정리). 화면에 있는 선택자만 지킨다
  for (const selector of ['.evidence-layout', '.evidence-copy', '.crew-strip', '.text-link']) assert.ok(hero.includes(selector), selector);
  for (const selector of ['.workspace-intro', '.workspace-steps', '.section-head']) assert.ok(map.includes(selector), selector);
  // R2 1·5: 대시보드 옛 :root(녹색 막대)는 rm6.css 토큰이 늘 덮어 지웠다. 글자는 13·15px 단계
  assert.doesNotMatch(dash, /:root/); assert.match(read('rm6.css'), /--y30: #4f8790/);
  assert.match(dash, /\.dash-axis\s*\{\s*font-size:\s*13px/);
  assert.match(dash, /\.dash-big \.more\s*\{\s*font-size:\s*15px/);
  assert.match(hero, /\.hero-head[\s\S]*animation:/);
});

test('모션 fallback: IntersectionObserver 부재·모션 감소에서 모든 콘텐츠를 즉시 표시', () => {
  const js = read('hero.js'), css = read('hero.css');
  assert.match(js, /typeof IntersectionObserver/);
  assert.match(js, /reduced \|\| !io/);
  // R2 1: 스크롤 나타남이 숨기는 규칙(opacity: 0) 자체를 지웠다. 스크립트·모션 설정과 상관없이 처음부터 보인다
  assert.doesNotMatch(css, /\[data-reveal\][^{]*\{[^}]*opacity:\s*0/);
  assert.doesNotMatch(css, /animation:[^;]*infinite/);
});

test('탐색 전용 페이지: 대시보드 영역이 없어도 전국 지도 로더를 먼저 노출', () => {
  const js = read('dashboard.js');
  assert.ok(js.indexOf('api.loadLeaflet = loadLeaflet') < js.indexOf('if (!app) return'));
  assert.match(js, /typeof IntersectionObserver !== 'function'/);
  assert.match(js, /state\.seen = true; render\(\)/);
});

test('기존 공개 링크: 홈의 찾기·지도·보고서 해시를 탐색 페이지로 연결', () => {
  const vm = require('node:vm');
  const redirect = hash => {
    let target = '';
    const location = { pathname: '/renewmap-site/', hash, replace: url => { target = url; } };
    const document = { querySelector: () => null, getElementById: () => null };
    vm.runInNewContext(read('site.js'), { location, document });
    return target;
  };
  assert.equal(redirect('#find'), 'explore.html#find');
  assert.equal(redirect('#map/22/22020/22020620'), 'explore.html#map/22/22020/22020620');
  assert.equal(redirect('#report'), 'explore.html#report');
  assert.equal(redirect('#how'), 'about.html#how');
  assert.equal(redirect('#faq'), 'about.html#faq');
  assert.equal(redirect('#valuesTitle'), 'evidence.html#valuesTitle');   // R2 9: 숫자 원칙은 근거 읽는 법으로 옮겼다
  assert.equal(redirect('#dashboard/26110/2611010100'), 'about.html#dashboard/26110/2611010100');
  assert.equal(redirect('#unknown'), '');
});

test('화면·스크립트·스타일·테스트 소스에 대상 직군 낱말을 적지 않는다(2026-10-26 대표 지시: 업무의 불편에서 시작)', () => {
  const word = '공' + '무원', dir = __dirname;
  const files = fs.readdirSync(dir).filter(f => /\.(html|js|cjs|css|py|webmanifest|xml|txt)$/.test(f) && f !== 'pretendard.css');
  assert.ok(files.length > 20);
  for (const f of files) assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes(word), f);
  const explore = fs.readFileSync(path.join(dir, 'explore.html'), 'utf8'), index = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(explore, /id="govTitle"/);
  assert.match(index, /href="field\/redev.html"/);
});

test('처리방침: 현장 위치 기록과 지도 외부 서비스(네이버·브이월드)를 적는다(감사 H1)', () => {
  const html = fs.readFileSync(path.join(__dirname, 'privacy.html'), 'utf8');
  for (const s of ['위도·경도·정확도', '조사 대상 지점', '국토교통부 브이월드', 'NAVER Maps']) assert.ok(html.includes(s), s);
});

test('프레임 차단(감사 H4): 스크립트가 있는 모든 화면이 frame-guard.js를 먼저 싣고, 다른 사이트 iframe이면 최상위로 연다', () => {
  const htmls = fs.readdirSync(__dirname).filter(f => f.endsWith('.html')).concat(
    fs.readdirSync(path.join(__dirname, 'field')).filter(f => f.endsWith('.html')).map(f => 'field/' + f));
  for (const f of htmls) {
    const h = read(f);
    if (!/<script src/.test(h)) continue;                       // 스크립트 없는 생성 글(data.html·dong/)은 누를 것이 없어 뺀다
    const g = h.indexOf('frame-guard.js'), s = h.search(/<script(?![^>]*(frame-guard|application\/ld\+json))/);   // ld+json은 실행되지 않는 자료
    assert.ok(g > 0, f);
    assert.ok(s < 0 || g < s, f + ': 다른 스크립트보다 앞');
  }
  const vm = require('node:vm');
  const code = read('frame-guard.js');
  const run = (topOrigin) => {
    const self = { location: { origin: 'https://a.io', href: 'https://a.io/x' } };
    const top = { get location() { if (topOrigin === null) throw new Error('cross'); return { origin: topOrigin }; }, set location(v) { top.went = v; } };
    const w = { self, top, location: self.location };
    w.self = w;
    const cls = new Set();
    const doc = { documentElement: { style: {}, classList: { add: c => cls.add(c) } } };
    vm.runInNewContext(code, { window: w, document: doc });
    assert.ok(cls.has('js'));                                    // 등장 효과는 이 표시가 있을 때만 숨긴다(UX 정비 2026-10-30)
    return { went: top.went, hidden: doc.documentElement.style.display };
  };
  assert.equal(run('https://a.io').went, undefined);           // 같은 사이트 iframe(field/vw-frame)은 그대로
  assert.equal(run(null).went, 'https://a.io/x');               // 다른 사이트면 최상위로
});

test('업무 화면에 이모지가 없다(감사 김봉진3·D22, 소개·윤리 글 제외)', () => {
  const skip = new Set(['about.html', 'ethics.html']);
  const files = fs.readdirSync(__dirname).filter(f => /\.(js|html|css)$/.test(f) && !f.endsWith('.test.cjs') && !skip.has(f))
    .concat(fs.readdirSync(path.join(__dirname, 'field')).filter(f => /\.(js|html|css)$/.test(f)).map(f => 'field/' + f));
  for (const f of files) assert.doesNotMatch(read(f), /\p{Emoji_Presentation}/u, f);
});

test('문서 열기: 크기 한도를 고르기 전에 알리고, 코드 한도와 같다(감사 김슬아4)', () => {
  const mb = Number(read('viewer.js').match(/file\.size > (\d+) \* 1024 \* 1024/)[1]);
  assert.match(read('docs.html'), new RegExp(`${mb}MB까지 엽니다`));
});

test('화면 오류 안내(감사 김범석2): 이 사이트 스크립트 예외만 한 번 알리고, 메일에는 경로만 담는다', () => {
  const vm = require('node:vm');
  const code = '//' + read('site.js').split('// 우리 스크립트가 멈추면')[1];
  let handler = null; const added = [];
  const el = () => ({ attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, append(...k) { this.kids.push(...k); } });
  const ctx = { window: { addEventListener: (t, f) => { if (t === 'error') handler = f; } }, location: { origin: 'https://a.io', pathname: '/explore.html', search: '?q=비밀' },
    document: { body: { append: x => added.push(x) }, createElement: el }, encodeURIComponent, String };
  vm.runInNewContext(code, ctx);
  handler({ error: new Error('x'), filename: 'https://maps.example/sdk.js', message: 'x' });
  handler({ error: null, filename: 'https://a.io/map.js', message: 'Script error.' });
  assert.equal(added.length, 0);
  handler({ error: new Error('boom'), filename: 'https://a.io/map.js', message: 'boom' });
  handler({ error: new Error('again'), filename: 'https://a.io/map.js', message: 'again' });
  assert.equal(added.length, 1);
  const href = added[0].kids.find(k => k.href).href;
  assert.match(decodeURIComponent(href), /화면: \/explore\.html\n오류: boom/);
  assert.doesNotMatch(decodeURIComponent(href), /비밀/);
});

test('홈은 고정된 지표 수치를 복제하지 않고 실제 근거 페이지로 연결한다', () => {
  const home = read('index.html');
  assert.match(home, /explore\.html\?report=onepage#map\/21\/21090\/21090700/);
  assert.doesNotMatch(home, /<dd>\d+(?:\.\d+)?%/);
});

test('방문 분석 끄기는 같은 페이지의 후속 클릭·제출부터 즉시 적용된다', () => {
  const vm=require('node:vm'), events={}, sent=[], storage=new Map();let toggle;
  const button={addEventListener:(_,fn)=>{toggle=fn;}};
  const document={currentScript:{src:'https://example.org/site.js'},querySelectorAll:()=>[button],createElement:()=>({}),head:{appendChild:script=>script.onload()},addEventListener:(name,fn)=>{events[name]=fn;}};
  const code=read('site.js').slice(read('site.js').indexOf('/* 방문 분석('));
  vm.runInNewContext(code,{document,window:{RENEWMAP_HACKLE_KEY:'synthetic',Hackle:{createInstance:()=>({track:event=>sent.push(event)})}},location:{pathname:'/privacy.html'},navigator:{},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},URL,Date:{now:()=>Date.parse('2026-11-15T00:00:00Z'),parse:Date.parse}});
  const anchor={hasAttribute:()=>true,download:'sample.hwpx'};
  const click={target:{closest:()=>anchor}};
  events.click(click);assert.equal(sent.length,1);
  toggle();events.click(click);events.submit({target:{id:'homeSearch'}});
  assert.equal(sent.length,1);
});

test('R3: 소개에 쓰임 세 줄 링크, 근거 읽는 법은 첫 갈래만 펼치고, 건물 4D에 CSV 단추, 사업체 0% 글이 화면·동 페이지에 같다', () => {
  const about = read('about.html');
  for (const href of ['explore.html?ind=ELDERLY_LIVING_ALONE#map/21', 'explore.html?ind=HOSP_CLINIC_COUNT#map/21', 'time4d.html']) assert.ok(about.includes('class="about-use"><a href="' + href + '"'), href);
  assert.match(read('evidence.html'), /id="main" data-content-book data-fold-from="1"/);
  assert.match(read('time4d.html'), /id="t4Csv"/);
  const U = require('./util.js');
  assert.equal(U.bizZeroNote([[2015, 10], [2024, 20]], 0), '2024년 사업체 수(20개)가 최근 10년 중 가장 많아 감소율이 0%입니다.');
  assert.equal(U.bizZeroNote([[2015, 30], [2024, 20]], 0), '');   // 시계열이 받쳐 주지 않으면 말하지 않는다
  assert.equal(U.bizZeroNote([[2015, 10], [2024, 20]], 1.5), '');
  assert.equal(U.bizZeroNote(null, 0), '');
});

test('R4 3: 홈 대상 줄은 담당자·용역사 + 복지·안전·기사, 방문 분석 한 줄은 개인정보 처리방침 절로 잇고, 소개에 쓰임 네 번째(인용 한 줄)', () => {
  const home = read('index.html'), about = read('about.html');
  assert.match(home, /<p class="h6-for">도시재생 담당자·용역사를 위해 만들었고, 복지·안전·기사에 쓰는 분도 같은 숫자를 출처째 가져가실 수 있습니다\.<\/p>/);
  assert.ok(!home.includes('용역사·시군구 도시재생 담당자용'));
  // R4 13: privacy.html 1-4절(자동으로 수집되는 정보)과 같은 말: 화면·기능 이름, 누른 횟수만, 검색어·파일 이름·연락처는 안 보냄
  const priv = read('privacy.html');
  assert.match(home, /class="h6-free h6-privacy">방문 분석은 본 화면과 동네 찾기·계산하기·문서 내려받기·상담 버튼을 누른 횟수만 세고, 검색어·파일 이름·연락처는 보내지 않습니다\. 끄는 법은 <a href="privacy\.html#analytics">/);
  assert.ok(priv.includes('페이지 조회와 동네 찾기·계산하기·문서 내려받기·상담 버튼을 누른 횟수를 셉니다') && priv.includes('이름·연락처·회원 번호·검색어·파일 이름은 보내지 않습니다'));
  assert.ok(priv.includes('<summary id="analytics">1-4.'));
  assert.ok(about.includes('class="about-use"><a href="dong/21090700.html#cite">기사·의회 자료에 숫자 옮기기</a>'));
});

test('과업 인증 화면은 외부 분석 키·SDK를 전혀 불러오지 않는다', () => {
  const code=read('site.js').slice(read('site.js').indexOf('/* 방문 분석('));
  let loaded=0;
  require('node:vm').runInNewContext(code,{document:{currentScript:{src:'https://example.org/site.js'},head:{appendChild:()=>loaded++}},location:{pathname:'/renewmap-site/tasks.html'}});
  assert.equal(loaded,0);
});

test('R4 4: 인용 한 줄 복사 — navigator.clipboard로 쓰고 aria-live 칸에 알리며, 막히면 글을 선택해 안내한다', async () => {
  const src = read('site.js'), start = src.indexOf("/* 동 페이지 '인용 한 줄 복사'"), end = src.indexOf('/* 방문 분석(핵클');
  assert.ok(start > 0 && end > start);
  const run = (clipboard, canon = { href: 'https://example.test/dong/21090700.html' }) => {
    const say = { textContent: '' }, cite = { textContent: ' 인용: 출처, 반여1동 값 ' }, handlers = {}, selected = [];
    const btn = { };
    const ctx = { document: { addEventListener: (t, f) => { handlers[t] = f; }, getElementById: id => (id === 'cite' ? cite : null), querySelector: s => (s === '[data-copy-status]' ? say : s === 'link[rel="canonical"]' ? canon : null),
      createRange: () => ({ selectNodeContents: n => selected.push(n) }) }, window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) }, navigator: { clipboard }, location: { href: 'https://example.test/dong/21090700.html#21090700:X:2025' } };
    require('node:vm').runInNewContext(src.slice(start, end), ctx);
    const click = target => handlers.click({ target });
    return { say, selected, press: () => click({ closest: s => (s === '[data-copy-cite]' ? btn : null) }), other: () => click({ closest: () => null }) };
  };
  const written = [], ok = run({ writeText: t => { written.push(t); return Promise.resolve(); } });
  ok.other(); assert.equal(written.length, 0);   // 다른 곳을 눌러도 아무 일 없다
  ok.press(); await new Promise(r => setImmediate(r));
  // R5 7: 복사본 끝에 쪽 주소(canonical)
  assert.deepEqual(written, ['인용: 출처, 반여1동 값 https://example.test/dong/21090700.html']); assert.equal(ok.say.textContent, '복사했습니다.');
  const noCanon = [], fb = run({ writeText: t => { noCanon.push(t); return Promise.resolve(); } }, null); fb.press(); await new Promise(r => setImmediate(r));
  assert.deepEqual(noCanon, ['인용: 출처, 반여1동 값 https://example.test/dong/21090700.html']);   // canonical이 없으면 현재 주소에서 # 뒤를 뗀다
  const denied = run({ writeText: () => Promise.reject(new Error('denied')) });
  denied.press(); await new Promise(r => setImmediate(r));
  assert.equal(denied.selected.length, 1); assert.match(denied.say.textContent, /글을 선택해 두었습니다/);
  const none = run(undefined); none.press(); assert.equal(none.selected.length, 1);
});
