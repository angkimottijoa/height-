// Tests for the shape tools: loft, revolve, axisrevolve, icosphere, resize, smear.
import { load, runTool, world, put, at, topView } from './harness.mjs';
const { undo } = await import('./scripts/core/edit.js');
const { session } = await import('./scripts/core/session.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL ' + msg); } };
const last = (msgs) => msgs[msgs.length - 1] ?? '';
const changed = (msgs) => { const m = /(\d+)블록 변경/.exec(last(msgs)); return m ? +m[1] : -1; };
const noErr = (msgs, what) => ok(!msgs.some(m => m.startsWith('§c')), `${what}: ${msgs.filter(m => m.startsWith('§c')).join(' | ')}`);
const fresh = (opts) => { const w = world(opts); session(w.player).points = []; return w; };

// ---------------------------------------------------------------- loft
{
    const loft = await load('tools/loft.js');
    const frames = [
        [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
        [{ x: 0, y: 5, z: 10 }, { x: 10, y: 5, z: 10 }],
        [{ x: 0, y: 0, z: 20 }, { x: 10, y: 0, z: 20 }],
    ];
    const res = {};
    for (const [name, vals] of Object.entries({
        plain: {}, lowPoly: { lowPoly: true }, outline: { outline: true }, outlineCount: { outline: true, count: 4 },
        connect: { connect: true }, down: { down: true }, slab: { block: 'oak_slab' }, slabDown: { block: 'oak_slab', down: true },
        count3: { count: 3 },
    })) {
        const { dim, player } = fresh();
        const msgs = await runTool(loft, vals, { player, frames });
        noErr(msgs, 'loft ' + name);
        res[name] = dim.count();
        if (name === 'slab') ok(dim.count((k, p) => p.id === 'minecraft:oak_slab') > 0, 'loft slab places slabs');
        if (name === 'plain') {
            console.log(topView(dim, -1, -1, 12, 21).split('\n').filter((_, i) => i % 4 === 0).join('\n'));
            ok(at(dim, 5, 5, 10).id !== 'minecraft:air', 'loft passes through middle frame top');
        }
        if (name === 'down') ok(at(dim, 5, 1, 10).id !== 'minecraft:air', 'loft -d fills below the arch');
    }
    console.log('loft counts', JSON.stringify(res));
    ok(res.plain > 200, 'loft plain fills a surface');
    ok(res.outline < res.plain / 2, 'loft -o draws less than the fill');
    ok(res.outlineCount > res.outline, 'loft -o with count adds sections');
    ok(res.down > res.plain, 'loft -d adds blocks');
    ok(res.count3 < res.plain, 'loft count 3 draws fewer sections');
    ok(res.connect >= res.plain, 'loft -c closes the loop');
    const { player } = fresh();
    const m = await runTool(loft, {}, { player, frames: [frames[0]] });
    ok(/2개 이상/.test(last(m)), 'loft needs 2 frames');
}

// ---------------------------------------------------------------- revolve
{
    const rev = await load('tools/revolve.js');
    const mk = () => {
        const w = fresh({ location: { x: 0.5, y: 0, z: 0.5 } });
        // a 1x3 pillar of stairs-facing-east at x = 5
        for (let y = 0; y < 3; y++) put(w.dim, 5, y, 0, 'stone_brick_stairs', { weirdo_direction: 0, upside_down_bit: false });
        return w;
    };
    const res = {};
    for (const [name, vals] of Object.entries({
        plain: { amount: 4 }, poly: { amount: 6, polygon: true }, start: { amount: 4, toStart: true },
        half: { amount: 4, start: 0, end: 180 }, rev: { amount: 4, reverse: true, start: 0, end: 90 }, height: { amount: 8, height: 16 },
    })) {
        const { dim, player } = mk();
        const msgs = await runTool(rev, vals, { player, region: [{ x: 5, y: 0, z: 0 }, { x: 5, y: 2, z: 0 }] });
        noErr(msgs, 'revolve ' + name);
        res[name] = dim.count();
        if (name === 'plain') {
            // 90 deg: east -> south, block at (0.5, , 5.5)
            const s = at(dim, 0, 0, 5);
            ok(s.id === 'minecraft:stone_brick_stairs', 'revolve copy at 90 deg (south)');
            ok(s.states.weirdo_direction === 2, `revolve turned stair to south (got ${s.states.weirdo_direction})`);
            ok(at(dim, -5, 1, 0).id === 'minecraft:stone_brick_stairs' && at(dim, 0, 2, -5).id === 'minecraft:stone_brick_stairs', 'revolve west / north copies');
        }
        if (name === 'rev') ok(at(dim, 4, 0, -4).id !== 'minecraft:air' && at(dim, 4, 0, 4).id === 'minecraft:air', 'revolve -r goes to the north side');
        if (name === 'height') ok(at(dim, 0, 12, -5).id !== 'minecraft:air', 'revolve height diff raises copies');
    }
    console.log('revolve counts', JSON.stringify(res));
    ok(res.plain === 12, 'revolve 4 copies of 3 blocks');
    ok(res.poly > res.plain, 'revolve -p joins copies');
    ok(res.start > res.plain, 'revolve -s draws to start');
}

// ---------------------------------------------------------------- axisrevolve
{
    const arev = await load('tools/axisrevolve.js');
    const res = {};
    for (const [name, vals, look] of [
        ['up', { amount: 4, radius: 6 }, { x: 0, y: 20, z: 0 }],
        ['poly', { amount: 6, radius: 6, polygon: true }, { x: 0, y: 20, z: 0 }],
        ['side', { amount: 8, radius: 5, height: 10 }, { x: 20, y: 0, z: 0 }],
        ['snap', { amount: 4, radius: 6, snapOn: true, snap: 45 }, { x: 3, y: 20, z: 1 }],
        ['rev', { amount: 4, radius: 6, reverse: true, start: 0, end: 180 }, { x: 0, y: 20, z: 0 }],
    ]) {
        const { dim, player } = fresh({ location: { x: 0.5, y: 0, z: 0.5 } });
        player.lookAt = look;
        put(dim, 30, 10, 30, 'oak_log', { pillar_axis: 'y' });
        put(dim, 30, 11, 30, 'oak_log', { pillar_axis: 'y' });
        const msgs = await runTool(arev, vals, { player, region: [{ x: 30, y: 10, z: 30 }, { x: 30, y: 11, z: 30 }] });
        noErr(msgs, 'axisrevolve ' + name);
        res[name] = dim.count() - 2;
        if (name === 'up') {
            // axis straight up: copies on a ring of radius 6 at the player's height
            let ring = 0;
            for (const [k, p] of dim.map) {
                const [x, y, z] = k.split(',').map(Number);
                if (p.id === 'minecraft:oak_log' && !(x === 30 && z === 30)) { const r = Math.hypot(x + 0.5 - 0.5, z + 0.5 - 0.5); if (r > 4 && r < 8 && y >= -1 && y <= 1) ring++; }
            }
            ok(ring >= 6, `axisrevolve copies on the ring (${ring})`);
        }
        if (name === 'side') {
            // axis east: logs lie along y/z and the axis log turns
            let turned = 0;
            for (const p of dim.map.values()) if (p.id === 'minecraft:oak_log' && p.states.pillar_axis !== 'y') turned++;
            ok(turned > 0, 'axisrevolve turns log axis around a horizontal axis');
        }
    }
    console.log('axisrevolve counts', JSON.stringify(res));
    ok(res.up >= 6 && res.up <= 8, 'axisrevolve 4 copies of 2 logs');
    ok(res.poly > res.up, 'axisrevolve -p joins copies');
    const { player } = fresh();
    const m = await runTool(arev, { amount: 4, radius: 6 }, { player, region: [{ x: 0, y: 5, z: 0 }, { x: 0, y: 5, z: 0 }] });
    noErr(m, 'axisrevolve without a looked-at block');
}

// ---------------------------------------------------------------- icosphere
{
    const ico = await load('tools/icosphere.js');
    const res = {};
    for (const [name, vals] of Object.entries({
        s0: { size: 20 }, s2: { size: 20, subdivide: 2 }, outline: { size: 20, outline: true }, small: { size: 1 }, sub5: { size: 30, subdivide: 5, outline: true },
    })) {
        const { dim, player } = fresh({ location: { x: 0.5, y: 50, z: 0.5 } });
        const msgs = await runTool(ico, vals, { player });
        noErr(msgs, 'icosphere ' + name);
        res[name] = dim.count();
        if (name === 's2') {
            let maxR = 0, hollow = true;
            for (const k of dim.map.keys()) {
                const [x, y, z] = k.split(',').map(Number);
                const r = Math.hypot(x + 0.5 - 0.5, y + 0.5 - 50.5, z + 0.5 - 0.5);
                maxR = Math.max(maxR, r);
                if (r < 5) hollow = false;
            }
            ok(maxR < 11 && maxR > 8, `icosphere radius ~10 (${maxR.toFixed(2)})`);
            ok(hollow, 'icosphere is a hollow shell');
        }
    }
    console.log('icosphere counts', JSON.stringify(res));
    ok(res.outline < res.s0, 'icosphere -l only edges');
    ok(res.small > 0, 'icosphere clamps size to 5');
}

// ---------------------------------------------------------------- resize
{
    const rs = await load('tools/resize.js');
    const mk = () => {
        const w = fresh();
        for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) put(w.dim, x, y, z, 'stone');
        put(w.dim, 1, 1, 1, 'oak_stairs', { weirdo_direction: 3, upside_down_bit: true });
        return w;
    };
    const res = {};
    for (const [name, vals] of Object.entries({ x2: { scale: 2 }, half: { scale: 0.5 }, air: { scale: 2, air: true }, big: { scale: 99, region: [{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }] } })) {
        const { dim, player } = mk();
        const msgs = await runTool(rs, vals, { player, region: vals.region ?? [{ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }] });
        noErr(msgs, 'resize ' + name);
        res[name] = dim.count();
        if (name === 'x2') {
            ok(dim.count() === 216, `resize x2 makes a 6^3 cube (${dim.count()})`);
            const st = [...dim.map.values()].find(p => p.id === 'minecraft:oak_stairs');
            ok(st && st.states.weirdo_direction === 3 && st.states.upside_down_bit === true, 'resize keeps block states');
        }
        if (name === 'big') ok(player.msgs.some(m => /최대 50/.test(m)) && dim.count((k, p) => p.id === 'minecraft:oak_stairs') === 125000, 'resize clamps to 50');
    }
    console.log('resize counts', JSON.stringify(res));
    ok(res.half > 0 && res.half < 27, 'resize 0.5 shrinks');
    // undo
    const { dim, player } = mk();
    await runTool(rs, { scale: 2 }, { player, region: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }] });
    await undo(player);
    (await import('./harness.mjs')).mc.system.flush();
    ok(dim.count() === 27, `resize undo restores (${dim.count()})`);
}

// ---------------------------------------------------------------- smear
{
    const sm = await load('tools/smear.js');
    const mk = (rot) => {
        const w = fresh({ rotation: rot ?? { x: 0, y: 180 } });
        put(w.dim, 0, 0, 0, 'stone'); put(w.dim, 1, 0, 0, 'dirt');
        put(w.dim, 0, 0, -3, 'glass');
        return w;
    };
    const region = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
    {
        // looking north (yaw 180): stone stops at the glass, dirt runs on
        const { dim, player } = mk();
        const msgs = await runTool(sm, { amount: 5 }, { player, region });
        noErr(msgs, 'smear facing');
        ok(at(dim, 0, 0, -2).id === 'minecraft:stone' && at(dim, 0, 0, -3).id === 'minecraft:glass' && at(dim, 0, 0, -4).id === 'minecraft:air', 'smear stops at non-air');
        ok(at(dim, 1, 0, -5).id === 'minecraft:dirt', 'smear drags 5 north');
    }
    {
        const { dim, player } = mk();
        await runTool(sm, { amount: 5, replace: true }, { player, region });
        ok(at(dim, 0, 0, -3).id === 'minecraft:stone' && at(dim, 0, 0, -5).id === 'minecraft:stone', 'smear -r drags through blocks');
    }
    {
        const { dim, player } = mk();
        await runTool(sm, { amount: -2 }, { player, region });
        ok(at(dim, 1, 0, 2).id === 'minecraft:dirt', 'smear negative goes back (south)');
    }
    {
        const { dim, player } = mk({ x: 0, y: -135 });
        await runTool(sm, { amount: 3 }, { player, region });
        ok(at(dim, 4, 0, -3).id === 'minecraft:dirt', 'smear facing NE goes diagonal');
    }
    {
        const { dim, player } = mk();
        await runTool(sm, { amount: 3, direction: 'up' }, { player, region });
        ok(at(dim, 0, 3, 0).id === 'minecraft:stone', 'smear up');
    }
    {
        const { dim, player } = mk({ x: 80, y: 0 });
        await runTool(sm, { amount: 2 }, { player, region: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] });
        ok(at(dim, 1, -2, 0).id === 'minecraft:dirt', 'smear looking down goes down');
    }
    {
        const { dim, player } = mk();
        session(player).settings.gmask = 'dirt';
        await runTool(sm, { amount: 3 }, { player, region });
        ok(at(dim, 1, 0, -3).id === 'minecraft:dirt' && at(dim, 0, 0, -1).id === 'minecraft:air', 'smear global mask picks source blocks');
        session(player).settings.gmask = '';
    }
    {
        const { player } = mk();
        const m = await runTool(sm, { amount: 0 }, { player, region });
        ok(/0일 수 없/.test(last(m)), 'smear amount 0 refused');
    }
}

console.log(fails ? `shape_test: ${fails} FAILED` : 'shape_test: all ok');
process.exit(fails ? 1 : 0);
