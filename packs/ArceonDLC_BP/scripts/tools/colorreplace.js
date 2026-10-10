/*
 * Color Replace (Arceon //colorreplace from to [-b] [-g]): recolours wool,
 * carpet, concrete (powder), terracotta, glazed terracotta, stained glass
 * (panes), shulker boxes and candles of one colour in the selection,
 * keeping their block states.
 *
 * Bedrock keeps banner and bed colours in block-entity data that scripts
 * cannot change, so banners and beds are always left alone (-b is kept for
 * Arceon's sake). Shulker boxes with items in them are skipped too: swapping
 * the block type would destroy the contents.
 */
import { FAMILIES } from '../core/families.js';
import { carryStates, colorOf } from '../core/blocks.js';
import { COLORS_KO, hasItems } from '../lib/replace_families.js';

const COLOR_OPTIONS = Object.keys(FAMILIES.colors).map(c => ({ value: c, label: COLORS_KO[c] ?? c }));

export default {
    id: 'colorreplace',
    name: '색 바꾸기',
    desc: '선택 영역에서 한 색의 양털·카펫·콘크리트·테라코타·색유리·셜커 상자·양초를 다른 색으로 바꿉니다.',
    icon: 'textures/blocks/wool_colored_red',
    needs: 'cuboid',
    fields: [
        { key: 'from', type: 'dropdown', label: '바꿀 색', default: 'white', options: COLOR_OPTIONS },
        { key: 'to', type: 'dropdown', label: '새 색', default: 'red', options: COLOR_OPTIONS },
        { key: 'b', type: 'toggle', label: '현수막은 그대로 (-b, 베드락은 항상 그대로)', default: true },
        { key: 'g', type: 'toggle', label: '유광 테라코타는 그대로 (-g)', default: false },
    ],
    *run(ctx, v) {
        const from = v.from, to = v.to;
        if (!FAMILIES.colors[from] || !FAMILIES.colors[to])
            throw new Error('색을 고르세요');
        if (from === to)
            throw new Error('바꿀 색과 새 색이 같습니다');
        const target = FAMILIES.colors[to];
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const cache = new Map();
        let n = 0, banners = 0, full = 0;
        for (let x = min.x; x <= max.x; x++)
            for (let y = min.y; y <= max.y; y++)
                for (let z = min.z; z <= max.z; z++) {
                    if (++n % 4000 === 0)
                        yield;
                    const p = { x, y, z };
                    const perm = edit.world(p);
                    if (!perm)
                        continue;
                    const id = perm.type.id;
                    if (id === 'minecraft:standing_banner' || id === 'minecraft:wall_banner') {
                        banners++;
                        continue;
                    }
                    let out = cache.get(perm);
                    if (out === undefined) {
                        out = null;
                        const info = colorOf(id);
                        if (info && info.color === from && !(v.g && info.form === 'glazed_terracotta') && target[info.form])
                            out = carryStates(perm, 'minecraft:' + target[info.form]);
                        cache.set(perm, out);
                    }
                    if (!out)
                        continue;
                    if (/shulker_box$/.test(id) && hasItems(ctx.dim, p)) {
                        full++;
                        continue;
                    }
                    edit.set(p, out);
                }
        let msg = `${COLORS_KO[from]} → ${COLORS_KO[to]}`;
        if (banners && !v.b)
            msg += `, 현수막 ${banners}개는 베드락에서 색을 바꿀 수 없어 그대로 둠`;
        if (full)
            msg += `, 물건이 든 셜커 상자 ${full}개는 건너뜀`;
        return msg;
    },
};
