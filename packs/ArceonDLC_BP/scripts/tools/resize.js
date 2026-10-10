/*
 * Resize (Arceon //resize): scales every block of the selection around
 * the selection centre. Above 1 each block becomes a scale-sized cube,
 * below 1 blocks fall onto fewer cells. The original is cleared first.
 * -a also scales air (so it can carve). Blocks keep their states.
 */
import { AIR, isAirId } from '../core/blocks.js';

export default {
    id: 'resize',
    name: '크기 조절',
    desc: '선택 영역의 블록들을 중심 기준으로 확대/축소합니다.',
    icon: 'textures/blocks/piston_top_normal',
    needs: 'cuboid',
    maxVolume: 500000,
    fields: [
        { key: 'scale', type: 'number', label: '배율', default: 2, min: 0.001, max: 50, tooltip: '예: 2 = 두 배, 0.5 = 절반' },
        { key: 'air', type: 'toggle', label: '공기도 크기 조절 (-a)', default: false },
        { key: 'toClip', type: 'toggle', label: '월드는 그대로 두고 결과만 클립보드에 저장', default: false, tooltip: '클립보드 도구를 들면 놓일 자리가 보이고, 터치하면 붙여넣습니다' },
    ],
    *run(ctx, v) {
        let scale = Number(v.scale);
        if (!Number.isFinite(scale))
            throw new Error('배율을 숫자로 입력하세요');
        if (scale > 50)
            ctx.say('§e배율은 최대 50으로 제한됩니다');
        scale = Math.max(0.001, Math.min(50, scale));
        if (scale < 1)
            scale -= 1e-4;
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const c = { x: (min.x + max.x + 1) / 2, y: (min.y + max.y + 1) / 2, z: (min.z + max.z + 1) / 2 };
        // Arceon nudges the centre half a block on even sides
        if ((max.y - min.y + 1) % 2 === 0)
            c.y += 0.5;
        if ((max.x - min.x + 1) % 2 === 0)
            c.x += 0.5;
        if ((max.z - min.z + 1) % 2 === 0)
            c.z += 0.5;
        const air = AIR();
        const src = [];
        let ops = 0;
        for (let z = min.z; z <= max.z; z++)
            for (let y = min.y; y <= max.y; y++)
                for (let x = min.x; x <= max.x; x++) {
                    const p = edit.world({ x, y, z });
                    edit.set({ x, y, z }, air);
                    if (p && (!isAirId(p.type.id) || v.air))
                        src.push({ x: (x + 0.5 - c.x) * scale, y: (y + 0.5 - c.y) * scale, z: (z + 0.5 - c.z) * scale, p });
                    if (++ops % 4000 === 0)
                        yield;
                }
        for (const s of src) {
            const a = { x: s.x + c.x, y: s.y + c.y, z: s.z + c.z };
            if (scale > 1) {
                // Arceon l.c: every block between a and a + (scale - 1)
                const x0 = Math.floor(a.x), y0 = Math.floor(a.y), z0 = Math.floor(a.z);
                const x1 = Math.floor(a.x + scale - 1), y1 = Math.floor(a.y + scale - 1), z1 = Math.floor(a.z + scale - 1);
                for (let x = x0; x <= x1; x++)
                    for (let zz = z0; zz <= z1; zz++)
                        for (let y = y0; y <= y1; y++) {
                            edit.set({ x, y, z: zz }, s.p);
                            if (++ops % 4000 === 0)
                                yield;
                        }
            }
            else {
                edit.set(a, s.p);
                if (++ops % 4000 === 0)
                    yield;
            }
        }
        return `배율 ${Math.round(scale * 1000) / 1000}`;
    },
};
