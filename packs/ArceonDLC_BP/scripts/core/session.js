/*
 * Per-player state: selection corners, wand points, loft frames, brush
 * bindings and remembered form values.
 *
 * 8Crafter's Server Utilities keeps its own selection in dynamic properties
 * that other packs cannot read, so the corners are mirrored: every use of
 * its selection tool (andexdb:selection_tool) is replayed here with the same
 * raycast and the same pos1/pos2 alternation.
 */
import { system, world } from '@minecraft/server';

const KEY = 'arc:session';
const sessions = new Map();

function fresh() {
    return {
        pos1: null, pos2: null, posM: false, dim: null,
        points: [], frames: [],
        wandMode: 'cuboid',
        brushes: {},
        settings: { font: 'minecraft', tgSeed: null, gmask: '', particles: true, fontCycle: false, frameFill: 'curved', picks: [] },
        forms: {},
    };
}

export function session(player) {
    let s = sessions.get(player.id);
    if (s)
        return s;
    s = fresh();
    try {
        const raw = player.getDynamicProperty(KEY);
        if (typeof raw === 'string') {
            const saved = JSON.parse(raw);
            Object.assign(s, saved);
            s.settings = { ...fresh().settings, ...(saved.settings ?? {}) };
        }
    }
    catch (e) { }
    sessions.set(player.id, s);
    return s;
}

const dirty = new Set();
/** Save the session to the player soon (dynamic properties, survives reloads). */
export function save(player) {
    if (dirty.has(player.id))
        return;
    dirty.add(player.id);
    system.runTimeout(() => {
        dirty.delete(player.id);
        const s = sessions.get(player.id);
        if (!s)
            return;
        try {
            let json = JSON.stringify(s);
            if (json.length > 30000) {
                // forms remember a lot of text; drop them before the points
                json = JSON.stringify({ ...s, forms: {} });
            }
            player.setDynamicProperty(KEY, json);
        }
        catch (e) { }
    }, 20);
}

world.afterEvents.playerLeave.subscribe(e => sessions.delete(e.playerId));

const fl = (p) => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });

export function setCorner(player, which, pos) {
    const s = session(player);
    s[which] = fl(pos);
    s.dim = player.dimension.id;
    save(player);
}

/** Cuboid region from pos1/pos2, or null. */
export function region(player) {
    const s = session(player);
    if (!s.pos1 || !s.pos2)
        return null;
    const a = s.pos1, b = s.pos2;
    return {
        min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
        max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
    };
}
export function volume(r) {
    return (r.max.x - r.min.x + 1) * (r.max.y - r.min.y + 1) * (r.max.z - r.min.z + 1);
}

/**
 * Mirror of 8Crafter's selection tool. Called from beforeEvents.itemUse
 * (read-only context: only reads the world).
 */
export function mirrorSelectionTool(player) {
    let hit;
    try {
        hit = player.getBlockFromViewDirection({ includeLiquidBlocks: true, includePassableBlocks: true });
    }
    catch (e) { }
    if (!hit?.block)
        return;
    const s = session(player);
    const which = s.posM ? 'pos2' : 'pos1';
    s[which] = fl(hit.block.location);
    s.dim = player.dimension.id;
    s.posM = !s.posM;
    save(player);
}

// --------------------------------------------------------------------------
// wand points
// --------------------------------------------------------------------------
export function addPoint(player, pos) {
    const s = session(player);
    s.points.push(fl(pos));
    save(player);
    return s.points.length;
}
export function clearPoints(player) {
    const s = session(player);
    s.points = [];
    save(player);
}
export function removePoint(player, closest = false) {
    const s = session(player);
    if (!s.points.length)
        return false;
    if (!closest)
        s.points.pop();
    else {
        const l = player.location;
        let bi = 0, bd = Infinity;
        s.points.forEach((p, i) => {
            const d = (p.x + 0.5 - l.x) ** 2 + (p.y + 0.5 - l.y) ** 2 + (p.z + 0.5 - l.z) ** 2;
            if (d < bd) {
                bd = d;
                bi = i;
            }
        });
        s.points.splice(bi, 1);
    }
    save(player);
    return true;
}

// loft frames: a list of point lists
export function newFrame(player, pos) {
    const s = session(player);
    s.frames.push([fl(pos)]);
    save(player);
    return s.frames.length;
}
export function addFramePoint(player, pos) {
    const s = session(player);
    if (!s.frames.length)
        s.frames.push([]);
    s.frames[s.frames.length - 1].push(fl(pos));
    save(player);
    return s.frames[s.frames.length - 1].length;
}
/**
 * Frame picker: close the frame being drawn, so the next point starts a
 * new one. Returns the number of finished frames.
 */
export function saveFrame(player) {
    const s = session(player);
    const last = s.frames[s.frames.length - 1];
    if (last && last.length)
        s.frames.push([]);
    save(player);
    return s.frames.filter(f => f.length).length;
}
/** Frame picker: take back the last point (reopening a just-saved frame). */
export function undoFramePoint(player) {
    const s = session(player);
    while (s.frames.length && !s.frames[s.frames.length - 1].length)
        s.frames.pop();
    const last = s.frames[s.frames.length - 1];
    if (!last)
        return false;
    last.pop();
    if (!last.length)
        s.frames.pop();
    save(player);
    return true;
}
export const frameCount = (player) => session(player).frames.filter(f => f.length).length;
export function clearFrames(player) {
    session(player).frames = [];
    save(player);
}
/** Remove the last point of the last frame (or the closest point anywhere). */
export function removeFramePoint(player, closest = false) {
    const s = session(player);
    if (!s.frames.length)
        return false;
    if (!closest) {
        const f = s.frames[s.frames.length - 1];
        f.pop();
        if (!f.length)
            s.frames.pop();
    }
    else {
        const l = player.location;
        let best = null, bd = Infinity;
        s.frames.forEach((f, fi) => f.forEach((p, pi) => {
            const d = (p.x + 0.5 - l.x) ** 2 + (p.y + 0.5 - l.y) ** 2 + (p.z + 0.5 - l.z) ** 2;
            if (d < bd) {
                bd = d;
                best = [fi, pi];
            }
        }));
        if (best) {
            s.frames[best[0]].splice(best[1], 1);
            if (!s.frames[best[0]].length)
                s.frames.splice(best[0], 1);
        }
    }
    save(player);
    return true;
}

export function bindBrush(player, itemType, brushId, values) {
    const s = session(player);
    s.brushes[itemType] = { id: brushId, values };
    save(player);
}
export function unbindBrush(player, itemType) {
    const s = session(player);
    delete s.brushes[itemType];
    save(player);
}
