/*!
 * Debug Stick -- A Bedrock port of the debug stick tool from Java Edition.
 * Copyright (c) 2023-2026 Vincent Yanzee J. Tan <https://vytdev.github.io>
 *
 * This project is licensed under the MIT License.
 * This software is provided "as is" without warranty of any kind.
 * See LICENSE for the full terms.
 */
import { BlockPermutation, BlockStates, LiquidType } from '@minecraft/server';
import { defer } from './utils.js';
import { getCustomStateValues, isIndependent } from './independent.js';
const PART = 'minecraft:multi_block_part';
/**
 * Creates an entirely new block permutation.
 * @param block The reference block.
 * @param name The name of the block state to set.
 * @param value The value for the state.
 * @returns A new BlockPermutation.
 */
export function makeNewPermutation(block, name, value) {
    return BlockPermutation.resolve(block.typeId, block.permutation.getAllStates()).withState(name, value);
}
/**
 * Executes a full block state update instead of a simple permutation swap.
 * Note: blocks with other components/special NBT should not use this.
 * Workaround for MCPE-238217 and gh-24.
 * @param block The block to update.
 * @param stateName The block state to change.
 * @param value The value for the state.
 */
export function fullBlockStateUpdate(block, stateName, value) {
    // work around #24
    const loc = block.location;
    const dim = block.dimension;
    const canBeWaterlogged = block.canContainLiquid(LiquidType.Water);
    const isWaterlogged = block.isWaterlogged;
    const newPermu = makeNewPermutation(block, stateName, value);
    dim.setBlockType(loc, 'minecraft:air');
    // update the block next tick
    defer(() => {
        dim.setBlockPermutation(loc, newPermu);
        if (canBeWaterlogged)
            dim.getBlock(loc)?.setWaterlogged(isWaterlogged);
    });
}
/**
 * List of blocks requiring {@link fullBlockStateUpdate}.
 */
export const blocksRequiringFullUpdate = new Set([
    'minecraft:piston',
    'minecraft:sticky_piston',
    'minecraft:observer',
    'minecraft:powered_repeater',
    'minecraft:unpowered_repeater',
    'minecraft:powered_comparator',
    'minecraft:unpowered_comparator',
]);
/**
 * @class DebugStickContext
 * Context passed to the debug-stick-related event handlers.
 */
export class DebugStickContext {
    /**
     * Creates a new {@link DebugStickContext} instance.
     * @param block The block you'll be working on.
     * @param player The player who initiated the event.
     * @param event The corresponding event that triggered the callback.
     */
    constructor(block, player, event) {
        this.block = block;
        this.player = player;
        this.event = event;
    }
    /**
     * The block we're working on.
     */
    block;
    /**
     * The player who initiated the event.
     */
    player;
    /**
     * The event.
     */
    event;
    /**
     * Returns an array of valid property values for the given property.
     * Custom block states are not in the vanilla BlockStates registry, so
     * blocks that define their own are looked up separately.
     * @param prop The property name.
     * @param block The block the property belongs to, when known.
     * @returns Valid prop values.
     */
    static getPropValidValues(prop, block) {
        if (prop === 'waterlogged')
            return [false, true];
        if (block) {
            const custom = getCustomStateValues(block.typeId, prop);
            if (custom)
                return custom;
        }
        const state = BlockStates.get(prop);
        if (state)
            return state.validValues;
        throw new Error(`unknown block state "${prop}"`);
    }
    /**
     * Returns all the properties of a block.
     * @returns Record<PropName, PropValue>
     */
    getAllProps() {
        const props = this.block.permutation.getAllStates() || {};
        // which half of a door is which is not something to edit
        if (isIndependent(this.block.typeId))
            delete props[PART];
        if (this.block.canContainLiquid(LiquidType.Water))
            props['waterlogged'] = this.block.isWaterlogged;
        return props;
    }
    /**
     * Updates a block's property.
     * Note: Can't work in read-only mode; defer execution.
     * @param prop The property to change.
     * @param value The value to set.
     */
    setBlockProp(prop, value) {
        if (prop == 'waterlogged')
            this.block.setWaterlogged(value);
        else if (blocksRequiringFullUpdate.has(this.block.typeId))
            fullBlockStateUpdate(this.block, prop, value);
        else {
            const other = this.otherHalf();
            this.block.setPermutation(this.block.permutation.withState(prop, value));
            // both halves of our two-block-tall blocks share their states
            if (other)
                other.setPermutation(other.permutation.withState(prop, value));
        }
    }
    /**
     * The other half of one of our two-block-tall blocks, if any.
     */
    otherHalf() {
        if (!isIndependent(this.block.typeId))
            return undefined;
        let part;
        try {
            part = this.block.permutation.getState(PART);
        }
        catch (e) {
            return undefined;
        }
        if (part === undefined)
            return undefined;
        try {
            const other = this.block.offset({ x: 0, y: part === 1 ? -1 : 1, z: 0 });
            return other?.typeId === this.block.typeId ? other : undefined;
        }
        catch (e) {
            return undefined;
        }
    }
    /**
     * Sends a message to player's actionbar.
     * Note: Can't work in read-only mode; defer execution.
     * @param msg The message.
     */
    notify(msg) {
        this.player.onScreenDisplay.setActionBar(msg);
    }
    /**
     * Sends a message to player's chat screen.
     * @param msg The message.
     */
    message(msg) {
        this.player.sendMessage(msg);
    }
}
