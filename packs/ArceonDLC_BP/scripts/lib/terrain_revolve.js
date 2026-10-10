/*
 * Arceon RevolveHandler.revolve: copies every block of a cuboid `amount`
 * times around a vertical axis through `center` (float), from `start` to
 * `end` degrees, rising `heightDiff` over the turn.
 *   flags: poly (-p) joins each copy to the next with straight lines,
 *          toStart (-s) joins each copy back to the start, reverse (-r).
 * Each solid block also gets sub-samples towards same-type neighbours
 * (±0.15) so the revolved copies have no gaps.
 */
import { line } from '../core/vec.js';
import { matrix, turnStates } from '../core/turn.js';

export function* revolve(edit, min, max, center, { amount, start = 0, end = 360, heightDiff = 0, poly = false, toStart = false, reverse = false }) {
    const done = new Set();
    let step = (end - start) / amount;
    if (reverse)
        step = -step;
    const NB = [[-1, -1, 0.35, 0.35], [-1, 0, 0.35, 0.5], [-1, 1, 0.35, 0.65], [0, -1, 0.5, 0.35],
        [0, 1, 0.5, 0.65], [1, -1, 0.65, 0.35], [1, 0, 0.65, 0.5], [1, 1, 0.65, 0.65]];
    const inBox = (x, y, z) => x >= min.x && x <= max.x && y >= min.y && y <= max.y && z >= min.z && z <= max.z;
    // a position after turning offset o (= center - sample) by angle a (degrees)
    const at = (o, a, i) => {
        const r = a * Math.PI / 180, s = Math.sin(r), c = Math.cos(r);
        return {
            x: center.x - c * o.x + s * o.z,
            y: center.y - o.y + heightDiff / amount * i,
            z: center.z - s * o.x - c * o.z,
        };
    };
    const once = (p, perm) => {
        const k = Math.floor(p.x) + ',' + Math.floor(p.y) + ',' + Math.floor(p.z);
        if (done.has(k))
            return;
        done.add(k);
        edit.set({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }, perm);
    };
    const turned = new Map(); // angle -> Map(perm -> turned perm)
    let ops = 0;
    for (let x = min.x; x <= max.x; x++)
        for (let y = min.y; y <= max.y; y++)
            for (let z = min.z; z <= max.z; z++) {
                if (++ops % 500 === 0)
                    yield;
                const perm = edit.world({ x, y, z });
                const samples = [];
                if (perm && perm.type.id !== 'minecraft:air') {
                    samples.push({ x: center.x - (x + 0.5), y: center.y - (y + 0.5), z: center.z - (z + 0.5) });
                    for (const [dx, dz, ox, oz] of NB)
                        if (inBox(x + dx, y, z + dz) && edit.world({ x: x + dx, y, z: z + dz })?.type.id === perm.type.id)
                            samples.push({ x: center.x - (x + ox), y: center.y - (y + 0.5), z: center.z - (z + oz) });
                }
                if (!samples.length)
                    continue;
                for (let i = 0; i < amount; i++) {
                    const ang = step * i + start;
                    if (!poly && !toStart) {
                        let m = turned.get(ang);
                        if (!m)
                            turned.set(ang, m = new Map());
                        let tp = m.get(perm);
                        if (!tp) {
                            tp = turnStates(perm, matrix(ang, 0, 0));
                            m.set(perm, tp);
                        }
                        for (const o of samples)
                            once(at(o, ang, i), tp);
                    }
                    else {
                        // -s joins to the start angle (Arceon uses it before -p)
                        const next = toStart ? start : step * (i + 1) + start;
                        for (const o of samples) {
                            const a = at(o, ang, i), b = at(o, next, i + 1);
                            for (const q of line(a, b))
                                once(q, perm);
                        }
                    }
                }
            }
}
