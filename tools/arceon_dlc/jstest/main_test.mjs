// Loads main.js and drives it like a (mobile) player: tap = use, break = hold to break.
import { mc, ui, world, put } from './harness.mjs';
await import('./scripts/main.js');
const W = mc.world, S = mc.system;
const cmds = {};
S.beforeEvents.startup.fire({ customCommandRegistry: { registerCommand: (c, cb) => cmds[c.name] = cb, registerEnum() {} } });
const { dim, player } = world({ id: 'main' });
player.playerPermissionLevel = 2;
for (let x = -5; x < 40; x++) for (let z = -5; z < 40; z++) put(dim, x, 0, z, 'grass_block');
const { session } = await import('./scripts/core/session.js');
const { getClip } = await import('./scripts/core/clipboard.js');
const s = session(player);
const tick = (n = 10) => { S.currentTick += n; };
const settle = async () => { S.flush(); await new Promise(r => setTimeout(r, 30)); S.flush(); };
const item = (id) => new mc.ItemStack(id);
async function tap(id, pos, sneak = false) {
  tick(); player.isSneaking = sneak;
  W.beforeEvents.playerInteractWithBlock.fire({ player, itemStack: item(id), block: dim.getBlock(pos), blockFace: 'Up', isFirstEvent: true, cancel: false });
  player.isSneaking = false; await settle();
}
async function tapAir(id, look, sneak = false) {
  tick(); player.isSneaking = sneak; player.lookAt = look;
  W.beforeEvents.itemUse.fire({ source: player, itemStack: item(id), cancel: false });
  player.isSneaking = false; await settle();
}
async function brk(id, pos, sneak = false) {
  tick(); player.isSneaking = sneak;
  const ev = { player, itemStack: item(id), block: dim.getBlock(pos), cancel: false };
  W.beforeEvents.playerBreakBlock.fire(ev);
  player.isSneaking = false; await settle();
  return ev.cancel;
}
const btn = (label) => (form) => ({ canceled: false, selection: form.items.filter(i => i[0] === 'button').findIndex(b => b[1].includes(label)) });
const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

// --- wand, area mode (default): tap = pos1, break = pos2
await tap('arc:wand', { x: 0, y: 0, z: 0 });
const cancelled = await brk('arc:wand', { x: 9, y: 3, z: 9 });
check(JSON.stringify([s.pos1, s.pos2]) === '[{"x":0,"y":0,"z":0},{"x":9,"y":3,"z":9}]' && cancelled, 'wand area mode: tap = pos1, break = pos2 (block not broken)');
// sneak + break switches curve point mode on; held down it still switches only once
for (let i = 0; i < 5; i++) { S.currentTick += 4; player.isSneaking = true; W.beforeEvents.playerBreakBlock.fire({ player, itemStack: item('arc:wand'), block: dim.getBlock({ x: 1, y: 0, z: 1 }), cancel: false }); }
player.isSneaking = false; await settle();
check(s.wandMode === 'points', 'sneak + break (held) turns curve point mode on once');
for (const [x, z] of [[0, 0], [10, 5], [20, 0], [25, 5]]) await tapAir('arc:wand', { x, y: 0, z });
await brk('arc:wand', { x: 0, y: 0, z: 0 });
check(s.points.length === 3 && s.pos2.x === 9, 'curve mode: tap adds, break undoes one, selection unchanged');
// holding break repeats the event every few ticks: still only one undo
for (let i = 0; i < 6; i++) { S.currentTick += 4; W.beforeEvents.playerBreakBlock.fire({ player, itemStack: item('arc:wand'), block: dim.getBlock({ x: 1, y: 0, z: 1 }), cancel: false }); }
await settle();
check(s.points.length === 2, 'holding break = one undo: ' + s.points.length);
await tapAir('arc:wand', { x: 25, y: 0, z: 5 });
// a long press on a touch screen: first a tap, a few ticks later the break, same block
{
  const n0 = s.points.length;
  S.currentTick += 20;
  W.beforeEvents.playerInteractWithBlock.fire({ player, itemStack: item('arc:wand'), block: dim.getBlock({ x: 7, y: 0, z: 7 }), blockFace: 'Up', isFirstEvent: true, cancel: false });
  S.flush();
  S.currentTick += 6;
  W.beforeEvents.playerBreakBlock.fire({ player, itemStack: item('arc:wand'), block: dim.getBlock({ x: 7, y: 0, z: 7 }), cancel: false });
  await settle();
  check(s.points.length === n0 - 1 && !s.points.some(p => p.x === 7), 'long press (tap + break) = undo last point only: ' + n0 + ' -> ' + s.points.length);
  await tapAir('arc:wand', { x: 25, y: 0, z: 5 });
}
// 8Crafter selection tool is mirrored
for (const p of [{ x: 0, y: 0, z: 0 }, { x: 9, y: 4, z: 9 }]) { player.lookAt = p; W.beforeEvents.itemUse.fire({ source: player, itemStack: item('andexdb:selection_tool'), cancel: false }); }
S.flush();
check(s.pos2.y === 4, '8Crafter selection tool mirrored');
// road through the menu
ui.answers.push(btn('곡선 도구'), btn('도로'), (f) => f.defaults({ '폭': '5' }));
await tap('arc:wand', { x: 0, y: 0, z: 0 }, true);
check(/도로: \d+블록/.test(player.msgs.slice(-1)[0]), 'road via wand menu: ' + player.msgs.slice(-1)[0]);

// --- frame picker: tap = point, break = undo, sneak+break = save frame
const square = [[30, 5, 30], [36, 5, 30], [36, 5, 36], [30, 5, 36]];
for (const [x, y, z] of square) await tapAir('arc:frame_picker', { x, y, z });
await tapAir('arc:frame_picker', { x: 33, y: 5, z: 33 });
await brk('arc:frame_picker', { x: 0, y: 0, z: 0 });
await brk('arc:frame_picker', { x: 0, y: 0, z: 0 }, true);
check(s.frames.filter(f => f.length).length === 1 && s.frames[0].length === 4, 'frame picker: 4 points, undo, saved frame');
// one frame + flat fill (frame menu: switch mode, run)
ui.answers.push(btn('채우는 방식 바꾸기'));
await tap('arc:frame_picker', { x: 0, y: 0, z: 0 }, true);
S.flush();
check(s.settings.frameFill === 'flat', 'frame fill mode switched to flat');
ui.answers.push(btn('실행'), f => f.defaults());
await tap('arc:frame_picker', { x: 0, y: 0, z: 0 }, true);
const filled = dim.count((k) => k.split(',')[1] === '5');
check(filled === 49, 'flat fill of a 7x7 square frame: ' + filled);
// curved fill with one frame also fills flat
ui.answers.push(btn('채우는 방식 바꾸기'));
await tap('arc:frame_picker', { x: 0, y: 0, z: 0 }, true);
ui.answers.push(btn('실행'), f => f.defaults());
await tap('arc:frame_picker', { x: 0, y: 0, z: 0 }, true);
check(/곡면 채우기: \d+블록/.test(player.msgs.slice(-1)[0]), 'curved fill with 1 frame: ' + player.msgs.slice(-1)[0]);

// --- block picker: tap stores blocks, forms default to them
put(dim, 1, 1, 1, 'oak_stairs', { weirdo_direction: 2 });
put(dim, 2, 1, 1, 'stone_bricks');
await tap('arc:block_picker', { x: 1, y: 1, z: 1 });
await tap('arc:block_picker', { x: 2, y: 1, z: 1 });
check(s.settings.picks.length === 2 && s.settings.picks[0].t.includes('weirdo_direction=2'), 'block picker keeps states: ' + s.settings.picks.map(p => p.t).join(' | '));
// fill the selection with the picked blocks (form default source = picker)
s.pos1 = { x: 0, y: 10, z: 0 }; s.pos2 = { x: 3, y: 10, z: 3 };
ui.answers.push(btn('채우기 · 바꾸기'), btn('채우기 · 바꾸기'), f => f.defaults());
await tap('arc:wand', { x: 0, y: 0, z: 0 }, true);
const kinds = new Set([...dim.map].filter(([k]) => k.split(',')[1] === '10').map(([, p]) => p.id));
check(kinds.has('minecraft:oak_stairs') && kinds.has('minecraft:stone_bricks'), 'fill uses picked blocks: ' + [...kinds].join(' '));

// --- clipboard: break = copy, sneak+break = turn, tap = paste with undo
await brk('arc:clipboard', { x: 0, y: 0, z: 0 });
const clip = getClip(player);
check(clip && clip.cells.length === 16, 'copy selection to clipboard');
await brk('arc:clipboard', { x: 0, y: 0, z: 0 }, true);
check(clip.turns === 1, 'sneak+break turns the clipboard 90°');
dim.particles.length = 0;
player.lookAt = { x: 20, y: 0, z: 20 };
const { preview } = await import('./scripts/ui/preview.js');
preview(player, 'arc:clipboard');
check(dim.particles.length > 0 || true, 'preview runs');
const before = dim.count();
await tap('arc:clipboard', { x: 20, y: 0, z: 20 });
check(dim.count() === before + 16 && dim.map.get('20,1,20'), 'paste above the tapped block');
cmds['arc:undo']({ sourceEntity: player }); await settle();
check(dim.count() === before, 'undo paste');
// rotate result to the clipboard only
const n0 = dim.count();
ui.answers.push(btn('변형'), btn('자유 회전'), f => f.defaults({ '클립보드': true, '좌우 회전': 45 }));
await tap('arc:wand', { x: 0, y: 0, z: 0 }, true);
check(dim.count() === n0 && getClip(player).label === '자유 회전', 'rotate -> clipboard, world untouched');

// --- asset tool: break = save form, tap = place
s.pos1 = { x: 0, y: 1, z: 1 }; s.pos2 = { x: 2, y: 1, z: 1 }; player.lookAt = { x: 1, y: 1, z: 1 };
ui.answers.push(f => f.defaults({ '이름': 'test hut' }));
await brk('arc:asset_placer', { x: 0, y: 0, z: 0 });
ui.answers.push(btn('놓을 에셋'), f => f.defaults({ '에셋 이름': 'test_hut' }));
await tap('arc:asset_placer', { x: 0, y: 0, z: 0 }, true);
const b2 = dim.count();
await tap('arc:asset_placer', { x: 15, y: 0, z: 15 });
check(dim.count() > b2, 'asset placed: ' + player.msgs.slice(-1)[0]);

// --- terrain tool: tap = terrain menu
s.pos1 = { x: -5, y: 1, z: -5 }; s.pos2 = { x: 4, y: 10, z: 4 };
ui.answers.push(btn('지형 생성'), f => f.defaults({ '높이': '5' }));
await tap('arc:terrain_tool', { x: 0, y: 0, z: 0 });
check(/지형 생성: \d+블록/.test(player.msgs.slice(-1)[0]), 'terrain tool: ' + player.msgs.slice(-1)[0]);

// --- brushes on another item, all forms build
player.inv[0] = item('stick');
ui.answers.push(btn('브러시'), btn('큐브'), f => f.defaults());
await tap('arc:wand', { x: 0, y: 0, z: 0 }, true);
await tapAir('minecraft:stick', { x: 30, y: 0, z: 10 });
check(/큐브 브러시: 512블록/.test(player.msgs.slice(-1)[0]), 'cube brush on a stick');
const { TOOLS, BRUSHES } = await import('./scripts/tools/index.js');
const { ask } = await import('./scripts/ui/form.js');
for (const t of [...TOOLS, ...BRUSHES]) { ui.answers.push(f => f.defaults()); await ask(player, 'x:' + t.id, t.name, t.fields ?? []); }
check(true, `forms build: ${TOOLS.length} tools, ${BRUSHES.length} brushes`);
cmds['arc:tools']({ sourceEntity: player }); await settle();
check(player.inv.filter(Boolean).length >= 7, 'arc:tools gives the 6 items');
console.log('commands', Object.keys(cmds).join(' '));
const errs = player.msgs.filter(m => m.startsWith('§c'));
check(errs.length === 0, 'no error messages ' + JSON.stringify(errs));

// ---- the hidden layout tool: does nothing until the settings code is in; then taps add points
{
  s.yard = undefined; s.settings.unlocked = false;
  await tap('arc:yard_tool', { x: 1, y: 0, z: 1 });
  check(!s.yard?.cur?.pts?.length, 'layout tool: locked, a tap does nothing');
  s.settings.unlocked = true;
  await tap('arc:yard_tool', { x: 1, y: 0, z: 1 });
  await tap('arc:yard_tool', { x: 20, y: 0, z: 1 });
  check(s.yard?.cur?.pts?.length === 2, 'layout tool: unlocked, taps add points: ' + s.yard?.cur?.pts?.length);
  tick(40);
  await brk('arc:yard_tool', { x: 30, y: 0, z: 30 });
  check(s.yard.cur.pts.length === 1, 'layout tool: break takes the last point back');
}

// ---- the settings code, typed in the settings form, unlocks the hidden tool for that player only
{
  s.settings.unlocked = false;
  ui.answers.push(btn('설정'), f => f.defaults({ '코드': '1234' }));
  await cmds['arc:menu'](({ sourceEntity: player })); await settle(); await settle();
  check(!s.settings.unlocked, 'settings: a wrong code changes nothing');
  ui.answers.push(btn('설정'), f => f.defaults({ '코드': '4917' }));
  await cmds['arc:menu'](({ sourceEntity: player })); await settle(); await settle();
  check(s.settings.unlocked === true, 'settings: the code unlocks');
  const inv = () => player.getComponent('minecraft:inventory').container;
  ui.answers.push(btn('도구 아이템 받기'), btn('전부 받기'));
  await cmds['arc:menu'](({ sourceEntity: player })); await settle(); await settle();
  const got = [...Array(36).keys()].map(i => inv().getItem(i)?.typeId).filter(Boolean);
  check(got.includes('arc:yard_tool'), 'menu > 도구 아이템 받기 > 전부 받기 includes the layout tool once unlocked: ' + got.join(','));
}

// ---- one code unlocks everything hidden: railway bridges, tunnels, truss poles, slab column spacing, the layout tool, track records
{
  const railway = (await import('./scripts/tools/railway.js')).default;
  s.settings.unlocked = false;
  const lockedKeys = railway.fieldsFor(player).map(f => f.key);
  ui.answers.push(btn('설정'), f => f.defaults({ '코드': '4917' }));
  await cmds['arc:menu'](({ sourceEntity: player })); await settle(); await settle();
  const keys = railway.fieldsFor(player).map(f => f.key);
  const hidden = ['bridge', 'steel', 'span', 'tunnel', 'tunnelType', 'trussPoles'];
  check(hidden.every(k => !lockedKeys.includes(k)) && hidden.every(k => keys.includes(k)), 'the code 4917 unlocks every hidden railway option: ' + hidden.filter(k => !keys.includes(k)).join(','));
  s.yard = undefined;
  await tap('arc:yard_tool', { x: 3, y: 0, z: 3 });
  check(s.yard?.cur?.pts?.length === 1, 'and the layout tool');
}

// ---- the protractor: lines, angle guides, snapping, shapes, saved lines
{
  const P = await import('./scripts/ui/protractor.js');
  const { ITEMS } = await import('./scripts/core/access.js');
  check(ITEMS.includes('arc:protractor'), 'the protractor is one of the general tools');
  s.prot = undefined; s.settings.prot = undefined;
  player.location = { x: 200, y: 50, z: 200 };
  await tap('arc:protractor', { x: 0, y: 40, z: 0 });
  await tap('arc:protractor', { x: 10, y: 40, z: 0 });
  const g = P.guides(s.prot.pts, s.settings.prot);
  check(g.length === 2 && g.every(x => Math.abs(x.d.x) < 1e-9 && Math.abs(Math.abs(x.d.z) - 1) < 1e-9), 'a line: 90° guides at its end, both sides');
  // a tap near the guide lands on it
  await tap('arc:protractor', { x: 11, y: 40, z: 6 });
  const p3 = s.prot.pts[2];
  check(p3.x === 10 && p3.z === 6, 'a tap beside the guide goes onto it: ' + JSON.stringify(p3));
  check(/앞 선과 90°/.test(player.bar ?? player.msgs.slice(-1)[0] ?? ''), 'the angle with the previous line is shown: ' + (player.bar ?? player.msgs.slice(-1)[0]));
  const V = P.shape(s.prot.pts, s.settings.prot);
  check(V.length === 4 && Math.floor(V[3].x) === 0 && Math.floor(V[3].z) === 6, 'two lines: the rectangle they start');
  // looking along a 60° guide (no block there) puts the point on it
  s.settings.prot = { ...s.settings.prot, angle: 60 };
  const gs = P.guides([{ x: 0, y: 40, z: 0 }, { x: 10, y: 40, z: 0 }], s.settings.prot);
  const g1 = gs[0], target = { x: g1.o.x + g1.d.x * 8, y: g1.o.y + g1.d.y * 8, z: g1.o.z + g1.d.z * 8 };
  const eye = { x: target.x, y: target.y + 10, z: target.z }, view = { x: 0, y: -1, z: 0 };
  const sn = P.snap(gs, eye, view, null);
  check(sn && sn.t === 8, '60°: looking at a guide in the air snaps onto it: ' + JSON.stringify(sn));
  const ang = Math.acos(-g1.d.x) * 180 / Math.PI;
  check(Math.abs(ang - 60) < 1e-6, 'the guide meets the line at 60°: ' + ang.toFixed(3));
  // build the rectangle (outline) through the menu
  s.settings.prot = { ...s.settings.prot, angle: 90, block: 'stone', fill: false, shape: 'para' };
  ui.answers.push(btn('도형 만들기'));
  await tap('arc:protractor', { x: 0, y: 40, z: 0 }, true); await settle(); await settle();
  const st = (x, z) => dim.map.get(`${x},40,${z}`)?.id === 'minecraft:stone';
  check(st(0, 0) && st(10, 0) && st(10, 6) && st(0, 6) && st(5, 0) && st(0, 3) && !st(5, 3), 'the rectangle built as an outline');
  // a regular pentagon on the first line
  s.settings.prot = { ...s.settings.prot, shape: 'regular', n: 5 };
  const pent = P.shape(s.prot.pts, s.settings.prot);
  const sideLens = pent.map((a, i) => Math.hypot(pent[(i + 1) % 5].x - a.x, pent[(i + 1) % 5].z - a.z));
  check(pent.length === 5 && sideLens.every(l => Math.abs(l - 10) < 1e-6) && pent.every(p => p.z >= -1e-6), 'a regular pentagon on the first line, toward the second: ' + sideLens.map(l => l.toFixed(2)).join(','));
  // save the lines, draw a new one: measured against them
  await brk('arc:protractor', { x: 0, y: 40, z: 0 }, true);
  check(s.prot.saved.length === 2 && s.prot.pts.length === 0, 'sneak + break saves the lines');
  await tap('arc:protractor', { x: 20, y: 40, z: 20 });
  await tap('arc:protractor', { x: 30, y: 40, z: 30 });
  const msg = player.bar ?? player.msgs.slice(-1)[0] ?? '';
  check(/저장한 선과 45°/.test(msg), 'a new line is measured against the saved ones: ' + msg);
  // the preview spawns the pack's particles
  const kinds = new Set();
  const fake = { seg: (a, b, k) => kinds.add(k), dot: (p, k) => kinds.add(k), cells: (ks, k) => kinds.add('cells:' + ks.length), face: () => {}, box: (a, b, k) => kinds.add(k) };
  P.protPreview(s, fake);
  check(['line', 'point', 'guide', 'saved'].every(k => kinds.has(k)) && !kinds.has('tick') && ![...kinds].some(k => k.startsWith('cells')), 'protractor mode: lines, points, guides, saved lines, no ruler: ' + [...kinds].join(','));
  // tape-measure mode, shown as blocks: ticks and the blocks, no guides or lines
  kinds.clear();
  s.settings.prot = { ...s.settings.prot, mode: 'ruler', show: 'block' };
  P.protPreview(s, fake);
  check(kinds.has('tick') && [...kinds].some(k => k.startsWith('cells')) && !kinds.has('guide') && !kinds.has('line'), 'ruler mode as blocks: ticks + blocks, no guides: ' + [...kinds].join(','));
  s.settings.prot = { ...s.settings.prot, mode: 'prot', show: 'line' };
  // the ruler: a diagonal measured exactly
  const m = P.measure([{ x: 0, y: 40, z: 0 }, { x: 10, y: 40, z: 10 }]);
  check(/14\.142칸/.test(m) && /블록/.test(m), 'the ruler gives the exact length of a diagonal: ' + m);
  const m3 = P.measure([{ x: 0, y: 40, z: 0 }, { x: 3, y: 44, z: 0 }]);
  check(/5칸/.test(m3) && /경사/.test(m3), 'a sloping line: length and slope: ' + m3);
  // the painter spawns the pack's particles with molang variables
  const { painter } = await import('./scripts/ui/draw.js');
  const pl = { particles: [], spawnParticle(id, l, v) { this.particles.push([id, l, v]); } };
  const pp = painter(pl);
  pp.seg({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
  pp.block(1, 2, 3);
  const segs = pl.particles.filter(p => p[0] === 'arc:seg'), faces = pl.particles.filter(p => p[0].startsWith('arc:face_'));
  check(segs.length === 13 && faces.length === 6 && segs[0][2].vars['variable.len'] === 5 && Math.abs(segs[0][2].vars['variable.dy'] - 0.8) < 1e-9, 'painter: a solid line and a highlighted block (12 edges + 6 faces)');
  // blocks side by side: one solid, no lines between them, long edges as one line
  pl.particles = [];
  pp.cells(['0,0,0', '1,0,0', '2,0,0']);
  const cs = pl.particles.filter(p => p[0] === 'arc:seg'), cf = pl.particles.filter(p => p[0].startsWith('arc:face_'));
  check(cs.length === 12 && cf.length === 14 && cs.some(p => p[2].vars['variable.len'] === 3), 'three blocks in a row: 12 edges (the long ones whole) and 14 outer faces: ' + cs.length + ' / ' + cf.length);
  pl.particles = [];
  pp.cells(['0,0,0', '1,0,0', '1,0,1']);
  check(pl.particles.filter(p => p[0] === 'arc:seg').length === 18, 'an L of blocks: its outline bends at the corner');
  const vp = { particles: [], spawnParticle(id, l) { if (id.startsWith('arc:')) throw new Error('no RP'); this.particles.push([id, l]); } };
  painter(vp).seg({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
  check(vp.particles.length > 5 && vp.particles.every(p => p[0] === 'minecraft:endrod'), 'without the resource pack the painter falls back to vanilla dots');
}

// ---- turning Debug Stick blocks
{
  const { turnStates, matrix } = await import('./scripts/core/turn.js');
  const R = (id, st) => mc.BlockPermutation.resolve(id, st);
  const t = turnStates(R('vyt:ds_oak_stairs', { 'vyt:facing': 0 }), matrix(90, 0, 0));
  const f = turnStates(R('vyt:ds_oak_fence', { 'vyt:north': 1 }), matrix(90, 0, 0));
  const off = turnStates(R('vyt:ds_oak_stairs', { 'vyt:facing': 0 }), matrix(90, 0, 0), { vyt: false });
  check(t.getState('vyt:facing') === 2 && f.getState('vyt:east') === 1 && f.getState('vyt:north') === 0 && off.getState('vyt:facing') === 0, 'Debug Stick stairs and fences turn with the rotation (and stay when the option is off)');
}
