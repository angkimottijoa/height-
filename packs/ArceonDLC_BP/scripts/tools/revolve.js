/*
 * Revolve (Arceon //revolve): copies the selection around the player's
 * block, `amount` times from the start to the end angle, rising by
 * heightDiff in total. -p joins each copy to the next with lines (regular
 * polygon), -s joins every copy back to the start. Blocks keep their
 * states; in the plain mode directional states turn with the copy.
 */
import { line } from '../core/vec.js';
import { matrix, turnStates } from '../core/turn.js';
import { revolveSamples } from '../lib/shape_revolve.js';

export default {
    id: 'revolve',
    name: '회전 복제',
    desc: '선택 영역을 내가 선 곳을 중심으로 빙 돌려 가며 여러 번 복사합니다 (원형 탑, 기둥 둘레 장식 등).',
    icon: 'textures/blocks/target_top',
    needs: 'cuboid',
    maxVolume: 200000,
    fields: [
        { key: 'amount', type: 'number', label: '복사 개수', default: 8, min: 1, max: 3600 },
        { key: 'start', type: 'angle', label: '시작 각도', default: 0, min: -360, max: 360 },
        { key: 'end', type: 'angle', label: '끝 각도', default: 360, min: -360, max: 720 },
        { key: 'height', type: 'number', label: '처음~끝 높이 차이', default: 0, tooltip: '시작에서 끝까지 올라가는 높이 (음수면 내려감)' },
        { key: 'polygon', type: 'toggle', label: '정다각형으로 잇기 (-p)', default: false },
        { key: 'reverse', type: 'toggle', label: '반대 방향으로 회전 (-r)', default: false },
        { key: 'toStart', type: 'toggle', label: '모두 시작점으로 잇기 (-s)', default: false },
    ],
    *run(ctx, v) {
        const amount = Math.max(1, Math.floor(Number(v.amount) || 1));
        const start = Math.trunc(Number(v.start) || 0);
        const end = Math.trunc(Number(v.end ?? 360));
        const hd = Number(v.height) || 0;
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const c = {
            x: Math.floor(ctx.location.x) + 0.5,
            y: Math.floor(ctx.location.y) + 0.5,
            z: Math.floor(ctx.location.z) + 0.5,
        };
        let step = (end - start) / amount;
        if (v.reverse)
            step = -step;
        const done = new Set();
        const turned = new Map();
        const place = (p, perm) => {
            const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
            const k = x + ',' + y + ',' + z;
            if (done.has(k))
                return;
            done.add(k);
            edit.set({ x, y, z }, perm);
        };
        // rotate offset o (centre minus point) by angle a around c
        const at = (o, a, i) => {
            const r = a / 360 * 2 * Math.PI;
            const s = Math.sin(r), co = Math.cos(r);
            return {
                x: c.x - co * o.x + s * o.z,
                y: c.y - o.y + hd / amount * i,
                z: c.z - s * o.x - co * o.z,
            };
        };
        let ops = 0;
        // Arceon walks x fastest, then y, then z
        for (let z = min.z; z <= max.z; z++)
            for (let y = min.y; y <= max.y; y++)
                for (let x = min.x; x <= max.x; x++) {
                    const samples = revolveSamples(edit, { x, y, z }, c, min, max, false);
                    if (!samples)
                        continue;
                    for (let i = 0; i < amount; i++) {
                        const ang = step * i + start;
                        if (!v.polygon && !v.toStart) {
                            for (const { o, perm } of samples) {
                                let out = ang % 360 ? turned.get(perm)?.get(ang) : perm;
                                if (!out) {
                                    out = turnStates(perm, matrix(ang, 0, 0));
                                    if (!turned.has(perm))
                                        turned.set(perm, new Map());
                                    turned.get(perm).set(ang, out);
                                }
                                place(at(o, ang, i), out);
                            }
                        }
                        else {
                            const ang2 = v.toStart ? start : step * (i + 1) + start;
                            for (const { o, perm } of samples)
                                for (const p of line(at(o, ang, i), at(o, ang2, i + 1)))
                                    place(p, perm);
                        }
                        if (++ops % 50 === 0)
                            yield;
                    }
                }
        return `${amount}개, ${start}°~${end}°`;
    },
};
