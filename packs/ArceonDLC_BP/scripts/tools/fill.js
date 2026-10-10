/*
 * Fill / replace the selection with a pattern, limited by a mask. This is
 * how Arceon's masks and patterns (#arcangle, #turb, #type ...) are used
 * here, since the host's own //set and //replace cannot read them.
 */
export default {
    id: 'fill',
    name: '채우기 · 바꾸기',
    desc: '선택 영역을 블록이나 패턴으로 채우거나, 마스크에 맞는 블록만 바꿉니다. 아르세온 마스크·패턴(#turb, #arcangle 등)도 됩니다.',
    icon: 'textures/items/bucket_empty',
    needs: 'cuboid',
    useMask: true,
    fields: [
        { key: 'block', type: 'block', label: '채울 블록', default: 'stone' },
        { key: 'mask', type: 'mask', label: '바꿀 대상 마스크 (비우면 전부)', placeholder: '예: grass_block  /  #arcangle[0][30][2]  /  !air', default: '' },
        {
            key: 'mode', type: 'dropdown', label: '방식', default: 'all', options: [
                { value: 'all', label: '영역 전체' },
                { value: 'air', label: '빈 곳(공기)만' },
                { value: 'existing', label: '블록이 있는 곳만' },
                { value: 'overlay', label: '지면 위에 한 겹 덮기' },
                { value: 'walls', label: '옆면 벽만' },
                { value: 'outline', label: '바깥 껍질만' },
            ],
        },
    ],
    *run(ctx, v) {
        const pattern = ctx.pattern('block');
        const mask = ctx.mask(v.mask);
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        let n = 0;
        const take = (p) => {
            if (mask && !mask.test(p, edit))
                return;
            pattern.place(edit, p);
        };
        if (v.mode === 'overlay') {
            for (let x = min.x; x <= max.x; x++)
                for (let z = min.z; z <= max.z; z++) {
                    for (let y = max.y; y >= min.y; y--) {
                        const p = { x, y, z };
                        if (!edit.isAir(p) && edit.get(p)) {
                            if (y + 1 <= max.y + 1)
                                take({ x, y: y + 1, z });
                            break;
                        }
                    }
                    if (++n % 500 === 0)
                        yield;
                }
            return;
        }
        for (let x = min.x; x <= max.x; x++)
            for (let y = min.y; y <= max.y; y++)
                for (let z = min.z; z <= max.z; z++) {
                    if (++n % 3000 === 0)
                        yield;
                    const side = x === min.x || x === max.x || z === min.z || z === max.z;
                    if (v.mode === 'walls' && !side)
                        continue;
                    if (v.mode === 'outline' && !side && y !== min.y && y !== max.y)
                        continue;
                    const p = { x, y, z };
                    if (v.mode === 'air' && !edit.isAir(p))
                        continue;
                    if (v.mode === 'existing' && edit.isAir(p))
                        continue;
                    take(p);
                }
    },
};
