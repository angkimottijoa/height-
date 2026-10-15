/*
 * Drawing with the pack's own particles (ArceonDLC_RP):
 *   arc:seg   a straight line segment of any length and direction (a thin strip
 *             turned to face the camera), coloured per call
 *   arc:face  a flat translucent square or rectangle with a given normal
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
            const ok = spawn('arc:seg', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
                vars(COLORS[kind] ?? COLORS.line, { dx: dx / L, dy: dy / L, dz: dz / L, len: L, w }));
            if (!ok && left > 0) {
                custom = false; // no resource pack: dots from now on
                dots(a, b, kind);
            }
        },
        /** A face centred at c, normal along axis 'x' | 'y' | 'z' (sign s), w × h (h upward on upright faces). */
        face(c, axis, w, h, kind = 'face') {
            if (!custom)
                return;
            const n = { x: axis === 'x' ? 1 : 0, y: axis === 'y' ? 1 : 0, z: axis === 'z' ? 1 : 0 };
            if (axis === 'y' && Math.abs(w - h) > 1e-6) {
                // a flat face lies any way round: cover it with squares
                const s = Math.min(w, h), n2 = Math.ceil(Math.max(w, h) / s), long = w > h ? 'x' : 'z';
                for (let i = 0; i < n2; i++) {
                    const off = -Math.max(w, h) / 2 + s / 2 + (n2 > 1 ? i * (Math.max(w, h) - s) / (n2 - 1) : 0);
                    spawn('arc:face', { ...c, [long]: c[long] + off }, vars(COLORS[kind], { nx: 0, ny: 1, nz: 0, sw: s, sh: s }));
                }
                return;
            }
            spawn('arc:face', c, vars(COLORS[kind] ?? COLORS.face, { nx: n.x, ny: n.y, nz: n.z, sw: w, sh: h }));
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
