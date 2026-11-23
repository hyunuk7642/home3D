// 고쳤던 문제가 다시 생기지 않았는지 확인한다. 하나라도 틀리면 종료 코드 1.
// 실행: node tests/regressions.js   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  const check = (name, ok, detail = '') => { console.log(ok ? '  통과' : '  실패', name, detail); if (!ok) failures.push(name); };
  const open = async (block) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/posters/.test(m.text()) && errors.push(m.text()));
    if (block) await page.route(block, (r) => r.abort());
    await page.goto(PAGE);
    await page.waitForFunction(() => window.__home3d);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__home3d);
    return { page, errors };
  };
  const objects = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__home3d.state.objects)));
  const hint = (page) => page.textContent('#hint');

  { // 걷는 중에 물체를 추가해도 화면이 제대로 돌아온다
    const { page, errors } = await open();
    await page.click('#sample'); await page.click('#walk'); await page.waitForTimeout(300);
    await page.click('[data-add=box]'); await page.waitForTimeout(300);
    const s = await page.evaluate(() => { const { state, camera, controls, meshes } = window.__home3d; const me = state.objects.find((o) => o.type === 'person'); return { mode: state.mode, fov: camera.fov, controls: controls.enabled, person: meshes.get(me.id).visible }; });
    check('걷는 중 물체 추가 뒤 화면 복구', s.mode === 'select' && s.fov === 50 && s.controls && s.person, JSON.stringify(s));
    check('오류 없음(걷기)', !errors.length, errors.join(' | '));
    await page.close();
  }

  { // 가벽을 옮기면 붙어 있는 것들이 따라온다
    const { page, errors } = await open();
    await page.click('#hall'); await page.waitForTimeout(1500);
    const before = await objects(page);
    await page.click('#list li:has-text("제1관 가벽") button');
    await page.fill('#f-z', '-2.6'); await page.press('#f-z', 'Tab');
    const after = await objects(page);
    const moved = after.filter((o) => /hall-(zone1|room0[1-4])$/.test(o.slot || '')).map((o) => { const was = before.find((b) => b.name === o.name); return +(o.z - was.z).toFixed(3); });
    check('복도 가벽을 옮기면 벽 글씨 5장이 따라옴', moved.length === 5 && moved.every((d) => d === -1), JSON.stringify(moved));
    const light = (list) => list.find((o) => o.name === '제1관 가벽 전구 줄').z;
    check('가벽 위 전구 줄도 따라옴', light(after) === -2.6, String(light(after)));
    const other = (list) => list.find((o) => o.slot === 'hall-room05').z;
    check('다른 가벽의 글씨는 그대로', other(after) === other(before));

    // 어느 면에서든 왼쪽 → 오른쪽으로 번호가 놓인다
    await page.click('#hall'); await page.waitForTimeout(500);
    const order = await page.evaluate(() => {
      const o = window.__home3d.state.objects, out = {};
      for (const w of o.filter((x) => /^제\d관 가벽$/.test(x.name))) {
        for (const side of [1, -1]) {
          const items = o.filter((x) => x.decal && Math.abs(x.z - (w.z + side * 0.064)) < 0.001 && Math.abs(x.x - w.x) <= w.w / 2);
          items.sort((a, b) => side * (a.x - b.x)); // 보는 사람 기준 왼쪽부터
          out[w.name + (side > 0 ? '+' : '-')] = items.map((x) => x.slot.replace('hall-', '')).join(',');
        }
      }
      return out;
    });
    const sorted = Object.values(order).every((list) => { const a = list.split(','); return a.join() === [...a].sort((x, y) => (x.startsWith('zone') ? -1 : y.startsWith('zone') ? 1 : x.localeCompare(y))).join(); });
    check('모든 가벽 면에서 소개 → 번호 순으로 왼쪽부터', sorted, JSON.stringify(order));

    // 바닥 이름을 바꿔도 복도로 알아본다
    await page.evaluate(() => { window.__home3d.state.objects.find((o) => o.name === '복도 바닥').name = '마루'; });
    await page.click('#xmas'); await page.click('#xmas'); await page.waitForTimeout(300);
    const names = (await objects(page)).map((o) => o.name);
    check('바닥 이름을 바꾼 복도에서 다시 꾸며도 복도 그대로', names.includes('제1관 가벽') && !names.includes('가운데 가벽'));
    check('오류 없음(복도)', !errors.length, errors.join(' | '));
    await page.close();
  }

  { // 다른 장면에서는 꾸미기·전시 자료 배치가 장면을 바꾸지 않는다
    const { page, errors } = await open();
    await page.click('#sample');
    const before = (await objects(page)).length;
    await page.click('#xmas'); await page.waitForTimeout(200);
    check('예시 방에서 크리스마스 꾸미기: 장면 그대로 + 안내', (await objects(page)).length === before && /그대로 두었습니다/.test(await hint(page)), await hint(page));
    await page.click('#exhibits'); await page.waitForTimeout(200);
    check('예시 방에서 전시 자료 배치: 장면 그대로 + 안내', (await objects(page)).length === before && /그대로 두었습니다/.test(await hint(page)), await hint(page));
    await page.click('#clear'); await page.click('#xmas'); await page.waitForTimeout(400);
    check('빈 화면에서 크리스마스 꾸미기: 전시 공간을 만들고 꾸밈', (await objects(page)).some((o) => o.deco) && (await objects(page)).some((o) => o.name === '가운데 가벽'));

    // 방의 가벽을 옮기면 전시판이 따라온다
    await page.click('#list li:has-text("가운데 가벽") button');
    await page.fill('#f-z', '0.2'); await page.press('#f-z', 'Tab');
    const z = (await objects(page)).filter((o) => /^(zone2|room0[5-8])$/.test(o.slot || '')).map((o) => o.z);
    check('방 가운데 가벽을 옮기면 제2관 전시판 5장이 따라옴', z.length === 5 && z.every((v) => Math.abs(v - 0.267) < 0.001), JSON.stringify(z));

    // 그림 파일은 필요할 때만 받는다
    await page.click('#clear');
    const loaded = () => page.evaluate(() => [...document.scripts].map((s) => s.src.split('/').pop().split('?')[0]).filter((n) => n.startsWith('posters')));
    await page.reload(); await page.waitForFunction(() => window.__home3d);
    check('처음 열 때는 그림 파일을 받지 않음', (await loaded()).length === 0, JSON.stringify(await loaded()));
    await page.click('#exhibits'); await page.waitForTimeout(1500);
    check('전시 자료 배치를 누르면 posters.js 만 받고 26장이 들어감', (await loaded()).join() === 'posters.js' && (await objects(page)).filter((o) => o.image).length === 26, JSON.stringify(await loaded()));
    check('오류 없음(방)', !errors.length, errors.join(' | '));
    await page.close();
  }

  { // 그림 파일을 못 받으면 맞는 파일 이름으로 알리고, 다시 시도할 수 있다
    const { page } = await open('**/posters-hall.js*');
    await page.click('#hall'); await page.waitForTimeout(800);
    check('벽 글씨 파일 실패 알림에 맞는 파일 이름', /posters-hall\.js/.test(await hint(page)), await hint(page));
    await page.unroute('**/posters-hall.js*');
    await page.click('#exhibits'); await page.waitForTimeout(1500);
    const loaded = await page.evaluate(() => Object.keys(window.POSTERS || {}).filter((k) => k.startsWith('hall-')).length);
    check('다시 누르면 받아 옴', loaded === 26, String(loaded));
    await page.close();
  }

  { // 복도는 다리라서 바닥 끝을 걸어서 넘어갈 수 없다. 방에서는 문으로 나갈 수 있다.
    const { page } = await open();
    await page.click('#hall'); await page.waitForTimeout(800);
    const stand = (x, z) => page.evaluate(([x, z]) => { const { state, canStand } = window.__home3d; return canStand(x, z, state.objects.find((o) => o.type === 'person')); }, [x, z]);
    check('복도 안쪽 길에는 설 수 있음', await stand(-17, 0.9) && await stand(17.5, 2.5));
    check('복도 양 끝과 난간 밖에는 설 수 없음', !(await stand(18.2, 2.5)) && !(await stand(-18.2, 0)) && !(await stand(0, 4.3)));
    await page.click('#gallery'); await page.click('#walk'); await page.waitForTimeout(200);
    check('방에서는 문 밖에 설 수 있음', await stand(-3.8, 5));
    await page.keyboard.press('Escape');

    // 좁은 화면에서 도구 모음이 한 줄이고 3D 화면이 넉넉하다
    await page.setViewportSize({ width: 390, height: 780 }); await page.waitForTimeout(300);
    const [bar, view, scroll] = await page.evaluate(() => { const t = document.getElementById('toolbar'); return [t.offsetHeight, document.getElementById('view').offsetHeight, t.scrollWidth > t.clientWidth]; });
    check('휴대폰 폭에서 도구 모음 한 줄(옆으로 밀기), 3D 화면이 더 큼', bar <= 70 && view >= 350 && scroll, JSON.stringify({ bar, view, scroll }));
    await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'home3d-mobile.png') });
    await page.close();
  }

  await browser.close();
  console.log(failures.length ? `\n실패 ${failures.length}건: ${failures.join(' / ')}` : '\n모두 통과');
  process.exit(failures.length ? 1 : 0);
})();
