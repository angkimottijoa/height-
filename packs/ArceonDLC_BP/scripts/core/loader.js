/*
 * Loading far-away chunks while editing.
 *
 * Blocks in chunks nobody is near are not loaded, and writing to them does
 * nothing. With "로드 안 된 곳도 불러와서 설치" on (default), edits are
 * split into tiles of chunks; each tile is force-loaded with a ticking area
 * (world.tickingAreaManager), written, and released again before the next
 * one, so any size works within the add-on's ticking chunk allowance.
 */
import { system, world } from '@minecraft/server';

const PER_TICK = 3000;
let seq = 0;

function manager() {
    try {
        return world.tickingAreaManager ?? null;
    }
    catch (e) {
        return null;
    }
}

/** Chunks per tile side that fit in the free ticking allowance (0 = none free). */
function tileSide() {
    const m = manager();
    if (!m)
        return 0;
    let free = 0;
    try {
        free = m.maxChunkCount - m.chunkCount;
    }
    catch (e) {
        return 0;
    }
    return Math.max(0, Math.min(16, Math.floor(Math.sqrt(free))));
}

const wait = (ticks) => new Promise(r => system.runTimeout(r, ticks));

function loaded(dim, from, to) {
    for (let x = from.x; x <= to.x + 15; x += 16)
        for (let z = from.z; z <= to.z + 15; z += 16)
            try {
                if (!dim.getBlock({ x: Math.min(x, to.x), y: from.y, z: Math.min(z, to.z) }))
                    return false;
            }
            catch (e) {
                return false;
            }
    return true;
}

/**
 * Keep a box loaded while `fn` runs. Returns fn's result. Falls back to
 * just running fn when the area cannot be loaded.
 */
export async function withLoaded(dim, from, to, fn) {
    const m = manager();
    if (!m || loaded(dim, from, to))
        return fn();
    const id = `arc_load_${system.currentTick}_${seq++}`;
    const opts = { dimension: dim, from, to };
    let made = false;
    try {
        if (m.hasCapacity(opts)) {
            await Promise.race([m.createTickingArea(id, opts), wait(20 * 30)]);
            made = true;
        }
    }
    catch (e) { }
    try {
        return await fn();
    }
    finally {
        if (made)
            try {
                m.removeTickingArea(id);
            }
            catch (e) { }
    }
}

function writeJob(dim, list, out) {
    return new Promise(resolve => {
        function* job() {
            let n = 0;
            for (const [x, y, z, perm] of list) {
                let b;
                try {
                    b = dim.getBlock({ x, y, z });
                }
                catch (e) { }
                if (!b)
                    out.skipped++;
                else {
                    try {
                        const old = b.permutation;
                        if (old !== perm) {
                            out.before.push([x, y, z, old]);
                            b.setPermutation(perm);
                            out.done++;
                        }
                    }
                    catch (e) {
                        out.skipped++;
                    }
                }
                if (++n % PER_TICK === 0)
                    yield;
            }
            resolve();
        }
        system.runJob(job());
    });
}

/**
 * Write [x, y, z, perm] entries. Returns {before, done, skipped}; `before`
 * holds what was there (for undo).
 */
export async function placeAll(dim, list, { load = true } = {}) {
    const out = { before: [], done: 0, skipped: 0 };
    const side = load ? tileSide() : 0;
    if (!side) {
        await writeJob(dim, list, out);
        return out;
    }
    const size = side * 16;
    const tiles = new Map();
    for (const e of list) {
        const k = Math.floor(e[0] / size) + ',' + Math.floor(e[2] / size);
        let t = tiles.get(k);
        if (!t)
            tiles.set(k, t = []);
        t.push(e);
    }
    const lowY = dim.heightRange?.min ?? -64;
    for (const t of tiles.values()) {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const [x, , z] of t) {
            x0 = Math.min(x0, x);
            z0 = Math.min(z0, z);
            x1 = Math.max(x1, x);
            z1 = Math.max(z1, z);
        }
        await withLoaded(dim, { x: x0, y: lowY, z: z0 }, { x: x1, y: lowY, z: z1 }, () => writeJob(dim, t, out));
    }
    return out;
}

/** Chunks a box covers. */
export function chunkCount(from, to) {
    return (Math.floor(to.x / 16) - Math.floor(from.x / 16) + 1) * (Math.floor(to.z / 16) - Math.floor(from.z / 16) + 1);
}
/** True if a box fits in the free ticking allowance at once. */
export function fits(from, to) {
    const m = manager();
    if (!m)
        return false;
    try {
        return chunkCount(from, to) <= m.maxChunkCount - m.chunkCount;
    }
    catch (e) {
        return false;
    }
}
