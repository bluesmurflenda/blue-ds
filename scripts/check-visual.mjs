// docs/ 를 실제로 띄워 렌더링하고, 화면에서만 드러나는 문제를 잡는다.
//
// 왜 있나 — 다른 검사는 전부 "값이 맞나"를 본다. 값이 다 맞아도 화면은 깨질 수 있다.
// 실제로 그랬다: 카드 내용이 카드보다 넓어 잘렸고, 목록 행 제목이 폭 0 이 되어 사라졌고,
// 다크 모드에서 검은 배경에 검은 글자가 나왔다. 값 검사는 셋 다 통과했다.
//
// 픽셀을 비교하지 않는다. 계산된 스타일과 크기만 본다 — 폰트 렌더링 차이로 인한
// 헛경보가 없고, 기준 이미지를 저장할 필요도 없다.
//
// 필요한 것: npm i -D playwright && npx playwright install chromium

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');
const PORT = 8977;
// 좁은 쪽과 넓은 쪽 — 열 수가 창 폭에 따라 흔들리는 문제는 한 폭만 보면 안 잡힌다.
const WIDTHS = [1280, 1700];
const THEMES = ['light', 'dark'];

// ── 일부러 그런 것들 ────────────────────────────────────────────────
// 여기에 넣을 때는 "왜 의도인지"를 같이 적는다. 이유 없이 늘면 검사가 죽는다.
const EXPECT = {
  // 부모 밖으로 나가는 것이 정상인 요소
  outside: [
    ['bds-tooltip__arrow', '툴팁 꼬리는 말풍선 밖으로 나와야 가리키는 방향이 보인다'],
  ],
  // 내용이 넘치는 것이 정상인 요소
  clipped: [
    ['bds-scroll-area-x', '가로 스크롤 자체를 보여 주는 시연이다'],
    ['bds-scroll-area-y', '세로 스크롤 자체를 보여 주는 시연이다'],
    ['doc-scroll-x', '넓은 표를 담는 스크롤 상자다'],
  ],
  // 대비 기준을 적용하지 않는 요소
  contrast: [
    ['bds-social-btn-naver', '네이버가 정한 브랜드 색이라 바꿀 수 없다'],
    ['bds-social-btn-kakao', '카카오가 정한 브랜드 색이라 바꿀 수 없다'],
  ],
  // 사이즈 축으로 떨어지지 않는 나열
  matrix: [
    ['logo', '로고는 사이즈가 2종인데 칸이 9개라 축으로 안 떨어진다'],
  ],
};
const expected = (list, name) => EXPECT[list].some(([k]) => name.includes(k));

// ── docs/ 를 띄운다 ─────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(DOCS, rel || 'index.html');
      if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// ── 브라우저 안에서 도는 검사 ───────────────────────────────────────
// 이 함수는 페이지 컨텍스트에서 실행된다. 바깥 변수를 쓸 수 없다.
const INSPECT = () => {
  const out = { hOverflow: null, clipped: [], outside: [], lowContrast: [], placeholder: [], matrix: [] };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.hOverflow = { sw: de.scrollWidth, cw: de.clientWidth };

  const name = (el) =>
    typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : el.tagName;
  const chrome = (el) => el.closest('.docs-sidebar, nav, pre, code');
  // 클래스는 조상까지 훑어야 한다. 글자를 담은 요소 자체엔 클래스가 없는 경우가 많고
  // (예: 버튼 안의 <span>), 상태는 조상에 붙는다(예: .bds-card-disabled).
  const chain = (el) => {
    let out = '', n = el;
    for (let i = 0; i < 6 && n; i++) {
      if (typeof n.className === 'string') out += ' ' + n.className;
      n = n.parentElement;
    }
    return out;
  };

  // 대비 계산
  const rgb = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0.5)) return c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  // 비활성은 대비 기준 대상이 아니다(WCAG 1.4.3 은 disabled 를 뺀다)
  const disabled = (el) =>
    el.closest('[disabled], [aria-disabled="true"]') ||
    /disabled|is-past|is-unavailable|placeholder/.test(chain(el));

  document.querySelectorAll('*').forEach((el) => {
    if (chrome(el)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) return;
    const r = el.getBoundingClientRect();

    // 1) 잘린 내용 — 다만 말줄임은 일부러 자르는 것이다
    if (/hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY) && cs.textOverflow !== 'ellipsis') {
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
        out.clipped.push({ el: name(el), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
      }
    }

    // 2) 부모 밖으로 나간 절대배치 요소
    if (cs.position === 'absolute' && el.offsetParent) {
      const p = el.offsetParent.getBoundingClientRect();
      const over = Math.max(p.top - r.top, r.bottom - p.bottom, p.left - r.left, r.right - p.right);
      if (over > 2) out.outside.push({ el: name(el), parent: name(el.offsetParent), over: +over.toFixed(1) });
    }

    // 3) 대비
    if (!el.children.length && (el.textContent || '').trim() && r.width >= 1 && r.height >= 1 && !disabled(el)) {
      const fg = rgb(cs.color);
      if (fg && !(fg[3] !== undefined && fg[3] < 0.5)) {
        const L1 = lum(fg), L2 = lum(bgOf(el));
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const size = parseFloat(cs.fontSize);
        const need = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700) ? 3 : 4.5;
        if (ratio < need) out.lowContrast.push({ el: name(el), scope: chain(el).trim(), text: (el.textContent || '').trim().slice(0, 12), ratio: +ratio.toFixed(2), need });
      }
    }
  });

  // 4) placeholder 가 칸에 안 들어가나 — 글자 폭을 직접 재서 본다
  const cvs = document.createElement('canvas').getContext('2d');
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
    const cs = getComputedStyle(el);
    cvs.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const need = cvs.measureText(el.placeholder).width;
    const have = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (need > have + 1) out.placeholder.push({ text: el.placeholder.slice(0, 14), short: Math.round(need - have) });
  });

  // 5) 나열 격자의 열 수가 사이즈 축과 맞나
  document.querySelectorAll('.doc-matrix').forEach((g, i) => {
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
    const cells = [...g.querySelectorAll(':scope > .doc-cell')];
    const sizes = new Set();
    cells.forEach((c) => {
      const cap = c.querySelector('.doc-cell__caption')?.textContent || '';
      (cap.match(/-(xs|sm|md|lg|xl|2xl)\b/g) || []).forEach((x) => sizes.add(x.slice(1)));
    });
    if (cells.length > 3 && sizes.size >= 2 && cols !== sizes.size) {
      out.matrix.push({ i, cols, sizes: [...sizes], cells: cells.length });
    }
  });

  return out;
};

// ── 돈다 ────────────────────────────────────────────────────────────
const uniq = (arr, key) => [...new Map(arr.map((x) => [key(x), x])).values()];

const server = await serve();
const pages = fs.readdirSync(path.join(DOCS, 'components')).filter((f) => f.endsWith('.html'));
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  server.close();
  console.error('\n브라우저를 못 띄웠다. 먼저 설치한다:\n  npm i -D playwright && npx playwright install chromium\n');
  console.error(String(e).split('\n')[0]);
  process.exit(1);
}

const problems = [];
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await ctx.newPage();
  for (const theme of THEMES) {
    for (const f of pages) {
      const slug = f.replace('.html', '');
      await page.goto(`http://127.0.0.1:${PORT}/components/${f}`, { waitUntil: 'networkidle' });
      if (theme === 'dark') {
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await page.waitForTimeout(120);
      }
      const r = await page.evaluate(INSPECT);
      const where = `${slug} · ${width}px · ${theme}`;

      if (r.hOverflow) problems.push({ where, kind: '가로 넘침', detail: `${r.hOverflow.sw} > ${r.hOverflow.cw}`, warn: false });
      for (const c of uniq(r.clipped, (x) => x.el)) {
        if (!expected('clipped', c.el)) problems.push({ where, kind: '내용 잘림', detail: `${c.el} — 내용 ${c.sw}×${c.sh}, 칸 ${c.cw}×${c.ch}`, warn: false });
      }
      for (const o of uniq(r.outside, (x) => x.el + x.parent)) {
        if (!expected('outside', o.el)) problems.push({ where, kind: '부모 밖으로', detail: `${o.el} in ${o.parent} — ${o.over}px`, warn: false });
      }
      for (const c of uniq(r.lowContrast, (x) => x.el + x.ratio)) {
        if (!expected('contrast', c.scope ?? c.el)) problems.push({ where, kind: '대비 미달', detail: `${c.el} "${c.text}" — ${c.ratio} (기준 ${c.need})`, warn: true });
      }
      for (const p of uniq(r.placeholder, (x) => x.text + x.short)) {
        problems.push({ where, kind: 'placeholder 잘림', detail: `"${p.text}" — ${p.short}px 모자람`, warn: false });
      }
      for (const m of r.matrix) {
        if (!expected('matrix', slug)) problems.push({ where, kind: '열 수가 축과 다름', detail: `열 ${m.cols} ≠ 사이즈 ${m.sizes.length}개(${m.sizes.join('·')})`, warn: true });
      }
    }
  }
  await ctx.close();
}
await browser.close();
server.close();

console.log(`페이지 ${pages.length}개 × 폭 ${WIDTHS.length} × 테마 ${THEMES.length} = ${pages.length * WIDTHS.length * THEMES.length}회 렌더링`);
if (!problems.length) {
  console.log('걸린 것 없음.');
  process.exit(0);
}

const byKind = {};
for (const p of problems) (byKind[p.kind] ??= []).push(p);
console.log('');
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`${list[0].warn ? '△' : '■'} ${kind} (${list.length})`);
  for (const p of list) console.log(`   ${p.where} — ${p.detail}`);
}

// 레이아웃이 깨진 것은 판단이 필요 없다 — 바로 실패다.
// 대비와 열 수는 색·배치를 정하는 판단이 섞여 있어 경고로 낸다.
// --strict 를 주면 경고도 실패로 본다(CI 에서 조일 때 쓴다).
const strict = process.argv.includes('--strict');
const fail = problems.filter((p) => !p.warn || strict);
const warn = problems.length - fail.length;
console.log(`\n■ 실패 ${fail.length}건${warn ? ` · △ 경고 ${warn}건` : ''}.`);
console.log('일부러 그런 것이면 scripts/check-visual.mjs 의 EXPECT 에 이유와 함께 넣는다.');
process.exit(fail.length ? 1 : 0);
