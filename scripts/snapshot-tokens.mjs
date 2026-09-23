// figma/tokens-studio.json 으로 figma/tokens.*.json 네 개를 다시 쓴다.
//
// 입력은 Tokens Studio 플러그인이 tokens 브랜치로 직접 민 파일 하나다.
// 가져오는 법은 scripts/README.md 「생성 방법」에 있다.
//
// 값이 어디서 오든 "낡은 채로 커밋된다" 는 실패는 남으므로 아래 대조는 그대로 둔다.
//
// Tokens Studio 출력에는 변수 id 가 없다. figma/tokens.ids.json 은 이 스크립트가 만들지 않고,
// 있는 파일을 읽어 이름 대조에만 쓴다. 변수가 추가·삭제·개명됐을 때만 따로 다시 뽑는다 —
// 추출 코드는 scripts/figma-extract.js 다.
//
// 출력 형식은 바꾸지 않는다. build-tokens.mjs · check-*.mjs 가 그대로 읽는다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'figma');
const INPUT = path.join(OUT, 'tokens-studio.json');
const SOURCE = 'Tokens Studio (figma/tokens-studio.json) — DS Master kJD5jv7RNKxLD1hP8oKtBG';
// 모드 순서는 Figma 의 모드 순서다. 입력에는 이 순서가 없다 —
// $metadata.tokenSetOrder 는 Tokens Studio 안에서 세트를 나열한 순서일 뿐이라 Figma 와 무관하고,
// 실제로 Breakpoint 에서 갈렸다(tokenSetOrder 는 Desktop·Tablet·Mobile·Wide·Laptop).
// 그래서 여기에 적어 고정한다. 플러그인에서 세트를 끌어 옮겨도 스냅샷이 재정렬되지 않는다.
//
// 모드를 추가·삭제·개명하면 여기도 고쳐야 한다. 안 고치면 아래 세트 대조에서 멈춘다.
const MODES = {
  Primitive: ['Primitive'],
  Theme: ['Default', 'Dark'],
  Shape: ['Rounded', 'Square', 'Pill'],
  Breakpoint: ['Wide', 'Desktop', 'Laptop', 'Tablet', 'Mobile'],
};
const COLLECTIONS = Object.keys(MODES);
const FILE_OF = (c) => `tokens.${c.toLowerCase()}.json`;

const die = (msg) => { console.error(`\n중단 — ${msg}\n`); process.exit(1); };

// ── 입력 읽기 ───────────────────────────────────────────────────────
if (!fs.existsSync(INPUT)) {
  die(
    `figma/tokens-studio.json 이 없다.\n` +
    `  Figma 에서 Tokens Studio 플러그인을 열고 Push 한다 — 그 브랜치에서 이 파일을 가져온다.\n` +
    `  예: git checkout origin/tokens -- figma/tokens-studio.json`,
  );
}
const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

// 세트 이름은 "<컬렉션>/<모드>" 꼴이다. 모드가 하나인 Primitive 도 "Primitive/Primitive" 다.
// 순서는 $metadata.tokenSetOrder 가 정한다 — 입력이 들고 있는 유일한 순서다.
const order = raw.$metadata?.tokenSetOrder;
if (!Array.isArray(order) || !order.length) die('$metadata.tokenSetOrder 가 없다 — Tokens Studio 출력이 아니다');

const present = Object.keys(raw).filter((k) => !k.startsWith('$'));
const missing = present.filter((s) => !order.includes(s));
if (missing.length) die(`tokenSetOrder 에 없는 세트가 있다: ${missing.join(', ')}`);
const absent = order.filter((s) => !(s in raw));
if (absent.length) die(`tokenSetOrder 에 있는데 파일에 없는 세트: ${absent.join(', ')}`);

// ── 리프를 평평하게 편다 ────────────────────────────────────────────
// 리프는 { value, type, description?, $extensions? } 다. 경로를 "/" 로 이으면 Figma 변수 이름이 된다.
//
// $extensions 에 com.figma.* 가 하나도 없으면 Figma 변수가 아니다 — 버린다.
// 텍스트 스타일의 행간처럼 변수가 아닌 것이 같은 파일에 딸려 나온다.
const isLeaf = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'value' in v && 'type' in v;
const isFigmaVariable = (leaf) =>
  Object.keys(leaf.$extensions ?? {}).some((k) => k.startsWith('com.figma.'));

// 별칭 "{a.b.c}" 를 "var(--a-b-c)" 로 바꾼다. 기존 스냅샷과 같은 표기라 SCSS 와 그대로 대조된다.
const ALIAS = /^\{([^}]+)\}$/;
const convert = (value) => {
  if (typeof value !== 'string') return value;
  const m = ALIAS.exec(value);
  return m ? `var(--${m[1].replace(/\./g, '-')})` : value;
};

const dropped = [];
function flatten(setName) {
  const out = {};
  const walk = (node, trail) => {
    for (const [k, v] of Object.entries(node)) {
      const trail2 = [...trail, k];
      if (isLeaf(v)) {
        const name = trail2.join('/');
        if (!isFigmaVariable(v)) { dropped.push(`${setName}:${name}`); continue; }
        if (name in out) die(`${setName}: '${name}' 가 두 번 나온다`);
        out[name] = convert(v.value);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v, trail2);
      } else {
        die(`${setName}: '${trail2.join('/')}' 가 리프도 묶음도 아니다`);
      }
    }
  };
  walk(raw[setName], []);
  return out;
}

// ── 컬렉션별로 모은다 ───────────────────────────────────────────────
// 이름 → { 모드이름: 값 }. 모드가 하나면 값을 바로 넣는다.
const stage = {};
for (const setName of order) {
  const cut = setName.indexOf('/');
  if (cut < 0) die(`세트 이름이 "<컬렉션>/<모드>" 꼴이 아니다: ${setName}`);
  const collection = setName.slice(0, cut);
  const mode = setName.slice(cut + 1);
  if (!COLLECTIONS.includes(collection)) die(`모르는 컬렉션: ${collection} (${setName})`);
  stage[collection] ??= { modes: MODES[collection], byMode: {} };
  if (mode in stage[collection].byMode) die(`${collection}: 모드 '${mode}' 가 두 번 나온다`);
  stage[collection].byMode[mode] = flatten(setName);
}

// 세트 대조 — MODES 에 적힌 모드와 입력의 세트가 정확히 맞아야 한다.
// 여기서 걸리면 Figma 에서 모드를 추가·삭제·개명한 것이다. MODES 를 고쳐야 한다.
for (const c of COLLECTIONS) {
  if (!stage[c]) die(`세트가 하나도 없는 컬렉션: ${c}`);
  const got = Object.keys(stage[c].byMode);
  const want = MODES[c];
  const onlyGot = got.filter((m) => !want.includes(m));
  const onlyWant = want.filter((m) => !got.includes(m));
  if (onlyGot.length || onlyWant.length) {
    die(
      `${c}: 모드가 MODES 와 다르다.\n` +
      `  입력에만 있음: ${onlyGot.join(', ') || '없음'}\n` +
      `  MODES 에만 있음: ${onlyWant.join(', ') || '없음'}\n` +
      `  Figma 에서 모드가 바뀌었다는 뜻이다. scripts/snapshot-tokens.mjs 의 MODES 를 Figma 모드 순서대로 고친다.`,
    );
  }
}

for (const c of COLLECTIONS) {
  const { modes, byMode } = stage[c];
  const names = new Set(modes.flatMap((m) => Object.keys(byMode[m])));
  const tokens = {};
  for (const name of names) {
    if (modes.length === 1) {
      tokens[name] = byMode[modes[0]][name];
    } else {
      const one = {};
      for (const m of modes) if (name in byMode[m]) one[m] = byMode[m][name];
      tokens[name] = one;
    }
  }
  stage[c].tokens = tokens;
}

// 키를 이름순으로 세운다. 정렬을 고정하지 않으면 뽑을 때마다 순서가 흔들리고,
// 그러면 생성되는 SCSS 의 줄 순서까지 같이 흔들려 diff 를 읽을 수 없게 된다.
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// ── id 맵 — 읽기만 한다 ─────────────────────────────────────────────
const IDS_FILE = path.join(OUT, 'tokens.ids.json');
if (!fs.existsSync(IDS_FILE)) die('figma/tokens.ids.json 이 없다 — scripts/figma-extract.js 를 Figma MCP 로 돌려 다시 뽑는다');
const idsRaw = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'))).filter(([k]) => !k.startsWith('_')),
);

// ── 대조 — 여기서 막지 못하면 낡은 채로 커밋된다 ────────────────────
// 이름이 몇백 개 쏟아지면 읽히지 않으므로 앞의 몇 개만 보여 준다.
const few = (list, n = 6) =>
  list.slice(0, n).join(', ') + (list.length > n ? ` … 외 ${list.length - n}개` : '');

const problems = [];
const stop = () => die(`대조에서 걸렸다. 아무 파일도 쓰지 않았다.\n  - ${problems.join('\n  - ')}`);

// 1) 값 파일과 id 파일의 이름 집합이 같아야 한다.
//    여기서 걸리면 변수가 추가되거나 삭제된 것이다 — id 맵을 다시 뽑아야 한다.
//    이 스크립트는 id 맵을 만들 수 없다(Tokens Studio 출력에 변수 id 가 없다).
for (const c of COLLECTIONS) {
  const byValue = new Set(Object.keys(stage[c].tokens));
  const byId = new Set(Object.values(idsRaw[c] ?? {}));
  const onlyValue = [...byValue].filter((n) => !byId.has(n));
  const onlyId = [...byId].filter((n) => !byValue.has(n));
  if (onlyValue.length) problems.push(`${c}: 값에만 있고 id 에 없다 (${onlyValue.length}) — ${few(onlyValue)}`);
  if (onlyId.length) problems.push(`${c}: id 에만 있고 값에 없다 (${onlyId.length}) — ${few(onlyId)}`);
}
if (problems.length) {
  problems.push(
    '변수가 추가·삭제됐다는 뜻이다. figma/tokens.ids.json 을 다시 뽑아야 한다 — ' +
    'scripts/figma-extract.js 를 Figma MCP 로 돌려 그 결과로 그 파일을 덮는다. ' +
    '이 스크립트는 id 맵을 만들 수 없다(Tokens Studio 출력에 변수 id 가 없다).',
  );
  stop();
}

// 2) 별칭이 가리키는 이름이 실제로 있어야 한다.
const known = new Set(COLLECTIONS.flatMap((c) => Object.keys(stage[c].tokens)).map((n) => n.replace(/\//g, '-')));
const dangling = [];
for (const c of COLLECTIONS) {
  for (const [name, v] of Object.entries(stage[c].tokens)) {
    const vals = typeof v === 'object' && v !== null ? Object.values(v) : [v];
    for (const one of vals) {
      if (typeof one !== 'string') continue;
      const m = /^var\(--(.+)\)$/.exec(one);
      if (m && !known.has(m[1])) dangling.push(`${c}:${name} → ${one}`);
    }
  }
}
if (dangling.length) problems.push(`없는 변수를 가리키는 별칭 (${dangling.length}) — ${few(dangling, 4)}`);

// 3) 모드 수만큼 값이 있어야 한다.
const holes = [];
for (const c of COLLECTIONS) {
  const { modes, tokens } = stage[c];
  if (modes.length === 1) continue;
  for (const [name, v] of Object.entries(tokens)) {
    if (typeof v !== 'object' || v === null) { holes.push(`${c}:${name} 에 모드별 값이 없다`); continue; }
    const missingModes = modes.filter((m) => !(m in v));
    if (missingModes.length) holes.push(`${c}:${name} 에 ${missingModes.join('·')} 없음`);
  }
}
if (holes.length) problems.push(`모드 값이 빈 자리 (${holes.length}) — ${few(holes, 4)}`);

if (problems.length) stop();

// ── 이전 파일과 무엇이 달라지나 ─────────────────────────────────────
// 값이 그대로여도 매번 날짜가 바뀌므로, 실제로 무엇이 달라지는지 사람이 보고 판단해야 한다.
function previous(file) {
  const p = path.join(OUT, file);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_')));
}

const report = [];
for (const c of COLLECTIONS) {
  const now = stage[c].tokens;
  const was = previous(FILE_OF(c));
  if (!was) { report.push(`${c}: 새 파일 ${Object.keys(now).length}개`); continue; }
  const added = Object.keys(now).filter((k) => !(k in was));
  const removed = Object.keys(was).filter((k) => !(k in now));
  const changed = Object.keys(now).filter((k) => k in was && JSON.stringify(was[k]) !== JSON.stringify(now[k]));
  report.push(`${c}: ${Object.keys(now).length}개 · 추가 ${added.length} · 삭제 ${removed.length} · 값바뀜 ${changed.length}`);
  for (const k of added) report.push(`    + ${k}`);
  for (const k of removed) report.push(`    - ${k}`);
  for (const k of changed) report.push(`    ~ ${k}: ${JSON.stringify(was[k])} → ${JSON.stringify(now[k])}`);
}

// ── 쓰기 — 다 만든 뒤 한꺼번에. 중간에 죽으면 아무것도 안 바뀐다 ────
const today = new Date().toISOString().slice(0, 10);
const files = {};

for (const c of COLLECTIONS) {
  const tokens = sortKeys(stage[c].tokens);
  files[FILE_OF(c)] = JSON.stringify({
    _meta: { exportedAt: today, source: SOURCE, collection: c, count: Object.keys(tokens).length },
    _modes: stage[c].modes,
    ...tokens,
  }, null, 2) + '\n';
}

for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), body);

console.log(report.join('\n'));
console.log(`\n변수가 아니라 버린 토큰 ${dropped.length}개.`);
if (dropped.length) console.log(`  ${few(dropped, 6)}`);
console.log(`\nfigma/tokens.*.json 4개를 다시 썼다 (${today}). tokens.ids.json 은 건드리지 않았다.`);
console.log('다음: npm run build — 토큰 SCSS 가 다시 만들어진다. diff 를 보고 커밋한다.');
