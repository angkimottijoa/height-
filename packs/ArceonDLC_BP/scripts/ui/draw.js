/*
 * Drawing with the pack's own particles (ArceonDLC_RP):
 *   arc:seg   a straight line segment of any length and direction (a thin strip
 *             turned to face the camera), coloured per call
 *   arc:face_x/y/z  a flat translucent square lying in the world's yz / xz / xy
 *             plane (fixed to the world, not turned to the camera)
 * so previews show solid lines, see-through faces and highlighted blocks
 * instead of dotted particles. Every call takes a colour [r, g, b, a].
 * Without the resource pack (or with `vanilla` on) it falls back to dots of
 * vanilla particles along the lines.
 */
import { MolangVariableMap } from '@minecraft/server';

export const COLORS = {
    line: [1, 1, 1, 1], point: [0.35, 0.95, 1, 1], guide: [1, 0.85, 0.2, 0.95], shape: [0.35, 1, 0.45, 1],
    saved: [1, 0.4, 0.9, 1], arc: [1, 0.55, 0.15, 1], tick: [1, 1, 1, 0.9], face: [1, 1, 1, 0.22], block: [1, 1, 1, 0.28],
};
const VANILLA = { line: 'minecraft:endrod', point: 'minecraft:villager_happy', guide: 'minecraft:basic_flame_particle', shape: 'minecraft:villager_happy', saved: 'minecraft:blue_flame_particle', arc: 'minecraft:basic_flame_particle', tick: 'minecraft:endrod', face: 'minecraft:endrod', block: 'minecraft:endrod' };

/** A painter for one player: seg, face, block, box; `budget` caps the particles per call of the preview. */
export function painter(player, { vanilla = false, budget = 1600 } = {}) {
    let left = budget, custom = !vanilla;
    const spawn = (id, p, vars) => {
        if (left-- <= 0)
            return false;
        try {
            player.spawnParticle(id, p, vars);
            return true;
        }
        catch (e) {
            return false;
        }
    };
    const vars = (rgba, set) => {
        const m = new MolangVariableMap();
        m.setFloat('variable.cr', rgba[0]);
        m.setFloat('variable.cg', rgba[1]);
        m.setFloat('variable.cb', rgba[2]);
        m.setFloat('variable.ca', rgba[3]);
        for (const [k, v] of Object.entries(set))
            m.setFloat('variable.' + k, v);
        return m;
    };
    const dots = (a, b, kind, step = 0.4) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(L / step));
        for (let i = 0; i <= n; i++)
            spawn(VANILLA[kind] ?? 'minecraft:endrod', { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n, z: a.z + (b.z - a.z) * i / n });
    };
    const P = {
        get left() {
            return left;
        },
        /** A line from a to b. */
        seg(a, b, kind = 'line', w = 0.035) {
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
            if (L < 1e-6)
                return;
            if (!custom)
                return dots(a, b, kind);
            if (L > 24) {
                // a long line in pieces, so a far-off middle doesn't hide all of it
                const n = Math.ceil(L / 24);
                for (let i = 0; i < n; i++)
                    P.seg({ x: a.x + dx * i / n, y: a.y + dy * i / n, z: a.z + dz * i / n }, { x: a.x + dx * (i + 1) / n, y: a.y + dy * (i + 1) / n, z: a.z + dz * (i + 1) / n }, kind, w);
                return;
            }
            const ok = spawn('arc:seg', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
                vars(COLORS[kind] ?? COLORS.line, { dx: dx / L, dy: dy / L, dz: dz / L, len: L, w }));
            if (!ok && left > 0) {
                custom = false; // no resource pack: dots from now on
                dots(a, b, kind);
            }
        },
        /** A face centred at c, normal along axis 'x' | 'y' | 'z', w × h (covered with squares). */
        face(c, axis, w, h, kind = 'face') {
            if (!custom || w < 1e-6 || h < 1e-6)
                return;
            // the face's two in-plane axes: w runs along the first, h along the second
            const [A, B] = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] }[axis];
            const sq = Math.min(w, h), na = Math.ceil(w / sq - 1e-6), nb = Math.ceil(h / sq - 1e-6);
            const col = COLORS[kind] ?? COLORS.face;
            for (let i = 0; i < na; i++)
                for (let j = 0; j < nb; j++) {
                    const p = { ...c };
                    p[A] += -w / 2 + sq / 2 + (na > 1 ? i * (w - sq) / (na - 1) : 0);
                    p[B] += -h / 2 + sq / 2 + (nb > 1 ? j * (h - sq) / (nb - 1) : 0);
                    spawn('arc:face_' + axis, p, vars(col, { s: sq }));
                }
        },
        /** A box from lo to hi (corners, floats): its 12 edges, and its faces see-through. */
        box(lo, hi, kind = 'line', faces = 'face') {
            const X = [lo.x, hi.x], Y = [lo.y, hi.y], Z = [lo.z, hi.z];
            for (const y of Y)
                for (const z of Z)
                    P.seg({ x: lo.x, y, z }, { x: hi.x, y, z }, kind);
            for (const x of X)
                for (const z of Z)
                    P.seg({ x, y: lo.y, z }, { x, y: hi.y, z }, kind);
            for (const x of X)
                for (const y of Y)
                    P.seg({ x, y, z: lo.z }, { x, y, z: hi.z }, kind);
            if (!faces)
                return;
            const w = hi.x - lo.x, h = hi.y - lo.y, d = hi.z - lo.z, m = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
            for (const x of X)
                P.face({ ...m, x }, 'x', d, h, faces);
            for (const z of Z)
                P.face({ ...m, z }, 'z', w, h, faces);
            for (const y of Y)
                P.face({ ...m, y }, 'y', w, d, faces);
        },
        /** One block highlighted: see-through faces, outlined edges. */
        block(x, y, z, kind = 'line') {
            P.box({ x, y, z }, { x: x + 1, y: y + 1, z: z + 1 }, kind, 'block');
        },
        /**
         * A set of blocks ("x,y,z" keys) highlighted as one solid: only the outer
         * faces, and only the edges where the surface bends (no lines between two
         * blocks side by side), long edges drawn as one line.
         */
        cells(keys, kind = 'line', faces = 'block') {
            const S = new Set(keys);
            const edges = new Map(); // "axis|x|y|z" (start corner) → normals of the faces on it
            const DIRS = [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', 1], ['z', -1]];
            for (const k of S) {
                const [x, y, z] = k.split(',').map(Number), q = { x, y, z };
                for (const [ax, sg] of DIRS) {
                    const n = { ...q };
                    n[ax] += sg;
                    if (S.has(`${n.x},${n.y},${n.z}`))
                        continue;
                    const [A, B] = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] }[ax];
                    const f = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
                    f[ax] += sg * 0.5;
                    if (faces)
                        P.face(f, ax, 1, 1, faces);
                    const plane = sg > 0 ? q[ax] + 1 : q[ax];
                    for (const [E, O] of [[A, B], [B, A]])
                        for (const o of [0, 1]) {
                            const st = { ...q };
                            st[ax] = plane;
                            st[O] = q[O] + o;
                            const key = `${E}|${st.x}|${st.y}|${st.z}`;
                            const list = edges.get(key) ?? [];
                            list.push(ax + sg);
                            edges.set(key, list);
                        }
                }
            }
            // keep the edges where the surface bends, then join them into long lines
            const runs = new Map();
            for (const [key, ns] of edges) {
                if (ns.length === 2 && ns[0] === ns[1])
                    continue;
                const [E, x, y, z] = key.split('|');
                const st = { x: +x, y: +y, z: +z };
                const line = E + '|' + ['x', 'y', 'z'].filter(a => a !== E).map(a => st[a]).join('|');
                (runs.get(line) ?? runs.set(line, []).get(line)).push(st[E]);
            }
            for (const [line, ts] of runs) {
                const [E, u, v] = line.split('|');
                const [U, V] = ['x', 'y', 'z'].filter(a => a !== E);
                ts.sort((a, b) => a - b);
                for (let i = 0; i < ts.length;) {
                    let j = i;
                    while (j + 1 < ts.length && ts[j + 1] === ts[j] + 1)
                        j++;
                    const a = { [E]: ts[i], [U]: +u, [V]: +v }, b = { [E]: ts[j] + 1, [U]: +u, [V]: +v };
                    P.seg(a, b, kind, 0.04);
                    i = j + 1;
                }
            }
        },
        /** A marker at a point. */
        dot(p, kind = 'point') {
            if (!custom)
                return void spawn(VANILLA[kind], p);
            const r = 0.12;
            P.seg({ x: p.x - r, y: p.y, z: p.z }, { x: p.x + r, y: p.y, z: p.z }, kind, 0.08);
            P.seg({ x: p.x, y: p.y - r, z: p.z }, { x: p.x, y: p.y + r, z: p.z }, kind, 0.08);
            P.seg({ x: p.x, y: p.y, z: p.z - r }, { x: p.x, y: p.y, z: p.z + r }, kind, 0.08);
        },
    };
    return P;
}
