/*
 * Axis revolve (Arceon //axisrevolve): like revolve, but around the axis
 * from the player's block to the block they look at. The selection is put
 * on a circle of `radius` around that axis `amount` times, turning with
 * the circle and moving heightDiff along the axis in total.
 * -p joins each copy to the next with lines, -r reverses, -s snaps the
 * axis to multiples of angleSnap degrees.
 */
import { line } from '../core/vec.js';
import { turnStates } from '../core/turn.js';
import { revolveSamples } from '../lib/shape_revolve.js';

const D = Math.PI / 180;

/** Rodrigues rotation matrix around unit axis n by deg degrees. */
function axisMatrix(n, deg) {
    const c = Math.cos(deg * D), s = Math.sin(deg * D), t = 1 - c;
    return [
        [c + t * n.x * n.x, t * n.x * n.y - s * n.z, t * n.x * n.z + s * n.y],
        [t * n.x * n.y + s * n.z, c + t * n.y * n.y, t * n.y * n.z - s * n.x],
        [t * n.x * n.z - s * n.y, t * n.y * n.z + s * n.x, c + t * n.z * n.z],
    ];
}
const mv = (m, p) => ({
    x: m[0][0] * p.x + m[0][1] * p.y + m[0][2] * p.z,
    y: m[1][0] * p.x + m[1][1] * p.y + m[1][2] * p.z,
    z: m[2][0] * p.x + m[2][1] * p.y + m[2][2] * p.z,
});
const unit = (p) => {
    const l = Math.hypot(p.x, p.y, p.z);
    return l > 1e-9 ? { x: p.x / l, y: p.y / l, z: p.z / l } : null;
};

/** Snap a direction's yaw and pitch to multiples of `snap` degrees. */
export function snapDirection(d, snap) {
    const u = unit(d);
    if (!u || !(snap > 0))
        return u;
    let yaw = Math.atan2(u.z, u.x) / D;
    let pitch = Math.asin(Math.max(-1, Math.min(1, u.y))) / D;
    yaw = Math.round(yaw / snap) * snap;
    pitch = Math.round(pitch / snap) * snap;
    const cp = Math.cos(pitch * D);
    return unit({ x: Math.cos(yaw * D) * cp, y: Math.sin(pitch * D), z: Math.sin(yaw * D) * cp });
}

export default {
    id: 'axisrevolve',
    name: '축 회전체',
    desc: '바라보는 방향을 축으로, 선택 영역을 내 주위 원을 따라 돌려 복사합니다.',
    icon: 'textures/blocks/lodestone_top',
    needs: 'cuboid',
    maxVolume: 200000,
    fields: [
        { key: 'amount', type: 'number', label: '복사 개수', default: 8, min: 1, max: 3600 },
        { key: 'radius', type: 'number', label: '반지름', default: 10, min: 0, max: 1000 },
        { key: 'start', type: 'angle', label: '시작 각도', default: 0, min: -360, max: 360 },
        { key: 'end', type: 'angle', label: '끝 각도', default: 360, min: -360, max: 720 },
        { key: 'height', type: 'number', label: '축 방향 전체 높이 차이', default: 0 },
        { key: 'snap', type: 'angle', label: '축 스냅 각도', default: 45, min: 1, max: 90, tooltip: '-s 를 켰을 때 축 방향을 이 각도 단위로 맞춤' },
        { key: 'polygon', type: 'toggle', label: '정다각형으로 잇기 (-p)', default: false },
        { key: 'reverse', type: 'toggle', label: '반대 방향으로 회전 (-r)', default: false },
        { key: 'snapOn', type: 'toggle', label: '축 방향 스냅 (-s)', default: false },
    ],
    *run(ctx, v) {
        const amount = Math.max(1, Math.floor(Number(v.amount) || 1));
        const radius = Math.max(0, Number(v.radius) || 0);
        const start = Math.trunc(Number(v.start) || 0);
        const end = Math.trunc(Number(v.end ?? 360));
        const hd = Number(v.height) || 0;
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const P = {
            x: Math.floor(ctx.location.x) + 0.5,
            y: Math.floor(ctx.location.y) + 0.5,
            z: Math.floor(ctx.location.z) + 0.5,
        };
        // axis: player block -> looked-at block (64 blocks, else the end of the ray)
        let target = null;
        try {
            const hit = ctx.player.getBlockFromViewDirection({ maxDistance: 64 });
            if (hit?.block)
                target = { x: hit.block.location.x + 0.5, y: hit.block.location.y + 0.5, z: hit.block.location.z + 0.5 };
        }
        catch (e) { }
        if (!target) {
            const head = ctx.player.getHeadLocation?.() ?? { x: ctx.location.x, y: ctx.location.y + 1.62, z: ctx.location.z };
            target = {
                x: Math.floor(head.x + ctx.view.x * 64) + 0.5,
                y: Math.floor(head.y + ctx.view.y * 64) + 0.5,
                z: Math.floor(head.z + ctx.view.z * 64) + 0.5,
            };
        }
        const dir = { x: target.x - P.x, y: target.y - P.y, z: target.z - P.z };
        const n = v.snapOn ? snapDirection(dir, Number(v.snap) || 45) : unit(dir);
        if (!n)
            throw new Error('축 방향을 정할 수 없습니다 (바라보는 블록이 내 위치와 같습니다)');
        // a direction perpendicular to the axis, as Arceon picks it
        const perp = unit({ x: n.z, y: n.z, z: -n.x - n.y }) ?? unit({ x: -n.y - n.z, y: n.x, z: n.x });
        let step = (end - start) / amount;
        if (v.reverse)
            step = -step;
        const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
        const mats = [];
        const turned = [];
        for (let i = 0; i <= amount; i++) {
            mats.push(axisMatrix(n, start + step * i));
            turned.push(new Map());
        }
        const pos = (o, i) => {
            const m = mats[i];
            const ring = mv(m, perp);
            const r = mv(m, { x: -o.x, y: -o.y, z: -o.z });
            const h = hd / amount * i;
            return {
                x: P.x + n.x * h + ring.x * radius + r.x,
                y: P.y + n.y * h + ring.y * radius + r.y,
                z: P.z + n.z * h + ring.z * radius + r.z,
            };
        };
        let ops = 0;
        for (let z = min.z; z <= max.z; z++)
            for (let y = min.y; y <= max.y; y++)
                for (let x = min.x; x <= max.x; x++) {
                    const samples = revolveSamples(edit, { x, y, z }, center, min, max, true);
                    if (!samples)
                        continue;
                    for (let i = 0; i < amount; i++) {
                        for (const { o, perm } of samples) {
                            if (!v.polygon) {
                                let out = turned[i].get(perm);
                                if (!out) {
                                    out = turnStates(perm, mats[i]);
                                    turned[i].set(perm, out);
                                }
                                edit.set(pos(o, i), out);
                            }
                            else {
                                for (const p of line(pos(o, i), pos(o, i + 1)))
                                    edit.set(p, perm);
                            }
                        }
                        if (++ops % 50 === 0)
                            yield;
                    }
                }
        return `${amount}개, 반지름 ${radius}`;
    },
};
