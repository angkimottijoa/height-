// Lane road: cross section, dash length/gap, stagger, diagonal.
import { load, world, runTool, put } from './harness.mjs';
const lanes = await load('tools/lanes.js');
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
let { dim, player } = world({ id: 'l1' });
for (let x = -2; x < 45; x++) for (let z = -20; z < 20; z++) put(dim, x, 0, z, 'grass_block');
const msgs = await runTool(lanes, {}, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
console.log(msgs.slice(-1)[0]);
const ch = { 'minecraft:gray_concrete': '.', 'minecraft:yellow_concrete': 'Y', 'minecraft:white_concrete': 'W', 'minecraft:grass_block': ' ' };
const rows = [];
for (let z = -13; z <= 13; z++) { let r = ''; for (let x = 0; x <= 40; x++) r += ch[dim.map.get(`${x},0,${z}`)?.id] ?? '?'; rows.push(r); }
console.log(rows.join('\n'));
const colOf = (z) => rows[z + 13];
check(colOf(0).replace(/ /g, '') === 'Y'.repeat(colOf(0).trim().length), 'centre line solid yellow at z=0');
const width = rows.filter(r => r.trim().length > 30).length;
check(width === 25, 'width 25 = 2 edges + 6 lanes x3 + 4 dash lines + centre: ' + width);
const dashRow = rows.find(r => r.includes('W'));
check(/^\.*WWWW\.\.\.\.WWWW/.test(dashRow.replace(/ /g, '')), 'dashes 4 on 4 off: ' + dashRow);
const dashRows = rows.filter(r => r.includes('W'));
check(dashRows.length === 4 && dashRows[0] !== dashRows[1], 'four dash lines, neighbours staggered');
// diagonal + curve runs and keeps colours
({ dim, player } = world({ id: 'l2' }));
const m2 = await runTool(lanes, { centerType: 'double', lanes: 2 }, { player, points: [{ x: 0, y: 5, z: 0 }, { x: 30, y: 5, z: 25 }, { x: 60, y: 5, z: 10 }] });
const ids = new Set([...dim.map.values()].map(p => p.id));
check(ids.has('minecraft:white_concrete') && ids.has('minecraft:yellow_concrete') && ids.has('minecraft:gray_concrete'), 'curved double-centre road: ' + m2.slice(-1)[0]);
