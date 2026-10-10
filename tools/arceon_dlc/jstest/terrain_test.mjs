// Tests for the terrain group: terragen, smoothsnow and the brushes
// boulder, crop, revolve, erodeblend, cube, vine, spike.
import assert from 'assert';
import { load, runTool, runBrush, world, put, at, mc, topView } from './harness.mjs';
const { undo } = await import('./scripts/core/edit.js');
const { FastNoise, terragenNoise, TG_TYPES } = await import('./scripts/lib/terrain_noise.js');

const out = [];
const log = (...a) => { out.push(a.join(' ')); };
const errs = (msgs) => msgs.filter(m => m.startsWith('§c'));
const last = (msgs) => msgs[msgs.length - 1];
function ground(dim, x0, z0, x1, z1, y = 0, id = 'grass_block') {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) put(dim, x, y, z, id);
}
const cnt = (dim, id) => dim.count((k, p) => p.id === 'minecraft:' + id);

// ------------------------------------------------------------- noise
{
  // FastNoise reference values (Java FastNoise 1337 seed, simplex, freq 0.01)
  const n = new FastNoise(1337);
  const vals = [];
  for (let i = 0; i < 2000; i++) vals.push(n.get(i * 7.3, i * -3.1));
  const mn = Math.min(...vals), mx = Math.max(...vals);
  assert(mn >= -1.01 && mx <= 1.01 && mx - mn > 1, 'simplex range ' + mn + ' ' + mx);
  for (const t of TG_TYPES) {
    const f = terragenNoise(t, 42, 1, {});
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 400; i++) { const val = f.get(i * 3.7, i * 1.3 - 200); assert(Number.isFinite(val), t); lo = Math.min(lo, val); hi = Math.max(hi, val); }
    assert(hi > lo, t + ' constant');
    log(`noise ${t.padEnd(10)} ${lo.toFixed(2)}..${hi.toFixed(2)}`);
  }
  // values from Arceon's own FastNoise class (compiled with javac), seed 987654, zoom 1.3
  const REF = {
    simplex: [-0.14690687, 0.21660915, 0.7299041, 0.43223086, 0.46430743, 0.58872926],
    ridged: [0.16771008, 0.20295542, -0.23446229, 0.09920578, 0.08596835, -0.22155692],
    electric: [0.391085, 0.34043586, -0.28099275, 0.068379045, 0.11260344, 0.3097377],
    euclidean: [0.37451282, 0.452514, 0.4639062, 0.24379587, 0.0850874, 0.062151853],
    poly: [-0.07469523, 0.059312582, 0.8973793, 0.24251223, 0.73528814, 0.4309796],
  };
  for (const [t, ref] of Object.entries(REF)) {
    const f = terragenNoise(t, 987654, 1.3, {});
    ref.forEach((r, i) => assert(Math.abs(f.get(i * 37.5 - 90, i * -21.25 + 13) - r) < 2e-5, `FastNoise ${t} #${i}`));
  }
  log('FastNoise port matches Arceon (Java) reference values');
  // same seed, same field
  assert.strictEqual(terragenNoise('fractal', 7, 1).get(10, 20), terragenNoise('fractal', 7, 1).get(10, 20));
}

// ------------------------------------------------------------- terragen
const terragen = await load('tools/terragen.js');
{
  const { dim, player } = world();
  const region = [{ x: 0, y: 0, z: 0 }, { x: 39, y: 0, z: 39 }];
  for (const type of ['simplex', 'fractal', 'billowy', 'ridged', 'turbulence', 'electric', 'euclidean', 'manhattan', 'natural', 'poly']) {
    const d = world();
    const m = await runTool(terragen, { type, block: 'stone', height: 20 }, { player: d.player, region });
    assert(!errs(m).length, type + ' ' + m.join('|'));
    const n = cnt(d.dim, 'stone');
    assert(n >= 1600, type + ' count ' + n); // every column has at least its base block
    log(`terragen ${type}: ${n} stone`);
  }
  // slabs + -v + -s keeps the seed
  let m = await runTool(terragen, { type: 'fractal', block: 'stone_brick_slab', height: 20, v: true }, { player, region });
  assert(!errs(m).length, m.join('|'));
  const slabs = dim.count((k, p) => p.id === 'minecraft:stone_brick_slab');
  const dbl = dim.count((k, p) => /double/.test(p.id));
  assert(slabs > 0 && dbl > 0, 'slabs ' + slabs + ' ' + dbl);
  // vignette: border column is a single block at the base (fade 0 -> (n+1)*0 = 0)
  assert(!dim.map.get('0,1,0') || dim.map.get('0,1,0').id === 'minecraft:air', 'vignette edge');
  log(`terragen slab -v: ${slabs} slabs, ${dbl} doubles`, last(m));
  const seed1 = /시드 (\d+)/.exec(last(m))[1];
  await undo(player); mc.system.flush();
  assert.strictEqual(dim.count(), 0, 'undo terragen');
  m = await runTool(terragen, { type: 'fractal', block: 'stone_brick_slab', height: 20, v: true, s: true }, { player, region });
  assert.strictEqual(/시드 (\d+)/.exec(last(m))[1], seed1, '-s keeps seed');
  assert.strictEqual(dim.count((k, p) => p.id === 'minecraft:stone_brick_slab'), slabs, '-s same terrain');
  // typed seed
  m = await runTool(terragen, { type: 'simplex', block: 'stone', seed: '12345' }, { player, region });
  assert(/시드 12345/.test(last(m)));
  // snow layers
  {
    const d = world();
    await runTool(terragen, { type: 'simplex', block: 'snow_layer', height: 10, zoom: 0.3 }, { player: d.player, region });
    const layers = cnt(d.dim, 'snow_layer'), blocks = cnt(d.dim, 'snow');
    assert(layers > 0 && blocks > 0, 'snow ' + layers + ' ' + blocks);
    log(`terragen snow: ${blocks} snow blocks, ${layers} layers`);
  }
  // water
  {
    const d = world();
    await runTool(terragen, { type: 'simplex', block: 'water', height: 10 }, { player: d.player, region });
    const thin = d.dim.count((k, p) => p.id === 'minecraft:water' && p.states.liquid_depth > 0);
    assert(thin > 0, 'water levels');
  }
  // -e: on top of existing ground (y=5), raise and dig; plus wave and cylinder shape
  {
    const d = world();
    ground(d.dim, 0, 0, 39, 39, 5, 'dirt');
    m = await runTool(terragen, { type: 'ridged', block: 'stone', height: 8, e: true, wave: 10, n: true }, { player: d.player, region });
    assert(!errs(m).length, m.join('|'));
    const above = d.dim.count((k, p) => +k.split(',')[1] > 5);
    const dug = 1600 - cnt(d.dim, 'dirt');
    log(`terragen -e ridged: ${above} above ground, ${dug} ground blocks replaced/dug`);
    assert(dug > 0);
    const c = world();
    m = await runTool(terragen, { type: 'natural', block: 'stone', shape: 'cylinder', v: true, r: true }, { player: c.player, region: [{ x: 0, y: 0, z: 0 }, { x: 39, y: 10, z: 39 }] });
    assert(!errs(m).length, m.join('|'));
    assert(!c.dim.map.get('0,5,0'), 'cylinder corner empty');
    assert(c.dim.map.get('20,5,20'), 'cylinder centre filled from mid height');
    log('terragen cylinder:\n' + topView(c.dim, 0, 0, 39, 39).split('\n').filter((_, i) => i % 4 === 0).join('\n'));
  }
}

// ------------------------------------------------------------- smoothsnow
const smoothsnow = await load('tools/smoothsnow.js');
{
  const { dim, player } = world();
  // stepped terrain: a hill
  for (let x = -25; x <= 45; x++) for (let z = -25; z <= 45; z++) {
    const h = Math.max(0, 6 - Math.round(Math.hypot(x - 10, z - 10) / 2));
    for (let y = 0; y <= h; y++) put(dim, x, y, z, y === h ? 'grass_block' : 'dirt');
  }
  let m = await runTool(smoothsnow, {}, { player, region: [{ x: 0, y: -5, z: 0 }, { x: 20, y: 20, z: 20 }] });
  assert(!errs(m).length, m.join('|'));
  const layers = cnt(dim, 'snow_layer'), blocks = cnt(dim, 'snow');
  assert(layers > 50, 'snow layers ' + layers);
  const heights = new Set(); dim.map.forEach((p) => { if (p.id === 'minecraft:snow_layer') heights.add(p.states.height); });
  log(`smoothsnow: ${layers} layers (heights ${[...heights].sort().join(',')}), ${blocks} snow blocks`, last(m));
  await undo(player); mc.system.flush();
  assert.strictEqual(cnt(dim, 'snow_layer') + cnt(dim, 'snow'), 0, 'undo');
  m = await runTool(smoothsnow, { o: true, mask: 'grass_block', added: 1.4 }, { player, region: [{ x: 0, y: -5, z: 0 }, { x: 20, y: 20, z: 20 }] });
  assert(!errs(m).length, m.join('|'));
  log(`smoothsnow -o grass 1.4: ${cnt(dim, 'snow_layer')} layers, ${cnt(dim, 'snow')} blocks`);
  assert(cnt(dim, 'snow_layer') + cnt(dim, 'snow') > 0);
  // non-snow pattern
  const d = world();
  ground(d.dim, -25, -25, 35, 35, 0, 'stone');
  m = await runTool(smoothsnow, { block: 'sand', smooth: 4 }, { player: d.player, region: [{ x: 0, y: -5, z: 0 }, { x: 10, y: 10, z: 10 }] });
  assert(!errs(m).length, m.join('|'));
  assert(cnt(d.dim, 'sand') > 0, 'sand cover');
  log(`smoothsnow sand: ${cnt(d.dim, 'sand')} sand`);
}

// ------------------------------------------------------------- brushes
const hit = { x: 0, y: 0, z: 0 };
async function brushWorld() {
  const w = world({ location: { x: 20.5, y: 10, z: 0.5 }, rotation: { x: 20, y: 90 } });
  ground(w.dim, -20, -20, 20, 20, 0, 'grass_block');
  return w;
}

const boulder = await load('brushes/boulder.js');
{
  for (const [flags, label] of [[{}, 'solid'], [{ h: true }, '-h'], [{ f: true }, '-f'], [{ a: true, quality: 0 }, '-a q0'], [{ sizeMin: 6, sizeMax: 12, heightMin: 4, heightMax: 6 }, 'ranges']]) {
    const { dim, player } = await brushWorld();
    const m = await runBrush(boulder, { block: 'andesite', ...flags }, { x: 0, y: 4, z: 0 }, { player });
    assert(!errs(m).length, label + ' ' + m.join('|'));
    const n = cnt(dim, 'andesite');
    assert(n > 30, label + ' ' + n);
    log(`boulder ${label}: ${n} andesite`);
    if (label === '-h') assert(!dim.map.get('0,4,0') || dim.map.get('0,4,0').id !== 'minecraft:andesite', 'hollow centre');
    if (label === 'solid') assert(dim.map.get('0,4,0')?.id === 'minecraft:andesite', 'solid centre');
    if (label === '-f') assert(dim.map.get('0,1,0')?.id === 'minecraft:andesite', 'falls to ground');
  }
  // sand forces falling
  const { dim, player } = await brushWorld();
  await runBrush(boulder, { block: 'sand' }, { x: 0, y: 8, z: 0 }, { player });
  assert(dim.map.get('0,1,0')?.id === 'minecraft:sand', 'sand falls');
}

const crop = await load('brushes/crop.js');
{
  const { dim, player } = await brushWorld();
  const ids = ['wheat', 'carrots', 'potatoes', 'beetroot', 'melon_stem', 'torchflower_crop'];
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) put(dim, x, 1, z, ids[(x + z + 12) % ids.length], ids[(x + z + 12) % ids.length] === 'torchflower' ? {} : { growth: 0 });
  let m = await runBrush(crop, { size: 8, min: 7, max: 7 }, { x: 0, y: 1, z: 0 }, { player });
  assert(!errs(m).length, m.join('|'));
  const grown = dim.count((k, p) => p.states.growth === 7);
  const tf = cnt(dim, 'torchflower');
  log(`crop 7..7: ${grown} at growth 7, ${tf} torchflowers`, last(m));
  assert(grown > 20 && tf > 0);
  m = await runBrush(crop, { size: 8, min: 2, max: 4 }, { x: 0, y: 1, z: 0 }, { player });
  const g = new Set(); dim.map.forEach((p, k) => { const [x, y, z] = k.split(',').map(Number); if (Math.hypot(x, y - 1, z) < 3.9 && p.states.growth !== undefined && p.id !== 'minecraft:torchflower_crop') g.add(p.states.growth); });
  assert([...g].every(x => x >= 2 && x <= 4), 'growth range ' + [...g]);
  log(`crop 2..4: growth values ${[...g].sort().join(',')}`);
}

const revolve = await load('brushes/revolve.js');
{
  const { dim, player } = world();
  // a small wall segment of logs and stairs 5 blocks east of the axis
  for (let y = 0; y < 3; y++) put(dim, 5, y, 0, 'oak_log', { pillar_axis: 'x' });
  put(dim, 5, 3, 0, 'oak_stairs', { weirdo_direction: 0, upside_down_bit: false });
  const region = [{ x: 5, y: 0, z: 0 }, { x: 5, y: 3, z: 0 }];
  const s = (await import('./scripts/core/session.js')).session(player);
  s.pos1 = region[0]; s.pos2 = region[1]; s.dim = player.dimension.id;
  let m = await runBrush(revolve, { amount: 4 }, { x: 0, y: 0, z: 0 }, { player });
  assert(!errs(m).length, m.join('|'));
  // copies at 90 / 180 / 270 degrees: (0,_,5), (-5,_,0), (0,_,-5)
  assert(at(dim, 0, 1, 5).id === 'minecraft:oak_log' && at(dim, -5, 1, 0).id === 'minecraft:oak_log' && at(dim, 0, 1, -5).id === 'minecraft:oak_log', 'revolve copies');
  assert.strictEqual(at(dim, 0, 1, 5).states.pillar_axis, 'z', 'log axis turned');
  assert.strictEqual(at(dim, 0, 3, 5).states.weirdo_direction, 2, 'stairs turned (east -> south)');
  log(`revolve 4: ${cnt(dim, 'oak_log')} logs, stair at 90° faces ${at(dim, 0, 3, 5).states.weirdo_direction}`, last(m));
  const d = world();
  for (let y = 0; y < 2; y++) put(d.dim, 6, y, 0, 'stone');
  const s2 = (await import('./scripts/core/session.js')).session(d.player);
  s2.pos1 = { x: 6, y: 0, z: 0 }; s2.pos2 = { x: 6, y: 1, z: 0 }; s2.dim = d.player.dimension.id;
  m = await runBrush(revolve, { amount: 6, p: true, heightDiff: 6 }, { x: 0, y: 0, z: 0 }, { player: d.player });
  assert(!errs(m).length, m.join('|'));
  log(`revolve -p hex + height 6: ${cnt(d.dim, 'stone')} stone`);
  assert(cnt(d.dim, 'stone') > 40);
  m = await runBrush(revolve, { amount: 3, s: true, r: true, start: 0, end: 180 }, { x: 0, y: 0, z: 0 }, { player: d.player });
  assert(!errs(m).length);
  const e = world({ id: 'nosel' });
  m = await runBrush(revolve, { amount: 3 }, { x: 0, y: 0, z: 0 }, { player: e.player });
  assert(errs(m).length, 'needs selection');
}

const erodeblend = await load('brushes/erodeblend.js');
{
  for (const type of ['fill', 'smooth', 'lift', 'melt', 'clear']) {
    const { dim, player } = world();
    // bumpy ground: grass at y 0 with some pillars and holes
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
      put(dim, x, -1, z, 'stone');
      if ((x * 7 + z * 3) % 5 !== 0) put(dim, x, 0, z, 'grass_block');
      if ((x * 3 + z * 5) % 7 === 0) { put(dim, x, 1, z, 'dirt'); put(dim, x, 2, z, 'dirt'); }
    }
    const before = dim.count();
    const m = await runBrush(erodeblend, { size: 5, type }, { x: 0, y: 0, z: 0 }, { player });
    assert(!errs(m).length, type + ' ' + m.join('|'));
    const after = dim.count();
    log(`erodeblend ${type}: blocks ${before} -> ${after}`, last(m));
    if (type === 'clear') assert(after < before, 'clear removes');
    if (type === 'lift') assert(after > before, 'lift raises');
  }
}

const cube = await load('brushes/cube.js');
{
  for (const [flags, label, expect] of [[{}, 'solid', 8 * 8 * 8 * 0.8], [{ h: true }, '-h', 200], [{ c: true }, '-c', 400], [{ a: true }, '-a', 400], [{ snap: 7 }, 'snap 7 -> 1', 400], [{ sizeMin: 4, sizeMax: 6, heightMin: 10, heightMax: 10 }, 'ranges', 100]]) {
    const { dim, player } = await brushWorld();
    const m = await runBrush(cube, { block: 'quartz_block', ...flags }, { x: 0, y: 0, z: 0 }, { player });
    assert(!errs(m).length, label + ' ' + m.join('|'));
    const n = cnt(dim, 'quartz_block');
    assert(n >= expect, label + ' ' + n);
    log(`cube ${label}: ${n} quartz`, last(m));
    if (label === 'solid') {
      // standing on the block: nothing below y=1, top about y=8 (7 + 1)
      assert(!dim.count((k, p) => p.id === 'minecraft:quartz_block' && +k.split(',')[1] < 1), 'stands on the ground');
    }
    if (label === '-c') assert(dim.count((k, p) => p.id === 'minecraft:quartz_block' && +k.split(',')[1] < 0) > 0, 'centred');
  }
}

const vine = await load('brushes/vine.js');
{
  const { dim, player } = world();
  ground(dim, -10, -10, 10, 10, 0, 'stone');
  for (let y = 1; y <= 12; y++) for (let z = -6; z <= 6; z++) put(dim, 0, y, z, 'stone'); // a wall along z
  let m = await runBrush(vine, { size: 12, chance: 100, min: 3, max: 6 }, { x: 0, y: 10, z: 0 }, { player });
  assert(!errs(m).length, m.join('|'));
  const vines = []; dim.map.forEach((p, k) => { if (p.id === 'minecraft:vine') vines.push([k, p.states.vine_direction_bits]); });
  assert(vines.length > 10, 'vines ' + vines.length);
  const east = vines.filter(([k]) => +k.split(',')[0] === 1);
  assert(east.length && east.every(([, b]) => b & 2), 'vine on east side of the wall faces west (bit 2)');
  const west = vines.filter(([k]) => +k.split(',')[0] === -1);
  assert(west.length && west.every(([, b]) => b & 8), 'west side faces east (bit 8)');
  log(`vine: ${vines.length} vines`, last(m));
  m = await runBrush(vine, { block: 'oak_leaves', size: 12, chance: 50, min: 2, max: 2 }, { x: 0, y: 10, z: 8 }, { player });
  assert(!errs(m).length);
  log(`vine leaves: ${cnt(dim, 'oak_leaves')} leaves`);
  m = await runBrush(vine, { block: 'glow_lichen', size: 12, chance: 100, min: 1, max: 1 }, { x: 0, y: 3, z: 0 }, { player });
  assert(!errs(m).length, m.join('|'));
  m = await runBrush(vine, { block: 'stone,dirt', size: 6 }, { x: 0, y: 6, z: 0 }, { player });
  assert(/한 종류/.test(last(m)), 'multi pattern falls back to vine');
}

const spike = await load('brushes/spike.js');
{
  const { dim, player } = await brushWorld(); // player east of the hit, eye at y 11.8
  let m = await runBrush(spike, { block: 'dripstone_block', length: 12, startMin: 5, startMax: 5, endMin: 1, endMax: 1 }, { x: 0, y: 0, z: 0 }, { player });
  assert(!errs(m).length, m.join('|'));
  const n = cnt(dim, 'dripstone_block');
  const maxX = Math.max(...[...dim.map].filter(([, p]) => p.id === 'minecraft:dripstone_block').map(([k]) => +k.split(',')[0]));
  assert(n > 30 && maxX >= 7, 'spike towards player ' + n + ' ' + maxX);
  log(`spike: ${n} blocks, reaches x=${maxX}`, last(m));
  m = await runBrush(spike, { block: 'stone', n: true, length: 15 }, { x: 0, y: 0, z: 0 }, { player });
  assert(!errs(m).length);
  log(`spike -n: ${cnt(dim, 'stone')} stone`);
}

console.log(out.join('\n'));
console.log('terrain tests ok');
