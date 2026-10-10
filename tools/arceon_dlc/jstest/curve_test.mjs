// Tests for the curve tools: road, arch, spike, dashes, river, roof.
import { load, runTool, world, put, at, topView, mc } from './harness.mjs';
const { undo } = await import('./scripts/core/edit.js');

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log('  FAIL ' + msg); }
};
// flat stone ground: top at y = 0 for x -10..70, z -25..25
function ground(dim, top = 0, depth = 3) {
  for (let x = -10; x <= 70; x++)
    for (let z = -25; z <= 25; z++)
      for (let y = top - depth + 1; y <= top; y++) put(dim, x, y, z, 'stone');
}
const count = (dim, re) => dim.count((k, p) => re.test(p.id));
const ys = (dim, re) => { const out = []; for (const [k, p] of dim.map) if (re.test(p.id)) out.push(+k.split(',')[1]); return out; };
const errs = (msgs) => msgs.filter(m => m.startsWith('§c'));
const PTS = [{ x: 0, y: 1, z: 0 }, { x: 25, y: 1, z: 8 }, { x: 50, y: 1, z: 0 }];

async function run(name, file, cases, depth = 3) {
  const tool = await load(file);
  ok(tool.name && tool.desc && /[가-힣]/.test(tool.name), name + ' korean name');
  for (const c of cases) {
    const { dim, player } = world();
    if (c.ground !== false) ground(dim, 0, depth);
    const before = dim.count();
    const msgs = await runTool(tool, c.values, { player, points: c.points ?? PTS });
    const e = errs(msgs);
    if (c.expectError) {
      ok(e.length > 0, `${name} ${c.label}: expected an error`);
      console.log(`${name.padEnd(7)} ${c.label.padEnd(22)} error: ${e[0]}`);
      continue;
    }
    ok(e.length === 0, `${name} ${c.label}: ${e.join(' | ')}`);
    const res = c.check(dim, before);
    console.log(`${name.padEnd(7)} ${c.label.padEnd(22)} ${res ?? ''}  [${msgs[msgs.length - 1]}]`);
    if (c.undo) {
      await undo(player); mc.system.flush();
      ok(dim.count() === before, `${name} ${c.label}: undo restores (${dim.count()} vs ${before})`);
    }
  }
}

// ---------------------------------------------------------------- road
await run('road', 'tools/road.js', [
  { label: 'stone w7 h3', values: { block: 'red_wool', width: 7, height: 3 }, undo: true, check: (d) => {
    const n = count(d, /red_wool/); const y = ys(d, /red_wool/);
    ok(n > 50 * 7 * 2, 'road count ' + n);
    ok(Math.max(...y) === 1 && Math.min(...y) === -2, 'road y range ' + Math.min(...y) + '..' + Math.max(...y));
    return `blocks=${n} y=${Math.min(...y)}..${Math.max(...y)}`;
  } },
  { label: '-n noise', values: { block: 'red_wool', width: 7, noise: true }, check: (d) => `blocks=${count(d, /red_wool/)}` },
  { label: '-p straight', values: { block: 'red_wool', width: 7, straight: true }, check: (d) => `blocks=${count(d, /red_wool/)}` },
  { label: '-d stack down', points: PTS.map(p => ({ ...p, y: 6 })), values: { block: 'red_wool', width: 5, down: true }, check: (d) => {
    const y = ys(d, /red_wool/);
    ok(Math.min(...y) === 1 && Math.max(...y) === 5, 'road -d range ' + Math.min(...y) + '..' + Math.max(...y));
    return `blocks=${y.length} y=${Math.min(...y)}..${Math.max(...y)}`;
  } },
  { label: 'slab h1', points: PTS.map(p => ({ ...p, y: 2 })), values: { block: 'smooth_stone_slab', width: 6, height: 1 }, check: (d) => {
    const n = count(d, /slab/); ok(n > 100, 'slab road ' + n);
    return `slabs=${n} double=${count(d, /double/)}`;
  } },
  { label: 'slab -d', points: PTS.map(p => ({ ...p, y: 4 })), values: { block: 'oak_slab', width: 4, down: true }, check: (d) => {
    ok(count(d, /double/) > 50, 'slab -d doubles'); return `slabs=${count(d, /oak_slab/)} double=${count(d, /double/)}`;
  } },
  { label: 'too close', points: [{ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }], values: { block: 'stone', width: 3 }, expectError: true },
]);

// ---------------------------------------------------------------- arch
await run('arch', 'tools/arch.js', [
  { label: 'h20 2 arches', points: PTS.map(p => ({ ...p, y: 21 })), values: { block: 'stone_bricks', width: 4, height: 20, pillar: 5, amount: 2, archHeight: 75 }, undo: true, check: (d) => {
    const n = count(d, /stone_bricks/);
    // the bottom layer (y 2) is only reached by pillars
    const low = d.count((k, p) => p.id.includes('stone_bricks') && +k.split(',')[1] === 1);
    const top = d.count((k, p) => p.id.includes('stone_bricks') && +k.split(',')[1] === 21);
    ok(n > 1000 && low > 0 && top > low, `arch shape n=${n} low=${low} top=${top}`);
    return `blocks=${n} low=${low} top=${top}`;
  } },
  { label: '-d pillars down', points: PTS.map(p => ({ ...p, y: 21 })), values: { block: 'stone_bricks', width: 4, height: 10, amount: 2, down: true }, check: (d) => {
    const low = d.count((k, p) => p.id.includes('stone_bricks') && +k.split(',')[1] === 1);
    ok(low > 0, 'arch -d reaches ground'); return `ground-touching=${low}`;
  } },
  { label: '-l level', points: [{ x: 0, y: 15, z: 0 }, { x: 25, y: 20, z: 5 }, { x: 50, y: 25, z: 0 }], values: { block: 'stone_bricks', width: 3, height: 10, level: true, amount: 3 }, check: (d) => `blocks=${count(d, /stone_bricks/)}` },
  { label: 'slab', points: PTS.map(p => ({ ...p, y: 12 })), values: { block: 'stone_brick_slab', width: 3, height: 10 }, check: (d) => `slabs=${count(d, /slab/)}` },
  { label: '-p', points: PTS.map(p => ({ ...p, y: 12 })), values: { block: 'stone_bricks', width: 3, height: 10, straight: true }, check: (d) => `blocks=${count(d, /stone_bricks/)}` },
]);

// ---------------------------------------------------------------- spike
await run('spike', 'tools/spike.js', [
  { label: '1 -> 10', ground: false, points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 30, z: 5 }], values: { block: 'red_wool', size1: 10, size2: 1 }, undo: true, check: (d) => {
    const n = count(d, /red_wool/); const y = ys(d, /red_wool/);
    const lowN = y.filter(v => v < 5).length, hiN = y.filter(v => v > 25).length;
    ok(n > 300 && lowN > hiN, `spike taper n=${n} low=${lowN} hi=${hiN}`);
    return `blocks=${n} bottom=${lowN} top=${hiN}`;
  } },
  { label: '3 sizes', ground: false, values: { block: 'red_wool', size1: 2, size2: 8, size3: 2 }, check: (d) => `blocks=${count(d, /red_wool/)}` },
  { label: '-n noise', ground: false, values: { block: 'red_wool', size1: 3, size2: 6, noise: true }, check: (d) => `blocks=${count(d, /red_wool/)}` },
  { label: '-p straight', ground: false, values: { block: 'red_wool', size1: 3, size2: 3, straight: true }, check: (d) => {
    // straight line through (25,1,8): the ball there must exist
    ok(at(d, 25, 1, 8).id.includes('red_wool'), 'spike -p passes through the middle point');
    return `blocks=${count(d, /red_wool/)}`;
  } },
]);

// ---------------------------------------------------------------- dashes
await run('dashes', 'tools/dashes.js', [
  { label: 'dash3 gap3', ground: false, points: [{ x: 0, y: 1, z: 0 }, { x: 60, y: 1, z: 0 }], values: { block: 'yellow_wool', dash: 3, gap: 3 }, undo: true, check: (d) => {
    let row = ''; for (let x = 0; x <= 62; x++) row += at(d, x, 1, 0).id.includes('wool') ? '#' : '.';
    const n = count(d, /wool/); ok(n > 15 && n < 45, 'dash count ' + n);
    ok(/#\.+#/.test(row), 'has gaps');
    return row;
  } },
  { label: '-d dots', ground: false, points: [{ x: 0, y: 1, z: 0 }, { x: 60, y: 1, z: 0 }], values: { block: 'yellow_wool', dash: 4, gap: 2, dots: true }, check: (d) => {
    let row = ''; for (let x = 0; x <= 40; x++) row += at(d, x, 1, 0).id.includes('wool') ? '#' : '.';
    return row;
  } },
  { label: 'w4 -s split', ground: false, points: [{ x: 0, y: 1, z: 0 }, { x: 60, y: 1, z: 0 }], values: { block: 'yellow_wool', dash: 3, gap: 3, width: 4, split: true }, check: (d) => {
    const mid = d.count((k, p) => p.id.includes('wool') && +k.split(',')[2] === 0);
    ok(mid === 0 && count(d, /wool/) > 20, 'split leaves the middle empty');
    return topView(d, 0, -3, 30, 3).split('\n').join(' | ');
  } },
  { label: 'slab w2', ground: false, points: [{ x: 0, y: 1, z: 0 }, { x: 30, y: 3, z: 0 }], values: { block: 'smooth_stone_slab', dash: 3, gap: 2, width: 2 }, check: (d) => {
    ok(count(d, /slab/) > 10, 'dash slabs'); return `slabs=${count(d, /slab/)} top=${d.count((k, p) => p.states?.['minecraft:vertical_half'] === 'top')}`;
  } },
  { label: '-p', ground: false, values: { block: 'yellow_wool', dash: 2, gap: 2, straight: true }, check: (d) => `blocks=${count(d, /wool/)}` },
]);

// ---------------------------------------------------------------- river
await run('river', 'tools/river.js', [
  { label: 'water 3->5', points: [{ x: 0, y: 0, z: 0 }, { x: 25, y: 0, z: 6 }, { x: 50, y: 0, z: 0 }], values: { block: 'water', start: 3, end: 5 }, undo: true, check: (d) => {
    const w = count(d, /water/); const y = ys(d, /water/);
    ok(w > 100, 'river water ' + w);
    ok(Math.max(...y) <= 0 && Math.min(...y) >= -5, `water y ${Math.min(...y)}..${Math.max(...y)}`);
    return `water=${w} y=${Math.min(...y)}..${Math.max(...y)}`;
  } },
  { label: '-s smooth water', points: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }], values: { block: 'water', start: 3, end: 3, smooth: true }, check: (d) => {
    const lv = new Set(); for (const [, p] of d.map) if (p.id === 'minecraft:water') lv.add(p.states.liquid_depth);
    ok(lv.size > 1, 'smooth water levels ' + [...lv]);
    return `liquid_depth=${[...lv].sort((a, b) => a - b).join(',')}`;
  } },
  { label: '-s snow layers', points: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }], values: { block: 'snow_layer', start: 3, end: 3, smooth: true }, check: (d) => {
    const hs = new Set(); for (const [, p] of d.map) if (p.id === 'minecraft:snow_layer') hs.add(p.states.height);
    ok(hs.size > 1 && count(d, /^minecraft:snow$/) > 50, 'snow layers ' + [...hs]);
    return `snow blocks=${count(d, /^minecraft:snow$/)} layer heights=${[...hs].sort((a, b) => a - b).join(',')}`;
  } },
  { label: '-n lava', points: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }], values: { block: 'lava', start: 2, end: 4, noise: true }, check: (d) => `lava=${count(d, /lava/)}` },
  { label: 'dirt decline 3', points: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }], values: { block: 'dirt', start: 3, end: 3, decline: 3 }, check: (d) => `dirt=${count(d, /dirt/)}` },
], 20);

// ---------------------------------------------------------------- roof
await run('roof', 'tools/roof.js', [
  { label: 'w10 h5', ground: false, points: [{ x: 0, y: 5, z: 0 }, { x: 40, y: 5, z: 0 }], values: { block: 'red_wool', width: 10, height: 5 }, undo: true, check: (d) => {
    const y = ys(d, /wool/); const n = y.length;
    ok(Math.max(...y) === 10 && Math.min(...y) === 5, 'roof y ' + Math.min(...y) + '..' + Math.max(...y));
    const ridge = d.count((k, p) => +k.split(',')[1] === 10), eave = d.count((k, p) => p.id.includes('wool') && +k.split(',')[1] === 5);
    ok(eave > ridge, 'gable: wider at the bottom');
    return `blocks=${n} eave=${eave} ridge=${ridge}`;
  } },
  { label: '-h hollow', ground: false, points: [{ x: 0, y: 5, z: 0 }, { x: 40, y: 5, z: 0 }], values: { block: 'red_wool', width: 10, height: 5, hollow: true }, check: (d) => {
    // a column in the middle of one side: only the surface block
    let col = 0; for (let y = 0; y < 15; y++) if (at(d, 20, y, 2).id.includes('wool')) col++;
    ok(col <= 2, 'hollow column ' + col);
    return `blocks=${count(d, /wool/)} col=${col}`;
  } },
  { label: '-b bevel', ground: false, points: [{ x: 0, y: 5, z: 0 }, { x: 40, y: 5, z: 0 }], values: { block: 'red_wool', width: 10, height: 5, bevel: true }, check: (d) => {
    const endTop = Math.max(...ys(d, /wool/).filter((_, i) => true)); void endTop;
    let hEnd = 0; for (let y = 0; y < 15; y++) if (at(d, 1, y, 0).id.includes('wool')) hEnd = y;
    ok(hEnd < 9, 'bevel lowers the end ' + hEnd);
    return `blocks=${count(d, /wool/)} end height=${hEnd}`;
  } },
  { label: '-d -h', points: [{ x: 0, y: 6, z: 0 }, { x: 40, y: 6, z: 0 }], values: { block: 'red_wool', width: 8, height: 4, down: true, hollow: true }, check: (d) => {
    ok(d.count((k, p) => p.id.includes('wool') && +k.split(',')[1] === 1) > 20, 'walls reach ground');
    return `blocks=${count(d, /wool/)}`;
  } },
  { label: 'slab', ground: false, points: [{ x: 0, y: 5, z: 0 }, { x: 40, y: 5, z: 0 }], values: { block: 'spruce_slab', width: 10, height: 5 }, check: (d) => {
    const top = d.count((k, p) => p.states?.['minecraft:vertical_half'] === 'top'), bottom = d.count((k, p) => p.states?.['minecraft:vertical_half'] === 'bottom');
    ok(top + bottom > 50, 'roof slabs'); return `bottom=${bottom} top=${top} double=${count(d, /double/)}`;
  } },
  { label: 'slab -h', ground: false, points: [{ x: 0, y: 5, z: 0 }, { x: 40, y: 5, z: 0 }], values: { block: 'spruce_slab', width: 10, height: 5, hollow: true, bevel: true }, check: (d) => `slabs=${count(d, /slab/)}` },
  { label: '-n -p', ground: false, values: { block: 'red_wool', width: 8, height: 4, noise: true, straight: true }, check: (d) => `blocks=${count(d, /wool/)}` },
]);

console.log(fails ? `\n${fails} FAILURES` : '\nall curve tests passed');
process.exit(fails ? 1 : 0);
