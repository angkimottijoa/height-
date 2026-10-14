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
const TILE_MAX = 4; // chunks per tile side: small tiles always fit
const WAIT_LOAD = 20 * 60; // ticks to wait for a tile to finish loading
let seq = 0;

function manager() {
    try {
        return world.tickingAreaManager ?? null;
    }
    catch (e) {
        return null;
    }
}

/** Chunks per tile side that fit in the free ticking allowance (never 0: the command fallback takes over). */
function tileSide() {
    const m = manager();
    let free = 16;
    if (m)
        try {
            free = m.maxChunkCount - m.chunkCount;
        }
        catch (e) { }
    return Math.max(1, Math.min(TILE_MAX, Math.floor(Math.sqrt(Math.max(1, free)))));
}

const wait = (ticks) => new Promise(r => system.runTimeout(r, ticks));

function loaded(dim, from, to) {
    for (let x = Math.floor(from.x / 16) * 16; x <= to.x; x += 16)
        for (let z = Math.floor(from.z / 16) * 16; z <= to.z; z += 16)
            try {
                const b = dim.getBlock({ x: Math.max(x, from.x), y: from.y, z: Math.max(z, from.z) });
                if (!b || (b.isValid !== undefined && !(typeof b.isValid === 'function' ? b.isValid() : b.isValid)))
                    return false;
            }
            catch (e) {
                return false;
            }
    return true;
}

/**
 * Load a box and keep it loaded until the returned release() is called.
 * Tries the ticking area manager (waiting for free capacity), then the
 * /tickingarea command, and waits until every chunk really is loaded.
 * Resolves to release (a no-op when nothing had to be loaded); never throws.
 */
export async function ensureLoaded(dim, from, to) {
    if (loaded(dim, from, to))
        return () => { };
    const lowY = dim.heightRange?.min ?? -64;
    from = { x: from.x, y: lowY, z: from.z };
    to = { x: to.x, y: lowY, z: to.z };
    const m = manager();
    const id = `arc_load_${system.currentTick}_${seq++}`;
    let release = () => { };
    if (m) {
        const opts = { dimension: dim, from, to };
        for (let tries = 0; tries < 40; tries++) {
            let ok = false;
            try {
                ok = m.hasCapacity(opts);
            }
            catch (e) { }
            if (ok)
                break;
            await wait(10); // our own earlier areas are being released
        }
        try {
            await Promise.race([m.createTickingArea(id, opts), wait(20 * 30)]);
            release = () => {
                try {
                    m.removeTickingArea(id);
                }
                catch (e) { }
            };
        }
        catch (e) { }
    }
    if (!loaded(dim, from, to)) {
        // fall back on the command (its own allowance: 10 areas, 100 chunks each)
        try {
            dim.runCommand(`tickingarea add ${from.x} ${lowY} ${from.z} ${to.x} ${lowY} ${to.z} ${id}c true`);
            const before = release;
            release = () => {
                before();
                try {
                    dim.runCommand(`tickingarea remove ${id}c`);
                }
                catch (e) { }
            };
        }
        catch (e) { }
    }
    for (let t = 0; t < WAIT_LOAD && !loaded(dim, from, to); t += 5)
        await wait(5);
    return release;
}

/**
 * Keep a box loaded while `fn` runs. Returns fn's result. Falls back to
 * just running fn when the area cannot be loaded.
 */
export async function withLoaded(dim, from, to, fn) {
    const release = await ensureLoaded(dim, from, to);
    try {
        return await fn();
    }
    finally {
        release();
    }
}

function writeJob(dim, list, out, failed) {
    return new Promise(resolve => {
        function* job() {
            let n = 0;
            for (const e of list) {
                const [x, y, z, perm] = e;
                let b;
                try {
                    b = dim.getBlock({ x, y, z });
                }
                catch (err) { }
                if (!b)
                    failed.push(e);
                else {
                    try {
                        const old = b.permutation;
                        if (old !== perm) {
                            b.setPermutation(perm);
                            out.before.push([x, y, z, old]);
                            out.done++;
                        }
                    }
                    catch (err) {
                        failed.push(e);
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

/** Group entries into square tiles of `size` blocks. */
function tilesOf(list, size) {
    const tiles = new Map();
    for (const e of list) {
        const k = Math.floor(e[0] / size) + ',' + Math.floor(e[2] / size);
        let t = tiles.get(k);
        if (!t)
            tiles.set(k, t = []);
        t.push(e);
    }
    return [...tiles.values()];
}

/**
 * Write [x, y, z, perm] entries. Returns {before, done, skipped}; `before`
 * holds what was there (for undo). With `load`, every tile is loaded and
 * waited for before it is written; whatever still failed is tried again
 * chunk by chunk (up to 4 more rounds), so far-away parts are not left out.
 */
export async function placeAll(dim, list, { load = true } = {}) {
    const out = { before: [], done: 0, skipped: 0 };
    let failed = [];
    if (!load) {
        await writeJob(dim, list, out, failed);
        out.skipped = failed.length;
        return out;
    }
    const minY = dim.heightRange?.min ?? -64, maxY = dim.heightRange?.max ?? 320;
    let todo = list.filter(e => e[1] >= minY && e[1] < maxY);
    out.skipped += list.length - todo.length;
    let size = tileSide() * 16;
    for (let round = 0; round < 5 && todo.length; round++) {
        failed = [];
        for (const t of tilesOf(todo, size)) {
            let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
            for (const [x, , z] of t) {
                x0 = Math.min(x0, x);
                z0 = Math.min(z0, z);
                x1 = Math.max(x1, x);
                z1 = Math.max(z1, z);
            }
            await withLoaded(dim, { x: x0, y: minY, z: z0 }, { x: x1, y: minY, z: z1 }, () => writeJob(dim, t, out, failed));
        }
        todo = failed;
        size = 16; // retry the stragglers one chunk at a time
        if (todo.length)
            await wait(20);
    }
    out.skipped += todo.length;
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
