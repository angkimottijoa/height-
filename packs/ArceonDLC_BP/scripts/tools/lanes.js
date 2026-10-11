/*
 * Lane road (차선 도로): a finished road with painted markings along the
 * curve through the curve-wand points.
 *
 *   edge | left lanes (dashed between) | centre / median | right lanes | edge
 *
 * The road surface is filled by area: every cell remembers its sideways
 * offset from the centre line (measured from the most perpendicular
 * sample), so the outside edge is exactly the edge line and the median can
 * be filled or hatched. Every painted line is then traced on its own and
 * thinned to an 8-connected chain, so lines stay one block wide on
 * diagonals and curves. Dashes count blocks along that chain, so a dash is
 * `dash` blocks long at any angle.
 */
import { AIR } from '../core/blocks.js';
import { curve, curvePoints, TOO_CLOSE } from '../lib/curve_common.js';

const SUB = 3; // samples per block, across the road and along it

/** Drop L-corners so a traced chain of cells is one block thick. */
export function thin(cells) {
    const out = [];
    for (const c of cells) {
        const last = out[out.length - 1];
        if (last && last.x === c.x && last.z === c.z)
            continue;
        while (out.length >= 2) {
            const a = out[out.length - 2];
            if (Math.abs(a.x - c.x) <= 1 && Math.abs(a.z - c.z) <= 1)
                out.pop();
            else
                break;
        }
        out.push(c);
    }
    return out;
}

const side = (label, def) => ({ key: label, type: 'slider', label: label === 'left' ? '왼쪽 차로 수 (진행 방향 기준)' : '오른쪽 차로 수', default: def, min: 0, max: 8 });

export default {
    id: 'lanes',
    name: '차선 도로',
    desc: '곡선 점을 따라 차선이 그려진 도로를 깝니다. 좌우는 첫 점 → 마지막 점으로 갈 때 기준. 점이 없으면 1번 → 2번 지점 직선.',
    icon: 'textures/blocks/concrete_yellow',
    needs: 'points',
    useMask: true,
    fields: [
        { key: 'asphalt', type: 'block', label: '도로 바닥', default: 'gray_concrete', palette: false },
        { key: 'center', type: 'block', label: '중앙선·중앙분리대', default: 'yellow_concrete', palette: false },
        { key: 'lane', type: 'block', label: '차선·유턴선 (흰색)', default: 'white_concrete', palette: false },
        { key: 'edge', type: 'block', label: '가장자리선', default: 'yellow_concrete', palette: false },
        side('left', 3),
        side('right', 3),
        { key: 'laneWidth', type: 'slider', label: '차로 폭 (칸)', default: 3, min: 1, max: 10 },
        {
            key: 'centerType', type: 'dropdown', label: '중앙 (분리대 폭이 0일 때)', default: 'single', options: [
                { value: 'single', label: '노란 실선 1줄' },
                { value: 'double', label: '노란 실선 2줄 (사이 1칸)' },
                { value: 'dashed', label: '노란 점선 (추월 가능)' },
                { value: 'oneway', label: '없음 - 일방통행 (흰 점선)' },
            ],
        },
        { key: 'median', type: 'slider', label: '중앙분리대 폭 (칸, 0 = 없음)', default: 0, min: 0, max: 12 },
        {
            key: 'medianStyle', type: 'dropdown', label: '중앙분리대 모양', default: 'fill', options: [
                { value: 'fill', label: '노란색으로 꽉 채우기' },
                { value: 'hatch', label: '노란 테두리 + 빗금 (안전지대)' },
                { value: 'lines', label: '노란 테두리 선만' },
            ],
        },
        { key: 'uturn', type: 'slider', label: '유턴 구간 길이 (칸, 0 = 없음)', default: 0, min: 0, max: 100, tooltip: '이 구간에서는 중앙선·분리대 대신 흰 유턴선이 그려집니다' },
        {
            key: 'uturnAt', type: 'dropdown', label: '유턴 구간 위치', default: 'end', options: [
                { value: 'end', label: '도로 끝 쪽 (마지막 점)' },
                { value: 'start', label: '도로 시작 쪽 (첫 점)' },
                { value: 'both', label: '양쪽 끝' },
            ],
        },
        {
            key: 'uturnStyle', type: 'dropdown', label: '유턴선 모양', default: 'dotted', options: [
                { value: 'dotted', label: '짧은 점선 (1칸 칠하고 1칸 띄움)' },
                { value: 'solid', label: '흰 실선' },
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
        const pats = { asphalt: ctx.pattern('asphalt'), center: ctx.pattern('center'), lane: ctx.pattern('lane'), edge: ctx.pattern('edge') };
        const L = Math.floor(v.left ?? 3), R = Math.floor(v.right ?? 3), w = Math.max(1, Math.floor(v.laneWidth));
        if (L + R < 1)
            throw new Error('차로가 하나도 없습니다');
        const M = Math.max(0, Math.floor(v.median || 0));
        // ---------------------------------------------------- cross section
        // columns left to right; lines = painted lines by column index
        const cols = [];
        const lines = []; // {col, kind, dash: bool, phase, center: bool}
        let dashLine = 0;
        const lanesOf = (n) => {
            for (let i = 0; i < n; i++) {
                if (i > 0)
                    lines.push({ col: cols.length, kind: 'lane', dash: true, line: dashLine++ }), cols.push('line');
                for (let k = 0; k < w; k++)
                    cols.push('road');
            }
        };
        if (v.edgeOn)
            lines.push({ col: cols.length, kind: 'edge' }), cols.push('line');
        lanesOf(L);
        let mid; // column of the centre (U-turn line goes here)
        let medianFrom = -1, medianTo = -1;
        if (L > 0 && R > 0) {
            if (M > 0) {
                medianFrom = cols.length;
                for (let k = 0; k < M; k++)
                    cols.push('median');
                medianTo = cols.length - 1;
                if (v.medianStyle !== 'fill' && M >= 2) {
                    lines.push({ col: medianFrom, kind: 'center', center: true });
                    lines.push({ col: medianTo, kind: 'center', center: true });
                }
                mid = medianFrom + Math.floor((M - 1) / 2);
            }
            else if (v.centerType === 'double') {
                lines.push({ col: cols.length, kind: 'center', center: true }), cols.push('line');
                mid = cols.length;
                cols.push('road');
                lines.push({ col: cols.length, kind: 'center', center: true }), cols.push('line');
            }
            else if (v.centerType === 'oneway') {
                mid = cols.length;
                lines.push({ col: cols.length, kind: 'lane', dash: true, line: dashLine++, center: true }), cols.push('line');
            }
            else {
                mid = cols.length;
                lines.push({ col: cols.length, kind: 'center', dash: v.centerType === 'dashed', line: 0, center: true }), cols.push('line');
            }
        }
        lanesOf(R);
        if (v.edgeOn)
            lines.push({ col: cols.length, kind: 'edge' }), cols.push('line');
        const W = cols.length;
        const off = W % 2 === 0 ? 0.5 : 0; // keep columns on whole blocks for straight roads
        const uOf = (col) => -W / 2 + col + 0.5 + off;
        const dash = Math.max(1, Math.floor(v.dash)), gap = Math.max(1, Math.floor(v.gap)), period = dash + gap;

        // ------------------------------------------------------- centre line
        const pts = curvePoints(ctx, { straight: !!v.straight });
        const { path, length } = curve(pts);
        if (length <= 1)
            throw new Error(TOO_CLOSE);
        const steps = Math.ceil(path.length * SUB);
        const S = [];
        let prev = null, s = 0;
        for (let i = 0; i <= steps; i++) {
            const p = path.frac(i / steps);
            const q = path.frac(i < steps ? (i + 1) / steps : (i - 1) / steps);
            let tx = q.x - p.x, tz = q.z - p.z;
            if (i === steps)
                tx = -tx, tz = -tz;
            const tl = Math.hypot(tx, tz) || 1;
            tx /= tl;
            tz /= tl;
            if (prev)
                s += Math.hypot(p.x - prev.x, p.z - prev.z);
            prev = p;
            // sideways = to the right of the travel direction
            S.push({ x: p.x, y: p.y, z: p.z, tx, tz, nx: -tz, nz: tx, s });
        }
        const total = s;
        const ut = Math.floor(v.uturn || 0);
        const inUturn = (d) => ut > 0 && ((v.uturnAt !== 'start' && d >= total - ut) || (v.uturnAt !== 'end' && d <= ut));
        if (ut > 0 && mid === undefined)
            ctx.say('§e유턴 구간은 양쪽에 차로가 있어야 그려집니다');
        yield;

        // ----------------------------------------------------------- surface
        const cells = new Map(); // "x,z" -> {y, uc, s, a}
        const lo = uOf(0) - 0.5, hi = uOf(W - 1) + 0.5;
        let n = 0;
        for (const p of S) {
            for (let u = lo; u < hi; u += 1 / SUB) {
                const x = Math.floor(p.x + p.nx * (u + 0.5 / SUB)), z = Math.floor(p.z + p.nz * (u + 0.5 / SUB));
                const dx = x + 0.5 - p.x, dz = z + 0.5 - p.z;
                const a = Math.abs(dx * p.tx + dz * p.tz);
                const key = x + ',' + z;
                const cur = cells.get(key);
                if (!cur || a < cur.a)
                    cells.set(key, { y: Math.floor(p.y), uc: dx * p.nx + dz * p.nz, s: p.s + (dx * p.tx + dz * p.tz), a });
            }
            if (++n % 100 === 0)
                yield;
        }
        // inside = strictly between the edge lines (they are drawn on top)
        const inLo = v.edgeOn ? uOf(0) : lo, inHi = v.edgeOn ? uOf(W - 1) : hi;
        const paint = new Map(); // "x,z" -> {y, kind}
        for (const [key, c] of cells) {
            if (c.uc <= inLo || c.uc >= inHi)
                continue;
            let kind = 'asphalt';
            if (medianFrom >= 0 && !inUturn(c.s) && c.uc > uOf(medianFrom) - 0.5 && c.uc < uOf(medianTo) + 0.5) {
                if (v.medianStyle === 'fill' || M < 2)
                    kind = 'center';
                else if (v.medianStyle === 'hatch') {
                    const lat = Math.round(c.uc - uOf(medianFrom));
                    if (((Math.floor(c.s) + lat) % 4 + 4) % 4 === 0)
                        kind = 'center';
                }
            }
            paint.set(key, { y: c.y, kind });
        }
        yield;

        // ------------------------------------------------------------- lines
        const trace = (u) => thin(S.map(p => ({ x: Math.floor(p.x + p.nx * u), z: Math.floor(p.z + p.nz * u), y: Math.floor(p.y), s: p.s })));
        const put = (c, kind) => paint.set(c.x + ',' + c.z, { y: c.y, kind });
        for (const ln of lines) {
            const chain = trace(uOf(ln.col));
            const phase = ln.dash && v.stagger && ln.line % 2 === 1 ? Math.floor(period / 2) : 0;
            chain.forEach((c, i) => {
                if (ln.center && inUturn(c.s))
                    return;
                if (ln.dash && (i + phase) % period >= dash)
                    return;
                put(c, ln.kind);
            });
            yield;
        }
        if (ut > 0 && mid !== undefined) {
            const chain = trace(uOf(mid)).filter(c => inUturn(c.s));
            chain.forEach((c, i) => {
                if (v.uturnStyle === 'solid' || i % 2 === 0)
                    put(c, 'lane');
            });
        }

        // ------------------------------------------------------------- place
        const edit = ctx.edit;
        const thick = Math.max(1, Math.floor(v.thick)), clear = Math.floor(v.clear) || 0;
        const air = AIR();
        n = 0;
        for (const [key, cell] of paint) {
            const [x, z] = key.split(',').map(Number);
            const y = cell.y;
            pats[cell.kind].place(edit, { x, y, z });
            let bottom = y - thick + 1;
            if (v.down)
                bottom = Math.min(bottom, edit.highest(x, z, edit.minY, y - 1) + 1);
            for (let yy = y - 1; yy >= bottom; yy--)
                pats.asphalt.place(edit, { x, y: yy, z });
            for (let yy = y + 1; yy <= y + clear; yy++)
                edit.set({ x, y: yy, z }, air);
            if (++n % 2000 === 0)
                yield;
        }
        return `폭 ${W}칸 (왼쪽 ${L} · 오른쪽 ${R}차로${M ? `, 분리대 ${M}칸` : ''}), 길이 약 ${Math.round(total)}칸`;
    },
};
