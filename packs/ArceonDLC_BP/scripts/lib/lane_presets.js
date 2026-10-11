/*
 * Custom lane presets: a hand-built piece of road saved like an asset and
 * swept along a curve by the lane road tool.
 *
 * A preset is a tile `w` blocks across and `l` blocks along the road,
 * `h` layers deep (layer 0 is the road surface). Blocks are kept as text
 * (permToString) in a palette, cells as palette indices (-1 = air).
 * Presets live in the world (dynamic property), so every player sees them.
 */
import { world } from '@minecraft/server';
import { parseBlock, permToString, isAirId } from '../core/blocks.js';

const KEY = 'arc:lanes';

export function loadPresets() {
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
        throw new Error('저장 공간이 부족합니다. 안 쓰는 커스텀 차선을 지우거나 더 작게 잘라 저장하세요');
    world.setDynamicProperty(KEY, json);
}
export const presetNames = () => Object.keys(loadPresets()).sort();
export function removePreset(name) {
    const all = loadPresets();
    if (!all[name])
        throw new Error(`"${name}" 커스텀 차선이 없습니다`);
    delete all[name];
    store(all);
}

/** Facing → unit direction along the road (cardinal). yaw 0 = south. */
export function facingDir(yaw) {
    const a = ((Math.round(yaw / 90) % 4) + 4) % 4;
    return [[0, 1], [-1, 0], [0, -1], [1, 0]][a];
}

/**
 * Save a region as a preset. `dir` = [ax, az] is the road direction;
 * columns run from the left of that direction to the right.
 */
export function savePreset(name, edit, region, dir) {
    const [ax, az] = dir;
    const nx = -az, nz = ax; // right of the travel direction
    const { min, max } = region;
    // the topmost layer with blocks is the road surface
    let top = null;
    for (let y = max.y; y >= min.y && top === null; y--)
        for (let x = min.x; x <= max.x && top === null; x++)
            for (let z = min.z; z <= max.z; z++)
                if (!isAirId(edit.world({ x, y, z })?.type.id)) {
                    top = y;
                    break;
                }
    if (top === null)
        throw new Error('선택 영역에 블록이 없습니다');
    const xs = [min.x, max.x], zs = [min.z, max.z];
    const along = (x, z) => x * ax + z * az, across = (x, z) => x * nx + z * nz;
    const a0 = Math.min(...xs.flatMap(x => zs.map(z => along(x, z))));
    const c0 = Math.min(...xs.flatMap(x => zs.map(z => across(x, z))));
    const w = Math.abs((max.x - min.x) * nx + (max.z - min.z) * nz) + 1;
    const l = Math.abs((max.x - min.x) * ax + (max.z - min.z) * az) + 1;
    const h = top - min.y + 1;
    if (w > 64 || l > 64)
        throw new Error('커스텀 차선은 폭·길이 64칸까지입니다 (점선 한 주기만 잘라 저장하면 됩니다)');
    const palette = [], index = new Map();
    const cells = new Array(h * w * l).fill(-1);
    for (let x = min.x; x <= max.x; x++)
        for (let z = min.z; z <= max.z; z++)
            for (let y = min.y; y <= top; y++) {
                const p = edit.world({ x, y, z });
                if (!p || isAirId(p.type.id))
                    continue;
                const t = permToString(p);
                let i = index.get(t);
                if (i === undefined) {
                    i = palette.length;
                    palette.push(t);
                    index.set(t, i);
                }
                const k = top - y, c = across(x, z) - c0, j = along(x, z) - a0;
                cells[(k * w + c) * l + j] = i;
            }
    const all = loadPresets();
    all[name] = { w, l, h, palette, cells };
    store(all);
    return { w, l, h };
}

/** A preset ready to sweep: block lookups, the base (most common surface) block and line columns. */
export function openPreset(name) {
    const p = loadPresets()[name];
    if (!p)
        throw new Error(`"${name}" 커스텀 차선이 없습니다`);
    const perms = p.palette.map(t => parseBlock(t));
    const at = (k, c, j) => {
        const i = p.cells[(k * p.w + c) * p.l + j];
        return i >= 0 ? perms[i] : null;
    };
    const count = new Map();
    for (let c = 0; c < p.w; c++)
        for (let j = 0; j < p.l; j++) {
            const b = at(0, c, j);
            if (b)
                count.set(b, (count.get(b) ?? 0) + 1);
        }
    let base = null, best = -1;
    for (const [b, n] of count)
        if (n > best) {
            best = n;
            base = b;
        }
    // a column that holds anything but the base on the surface is a painted line
    const line = [], empty = [];
    for (let c = 0; c < p.w; c++) {
        let other = false, any = false;
        for (let j = 0; j < p.l; j++) {
            const b = at(0, c, j);
            if (b)
                any = true;
            if (b && b !== base)
                other = true;
        }
        line.push(other);
        empty.push(!any);
    }
    return { ...p, at, base, line, empty };
}
