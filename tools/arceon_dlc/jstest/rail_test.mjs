// Railway: built-in track (cross section, anvil rails along the track, thin on diagonals),
// a pole saved as an asset stood along the line (exact and 90° turns), wires between poles, saved track pieces.
import { load, world, runTool, put, mc } from './harness.mjs';
const { session } = await import('./scripts/core/session.js');
const assets = await import('./scripts/tools/assets.js');
const railway = await load('tools/railway.js');
const trackpreset = await load('tools/trackpreset.js');
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const short = (p) => p.id.replace('minecraft:', '');
const ch = (p) => !p ? ' ' : p.id.endsWith('anvil') ? 'A' : p.id.endsWith('slab') ? 's' : p.id.endsWith('gravel') ? '.' : p.id.endsWith('button') ? 'b' : p.id.endsWith('air') ? ' ' : '#';
const view = (dim, y, x0, z0, x1, z1) => { const r = []; for (let z = z0; z <= z1; z++) { let s = ''; for (let x = x0; x <= x1; x++) s += ch(dim.map.get(`${x},${y},${z}`)); r.push(s); } return r; };

// ---- straight along +x, built-in double track
let { dim, player } = world({ id: 'r1' });
let m = await runTool(railway, { pole: '' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] });
console.log(m.slice(-1)[0]);
console.log('layer 1 (sleepers + rails):\n' + view(dim, 1, 0, -11, 12, 11).join('\n'));
const l0 = view(dim, 0, 0, -11, 30, 11).filter(r => r.includes('.'));
const l1 = view(dim, 1, 0, -11, 30, 11);
check(l0.length === 2 * (1 + 6 + 1) + 1, 'ballast width 17 (2 tracks × (1+6+1) + 1 between, 2 cells between the anvils): ' + l0.length);
const railRows = l1.filter(r => /^A+$/.test(r.trim()));
check(railRows.length === 4, '4 rails, continuous: ' + railRows.length);
const anv = [...dim.map.values()].filter(p => p.id.endsWith('anvil'));
check(anv.every(p => ['east', 'west'].includes(p.states['minecraft:cardinal_direction'])), 'anvils lie along the track (east/west for an x track)');
check(l1.filter(r => /^(#s)+#?$/.test(r.trim())).length === 8, 'sleepers (full blocks) 1 on, 1 off, slabs between');
const rows = view(dim, 1, 0, -11, 30, 11);
check(rows.filter(r => r.includes('A')).length === 4 && rows.indexOf(rows.find(r => r.includes('A')), 0) + 3 === rows.findIndex((r, i) => i > rows.findIndex(q => q.includes('A')) && r.includes('A')), 'two cells between the two anvils');
const top = {}; for (const [k, p] of dim.map) if (k.split(',')[1] === '1' && p.id.endsWith('slab')) top[short(p)] = (top[short(p)] ?? 0) + 1;
console.log('slabs on the gravel:', JSON.stringify(top));
const tot = Object.values(top).reduce((a, b) => a + b, 0);
check(top.andesite_slab / tot > 0.5 && top.andesite_slab / tot < 0.7 && top.normal_stone_slab && top.cobblestone_slab && top.tuff_slab, 'slab mix ~60% andesite, stone, cobblestone, tuff');
check([...dim.map].every(([k, p]) => !p.id.endsWith('slab') || p.states['minecraft:vertical_half'] === 'bottom'), 'all bottom slabs');
check([...dim.map.values()].some(p => p.id === 'minecraft:mud_bricks') && ![...dim.map.values()].some(p => p.id === 'minecraft:mud_brick_slab'), 'sleepers are mud bricks (not slabs)');

// ---- three tracks, gauge 3, custom sleeper mix from the advanced form
({ dim, player } = world({ id: 'r1b' }));
m = await runTool(railway, { pole: '', tracks: 3, gauge: 3, 'sleeper#src': 1, 'sleeper#text': '50%mud_bricks,50%packed_mud', 'top#src': 1, 'top#text': 'andesite_slab' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] });
console.log(m.slice(-1)[0]);
const l1b = view(dim, 1, 0, -16, 30, 16);
check(l1b.filter(r => /^A+$/.test(r.trim())).length === 6, '3 tracks: 6 rails');
const sk = {}; for (const p of dim.map.values()) sk[short(p)] = (sk[short(p)] ?? 0) + 1;
check(sk.packed_mud > 20 && sk.mud_bricks > 20 && !sk.tuff_slab, 'sleeper mix and top slab from the advanced form: ' + JSON.stringify(sk));

// ---- the built-in pole (the user's gantry) along a double track
({ dim, player } = world({ id: 'r1c' }));
m = await runTool(railway, { poleEvery: 20 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
console.log(m.slice(-1)[0]);
check(/전신주 3개, 전선 8가닥/.test(m.slice(-1)[0]), 'built-in pole is the default: 3 poles, 8 wires (4 contact + 4 feeder)');
const pv = (x) => { const r = []; for (let y = 15; y >= 0; y--) { let t = ''; for (let z = -13; z <= 13; z++) { const p = dim.map.get(`${x},${y},${z}`); t += !p ? ' ' : p.id.endsWith('wall') ? '|' : p.id.endsWith('slab') ? (p.states['minecraft:vertical_half'] === 'top' ? '"' : '_') : p.id.endsWith('lantern') ? 'L' : p.id.endsWith('end_rod') ? '-' : p.id.endsWith('button') ? 'b' : p.id.endsWith('anvil') ? 'A' : p.id.endsWith('gravel') ? '.' : '#'; } r.push(t); } return r; };
console.log('pole at x=20, seen along the track:\n' + pv(20).join('\n'));
const bposts = [...dim.map].filter(([k, p]) => p.id === 'minecraft:andesite_wall' && k.split(',')[1] === '5').map(([k]) => +k.split(',')[2]);
check(bposts.length === 6 && bposts.every(z => Math.abs(z) === 11), 'posts 11 blocks either side: ' + bposts.join(' '));
const hang = [...dim.map].filter(([k, p]) => p.id === 'minecraft:cobbled_deepslate_wall' && k.split(',')[1] === '8' && k.split(',')[0] === '20').map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
check(hang.join() === '-6,-3,3,6', 'insulators over each track: ' + hang.join());
({ dim, player } = world({ id: 'r1d' }));
m = await runTool(railway, { tracks: 3, poleEvery: 100 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 52, y: 0, z: 30 }] });
console.log(m.slice(-1)[0]);
const lam = [...dim.map.values()].filter(p => p.id === 'minecraft:lantern').length; console.log('lanterns', lam);
check(lam === 3 && /전신주 1개/.test(m.slice(-1)[0]), '3 tracks at 30°: one wider gantry, lamps on both posts and the beam');

// ---- 45° diagonal: rails one block wide, anvils turned to the nearest 90°
({ dim, player } = world({ id: 'r2' }));
m = await runTool(railway, { tracks: 1 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 30 }] });
let thick = 0;
for (const [k, p] of dim.map) { if (!p.id.endsWith('anvil')) continue; const [x, y, z] = k.split(',').map(Number); const id = (a, b) => dim.map.get(`${a},${y},${b}`)?.id; if (id(x + 1, z) === p.id && id(x, z + 1) === p.id) thick++; }
check(thick === 0, '45°: rails one block wide: ' + thick);
console.log(m.slice(-1)[0]);

// ---- a pole, built by hand and saved as an asset
({ dim, player } = world({ id: 'r3', location: { x: 100.5, y: 0, z: 110.5 }, rotation: { x: 0, y: 0 } })); // facing south = along +z
// posts at x = 95 and 105, beam at y 8, buttons (wire ends) under the beam at x 98 and 102
for (let y = 0; y <= 8; y++) { put(dim, 95, y, 100, 'stone'); put(dim, 105, y, 100, 'stone'); }
for (let x = 95; x <= 105; x++) put(dim, x, 8, 100, 'stone');
put(dim, 98, 7, 100, 'polished_blackstone_button', { facing_direction: 0 });
put(dim, 102, 7, 100, 'polished_blackstone_button', { facing_direction: 0 });
const s = session(player);
s.pos1 = { x: 95, y: 0, z: 100 }; s.pos2 = { x: 105, y: 8, z: 100 }; s.dim = dim.id;
player.lookAt = { x: 100, y: 0, z: 100 };
console.log('save pole:', await assets.saveAsset(player, 'pole a', {}));
mc.system.flush();
// track along +x with poles every 10, exact angle
({ dim, player } = world({ id: 'r3' }));
dim.map = new Map(); // fresh world, same structure store
m = await runTool(railway, { pole: 'pole_a', poleEvery: 10, tracks: 1 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
console.log(m.slice(-1)[0]);
const stones = [...dim.map].filter(([, p]) => p.id === 'minecraft:stone');
const posts = stones.filter(([k]) => k.split(',')[1] === '4').map(([k]) => k);
console.log('post cells at y=4:', posts.join(' '));
check(posts.length === 5 * 2, '5 poles × 2 posts, turned across an x track: ' + posts.length);
check(posts.every(k => Math.abs(+k.split(',')[2]) === 5), 'posts 5 blocks either side of the track centre');
const buttons = [...dim.map].filter(([, p]) => p.id.endsWith('button'));
check(buttons.length > 20 && buttons.some(([k]) => +k.split(',')[1] < 7), 'wires hang between poles (with sag): ' + buttons.length);
check(buttons.filter(([k]) => k.split(',')[1] !== '7').every(([, p]) => p.states.facing_direction === 1), 'wire buttons lie flat');
// diagonal 30° with exact angle, and 90° steps
for (const ang of ['exact', '90']) {
  ({ dim, player } = world({ id: 'r4' + ang }));
  m = await runTool(railway, { pole: 'pole_a', poleEvery: 15, poleAngle: ang, tracks: 1 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 52, y: 0, z: 30 }] });
  const st = [...dim.map.values()].filter(p => p.id === 'minecraft:stone').length;
  console.log(ang, m.slice(-1)[0], 'stone', st);
  check(/전신주 \d+개/.test(m.slice(-1)[0]) && st >= 4 * 25, `30° track, poles ${ang}: stood without gaps`);
}

// ---- save a hand-made track piece and lay it
({ dim, player } = world({ id: 'r5', location: { x: 200.5, y: 0, z: 200.5 }, rotation: { x: 0, y: 0 } }));
for (let x = 200; x <= 204; x++) for (let z = 200; z <= 201; z++) put(dim, x, 0, z, 'andesite');
for (let x = 200; x <= 204; x++) put(dim, x, 1, 200, 'spruce_slab');         // a sleeper every 2nd block
put(dim, 201, 1, 200, 'iron_block'); put(dim, 201, 1, 201, 'iron_block');      // rail
put(dim, 203, 1, 200, 'iron_block'); put(dim, 203, 1, 201, 'iron_block');      // rail
const s5 = session(player); s5.pos1 = { x: 200, y: 0, z: 200 }; s5.pos2 = { x: 204, y: 1, z: 201 }; s5.dim = dim.id;
m = await runTool(trackpreset, { action: 'save', name: 'my track', dir: 'z' }, { player });
console.log(m.slice(-1)[0]);
m = await runTool(railway, { track: 'my track' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 20 }] });
console.log(m.slice(-1)[0]);
const kinds = {}; for (const [k, p] of dim.map) if (+k.split(',')[0] < 100) kinds[short(p)] = (kinds[short(p)] ?? 0) + 1;
console.log(JSON.stringify(kinds));
check(kinds.andesite > 50 && kinds.iron_block > 20 && kinds.spruce_slab > 10, 'saved track laid along a 45° line');
let th = 0;
for (const [k, p] of dim.map) { if (p.id !== 'minecraft:iron_block') continue; const [x, y, z] = k.split(',').map(Number); const id = (a, b) => dim.map.get(`${a},${y},${b}`)?.id; if (id(x + 1, z) === p.id && id(x, z + 1) === p.id) th++; }
check(th === 0, 'saved rails stay one block wide: ' + th);
// exact turn keeps the pole joined (every stone touches another, 8-way) and about as thin as the original
({ dim, player } = world({ id: 'r6' }));
await runTool(railway, { pole: 'pole_a', poleEvery: 100, tracks: 1, track: '-', wires: false }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 52, y: 0, z: 30 }] });
const st6 = [...dim.map].filter(([, p]) => p.id === 'minecraft:stone').map(([k]) => k.split(',').map(Number));
const set6 = new Set(st6.map(a => a.join(',')));
const lonely = st6.filter(([x, y, z]) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if ((a || b || c) && set6.has(`${x + a},${y + b},${z + c}`)) return false; return true; });
console.log('one pole at 30°: stone', st6.length, 'lonely', lonely.length);
check(lonely.length === 0 && st6.length <= 27 * 1.6, 'exact 30° pole: joined, not fattened (' + st6.length + ' vs 27)');
const beam = st6.filter(([, y]) => y === 8);
const zs = new Set(beam.map(a => a[0] + ',' + a[2]));
console.log(view(dim, 8, -8, -8, 8, 8).join('\n'));
