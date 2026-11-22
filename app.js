// 모듈(import)을 쓰지 않는 일반 스크립트다. 그래야 index.html 을 더블클릭해서
// (file:// 주소로) 열어도 동작한다. THREE 는 vendor/three.bundle.js 가 만든다.
(() => {
'use strict';
const { OrbitControls } = window.THREE;
const THREE = window.THREE;

// ───────────────────────── 기본 설정 ─────────────────────────
// 단위는 모두 미터. 물체의 y 는 "바닥에서 물체 밑면까지의 높이"다.
const TYPES = {
  wall:     { label: '벽',     w: 3,   h: 2.3,  d: 0.15, color: '#ece7de' },
  floor:    { label: '바닥',   w: 4,   h: 0.05, d: 4,    color: '#c9a77c' },
  box:      { label: '상자',   w: 1,   h: 1,    d: 1,    color: '#6c8ebf' },
  cylinder: { label: '원기둥', w: 0.6, h: 1,    d: 0.6,  color: '#82b366' },
  // 문·창문은 벽에 겹쳐 놓으면 그 자리의 벽이 뚫린다.
  door:     { label: '문',     w: 0.9, h: 2.1,  d: 0.16, color: '#8b5e3c' },
  window:   { label: '창문',   w: 1.2, h: 1.1,  d: 0.16, color: '#ffffff', y: 0.9 },
};
const isOpening = (o) => o.type === 'door' || o.type === 'window';
const SWATCHES = ['#ffffff', '#ece7de', '#9aa5b1', '#3e4c59', '#c9a77c', '#8b5e3c',
                  '#d64545', '#f0b429', '#82b366', '#3ebd93', '#6c8ebf', '#8662c7'];
const STORAGE_KEY = 'home3d-scene-v1';
const TRACKPAD_KEY = 'home3d-trackpad';
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';
const $ = (id) => document.getElementById(id);

const state = {
  objects: [],
  selectedId: null,
  mode: 'select',     // 'select' | 'wall'
  snap: 0.1,
  trackpad: IS_MAC,   // 두 손가락 쓸기로 화면을 돌리는 방식
};
let history = [];
let future = [];

// ───────────────────────── 3D 장면 ─────────────────────────
const canvas = $('canvas');
const view = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9eef4');

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);

scene.add(new THREE.HemisphereLight('#ffffff', '#b9c0c9', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 1.8);
sun.position.set(8, 16, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: '#dde2e8', roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.002;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, '#8a94a0', '#c3cad3'); // 한 칸 = 1 m
grid.position.y = 0.001;
scene.add(grid);

const GEOMETRY = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
};
const geometryFor = (type) => (type === 'cylinder' ? GEOMETRY.cylinder : GEOMETRY.box);

const meshes = new Map(); // id → Mesh

// 선택 표시용 테두리
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(GEOMETRY.box),
  new THREE.LineBasicMaterial({ color: '#2563eb', depthTest: false }),
);
outline.renderOrder = 10;
outline.visible = false;
scene.add(outline);

// 벽 그리기 미리보기
const preview = new THREE.Mesh(
  GEOMETRY.box,
  new THREE.MeshBasicMaterial({ color: '#2563eb', transparent: true, opacity: 0.45, depthWrite: false }),
);
preview.visible = false;
scene.add(preview);
const startMarker = new THREE.Mesh(
  new THREE.CylinderGeometry(0.08, 0.08, 0.04, 24),
  new THREE.MeshBasicMaterial({ color: '#2563eb' }),
);
startMarker.visible = false;
scene.add(startMarker);

// ───────────────────────── 물체 ↔ 메쉬 ─────────────────────────
const rad = THREE.MathUtils.degToRad;

function setMaterial(mat, color, opacity) {
  mat.color.set(color);
  mat.transparent = opacity < 1;
  mat.opacity = opacity;
  mat.depthWrite = opacity >= 1;
}

function createNode(o) {
  let node;
  if (isOpening(o)) {
    // 문: 문짝 + 손잡이, 창문: 틀 4개 + 가운데 살 + 유리
    node = new THREE.Group();
    for (let i = 0; i < (o.type === 'door' ? 2 : 6); i++) {
      const part = new THREE.Mesh(GEOMETRY.box, new THREE.MeshStandardMaterial({ roughness: 0.7 }));
      part.castShadow = part.receiveShadow = true;
      node.add(part);
    }
    // 얇은 문·창문도 쉽게 집히도록, 전체 크기만큼의 보이지 않는 손잡이 상자를 둔다.
    const grip = new THREE.Mesh(GEOMETRY.box, new THREE.MeshBasicMaterial());
    grip.visible = false;
    grip.userData.grip = true;
    node.add(grip);
  } else {
    node = new THREE.Mesh(geometryFor(o.type), new THREE.MeshStandardMaterial({ roughness: 0.85 }));
    node.castShadow = node.receiveShadow = true;
  }
  node.userData.id = o.id;
  scene.add(node);
  meshes.set(o.id, node);
  return node;
}

function setPart(part, x, y, z, sx, sy, sz, color, opacity) {
  part.position.set(x, y, z);
  part.scale.set(Math.max(sx, 0.001), Math.max(sy, 0.001), Math.max(sz, 0.001));
  setMaterial(part.material, color, opacity);
  part.castShadow = opacity >= 0.5;
}

function applyDoor(node, o) {
  const [leaf, handle] = node.children;
  setPart(leaf, 0, 0, 0, o.w, o.h, 0.045, o.color, o.opacity);
  const handleY = Math.min(1, o.h / 2) - o.h / 2;
  setPart(handle, Math.max(0, o.w / 2 - 0.1), handleY, 0, 0.04, 0.04, 0.17, '#3e4c59', o.opacity);
}

function applyWindow(node, o) {
  const [top, bottom, left, right, bar, glass] = node.children;
  const f = Math.min(0.05, o.w / 4, o.h / 4); // 틀 굵기
  const innerW = o.w - 2 * f, innerH = o.h - 2 * f;
  setPart(top, 0, o.h / 2 - f / 2, 0, o.w, f, 0.08, o.color, o.opacity);
  setPart(bottom, 0, -o.h / 2 + f / 2, 0, o.w, f, 0.08, o.color, o.opacity);
  setPart(left, -o.w / 2 + f / 2, 0, 0, f, innerH, 0.08, o.color, o.opacity);
  setPart(right, o.w / 2 - f / 2, 0, 0, f, innerH, 0.08, o.color, o.opacity);
  setPart(bar, 0, 0, 0, 0.04, innerH, 0.06, o.color, o.opacity);
  bar.visible = o.w >= 1;
  setPart(glass, 0, 0, 0, innerW, innerH, 0.012, '#a9d3e8', Math.min(0.35, o.opacity));
  glass.castShadow = false;
}

// 벽은 실제 크기로 만든 도형을 쓰고(구멍 때문에), 나머지는 한 변 1짜리 도형을 늘려서 쓴다.
function applyNode(o) {
  const node = meshes.get(o.id) || createNode(o);
  node.position.set(o.x, o.y + o.h / 2, o.z);
  node.rotation.y = rad(o.rot);
  if (isOpening(o)) {
    (o.type === 'door' ? applyDoor : applyWindow)(node, o);
    node.children[node.children.length - 1].scale.set(o.w, o.h, o.d);
  } else {
    if (o.type !== 'wall') node.scale.set(o.w, o.h, o.d);
    setMaterial(node.material, o.color, o.opacity);
    node.castShadow = o.opacity >= 0.5;
  }
}

function applyToMesh(o) {
  applyNode(o);
  updateWalls();
}

// ───────────────────────── 벽에 난 구멍 ─────────────────────────
// 벽 안에 들어와 있는(벽과 나란하고 벽 두께 안에 놓인) 문·창문을 벽 기준 좌표로 돌려준다.
// lx: 벽 길이 방향 위치(벽 가운데가 0), lz: 벽 두께 방향으로 벗어난 정도
function wallLocal(wall, x, z) {
  const t = rad(wall.rot), c = Math.cos(t), s = Math.sin(t);
  const dx = x - wall.x, dz = z - wall.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

function wallWorld(wall, lx, lz = 0) {
  const t = rad(wall.rot), c = Math.cos(t), s = Math.sin(t);
  return { x: round(wall.x + lx * c + lz * s), z: round(wall.z - lx * s + lz * c) };
}

function openingsIn(wall) {
  const found = [];
  for (const o of state.objects) {
    if (!isOpening(o)) continue;
    const turn = (((o.rot - wall.rot) % 180) + 180) % 180;
    if (turn > 1 && turn < 179) continue;
    const { lx, lz } = wallLocal(wall, o.x, o.z);
    if (Math.abs(lz) > wall.d / 2 + 0.05) continue;
    if (Math.abs(lx) >= wall.w / 2 + o.w / 2) continue;
    found.push({ o, lx, lz });
  }
  return found;
}

// 구멍들을 피해 벽을 칸칸이 나눠 만든다. 좌표는 벽 가운데가 원점.
function buildWallGeometry(w, h, d, holes) {
  const cuts = (lo, hi, values) => [...new Set([lo, hi, ...values.filter((v) => v > lo && v < hi)])].sort((a, b) => a - b);
  const xs = cuts(-w / 2, w / 2, holes.flatMap((r) => [r.x0, r.x1]));
  const ys = cuts(-h / 2, h / 2, holes.flatMap((r) => [r.y0, r.y1]));
  const solid = (i, j) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    return !holes.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
  };
  const pos = [], nor = [];
  const quad = (a, b, c, e, n) => { // 바깥에서 봤을 때 반시계 방향
    for (const p of [a, b, c, a, c, e]) { pos.push(...p); nor.push(...n); }
  };
  const z0 = -d / 2, z1 = d / 2;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      if (!solid(i, j)) continue;
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
      if (!solid(i + 1, j)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
      if (!solid(i - 1, j)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
      if (!solid(i, j + 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
      if (!solid(i, j - 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

function updateWalls() {
  for (const wall of state.objects) {
    if (wall.type !== 'wall') continue;
    const node = meshes.get(wall.id);
    if (!node) continue;
    const holes = openingsIn(wall).map(({ o, lx }) => ({
      x0: round(lx - o.w / 2), x1: round(lx + o.w / 2),
      y0: round(o.y - wall.y - wall.h / 2), y1: round(o.y - wall.y - wall.h / 2 + o.h),
    }));
    const key = JSON.stringify([wall.w, wall.h, wall.d, holes]);
    if (node.userData.key === key) continue;
    if (node.userData.key) node.geometry.dispose();
    node.geometry = buildWallGeometry(wall.w, wall.h, wall.d, holes);
    node.userData.key = key;
  }
}

// 물체를 바꿀 때는 이 함수를 거친다. 벽을 옮기거나 돌리면 그 벽의 문·창문도 함께 따라간다.
function edit(o, change) {
  const carried = o.type === 'wall'
    ? openingsIn(o).map(({ o: p, lx, lz }) => ({ p, lx, lz, dy: p.y - o.y, turn: p.rot - o.rot }))
    : [];
  change();
  for (const { p, lx, lz, dy, turn } of carried) {
    Object.assign(p, wallWorld(o, lx, lz), { y: round(o.y + dy), rot: round(o.rot + turn) });
    applyNode(p);
  }
  applyToMesh(o);
}

function nearestWall(x, z, maxDist = Infinity) {
  let best = null;
  for (const wall of state.objects) {
    if (wall.type !== 'wall') continue;
    const { lx, lz } = wallLocal(wall, x, z);
    const along = THREE.MathUtils.clamp(lx, -wall.w / 2, wall.w / 2);
    const dist = Math.hypot(lx - along, lz);
    if (dist <= maxDist && (!best || dist < best.dist)) best = { wall, lx: along, dist };
  }
  return best;
}

// 문·창문을 (x, z) 근처의 벽에 붙인다. 가까운 벽이 없으면 그 자리에 그냥 둔다.
function snapToWall(o, x, z) {
  const near = nearestWall(x, z, 0.6);
  if (!near) { o.x = snap(x); o.z = snap(z); return; }
  const { wall } = near;
  const room = Math.max(0, wall.w / 2 - o.w / 2);
  const lx = THREE.MathUtils.clamp(snap(near.lx), -room, room);
  Object.assign(o, wallWorld(wall, lx), { rot: wall.rot });
  if (o.type === 'door') o.y = wall.y;
}

function removeNode(id) {
  const node = meshes.get(id);
  scene.remove(node);
  node.traverse((n) => n.material && n.material.dispose());
  if (node.userData.key) node.geometry.dispose();
  meshes.delete(id);
}

function syncScene() {
  const ids = new Set(state.objects.map((o) => o.id));
  for (const id of [...meshes.keys()]) if (!ids.has(id)) removeNode(id);
  state.objects.forEach(applyNode);
  updateWalls();
  if (!ids.has(state.selectedId)) state.selectedId = null;
}

const selected = () => state.objects.find((o) => o.id === state.selectedId) || null;
const newId = () => Math.random().toString(36).slice(2, 10);
const round = (v) => Math.round(v * 1000) / 1000;
const snap = (v) => (state.snap > 0 ? round(Math.round(v / state.snap) * state.snap) : round(v));

function nextName(type) {
  const label = TYPES[type].label;
  const used = new Set(state.objects.map((o) => o.name));
  for (let n = 1; ; n++) if (!used.has(`${label} ${n}`)) return `${label} ${n}`;
}

function addObject(type, props = {}) {
  const t = TYPES[type];
  const o = {
    id: newId(), type, name: nextName(type),
    x: 0, y: t.y || 0, z: 0, w: t.w, h: t.h, d: t.d, rot: 0, color: t.color, opacity: 1,
    ...props,
  };
  state.objects.push(o);
  return o;
}

// 불러온 데이터가 이상해도 화면이 깨지지 않도록 값을 정리한다.
function sanitize(list) {
  if (!Array.isArray(list)) throw new Error('물체 목록이 없습니다.');
  const num = (v, fallback, min = -Infinity) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, n) : fallback;
  };
  return list.filter((r) => r && typeof r === 'object').map((r) => {
    const type = TYPES[r.type] ? r.type : 'box';
    const t = TYPES[type];
    return {
      id: newId(), type,
      name: String(r.name ?? t.label).slice(0, 40),
      x: num(r.x, 0), y: num(r.y, t.y || 0), z: num(r.z, 0),
      w: num(r.w, t.w, 0.01), h: num(r.h, t.h, 0.01), d: num(r.d, t.d, 0.01),
      rot: num(r.rot, 0),
      color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : t.color,
      opacity: Math.min(1, num(r.opacity, 1, 0.1)),
      ...(typeof r.group === 'string' && r.group ? { group: r.group.slice(0, 40) } : {}),
    };
  });
}

// ───────────────────────── 저장 · 되돌리기 ─────────────────────────
const snapshot = () => JSON.stringify(state.objects);

// 변경이 한 덩어리 끝났을 때 부른다: 되돌리기 기록 + 자동 저장 + 화면 갱신.
function commit() {
  const now = snapshot();
  if (history[history.length - 1] !== now) {
    history.push(now);
    if (history.length > 100) history.shift();
    future = [];
  }
  try { localStorage.setItem(STORAGE_KEY, now); } catch { /* 저장소를 못 쓰는 환경 */ }
  refreshUI();
}

function restore(json) {
  const keepId = state.selectedId;
  state.objects = JSON.parse(json);
  state.selectedId = keepId;
  syncScene();
  try { localStorage.setItem(STORAGE_KEY, json); } catch { /* 무시 */ }
  refreshUI();
}

function undo() {
  if (history.length < 2) return;
  future.push(history.pop());
  restore(history[history.length - 1]);
}

function redo() {
  if (!future.length) return;
  const json = future.pop();
  history.push(json);
  restore(json);
}

// ───────────────────────── 화면(패널) 갱신 ─────────────────────────
const fields = {
  name: $('f-name'), w: $('f-w'), d: $('f-d'), h: $('f-h'),
  x: $('f-x'), z: $('f-z'), y: $('f-y'), rot: $('f-rot'),
  color: $('f-color'), opacity: $('f-opacity'),
};

function refreshForm() {
  const o = selected();
  $('form').hidden = !o;
  $('no-sel').hidden = !!o;
  if (!o) return;
  $('group-row').hidden = !o.group;
  if (o.group) $('group-label').textContent = `"${o.group}" 묶음 · 함께 움직입니다`;
  for (const [key, el] of Object.entries(fields)) {
    if (document.activeElement === el) continue; // 입력 중인 칸은 건드리지 않는다
    el.value = o[key];
  }
}

function refreshList() {
  const list = $('list');
  list.replaceChildren();
  for (const o of state.objects) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = o.id === state.selectedId ? 'on' : '';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = o.color;
    const name = document.createElement('span');
    name.textContent = o.name;
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = `${o.w} × ${o.d} × ${o.h}`;
    btn.append(dot, name, size);
    btn.addEventListener('click', () => select(o.id));
    li.append(btn);
    list.append(li);
  }
  $('count').textContent = state.objects.length ? `${state.objects.length}개` : '';
}

// 잠깐 보여 주는 알림. 몇 초 뒤 평소 안내로 돌아간다.
let noticeText = '';
let noticeTimer = 0;
function notice(text) {
  noticeText = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { noticeText = ''; refreshHint(); }, 5000);
  refreshHint();
}

function refreshHint() {
  let text;
  if (noticeText) {
    text = noticeText;
  } else if (state.mode === 'wall') {
    text = wallStart
      ? '벽이 끝날 곳을 누르세요. 이어서 계속 그릴 수 있고, Esc로 끝냅니다.'
      : '벽이 시작할 곳을 바닥에서 누르세요.';
  } else if (!state.objects.length) {
    text = '위쪽 "추가"나 "벽 그리기"로 시작해 보세요. 한 칸은 1 m입니다.';
  } else if (selected() && isOpening(selected())) {
    text = '문·창문을 끌어 벽 가까이 가져가면 벽에 붙고, 그 자리의 벽이 뚫립니다.';
  } else if (selected() && selected().group) {
    text = '묶음은 끌면 함께 움직입니다. 조각을 따로 다루려면 오른쪽에서 "묶음 풀기"를 누르세요.';
  } else if (selected()) {
    text = '선택한 물체를 끌면 옮겨집니다. 빈 곳을 끌면 화면이 돌아갑니다.';
  } else if (state.trackpad) {
    text = '두 손가락 쓸기: 화면 돌리기 · 두 손가락 벌리기/오므리기: 확대/축소 · Shift+쓸기: 화면 옮기기';
  } else {
    text = '끌기: 화면 돌리기 · 휠: 확대/축소 · 오른쪽 버튼(또는 Shift) 끌기: 화면 옮기기';
  }
  $('hint').textContent = text;
}

function refreshUI() {
  refreshForm();
  refreshList();
  refreshHint();
  $('undo').disabled = history.length < 2;
  $('redo').disabled = !future.length;
  $('tool-select').classList.toggle('on', state.mode === 'select');
  $('tool-wall').classList.toggle('on', state.mode === 'wall');
  view.classList.toggle('drawing', state.mode === 'wall');
}

function select(id) {
  state.selectedId = id;
  refreshUI();
}

function setMode(mode) {
  state.mode = mode;
  wallStart = null;
  preview.visible = false;
  startMarker.visible = false;
  if (mode === 'wall') state.selectedId = null;
  refreshUI();
}

// ───────────────────────── 편집 동작 ─────────────────────────
// 묶음: group 값이 같은 물체들. 끌기·방향키·복제·삭제가 묶음 전체에 적용된다.
const groupOf = (o) => (o.group ? state.objects.filter((p) => p.group === o.group) : [o]);

function newGroupName(group) {
  const base = group.replace(/\s*\d+$/, '');
  const used = new Set(state.objects.map((o) => o.group));
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

// 물체를 (dx, dz) 만큼 옮기고, 같은 묶음의 나머지도 똑같이 옮긴다.
function moveWithGroup(o, dx, dz) {
  for (const p of groupOf(o)) {
    if (p !== o) edit(p, () => { p.x = round(p.x + dx); p.z = round(p.z + dz); });
  }
}

function removeSelected() {
  const o = selected();
  if (!o) return;
  // 벽을 지우면 그 벽에 달린 문·창문도 함께 지운다.
  const gone = new Set();
  for (const p of groupOf(o)) {
    gone.add(p.id);
    if (p.type === 'wall') openingsIn(p).forEach((r) => gone.add(r.o.id));
  }
  state.objects = state.objects.filter((p) => !gone.has(p.id));
  syncScene();
  commit();
}

function duplicateSelected() {
  const o = selected();
  if (!o) return;
  const shift = (state.snap || 0.5) * 5;
  const group = o.group && newGroupName(o.group);
  const originals = new Set();
  for (const p of groupOf(o)) {
    originals.add(p);
    if (p.type === 'wall') openingsIn(p).forEach((r) => originals.add(r.o));
  }
  let copyOfSelected = null;
  for (const p of originals) {
    const copy = addObject(p.type, {
      ...p, id: newId(), name: nextName(p.type), x: round(p.x + shift), z: round(p.z + shift),
      ...(p.group ? { group } : {}),
    });
    if (p === o) copyOfSelected = copy;
  }
  syncScene();
  state.selectedId = copyOfSelected.id;
  commit();
}

function ungroupSelected() {
  const o = selected();
  if (!o || !o.group) return;
  for (const p of groupOf(o)) delete p.group;
  commit();
}

// 문·창문을 새로 놓는다: 선택한 벽(없으면 보고 있는 곳에서 가장 가까운 벽)의 빈자리에.
function addOpening(type) {
  const t = TYPES[type];
  const sel = selected();
  const wall = sel && sel.type === 'wall' ? sel : nearestWall(controls.target.x, controls.target.z)?.wall;
  if (!wall) return addObject(type, { x: snap(controls.target.x), z: snap(controls.target.z) });
  const taken = openingsIn(wall);
  const room = wall.w / 2 - t.w / 2;
  const free = (lx) => Math.abs(lx) <= room && taken.every((r) => Math.abs(r.lx - lx) >= (r.o.w + t.w) / 2 + 0.1);
  // 빈자리가 없으면 다른 문·창문에서 가장 먼 쪽 끝에 둔다.
  const gap = (x) => Math.min(...taken.map((r) => Math.abs(r.lx - x)));
  let lx = taken.length && room > 0 ? (gap(room) >= gap(-room) ? room : -room) : 0;
  for (let step = 0; step * 0.1 <= Math.max(room, 0); step++) {
    if (free(step * 0.1)) { lx = step * 0.1; break; }
    if (free(-step * 0.1)) { lx = -step * 0.1; break; }
  }
  return addObject(type, { ...wallWorld(wall, round(lx)), rot: wall.rot, y: round(wall.y + (t.y || 0)) });
}

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

// 전시 공간: 10 × 8 m 지하 방으로 가정(일반 교실 9 × 7.5 m 보다 조금 큼). 입구 쪽(앞쪽) 벽은 유리라
// 전시에 쓰지 않는다. 연구회 20곳은 벽면 한 구획에 하나씩: 왼쪽 벽 4 + 뒤쪽 벽 5 + 오른쪽 벽 3 +
// 가운데 긴 가벽 앞뒤 4씩. 번호는 입구에서 들어와 도는 순서. 가벽 앞쪽에 상자 트리 2그루,
// 유리벽 앞에 이동식 화면 3대, 안쪽(오른쪽)에 이야기 나누는 자리.
// 방 크기가 정해지면 아래 W(가로), D(세로)만 바꾸면 나머지가 따라서 배치된다.
function gallerySpace() {
  const W = 10, D = 8, H = 2.6, T = 0.15, F = 0.05; // 가로, 세로, 천장 높이, 벽 두께, 바닥 두께
  const WHITE = '#f5f2ea', WOOD = '#a9825a', DARK = '#2b2f36', GLASS = '#a9d3e8';
  state.objects = [];
  const add = (type, name, props) => addObject(type, { name, ...props });

  add('floor', '바닥', { w: W, d: D, color: '#cfcac2' });
  add('wall', '뒤쪽 벽', { w: W + T, z: -D / 2, h: H, color: WHITE });
  add('wall', '왼쪽 벽', { w: D + T, x: -W / 2, rot: 90, h: H, color: WHITE });
  // 오른쪽 벽은 실제로는 일반 벽이지만, 안이 들여다보이도록 반투명하게 그린다.
  add('wall', '오른쪽 벽', { w: D + T, x: W / 2, rot: 90, h: H, color: WHITE, opacity: 0.25 });
  add('wall', '앞쪽 유리벽', { w: W + T, z: D / 2, h: H, color: GLASS, opacity: 0.3 });
  const doorX = round(-W / 2 + 1.2);
  add('door', '입구', { w: 1.2, x: doorX, z: D / 2, color: GLASS, opacity: 0.5 });
  add('floor', '입구 레드카펫', { w: 1.4, d: 2.6, h: 0.01, x: doorX, z: D / 2 - 1.4, y: F, color: '#a8322d' });

  // 가운데 가벽: 양 끝에 지나다닐 틈을 1.4 m 씩 두고, 뒤쪽 벽과의 사이는 3.2 m 통로.
  const midLen = W - 2.8, midT = 0.12, midZ = round(-D / 2 + 3.2);
  add('wall', '가운데 가벽', { w: midLen, d: midT, h: 2.2, z: midZ, color: WHITE });

  // 연구회 구획: 벽면 한 구획(폭 약 2 m)에 연구회 하나. 구획마다 전시판(1.6 × 1.2 m) 자리를 둔다.
  const panel = { w: 1.6, h: 1.2, d: 0.02, y: 0.9, color: '#fff8e7' };
  const off = T / 2 + 0.011, midOff = midT / 2 + 0.011; // 벽면에서 살짝 띄우는 거리
  let n = 1;
  const spot = (x, z, rot = 0) => add('box', `연구회 ${n++}`, { ...panel, x: round(x), z: round(z), rot });
  const sideStep = D / 4, backStep = W / 5, midStep = midLen / 4;
  for (let i = 0; i < 4; i++) spot(-W / 2 + off, D / 2 - sideStep * (i + 0.5), 90);          // 왼쪽 벽: 입구 쪽 → 안쪽
  for (let i = 0; i < 5; i++) spot(-W / 2 + backStep * (i + 0.5), -D / 2 + off);             // 뒤쪽 벽: 왼쪽 → 오른쪽
  for (let i = 0; i < 3; i++) spot(W / 2 - off, -D / 2 + sideStep * (i + 0.5), 90);          // 오른쪽 벽: 안쪽 → 앞쪽
  for (let i = 0; i < 4; i++) spot(midLen / 2 - midStep * (i + 0.5), midZ - midOff);         // 가벽 뒷면: 오른쪽 → 왼쪽
  for (let i = 0; i < 4; i++) spot(-midLen / 2 + midStep * (i + 0.5), midZ + midOff);        // 가벽 앞면: 왼쪽 → 오른쪽

  // 상자 트리: 정육면체 4개를 점점 작게 쌓는다. 옆면 4 × 4단 = 16면에 포스터를 붙일 수 있다.
  const tree = (name, x, z) => {
    const sizes = [0.8, 0.65, 0.5, 0.35], greens = ['#1f6b3a', '#2a7d46', '#34904f', '#3fa35a'];
    let y = F;
    sizes.forEach((size, i) => {
      add('box', `${name} ${i + 1}단`, { w: size, h: size, d: size, x, z, y: round(y), rot: i % 2 ? 45 : 0, color: greens[i], group: name });
      y += size;
    });
    add('box', `${name} 별`, { w: 0.16, h: 0.16, d: 0.16, x, z, y: round(y), rot: 45, color: '#f0b429', group: name });
    add('box', `${name} 선물 1`, { w: 0.3, h: 0.25, d: 0.3, x: round(x - 0.75), z: round(z + 0.45), y: F, rot: 20, color: '#d64545' });
    add('box', `${name} 선물 2`, { w: 0.25, h: 0.2, d: 0.35, x: round(x + 0.7), z: round(z + 0.55), y: F, rot: -15, color: '#f0b429' });
  };
  const treeZ = round(midZ + 2.1);
  tree('트리 1', round(-W * 0.2), treeZ);
  tree('트리 2', round(W * 0.04), treeZ);

  // 입구 옆 유리벽 앞에 이동식 화면 3대(받침 + 기둥 + 화면), 방 안쪽을 바라본다.
  for (let i = 0; i < 3; i++) {
    const group = `이동식 화면 ${i + 1}`, x = round(doorX + 1.6 + i * 1.1), z = round(D / 2 - 0.8);
    add('cylinder', `${group} 받침`, { w: 0.42, d: 0.42, h: 0.03, x, z, y: F, color: '#e8e4dc', group });
    add('cylinder', `${group} 기둥`, { w: 0.04, d: 0.04, h: 1.05, x, z: round(z + 0.03), y: F + 0.03, color: '#e8e4dc', group });
    add('box', `${group} 화면`, { w: 0.62, h: 0.37, d: 0.03, x, z, y: 0.95, color: DARK, group });
  }

  // 안쪽 이야기 자리: 탁자 + 의자 6개, 벽 쪽에 커피 머신 놓는 수납장
  const tx = round(W / 2 - 2.3), tz = round(D / 2 - 1.9);
  add('box', '탁자', { w: 1.8, d: 0.9, h: 0.72, x: tx, z: tz, y: F, color: WOOD, group: '이야기 자리' });
  let chair = 1;
  for (const dz of [-0.8, 0.8]) {
    for (const dx of [-0.6, 0, 0.6]) {
      add('cylinder', `의자 ${chair++}`, { w: 0.38, d: 0.38, h: 0.45, x: round(tx + dx), z: round(tz + dz), y: F, color: '#a8322d', group: '이야기 자리' });
    }
  }
  const cx = round(W / 2 - T / 2 - 0.3);
  const cz = round(D / 2 - 1.1); // 오른쪽 벽의 연구회 구획이 끝난 뒤, 유리벽 쪽 구석
  add('box', '커피 수납장', { w: 1.4, d: 0.55, h: 0.9, x: cx, z: cz, y: F, rot: 90, color: WHITE, group: '커피 코너' });
  add('box', '커피 머신', { w: 0.4, d: 0.3, h: 0.42, x: cx, z: round(cz - 0.3), y: F + 0.9, rot: 90, color: DARK, group: '커피 코너' });

  state.selectedId = null;
  syncScene();
  commit();
  setView('3d');
}

// ───────────────────────── 카메라 ─────────────────────────
// 내 포인터 처리가 OrbitControls 보다 먼저 돌도록 캡처 단계로 등록한다(아래 pointerdown).
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 0.5;
controls.maxDistance = 120;

function sceneBounds() {
  const box = new THREE.Box3();
  meshes.forEach((m) => box.expandByObject(m));
  if (box.isEmpty()) box.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 2, 3));
  return box;
}

function setView(kind) {
  const box = sceneBounds();
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 2);
  controls.target.set(center.x, 0, center.z);
  if (kind === 'top') {
    camera.position.set(center.x, radius * 2.4, center.z + 0.01);
  } else {
    camera.position.set(center.x + radius * 1.1, radius * 1.2, center.z + radius * 1.5);
  }
  controls.update();
}

// ───────────────────────── 트랙패드 ─────────────────────────
// 맥북 트랙패드: 두 손가락 쓸기 = 돌리기, 벌리기/오므리기 = 확대/축소, Shift+쓸기 = 옮기기.
// (마우스 휠을 쓰는 경우엔 "트랙패드" 체크를 끄면 휠이 확대/축소가 된다.)
const orbit = new THREE.Spherical();
const offset = new THREE.Vector3();

function zoomBy(factor) {
  offset.copy(camera.position).sub(controls.target);
  const len = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(offset.setLength(len));
}

function orbitBy(dx, dy) {
  offset.copy(camera.position).sub(controls.target);
  orbit.setFromVector3(offset);
  orbit.theta += dx * 0.005;
  orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy * 0.005, 0.01, controls.maxPolarAngle);
  camera.position.copy(controls.target).add(offset.setFromSpherical(orbit));
  camera.lookAt(controls.target);
}

function panBy(dx, dy) {
  const scale = camera.position.distanceTo(controls.target) * 0.0015;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const back = new THREE.Vector3(-right.z, 0, right.x); // 화면 아래쪽(내 쪽) 방향
  const move = right.multiplyScalar(dx * scale).add(back.multiplyScalar(dy * scale));
  camera.position.add(move);
  controls.target.add(move);
}

canvas.addEventListener('wheel', (e) => {
  if (!state.trackpad) return; // 마우스 방식: OrbitControls 가 휠로 확대/축소
  e.preventDefault();
  e.stopPropagation();
  if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(e.deltaY * 0.01)); // 크롬·파이어폭스의 손가락 벌리기
  else if (e.shiftKey) panBy(e.deltaX, e.deltaY);
  else orbitBy(e.deltaX, e.deltaY);
}, { capture: true, passive: false });

// 사파리는 손가락 벌리기를 gesture 이벤트로 알려 준다.
let gestureScale = 1;
canvas.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureScale = e.scale; });
canvas.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  zoomBy(gestureScale / e.scale);
  gestureScale = e.scale;
});
canvas.addEventListener('gestureend', (e) => e.preventDefault());

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

// ───────────────────────── 포인터 입력 ─────────────────────────
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane();
const hitPoint = new THREE.Vector3();

let press = null;      // { x, y, moved, drag: { offsetX, offsetZ } | null }
let wallStart = null;  // 벽 그리기 시작점 { x, z }

function setRay(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

// 맞은 물체의 id 와 맞은 점. 문·창문은 여러 조각이라 부모를 따라 올라가 id 를 찾는다.
function pickObject(e) {
  setRay(e);
  const hits = raycaster.intersectObjects([...meshes.values()], true)
    .filter((h) => h.object.visible || h.object.userData.grip)
    .map((h) => {
      let node = h.object;
      while (node && !node.userData.id) node = node.parent;
      return { id: node.userData.id, point: h.point };
    });
  const first = hits[0];
  if (!first) return null;
  // 위에서 보면 문·창문이 벽 윗부분에 가려진다. 벽을 눌렀더라도 그 자리에
  // 그 벽의 문·창문이 있으면 문·창문을 고른다.
  const wall = state.objects.find((o) => o.id === first.id && o.type === 'wall');
  if (wall) {
    const hosted = new Set(openingsIn(wall).map((r) => r.o.id));
    return hits.find((h) => hosted.has(h.id)) || first;
  }
  return first;
}

// 높이 y 인 수평면과 만나는 점
function pointOnLevel(e, y = 0) {
  setRay(e);
  plane.set(new THREE.Vector3(0, 1, 0), -y);
  return raycaster.ray.intersectPlane(plane, hitPoint) ? hitPoint.clone() : null;
}

function updateWallPreview(e) {
  if (!wallStart) return;
  const p = pointOnLevel(e);
  if (!p) return;
  const wall = wallBetween(wallStart, { x: snap(p.x), z: snap(p.z) });
  preview.visible = !!wall;
  if (!wall) return;
  preview.scale.set(wall.w, wall.h, wall.d);
  preview.position.set(wall.x, wall.h / 2, wall.z);
  preview.rotation.y = THREE.MathUtils.degToRad(wall.rot);
}

function wallBetween(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;
  const t = TYPES.wall;
  return {
    x: round((a.x + b.x) / 2), z: round((a.z + b.z) / 2),
    w: round(len + t.d),               // 모서리가 맞물리도록 두께만큼 더 길게
    h: t.h, d: t.d,
    rot: round(THREE.MathUtils.radToDeg(Math.atan2(-dz, dx))),
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary || e.button !== 0) return;
  press = { x: e.clientX, y: e.clientY, moved: false, drag: null };
  if (state.mode !== 'select') return;
  // 이미 선택된 물체 위에서 누르면 끌어서 옮기기, 아니면 화면 돌리기
  const hit = pickObject(e);
  const o = selected();
  if (hit && o && hit.id === o.id) {
    press.drag = { level: hit.point.y, offsetX: o.x - hit.point.x, offsetZ: o.z - hit.point.z };
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
  }
}, { capture: true });

canvas.addEventListener('pointermove', (e) => {
  if (state.mode === 'wall') updateWallPreview(e);
  if (!press || !e.isPrimary) return;
  if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
  press.moved = true;
  const o = selected();
  if (!press.drag || !o) return;
  const p = pointOnLevel(e, press.drag.level);
  if (!p) return;
  const x = p.x + press.drag.offsetX, z = p.z + press.drag.offsetZ;
  const fromX = o.x, fromZ = o.z;
  edit(o, () => {
    if (isOpening(o)) snapToWall(o, x, z);
    else { o.x = snap(x); o.z = snap(z); }
  });
  moveWithGroup(o, o.x - fromX, o.z - fromZ);
  refreshForm();
});

function endPress(e) {
  if (!press || !e.isPrimary) return;
  const { moved, drag } = press;
  press = null;
  controls.enabled = true;
  if (drag) {
    if (moved) commit();
    return;
  }
  if (moved || e.type === 'pointercancel') return; // 화면을 돌린 것

  if (state.mode === 'wall') {
    const p = pointOnLevel(e);
    if (!p) return;
    const point = { x: snap(p.x), z: snap(p.z) };
    if (wallStart) {
      const wall = wallBetween(wallStart, point);
      if (!wall) return;
      applyToMesh(addObject('wall', wall));
      commit();
    }
    wallStart = point;
    startMarker.position.set(point.x, 0.02, point.z);
    startMarker.visible = true;
    preview.visible = false;
    refreshHint();
  } else {
    const hit = pickObject(e);
    select(hit ? hit.id : null);
  }
}
canvas.addEventListener('pointerup', endPress);
canvas.addEventListener('pointercancel', endPress);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ───────────────────────── 패널 입력 ─────────────────────────
const NUMERIC = { w: 0.01, d: 0.01, h: 0.01, x: null, z: null, y: null, rot: null, opacity: 0.1 };

for (const [key, el] of Object.entries(fields)) {
  el.addEventListener('input', () => {
    const o = selected();
    if (!o) return;
    let value = el.value;
    if (key in NUMERIC) {
      const v = parseFloat(el.value);
      if (!Number.isFinite(v)) return;
      const min = NUMERIC[key];
      value = round(min === null ? v : Math.max(min, v));
    }
    edit(o, () => { o[key] = value; });
    refreshList();
  });
  el.addEventListener('change', commit);
}
$('form').addEventListener('submit', (e) => e.preventDefault());

for (const color of SWATCHES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.background = color;
  b.title = color;
  b.setAttribute('aria-label', `색 ${color}`);
  b.addEventListener('click', () => {
    const o = selected();
    if (!o) return;
    o.color = color;
    applyToMesh(o);
    commit();
  });
  $('swatches').append(b);
}

$('rot90').addEventListener('click', () => {
  const o = selected();
  if (!o) return;
  edit(o, () => { o.rot = round((o.rot + 90) % 360); });
  commit();
});
$('dup').addEventListener('click', duplicateSelected);
$('del').addEventListener('click', removeSelected);
$('ungroup').addEventListener('click', ungroupSelected);

// ───────────────────────── 위쪽 도구 모음 ─────────────────────────
$('tool-select').addEventListener('click', () => setMode('select'));
$('tool-wall').addEventListener('click', () => setMode(state.mode === 'wall' ? 'select' : 'wall'));

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    // 지금 보고 있는 곳 한가운데에 놓는다
    const type = btn.dataset.add;
    const o = isOpening({ type })
      ? addOpening(type)
      : addObject(type, { x: snap(controls.target.x), z: snap(controls.target.z) });
    applyToMesh(o);
    state.mode = 'select';
    wallStart = null;
    preview.visible = startMarker.visible = false;
    state.selectedId = o.id;
    commit();
  });
});

$('view-3d').addEventListener('click', () => setView('3d'));
$('view-top').addEventListener('click', () => setView('top'));
$('snap').addEventListener('change', (e) => { state.snap = parseFloat(e.target.value) || 0; });
$('trackpad').addEventListener('change', (e) => {
  state.trackpad = e.target.checked;
  try { localStorage.setItem(TRACKPAD_KEY, state.trackpad ? '1' : '0'); } catch { /* 무시 */ }
  refreshHint();
});
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
const PRESETS = { sample: sampleRoom, gallery: gallerySpace };
for (const [id, build] of Object.entries(PRESETS)) {
  $(id).addEventListener('click', () => {
    const label = $(id).textContent;
    // 확인창(confirm)은 쓰지 않는다: 다른 페이지 안에 끼워 넣은 화면이나 일부 브라우저에서는
    // 확인창이 막혀 단추가 아무 반응이 없게 된다. 대신 되돌리기로 복구할 수 있다.
    const hadObjects = state.objects.length > 0;
    build();
    notice(hadObjects ? `"${label}"(으)로 바꿨습니다. 이전 공간은 "되돌리기"로 복구할 수 있습니다.` : `"${label}"을(를) 불러왔습니다.`);
  });
}
$('clear').addEventListener('click', () => {
  if (!state.objects.length) return;
  state.objects = [];
  syncScene();
  commit();
  notice('모두 지웠습니다. "되돌리기"로 복구할 수 있습니다.');
});

$('export').addEventListener('click', () => {
  const data = { app: 'home3d', version: 1, objects: state.objects.map(({ id, ...rest }) => rest) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '공간.json';
  a.click();
  URL.revokeObjectURL(url);
});
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    state.objects = sanitize(Array.isArray(data) ? data : data.objects);
    state.selectedId = null;
    syncScene();
    commit();
    setView('3d');
  } catch (err) {
    alert(`파일을 불러오지 못했습니다: ${err.message}`);
  }
});

// ───────────────────────── 키보드 ─────────────────────────
window.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (key === 'escape') {
    if (typing) document.activeElement.blur();
    else if (state.mode === 'wall') setMode('select');
    else select(null);
    return;
  }
  if (typing) return;

  if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && key === 'y') { e.preventDefault(); redo(); return; }
  if (mod && key === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (mod) return;
  if (key === 'delete' || key === 'backspace') { e.preventDefault(); removeSelected(); return; }
  if (key === 'w') { setMode(state.mode === 'wall' ? 'select' : 'wall'); return; }

  const move = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
  const o = selected();
  if (move && o) {
    e.preventDefault();
    const step = state.snap || 0.1;
    edit(o, () => {
      o.x = round(o.x + move[0] * step);
      o.z = round(o.z + move[1] * step);
    });
    moveWithGroup(o, move[0] * step, move[1] * step);
    commit();
  }
});

// ───────────────────────── 시작 ─────────────────────────
try {
  const pad = localStorage.getItem(TRACKPAD_KEY);
  if (pad !== null) state.trackpad = pad === '1';
} catch { /* 무시 */ }
$('trackpad').checked = state.trackpad;

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) state.objects = sanitize(JSON.parse(saved));
} catch { /* 저장된 내용이 깨졌으면 빈 공간으로 시작 */ }

// 단축키 안내는 맥에서는 ⌘, 그 밖에는 Ctrl 로 보여 준다.
$('undo').title = `되돌리기 (${MOD}Z)`;
$('redo').title = `다시 실행 (${IS_MAC ? '⇧⌘Z' : 'Ctrl+Y'})`;
$('dup').title = `복제 (${MOD}D)`;
$('del').title = `삭제 (${IS_MAC ? '⌫' : 'Delete'})`;

syncScene();
resize();
setView('3d');
commit();

renderer.setAnimationLoop(() => {
  const o = selected();
  outline.visible = !!o;
  if (o) {
    outline.position.set(o.x, o.y + o.h / 2, o.z);
    outline.rotation.y = rad(o.rot);
    outline.scale.set(o.w + 0.01, o.h + 0.01, o.d + 0.01);
  }
  controls.update();
  renderer.render(scene, camera);
});

// 자동 점검(테스트)에서 장면을 들여다볼 수 있게 열어 둔다.
window.__home3d = { state, camera, meshes, controls, buildWallGeometry };
})();
