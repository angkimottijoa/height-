/*
 * Edit sessions: tools write into a buffer, the buffer is placed a few
 * thousand blocks per tick, and what was there before goes onto the
 * player's undo stack.
 *
 *   const edit = new EditSession(player);
 *   edit.set({x, y, z}, perm);      // buffered
 *   edit.get({x, y, z});            // buffered value, or the world
 *   await edit.commit('도로');       // place it, record undo
 */
import { StructureSaveMode, system, world } from '@minecraft/server';
import { AIR, isAirId, isSolidId } from './blocks.js';
import { placeAll, withLoaded } from './loader.js';
import { save, session } from './session.js';

/** The player's "load unloaded chunks" setting (default on). */
export const loadAll = (player) => session(player).settings.loadAll !== false;

export const PER_TICK = 3000;
export const MAX_CHANGES = 2000000;
const UNDO_DEPTH = 15;

const histories = new Map(); // player id -> {undo: [], redo: []}
export function history(player) {
    let h = histories.get(player.id);
    if (!h) {
        h = { undo: [], redo: [] };
        histories.set(player.id, h);
    }
    return h;
}
const busy = new Set();
export const isBusy = (player) => busy.has(player.id);

export class EditSession {
    /**
     * @param player  the player (messages, undo history)
     * @param dimension  defaults to the player's
     * @param mask  optional {test(pos, edit)}: blocks it rejects are not changed
     */
    constructor(player, dimension = player.dimension, mask = null) {
        this.player = player;
        this.dim = dimension;
        this.mask = mask;
        this.changes = new Map(); // key -> BlockPermutation
        this.cache = new Map(); // key -> BlockPermutation | null (world reads)
        this.minY = dimension.heightRange?.min ?? -64;
        this.maxY = (dimension.heightRange?.max ?? 320) - 1;
        this.missing = 0;
    }
    static key(p) {
        return p.x + ',' + p.y + ',' + p.z;
    }
    /** What is in the world (ignores the buffer). null if unloaded / outside. */
    world(p) {
        const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
        const k = x + ',' + y + ',' + z;
        let v = this.cache.get(k);
        if (v !== undefined)
            return v;
        v = null;
        if (y >= this.minY && y <= this.maxY) {
            try {
                v = this.dim.getBlock({ x, y, z })?.permutation ?? null;
            }
            catch (e) { }
        }
        if (this.cache.size > 400000)
            this.cache.clear();
        this.cache.set(k, v);
        return v;
    }
    /** Buffered permutation at p, else the world's (null if unloaded). */
    get(p) {
        const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
        const c = this.changes.get(x + ',' + y + ',' + z);
        if (c)
            return c;
        return this.world({ x, y, z });
    }
    id(p) {
        return this.get(p)?.type.id ?? 'minecraft:air';
    }
    isAir(p) {
        return isAirId(this.get(p)?.type.id);
    }
    isSolid(p) {
        return isSolidId(this.get(p)?.type.id);
    }
    /** Set a block (BlockPermutation). Respects the mask. Returns false when masked out. */
    set(p, perm) {
        if (!perm)
            return false;
        const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
        if (y < this.minY || y > this.maxY)
            return false;
        const pos = { x, y, z };
        if (this.mask && !this.mask.test(pos, this))
            return false;
        if (this.changes.size >= MAX_CHANGES)
            throw new Error(`한 번에 바꿀 수 있는 블록(${MAX_CHANGES})을 넘었습니다`);
        this.changes.set(x + ',' + y + ',' + z, perm);
        return true;
    }
    /** set() without the mask. */
    force(p, perm) {
        const m = this.mask;
        this.mask = null;
        try {
            return this.set(p, perm);
        }
        finally {
            this.mask = m;
        }
    }
    clear(p) {
        return this.set(p, AIR());
    }
    get size() {
        return this.changes.size;
    }
    /**
     * Highest solid block in a column between minY and maxY (WorldEdit's
     * getHighestTerrainBlock). Returns minY when the column is empty.
     */
    highest(x, z, minY = this.minY, maxY = this.maxY) {
        minY = Math.max(minY, this.minY);
        maxY = Math.min(maxY, this.maxY);
        for (let y = maxY; y >= minY; y--)
            if (isSolidId(this.get({ x, y, z })?.type.id))
                return y;
        return minY;
    }
    /**
     * Place the buffer over several ticks and record undo.
     * Resolves to the number of blocks changed.
     */
    async commit(label = '편집') {
        const player = this.player;
        if (this.changes.size === 0)
            return 0;
        busy.add(player.id);
        const list = [];
        for (const [k, perm] of this.changes) {
            const [x, y, z] = k.split(',').map(Number);
            list.push([x, y, z, perm]);
        }
        let out;
        try {
            out = await placeAll(this.dim, list, { load: loadAll(player) });
        }
        finally {
            busy.delete(player.id);
        }
        if (out.before.length) {
            const h = history(player);
            h.undo.push({ label, dim: this.dim.id, blocks: out.before });
            if (h.undo.length > UNDO_DEPTH)
                drop(h.undo.shift());
            h.redo.length = 0;
        }
        if (out.skipped)
            say(player, loadAll(player)
                ? `§e불러오지 못한 곳 ${out.skipped}블록은 건너뛰었습니다 (월드 높이 밖이거나 틱킹 영역 한도 초과).`
                : `§e로드되지 않은 곳 ${out.skipped}블록은 건너뛰었습니다. 설정에서 "로드 안 된 곳도 불러와서 설치"를 켜면 같이 설치됩니다.`);
        return out.done;
    }
}

export function say(player, msg) {
    try {
        player.sendMessage(msg);
    }
    catch (e) { }
}

/** Swap a recorded change set back, returning the inverse for redo/undo. */
// ---------------------------------------------------------------- big edits
/*
 * Very big edits (the city map) keep their undo as structures saved in the
 * world (engine side, not script memory): a snapshot of each area before it
 * is written. Undo places them back (snapshotting what is there first, for
 * redo). The record is also kept with the player (session), so it can still be
 * undone after leaving and coming back.
 */
let snapSeq = 0;
/** Save a box as a structure in the world; its id, or null. The box must be loaded. */
export function snapshot(dim, from, to) {
    const id = `arcundo:${Date.now().toString(36)}_${(snapSeq++).toString(36)}`;
    try {
        world.structureManager.createFromWorld(id, dim, from, to, { saveMode: StructureSaveMode.World, includeEntities: false, includeBlocks: true });
        return id;
    }
    catch (e) {
        return null;
    }
}
/** Forget a record: its structures are deleted from the world. */
function drop(rec) {
    for (const s of rec?.structs ?? [])
        try {
            world.structureManager.delete(s.id);
        }
        catch (e) { }
}
/** Remember a structure-backed record: in the history and with the player (survives a rejoin). */
export function pushBig(player, rec, { fresh = true } = {}) {
    const h = history(player);
    rec.key = rec.key ?? `${Date.now().toString(36)}${(snapSeq++).toString(36)}`;
    h.undo.push(rec);
    if (h.undo.length > UNDO_DEPTH)
        drop(h.undo.shift());
    if (fresh) {
        // a new edit: what could be redone is gone
        for (const r of h.redo)
            drop(r);
        h.redo.length = 0;
    }
    const s = session(player);
    s.bigUndo = [...(s.bigUndo ?? []).filter(r => r.key !== rec.key), { key: rec.key, label: rec.label, dim: rec.dim, structs: rec.structs }].slice(-5);
    save(player);
}
function forgetBig(player, key) {
    const s = session(player);
    if (s.bigUndo?.some(r => r.key === key)) {
        s.bigUndo = s.bigUndo.filter(r => r.key !== key);
        save(player);
    }
}
async function replayStructs(player, rec) {
    const dim = player.dimension, sm = world.structureManager, out = [];
    for (const st of [...rec.structs].reverse()) {
        await withLoaded(dim, st.from, st.to, async () => {
            const id = snapshot(dim, st.from, st.to);
            if (id)
                out.push({ id, from: st.from, to: st.to });
            try {
                sm.place(st.id, dim, st.from, { includeEntities: false });
            }
            catch (e) { }
            try {
                sm.delete(st.id);
            }
            catch (e) { }
        });
    }
    return { label: rec.label, dim: rec.dim, structs: out.reverse(), blocks: [], key: rec.key };
}
const size = (rec) => rec.structs ? `${rec.structs.length}구역` : `${rec.blocks.length}블록`;

async function replay(player, rec) {
    if (rec.structs) {
        busy.add(player.id);
        try {
            return await replayStructs(player, rec);
        }
        finally {
            busy.delete(player.id);
        }
    }
    busy.add(player.id);
    try {
        const list = [];
        for (let i = rec.blocks.length - 1; i >= 0; i--)
            list.push(rec.blocks[i]);
        const out = await placeAll(player.dimension, list, { load: loadAll(player) });
        return { label: rec.label, dim: rec.dim, blocks: out.before };
    }
    finally {
        busy.delete(player.id);
    }
}

export async function undo(player) {
    const h = history(player);
    let rec = h.undo.pop();
    if (!rec) {
        // after a rejoin: a big edit kept with the player
        const big = session(player).bigUndo ?? [];
        if (big.length)
            rec = big[big.length - 1];
    }
    if (!rec) {
        say(player, '§c되돌릴 작업이 없습니다.');
        return;
    }
    if (rec.dim !== player.dimension.id) {
        h.undo.push(rec);
        say(player, '§c그 작업을 한 차원(dimension)으로 가서 되돌리세요.');
        return;
    }
    if (rec.structs)
        forgetBig(player, rec.key);
    h.redo.push(await replay(player, rec));
    say(player, `§a되돌림: ${rec.label} (${size(rec)})`);
}

export async function redo(player) {
    const h = history(player);
    const rec = h.redo.pop();
    if (!rec) {
        say(player, '§c다시 할 작업이 없습니다.');
        return;
    }
    if (rec.dim !== player.dimension.id) {
        h.redo.push(rec);
        say(player, '§c그 작업을 한 차원(dimension)으로 가서 다시 하세요.');
        return;
    }
    const back = await replay(player, rec);
    if (back.structs)
        pushBig(player, back, { fresh: false });
    else
        h.undo.push(back);
    say(player, `§a다시 함: ${rec.label} (${size(rec)})`);
}

/** Run a generator over several ticks. Resolves with its return value. */
export function runAsync(gen) {
    // a generator may yield a promise (e.g. "load these chunks first"): the
    // job pauses until it settles and gets its value back from yield
    return new Promise((resolve, reject) => {
        let input;
        const step = () => {
            function* wrap() {
                try {
                    while (true) {
                        const r = gen.next(input);
                        input = undefined;
                        if (r.done) {
                            resolve(r.value);
                            return;
                        }
                        if (r.value && typeof r.value.then === 'function') {
                            r.value.then(v => {
                                input = v;
                                step();
                            }, reject);
                            return;
                        }
                        yield;
                    }
                }
                catch (e) {
                    reject(e);
                }
            }
            system.runJob(wrap());
        };
        step();
    });
}
