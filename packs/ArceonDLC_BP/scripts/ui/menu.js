/*
 * Menus (sneak + right click with the wand, or /arc:menu).
 */
import { ItemStack } from '@minecraft/server';
import { PLACER, WAND } from '../core/access.js';
import { isBusy, redo, say, undo } from '../core/edit.js';
import { parseMask } from '../core/blocks.js';
import { runTool } from '../core/runner.js';
import { bindBrush, clearFrames, clearPoints, region, removeFramePoint, removePoint, save, session, setCorner, unbindBrush, volume } from '../core/session.js';
import { BRUSHES, GROUPS, TOOLS } from '../tools/index.js';
import { ask, menu } from './form.js';

const MODES = { points: '점 (곡선 도구)', cuboid: '영역 (pos1 / pos2)', loft: '로프트 프레임' };
const fmt = (p) => p ? `${p.x} ${p.y} ${p.z}` : '§7없음§r';

function status(player) {
    const s = session(player);
    const r = region(player);
    const lines = [
        `§e지팡이 모드§r: ${MODES[s.wandMode] ?? s.wandMode}`,
        `§dpos1§r ${fmt(s.pos1)}   §dpos2§r ${fmt(s.pos2)}${r ? ` §7(${volume(r)}블록)` : ''}`,
        `§a점§r ${s.points.length}개   §b로프트 프레임§r ${s.frames.length}개`,
    ];
    if (s.settings.gmask)
        lines.push(`§6전역 마스크§r ${s.settings.gmask}`);
    return lines.join('\n');
}

function give(player, id, msg) {
    try {
        player.getComponent('minecraft:inventory')?.container?.addItem(new ItemStack(id, 1));
        say(player, msg);
    }
    catch (e) {
        say(player, `§c아이템을 줄 수 없습니다: ${e?.message ?? e}`);
    }
}
export function giveWand(player) {
    give(player, WAND, '§a아르세온 지팡이를 받았습니다. §7우클릭: 점 추가 · 좌클릭: 처음부터 · 웅크리고 우클릭: 메뉴');
}

export async function openMenu(player) {
    const v = await menu(player, '아르세온 DLC', status(player), [
        { text: '선택 영역 · 점', icon: 'textures/items/blaze_rod', value: 'select' },
        ...GROUPS.map(g => ({ text: `${g.name}\n§8${g.desc}`, icon: g.icon, value: 'group:' + g.id })),
        { text: '텍스트', icon: 'textures/items/book_writable', value: 'tool:text' },
        { text: '에셋 (저장·배치)', icon: 'textures/blocks/structure_block', value: 'assets' },
        { text: '브러시', icon: 'textures/items/brush', value: 'brush' },
        { text: '되돌리기', icon: 'textures/items/clock_item', value: 'undo' },
        { text: '다시 하기', icon: 'textures/items/clock_item', value: 'redo' },
        { text: '설정', icon: 'textures/items/redstone_dust', value: 'settings' },
        { text: '지팡이 받기', icon: 'textures/items/blaze_rod', value: 'wand' },
    ]);
    if (!v)
        return;
    if (v === 'select')
        return selectionMenu(player);
    if (v.startsWith('group:'))
        return groupMenu(player, v.slice(6));
    if (v.startsWith('tool:'))
        return toolForm(player, TOOLS.find(t => t.id === v.slice(5)));
    if (v === 'assets')
        return assetsMenu(player);
    if (v === 'brush')
        return brushMenu(player);
    if (v === 'undo')
        return undo(player);
    if (v === 'redo')
        return redo(player);
    if (v === 'settings')
        return settingsMenu(player);
    if (v === 'wand')
        return giveWand(player);
}

async function groupMenu(player, group) {
    const g = GROUPS.find(x => x.id === group);
    const list = TOOLS.filter(t => t.group === group);
    const v = await menu(player, g.name, g.desc, [
        ...list.map(t => ({ text: t.name, icon: t.icon, value: t.id })),
        { text: '§8뒤로', value: '<' },
    ]);
    if (!v)
        return;
    if (v === '<')
        return openMenu(player);
    return toolForm(player, list.find(t => t.id === v));
}

function needsText(player, tool) {
    const s = session(player);
    if (tool.needs === 'points')
        return s.points.length >= (tool.minPoints ?? 2) ? `§a지팡이 점 ${s.points.length}개를 따라 만듭니다.` : (region(player) ? '§e점이 없어 pos1 → pos2 를 잇는 선을 씁니다.' : `§c점이 ${tool.minPoints ?? 2}개 이상 필요합니다 (지팡이 우클릭).`);
    if (tool.needs === 'cuboid') {
        const r = region(player);
        return r ? `§a선택 영역 ${fmt(r.min)} ~ ${fmt(r.max)} (${volume(r)}블록)` : '§c선택 영역(pos1/pos2)이 필요합니다.';
    }
    if (tool.needs === 'frames')
        return `§b로프트 프레임 ${s.frames.length}개`;
    return '';
}

export async function toolForm(player, tool) {
    if (!tool)
        return;
    if (tool.id === 'loft')
        return loftMenu(player, tool);
    if (tool.id === 'assets')
        return assetsMenu(player);
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const intro = [tool.desc, needsText(player, tool)].filter(Boolean).join('\n');
    const values = await ask(player, 'tool:' + tool.id, tool.name, tool.fields ?? [], { intro });
    if (!values)
        return;
    await runTool(player, tool, values);
}

// --------------------------------------------------------------------------
// selection
// --------------------------------------------------------------------------
async function selectionMenu(player) {
    const s = session(player);
    const v = await menu(player, '선택 영역 · 점', status(player) + '\n\n§78Crafter 선택 도구(나무 도끼 모양)로 찍은 pos1/pos2도 자동으로 따라옵니다.', [
        { text: `지팡이 모드 바꾸기\n§8지금: ${MODES[s.wandMode]}`, value: 'mode' },
        { text: 'pos1 = 내 위치', value: 'p1' },
        { text: 'pos2 = 내 위치', value: 'p2' },
        { text: '좌표 직접 입력', value: 'coords' },
        { text: '내 위치에 점 추가', value: 'addpt' },
        { text: '마지막 점 지우기', value: 'pop' },
        { text: '가장 가까운 점 지우기', value: 'popc' },
        { text: '점 모두 지우기', value: 'clear' },
        { text: '영역(pos1/pos2) 해제', value: 'unsel' },
        { text: '§8뒤로', value: '<' },
    ]);
    const here = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
    switch (v) {
        case undefined:
            return;
        case '<':
            return openMenu(player);
        case 'mode': {
            const r = await ask(player, 'wandmode', '지팡이 모드', [
                { key: 'mode', type: 'dropdown', label: '지팡이 모드', default: s.wandMode, options: Object.entries(MODES).map(([value, label]) => ({ value, label })) },
                { type: 'label', label: '§7점: 좌클릭 = 처음부터, 우클릭 = 점 추가\n영역: 좌클릭 = pos1, 우클릭 = pos2\n로프트: 좌클릭 = 새 프레임, 우클릭 = 프레임에 점 추가' },
            ], { submit: '바꾸기' });
            if (r) {
                s.wandMode = r.mode;
                save(player);
            }
            return selectionMenu(player);
        }
        case 'p1':
        case 'p2':
            setCorner(player, v === 'p1' ? 'pos1' : 'pos2', here);
            say(player, `§d${v === 'p1' ? 'pos1' : 'pos2'}§r = ${fmt(here)}`);
            return selectionMenu(player);
        case 'coords': {
            const r = await ask(player, 'coords', '좌표 직접 입력', [
                { key: 'a', type: 'text', label: 'pos1 (x y z)', default: s.pos1 ? fmt(s.pos1) : fmt(here) },
                { key: 'b', type: 'text', label: 'pos2 (x y z)', default: s.pos2 ? fmt(s.pos2) : fmt(here) },
            ], { submit: '저장' });
            if (r) {
                const parse = (t) => {
                    const n = String(t).trim().split(/[\s,]+/).map(Number);
                    return n.length === 3 && n.every(Number.isFinite) ? { x: n[0], y: n[1], z: n[2] } : null;
                };
                const a = parse(r.a), b = parse(r.b);
                if (!a || !b)
                    say(player, '§c좌표는 "x y z" 형식으로 입력하세요.');
                else {
                    setCorner(player, 'pos1', a);
                    setCorner(player, 'pos2', b);
                }
            }
            return selectionMenu(player);
        }
        case 'addpt':
            s.points.push(here);
            save(player);
            return selectionMenu(player);
        case 'pop':
            removePoint(player, false);
            return selectionMenu(player);
        case 'popc':
            removePoint(player, true);
            return selectionMenu(player);
        case 'clear':
            clearPoints(player);
            return selectionMenu(player);
        case 'unsel':
            s.pos1 = s.pos2 = null;
            save(player);
            return selectionMenu(player);
    }
}

async function loftMenu(player, tool) {
    const s = session(player);
    const v = await menu(player, '로프트', `${tool.desc}\n§b프레임 ${s.frames.length}개§r (${s.frames.map(f => f.length).join(', ') || '-'})\n§7지팡이 모드를 "로프트 프레임"으로 두고 좌클릭 = 새 프레임, 우클릭 = 점 추가`, [
        { text: '로프트 채우기 (set)', value: 'set' },
        { text: '지팡이를 로프트 모드로', value: 'mode' },
        { text: '마지막 점 지우기', value: 'pop' },
        { text: '가장 가까운 점 지우기 (-c)', value: 'popc' },
        { text: '프레임 모두 지우기 (clear)', value: 'clear' },
        { text: '§8뒤로', value: '<' },
    ]);
    switch (v) {
        case 'set': {
            const values = await ask(player, 'tool:loft', tool.name, tool.fields ?? [], { intro: needsText(player, tool) });
            if (values)
                await runTool(player, tool, values);
            return;
        }
        case 'mode':
            s.wandMode = 'loft';
            save(player);
            say(player, '§b지팡이: 로프트 모드');
            return;
        case 'pop':
            removeFramePoint(player, false);
            return loftMenu(player, tool);
        case 'popc':
            removeFramePoint(player, true);
            return loftMenu(player, tool);
        case 'clear':
            clearFrames(player);
            return loftMenu(player, tool);
        case '<':
            return groupMenu(player, 'shape');
    }
}

// --------------------------------------------------------------------------
// brushes
// --------------------------------------------------------------------------
function heldItem(player) {
    try {
        return player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
    }
    catch (e) {
        return undefined;
    }
}

async function brushMenu(player) {
    const s = session(player);
    const held = heldItem(player);
    const bound = Object.entries(s.brushes).map(([item, b]) => `§7${item.replace('minecraft:', '')}§r → ${BRUSHES.find(x => x.id === b.id)?.name ?? b.id}`);
    const body = `브러시는 §e지금 손에 든 아이템§r에 붙습니다. 그 아이템으로 우클릭하면 바라보는 곳에 적용됩니다.\n손에 든 것: ${held ? held.typeId.replace('minecraft:', '') : '§c없음'}\n${bound.length ? '\n' + bound.join('\n') : ''}`;
    const v = await menu(player, '브러시', body, [
        ...BRUSHES.map(b => ({ text: b.name, icon: b.icon, value: 'b:' + b.id })),
        { text: '손에 든 아이템의 브러시 해제', value: 'unbind' },
        { text: '모든 브러시 해제', value: 'unbindall' },
        { text: '§8뒤로', value: '<' },
    ]);
    if (!v)
        return;
    if (v === '<')
        return openMenu(player);
    if (v === 'unbind') {
        if (held)
            unbindBrush(player, held.typeId);
        return say(player, '§a브러시 해제');
    }
    if (v === 'unbindall') {
        s.brushes = {};
        save(player);
        return say(player, '§a모든 브러시 해제');
    }
    const brush = BRUSHES.find(b => b.id === v.slice(2));
    if (!held)
        return say(player, '§c브러시를 붙일 아이템을 손에 드세요 (블록이 아닌 아이템 권장).');
    if (held.typeId === WAND || held.typeId === PLACER || held.typeId === 'andexdb:selection_tool')
        return say(player, '§c이 아이템에는 브러시를 붙일 수 없습니다.');
    const values = await ask(player, 'brush:' + brush.id, brush.name, brush.fields ?? [], { intro: brush.desc, submit: '이 아이템에 붙이기' });
    if (!values)
        return;
    bindBrush(player, held.typeId, brush.id, values);
    say(player, `§a${brush.name}§r 을(를) ${held.typeId.replace('minecraft:', '')}에 붙였습니다. 우클릭으로 사용하세요.`);
}

// --------------------------------------------------------------------------
// assets
// --------------------------------------------------------------------------
async function assetsMenu(player) {
    const mod = TOOLS.find(t => t.id === 'assets')?.module;
    if (!mod)
        return;
    const names = mod.listAssets();
    const v = await menu(player, '에셋', `저장된 에셋 ${names.length}개${names.length ? ': §7' + names.slice(0, 30).join(', ') : ''}`, [
        { text: '선택 영역을 에셋으로 저장', value: 'save' },
        { text: '배치할 에셋 고르기', value: 'select' },
        { text: '에셋 배치기 받기', value: 'placer' },
        { text: '에셋 삭제', value: 'remove' },
        { text: '§8뒤로', value: '<' },
    ]);
    switch (v) {
        case 'save': {
            const r = await ask(player, 'asset:save', '에셋 저장', mod.SAVE_FIELDS, { submit: '저장' });
            if (r) {
                try {
                    say(player, await mod.saveAsset(player, String(r.name ?? '').trim(), r) ?? '§a저장했습니다.');
                }
                catch (e) {
                    say(player, `§c${e?.message ?? e}`);
                }
            }
            return;
        }
        case 'select': {
            if (!names.length)
                return say(player, '§c저장된 에셋이 없습니다.');
            const r = await ask(player, 'asset:select', '배치할 에셋', mod.PLACER_FIELDS, { submit: '고르기' });
            if (r) {
                try {
                    const picked = String(r.names ?? '').split(/[\s,]+/).filter(Boolean);
                    say(player, await mod.selectAsset(player, picked, r) ?? '§a골랐습니다.');
                }
                catch (e) {
                    say(player, `§c${e?.message ?? e}`);
                }
            }
            return;
        }
        case 'placer':
            return give(player, PLACER, '§a에셋 배치기를 받았습니다. §7블록을 우클릭하면 고른 에셋이 놓입니다.');
        case 'remove': {
            if (!names.length)
                return say(player, '§c저장된 에셋이 없습니다.');
            const r = await ask(player, 'asset:remove', '에셋 삭제', [
                { key: 'name', type: 'dropdown', label: '삭제할 에셋', default: names[0], options: names.map(n => ({ value: n, label: n })) },
            ], { submit: '삭제' });
            if (r) {
                try {
                    say(player, await mod.removeAsset(r.name) ?? `§a${r.name} 삭제`);
                }
                catch (e) {
                    say(player, `§c${e?.message ?? e}`);
                }
            }
            return;
        }
        case '<':
            return openMenu(player);
    }
}

// --------------------------------------------------------------------------
// settings
// --------------------------------------------------------------------------
async function settingsMenu(player) {
    const s = session(player);
    const r = await ask(player, 'settings', '설정', [
        { key: 'gmask', type: 'mask', label: '전역 마스크 (문지르기·채우기·브러시에 적용, 비우면 끔)', placeholder: '예: !air  /  #arcangle[0][40][1]', default: s.settings.gmask },
        { key: 'particles', type: 'toggle', label: '지팡이를 들면 점·곡선·영역 입자로 보기', default: s.settings.particles },
        { key: 'clearPalettes', type: 'toggle', label: `저장한 팔레트 모두 지우기 (${(s.settings.palettes ?? []).length}개)`, default: false },
    ], { submit: '저장' });
    if (!r)
        return;
    if (r.gmask) {
        try {
            parseMask(r.gmask);
        }
        catch (e) {
            return say(player, `§c마스크 오류: ${e.message}`);
        }
    }
    s.settings.gmask = r.gmask.trim();
    s.settings.particles = r.particles;
    if (r.clearPalettes)
        s.settings.palettes = [];
    s.forms.settings = {};
    save(player);
    say(player, '§a설정을 저장했습니다.');
}
