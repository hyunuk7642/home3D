import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

// ───────────────────────── 기본 설정 ─────────────────────────
// 단위는 모두 미터. 물체의 y 는 "바닥에서 물체 밑면까지의 높이"다.
const TYPES = {
  wall:     { label: '벽',     w: 3,   h: 2.3,  d: 0.15, color: '#ece7de' },
  floor:    { label: '바닥',   w: 4,   h: 0.05, d: 4,    color: '#c9a77c' },
  box:      { label: '상자',   w: 1,   h: 1,    d: 1,    color: '#6c8ebf' },
  cylinder: { label: '원기둥', w: 0.6, h: 1,    d: 0.6,  color: '#82b366' },
};
const SWATCHES = ['#ffffff', '#ece7de', '#9aa5b1', '#3e4c59', '#c9a77c', '#8b5e3c',
                  '#d64545', '#f0b429', '#82b366', '#3ebd93', '#6c8ebf', '#8662c7'];
const STORAGE_KEY = 'home3d-scene-v1';
const $ = (id) => document.getElementById(id);

const state = {
  objects: [],
  selectedId: null,
  mode: 'select',     // 'select' | 'wall'
  snap: 0.1,
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
function applyToMesh(o) {
  let mesh = meshes.get(o.id);
  if (!mesh) {
    mesh = new THREE.Mesh(geometryFor(o.type), new THREE.MeshStandardMaterial({ roughness: 0.85 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.id = o.id;
    scene.add(mesh);
    meshes.set(o.id, mesh);
  }
  mesh.scale.set(o.w, o.h, o.d);
  mesh.position.set(o.x, o.y + o.h / 2, o.z);
  mesh.rotation.y = THREE.MathUtils.degToRad(o.rot);
  mesh.material.color.set(o.color);
  mesh.material.transparent = o.opacity < 1;
  mesh.material.opacity = o.opacity;
  mesh.material.depthWrite = o.opacity >= 1;
  mesh.castShadow = o.opacity >= 0.5;
}

function syncScene() {
  const ids = new Set(state.objects.map((o) => o.id));
  for (const [id, mesh] of meshes) {
    if (!ids.has(id)) {
      scene.remove(mesh);
      mesh.material.dispose();
      meshes.delete(id);
    }
  }
  state.objects.forEach(applyToMesh);
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
    x: 0, y: 0, z: 0, w: t.w, h: t.h, d: t.d, rot: 0, color: t.color, opacity: 1,
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
      x: num(r.x, 0), y: num(r.y, 0), z: num(r.z, 0),
      w: num(r.w, t.w, 0.01), h: num(r.h, t.h, 0.01), d: num(r.d, t.d, 0.01),
      rot: num(r.rot, 0),
      color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : t.color,
      opacity: Math.min(1, num(r.opacity, 1, 0.1)),
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

function refreshHint() {
  let text;
  if (state.mode === 'wall') {
    text = wallStart
      ? '벽이 끝날 곳을 누르세요. 이어서 계속 그릴 수 있고, Esc로 끝냅니다.'
      : '벽이 시작할 곳을 바닥에서 누르세요.';
  } else if (!state.objects.length) {
    text = '위쪽 "추가"나 "벽 그리기"로 시작해 보세요. 한 칸은 1 m입니다.';
  } else if (selected()) {
    text = '선택한 물체를 끌면 옮겨집니다. 빈 곳을 끌면 화면이 돌아갑니다.';
  } else {
    text = '끌기: 화면 돌리기 · 휠: 확대/축소 · 오른쪽 버튼 끌기: 화면 옮기기';
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
function removeSelected() {
  if (!selected()) return;
  state.objects = state.objects.filter((o) => o.id !== state.selectedId);
  syncScene();
  commit();
}

function duplicateSelected() {
  const o = selected();
  if (!o) return;
  const step = state.snap || 0.5;
  const copy = addObject(o.type, { ...o, id: newId(), name: nextName(o.type), x: round(o.x + step * 5), z: round(o.z + step * 5) });
  applyToMesh(copy);
  state.selectedId = copy.id;
  commit();
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
  addObject('cylinder', { name: '탁자', w: 1, d: 1, h: 0.45, x: 0.5, z: 1.5, y: 0.05, color: '#f0b429' });
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

function pickObject(e) {
  setRay(e);
  return raycaster.intersectObjects([...meshes.values()], false)[0] || null;
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
  if (hit && o && hit.object.userData.id === o.id) {
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
  o.x = snap(p.x + press.drag.offsetX);
  o.z = snap(p.z + press.drag.offsetZ);
  applyToMesh(o);
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
    select(hit ? hit.object.userData.id : null);
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
    if (key in NUMERIC) {
      const v = parseFloat(el.value);
      if (!Number.isFinite(v)) return;
      const min = NUMERIC[key];
      o[key] = round(min === null ? v : Math.max(min, v));
    } else {
      o[key] = el.value;
    }
    applyToMesh(o);
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
  o.rot = round((o.rot + 90) % 360);
  applyToMesh(o);
  commit();
});
$('dup').addEventListener('click', duplicateSelected);
$('del').addEventListener('click', removeSelected);

// ───────────────────────── 위쪽 도구 모음 ─────────────────────────
$('tool-select').addEventListener('click', () => setMode('select'));
$('tool-wall').addEventListener('click', () => setMode(state.mode === 'wall' ? 'select' : 'wall'));

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    // 지금 보고 있는 곳 한가운데에 놓는다
    const o = addObject(btn.dataset.add, { x: snap(controls.target.x), z: snap(controls.target.z) });
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
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('sample').addEventListener('click', () => {
  if (state.objects.length && !confirm('지금 공간을 지우고 예시 방으로 바꿀까요? (되돌리기로 복구할 수 있습니다)')) return;
  sampleRoom();
});
$('clear').addEventListener('click', () => {
  if (!state.objects.length) return;
  if (!confirm('모든 물체를 지울까요? (되돌리기로 복구할 수 있습니다)')) return;
  state.objects = [];
  syncScene();
  commit();
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
    o.x = round(o.x + move[0] * step);
    o.z = round(o.z + move[1] * step);
    applyToMesh(o);
    commit();
  }
});

// ───────────────────────── 시작 ─────────────────────────
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) state.objects = sanitize(JSON.parse(saved));
} catch { /* 저장된 내용이 깨졌으면 빈 공간으로 시작 */ }

syncScene();
resize();
setView('3d');
commit();

renderer.setAnimationLoop(() => {
  const mesh = meshes.get(state.selectedId);
  outline.visible = !!mesh;
  if (mesh) {
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    outline.scale.copy(mesh.scale).addScalar(0.01);
  }
  controls.update();
  renderer.render(scene, camera);
});

// 자동 점검(테스트)에서 장면을 들여다볼 수 있게 열어 둔다.
window.__home3d = { state, camera, meshes };
