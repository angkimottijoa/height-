/*
 * Railway (철도): track, catenary poles and wires along the curve points.
 * See lib/rail.js for how each part is laid.
 */
import { AIR } from '../core/blocks.js';
import { ask } from '../ui/form.js';
import { listAssets } from './assets.js';
import { builtinPole, builtinTile, freeWires, loadPole, presetTile, standPoles, stringWires, sweep, TOP_MIX } from '../lib/rail.js';
import { loadTracks, trackNames } from '../lib/track_presets.js';

const BUILTIN_POLE = '@기본', POST_ONLY = '@기둥';

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
    { key: 'rail', type: 'block', label: '레일', default: 'anvil', palette: false },
];

export default {
    id: 'railway',
    name: '철도',
    desc: '곡선 점을 따라 선로를 깔고, 저장한 전신주를 일정 간격으로 세우고, 전선(버튼)을 겁니다. 곡선 점은 선로 바닥(자갈) 높이의 블록에 찍으세요.',
    icon: 'textures/blocks/rail_normal',
    needs: 'points',
    useMask: true,
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
        return ask(player, 'tool:railway:detail', '철도 - 기본 선로 세부 설정', DETAIL, { submit: '깔기' });
    },
    *run(ctx, v) {
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
            tile = builtinTile(d);
        }
        const road = yield* sweep(ctx, v.track === '-' ? { ...v, clearAir: false } : v, tile, paint);
        if (tile.describe)
            parts.push(tile.describe);
        if (v.pole) {
            // the built-in poles are built over the rails of the track (a saved track or
            // none: the rails a built-in track with this many lines would have)
            const bed = tile.rails ? tile : builtinTile({ tracks: v.tracks ?? 2 });
            const pole = v.pole === BUILTIN_POLE || v.pole === POST_ONLY
                ? builtinPole(v.pole === POST_ONLY ? 'post' : 'gantry', bed.rails, bed.bed) : loadPole(v.pole);
            const poles = yield* standPoles(road, pole, v, paint);
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
