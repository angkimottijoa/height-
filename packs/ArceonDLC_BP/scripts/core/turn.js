/*
 * Rotation matrices and turning directional block states (stairs, logs,
 * torches, doors, signs...) to the nearest direction they can hold.
 * Shared by the free-angle rotate tool and anything else that turns blocks.
 *
 *   const m = matrix(yaw, pitch, roll);   // degrees; yaw clockwise from above
 *   turnStates(perm, m)                    // turned BlockPermutation
 *   turnStates(perm, mirrorMatrix('x'))    // mirrored (east <-> west)
 */
import { BlockPermutation } from '@minecraft/server';
/**
 * Rotation matrix for yaw (around Y, clockwise seen from above, so 90
 * turns north into east like WorldEdit), then pitch (X) and roll (Z).
 */
export function matrix(yaw, pitch, roll) {
    const r = (d) => d * Math.PI / 180;
    const cy = Math.cos(r(yaw)), sy = Math.sin(r(yaw));
    const cx = Math.cos(r(pitch)), sx = Math.sin(r(pitch));
    const cz = Math.cos(r(roll)), sz = Math.sin(r(roll));
    const Y = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]];
    const X = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
    const Z = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
    return mul(Z, mul(X, Y));
}
export function mul(a, b) {
    return a.map((row, i) => b[0].map((_, j) => row.reduce((acc, _, k) => acc + a[i][k] * b[k][j], 0)));
}
export const transpose = (m) => m[0].map((_, j) => m.map(row => row[j]));
export const apply = (m, v) => [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
export const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
/** Mirror matrix: 'x' flips east/west, 'z' flips north/south, 'y' up/down. */
export const mirrorMatrix = (axis) => [[axis === 'x' ? -1 : 1, 0, 0], [0, axis === 'y' ? -1 : 1, 0], [0, 0, axis === 'z' ? -1 : 1]];
export const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// --------------------------------------------------------------------------
// turning directional block states
// --------------------------------------------------------------------------
const VEC = {
    north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};
function nearest(v, allowed) {
    let best = allowed[0], bestDot = -Infinity;
    for (const d of allowed) {
        const w = VEC[d];
        const dot = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
        if (dot > bestDot) {
            bestDot = dot;
            best = d;
        }
    }
    return best;
}
const H = ['north', 'south', 'east', 'west'];
const ALL = ['down', 'up', 'north', 'south', 'west', 'east'];
function turnDir(m, d, allowed) {
    if (!VEC[d])
        return d;
    return nearest(apply(m, VEC[d]), allowed);
}
/** Encodings Bedrock uses for "a direction" in its block states. */
const ENCODINGS = {
    'minecraft:cardinal_direction': { values: H },
    'minecraft:facing_direction': { values: ALL },
    'minecraft:block_face': { values: ALL },
    'minecraft:vertical_half': null,
    'facing_direction': { list: ['down', 'up', 'north', 'south', 'west', 'east'] },
    'direction': { list: ['south', 'west', 'north', 'east'] },
    'weirdo_direction': { list: ['east', 'west', 'south', 'north'] },
    'coral_direction': { list: ['west', 'east', 'north', 'south'] },
    'torch_facing_direction': { strings: { west: 'west', east: 'east', north: 'north', south: 'south' } },
};
const AXIS_NAME = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const VINE_BITS = ['south', 'west', 'north', 'east'];
function turnLever(m, v) {
    if (H.includes(v))
        return turnDir(m, v, H);
    const ex = apply(m, [1, 0, 0]);
    if (Math.abs(ex[2]) > Math.abs(ex[0]))
        return v.endsWith('north_south') ? v.replace('north_south', 'east_west') : v.replace('east_west', 'north_south');
    return v;
}
export function turnStates(perm, m) {
    let states;
    try {
        states = perm.getAllStates();
    }
    catch (e) {
        return perm;
    }
    const typeId = perm.type.id;
    const out = {};
    for (const [k, v] of Object.entries(states)) {
        const enc = ENCODINGS[k];
        if (k === 'lever_direction' && typeof v === 'string') {
            out[k] = turnLever(m, v);
        }
        else if (enc?.values && typeof v === 'string') {
            out[k] = turnDir(m, v, enc.values);
        }
        else if (enc?.list && typeof v === 'number' && enc.list[v]) {
            const d = enc.list[v];
            out[k] = VEC[d] ? enc.list.indexOf(turnDir(m, d, enc.list.filter(x => VEC[x]))) : v;
        }
        else if (enc?.strings && typeof v === 'string' && enc.strings[v]) {
            out[k] = turnDir(m, v, H);
        }
        else if ((k === 'pillar_axis' || k === 'vyt:pillar_axis') && typeof v === 'string' && AXIS_NAME[v]) {
            const w = apply(m, AXIS_NAME[v]).map(Math.abs);
            out[k] = ['x', 'y', 'z'][w.indexOf(Math.max(...w))];
        }
        else if (k.endsWith('ground_sign_direction') && typeof v === 'number') {
            // 16 steps of 22.5 degrees clockwise from south
            const a = v * Math.PI / 8;
            const w = apply(m, [-Math.sin(a), 0, Math.cos(a)]);
            out[k] = ((Math.round(Math.atan2(-w[0], w[2]) * 8 / Math.PI)) % 16 + 16) % 16;
        }
        else if (k.endsWith('vine_direction_bits') && typeof v === 'number') {
            let bits = 0;
            VINE_BITS.forEach((d, i) => {
                if ((v >> i) & 1)
                    bits |= 1 << VINE_BITS.indexOf(turnDir(m, d, H));
            });
            out[k] = bits;
        }
    }
    if (det(m) < 0) {
        // a mirror image: left and right swap
        if (states['minecraft:corner'] !== undefined)
            out['minecraft:corner'] = String(states['minecraft:corner']).replace(/left|right/, x => x === 'left' ? 'right' : 'left');
        if (states.door_hinge_bit !== undefined)
            out.door_hinge_bit = !states.door_hinge_bit;
    }
    try {
        return BlockPermutation.resolve(typeId, { ...states, ...out });
    }
    catch (e) {
        return perm;
    }
}
