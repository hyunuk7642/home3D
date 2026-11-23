// 브라우저로 프로그램을 열어 주요 동작을 눌러 보고 결과를 출력하는 점검 스크립트.
// 실행: node tests/doors.js [화면 그림을 저장할 폴더]   (playwright 필요)
const PAGE = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(PAGE);
  await p.waitForFunction(() => window.__home3d);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForFunction(() => window.__home3d);
  const st = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__home3d.state)));
  const log = (k, v) => console.log(k, JSON.stringify(v));
  const scr = (x, y, z) => p.evaluate(([x, y, z]) => {
    const { camera } = window.__home3d; const c = document.getElementById('canvas').getBoundingClientRect();
    const e = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements;
    const mul = (m, v) => [0,1,2,3].map(i => m[i]*v[0]+m[i+4]*v[1]+m[i+8]*v[2]+m[i+12]*v[3]);
    const q = mul(pe, mul(e, [x, y, z, 1]));
    return [c.left + (q[0]/q[3]+1)/2*c.width, c.top + (1-q[1]/q[3])/2*c.height];
  }, [x, y, z]);
  // geometry sanity: every triangle's winding agrees with its normal; area matches
  log('geometry', await p.evaluate(() => {
    const g = window.__home3d.buildWallGeometry(4, 2.3, 0.15, [{ x0: -0.45, x1: 0.45, y0: -1.15, y1: 0.95 }, { x0: 1, x1: 1.8, y0: -0.25, y1: 0.85 }]);
    const P = g.attributes.position.array, N = g.attributes.normal.array; let bad = 0, front = 0;
    for (let i = 0; i < P.length; i += 9) {
      const a=[P[i],P[i+1],P[i+2]], b=[P[i+3],P[i+4],P[i+5]], c=[P[i+6],P[i+7],P[i+8]];
      const u=b.map((v,k)=>v-a[k]), w=c.map((v,k)=>v-a[k]);
      const cr=[u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
      const dot = cr[0]*N[i]+cr[1]*N[i+1]+cr[2]*N[i+2]; if (dot <= 0) bad++;
      if (N[i+2] === 1) front += Math.hypot(...cr)/2;
    }
    return { tris: P.length/9, bad, frontArea: +front.toFixed(3), expect: +(4*2.3 - 0.9*2.1 - 0.8*1.1).toFixed(3) };
  }));
  // wall + door + window via buttons
  await p.click('[data-add=wall]');
  await p.fill('#f-w', '5'); await p.press('#f-w', 'Tab');
  await p.click('[data-add=door]');
  let s = await st(); const wallId = s.objects[0].id;
  log('door', s.objects.filter(o=>o.type==='door').map(o=>[o.x,o.y,o.z,o.rot]));
  await p.evaluate(id => { window.__home3d.state.selectedId = id; }, wallId);
  await p.click('[data-add=window]');
  s = await st(); log('window (not overlapping door)', s.objects.filter(o=>o.type==='window').map(o=>[o.x,o.y,o.z,o.rot]));
  const tris = () => p.evaluate(id => window.__home3d.meshes.get(id).geometry.attributes.position.count/3, wallId);
  log('wall tris with 2 holes (plain=12)', await tris());
  await p.click('[data-add=window]'); await p.click('[data-add=window]'); s = await st(); log('more windows on same wall', s.objects.filter(o=>o.type==='window').map(o=>o.x)); await p.click('#undo'); await p.click('#undo');
  // move wall via form -> openings follow
  await p.evaluate(id => { window.__home3d.state.selectedId = id; }, wallId);
  await p.click('#list li button'); 
  await p.fill('#f-x', '2'); await p.press('#f-x', 'Tab');
  await p.click('#rot90');
  s = await st(); log('after wall x=2, rot90', s.objects.map(o=>[o.type,o.x,o.z,o.rot]));
  log('tris still holed', await tris());
  // drag door along wall (top view); wall along z at x=2
  await p.click('#view-top');
  await p.click('#list li:nth-child(2) button');
  const d0 = s.objects[1]; let a = await scr(d0.x, 2.1, d0.z), c = await scr(2.3, 2.1, -1);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move((a[0]+c[0])/2,(a[1]+c[1])/2,{steps:3}); await p.mouse.move(c[0], c[1], {steps:3}); await p.mouse.up();
  s = await st(); log('door dragged near (2.3,-1) -> snapped to wall x=2', [s.objects[1].x, s.objects[1].z, s.objects[1].rot]);
  // drag far away from wall: free standing, wall hole closes
  a = await scr(s.objects[1].x, 2.1, s.objects[1].z); c = await scr(-1.5, 2.1, 0.5);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move((a[0]+c[0])/2,(a[1]+c[1])/2,{steps:3}); await p.mouse.move(c[0], c[1], {steps:3}); await p.mouse.up();
  s = await st(); log('door dragged away', [s.objects[1].x, s.objects[1].z]); log('tris (1 hole)', await tris());
  await p.click('#undo'); log('undo -> tris', await tris());
  // duplicate wall copies openings; delete wall removes them
  await p.click('#list li button'); await p.keyboard.press('Control+d'); s = await st(); log('after dup wall', s.objects.map(o=>o.name));
  await p.keyboard.press('Delete'); s = await st(); log('after delete copy', s.objects.map(o=>o.name));
  // sample room screenshots
  await p.click('#sample'); await p.waitForTimeout(300);
  s = await st(); log('sample', s.objects.length);
  await p.screenshot({ path: OUT + '/doors.png' });
  await p.evaluate(() => { const { camera, controls } = window.__home3d; controls.target.set(0,1,0); camera.position.set(-1.5,1.5,3.2); });
  await p.waitForTimeout(400); await p.screenshot({ path: OUT + '/inside.png' });
  // export/import keeps openings
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  await p.click('#clear'); await p.setInputFiles('#file', await dl.path()); await p.waitForTimeout(300);
  s = await st(); log('imported', s.objects.filter(o=>o.type==='door'||o.type==='window').map(o=>[o.name,o.y]));
  await p.click('#clear');
  console.log('errors', errs);
  await b.close();
})();
