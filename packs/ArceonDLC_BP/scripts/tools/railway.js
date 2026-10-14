/*
 * Railway (철도): track, catenary poles and wires along the curve points.
 * See lib/rail.js for how each part is laid.
 */
import { AIR } from '../core/blocks.js';
import { ask } from '../ui/form.js';
import { listAssets } from './assets.js';
import { builtinPole, builtinTile, freeWires, loadPole, presetTile, standPoles, stringWires, sweep, TOP_MIX } from '../lib/rail.js';
import { loadTracks, trackNames } from '../lib/track_presets.js';
import { BRIDGES, bridgeById, bridgeTile, geometry, pierPiece, polish, STEEL } from '../lib/bridges.js';
import { stamp } from '../lib/rail.js';
import { loadAll } from '../core/edit.js';
import { unlocked } from '../core/session.js';
import { ensureLoaded } from '../core/loader.js';
import { layout, roadFrom } from './lanes.js';

const BUILTIN_POLE = '@기본', POST_ONLY = '@기둥';
const BRIDGE_KEYS = ['bridge', 'steel', 'span', 'colGap'];

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
                    ...BRIDGES.map(b => ({ value: b.id, label: (b.group === 'steel' ? '철교: ' : '콘크리트교: ') + b.name })),
                ],
                tooltip: '곡선 점 높이가 선로 바닥 높이입니다. 교각은 경간마다 땅까지 내려갑니다.',
            },
            {
                key: 'steel', type: 'dropdown', label: '철교 색 (강재 도장)', default: 'weathered',
                options: Object.entries(STEEL).map(([value, s]) => ({ value, label: s.name })),
            },
            { key: 'span', type: 'slider', label: '교량 경간 (교각 사이 칸 수, 트러스·아치는 고정)', default: 0, min: 0, max: 60 },
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
        if (v.bridge && !unlocked(ctx.player))
            v = { ...v, bridge: '' }; // hidden until the settings code is given
        const paint = new Map();
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
            // an open-deck (truss) bridge: no ballast, the sleepers lie on the steel deck
            if (bridgeById(v.bridge)?.openDeck) {
                d.noBallast = true;
                d.top = '';
            }
            tile = builtinTile(d);
            tile.fill = d;
        }
        let trussPoles = null; // poles hung on the truss verticals: {samples, spots, planes}
        if (v.bridge) {
            // the bridge first: the track is laid over it
            const d = bridgeById(v.bridge);
            if (!d)
                throw new Error('없는 교량 종류: ' + v.bridge);
            const bed = tile.rails ? tile : builtinTile({ tracks: v.tracks ?? 2 });
            const g = geometry(d, bed, { paint: v.steel, colGap: tile.fill?.colGap ?? v.colGap, ballast: tile.fill?.ballast, top: tile.fill ? tile.fill.top : TOP_MIX });
            const bt = bridgeTile(d, g);
            const bp = new Map();
            const curveRoad = yield* layout(ctx, v, 1);
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
                if (d.poleAt && v.pole === BUILTIN_POLE) {
                    const ps = [];
                    for (let k = 0; k + 1 < ends.length; k++)
                        for (const q of d.poleAt)
                            ps.push(k * d.l + q);
                    trussPoles = { samples: S, spots: ps, planes: [g.uL + 1, g.uR - 1] };
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
                stamp(p, pierPiece(d, g, gdy, bt, piers + 1), v.poleAngle, bp, turned);
                if (++piers % 2 === 0)
                    yield;
            }
            yield* polish(bp);
            for (const [k, perm] of bp)
                if (perm)
                    paint.set(k, perm);
            parts.push(`${d.name} (교각 ${piers}개, 경간 ${d.straight ? Math.round(total / Math.max(1, spots.length - 1)) : span}칸)`);
        }
        const road = yield* sweep(ctx, v.track === '-' ? { ...v, clearAir: false } : v.bridge ? { ...v, down: false } : v, tile, paint);
        if (tile.describe)
            parts.push(tile.describe);
        if (v.pole) {
            // the built-in poles are built over the rails of the track (a saved track or
            // none: the rails a built-in track with this many lines would have)
            const bed = tile.rails ? tile : builtinTile({ tracks: v.tracks ?? 2 });
            const pole = v.pole === BUILTIN_POLE || v.pole === POST_ONLY
                ? builtinPole(v.pole === POST_ONLY ? 'post' : 'gantry', bed.rails, bed.bed, { lift: (v.wireHeight ?? 5) - 5 }) : loadPole(v.pole);
            let poles;
            if (trussPoles) {
                // on a truss: a gantry beam between the truss verticals, no posts of its own
                const tp = builtinPole('truss', bed.rails, bed.bed, { planes: trussPoles.planes, lift: (v.wireHeight ?? 5) - 5 });
                const S2 = trussPoles.samples, turned = new Map();
                poles = trussPoles.spots.map(s => stamp(S2.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b), tp, v.poleAngle, paint, turned));
                pole.buttons = tp.buttons;
                pole.styles = tp.styles;
            }
            else
                poles = yield* standPoles(road, pole, v, paint);
            parts.push(`전신주 ${poles.length}개`);
            if (v.wires) {
                if (!pole.buttons.length)
                    ctx.say('§e전신주 에셋 안에 버튼이 없어 전선을 걸 곳이 없습니다 (애자 끝에 버튼을 달아 다시 저장하세요)');
                else
                    parts.push(`전선 ${yield* stringWires(poles, pole, v, paint)}가닥`);
            }
        }
        else if (v.wires && String(v.wireAt ?? '').trim())
            parts.push(`전선 ${yield* freeWires(road, v, paint)}가닥`);
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
