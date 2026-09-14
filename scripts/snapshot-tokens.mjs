// figma/.staging/*.json 에 받아 둔 추출 결과로 figma/tokens.*.json 을 다시 쓴다.
//
// 왜 있나 — 변수 REST API 를 못 써서 추출은 사람이 MCP 로 돌려야 한다. 그 뒤 파일을
// 손으로 고치는 동안 실수가 났다: 새로 생긴 변수만 넣고 기존 값은 확인하지 않은 적이 있고,
// id 파일의 개수 표기가 실제와 하나 어긋난 채로 커밋된 적이 있다.
// 그래서 사람이 하는 일을 "추출해서 붙여넣기"까지로 줄이고, 정렬·개수·대조는 여기서 한다.
//
// 추출 스크립트는 scripts/figma-extract.js 다. 여기에 옮겨 적지 않는다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'figma');
const STAGE = path.join(OUT, '.staging');
const SOURCE = 'use_figma (Plugin API) — DS Master kJD5jv7RNKxLD1hP8oKtBG';
const COLLECTIONS = ['Primitive', 'Theme', 'Shape', 'Breakpoint'];
const FILE_OF = (c) => `tokens.${c.toLowerCase()}.json`;

const die = (msg) => { console.error(`\n중단 — ${msg}\n`); process.exit(1); };

// ── 스테이징 읽기 ───────────────────────────────────────────────────
// 한 컬렉션이 한 번에 안 나오면 조각으로 받는다: theme.1.json · theme.2.json …
// 조각은 이름이 겹치면 안 된다. 겹치면 같은 구간을 두 번 받은 것이므로 멈춘다.
// 파일 이름의 대소문자는 따지지 않는다 — Primitive.json 도 primitive.json 도 받는다.
function readStage(base) {
  if (!fs.existsSync(STAGE)) die(`${STAGE} 가 없다. scripts/figma-extract.js 결과를 여기에 저장한다`);
  const re = new RegExp(`^${base}(\\.\\d+)?\\.json$`, 'i');
  const files = fs.readdirSync(STAGE).filter((f) => re.test(f)).sort();
  if (!files.length) die(`figma/.staging/${base}.json 이 없다`);

  let modes = null;
  const tokens = {};
  for (const f of files) {
    const part = JSON.parse(fs.readFileSync(path.join(STAGE, f), 'utf8'));
    if (!part.tokens) die(`${f} 에 tokens 가 없다 — 추출 스크립트의 반환값을 그대로 저장한다`);
    if (part.modes) {
      if (modes && JSON.stringify(modes) !== JSON.stringify(part.modes)) die(`${f} 의 모드 목록이 앞 조각과 다르다`);
      modes = part.modes;
    }
    for (const k of Object.keys(part.tokens)) {
      if (k in tokens) die(`${base}: '${k}' 가 조각 두 곳에 있다 — 같은 구간을 두 번 받았다`);
      tokens[k] = part.tokens[k];
    }
  }
  if (!modes) die(`${base}: 모드 목록이 없다`);
  return { modes, tokens, files };
}

// 키를 이름순으로 세운다. 정렬을 고정하지 않으면 추출할 때마다 순서가 흔들리고,
// 그러면 생성되는 SCSS 의 줄 순서까지 같이 흔들려 diff 를 읽을 수 없게 된다.
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// ── 읽기 ────────────────────────────────────────────────────────────
const stage = {};
for (const c of COLLECTIONS) stage[c] = readStage(c.toLowerCase());

const idsRaw = readStageIds();
function readStageIds() {
  const files = fs.readdirSync(STAGE).filter((f) => /^ids(\.\d+)?\.json$/i.test(f)).sort();
  if (!files.length) die('figma/.staging/ids.json 이 없다');
  const map = {};
  for (const f of files) {
    const part = JSON.parse(fs.readFileSync(path.join(STAGE, f), 'utf8'));
    const src = part.map ?? part;
    for (const [col, entries] of Object.entries(src)) {
      if (col.startsWith('_')) continue;
      map[col] ??= {};
      for (const [id, name] of Object.entries(entries)) {
        if (id in map[col]) die(`ids: '${id}' 가 두 번 나온다`);
        map[col][id] = name;
      }
    }
  }
  return map;
}

// ── 대조 — 여기서 막지 못하면 낡은 채로 커밋된다 ────────────────────
// 이름이 몇백 개 쏟아지면 읽히지 않으므로 앞의 몇 개만 보여 준다.
const few = (list, n = 6) =>
  list.slice(0, n).join(', ') + (list.length > n ? ` … 외 ${list.length - n}개` : '');

const problems = [];
const stop = () => die(`대조에서 걸렸다. 아무 파일도 쓰지 않았다.\n  - ${problems.join('\n  - ')}`);

// 1) 값 파일과 id 파일의 이름 집합이 같아야 한다.
//    출력이 잘려 덜 받아진 경우가 여기서 걸린다 — 제일 흔한 실패다.
for (const c of COLLECTIONS) {
  const byValue = new Set(Object.keys(stage[c].tokens));
  const byId = new Set(Object.values(idsRaw[c] ?? {}));
  const onlyValue = [...byValue].filter((n) => !byId.has(n));
  const onlyId = [...byId].filter((n) => !byValue.has(n));
  if (onlyValue.length) problems.push(`${c}: 값에만 있고 id 에 없다 (${onlyValue.length}) — ${few(onlyValue)}`);
  if (onlyId.length) problems.push(`${c}: id 에만 있고 값에 없다 (${onlyId.length}) — ${few(onlyId)}`);
}
// 이름부터 어긋나면 아래 별칭 검사는 전부 딸려 나오므로 여기서 멈춘다.
if (problems.length) stop();

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
    const missing = modes.filter((m) => !(m in v));
    if (missing.length) holes.push(`${c}:${name} 에 ${missing.join('·')} 없음`);
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

const ids = {};
let idCount = 0;
for (const c of COLLECTIONS) {
  const entries = Object.entries(idsRaw[c] ?? {}).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  ids[c] = Object.fromEntries(entries);
  idCount += entries.length;
}
files['tokens.ids.json'] = JSON.stringify({
  _meta: {
    exportedAt: today,
    source: SOURCE,
    purpose: "check-nodes.mjs가 REST boundVariables의 VariableID:<id>를 이름·컬렉션으로 해석하는 데 쓴다. Variables REST API(Enterprise 전용)를 못 쓰는 대신 MCP로 추출.",
    note: "키는 'VariableID:' 접두사를 뺀 나머지(예: '997:12')다.",
    count: idCount,
  },
  ...ids,
}, null, 2) + '\n';

for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), body);

console.log(report.join('\n'));
console.log(`\nid 맵 ${idCount}개. figma/tokens.*.json 5개를 다시 썼다 (${today}).`);
console.log('다음: npm run build — 토큰 SCSS 가 다시 만들어진다. diff 를 보고 커밋한다.');
