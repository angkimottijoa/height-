/*!
 * Debug Stick -- A Bedrock port of the debug stick tool from Java Edition.
 * Copyright (c) 2023-2026 Vincent Yanzee J. Tan <https://vytdev.github.io>
 *
 * This project is licensed under the MIT License.
 * This software is provided "as is" without warranty of any kind.
 * See LICENSE for the full terms.
 */
import { DebugPropertySelections } from './selection.js';
import { DebugStickContext } from './context.js';
import { cycleArray, defer, safeCall } from './utils.js';
import { describeStateValue, isIndependent, toIndependent, toVanilla, vanillaFamily, } from './independent.js';
import { world, } from '@minecraft/server';
/**
 * The debug stick's item identifier.
 */
export const DEBUG_STICK_ID = 'vyt:debug_stick';
/**
 * Vanilla fences, walls, panes and bars rebuild their connection shape
 * from their neighbours on every block update, so the debug stick can't
 * hold a value on them. Swap the block for the independent equivalent
 * the first time the stick touches it, then edit that instead.
 * @param ctx
 * @returns True when the block was converted this click.
 */
function convertIfNeeded(ctx) {
    if (!vanillaFamily(ctx.block.typeId))
        return false;
    const id = toIndependent(ctx.block);
    if (!id)
        return false;
    ctx.notify(`§a독립형으로 변환됨§r §7${id}§r\n§7이제 방향 상태가 고정됩니다`);
    return true;
}
/**
 * Turns an independent block back into the vanilla block it came from.
 * @param ctx
 */
export function revertToVanilla(ctx) {
    if (!isIndependent(ctx.block.typeId))
        return ctx.notify('§7독립형 블록이 아닙니다');
    const id = toVanilla(ctx.block);
    if (!id)
        return ctx.notify('§c이 버전에 없는 바닐라 블록이라 되돌릴 수 없습니다');
    ctx.notify(`§e바닐라로 되돌림§r §7${id}§r`);
}
/**
 * Change the selected block state.
 * @param ctx
 */
export function changeSelectedProperty(ctx) {
    if (convertIfNeeded(ctx))
        return;
    const props = ctx.getAllProps();
    const propNames = Object.keys(props);
    if (!propNames.length)
        return ctx.notify(`${ctx.block.typeId} has no properties`);
    // Cycle through all property names.
    const sels = new DebugPropertySelections(ctx.player.id);
    let currProp = sels.getForBlock(ctx.block.typeId);
    currProp = cycleArray(propNames, currProp);
    sels.setForBlock(ctx.block.typeId, currProp);
    const shown = describeStateValue(ctx.block.typeId, currProp, props[currProp]);
    ctx.notify(`selected "${currProp}" (${shown})`);
}
/**
 * Cycle the state value of the selected state on a block.
 * @param ctx
 */
export function updateBlockProperty(ctx) {
    if (convertIfNeeded(ctx))
        return;
    const props = ctx.getAllProps();
    const propNames = Object.keys(props);
    if (!propNames.length)
        return ctx.notify(`${ctx.block.typeId} has no properties`);
    // Get the currenty selected property.
    const sels = new DebugPropertySelections(ctx.player.id);
    const currProp = sels.getForBlock(ctx.block.typeId) ?? propNames[0];
    // Cycle through property values.
    const validVals = DebugStickContext.getPropValidValues(currProp, ctx.block);
    const newVal = cycleArray(validVals, props[currProp]);
    ctx.setBlockProp(currProp, newVal);
    ctx.notify(`"${currProp}" to ${describeStateValue(ctx.block.typeId, currProp, newVal)}`);
}
/**
 * The block viewer feature
 * @param ctx
 */
export function displayBlockInfo(ctx) {
    const block = ctx.block;
    let info = '§l§b' + block.typeId + '§r';
    // Basic block info.
    info += '\n§4' + block.x + ' §a' + block.y + ' §9' + block.z;
    info += '\n§o§7redstone power§r§8: §c' + (block.getRedstonePower() ?? 0);
    // The set block states.
    for (const [prop, value] of Object.entries(ctx.getAllProps())) {
        info += '\n§7' + prop + '§r§8: ';
        switch (typeof value) {
            case 'string':
                info += '§e';
                break;
            case 'number':
                info += '§3';
                break;
            case 'boolean':
                info += '§6';
                break;
            default: info += '§8';
        }
        info += value;
    }
    ;
    // Additional block tags.
    block.getTags().forEach(v => info += '\n§d#' + v);
    ctx.notify(info);
}
// Java behaviour:
// - left-click = select property
// - right-click = change state value
// - shift + (left-or-right-)click = cycle in reverse
// This behaviour:
// - left-click = select property
// - right-click = change state value
// - shift + right-click = block viewer
// - shift + left-click = turn an independent block back into vanilla
//
// A vanilla fence/wall/pane/bars is swapped for its independent
// equivalent on the first left- or right-click; see independent.js.
let isEnabled = false;
let blockInteractListener;
let breakBlockListener;
/**
 * Registers event listeners for vyt:debug_stick.
 */
export function enableDebugStick() {
    if (isEnabled)
        return;
    isEnabled = true;
    // Short tap/click triggers.
    blockInteractListener = world.beforeEvents
        .playerInteractWithBlock.subscribe(ev => {
        if (ev.itemStack?.typeId != DEBUG_STICK_ID)
            return;
        ev.cancel = true;
        const ctx = new DebugStickContext(ev.block, ev.player, ev);
        defer(() => {
            let isError, result;
            if (ev.player.isSneaking)
                [isError, result] = safeCall(displayBlockInfo, ctx);
            else
                [isError, result] = safeCall(updateBlockProperty, ctx);
            if (isError)
                ev.player.sendMessage('§c' + result);
        });
    });
    // Long press/block break triggers.
    breakBlockListener = world.beforeEvents
        .playerBreakBlock.subscribe(ev => {
        if (ev.itemStack?.typeId != DEBUG_STICK_ID)
            return;
        ev.cancel = true;
        const ctx = new DebugStickContext(ev.block, ev.player, ev);
        defer(() => {
            let isError, result;
            if (ev.player.isSneaking)
                [isError, result] = safeCall(revertToVanilla, ctx);
            else
                [isError, result] = safeCall(changeSelectedProperty, ctx);
            if (isError)
                ev.player.sendMessage('§c' + result);
        });
    });
}
/**
 * Deregisters event listeners for vyt:debug_stick.
 */
export function disableDebugStick() {
    if (!isEnabled)
        return;
    isEnabled = false;
    world.beforeEvents.playerInteractWithBlock
        .unsubscribe(blockInteractListener);
    world.beforeEvents.playerBreakBlock
        .unsubscribe(breakBlockListener);
}
