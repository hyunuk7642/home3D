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
  cone:     { label: '원뿔',   w: 0.8, h: 1.5,  d: 0.8,  color: '#1f6b3a' },
  sphere:   { label: '공',     w: 0.4, h: 0.4,  d: 0.4,  color: '#d64545' },
  // 꾸미기 소품: 전구 줄은 길이(가로)에 맞춰 전구가 늘어나고, 리스는 벽이나 문에 건다.
  lights:   { label: '전구 줄', w: 3,   h: 0.1,  d: 0.1,  color: '#1f4d2b', y: 2.2 },
  wreath:   { label: '리스',   w: 0.45, h: 0.45, d: 0.1, color: '#1f6b3a', y: 1.6 },
  person:   { label: '사람',   w: 0.45, h: 1.7, d: 0.3,  color: '#2563eb' },
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
  mode: 'select',     // 'select' | 'wall' | 'walk'
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

// 사람: 놓아 두고 "걸어 보기"를 누르면 이 사람의 눈높이에서 공간을 돌아본다. rot 은 바라보는 방향.
const GEOMETRY = {
  sphere: new THREE.SphereGeometry(0.5, 24, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
  cone: new THREE.ConeGeometry(0.5, 1, 40),
  torus: new THREE.TorusGeometry(0.4, 0.1, 12, 32), // 바깥지름 1, 두께 0.2
};
const geometryFor = (type) => GEOMETRY[{ cylinder: 'cylinder', cone: 'cone', sphere: 'sphere' }[type] || 'box'];
const BULB_COLORS = ['#ff5a4d', '#ffd24d', '#4dc3ff', '#7dff6b'];
const bulbMaterials = BULB_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.4 }));

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
  } else if (o.type === 'lights' || o.type === 'wreath') {
    // 전구 줄: 줄 + (길이에 맞춘) 전구들, 리스: 고리 + 리본 2조각. 맨 앞 조각 뒤에 손잡이 상자를 둔다.
    node = new THREE.Group();
    const first = new THREE.Mesh(o.type === 'wreath' ? GEOMETRY.torus : GEOMETRY.box, new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    first.castShadow = true;
    const grip = new THREE.Mesh(GEOMETRY.box, new THREE.MeshBasicMaterial());
    grip.visible = false;
    grip.userData.grip = true;
    node.add(first, grip);
    if (o.type === 'wreath') {
      for (let i = 0; i < 2; i++) node.add(new THREE.Mesh(GEOMETRY.box, new THREE.MeshStandardMaterial({ roughness: 0.7 })));
    }
  } else if (o.type === 'person') {
    // 몸통 + 머리 + 바라보는 쪽을 알려 주는 코, 그리고 집기 쉬운 손잡이 상자
    node = new THREE.Group();
    for (const geo of [GEOMETRY.cylinder, GEOMETRY.sphere, GEOMETRY.box]) {
      const part = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
      part.castShadow = part.receiveShadow = true;
      node.add(part);
    }
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
  } else if (o.type === 'lights') {
    const [cord, grip] = node.children;
    setPart(cord, 0, o.h / 2 - 0.01, 0, o.w, 0.015, 0.015, o.color, o.opacity);
    grip.scale.set(o.w, o.h, o.d);
    const count = Math.max(2, Math.round(o.w / 0.3) + 1), size = Math.min(0.07, o.h);
    while (node.children.length - 2 > count) node.remove(node.children[node.children.length - 1]);
    while (node.children.length - 2 < count) node.add(new THREE.Mesh(GEOMETRY.sphere, bulbMaterials[(node.children.length - 2) % bulbMaterials.length]));
    node.children.slice(2).forEach((bulb, i) => {
      bulb.position.set(-o.w / 2 + (o.w / (count - 1)) * i, o.h / 2 - 0.02 - size / 2 - (i % 2) * 0.02, 0);
      bulb.scale.setScalar(size);
    });
  } else if (o.type === 'wreath') {
    const [ring, grip, bow, knot] = node.children;
    ring.scale.set(o.w, o.h, o.d / 0.2);
    setMaterial(ring.material, o.color, o.opacity);
    grip.scale.set(o.w, o.h, o.d);
    setPart(bow, 0, -o.h * 0.4, 0, o.w * 0.5, o.h * 0.16, o.d * 1.15, '#c0392b', o.opacity);
    setPart(knot, 0, -o.h * 0.4, 0, o.w * 0.14, o.h * 0.24, o.d * 1.3, '#8e2a20', o.opacity);
  } else if (o.type === 'person') {
    const [body, head, nose, grip] = node.children;
    const headSize = Math.min(o.h * 0.14, 0.3), bodyH = o.h - headSize * 1.05;
    setPart(body, 0, -o.h / 2 + bodyH / 2, 0, o.w, bodyH, o.d, o.color, o.opacity);
    setPart(head, 0, o.h / 2 - headSize / 2, 0, headSize, headSize, headSize, '#f1c9a5', o.opacity);
    setPart(nose, 0, o.h / 2 - headSize / 2, -headSize / 2, headSize * 0.25, headSize * 0.25, headSize * 0.5, '#3e4c59', o.opacity); // 앞 = -z
    grip.scale.set(o.w, o.h, o.d);
  } else {
    if (o.type !== 'wall') node.scale.set(o.w, o.h, o.d);
    const base = node.userData.base || (node.userData.base = node.material);
    setMaterial(base, o.color, o.opacity);
    applyImage(node, o, base);
    if (o.type === 'floor') applyWood(node, o, base);
    if (o.decal) { // 벽 글씨: 상자 자체는 보이지 않고 글과 그림만 보인다
      base.transparent = true; base.opacity = 0; base.depthWrite = false;
      node.receiveShadow = false;
    }
    node.castShadow = o.opacity >= 0.5 && !o.image;
  }
}

// 그림(image: 'poster:이름')이 있는 상자는 앞뒤 넓은 면에 그 그림을 입힌다.
const textures = new Map();
function textureFor(image) {
  const src = (window.POSTERS || {})[String(image).replace(/^poster:/, '')];
  if (!src) return null;
  if (!textures.has(image)) {
    const tex = new THREE.TextureLoader().load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); // 비스듬히 봐도 글자가 뭉개지지 않게
    textures.set(image, tex);
  }
  return textures.get(image);
}

function applyImage(node, o, base) {
  const tex = o.type === 'box' && o.image ? textureFor(o.image) : null;
  if (!tex) {
    if (node.userData.face) { node.userData.face.dispose(); node.userData.face = null; node.userData.image = null; }
    node.material = base;
    return;
  }
  if (node.userData.image !== o.image) {
    if (node.userData.face) node.userData.face.dispose();
    node.userData.face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    node.userData.image = o.image;
  }
  const face = node.userData.face;
  face.transparent = o.opacity < 1 || !!o.decal;
  face.opacity = o.opacity;
  face.depthWrite = !o.decal;
  face.alphaTest = o.decal ? 0.02 : 0;
  node.material = [base, base, base, base, face, face]; // +x, -x, +y, -y, +z, -z
}

// 마루 바닥: 널을 이어 붙인 무늬를 한 번 그려 두고, 바닥 크기에 맞춰 되풀이한다(무늬 한 장 = 2.4 m).
let woodImage = null;
function woodCanvas() {
  if (woodImage) return woodImage;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = 12, rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 300;
    while (x < 512) {
      const len = 220 + rnd() * 260;
      g.fillStyle = `hsl(${28 + rnd() * 6}, ${42 + rnd() * 10}%, ${60 + rnd() * 9}%)`;
      g.fillRect(x, r * rh, len, rh);
      g.strokeStyle = 'rgba(90, 55, 25, 0.10)'; // 나뭇결
      for (let k = 0; k < 5; k++) { const y = r * rh + rnd() * rh; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rnd() - 0.5) * 3); g.stroke(); }
      g.fillStyle = 'rgba(70, 40, 15, 0.35)';
      g.fillRect(x + len - 1, r * rh, 1.5, rh); // 널 끝 이음매
      x += len;
    }
    g.fillStyle = 'rgba(70, 40, 15, 0.3)';
    g.fillRect(0, r * rh, 512, 1.2); // 널 사이 이음매
  }
  return (woodImage = c);
}

function applyWood(node, o, base) {
  if (o.finish !== 'wood') {
    if (base.map) { base.map.dispose(); base.map = null; base.needsUpdate = true; }
    return;
  }
  if (!base.map) {
    base.map = new THREE.CanvasTexture(woodCanvas());
    base.map.colorSpace = THREE.SRGBColorSpace;
    base.map.wrapS = base.map.wrapT = THREE.RepeatWrapping;
    base.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    base.needsUpdate = true;
  }
  base.map.repeat.set(o.w / 2.4, o.d / 2.4);
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

// 벽에 붙어 있는 것들: 문·창문, 그리고 벽면이나 벽 위에 놓인 전시판·벽 글씨·리스·전구 줄 따위.
// (가운데가 벽 두께에서 12 cm 안, 벽 길이 안에 있는 물체. 벽·바닥·사람은 빼고, 묶음은 묶음끼리 움직이므로 뺀다.)
function attachedTo(wall) {
  const found = openingsIn(wall);
  const seen = new Set(found.map((r) => r.o.id));
  for (const o of state.objects) {
    if (seen.has(o.id) || o === wall || o.group || ['wall', 'floor', 'person'].includes(o.type)) continue;
    const { lx, lz } = wallLocal(wall, o.x, o.z);
    if (Math.abs(lz) <= wall.d / 2 + 0.12 && Math.abs(lx) <= wall.w / 2 + 0.05) found.push({ o, lx, lz });
  }
  return found;
}

// 물체를 바꿀 때는 이 함수를 거친다. 벽을 옮기거나 돌리면 그 벽에 붙어 있는 것들도 함께 따라간다.
function edit(o, change) {
  const carried = o.type === 'wall'
    ? attachedTo(o).map(({ o: p, lx, lz }) => ({ p, lx, lz, dy: p.y - o.y, turn: p.rot - o.rot }))
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
  node.traverse((n) => [].concat(n.material || []).forEach((m) => bulbMaterials.includes(m) || m.dispose()));
  if (node.userData.face) node.userData.face.dispose();
  if (node.userData.base && node.userData.base.map) node.userData.base.map.dispose(); // 마루 무늬
  if (node.userData.key) node.geometry.dispose();
  meshes.delete(id);
}

function syncScene() {
  const ids = new Set(state.objects.map((o) => o.id));
  for (const id of [...meshes.keys()]) if (!ids.has(id)) removeNode(id);
  state.objects.forEach(applyNode);
  updateWalls();
  if (!ids.has(state.selectedId)) state.selectedId = null;
  // 그림 파일은 용량이 커서, 그 그림을 쓰는 물체가 있을 때에만 불러온다.
  const used = new Set(state.objects.filter((o) => o.image).map((o) => o.image));
  for (const image of used) loadPosters(posterKind(image)).catch(() => {});
  // 더는 쓰이지 않는 그림은 그래픽 메모리에서 내린다.
  for (const [image, tex] of textures) if (!used.has(image)) { tex.dispose(); textures.delete(image); }
}

// 그림 파일 두 가지: 방 형식 전시판(posters.js)과 복도 벽 글씨(posters-hall.js).
const POSTER_FILES = { room: 'posters.js?v=3', hall: 'posters-hall.js?v=1' };
const posterKind = (key) => (/^(poster:)?hall-/.test(key) ? 'hall' : 'room');
const posterLoads = {};
function loadPosters(kind) {
  if (!posterLoads[kind]) {
    posterLoads[kind] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = POSTER_FILES[kind];
      el.onload = resolve;
      el.onerror = () => { el.remove(); reject(new Error(POSTER_FILES[kind])); };
      document.head.append(el);
    });
    posterLoads[kind].then(syncScene, () => {
      delete posterLoads[kind]; // 다음에 다시 시도할 수 있게
      notice(`그림 파일(${POSTER_FILES[kind].split('?')[0]})을 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.`);
    });
  }
  return posterLoads[kind];
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
      ...(typeof r.image === 'string' && /^poster:[\w-]{1,40}$/.test(r.image) ? { image: r.image } : {}),
      ...(r.deco === 'xmas' ? { deco: 'xmas' } : {}),
      ...(r.decal === true ? { decal: true } : {}),
      ...(r.finish === 'wood' ? { finish: 'wood' } : {}),
      ...(r.space === 'gallery' || r.space === 'hall' ? { space: r.space } : {}),
      ...(typeof r.slot === 'string' && /^[\w-]{1,40}$/.test(r.slot) ? { slot: r.slot } : {}),
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
  } else if (state.mode === 'walk') {
    text = 'W A S D 또는 방향키: 걷기·돌기 · 끌기: 둘러보기 · 두 손가락 쓸기: 걷기·돌기 · Esc: 끝내기';
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
  $('walk').classList.toggle('on', state.mode === 'walk');
  $('walk').textContent = state.mode === 'walk' ? '걷기 끝내기' : '걸어 보기';
  $('walk-pad').hidden = state.mode !== 'walk';
  view.classList.toggle('walking', state.mode === 'walk');
}

function select(id) {
  state.selectedId = id;
  refreshUI();
}

function setMode(mode) {
  if (state.mode === 'walk' && mode !== 'walk') leaveWalk();
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
  // 벽을 지우면 그 벽에 붙어 있는 것들(문·창문, 전시판, 벽 글씨 등)도 함께 지운다.
  const gone = new Set();
  for (const p of groupOf(o)) {
    gone.add(p.id);
    if (p.type === 'wall') attachedTo(p).forEach((r) => gone.add(r.o.id));
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
    if (p.type === 'wall') attachedTo(p).forEach((r) => originals.add(r.o));
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
  const WHITE = '#f6f5f1', WOOD = '#a9825a', DARK = '#2b2f36', GLASS = '#a9d3e8'; // WHITE = 전시판 바탕색과 같은 벽 색
  state.objects = [];
  const add = (type, name, props) => addObject(type, { name, ...props });

  add('floor', '바닥', { w: W, d: D, color: '#cfcac2', space: 'gallery' });
  add('wall', '뒤쪽 벽', { w: W + T, z: -D / 2, h: H, color: WHITE });
  add('wall', '왼쪽 벽', { w: D + T, x: -W / 2, rot: 90, h: H, color: WHITE });
  // 오른쪽 벽은 실제로는 일반 벽이지만, 안이 들여다보이도록 반투명하게 그린다.
  add('wall', '오른쪽 벽', { w: D + T, x: W / 2, rot: 90, h: H, color: WHITE, opacity: 0.25 });
  add('wall', '앞쪽 유리벽', { w: W + T, z: D / 2, h: H, color: GLASS, opacity: 0.3 });
  const doorX = round(-W / 2 + 1.2);
  add('door', '입구', { w: 1.2, x: doorX, z: D / 2, color: GLASS, opacity: 0.5 });
  add('floor', '입구 레드카펫', { w: 1.4, d: 2.6, h: 0.01, x: doorX, z: D / 2 - 1.4, y: F, color: '#a8322d' });

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

  // 입구 옆 유리벽 앞에 이동식 화면 3대(받침 + 기둥 + 화면), 방 안쪽을 바라본다.
  for (let i = 0; i < 3; i++) {
    const group = `이동식 화면 ${i + 1}`, x = round(doorX + 2.6 + i * 1.1), z = round(D / 2 - 0.8);
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

// 복도공간 전시회: 폭 8 m, 길이 36 m(가정)의 다리 같은 복도. 벽이 없고 양옆은 난간이며 바닥은 마루다.
// 전시는 모두 복도 방향으로 길게 놓은 가벽에 한다. 가벽은 뒤쪽 줄(제1·3·5관)과 앞쪽 줄(제2·4관)에
// 서로 엇갈리게 놓아, 복도 방향으로는 세 갈래 길(양옆 2.4 m, 가운데 3.2 m)이 끝까지 뚫려 있고
// 가벽 사이 틈으로 가로질러 다닐 수 있다. 연구회 자료는 판을 붙이지 않고 가벽에 직접 쓴 글처럼 넣는다.
function hallSpace() {
  const { L, W, F } = HALL;
  const GREEN = '#1f5a3a', RED = '#8f2a25', CREAM = '#f3ead9', GLASS = '#a9d3e8', WOOD = '#a9825a', DARK = '#2b2f36';
  state.objects = [];
  const add = (type, name, props) => addObject(type, { name, ...props });

  add('floor', '복도 바닥', { w: L, d: W, h: F, color: '#ffffff', finish: 'wood', space: 'hall' });
  for (const side of [-1, 1]) { // 유리 난간과 손잡이
    const label = side < 0 ? '뒤쪽' : '앞쪽', z = round(side * (W / 2 - 0.03));
    add('wall', `${label} 난간`, { w: L, d: 0.04, h: 1.1, z, color: GLASS, opacity: 0.3 });
    add('box', `${label} 난간 손잡이`, { w: L, d: 0.08, h: 0.05, z, y: 1.1, color: '#d9d9d6' });
  }

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
  boxTree(add, '트리 1', -11.5, 1.8, F);
  boxTree(add, '트리 2', 12, 1.9, F);

  // 들머리 앞쪽 난간 앞에 이동식 화면 3대
  for (let i = 0; i < 3; i++) {
    const group = `이동식 화면 ${i + 1}`, x = round(-L / 2 + 0.9 + i * 1.1), z = round(W / 2 - 0.7);
    add('cylinder', `${group} 받침`, { w: 0.42, d: 0.42, h: 0.03, x, z, y: F, color: '#e8e4dc', group });
    add('cylinder', `${group} 기둥`, { w: 0.04, d: 0.04, h: 1.05, x, z: round(z + 0.03), y: F + 0.03, color: '#e8e4dc', group });
    add('box', `${group} 화면`, { w: 0.62, h: 0.37, d: 0.03, x, z, y: 0.95, color: DARK, group });
  }

  // 끝자락의 이야기 자리: 탁자 + 의자 6개, 뒤쪽 난간 앞에 커피 수납장
  const tx = round(L / 2 - 2.4);
  add('box', '탁자', { w: 1.8, d: 0.9, h: 0.72, x: tx, z: 0, y: F, color: WOOD, group: '이야기 자리' });
  let chair = 1;
  for (const dz of [-0.8, 0.8]) {
    for (const dx of [-0.6, 0, 0.6]) add('cylinder', `의자 ${chair++}`, { w: 0.38, d: 0.38, h: 0.45, x: round(tx + dx), z: dz, y: F, color: '#a8322d', group: '이야기 자리' });
  }
  const cz = round(-W / 2 + 0.4);
  add('box', '커피 수납장', { w: 1.4, d: 0.55, h: 0.9, x: tx, z: cz, y: F, color: CREAM, group: '커피 코너' });
  add('box', '커피 머신', { w: 0.4, d: 0.3, h: 0.42, x: round(tx + 0.3), z: cz, y: F + 0.9, color: DARK, group: '커피 코너' });

  // 관람객: "걸어 보기"를 누르면 이 사람의 눈으로 들머리에서 걷기 시작한다
  add('person', '관람객', { x: round(-L / 2 + 0.8), z: 0.9, y: F, rot: 270 });

  decorateHall();
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
  if (state.mode === 'walk') { // 두 손가락 쓸기: 위아래 = 앞뒤로 걷기, 좌우 = 돌기
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) return;
    walkBy(e.deltaY * 0.004, 0);
    lookBy(e.deltaX * 0.003, 0);
    return;
  }
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

// ───────────────────────── 걸어 보기 ─────────────────────────
// 사람의 눈높이에서 공간을 돌아본다. 벽과 가구는 통과하지 못하고, 문 자리로는 지나갈 수 있다.
const WALK_KEYS = {
  w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back',
  a: 'left', d: 'right', arrowleft: 'turnLeft', arrowright: 'turnRight', q: 'turnLeft', e: 'turnRight',
};
const BODY = 0.22;          // 사람 몸의 반지름(m)
const held = new Set();     // 지금 누르고 있는 이동 키
const walk = { id: null, x: 0, z: 0, yaw: 0, pitch: 0, saved: null };

const walker = () => state.objects.find((o) => o.id === walk.id) || null;

// (x, z)에 사람이 설 수 있는가
function canStand(x, z, me) {
  for (const o of state.objects) {
    if (o === me || o.type === 'floor' || o.type === 'person' || isOpening(o)) continue;
    if (o.y + o.h < me.y + 0.3 || o.y > me.y + me.h) continue; // 넘어갈 만큼 낮거나 머리 위에 있는 것
    const { lx, lz } = wallLocal(o, x, z);
    if (Math.abs(lx) >= o.w / 2 + BODY || Math.abs(lz) >= o.d / 2 + BODY) continue;
    const throughDoor = o.type === 'wall' && openingsIn(o).some((r) =>
      r.o.type === 'door' && r.o.y - me.y < 0.3 && Math.abs(lx - r.lx) < r.o.w / 2 - BODY * 0.6);
    if (!throughDoor) return false;
  }
  return true;
}

// 앞으로 forward, 오른쪽으로 side 만큼(m). 막히면 벽을 따라 미끄러진다.
function walkBy(forward, side) {
  const me = walker();
  if (!me) return;
  const sin = Math.sin(walk.yaw), cos = Math.cos(walk.yaw);
  // 한 번에 크게 움직이면 얇은 벽을 건너뛸 수 있으니 10 cm 이하로 나눠 걷는다.
  const steps = Math.max(1, Math.ceil(Math.hypot(forward, side) / 0.1));
  const dx = (-sin * forward + cos * side) / steps, dz = (-cos * forward - sin * side) / steps;
  const stuck = !canStand(walk.x, walk.z, me); // 처음부터 물체 안에 있으면 빠져나올 수 있게 한다
  for (let i = 0; i < steps; i++) {
    if (stuck || canStand(walk.x + dx, walk.z, me)) walk.x += dx;
    if (stuck || canStand(walk.x, walk.z + dz, me)) walk.z += dz;
  }
}

function lookBy(dYaw, dPitch) {
  walk.yaw -= dYaw;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - dPitch, -1.3, 1.3);
}

function stepWalk(dt) {
  const me = walker();
  if (!me) { setMode('select'); return; } // 걷던 사람이 지워졌다
  const speed = (held.has('fast') ? 3 : 1.4) * dt; // 보통 걸음 1.4 m/s
  const f = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0);
  const r = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  if (f || r) walkBy(f * speed, r * speed);
  const turn = (held.has('turnLeft') ? 1 : 0) - (held.has('turnRight') ? 1 : 0);
  if (turn) walk.yaw += turn * 1.6 * dt;
  camera.position.set(walk.x, me.y + me.h * 0.94, walk.z); // 눈높이: 키 1.7 m 면 1.6 m
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  const node = meshes.get(me.id);
  if (node) node.visible = false; // 내 몸은 보이지 않게
}

// 걸을 사람을 정한다: 선택한 사람 → 이미 놓인 사람 → 없으면 입구 안쪽(문이 없으면 보고 있는 곳)에 새로 놓는다.
function findWalker() {
  const sel = selected();
  if (sel && sel.type === 'person') return sel;
  const placed = state.objects.find((o) => o.type === 'person');
  if (placed) return placed;
  let x = snap(controls.target.x), z = snap(controls.target.z), rot = 0;
  const door = state.objects.find((o) => o.type === 'door');
  if (door) {
    const c = sceneBounds().getCenter(new THREE.Vector3());
    const t = rad(door.rot);
    let nx = Math.sin(t), nz = Math.cos(t);                       // 문에서 수직인 방향
    if ((c.x - door.x) * nx + (c.z - door.z) * nz < 0) { nx = -nx; nz = -nz; } // 방 안쪽으로
    x = round(door.x + nx * 1.0); z = round(door.z + nz * 1.0);
    rot = round(THREE.MathUtils.radToDeg(Math.atan2(-nx, -nz)));  // 안쪽을 바라본다
  }
  const o = addObject('person', { x, z, rot, y: door ? door.y : 0 });
  applyToMesh(o);
  return o;
}

function enterWalk() {
  const me = findWalker();
  setMode('select');
  walk.id = me.id;
  walk.x = me.x; walk.z = me.z; walk.yaw = rad(me.rot); walk.pitch = 0;
  walk.saved = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  held.clear();
  controls.enabled = false;
  camera.fov = 70;
  camera.updateProjectionMatrix();
  state.selectedId = null;
  state.mode = 'walk';
  refreshUI();
}

// 걷기를 끝내면 사람을 걸어간 자리에 두고, 화면은 걷기 전 모습으로 돌린다.
function leaveWalk() {
  const me = walker();
  if (me) {
    me.x = round(walk.x); me.z = round(walk.z);
    me.rot = round(((THREE.MathUtils.radToDeg(walk.yaw) % 360) + 360) % 360);
    applyNode(me);
    const node = meshes.get(me.id);
    if (node) node.visible = true;
  }
  held.clear();
  camera.fov = walk.saved.fov;
  camera.updateProjectionMatrix();
  camera.rotation.order = 'XYZ';
  camera.position.copy(walk.saved.position);
  controls.target.copy(walk.saved.target);
  controls.enabled = true;
  controls.update();
  walk.id = null;
  state.mode = 'select';
  commit();
}

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (WALK_KEYS[key]) held.delete(WALK_KEYS[key]);
  if (key === 'shift') held.delete('fast');
});
window.addEventListener('blur', () => held.clear());

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
  const emptyDecals = new Set(state.objects.filter((o) => o.decal && !o.image).map((o) => o.id));
  const hits = raycaster.intersectObjects([...meshes.values()], true)
    .filter((h) => h.object.visible || h.object.userData.grip)
    .map((h) => {
      let node = h.object;
      while (node && !node.userData.id) node = node.parent;
      return { id: node.userData.id, point: h.point };
    })
    .filter((h) => !emptyDecals.has(h.id)); // 자료를 뺀 벽 글씨는 보이지 않으니 집히지 않게
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
  if (state.mode === 'walk') { canvas.setPointerCapture(e.pointerId); return; }
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
  if (state.mode === 'walk') { // 끌어서 둘러보기
    lookBy((e.clientX - press.x) * 0.005, (e.clientY - press.y) * 0.005);
    press.x = e.clientX; press.y = e.clientY;
    return;
  }
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
  if (state.mode === 'walk') return;
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
$('exhibits').addEventListener('click', toggleExhibits);
$('xmas').addEventListener('click', toggleXmas);

// ───────────────────────── 위쪽 도구 모음 ─────────────────────────
$('tool-select').addEventListener('click', () => setMode('select'));
$('tool-wall').addEventListener('click', () => setMode(state.mode === 'wall' ? 'select' : 'wall'));

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    // 지금 보고 있는 곳 한가운데에 놓는다
    const type = btn.dataset.add;
    setMode('select'); // 벽 그리기나 걷기 중이었다면 먼저 제대로 끝낸다
    const o = isOpening({ type })
      ? addOpening(type)
      : addObject(type, { x: snap(controls.target.x), z: snap(controls.target.z) });
    applyToMesh(o);
    state.selectedId = o.id;
    commit();
  });
});

$('view-3d').addEventListener('click', () => { setMode('select'); setView('3d'); });
$('view-top').addEventListener('click', () => { setMode('select'); setView('top'); });
$('walk').addEventListener('click', () => (state.mode === 'walk' ? setMode('select') : enterWalk()));
// 화면 단추(터치용): 누르고 있는 동안 걷거나 돈다
document.querySelectorAll('#walk-pad [data-walk]').forEach((btn) => {
  const on = (e) => { e.preventDefault(); held.add(btn.dataset.walk); };
  const off = () => held.delete(btn.dataset.walk);
  btn.addEventListener('pointerdown', on);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, off);
});
$('snap').addEventListener('change', (e) => { state.snap = parseFloat(e.target.value) || 0; });
$('trackpad').addEventListener('change', (e) => {
  state.trackpad = e.target.checked;
  try { localStorage.setItem(TRACKPAD_KEY, state.trackpad ? '1' : '0'); } catch { /* 무시 */ }
  refreshHint();
});
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
const PRESETS = { sample: sampleRoom, gallery: gallerySpace, hall: hallSpace };
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
    else if (state.mode !== 'select') setMode('select');
    else select(null);
    return;
  }
  if (typing) return;

  if (state.mode === 'walk') { // 걷는 동안에는 이동 키만 받는다
    if (!mod && WALK_KEYS[key]) { e.preventDefault(); held.add(WALK_KEYS[key]); }
    if (key === 'shift') held.add('fast');
    return;
  }

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

let lastFrame = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (state.mode === 'walk') {
    stepWalk(dt);
    outline.visible = false;
    renderer.render(scene, camera);
    return;
  }
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
window.__home3d = { state, camera, meshes, controls, buildWallGeometry, walk };
})();
