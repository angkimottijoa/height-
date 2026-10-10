/*
 * Clipboard: blocks kept in memory per player. Filled by "copy" (the
 * clipboard tool) or by running rotate / resize with "클립보드에 저장".
 * The clipboard tool shows where it will land (outline box at the block
 * you look at) and pastes on tap. It can be turned in 90° steps and
 * mirrored before pasting.
 *
 *   clip = { cells: [[dx, dy, dz, perm]], min, max, label, turns, flipX, flipZ, skipAir }
 *   offsets are relative to the anchor: the bottom-centre cell.
 */
import { EditSession } from './edit.js';
import { isAirId } from './blocks.js';
import { apply, matrix, mirrorMatrix, mul, turnStates } from './turn.js';

const clips = new Map();
export const getClip = (player) => clips.get(player.id) ?? null;
export function setClip(player, clip) {
    clips.set(player.id, clip);
}
export function clearClip(player) {
    clips.delete(player.id);
}

/** Build a clip from a Map("x,y,z" -> perm) in world coordinates. */
export function clipFromMap(map, label, { keepAir = false } = {}) {
    const pts = [];
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [k, perm] of map) {
        if (!keepAir && isAirId(perm.type.id))
            continue;
        const c = k.split(',').map(Number);
        pts.push([c[0], c[1], c[2], perm]);
        for (let i = 0; i < 3; i++) {
            lo[i] = Math.min(lo[i], c[i]);
            hi[i] = Math.max(hi[i], c[i]);
        }
    }
    if (!pts.length)
        return null;
    const ax = Math.floor((lo[0] + hi[0]) / 2), ay = lo[1], az = Math.floor((lo[2] + hi[2]) / 2);
    return {
        cells: pts.map(([x, y, z, p]) => [x - ax, y - ay, z - az, p]),
        min: { x: lo[0] - ax, y: 0, z: lo[2] - az },
        max: { x: hi[0] - ax, y: hi[1] - ay, z: hi[2] - az },
        label, turns: 0, flipX: false, flipZ: false, skipAir: true,
    };
}

/** Copy a region (air included, so "공기도 붙여넣기" can clear). */
export function* copyRegion(edit, region, label = '복사') {
    const { min, max } = region;
    const map = new Map();
    let n = 0;
    for (let x = min.x; x <= max.x; x++)
        for (let y = min.y; y <= max.y; y++)
            for (let z = min.z; z <= max.z; z++) {
                const p = edit.world({ x, y, z });
                if (p)
                    map.set(x + ',' + y + ',' + z, p);
                if (++n % 4000 === 0)
                    yield;
            }
    return clipFromMap(map, label, { keepAir: true });
}

function transformOf(clip) {
    let m = matrix(clip.turns * 90, 0, 0);
    if (clip.flipX)
        m = mul(m, mirrorMatrix('x'));
    if (clip.flipZ)
        m = mul(m, mirrorMatrix('z'));
    return m;
}
const rnd = (v) => Math.round(v) + 0; // no -0

/** World bounds the clip covers when anchored at `at`. */
export function placedBounds(clip, at) {
    const m = transformOf(clip);
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const cx of [clip.min.x, clip.max.x])
        for (const cy of [clip.min.y, clip.max.y])
            for (const cz of [clip.min.z, clip.max.z]) {
                const q = apply(m, [cx, cy, cz]).map(rnd);
                for (let i = 0; i < 3; i++) {
                    lo[i] = Math.min(lo[i], q[i]);
                    hi[i] = Math.max(hi[i], q[i]);
                }
            }
    return {
        min: { x: at.x + lo[0], y: at.y + lo[1], z: at.z + lo[2] },
        max: { x: at.x + hi[0], y: at.y + hi[1], z: at.z + hi[2] },
    };
}

/** Write the clip into an edit session with its anchor at `at`. */
export function* pasteClip(edit, clip, at) {
    const m = transformOf(clip);
    const turned = new Map();
    const plain = !clip.turns && !clip.flipX && !clip.flipZ;
    let n = 0;
    for (const [dx, dy, dz, perm] of clip.cells) {
        if (clip.skipAir && isAirId(perm.type.id))
            continue;
        const q = apply(m, [dx, dy, dz]).map(rnd);
        let out = perm;
        if (!plain) {
            out = turned.get(perm);
            if (!out) {
                out = turnStates(perm, m);
                turned.set(perm, out);
            }
        }
        edit.set({ x: at.x + q[0], y: at.y + q[1], z: at.z + q[2] }, out);
        if (++n % 4000 === 0)
            yield;
    }
}

/**
 * An edit session that only records: tools run into it when their result
 * should go to the clipboard instead of the world. Air writes (clearing
 * the source) are ignored.
 */
export class CaptureEdit extends EditSession {
    set(p, perm) {
        if (!perm || isAirId(perm.type.id))
            return false;
        return super.set(p, perm);
    }
    commit() {
        return Promise.resolve(0);
    }
}

/** Where the clipboard tool would paste for a tapped block and face. */
export function anchorFor(block, face) {
    const d = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
    return { x: block.x + d[0], y: block.y + d[1], z: block.z + d[2] };
}
