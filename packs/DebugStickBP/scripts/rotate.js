/*
 * WorldEdit-style selection, copy, free-angle rotate, paste and undo.
 *
 *   wooden axe   break a block = corner 1, use on a block = corner 2
 *                (creative mode only, so survival axes keep working)
 *   /vyt:pos1, /vyt:pos2       corners at your feet
 *   /vyt:copy                  copy the selection; you are the pivot
 *   /vyt:rotate <y> [x] [z]    rotate the clipboard by any angle (degrees)
 *   /vyt:paste [skipAir]       paste with the pivot at your feet
 *   /vyt:spin <y>              rotate the selection in place around its centre
 *   /vyt:undo                  undo the last paste / spin
 *
 * Rotation never tilts a block: like WorldEdit, every target cell asks
 * "which source cell lands here?" (inverse rotation, nearest cell), so no
 * holes appear. Directional states (stairs, logs, torches, doors, signs...)
 * turn with the build, snapped to the nearest direction they can hold.
 * Rotations accumulate on the original copy, so rotating 1 degree 90
 * times gives the same result as rotating 90 once.
 */
import { BLOCKS } from './blocks-generated.js';
import { BlockPermutation, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, GameMode, system, world, } from '@minecraft/server';
const MAX_BLOCKS = 1000000;
const PER_TICK = 4000;
const UNDO_DEPTH = 8;
const sessions = new Map();
function session(player) {
    let s = sessions.get(player.id);
    if (!s) {
        s = { pos1: undefined, pos2: undefined, clip: undefined, undo: [], busy: false };
        sessions.set(player.id, s);
    }
    return s;
}
const floorVec = (l) => ({ x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) });
const key = (x, y, z) => `${x},${y},${z}`;
function say(player, msg) {
    try {
        player.sendMessage(msg);
    }
    catch (e) { }
}
function bounds(s) {
    const a = s.pos1, b = s.pos2;
    return {
        min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
        max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
    };
}
function volume(s) {
    const { min, max } = bounds(s);
    return (max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1);
}
// --------------------------------------------------------------------------
// rotation maths
// --------------------------------------------------------------------------
/**
 * Rotation matrix for yaw (around Y, clockwise seen from above, so 90
 * turns north into east like WorldEdit), then pitch (X) and roll (Z).
 */
function matrix(yaw, pitch, roll) {
    const r = (d) => d * Math.PI / 180;
    const cy = Math.cos(r(yaw)), sy = Math.sin(r(yaw));
    const cx = Math.cos(r(pitch)), sx = Math.sin(r(pitch));
    const cz = Math.cos(r(roll)), sz = Math.sin(r(roll));
    const Y = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]];
    const X = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
    const Z = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
    return mul(Z, mul(X, Y));
}
function mul(a, b) {
    return a.map((row, i) => b[0].map((_, j) => row.reduce((acc, _, k) => acc + a[i][k] * b[k][j], 0)));
}
const transpose = (m) => m[0].map((_, j) => m.map(row => row[j]));
const apply = (m, v) => [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// --------------------------------------------------------------------------
// turning directional block states
// --------------------------------------------------------------------------
const VEC = {
    north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};
function nearest(v, allowed) {
    let best = allowed[0], bestDot = -Infinity;
    for (const d of allowed) {
        const w = VEC[d];
        const dot = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
        if (dot > bestDot) {
            bestDot = dot;
            best = d;
        }
    }
    return best;
}
const H = ['north', 'south', 'east', 'west'];
const ALL = ['down', 'up', 'north', 'south', 'west', 'east'];
function turnDir(m, d, allowed) {
    if (!VEC[d])
        return d;
    return nearest(apply(m, VEC[d]), allowed);
}
/** Encodings Bedrock uses for "a direction" in its block states. */
const ENCODINGS = {
    'minecraft:cardinal_direction': { values: H },
    'minecraft:facing_direction': { values: ALL },
    'minecraft:block_face': { values: ALL },
    'minecraft:vertical_half': null,
    'facing_direction': { list: ['down', 'up', 'north', 'south', 'west', 'east'] },
    'direction': { list: ['south', 'west', 'north', 'east'] },
    'weirdo_direction': { list: ['east', 'west', 'south', 'north'] },
    'coral_direction': { list: ['west', 'east', 'north', 'south'] },
    'torch_facing_direction': { strings: { west: 'west', east: 'east', north: 'north', south: 'south' } },
};
const AXIS_NAME = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const LEVER = ['down_east_west', 'east', 'west', 'south', 'north', 'up_north_south', 'up_east_west', 'down_north_south'];
const TORCH = ['unknown', 'west', 'east', 'north', 'south', 'top'];
const VINE_BITS = ['south', 'west', 'north', 'east'];
/**
 * How the independent blocks store their direction in vyt:facing/vyt:dir.
 */
function independentEncoding(typeId, k) {
    const fam = BLOCKS[typeId]?.family;
    if (k === 'vyt:facing') {
        if (fam === 'stairs')
            return ENCODINGS.weirdo_direction;
        if (fam === 'torch')
            return { list: TORCH };
        if (fam === 'button' || fam === 'end_rod')
            return ENCODINGS.facing_direction;
    }
    if (k === 'vyt:dir' && fam === 'lever')
        return 'lever';
    if (k.startsWith('vyt:'))
        return ENCODINGS[k.slice(4)];
    return undefined;
}
function turnLever(m, yawSteps, v) {
    if (H.includes(v))
        return turnDir(m, v, H);
    if (Math.round(yawSteps / 90) % 2 !== 0)
        return v.endsWith('north_south') ? v.replace('north_south', 'east_west') : v.replace('east_west', 'north_south');
    return v;
}
function turnStates(perm, m, yawSteps) {
    let states;
    try {
        states = perm.getAllStates();
    }
    catch (e) {
        return perm;
    }
    const typeId = perm.type.id;
    const out = {};
    for (const [k, v] of Object.entries(states)) {
        const enc = ENCODINGS[k] ?? independentEncoding(typeId, k);
        if (enc === 'lever') {
            out[k] = LEVER.indexOf(turnLever(m, yawSteps, LEVER[v] ?? 'east'));
        }
        else if (k === 'lever_direction' && typeof v === 'string') {
            out[k] = turnLever(m, yawSteps, v);
        }
        else if (enc?.values && typeof v === 'string') {
            out[k] = turnDir(m, v, enc.values);
        }
        else if (enc?.list && typeof v === 'number' && enc.list[v]) {
            const d = enc.list[v];
            out[k] = VEC[d] ? enc.list.indexOf(turnDir(m, d, enc.list.filter(x => VEC[x]))) : v;
        }
        else if (enc?.strings && typeof v === 'string' && enc.strings[v]) {
            out[k] = turnDir(m, v, H);
        }
        else if ((k === 'pillar_axis' || k === 'vyt:pillar_axis') && typeof v === 'string' && AXIS_NAME[v]) {
            const w = apply(m, AXIS_NAME[v]).map(Math.abs);
            out[k] = ['x', 'y', 'z'][w.indexOf(Math.max(...w))];
        }
        else if (k.endsWith('ground_sign_direction') && typeof v === 'number') {
            // 16 steps of 22.5 degrees, clockwise
            out[k] = ((v + Math.round(yawSteps * 16 / 360)) % 16 + 16) % 16;
        }
        else if (k.endsWith('vine_direction_bits') && typeof v === 'number') {
            let bits = 0;
            VINE_BITS.forEach((d, i) => {
                if ((v >> i) & 1)
                    bits |= 1 << VINE_BITS.indexOf(turnDir(m, d, H));
            });
            out[k] = bits;
        }
    }
    // one value per horizontal side (independent fences, walls, panes,
    // lichen): carry each side's value to the side it turns into
    const sides = H.filter(d => ('vyt:' + d) in states);
    if (sides.length === 4) {
        const moved = { 'vyt:north': 0, 'vyt:south': 0, 'vyt:east': 0, 'vyt:west': 0 };
        for (const d of sides) {
            const to = 'vyt:' + turnDir(m, d, H);
            moved[to] = Math.max(moved[to], states['vyt:' + d]);
        }
        Object.assign(out, moved);
    }
    try {
        return BlockPermutation.resolve(typeId, { ...states, ...out });
    }
    catch (e) {
        return perm;
    }
}
// --------------------------------------------------------------------------
// clipboard
// --------------------------------------------------------------------------
/**
 * Reads the selection into a clipboard. Offsets are relative to `pivot`.
 */
function* readJob(player, dim, min, max, pivot, done) {
    const blocks = [];
    let n = 0, missing = 0;
    for (let x = min.x; x <= max.x; x++)
        for (let y = min.y; y <= max.y; y++)
            for (let z = min.z; z <= max.z; z++) {
                let b;
                try {
                    b = dim.getBlock({ x, y, z });
                }
                catch (e) { }
                if (!b) {
                    missing++;
                }
                else {
                    blocks.push({ dx: x - pivot.x, dy: y - pivot.y, dz: z - pivot.z, perm: b.permutation, water: b.isWaterlogged });
                }
                if (++n % PER_TICK === 0)
                    yield;
            }
    done(blocks, missing);
}
/**
 * Where the rotated clipboard lands: for every target cell, the source
 * cell that rotates onto it (nearest), so the result has no holes.
 */
function rotatedCells(clip) {
    const m = clip.matrix;
    const inv = transpose(m);
    const c = clip.center;
    const src = new Map();
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const b of clip.blocks) {
        src.set(key(b.dx, b.dy, b.dz), b);
        // corners of the cell, rotated, give the target bounds
        for (const cx of [0, 1])
            for (const cy of [0, 1])
                for (const cz of [0, 1]) {
                    const q = apply(m, [b.dx + cx - c[0], b.dy + cy - c[1], b.dz + cz - c[2]]);
                    const p = [q[0] + c[0], q[1] + c[1], q[2] + c[2]];
                    for (let i = 0; i < 3; i++) {
                        lo[i] = Math.min(lo[i], p[i]);
                        hi[i] = Math.max(hi[i], p[i]);
                    }
                }
    }
    return { src, inv, lo: lo.map(Math.floor), hi: hi.map(v => Math.ceil(v) - 1) };
}
function* pasteJob(player, dim, clip, at, skipAir, record, done) {
    const { src, inv, lo, hi } = rotatedCells(clip);
    const turned = new Map();
    let n = 0, placed = 0;
    for (let x = lo[0]; x <= hi[0]; x++)
        for (let y = lo[1]; y <= hi[1]; y++)
            for (let z = lo[2]; z <= hi[2]; z++) {
                if (++n % PER_TICK === 0)
                    yield;
                // centre of the target cell, rotated back into the copy
                const c = clip.center;
                const q = apply(inv, [x + 0.5 - c[0], y + 0.5 - c[1], z + 0.5 - c[2]]);
                const p = [q[0] + c[0], q[1] + c[1], q[2] + c[2]];
                const b = src.get(key(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])));
                if (!b)
                    continue;
                if (skipAir && b.perm.type.id === 'minecraft:air')
                    continue;
                let perm = turned.get(b);
                if (!perm) {
                    perm = clip.yaw || clip.pitch || clip.roll ? turnStates(b.perm, clip.matrix, clip.yaw) : b.perm;
                    turned.set(b, perm);
                }
                const loc = { x: at.x + x, y: at.y + y, z: at.z + z };
                try {
                    const target = dim.getBlock(loc);
                    if (!target)
                        continue;
                    record(loc, target.permutation, target.isWaterlogged);
                    target.setPermutation(perm);
                    if (b.water)
                        try {
                            target.setWaterlogged(true);
                        }
                        catch (e) { }
                    placed++;
                }
                catch (e) { }
            }
    done(placed);
}
function* restoreJob(dim, entries, done) {
    let n = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        try {
            const b = dim.getBlock(e.loc);
            if (b) {
                b.setPermutation(e.perm);
                if (e.water)
                    b.setWaterlogged(true);
            }
        }
        catch (err) { }
        if (++n % PER_TICK === 0)
            yield;
    }
    done(n);
}
// --------------------------------------------------------------------------
// commands
// --------------------------------------------------------------------------
function needSelection(player, s) {
    if (!s.pos1 || !s.pos2) {
        say(player, '§c먼저 범위를 지정하세요: 나무 도끼로 블록 부수기(1번) / 블록 사용(2번), 또는 /vyt:pos1, /vyt:pos2');
        return false;
    }
    const v = volume(s);
    if (v > MAX_BLOCKS) {
        say(player, `§c범위가 너무 큽니다 (${v}블록, 최대 ${MAX_BLOCKS})`);
        return false;
    }
    return true;
}
function startPaste(player, s, clip, at, skipAir, beforeEntries, label) {
    const dim = player.dimension;
    const record = [];
    const seen = new Set();
    for (const e of beforeEntries ?? []) {
        seen.add(key(e.loc.x, e.loc.y, e.loc.z));
        record.push(e);
    }
    s.busy = true;
    system.runJob(pasteJob(player, dim, clip, at, skipAir, (loc, perm, water) => {
        const k = key(loc.x, loc.y, loc.z);
        if (seen.has(k))
            return;
        seen.add(k);
        record.push({ loc, perm, water });
    }, (placed) => {
        s.busy = false;
        s.undo.push({ dim, entries: record });
        if (s.undo.length > UNDO_DEPTH)
            s.undo.shift();
        say(player, `§a${label}: ${placed}블록 배치 §7(/vyt:undo 로 되돌리기)`);
    }));
}
function busy(player, s) {
    if (s.busy) {
        say(player, '§e이전 작업이 아직 진행 중입니다');
        return true;
    }
    return false;
}
const COMMANDS = [
    {
        name: 'vyt:pos1', description: '선택 범위 1번 지점을 발밑으로',
        run(player, s) {
            s.pos1 = floorVec(player.location);
            say(player, `§d1번 지점§r ${s.pos1.x} ${s.pos1.y} ${s.pos1.z}`);
        },
    },
    {
        name: 'vyt:pos2', description: '선택 범위 2번 지점을 발밑으로',
        run(player, s) {
            s.pos2 = floorVec(player.location);
            say(player, `§d2번 지점§r ${s.pos2.x} ${s.pos2.y} ${s.pos2.z}${s.pos1 ? ` §7(${volume(s)}블록)` : ''}`);
        },
    },
    {
        name: 'vyt:copy', description: '선택 범위를 복사 (지금 서 있는 곳이 회전 중심)',
        run(player, s) {
            if (busy(player, s) || !needSelection(player, s))
                return;
            const { min, max } = bounds(s);
            const pivot = floorVec(player.location);
            s.busy = true;
            system.runJob(readJob(player, player.dimension, min, max, pivot, (blocks, missing) => {
                s.busy = false;
                // turn around the centre of the cell you stood in
                s.clip = { blocks, yaw: 0, pitch: 0, roll: 0, matrix: IDENTITY, center: [0.5, 0.5, 0.5] };
                say(player, `§a복사함: ${blocks.length}블록${missing ? ` §e(로드 안 된 ${missing}칸 제외)` : ''}`);
            }));
        },
    },
    {
        name: 'vyt:rotate', description: '클립보드를 원하는 각도로 회전 (도 단위, Y는 위에서 봤을 때 시계방향)',
        mandatory: [{ name: 'y', type: CustomCommandParamType.Float }],
        optional: [{ name: 'x', type: CustomCommandParamType.Float }, { name: 'z', type: CustomCommandParamType.Float }],
        run(player, s, y, x, z) {
            if (!s.clip)
                return say(player, '§c클립보드가 비어 있습니다. 먼저 /vyt:copy');
            const c = s.clip;
            c.yaw += y ?? 0;
            c.pitch += x ?? 0;
            c.roll += z ?? 0;
            c.matrix = matrix(c.yaw, c.pitch, c.roll);
            say(player, `§a회전: 누적 Y ${fmt(c.yaw)}° X ${fmt(c.pitch)}° Z ${fmt(c.roll)}° §7(/vyt:paste 로 붙여넣기)`);
        },
    },
    {
        name: 'vyt:paste', description: '클립보드를 붙여넣기 (회전 중심이 발밑으로)',
        optional: [{ name: 'skipAir', type: CustomCommandParamType.Boolean }],
        run(player, s, skipAir) {
            if (busy(player, s))
                return;
            if (!s.clip)
                return say(player, '§c클립보드가 비어 있습니다. 먼저 /vyt:copy');
            startPaste(player, s, s.clip, floorVec(player.location), !!skipAir, [], '붙여넣기');
        },
    },
    {
        name: 'vyt:spin', description: '선택 범위를 그 자리에서 회전 (범위 중심 기준, Y축 도 단위)',
        mandatory: [{ name: 'y', type: CustomCommandParamType.Float }],
        run(player, s, y) {
            if (busy(player, s) || !needSelection(player, s))
                return;
            const { min, max } = bounds(s);
            const dim = player.dimension;
            // pivot at the centre of the selection (cell edges, so even
            // widths turn around their true middle)
            const cx = (min.x + max.x + 1) / 2, cz = (min.z + max.z + 1) / 2;
            const pivot = { x: Math.floor(cx), y: min.y, z: Math.floor(cz) };
            s.busy = true;
            system.runJob(readJob(player, dim, min, max, pivot, (blocks) => {
                const clip = { blocks, yaw: y, pitch: 0, roll: 0, matrix: matrix(y, 0, 0),
                    center: [cx - pivot.x, 0, cz - pivot.z] };
                // clear the original, remembering it for undo, then paste
                const before = [];
                const air = BlockPermutation.resolve('minecraft:air');
                system.runJob((function* () {
                    let n = 0;
                    for (const b of blocks) {
                        const loc = { x: pivot.x + b.dx, y: pivot.y + b.dy, z: pivot.z + b.dz };
                        try {
                            const t = dim.getBlock(loc);
                            if (t) {
                                before.push({ loc, perm: t.permutation, water: t.isWaterlogged });
                                t.setPermutation(air);
                            }
                        }
                        catch (e) { }
                        if (++n % PER_TICK === 0)
                            yield;
                    }
                    s.busy = false;
                    startPaste(player, s, clip, pivot, true, before, `제자리 회전 ${fmt(y)}°`);
                })());
            }));
        },
    },
    {
        name: 'vyt:undo', description: '마지막 붙여넣기/회전을 되돌리기',
        run(player, s) {
            if (busy(player, s))
                return;
            const last = s.undo.pop();
            if (!last)
                return say(player, '§e되돌릴 작업이 없습니다');
            s.busy = true;
            system.runJob(restoreJob(last.dim, last.entries, (n) => {
                s.busy = false;
                say(player, `§a되돌림: ${n}블록`);
            }));
        },
    },
];
const fmt = (v) => Math.round(v * 100) / 100;
// --------------------------------------------------------------------------
// wand and selection outline
// --------------------------------------------------------------------------
const WAND = 'minecraft:wooden_axe';
function isWandUser(player, item) {
    if (item?.typeId !== WAND)
        return false;
    try {
        return player.getGameMode() === GameMode.Creative;
    }
    catch (e) {
        return false;
    }
}
function outline(player, s) {
    if (!s.pos1 || !s.pos2)
        return;
    const { min, max } = bounds(s);
    const lo = [min.x, min.y, min.z], hi = [max.x + 1, max.y + 1, max.z + 1];
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const step = Math.max(1, Math.ceil(span / 24));
    const pts = [];
    for (let axis = 0; axis < 3; axis++) {
        const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
        for (const a of [lo[o1], hi[o1]])
            for (const b of [lo[o2], hi[o2]])
                for (let t = lo[axis]; t <= hi[axis]; t += step) {
                    const p = [0, 0, 0];
                    p[axis] = t;
                    p[o1] = a;
                    p[o2] = b;
                    pts.push({ x: p[0], y: p[1], z: p[2] });
                }
    }
    for (const p of pts.slice(0, 400)) {
        try {
            player.spawnParticle('minecraft:villager_happy', p);
        }
        catch (e) { }
    }
}
export function enableRotate() {
    system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
        for (const c of COMMANDS) {
            customCommandRegistry.registerCommand({
                name: c.name,
                description: c.description,
                permissionLevel: CommandPermissionLevel.GameDirectors,
                cheatsRequired: true,
                mandatoryParameters: c.mandatory ?? [],
                optionalParameters: c.optional ?? [],
            }, (origin, ...args) => {
                const player = origin.sourceEntity;
                if (!player || player.typeId !== 'minecraft:player')
                    return { status: CustomCommandStatus.Failure, message: '플레이어만 쓸 수 있습니다' };
                // commands run in read-only mode: do the work next tick
                system.run(() => c.run(player, session(player), ...args));
                return { status: CustomCommandStatus.Success };
            });
        }
    });
    world.beforeEvents.playerBreakBlock.subscribe(ev => {
        if (!isWandUser(ev.player, ev.itemStack))
            return;
        ev.cancel = true;
        const s = session(ev.player);
        s.pos1 = { ...ev.block.location };
        system.run(() => say(ev.player, `§d1번 지점§r ${s.pos1.x} ${s.pos1.y} ${s.pos1.z}${s.pos2 ? ` §7(${volume(s)}블록)` : ''}`));
    });
    world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
        if (!isWandUser(ev.player, ev.itemStack))
            return;
        ev.cancel = true;
        if (!ev.isFirstEvent)
            return;
        const s = session(ev.player);
        s.pos2 = { ...ev.block.location };
        system.run(() => say(ev.player, `§d2번 지점§r ${s.pos2.x} ${s.pos2.y} ${s.pos2.z}${s.pos1 ? ` §7(${volume(s)}블록)` : ''}`));
    });
    world.afterEvents.playerLeave.subscribe(ev => sessions.delete(ev.playerId));
    system.runInterval(() => {
        for (const player of world.getAllPlayers()) {
            const s = sessions.get(player.id);
            if (!s)
                continue;
            try {
                const item = player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
                if (isWandUser(player, item))
                    outline(player, s);
            }
            catch (e) { }
        }
    }, 10);
}
