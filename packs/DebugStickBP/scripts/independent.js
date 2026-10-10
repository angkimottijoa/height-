/*!
 * Debug Stick -- A Bedrock port of the debug stick tool from Java Edition.
 * Copyright (c) 2023-2026 Vincent Yanzee J. Tan <https://vytdev.github.io>
 *
 * This project is licensed under the MIT License.
 * This software is provided "as is" without warranty of any kind.
 * See LICENSE for the full terms.
 */
/*
 * Independent blocks.
 *
 * Vanilla fences, walls, panes, bars and stairs recompute their shape from
 * their neighbours, and plants, torches, levers, ladders and the like pop
 * off when their support goes. Each such vanilla block has a counterpart
 * here whose look lives in real block states that nothing but the debug
 * stick ever touches, and which never checks for support.
 *
 * The counterpart's id is the vanilla one with "minecraft:" swapped for
 * "vyt:ds_", so minecraft:sandstone_wall <-> vyt:ds_sandstone_wall.
 * Everything per block (states, labels, how vanilla states map onto ours)
 * comes from blocks-generated.js, which tools/debug_stick/build.py writes.
 */
import { BlockPermutation, system } from '@minecraft/server';
import { PREFIX, BLOCKS, FROM_VANILLA, TORCH_FACINGS, LEVER_DIRECTIONS, FACE_DIRS, STAIR_FACINGS, STAIR_SHAPES, } from './blocks-generated.js';
const MC = 'minecraft:';
const PART = 'minecraft:multi_block_part';
/**
 * The four horizontal sides, and the offset to the neighbour on that side.
 */
export const DIRS = ['north', 'south', 'east', 'west'];
const OFFSETS = {
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 },
};
const CONNECTABLE = new Set(['fence', 'wall', 'pane', 'bars']);
/**
 * Works out which family a vanilla block belongs to, if it has an
 * independent counterpart at all.
 * @param typeId The block type id.
 * @returns The family name, or undefined.
 */
export function vanillaFamily(typeId) {
    const id = FROM_VANILLA[typeId];
    return id ? BLOCKS[id].family : undefined;
}
/**
 * Tells whether a block id is one of our independent blocks.
 * @param typeId The block type id.
 * @returns True when the block is independent.
 */
export function isIndependent(typeId) {
    return !!BLOCKS[typeId];
}
/**
 * The family of an independent block.
 * @param typeId An independent block id.
 * @returns The family name, or undefined.
 */
export function independentFamily(typeId) {
    return BLOCKS[typeId]?.family;
}
/**
 * Valid values for the block states of the independent blocks. Custom
 * states are not in the vanilla BlockStates registry, so the debug stick
 * has to look them up here instead.
 * @param typeId The block type id.
 * @param prop The block state name.
 * @returns Valid values, or undefined when not one of ours.
 */
export function getCustomStateValues(typeId, prop) {
    const b = BLOCKS[typeId];
    if (!b)
        return undefined;
    const s = b.states.find(([n]) => n === prop);
    return s ? s[1] : undefined;
}
/**
 * Readable names for the integer state values.
 */
const WALL_NAMES = ['none', 'short', 'tall'];
const SIDE_NAMES = ['off', 'on'];
const FACINGS = ['down', 'up', 'north', 'south', 'west', 'east'];
const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
    'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown',
    'green', 'red', 'black'];
/**
 * Formats a state value for display.
 * @param typeId The block type id.
 * @param prop The block state name.
 * @param value The value to format.
 * @returns A printable value.
 */
export function describeStateValue(typeId, prop, value) {
    const b = BLOCKS[typeId];
    if (!b)
        return value;
    const label = b.labels?.[prop]?.[String(value)];
    if (label !== undefined)
        return `${value} (${label})`;
    const family = b.family;
    if (family === 'end_rod') {
        if (prop === 'vyt:facing')
            return `${value} (${FACINGS[value] ?? '?'})`;
        if (prop === 'vyt:lit')
            return `${value} (${value ? 'glowing' : 'dark'})`;
        if (prop === 'vyt:color')
            return `${value} (${DYES[value] ?? '?'})`;
        return value;
    }
    if (family === 'stairs') {
        if (prop === 'vyt:facing')
            return `${value} (${STAIR_FACINGS[value] ?? '?'})`;
        if (prop === 'vyt:shape')
            return `${value} (${STAIR_SHAPES[value] ?? '?'})`;
        if (prop === 'vyt:half')
            return `${value} (${value ? 'upside down' : 'normal'})`;
        return value;
    }
    if (family === 'torch' && prop === 'vyt:facing')
        return `${value} (${TORCH_FACINGS[value] ?? '?'})`;
    if (family === 'button' && prop === 'vyt:facing')
        return `${value} (${FACE_DIRS[value] ?? '?'})`;
    if (prop === 'vyt:dir')
        return `${value} (${LEVER_DIRECTIONS[value] ?? '?'})`;
    if (prop === 'vyt:open')
        return `${value} (${value ? 'on' : 'off'})`;
    if (prop === 'vyt:pressed')
        return `${value} (${value ? 'pressed' : 'up'})`;
    if (prop === 'vyt:post')
        return `${value} (${value ? 'on' : 'off'})`;
    if (CONNECTABLE.has(family) && DIRS.some(d => prop === 'vyt:' + d))
        return `${value} (${(family === 'wall' ? WALL_NAMES : SIDE_NAMES)[value] ?? '?'})`;
    if (family === 'attached' && FACINGS.some(d => prop === 'vyt:' + d))
        return `${value} (${SIDE_NAMES[value]})`;
    return value;
}
// --------------------------------------------------------------------------
// neighbour inspection
// --------------------------------------------------------------------------
/**
 * Reads a block state without throwing when it does not exist.
 */
function safeState(block, name) {
    try {
        return block.permutation.getState(name);
    }
    catch (e) {
        return undefined;
    }
}
/**
 * Reads a neighbouring block without throwing when it is out of the
 * world or in an unloaded chunk.
 */
function neighbour(block, off) {
    try {
        return block.offset(off);
    }
    catch (e) {
        return undefined;
    }
}
function isSolidish(block) {
    try {
        return !block.isAir && !block.isLiquid && block.isSolid;
    }
    catch (e) {
        return false;
    }
}
function familyOf(typeId) {
    return vanillaFamily(typeId) ?? independentFamily(typeId);
}
/**
 * Fallback for game versions whose fences/panes do not expose their
 * connections as states: guess them the way vanilla decides.
 */
function connectsTo(nb, family) {
    if (!nb || nb.isAir)
        return false;
    const other = familyOf(nb.typeId);
    if (other && CONNECTABLE.has(other)) {
        if (family === 'pane' || family === 'bars')
            return other === 'pane' || other === 'bars' || other === 'wall';
        if (family === 'wall')
            return other === 'wall' || other === 'pane' || other === 'bars';
        return other === family;
    }
    if (nb.typeId.endsWith('_fence_gate'))
        return family === 'fence' || family === 'wall';
    return isSolidish(nb);
}
function wallIsTall(block) {
    const above = neighbour(block, { x: 0, y: 1, z: 0 });
    if (!above || above.isAir)
        return false;
    if (familyOf(above.typeId) === 'wall')
        return true;
    return isSolidish(above);
}
// --------------------------------------------------------------------------
// stairs
// --------------------------------------------------------------------------
const STAIR_VEC = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
];
const STAIR_OPPOSITE = [1, 0, 3, 2];
const STAIR_CCW = [3, 2, 0, 1];
const STAIR_AXIS = [0, 0, 1, 1];
const CORNER_TO_SHAPE = { none: 0, inner_left: 1, inner_right: 2, outer_left: 3, outer_right: 4 };
function stairInfo(block) {
    if (!block)
        return undefined;
    const id = block.typeId;
    if (vanillaFamily(id) === 'stairs') {
        const facing = safeState(block, 'weirdo_direction');
        return {
            facing: typeof facing === 'number' ? facing : 0,
            half: safeState(block, 'upside_down_bit') ? 1 : 0,
        };
    }
    if (independentFamily(id) === 'stairs') {
        return {
            facing: safeState(block, 'vyt:facing') ?? 0,
            half: safeState(block, 'vyt:half') ?? 0,
        };
    }
    return undefined;
}
function stairCanTakeShape(block, facing, half, dir) {
    const nb = stairInfo(neighbour(block, STAIR_VEC[dir]));
    return !(nb && nb.facing === facing && nb.half === half);
}
/**
 * The corner shape a vanilla stair is drawing. Newer versions expose it
 * as minecraft:corner; older ones are worked out from the neighbours.
 */
function stairShape(block, facing, half) {
    const corner = safeState(block, 'minecraft:corner');
    if (typeof corner === 'string' && corner in CORNER_TO_SHAPE)
        return CORNER_TO_SHAPE[corner];
    const front = stairInfo(neighbour(block, STAIR_VEC[facing]));
    if (front && front.half === half
        && STAIR_AXIS[front.facing] !== STAIR_AXIS[facing]
        && stairCanTakeShape(block, facing, half, STAIR_OPPOSITE[front.facing]))
        return front.facing === STAIR_CCW[facing] ? 3 : 4;
    const back = stairInfo(neighbour(block, STAIR_VEC[STAIR_OPPOSITE[facing]]));
    if (back && back.half === half
        && STAIR_AXIS[back.facing] !== STAIR_AXIS[facing]
        && stairCanTakeShape(block, facing, half, back.facing))
        return back.facing === STAIR_CCW[facing] ? 1 : 2;
    return 0;
}
// --------------------------------------------------------------------------
// support-dependent families shipped before (state layout frozen)
// --------------------------------------------------------------------------
function enumIndex(list, value, fallback) {
    const i = list.indexOf(value);
    return i < 0 ? fallback : i;
}
function legacyStates(block, family) {
    switch (family) {
        case 'plant':
            return {};
        case 'torch':
            return { 'vyt:facing': enumIndex(TORCH_FACINGS, safeState(block, 'torch_facing_direction'), 5) };
        case 'lever':
            return {
                'vyt:dir': enumIndex(LEVER_DIRECTIONS, safeState(block, 'lever_direction'), 6),
                'vyt:open': safeState(block, 'open_bit') ? 1 : 0,
            };
        case 'button': {
            const facing = safeState(block, 'facing_direction');
            return {
                'vyt:facing': typeof facing === 'number' ? facing : 1,
                'vyt:pressed': safeState(block, 'button_pressed_bit') ? 1 : 0,
            };
        }
        case 'pressure_plate': {
            const signal = safeState(block, 'redstone_signal');
            return { 'vyt:pressed': typeof signal === 'number' && signal > 0 ? 1 : 0 };
        }
        case 'end_rod': {
            const facing = safeState(block, 'facing_direction');
            return { 'vyt:facing': typeof facing === 'number' ? facing : 1, 'vyt:lit': 1, 'vyt:color': 0 };
        }
    }
    return {};
}
function legacyRestore(perm, block, family) {
    switch (family) {
        case 'torch':
            return perm.withState('torch_facing_direction', TORCH_FACINGS[safeState(block, 'vyt:facing') ?? 5] ?? 'top');
        case 'lever':
            return perm
                .withState('lever_direction', LEVER_DIRECTIONS[safeState(block, 'vyt:dir') ?? 6] ?? 'up_east_west')
                .withState('open_bit', !!safeState(block, 'vyt:open'));
        case 'button':
            return perm
                .withState('facing_direction', safeState(block, 'vyt:facing') ?? 1)
                .withState('button_pressed_bit', !!safeState(block, 'vyt:pressed'));
        case 'end_rod': {
            const facing = safeState(block, 'vyt:facing');
            return typeof facing === 'number' ? perm.withState('facing_direction', facing) : perm;
        }
        default:
            return perm;
    }
}
// --------------------------------------------------------------------------
// table-driven families (new blocks): vyt states mirror vanilla states
// --------------------------------------------------------------------------
function tableStates(block, entry) {
    const out = {};
    for (const [vname, rule] of Object.entries(entry.convert ?? {})) {
        const v = safeState(block, vname);
        const [target, kind] = rule;
        if (kind === 'bits') {
            target.forEach((name, i) => out[name] = typeof v === 'number' && (v >> i) & 1 ? 1 : 0);
        }
        else if (v !== undefined) {
            out[target] = kind === 'bool' ? (v ? 1 : 0) : v;
        }
    }
    // drop values our block does not have (keeps resolve() from throwing)
    for (const [name, values] of entry.states) {
        if (name in out && !values.includes(out[name]))
            delete out[name];
    }
    return out;
}
function tableRestore(perm, block, entry) {
    for (const [vname, rule] of Object.entries(entry.convert ?? {})) {
        const [target, kind] = rule;
        try {
            if (kind === 'bits')
                perm = perm.withState(vname, target.reduce((acc, name, i) => acc | ((safeState(block, name) ? 1 : 0) << i), 0));
            else {
                const v = safeState(block, target);
                if (v !== undefined)
                    perm = perm.withState(vname, kind === 'bool' ? !!v : v);
            }
        }
        catch (e) {
            // the vanilla block lost that state in this game version
        }
    }
    return perm;
}
// --------------------------------------------------------------------------
// two-block-tall blocks
// --------------------------------------------------------------------------
/**
 * The lower and upper position of a vanilla two-block-tall block.
 */
function vanillaHalves(block) {
    const upper = !!safeState(block, 'upper_block_bit');
    const lower = upper ? neighbour(block, { x: 0, y: -1, z: 0 }) : block;
    const top = upper ? block : neighbour(block, { x: 0, y: 1, z: 0 });
    return { lower, top };
}
function ourHalves(block) {
    const upper = safeState(block, PART) === 1;
    const lower = upper ? neighbour(block, { x: 0, y: -1, z: 0 }) : block;
    const top = upper ? block : neighbour(block, { x: 0, y: 1, z: 0 });
    return { lower, top };
}
/** Java facing for a Bedrock door's cardinal_direction (and back). */
const DOOR_TO_JAVA = { east: 'north', south: 'east', west: 'south', north: 'west' };
const JAVA_TO_DOOR = { north: 'east', east: 'south', south: 'west', west: 'north' };
/**
 * Swapping one half of a vanilla two-block-tall block can make the other
 * half pop and drop an item before we replace it too. Sweep those drops.
 */
function clearDrops(dim, locs, itemIds) {
    system.run(() => {
        for (const loc of locs) {
            let items = [];
            try {
                items = dim.getEntities({ type: 'minecraft:item', location: { x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 }, maxDistance: 1.5 });
            }
            catch (e) {
                continue;
            }
            for (const it of items) {
                try {
                    const stack = it.getComponent('minecraft:item')?.itemStack;
                    if (stack && itemIds.some(id => stack.typeId === id))
                        it.remove();
                }
                catch (e) { }
            }
        }
    });
}
// --------------------------------------------------------------------------
// conversion
// --------------------------------------------------------------------------
/**
 * Converts a vanilla block into its independent counterpart, keeping the
 * look it currently has.
 * Note: Can't work in read-only mode; defer execution.
 * @param block The block to convert.
 * @returns The new block id, or undefined when not convertible.
 */
export function toIndependent(block) {
    const id = FROM_VANILLA[block.typeId];
    if (!id)
        return undefined;
    const entry = BLOCKS[id];
    const family = entry.family;
    const dim = block.dimension;
    if (family === 'stairs') {
        const raw = safeState(block, 'weirdo_direction');
        const facing = typeof raw === 'number' ? raw : 0;
        const half = safeState(block, 'upside_down_bit') ? 1 : 0;
        dim.setBlockPermutation(block.location, BlockPermutation.resolve(id, {
            'vyt:facing': facing,
            'vyt:half': half,
            'vyt:shape': stairShape(block, facing, half),
        }));
        return id;
    }
    if (CONNECTABLE.has(family)) {
        const isWall = family === 'wall';
        const states = {};
        if (isWall) {
            const post = safeState(block, 'wall_post_bit');
            states['vyt:post'] = post === undefined ? 1 : (post ? 1 : 0);
        }
        else {
            states['vyt:post'] = 1;
        }
        const tall = isWall && wallIsTall(block);
        for (const d of DIRS) {
            if (isWall) {
                const t = safeState(block, 'wall_connection_type_' + d);
                if (typeof t === 'string') {
                    states['vyt:' + d] = Math.max(0, WALL_NAMES.indexOf(t));
                    continue;
                }
            }
            else {
                const c = safeState(block, 'minecraft:connection_' + d);
                if (typeof c === 'boolean') {
                    states['vyt:' + d] = c ? 1 : 0;
                    continue;
                }
            }
            const connected = connectsTo(neighbour(block, OFFSETS[d]), family);
            states['vyt:' + d] = isWall ? (connected ? (tall ? 2 : 1) : 0) : (connected ? 1 : 0);
        }
        dim.setBlockPermutation(block.location, BlockPermutation.resolve(id, states));
        return id;
    }
    if (family === 'door') {
        const { lower, top } = vanillaHalves(block);
        if (!lower || !top || lower.typeId !== block.typeId || top.typeId !== block.typeId)
            return undefined;
        const cardinal = safeState(lower, 'minecraft:cardinal_direction');
        const base = {
            'minecraft:cardinal_direction': DOOR_TO_JAVA[cardinal] ?? 'north',
            'vyt:open': safeState(lower, 'open_bit') ? 1 : 0,
            'vyt:hinge': safeState(top, 'door_hinge_bit') ? 1 : 0,
            'vyt:powered': 0,
        };
        const lo = lower.location, hi = top.location;
        dim.setBlockPermutation(hi, BlockPermutation.resolve(id, { ...base, [PART]: 1 }));
        dim.setBlockPermutation(lo, BlockPermutation.resolve(id, { ...base, [PART]: 0 }));
        clearDrops(dim, [lo, hi], [block.typeId]);
        return id;
    }
    if (entry.multi) {
        const { lower, top } = vanillaHalves(block);
        const states = tableStates(block, entry);
        if (!lower || lower.typeId !== block.typeId) {
            dim.setBlockPermutation(block.location, BlockPermutation.resolve(id, { ...states, [PART]: 0 }));
            return id;
        }
        const lo = lower.location;
        const hasTop = top && top.typeId === block.typeId;
        const hi = hasTop ? top.location : undefined;
        if (hi)
            dim.setBlockPermutation(hi, BlockPermutation.resolve(id, { ...states, [PART]: 1 }));
        dim.setBlockPermutation(lo, BlockPermutation.resolve(id, { ...states, [PART]: 0 }));
        clearDrops(dim, hi ? [lo, hi] : [lo], [block.typeId, 'minecraft:wheat_seeds']);
        return id;
    }
    if (family === 'attached') {
        const states = tableStates(block, entry);
        if (id === 'vyt:ds_cave_vines') {
            states['vyt:berries'] = block.typeId === 'minecraft:cave_vines' ? 0 : 1;
            const below = neighbour(block, { x: 0, y: -1, z: 0 });
            states['vyt:body'] = block.typeId.endsWith('_body_with_berries')
                || (below && FROM_VANILLA[below.typeId] === id) ? 1 : 0;
        }
        else if (entry.states.some(([n]) => n === 'vyt:body')) {
            // twisting vines grow up, weeping vines hang down
            const dy = id === 'vyt:ds_weeping_vines' ? -1 : 1;
            const next = neighbour(block, { x: 0, y: dy, z: 0 });
            states['vyt:body'] = next && (next.typeId === block.typeId || next.typeId === id) ? 1 : 0;
        }
        dim.setBlockPermutation(block.location, BlockPermutation.resolve(id, states));
        return id;
    }
    dim.setBlockPermutation(block.location, BlockPermutation.resolve(id, legacyStates(block, family)));
    return id;
}
/**
 * Converts an independent block back into the exact vanilla block it
 * came from. The vanilla block picks its own shape again, as usual.
 * Note: Can't work in read-only mode; defer execution.
 * @param block The block to convert.
 * @returns The vanilla block id, undefined when not one of ours, or null
 *          when that vanilla block does not exist in this game version.
 */
export function toVanilla(block) {
    const entry = BLOCKS[block.typeId];
    if (!entry)
        return undefined;
    let id = entry.vanilla;
    const family = entry.family;
    const dim = block.dimension;
    try {
        if (family === 'door' || entry.multi) {
            const { lower, top } = ourHalves(block);
            const ok = (b) => b && b.typeId === block.typeId;
            let lowerPerm = BlockPermutation.resolve(id);
            let upperPerm = BlockPermutation.resolve(id);
            if (family === 'door') {
                const src = ok(lower) ? lower : block;
                const set = (p, upper) => p
                    .withState('minecraft:cardinal_direction', JAVA_TO_DOOR[safeState(src, 'minecraft:cardinal_direction')] ?? 'east')
                    .withState('open_bit', !!safeState(src, 'vyt:open'))
                    .withState('door_hinge_bit', !!safeState(src, 'vyt:hinge'))
                    .withState('upper_block_bit', upper);
                lowerPerm = set(lowerPerm, false);
                upperPerm = set(upperPerm, true);
            }
            else {
                lowerPerm = tableRestore(lowerPerm, ok(lower) ? lower : block, entry).withState('upper_block_bit', false);
                upperPerm = tableRestore(upperPerm, ok(lower) ? lower : block, entry).withState('upper_block_bit', true);
            }
            const locs = [];
            if (ok(lower)) {
                dim.setBlockPermutation(lower.location, lowerPerm);
                locs.push(lower.location);
            }
            if (ok(top)) {
                dim.setBlockPermutation(top.location, upperPerm);
                locs.push(top.location);
            }
            clearDrops(dim, locs, [block.typeId]);
            return id;
        }
        let perm = BlockPermutation.resolve(id);
        if (family === 'stairs') {
            perm = perm
                .withState('weirdo_direction', safeState(block, 'vyt:facing') ?? 0)
                .withState('upside_down_bit', !!safeState(block, 'vyt:half'));
        }
        else if (family === 'attached') {
            if (block.typeId === 'vyt:ds_cave_vines' && safeState(block, 'vyt:berries')) {
                id = safeState(block, 'vyt:body')
                    ? 'minecraft:cave_vines_body_with_berries' : 'minecraft:cave_vines_head_with_berries';
                perm = BlockPermutation.resolve(id);
            }
            perm = tableRestore(perm, block, entry);
        }
        else if (!CONNECTABLE.has(family)) {
            perm = legacyRestore(perm, block, family);
        }
        dim.setBlockPermutation(block.location, perm);
    }
    catch (e) {
        // the world was built on a newer version than the one running it
        return null;
    }
    return id;
}
