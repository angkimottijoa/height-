// City map tool: hidden without the code; builds buildings, roads, rails at 1:1 around the player; range and turn.
import { load, world, runTool, mc } from './harness.mjs';
const { session } = await import('./scripts/core/session.js');
const city = await load('tools/city.js');
mc.system.autoTimers = true;
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (dim, f) => { let n = 0; for (const [k, p] of dim.map) if (f(k, p)) n++; return n; };

// locked: nothing happens
let { dim, player } = world({ id: 'c0', location: { x: 0.5, y: -59, z: 0.5 } });
let msgs = await runTool(city, { city: 'tokyo', range: 50 }, { player });
check(dim.map.size === 0 && msgs.some(m => /사용할 수 없습니다/.test(m)), 'without the code the city tool does nothing');

// Tokyo, 160 blocks around the station
({ dim, player } = world({ id: 'c1', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
let t = Date.now();
msgs = await runTool(city, { city: 'tokyo', range: 160, mode: '3d' }, { player });
console.log(msgs.filter(m => !m.startsWith('[bar]')).slice(-2).join(' | '), (Date.now() - t) + 'ms');
const ids = new Map();
for (const p of dim.map.values()) ids.set(p.id, (ids.get(p.id) ?? 0) + 1);
console.log([...ids].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k.replace('minecraft:', '') + ' ' + v).join(', '));
const g = -60;
check(count(dim, (k, p) => p.id === 'minecraft:rail' && +k.split(',')[1] === g + 9) > 50, 'Tokyo Station: elevated tracks (rails 8 up on a viaduct) around the station');
check(count(dim, (k, p) => p.id === 'minecraft:gray_concrete' && +k.split(',')[1] === g) > 100, 'streets of asphalt at ground level');
let tallest = -1e9; for (const k of dim.map.keys()) tallest = Math.max(tallest, +k.split(',')[1]);
check(tallest > g + 25, 'buildings rise to their height: top at ' + (tallest - g) + ' m');
const out = [...dim.map.keys()].some(k => { const [x, , z] = k.split(',').map(Number); return Math.abs(x) > 160 || Math.abs(z) > 160; });
check(!out, 'nothing outside the range (160 each way)');
check(msgs.some(m => /OpenStreetMap/.test(m)), 'the map credit is shown');

// the map itself (default): everything flat on the ground, rails on top
({ dim, player } = world({ id: 'cf', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
msgs = await runTool(city, { city: 'shinjuku', range: 150, mode: 'flat' }, { player });
const ys = new Map();
for (const [k, p] of dim.map) { const y = +k.split(',')[1]; ys.set(y, (ys.get(y) ?? 0) + 1); }
const foot = count(dim, (k, p) => p.id === 'minecraft:white_concrete' && +k.split(',')[1] === g);
check([...ys.keys()].every(y => y === g || y === g + 1) && foot > 1000 && count(dim, (k, p) => p.id === 'minecraft:rail') > 50, 'map mode: flat on the ground (building footprints ' + foot + ', roads, tracks): heights ' + [...ys.keys()].map(y => y - g).join(','));
check(msgs.some(m => /평면 1:1 반경 150칸/.test(m)), 'flat ground mode');
// the default: drawn like the map (a light ground everywhere, roads in colours, footprints by height, rails as lines)
({ dim, player } = world({ id: 'cm', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
msgs = await runTool(city, { city: 'shinjuku', range: 150 }, { player });
const kinds = new Map();
for (const [k, p] of dim.map) kinds.set(p.id, (kinds.get(p.id) ?? 0) + 1);
console.log([...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => k.replace('minecraft:', '') + ' ' + v).join(', '));
check(msgs.some(m => /지도 1:1 반경 150칸/.test(m)) && dim.map.size === 301 * 301 && [...dim.map.keys()].every(k => +k.split(',')[1] === g), 'map style is the default: every column of the area drawn, all at ground level');
check(!kinds.has('minecraft:light_gray_concrete_powder') && !kinds.has('minecraft:pink_concrete_powder') && !kinds.has('minecraft:gravel') && kinds.get('minecraft:black_concrete') > 300 && !kinds.has('minecraft:rail') && kinds.get('minecraft:smooth_sandstone') > 1000, 'railways as dark lines, main roads pale yellow, nothing that falls (wool, not powder)');
({ dim, player } = world({ id: 'cn', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
await runTool(city, { city: 'shinjuku', range: 100, rails: 'none' }, { player });
check(![...dim.map.values()].some(p => p.id === 'minecraft:pink_wool' || p.id === 'minecraft:red_concrete'), 'railways off: no tracks or platforms');
// scale: twice as big (1 m = 2 blocks): the same area takes twice the range, 4 times the blocks per thing
{
  const kindsIn = async (scale, R) => {
    const { dim: dd, player: pp } = world({ id: 'cs' + scale, location: { x: 0.5, y: -59, z: 0.5 } });
    session(pp).settings.unlocked = true;
    const m = await runTool(city, { city: 'shibuya', range: R, scale: String(scale) }, { player: pp });
    const n = new Map();
    for (const p of dd.map.values()) n.set(p.id, (n.get(p.id) ?? 0) + 1);
    return { n, m };
  };
  const a1 = await kindsIn(1, 60), a2 = await kindsIn(2, 120);
  const tot = (x) => [...x.n.values()].reduce((t, v) => t + v, 0);
  const bld = (x) => ['minecraft:white_terracotta', 'minecraft:light_blue_terracotta', 'minecraft:gray_concrete'].reduce((t, k) => t + (x.n.get(k) ?? 0), 0);
  console.log('total', tot(a1), tot(a2), 'buildings', bld(a1), bld(a2));
  check(tot(a2) / tot(a1) > 3.5 && tot(a2) / tot(a1) < 4.5 && bld(a2) / bld(a1) > 3 && bld(a2) / bld(a1) < 5 && a2.m.some(x => /2배 반경 120칸/.test(x)), 'scale x2: the same area in twice the range, about 4x the blocks: ' + (tot(a2) / tot(a1)).toFixed(2) + ' (buildings ' + (bld(a2) / bld(a1)).toFixed(2) + ')');
}
// one undo takes the whole city away again
const { undo, redo, history } = await import('./scripts/core/edit.js');
const built = [...dim.map].filter(([k, p]) => p.id !== 'minecraft:air').length;
await undo(player);
check([...dim.map.values()].every(p => p.id === 'minecraft:air') && player.msgs.some(m => /되돌림: 도시 지도/.test(m)), 'undo: the whole city is gone in one step');
check(mc.world.structureManager.getWorldStructureIds().filter(i => i.startsWith('arcundo:')).length > 0, 'undo/redo kept as structures in the world (not in script memory)');
await redo(player);
check([...dim.map].filter(([k, p]) => p.id !== 'minecraft:air').length === built, 'redo: the city is back');
// after leaving and coming back (the history is gone), undo still works from what the player keeps
history(player).undo.length = 0;
await undo(player);
check([...dim.map.values()].every(p => p.id === 'minecraft:air'), 'undo still works after a rejoin');
check(!(session(player).bigUndo ?? []).length, 'and it is not undone twice');

// turned to true north: the tracks are no longer along Z
({ dim, player } = world({ id: 'c2', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
await runTool(city, { city: 'tokyo', range: 40, base: 'north', angle: 0, mode: '3d' }, { player });
const rails = [...dim.map].filter(([k, p]) => p.id === 'minecraft:rail').map(([k]) => k.split(',').map(Number));
const xs = new Set(rails.map(r => r[0]));
check(rails.length > 20 && xs.size > 12, 'true north: the tracks run slanted (over ' + xs.size + ' columns)');

// a smaller range builds less, every city loads
for (const id of ['shinjuku', 'shibuya', 'umeda']) {
  ({ dim, player } = world({ id: 'c-' + id, location: { x: 0.5, y: -59, z: 0.5 } }));
  session(player).settings.unlocked = true;
  t = Date.now();
  msgs = await runTool(city, { city: id, range: 60, angle: 30, mode: '3d' }, { player });
  check(dim.map.size > 2000 && msgs.some(m => /회전 30°/.test(m)), `${id}: built ${dim.map.size} blocks, turned 30° (${Date.now() - t}ms)`);
}

// the menus: no button without the code; the settings code brings it into the main, wand and terrain menus
{
  const ui = await import('@minecraft/server-ui');
  const M = await import('./scripts/ui/menu.js');
  const { player: p } = world({ id: 'cmenu' });
  const labels = () => new Promise(res => ui.answers.push((f) => { res(f.items.filter(i => i[0] === 'button').map(b => b[1])); return { canceled: true }; }));
  let l = labels(); await M.openMenu(p); const before = await l;
  check(!before.some(t => /도시 지도/.test(t)), 'no city button before the code');
  // settings: type the code
  ui.answers.push((f) => ({ canceled: false, selection: f.items.filter(i => i[0] === 'button').findIndex(b => b[1] === '설정') }));
  ui.answers.push((f) => f.defaults({ '코드': '4917' }));
  await M.openMenu(p);
  mc.system.flush();
  for (const fn of ['openMenu', 'wandMenu', 'terrainMenu']) {
    l = labels(); await M[fn](p);
    check((await l).some(t => /도시 지도 불러오기/.test(t)), `after the code: the city button in ${fn}`);
  }
}
