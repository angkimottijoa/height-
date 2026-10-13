// Railway: built-in track (cross section, anvil rails along the track, thin on diagonals),
// a pole saved as an asset stood along the line (exact and 90° turns), wires between poles, saved track pieces.
import { load, world, runTool, put, mc } from './harness.mjs';
const { session } = await import('./scripts/core/session.js');
const assets = await import('./scripts/tools/assets.js');
const railway = await load('tools/railway.js');
const trackpreset = await load('tools/trackpreset.js');
const { POLES } = await import('./scripts/lib/pole_data.js');
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const short = (p) => p.id.replace('minecraft:', '');
const ch = (p) => !p ? ' ' : p.id.endsWith('anvil') ? 'A' : p.id.endsWith('stairs') ? 'S' : p.id === 'minecraft:mud_bricks' ? 'M' : p.id.endsWith('slab') ? 's' : p.id.endsWith('gravel') ? '.' : p.id.endsWith('button') ? 'b' : p.id.endsWith('air') ? ' ' : '#';
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
check(l1.filter(r => /^(Ms)+M?$/.test(r.trim())).length === 4 && l1.filter(r => /^(Ss)+S?$/.test(r.trim())).length === 4, 'sleepers: mud bricks between the rails, stairs at both ends, 1 on 1 off, slabs between');
const stairs = [...dim.map].filter(([k, p]) => p.id.endsWith('stairs') && +k.split(',')[0] === 4).map(([k, p]) => [+k.split(',')[2], p.states.weirdo_direction]).sort((a, b) => a[0] - b[0]);
console.log('sleeper end stairs at x=4 (z, facing):', JSON.stringify(stairs));
check(stairs.map(a => a[1]).join() === '2,3,2,3', 'end stairs climb towards the rails (high side inside), like the hand-built sleeper');
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
const hang = [...dim.map].filter(([k, p]) => p.id === 'minecraft:hopper' && k.split(',')[1] === '8' && k.split(',')[0] === '20').map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
check(hang.join() === '-6,-3,3,6', 'hangers (hoppers) over the rails, as in the user\'s build: ' + hang.join());
const wb = [...dim.map].filter(([, p]) => p.id.endsWith('button'));
const sup = (k, dy) => { const [x, y, z] = k.split(',').map(Number); return dim.map.get(`${x},${y + dy},${z}`); };
check(wb.every(([k, p]) => p.states.facing_direction === 0 ? sup(k, 1) : sup(k, -1)), 'every wire button is held by a block (barrier) above / below');
check(wb.some(([, p]) => p.states.facing_direction === 0) && wb.some(([, p]) => p.states.facing_direction === 1), 'contact wires hang, feeder wires lie');
let same = 0, diff = 0;
POLES['2'].rows.forEach((r, y) => [...r].forEach((c, z) => { if (c === '.') return; const want = POLES['2'].palette['ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(c)]; const got = dim.map.get(`20,${y},${z - 13}`); if (got && got.id === want.name && Object.entries(want.states).every(([a, b]) => got.states[a] === b)) same++; else diff++; }));
check(diff === 0 && same > 80, `pole on an east track = the user's structure block for block (${same} same, ${diff} different)`);
({ dim, player } = world({ id: 'r1d' }));
m = await runTool(railway, { tracks: 3, poleEvery: 100 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 52, y: 0, z: 30 }] });
console.log(m.slice(-1)[0]);
const skulls = [...dim.map.values()].filter(p => p.id === 'minecraft:wither_skeleton_skull').length;
check(skulls === 2 && /전신주 1개, 전선 10가닥/.test(m.slice(-1)[0]), '3 tracks at 30°: the 3-track gantry (2 post tops, 10 wires)');
({ dim, player } = world({ id: 'r1e' }));
m = await runTool(railway, { tracks: 4, poleEvery: 100, track: '-' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
const hz = [...dim.map].filter(([k, p]) => p.id === 'minecraft:hopper' && k.split(',')[1] === '8').map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
const pz = [...dim.map].filter(([k, p]) => p.id === 'minecraft:andesite_wall' && k.split(',')[1] === '5').map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
console.log('4 tracks: hangers', hz.join(), 'posts', pz.join());
check(hz.length === 8 && pz.length === 2 && pz[1] - pz[0] === 40 && /전선 12가닥/.test(m.slice(-1)[0]), '4 tracks: the gantry widened by one 9-block bay (posts 40 apart, 8 hangers, 12 wires)');
({ dim, player } = world({ id: 'r1f' }));
m = await runTool(railway, { pole: '@기둥', poleEvery: 20 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
console.log(m.slice(-1)[0]);
const gz = [...dim.map].filter(([k, p]) => p.id === 'minecraft:heavy_core' && k.split(',')[0] === '20').map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
check(gz.join() === '-12,-10,10,12' && /전선 4가닥/.test(m.slice(-1)[0]) && ![...dim.map.values()].some(p => p.id === 'minecraft:anvil' && false), 'posts only: both sides, feeder wires from their tops: ' + gz.join());

// ---- the gantry generator rebuilds the user's 1 / 2 / 3-track structures
{
  const rail = await import('./scripts/lib/rail.js');
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (const n of [1, 2, 3]) {
    const t = rail.builtinTile({ tracks: n });
    const g = rail.builtinPole('gantry', t.rails, t.bed);
    const d = POLES[String(n)];
    const want = new Map();
    d.rows.forEach((r, y) => [...r].forEach((c, z) => { if (c !== '.') want.set(`0,${y},${z - d.centre}`, d.palette[CH.indexOf(c)]); }));
    let bad = [];
    for (const [k, w] of want) { const p = g.cells.get(k); const st = { ...w.states }; if (n === 3 && w.name.endsWith('trapdoor')) delete st.direction;
      if (!p || p.id !== w.name || !Object.entries(st).every(([a, b]) => p.states[a] === b)) bad.push(k + ' ' + w.name + ' got ' + (p?.id ?? '-')); }
    for (const k of g.cells.keys()) if (!want.has(k)) bad.push(k + ' extra ' + g.cells.get(k).id);
    const wa = d.anchors.map(a => `${a[0]},${a[1]},${a[2]}`).sort().join(' '), ga = g.buttons.map((b, i) => `${b[2]},${b[1]},${g.styles[i]}`).sort().join(' ');
    check(bad.length === 0 && wa === ga, `${n} track(s): generated gantry = mystructure:${n} block for block, same wire ends` + (bad.length ? ' ' + bad.slice(0, 5).join('; ') : '') + (wa !== ga ? ` ${wa} | ${ga}` : ''));
  }
  for (const n of [5, 6]) {
    const t = rail.builtinTile({ tracks: n });
    const g = rail.builtinPole('gantry', t.rails, t.bed);
    const hz = [...g.cells].filter(([k, p]) => p.id === 'minecraft:hopper' && k.split(',')[1] === '8').length;
    check(hz === 2 * n && g.buttons.length === 2 * n + 4, `${n} tracks: a hanger over each of the ${2 * n} rails, ${2 * n + 4} wires`);
  }
  const t = rail.builtinTile({ tracks: 2, gauge: 4, between: 3, margin: 2 });
  const g = rail.builtinPole('gantry', t.rails, t.bed);
  const hz = [...g.cells].filter(([k, p]) => p.id === 'minecraft:hopper' && k.split(',')[1] === '8').map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
  const posts = [...g.cells].filter(([k, p]) => p.id === 'minecraft:tuff_brick_wall').map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
  check(hz.join() === t.rails.join() && posts[0] < t.bed[0] && posts[1] > t.bed[1], `wider gauge / spacing: hangers follow the rails (${hz}), posts outside the bed (${posts} vs ${t.bed})`);
}

// ---- pole spacing: fixed, closer on curves, by count, typed gaps
{
  const rail = await import('./scripts/lib/rail.js');
  // a road: 60 blocks straight east, then a quarter circle of radius 30
  const S = []; let sAcc = 0, prev = null;
  const push = (x, z, tx, tz) => { if (prev) sAcc += Math.hypot(x - prev.x, z - prev.z); prev = { x, z }; S.push({ x, y: 0, z, tx, tz, nx: -tz, nz: tx, s: sAcc }); };
  for (let x = 0; x <= 60; x += 1 / 3) push(x, 0, 1, 0);
  for (let a = 0; a <= Math.PI / 2; a += 1 / 90) push(60 + 30 * Math.sin(a), 30 - 30 * Math.cos(a), Math.cos(a), Math.sin(a));
  const road = { samples: S, total: sAcc };
  if (road) {
    const gaps = (a) => a.slice(1).map((x, i) => Math.round(x - a[i]));
    const every = rail.poleSpots(road, { poleMode: 'every', poleEvery: 20 });
    const curve = rail.poleSpots(road, { poleMode: 'curve', poleEvery: 20, poleMin: 6, poleStray: 1 });
    console.log('every', gaps(every).join(), '| curve', gaps(curve).join());
    check(gaps(every).every(g => g === 20), 'every 20 blocks');
    check(Math.min(...gaps(curve)) < 20 && Math.min(...gaps(curve)) >= 6 && gaps(curve)[0] === 20, 'closer on the curve (not below the minimum), 20 on the straight');
    const count = rail.poleSpots(road, { poleMode: 'count', poleCount: 6 });
    check(count.length === 6 && count[0] === 0 && Math.abs(count[5] - road.total) < 1e-6, 'count: 6 poles from start to end');
    const list = rail.poleSpots(road, { poleMode: 'list', poleList: '10, 25' });
    check(gaps(list).slice(0, 4).join() === '10,25,10,25', 'typed gaps repeat: ' + gaps(list).join());
    const end = rail.poleSpots(road, { poleMode: 'every', poleEvery: 30, poleEnd: true });
    check(Math.abs(end[end.length - 1] - road.total) < 1e-6, 'a pole at the very end when asked');
  }
}

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
check(buttons.every(([, p]) => p.states.facing_direction === 0), 'wires hang like the pole\'s own buttons (facing down)');
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
