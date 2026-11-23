// 설정, 3D 장면, 물체를 화면에 그리기, 벽 구멍, 물체 목록과 저장·되돌리기.
// 모듈(import)을 쓰지 않는 일반 스크립트라, index.html 을 더블클릭해서(file://) 열어도 동작한다.
// js/ 의 파일들은 맨 위 이름들을 서로 함께 쓰며, index.html 에 적힌 순서대로 실행된다.
'use strict';
const { OrbitControls } = THREE; // THREE 는 vendor/three.bundle.js 가 만든다

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
let past = [];
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
  if (past[past.length - 1] !== now) {
    past.push(now);
    if (past.length > 100) past.shift();
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
  if (past.length < 2) return;
  future.push(past.pop());
  restore(past[past.length - 1]);
}

function redo() {
  if (!future.length) return;
  const json = future.pop();
  past.push(json);
  restore(json);
}
