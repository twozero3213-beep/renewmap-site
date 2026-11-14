// 실행: node --test landing/security.test.cjs
// 2026-11-08 보안 보강: 이미 지키고 있는 보안 설정이 나중 수정으로 조용히 풀리지 않게 묶어 둔다.
// 전에는 explore.html 한 페이지만 CSP를 시험했다(explore-csp.test.cjs). 이제 공개 페이지 전부와 CI 부품 고정을 본다.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');

const pages = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
const cspOf = f => {
  const m = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  return m && Object.fromEntries(m[1].split(';').map(s => s.trim()).filter(Boolean).map(s => { const [k, ...v] = s.split(/\s+/); return [k, v]; }));
};
// style 인라인 허용이 꼭 필요한 페이지만 적는다. 이유가 사라지면 목록에서 빼고 페이지 CSP에서도 지운다.
// docs.html: 동봉한 워드 보기(vendor/office/docx-preview)가 문서 서식을 setAttribute('style')로 넣어, 빼면 문서 모양이 깨진다
const STYLE_INLINE_OK = new Set(['docs.html']);

test('모든 공개 페이지에 CSP가 있고, 스크립트 인라인·eval은 어디서도 허용하지 않는다', () => {
  assert.ok(pages.length >= 10, String(pages));
  for (const f of pages) {
    const csp = cspOf(f);
    assert.ok(csp, `${f}: CSP 없음`);
    const script = csp['script-src'] || csp['default-src'];
    assert.ok(script && !script.includes("'unsafe-inline'") && !script.includes("'unsafe-eval'"), `${f}: script-src ${script}`);
    assert.ok(!script.some(s => s === '*' || /^https?:$/.test(s) || s.includes('*')), `${f}: 스크립트 출처 와일드카드`);
    assert.deepEqual(csp['object-src'], ["'none'"], `${f}: object-src`);
    assert.deepEqual(csp['base-uri'], ["'none'"], `${f}: base-uri`);
  }
});

test("style 'unsafe-inline'은 이유를 적은 페이지(docs.html)에만 있다", () => {
  const found = pages.filter(f => (cspOf(f)['style-src'] || []).includes("'unsafe-inline'"));
  assert.deepEqual(found.filter(f => !STYLE_INLINE_OK.has(f)), [], '새로 허용하려면 STYLE_INLINE_OK에 이유와 함께 적는다');
});

test('외부로 나가는 연결(connect-src)은 같은 사이트와 적어 둔 분석 도구 주소뿐이다', () => {
  // 분석 도구(Hackle)를 바꾸거나 더하면 개인정보 처리방침(privacy.html)도 함께 고친다(팀 결정 S3)
  const ALLOWED = new Set(["'self'", 'https://sdk-api.hackle.io', 'https://event-api.hackle.io', 'https://monitoring.hackle.io', 'https://static.hackle.io']);
  // 페이지별 추가 허용: explore.html은 네이버 지도 SDK가 타일·로그를 받는 주소(네이버 지도 이용약관에 따라 쓰는 화면)
  // time4d.html은 배경 지도(OpenFreeMap)·지형(Mapterhorn) 타일 주소(2026-11-13 v7, 처리방침 3절에 적음)
  const EXTRA = { 'explore.html': new Set(['oapi.map.naver.com', 'nrbe.map.naver.net', 'nrbe.pstatic.net', 'map.pstatic.net', 'kr-col-ext.nelo.navercorp.com']),
    'time4d.html': new Set(['https://tiles.openfreemap.org', 'https://tiles.mapterhorn.com']),
    'tasks.html': new Set(['https://lpzuswxkivkidkhauoki.supabase.co']) };
  for (const f of pages) for (const s of cspOf(f)['connect-src'] || [])
    assert.ok(ALLOWED.has(s) || (EXTRA[f] && EXTRA[f].has(s)), `${f}: connect-src ${s} — 새 외부 주소면 여기와 처리방침에 함께 적는다`);
});

test('CI가 쓰는 남의 Actions는 모두 커밋 SHA로 고정되어 있다(태그는 옮겨질 수 있다)', () => {
  const dir = path.join(__dirname, '..', '.github', 'workflows');
  const uses = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f))
    .flatMap(f => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map(m => [f, m[1]]));
  assert.ok(uses.length > 0);
  for (const [f, u] of uses) if (!u.startsWith('./')) assert.match(u, /@[0-9a-f]{40}$/, `${f}: ${u}`);
});
