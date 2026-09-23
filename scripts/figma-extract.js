// 변수 id → 이름 맵을 뽑는다. 이 파일은 node 로 돌지 않는다 —
// Figma MCP(use_figma)에 본문을 그대로 넣어 실행하고, 반환값으로 figma/tokens.ids.json 을 덮는다.
//
// 언제 돌리나 — 변수를 추가·삭제·개명했을 때만이다. 값은 여기서 뽑지 않는다.
// 값은 Tokens Studio 가 figma/tokens-studio.json 으로 내보내고 npm run snapshot 이 읽는다.
// 그 출력에는 변수 id 가 없어서 id 맵만 따로 남았다.
//
// 값이 바뀌었을 뿐인데 이걸 돌릴 필요는 없다. 돌려야 하는 때는 npm run snapshot 이
// "값에만 있고 id 에 없다 / id 에만 있고 값에 없다" 로 멈춰서 알려 준다.
//
// 왜 파일로 두나 — 이 코드를 문서에 옮겨 적으면 반드시 실제와 어긋난다.
// 실제로 어긋났었다. 실행되는 코드는 한 곳에만 둔다.
//
// 결과를 저장하는 형식은 figma/tokens.ids.json 을 열어 확인한다 — 반환값의 map 을 그대로 쓴다.

const cols = await figma.variables.getLocalVariableCollectionsAsync();
const map = {};
for (const name of ['Primitive', 'Theme', 'Shape', 'Breakpoint']) {
  const col = cols.find((c) => c.name === name);
  if (!col) throw new Error(`컬렉션 없음: ${name}`);
  const pairs = [];
  for (const id of col.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) pairs.push([v.name, id.replace('VariableID:', '')]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  map[name] = Object.fromEntries(pairs.map(([n, i]) => [i, n]));
}
return { map };
