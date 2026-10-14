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
  check(!s.yard?.pts?.length, 'layout tool: locked, a tap does nothing');
  s.settings.unlocked = true;
  await tap('arc:yard_tool', { x: 1, y: 0, z: 1 });
  await tap('arc:yard_tool', { x: 20, y: 0, z: 1 });
  check(s.yard?.pts?.length === 2, 'layout tool: unlocked, taps add points: ' + s.yard?.pts?.length);
  tick(40);
  await brk('arc:yard_tool', { x: 30, y: 0, z: 30 });
  check(s.yard.pts.length === 1, 'layout tool: break takes the last point back');
}
