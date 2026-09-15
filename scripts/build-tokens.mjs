// figma/tokens.*.json 스냅샷에서 scss/tokens/*.scss 를 만든다.
//
// 이 스크립트가 만드는 파일은 손으로 고치지 않는다. 값을 바꾸려면 Figma 를 고치고
// 스냅샷을 다시 뽑은 뒤 이 스크립트를 다시 돌린다.
//
// _breakpoint.scss 는 대상이 아니다 — 미디어쿼리마다 "앞 구간과 값이 다른 것만" 담고
// 컴파일타임 상수가 손으로 적혀 있어 생성물로 덮으면 그 내용이 사라진다.

import StyleDictionary from 'style-dictionary';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SNAP = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'figma', f), 'utf8'));
const OUT = path.join(ROOT, 'scss', 'tokens');
const TMP = path.join(ROOT, 'node_modules', '.cache', 'bds-tokens');

// ── 어느 것을 내보내나 ──────────────────────────────────────────────
// Theme 은 일반 시맨틱만 내보낸다. 컴포넌트별 시맨틱은 각 컴포넌트 SCSS 가 채운다.
const THEME_GROUPS = ['accent', 'border', 'brand', 'effect', 'icon', 'surface', 'text'];
// ADR-015 — Button Size xs 는 코드에서 제외한다.
const SHAPE_EXCLUDE = new Set(['btn/radius-xs', 'btn/padding-x/xs']);

// ── 값을 어떻게 찍나 ────────────────────────────────────────────────
// 이름으로 종류를 정한다. Primitive 는 모드가 하나라 값이 바로 들어 있다.
function typeOfPrimitive(name, v) {
  if (typeof v === 'string' && v.startsWith('#')) return 'color';
  if (name.startsWith('font/family/')) return 'fontFamily';
  if (name.startsWith('font/weight/')) return 'fontWeight';
  if (name.startsWith('motion/')) return 'duration';
  return 'dimension';
}
function render(t) {
  const v = t.$value ?? t.value;
  const type = t.$type ?? t.type;
  if (typeof v === 'string' && v.startsWith('var(--')) return v.replace('var(--', 'var(--bds-');
  if (type === 'color' || typeof v === 'string' && v.startsWith('#')) return v;
  if (type === 'fontFamily') return `'${v}'`;
  if (type === 'fontWeight') return String(v);
  if (type === 'duration') return `${v}ms`;
  if (typeof v === 'string') return v;
  return Number(v) === 0 ? '0' : `${v}px`;
}

const entries = (d) => Object.entries(d).filter(([k]) => !k.startsWith('_'));
// 스냅샷에 적힌 순서를 그대로 쓴다. 그 순서는 이름순으로 고정돼 있다(snapshot-tokens.mjs).
const orderOf = (pairs) => new Map(pairs.map(([k], i) => [k, i]));

function nest(pairs, typeFn) {
  const out = {};
  for (const [name, value] of pairs) {
    const seg = name.split('/');
    let n = out;
    for (const p of seg.slice(0, -1)) n = (n[p] ??= {});
    n[seg.at(-1)] = { $value: value, $type: typeFn ? typeFn(name, value) : undefined };
  }
  return out;
}

// ── 한 블록을 만든다 ────────────────────────────────────────────────
async function block(tokens, selector, tag, order) {
  fs.mkdirSync(TMP, { recursive: true });
  const src = path.join(TMP, `${tag}.json`);
  fs.writeFileSync(src, JSON.stringify(tokens, null, 2));

  const fmt = `bds/${tag}`;
  StyleDictionary.registerFormat({
    name: fmt,
    format: ({ dictionary }) => {
      // JS 객체는 숫자꼴 키를 먼저 정렬해 버린다. 스냅샷에 적힌 순서를 그대로 쓰려고
      // 토큰을 스냅샷 등장 순서로 다시 세운다 — 순서가 바뀌면 diff 가 통째로 흔들린다.
      const rank = (t) => order.get(t.path.join('/')) ?? Number.MAX_SAFE_INTEGER;
      const rows = [...dictionary.allTokens].sort((a, b) => rank(a) - rank(b));
      return `${selector} {\n` +
        rows.map((t) => `  --bds-${t.path.join('-')}: ${render(t)};`).join('\n') +
        `\n}\n`;
    },
  });

  const sd = new StyleDictionary({
    source: [src],
    // 기본 이름 규칙은 마지막 조각만 보기 때문에 충돌 경고가 난다.
    // 우리는 전체 경로로 이름을 만들므로 그 경고는 출력과 무관하다.
    log: { verbosity: 'silent', warnings: 'disabled' },
    platforms: { scss: { buildPath: TMP + path.sep, files: [{ destination: `${tag}.scss`, format: fmt }] } },
  });
  await sd.buildAllPlatforms();
  return fs.readFileSync(path.join(TMP, `${tag}.scss`), 'utf8');
}

// $별칭 구역 — 컴포넌트 파일이 $변수를 그대로 쓰므로 반드시 같이 낸다.
// 규칙은 :root 와 1:1 이다: $이름: var(--bds-이름);
function aliasSection(file, names) {
  const cur = fs.readFileSync(path.join(OUT, file), 'utf8').split('\n');
  const first = cur.findIndex((l) => /^\$/.test(l));
  if (first < 0) throw new Error(`${file} 에 $별칭 구역이 없다`);
  const head = [];
  for (let i = first - 1; i >= 0 && (cur[i].startsWith('//') || cur[i].trim() === ''); i--) head.unshift(cur[i]);
  while (head.length && head[0].trim() === '') head.shift();
  return '\n' + head.join('\n') + '\n' + names.map((n) => `$${n}: var(--bds-${n});`).join('\n') + '\n';
}

// :root 블록에 찍힌 이름을 순서대로 뽑는다.
const rootNames = (scss) =>
  [...scss.matchAll(/--bds-([a-z0-9-]+)\s*:/g)].map((m) => m[1]);

// 헤더 주석은 지금 파일에서 그대로 가져온다 — 근거가 적혀 있어 잃으면 안 된다.
function header(file) {
  const cur = path.join(OUT, file);
  if (!fs.existsSync(cur)) throw new Error(`${file} 이 없다 — 헤더 주석을 가져올 수 없다`);
  const head = [];
  for (const line of fs.readFileSync(cur, 'utf8').split('\n')) {
    if (line.startsWith('//') || line.trim() === '') head.push(line);
    else break;
  }
  while (head.length && head.at(-1).trim() === '') head.pop();
  return head.join('\n') + '\n\n';
}

async function main() {
  // primitive — 모드 하나, 전부 내보낸다
  const prim = SNAP('tokens.primitive.json');
  const primPairs = entries(prim);
  const primScss = await block(nest(primPairs, typeOfPrimitive), ':root', 'primitive', orderOf(primPairs));
  const primOut = header('_primitive.scss') + primScss + aliasSection('_primitive.scss', rootNames(primScss));

  // theme — 여섯 그룹만. 다크는 Default 와 값이 다른 것만 덮는다.
  const theme = SNAP('tokens.theme.json');
  const keep = entries(theme).filter(([k]) => THEME_GROUPS.includes(k.split('/')[0]));
  const dark = keep.filter(([, v]) => JSON.stringify(v.Dark) !== JSON.stringify(v.Default));
  const themeScss =
    (await block(nest(keep.map(([k, v]) => [k, v.Default])), ':root', 'theme-default', orderOf(keep))) +
    '\n' +
    (await block(nest(dark.map(([k, v]) => [k, v.Dark])), "[data-theme='dark']", 'theme-dark', orderOf(dark)));
  const themeRoot = await block(nest(keep.map(([k, v]) => [k, v.Default])), ':root', 'theme-names', orderOf(keep));
  const themeOut = header('_theme.scss') + themeScss + aliasSection('_theme.scss', rootNames(themeRoot));

  // shape — 기본은 Rounded. 각진·Pill 은 Rounded 와 값이 다른 것만 덮는다.
  const shape = SNAP('tokens.shape.json');
  const sKeep = entries(shape).filter(([k]) => !SHAPE_EXCLUDE.has(k));
  const shapeRoot = await block(nest(sKeep.map(([k, v]) => [k, v.Rounded])), ':root', 'shape-rounded', orderOf(sKeep));
  let shapeScss = shapeRoot;
  for (const [mode, sel] of [['Square', "[data-shape='square']"], ['Pill', "[data-shape='pill']"]]) {
    const diff = sKeep.filter(([, v]) => JSON.stringify(v[mode]) !== JSON.stringify(v.Rounded));
    shapeScss += '\n' + (await block(nest(diff.map(([k, v]) => [k, v[mode]])), sel, `shape-${mode.toLowerCase()}`, orderOf(diff)));
  }
  const shapeOut = header('_shape.scss') + shapeScss + aliasSection('_shape.scss', rootNames(shapeRoot));

  // 셋 다 만들어진 뒤에 한꺼번에 쓴다 — 중간에 실패하면 아무것도 안 바뀐다.
  fs.writeFileSync(path.join(OUT, '_primitive.scss'), primOut);
  fs.writeFileSync(path.join(OUT, '_theme.scss'), themeOut);
  fs.writeFileSync(path.join(OUT, '_shape.scss'), shapeOut);

  console.log(`primitive ${entries(prim).length} · theme ${keep.length}(다크 ${dark.length}) · shape ${sKeep.length}`);
}

main();
