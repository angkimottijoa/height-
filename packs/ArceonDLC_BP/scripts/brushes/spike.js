/*
 * Spike brush (Arceon /arcbrush spike): a cone of balls from the block you
 * look at towards your head, `length` blocks long, shrinking (or growing)
 * from the start size to the end size. -n bends it with simplex noise.
 * (The wiki says "uses convex selection", but Arceon's brush code only
 * uses the hit block and the player's eye, so that is what this does.)
 */
import { ball, line } from '../core/vec.js';
import { Noise } from '../core/noise.js';

const between = (a, b) => (a === b ? a : Math.min(a, b) + Math.random() * Math.abs(b - a));

export default {
    id: 'spike',
    name: '가시 브러시',
    desc: '바라보는 블록에서 내 쪽으로 뻗는 가시(원뿔)를 만듭니다.',
    icon: 'textures/blocks/pointed_dripstone_down_tip',
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'length', type: 'number', label: '길이', default: 10, min: 1, max: 200 },
        { key: 'startMin', type: 'number', label: '시작 굵기 최소', default: 4, min: 0, max: 50 },
        { key: 'startMax', type: 'number', label: '시작 굵기 최대', default: 4, min: 0, max: 50 },
        { key: 'endMin', type: 'number', label: '끝 굵기 최소', default: 1, min: 0, max: 50 },
        { key: 'endMax', type: 'number', label: '끝 굵기 최대', default: 1, min: 0, max: 50 },
        { key: 'n', type: 'toggle', label: '모양을 울퉁불퉁하게 (-n)', default: false },
    ],
    *apply(ctx, v, hit) {
        const edit = ctx.edit;
        const pat = ctx.pattern('block');
        const length = Number(v.length) || 10;
        const a = { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 };
        const eye = { x: ctx.location.x, y: ctx.location.y + 1.8, z: ctx.location.z };
        const d = Math.hypot(eye.x - a.x, eye.y - a.y, eye.z - a.z) || 1;
        const b = {
            x: a.x + (eye.x - a.x) / d * length,
            y: a.y + (eye.y - a.y) / d * length,
            z: a.z + (eye.z - a.z) / d * length,
        };
        const nx = new Noise(Math.floor(Math.random() * 1000000));
        const nz = new Noise(Math.floor(Math.random() * 1000000));
        const ny = new Noise(Math.floor(Math.random() * 1000000));
        const pts = line(a, b);
        const s0 = between(Number(v.startMin), Number(v.startMax ?? v.startMin));
        const s1 = between(Number(v.endMin), Number(v.endMax ?? v.endMin));
        let ops = 0;
        for (let i = 0; i < pts.length; i++) {
            let p = pts[i];
            if (v.n) {
                const fx = p.x / 20, fz = p.z / 20;
                p = { x: p.x + nx.simplex(fx, fz) * 5, y: p.y + ny.simplex(fx, fz) * 5, z: p.z + nz.simplex(fx, fz) * 5 };
            }
            const size = s0 + (s1 - s0) * (i / pts.length);
            for (const q of ball(p, size)) {
                const r = { x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) };
                edit.set(r, pat.at(r, edit));
                ops++;
            }
            if (ops > 3000) {
                ops = 0;
                yield;
            }
        }
    },
};
