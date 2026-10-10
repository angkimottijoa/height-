/*
 * Revolve brush (Arceon /arcbrush revolve): revolves the cuboid selection
 * around the vertical axis through the block you look at.
 */
import { revolve } from '../lib/terrain_revolve.js';

export default {
    id: 'revolve',
    name: '회전체 브러시',
    desc: '선택 영역(pos1·pos2)을 바라보는 블록을 축으로 여러 번 돌려 복사합니다.',
    icon: 'textures/blocks/purpur_pillar',
    fields: [
        { key: 'amount', type: 'slider', label: '개수', default: 8, min: 1, max: 360 },
        { key: 'start', type: 'angle', label: '시작 각도', default: 0, min: -360, max: 360 },
        { key: 'end', type: 'angle', label: '끝 각도', default: 360, min: -360, max: 720 },
        { key: 'heightDiff', type: 'number', label: '높이 차 (시작~끝)', default: 0, min: -384, max: 384 },
        { key: 'p', type: 'toggle', label: '정다각형으로 잇기 (-p)', default: false },
        { key: 's', type: 'toggle', label: '모두 시작점에 잇기 (-s)', default: false },
        { key: 'r', type: 'toggle', label: '반대 방향 (-r)', default: false },
    ],
    *apply(ctx, v, hit) {
        const r = ctx.region;
        if (!r)
            throw new Error('회전체 브러시는 선택 영역(pos1, pos2)이 필요합니다');
        if (ctx.session.dim && ctx.session.dim !== ctx.player.dimension.id)
            throw new Error('선택 영역이 다른 차원에 있습니다');
        const vol = (r.max.x - r.min.x + 1) * (r.max.y - r.min.y + 1) * (r.max.z - r.min.z + 1);
        if (vol > 200000)
            throw new Error(`선택 영역이 너무 큽니다 (${vol}블록, 최대 200000)`);
        const amount = Math.max(1, Math.trunc(Number(v.amount) || 1));
        yield* revolve(ctx.edit, r.min, r.max, { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 }, {
            amount,
            start: Math.trunc(Number(v.start) || 0),
            end: Math.trunc(Number(v.end ?? 360)),
            heightDiff: Number(v.heightDiff) || 0,
            poly: !!v.p, toStart: !!v.s, reverse: !!v.r,
        });
    },
};
