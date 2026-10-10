/*
 * Item ids and who may use the tools.
 */
import { PlayerPermissionLevel } from '@minecraft/server';

export const WAND = 'arc:wand';
export const PLACER = 'arc:asset_placer';

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
