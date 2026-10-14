/*
 * Track layout (배선): tracks that remember themselves, so more can be joined
 * on later.
 *
 * Every track laid with the layout tool is kept in the world (its centre line
 * every block and its two ends). An end that leads nowhere gets a buffer stop
 * (차막이) of real blocks; tapping it (or anywhere on a track) with the tool
 * finds that end or that spot again, so a later track can carry on from the
 * end, run into it, or branch off / join the side of a track through a
 * turnout. Turnouts get their furniture: a switch machine beside the points
 * and guard rails at the frog.
 *
 * Geometry works on centre-line samples {x, y, z, tx, tz, nx, nz, s} (a third
 * of a block apart; n = right of travel), laid with rail.js sweep through a
 * paint map that never lets a sleeper or slab cover a rail already laid.
 */
import { world } from '@minecraft/server';
import { parseBlock, perm } from '../core/blocks.js';
import { matrix, turnStates } from '../core/turn.js';
import { curve } from './curve_common.js';
import { roadFrom } from '../tools/lanes.js';
import { ang, builtinTile, sweep } from './rail.js';

export const SUB = 3;
const KEY = 'arc:yard', TRACK = (id) => `arc:yard:${id}`;

// ------------------------------------------------------------ registry
let cache = null;
function index() {
    try {
        const raw = world.getDynamicProperty(KEY);
        return typeof raw === 'string' ? JSON.parse(raw) : [];
    }
    catch (e) {
        return [];
    }
}
/** All recorded tracks: {id, name, pts: [[x, y, z]...] a block apart, ends: [{at, dir, open}] }. */
export function tracks() {
    if (cache)
        return cache;
    cache = [];
    for (const id of index())
        try {
            const raw = world.getDynamicProperty(TRACK(id));
            if (typeof raw === 'string')
                cache.push(JSON.parse(raw));
        }
        catch (e) { }
    return cache;
}
export const trackById = (id) => tracks().find(t => t.id === id);
export function saveTrack(t) {
    const json = JSON.stringify(t);
    if (json.length > 32000)
        throw new Error('선로 하나가 너무 깁니다 (약 1300칸까지). 나눠서 까세요');
    world.setDynamicProperty(TRACK(t.id), json);
    const ids = index();
    if (!ids.includes(t.id)) {
        ids.push(t.id);
        world.setDynamicProperty(KEY, JSON.stringify(ids));
    }
    cache = null;
}
export function deleteTrack(id) {
    world.setDynamicProperty(TRACK(id), undefined);
    world.setDynamicProperty(KEY, JSON.stringify(index().filter(x => x !== id)));
    cache = null;
}
export function newId() {
    const ids = index();
    let n = ids.length + 1;
    while (ids.includes('t' + n))
        n++;
    return 't' + n;
}

// ------------------------------------------------------------ samples
const r1 = (v) => Math.round(v * 10) / 10;
/** Samples with tangents, normals and distance from a list of points. */
export function withFrames(P) {
    const S = [];
    let s = 0;
    for (let i = 0; i < P.length; i++) {
        const p = P[i], a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        let tx = b.x - a.x, tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        if (i)
            s += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z);
        S.push({ x: p.x, y: p.y, z: p.z, tx, tz, nx: -tz, nz: tx, s });
    }
    return S;
}
/** A recorded track's samples (its points are a block apart; refined to thirds). */
export function trackSamples(t) {
    const P = [];
    for (let i = 0; i < t.pts.length; i++) {
        const [x, y, z] = t.pts[i];
        P.push({ x, y, z });
        if (i + 1 < t.pts.length) {
            const [x2, y2, z2] = t.pts[i + 1];
            for (let k = 1; k < SUB; k++)
                P.push({ x: x + (x2 - x) * k / SUB, y: y + (y2 - y) * k / SUB, z: z + (z2 - z) * k / SUB });
        }
    }
    return withFrames(P);
}
/** The centre line through control points (block centres), a third of a block apart. */
export function sampleCurve(ctrl) {
    const { path } = curve(ctrl);
    const steps = Math.max(2, Math.ceil(path.length * SUB));
    const P = [];
    for (let i = 0; i <= steps; i++)
        P.push(path.frac(i / steps));
    return withFrames(P);
}
/** Keep every SUB-th sample: the centre line a block apart, for the record. */
export const thinPts = (S) => S.filter((_, i) => i % SUB === 0 || i === S.length - 1).map(p => [r1(p.x), r1(p.y), r1(p.z)]);
/** Sample at distance s (nearest). */
export function at(S, s) {
    let lo = 0, hi = S.length - 1;
    while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (S[m].s < s)
            lo = m + 1;
        else
            hi = m;
    }
    return S[lo];
}
export const reversed = (S) => withFrames([...S].reverse());
/** Nearest sample to a point (2D) and its distance. */
export function nearest(S, p) {
    let best = null, bd = Infinity;
    for (const q of S) {
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bd) {
            bd = d;
            best = q;
        }
    }
    return { sample: best, d: bd };
}

// ------------------------------------------------------------ finding things
/**
 * What a tap at block `pos` points at: an end of a track (within 3 blocks of
 * it or its buffer stop), else a track's body (within 3 blocks of its centre
 * line), else nothing.
 */
export function hitTest(pos) {
    const c = { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 };
    let best = null;
    for (const t of tracks())
        t.ends.forEach((e, i) => {
            const d = Math.hypot(e.at[0] - c.x, e.at[2] - c.z);
            if (d <= 3.5 && Math.abs(e.at[1] - c.y) <= 4 && (!best || d < best.d))
                best = { type: 'end', track: t, end: i, d };
        });
    if (best)
        return best;
    for (const t of tracks()) {
        const S = trackSamples(t);
        const { sample, d } = nearest(S, c);
        if (sample && d <= 3 && Math.abs(sample.y - c.y) <= 4 && (!best || d < best.d))
            best = { type: 'track', track: t, s: sample.s, d };
    }
    return best;
}

// ------------------------------------------------------------ turnouts
/**
 * The diverging lead of a turnout: from sample s0 of S, travelling `dir`
 * (+1 with the track, -1 against it), bending to `side` (+1 right of that
 * travel, -1 left) on a circular lead of radius 2·N²: 2N blocks long, it
 * ends heading 1:N away, a block aside.
 * Returns travel samples starting exactly on the parent's centre line.
 */
export function lead(S, s0, dir, side, N) {
    const R = 2 * N * N, Lt = R / N;
    const P = [];
    for (let x = 0; x <= Lt + 1e-9; x += 1 / SUB) {
        const b = at(S, s0 + dir * x);
        const off = side * x * x / (2 * R);
        // right of travel = dir · (right of the track)
        P.push({ x: b.x + dir * b.nx * off, y: b.y, z: b.z + dir * b.nz * off });
    }
    return withFrames(P);
}

// ------------------------------------------------------------ building
const RAIL = /anvil$/;
/** A paint map where a laid rail is never covered by a later track's sleepers or slabs. */
export class TrackPaint extends Map {
    /** edit: the edit session, so rails already in the world are kept too. */
    constructor(edit = null) {
        super();
        this.edit = edit;
    }
    set(k, v) {
        let old = super.get(k);
        if (old === undefined && this.edit && !super.has(k)) {
            const [x, y, z] = k.split(',').map(Number);
            try {
                old = this.edit.get({ x, y, z });
            }
            catch (e) { }
        }
        if (old && RAIL.test(old.type.id) && !(v && RAIL.test(v.type.id)))
            return this;
        return super.set(k, v);
    }
}

const railFacing = (railSouth, tx, tz) => {
    const d = ((Math.round((ang(tx, tz) - 180) / 90) * 90) % 360 + 360) % 360;
    return d ? turnStates(railSouth, matrix(d, 0, 0)) : railSouth;
};

/** Lay one centre line as a single track. */
export function* layPath(ctx, S, tile, paint) {
    const road = yield* roadFrom(S, tile.w, S[S.length - 1].s);
    yield* sweep(ctx, { clearAir: true }, tile, paint, road);
}

/** Buffer stop cells just past an end (at = end centre, dir = outward). */
export function bufferStop(end) {
    const [x, y, z] = end.at, [dx, dz] = end.dir;
    const nx = -dz, nz = dx, out = [];
    const bx = x + dx * 1.2, bz = z + dz * 1.2, by = Math.floor(y);
    for (let u = -2; u <= 2; u++) {
        const px = Math.floor(bx + nx * u), pz = Math.floor(bz + nz * u);
        out.push([px, by, pz, 'gravel']);
        out.push([px, by + 1, pz, Math.abs(u) === 2 ? 'polished_blackstone' : 'red_concrete']);
        out.push([px, by + 2, pz, Math.abs(u) === 2 ? 'polished_blackstone_slab' : 'white_concrete_slab']);
    }
    return out;
}

/**
 * Furniture of a turnout where `child` leaves `parent` (both as travel
 * samples from the junction): a switch machine beside the points on the far
 * side, guard rails inside the far rails where the rails cross (the frog,
 * where the centre lines are a rail spacing apart).
 */
export function turnoutFurniture(parent, child, railSouth, paint) {
    if (child.length < 4 || parent.length < 4)
        return null;
    // which side the child goes
    const probe = child[Math.min(child.length - 1, 30 * SUB)];
    const pp = nearest(parent.slice(0, 60 * SUB), probe).sample;
    const side = Math.sign((probe.x - pp.x) * pp.nx + (probe.z - pp.z) * pp.nz) || 1;
    // switch machine beside the points, on the other side
    const p0 = at(parent, 2);
    const mx = Math.floor(p0.x - side * p0.nx * 3.5), mz = Math.floor(p0.z - side * p0.nz * 3.5), my = Math.floor(p0.y);
    paint.set(`${mx},${my + 1},${mz}`, perm('minecraft:polished_blackstone_bricks'));
    paint.set(`${mx},${my + 2},${mz}`, perm('minecraft:iron_trapdoor', { direction: 0, open_bit: false, upside_down_bit: false }));
    // the frog: first child sample 3 blocks from the parent's centre line
    let frog = null;
    for (let i = 0; i < Math.min(child.length, 120 * SUB); i++) {
        const q = child[i];
        const n = nearest(parent.slice(0, 160 * SUB), q);
        if (n.d >= 3) {
            frog = { q, p: n.sample, i };
            break;
        }
    }
    if (!frog)
        return { side };
    const guard = (S, s, off) => {
        for (let k = -3; k <= 3; k++) {
            const b = at(S, s + k);
            const x = Math.floor(b.x + b.nx * off), z = Math.floor(b.z + b.nz * off), y = Math.floor(b.y) + 1;
            paint.set(`${x},${y},${z}`, railFacing(railSouth, b.tx, b.tz));
        }
    };
    guard(parent, frog.p.s, -side * 0.5);
    guard(child, frog.q.s, side * 0.5);
    return { side, frog: frog.q };
}

/**
 * Plan a drawn track: from a start (a track end, a spot on a track = branch,
 * or a plain point) through the tapped points to a finish (likewise).
 * start/finish: {type: 'end', track, end} | {type: 'track', track, s} | {type: 'point', pos}.
 * Returns {S, branchFrom, joinTo, startEnd, finishEnd}.
 */
export function planDrawn(start, points, finish, N = 8) {
    const centre = (p) => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });
    const mids = points.map(centre);
    const ctrl = [];
    let headS = null, tailS = null, branchFrom = null, joinTo = null;
    const firstTarget = mids[0] ?? (finish && anchorOf(finish));
    // the start
    if (start.type === 'end') {
        const e = start.track.ends[start.end];
        const E = { x: e.at[0], y: e.at[1], z: e.at[2] };
        ctrl.push(E, { x: E.x + e.dir[0] * 4, y: E.y, z: E.z + e.dir[1] * 4 });
    }
    else if (start.type === 'track') {
        const S = trackSamples(start.track);
        const b = at(S, start.s);
        const to = firstTarget ?? { x: b.x + b.tx * 10, z: b.z + b.tz * 10 };
        const dir = (to.x - b.x) * b.tx + (to.z - b.z) * b.tz >= 0 ? 1 : -1;
        const side = Math.sign(dir * ((to.x - b.x) * b.nx + (to.z - b.z) * b.nz)) || 1;
        headS = lead(S, start.s, dir, side, N);
        const L = headS[headS.length - 1];
        ctrl.push({ x: L.x, y: L.y, z: L.z }, { x: L.x + L.tx * 4, y: L.y, z: L.z + L.tz * 4 });
        branchFrom = { track: start.track, s: start.s, dir };
    }
    else
        ctrl.push(centre(start.pos));
    // points behind (or too near) the end of a turnout lead would loop the line back
    if (headS) {
        const L = headS[headS.length - 1];
        while (mids.length && ((mids[0].x - L.x) * L.tx + (mids[0].z - L.z) * L.tz < 4))
            mids.shift();
    }
    ctrl.push(...mids);
    // the finish
    if (finish?.type === 'end') {
        const e = finish.track.ends[finish.end];
        const E = { x: e.at[0], y: e.at[1], z: e.at[2] };
        ctrl.push({ x: E.x + e.dir[0] * 4, y: E.y, z: E.z + e.dir[1] * 4 }, E);
    }
    else if (finish?.type === 'track') {
        const S = trackSamples(finish.track);
        const b = at(S, finish.s);
        const from = ctrl[ctrl.length - 1];
        const dir = (from.x - b.x) * b.tx + (from.z - b.z) * b.tz >= 0 ? 1 : -1;
        const side = Math.sign(dir * ((from.x - b.x) * b.nx + (from.z - b.z) * b.nz)) || 1;
        const m = lead(S, finish.s, dir, side, N);
        const L = m[m.length - 1];
        tailS = reversed(m);
        ctrl.push({ x: L.x + L.tx * 4, y: L.y, z: L.z + L.tz * 4 }, { x: L.x, y: L.y, z: L.z });
        joinTo = { track: finish.track, s: finish.s, dir };
    }
    else if (finish?.type === 'point')
        ctrl.push(centre(finish.pos));
    if (ctrl.length < 2)
        throw new Error('점이 더 필요합니다 (시작과 끝, 또는 점 2개 이상)');
    for (let i = ctrl.length - 1; i > 0; i--)
        if (Math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].z - ctrl[i - 1].z) < 0.5)
            ctrl.splice(i, 1);
    const mid = ctrl.length >= 2 ? sampleCurve(ctrl) : [];
    const P = [...(headS ?? []), ...mid.slice(headS ? 1 : 0), ...(tailS ? tailS.slice(1) : [])];
    return { S: withFrames(P), branchFrom, joinTo };
}
function anchorOf(x) {
    if (x.type === 'end') {
        const a = x.track.ends[x.end].at;
        return { x: a[0], y: a[1], z: a[2] };
    }
    if (x.type === 'track')
        return at(trackSamples(x.track), x.s);
    return { x: x.pos.x + 0.5, y: x.pos.y, z: x.pos.z + 0.5 };
}

/**
 * Plan a yard automatically along a main line: `n` tracks beside it at
 * `gap`, each leaving the previous one through a turnout and an S-curve (the
 * throat, 1:N), running parallel, and (with `both`) rejoining at the far end;
 * otherwise ending at buffer stops. Returns [{S, parent, from, to}] with the
 * main line first.
 */
export function planYard(main, { n = 6, gap = 6, N = 6, side = -1, both = true, startAt = 10 } = {}) {
    const total = main[main.length - 1].s;
    const T = Math.max(8, Math.round(N * gap * 1.2));
    const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const offs = [() => 0];
    const out = [{ S: main, name: '본선' }];
    for (let i = 1; i <= n; i++) {
        const a = startAt + (i - 1) * T, b = both ? total - startAt - (i - 1) * T : total;
        if (b - a < 2 * T + 4)
            break;
        const prev = offs[i - 1];
        const off = (s) => prev(s) + side * gap * smooth((s - a) / T) * (both ? smooth((b - s) / T) : 1);
        offs.push(off);
        const P = [];
        for (const p of main)
            if (p.s >= a - 1e-6 && p.s <= b + 1e-6) {
                const o = off(p.s);
                P.push({ x: p.x + p.nx * o, y: p.y, z: p.z + p.nz * o });
            }
        out.push({ S: withFrames(P), name: `${i}번선`, parent: i - 1, a, b, both });
    }
    return out;
}

/** Turnout and furniture for a yard track against its parent, at its start (and end). */
export function yardFurniture(plan, i, railSouth, paint) {
    const t = plan[i], par = plan[t.parent].S;
    const sliceFrom = (S, s) => S.filter(p => p.s >= s - 1e-6).map((p, k, arr) => p);
    const parentFrom = withFrames(sliceFrom(par, t.a));
    turnoutFurniture(parentFrom, t.S, railSouth, paint);
    if (t.both) {
        const parentBack = reversed(par.filter(p => p.s <= t.b + 1e-6));
        turnoutFurniture(parentBack, reversed(t.S), railSouth, paint);
    }
}

/** The ends of a centre line: start and finish, outward directions. */
export function endsOf(S) {
    const a = S[0], b = S[S.length - 1];
    return [
        { at: [r1(a.x), r1(a.y), r1(a.z)], dir: [r1(-a.tx), r1(-a.tz)], open: true },
        { at: [r1(b.x), r1(b.y), r1(b.z)], dir: [r1(b.tx), r1(b.tz)], open: true },
    ];
}

/** The single track used by the layout tool, with its rail block facing south (for guard rails). */
export function yardTile(opts = {}) {
    const tile = builtinTile({ tracks: 1, ...opts });
    let railSouth = parseBlock(opts.rail || 'anvil');
    try {
        if ('minecraft:cardinal_direction' in railSouth.getAllStates())
            railSouth = railSouth.withState('minecraft:cardinal_direction', 'south');
    }
    catch (e) { }
    return { tile, railSouth };
}

// ------------------------------------------------------------ whole jobs
function writePaint(ctx, paint) {
    const air = perm('minecraft:air');
    for (const [key, p] of paint) {
        const [x, y, z] = key.split(',').map(Number);
        ctx.edit.set({ x, y, z }, p ?? air);
    }
}
function stops(paint, ends) {
    for (const e of ends)
        if (e.open)
            for (const [x, y, z, t] of bufferStop(e))
                paint.set(`${x},${y},${z}`, parseBlock(t));
}
function clearStop(paint, end) {
    for (const [x, y, z, t] of bufferStop(end))
        if (t !== 'gravel')
            paint.set(`${x},${y},${z}`, null);
}

/**
 * Lay a drawn track (see planDrawn) and record it. Ends it starts or finishes
 * on are closed (their buffer stops go); its own loose ends get stops.
 */
export function* buildDrawn(ctx, start, points, finish, opts = {}) {
    const N = opts.N ?? 8;
    const plan = planDrawn(start, points, finish, N);
    if (plan.S.length < 4)
        throw new Error('선로가 너무 짧습니다');
    const { tile, railSouth } = yardTile(opts);
    const paint = new TrackPaint(ctx.edit);
    const touched = new Map(); // track id -> track (ends closed)
    for (const x of [start, finish])
        if (x?.type === 'end') {
            const t = touched.get(x.track.id) ?? JSON.parse(JSON.stringify(x.track));
            clearStop(paint, t.ends[x.end]);
            t.ends[x.end].open = false;
            touched.set(t.id, t);
        }
    yield* layPath(ctx, plan.S, tile, paint);
    if (plan.branchFrom) {
        const S = trackSamples(plan.branchFrom.track);
        const par = plan.branchFrom.dir > 0 ? S.filter(p => p.s >= plan.branchFrom.s - 1e-6) : reversed(S.filter(p => p.s <= plan.branchFrom.s + 1e-6));
        turnoutFurniture(withFrames(par), plan.S, railSouth, paint);
    }
    if (plan.joinTo) {
        const S = trackSamples(plan.joinTo.track);
        const par = plan.joinTo.dir > 0 ? S.filter(p => p.s >= plan.joinTo.s - 1e-6) : reversed(S.filter(p => p.s <= plan.joinTo.s + 1e-6));
        turnoutFurniture(withFrames(par), reversed(plan.S), railSouth, paint);
    }
    const ends = endsOf(plan.S);
    if (start.type !== 'point')
        ends[0].open = false;
    if (finish && finish.type !== 'point')
        ends[1].open = false;
    stops(paint, ends);
    writePaint(ctx, paint);
    const track = { id: newId(), name: opts.name || '', pts: thinPts(plan.S), ends };
    return { track, touched: [...touched.values()], length: Math.round(plan.S[plan.S.length - 1].s), turnouts: (plan.branchFrom ? 1 : 0) + (plan.joinTo ? 1 : 0) };
}

/** Lay an automatic yard along a main line through `points` and record every track. */
export function* buildAuto(ctx, points, opts = {}) {
    const ctrl = points.map(p => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 }));
    if (ctrl.length < 2)
        throw new Error('본선이 될 점을 2개 이상 찍으세요');
    const main = sampleCurve(ctrl);
    const plan = planYard(main, opts);
    if (plan.length < 2)
        throw new Error('본선이 짧아 선로군이 들어가지 않습니다 (목 길이 × 2 + 여유가 필요합니다). 점을 더 멀리 찍거나 선로 간격·번수를 줄이세요');
    const { tile, railSouth } = yardTile(opts);
    const paint = new TrackPaint(ctx.edit);
    for (const p of plan)
        yield* layPath(ctx, p.S, tile, paint);
    for (let i = 1; i < plan.length; i++)
        yardFurniture(plan, i, railSouth, paint);
    const made = [];
    const base = opts.name || '조차장';
    let id = newId();
    plan.forEach((p, i) => {
        const ends = endsOf(p.S);
        if (i > 0) {
            ends[0].open = false; // the throat
            if (p.both)
                ends[1].open = false;
        }
        stops(paint, ends);
        made.push({ id: i === 0 ? id : `${id}_${i}`, name: `${base} ${p.name}`, pts: thinPts(p.S), ends });
    });
    writePaint(ctx, paint);
    return { made, count: plan.length - 1, length: Math.round(main[main.length - 1].s) };
}
