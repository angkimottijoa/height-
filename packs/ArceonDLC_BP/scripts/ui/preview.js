/*
 * Particle preview while a tool item is held:
 *   선택 지팡이   selection box (end rod), curve points (green) and the curve (flame)
 *   프레임 피커   frames (blue flame); the frame being drawn in green
 *   클립보드 도구 the box the clipboard would fill at the block you look at
 *   지형·에셋 도구 the selection box
 */
import { BezierPath } from '../core/spline.js';
import { anchorFor, getClip, placedBounds } from '../core/clipboard.js';
import { region, session } from '../core/session.js';
import { CLIPBOARD, FRAME_PICKER, WAND } from '../core/access.js';

const MAX = 240;

function spawn(player, id, p) {
    try {
        player.spawnParticle(id, p);
    }
    catch (e) { }
}
const c = (p) => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });

function curve(player, pts, id) {
    if (pts.length < 2)
        return;
    let path;
    try {
        path = new BezierPath(pts.map(c));
    }
    catch (e) {
        return;
    }
    const n = Math.min(MAX / 2, Math.max(8, Math.floor(path.length)));
    for (let i = 0; i <= n; i++)
        spawn(player, id, path.frac(i / n));
}

/** Edges of a block box (min..max inclusive). */
function box(player, r, id) {
    const lo = [r.min.x, r.min.y, r.min.z], hi = [r.max.x + 1, r.max.y + 1, r.max.z + 1];
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const step = Math.max(1, Math.ceil(span / 16));
    let n = 0;
    for (let axis = 0; axis < 3; axis++) {
        const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
        for (const a of [lo[o1], hi[o1]])
            for (const b of [lo[o2], hi[o2]])
                for (let t = lo[axis]; t <= hi[axis]; t += step) {
                    const p = [0, 0, 0];
                    p[axis] = t;
                    p[o1] = a;
                    p[o2] = b;
                    if (n++ > MAX)
                        return;
                    spawn(player, id, { x: p[0], y: p[1], z: p[2] });
                }
    }
}

export function preview(player, item) {
    const s = session(player);
    if (s.dim && s.dim !== player.dimension.id)
        return;
    if (item === FRAME_PICKER) {
        const frames = s.frames.filter(f => f.length);
        frames.forEach((f, i) => {
            const open = i === frames.length - 1 && s.frames[s.frames.length - 1].length;
            const id = open ? 'minecraft:villager_happy' : 'minecraft:blue_flame_particle';
            for (const p of f)
                spawn(player, id, c(p));
            curve(player, f, 'minecraft:blue_flame_particle');
        });
        return;
    }
    if (item === CLIPBOARD) {
        const clip = getClip(player);
        if (!clip)
            return;
        let hit;
        try {
            hit = player.getBlockFromViewDirection({ maxDistance: 300, includeLiquidBlocks: false, includePassableBlocks: true });
        }
        catch (e) { }
        if (!hit?.block)
            return;
        const at = anchorFor(hit.block.location, hit.face);
        box(player, placedBounds(clip, at), 'minecraft:basic_flame_particle');
        spawn(player, 'minecraft:villager_happy', c(at));
        return;
    }
    if (item === WAND) {
        for (const p of s.points.slice(0, 64))
            spawn(player, 'minecraft:villager_happy', c(p));
        curve(player, s.points, 'minecraft:basic_flame_particle');
    }
    const r = region(player);
    if (r)
        box(player, r, 'minecraft:endrod');
}
