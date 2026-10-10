/*
 * Crop brush (Arceon /arcbrush crop): sets the growth of every crop in a
 * ball to a random stage between min and max. Bedrock crops (wheat,
 * carrots, potatoes, beetroot, melon/pumpkin stems) all use 'growth' 0..7,
 * so beetroot takes the same stages (Java beetroot only had age 0..3).
 * Torchflowers: 0 seed, 1 sprout, 2 grown flower, like Arceon.
 */
import { perm } from '../core/blocks.js';
import { ball } from '../core/vec.js';
import { pickInt } from '../lib/terrain_util.js';

const CROPS = new Set(['minecraft:wheat', 'minecraft:carrots', 'minecraft:potatoes', 'minecraft:beetroot',
    'minecraft:melon_stem', 'minecraft:pumpkin_stem']);

export default {
    id: 'crop',
    name: '작물 브러시',
    desc: '범위 안 작물의 성장 단계를 최소~최대 사이에서 무작위로 바꿉니다.',
    icon: 'textures/blocks/wheat_stage_7',
    fields: [
        { key: 'size', type: 'slider', label: '크기 (지름)', default: 8, min: 1, max: 40 },
        { key: 'min', type: 'slider', label: '성장 최소', default: 0, min: 0, max: 7 },
        { key: 'max', type: 'slider', label: '성장 최대', default: 7, min: 0, max: 7 },
    ],
    *apply(ctx, v, hit) {
        const edit = ctx.edit;
        const lo = Math.max(0, Math.min(7, Math.trunc(Number(v.min) || 0)));
        const hi = Math.max(0, Math.min(7, Math.trunc(Number(v.max ?? 7))));
        // torchflower stages from min/max (Arceon's mapping)
        const tLo = lo > 0 && lo < 7 ? 1 : lo === 7 ? 2 : 0;
        const tHi = hi === 0 ? 0 : hi > 0 && hi < 7 ? 1 : 2;
        let ops = 0;
        for (const q of ball(hit, Number(v.size) || 8)) {
            const p = { x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) };
            const cur = edit.get(p);
            const id = cur?.type.id;
            if (CROPS.has(id)) {
                edit.set(p, cur.withState('growth', pickInt(lo, hi)));
            }
            else if (id === 'minecraft:torchflower_crop' || id === 'minecraft:torchflower') {
                const s = pickInt(tLo, tHi);
                edit.set(p, s === 2 ? perm('minecraft:torchflower') : perm('minecraft:torchflower_crop', { growth: s }));
            }
            if (++ops % 4000 === 0)
                yield;
        }
    },
};
