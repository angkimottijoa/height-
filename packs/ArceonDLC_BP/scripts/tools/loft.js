/*
 * Loft (Arceon //loft set): skins a surface through the loft frames.
 *
 * Every frame is resampled to the same number of points, then "rails" run
 * through the n-th point of each frame and cross-sections are drawn
 * between the rails, all on Arceon's smooth curve (or straight lines with
 * -p). Wand clicks / clear / remove are handled by the menu code.
 */
import { SlabMap } from '../core/blocks.js';
import { BezierPath, LinePath, resample } from '../core/spline.js';

export default {
    id: 'loft',
    name: '로프트',
    desc: '로프트 프레임들을 매끄러운 면으로 이어 채웁니다.',
    icon: 'textures/blocks/wool_colored_white',
    needs: 'frames',
    fields: [
        { key: 'block', type: 'block', label: '블록', default: 'stone' },
        { key: 'count', type: 'number', label: '단면 개수 (0 = 자동)', default: 0, min: 0, max: 2000, tooltip: '프레임 사이에 그릴 단면 수. 0이면 길이에 맞춰 자동' },
        { key: 'lowPoly', type: 'toggle', label: '로우 폴리 (-p)', default: false },
        { key: 'outline', type: 'toggle', label: '테두리만 (-o)', default: false, tooltip: '단면 개수를 직접 정하면 단면도 함께 그림' },
        { key: 'connect', type: 'toggle', label: '처음과 끝 잇기 (-c)', default: false },
        { key: 'down', type: 'toggle', label: '바닥까지 쌓기 (-d)', default: false },
    ],
    *run(ctx, v) {
        const frames = ctx.frames.filter(f => f.length).map(f => f.map(p => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 })));
        const e = frames.length;
        if (e < 2)
            throw new Error('로프트에는 프레임이 2개 이상 필요합니다');
        const pattern = ctx.pattern('block');
        const slabs = pattern.slabs;
        const map = slabs ? new SlabMap() : null;
        const edit = ctx.edit;
        const low = !!v.lowPoly, outline = !!v.outline, connect = !!v.connect && e > 2, down = !!v.down;
        // Arceon: count -1 = auto; the form uses 0 for auto
        const given = Math.floor(Number(v.count) || 0);

        let width = Math.max(...frames.map(f => f.length));
        if (width === 1)
            width = 2;
        const Path = low ? LinePath : BezierPath;
        const lists = [];
        if (!low) {
            if (connect)
                lists.push(resample(frames[e - 1], width, true));
            for (const f of frames)
                lists.push(resample(f, width, true));
            if (connect) {
                lists.push(resample(frames[0], width, true));
                lists.push(resample(frames[1], width, true));
            }
        }
        else {
            for (const f of frames)
                lists.push(resample(f, width, false));
            if (connect)
                lists.push(resample(frames[0], width, true));
        }
        const rails = [];
        let longest = Number.MIN_VALUE;
        for (let i = 0; i < width; i++) {
            const r = new Path(lists.map(l => l[i]));
            longest = Math.max(longest, r.length);
            rails.push(r);
        }
        let count = given, auto = false;
        if (given <= 0) {
            count = Math.floor(longest * 5 + 1);
            auto = true;
        }

        let ops = 0;
        const put = (p) => {
            const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
            if (!map) {
                pattern.place(edit, { x: bx, y: by, z: bz });
                if (down) {
                    const floorY = edit.highest(bx, bz, edit.minY, by - 1);
                    for (let y = p.y - 1; y > floorY; y--)
                        pattern.place(edit, { x: bx, y: Math.floor(y), z: bz });
                }
                return;
            }
            const top = p.y < 0 ? p.y % 1 > -0.5 : p.y % 1 >= 0.5;
            if (top) {
                map.top(bx, by, bz);
                if (down)
                    map.full(bx, by, bz);
            }
            else
                map.bottom(bx, by, bz);
            if (down) {
                const floorY = edit.highest(bx, bz, edit.minY, by - 1);
                for (let y = p.y - 1; y > floorY; y--)
                    map.full(bx, Math.floor(y), bz);
            }
        };
        // samples along a path: (len * 3 + 1) points, end excluded (as Arceon)
        function* trace(path) {
            const n = Math.floor(path.length * 3 + 1);
            for (let i = 0; i < n; i++) {
                put(path.at(i / n * path.count));
                if (++ops % 2000 === 0)
                    yield;
            }
        }

        if (outline) {
            const edges = [rails[0], rails[rails.length - 1],
                new Path(rails.map(r => r.at(0))),
                new Path(rails.map(r => r.at(e - 1)))];
            for (const p of edges)
                yield* trace(p);
        }
        if (!auto || !outline) {
            for (let i = 0; i <= count; i++) {
                let t;
                if (connect)
                    t = low ? i / count * e : i / count * e + 1;
                else
                    t = i / count * (e - 1);
                yield* trace(new Path(rails.map(r => r.at(t))));
            }
        }
        if (map)
            map.write(edit, slabs);
        return `프레임 ${e}개, 단면 ${outline && auto ? 0 : count + 1}개`;
    },
};
