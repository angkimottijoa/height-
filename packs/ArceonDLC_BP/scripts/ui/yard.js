/*
 * The layout tool (배선 도구), a hidden tool (settings code).
 *
 * Draw lines like frames, then lay them all with the railway tool's settings
 * (track, bridge, poles, wires):
 *   tap anywhere                     add a point to the line being drawn
 *   tap a track end / a track's side  the line starts there (carries on / branches off),
 *                                     or, when it already has points, finishes there and is saved
 *   break                            take back the last point
 *   sneak + break                    save the line (it ends at its last point)
 *   sneak + tap                      menu: lay the saved lines, connect two tracks, ...
 * Saved lines that are not laid yet can be tapped too: a new line can carry on
 * from their ends or branch off them.
 *
 * Connect mode (선로 연결): tap one track (or one side of a double track),
 * then the other; a crossover or a scissors crossover is laid between them
 * on a smooth reverse curve with turnouts at both ends.
 */
import { isBusy, runAsync, say } from '../core/edit.js';
import { finish, makeContext } from '../core/runner.js';
import { save, session, unlocked } from '../core/session.js';
import { buildCrossover, crossoverPlan, deleteTrack, endsOf, hitTest, planDrawn, saveTrack, thinPts, trackById, tracks } from '../lib/yard.js';
import railway from '../tools/railway.js';
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
const fresh = () => ({ start: null, pts: [], finish: null });
export function yardState(player) {
    const s = session(player);
    if (!s.yard || !Array.isArray(s.yard.lines))
        s.yard = { lines: [], cur: fresh(), mode: null, pick: [] };
    return s;
}
const N = (s) => s.settings.yard?.N ?? 8;
const nameOf = (t) => t.name || (t.line !== undefined ? `저장한 선 ${t.line + 1}` : `선로 ${t.id}`);
const describe = (h) => h.type === 'end'
    ? `${nameOf(h.track)}의 ${h.end === 0 ? '시작' : '끝'} 끝`
    : `${nameOf(h.track)}${(h.track.centres?.length ?? 1) > 1 ? ` ${h.lane + 1}번 선` : ''} (시작에서 ${Math.round(h.s)}칸)`;

/** Saved lines as track-like records (for tapping and planning). */
const pseudo = (s) => s.yard.lines.map((l, i) => ({ ...l.shape, line: i }));
/** A hit as kept in the session: which recorded track or saved line. */
function keep(h) {
    const src = h.track.line !== undefined ? { src: 'line', idx: h.track.line } : { src: 'track', id: h.track.id };
    return h.type === 'end' ? { type: 'end', ...src, end: h.end } : { type: 'track', ...src, s: h.s, lane: h.lane };
}
/** Back to a ref with its track: a recorded track, a saved line's shape, or (laying) the track it became. */
function resolve(ref, lines, laid = []) {
    if (!ref)
        return null;
    const track = ref.src === 'line' ? (laid[ref.idx] ?? (lines[ref.idx] && { ...lines[ref.idx].shape, line: ref.idx })) : trackById(ref.id);
    return track ? { ...ref, track } : null;
}
/** Plan one line: its start (ref or first point), its points, its finish (ref or last point). */
function planLine(l, lines, laid, n, single = false) {
    const pts = l.pts.map(p => ({ ...p }));
    let start = resolve(l.start, lines, laid), fin = resolve(l.finish, lines, laid);
    if (!start) {
        if (!pts.length)
            throw new Error('시작이 없습니다');
        start = { type: 'point', pos: pts.shift() };
    }
    if (!fin && pts.length)
        fin = { type: 'point', pos: pts.pop() };
    if (!fin)
        throw new Error('점이 더 필요합니다');
    return { ...planDrawn(start, pts, fin, n, single), start, finish: fin };
}

function saveLine(player, s) {
    const c = s.yard.cur;
    const anchors = (c.start ? 1 : 0) + c.pts.length + (c.finish ? 1 : 0);
    if (anchors < 2)
        return bar(player, '§c[배선] 선을 저장하려면 점이 2개 이상(또는 시작 선로 + 점 1개) 필요합니다');
    let plan;
    try {
        plan = planLine(c, s.yard.lines, [], N(s));
    }
    catch (e) {
        return bar(player, `§c[배선] ${e?.message ?? e}`);
    }
    s.yard.lines.push({ ...c, shape: { id: 'L' + s.yard.lines.length, pts: thinPts(plan.S), ends: endsOf(plan.S), w: 8, centres: [0] } });
    s.yard.cur = fresh();
    save(player);
    bar(player, `§a[배선] 선 ${s.yard.lines.length}개 저장§r (약 ${Math.round(plan.S[plan.S.length - 1].s)}칸)  §7다음 선을 그리거나, 웅크리고 터치 → 깔기`);
}

export function yardTap(player, hit, sneaking) {
    if (!unlocked(player))
        return;
    if (sneaking)
        return void yardMenu(player);
    if (!hit)
        return bar(player, '§c블록을 바라보세요 (최대 300칸)');
    const s = yardState(player);
    const y = s.yard;
    if (y.mode === 'connect') {
        const h = hitTest(hit.pos);
        if (!h || h.type !== 'track')
            return bar(player, '§c[선로 연결] 깔려 있는(기록된) 선로 위를 터치하세요');
        y.pick.push(keep(h));
        save(player);
        if (y.pick.length < 2)
            return bar(player, `§b[선로 연결] 첫 선로: ${describe(h)}§r  §7이제 건너갈 선로를 터치 (진행 방향 쪽으로 조금 떨어진 곳)`);
        return void connect(player);
    }
    const h = hitTest(hit.pos, pseudo(s));
    const c = y.cur;
    if (h) {
        if (!c.start && !c.pts.length) {
            c.start = keep(h);
            save(player);
            return bar(player, `§a[배선] 시작: ${describe(h)}§r  §7${h.type === 'end' ? '이 끝에서 이어집니다' : '분기기로 갈라집니다'} · 지나갈 곳을 터치`);
        }
        c.finish = keep(h);
        bar(player, `§a[배선] 끝: ${describe(h)}`);
        return void saveLine(player, s);
    }
    c.pts.push({ ...hit.pos });
    save(player);
    bar(player, `§a[배선] 선 ${y.lines.length + 1} · 점 ${c.pts.length}개§r ${fmt(hit.pos)}  §7웅크리고 부수기 = 선 저장`);
    return () => {
        c.pts.pop();
        save(player);
    };
}

export function yardBreak(player, pos, sneaking) {
    if (!unlocked(player))
        return;
    const s = yardState(player);
    const y = s.yard;
    if (sneaking)
        return void saveLine(player, s);
    if (y.mode === 'connect') {
        y.pick.pop();
        save(player);
        return bar(player, '§e[선로 연결] 마지막 선택 취소');
    }
    if (y.cur.pts.length)
        y.cur.pts.pop();
    else if (y.cur.start)
        y.cur.start = null;
    else if (y.lines.length) {
        y.lines.pop();
        save(player);
        return bar(player, `§e[배선] 마지막으로 저장한 선을 지웠습니다 (남은 선 ${y.lines.length}개)`);
    }
    save(player);
    bar(player, `§e[배선] 마지막 점 취소§r (점 ${y.cur.pts.length}개)`);
}

export async function yardMenu(player) {
    if (!unlocked(player))
        return;
    const s = yardState(player);
    const y = s.yard;
    const head = `저장한 선: ${y.lines.length}개 · 그리는 중: 점 ${y.cur.pts.length}개${y.cur.start ? ' (시작 지정)' : ''}\n기록된 선로: ${tracks().length}개 · 분기기 번수 #${N(s)}`;
    const v = await menu(player, '배선 도구', head, [
        { text: `§2저장한 선 ${y.lines.length + (y.cur.pts.length ? 1 : 0)}개 깔기§r\n§8철도 설정(선로·교량·전신주·전선)을 고른 뒤`, value: 'lay' },
        { text: '지금 그리는 선 저장', value: 'save' },
        { text: '선로 연결 (건넘선 · 시서스)\n§8선로 두 개를 차례로 터치', value: 'connect' },
        { text: '기록된 선로 목록', value: 'list' },
        { text: '분기기 번수', value: 'settings' },
        { text: '§c저장한 선·점 모두 지우기', value: 'clear' },
    ]);
    if (v === 'lay')
        await lay(player);
    else if (v === 'save')
        saveLine(player, s);
    else if (v === 'connect') {
        y.mode = 'connect';
        y.pick = [];
        save(player);
        bar(player, '§b[선로 연결]§r 갈라질 선로(복선이면 그 선)를 터치하세요  §7부수기 = 선택 취소');
    }
    else if (v === 'list') {
        const lines = tracks().slice(0, 40).map(t => `${nameOf(t)}: ${t.pts.length}칸, 끝 ${t.ends.map(e => e.open ? '열림' : '연결').join(' / ')}`);
        const pick = await menu(player, '기록된 선로', lines.length ? lines.join('\n') : '아직 없습니다', [
            ...tracks().slice(0, 40).map(t => ({ text: `${nameOf(t)} 기록 지우기`, value: t.id })),
            { text: '닫기', value: '' },
        ]);
        if (pick) {
            deleteTrack(pick);
            say(player, '§e기록을 지웠습니다 (블록은 그대로).');
        }
    }
    else if (v === 'settings') {
        const r = await ask(player, 'yard:settings', '배선 설정', [
            { key: 'N', type: 'slider', label: '분기기 번수 (1:N, 클수록 완만하고 김)', default: N(s), min: 4, max: 16 },
        ], { submit: '저장' });
        if (r) {
            s.settings.yard = { ...(s.settings.yard ?? {}), N: r.N };
            save(player);
        }
    }
    else if (v === 'clear') {
        s.yard = { lines: [], cur: fresh(), mode: null, pick: [] };
        save(player);
        bar(player, '§e[배선] 모두 지웠습니다');
    }
}

/** Lay every saved line (and the one being drawn) with the railway tool's settings. */
async function lay(player) {
    const s = yardState(player);
    const y = s.yard;
    if (y.cur.pts.length || y.cur.start)
        saveLine(player, s);
    if (!y.lines.length)
        return say(player, '§c저장한 선이 없습니다: 점을 찍고 웅크리고 부수기로 선을 저장하세요.');
    const fields = railway.fieldsFor(player);
    const values = await ask(player, 'tool:railway', `배선 - 선 ${y.lines.length}개 깔기`, fields, { submit: '다음' });
    if (!values)
        return;
    const extra = await railway.more(player, values);
    if (extra === undefined)
        return;
    const v = { ...values, ...extra };
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const ctx = makeContext(player, values);
    const laid = [];
    const lines = y.lines;
    const single = !v.track && Number(v.tracks) === 1;
    try {
        await runAsync((function* () {
            for (let i = 0; i < lines.length; i++) {
                ctx.plan = planLine(lines[i], lines, laid, N(s), single);
                yield* railway.run(ctx, v);
                laid[i] = ctx.lastTrack;
            }
        })());
    }
    catch (e) {
        return say(player, `§c배선: ${e?.message ?? e}`);
    }
    await finish(player, '배선', ctx.edit, `선 ${lines.length}개`);
    s.yard = { lines: [], cur: fresh(), mode: null, pick: [] };
    save(player);
}

/** Connect mode: the two picked tracks get a crossover (or a scissors crossover). */
async function connect(player) {
    const s = yardState(player);
    const y = s.yard;
    const [a, b] = y.pick.map(r => resolve(r, []));
    y.pick = [];
    y.mode = null;
    save(player);
    if (!a || !b)
        return say(player, '§c선로 기록을 찾지 못했습니다.');
    const r = await ask(player, 'yard:connect', '선로 연결', [
        {
            key: 'kind', type: 'dropdown', label: '종류', default: 'single', options: [
                { value: 'single', label: '건넘선 (한 방향)' },
                { value: 'scissors', label: '시서스 건넘선 (X자, 양방향)' },
            ],
        },
        { key: 'N', type: 'slider', label: '분기기 번수 (1:N)', default: N(s), min: 4, max: 16 },
    ], { submit: '깔기' });
    if (!r)
        return;
    let plan;
    try {
        plan = crossoverPlan(a, b, r.kind, r.N);
    }
    catch (e) {
        return say(player, `§c선로 연결: ${e?.message ?? e}`);
    }
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const ctx = makeContext(player, {});
    try {
        await runAsync(buildCrossover(ctx, plan));
    }
    catch (e) {
        return say(player, `§c선로 연결: ${e?.message ?? e}`);
    }
    await finish(player, '선로 연결', ctx.edit, `${r.kind === 'scissors' ? '시서스' : '건넘선'}, 길이 약 ${plan.length}칸`);
}
