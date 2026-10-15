/*
 * Railway (철도): track, catenary poles and wires along the curve points.
 * See lib/rail.js for how each part is laid.
 */
import { AIR, parseBlock, parsePattern, perm } from '../core/blocks.js';
import { ask } from '../ui/form.js';
import { listAssets } from './assets.js';
import { builtinPole, builtinTile, freeWires, loadPole, poleSpots, presetTile, standPoles, stringWires, sweep, TOP_MIX } from '../lib/rail.js';
import { loadTracks, trackNames } from '../lib/track_presets.js';
import '../lib/low_bridges.js'; // the low bridges join BRIDGES
import '../lib/jp_bridges.js'; // and the Japanese plate girders
import { BRIDGES, bridgeById, bridgeTile, endPiece, geometry, pierPiece, polish, STEEL } from '../lib/bridges.js';
import { stamp } from '../lib/rail.js';
import { loadAll } from '../core/edit.js';
import { session, unlocked } from '../core/session.js';
import { bufferStop, endsOf, laneLine, newId, planFromPoints, reversed, saveTrack, thinPts, TrackPaint, trackSamples, turnoutFurniture, yardTile } from '../lib/yard.js';
import { ensureLoaded } from '../core/loader.js';
import { buildTunnel, rangeAt, tunnelById, tunnelPole, tunnelRanges, tunnelSize, TUNNELS } from '../lib/tunnels.js';
import { layout, roadFrom } from './lanes.js';

const BUILTIN_POLE = '@기본', POST_ONLY = '@기둥';
const BRIDGE_KEYS = ['bridge', 'steel', 'span', 'colGap', 'trussPoles', 'tunnel', 'tunnelType'];

const DETAIL = [
    { key: 'gauge', type: 'slider', label: '레일(모루) 사이 칸 수', default: 2, min: 1, max: 8 },
    { key: 'stub', type: 'slider', label: '레일 바깥 침목 길이', default: 1, min: 0, max: 4 },
    { key: 'margin', type: 'slider', label: '침목 바깥 자갈 칸 수', default: 1, min: 0, max: 6 },
    { key: 'between', type: 'slider', label: '선로 사이 자갈 칸 수 (복선)', default: 1, min: 0, max: 10 },
    { key: 'sleeperOn', type: 'slider', label: '침목 두께 (칸)', default: 1, min: 1, max: 4 },
    { key: 'sleeperOff', type: 'slider', label: '침목 사이 간격 (칸)', default: 1, min: 0, max: 6 },
    { key: 'ballast', type: 'block', label: '자갈 (바닥)', default: 'gravel', palette: false },
    { key: 'top', type: 'block', label: '자갈 위 반블록 (비율%블록, 쉼표로)', default: TOP_MIX, palette: false },
    { key: 'sleeper', type: 'block', label: '침목 (비율%블록, 쉼표로 섞기)', default: 'mud_bricks', palette: false },
    { key: 'sleeperEnd', type: 'block', label: '침목 양 끝 계단 (레일 쪽이 높게, 비우면 침목과 같게)', default: 'mud_brick_stairs', palette: false },
    { key: 'colGap', type: 'slider', label: '슬래브교: 기둥 사이 간격 (칸)', default: 6, min: 3, max: 20 },
    { key: 'rail', type: 'block', label: '레일', default: 'anvil', palette: false },
];

/**
 * Record a laid track (hidden features): its centre line and ends; loose ends
 * get an end block, ends it carried on from lose theirs, a branch / join on a
 * single track gets its turnout furniture.
 */
function record(ctx, plan, S, tile, paint) {
    const ends = endsOf(S);
    const touched = new Map();
    const single = (tile.rails?.length ?? 0) === 2;
    let turnouts = 0;
    [plan?.start, plan?.finish].forEach((ref, k) => {
        if (!ref || ref.type === 'point')
            return;
        ends[k].open = false;
        if (ref.type === 'end') {
            const t = touched.get(ref.track.id) ?? JSON.parse(JSON.stringify(ref.track));
            for (const [x, y, z] of bufferStop(t.ends[ref.end]))
                if (!paint.has(`${x},${y},${z}`))
                    paint.set(`${x},${y},${z}`, null);
            t.ends[ref.end].open = false;
            touched.set(t.id, t);
        }
        else
            turnouts++;
    });
    if (single) {
        const railSouth = yardTile().railSouth;
        for (const [j, rev] of [[plan?.branchFrom, false], [plan?.joinTo, true]]) {
            if (!j)
                continue;
            const TS = trackSamples(j.track);
            const off = (j.track.centres ?? [0])[j.lane ?? 0] ?? 0;
            const par = j.dir > 0 ? laneLine(TS, off, j.s, TS[TS.length - 1].s) : laneLine(TS, off, j.s, 0);
            turnoutFurniture(par, rev ? reversed(S) : S, railSouth, paint);
        }
    }
    for (const e of ends)
        if (e.open)
            for (const [x, y, z, t] of bufferStop(e))
                paint.set(`${x},${y},${z}`, perm('minecraft:' + t));
    const track = { id: newId(), name: '', pts: thinPts(S), ends, w: tile.w, centres: tile.centres ?? [0] };
    saveTrack(track);
    ctx.lastTrack = track;
    for (const t of touched.values())
        saveTrack(t);
    return turnouts ? `분기기 ${turnouts}개` : (ends.some(e => !e.open) ? '이어 깔기' : '끝 블록 2개');
}

/**
 * A safety fence along both sides of a track on the ground, a block outside
 * the bed: 'mesh' iron bar panels between stone posts every 4 blocks with a
 * coping on the posts; 'grate' copper grating with bolt heads and an iron bar
 * top (as on the Yamanote line); an invisible light block over every post. Joined up (bars and walls connect, diagonal
 * corners closed) by the bridge polish.
 */
function* safetyFence(road, w, v, paint) {
    const S = road.samples, h = Math.max(2, Math.min(4, Math.floor(v.fenceHeight ?? 2)));
    const off = w / 2 + 0.5;
    const fp = new Map();
    let cells = 0;
    const B = (id, st) => perm('minecraft:' + id, st);
    for (const side of [-1, 1]) {
        let last = null;
        for (const q of S) {
            const x = Math.floor(q.x + q.nx * off * side), z = Math.floor(q.z + q.nz * off * side), y = Math.floor(q.y);
            const key = x + ',' + z;
            if (key === last)
                continue;
            last = key;
            if (fp.has(`${x},${y},${z}`))
                continue;
            cells++;
            const post = Math.round(q.s) % 4 === 0;
            for (let k = 0; k < h; k++) {
                let b;
                if (v.fence === 'grate')
                    b = k === h - 1 ? B('iron_bars') : B('weathered_copper_grate');
                else
                    b = post ? B('andesite_wall') : B('iron_bars');
                fp.set(`${x},${y + k},${z}`, b);
            }
            if (v.fence === 'mesh' && post)
                fp.set(`${x},${y + h},${z}`, B('andesite_slab', { 'minecraft:vertical_half': 'bottom' }));
            if (post)
                fp.set(`${x},${y + h + (v.fence === 'mesh' ? 1 : 0)},${z}`, B('light_block_12')); // invisible light over the posts
        }
    }
    yield* polish(fp);
    for (const [k, p] of fp)
        if (p)
            paint.set(k, p);
    return cells;
}

/**
 * An embankment (언덕) under a track on the ground: the bed is carried on
 * earth down to the ground on both sides, with a level grass shoulder (4
 * blocks) beside the bed for the poles.
 *   slope - grass slopes at 1:1 (dirt inside, a gravel toe where they meet the ground).
 *   wall  - as along the old city lines: a green-covered slope at 1:1 from the
 *           bed down to a retaining wall (rubble stone footing, concrete
 *           above, up to 4 high) with a wooden fence on top.
 * Tunnels are left out; it is not built under a bridge.
 */
function* embankment(ctx, S, total, w, v, paint, skip) {
    const half = w / 2, SHOULDER = 4, SPREAD = 30;
    const road = yield* roadFrom(S, Math.ceil(w + 2 * SPREAD), total);
    const edit = ctx.edit, far = loadAll(ctx.player);
    const B = (t) => parseBlock(t);
    const dirt = B('dirt'), grass = B('grass_block'), toe = B('gravel'), moss = B('moss_block');
    const stone = MASON_B, con = B('light_gray_concrete'), conB = B('andesite'), fence = B('dark_oak_fence');
    const loaded = new Set();
    const put = (x, y, z, p) => {
        const k = `${x},${y},${z}`;
        if (!paint.has(k))
            paint.set(k, p);
    };
    let n = 0, cells = 0;
    for (const [key, c] of road.cells) {
        if (skip?.has(key))
            continue;
        const [x, z] = key.split(',').map(Number);
        const ck = (x >> 4) + ',' + (z >> 4);
        if (far && !loaded.has(ck)) {
            loaded.add(ck);
            const release = yield ensureLoaded(ctx.dim, { x: (x >> 4) * 16, y: c.y, z: (z >> 4) * 16 }, { x: (x >> 4) * 16 + 15, y: c.y, z: (z >> 4) * 16 + 15 });
            release?.();
        }
        const y = c.y, g = edit.highest(x, z, y - 60, y - 1);
        const H = y - 1 - g; // blocks to fill under the bed level
        if (H <= 0 || H >= 59)
            continue; // on the ground already, or no ground found
        const d0 = Math.abs(c.uc) - half; // distance out from the bed's edge
        if (d0 <= 0.5) {
            put(x, y, z, grass); // (only where the bed left the top open)
            for (let yy = y - 1; yy > g; yy--)
                put(x, yy, z, dirt); // under the bed
            cells++;
            continue;
        }
        // a level shoulder beside the bed for the poles and a walkway, then the slope
        if (d0 <= SHOULDER + 0.5) {
            for (let yy = y; yy > g; yy--)
                put(x, yy, z, yy === y ? grass : dirt);
            cells++;
            continue;
        }
        const d = d0 - SHOULDER;
        if (v.embank === 'wall') {
            const Hw = Math.min(H, 4);
            const dw = 0.5 + (H - Hw); // where the slope reaches the top of the wall
            if (d < dw) {
                const top = Math.round(y - 1 - (d - 0.5));
                for (let yy = top; yy > g; yy--)
                    put(x, yy, z, yy === top ? (((x * 7 + z * 13) % 5 + 5) % 5 < 4 ? moss : grass) : dirt);
            }
            else if (d < dw + 2) {
                for (let k = 1; k <= Hw; k++)
                    put(x, g + k, z, k <= Math.min(2, Hw - 1) ? stone.at({ x, y: g + k, z }) : (k === Hw ? conB : con));
                if (d < dw + 1)
                    put(x, g + Hw + 1, z, fence); // fence on the inner edge of the wall
            }
            else
                continue;
        }
        else {
            const top = Math.round(y - 1 - (d - 0.5));
            if (top <= g)
                continue;
            for (let yy = top; yy > g; yy--)
                put(x, yy, z, yy === top ? (top - g <= 1 ? toe : grass) : dirt);
        }
        cells++;
        if (++n % 400 === 0)
            yield;
    }
    return cells;
}
const MASON_B = parsePattern('40%cobblestone,25%mossy_cobblestone,20%stone,15%andesite');

export default {
    id: 'railway',
    name: '철도',
    desc: '곡선 점을 따라 선로를 깔고, 저장한 전신주를 일정 간격으로 세우고, 전선(버튼)을 겁니다. 곡선 점은 선로 바닥(자갈) 높이의 블록에 찍으세요.',
    icon: 'textures/blocks/rail_normal',
    needs: 'points',
    useMask: true,
    fieldsFor(player) {
        // the bridge options only once the advanced features are unlocked (settings code)
        const f = this.fields;
        return unlocked(player) ? f : f.filter(x => !BRIDGE_KEYS.includes(x.key));
    },
    get fields() {
        const tracks = trackNames();
        const assets = listAssets().map(a => a.name);
        return [
            {
                key: 'track', type: 'dropdown', label: '선로 모양', default: '', options: [
                    { value: '', label: '기본 선로 (자갈 + 돌 반블록 + 진흙 벽돌 침목 + 모루 레일)' },
                    ...tracks.map(n => ({ value: n, label: '저장한 선로: ' + n })),
                    { value: '-', label: '선로 없이 전신주·전선만' },
                ],
            },
            {
                key: 'tracks', type: 'dropdown', label: '선로 수', default: 2, options: [
                    { value: 1, label: '1개 (단선)' },
                    { value: 2, label: '2개 (복선)' },
                    ...[3, 4, 5, 6, 7, 8].map(n => ({ value: n, label: n + '개' })),
                ],
            },
            {
                key: 'bridge', type: 'dropdown', label: '교량 (선로를 다리 위에)', default: '', options: [
                    { value: '', label: '없음 (땅 위)' },
                    ...BRIDGES.map(b => ({ value: b.id, label: (b.group === 'steel' ? '철교: ' : b.group === 'jp' ? '일본식 철교: ' : b.group === 'low' ? '저상 (낮은 길 위): ' : '콘크리트교: ') + b.name })),
                ],
                tooltip: '곡선 점 높이가 선로 바닥 높이입니다. 교각은 경간마다 땅까지 내려갑니다.',
            },
            {
                key: 'steel', type: 'dropdown', label: '철교 색 (강재 도장)', default: 'weathered',
                options: Object.entries(STEEL).map(([value, s]) => ({ value, label: s.name })),
            },
            { key: 'span', type: 'slider', label: '교량 경간 (교각 사이 칸 수, 트러스·아치는 고정)', default: 0, min: 0, max: 60 },
            {
                key: 'tunnel', type: 'dropdown', label: '터널', default: '', options: [
                    { value: '', label: '만들지 않음' },
                    { value: 'auto', label: '터널 교차 (땅을 지나는 곳만 터널, 앞은 깎기)' },
                    { value: 'full', label: '처음부터 끝까지 터널 (교량 대신)' },
                ],
            },
            {
                key: 'tunnelType', type: 'dropdown', label: '터널 디자인', default: 'natm',
                options: TUNNELS.map(t => ({ value: t.id, label: t.name })),
            },
            { key: 'trussPoles', type: 'toggle', label: '트러스교: 전신주를 트러스 수직재 자리에 세우기 (끄면 보통 간격대로)', default: true },
            { key: 'detail', type: 'toggle', label: '기본 선로 고급 설정 (레일 사이 칸 수·블록 비율, 다음 화면)', default: false },
            {
                key: 'pole', type: 'dropdown', label: '전신주', default: BUILTIN_POLE, options: [
                    { value: BUILTIN_POLE, label: '기본 전신주 (직접 지은 문형 전신주, 선로 수에 맞춤)' },
                    { value: POST_ONLY, label: '기본 기둥만 (양쪽 기둥 + 급전선)' },
                    { value: '', label: '없음' },
                    ...assets.map(n => ({ value: n, label: '커스텀 (에셋): ' + n })),
                ],
                tooltip: '커스텀 전신주는 직접 지어서 에셋으로 저장해 두세요: 선로 가운데 바닥 블록을 바라보고, 선로 방향을 보고 저장',
            },
            {
                key: 'poleMode', type: 'dropdown', label: '전신주 간격 정하는 방법', default: 'curve', options: [
                    { value: 'curve', label: '일정 간격 + 곡선에서는 자동으로 촘촘하게' },
                    { value: 'every', label: '일정 간격 그대로' },
                    { value: 'count', label: '개수로 정하기 (처음부터 끝까지 고르게)' },
                    { value: 'list', label: '간격 직접 적기 (예: 20, 30 → 20·30 반복)' },
                ],
            },
            { key: 'poleEvery', type: 'slider', label: '전신주 간격 (칸)', default: 20, min: 4, max: 120 },
            { key: 'poleMin', type: 'slider', label: '곡선에서 가장 좁은 간격 (칸)', default: 8, min: 2, max: 60 },
            { key: 'poleStray', type: 'slider', label: '곡선: 전선이 선로 가운데서 벗어나도 되는 칸 수', default: 1, min: 0.5, max: 6, step: 0.5 },
            { key: 'poleCount', type: 'slider', label: '개수로 정하기: 전신주 개수', default: 5, min: 1, max: 100 },
            { key: 'poleList', type: 'text', label: '간격 직접 적기: 칸 수를 쉼표로', placeholder: '20, 30', default: '' },
            { key: 'poleStart', type: 'slider', label: '첫 전신주 위치 (시작점에서 몇 칸)', default: 0, min: 0, max: 120 },
            { key: 'poleEnd', type: 'toggle', label: '끝점에도 전신주 세우기', default: false },
            {
                key: 'poleAngle', type: 'dropdown', label: '전신주 방향', default: 'exact', options: [
                    { value: 'exact', label: '선로 각도 그대로 (빈틈 없이 돌림)' },
                    { value: '90', label: '90° 단위로만 (모양 100% 그대로)' },
                ],
            },
            { key: 'wireHeight', type: 'slider', label: '전차선 높이 (레일 위 칸 수, 기본 전신주)', default: 5, min: 2, max: 12 },
            { key: 'wires', type: 'toggle', label: '전선 걸기 (전신주 안의 버튼끼리 이음)', default: true },
            { key: 'wireBlock', type: 'block', label: '전선 블록 (버튼)', default: 'polished_blackstone_button', palette: false },
            { key: 'wireSupport', type: 'toggle', label: '전선 버튼에 보이지 않는 방벽 받치기 (안 떨어지게)', default: true },
            { key: 'wireGap', type: 'slider', label: '전선 버튼 간격 (칸)', default: 2, min: 1, max: 8 },
            { key: 'sag', type: 'slider', label: '전선 처짐 (칸)', default: 1, min: 0, max: 6 },
            { key: 'wireAt', type: 'text', label: '전신주 없이 전선만: 위치 "가로:높이" 쉼표로', placeholder: '-4:7, 4:7', default: '' },
            {
                key: 'embank', type: 'dropdown', label: '언덕 (선로 아래를 땅까지 쌓기, 교량일 때는 없음)', default: '', options: [
                    { value: '', label: '없음' },
                    { value: 'slope', label: '흙 언덕 (잔디 비탈 1:1)' },
                    { value: 'wall', label: '옹벽 언덕 (녹색 비탈 + 돌 기초·콘크리트 옹벽 + 나무 울타리)' },
                ],
            },
            {
                key: 'fence', type: 'dropdown', label: '안전망 (땅 위 선로 양옆, 교량일 때는 없음)', default: '', options: [
                    { value: '', label: '없음' },
                    { value: 'mesh', label: '철망 (철창 + 돌 기둥)' },
                    { value: 'grate', label: '격자 (구리 격자 + 철창)' },
                ],
            },
            { key: 'fenceHeight', type: 'slider', label: '안전망 높이 (칸)', default: 2, min: 2, max: 4 },
            { key: 'clearAir', type: 'toggle', label: '선로 높이의 풀·블록 비우기', default: true },
            { key: 'down', type: 'toggle', label: '선로 아래 땅까지 채우기', default: false },
            { key: 'straight', type: 'toggle', label: '곡선을 덜 휘게 (-p)', default: false },
        ];
    },
    async more(player, v) {
        if (!v.detail || v.track)
            return {};
        return ask(player, 'tool:railway:detail', '철도 - 기본 선로 세부 설정', unlocked(player) ? DETAIL : DETAIL.filter(x => !BRIDGE_KEYS.includes(x.key)), { submit: '깔기' });
    },
    *run(ctx, v) {
        if ((v.bridge || v.tunnel) && !unlocked(ctx.player))
            v = { ...v, bridge: '', tunnel: '' }; // hidden until the settings code is given
        if (v.tunnel === 'full')
            v = { ...v, bridge: '' }; // a tunnel all the way: no bridge
        const parts = [];
        let tile;
        if (v.track === '-')
            tile = { w: 1, l: 1, h: 1, anchor: 0, dirAng: 0, cell: () => null, describe: '' };
        else if (v.track) {
            const t = loadTracks()[v.track];
            if (!t)
                throw new Error(`"${v.track}" 선로가 없습니다`);
            tile = presetTile(t);
        }
        else {
            // detail values come from the follow-up form; without it, the defaults
            const d = { ...v };
            for (const f of DETAIL) {
                if (f.type === 'block')
                    d[f.key] = v[f.key + '#text'] !== undefined ? ctx.patternText(f.key) : f.default;
                else if (d[f.key] === undefined)
                    d[f.key] = f.default;
            }
            // on a bridge no ballast: the sleepers lie on the deck
            if (bridgeById(v.bridge)) {
                d.noBallast = true;
                d.top = '';
            }
            tile = builtinTile(d);
            tile.fill = d;
        }
        // hidden features: the track is recorded (ends get an end block), and
        // points on a recorded track's end or side carry on from it / branch off it
        const rec = unlocked(ctx.player) && v.track !== '-';
        const N = session(ctx.player).settings.yard?.N ?? 8;
        const plan = ctx.plan ?? (rec ? planFromPoints(ctx.points, N, [], (tile.rails?.length ?? 0) === 2) : null);
        const C = plan?.S ?? null; // the centre line, when it is not just the curve through the points
        const paint = rec ? new TrackPaint(ctx.edit) : new Map();
        let trussPoles = null; // poles hung on the truss verticals: {samples, spots, planes}
        // the centre line (the plan's, or the curve through the points)
        let centre = null;
        function* centreRoad() {
            if (!centre)
                centre = C ? { total: C[C.length - 1].s, samples: C } : yield* layout(ctx, v, 1);
            return centre;
        }
        // tunnels: where they run, and the cells around the line they take
        let tunnel = null, inTunnel = null;
        if (v.tunnel) {
            const T = tunnelById(v.tunnelType || 'natm') ?? TUNNELS[0];
            const bed = tile.rails ? tile : builtinTile({ tracks: v.tracks ?? 2 });
            const half = Math.max(Math.abs(bed.bed[0]), Math.abs(bed.bed[1])) + 0.5;
            const { hw, Hc } = tunnelSize(half, v.wireHeight ?? 5);
            const cr = yield* centreRoad();
            const { ranges, ground } = yield* tunnelRanges(ctx, cr.samples, cr.total, Hc, v.tunnel);
            const troad = yield* roadFrom(cr.samples, Math.ceil(2 * (hw + 7)), cr.total);
            const n = Number(v.tracks ?? 2);
            tunnel = { T, ranges, ground, troad, info: { hw, Hc, half, pillars: !v.track && n >= 2 && n % 2 === 0 } };
            inTunnel = new Set();
            for (const [k, c] of troad.cells)
                if (rangeAt(ranges, c.s))
                    inTunnel.add(k);
        }
        if (v.bridge) {
            // the bridge first: the track is laid over it
            const d = bridgeById(v.bridge);
            if (!d)
                throw new Error('없는 교량 종류: ' + v.bridge);
            const bed = tile.rails ? tile : builtinTile({ tracks: v.tracks ?? 2 });
            const g = geometry(d, bed, { paint: v.steel, colGap: tile.fill?.colGap ?? v.colGap, ballast: tile.fill?.ballast, top: tile.fill ? tile.fill.top : TOP_MIX });
            const bt = bridgeTile(d, g);
            const bp = new Map();
            const curveRoad = yield* centreRoad();
            const total = curveRoad.total, CS = curveRoad.samples;
            let span = d.fixed ? d.span : (Math.floor(v.span) || d.span);
            const at = (s) => {
                let lo = 0, hi = CS.length - 1;
                while (lo < hi) {
                    const m = (lo + hi) >> 1;
                    if (CS[m].s < s)
                        lo = m + 1;
                    else
                        hi = m;
                }
                return CS[lo];
            };
            // piers: every span, one at each end; a short last span is stretched
            let spots;
            if (d.straight) {
                const n = Math.max(1, Math.round(total / span));
                spots = Array.from({ length: n + 1 }, (_, k) => total * k / n);
            }
            else {
                spots = [];
                for (let s = 0; s <= total + 1e-6; s += span)
                    spots.push(s);
                const rest = total - spots[spots.length - 1];
                if (rest > 1) {
                    if (rest < span / 2 && spots.length > 1)
                        spots[spots.length - 1] = total;
                    else
                        spots.push(total);
                }
            }
            let deck, pierAt;
            if (d.straight) {
                // each span a straight chord between its piers; j runs 0..l along every span
                const S = [];
                const ends = spots.map(at);
                for (let k = 0; k + 1 < ends.length; k++) {
                    const A = ends[k], B = ends[k + 1];
                    const L = Math.hypot(B.x - A.x, B.z - A.z) || 1, tx = (B.x - A.x) / L, tz = (B.z - A.z) / L;
                    const steps = Math.max(1, Math.ceil(L * 3));
                    for (let i = k ? 1 : 0; i <= steps; i++) {
                        const t = i / steps;
                        S.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t, tx, tz, nx: -tz, nz: tx, s: (k + t) * d.l, span: k });
                    }
                }
                deck = yield* roadFrom(S, bt.w, (ends.length - 1) * d.l);
                // a pier turned halfway between the spans it carries
                pierAt = ends.map((p, k) => {
                    const a = S.find(q => q.span === Math.max(0, k - 1)), b = S.find(q => q.span === Math.min(ends.length - 2, k));
                    const tx = (a.tx + b.tx) / 2, tz = (a.tz + b.tz) / 2, l = Math.hypot(tx, tz) || 1;
                    return { ...p, tx: tx / l, tz: tz / l };
                });
                if (d.poleAt && v.trussPoles !== false && (v.pole === BUILTIN_POLE || d.wholePoles && v.pole)) {
                    const ps = [];
                    for (let k = 0; k + 1 < ends.length; k++)
                        for (const q of d.poleAt)
                            ps.push(k * d.l + q);
                    trussPoles = { samples: S, spots: ps, planes: [g.uL + 1, g.uR - 1], whole: !!d.wholePoles };
                }
            }
            else {
                deck = yield* roadFrom(CS.map(p => p), bt.w, total);
                pierAt = spots.map(at);
            }
            yield* sweep(ctx, { ...v, clearAir: false, down: false }, bt, bp, deck);
            const edit = ctx.edit;
            let piers = 0;
            const turned = new Map();
            const far = loadAll(ctx.player);
            for (const p of pierAt) {
                const y = Math.floor(p.y);
                // the ground under a far pier must be loaded before it can be read
                const release = far ? yield ensureLoaded(ctx.dim, { x: Math.floor(p.x) - 2, y, z: Math.floor(p.z) - 2 }, { x: Math.floor(p.x) + 2, y, z: Math.floor(p.z) + 2 }) : null;
                const ground = edit.highest(Math.floor(p.x), Math.floor(p.z), Math.max(edit.minY, y - 96), y + d.dyMin - 1);
                const gdy = Math.max(ground - y, d.dyMin - 96);
                release?.();
                if (gdy >= d.dyMin - 1)
                    continue; // the deck is on the ground here
                if (inTunnel?.has(Math.floor(p.x) + ',' + Math.floor(p.z)))
                    continue; // in a tunnel
                stamp(p, pierPiece(d, g, gdy, bt, piers + 1, p === pierAt[0] || p === pierAt[pierAt.length - 1]), v.poleAngle, bp, turned);
                if (++piers % 2 === 0)
                    yield;
            }
            // the deck's two ends closed with an end plate
            const cap = endPiece(d, g, bt);
            for (const p of [pierAt[0], pierAt[pierAt.length - 1]])
                if (p && !inTunnel?.has(Math.floor(p.x) + ',' + Math.floor(p.z)))
                    stamp(p, cap, v.poleAngle, bp, turned);
            // no bridge inside a tunnel
            if (inTunnel)
                for (const k of [...bp.keys()]) {
                    const [x, , z] = k.split(',');
                    if (inTunnel.has(x + ',' + z))
                        bp.delete(k);
                }
            yield* polish(bp);
            for (const [k, perm] of bp)
                if (perm)
                    paint.set(k, perm);
            parts.push(`${d.name} (교각 ${piers}개, 경간 ${d.straight ? Math.round(total / Math.max(1, spots.length - 1)) : span}칸)`);
        }
        if (tunnel) {
            const n = yield* buildTunnel(ctx, tunnel.T, tunnel.troad, tunnel.ranges, tunnel.ground, tunnel.info, paint);
            const len = Math.round(tunnel.ranges.reduce((a, r) => a + r[1] - r[0], 0));
            parts.push(n ? `${tunnel.T.name.split(' (')[0]} ${tunnel.ranges.length}곳 (약 ${len}칸)` : '터널 없음 (땅이 선로를 덮는 곳이 없음)');
        }
        const road = yield* sweep(ctx, v.track === '-' ? { ...v, clearAir: false } : v.bridge ? { ...v, down: false } : v, tile, paint,
            C ? yield* roadFrom(C, tile.w, C[C.length - 1].s) : null);
        if (tile.describe)
            parts.push(tile.describe);
        if (v.embank && !v.bridge) {
            const n = yield* embankment(ctx, road.samples, road.total, tile.rails ? tile.w : builtinTile({ tracks: v.tracks ?? 2 }).w, v, paint, inTunnel);
            parts.push(n ? `언덕 (${v.embank === 'wall' ? '옹벽' : '흙 비탈'})` : '언덕 없음 (선로가 땅 위)');
        }
        if (v.fence && !v.bridge) {
            const n = yield* safetyFence(road, tile.rails ? tile.w : builtinTile({ tracks: v.tracks ?? 2 }).w, v, paint);
            parts.push(`안전망 ${n}칸`);
        }
        if (v.pole) {
            // the built-in poles are built over the rails of the track (a saved track or
            // none: the rails a built-in track with this many lines would have)
            const bed = tile.rails ? tile : builtinTile({ tracks: v.tracks ?? 2 });
            const pole = v.pole === BUILTIN_POLE || v.pole === POST_ONLY
                ? builtinPole(v.pole === POST_ONLY ? 'post' : 'gantry', bed.rails, bed.bed, { lift: (v.wireHeight ?? 5) - 5 }) : loadPole(v.pole);
            let poles, hungPole = null;
            if (trussPoles) {
                // on a truss: whole poles standing at the truss verticals, square to each
                // straight span, or a gantry beam hung between the verticals
                const tp = trussPoles.whole ? pole : builtinPole('truss', bed.rails, bed.bed, { planes: trussPoles.planes, lift: (v.wireHeight ?? 5) - 5 });
                const S2 = trussPoles.samples, turned = new Map();
                poles = trussPoles.spots.map(s => stamp(S2.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b), tp, v.poleAngle, paint, turned));
                pole.buttons = tp.buttons;
                pole.styles = tp.styles;
            }
            else if (tunnel?.ranges.length) {
                // in a tunnel the poles hang from the roof (what fits of them), wire anchors kept
                const hung = tunnelPole({ ...pole, chain: perm('minecraft:iron_chain') }, tunnel.T, tunnel.info);
                const S = road.samples, turned = new Map(), turnedT = new Map();
                poles = [];
                let si = 0;
                for (const s of poleSpots(road, v)) {
                    while (si + 1 < S.length && S[si].s + 1e-6 < s)
                        si++;
                    const inside = rangeAt(tunnel.ranges, s);
                    const st = stamp(S[si], inside ? hung : pole, v.poleAngle, paint, inside ? turnedT : turned);
                    st.hung = !!inside;
                    poles.push(st);
                    if (poles.length % 4 === 0)
                        yield;
                }
                hungPole = hung;
            }
            else
                poles = yield* standPoles(road, pole, v, paint);
            parts.push(`전신주 ${poles.length}개`);
            if (v.wires) {
                if (!pole.buttons.length)
                    ctx.say('§e전신주 에셋 안에 버튼이 없어 전선을 걸 곳이 없습니다 (애자 끝에 버튼을 달아 다시 저장하세요)');
                else if (hungPole) {
                    // into, through and out of a tunnel only the wires that fit inside it
                    for (let i = 0; i + 1 < poles.length; i++)
                        yield* stringWires([poles[i], poles[i + 1]], poles[i].hung || poles[i + 1].hung ? hungPole : pole, v, paint);
                    parts.push(`전선 ${pole.buttons.length}가닥`);
                }
                else
                    parts.push(`전선 ${yield* stringWires(poles, pole, v, paint)}가닥`);
            }
        }
        else if (v.wires && String(v.wireAt ?? '').trim())
            parts.push(`전선 ${yield* freeWires(road, v, paint)}가닥`);
        if (rec)
            parts.push(record(ctx, plan, road.samples, tile, paint));
        const edit = ctx.edit;
        const air = AIR();
        let n = 0;
        for (const [key, perm] of paint) {
            const [x, y, z] = key.split(',').map(Number);
            edit.set({ x, y, z }, perm ?? air);
            if (++n % 3000 === 0)
                yield;
        }
        return `${parts.join(', ')}, 길이 약 ${Math.round(road.total)}칸`;
    },
};
