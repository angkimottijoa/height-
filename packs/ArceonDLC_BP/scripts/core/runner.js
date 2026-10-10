/*
 * Runs a tool or brush: checks the selection it needs, builds the context,
 * runs the (generator) function over several ticks, places the result and
 * reports how many blocks changed.
 *
 * Tool module shape (scripts/tools/*.js):
 *
 *   export default {
 *     id: 'road', name: '도로', desc: '한 줄 설명', icon: 'textures/blocks/gravel',
 *     needs: 'points' | 'cuboid' | 'frames' | 'none',
 *     minPoints: 2,                 // for 'points'
 *     useMask: true,                // apply the global mask (설정 > 전역 마스크)
 *     fields: [ ...form fields (ui/form.js) ],
 *     *run(ctx, values) { ... yield now and then ...; return '추가 메시지' },
 *   }
 *
 * values.toClip = true: the result goes to the clipboard, the world is untouched.
 *
 * ctx:
 *   player, dim, session, edit (EditSession), say(msg)
 *   points      wand points [{x,y,z}] (block coords) - 'points' tools
 *   frames      loft frames [[{x,y,z}...]...]
 *   region      {min, max} from pos1/pos2 - 'cuboid' tools
 *   pattern(key)    parsed pattern of a 'block' field
 *   patternText(key) the pattern string of a 'block' field
 *   mask(text)  parsed mask or null
 *   location, rotation {x: pitch, y: yaw}, view (unit look vector)
 */
import { parseMask, parsePattern } from './blocks.js';
import { EditSession, isBusy, runAsync, say } from './edit.js';
import { CaptureEdit, clipFromMap, setClip } from './clipboard.js';
import { region, session, volume } from './session.js';
import { blockValue } from '../ui/form.js';

export const MAX_REGION = 4000000;

export function makeContext(player, values = {}, { mask = null, capture = false } = {}) {
    const s = session(player);
    const edit = capture ? new CaptureEdit(player, player.dimension, mask) : new EditSession(player, player.dimension, mask);
    const ctx = {
        player,
        dim: player.dimension,
        session: s,
        edit,
        say: (m) => say(player, m),
        points: s.points.map(p => ({ ...p })),
        frames: s.frames.map(f => f.map(p => ({ ...p }))),
        region: region(player),
        pattern: (key) => parsePattern(blockValue(player, values, key)),
        patternText: (key) => blockValue(player, values, key),
        mask: (text) => parseMask(text),
        location: { ...player.location },
        rotation: player.getRotation(),
        view: player.getViewDirection(),
    };
    return ctx;
}

/** Check what the tool needs. Returns an error message or null. */
function check(player, tool, ctx) {
    const s = ctx.session;
    switch (tool.needs) {
        case 'points': {
            const min = tool.minPoints ?? 2;
            if (ctx.points.length < min && ctx.region && min <= 2) {
                // like Arceon, a cuboid selection works as its two corners
                ctx.points = [s.pos1, s.pos2].map(p => ({ ...p }));
            }
            if (ctx.points.length < min)
                return `곡선 점이 ${min}개 이상 필요합니다 (지금 ${s.points.length}개). 선택 지팡이를 곡선 점 모드로 두고 블록을 터치하세요.`;
            break;
        }
        case 'cuboid':
            if (!ctx.region)
                return '선택 영역이 없습니다. 선택 지팡이(터치 = 1번, 부수기 = 2번)나 8Crafter 선택 도구로 지정하세요.';
            if (s.dim && s.dim !== player.dimension.id)
                return '선택 영역이 다른 차원에 있습니다.';
            if (volume(ctx.region) > (tool.maxVolume ?? MAX_REGION))
                return `선택 영역이 너무 큽니다 (${volume(ctx.region)}블록, 최대 ${tool.maxVolume ?? MAX_REGION}).`;
            break;
        case 'frames':
            ctx.frames = ctx.frames.filter(f => f.length);
            if (ctx.frames.length < 1)
                return '프레임이 없습니다. 프레임 피커로 블록을 터치해 점을 찍고, 웅크리고 부수기로 프레임을 저장하세요.';
            break;
    }
    return null;
}

export async function runTool(player, tool, values) {
    if (isBusy(player)) {
        say(player, '§c이전 작업이 아직 진행 중입니다.');
        return;
    }
    const s = session(player);
    let mask = null;
    try {
        if (tool.useMask && s.settings.gmask)
            mask = parseMask(s.settings.gmask);
    }
    catch (e) {
        say(player, `§c전역 마스크 오류: ${e.message}`);
        return;
    }
    const toClip = !!values.toClip;
    const ctx = makeContext(player, values, { mask, capture: toClip });
    const err = check(player, tool, ctx);
    if (err) {
        say(player, '§c' + err);
        return;
    }
    let extra;
    try {
        say(player, `§7${tool.name} 계산 중...`);
        const r = tool.run(ctx, values);
        extra = (r && typeof r.next === 'function') ? await runAsync(r) : await r;
    }
    catch (e) {
        say(player, `§c${tool.name}: ${e?.message ?? e}`);
        if (!(e instanceof Error) || !/[가-힣]/.test(e.message))
            console.warn(`[arceon] ${tool.id}: ${e?.stack ?? e}`);
        return;
    }
    if (toClip) {
        const clip = clipFromMap(ctx.edit.changes, tool.name);
        if (!clip)
            return say(player, `§c${tool.name}: 결과가 비어 있어 클립보드에 넣지 않았습니다.`);
        setClip(player, clip);
        say(player, `§a${tool.name} 결과를 클립보드에 저장했습니다 (${clip.cells.length}블록). §7클립보드 도구를 들면 놓일 자리가 보이고, 터치하면 붙여넣습니다.`);
        return;
    }
    await finish(player, tool.name, ctx.edit, extra);
}

export async function finish(player, label, edit, extra) {
    try {
        const n = await edit.commit(label);
        say(player, `§a${label}: ${n}블록 변경${extra ? ' §7' + extra : ''}`);
    }
    catch (e) {
        say(player, `§c${label}: ${e?.message ?? e}`);
    }
}

/** Run a bound brush at a block the player is looking at. */
export async function runBrush(player, brush, values, hit) {
    if (isBusy(player))
        return;
    const s = session(player);
    let mask = null;
    try {
        if (s.settings.gmask)
            mask = parseMask(s.settings.gmask);
    }
    catch (e) { }
    const ctx = makeContext(player, values, { mask });
    ctx.hit = hit;
    let extra;
    try {
        const r = brush.apply(ctx, values, hit);
        extra = (r && typeof r.next === 'function') ? await runAsync(r) : await r;
    }
    catch (e) {
        say(player, `§c${brush.name}: ${e?.message ?? e}`);
        return;
    }
    await finish(player, brush.name, ctx.edit, extra);
}
