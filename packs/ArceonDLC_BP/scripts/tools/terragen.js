/*
 * Terragen (Arceon //terragen): fills each column of the selection up to a
 * FastNoise height map. Slab patterns get half-block tops, snow gets snow
 * layers and water gets thinner water on top, like Arceon.
 * Arceon also takes cylinder/sphere selections; here the cuboid can be
 * used as is or as the cylinder inscribed in it (round -v vignette).
 */
import { AIR, liquid, perm, snowLayer } from '../core/blocks.js';
import { save } from '../core/session.js';
import { FastNoise, terragenNoise } from '../lib/terrain_noise.js';

const TYPES = [
    { value: 'simplex', label: '심플렉스 (Simplex)' },
    { value: 'fractal', label: '프랙탈 (Fractal)' },
    { value: 'billowy', label: '뭉게 (Billowy)' },
    { value: 'ridged', label: '능선 (Ridged)' },
    { value: 'turbulence', label: '난류 (Turbulence)' },
    { value: 'electric', label: '전기 (Electric)' },
    { value: 'euclidean', label: '셀 - 유클리드 (Euclidean)' },
    { value: 'manhattan', label: '셀 - 맨해튼 (Manhattan)' },
    { value: 'natural', label: '셀 - 자연 (Natural)' },
    { value: 'poly', label: '다각형 (Poly)' },
];

export default {
    id: 'terragen',
    name: '지형 생성',
    desc: '노이즈로 선택 영역에 지형을 만듭니다. 반블록은 반블록으로, 눈은 눈 층으로 다듬습니다.',
    icon: 'textures/blocks/grass_side_carried',
    needs: 'cuboid',
    useMask: true,
    fields: [
        { key: 'type', type: 'dropdown', label: '노이즈 종류', default: 'simplex', options: TYPES },
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'height', type: 'number', label: '높이', default: 20, min: 1, max: 384 },
        { key: 'zoom', type: 'number', label: '확대 (클수록 완만하고 넓게)', default: 1, min: 0.01, max: 100 },
        { key: 'wave', type: 'number', label: '비틀림', default: 0, min: -1000, max: 1000, tooltip: '지형을 구불구불 비트는 정도 (0 = 없음)' },
        {
            key: 'shape', type: 'dropdown', label: '모양', default: 'cuboid', options: [
                { value: 'cuboid', label: '사각형 (선택 영역 그대로)' },
                { value: 'cylinder', label: '원형 (영역에 내접하는 원기둥, 중심 높이부터)' },
            ],
        },
        { key: 'seed', type: 'text', label: '시드 지정 (비우면 무작위)', default: '', placeholder: '예: 12345', tooltip: '입력하면 저장되어 -s로 다시 쓸 수 있습니다 (//tgseed)' },
        { key: 's', type: 'toggle', label: '이전 시드 유지 (-s)', default: false },
        { key: 'v', type: 'toggle', label: '가장자리 부드럽게 (-v)', default: false },
        { key: 'e', type: 'toggle', label: '기존 지형 위에 쌓기/깎기 (-e)', default: false },
        { key: 'r', type: 'toggle', label: '셀마다 높이 무작위 (-r, 셀 종류만)', default: false },
        { key: 'n', type: 'toggle', label: '잔무늬 더하기 (-n, 프랙탈 계열만)', default: false },
    ],
    *run(ctx, v) {
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const pat = ctx.pattern('block');
        const height = Number(v.height) || 20;
        const zoom = Number(v.zoom) > 0 ? Number(v.zoom) : 1;
        const wave = Number(v.wave) || 0;
        const type = v.type ?? 'simplex';
        // seed: //tgseed (field) / -s keeps the last one / otherwise a new one is remembered
        const st = ctx.session.settings;
        let seed;
        const typed = String(v.seed ?? '').trim();
        if (typed) {
            seed = parseInt(typed, 10);
            if (!Number.isFinite(seed))
                throw new Error('시드는 정수여야 합니다');
            st.tgSeed = seed;
        }
        else if (v.s && Number.isFinite(st.tgSeed))
            seed = st.tgSeed;
        else {
            seed = Math.floor(Math.random() * 1000000000);
            st.tgSeed = seed;
        }
        save(ctx.player);
        const noise = terragenNoise(type, seed, zoom, { more: !!v.n, randomCells: !!v.r });
        if (!noise)
            throw new Error('알 수 없는 노이즈 종류');
        let warpX = null, warpZ = null;
        if (wave !== 0) {
            warpX = new FastNoise(seed + 1);
            warpZ = new FastNoise(seed + 2);
            warpX.frequency = warpZ.frequency = 0.1 / zoom;
        }
        // block kinds Arceon special-cases (single block patterns only)
        const single = /^[\w:]+(\[.*\])?$/.test(String(pat.source ?? '').trim());
        const id = single ? pat.first?.type.id : undefined;
        const slabs = pat.slabs;
        const snow = !slabs && (id === 'minecraft:snow_layer' || id === 'minecraft:snow');
        const water = !slabs && !snow && pat.liquid === 'water';
        const snowBlock = snow ? perm('minecraft:snow') : null;
        // shape + vignette
        const cyl = v.shape === 'cylinder';
        const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
        const rx = (max.x - min.x) / 2 + 0.5, rz = (max.z - min.z) / 2 + 0.5;
        const inEllipse = (x, z, ax, az) => ax > 0 && az > 0 && ((x - cx) / ax) ** 2 + ((z - cz) / az) ** 2 <= 1;
        const vig = Math.floor(Math.min(max.x - min.x + 1, max.z - min.z + 1) / 5);
        const vignette = (x, z) => {
            if (!v.v)
                return 1;
            for (let d = vig; d > 0; d--) {
                const inside = cyl
                    ? inEllipse(x, z, rx - d, rz - d)
                    : x >= min.x + d && x <= max.x - d && z >= min.z + d && z <= max.z - d;
                if (inside)
                    return 1 - ((vig - d) / vig) ** 2;
            }
            return 0;
        };
        const base = cyl ? Math.floor((min.y + max.y + 1) / 2) : min.y;
        const air = AIR();
        let ops = 0;
        for (let x = min.x; x <= max.x; x++) {
            for (let z = min.z; z <= max.z; z++) {
                if (cyl && !inEllipse(x, z, rx, rz))
                    continue;
                const fade = vignette(x, z);
                let n;
                if (!warpX)
                    n = noise.get(x, z);
                else {
                    n = noise.get(x + wave * warpX.get(x, z), z + wave * warpZ.get(x, z));
                    if (type === 'electric')
                        n = 1 - n; // Arceon flips electric only when waved
                }
                if (v.e) {
                    const h = edit.highest(x, z, edit.minY, edit.maxY);
                    if (n > 0) {
                        for (let y = h; y <= n * height * fade + h; y++, ops++)
                            edit.set({ x, y, z }, pat.at({ x, y, z }, edit));
                    }
                    else {
                        for (let y = h; y >= n * height * fade + h; y--, ops++)
                            edit.set({ x, y, z }, air);
                    }
                }
                else {
                    const top = (n + 1) * (height / 2) * fade + base;
                    for (let y = base; y <= top; y++, ops++) {
                        const pos = { x, y, z };
                        const frac = top - y;
                        if (slabs)
                            edit.set(pos, frac >= 1 || frac > 0.5 ? slabs.double : slabs.bottom);
                        else if (snow) {
                            if (frac >= 1)
                                edit.set(pos, snowBlock);
                            else if (Math.floor(frac * 8) > 0)
                                edit.set(pos, snowLayer(Math.floor(frac * 8)));
                        }
                        else if (water)
                            edit.set(pos, liquid('water', frac >= 1 ? 0 : Math.trunc(8 - frac * 8)));
                        else
                            edit.set(pos, pat.at(pos, edit));
                    }
                }
                if (++ops > 3000) {
                    ops = 0;
                    yield;
                }
            }
        }
        return `시드 ${seed}`;
    },
};
