/*
 * River (Arceon //river <block> <start> <end> [decline] -s -n).
 *
 * Follows the curve through the wand points (20 samples per block), digs a
 * V/U shaped bed whose depth goes from `start` to `end` below the terrain
 * and whose banks widen with the decline rate, fills it with the block up
 * to where both banks hold it, and clears everything above the path.
 *
 * -s: on the top layer of a run of water/lava the liquid gets thinner
 * (liquid_depth 0..7) every 20 samples; snow (snow_layer / snow block)
 * gets thinner snow layers instead.
 */
import { TOO_CLOSE, curve, curvePoints, randomNoise } from '../lib/curve_common.js';
import { AIR, isAirId, liquid, perm, snowLayer, splitTop } from '../core/blocks.js';

export default {
    id: 'river',
    name: '강',
    desc: '찍은 점들을 따라 땅을 파서 강/용암 줄기/눈 계곡을 만듭니다. 점은 지면 위에 찍으세요.',
    icon: 'textures/blocks/water_still',
    needs: 'points',
    minPoints: 2,
    useMask: true,
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'water' },
        { key: 'start', type: 'number', label: '시작 깊이', default: 5, min: 0, max: 200, int: true },
        { key: 'end', type: 'number', label: '끝 깊이', default: 10, min: 0, max: 200, int: true },
        { key: 'decline', type: 'number', label: '기슭 경사 (클수록 가파름)', default: 1, min: 0, max: 100 },
        { key: 'smooth', type: 'toggle', label: '물/용암/눈 층 부드럽게 (-s)', default: false },
        { key: 'noise', type: 'toggle', label: '노이즈 추가 (-n)', default: false },
    ],
    *run(ctx, v) {
        const pattern = ctx.pattern('block');
        const edit = ctx.edit;
        const start = Math.floor(Number(v.start)), end = Math.floor(Number(v.end));
        let decline = Number(v.decline);
        if (!(decline > 0))
            decline = 0.05;
        // what kind of block (only a single plain block counts, like Arceon's BlockStateHolder)
        const single = splitTop(ctx.patternText('block'), ',').length === 1 && !pattern.source.startsWith('#');
        const id = single ? pattern.first?.type.id : null;
        const water = id === 'minecraft:water' || id === 'minecraft:flowing_water';
        const lava = id === 'minecraft:lava' || id === 'minecraft:flowing_lava';
        const snow = id === 'minecraft:snow_layer' || id === 'minecraft:snow';
        const liq = water ? 'water' : lava ? 'lava' : null;
        const snowBlock = snow ? perm('minecraft:snow') : null;
        const air = AIR();
        const pts = curvePoints(ctx, { yOff: 0.5 });
        const { path, length } = curve(pts);
        if (length <= 5)
            throw new Error(TOO_CLOSE);
        const n = length * 20;
        let bottomCap = edit.maxY;
        let waterTop = edit.maxY;
        let run = 0, thin = 0;
        const nx = randomNoise(), nz = randomNoise();
        const notAir = (x, y, z) => !isAirId(edit.get({ x, y, z })?.type.id ?? 'minecraft:air');
        const scanLo = Math.max(edit.minY, edit.minY + 1 + Math.max(start, end));
        // highest y anything was set at, so the surface scan can start low
        let setTop = -Infinity;
        const set = (p, b) => {
            if (edit.set(p, b) && p.y > setTop)
                setTop = Math.floor(p.y);
        };
        let ops = 0;
        for (let i = 0; i < n - 2; i++) {
            let p = path.frac(i / n);
            let q = path.frac((i + 0.001) / n);
            if (v.noise) {
                p = { x: p.x + nx.simplex(p.x / 20, p.z / 20) * 5, y: p.y, z: p.z + nz.simplex(p.x / 20, p.z / 20) * 5 };
                q = { x: q.x + nx.simplex(q.x / 20, q.z / 20) * 5, y: q.y, z: q.z + nz.simplex(q.x / 20, q.z / 20) * 5 };
            }
            let dx = p.x - q.x, dz = p.z - q.z;
            const inv = 1 / Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2);
            run++;
            dx *= inv;
            dz *= inv;
            // terrain surface: first non-air block from the top
            const bx = Math.floor(p.x), bz = Math.floor(p.z);
            let surface = scanLo;
            let from = edit.maxY;
            try {
                const t = ctx.dim.getTopmostBlock({ x: bx, z: bz });
                from = Math.max(t ? t.location.y : scanLo, setTop);
            }
            catch (e) { }
            for (let y = Math.min(edit.maxY, from); y >= scanLo; y--)
                if (notAir(bx, y, bz)) {
                    surface = y;
                    break;
                }
            let bottom = surface - Math.trunc(start + (end - start) * (i / n));
            if (bottom > bottomCap)
                bottom = bottomCap;
            bottomCap = bottom;
            for (let y = bottom; y < p.y + 1; y++) {
                const w = Math.ceil(Math.sqrt(5 / decline * (y - bottom)) + 0.25 * ((y - bottom) / decline));
                let fill = false, smooth = false;
                if (y <= waterTop) {
                    if (y <= bottom + 1) {
                        fill = true;
                    }
                    else {
                        const l = { x: p.x + dz * (w / 2 + 1), y: y + 1, z: p.z - dx * (w / 2 + 1) };
                        const r = { x: p.x + dz * (-w / 2 - 1), y: y + 1, z: p.z - dx * (-w / 2 - 1) };
                        if (notAir(Math.floor(l.x), y + 1, Math.floor(l.z)) && notAir(Math.floor(r.x), y + 1, Math.floor(r.z))) {
                            fill = true;
                            if (waterTop === y && v.smooth) {
                                smooth = true;
                                if (run === 20) {
                                    run = 0;
                                    thin++;
                                }
                            }
                        }
                        else {
                            waterTop = y - 1;
                            run = 0;
                            thin = 0;
                        }
                    }
                }
                for (let k = 0; k < w; k++) {
                    const c = { x: Math.floor(p.x + dz * (k - w / 2)), y, z: Math.floor(p.z - dx * (k - w / 2)) };
                    if (!fill)
                        set(c, air);
                    else if (smooth) {
                        if (liq)
                            set(c, liquid(liq, Math.min(thin, 7)));
                        else if (snow)
                            // Java layers 7 - thin (1..8 valid); Bedrock height = layers - 1
                            set(c, snowLayer(Math.max(1, 7 - thin)));
                        else
                            pattern.place(edit, c);
                    }
                    else if (liq)
                        set(c, liquid(liq, 0));
                    else if (snow)
                        set(c, snowBlock);
                    else
                        pattern.place(edit, c);
                    if (++ops % 3000 === 0)
                        yield;
                }
            }
            // clear everything above the path
            const w2 = Math.ceil(Math.sqrt(5 / decline * (p.y - bottom)) + 0.25 * ((p.y - bottom) / decline));
            for (let k = 0; k < w2; k++) {
                const cx = Math.floor(p.x + dz * (k - w2 / 2)), cz = Math.floor(p.z - dx * (k - w2 / 2));
                for (let y = Math.floor(p.y); y <= edit.maxY && notAir(cx, y, cz); y++) {
                    set({ x: cx, y, z: cz }, air);
                    if (++ops % 3000 === 0)
                        yield;
                }
            }
        }
    },
};
