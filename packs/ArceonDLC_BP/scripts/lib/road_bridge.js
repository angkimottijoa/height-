/*
 * Bridges under a road (차선 도로): two of the railway's concrete designs, a
 * PSC I-girder beam bridge and a segmental box girder, sized to the road
 * (the deck reaches two blocks past the road for the barrier walls), with
 * piers down to the ground every span, closed ends and light blocks. The
 * road surface is laid on the deck afterwards.
 */
import { bridgeById, bridgeTile, endPiece, geometry, pierPiece, polish } from './bridges.js';
import { stamp, sweep } from './rail.js';
import { roadFrom } from '../tools/lanes.js';
import { ensureLoaded } from '../core/loader.js';
import { loadAll } from '../core/edit.js';

export const ROAD_BRIDGES = [
    { value: 'psci', label: 'PSC 빔교 (I형 거더, 돌·거친 안산암)' },
    { value: 'segment', label: '콘크리트 박스교 (세그먼트 박스 거더)' },
];

/** Build the bridge for a laid-out road `road` W columns wide. Returns a description. */
export function* roadBridge(ctx, v, road, W) {
    const d = bridgeById(v.bridge);
    if (!d || !ROAD_BRIDGES.some(b => b.value === v.bridge))
        throw new Error('없는 교량 종류: ' + v.bridge);
    const lo = road.uOf(0) - 0.5, hi = road.uOf(W - 1) + 0.5;
    const rails = [];
    for (let u = Math.ceil(lo) + 2; u <= hi - 2; u += 4)
        rails.push(u);
    const g = geometry(d, { rails: rails.length ? rails : [0], bed: [lo, hi] }, { tight: true });
    const bt = bridgeTile(d, g);
    const S = road.samples, total = road.total;
    const deck = yield* roadFrom(S, bt.w, total);
    const bp = new Map();
    yield* sweep(ctx, { clearAir: false, down: false }, bt, bp, deck);
    // piers every span (a short last span is stretched), one at each end
    const span = Math.floor(v.span) || d.span;
    const spots = [];
    for (let s = 0; s <= total + 1e-6; s += span)
        spots.push(s);
    const rest = total - spots[spots.length - 1];
    if (rest > 1) {
        if (rest < span / 2 && spots.length > 1)
            spots[spots.length - 1] = total;
        else
            spots.push(total);
    }
    const at = (s) => S.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b);
    const pierAt = spots.map(at);
    const edit = ctx.edit, far = loadAll(ctx.player), turned = new Map();
    let piers = 0;
    for (const p of pierAt) {
        const y = Math.floor(p.y);
        const release = far ? yield ensureLoaded(ctx.dim, { x: Math.floor(p.x) - 2, y, z: Math.floor(p.z) - 2 }, { x: Math.floor(p.x) + 2, y, z: Math.floor(p.z) + 2 }) : null;
        const ground = edit.highest(Math.floor(p.x), Math.floor(p.z), Math.max(edit.minY, y - 96), y + d.dyMin - 1);
        const gdy = Math.max(ground - y, d.dyMin - 96);
        release?.();
        if (gdy >= d.dyMin - 1)
            continue; // the deck is on the ground here
        const end = p === pierAt[0] || p === pierAt[pierAt.length - 1];
        stamp(p, pierPiece(d, g, gdy, bt, piers + 1, end), '', bp, turned);
        if (++piers % 2 === 0)
            yield;
    }
    const cap = endPiece(d, g, bt);
    for (const p of [pierAt[0], pierAt[pierAt.length - 1]])
        stamp(p, cap, '', bp, turned);
    yield* polish(bp);
    let n = 0;
    for (const [k, perm] of bp) {
        if (!perm)
            continue;
        const [x, y, z] = k.split(',').map(Number);
        edit.set({ x, y, z }, perm);
        if (++n % 3000 === 0)
            yield;
    }
    return `${d.name.split(' (')[0]} (교각 ${piers}개, 경간 ${span}칸)`;
}
