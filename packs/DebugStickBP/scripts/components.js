/*!
 * Debug Stick -- A Bedrock port of the debug stick tool from Java Edition.
 * Copyright (c) 2023-2026 Vincent Yanzee J. Tan <https://vytdev.github.io>
 *
 * This project is licensed under the MIT License.
 * This software is provided "as is" without warranty of any kind.
 * See LICENSE for the full terms.
 */
/*
 * Custom block components used by the independent blocks.
 *
 *   vyt:keep_state  pick block on an independent block gives an item that
 *                   places that exact state (see tagPickedItem below)
 *   vyt:lever       flips when used, like a vanilla lever
 *   vyt:button      presses when used and pops back up, like a vanilla button
 *   vyt:iron_door   opens while either half receives redstone power
 *
 * Every component named in a block file must be registered here, or the
 * block fails to load.
 */
import { BlockPermutation, system, world } from '@minecraft/server';
import { BLOCKS } from './blocks-generated.js';
import { DEBUG_STICK_ID } from './debug-stick.js';
const PART = 'minecraft:multi_block_part';
const LORE_HEAD = '§r§7[Debug Stick]';
const LORE_LINE = '§r§8';
function safeState(perm, name) {
    try {
        return perm.getState(name);
    }
    catch (e) {
        return undefined;
    }
}
function heldItem(player) {
    try {
        const inv = player.getComponent('minecraft:inventory')?.container;
        return inv?.getItem(player.selectedSlotIndex);
    }
    catch (e) {
        return undefined;
    }
}
// --------------------------------------------------------------------------
// pick block keeps the state
// --------------------------------------------------------------------------
/**
 * Reads the states stored on an item by tagPickedItem.
 * @returns A state map, or undefined when the item carries none.
 */
export function storedStates(item) {
    let lore;
    try {
        lore = item.getLore();
    }
    catch (e) {
        return undefined;
    }
    if (!lore.length || lore[0] !== LORE_HEAD)
        return undefined;
    const out = {};
    for (const line of lore.slice(1)) {
        if (!line.startsWith(LORE_LINE))
            continue;
        const m = /^(\S+)=(\S+)/.exec(line.slice(LORE_LINE.length));
        if (!m)
            continue;
        out[m[1]] = /^-?\d+$/.test(m[2]) ? Number(m[2]) : m[2];
    }
    return out;
}
/**
 * When a player picks an independent block (the pick block button), the
 * game hands them the plain block item. Write the looked-at block's states
 * onto that item so placing it reproduces exactly that block.
 */
function tagPickedItem(player, slot) {
    if (slot !== player.selectedSlotIndex)
        return;
    const inv = player.getComponent('minecraft:inventory')?.container;
    const item = inv?.getItem(slot);
    if (!item || !BLOCKS[item.typeId]?.keep || storedStates(item))
        return;
    const hit = player.getBlockFromViewDirection({ maxDistance: 12, includePassableBlocks: true });
    const block = hit?.block;
    if (!block || block.typeId !== item.typeId)
        return;
    const entry = BLOCKS[item.typeId];
    const lore = [LORE_HEAD];
    for (const [name] of entry.states) {
        const v = safeState(block.permutation, name);
        if (v === undefined)
            continue;
        const label = entry.labels?.[name]?.[String(v)];
        lore.push(`${LORE_LINE}${name}=${v}${label ? ' §7(' + label + ')' : ''}`);
    }
    if (lore.length === 1)
        return;
    item.setLore(lore);
    inv.setItem(slot, item);
}
const KeepState = {
    beforeOnPlayerPlace(ev) {
        const player = ev.player;
        if (!player)
            return;
        const item = heldItem(player);
        if (!item || item.typeId !== ev.permutationToPlace.type.id)
            return;
        const states = storedStates(item);
        if (!states)
            return;
        try {
            ev.permutationToPlace = BlockPermutation.resolve(item.typeId, states);
        }
        catch (e) {
            // the stored states no longer fit this block: place the default
        }
    },
};
// --------------------------------------------------------------------------
// lever and button
// --------------------------------------------------------------------------
const Lever = {
    onPlayerInteract(ev) {
        const block = ev.block;
        const open = safeState(block.permutation, 'vyt:open') ? 0 : 1;
        block.setPermutation(block.permutation.withState('vyt:open', open));
        block.dimension.playSound('random.click', block.center(), { pitch: open ? 0.6 : 0.5 });
    },
};
const Button = {
    onPlayerInteract(ev) {
        const block = ev.block;
        if (safeState(block.permutation, 'vyt:pressed'))
            return;
        const id = block.typeId;
        const loc = block.location;
        const dim = block.dimension;
        block.setPermutation(block.permutation.withState('vyt:pressed', 1));
        dim.playSound('random.click', block.center(), { pitch: 0.6 });
        // wooden buttons stay down for 1.5 s, stone ones for 1 s
        const wooden = !/stone|blackstone/.test(id);
        system.runTimeout(() => {
            try {
                const b = dim.getBlock(loc);
                if (b?.typeId !== id || !safeState(b.permutation, 'vyt:pressed'))
                    return;
                b.setPermutation(b.permutation.withState('vyt:pressed', 0));
                dim.playSound('random.click', b.center(), { pitch: 0.5 });
            }
            catch (e) { }
        }, wooden ? 30 : 20);
    },
};
// --------------------------------------------------------------------------
// iron door
// --------------------------------------------------------------------------
const LEFT_OF = { north: 'west', east: 'north', south: 'east', west: 'south' };
const STEP = {
    north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 },
    east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 },
};
function otherHalf(block) {
    const part = safeState(block.permutation, PART);
    try {
        const b = block.offset({ x: 0, y: part === 1 ? -1 : 1, z: 0 });
        return b?.typeId === block.typeId ? b : undefined;
    }
    catch (e) {
        return undefined;
    }
}
const IronDoor = {
    beforeOnPlayerPlace(ev) {
        // a door placed next to a left-hinged door of the same facing gets
        // its hinge on the right, so the two make a double door
        const perm = ev.permutationToPlace;
        const facing = safeState(perm, 'minecraft:cardinal_direction');
        const step = STEP[LEFT_OF[facing]];
        if (!step)
            return;
        try {
            const nb = ev.block.offset(step);
            const nbFacing = nb && safeState(nb.permutation, 'minecraft:cardinal_direction');
            if (nb?.typeId === perm.type.id && nbFacing === facing && !safeState(nb.permutation, 'vyt:hinge'))
                ev.permutationToPlace = perm.withState('vyt:hinge', 1);
        }
        catch (e) { }
    },
    onPlace(ev) {
        // keep both halves in agreement after placement
        const block = ev.block;
        if (safeState(block.permutation, PART) !== 1)
            return;
        system.run(() => {
            try {
                const top = block.dimension.getBlock(block.location);
                const lower = top && otherHalf(top);
                if (!lower)
                    return;
                const h = safeState(lower.permutation, 'vyt:hinge');
                if (safeState(top.permutation, 'vyt:hinge') !== h)
                    top.setPermutation(top.permutation.withState('vyt:hinge', h));
            }
            catch (e) { }
        });
    },
    onRedstoneUpdate(ev) {
        const loc = ev.block.location;
        const dim = ev.block.dimension;
        const powered = ev.powerLevel > 0 ? 1 : 0;
        system.run(() => {
            const block = dim.getBlock(loc);
            if (!block || !BLOCKS[block.typeId])
                return;
            if (safeState(block.permutation, 'vyt:powered') !== powered)
                block.setPermutation(block.permutation.withState('vyt:powered', powered));
            const other = otherHalf(block);
            const open = powered || (other && safeState(other.permutation, 'vyt:powered')) ? 1 : 0;
            if (safeState(block.permutation, 'vyt:open') === open)
                return;
            block.setPermutation(block.permutation.withState('vyt:open', open));
            if (other)
                other.setPermutation(other.permutation.withState('vyt:open', open));
            dim.playSound(open ? 'open.iron_door' : 'close.iron_door', block.center());
        });
    },
};
/**
 * Registers the components and the pick block hooks.
 */
export function enableComponents() {
    system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
        blockComponentRegistry.registerCustomComponent('vyt:keep_state', KeepState);
        blockComponentRegistry.registerCustomComponent('vyt:lever', Lever);
        blockComponentRegistry.registerCustomComponent('vyt:button', Button);
        blockComponentRegistry.registerCustomComponent('vyt:iron_door', IronDoor);
    });
    world.afterEvents.playerInventoryItemChange.subscribe(ev => {
        if (ev.itemStack && ev.itemStack.typeId !== DEBUG_STICK_ID)
            system.run(() => tagPickedItem(ev.player, ev.slot));
    });
    world.afterEvents.playerHotbarSelectedSlotChange.subscribe(ev => {
        system.run(() => tagPickedItem(ev.player, ev.newSlotSelected));
    });
}
