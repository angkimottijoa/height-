/*
 * Smear (Arceon //smear): drags every block of the selection `amount`
 * blocks in a direction (negative = the other way), stopping at non-air
 * unless -r. Direction "facing" is the player's 8-way compass direction,
 * or up/down when looking steeply (WorldEdit getCardinalDirection).
 * The global mask (Arceon's //gsmask) picks which blocks get smeared.
 */
import { isAirId } from '../core/blocks.js';

const DIRS = {
    up: [0, 1, 0], down: [0, -1, 0],
    north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0],
    northeast: [1, 0, -1], northwest: [-1, 0, -1], southeast: [1, 0, 1], southwest: [-1, 0, 1],
};

/** WorldEdit Player.getCardinalDirection(): pitch +-67.5 -> down/up, else 8-way by yaw. */
export function cardinal(rotation) {
    const pitch = rotation.x, yaw = rotation.y;
    if (pitch > 67.5)
        return 'down';
    if (pitch < -67.5)
        return 'up';
    // yaw 0 = south, 90 = west (same in Java and Bedrock)
    let rot = yaw % 360;
    if (rot < 0)
        rot += 360;
    const names = ['south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast'];
    return names[Math.floor((rot + 22.5) / 45) % 8];
}

export default {
    id: 'smear',
    name: '문지르기(스미어)',
    desc: '선택 영역의 블록을 한 방향으로 끌어 늘입니다. 전역 마스크로 끌 블록을 고릅니다.',
    icon: 'textures/blocks/honey_top',
    needs: 'cuboid',
    useMask: true,
    fields: [
        { key: 'amount', type: 'number', label: '끌 거리 (음수 = 반대로)', default: 1, min: -256, max: 256 },
        {
            key: 'direction', type: 'dropdown', label: '방향', default: 'facing', options: [
                { value: 'facing', label: '바라보는 방향' },
                { value: 'up', label: '위' },
                { value: 'down', label: '아래' },
                { value: 'north', label: '북' },
                { value: 'south', label: '남' },
                { value: 'east', label: '동' },
                { value: 'west', label: '서' },
                { value: 'northeast', label: '북동' },
                { value: 'northwest', label: '북서' },
                { value: 'southeast', label: '남동' },
                { value: 'southwest', label: '남서' },
            ],
        },
        { key: 'replace', type: 'toggle', label: '블록이 있어도 덮어쓰며 끌기 (-r)', default: false },
    ],
    *run(ctx, v) {
        const amount = Math.trunc(Number(v.amount) || 0);
        if (amount === 0)
            throw new Error('끌 거리는 0일 수 없습니다');
        const name = !v.direction || v.direction === 'facing' ? cardinal(ctx.rotation) : v.direction;
        const d = DIRS[name] ?? DIRS.north;
        const sign = amount > 0 ? 1 : -1;
        const steps = Math.abs(amount);
        const { min, max } = ctx.region;
        const edit = ctx.edit;
        const mask = edit.mask;
        let ops = 0;
        // Arceon walks x fastest, then y, then z
        for (let z = min.z; z <= max.z; z++)
            for (let y = min.y; y <= max.y; y++)
                for (let x = min.x; x <= max.x; x++) {
                    if (++ops % 4000 === 0)
                        yield;
                    const p = edit.world({ x, y, z });
                    if (!p || isAirId(p.type.id))
                        continue;
                    // the mask chooses the source blocks (//gsmask)
                    if (mask && !mask.test({ x, y, z }, edit))
                        continue;
                    for (let i = 1; i <= steps; i++) {
                        const q = { x: x + d[0] * sign * i, y: y + d[1] * sign * i, z: z + d[2] * sign * i };
                        if (!v.replace && !isAirId(edit.world(q)?.type.id ?? 'minecraft:air'))
                            break;
                        edit.force(q, p);
                        if (++ops % 4000 === 0)
                            yield;
                    }
                }
        return `${steps}칸 ${amount > 0 ? '' : '반대 '}${{ facing: '', up: '위', down: '아래', north: '북', south: '남', east: '동', west: '서', northeast: '북동', northwest: '북서', southeast: '남동', southwest: '남서' }[name]}쪽`;
    },
};
