/*
 * The layout tool (배선 도구), a hidden tool (settings code).
 *
 *   tap a track end (its buffer stop) or a track     start there / finish there
 *   tap anywhere else                                 add a point on the way
 *   break                                             take back the last point
 *   sneak + tap                                       menu: lay, automatic yard, list, settings
 *
 * A drawn track may start or finish on a track end (carries on from it) or
 * on a track's side (a turnout is put in). Loose ends get buffer stops of
 * real blocks, which can be tapped later to carry on from them.
 */
import { isBusy, runAsync, say } from '../core/edit.js';
import { finish, makeContext } from '../core/runner.js';
import { save, session, unlocked } from '../core/session.js';
import { buildAuto, buildDrawn, deleteTrack, hitTest, saveTrack, trackById, tracks } from '../lib/yard.js';
import { ask, menu } from './form.js';

const fmt = (p) => `${p.x} ${p.y} ${p.z}`;
function bar(player, msg) {
    try {
        player.onScreenDisplay.setActionBar(msg);
    }
    catch (e) {
        say(player, msg);
    }
}
function state(player) {
    const s = session(player);
    if (!s.yard)
        s.yard = { start: null, pts: [] };
    return s;
}
const opts = (s) => ({ N: 8, gap: 6, n: 6, side: -1, both: true, startAt: 10, ...(s.settings.yard ?? {}) });
const nameOf = (t) => t.name || `선로 ${t.id}`;
const describe = (h) => h.type === 'end'
    ? `${nameOf(h.track)}의 ${h.end === 0 ? '시작' : '끝'} 끝`
    : `${nameOf(h.track)} (시작에서 ${Math.round(h.s)}칸)`;
/** What is kept in the session (ids, not whole tracks). */
const keep = (h) => h.type === 'end' ? { type: 'end', id: h.track.id, end: h.end } : { type: 'track', id: h.track.id, s: h.s };
function resolve(x) {
    if (!x || x.type === 'point')
        return x;
    const track = trackById(x.id);
    if (!track)
        return null;
    return { ...x, track };
}

export function yardTap(player, hit, sneaking) {
    if (!unlocked(player))
        return;
    if (sneaking)
        return void yardMenu(player);
    if (!hit)
        return bar(player, '§c블록을 바라보세요 (최대 300칸)');
    const s = state(player);
    const h = hitTest(hit.pos);
    if (h)
        return void onTrack(player, s, h);
    s.yard.pts.push({ ...hit.pos });
    save(player);
    const from = s.yard.start ? '시작 지정됨, ' : '';
    bar(player, `§a[배선] ${from}점 ${s.yard.pts.length}개§r ${fmt(hit.pos)}  §7선로 끝·선로를 터치하면 거기까지 깔기 · 웅크리고 터치 = 메뉴`);
    return () => {
        s.yard.pts.pop();
        save(player);
    };
}

export function yardBreak(player) {
    if (!unlocked(player))
        return;
    const s = state(player);
    if (s.yard.pts.length) {
        s.yard.pts.pop();
        bar(player, `§e[배선] 마지막 점 취소§r (남은 점 ${s.yard.pts.length}개)`);
    }
    else if (s.yard.start) {
        s.yard.start = null;
        bar(player, '§e[배선] 시작 지정 취소');
    }
    else
        bar(player, '§7[배선] 지울 점이 없습니다');
    save(player);
}

async function onTrack(player, s, h) {
    const drawing = s.yard.start || s.yard.pts.length;
    const buttons = drawing
        ? [
            { text: `§2여기까지 깔기§r\n§8${h.type === 'end' ? '이 끝에서 이어집니다' : '분기기로 합류합니다'}`, value: 'finish' },
            { text: '여기서 새로 시작 (찍은 점 지우기)', value: 'start' },
        ]
        : [
            { text: h.type === 'end' ? '§2여기서 이어 깔기 시작§r\n§8다음은 점을 찍고, 끝낼 곳을 터치' : '§2여기서 분기 시작§r\n§8분기기가 들어갑니다', value: 'start' },
            { text: '이 선로 이름 바꾸기', value: 'rename' },
            { text: '§c이 선로 기록 지우기§r\n§8블록은 그대로 (되돌리기는 /arc:undo)', value: 'forget' },
        ];
    const v = await menu(player, '배선', describe(h), [...buttons, { text: '§8취소', value: '' }]);
    if (v === 'start') {
        s.yard.start = keep(h);
        s.yard.pts = [];
        save(player);
        bar(player, `§a[배선] 시작: ${describe(h)}§r  §7점을 찍고 끝낼 곳(선로 끝·선로·마지막 점)을 정하세요`);
    }
    else if (v === 'finish')
        await lay(player, h);
    else if (v === 'rename') {
        const r = await ask(player, 'yard:rename', '선로 이름', [{ key: 'name', type: 'text', label: '이름', default: h.track.name ?? '' }], { submit: '저장' });
        if (r) {
            h.track.name = r.name.trim();
            saveTrack(h.track);
        }
    }
    else if (v === 'forget') {
        deleteTrack(h.track.id);
        say(player, `§e${nameOf(h.track)} 기록을 지웠습니다 (블록은 그대로).`);
    }
}

/** Lay what has been drawn, finishing at `target` (a hit) or at the last point. */
async function lay(player, target = null) {
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const s = state(player);
    let start = resolve(s.yard.start);
    let pts = s.yard.pts.map(p => ({ ...p }));
    if (!start) {
        if (!pts.length)
            return say(player, '§c시작할 곳이 없습니다: 선로 끝·선로를 터치하거나 점을 찍으세요.');
        start = { type: 'point', pos: pts.shift() };
    }
    let fin = target ? (target.type ? (target.track ? target : resolve(target)) : null) : null;
    if (!fin && pts.length)
        fin = { type: 'point', pos: pts.pop() };
    if (!fin && start.type === 'point')
        return say(player, '§c점이 하나뿐입니다. 점을 더 찍거나 끝낼 선로를 터치하세요.');
    const ctx = makeContext(player, {});
    let r;
    try {
        r = await runAsync(buildDrawn(ctx, start, pts, fin, { N: opts(s).N }));
    }
    catch (e) {
        return say(player, `§c배선: ${e?.message ?? e}`);
    }
    await finish(player, '배선', ctx.edit, `길이 약 ${r.length}칸${r.turnouts ? `, 분기기 ${r.turnouts}개` : ''}`);
    saveTrack(r.track);
    for (const t of r.touched)
        saveTrack(t);
    s.yard = { start: null, pts: [] };
    save(player);
}

export async function yardMenu(player) {
    if (!unlocked(player))
        return;
    const s = state(player);
    const o = opts(s);
    const start = resolve(s.yard.start);
    const head = `시작: ${start ? describe(start) : '§7없음 (첫 점부터)§r'}\n찍은 점: ${s.yard.pts.length}개 · 기록된 선로: ${tracks().length}개\n분기기 번수: #${o.N}`;
    const v = await menu(player, '배선 도구', head, [
        { text: '§2지금까지 찍은 대로 깔기§r\n§8마지막 점에서 끝 (차막이)', value: 'lay' },
        { text: '자동 배선: 선로군\n§8찍은 점 = 본선, 옆으로 선로 여러 개 + 양쪽 목', value: 'auto' },
        { text: '기록된 선로 목록', value: 'list' },
        { text: '분기기 번수 등 설정', value: 'settings' },
        { text: '§c시작·점 모두 지우기', value: 'clear' },
    ]);
    if (v === 'lay')
        await lay(player);
    else if (v === 'auto')
        await auto(player);
    else if (v === 'list') {
        const list = tracks();
        const lines = list.slice(0, 40).map(t => `${nameOf(t)}: ${t.pts.length}칸, 끝 ${t.ends.map(e => e.open ? '차막이' : '연결').join(' / ')}`);
        await menu(player, '기록된 선로', lines.length ? lines.join('\n') : '아직 없습니다', [{ text: '닫기', value: '' }]);
    }
    else if (v === 'settings') {
        const r = await ask(player, 'yard:settings', '배선 설정', [
            { key: 'N', type: 'slider', label: '분기기 번수 (1:N, 클수록 완만하고 김)', default: o.N, min: 4, max: 16 },
        ], { submit: '저장' });
        if (r) {
            s.settings.yard = { ...(s.settings.yard ?? {}), N: r.N };
            save(player);
        }
    }
    else if (v === 'clear') {
        s.yard = { start: null, pts: [] };
        save(player);
        bar(player, '§e[배선] 시작·점을 지웠습니다');
    }
}

async function auto(player) {
    const s = state(player);
    const o = opts(s);
    if (s.yard.pts.length < 2)
        return say(player, '§c본선이 될 곳에 점을 2개 이상 찍고 다시 고르세요.');
    const r = await ask(player, 'yard:auto', '자동 배선 - 선로군', [
        { key: 'name', type: 'text', label: '이름', default: '조차장' },
        { key: 'n', type: 'slider', label: '옆 선로 수', default: o.n, min: 1, max: 16 },
        { key: 'gap', type: 'slider', label: '선로 간격 (선로 가운데 사이 칸 수)', default: o.gap, min: 4, max: 12 },
        { key: 'N', type: 'slider', label: '분기기 번수 (목의 기울기 1:N)', default: o.N, min: 4, max: 16 },
        {
            key: 'side', type: 'dropdown', label: '어느 쪽으로', default: o.side, options: [
                { value: -1, label: '본선 진행 방향의 왼쪽' }, { value: 1, label: '오른쪽' },
            ],
        },
        { key: 'both', type: 'toggle', label: '양쪽 목 (끄면 반대쪽 끝은 차막이)', default: o.both },
        { key: 'startAt', type: 'slider', label: '첫 분기까지 본선 길이 (칸)', default: o.startAt, min: 2, max: 80 },
    ], { submit: '깔기' });
    if (!r)
        return;
    s.settings.yard = { ...(s.settings.yard ?? {}), n: r.n, gap: r.gap, N: r.N, side: r.side, both: r.both, startAt: r.startAt };
    save(player);
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const ctx = makeContext(player, {});
    let out;
    try {
        out = await runAsync(buildAuto(ctx, s.yard.pts, { ...r, name: r.name.trim() || '조차장' }));
    }
    catch (e) {
        return say(player, `§c자동 배선: ${e?.message ?? e}`);
    }
    await finish(player, '자동 배선', ctx.edit, `본선 약 ${out.length}칸 + 선로 ${out.count}개`);
    for (const t of out.made)
        saveTrack(t);
    s.yard = { start: null, pts: [] };
    save(player);
}
