// Tests for text, type replace, colour replace and assets.
//   cd tools/arceon_dlc/jstest && node replace_test.mjs
import { load, runTool, world, put, at, mc } from './harness.mjs';
const { undo } = await import('./scripts/core/edit.js');
const { makeContext } = await import('./scripts/core/runner.js');
const { runAsync } = await import('./scripts/core/edit.js');
const { session } = await import('./scripts/core/session.js');
const fam = await import('./scripts/lib/replace_families.js');
const assets = await import('./scripts/tools/assets.js');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL', msg); } };
const flushRun = async (p) => { const r = await p; mc.system.flush(); return r; };
const id = (dim, x, y, z) => at(dim, x, y, z).id.replace('minecraft:', '');

// ---------------------------------------------------------------- text
{
    const text = await load('tools/text.js');
    const { dim, player } = world({ location: { x: 0.5, y: 64, z: 0.5 }, rotation: { x: 0, y: 180 } }); // facing north
    let msgs = await runTool(text, { block: 'stone', size: 10, text: 'Hey', font: 'verdana' }, { player });
    const n = dim.count();
    ok(n > 30, 'text north placed blocks');
    ok(dim.count(k => k.split(',')[2] !== '-2') === 0, 'text north on z = -2');
    const xs = [...dim.map.keys()].map(k => +k.split(',')[0]);
    ok(Math.min(...xs) >= 0 && Math.max(...xs) < 40, 'text north runs east (+x)');
    console.log('text Hey verdana 10 north:', n, 'blocks;', msgs.at(-1));
    await undo(player); mc.system.flush();
    ok(dim.count() === 0, 'text undo');

    const w2 = world({ location: { x: 0.5, y: 64, z: 0.5 }, rotation: { x: 0, y: -90 } }); // east
    await runTool(text, { block: 'stone', size: 16, text: '한글 테스트', font: 'unicode' }, { player: w2.player });
    const n2 = w2.dim.count();
    ok(n2 > 50 && w2.dim.count(k => k.split(',')[0] !== '2') === 0, 'hangul east on x = 2');
    console.log('text 한글 테스트 unicode 16 east:', n2, 'blocks;', w2.player.msgs.at(-1));

    const w3 = world({ location: { x: 0.5, y: 64, z: 0.5 }, rotation: { x: 0, y: 0 } }); // south
    await runTool(text, { block: 'stone_brick_slab', size: 8, text: 'Arc', font: 'impact' }, { player: w3.player });
    const ids = new Set([...w3.dim.map.values()].filter(p => p.id !== 'minecraft:air').map(p => p.id + (p.states['minecraft:vertical_half'] ?? '')));
    ok(w3.dim.count() > 10 && [...ids].every(s => /stone_brick(_double)?_slab/.test(s)), 'slab text uses slab set');
    ok(w3.dim.count(k => k.split(',')[2] !== '2') === 0, 'text south on z = 2');
    console.log('text slabs impact 8 south:', w3.dim.count(), 'blocks', [...ids].join(' '));

    const w4 = world({ rotation: { x: 0, y: 135 } });
    msgs = await runTool(text, { block: 'stone', size: 10, text: 'x' }, { player: w4.player });
    ok(w4.dim.count() === 0 && /동서남북/.test(msgs.at(-1)), 'diagonal facing refused');

    const w5 = world({ rotation: { x: 0, y: 180 } });
    await runTool(text, { block: 'stone', size: 12, text: 'Hi', font: 'minecraft', cycle: true }, { player: w5.player });
    ok(session(w5.player).settings.font === 'papyrus', 'cycle -c moves to the next font');
    await runTool(text, { block: 'stone', size: 12, text: '가나', font: 'lobster' }, { player: w5.player });
    ok(!/건너뜀/.test(w5.player.msgs.at(-1)), 'Korean falls back to unicode in a Latin font');
    console.log('text cycle:', w5.player.msgs.filter(m => /글꼴/.test(m)).join(' | '));
}

// ---------------------------------------------------------------- type replace
{
    const tr = await load('tools/typereplace.js');
    // every id in the families exists
    const bad = [];
    for (const [name, f] of Object.entries(fam.TYPES))
        for (const bid of Object.values(f.forms))
            try { mc.BlockPermutation.resolve('minecraft:' + bid); } catch (e) { bad.push(name + ':' + bid); }
    ok(!bad.length, 'family ids exist: ' + bad.join(' '));
    ok(fam.findType('5:1') === 'spruce' && fam.findType('cobble') === 'cobblestone' && fam.findType('oak_stairs') === 'oak'
        && fam.findType('iron') === 'iron' && fam.findType('copper') === 'cut_copper' && fam.findType('Dark Oak') === 'dark_oak', 'aliases');

    const build = (dim) => {
        put(dim, 0, 0, 0, 'oak_planks');
        put(dim, 1, 0, 0, 'oak_stairs', { weirdo_direction: 2, upside_down_bit: true });
        put(dim, 2, 0, 0, 'oak_slab', { 'minecraft:vertical_half': 'top' });
        put(dim, 3, 0, 0, 'oak_double_slab');
        put(dim, 4, 0, 0, 'oak_fence');
        put(dim, 5, 0, 0, 'fence_gate', { 'minecraft:cardinal_direction': 'west' });
        put(dim, 6, 0, 0, 'oak_log', { pillar_axis: 'x' });
        put(dim, 7, 0, 0, 'stone');
    };
    const region = [{ x: 0, y: 0, z: 0 }, { x: 7, y: 0, z: 0 }];
    let w = world(); build(w.dim);
    await runTool(tr, { from: 'oak', to: 'cobble' }, { player: w.player, region });
    const row = (d) => [0, 1, 2, 3, 4, 5, 6, 7].map(x => id(d, x, 0, 0)).join(' ');
    console.log('oak -> cobble:', row(w.dim));
    ok(id(w.dim, 0, 0, 0) === 'cobblestone' && id(w.dim, 1, 0, 0) === 'stone_stairs' && id(w.dim, 3, 0, 0) === 'cobblestone_double_slab', 'oak->cobble shapes');
    const st = at(w.dim, 1, 0, 0).states;
    ok(st.weirdo_direction === 2 && st.upside_down_bit === true, 'stairs states kept');
    ok(at(w.dim, 2, 0, 0).states['minecraft:vertical_half'] === 'top', 'slab half kept');
    ok(id(w.dim, 4, 0, 0) === 'oak_fence' && id(w.dim, 6, 0, 0) === 'oak_log', 'missing target shapes left alone');
    await undo(w.player); mc.system.flush();
    ok(id(w.dim, 1, 0, 0) === 'oak_stairs', 'type replace undo');

    w = world(); build(w.dim);
    await runTool(tr, { from: 'oak', to: 'spruce', f: true }, { player: w.player, region });
    ok(id(w.dim, 4, 0, 0) === 'oak_fence' && id(w.dim, 5, 0, 0) === 'fence_gate' && id(w.dim, 0, 0, 0) === 'spruce_planks', '-f keeps fences');
    ok(id(w.dim, 6, 0, 0) === 'spruce_log' && at(w.dim, 6, 0, 0).states.pillar_axis === 'x', 'log -> log keeps axis');
    console.log('oak -> spruce -f:', row(w.dim));
    w = world(); build(w.dim);
    await runTool(tr, { from: 'oak', to: 'spruce', b: true, s: true }, { player: w.player, region });
    ok(id(w.dim, 0, 0, 0) === 'oak_planks' && id(w.dim, 2, 0, 0) === 'oak_slab' && id(w.dim, 3, 0, 0) === 'oak_double_slab' && id(w.dim, 5, 0, 0) === 'spruce_fence_gate', '-b -s');
    ok(at(w.dim, 5, 0, 0).states['minecraft:cardinal_direction'] === 'west', 'gate direction kept');
    w = world(); build(w.dim);
    await runTool(tr, { from: 'oak', to: 'spruce', d: true }, { player: w.player, region });
    ok(id(w.dim, 2, 0, 0) === 'spruce_slab' && id(w.dim, 3, 0, 0) === 'oak_double_slab', '-d keeps double slabs only');

    w = world();
    put(w.dim, 0, 0, 0, 'waxed_cut_copper_stairs', { weirdo_direction: 1 });
    put(w.dim, 1, 0, 0, 'cut_copper_slab');
    put(w.dim, 2, 0, 0, 'waxed_copper_trapdoor');
    await runTool(tr, { from: 'copper', to: 'exposed_cut_copper' }, { player: w.player, region: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] });
    ok(id(w.dim, 0, 0, 0) === 'waxed_exposed_cut_copper_stairs' && id(w.dim, 1, 0, 0) === 'exposed_cut_copper_slab' && id(w.dim, 2, 0, 0) === 'waxed_exposed_copper_trapdoor', 'copper waxed twins');
    let msgs = await runTool(tr, { from: 'nothing', to: 'oak' }, { player: w.player });
    ok(/모르는 재질/.test(msgs.at(-1)), 'unknown family error');
}

// ---------------------------------------------------------------- colour replace
{
    const cr = await load('tools/colorreplace.js');
    const w = world();
    put(w.dim, 0, 0, 0, 'white_wool');
    put(w.dim, 1, 0, 0, 'white_carpet');
    put(w.dim, 2, 0, 0, 'white_stained_glass_pane');
    put(w.dim, 3, 0, 0, 'white_glazed_terracotta', { facing_direction: 4 });
    put(w.dim, 4, 0, 0, 'white_candle', { candles: 2, lit: true });
    put(w.dim, 5, 0, 0, 'standing_banner', { ground_sign_direction: 3 });
    put(w.dim, 6, 0, 0, 'blue_wool');
    put(w.dim, 7, 0, 0, 'white_shulker_box');
    const region = [{ x: 0, y: 0, z: 0 }, { x: 7, y: 0, z: 0 }];
    await runTool(cr, { from: 'white', to: 'red', b: false }, { player: w.player, region });
    const row = [0, 1, 2, 3, 4, 5, 6, 7].map(x => id(w.dim, x, 0, 0));
    console.log('white -> red:', row.join(' '), '|', w.player.msgs.at(-1));
    ok(row.join() === 'red_wool,red_carpet,red_stained_glass_pane,red_glazed_terracotta,red_candle,standing_banner,blue_wool,red_shulker_box', 'colour replace');
    ok(at(w.dim, 3, 0, 0).states.facing_direction === 4 && at(w.dim, 4, 0, 0).states.candles === 2, 'colour states kept');
    ok(/현수막/.test(w.player.msgs.at(-1)), 'banner note');
    await runTool(cr, { from: 'red', to: 'lime', g: true }, { player: w.player, region });
    ok(id(w.dim, 3, 0, 0) === 'red_glazed_terracotta' && id(w.dim, 0, 0, 0) === 'lime_wool', '-g keeps glazed terracotta');
}

// ---------------------------------------------------------------- assets
{
    const tool = await load('tools/assets.js');
    const { dim, player } = world({ location: { x: 0.5, y: 0, z: 5.5 }, rotation: { x: 0, y: 180 } }); // facing north
    // an L of stone with an east-facing stair one block east of the origin, inside a bigger selection
    put(dim, 10, 0, 0, 'stone');
    put(dim, 11, 0, 0, 'oak_stairs', { weirdo_direction: 0 });
    put(dim, 10, 1, 0, 'oak_slab', { 'minecraft:vertical_half': 'bottom' });
    put(dim, 10, 0, 1, 'cobblestone');
    const s = session(player);
    s.pos1 = { x: 8, y: -2, z: -2 }; s.pos2 = { x: 14, y: 4, z: 4 }; s.dim = dim.id;
    player.lookAt = { x: 10, y: 0, z: 0 };
    const msg = await flushRun(assets.saveAsset(player, 'Test Tree', {}));
    console.log('save:', msg);
    const list = assets.listAssets();
    ok(list.length === 1 && list[0].name === 'test_tree' && list[0].size.x === 2 && list[0].size.y === 2 && list[0].size.z === 2, 'trimmed asset listed');
    ok(list[0].origin.x === 0 && list[0].origin.y === 0 && list[0].dir === 'north', 'origin + facing stored');
    let err = null;
    try { await flushRun(assets.saveAsset(player, 'test tree', {})); } catch (e) { err = e.message; }
    ok(/이미/.test(err ?? ''), 'duplicate name refused');
    try { assets.assetKey('나무!'); } catch (e) { err = e.message; }
    ok(/영문/.test(err), 'bad name refused');
    ok(/test_tree/.test(assets.selectAsset(player, ['test tree'], { rotation: 'player', flip: 'none' })), 'select');

    // place facing east: turned 90 degrees clockwise
    player.rotation = { x: 0, y: -90 };
    let ctx = makeContext(player, {});
    let r = await runAsync(assets.placeAsset(ctx, { x: 0, y: 9, z: 0, face: 'Up' }));
    await ctx.edit.commit('에셋'); mc.system.flush();
    console.log('place (east):', r);
    ok(id(dim, 0, 10, 0) === 'stone', 'origin on the block above the click');
    ok(id(dim, 0, 10, 1) === 'oak_stairs' && at(dim, 0, 10, 1).states.weirdo_direction === 2, 'east stair turned to south and moved south');
    ok(id(dim, 0, 11, 0) === 'oak_slab' && id(dim, -1, 10, 0) === 'cobblestone', 'south block moved west');
    ok(dim.count(k => +k.split(',')[1] >= 10) === 4, 'air not pasted');
    await undo(player); mc.system.flush();
    ok(dim.count(k => +k.split(',')[1] >= 10) === 0, 'asset undo');

    // random rotation + XYZ flips with a fixed random source
    assets.selectAsset(player, 'test_tree', { rotation: 'random', flip: 'xyz' });
    const seq = [0.0, 0.9, 0.1, 0.1, 0.9]; let i = 0; const rand = () => seq[i++ % seq.length];
    ctx = makeContext(player, {});
    r = await runAsync(assets.placeAsset(ctx, { x: 20, y: 9, z: 0, face: 'up' }, rand));
    await ctx.edit.commit('에셋'); mc.system.flush();
    console.log('place (random, flips):', r);
    // name pick uses seq[0]; rotation seq[1] -> 270; flips x (0.1), y (0.1), z no (0.9)
    ok(/270° 뒤집기 XY/.test(r), 'random rotation + flips');
    ok(id(dim, 20, 10, 0) === 'stone' && id(dim, 20, 9, 0) === 'oak_slab', 'y flip puts the slab below');
    ok(at(dim, 20, 9, 0).states['minecraft:vertical_half'] === 'top', 'y flip turns bottom slab to top');

    // menu tool: list / remove
    const msgs = await runTool(tool, { action: 'list' }, { player });
    ok(msgs.some(m => /test_tree/.test(m)), 'list via tool');
    await runTool(tool, { action: 'remove', name: 'test tree' }, { player });
    ok(assets.listAssets().length === 0 && !mc.world.structureManager.get('arc_asset:test_tree'), 'remove');
    ok(assets.SAVE_FIELDS.length && assets.PLACER_FIELDS.length, 'field lists exported');
}

console.log(fails ? `\n${fails} FAILED` : '\nall replace tests passed');
process.exit(fails ? 1 : 0);
