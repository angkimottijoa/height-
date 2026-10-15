/*
 * Lane road (차선 도로): a finished road with painted markings along the
 * curve through the wand's curve points.
 *
 *   shoulder | edge | left lanes | centre / median | right lanes | edge | shoulder
 *
 * The road surface is filled by area: every cell remembers its sideways
 * offset from the centre line (measured from the most perpendicular
 * sample), so the outside is exactly the outermost column and the median
 * can be filled or hatched. Every painted line is then traced on its own
 * and thinned to an 8-connected chain, so lines stay one block wide on
 * diagonals and curves. Dashes count blocks along that chain, so a dash is
 * `dash` blocks long at any angle.
 *
 * A custom preset (lib/lane_presets.js, saved from a hand-built piece of
 * road) is swept the same way: plain columns are filled by area with the
 * preset's surface block, columns holding paint are traced one block wide
 * and repeat the preset's pattern along the road.
 */
import { AIR } from '../core/blocks.js';
import { ask } from '../ui/form.js';
import { curve, curvePoints, TOO_CLOSE } from '../lib/curve_common.js';
import { openPreset, presetNames } from '../lib/lane_presets.js';
import { ROAD_BRIDGES, roadBridge } from '../lib/road_bridge.js';

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

const SEP = [
    { value: 'dash', label: '차선바꿈 (흰 점선)' },
    { value: 'solid', label: '유지 (흰 실선, 차선 변경 금지)' },
    { value: 'none', label: '선 없음' },
];

const FIELDS = [
    { key: 'asphalt', type: 'block', label: '도로 바닥', default: 'gray_concrete', palette: false },
    { key: 'center', type: 'block', label: '중앙선·중앙분리대', default: 'yellow_concrete', palette: false },
    { key: 'lane', type: 'block', label: '차선·유턴선 (흰색)', default: 'white_concrete', palette: false },
    { key: 'edge', type: 'block', label: '가장자리선', default: 'yellow_concrete', palette: false },
    { key: 'left', type: 'slider', label: '왼쪽 차로 수 (진행 방향 기준)', default: 3, min: 0, max: 8 },
    { key: 'right', type: 'slider', label: '오른쪽 차로 수', default: 3, min: 0, max: 8 },
    { key: 'laneWidth', type: 'slider', label: '차로 폭 = 흰 선 사이 칸 수', default: 3, min: 1, max: 10 },
    { key: 'shoulder', type: 'slider', label: '가장자리선 바깥 바닥 칸 수 (갓길)', default: 0, min: 0, max: 10 },
    {
        key: 'centerType', type: 'dropdown', label: '중앙 (분리대 폭이 0일 때)', default: 'single', options: [
            { value: 'single', label: '노란 실선 1줄' },
            { value: 'double', label: '노란 실선 2줄 (사이 1칸)' },
            { value: 'dashed', label: '노란 점선 (추월 가능)' },
            { value: 'oneway', label: '없음 - 일방통행 (흰 점선)' },
            { value: 'one', label: '1차선 도로 (차로 1개, 중앙선 없음)' },
        ],
    },
    { key: 'median', type: 'slider', label: '중앙분리대 폭 (칸, 0 = 없음, 체크무늬는 4 추천)', default: 0, min: 0, max: 12 },
    {
        key: 'medianStyle', type: 'dropdown', label: '중앙분리대 모양', default: 'checker', options: [
            { value: 'checker', label: '노란 테두리 + 체크무늬 (지그재그, 사진 모양)' },
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
    { key: 'advanced', type: 'toggle', label: '고급 옵션: 차로마다 폭·차선 종류 따로 정하기 (다음 화면)', default: false },
];
const COMMON = [
    {
        key: 'bridge', type: 'dropdown', label: '교량 (도로를 다리 위에)', default: '', options: [
            { value: '', label: '없음 (땅 위)' },
            ...ROAD_BRIDGES,
        ],
        tooltip: '곡선 점 높이가 도로 바닥 높이입니다. 교각은 경간마다 땅까지 내려갑니다.',
    },
    { key: 'span', type: 'slider', label: '교량 경간 (교각 사이 칸 수, 0 = 기본)', default: 0, min: 0, max: 60 },
    { key: 'thick', type: 'slider', label: '도로 두께 (칸)', default: 1, min: 1, max: 10 },
    { key: 'down', type: 'toggle', label: '아래로 땅까지 채우기', default: false },
    { key: 'clear', type: 'slider', label: '도로 위 비우기 (칸)', default: 0, min: 0, max: 20 },
    { key: 'straight', type: 'toggle', label: '곡선을 덜 휘게 (-p)', default: false },
];

export default {
    id: 'lanes',
    name: '차선 도로',
    desc: '곡선 점을 따라 차선이 그려진 도로를 깝니다. 좌우는 첫 점 → 마지막 점으로 갈 때 기준. 직선 도로는 곡선 점 2개만 찍으면 됩니다.',
    icon: 'textures/blocks/concrete_yellow',
    needs: 'points',
    useMask: true,
    get fields() {
        const names = presetNames();
        return [
            {
                key: 'preset', type: 'dropdown', label: '차선 모양', default: '', options: [
                    { value: '', label: '기본 (아래 설정대로)' },
                    ...names.map(n => ({ value: n, label: '커스텀: ' + n })),
                ],
                tooltip: '커스텀 차선은 "커스텀 차선 저장" 도구로 직접 만든 도로를 저장해 씁니다',
            },
            ...FIELDS,
            ...COMMON,
        ];
    },
    /** Advanced: a width and a line type for every lane, numbered from the centre. */
    async more(player, v) {
        if (!v.advanced || v.preset)
            return {};
        const L = Math.floor(v.left), R = Math.floor(v.right), w = Math.floor(v.laneWidth);
        const f = [{ type: 'label', label: '1차로 = 중앙선 쪽 차로. 차로 사이 선: 차선바꿈 = 흰 점선, 유지 = 흰 실선.' }];
        for (const [sideKey, n, name] of [['L', L, '왼쪽'], ['R', R, '오른쪽']]) {
            if (!n)
                continue;
            f.push({ type: 'header', label: `${name} ${n}차로` });
            for (let i = 0; i < n; i++)
                f.push({ key: `w${sideKey}${i}`, type: 'slider', label: `${name} ${i + 1}차로 폭`, default: w, min: 1, max: 10 });
            for (let i = 0; i < n - 1; i++)
                f.push({ key: `s${sideKey}${i}`, type: 'dropdown', label: `${name} ${i + 1}·${i + 2}차로 사이`, default: 'dash', options: SEP });
        }
        return ask(player, `tool:lanes:adv:${L}:${R}`, '차선 도로 - 고급 옵션', f, { submit: '깔기' });
    },
    *run(ctx, v) {
        if (v.preset)
            return yield* custom(ctx, v);
        const pats = { asphalt: ctx.pattern('asphalt'), center: ctx.pattern('center'), lane: ctx.pattern('lane'), edge: ctx.pattern('edge') };
        const one = v.centerType === 'one';
        const L = one ? 1 : Math.floor(v.left ?? 3), R = one ? 0 : Math.floor(v.right ?? 3), w = Math.max(1, Math.floor(v.laneWidth));
        if (L + R < 1)
            throw new Error('차로가 하나도 없습니다');
        const M = one ? 0 : Math.max(0, Math.floor(v.median || 0));
        const shoulder = Math.max(0, Math.floor(v.shoulder || 0));
        const adv = !!v.advanced;
        // ---------------------------------------------------- cross section
        const cols = [];
        const lines = []; // {col, kind, dash, line, center}
        let dashLine = 0;
        const addLine = (ln) => {
            lines.push({ ...ln, col: cols.length });
            cols.push('line');
        };
        // lanes of one side, 1차로 next to the centre; `outward` = columns run away from the centre
        const lanesOf = (side, n, outward) => {
            const order = [...Array(n).keys()];
            if (!outward)
                order.reverse();
            order.forEach((i, k) => {
                if (k > 0) {
                    // the line between lane i and its neighbour towards where we came from
                    const between = outward ? i - 1 : i;
                    const type = adv ? (v[`s${side}${between}`] ?? 'dash') : 'dash';
                    if (type === 'dash')
                        addLine({ kind: 'lane', dash: true, line: dashLine++ });
                    else if (type === 'solid')
                        addLine({ kind: 'lane' });
                }
                const lw = adv ? Math.max(1, Math.floor(v[`w${side}${i}`] ?? w)) : w;
                for (let c = 0; c < lw; c++)
                    cols.push('road');
            });
        };
        for (let k = 0; k < shoulder; k++)
            cols.push('road');
        if (v.edgeOn)
            addLine({ kind: 'edge' });
        lanesOf('L', L, false);
        let mid; // centre column (the U-turn line goes here)
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
                addLine({ kind: 'center', center: true });
                mid = cols.length;
                cols.push('road');
                addLine({ kind: 'center', center: true });
            }
            else if (v.centerType === 'oneway') {
                mid = cols.length;
                addLine({ kind: 'lane', dash: true, line: dashLine++, center: true });
            }
            else {
                mid = cols.length;
                addLine({ kind: 'center', dash: v.centerType === 'dashed', line: 0, center: true });
            }
        }
        lanesOf('R', R, true);
        if (v.edgeOn)
            addLine({ kind: 'edge' });
        for (let k = 0; k < shoulder; k++)
            cols.push('road');
        const W = cols.length;
        const dash = Math.max(1, Math.floor(v.dash)), gap = Math.max(1, Math.floor(v.gap)), period = dash + gap;

        const road = yield* layout(ctx, v, W);
        const { uOf, total, trace } = road;
        const ut = Math.floor(v.uturn || 0);
        const inUturn = (d) => ut > 0 && ((v.uturnAt !== 'start' && d >= total - ut) || (v.uturnAt !== 'end' && d <= ut));
        if (ut > 0 && mid === undefined)
            ctx.say('§e유턴 구간은 양쪽에 차로가 있어야 그려집니다');

        // ----------------------------------------------------------- surface
        // with no shoulder the edge lines are the outside of the road
        const tight = v.edgeOn && !shoulder;
        const inLo = tight ? uOf(0) : uOf(0) - 0.5, inHi = tight ? uOf(W - 1) : uOf(W - 1) + 0.5;
        const paint = new Map(); // "x,z" -> {y, kind}
        for (const [key, c] of road.cells) {
            if (tight ? (c.uc <= inLo || c.uc >= inHi) : (c.uc < inLo || c.uc >= inHi))
                continue;
            let kind = 'asphalt';
            if (medianFrom >= 0 && !inUturn(c.s) && c.uc > uOf(medianFrom) - 0.5 && c.uc < uOf(medianTo) + 0.5) {
                const lat = Math.round(c.uc - uOf(medianFrom));
                if (v.medianStyle === 'fill' || M < 2)
                    kind = 'center';
                else if (v.medianStyle === 'checker') {
                    // inside the yellow border: a checkerboard whose squares touch corner to corner
                    if (((Math.floor(c.s) + lat) % 2 + 2) % 2 === 0)
                        kind = 'center';
                }
                else if (v.medianStyle === 'hatch') {
                    if (((Math.floor(c.s) + lat) % 4 + 4) % 4 === 0)
                        kind = 'center';
                }
            }
            paint.set(key, { y: c.y, kind });
        }
        yield;
        // ------------------------------------------------------------- lines
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
        const bridged = v.bridge ? yield* roadBridge(ctx, v, road, W) : '';
        yield* place(ctx, v.bridge ? { ...v, down: false } : v, paint, (cell) => pats[cell.kind], () => pats.asphalt);
        const tail = bridged ? `, ${bridged}` : '';
        const sides = adv ? '' : `, 차로 폭 ${w}`;
        if (one)
            return `1차선 도로, 폭 ${W}칸${tail}, 길이 약 ${Math.round(total)}칸`;
        return `폭 ${W}칸 (왼쪽 ${L} · 오른쪽 ${R}차로${M ? `, 분리대 ${M}칸` : ''}${sides})${tail}, 길이 약 ${Math.round(total)}칸`;
    },
};

/**
 * The centre line sampled every third of a block, and every cell of a road
 * W columns wide with its sideways offset `uc` and distance along `s`.
 */
export function* layout(ctx, v, W) {
    const off = W % 2 === 0 ? 0.5 : 0; // keep columns on whole blocks for straight roads
    const uOf = (col) => -W / 2 + col + 0.5 + off;
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
    yield;
    return yield* roadFrom(S, W, s);
}

/**
 * The cells of a road W columns wide around sampled centre points S
 * ({x, y, z, tx, tz, nx, nz, s}), `total` long: each cell keeps the nearest
 * sample's sideways offset `uc` and distance along `s`.
 */
export function* roadFrom(S, W, total) {
    const off = W % 2 === 0 ? 0.5 : 0;
    const uOf = (col) => -W / 2 + col + 0.5 + off;
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
                cells.set(key, { y: Math.floor(p.y), uc: dx * p.nx + dz * p.nz, s: p.s + (dx * p.tx + dz * p.tz), a, tx: p.tx, tz: p.tz });
        }
        if (++n % 100 === 0)
            yield;
    }
    const trace = (u) => thin(S.map(p => ({ x: Math.floor(p.x + p.nx * u), z: Math.floor(p.z + p.nz * u), y: Math.floor(p.y), s: p.s, tx: p.tx, tz: p.tz })));
    return { uOf, total, cells, trace, samples: S };
}

/** Write the painted cells with thickness, fill-down and clearing above. */
export function* place(ctx, v, paint, surfaceOf, belowOf) {
    const edit = ctx.edit;
    const thick = Math.max(1, Math.floor(v.thick)), clear = Math.floor(v.clear) || 0;
    const air = AIR();
    let n = 0;
    for (const [key, cell] of paint) {
        const [x, z] = key.split(',').map(Number);
        const y = cell.y;
        const top = surfaceOf(cell);
        if (top)
            top.place(edit, { x, y, z });
        let bottom = y - thick + 1;
        if (v.down)
            bottom = Math.min(bottom, edit.highest(x, z, edit.minY, y - 1) + 1);
        for (let yy = y - 1; yy >= bottom; yy--) {
            const b = belowOf(cell, y - yy);
            if (b)
                b.place(edit, { x, y: yy, z });
        }
        for (let yy = y + 1; yy <= y + clear; yy++)
            edit.set({ x, y: yy, z }, air);
        if (++n % 2000 === 0)
            yield;
    }
}

const single = (perm) => perm && { place: (edit, p) => edit.set(p, perm) };

/** Sweep a saved custom preset along the curve. */
function* custom(ctx, v) {
    const t = openPreset(v.preset);
    const W = t.w;
    const road = yield* layout(ctx, v, W);
    const { uOf, total, trace } = road;
    const mod = (a, b) => ((a % b) + b) % b;
    const colOf = (uc) => Math.max(0, Math.min(W - 1, Math.round(uc - uOf(0))));
    const paint = new Map(); // "x,z" -> {y, col, j, perm}
    for (const [key, c] of road.cells) {
        if (c.uc < uOf(0) - 0.5 || c.uc >= uOf(W - 1) + 0.5)
            continue;
        const col = colOf(c.uc);
        if (t.empty[col])
            continue;
        const j = mod(Math.floor(c.s), t.l);
        // plain columns: the block the preset has there (usually the base)
        const b = t.line[col] ? t.base : (t.at(0, col, j) ?? t.base);
        paint.set(key, { y: c.y, col, j, perm: b });
    }
    yield;
    // painted columns, traced one block wide, repeating the preset along the road
    for (let col = 0; col < W; col++) {
        if (!t.line[col])
            continue;
        trace(uOf(col)).forEach((c, i) => {
            const j = mod(i, t.l);
            const b = t.at(0, col, j);
            if (b && b !== t.base)
                paint.set(c.x + ',' + c.z, { y: c.y, col, j, perm: b });
        });
        yield;
    }
    // a preset several layers deep is laid at least that thick
    const bridged = v.bridge ? yield* roadBridge(ctx, v, road, W) : '';
    yield* place(ctx, { ...v, thick: Math.max(Math.floor(v.thick) || 1, t.h), down: v.bridge ? false : v.down }, paint, (cell) => single(cell.perm), (cell, depth) => {
        if (depth < t.h)
            return single(t.at(depth, cell.col, cell.j));
        return single(t.at(t.h - 1, cell.col, cell.j) ?? t.base);
    });
    return `커스텀 "${v.preset}" 폭 ${W}칸${bridged ? `, ${bridged}` : ''}, 길이 약 ${Math.round(total)}칸`;
}
