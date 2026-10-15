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

// ---- bridges are locked until the settings code is given
{
  const { dim, player } = world({ id: 'lock' });
  check(!railway.fieldsFor(player).some(f => f.key === 'bridge') && railway.fieldsFor({ ...player, id: player.id }).length > 5, 'locked: no bridge options in the form');
  const m = await runTool(railway, { bridge: 'plate' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] });
  check(!m.some(t => /교량|고급/.test(t)) && ![...dim.map.values()].some(p => /copper/.test(p.id)), 'locked: the bridge is quietly skipped, the track is laid');
  session(player).settings.unlocked = true;
  check(railway.fieldsFor(player).some(f => f.key === 'bridge'), 'unlocked: bridge options shown');
}

// ---- bridges: every design builds over the ground, piers reach it, bolts sit on plates, bars join up
{
  const { BRIDGES } = await import('./scripts/lib/bridges.js');
  check(BRIDGES.filter(b => b.group === 'steel').length === 4 && BRIDGES.filter(b => b.group === 'concrete').length === 5, '4 steel + 5 concrete bridge designs');
  for (const b of BRIDGES) for (const pts of [[{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }], [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 6 }, { x: 52, y: 0, z: 34 }]]) {
    const { dim, player } = world({ id: 'br' + b.id + pts.length });
    for (let x = -20; x <= 90; x++) for (let z = -30; z <= 70; z++) put(dim, x, -24, z, 'grass_block');
    session(player).settings.unlocked = true;
    const m = await runTool(railway, { bridge: b.id, steel: 'weathered' }, { player, points: pts });
    const last = m.slice(-1)[0];
    const piers = +(/교각 (\d+)개/.exec(last)?.[1] ?? 0);
    const cells = [...dim.map].filter(([k, p]) => !p.id.endsWith('air') && !(p.id === 'minecraft:grass_block' && k.split(',')[1] === '-24'));
    const ys = cells.map(([k]) => +k.split(',')[1]);
    const footings = cells.filter(([k]) => k.split(',')[1] === '-24').length;
    const get = (x, y, z) => dim.map.get(`${x},${y},${z}`);
    const FACE = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
    const bolts = cells.filter(([k, p]) => p.id.endsWith('button') && !(p.states.facing_direction <= 1));
    const loose = bolts.filter(([k, p]) => { const [x, y, z] = k.split(',').map(Number); const f = FACE[p.states.facing_direction]; const q = get(x - f[0], y - f[1], z - f[2]); return !q || /air|button|bars|chain|rod/.test(q.id); });
    const bars = cells.filter(([, p]) => p.id.endsWith('bars'));
    const joined = bars.filter(([, p]) => Object.entries(p.states).some(([k, v]) => k.startsWith('minecraft:connection_') && v));
    check(/교각 \d+개/.test(last) && piers >= 2 && footings > 20 && Math.min(...ys) <= -24 + 1 && loose.length === 0 && (!bars.length || joined.length / bars.length > (b.id.startsWith("truss") ? 0.6 : 0.8)),
      `${b.id} (${pts.length === 2 ? 'straight' : 'curve'}): piers ${piers}, footing ${footings}, bolts ${bolts.length} all on plates (${loose.length} loose), bars joined ${joined.length}/${bars.length}`);
  }
}

// ---- contact wire height, slab bridge column spacing, parapets above the rails
{
  for (const h of [5, 8]) {
    const { dim, player } = world({ id: 'wh' + h });
    const m = await runTool(railway, { wireHeight: h, poleEvery: 20 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
    const hang = [...dim.map].filter(([k, p]) => p.id === 'minecraft:hopper' && p.states.facing_direction === 0).map(([k]) => +k.split(',')[1]);
    const btn = [...dim.map].filter(([k, p]) => p.id.endsWith('button') && p.states.facing_direction === 0).map(([k]) => +k.split(',')[1]);
    check(hang.length && hang.every(y => y === 3 + h) && Math.max(...btn) === 2 + h, `wire height ${h}: hangers at y ${3 + h}, contact wire ${h} above the rail tops (y 2): ${[...new Set(hang)]} / ${Math.max(...btn)}`);
  }
  const cols = {};
  for (const gap of [4, 12]) {
    const { dim, player } = world({ id: 'cg' + gap });
    session(player).settings.unlocked = true;
    for (let x = -10; x <= 40; x++) for (let z = -20; z <= 20; z++) put(dim, x, -20, z, 'grass_block');
    await runTool(railway, { bridge: 'slab', colGap: gap, pole: '' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 28, y: 0, z: 0 }] });
    cols[gap] = new Set([...dim.map].filter(([k, p]) => k.split(',')[1] === '-10' && k.split(',')[0] === '0' && !p.id.endsWith('air')).map(([k]) => Math.round(+k.split(',')[2] / 3))).size;
  }
  check(cols[4] > cols[12], `slab bridge: closer columns with a smaller gap (${cols[4]} vs ${cols[12]} column groups)`);
  const { dim, player } = world({ id: 'par' });
  session(player).settings.unlocked = true;
  for (let x = -10; x <= 40; x++) for (let z = -20; z <= 20; z++) put(dim, x, -20, z, 'grass_block');
  await runTool(railway, { bridge: 'psci', pole: '' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] });
  const col = (z) => Math.max(...[...dim.map].filter(([k, p]) => k.split(',')[0] === '10' && +k.split(',')[2] === z && !p.id.endsWith('air')).map(([k]) => +k.split(',')[1]));
  const edges = [-13, 13].map(col);
  console.log('beam bridge: parapet tops', edges, 'rail top y 1');
  check(edges.every(y => y >= 2), 'beam bridge: the guard walls stand higher than the rails');
}

// ---- V1.6: Warren truss as first designed with whole poles on its verticals, box bridges in rough stone,
// lights on every bridge, the Yamanote parapet, a safety fence on the ground
{
  const { BRIDGES } = await import('./scripts/lib/bridges.js');
  for (const b of BRIDGES) {
    const { dim, player } = world({ id: 'lt' + b.id });
    session(player).settings.unlocked = true;
    for (let x = -10; x <= 70; x++) for (let z = -20; z <= 20; z++) put(dim, x, -24, z, 'grass_block');
    await runTool(railway, { bridge: b.id, pole: b.id === 'truss' ? '@기본' : '' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }] });
    const ids = [...dim.map.values()].map(p => p.id);
    const lights = ids.filter(i => /light_block/.test(i)).length;
    check(lights >= 4 && !ids.some(i => /lantern|bulb/.test(i)), `${b.id}: lit by invisible light blocks only (${lights}), no lanterns`);
    if (b.group === 'low') check(!ids.some(i => /yellow_concrete|black_concrete/.test(i)), `${b.id}: no hazard stripes (left to the builder)`);
    if (b.id === 'viaduct' || b.id === 'segment') check(!ids.includes('minecraft:smooth_stone'), `${b.id}: no smooth stone (rough andesite)`);
    if (b.id === 'plate') check(ids.includes('minecraft:hopper') && ids.includes('minecraft:weathered_copper_grate') && ids.includes('minecraft:iron_chain'), 'plate: grating parapet with hopper coping and chains');
    if (b.id === 'truss') {
      const vbars = [...dim.map].filter(([k, p]) => p.id.endsWith('copper_bars') && +k.split(',')[1] === 8).length;
      check(vbars >= 6, 'warren: slender bar verticals as first designed: ' + vbars);
    }
  }
}
for (const f of ['mesh', 'grate']) {
  const { dim, player } = world({ id: 'fence' + f });
  const m = await runTool(railway, { fence: f, pole: '' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 4 }, { x: 50, y: 0, z: 25 }] });
  const bars = [...dim.map.values()].filter(p => p.id === 'minecraft:iron_bars');
  check(/안전망 \d+칸/.test(m.slice(-1)[0]) && bars.length > 50 && bars.every(p => Object.entries(p.states).some(([k, v]) => k.startsWith('minecraft:connection_') && v)), `safety fence (${f}): ${bars.length} bars, all joined`);
}

// ---- truss: poles at the truss verticals can be switched off (then they stand at the usual spacing)
{
  const spots = {};
  for (const on of [true, false]) {
    const { dim, player } = world({ id: 'tp' + on });
    session(player).settings.unlocked = true;
    for (let x = -10; x <= 130; x++) for (let z = -20; z <= 20; z++) put(dim, x, -24, z, 'grass_block');
    const m = await runTool(railway, { bridge: 'truss', trussPoles: on, poleEvery: 20 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 112, y: 0, z: 0 }] });
    spots[on] = +(/전신주 (\d+)개/.exec(m.slice(-1)[0])?.[1] ?? 0);
  }
  check(spots[true] === 4 && spots[false] > 4, `truss poles: on = at the verticals (${spots[true]}), off = usual spacing (${spots[false]})`);
}

// ---- tunnels: through a hill only where the ground covers the crown ('auto'), all the way ('full'), or none
{
  const hill = (dim) => { for (let x = -10; x <= 110; x++) for (let z = -30; z <= 30; z++) { put(dim, x, -1, z, 'grass_block'); const h = Math.round(26 - Math.abs(x - 55) * 1.1); for (let y = 0; y < h; y++) put(dim, x, y, z, 'stone'); } };
  for (const type of ['natm', 'box']) {
    for (const mode of ['', 'auto', 'full']) {
      const { dim, player } = world({ id: 'tn' + type + mode });
      session(player).settings.unlocked = true;
      hill(dim);
      const m = await runTool(railway, { tunnel: mode, tunnelType: type, bridge: 'psci', poleEvery: 16 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 110, y: 0, z: 0 }] });
      const last = m.slice(-1)[0];
      const get = (x, y, z) => dim.map.get(`${x},${y},${z}`)?.id ?? 'minecraft:air';
      const clear = [4, 6, 8].every(y => get(55, y, 4).endsWith('air') || /button|hopper|chain|light|barrier/.test(get(55, y, 4)));
      const lining = [-12, 12].every(z => [2, 3, 4, 5, 6].some(y => !/:stone$|air/.test(get(55, y, z))));
      if (mode === 'auto')
        check(/터널 1곳/.test(last) && clear && lining && /교각/.test(last), `${type} auto: one tunnel under the hill, clear inside, lined, the bridge kept outside it: ${last}`);
      if (mode === 'full')
        check(/약 110칸/.test(last) && !/교각/.test(last), `${type} full: tunnel all the way, no bridge: ${last}`);
      if (!mode)
        check(!/터널/.test(last), `${type} none: no tunnel`);
      if (mode === 'auto') {
        const inside = [...dim.map].filter(([k, p]) => { const [x, y, z] = k.split(',').map(Number); return x > 47 && x < 63 && y > 0 && y < 9 && Math.abs(z) < 9 && /andesite|stone_brick|cut_copper/.test(p.id) && !/slab/.test(p.id); }).length;
        check(inside < 40, `${type} auto: no bridge parts left inside the tunnel (${inside} stray)`);
      }
    }
  }
  const { dim, player } = world({ id: 'tnlock' });
  const m = await runTool(railway, { tunnel: 'full' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
  check(!/터널/.test(m.slice(-1)[0]) && !railway.fieldsFor(player).some(f => f.key === 'tunnel'), 'tunnels are hidden and skipped until the settings code is given');
}

// ---- embankments: slope and retaining wall, down to the ground, a level shoulder for the poles
for (const e of ['slope', 'wall']) {
  const { dim, player } = world({ id: 'emb' + e });
  for (let x = -10; x <= 50; x++) for (let z = -40; z <= 40; z++) put(dim, x, -7, z, 'grass_block');
  const m = await runTool(railway, { embank: e, poleEvery: 20 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
  const get = (x, y, z) => dim.map.get(`${x},${y},${z}`)?.id ?? 'minecraft:air';
  const under = [-1, -3, -6].every(y => get(20, y, 0) === 'minecraft:dirt');
  const shoulder = [9, 10, 12, 13].every(z => /grass_block|moss_block/.test(get(20, 0, z)));
  const plants = [...dim.map.values()].filter(p => /short_grass|fern|bush|berry/.test(p.id)).length;
  check(plants > 50, `embankment ${e}: grass and plants on it (${plants})`);
  const wall = e === 'wall' ? [...dim.map].some(([k, p]) => p.id === 'minecraft:light_gray_concrete') && [...dim.map].some(([, p]) => p.id === 'minecraft:dark_oak_fence') : true;
  const slope = [...dim.map].filter(([k, p]) => k.split(',')[0] === '20' && p.id !== 'minecraft:air').map(([k]) => Math.abs(+k.split(',')[2]));
  check(/언덕/.test(m.slice(-1)[0]) && under && shoulder && wall && Math.max(...slope) >= 17, `embankment ${e}: filled to the ground, shoulder, ${e === 'wall' ? 'retaining wall + fence, ' : ''}reaches out ${Math.max(...slope)}`);
}

// ---- room around the piers: blocks within the radius (and under the deck) are broken
{
  const { dim, player } = world({ id: 'pclear' });
  session(player).settings.unlocked = true;
  for (let x = -10; x <= 60; x++) for (let z = -30; z <= 30; z++) { put(dim, x, -20, z, 'grass_block'); if (z > 12 && z < 20) for (let y = -19; y <= -12; y++) put(dim, x, y, z, 'stone'); }
  const m = await runTool(railway, { bridge: 'psci', pole: '', pierClear: 6 }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 44, y: 0, z: 0 }] });
  const stoneLeft = [...dim.map].filter(([k, p]) => p.id === 'minecraft:stone' && Math.abs(+k.split(',')[0] - 22) <= 2 && +k.split(',')[2] > 16 && +k.split(',')[2] < 20).length;
  const farLeft = [...dim.map].filter(([k, p]) => p.id === 'minecraft:stone' && +k.split(',')[0] === 11 && +k.split(',')[2] > 16).length;
  check(/교각 둘레 6칸 비움/.test(m.slice(-1)[0]) && stoneLeft === 0 && farLeft > 0, `the hill beside a pier is broken away, the rest stays: ${m.slice(-1)[0]} (${stoneLeft} left near, ${farLeft} far)`);
}
