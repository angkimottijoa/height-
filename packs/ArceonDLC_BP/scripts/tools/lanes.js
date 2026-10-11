/*
 * Lane road (차선 도로): a finished road with painted markings along the
 * curve through the wand points, e.g.
 *
 *   edge | lane | dash | lane | dash | lane | centre | lane | dash | lane | dash | lane | edge
 *
 * Every cell is classified by its sideways column (which stripe it is in)
 * and its distance along the road (dash or gap), so straight roads come
 * out exact: dashes are `dash` blocks long with `gap` blocks between, and
 * neighbouring dash lines can be staggered by half a period.
 */
import { AIR } from '../core/blocks.js';
import { curve, curvePoints, TOO_CLOSE } from '../lib/curve_common.js';

const SUB = 3; // samples per block, along and across

export default {
    id: 'lanes',
    name: '차선 도로',
    desc: '곡선 점을 따라 차선이 그려진 도로를 깝니다 (중앙선·가장자리선·흰 점선). 점이 없으면 1번 → 2번 지점 직선.',
    icon: 'textures/blocks/concrete_yellow',
    needs: 'points',
    useMask: true,
    fields: [
        { key: 'asphalt', type: 'block', label: '도로 바닥', default: 'gray_concrete', palette: false },
        { key: 'center', type: 'block', label: '중앙선', default: 'yellow_concrete', palette: false },
        { key: 'lane', type: 'block', label: '차선 (흰 점선)', default: 'white_concrete', palette: false },
        { key: 'edge', type: 'block', label: '가장자리선', default: 'yellow_concrete', palette: false },
        { key: 'lanes', type: 'slider', label: '한쪽 방향 차로 수', default: 3, min: 1, max: 8 },
        { key: 'laneWidth', type: 'slider', label: '차로 폭 (칸)', default: 3, min: 1, max: 10 },
        {
            key: 'centerType', type: 'dropdown', label: '중앙선 모양', default: 'single', options: [
                { value: 'single', label: '실선 1줄' },
                { value: 'double', label: '실선 2줄 (사이 1칸)' },
                { value: 'dashed', label: '점선 (추월 가능)' },
                { value: 'oneway', label: '없음 (일방통행, 차로 수 = 전체)' },
            ],
        },
        { key: 'edgeOn', type: 'toggle', label: '양쪽 가장자리선 긋기', default: true },
        { key: 'dash', type: 'slider', label: '흰 점선 길이 (칸)', default: 4, min: 1, max: 20 },
        { key: 'gap', type: 'slider', label: '흰 점선 사이 간격 (칸)', default: 4, min: 1, max: 20 },
        { key: 'stagger', type: 'toggle', label: '옆 점선끼리 엇갈리게', default: true },
        { key: 'thick', type: 'slider', label: '도로 두께 (칸)', default: 1, min: 1, max: 10 },
        { key: 'down', type: 'toggle', label: '아래로 땅까지 채우기', default: false },
        { key: 'clear', type: 'slider', label: '도로 위 비우기 (칸)', default: 0, min: 0, max: 20 },
        { key: 'straight', type: 'toggle', label: '곡선을 덜 휘게 (-p)', default: false },
    ],
    *run(ctx, v) {
        const asphalt = ctx.pattern('asphalt');
        const pats = { asphalt, center: ctx.pattern('center'), lane: ctx.pattern('lane'), edge: ctx.pattern('edge') };
        // cross section, left to right: 'edge' | 'lane' | 'dash<i>' | 'center' | 'asphalt'
        const n = Math.max(1, Math.floor(v.lanes)), w = Math.max(1, Math.floor(v.laneWidth));
        const cols = [];
        let dashLine = 0;
        const side = (count) => {
            for (let i = 0; i < count; i++) {
                if (i > 0)
                    cols.push('dash' + dashLine++);
                for (let k = 0; k < w; k++)
                    cols.push('asphalt');
            }
        };
        if (v.edgeOn)
            cols.push('edge');
        if (v.centerType === 'oneway')
            side(n);
        else {
            side(n);
            if (v.centerType === 'double')
                cols.push('center', 'asphalt', 'center');
            else if (v.centerType === 'dashed')
                cols.push('cdash');
            else
                cols.push('center');
            side(n);
        }
        if (v.edgeOn)
            cols.push('edge');
        const W = cols.length;
        const dash = Math.max(1, Math.floor(v.dash)), gap = Math.max(1, Math.floor(v.gap)), period = dash + gap;
        const shift = (line) => (v.stagger && line % 2 === 1 ? Math.floor(period / 2) : 0);
        const kind = (col, s) => {
            const c = cols[col];
            if (c === 'edge' || c === 'center')
                return c;
            if (c === 'cdash')
                return ((Math.floor(s) % period) + period) % period < dash ? 'center' : 'asphalt';
            if (c.startsWith('dash')) {
                const line = Number(c.slice(4));
                return ((Math.floor(s) + shift(line)) % period + period) % period < dash ? 'lane' : 'asphalt';
            }
            return 'asphalt';
        };
        const rank = { asphalt: 0, lane: 1, edge: 2, center: 3 };

        const pts = curvePoints(ctx, { straight: !!v.straight });
        const { path, length } = curve(pts);
        if (length <= 1)
            throw new Error(TOO_CLOSE);
        // even widths: put the centre on a block edge so the stripes stay whole blocks
        const off = W % 2 === 0 ? 0.5 : 0;
        const top = new Map(); // "x,z" -> {y, kind}
        const steps = Math.ceil(path.length * SUB * 2);
        let prev = path.frac(0), s = 0, done = 0;
        for (let i = 0; i <= steps; i++) {
            const p = path.frac(i / steps);
            const q = path.frac(Math.min(1, (i + 1) / steps));
            const r = i === steps ? path.frac((i - 1) / steps) : null;
            let tx = r ? p.x - r.x : q.x - p.x, tz = r ? p.z - r.z : q.z - p.z;
            const tl = Math.hypot(tx, tz) || 1;
            tx /= tl;
            tz /= tl;
            s += Math.hypot(p.x - prev.x, p.z - prev.z);
            prev = p;
            // sideways = 90° to the right of the travel direction
            const nx = -tz, nz = tx;
            for (let k = 0; k < W; k++)
                for (let j = 0; j < SUB; j++) {
                    const u = -W / 2 + k + (j + 0.5) / SUB + off;
                    const x = Math.floor(p.x + nx * u), z = Math.floor(p.z + nz * u);
                    const key = x + ',' + z;
                    // distance from the start block's edge, so block k holds [k, k+1)
                    const kd = kind(k, s + 0.5);
                    const cur = top.get(key);
                    if (!cur || rank[kd] > rank[cur.kind])
                        top.set(key, { y: Math.floor(p.y), kind: kd });
                }
            if (++done % 200 === 0)
                yield;
        }
        const edit = ctx.edit;
        const thick = Math.max(1, Math.floor(v.thick)), clear = Math.floor(v.clear) || 0;
        const air = AIR();
        let m = 0;
        for (const [key, cell] of top) {
            const [x, z] = key.split(',').map(Number);
            const y = cell.y;
            pats[cell.kind].place(edit, { x, y, z });
            let bottom = y - thick + 1;
            if (v.down)
                bottom = Math.min(bottom, edit.highest(x, z, edit.minY, y - 1) + 1);
            for (let yy = y - 1; yy >= bottom; yy--)
                asphalt.place(edit, { x, y: yy, z });
            for (let yy = y + 1; yy <= y + clear; yy++)
                edit.set({ x, y: yy, z }, air);
            if (++m % 2000 === 0)
                yield;
        }
        return `폭 ${W}칸, 길이 약 ${length}칸`;
    },
};
