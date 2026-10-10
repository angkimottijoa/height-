/*
 * Vine brush (Arceon /arcbrush vine): air blocks in a ball that touch a
 * solid block sideways get, by `chance` %, a hanging strand of min..max
 * blocks going down. Vines / glow lichen face the walls they touch
 * (vine_direction_bits south 1, west 2, north 4, east 8; lichen
 * multi_face_direction_bits south 4, west 8, north 16, east 32).
 */
import { isAirId, isSolidId, perm } from '../core/blocks.js';
import { ball } from '../core/vec.js';
import { pickInt } from '../lib/terrain_util.js';

// east, south, west, north (Arceon's neighbour order)
const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const VINE_BITS = [8, 1, 2, 4];
const LICHEN_BITS = [32, 4, 8, 16];

export default {
    id: 'vine',
    name: '덩굴 브러시',
    desc: '벽에 붙은 공기 칸에서 덩굴(또는 다른 블록)을 아래로 늘어뜨립니다.',
    icon: 'textures/blocks/vine',
    fields: [
        { key: 'block', type: 'block', label: '블록 (한 종류)', default: 'vine' },
        { key: 'size', type: 'slider', label: '크기 (지름)', default: 8, min: 1, max: 40 },
        { key: 'chance', type: 'slider', label: '확률 (%)', default: 25, min: 0, max: 100 },
        { key: 'min', type: 'slider', label: '길이 최소', default: 5, min: 1, max: 64 },
        { key: 'max', type: 'slider', label: '길이 최대', default: 5, min: 1, max: 64 },
    ],
    *apply(ctx, v, hit) {
        const edit = ctx.edit;
        const pat = ctx.pattern('block');
        let block = pat.first;
        let note;
        if (!block || !/^[\w:]+(\[.*\])?$/.test(pat.source.trim())) {
            block = perm('minecraft:vine');
            note = '덩굴 브러시는 블록 한 종류만 됩니다 - 덩굴로 했습니다';
        }
        const bid = block.type.id;
        const isVine = bid === 'minecraft:vine', isLichen = bid === 'minecraft:glow_lichen';
        const chance = Number(v.chance ?? 25);
        const done = new Set();
        let ops = 0;
        for (const q of ball(hit, Number(v.size) || 8)) {
            if (++ops % 2000 === 0)
                yield;
            const p = { x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) };
            if (!isAirId(edit.id(p)))
                continue;
            let touches = false;
            for (const [dx, dz] of SIDES) {
                const id = edit.id({ x: p.x + dx, y: p.y, z: p.z + dz });
                if (!isAirId(id) && id !== bid && isSolidId(id))
                    touches = true;
            }
            const col = p.x + ',' + p.z;
            if (!touches || done.has(col))
                continue;
            const length = pickInt(v.min, v.max ?? v.min);
            if (Math.floor(Math.random() * 100) >= chance)
                continue;
            done.add(col);
            const ground = edit.highest(p.x, p.z, edit.minY, p.y);
            if (!isVine && !isLichen) {
                for (let y = p.y, n = 0; y > ground && n < length; y--, n++)
                    edit.set({ x: p.x, y, z: p.z }, block);
                continue;
            }
            let bits = 0;
            SIDES.forEach(([dx, dz], i) => {
                const id = edit.id({ x: p.x + dx, y: p.y, z: p.z + dz });
                if (!isAirId(id) && id !== 'minecraft:vine' && isSolidId(id))
                    bits |= (isVine ? VINE_BITS : LICHEN_BITS)[i];
            });
            const state = isVine ? perm(bid, { vine_direction_bits: bits }) : perm(bid, { multi_face_direction_bits: bits });
            for (let y = p.y, n = 0; y > ground && n < length; y--) {
                const id = edit.id({ x: p.x, y, z: p.z });
                if (id === 'minecraft:vine' || id === 'minecraft:glow_lichen')
                    break;
                edit.set({ x: p.x, y, z: p.z }, state);
                n++;
            }
        }
        return note;
    },
};
