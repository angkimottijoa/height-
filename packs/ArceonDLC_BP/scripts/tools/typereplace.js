/*
 * Type Replace (Arceon //typereplace from to [-f] [-b] [-s]): turns every
 * block of one material family in the selection into the same shape of
 * another family (oak stairs -> cobblestone stairs ...), keeping the block
 * states (facing, half, waterlogged ...). Shapes the target family lacks
 * are left alone, like Arceon.
 */
import { carryStates } from '../core/blocks.js';
import { TYPES, findType, hasItems, typeOf } from '../lib/replace_families.js';

const FENCES = new Set(['fence', 'fence_gate', 'wall']);

export default {
    id: 'typereplace',
    name: '재질 바꾸기',
    desc: '선택 영역의 블록 재질을 통째로 바꿉니다 (참나무 → 조약돌: 판자·계단·반블록·울타리...). 방향 등 상태는 유지.',
    icon: 'textures/blocks/planks_oak',
    needs: 'cuboid',
    fields: [
        { key: 'from', type: 'text', label: '원래 재질 (예: oak, cobble, stone_bricks, 5:1)', placeholder: 'oak', default: 'oak' },
        { key: 'to', type: 'text', label: '새 재질', placeholder: 'cobblestone', default: 'cobblestone' },
        { key: 'f', type: 'toggle', label: '담장·울타리·울타리 문은 그대로 (-f)', default: false },
        { key: 'b', type: 'toggle', label: '일반(꽉 찬) 블록은 그대로 (-b)', default: false },
        { key: 's', type: 'toggle', label: '반블록은 그대로 (-s)', default: false },
        { key: 'd', type: 'toggle', label: '겹친 반블록만 그대로 (-d)', default: false },
    ],
    *run(ctx, v) {
        const from = findType(v.from);
        if (!from)
            throw new Error(`모르는 재질: ${v.from || '(비어 있음)'}. 예: oak, spruce, cobble, stone_bricks, deepslate_tiles, iron`);
        const to = findType(v.to);
        if (!to)
            throw new Error(`모르는 재질: ${v.to || '(비어 있음)'}`);
        if (from === to)
            throw new Error('원래 재질과 새 재질이 같습니다');
        const src = TYPES[from], dst = TYPES[to];
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const cache = new Map(); // source permutation -> target or null
        let n = 0, kept = 0;
        for (let x = min.x; x <= max.x; x++)
            for (let y = min.y; y <= max.y; y++)
                for (let z = min.z; z <= max.z; z++) {
                    if (++n % 4000 === 0)
                        yield;
                    const p = { x, y, z };
                    const perm = edit.world(p);
                    if (!perm)
                        continue;
                    let out = cache.get(perm);
                    if (out === undefined) {
                        out = null;
                        const info = typeOf(perm.type.id);
                        if (info && (info.family === from || info.family === src.twin)) {
                            const f = info.form;
                            const skip = (v.f && FENCES.has(f)) || (v.b && f === 'block') || (v.s && (f === 'slab' || f === 'double_slab')) || (v.d && f === 'double_slab');
                            if (!skip) {
                                // waxed copper stays waxed (Arceon matches both, places waxed)
                                let fam = dst;
                                if (info.family === src.twin && dst.twin)
                                    fam = TYPES[dst.twin];
                                const id = fam.forms[f];
                                if (id)
                                    out = carryStates(perm, 'minecraft:' + id);
                            }
                        }
                        cache.set(perm, out);
                    }
                    if (!out)
                        continue;
                    if (/_shelf$/.test(perm.type.id) && hasItems(ctx.dim, p)) {
                        kept++;
                        continue;
                    }
                    edit.set(p, out);
                }
        return `${from} → ${to}` + (kept ? `, 물건이 든 선반 ${kept}개는 건너뜀` : '');
    },
};
