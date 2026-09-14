// Figma 플러그인 API 로 변수를 뽑는다. 이 파일은 node 로 돌지 않는다 —
// Figma MCP(use_figma)에 본문을 그대로 넣어 실행하고, 반환값을 figma/.staging/ 에 저장한다.
//
// 왜 파일로 두나 — 이 코드를 문서에 옮겨 적으면 반드시 실제와 어긋난다.
// 실제로 어긋났었다: 문서 쪽 예시는 반투명 색을 rgba() 로 냈는데 스냅샷에는 8자리 hex 로
// 들어가 있었다. 실행되는 코드는 한 곳에만 둔다.
//
// 순서
//   1. 아래 A·B 를 컬렉션마다 한 번씩 돌린다 (TARGET 을 바꾼다)
//   2. 반환값을 figma/.staging/<collection>.json 에 그대로 저장한다
//      출력이 잘리면 SLICE 를 나눠 <collection>.1.json · <collection>.2.json … 로 저장한다
//      (Theme 은 한 번에 안 나온다)
//   3. C 를 한 번 돌려 figma/.staging/ids.json 에 저장한다
//   4. npm run snapshot

// ── A·B. 컬렉션 하나의 값 ────────────────────────────────────────────
// TARGET: 'Primitive' | 'Theme' | 'Shape' | 'Breakpoint'
// SLICE : 이름순 구간 [시작, 끝). 한 번에 다 나오면 [0, 9999] 로 둔다.
const TARGET = 'Theme';
const SLICE = [0, 9999];

// 반투명 색은 8자리 hex 로 낸다. rgba() 가 아니다 — 스냅샷에 들어 있는 형식이 이것이다.
const hex = (c) =>
  '#' +
  ['r', 'g', 'b'].map((k) => Math.round(c[k] * 255).toString(16).padStart(2, '0')).join('') +
  (c.a !== undefined && c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : '');

const cols = await figma.variables.getLocalVariableCollectionsAsync();
const col = cols.find((c) => c.name === TARGET);
if (!col) throw new Error(`컬렉션 없음: ${TARGET}`);

const vars = [];
for (const id of col.variableIds) {
  const v = await figma.variables.getVariableByIdAsync(id);
  if (v) vars.push(v);
}
// 이름순으로 세운다. 구간을 나눠 받을 때 기준이 흔들리면 안 된다.
vars.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const tokens = {};
for (const v of vars.slice(SLICE[0], SLICE[1])) {
  const one = {};
  for (const m of col.modes) {
    const raw = v.valuesByMode[m.modeId];
    if (raw && raw.type === 'VARIABLE_ALIAS') {
      const t = await figma.variables.getVariableByIdAsync(raw.id);
      one[m.name] = 'var(--' + t.name.replace(/\//g, '-') + ')';
    } else if (v.resolvedType === 'COLOR') {
      one[m.name] = hex(raw);
    } else {
      one[m.name] = raw;
    }
  }
  // 모드가 하나인 컬렉션(Primitive)은 값을 바로 담는다.
  tokens[v.name] = col.modes.length === 1 ? one[col.modes[0].name] : one;
}

return { modes: col.modes.map((m) => m.name), total: vars.length, slice: SLICE, tokens };

// ── C. id → 이름 (네 컬렉션을 한 번에) ───────────────────────────────
// 값이 없어 가볍다. 위와 따로 돌린다.
//
// const cols = await figma.variables.getLocalVariableCollectionsAsync();
// const map = {};
// for (const name of ['Primitive', 'Theme', 'Shape', 'Breakpoint']) {
//   const col = cols.find((c) => c.name === name);
//   const pairs = [];
//   for (const id of col.variableIds) {
//     const v = await figma.variables.getVariableByIdAsync(id);
//     if (v) pairs.push([v.name, id.replace('VariableID:', '')]);
//   }
//   pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
//   map[name] = Object.fromEntries(pairs.map(([n, i]) => [i, n]));
// }
// return { map };
