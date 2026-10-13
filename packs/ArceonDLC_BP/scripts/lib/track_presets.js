/*
 * Saved track pieces for the railway tool. Like the custom lane presets,
 * but every layer is kept (bottom first, air included) together with the
 * direction it was built in and which layer sits at the curve height.
 */
import { world } from '@minecraft/server';
import { isAirId, permToString } from '../core/blocks.js';

const KEY = 'arc:tracks';

export function loadTracks() {
    try {
        const raw = world.getDynamicProperty(KEY);
        return typeof raw === 'string' ? JSON.parse(raw) : {};
    }
    catch (e) {
        return {};
    }
}
function store(all) {
    const json = JSON.stringify(all);
    if (json.length > 30000)
        throw new Error('저장 공간이 부족합니다. 안 쓰는 선로를 지우거나 더 작게(점선·침목 한 주기만) 잘라 저장하세요');
    world.setDynamicProperty(KEY, json);
}
export const trackNames = () => Object.keys(loadTracks()).sort();
export function removeTrack(name) {
    const all = loadTracks();
    if (!all[name])
        throw new Error(`"${name}" 선로가 없습니다`);
    delete all[name];
    store(all);
}

/**
 * Save a region. dir = [ax, az] along the track. anchor: 'bottom' (the
 * lowest layer sits at the curve points) or 'top'.
 */
export function saveTrack(name, edit, region, dir, anchorAt = 'bottom') {
    const [ax, az] = dir;
    const nx = -az, nz = ax;
    const { min, max } = region;
    const xs = [min.x, max.x], zs = [min.z, max.z];
    const along = (x, z) => x * ax + z * az, across = (x, z) => x * nx + z * nz;
    const a0 = Math.min(...xs.flatMap(x => zs.map(z => along(x, z))));
    const c0 = Math.min(...xs.flatMap(x => zs.map(z => across(x, z))));
    const w = Math.abs((max.x - min.x) * nx + (max.z - min.z) * nz) + 1;
    const l = Math.abs((max.x - min.x) * ax + (max.z - min.z) * az) + 1;
    const h = max.y - min.y + 1;
    if (w > 64 || l > 32 || h > 16)
        throw new Error('선로는 폭 64 · 길이 32 · 높이 16칸까지입니다 (침목 한 주기만 잘라 저장하세요)');
    const palette = [], index = new Map();
    const cells = new Array(h * w * l).fill(-1);
    let any = false;
    for (let x = min.x; x <= max.x; x++)
        for (let z = min.z; z <= max.z; z++)
            for (let y = min.y; y <= max.y; y++) {
                const p = edit.world({ x, y, z });
                if (!p || isAirId(p.type.id))
                    continue;
                any = true;
                const t = permToString(p);
                let i = index.get(t);
                if (i === undefined) {
                    i = palette.length;
                    palette.push(t);
                    index.set(t, i);
                }
                cells[((y - min.y) * w + (across(x, z) - c0)) * l + (along(x, z) - a0)] = i;
            }
    if (!any)
        throw new Error('선택 영역에 블록이 없습니다');
    const all = loadTracks();
    all[name] = { w, l, h, anchor: anchorAt === 'top' ? h - 1 : 0, dir, palette, cells };
    store(all);
    return { w, l, h };
}
