/*
 * Particle preview while the wand is held: the points (green), the curve
 * the curve tools will follow (flame), loft frames (blue) and the cuboid
 * selection edges (end rod).
 */
import { BezierPath } from '../core/spline.js';
import { region, session } from '../core/session.js';

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

export function preview(player) {
    const s = session(player);
    const here = player.dimension.id;
    if (s.dim && s.dim !== here)
        return;
    for (const p of s.points.slice(0, 64))
        spawn(player, 'minecraft:villager_happy', c(p));
    if (s.wandMode !== 'loft')
        curve(player, s.points, 'minecraft:basic_flame_particle');
    if (s.wandMode === 'loft' || s.frames.length) {
        for (const f of s.frames.slice(0, 16)) {
            for (const p of f)
                spawn(player, 'minecraft:blue_flame_particle', c(p));
            curve(player, f, 'minecraft:blue_flame_particle');
        }
    }
    const r = region(player);
    if (!r)
        return;
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
                    spawn(player, 'minecraft:endrod', { x: p[0], y: p[1], z: p[2] });
                }
    }
}
