// 카메라와 보기 전환, 트랙패드 조작, 걸어 보기.
// 모듈(import)을 쓰지 않는 일반 스크립트라, index.html 을 더블클릭해서(file://) 열어도 동작한다.
// js/ 의 파일들은 맨 위 이름들을 서로 함께 쓰며, index.html 에 적힌 순서대로 실행된다.
'use strict';

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
  // 다리 같은 복도(space: 'hall')는 바닥 밖이 허공이라 바닥 끝을 넘어갈 수 없다.
  const bridge = state.objects.find((o) => o.space === 'hall');
  if (bridge) {
    const { lx, lz } = wallLocal(bridge, x, z);
    if (Math.abs(lx) > bridge.w / 2 - BODY || Math.abs(lz) > bridge.d / 2 - BODY) return false;
  }
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
