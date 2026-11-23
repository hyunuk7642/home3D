// 한 번에 불러오는 배치: 예시 방, 전시 공간, 복도공간 전시회, 전시 자료 배치, 크리스마스 꾸미기.
// 모듈(import)을 쓰지 않는 일반 스크립트라, index.html 을 더블클릭해서(file://) 열어도 동작한다.
// js/ 의 파일들은 맨 위 이름들을 서로 함께 쓰며, index.html 에 적힌 순서대로 실행된다.
'use strict';

function sampleRoom() {
  // 6.3 × 8.5 m 방 하나: 바닥, 벽 넷(앞쪽 벽은 낮게), 가구 몇 개
  const W = 6.3, D = 8.5, H = 2.3, T = 0.15;
  state.objects = [];
  addObject('floor', { name: '바닥', w: W, d: D });
  addObject('wall', { name: '뒤쪽 벽', w: W + T, z: -D / 2, h: H });
  addObject('wall', { name: '왼쪽 벽', w: D + T, x: -W / 2, rot: 90, h: H });
  addObject('wall', { name: '오른쪽 벽', w: D + T, x: W / 2, rot: 90, h: H });
  addObject('wall', { name: '앞쪽 벽', w: W + T, z: D / 2, h: 0.9, opacity: 0.6 });
  addObject('box', { name: '침대', w: 1.5, d: 2, h: 0.5, x: -2.3, z: -3.1, y: 0.05, color: '#8662c7' });
  addObject('box', { name: '책상', w: 1.4, d: 0.7, h: 0.75, x: 2.3, z: -3.7, y: 0.05, color: '#8b5e3c' });
  addObject('door', { name: '방문', x: W / 2, z: 2.5, rot: 90 });
  addObject('window', { name: '큰 창문', w: 2, x: 0.6, z: -D / 2 });
  addObject('window', { name: '작은 창문', x: -W / 2, z: 1, rot: 90 });
  addObject('cylinder', { name: '탁자', w: 1, d: 1, h: 0.45, x: 0.5, z: 1.5, y: 0.05, color: '#f0b429' });
  state.selectedId = null;
  syncScene();
  commit();
  setView('3d');
}

// 전시 「스무 개의 질문」: 서문 1 + 관 소개 5 + 연구회 20. 벽면 하나가 전시관 하나.
const ZONES = [
  { title: '제1관 원리를 만지다', rooms: ['01 AlgoRhythm', '02 XAI 수업연구회', '03 AI 빌드 업 연구회', '04 AI-Simulation Science Lab'] },
  { title: '제2관 지구를 돌보는 손', rooms: ['05 AI for Good', '06 AI-인(人)', '07 AI·생태데이터 초중고 이음 교육연구회', '08 AI로 읽고 SDGs로 실천하는 초등 융합수업 연구회'] },
  { title: '제3관 마음을 잇는 기술', rooms: ['09 글로벌 SEL Talk 연구회', '10 creAIte 연구회', '11 AI 에듀-크리에이터 연구회', '12 우직 · AI교사연구회'] },
  { title: '제4관 모두를 위한 교실', rooms: ['13 A.S.K 연구회', '14 모두를 위한 AI윤리교육 연구회', '15 SEM 연구회', '16 AI 징검다리 연구회', '17 DiDiDa'] },
  { title: '제5관 교실의 경계를 넘어', rooms: ['18 AI-E랩 융합교육연구회', '19 숙대 AI 융합교육 실천 연구회', '20 수업 연구에 진심인 인공지능 교사 연구회'] },
];

// 전시 공간의 크기: 가로, 세로, 천장 높이, 벽 두께, 바닥 두께 (m). 방 크기가 정해지면 W, D 만 바꾸면 된다.
const GALLERY = { W: 10, D: 8, H: 2.6, T: 0.15, F: 0.05 };

// 복도공간 전시회의 크기: 길이, 폭, 바닥 두께 (m). 폭 8 m 의 다리 같은 복도로, 벽 없이 양옆은 난간이다.
const HALL = { L: 36, W: 8, F: 0.05 };
const XMAS = { RED: '#a8322d', GREEN: '#1f6b3a', GOLD: '#f0b429', SNOW: '#fbfbf8', DARK: '#2b2f36', BERRY: '#d64545' };

// 상자 트리: 정육면체 4개를 점점 작게 쌓는다. 옆면 4 × 4단 = 16면에 포스터를 붙일 수 있다.
function boxTree(add, name, x, z, F) {
  const sizes = [0.8, 0.65, 0.5, 0.35], greens = ['#1f6b3a', '#2a7d46', '#34904f', '#3fa35a'];
  let y = F;
  sizes.forEach((size, i) => {
    add('box', `${name} ${i + 1}단`, { w: size, h: size, d: size, x, z, y: round(y), rot: i % 2 ? 45 : 0, color: greens[i], group: name });
    y += size;
  });
  add('box', `${name} 별`, { w: 0.16, h: 0.16, d: 0.16, x, z, y: round(y), rot: 45, color: '#f0b429', group: name });
  add('box', `${name} 선물 1`, { w: 0.3, h: 0.25, d: 0.3, x: round(x - 0.75), z: round(z + 0.45), y: F, rot: 20, color: '#d64545' });
  add('box', `${name} 선물 2`, { w: 0.25, h: 0.2, d: 0.35, x: round(x + 0.7), z: round(z + 0.55), y: F, rot: -15, color: '#f0b429' });
}

// 전시 공간의 껍데기: 바닥, 벽 넷(앞쪽은 유리벽), 입구와 레드카펫. 입구의 x 위치를 돌려준다.
function galleryShell(add, WHITE) {
  const { W, D, H, T, F } = GALLERY, GLASS = '#a9d3e8';
  add('floor', '바닥', { w: W, d: D, color: '#cfcac2', space: 'gallery' });
  add('wall', '뒤쪽 벽', { w: W + T, z: -D / 2, h: H, color: WHITE });
  add('wall', '왼쪽 벽', { w: D + T, x: -W / 2, rot: 90, h: H, color: WHITE });
  // 오른쪽 벽은 실제로는 일반 벽이지만, 안이 들여다보이도록 반투명하게 그린다.
  add('wall', '오른쪽 벽', { w: D + T, x: W / 2, rot: 90, h: H, color: WHITE, opacity: 0.25 });
  add('wall', '앞쪽 유리벽', { w: W + T, z: D / 2, h: H, color: GLASS, opacity: 0.3 });
  const doorX = round(-W / 2 + 1.2);
  add('door', '입구', { w: 1.2, x: doorX, z: D / 2, color: GLASS, opacity: 0.5 });
  add('floor', '입구 레드카펫', { w: 1.4, d: 2.6, h: 0.01, x: doorX, z: D / 2 - 1.4, y: F, color: '#a8322d' });
  return doorX;
}

// 복도의 껍데기: 마루 바닥과 양옆의 유리 난간·손잡이.
function hallShell(add) {
  const { L, W, F } = HALL, GLASS = '#a9d3e8';
  add('floor', '복도 바닥', { w: L, d: W, h: F, color: '#ffffff', finish: 'wood', space: 'hall' });
  for (const side of [-1, 1]) { // 유리 난간과 손잡이
    const label = side < 0 ? '뒤쪽' : '앞쪽', z = round(side * (W / 2 - 0.03));
    add('wall', `${label} 난간`, { w: L, d: 0.04, h: 1.1, z, color: GLASS, opacity: 0.3 });
    add('box', `${label} 난간 손잡이`, { w: L, d: 0.08, h: 0.05, z, y: 1.1, color: '#d9d9d6' });
  }
}

// 이동식 화면 한 대: 받침 + 기둥 + 화면. -z 쪽(방 안쪽)을 바라본다.
function addScreen(add, n, x, z, F) {
  const group = `이동식 화면 ${n}`;
  add('cylinder', `${group} 받침`, { w: 0.42, d: 0.42, h: 0.03, x, z, y: F, color: '#e8e4dc', group });
  add('cylinder', `${group} 기둥`, { w: 0.04, d: 0.04, h: 1.05, x, z: round(z + 0.03), y: F + 0.03, color: '#e8e4dc', group });
  add('box', `${group} 화면`, { w: 0.62, h: 0.37, d: 0.03, x, z, y: 0.95, color: '#2b2f36', group });
}

// 이야기 자리: 탁자 + 의자 6개
function addLounge(add, x, z, F) {
  const group = '이야기 자리';
  add('box', '탁자', { w: 1.8, d: 0.9, h: 0.72, x, z, y: F, color: '#a9825a', group });
  let chair = 1;
  for (const dz of [-0.8, 0.8]) {
    for (const dx of [-0.6, 0, 0.6]) add('cylinder', `의자 ${chair++}`, { w: 0.38, d: 0.38, h: 0.45, x: round(x + dx), z: round(z + dz), y: F, color: '#a8322d', group });
  }
}

// 커피 코너: 수납장과 그 위의 커피 머신(수납장의 긴 쪽으로 0.3 m 옆). rot 은 수납장이 놓인 방향.
function addCoffee(add, x, z, rot, F, color) {
  const t = rad(rot), group = '커피 코너';
  add('box', '커피 수납장', { w: 1.4, d: 0.55, h: 0.9, x, z, y: F, rot, color, group });
  add('box', '커피 머신', { w: 0.4, d: 0.3, h: 0.42, x: round(x + Math.cos(t) * 0.3), z: round(z - Math.sin(t) * 0.3), y: F + 0.9, rot, color: '#2b2f36', group });
}

// ── 크리스마스 소품 조각들 (add 는 deco: 'xmas' 를 붙여 주는 함수) ──
const deco = {
  // 상자 트리: 발치 카펫, 단마다 모서리에 장식 공
  boxTree(add, tree, F) {
    const tiers = state.objects.filter((o) => o.group === tree && /단$/.test(o.name));
    if (!tiers.length) return;
    add('cylinder', `${tree} 발치 카펫`, { w: 1.5, d: 1.5, h: 0.012, x: tiers[0].x, z: tiers[0].z, y: F, color: XMAS.RED });
    tiers.slice(0, 3).forEach((tier, i) => {
      for (let k = 0; k < 4; k++) {
        const angle = rad(tier.rot + 45 + k * 90), reach = (tier.w / Math.SQRT2) * 0.82;
        add('sphere', `${tree} 장식 공 ${i * 4 + k + 1}`, {
          w: 0.11, h: 0.11, d: 0.11, x: round(tier.x + Math.cos(angle) * reach), z: round(tier.z - Math.sin(angle) * reach),
          y: round(tier.y + tier.h), color: (i + k) % 2 ? XMAS.GOLD : XMAS.BERRY, group: tree,
        });
      }
    });
  },
  // 화분에 심은 작은 트리(화분 + 원뿔 + 별)
  potTree(add, group, x, z, F) {
    add('cylinder', `${group} 화분`, { w: 0.28, d: 0.28, h: 0.25, x, z, y: F, color: XMAS.RED, group });
    add('cone', `${group} 나무`, { w: 0.36, d: 0.36, h: 0.95, x, z, y: F + 0.25, color: XMAS.GREEN, group });
    add('box', `${group} 별`, { w: 0.08, h: 0.08, d: 0.08, x, z, y: F + 1.19, rot: 45, color: XMAS.GOLD, group });
  },
  // 탁자 위: 러너, 미니 트리, 양초
  table(add, table, F) {
    const top = F + (table.h || 0.72), group = '탁자 장식';
    add('box', '탁자 러너', { w: 1.8, d: 0.3, h: 0.008, x: table.x, z: table.z, y: top, color: XMAS.RED, group });
    add('cone', '탁자 미니 트리', { w: 0.2, d: 0.2, h: 0.36, x: table.x, z: table.z, y: top + 0.008, color: XMAS.GREEN, group });
    add('box', '탁자 미니 트리 별', { w: 0.05, h: 0.05, d: 0.05, x: table.x, z: table.z, y: top + 0.36, rot: 45, color: XMAS.GOLD, group });
    for (const dx of [-0.55, 0.55]) add('cylinder', `탁자 양초 ${dx < 0 ? 1 : 2}`, { w: 0.07, d: 0.07, h: 0.14, x: round(table.x + dx), z: table.z, y: top + 0.008, color: XMAS.SNOW, group });
  },
  // 커피 수납장 위: 미니 트리와 장식 공 (수납장의 긴 쪽으로 0.4 m 옆)
  counter(add, counter) {
    const t = rad(counter.rot), ax = Math.cos(t), az = -Math.sin(t), group = '수납장 장식', y = counter.y + counter.h;
    add('cone', '수납장 미니 트리', { w: 0.22, d: 0.22, h: 0.4, x: round(counter.x - ax * 0.4), z: round(counter.z - az * 0.4), y, color: XMAS.GREEN, group });
    add('sphere', '수납장 장식 공', { w: 0.1, h: 0.1, d: 0.1, x: round(counter.x - ax * 0.15), z: round(counter.z - az * 0.15), y, color: XMAS.GOLD, group });
  },
  // 빨강·하양 줄무늬 지팡이 사탕 기둥
  candyPole(add, group, x, z, F) {
    for (let k = 0; k < 6; k++) add('cylinder', `${group} ${k + 1}`, { w: 0.09, d: 0.09, h: 0.2, x, z, y: round(F + k * 0.2), color: k % 2 ? XMAS.SNOW : XMAS.BERRY, group });
  },
  // 눈사람: face = 코가 향하는 쪽 [dx, dz]
  snowman(add, x, z, y, face = [0, -1]) {
    const group = '눈사람';
    add('sphere', '눈사람 몸 아래', { w: 0.7, h: 0.6, d: 0.7, x, z, y, color: XMAS.SNOW, group });
    add('sphere', '눈사람 몸 가운데', { w: 0.5, h: 0.45, d: 0.5, x, z, y: y + 0.52, color: XMAS.SNOW, group });
    add('sphere', '눈사람 머리', { w: 0.34, h: 0.34, d: 0.34, x, z, y: y + 0.9, color: XMAS.SNOW, group });
    add('cylinder', '눈사람 목도리', { w: 0.36, d: 0.36, h: 0.06, x, z, y: y + 0.9, color: XMAS.BERRY, group });
    add('box', '눈사람 코', { w: face[0] ? 0.14 : 0.05, h: 0.05, d: face[0] ? 0.05 : 0.14, x: round(x + face[0] * 0.2), z: round(z + face[1] * 0.2), y: y + 1.04, color: '#f08a24', group });
    add('cylinder', '눈사람 모자 챙', { w: 0.36, d: 0.36, h: 0.03, x, z, y: y + 1.2, color: XMAS.DARK, group });
    add('cylinder', '눈사람 모자', { w: 0.24, d: 0.24, h: 0.2, x, z, y: y + 1.23, color: XMAS.DARK, group });
  },
  // 리본 묶은 선물 세 개를 쌓은 더미
  gifts(add, gx, gz, F, label = '선물') {
    [[0, 0, 0.4, 0.3, XMAS.RED, XMAS.GOLD], [0.38, 0.1, 0.3, 0.22, XMAS.GREEN, XMAS.BERRY], [0.1, 0.02, 0.24, 0.2, XMAS.GOLD, XMAS.RED]].forEach(([dx, dz, size, h, color, ribbon], i) => {
      const group = `${label} ${i + 1}`, x = round(gx + dx), z = round(gz + dz), y = i === 2 ? F + 0.3 : F, rot = [12, -20, 30][i];
      add('box', `${group} 상자`, { w: size, d: size, h, x, z, y, rot, color, group });
      add('box', `${group} 리본 가로`, { w: size + 0.01, d: size * 0.16, h: h + 0.005, x, z, y, rot, color: ribbon, group });
      add('box', `${group} 리본 세로`, { w: size * 0.16, d: size + 0.01, h: h + 0.005, x, z, y, rot, color: ribbon, group });
    });
  },
};

// 지금 장면이 어떤 전시 배치인가: 'gallery'(방), 'hall'(복도), 아니면 null.
// 바닥 물체에 저장해 둔 표시(space)로 알아내므로 이름을 바꿔도 된다. 표시가 없던 예전 저장본은 이름으로 알아낸다.
function spaceKind() {
  const marked = state.objects.find((o) => o.space);
  if (marked) return marked.space;
  if (state.objects.some((o) => o.name === '복도 바닥')) return 'hall';
  if (state.objects.some((o) => o.name === '가운데 가벽')) return 'gallery';
  return null;
}

// "크리스마스 꾸미기": 지금 공간(전시 공간 또는 복도공간 전시회)에 카펫과 소품을 더한다.
// 다시 누르면 꾸민 것만 뺀다(deco: 'xmas' 표시). 트리·탁자·수납장은 놓인 자리를 찾아 꾸민다.
function toggleXmas() {
  if (state.objects.some((o) => o.deco === 'xmas')) {
    state.objects = state.objects.filter((o) => o.deco !== 'xmas');
    syncScene();
    commit();
    return notice('크리스마스 장식을 뺐습니다. 다시 누르면 꾸며집니다.');
  }
  // 빈 화면이면 전시 공간부터 만든다. 다른 장면이면 바꾸지 않고 알리기만 한다.
  if (!state.objects.length) gallerySpace();
  const kind = spaceKind();
  if (!kind) return notice('크리스마스 꾸미기는 "전시 공간"이나 "복도공간 전시회"에서만 됩니다. 지금 공간은 그대로 두었습니다.');
  const before = state.objects.length;
  (kind === 'hall' ? decorateHall : decorateGallery)();
  state.selectedId = null;
  syncScene();
  commit();
  notice(`크리스마스 장식 ${state.objects.length - before}개를 놓았습니다. 다시 누르면 빠집니다.`);
}

function decorateGallery() {
  const { W, D, H, T, F } = GALLERY;
  const add = (type, name, props) => addObject(type, { name, deco: 'xmas', ...props });
  const named = (name) => state.objects.find((o) => o.name === name);
  const midZ = round(-D / 2 + 3.2), midLen = W - 2.6, inner = T / 2 + 0.04; // 벽 안쪽 면에서 살짝 띄움
  const door = named('입구') || { x: round(-W / 2 + 1.2), z: D / 2 };

  // 카펫
  const hallZ = round((-D / 2 + midZ) / 2);
  add('floor', '복도 레드카펫', { w: W - 1, d: 1.2, h: 0.01, z: hallZ, y: F, color: XMAS.RED });
  add('floor', '복도 카펫 금색 띠 1', { w: W - 1, d: 0.06, h: 0.012, z: round(hallZ - 0.5), y: F, color: XMAS.GOLD });
  add('floor', '복도 카펫 금색 띠 2', { w: W - 1, d: 0.06, h: 0.012, z: round(hallZ + 0.5), y: F, color: XMAS.GOLD });
  add('floor', '가벽 앞 초록 카펫', { w: midLen, d: 1, h: 0.01, z: round(midZ + 0.75), y: F, color: XMAS.GREEN });
  const table = named('탁자') || { x: round(W / 2 - 2.3), z: round(D / 2 - 1.9), h: 0.72 };
  add('cylinder', '이야기 자리 둥근 카펫', { w: 3, d: 3, h: 0.01, x: table.x, z: table.z, y: F, color: XMAS.GREEN });

  for (const tree of ['트리 1', '트리 2']) deco.boxTree(add, tree, F);

  // 전구 줄: 벽 위쪽과 가벽 위
  add('lights', '뒤쪽 벽 전구 줄', { w: W - 0.3, z: round(-D / 2 + inner), y: 2.3 });
  add('lights', '왼쪽 벽 전구 줄', { w: D - 0.3, x: round(-W / 2 + inner), rot: 90, y: 2.3 });
  add('lights', '오른쪽 벽 전구 줄', { w: D - 0.3, x: round(W / 2 - inner), rot: 90, y: 2.3 });
  add('lights', '유리벽 전구 줄', { w: W - 0.3, z: round(D / 2 - inner), y: 2.3 });
  add('lights', '가벽 전구 줄', { w: midLen, z: midZ, y: 2.2 });

  // 리스: 높은 벽의 관 소개 위, 그리고 입구 문
  for (const slot of ['zone1', 'zone4', 'zone5']) {
    const panel = state.objects.find((o) => o.slot === slot);
    if (panel) add('wreath', `${panel.name.slice(0, 3)} 리스`, { x: panel.x, z: panel.z, rot: panel.rot, y: round(Math.min(panel.y + panel.h + 0.03, H - 0.47)) });
  }
  add('wreath', '입구 리스', { x: door.x, z: door.z, rot: door.rot || 0, y: 1.45, d: 0.2 });

  [-1, 1].forEach((side, i) => deco.potTree(add, `작은 트리 ${i + 1}`, round(side * (midLen / 2 + 0.2)), midZ, F));
  deco.table(add, table, F);
  if (named('커피 수납장')) deco.counter(add, named('커피 수납장'));
  [-0.68, 0.68].forEach((dx, i) => deco.candyPole(add, `지팡이 사탕 기둥 ${i + 1}`, round(door.x + dx), round(door.z - 0.35), F));
  deco.snowman(add, round(door.x + 1.7), round(door.z + 0.9), 0); // 유리벽 밖에서 맞이한다
  const board = state.objects.find((o) => o.slot === 'main');
  deco.gifts(add, board ? board.x + 0.85 : door.x + 2, board ? board.z + 0.25 : door.z - 1.5, F);
}

function decorateHall() {
  const { L, W, F } = HALL;
  const add = (type, name, props) => addObject(type, { name, deco: 'xmas', ...props });
  const named = (name) => state.objects.find((o) => o.name === name);

  // 카펫: 가운데 길을 따라 금색 띠를 두른 레드카펫, 들머리 초록 카펫, 이야기 자리 둥근 카펫. 마루는 넉넉히 드러나게 둔다.
  add('floor', '가운데 레드카펫', { w: L - 9, d: 1.5, h: 0.01, x: 0.5, y: F, color: XMAS.RED });
  add('floor', '레드카펫 금색 띠 1', { w: L - 9, d: 0.06, h: 0.012, x: 0.5, z: -0.65, y: F, color: XMAS.GOLD });
  add('floor', '레드카펫 금색 띠 2', { w: L - 9, d: 0.06, h: 0.012, x: 0.5, z: 0.65, y: F, color: XMAS.GOLD });
  add('floor', '들머리 초록 카펫', { w: 1.6, d: 3.2, h: 0.01, x: round(-L / 2 + 1), y: F, color: XMAS.GREEN });
  const table = named('탁자') || { x: round(L / 2 - 2.4), z: 0, h: 0.72 };
  add('cylinder', '이야기 자리 둥근 카펫', { w: 3.2, d: 3.2, h: 0.012, x: table.x, z: table.z, y: F, color: XMAS.GREEN });

  for (const tree of ['트리 1', '트리 2']) deco.boxTree(add, tree, F);

  // 전구 줄: 가벽마다 위에, 그리고 양쪽 난간을 따라
  const walls = state.objects.filter((o) => o.type === 'wall' && /가벽$/.test(o.name));
  walls.forEach((wall) => add('lights', `${wall.name} 전구 줄`, { w: wall.w, x: wall.x, z: wall.z, rot: wall.rot, y: wall.y + wall.h }));
  for (const side of [-1, 1]) add('lights', `${side < 0 ? '뒤쪽' : '앞쪽'} 난간 전구 줄`, { w: L - 0.4, z: round(side * (W / 2 - 0.09)), y: 1.14 });

  // 리스: 난간 안쪽에 6 m 마다
  for (const side of [-1, 1]) {
    for (let x = -L / 2 + 3, i = 1; x < L / 2; x += 6, i++) {
      add('wreath', `${side < 0 ? '뒤쪽' : '앞쪽'} 난간 리스 ${i}`, { w: 0.4, h: 0.4, x, z: round(side * (W / 2 - 0.1)), y: 0.55 });
    }
  }

  // 작은 트리: 가벽마다 들어오는 쪽 끝에 하나씩 (길을 막지 않도록 가벽과 한 줄로)
  walls.filter((wall) => !wall.rot).forEach((wall, i) => deco.potTree(add, `작은 트리 ${i + 1}`, round(wall.x - wall.w / 2 - 0.28), wall.z, F));

  deco.table(add, table, F);
  if (named('커피 수납장')) deco.counter(add, named('커피 수납장'));
  [-1.9, 1.9].forEach((z, i) => deco.candyPole(add, `지팡이 사탕 기둥 ${i + 1}`, round(-L / 2 + 0.15), z, F));
  deco.snowman(add, round(-L / 2 + 0.9), round(-W / 2 + 1.2), F, [-1, 0]); // 들어오는 사람을 바라본다
  const title = named('서문 가벽');
  if (title) deco.gifts(add, title.x + 0.35, title.z + title.w / 2 + 0.45, F);
}

const EMPTY_PANEL = '#fff8e7', FILLED_PANEL = '#f6f5f1'; // 빈 전시판 색, 자료를 넣은 전시판 색(= 벽 색)

// "전시 자료 배치": 전시판 자리(slot)마다 해당 글과 그림을 입힌다. 이미 다 들어가 있으면 다시 뺀다.
// 전시판 자리가 하나도 없으면 전시 공간부터 만든다. 옮기거나 크기를 바꾼 전시판은 그대로 둔다.
function toggleExhibits() {
  let built = false;
  if (!state.objects.some((o) => o.slot)) {
    // 빈 화면이면 전시 공간부터 만든다. 다른 장면이면 바꾸지 않고 알리기만 한다.
    if (state.objects.length) return notice('전시판 자리가 없습니다. 먼저 "전시 공간"이나 "복도공간 전시회"를 눌러 주세요. 지금 공간은 그대로 두었습니다.');
    gallerySpace();
    built = true;
  }
  const kinds = [...new Set(state.objects.filter((o) => o.slot).map((o) => posterKind(o.slot)))];
  Promise.all(kinds.map(loadPosters)).then(() => {
    const slots = state.objects.filter((o) => o.slot && (window.POSTERS || {})[o.slot]);
    if (!slots.length) return;
    const remove = !built && slots.every((o) => o.image);
    for (const o of slots) {
      if (remove) delete o.image; else o.image = `poster:${o.slot}`;
      if (!o.decal) o.color = remove ? EMPTY_PANEL : FILLED_PANEL; // 벽 글씨는 가벽 색을 그대로 둔다
    }
    syncScene();
    commit();
    notice(remove
      ? `전시 자료 ${slots.length}장을 뺐습니다. 다시 누르면 배치됩니다.`
      : `전시 자료 ${slots.length}장을 벽면에 배치했습니다. 다시 누르면 빠집니다.`);
  }, () => {}); // 실패 알림은 loadPosters 가 띄운다
}

// 전시 공간: 10 × 8 m 지하 방으로 가정(일반 교실 9 × 7.5 m 보다 조금 큼). 입구 쪽(앞쪽) 벽은 유리라
// 전시에 쓰지 않는다. 벽면 하나에 전시관 하나, 그 안에서 한 구획에 연구회 하나:
//   제1관 왼쪽 벽 → 제2관 가벽 앞면 → 제3관 가벽 뒷면 → 제4관 뒤쪽 벽 → 제5관 오른쪽 벽(이야기 자리로 이어짐)
// 각 벽면은 관 소개 1장으로 시작한다. 가벽 앞쪽에 상자 트리 2그루, 유리벽 앞에 이동식 화면 3대.
// 전시판은 처음엔 빈 자리(slot 만 있음)이고, "전시 자료 배치" 단추가 글과 그림을 입힌다.
// 방 크기가 정해지면 아래 W(가로), D(세로)만 바꾸면 나머지가 따라서 배치된다.
function gallerySpace() {
  const { W, D, H, T, F } = GALLERY;
  const WHITE = '#f6f5f1'; // 전시판 바탕색과 같은 벽 색
  state.objects = [];
  const add = (type, name, props) => addObject(type, { name, ...props });

  const doorX = galleryShell(add, WHITE);

  // 가운데 가벽: 양 끝에 지나다닐 틈을 1.3 m 씩 두고, 뒤쪽 벽과의 사이는 3.2 m 통로.
  const midLen = W - 2.6, midT = 0.12, midZ = round(-D / 2 + 3.2);
  add('wall', '가운데 가벽', { w: midLen, d: midT, h: 2.2, z: midZ, color: WHITE });

  // 전시판 자리: 세로 A판 비율(1.2 × 1.7 m). 자료를 배치하면 벽과 같은 색이 되어 벽에 바로 새긴 것처럼 보인다.
  const panel = { w: 1.2, h: 1.7, d: 0.012, y: 0.4, color: EMPTY_PANEL };
  const off = T / 2 + 0.007, midOff = midT / 2 + 0.007; // 벽면에 붙이는 거리
  let room = 1;
  // 벽면 하나를 (관 소개 + 연구회 수)칸으로 똑같이 나눠, i 번째 칸 가운데의 위치를 at(i)로 받는다.
  const hang = (zone, slotAt, rot = 0) => {
    const z = ZONES[zone];
    const place = (name, slot, i) => { const [x, zz] = slotAt(i, z.rooms.length + 1); add('box', name, { ...panel, x: round(x), z: round(zz), rot, slot }); };
    place(z.title, `zone${zone + 1}`, 0);
    z.rooms.forEach((name, i) => place(name, `room${String(room++).padStart(2, '0')}`, i + 1));
  };
  const rightLen = D - 1.6; // 오른쪽 벽 앞쪽 1.6 m 는 커피 코너 자리
  hang(0, (i, n) => [-W / 2 + off, D / 2 - (D / n) * (i + 0.5)], 90);                 // 제1관 왼쪽 벽: 입구 쪽 → 안쪽
  hang(1, (i, n) => [-midLen / 2 + (midLen / n) * (i + 0.5), midZ + midOff]);          // 제2관 가벽 앞면: 왼쪽 → 오른쪽
  hang(2, (i, n) => [midLen / 2 - (midLen / n) * (i + 0.5), midZ - midOff]);           // 제3관 가벽 뒷면: 오른쪽 → 왼쪽
  hang(3, (i, n) => [-W / 2 + (W / n) * (i + 0.5), -D / 2 + off]);                     // 제4관 뒤쪽 벽: 왼쪽 → 오른쪽
  hang(4, (i, n) => [W / 2 - off, -D / 2 + (rightLen / n) * (i + 0.5)], 90);           // 제5관 오른쪽 벽: 안쪽 → 앞쪽

  // 전시 서문: 입구로 들어오면 바로 보이는 세움판
  add('box', '전시 서문', { w: 1.2, h: 1.7, d: 0.04, x: round(doorX + 1.15), z: round(D / 2 - 1.7), y: F, rot: -25, color: EMPTY_PANEL, slot: 'main' });

  const treeZ = round(midZ + 2.1);
  boxTree(add, '트리 1', round(-W * 0.14), treeZ, F);
  boxTree(add, '트리 2', round(W * 0.06), treeZ, F);

  // 입구 옆 유리벽 앞에 이동식 화면 3대, 방 안쪽을 바라본다.
  for (let i = 0; i < 3; i++) addScreen(add, i + 1, round(doorX + 2.6 + i * 1.1), round(D / 2 - 0.8), F);
  // 안쪽 이야기 자리, 그리고 오른쪽 벽의 연구회 구획이 끝난 뒤 유리벽 쪽 구석에 커피 코너
  addLounge(add, round(W / 2 - 2.3), round(D / 2 - 1.9), F);
  addCoffee(add, round(W / 2 - T / 2 - 0.3), round(D / 2 - 1.1), 90, F, WHITE);

  state.selectedId = null;
  syncScene();
  commit();
  setView('3d');
}

// 복도공간 전시회: 폭 8 m, 길이 36 m(가정)의 다리 같은 복도. 벽이 없고 양옆은 난간이며 바닥은 마루다.
// 전시는 모두 복도 방향으로 길게 놓은 가벽에 한다. 가벽은 뒤쪽 줄(제1·3·5관)과 앞쪽 줄(제2·4관)에
// 서로 엇갈리게 놓아, 복도 방향으로는 세 갈래 길(양옆 2.4 m, 가운데 3.2 m)이 끝까지 뚫려 있고
// 가벽 사이 틈으로 가로질러 다닐 수 있다. 연구회 자료는 판을 붙이지 않고 가벽에 직접 쓴 글처럼 넣는다.
function hallSpace() {
  const { L, W, F } = HALL;
  const GREEN = '#1f5a3a', RED = '#8f2a25', CREAM = '#f3ead9';
  state.objects = [];
  const add = (type, name, props) => addObject(type, { name, ...props });

  hallShell(add);

  // 벽 글씨: 가로 2.3 × 세로 1.3 m, 한 구획 2.5 m. 상자는 보이지 않고 글과 그림만 가벽 위에 보인다.
  const SECTION = 2.5, WALL_T = 0.12, lift = WALL_T / 2 + 0.004;
  const letter = (name, slot, props) => add('box', name, { w: 2.3, h: 1.303, d: 0.004, y: 0.6, slot, image: `poster:${slot}`, decal: true, ...props });

  // 들머리의 서문 가벽: 복도를 가로질러 서 있고(양옆으로 2.6 m 씩 열림), 들어오는 쪽 면에 서문
  const titleX = round(-L / 2 + 2.5);
  add('wall', '서문 가벽', { w: 2.7, d: WALL_T, h: 2.2, x: titleX, rot: 90, color: CREAM });
  letter('전시 서문', 'hall-main', { x: round(titleX - lift), rot: 90, color: CREAM });

  // 전시관 가벽 다섯: [가운데 x, 줄(-1 뒤 / +1 앞), 한 면의 구획 수]
  const rows = [[-9.75, -1, 3], [-4.5, 1, 3], [0.75, -1, 3], [6, 1, 3], [10, -1, 2]];
  let room = 1;
  ZONES.forEach((zone, i) => {
    const [cx, row, n] = rows[i], z0 = row * 1.6, len = n * SECTION, color = i % 2 ? RED : GREEN;
    add('wall', `제${i + 1}관 가벽`, { w: len, d: WALL_T, h: 2.2, x: cx, z: z0, color });
    const items = [[zone.title, `hall-zone${i + 1}`], ...zone.rooms.map((name) => [name, `hall-room${String(room++).padStart(2, '0')}`])];
    const inner = items.slice(0, n), outer = items.slice(n); // 가운데 길 쪽 면, 난간 쪽 면
    // 어느 면에서든 보는 사람 기준 왼쪽 → 오른쪽으로 읽히게 놓는다.
    // +z 쪽 면은 x 가 커지는 쪽이 오른쪽이고, -z 쪽 면은 마주 보고 서므로 반대다.
    const hang = (list, sideZ) => list.forEach(([name, slot], k) => {
      letter(name, slot, { x: round(cx + sideZ * (k - (list.length - 1) / 2) * SECTION), z: round(z0 + sideZ * lift), color });
    });
    hang(inner, -row);
    hang(outer, row);
  });

  // 상자 트리 2그루: 앞쪽 줄의 빈 자리에
  [['트리 1', -11.5, 1.8], ['트리 2', 12, 1.9]].forEach(([name, x, z]) => boxTree(add, name, x, z, F));

  // 들머리 앞쪽 난간 앞에 이동식 화면 3대, 끝자락에 이야기 자리, 뒤쪽 난간 앞에 커피 코너
  for (let i = 0; i < 3; i++) addScreen(add, i + 1, round(-L / 2 + 0.9 + i * 1.1), round(W / 2 - 0.7), F);
  addLounge(add, round(L / 2 - 2.4), 0, F);
  addCoffee(add, round(L / 2 - 2.4), round(-W / 2 + 0.4), 0, F, CREAM);

  // 관람객: "걸어 보기"를 누르면 이 사람의 눈으로 들머리에서 걷기 시작한다
  add('person', '관람객', { x: round(-L / 2 + 0.8), z: 0.9, y: F, rot: 270 });

  decorateHall();
  state.selectedId = null;
  syncScene();
  commit();
  setView('3d');
}
