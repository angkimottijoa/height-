/*
 * Arceon DLC for 8Crafter's Server Utilities: entry point.
 *
 * Every tool is its own item. "Tap" is a light touch on mobile (use /
 * right click on PC), "break" is holding to break (left click on PC).
 *
 *   arc:wand          선택 지팡이   area mode:  tap = pos1, break = pos2
 *                                  curve mode: tap = add point, break = undo last point
 *                                  sneak + break = switch area / curve mode
 *   arc:frame_picker  프레임 피커   tap = add point, break = undo point, sneak + break = save frame
 *   arc:block_picker  블록 피커     tap = remember the block, break = forget the last one
 *   arc:clipboard     클립보드 도구 tap = paste (outline shown), break = copy selection,
 *                                  sneak + break = turn 90°
 *   arc:asset_placer  에셋 도구     tap = place asset, break = save selection as asset
 *   arc:terrain_tool  지형 도구     tap = terrain menu
 *   sneak + tap with any of them opens its menu.
 *   any item with a brush bound to it: tap = use the brush
 *   andexdb:selection_tool (8Crafter): its pos1/pos2 clicks are mirrored here
 *   /arc:menu  /arc:tools  /arc:undo  /arc:redo
 */
import { CommandPermissionLevel, CustomCommandStatus, system, world } from '@minecraft/server';
import { addFramePoint, addPoint, clearPoints, frameCount, mirrorSelectionTool, region, removePoint, save, saveFrame, session, setCorner, undoFramePoint } from './core/session.js';
import { isBusy, redo, runAsync, say, undo } from './core/edit.js';
import { finish, makeContext, runBrush } from './core/runner.js';
import { anchorFor, copyRegion, getClip, pasteClip, setClip } from './core/clipboard.js';
import { permToString } from './core/blocks.js';
import { BRUSHES, TOOLS } from './tools/index.js';
import { assetSaveForm, assetsMenu, blockPickerMenu, clipboardMenu, frameMenu, giveTools, openMenu, terrainMenu, wandMenu } from './ui/menu.js';
import { preview } from './ui/preview.js';
import { allowed, BLOCK_PICKER, CLIPBOARD, FRAME_PICKER, ITEMS, PLACER, TERRAIN, WAND } from './core/access.js';

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

// Holding a finger down (or a mouse button) repeats taps and breaks every
// few ticks. Only the first event of a press acts: every event pushes the
// window on, so a long hold stays one action.
const last = new Map();
function press(player, kind, ticks) {
    const k = player.id + kind;
    const t = system.currentTick;
    const prev = last.get(k);
    last.set(k, t);
    return prev === undefined || t - prev > ticks;
}

function raycast(player) {
    try {
        return player.getBlockFromViewDirection({ maxDistance: 300, includeLiquidBlocks: false, includePassableBlocks: true });
    }
    catch (e) {
        return undefined;
    }
}

// --------------------------------------------------------------------------
// actions per item
// --------------------------------------------------------------------------
const TAP = {
    [WAND](player, hit, sneaking) {
        if (sneaking)
            return void wandMenu(player);
        if (!hit)
            return bar(player, '§c블록을 바라보세요 (최대 300칸)');
        if (session(player).wandMode === 'points') {
            const n = addPoint(player, hit.pos);
            return bar(player, `§a[곡선 점] ${n}개§r ${fmt(hit.pos)}  §7부수기 = 마지막 점 취소`);
        }
        setCorner(player, 'pos1', hit.pos);
        bar(player, `§d[영역] 1번 지점§r ${fmt(hit.pos)}  §7부수기 = 2번 지점`);
    },
    [FRAME_PICKER](player, hit, sneaking) {
        if (sneaking)
            return void frameMenu(player);
        if (!hit)
            return bar(player, '§c블록을 바라보세요 (최대 300칸)');
        const n = addFramePoint(player, hit.pos);
        bar(player, `§b프레임 ${frameCount(player)}§r 점 ${n}개 ${fmt(hit.pos)}  §7(웅크리고 부수기 = 프레임 저장)`);
    },
    [BLOCK_PICKER](player, hit, sneaking) {
        if (sneaking)
            return void blockPickerMenu(player);
        if (!hit)
            return bar(player, '§c블록을 바라보세요');
        const s = session(player);
        const picks = s.settings.picks ?? (s.settings.picks = []);
        const t = permToString(hit.block.permutation);
        if (picks.some(p => p.t === t))
            return bar(player, `§e이미 고른 블록: ${t}`);
        if (picks.length >= 27)
            picks.shift();
        picks.push({ t, on: false });
        save(player);
        bar(player, `§a블록 저장 ${picks.length}개§r: ${t}`);
    },
    [CLIPBOARD](player, hit, sneaking) {
        if (sneaking)
            return void clipboardMenu(player);
        if (!hit)
            return bar(player, '§c붙여넣을 블록을 바라보세요');
        const clip = getClip(player);
        if (!clip)
            return bar(player, '§c클립보드가 비어 있습니다. 부수기 = 선택 영역 복사');
        return paste(player, clip, anchorFor(hit.pos, hit.face));
    },
    [PLACER](player, hit, sneaking) {
        if (sneaking)
            return void assetsMenu(player);
        if (!hit)
            return bar(player, '§c블록을 바라보세요');
        placeAsset(player, hit.pos, hit.face);
    },
    [TERRAIN](player) {
        terrainMenu(player);
    },
};

const BREAK = {
    [WAND](player, pos, sneaking) {
        const s = session(player);
        if (sneaking) {
            s.wandMode = s.wandMode === 'points' ? 'cuboid' : 'points';
            save(player);
            return bar(player, s.wandMode === 'points'
                ? '§a곡선 점 모드 켬§r  터치 = 점 추가, 부수기 = 마지막 점 취소'
                : '§d영역 모드§r (곡선 점 모드 끔)  터치 = 1번, 부수기 = 2번');
        }
        if (s.wandMode === 'points') {
            const had = s.points.length;
            removePoint(player, false);
            return bar(player, had ? `§e[곡선 점] 마지막 점 취소§r (남은 점 ${had - 1}개)` : '§7[곡선 점] 지울 점이 없습니다');
        }
        setCorner(player, 'pos2', pos);
        bar(player, `§d[영역] 2번 지점§r ${fmt(pos)}`);
    },
    [FRAME_PICKER](player, pos, sneaking) {
        if (sneaking) {
            const n = saveFrame(player);
            return bar(player, `§b프레임 ${n}개 저장됨§r  §7다음 터치부터 새 프레임`);
        }
        undoFramePoint(player);
        bar(player, `§e마지막 점 취소§r (프레임 ${frameCount(player)}개)`);
    },
    [BLOCK_PICKER](player) {
        const s = session(player);
        const p = (s.settings.picks ?? []).pop();
        save(player);
        bar(player, p ? `§e블록 빼기§r: ${p.t}` : '§7고른 블록이 없습니다');
    },
    [CLIPBOARD](player, pos, sneaking) {
        if (sneaking) {
            const clip = getClip(player);
            if (!clip)
                return bar(player, '§c클립보드가 비어 있습니다');
            clip.turns = (clip.turns + 1) % 4;
            return bar(player, `§a클립보드 회전: ${clip.turns * 90}°`);
        }
        return copy(player);
    },
    [PLACER](player) {
        assetSaveForm(player);
    },
    [TERRAIN]() { },
};

async function copy(player) {
    const r = region(player);
    if (!r)
        return bar(player, '§c선택 영역(1번·2번 지점)이 없습니다');
    if (isBusy(player))
        return;
    const ctx = makeContext(player, {});
    const clip = await runAsync(copyRegion(ctx.edit, r, '복사'));
    if (!clip)
        return bar(player, '§c복사할 블록이 없습니다');
    setClip(player, clip);
    say(player, `§a클립보드에 복사: ${clip.cells.filter(c => !c[3].type.id.endsWith(':air')).length}블록 §7(터치 = 붙여넣기, 웅크리고 부수기 = 90° 회전)`);
}

async function paste(player, clip, at) {
    if (isBusy(player))
        return;
    const ctx = makeContext(player, {});
    await runAsync(pasteClip(ctx.edit, clip, at));
    await finish(player, '붙여넣기', ctx.edit);
}

async function placeAsset(player, pos, face) {
    const mod = TOOLS.find(t => t.id === 'assets')?.module;
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

function deny(player) {
    say(player, '§c아르세온 도구는 관리자(OP)나 "arceon" 태그가 있는 플레이어만 쓸 수 있습니다.');
}

// --------------------------------------------------------------------------
// events
// --------------------------------------------------------------------------
function heldBrush(player, id) {
    if (ITEMS.includes(id))
        return null;
    const bound = session(player).brushes[id];
    return bound ? { bound, brush: BRUSHES.find(b => b.id === bound.id) } : null;
}

function tap(player, id, hit, sneaking) {
    if (!allowed(player))
        return deny(player);
    if (!press(player, 'tap', 6))
        return;
    if (TAP[id])
        return TAP[id](player, hit, sneaking);
    const b = heldBrush(player, id);
    if (b) {
        if (!b.brush)
            return say(player, '§c브러시를 찾을 수 없습니다.');
        if (!hit)
            return bar(player, '§c블록을 바라보세요 (최대 300칸)');
        runBrush(player, b.brush, b.bound.values, hit.pos);
    }
}

world.beforeEvents.itemUse.subscribe(ev => {
    const player = ev.source;
    const id = ev.itemStack?.typeId;
    if (!id || player?.typeId !== 'minecraft:player')
        return;
    if (id === SELECTION_TOOL) {
        // 8Crafter handles (and cancels) it; we only copy the corner
        mirrorSelectionTool(player);
        return;
    }
    if (!TAP[id] && !heldBrush(player, id))
        return;
    ev.cancel = true;
    const sneaking = player.isSneaking;
    const r = raycast(player);
    const hit = r?.block ? { pos: fl(r.block.location), face: r.face, block: r.block } : null;
    system.run(() => tap(player, id, hit, sneaking));
});

world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    const id = ev.itemStack?.typeId;
    const player = ev.player;
    if (!id || (!TAP[id] && !heldBrush(player, id)))
        return;
    ev.cancel = true;
    if (!ev.isFirstEvent)
        return;
    const hit = { pos: fl(ev.block.location), face: ev.blockFace, block: ev.block };
    const sneaking = player.isSneaking;
    system.run(() => tap(player, id, hit, sneaking));
});

function brk(player, id, pos, sneaking) {
    if (!allowed(player))
        return deny(player);
    if (!press(player, 'break', 8))
        return;
    BREAK[id](player, pos, sneaking);
}

world.beforeEvents.playerBreakBlock.subscribe(ev => {
    const id = ev.itemStack?.typeId;
    if (!BREAK[id])
        return;
    ev.cancel = true;
    const player = ev.player;
    const pos = fl(ev.block.location);
    const sneaking = player.isSneaking;
    system.run(() => brk(player, id, pos, sneaking));
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
    if (!BREAK[item?.typeId])
        return;
    brk(player, item.typeId, fl(ev.hitBlock.location), player.isSneaking);
});

// --------------------------------------------------------------------------
// commands
// --------------------------------------------------------------------------
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    const cmds = [
        ['arc:menu', '아르세온 DLC 전체 메뉴 열기', (p) => openMenu(p)],
        ['arc:tools', '에디터 도구 아이템 6개 받기', (p) => giveTools(p)],
        ['arc:wand', '선택 지팡이 받기', (p) => giveTools(p, [WAND])],
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
                    return deny(player);
                fn(player);
            });
            return { status: CustomCommandStatus.Success };
        });
    }
});

// preview while one of the tools is held
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const item = player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
            if (item && ITEMS.includes(item.typeId) && session(player).settings.particles)
                preview(player, item.typeId);
        }
        catch (e) { }
    }
}, 10);

