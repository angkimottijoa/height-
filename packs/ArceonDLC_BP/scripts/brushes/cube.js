/*
 * Cube brush (Arceon /arcbrush cube): a box turned to your view yaw,
 * snapped to `snap` degree steps. Sizes are picked between min and max.
 * -h hollow (six faces), -c centred on the block instead of standing on
 * it, -a also tilts it by the view pitch.
 */
import { line, lineN } from '../core/vec.js';
import { pickFloat } from '../lib/terrain_util.js';

export default {
    id: 'cube',
    name: '큐브 브러시',
    desc: '시선 방향으로 돌아간 직육면체를 놓습니다. 크기·높이·너비는 최소~최대 사이에서 무작위.',
    icon: 'textures/blocks/quartz_block_side',
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'sizeMin', type: 'slider', label: '크기 최소', default: 8, min: 1, max: 40 },
        { key: 'sizeMax', type: 'slider', label: '크기 최대', default: 8, min: 1, max: 40 },
        { key: 'snap', type: 'slider', label: '회전 각도 단위 (360을 나누어떨어지게)', default: 45, min: 1, max: 120 },
        { key: 'heightMin', type: 'slider', label: '높이 최소 (0 = 크기와 같음)', default: 0, min: 0, max: 40 },
        { key: 'heightMax', type: 'slider', label: '높이 최대', default: 0, min: 0, max: 40 },
        { key: 'widthMin', type: 'slider', label: '너비 최소 (0 = 크기와 같음)', default: 0, min: 0, max: 40 },
        { key: 'widthMax', type: 'slider', label: '너비 최대', default: 0, min: 0, max: 40 },
        { key: 'h', type: 'toggle', label: '속 비우기 (-h)', default: false },
        { key: 'c', type: 'toggle', label: '바라보는 곳을 높이의 가운데로 (-c)', default: false },
        { key: 'a', type: 'toggle', label: '시선 각도로 기울이기 (-a)', default: false },
    ],
    *apply(ctx, v, hit) {
        const edit = ctx.edit;
        const pat = ctx.pattern('block');
        let snap = Math.trunc(Number(v.snap) || 45);
        let note;
        if (snap < 1 || 360 % snap !== 0) {
            note = '각도 단위는 360의 약수여야 해서 1°로 했습니다';
            snap = 1;
        }
        // Arceon subtracts 1 from every size range
        const sMin = Number(v.sizeMin) - 1, sMax = Number(v.sizeMax || v.sizeMin) - 1;
        const half = pickFloat(sMin, sMax) / 2;
        const hh = Number(v.heightMin) > 0 ? pickFloat(Number(v.heightMin) - 1, Number(v.heightMax || v.heightMin) - 1) / 2 : half;
        const hw = Number(v.widthMin) > 0 ? pickFloat(Number(v.widthMin) - 1, Number(v.widthMax || v.widthMin) - 1) / 2 : half;
        const base = { x: hit.x + 0.5, y: hit.y, z: hit.z + 0.5 };
        let yaw = Math.trunc((360 - ctx.rotation.y + 90) % 360);
        let pitch = 180 - ctx.rotation.x;
        yaw = Math.round(yaw / snap) * snap;
        pitch = Math.trunc(Math.round(pitch / snap) * snap);
        const lift = v.c ? 0 : hh + 1;
        const tilt = (p) => {
            const c = -Math.cos(pitch * Math.PI / 180), s = Math.sin(pitch * Math.PI / 180);
            return { x: p.x * c - p.y * s, y: p.y * c + p.x * s, z: p.z };
        };
        const turn = (p) => {
            const r = yaw * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
            return { x: p.x * c + p.z * s, y: p.y + lift, z: p.x * -s + p.z * c };
        };
        const corner = (sx, sy, sz) => {
            let p = { x: sx * half, y: sy * hh, z: sz * hw };
            if (v.a)
                p = tilt(p);
            return turn(p);
        };
        const t1 = corner(1, 1, 1), t2 = corner(1, 1, -1), t3 = corner(-1, 1, -1), t4 = corner(-1, 1, 1);
        const b1 = corner(1, -1, 1), b2 = corner(1, -1, -1), b3 = corner(-1, -1, -1), b4 = corner(-1, -1, 1);
        let ops = 0;
        // a quad a-b / c-d filled with lines, offset by the base
        const face = function* (a, b, c, d) {
            const n = Math.trunc(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)) * 5;
            const l1 = lineN(a, b, n), l2 = lineN(c, d, n);
            for (let i = 0; i < l1.length; i++) {
                for (const q of line(l1[i], l2[i])) {
                    const p = { x: Math.floor(q.x + base.x), y: Math.floor(q.y + base.y), z: Math.floor(q.z + base.z) };
                    edit.set(p, pat.at(p, edit));
                }
                if (++ops % 50 === 0)
                    yield;
            }
        };
        if (v.h) {
            yield* face(t1, t2, b1, b2);
            yield* face(t2, t3, b2, b3);
            yield* face(t3, t4, b3, b4);
            yield* face(t4, t1, b4, b1);
            yield* face(t1, t2, t4, t3);
            yield* face(b1, b2, b4, b3);
        }
        else {
            for (const q of line(b1, t1)) {
                const d = { x: q.x - b1.x, y: q.y - b1.y, z: q.z - b1.z };
                const sh = (p) => ({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z });
                yield* face(q, sh(b2), sh(b4), sh(b3));
            }
        }
        return note;
    },
};
