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
        throw new Error('선로 하나가 너무 깁니다 (약 1200칸까지). 나눠서 까세요');
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
const r2 = (v) => Math.round(v * 100) / 100;
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
/**
 * A smooth centre line through control points (block centres) with the
 * tangent at either end given (a unit [x, z], or null to leave it free):
 * cubic Hermite segments with Catmull-Rom tangents inside, so the line leaves
 * a track end exactly along it and bends gently away (no kink, no overlap),
 * resampled a third of a block apart.
 */
export function sampleSmooth(ctrl, t0 = null, t1 = null) {
    const P = ctrl, n = P.length;
    const seg = (i) => Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z) || 1;
    const M = P.map((p, i) => {
        if (i === 0)
            return t0 ? { x: t0[0] * seg(0), z: t0[1] * seg(0) } : { x: P[1].x - p.x, z: P[1].z - p.z };
        if (i === n - 1)
            return t1 ? { x: t1[0] * seg(n - 2), z: t1[1] * seg(n - 2) } : { x: p.x - P[i - 1].x, z: p.z - P[i - 1].z };
        // Catmull-Rom, scaled to the shorter neighbouring segment (no overshoot on uneven spacing)
        const a = P[i - 1], b = P[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, k = Math.min(seg(i - 1), seg(i));
        return { x: (b.x - a.x) / l * k, z: (b.z - a.z) / l * k };
    });
    const dense = [];
    for (let i = 0; i + 1 < n; i++) {
        const a = P[i], b = P[i + 1], ma = M[i], mb = M[i + 1];
        const steps = Math.max(8, Math.ceil(seg(i) * 12));
        for (let k = i ? 1 : 0; k <= steps; k++) {
            const t = k / steps, t2 = t * t, t3 = t2 * t;
            const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
            dense.push({ x: h00 * a.x + h10 * ma.x + h01 * b.x + h11 * mb.x, y: a.y + (b.y - a.y) * (3 * t2 - 2 * t3), z: h00 * a.z + h10 * ma.z + h01 * b.z + h11 * mb.z });
        }
    }
    // even spacing along the line
    const out = [dense[0]];
    let acc = 0;
    for (let i = 1; i < dense.length; i++) {
        const p = dense[i - 1], q = dense[i], l = Math.hypot(q.x - p.x, q.z - p.z);
        let from = 0;
        while (acc + l - from >= 1 / SUB - 1e-9) {
            from += 1 / SUB - acc;
            acc = 0;
            const t = from / l;
            out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
        }
        acc += l - from;
    }
    const last = dense[dense.length - 1], o = out[out.length - 1];
    if (Math.hypot(last.x - o.x, last.z - o.z) > 0.05)
        out.push(last);
    return withFrames(out);
}
/** The centre line a block apart (by distance along it), for the record. */
export function thinPts(S) {
    const out = [], end = S[S.length - 1].s;
    let i = 0;
    for (let s = 0; s < end - 0.5; s++) {
        while (i + 1 < S.length && S[i + 1].s < s)
            i++;
        const a = S[i], b = S[Math.min(S.length - 1, i + 1)], t = b.s > a.s ? Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))) : 0;
        out.push([r2(a.x + (b.x - a.x) * t), r2(a.y + (b.y - a.y) * t), r2(a.z + (b.z - a.z) * t)]);
    }
    const z = S[S.length - 1];
    out.push([r2(z.x), r2(z.y), r2(z.z)]);
    return out;
}
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
/** The point at distance s, interpolated between samples (with its frame). */
export function along(S, s) {
    const b = at(S, s);
    const i = S.indexOf(b), a = S[Math.max(0, i - 1)];
    if (a === b || b.s <= a.s || s >= b.s)
        return b;
    const t = Math.max(0, (s - a.s) / (b.s - a.s)), l = (u, v) => u + (v - u) * t;
    return { x: l(a.x, b.x), y: l(a.y, b.y), z: l(a.z, b.z), tx: l(a.tx, b.tx), tz: l(a.tz, b.tz), nx: l(a.nx, b.nx), nz: l(a.nz, b.nz), s };
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
 * it or its end block), else a track's body (within its bed), with the lane
 * (which of its tracks) nearest the tap; else nothing. `extra` adds planned
 * lines that are not laid yet (same shape as recorded tracks).
 */
export function hitTest(pos, extra = []) {
    const c = { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 };
    const all = [...extra, ...tracks()];
    let best = null;
    for (const t of all)
        t.ends.forEach((e, i) => {
            const d = Math.min(Math.hypot(e.at[0] - c.x, e.at[2] - c.z), Math.hypot(e.at[0] + e.dir[0] * 1.2 - c.x, e.at[2] + e.dir[1] * 1.2 - c.z));
            if (d <= 3 && Math.abs(e.at[1] - c.y) <= 4 && (!best || d < best.d))
                best = { type: 'end', track: t, end: i, d, lane: laneNear(t, endOffset(e, i, c)) };
        });
    if (best)
        return best;
    for (const t of all) {
        const S = trackSamples(t);
        const { sample, d } = nearest(S, c);
        if (!sample || d > (t.w ?? 8) / 2 + 0.5 || Math.abs(sample.y - c.y) > 4 || (best && d >= best.d))
            continue;
        const off = (c.x - sample.x) * sample.nx + (c.z - sample.z) * sample.nz;
        best = { type: 'track', track: t, s: sample.s, lane: laneNear(t, off), d };
    }
    return best;
}

/** Which lane of a track is nearest a sideways offset. */
function laneNear(t, off) {
    const centres = t.centres ?? [0];
    let lane = 0;
    centres.forEach((u, i) => {
        if (Math.abs(u - off) < Math.abs(centres[lane] - off))
            lane = i;
    });
    return lane;
}
/** The right of travel at an end (travel runs from end 0 to end 1; dir points out). */
const endNormal = (e, i) => i === 1 ? [-e.dir[1], e.dir[0]] : [e.dir[1], -e.dir[0]];
const endOffset = (e, i, c) => {
    const [nx, nz] = endNormal(e, i);
    return (c.x - e.at[0]) * nx + (c.z - e.at[2]) * nz;
};
/** Where a track end is, on one lane (a single track carrying on from a double one). */
function endAt(ref, single) {
    const e0 = ref.track.ends[ref.end];
    const e = { ...e0, dir: endDir(ref.track, ref.end) ?? e0.dir };
    const centres = ref.track.centres ?? [0];
    const off = single && centres.length > 1 ? centres[ref.lane ?? 0] ?? 0 : 0;
    const [nx, nz] = endNormal(e, ref.end);
    return { e, E: { x: e.at[0] + nx * off, y: e.at[1], z: e.at[2] + nz * off } };
}
/** The outward direction at a track end, from its last few blocks (exact, not the rounded record). */
function endDir(t, i) {
    const P = t.pts, n = P.length;
    if (n < 2)
        return null;
    // second-order one-sided difference: the tangent right at the end, also on a curve
    const q = i === 1 ? [P[n - 1], P[n - 2], P[Math.max(0, n - 3)]] : [P[0], P[1], P[Math.min(n - 1, 2)]];
    // (the points need not be evenly spaced: the last one is the exact tip)
    const h1 = Math.hypot(q[0][0] - q[1][0], q[0][2] - q[1][2]) || 1, h2 = Math.hypot(q[1][0] - q[2][0], q[1][2] - q[2][2]);
    const f = (k) => n >= 3 && h2 > 0.1
        ? (q[0][k] - q[1][k]) * (2 * h1 + h2) / (h1 * (h1 + h2)) - (q[1][k] - q[2][k]) * h1 / (h2 * (h1 + h2))
        : q[0][k] - q[1][k];
    const dx = f(0), dz = f(2), l = Math.hypot(dx, dz);
    return l ? [dx / l, dz / l] : null;
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
        const b = along(S, s0 + dir * x);
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

/** The end marker: one block on the track's centre just past a loose end (tap it to carry on). */
export const END_BLOCK = 'red_concrete';
export function bufferStop(end) {
    const [x, y, z] = end.at, [dx, dz] = end.dir;
    return [[Math.floor(x + dx * 1.2), Math.floor(y) + 1, Math.floor(z + dz * 1.2), END_BLOCK]];
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
        for (let k = -2; k <= 2; k++) {
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
 * A track end is carried on exactly along the track (same direction, no
 * kink), a branch leaves through a turnout lead; the line in between is a
 * smooth curve that starts and ends tangent to them. Tapped points behind
 * such a start (or past such a finish) would fold the line back over the
 * track, so they are left out.
 * Returns {S, branchFrom, joinTo}.
 */
export function planDrawn(start, points, finish, N = 8, single = false) {
    const centre = (p) => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });
    let mids = points.map(centre);
    let headS = null, tailS = null, branchFrom = null, joinTo = null;
    let A, tA = null, B = null, tB = null;
    const firstTarget = () => mids[0] ?? (finish && anchorOf(finish, single));
    // the start
    if (start.type === 'end') {
        const { e, E } = endAt(start, single);
        A = E;
        tA = e.dir;
    }
    else if (start.type === 'track') {
        const S = laneOf(start);
        const b = at(S, start.s);
        const to = firstTarget() ?? { x: b.x + b.tx * 10, z: b.z + b.tz * 10 };
        const dir = (to.x - b.x) * b.tx + (to.z - b.z) * b.tz >= 0 ? 1 : -1;
        const side = Math.sign(dir * ((to.x - b.x) * b.nx + (to.z - b.z) * b.nz)) || 1;
        headS = lead(S, start.s, dir, side, N);
        const L = headS[headS.length - 1];
        A = { x: L.x, y: L.y, z: L.z };
        tA = [L.tx, L.tz];
        branchFrom = { track: start.track, s: start.s, dir, lane: start.lane ?? 0 };
    }
    else
        A = centre(start.pos);
    // the finish
    if (finish?.type === 'end') {
        const { e, E } = endAt(finish, single);
        B = E;
        tB = [-e.dir[0], -e.dir[1]]; // arriving into the end
    }
    else if (finish?.type === 'track') {
        const S = laneOf(finish);
        const b = at(S, finish.s);
        const from = mids[mids.length - 1] ?? A;
        const dir = (from.x - b.x) * b.tx + (from.z - b.z) * b.tz >= 0 ? 1 : -1;
        const side = Math.sign(dir * ((from.x - b.x) * b.nx + (from.z - b.z) * b.nz)) || 1;
        const m = lead(S, finish.s, dir, side, N);
        const L = m[m.length - 1];
        tailS = reversed(m);
        B = { x: L.x, y: L.y, z: L.z };
        tB = [-L.tx, -L.tz];
        joinTo = { track: finish.track, s: finish.s, dir, lane: finish.lane ?? 0 };
    }
    else if (finish?.type === 'point')
        B = centre(finish.pos);
    // points behind a tangent start / past a tangent finish fold the line back: leave them out
    const ahead = (p, o, t) => (p.x - o.x) * t[0] + (p.z - o.z) * t[1];
    if (tA)
        mids = mids.filter(p => ahead(p, A, tA) >= 3);
    if (tB && B)
        mids = mids.filter(p => ahead(p, B, tB) <= -3);
    const ctrl = [A, ...mids];
    if (B)
        ctrl.push(B);
    for (let i = ctrl.length - 1; i > 0; i--)
        if (Math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].z - ctrl[i - 1].z) < 1.5 && i !== ctrl.length - 1 && i !== 0)
            ctrl.splice(i, 1);
    if (ctrl.length < 2 || Math.hypot(ctrl[ctrl.length - 1].x - A.x, ctrl[ctrl.length - 1].z - A.z) < 2)
        throw new Error('점이 더 필요합니다 (이어 깔 끝에서 앞쪽으로 갈 곳을 찍으세요)');
    const mid = sampleSmooth(ctrl, tA, tB);
    const P = [...(headS ?? []), ...mid.slice(headS ? 1 : 0), ...(tailS ? tailS.slice(1) : [])];
    return { S: withFrames(P), branchFrom, joinTo };
}
/** The centre line of the tapped lane of a track (a double track has two). */
function laneOf(ref) {
    const S = trackSamples(ref.track);
    const off = (ref.track.centres ?? [0])[ref.lane ?? 0] ?? 0;
    return off ? withFrames(S.map(p => ({ x: p.x + p.nx * off, y: p.y, z: p.z + p.nz * off }))) : S;
}
function anchorOf(x, single = true) {
    if (x.type === 'end')
        return endAt(x, single).E;
    if (x.type === 'track')
        return at(laneOf(x), x.s);
    return { x: x.pos.x + 0.5, y: x.pos.y, z: x.pos.z + 0.5 };
}

/** The ends of a centre line: start and finish, outward directions. */
export function endsOf(S) {
    const a = S[0], b = S[S.length - 1];
    return [
        { at: [r2(a.x), r2(a.y), r2(a.z)], dir: [r2(-a.tx), r2(-a.tz)], open: true },
        { at: [r2(b.x), r2(b.y), r2(b.z)], dir: [r2(b.tx), r2(b.tz)], open: true },
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

// ------------------------------------------------------------ from tapped points
/**
 * A centre line for points tapped with the wand: when the first point is on
 * a recorded track's end it carries on from it, on its side it branches off
 * through a turnout; the last point likewise finishes into an end or joins a
 * side. Returns null when neither end touches a recorded track.
 */
export function planFromPoints(points, N = 8, extra = [], single = false) {
    if (points.length < 2)
        return null;
    let pts = points.slice();
    let first = hitTest(pts[0], extra), last = hitTest(pts[pts.length - 1], extra);
    // a tap on a track and then on its end block: carry on from that end (the
    // first tap only says which track, and which lane of it)
    if (first?.type === 'track' && pts.length >= 2) {
        const h = hitTest(pts[1], extra);
        if (h?.type === 'end' && h.track.id === first.track.id) {
            first = { ...h, lane: first.lane };
            pts.shift();
            if (pts.length === 1)
                last = null;
        }
    }
    if (last?.type === 'track' && pts.length >= 3) {
        const h = hitTest(pts[pts.length - 2], extra);
        if (h?.type === 'end' && h.track.id === last.track.id) {
            last = { ...h, lane: last.lane };
            pts.pop();
        }
    }
    if (!first && !last)
        return null;
    if (pts.length < 2)
        throw new Error('이어 깔 끝 다음에 갈 곳을 찍으세요');
    const start = first ?? { type: 'point', pos: pts[0] };
    const finish = last ?? { type: 'point', pos: pts[pts.length - 1] };
    const plan = planDrawn(start, pts.slice(1, -1), finish, N, single);
    return { ...plan, start, finish };
}

/** Travel samples along `S` at sideways offset `off`, from s = a to s = b (either way). */
export function laneLine(S, off, a, b) {
    const dir = b >= a ? 1 : -1, P = [];
    for (let t = 0; t <= Math.abs(b - a) + 1e-9; t += 1 / SUB) {
        const p = along(S, a + dir * t);
        P.push({ x: p.x + p.nx * off, y: p.y, z: p.z + p.nz * off });
    }
    return withFrames(P);
}

/**
 * A crossover between two lanes (on one double track, or two tracks side by
 * side): it leaves lane A at the tapped spot, crosses over on a smooth
 * reverse curve (1:N at its steepest, tangent to both lanes at its ends) and
 * runs into lane B where B was tapped (or further on, if that would be too
 * steep). kind 'scissors' adds the
 * mirror crossover over the same length (an X with a diamond in the middle).
 * Returns {paths: [samples...], turnouts: [[parent, child]...]}.
 */
export function crossoverPlan(a, b, kind = 'single', N = 8) {
    const S = trackSamples(a.track);
    const uA = (a.track.centres ?? [0])[a.lane ?? 0];
    // lane B as an offset from A's centre line, where B was tapped
    const SB = trackSamples(b.track);
    const pb = at(SB, b.s);
    const uB0 = (b.track.centres ?? [0])[b.lane ?? 0];
    const pB = { x: pb.x + pb.nx * uB0, z: pb.z + pb.nz * uB0 };
    const onA = nearest(S, pB).sample;
    const uB = (pB.x - onA.x) * onA.nx + (pB.z - onA.z) * onA.nz;
    const delta = uB - uA;
    if (Math.abs(delta) < 2)
        throw new Error('두 선로가 너무 가깝습니다 (같은 선로가 아닌지 확인하세요)');
    const dir = onA.s >= a.s ? 1 : -1;
    // from tap A to tap B, but never steeper than the turnouts allow
    const L = Math.max(12, Math.abs(delta) * N, Math.abs(onA.s - a.s));
    const s0 = a.s, s1 = a.s + dir * L;
    if (s1 < 0 || s1 > S[S.length - 1].s)
        throw new Error(`건넘선이 선로 끝을 넘습니다 (약 ${Math.round(L)}칸 필요). 더 안쪽을 터치하거나 번수를 줄이세요`);
    const smooth = (t) => t * t * (3 - 2 * t);
    const cross = (from, to) => {
        const P = [];
        for (let t = 0; t <= L + 1e-9; t += 1 / SUB) {
            const p = along(S, s0 + dir * t);
            const o = from + (to - from) * smooth(t / L);
            P.push({ x: p.x + p.nx * o, y: p.y, z: p.z + p.nz * o });
        }
        return withFrames(P);
    };
    const reach = L + 30;
    const paths = [cross(uA, uB)];
    const turnouts = [
        [laneLine(S, uA, s0, s0 + dir * reach), paths[0]],
        [laneLine(S, uB, s1, s1 - dir * reach), reversed(paths[0])],
    ];
    if (kind === 'scissors') {
        const back = cross(uB, uA);
        paths.push(back);
        turnouts.push([laneLine(S, uB, s0, s0 + dir * reach), back], [laneLine(S, uA, s1, s1 - dir * reach), reversed(back)]);
    }
    return { paths, turnouts, length: Math.round(L) };
}

/** Lay crossovers (single tracks) with their turnouts' furniture. */
export function* buildCrossover(ctx, plan, opts = {}) {
    const { tile, railSouth } = yardTile(opts);
    const paint = new TrackPaint(ctx.edit);
    for (const S of plan.paths)
        yield* layPath(ctx, S, tile, paint);
    for (const [parent, child] of plan.turnouts)
        turnoutFurniture(parent, child, railSouth, paint);
    const air = perm('minecraft:air');
    for (const [key, p] of paint) {
        const [x, y, z] = key.split(',').map(Number);
        ctx.edit.set({ x, y, z }, p ?? air);
    }
}
