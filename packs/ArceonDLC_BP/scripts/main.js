/*
 * Arceon DLC for 8Crafter's Server Utilities: entry point.
 *
 *   arc:wand            right click = add point, left click = first point / new frame,
 *                       sneak + right click = menu
 *   andexdb:selection_tool   (8Crafter) its pos1/pos2 clicks are mirrored here
 *   arc:asset_placer    places the chosen assets
 *   any item with a brush bound to it   right click = use the brush
 *   /arc:menu  /arc:wand  /arc:undo  /arc:redo
 */
import { CommandPermissionLevel, CustomCommandStatus, system, world } from '@minecraft/server';
import { addFramePoint, addPoint, clearPoints, mirrorSelectionTool, newFrame, session, setCorner } from './core/session.js';
import { isBusy, redo, runAsync, say, undo } from './core/edit.js';
import { finish, makeContext, runBrush } from './core/runner.js';
import { BRUSHES, TOOLS } from './tools/index.js';
import { giveWand, openMenu } from './ui/menu.js';
import { preview } from './ui/preview.js';
import { allowed, PLACER, WAND } from './core/access.js';
const SELECTION_TOOL = 'andexdb:selection_tool';

const fl = (p) => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
const fmt = (p) => `${p.x} ${p.y} ${p.z}`;
function bar(player, msg) {
    try {
        player.onScreenDisplay.setActionBar(msg);
    }
    catch (e) {
        say(player, msg);
    }
}

// one action per tick per player (item use and block interaction both fire)
const lastAction = new Map();
function once(player) {
    const t = system.currentTick;
    if (lastAction.get(player.id) === t)
        return false;
    lastAction.set(player.id, t);
    return true;
}

function lookedAt(player) {
    try {
        return player.getBlockFromViewDirection({ maxDistance: 300, includeLiquidBlocks: false, includePassableBlocks: true })?.block;
    }
    catch (e) {
        return undefined;
    }
}

/** Wand right click on a block (or the block looked at). */
function wandRight(player, pos) {
    const s = session(player);
    if (s.wandMode === 'cuboid') {
        setCorner(player, 'pos2', pos);
        bar(player, `§d2번 지점§r ${fmt(fl(pos))}`);
    }
    else if (s.wandMode === 'loft') {
        const n = addFramePoint(player, pos);
        bar(player, `§b프레임 ${s.frames.length}§r 점 ${n}개 (${fmt(fl(pos))})`);
    }
    else {
        const n = addPoint(player, pos);
        bar(player, `§a점 ${n}§r 추가 (${fmt(fl(pos))})`);
    }
}
/** Wand left click on a block. */
function wandLeft(player, pos) {
    const s = session(player);
    if (s.wandMode === 'cuboid') {
        setCorner(player, 'pos1', pos);
        bar(player, `§d1번 지점§r ${fmt(fl(pos))}`);
    }
    else if (s.wandMode === 'loft') {
        const n = newFrame(player, pos);
        bar(player, `§b새 프레임 ${n}§r (${fmt(fl(pos))})`);
    }
    else {
        clearPoints(player);
        addPoint(player, pos);
        bar(player, `§a점 초기화§r, 첫 점 ${fmt(fl(pos))}`);
    }
}

// --------------------------------------------------------------------------
// events
// --------------------------------------------------------------------------
world.beforeEvents.itemUse.subscribe(ev => {
    const player = ev.source;
    const item = ev.itemStack;
    if (!item || player?.typeId !== 'minecraft:player')
        return;
    const id = item.typeId;
    if (id === SELECTION_TOOL) {
        // 8Crafter handles (and cancels) it; we only copy the corner
        mirrorSelectionTool(player);
        return;
    }
    if (id === WAND) {
        ev.cancel = true;
        const sneaking = player.isSneaking;
        const block = sneaking ? undefined : lookedAt(player);
        system.run(() => {
            if (!allowed(player))
                return say(player, '§c아르세온 도구는 관리자(OP)나 "arceon" 태그가 있는 플레이어만 쓸 수 있습니다.');
            if (sneaking)
                return void openMenu(player);
            if (!once(player))
                return;
            if (!block)
                return bar(player, '§c블록을 바라보세요 (최대 300칸)');
            wandRight(player, block.location);
        });
        return;
    }
    if (id === PLACER) {
        ev.cancel = true;
        let hit;
        try {
            hit = player.getBlockFromViewDirection({ maxDistance: 300, includeLiquidBlocks: false, includePassableBlocks: true });
        }
        catch (e) { }
        system.run(() => {
            if (!allowed(player) || !hit?.block || !once(player))
                return;
            placeAsset(player, hit.block.location, hit.face);
        });
        return;
    }
    const s = session(player);
    const bound = s.brushes[id];
    if (bound) {
        ev.cancel = true;
        const block = lookedAt(player);
        system.run(() => {
            if (!allowed(player) || !once(player))
                return;
            const brush = BRUSHES.find(b => b.id === bound.id);
            if (!brush)
                return say(player, '§c브러시를 찾을 수 없습니다.');
            if (!block)
                return bar(player, '§c블록을 바라보세요 (최대 300칸)');
            runBrush(player, brush, bound.values, fl(block.location));
        });
    }
});

world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    const id = ev.itemStack?.typeId;
    if (id !== WAND && id !== PLACER)
        return;
    ev.cancel = true;
    if (!ev.isFirstEvent)
        return;
    const player = ev.player;
    const pos = { ...ev.block.location };
    const face = ev.blockFace;
    const sneaking = player.isSneaking;
    system.run(() => {
        if (!allowed(player))
            return;
        if (id === WAND && sneaking)
            return void openMenu(player);
        if (!once(player))
            return;
        if (id === WAND)
            wandRight(player, pos);
        else
            placeAsset(player, pos, face);
    });
});

world.beforeEvents.playerBreakBlock.subscribe(ev => {
    if (ev.itemStack?.typeId !== WAND)
        return;
    ev.cancel = true;
    const player = ev.player;
    const pos = { ...ev.block.location };
    system.run(() => {
        if (allowed(player) && once(player))
            wandLeft(player, pos);
    });
});

// survival: hitting a block does not break it at once, so use the hit
world.afterEvents.entityHitBlock.subscribe(ev => {
    const player = ev.damagingEntity;
    if (player?.typeId !== 'minecraft:player')
        return;
    let item;
    try {
        item = player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
    }
    catch (e) { }
    if (item?.typeId !== WAND || !allowed(player) || !once(player))
        return;
    wandLeft(player, ev.hitBlock.location);
});

async function placeAsset(player, pos, face) {
    const assets = TOOLS.find(t => t.id === 'assets');
    const mod = assets?.module;
    if (!mod?.placeAsset)
        return say(player, '§c에셋 도구가 없습니다.');
    if (isBusy(player))
        return;
    const ctx = makeContext(player, {});
    try {
        await runAsync(mod.placeAsset(ctx, { ...fl(pos), face }));
    }
    catch (e) {
        return say(player, `§c에셋: ${e?.message ?? e}`);
    }
    await finish(player, '에셋 배치', ctx.edit);
}

// --------------------------------------------------------------------------
// commands
// --------------------------------------------------------------------------
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    const cmds = [
        ['arc:menu', '아르세온 DLC 메뉴 열기', (p) => openMenu(p)],
        ['arc:wand', '아르세온 지팡이 받기', (p) => giveWand(p)],
        ['arc:undo', '아르세온 작업 되돌리기', (p) => undo(p)],
        ['arc:redo', '아르세온 작업 다시 하기', (p) => redo(p)],
    ];
    for (const [name, description, fn] of cmds) {
        customCommandRegistry.registerCommand({
            name, description,
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false,
        }, (origin) => {
            const player = origin.sourceEntity;
            if (player?.typeId !== 'minecraft:player')
                return { status: CustomCommandStatus.Failure, message: '플레이어만 쓸 수 있습니다' };
            system.run(() => {
                if (!allowed(player))
                    return say(player, '§c아르세온 도구는 관리자(OP)나 "arceon" 태그가 있는 플레이어만 쓸 수 있습니다.');
                fn(player);
            });
            return { status: CustomCommandStatus.Success };
        });
    }
});

// points / curve / selection preview while holding the wand
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const item = player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
            if (item?.typeId === WAND && session(player).settings.particles)
                preview(player);
        }
        catch (e) { }
    }
}, 10);

