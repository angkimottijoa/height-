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
msgs = await runTool(city, { city: 'tokyo', range: 160 }, { player });
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

// turned to true north: the tracks are no longer along Z
({ dim, player } = world({ id: 'c2', location: { x: 0.5, y: -59, z: 0.5 } }));
session(player).settings.unlocked = true;
await runTool(city, { city: 'tokyo', range: 40, base: 'north', angle: 0 }, { player });
const rails = [...dim.map].filter(([k, p]) => p.id === 'minecraft:rail').map(([k]) => k.split(',').map(Number));
const xs = new Set(rails.map(r => r[0]));
check(rails.length > 20 && xs.size > 12, 'true north: the tracks run slanted (over ' + xs.size + ' columns)');

// a smaller range builds less, every city loads
for (const id of ['shinjuku', 'shibuya', 'umeda']) {
  ({ dim, player } = world({ id: 'c-' + id, location: { x: 0.5, y: -59, z: 0.5 } }));
  session(player).settings.unlocked = true;
  t = Date.now();
  msgs = await runTool(city, { city: id, range: 60, angle: 30 }, { player });
  check(dim.map.size > 2000 && msgs.some(m => /회전 30°/.test(m)), `${id}: built ${dim.map.size} blocks, turned 30° (${Date.now() - t}ms)`);
}
