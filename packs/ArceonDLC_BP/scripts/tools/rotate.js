/*
 * Free-angle rotate (WorldEdit //rotate style, any angle in 1 degree steps).
 *
 * Every target cell asks "which source cell lands here?" (inverse rotation,
 * nearest cell), so the result has no holes. Directional states (stairs,
 * logs, torches, doors, signs...) turn with the build, snapped to the
 * nearest direction they can hold.
 */
import { AIR } from '../core/blocks.js';
import { apply, matrix, transpose, turnStates } from '../core/turn.js';

export default {
    id: 'rotate',
    name: '자유 회전',
    desc: '선택 영역을 원하는 각도(1° 단위)로 돌립니다. Y는 위에서 볼 때 시계 방향.',
    icon: 'textures/items/compass_item',
    needs: 'cuboid',
    maxVolume: 1000000,
    fields: [
        { key: 'yaw', type: 'angle', label: '좌우 회전 Y', default: 90 },
        { key: 'pitch', type: 'angle', label: '앞뒤 기울기 X', default: 0 },
        { key: 'roll', type: 'angle', label: '옆 기울기 Z', default: 0 },
        {
            key: 'mode', type: 'dropdown', label: '방식', default: 'inplace', options: [
                { value: 'inplace', label: '제자리 회전 (원래 자리는 비움)' },
                { value: 'copy', label: '돌린 복사본을 내 위치에 놓기 (원본 유지)' },
            ],
        },
        {
            key: 'center', type: 'dropdown', label: '회전 중심 (제자리 회전일 때)', default: 'selection', options: [
                { value: 'selection', label: '선택 영역 중심' },
                { value: 'player', label: '내가 서 있는 칸' },
            ],
        },
        { key: 'skipAir', type: 'toggle', label: '공기는 덮어쓰지 않기', default: true },
        { key: 'states', type: 'toggle', label: '계단·원목 등 방향도 같이 돌리기', default: true },
        { key: 'toClip', type: 'toggle', label: '월드는 그대로 두고 결과만 클립보드에 저장', default: false, tooltip: '클립보드 도구를 들면 놓일 자리가 보이고, 터치하면 붙여넣습니다' },
    ],
    *run(ctx, v) {
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const yaw = Number(v.yaw) || 0, pitch = Number(v.pitch) || 0, roll = Number(v.roll) || 0;
        if (!yaw && !pitch && !roll && v.mode === 'inplace')
            throw new Error('각도가 모두 0입니다');
        const m = matrix(yaw, pitch, roll);
        const inv = transpose(m);
        // pivot (in world coordinates, cell edges)
        let pivot;
        if (v.mode === 'inplace' && v.center === 'player')
            pivot = [Math.floor(ctx.location.x) + 0.5, Math.floor(ctx.location.y) + 0.5, Math.floor(ctx.location.z) + 0.5];
        else
            pivot = [(min.x + max.x + 1) / 2, (min.y + max.y + 1) / 2, (min.z + max.z + 1) / 2];
        // where the pivot ends up: copies go to the player's feet, bottom aligned
        let target = pivot;
        if (v.mode === 'copy')
            target = [Math.floor(ctx.location.x) + 0.5, Math.floor(ctx.location.y) + (pivot[1] - min.y), Math.floor(ctx.location.z) + 0.5];
        // read the source
        const src = new Map();
        let n = 0;
        for (let x = min.x; x <= max.x; x++)
            for (let y = min.y; y <= max.y; y++)
                for (let z = min.z; z <= max.z; z++) {
                    const p = edit.world({ x, y, z });
                    if (p)
                        src.set(x + ',' + y + ',' + z, p);
                    if (++n % 4000 === 0)
                        yield;
                }
        // bounds of the rotated box
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const cx of [min.x, max.x + 1])
            for (const cy of [min.y, max.y + 1])
                for (const cz of [min.z, max.z + 1]) {
                    const q = apply(m, [cx - pivot[0], cy - pivot[1], cz - pivot[2]]);
                    for (let i = 0; i < 3; i++) {
                        lo[i] = Math.min(lo[i], q[i] + target[i]);
                        hi[i] = Math.max(hi[i], q[i] + target[i]);
                    }
                }
        if (v.mode === 'inplace') {
            const air = AIR();
            for (const k of src.keys()) {
                const [x, y, z] = k.split(',').map(Number);
                edit.set({ x, y, z }, air);
            }
        }
        const turned = new Map();
        const turn = v.states !== false && (yaw || pitch || roll);
        n = 0;
        for (let x = Math.floor(lo[0]); x < Math.ceil(hi[0]); x++)
            for (let y = Math.floor(lo[1]); y < Math.ceil(hi[1]); y++)
                for (let z = Math.floor(lo[2]); z < Math.ceil(hi[2]); z++) {
                    if (++n % 4000 === 0)
                        yield;
                    const q = apply(inv, [x + 0.5 - target[0], y + 0.5 - target[1], z + 0.5 - target[2]]);
                    const sx = Math.floor(q[0] + pivot[0]), sy = Math.floor(q[1] + pivot[1]), sz = Math.floor(q[2] + pivot[2]);
                    const p = src.get(sx + ',' + sy + ',' + sz);
                    if (!p)
                        continue;
                    if (v.skipAir && p.type.id === 'minecraft:air')
                        continue;
                    let out = p;
                    if (turn) {
                        out = turned.get(p);
                        if (!out) {
                            out = turnStates(p, m);
                            turned.set(p, out);
                        }
                    }
                    edit.set({ x, y, z }, out);
                }
        return `Y ${yaw}° X ${pitch}° Z ${roll}°`;
    },
};
