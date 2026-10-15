/*
 * Particle preview while a tool item is held:
 *   선택 지팡이   area mode: the selection box (end rod)
 *                curve mode: only the curve points (green) and the curve (flame)
 *   프레임 피커   frames (blue flame, the one being drawn in green) and the
 *                rails joining them (flame), as the fill will connect them
 *   클립보드 도구 the box the clipboard would fill at the block you look at
 *   각도기       its lines, angle guides, the shape and the saved lines (own particles)
 *   지형·에셋 도구 the selection box
 */
import { BezierPath, LinePath, resample } from '../core/spline.js';
import { anchorFor, getClip, placedBounds } from '../core/clipboard.js';
import { region, session } from '../core/session.js';
import { CLIPBOARD, FRAME_PICKER, PROTRACTOR, WAND, YARD } from '../core/access.js';
import { protPreview } from './protractor.js';

const MAX = 240;

function spawn(player, id, p) {
    try {
        player.spawnParticle(id, p);
    }
    catch (e) { }
}
const c = (p) => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
/** The pack's own particles (arc:line ...), a vanilla stand-in when the resource pack is off. */
const VANILLA = { line: 'minecraft:endrod', point: 'minecraft:villager_happy', guide: 'minecraft:basic_flame_particle', shape: 'minecraft:villager_happy', saved: 'minecraft:blue_flame_particle', arc: 'minecraft:basic_flame_particle' };
let customOk = true;
function custom(player, kind, p) {
    if (customOk)
        try {
            player.spawnParticle('arc:' + kind, p);
            return;
        }
        catch (e) {
            customOk = false;
        }
    spawn(player, VANILLA[kind], p);
}

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

/**
 * Frames like Arceon's loft preview: the frame points, each frame's curve
 * and the rails that join the n-th point of every frame (the same
 * resampling the fill uses), so you see how the frames will connect.
 */
function frames(player, s) {
    const list = s.frames.filter(f => f.length);
    const flat = s.settings.frameFill === 'flat';
    const drawing = s.frames[s.frames.length - 1]?.length > 0;
    list.forEach((f, i) => {
        const id = drawing && i === list.length - 1 ? 'minecraft:villager_happy' : 'minecraft:blue_flame_particle';
        for (const p of f)
            spawn(player, id, c(p));
    });
    const pts = list.map(f => f.map(c));
    // each frame's own outline
    let budget = MAX;
    const draw = (path, id, share) => {
        const n = Math.max(4, Math.min(share, Math.floor(path.length * 1.5)));
        for (let i = 0; i <= n && budget-- > 0; i++)
            spawn(player, id, path.frac(i / n));
    };
    for (const f of pts)
        if (f.length >= 2)
            draw(flat ? new LinePath(f) : new BezierPath(f), 'minecraft:blue_flame_particle', 30);
    if (pts.length < 2)
        return;
    // rails between frames
    const width = Math.max(2, ...pts.map(f => f.length));
    const rs = pts.map(f => resample(f, width, !flat));
    const share = Math.max(6, Math.floor(budget / width));
    for (let j = 0; j < width; j++) {
        const rail = rs.map(f => f[j]);
        draw(flat ? new LinePath(rail) : new BezierPath(rail), 'minecraft:basic_flame_particle', share);
    }
}

export function preview(player, item) {
    const s = session(player);
    if (s.dim && s.dim !== player.dimension.id)
        return;
    if (item === FRAME_PICKER) {
        frames(player, s);
        return;
    }
    if (item === PROTRACTOR) {
        protPreview(s, (kind, p) => custom(player, kind, p));
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
    if (item === YARD) {
        // the layout tool: the line being drawn, and the saved lines (ends are real blocks)
        const pts = s.yard?.cur?.pts ?? [];
        for (const p of pts.slice(0, 64))
            spawn(player, 'minecraft:villager_happy', c(p));
        if (pts.length >= 2)
            curve(player, pts, 'minecraft:basic_flame_particle');
        let n = 0;
        for (const l of s.yard?.lines ?? [])
            for (const [x, y, z] of l.shape?.pts ?? [])
                if (n++ % 2 === 0 && n < 600)
                    spawn(player, 'minecraft:endrod', { x, y: y + 1.2, z });
        return;
    }
    if (item === WAND && s.wandMode === 'points') {
        // curve point mode shows only the curve, not the area
        for (const p of s.points.slice(0, 64))
            spawn(player, 'minecraft:villager_happy', c(p));
        curve(player, s.points, 'minecraft:basic_flame_particle');
        return;
    }
    const r = region(player);
    if (r)
        box(player, r, 'minecraft:endrod');
}
