// 포인터·패널·도구 모음·키보드 입력, 그리고 시작과 그리기 반복.
// 모듈(import)을 쓰지 않는 일반 스크립트라, index.html 을 더블클릭해서(file://) 열어도 동작한다.
// js/ 의 파일들은 맨 위 이름들을 서로 함께 쓰며, index.html 에 적힌 순서대로 실행된다.
'use strict';

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
window.__home3d = { state, camera, meshes, controls, buildWallGeometry, walk, canStand };
