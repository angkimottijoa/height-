/*
 * Boulder brush (Arceon /arcbrush boulder): a rough icosphere rock. The
 * surface triangles are filled, then every surface block is joined to the
 * centre (solid rock). -f drops each surface column down to the ground,
 * -h keeps only the shell, -a tilts the rock by the view pitch.
 * The rock always turns with the view yaw, like Arceon.
 */
import { icosphere } from '../lib/terrain_icosphere.js';
import { pickInt, putPat } from '../lib/terrain_util.js';
import { lineN, mid } from '../core/vec.js';

const FALLING = /^minecraft:(sand|red_sand|gravel|\w+_concrete_powder)$/;

export default {
    id: 'boulder',
    name: '바위 브러시',
    desc: '울퉁불퉁한 바위를 만듭니다. 크기·높이·너비는 최소~최대 사이에서 무작위.',
    icon: 'textures/blocks/cobblestone_mossy',
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'sizeMin', type: 'slider', label: '크기 최소', default: 8, min: 1, max: 40 },
        { key: 'sizeMax', type: 'slider', label: '크기 최대', default: 8, min: 1, max: 40 },
        { key: 'quality', type: 'slider', label: '매끈함 (0 = 각진 로우폴리)', default: 3, min: 0, max: 5 },
        { key: 'heightMin', type: 'slider', label: '높이 최소 (0 = 크기와 같음)', default: 0, min: 0, max: 40 },
        { key: 'heightMax', type: 'slider', label: '높이 최대', default: 0, min: 0, max: 40 },
        { key: 'widthMin', type: 'slider', label: '너비 최소 (0 = 크기와 같음)', default: 0, min: 0, max: 40 },
        { key: 'widthMax', type: 'slider', label: '너비 최대', default: 0, min: 0, max: 40 },
        { key: 'h', type: 'toggle', label: '속 비우기 (-h)', default: false },
        { key: 'f', type: 'toggle', label: '땅까지 떨어뜨리기 (-f)', default: false },
        { key: 'a', type: 'toggle', label: '시선 각도로 기울이기 (-a)', default: false },
    ],
    *apply(ctx, v, hit) {
        const edit = ctx.edit;
        const pat = ctx.pattern('block');
        const quality = Math.max(0, Math.min(5, Math.trunc(Number(v.quality) || 0)));
        const hollow = !!v.h;
        const falling = !!v.f || FALLING.test(pat.first?.type.id ?? '');
        const size = pickInt(v.sizeMin, v.sizeMax);
        const height = Number(v.heightMin) > 0 ? pickInt(v.heightMin, v.heightMax || v.heightMin) : size;
        const width = Number(v.widthMin) > 0 ? pickInt(v.widthMin, v.widthMax || v.widthMin) : size;
        if (size <= 0)
            throw new Error('크기는 1 이상이어야 합니다');
        const c = { x: hit.x, y: hit.y, z: hit.z };
        const ico = icosphere(quality, 1.2, true);
        const yaw = (ctx.rotation.y - 90) % 360 * Math.PI / 180;
        const pitch = ctx.rotation.x * Math.PI / 180;
        const ratio = width / size;
        const place = (p) => {
            let dx = p[0] * (size / 2), dy = p[1] * (height / 2), dz = p[2] * (size / 2) * ratio;
            if (v.a) {
                const nx = dx * Math.cos(pitch) - dy * Math.sin(pitch);
                dy = dy * Math.cos(pitch) + dx * Math.sin(pitch);
                dx = nx;
            }
            return {
                x: dx * Math.cos(yaw) - dz * Math.sin(yaw) + c.x,
                y: dy + c.y,
                z: dz * Math.cos(yaw) + dx * Math.sin(yaw) + c.z,
            };
        };
        const shell = new Map();
        let ops = 0;
        const dropOnly = falling && !hollow;
        for (const [ia, ib, ic] of ico.tris) {
            const A = place(ico.verts[ia]), B = place(ico.verts[ib]), C = place(ico.verts[ic]);
            const n = Math.trunc(Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z) * 2) + 1;
            for (let i = 0; i < n; i++) {
                const P = { x: B.x + i * (A.x - B.x) / n, y: B.y + i * (A.y - B.y) / n, z: B.z + i * (A.z - B.z) / n };
                for (const q of lineN(P, C, n * 2)) {
                    const b = { x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) };
                    shell.set(b.x + ',' + b.y + ',' + b.z, b);
                    if (!dropOnly)
                        putPat(edit, pat, b);
                    if (++ops % 3000 === 0)
                        yield;
                }
            }
        }
        if (dropOnly) {
            const cap = Math.trunc(c.y + height / 1.5);
            for (const b of shell.values()) {
                const ground = edit.highest(b.x, b.z, edit.minY, cap);
                for (let y = b.y; y > ground; y--)
                    putPat(edit, pat, { x: b.x, y, z: b.z });
                if (++ops % 500 === 0)
                    yield;
            }
            return;
        }
        if (hollow)
            return;
        for (const b of shell.values()) {
            const d = Math.trunc(Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z));
            const s = { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 };
            const m = mid(s, c);
            for (const q of lineN(s, m, d * 3))
                putPat(edit, pat, q);
            for (const q of lineN(m, c, d))
                putPat(edit, pat, q);
            if (++ops % 300 === 0)
                yield;
        }
    },
};
