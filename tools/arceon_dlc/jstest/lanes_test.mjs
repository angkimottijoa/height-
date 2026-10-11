// Lane road: cross section, dash length/gap, stagger, thin diagonal lines, sides, median, U-turn.
import { load, world, runTool, put } from './harness.mjs';
const lanes = await load('tools/lanes.js');
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const ch = { 'minecraft:gray_concrete': '.', 'minecraft:yellow_concrete': 'Y', 'minecraft:white_concrete': 'W' };
const view = (dim, x0, z0, x1, z1, y = 0) => { const r = []; for (let z = z0; z <= z1; z++) { let s = ''; for (let x = x0; x <= x1; x++) s += ch[dim.map.get(`${x},${y},${z}`)?.id] ?? ' '; r.push(s); } return r; };
// straight road, defaults (3 + 3 lanes)
let { dim, player } = world({ id: 'l1' });
let m = await runTool(lanes, {}, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
let rows = view(dim, 0, -13, 40, 13);
console.log(rows.join('\n'));
check(rows.filter(r => r.trim()).length === 25, 'straight: width 25');
const dashRow = rows.find(r => r.includes('W'));
check(/^\.*WWWW\.\.\.\.WWWW/.test(dashRow.trim()), 'dashes 4 on 4 off');
// 45 degrees: every painted line is one block thick
({ dim, player } = world({ id: 'l2' }));
m = await runTool(lanes, { left: 2, right: 2 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 40 }] });
rows = view(dim, -10, -10, 50, 50);
console.log(rows.slice(15, 35).map(r => r.slice(10, 50)).join('\n'));
// a thin 45° line has exactly one cell per row of it; count yellow centre cells on the diagonal band
let thick = 0;
for (let x = 5; x < 35; x++) for (let z = 5; z < 35; z++) {
  const id = (a, b) => dim.map.get(`${a},0,${b}`)?.id;
  if (id(x, z) === 'minecraft:yellow_concrete' && id(x + 1, z) === 'minecraft:yellow_concrete' && id(x, z + 1) === 'minecraft:yellow_concrete') thick++;
}
check(thick === 0, '45°: no L-shaped (2 thick) yellow corners: ' + thick);
let thickW = 0;
for (let x = 5; x < 35; x++) for (let z = 5; z < 35; z++) {
  const id = (a, b) => dim.map.get(`${a},0,${b}`)?.id;
  if (id(x, z) === 'minecraft:white_concrete' && id(x + 1, z) === 'minecraft:white_concrete' && id(x, z + 1) === 'minecraft:white_concrete') thickW++;
}
check(thickW === 0, '45°: white dashes one block thick: ' + thickW);
// 30 degrees too
({ dim, player } = world({ id: 'l3' }));
await runTool(lanes, {}, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 52, y: 0, z: 30 }] });
let l3 = 0;
for (const [k, p] of dim.map) { if (p.id !== 'minecraft:yellow_concrete') continue; const [x, , z] = k.split(',').map(Number); const id = (a, b) => dim.map.get(`${a},0,${b}`)?.id; if (id(x + 1, z) === p.id && id(x, z + 1) === p.id) l3++; }
check(l3 === 0, '30°: yellow lines one block thick: ' + l3);
// left 3 / right 4, median 3 filled, U-turn at the end
({ dim, player } = world({ id: 'l4' }));
m = await runTool(lanes, { left: 3, right: 4, median: 3, uturn: 12 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
console.log(m.slice(-1)[0]);
rows = view(dim, 0, -16, 40, 16);
console.log(rows.join('\n'));
const filled = rows.filter(r => /^Y{20}/.test(r.trim())).length;
check(filled === 3 + 2, 'median 3 rows + 2 edges solid yellow at the start: ' + filled);
const ut = rows.find(r => /W\.W\.W/.test(r.slice(30)));
check(!!ut, 'U-turn dotted line at the end');
check(/폭 31칸/.test(m.slice(-1)[0]), 'width = 2 edges + 7 lanes x3 + 5 dash lines + median 3');
// hatch median
({ dim, player } = world({ id: 'l5' }));
m = await runTool(lanes, { median: 5, medianStyle: 'hatch' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] });
console.log(view(dim, 0, -3, 30, 3).join('\n'));
check(/§a/.test(m.slice(-1)[0]), 'hatched median runs');
// shoulder: asphalt outside the edge lines
({ dim, player } = world({ id: 'l6' }));
await runTool(lanes, { left: 1, right: 1, shoulder: 2 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }] });
rows = view(dim, 0, -8, 20, 8).filter(r => r.trim());
console.log(rows.join('\n'));
check(rows.length === 13 && /^\.+$/.test(rows[0].trim()) && /^\.+$/.test(rows[1].trim()) && /^Y+$/.test(rows[2].trim()), 'shoulder 2: two asphalt rows outside the yellow edge');
// advanced: right side lane widths 2,4,3 and lines (solid, dash); left one lane
({ dim, player } = world({ id: 'l7' }));
await runTool(lanes, { left: 1, right: 3, advanced: true, wL0: 3, wR0: 2, wR1: 4, wR2: 3, sR0: 'solid', sR1: 'dash' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }] });
rows = view(dim, 0, -12, 20, 12).filter(r => r.trim());
console.log(rows.join('\n'));
const sig = rows.map(r => r.trim()[0] === 'Y' ? 'Y' : r.includes('W') ? (/^W+$/.test(r.trim()) ? 'S' : 'D') : '.').join('');
console.log('cross section', sig);
check(sig === 'Y...Y..S....D...Y', 'advanced: widths 3 | 2 solid 4 dash 3: ' + sig);
// custom preset: build a tile by hand (7 wide, 4 long), save it, sweep it
const presets = await import('./scripts/lib/lane_presets.js');
({ dim, player } = world({ id: 'l8' }));
for (let x = 100; x <= 103; x++) for (let z = 100; z <= 106; z++) put(dim, x, 5, z, 'black_concrete');
for (let x = 100; x <= 103; x++) put(dim, x, 5, 103, 'red_concrete');            // a solid red centre line (column 3)
for (let x = 100; x <= 101; x++) { put(dim, x, 5, 101, 'white_concrete'); put(dim, x, 5, 105, 'white_concrete'); } // dashes 2 on 2 off
for (let x = 100; x <= 103; x++) for (let z = 100; z <= 106; z++) put(dim, x, 4, z, 'stone');  // a base layer
const preset = await load('tools/lanepreset.js');
m = await runTool(preset, { action: 'save', name: 'test road', dir: 'x' }, { player, region: [{ x: 100, y: 4, z: 100 }, { x: 103, y: 5, z: 106 }] });
console.log(m.slice(-1)[0]);
check(presets.presetNames().includes('test road'), 'custom lane saved');
m = await runTool(lanes, { preset: 'test road' }, { player, points: [{ x: 0, y: 5, z: 0 }, { x: 30, y: 5, z: 30 }] });
console.log(m.slice(-1)[0]);
const ids = {}; for (const [k, p] of dim.map) { const [x, y, z] = k.split(',').map(Number); if (x < 90) ids[p.id] = (ids[p.id] ?? 0) + 1; }
console.log(JSON.stringify(ids));
check(ids['minecraft:red_concrete'] > 20 && ids['minecraft:white_concrete'] > 10 && ids['minecraft:stone'] > 100, 'custom sweep uses the tile (lines, base, lower layer)');
let thickR = 0;
for (const [k, p] of dim.map) { if (p.id !== 'minecraft:red_concrete') continue; const [x, y, z] = k.split(',').map(Number); if (x > 90) continue; const id = (a, b) => dim.map.get(`${a},${y},${b}`)?.id; if (id(x + 1, z) === p.id && id(x, z + 1) === p.id) thickR++; }
check(thickR === 0, 'custom red line one block thick at 45°: ' + thickR);
await runTool(preset, { action: 'remove', target: 'test road' }, { player });
check(!presets.presetNames().includes('test road'), 'custom lane removed');
