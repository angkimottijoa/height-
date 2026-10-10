/*
 * Shared by revolve / axisrevolve: the sample offsets Arceon takes from one
 * selection block. Besides the block centre it adds a point 0.15 towards
 * each neighbour of the same block type, so diagonal runs stay connected
 * once rotated. Reads the world as it was before the edit.
 */
import { isAirId } from '../core/blocks.js';

const FLAT = [];
const FULL = [];
for (const dx of [-1, 0, 1])
    for (const dy of [-1, 0, 1])
        for (const dz of [-1, 0, 1]) {
            if ((dx || dz) && !dy)
                FLAT.push([dx, dy, dz]);
            // Arceon skips straight up / down in the 3D version
            if (dx || dz)
                FULL.push([dx, dy, dz]);
        }
const OFF = { '-1': 0.35, '0': 0.5, '1': 0.65 };

/**
 * Samples for block p: [{o, perm}] with o = centre - sample point, or null
 * for air. min/max: the selection; threeD adds the neighbours above/below.
 */
export function revolveSamples(edit, p, c, min, max, threeD) {
    const perm = edit.world(p);
    if (!perm || isAirId(perm.type.id))
        return null;
    const out = [{ o: { x: c.x - (p.x + 0.5), y: c.y - (p.y + 0.5), z: c.z - (p.z + 0.5) }, perm }];
    for (const [dx, dy, dz] of threeD ? FULL : FLAT) {
        const q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        if (q.x < min.x || q.x > max.x || q.y < min.y || q.y > max.y || q.z < min.z || q.z > max.z)
            continue;
        if (edit.world(q)?.type.id !== perm.type.id)
            continue;
        out.push({ o: { x: c.x - (p.x + OFF[dx]), y: c.y - (p.y + OFF[dy]), z: c.z - (p.z + OFF[dz]) }, perm });
    }
    return out;
}
