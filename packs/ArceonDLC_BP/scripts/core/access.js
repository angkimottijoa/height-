/*
 * Item ids and who may use the tools.
 */
import { PlayerPermissionLevel } from '@minecraft/server';

export const WAND = 'arc:wand';
export const FRAME_PICKER = 'arc:frame_picker';
export const BLOCK_PICKER = 'arc:block_picker';
export const PLACER = 'arc:asset_placer';
export const TERRAIN = 'arc:terrain_tool';
export const CLIPBOARD = 'arc:clipboard';
export const ITEMS = [WAND, FRAME_PICKER, BLOCK_PICKER, CLIPBOARD, PLACER, TERRAIN];

/** Operators, or players with the "arceon" (or "worldedit") tag. */
export function allowed(player) {
    try {
        if (player.playerPermissionLevel >= PlayerPermissionLevel.Operator)
            return true;
    }
    catch (e) { }
    try {
        return player.hasTag('arceon') || player.hasTag('worldedit');
    }
    catch (e) {
        return false;
    }
}
