/*
 * Smooth snow (Arceon //smoothsnow): averages the height map of the masked
 * surface over 20 samples `smoothness` blocks away and lays snow (layers +
 * snow blocks) or any pattern up to that smoothed height + addedHeight.
 */
import { perm, snowLayer } from '../core/blocks.js';

const SNOW_LAYER = 'minecraft:snow_layer';
const SNOW_BLOCK = 'minecraft:snow';

export default {
    id: 'smoothsnow',
    name: '부드러운 눈',
    desc: '마스크에 맞는 지형 위에 높이를 부드럽게 맞춘 눈(층)을 덮습니다.',
    icon: 'textures/blocks/snow',
    needs: 'cuboid',
    useMask: true,
    fields: [
        { key: 'smooth', type: 'slider', label: '부드러움 (높이 평균 거리)', default: 6, min: 1, max: 30 },
        { key: 'mask', type: 'mask', label: '덮을 블록 마스크', default: '!air', placeholder: '!air 또는 grass_block,stone' },
        { key: 'block', type: 'block', label: '블록 (눈이면 눈 층으로)', default: 'snow_layer' },
        { key: 'added', type: 'number', label: '추가 높이', default: 0.4, min: -10, max: 10 },
        { key: 'o', type: 'toggle', label: '블록 위에만 덮기 (-o)', default: false },
    ],
    *run(ctx, v) {
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const sm = Math.max(1, Math.floor(Number(v.smooth) || 6));
        const added = Number(v.added ?? 0.4);
        const overlay = !!v.o;
        const mask = ctx.mask(String(v.mask ?? '').trim() || '!air');
        const test = (x, y, z) => !mask || mask.test({ x, y, z }, edit);
        const pat = ctx.pattern('block');
        const single = /^[\w:]+(\[.*\])?$/.test(String(pat.source ?? '').trim());
        const pid = single ? pat.first?.type.id : undefined;
        const isSnow = pid === SNOW_LAYER || pid === SNOW_BLOCK;
        const snowBlock = perm(SNOW_BLOCK);
        const layer = (n) => (n >= 1 ? snowLayer(Math.min(8, n)) : null);
        // height map over the selection grown by 20 blocks sideways
        const heights = new Map();
        let ops = 0;
        for (let x = min.x - 20; x <= max.x + 20; x++) {
            for (let z = min.z - 20; z <= max.z + 20; z++) {
                heights.set(x + ',' + z, edit.highest(x, z, min.y, max.y));
                if (++ops % 2000 === 0)
                    yield;
            }
        }
        const H = (x, z) => heights.get(x + ',' + z) ?? min.y;
        const h2 = Math.trunc(sm / 2);
        const offs = [[h2, h2], [h2, -h2], [-h2, h2], [-h2, -h2], [sm, h2], [sm, -h2], [-sm, h2], [-sm, -h2],
            [h2, sm], [h2, -sm], [-h2, sm], [-h2, -sm], [sm, sm], [sm, -sm], [-sm, sm], [-sm, -sm],
            [0, sm], [0, -sm], [-sm, 0], [sm, 0]];
        const avg = new Map();
        for (let x = min.x; x <= max.x; x++)
            for (let z = min.z; z <= max.z; z++) {
                const own = H(x, z);
                let sum = 0;
                for (const [dx, dz] of offs) {
                    const h = H(x + dx, z + dz);
                    sum += test(x + dx, h, z + dz) ? h : own;
                }
                avg.set(x + ',' + z, sum / 20);
                if (++ops % 2000 === 0)
                    yield;
            }
        const out = new Map(); // later puts win, like Arceon's map
        const put = (x, y, z, p) => {
            if (p)
                out.set(x + ',' + y + ',' + z, p);
        };
        const typeAt = (x, y, z) => edit.id({ x, y, z });
        const airOrSnowBlock = (x, y, z) => edit.isAir({ x, y, z }) || typeAt(x, y, z) === SNOW_BLOCK;
        for (let x = min.x; x <= max.x; x++) {
            for (let z = min.z; z <= max.z; z++) {
                if (++ops % 1000 === 0)
                    yield;
                const h = H(x, z);
                let s = avg.get(x + ',' + z);
                if (!test(x, h, z))
                    continue;
                if (!isSnow) {
                    if (s + added > h) {
                        const yt = Math.floor(s + added + 1);
                        put(x, yt, z, pat.at({ x, y: yt, z }, edit));
                        for (let y = Math.trunc(s + added); overlay ? y > h : y >= h; y--)
                            put(x, y, z, pat.at({ x, y, z }, edit));
                    }
                    continue;
                }
                const diff = s - h;
                let open = 0;
                if (diff + added > 0.25) {
                    const yy = Math.floor(s + added);
                    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                        if (!test(x + dx, H(x + dx, z + dz), z + dz) && edit.isAir({ x: x + dx, y: yy, z: z + dz }))
                            open++;
                }
                if (open > 0)
                    s = h + diff / (open / 2 + 1);
                if (open === 4)
                    s = h;
                const t = s + added;
                if (t > h) {
                    let n = Math.trunc(Math.abs(t % 1) * 8);
                    if (t < 0)
                        n = 8 - n;
                    put(x, Math.ceil(t), z, layer(n));
                    for (let y = Math.trunc(t < 0 ? t - 1 : t); overlay ? y > h : y >= h; y--)
                        put(x, y, z, snowBlock);
                }
                else if (!overlay && s > h - 0.05) {
                    put(x, h, z, snowBlock);
                }
                else if (overlay || !(s > h - 1) || (typeAt(x, h, z) !== SNOW_LAYER && typeAt(x, h, z) !== SNOW_BLOCK)) {
                    if (!overlay) {
                        const edge = airOrSnowBlock(x + 1, h, z) || airOrSnowBlock(x - 1, h, z)
                            || airOrSnowBlock(x, h, z + 1) || airOrSnowBlock(x, h, z - 1);
                        const here = typeAt(x, h, z);
                        if (edge && (here === SNOW_LAYER || here === SNOW_BLOCK))
                            put(x, h, z, layer(1));
                    }
                }
                else {
                    const f = Math.abs(t % 1);
                    put(x, h, z, layer(t < 0 ? 8 - Math.trunc(f * 8) : Math.trunc(f * 8)));
                }
            }
        }
        for (const [k, p] of out) {
            const [x, y, z] = k.split(',').map(Number);
            edit.set({ x, y, z }, p);
            if (++ops % 4000 === 0)
                yield;
        }
    },
};
