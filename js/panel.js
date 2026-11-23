// 오른쪽 패널·알림 갱신, 선택, 묶음, 복제·삭제 같은 편집 동작.
// 모듈(import)을 쓰지 않는 일반 스크립트라, index.html 을 더블클릭해서(file://) 열어도 동작한다.
// js/ 의 파일들은 맨 위 이름들을 서로 함께 쓰며, index.html 에 적힌 순서대로 실행된다.
'use strict';

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
  $('undo').disabled = past.length < 2;
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
