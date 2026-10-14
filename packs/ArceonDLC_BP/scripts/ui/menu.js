/*
 * Menus. Sneak + tap with a tool item opens that tool's menu; /arc:menu
 * opens everything.
 */
import { ItemStack } from '@minecraft/server';
import { BLOCK_PICKER, CLIPBOARD, FRAME_PICKER, ITEMS, PLACER, TERRAIN, WAND, YARD } from '../core/access.js';
import { isBusy, redo, say, undo } from '../core/edit.js';
import { parseMask } from '../core/blocks.js';
import { clearClip, getClip } from '../core/clipboard.js';
import { runTool } from '../core/runner.js';
import { bindBrush, clearFrames, clearPoints, frameCount, region, removeFramePoint, removePoint, save, saveFrame, session, setCorner, unbindBrush, UNLOCK_CODE, unlocked, volume } from '../core/session.js';
import { BRUSHES, GROUPS, TOOLS } from '../tools/index.js';
import { ask, menu } from './form.js';

const ITEM_NAMES = {
    [WAND]: '선택 지팡이', [FRAME_PICKER]: '프레임 피커', [BLOCK_PICKER]: '블록 피커',
    [CLIPBOARD]: '클립보드 도구', [PLACER]: '에셋 도구', [TERRAIN]: '지형 도구', [YARD]: '배선 도구',
};
const fmt = (p) => p ? `${p.x} ${p.y} ${p.z}` : '§7없음§r';
const back = { text: '§8← 뒤로', value: '<' };

function status(player) {
    const s = session(player);
    const r = region(player);
    const lines = [
        `§e선택 지팡이§r: ${s.wandMode === 'points' ? '§a곡선 점 모드 (켜짐)' : '§d영역 모드'}§r  §7웅크리고 부수기 = 전환`,
        `§d1번§r ${fmt(s.pos1)}   §d2번§r ${fmt(s.pos2)}${r ? ` §7(${volume(r)}블록)` : ''}`,
        `§a곡선 점§r ${s.points.length}개   §b프레임§r ${frameCount(player)}개   §f클립보드§r ${getClip(player) ? getClip(player).cells.length + '칸' : '비어 있음'}`,
    ];
    if (s.settings.gmask)
        lines.push(`§6전역 마스크§r ${s.settings.gmask}`);
    return lines.join('\n');
}

/** Give tool items (all six by default). */
export function giveTools(player, ids = null) {
    ids = ids ?? (unlocked(player) ? [...ITEMS, YARD] : ITEMS);
    const inv = player.getComponent('minecraft:inventory')?.container;
    for (const id of ids) {
        try {
            inv?.addItem(new ItemStack(id, 1));
        }
        catch (e) {
            say(player, `§c${ITEM_NAMES[id]}을(를) 줄 수 없습니다: ${e?.message ?? e}`);
        }
    }
    say(player, `§a받음: ${ids.map(i => ITEM_NAMES[i]).join(', ')}\n§7터치 = 기본 동작, 부수기 = 두 번째 동작, 웅크리고 터치 = 그 도구의 메뉴`);
}

// --------------------------------------------------------------------------
// main menus
// --------------------------------------------------------------------------
/** Everything (/arc:menu). */
export async function openMenu(player) {
    const v = await menu(player, '아르세온 DLC', status(player), [
        { text: '선택 영역 · 곡선 점', icon: 'textures/items/blaze_rod', value: 'select' },
        ...GROUPS.map(g => ({ text: `${g.name}\n§8${g.desc}`, icon: g.icon, value: 'group:' + g.id })),
        { text: '글자 쓰기', icon: 'textures/items/book_writable', value: 'tool:text' },
        { text: '클립보드 (복사·붙여넣기)', icon: 'textures/items/paper', value: 'clip' },
        { text: '블록 피커 (고른 블록)', icon: 'textures/items/spyglass', value: 'picker' },
        { text: '에셋 (구조물 저장·배치)', icon: 'textures/blocks/structure_block', value: 'assets' },
        { text: '브러시', icon: 'textures/items/brush', value: 'brush' },
        { text: '되돌리기', icon: 'textures/items/clock_item', value: 'undo' },
        { text: '다시 하기', icon: 'textures/items/clock_item', value: 'redo' },
        { text: '설정', icon: 'textures/items/redstone_dust', value: 'settings' },
        { text: '도구 아이템 받기', icon: 'textures/items/blaze_rod', value: 'give' },
    ]);
    return route(player, v, openMenu);
}

/** Sneak + tap with the selection wand. */
export async function wandMenu(player) {
    const s = session(player);
    const on = s.wandMode === 'points';
    const v = await menu(player, '선택 지팡이', status(player), [
        { text: on ? '곡선 점 모드 끄기 → 영역 모드' : '곡선 점 모드 켜기', icon: 'textures/items/blaze_rod', value: 'mode' },
        ...GROUPS.filter(g => g.id !== 'terrain' && g.id !== 'frame').map(g => ({ text: `${g.name}\n§8${g.desc}`, icon: g.icon, value: 'group:' + g.id })),
        { text: '글자 쓰기', icon: 'textures/items/book_writable', value: 'tool:text' },
        { text: '선택 영역 · 곡선 점 관리', icon: 'textures/items/blaze_rod', value: 'select' },
        { text: '브러시', icon: 'textures/items/brush', value: 'brush' },
        { text: '되돌리기', icon: 'textures/items/clock_item', value: 'undo' },
        { text: '다시 하기', icon: 'textures/items/clock_item', value: 'redo' },
        { text: '설정', icon: 'textures/items/redstone_dust', value: 'settings' },
        { text: '도구 아이템 받기', icon: 'textures/items/blaze_rod', value: 'give' },
    ]);
    if (v === 'mode') {
        s.wandMode = on ? 'cuboid' : 'points';
        save(player);
        say(player, s.wandMode === 'points' ? '§a곡선 점 모드 켬§r: 터치 = 점 추가, 부수기 = 마지막 점 취소' : '§d영역 모드§r: 터치 = 1번 지점, 부수기 = 2번 지점');
        return;
    }
    return route(player, v, wandMenu);
}

async function route(player, v, from) {
    if (!v)
        return;
    if (v === 'select')
        return selectionMenu(player, from);
    if (v.startsWith('group:'))
        return groupMenu(player, v.slice(6), from);
    if (v.startsWith('tool:'))
        return toolForm(player, TOOLS.find(t => t.id === v.slice(5)));
    switch (v) {
        case 'clip': return clipboardMenu(player);
        case 'picker': return blockPickerMenu(player);
        case 'assets': return assetsMenu(player);
        case 'brush': return brushMenu(player, from);
        case 'undo': return undo(player);
        case 'redo': return redo(player);
        case 'settings': return settingsMenu(player);
        case 'give': return giveMenu(player);
    }
}

async function giveMenu(player) {
    const v = await menu(player, '도구 아이템 받기', '§7터치 = 기본 동작, 부수기 = 두 번째 동작, 웅크리고 터치 = 메뉴', [
        { text: '전부 받기', value: 'all' },
        ...ITEMS.map(id => ({ text: ITEM_NAMES[id], value: id })),
    ]);
    if (!v)
        return;
    giveTools(player, v === 'all' ? ITEMS : [v]);
}

async function groupMenu(player, group, from = openMenu) {
    const g = GROUPS.find(x => x.id === group);
    const list = TOOLS.filter(t => t.group === group);
    const v = await menu(player, g.name, g.desc, [
        ...list.map(t => ({ text: t.name, icon: t.icon, value: t.id })),
        back,
    ]);
    if (!v)
        return;
    if (v === '<')
        return from(player);
    return toolForm(player, list.find(t => t.id === v));
}

function needsText(player, tool) {
    const s = session(player);
    if (tool.needs === 'points')
        return s.points.length >= (tool.minPoints ?? 2) ? `§a곡선 점 ${s.points.length}개를 따라 만듭니다.` : `§c곡선 점이 ${tool.minPoints ?? 2}개 이상 필요합니다 (선택 지팡이를 곡선 점 모드로 켜고 터치).`;
    if (tool.needs === 'cuboid') {
        const r = region(player);
        return r ? `§a선택 영역 ${fmt(r.min)} ~ ${fmt(r.max)} (${volume(r)}블록)` : '§c선택 영역(1번·2번 지점)이 필요합니다.';
    }
    if (tool.needs === 'frames')
        return `§b프레임 ${frameCount(player)}개`;
    return '';
}

export async function toolForm(player, tool) {
    if (!tool)
        return;
    if (tool.id === 'assets')
        return assetsMenu(player);
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const intro = [tool.desc, needsText(player, tool)].filter(Boolean).join('\n');
    const values = await ask(player, 'tool:' + tool.id, tool.name, (tool.fieldsFor ? tool.fieldsFor(player) : tool.fields) ?? [], { intro });
    if (!values)
        return;
    // tools may ask follow-up questions that depend on the first answers
    if (tool.more) {
        const extra = await tool.more(player, values);
        if (!extra)
            return;
        Object.assign(values, extra);
    }
    await runTool(player, tool, values);
}

// --------------------------------------------------------------------------
// selection
// --------------------------------------------------------------------------
async function selectionMenu(player, from = openMenu) {
    const s = session(player);
    const v = await menu(player, '선택 영역 · 곡선 점', status(player) + '\n\n§78Crafter 선택 도구로 찍은 1번·2번 지점도 자동으로 따라옵니다.', [
        { text: '1번 지점 = 내 위치', value: 'p1' },
        { text: '2번 지점 = 내 위치', value: 'p2' },
        { text: '좌표 직접 입력', value: 'coords' },
        { text: '내 위치에 곡선 점 추가', value: 'addpt' },
        { text: '마지막 곡선 점 지우기', value: 'pop' },
        { text: '가장 가까운 곡선 점 지우기', value: 'popc' },
        { text: '곡선 점 모두 지우기', value: 'clear' },
        { text: '선택 영역 해제', value: 'unsel' },
        back,
    ]);
    const here = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
    const again = () => selectionMenu(player, from);
    switch (v) {
        case undefined:
            return;
        case '<':
            return from(player);
        case 'p1':
        case 'p2':
            setCorner(player, v === 'p1' ? 'pos1' : 'pos2', here);
            say(player, `§d${v === 'p1' ? '1번' : '2번'} 지점§r = ${fmt(here)}`);
            return again();
        case 'coords': {
            const r = await ask(player, 'coords', '좌표 직접 입력', [
                { key: 'a', type: 'text', label: '1번 지점 (x y z)', default: s.pos1 ? fmt(s.pos1) : fmt(here) },
                { key: 'b', type: 'text', label: '2번 지점 (x y z)', default: s.pos2 ? fmt(s.pos2) : fmt(here) },
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
                s.forms.coords = {};
            }
            return again();
        }
        case 'addpt':
            s.points.push(here);
            save(player);
            return again();
        case 'pop':
            removePoint(player, false);
            return again();
        case 'popc':
            removePoint(player, true);
            return again();
        case 'clear':
            clearPoints(player);
            return again();
        case 'unsel':
            s.pos1 = s.pos2 = null;
            save(player);
            return again();
    }
}

// --------------------------------------------------------------------------
// frame picker
// --------------------------------------------------------------------------
const FILLS = { curved: '곡면 채우기', flat: '면 채우기' };

export async function frameMenu(player) {
    const s = session(player);
    const fill = s.settings.frameFill === 'flat' ? 'flat' : 'curved';
    const sizes = s.frames.filter(f => f.length).map(f => f.length);
    const v = await menu(player, '프레임 피커',
        `§b프레임 ${sizes.length}개§r (점: ${sizes.join(', ') || '-'})\n채우는 방식: §e${FILLS[fill]}§r\n\n§7터치 = 점 추가 · 부수기 = 마지막 점 취소 · 웅크리고 부수기 = 프레임 저장`, [
            { text: `${FILLS[fill]} 실행`, icon: 'textures/items/amethyst_shard', value: 'run' },
            { text: `채우는 방식 바꾸기 → ${FILLS[fill === 'flat' ? 'curved' : 'flat']}`, value: 'mode' },
            { text: '지금 프레임 저장 (다음 점부터 새 프레임)', value: 'save' },
            { text: '마지막 점 지우기', value: 'pop' },
            { text: '가장 가까운 점 지우기', value: 'popc' },
            { text: '프레임 모두 지우기', value: 'clear' },
        ]);
    switch (v) {
        case 'run':
            return toolForm(player, TOOLS.find(t => t.id === (fill === 'flat' ? 'surface' : 'loft')));
        case 'mode':
            s.settings.frameFill = fill === 'flat' ? 'curved' : 'flat';
            save(player);
            say(player, `§b채우는 방식: ${FILLS[s.settings.frameFill]}`);
            return frameMenu(player);
        case 'save':
            saveFrame(player);
            return frameMenu(player);
        case 'pop':
            removeFramePoint(player, false);
            return frameMenu(player);
        case 'popc':
            removeFramePoint(player, true);
            return frameMenu(player);
        case 'clear':
            clearFrames(player);
            return frameMenu(player);
    }
}

// --------------------------------------------------------------------------
// block picker
// --------------------------------------------------------------------------
export async function blockPickerMenu(player) {
    const s = session(player);
    const picks = s.settings.picks ?? (s.settings.picks = []);
    if (!picks.length) {
        say(player, '§7블록 피커로 블록을 터치하면 그 블록(방향 등 상태 포함)이 저장됩니다. 저장한 블록은 모든 도구의 "블록 피커로 고른 블록"으로 바로 불러옵니다.');
        return;
    }
    const on = picks.filter(p => p.on).length;
    const r = await ask(player, 'picker', '블록 피커', [
        { type: 'label', label: `저장한 블록 ${picks.length}개. 켠 블록만 섞어서 씁니다 (하나도 안 켜면 전부).\n§7켠 블록 ${on}개` },
        ...picks.map((p, i) => ({ key: 'on' + i, type: 'toggle', label: p.t, default: p.on })),
        { type: 'divider' },
        { key: 'palette', type: 'text', label: '켠 블록을 팔레트로 저장 (이름, 비우면 안 함)', default: '' },
        { key: 'removeOff', type: 'toggle', label: '꺼진 블록은 목록에서 지우기', default: false },
        { key: 'clear', type: 'toggle', label: '목록 모두 비우기', default: false },
    ], { submit: '저장' });
    if (!r)
        return;
    picks.forEach((p, i) => p.on = !!r['on' + i]);
    if (r.palette.trim()) {
        const chosen = picks.filter(p => p.on);
        const list = s.settings.palettes ?? (s.settings.palettes = []);
        list.push({ name: r.palette.trim().slice(0, 24), data: (chosen.length ? chosen : picks).map(p => p.t).join(',') });
        if (list.length > 12)
            list.shift();
        say(player, `§a팔레트 "${r.palette.trim()}" 저장`);
    }
    if (r.removeOff)
        s.settings.picks = picks.filter(p => p.on);
    if (r.clear)
        s.settings.picks = [];
    s.forms.picker = {};
    save(player);
}

// --------------------------------------------------------------------------
// clipboard
// --------------------------------------------------------------------------
export async function clipboardMenu(player) {
    const clip = getClip(player);
    if (!clip) {
        say(player, '§7클립보드가 비어 있습니다. 클립보드 도구로 부수기 = 선택 영역 복사. 자유 회전·크기 조절에서 "결과만 클립보드에 저장"을 켜도 여기로 들어옵니다.');
        return;
    }
    const size = `${clip.max.x - clip.min.x + 1}×${clip.max.y - clip.min.y + 1}×${clip.max.z - clip.min.z + 1}`;
    const r = await ask(player, 'clipboard', '클립보드', [
        { type: 'label', label: `내용: ${clip.label}, ${size}\n§7클립보드 도구를 들면 놓일 자리가 테두리로 보이고, 터치하면 붙여넣습니다.` },
        { key: 'turns', type: 'dropdown', label: '회전 (위에서 볼 때 시계 방향)', default: clip.turns, options: [0, 1, 2, 3].map(t => ({ value: t, label: t * 90 + '°' })) },
        { key: 'flipX', type: 'toggle', label: '좌우 뒤집기 (동↔서)', default: clip.flipX },
        { key: 'flipZ', type: 'toggle', label: '앞뒤 뒤집기 (남↔북)', default: clip.flipZ },
        { key: 'skipAir', type: 'toggle', label: '공기는 붙여넣지 않기', default: clip.skipAir },
        { key: 'clear', type: 'toggle', label: '클립보드 비우기', default: false },
    ], { submit: '적용' });
    if (!r)
        return;
    if (r.clear) {
        clearClip(player);
        return say(player, '§e클립보드를 비웠습니다.');
    }
    clip.turns = r.turns;
    clip.flipX = r.flipX;
    clip.flipZ = r.flipZ;
    clip.skipAir = r.skipAir;
    session(player).forms.clipboard = {};
}

// --------------------------------------------------------------------------
// terrain
// --------------------------------------------------------------------------
export async function terrainMenu(player) {
    const list = TOOLS.filter(t => t.group === 'terrain');
    const v = await menu(player, '지형 도구', needsText(player, { needs: 'cuboid' }), [
        ...list.map(t => ({ text: t.name, icon: t.icon, value: t.id })),
        { text: '되돌리기', icon: 'textures/items/clock_item', value: 'undo' },
    ]);
    if (!v)
        return;
    if (v === 'undo')
        return undo(player);
    return toolForm(player, list.find(t => t.id === v));
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

async function brushMenu(player, from = openMenu) {
    const s = session(player);
    const held = heldItem(player);
    const bound = Object.entries(s.brushes).map(([item, b]) => `§7${item.replace('minecraft:', '')}§r → ${BRUSHES.find(x => x.id === b.id)?.name ?? b.id}`);
    const body = `브러시는 §e지금 손에 든 아이템§r에 붙습니다. 그 아이템으로 터치하면 바라보는 곳(300칸)에 적용됩니다.\n§7메뉴를 열기 전에 브러시로 쓸 아이템(예: 막대기)을 들고 오세요.\n손에 든 것: ${held ? held.typeId.replace('minecraft:', '') : '§c없음'}${bound.length ? '\n\n' + bound.join('\n') : ''}`;
    const v = await menu(player, '브러시', body, [
        ...BRUSHES.map(b => ({ text: b.name, icon: b.icon, value: 'b:' + b.id })),
        { text: '손에 든 아이템의 브러시 떼기', value: 'unbind' },
        { text: '모든 브러시 떼기', value: 'unbindall' },
        back,
    ]);
    if (!v)
        return;
    if (v === '<')
        return from(player);
    if (v === 'unbind') {
        if (held)
            unbindBrush(player, held.typeId);
        return say(player, '§a브러시를 뗐습니다.');
    }
    if (v === 'unbindall') {
        s.brushes = {};
        save(player);
        return say(player, '§a모든 브러시를 뗐습니다.');
    }
    const brush = BRUSHES.find(b => b.id === v.slice(2));
    if (!held)
        return say(player, '§c브러시를 붙일 아이템을 손에 드세요 (블록이 아닌 아이템 권장).');
    if (ITEMS.includes(held.typeId) || held.typeId === 'andexdb:selection_tool')
        return say(player, '§c아르세온 도구 아이템에는 브러시를 붙일 수 없습니다. 막대기 같은 다른 아이템을 드세요.');
    const values = await ask(player, 'brush:' + brush.id, brush.name, brush.fields ?? [], { intro: brush.desc, submit: '이 아이템에 붙이기' });
    if (!values)
        return;
    bindBrush(player, held.typeId, brush.id, values);
    say(player, `§a${brush.name}§r를 ${held.typeId.replace('minecraft:', '')}에 붙였습니다. 터치하면 사용됩니다.`);
}

// --------------------------------------------------------------------------
// assets
// --------------------------------------------------------------------------
const assetMod = () => TOOLS.find(t => t.id === 'assets')?.module;
const assetNames = () => assetMod().listAssets().map(a => (typeof a === 'string' ? a : a.name));

/** Break with the asset tool: save the selection as an asset. */
export async function assetSaveForm(player) {
    const mod = assetMod();
    if (!mod)
        return;
    if (!region(player))
        return say(player, '§c에셋으로 저장할 선택 영역(1번·2번 지점)을 먼저 지정하세요.');
    const r = await ask(player, 'asset:save', '에셋 저장', mod.SAVE_FIELDS, { submit: '저장' });
    if (!r)
        return;
    try {
        say(player, await mod.saveAsset(player, String(r.name ?? '').trim(), r) ?? '§a저장했습니다.');
    }
    catch (e) {
        say(player, `§c${e?.message ?? e}`);
    }
}

export async function assetsMenu(player) {
    const mod = assetMod();
    if (!mod)
        return;
    const names = assetNames();
    const cfg = session(player).settings.assetPlacer;
    const v = await menu(player, '에셋 도구',
        `저장된 에셋 ${names.length}개${names.length ? ': §7' + names.slice(0, 30).join(', ') : ''}§r\n놓을 에셋: ${cfg?.names?.length ? '§e' + cfg.names.join(', ') : '§7없음'}\n\n§7터치 = 놓기 · 부수기 = 선택 영역을 에셋으로 저장`, [
            { text: '놓을 에셋 고르기', value: 'select' },
            { text: '선택 영역을 에셋으로 저장', value: 'save' },
            { text: '에셋 지우기', value: 'remove' },
        ]);
    switch (v) {
        case 'save':
            return assetSaveForm(player);
        case 'select': {
            if (!names.length)
                return say(player, '§c저장된 에셋이 없습니다.');
            const r = await ask(player, 'asset:select', '놓을 에셋 고르기', [
                { type: 'label', label: '§7저장된 에셋: ' + names.join(', ') },
                ...mod.PLACER_FIELDS,
            ], { submit: '고르기' });
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
        case 'remove': {
            if (!names.length)
                return say(player, '§c저장된 에셋이 없습니다.');
            const r = await ask(player, 'asset:remove', '에셋 지우기', [
                { key: 'name', type: 'dropdown', label: '지울 에셋', default: names[0], options: names.map(n => ({ value: n, label: n })) },
            ], { submit: '지우기' });
            if (r) {
                try {
                    say(player, await mod.removeAsset(r.name) ?? `§a${r.name} 지움`);
                }
                catch (e) {
                    say(player, `§c${e?.message ?? e}`);
                }
            }
            return;
        }
    }
}

// --------------------------------------------------------------------------
// settings
// --------------------------------------------------------------------------
async function settingsMenu(player) {
    const s = session(player);
    const r = await ask(player, 'settings', '설정', [
        { key: 'gmask', type: 'mask', label: '전역 마스크 (끌어 늘리기·채우기·브러시에 적용, 비우면 끔)', placeholder: '예: !air  /  #arcangle[0][40][1]', default: s.settings.gmask },
        { key: 'loadAll', type: 'toggle', label: '로드 안 된 먼 곳도 불러와서 설치 (권장)', default: s.settings.loadAll !== false, tooltip: '틱킹 영역으로 잠깐 불러와서 설치하고 다시 놓아줍니다. 끄면 로드 안 된 곳은 건너뜁니다' },
        { key: 'particles', type: 'toggle', label: '도구를 들면 점·곡선·영역·붙여넣을 자리를 입자로 보기', default: s.settings.particles },
        { key: 'clearPalettes', type: 'toggle', label: `저장한 팔레트 모두 지우기 (${(s.settings.palettes ?? []).length}개)`, default: false },
        { key: 'code', type: 'text', label: '코드', default: '', placeholder: '' },
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
    s.settings.loadAll = r.loadAll;
    if (r.clearPalettes)
        s.settings.palettes = [];
    // a quiet switch: the right code opens the hidden features, nothing is said either way
    const code = String(r.code ?? '').trim();
    if (code === UNLOCK_CODE)
        s.settings.unlocked = true;
    s.forms.settings = {};
    save(player);
    say(player, '§a설정을 저장했습니다.');
}
