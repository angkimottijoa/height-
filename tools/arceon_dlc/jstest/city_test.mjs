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
check(msgs.some(m => /평면 반경 150m/.test(m)), 'flat ground mode');
// the default: drawn like the map (a light ground everywhere, roads in colours, footprints by height, rails as lines)
({ dim, player } = world({ id: 'cm', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
msgs = await runTool(city, { city: 'shinjuku', range: 150 }, { player });
const kinds = new Map();
for (const [k, p] of dim.map) kinds.set(p.id, (kinds.get(p.id) ?? 0) + 1);
console.log([...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => k.replace('minecraft:', '') + ' ' + v).join(', '));
check(msgs.some(m => /지도 반경 150m/.test(m)) && dim.map.size === 301 * 301 && [...dim.map.keys()].every(k => +k.split(',')[1] === g), 'map style is the default: every column of the area drawn, all at ground level');
check(kinds.get('minecraft:black_concrete') > 300 && !kinds.has('minecraft:rail') && kinds.get('minecraft:smooth_sandstone') > 1000, 'railways as dark lines, main roads pale yellow');
({ dim, player } = world({ id: 'cn', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
await runTool(city, { city: 'shinjuku', range: 100, rails: 'none' }, { player });
check(![...dim.map.values()].some(p => p.id === 'minecraft:pink_concrete_powder' || p.id === 'minecraft:red_concrete'), 'railways off: no tracks or platforms');

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
