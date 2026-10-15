/*
 * The protractor (각도기) tool.
 *
 *   tap                  add a point; points join into lines. With a line drawn,
 *                        guide lines at the set angle show from its end (yellow);
 *                        tapping on (or just looking along) a guide puts the next
 *                        point exactly on it, so the new line is at that angle
 *   break                take back the last point
 *   sneak + break        save the lines drawn (like a frame) and start new ones;
 *                        new lines are then measured against the saved ones
 *   sneak + tap          menu: angle and guides, the shape, build, clear
 *
 * With two lines (three points) the shape they start shows in green: a
 * parallelogram (a rectangle when the corner is square), the triangle, or a
 * regular polygon of N sides on the first line, turning toward the second.
 * It (or the lines) can then be built in blocks, outlined or filled.
 *
 * The menu also builds world-edit style (//line, //outline, //walls, //set on
 * the shape, thickness, height, //hollow, a //replace mask; blocks from the
 * block picker like every tool), hands the drawing to the other tools (the
 * area corners, the curve points, a loft frame) and takes theirs back. A
 * circle shape: centre and radius from the last line.
 *
 * Two modes, switched in the menu: 각도기 (the above) and 줄자 (a tape
 * measure: no guides or shapes, but ticks every block along the lines and the
 * exact length of the last line, diagonals too, its run along each axis and
 * how many blocks it takes). Lines show as lines, as the blocks they take
 * (one outlined solid, like a selection wand), or both.
 *
 * Shown with the pack's own particles (ui/draw.js), vanilla dots if the
 * resource pack is off.
 */
import { add, cross, dot, len, mul, norm, sub } from '../core/vec.js';
import { parseBlock, parseMask, parsePattern } from '../core/blocks.js';
import { isBusy, runAsync, say } from '../core/edit.js';
import { finish, makeContext } from '../core/runner.js';
import { save, session } from '../core/session.js';
import { ask, blockValue, menu } from './form.js';

const fmt = (p) => `${p.x} ${p.y} ${p.z}`;
const c = (p) => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
const deg = (r) => r * 180 / Math.PI;
const GUIDE_BLOCKS = 48; // guides shown as blocks: this many blocks along each
const SHAPE_NAME = (set) => ({ para: '사각형', tri: '삼각형', regular: `정${set.n}각형`, circle: '원' })[set.shape] ?? '도형';
const isRuler = (set) => set?.mode === 'ruler';
const tagOf = (set) => isRuler(set) ? '§a[줄자]§r' : '§b[각도기]§r';
function bar(player, msg) {
    try {
        player.onScreenDisplay.setActionBar(msg);
    }
    catch (e) {
        say(player, msg);
    }
}

export const DEFAULTS = { angle: 90, plane: 'h', sides: 'both', guideLen: 256, shape: 'para', n: 5, block: 'stone', fill: false, vanilla: false, mode: 'prot', show: 'line', guideShow: 'line' };
export function protState(player) {
    const s = session(player);
    if (!s.prot || !Array.isArray(s.prot.pts))
        s.prot = { pts: [], saved: [] };
    s.settings.prot = { ...DEFAULTS, ...(s.settings.prot ?? {}) };
    return s;
}

// ------------------------------------------------------------------ geometry
/** Rotate v about the unit axis k by angle a (Rodrigues). */
function rotate(v, k, a) {
    const cs = Math.cos(a), sn = Math.sin(a);
    return add(add(mul(v, cs), mul(cross(k, v), sn)), mul(k, dot(k, v) * (1 - cs)));
}
/**
 * Guide rays from the last point B of the last line AB: the directions that
 * meet AB at the set angle (the angle at B between BA and the new line), in
 * the horizontal plane through B or the upright plane holding AB.
 */
export function guides(pts, set) {
    if (pts.length < 2)
        return [];
    const A = c(pts[pts.length - 2]), B = c(pts[pts.length - 1]);
    const back = norm(sub(A, B));
    if (!len(sub(A, B)))
        return [];
    let axis;
    if (set.plane === 'v') {
        axis = cross(back, { x: 0, y: 1, z: 0 });
        if (len(axis) < 1e-6)
            axis = { x: 1, y: 0, z: 0 };
        axis = norm(axis);
    }
    else
        axis = { x: 0, y: 1, z: 0 };
    let base = back;
    if (set.plane !== 'v') {
        // in the horizontal plane: measure from AB's direction seen from above
        base = { x: back.x, y: 0, z: back.z };
        if (len(base) < 1e-6)
            base = { x: 1, y: 0, z: 0 };
        base = norm(base);
    }
    const a = Number(set.angle) * Math.PI / 180;
    const sides = set.sides === 'left' ? [1] : set.sides === 'right' ? [-1] : [1, -1];
    const L = Number(set.guideLen) > 0 ? Number(set.guideLen) : Math.max(4, Math.round(len(sub(A, B))));
    const out = [];
    for (const sd of sides) {
        const d = norm(rotate(base, axis, sd * a));
        if (!out.some(o => len(sub(o.d, d)) < 1e-6))
            out.push({ o: B, d, L, side: sd });
    }
    return out;
}
/**
 * Where a tap goes on a guide: the point of the guide nearest the line of
 * sight (or the tapped block), if close enough; a whole number of blocks
 * along it, so the line keeps its angle exactly.
 */
export function snap(gs, eye, view, hitPos) {
    let best = null;
    for (const g of gs) {
        let t;
        if (eye && view) {
            // closest approach of the sight line and the guide
            const w0 = sub(g.o, eye), b = dot(g.d, view), d = dot(g.d, w0), e = dot(view, w0);
            const den = 1 - b * b;
            t = den < 1e-6 ? -d : (b * e - d) / den;
            t = Math.max(1, Math.min(g.L, Math.round(t)));
            const q = add(g.o, mul(g.d, t));
            const along = dot(sub(q, eye), view);
            const miss = len(sub(q, add(eye, mul(view, along))));
            if (along > 0 && miss <= 0.8 + along * 0.02 && (!best || miss < best.miss))
                best = { miss, t, g };
        }
        if (hitPos) {
            const h = c(hitPos);
            const t2 = Math.max(1, Math.min(g.L, Math.round(dot(sub(h, g.o), g.d))));
            const miss = len(sub(h, add(g.o, mul(g.d, t2))));
            if (miss <= 1.0 && (!best || miss < best.miss))
                best = { miss, t: t2, g };
        }
    }
    if (!best)
        return null;
    const q = add(best.g.o, mul(best.g.d, best.t));
    return { pos: { x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) }, t: best.t, side: best.g.side };
}
/** The angle between two lines (0..180), and as lines (0..90). */
function between(a1, a2, b1, b2) {
    const u = norm(sub(c(a2), c(a1))), v = norm(sub(c(b2), c(b1)));
    const t = deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v)))));
    return { full: t, acute: Math.min(t, 180 - t) };
}
/** The angle at the middle point of p, q, r. */
function cornerAngle(p, q, r) {
    const u = norm(sub(c(p), c(q))), v = norm(sub(c(r), c(q)));
    return deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v)))));
}
/** The shape the last two lines start (vertices as block-centre points), or null. */
export function shape(pts, set) {
    if (set.shape === 'circle')
        return circle(pts, set);
    if (pts.length < 3)
        return null;
    const [P0, P1, P2] = pts.slice(-3).map(c);
    if (set.shape === 'tri')
        return [P0, P1, P2];
    if (set.shape === 'para')
        return [P0, P1, P2, sub(add(P0, P2), P1)];
    // a regular polygon on P0P1, turning toward P2
    const n = Math.max(3, Math.min(24, Math.floor(set.n)));
    const s = sub(P1, P0), L = len(s);
    if (!L)
        return null;
    const e1 = norm(s);
    let nrm = cross(s, sub(P2, P1));
    if (len(nrm) < 1e-6)
        nrm = { x: 0, y: 1, z: 0 };
    let e2 = norm(cross(nrm, e1));
    if (dot(e2, sub(P2, P1)) < 0)
        e2 = mul(e2, -1);
    const ext = 2 * Math.PI / n;
    const out = [P0];
    let p = P0;
    for (let i = 0; i < n - 1; i++) {
        p = add(p, mul(add(mul(e1, Math.cos(i * ext)), mul(e2, Math.sin(i * ext))), L));
        out.push(p);
    }
    return out;
}
/**
 * A circle (as a fine polygon): centre at the next-to-last point, through the
 * last one; level (수평) or upright through the line (세로면).
 */
function circle(pts, set) {
    if (pts.length < 2)
        return null;
    const [O, R] = pts.slice(-2).map(c), r = len(sub(R, O));
    if (r < 0.5)
        return null;
    let e1 = norm(sub(R, O)), e2;
    if (set.plane === 'v') {
        e2 = { x: 0, y: 1, z: 0 };
        if (Math.abs(dot(e1, e2)) > 0.999)
            e1 = { x: 1, y: 0, z: 0 };
        e1 = norm(sub(e1, mul(e2, dot(e1, e2))));
    }
    else {
        e1 = { x: e1.x, y: 0, z: e1.z };
        if (len(e1) < 1e-6)
            e1 = { x: 1, y: 0, z: 0 };
        e1 = norm(e1);
        e2 = { x: -e1.z, y: 0, z: e1.x };
    }
    const n = Math.max(16, Math.min(360, Math.ceil(2 * Math.PI * r * 1.5)));
    const out = [];
    for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n;
        out.push(add(O, add(mul(e1, r * Math.cos(a)), mul(e2, r * Math.sin(a)))));
    }
    return out;
}
/** Blocks on a line between two points (thin: one block per step). */
function blocksOn(a, b, out) {
    const n = Math.max(1, Math.ceil(len(sub(b, a)) * 3));
    for (let i = 0; i <= n; i++) {
        const p = add(a, mul(sub(b, a), i / n));
        out.add(`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`);
    }
}
/** The blocks of a closed polygon: its outline, and inside it when `fill`. */
export function polygonBlocks(V, fill) {
    const out = new Set();
    for (let i = 0; i < V.length; i++)
        blocksOn(V[i], V[(i + 1) % V.length], out);
    if (fill)
        for (let i = 1; i + 1 < V.length; i++) {
            const A = V[0], B = V[i], C = V[i + 1];
            const n = Math.max(2, Math.ceil(Math.max(len(sub(B, A)), len(sub(C, A))) * 3));
            for (let u = 0; u <= n; u++)
                for (let w = 0; u + w <= n; w++) {
                    const p = add(A, add(mul(sub(B, A), u / n), mul(sub(C, A), w / n)));
                    out.add(`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`);
                }
        }
    return out;
}

// ------------------------------------------------------------------ actions
function describe(s, set) {
    const P = s.prot.pts, n = P.length;
    if (n < 2)
        return '';
    if (isRuler(set))
        return measure(P);
    const parts = [];
    if (n >= 3)
        parts.push(`앞 선과 ${Math.round(cornerAngle(P[n - 3], P[n - 2], P[n - 1]) * 10) / 10}°`);
    // against the nearest saved line
    let best = null;
    for (const [a, b] of s.prot.saved) {
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
        const d = len(sub(m, P[n - 1]));
        if (!best || d < best.d)
            best = { d, a, b };
    }
    if (best) {
        const t = between(best.a, best.b, P[n - 2], P[n - 1]);
        parts.push(`저장한 선과 ${Math.round(t.acute * 10) / 10}° (${Math.round(t.full * 10) / 10}°)`);
    }
    return parts.join(' · ');
}

export function protTap(player, hit, sneaking) {
    if (sneaking)
        return void protMenu(player);
    const s = protState(player), set = s.settings.prot, P = s.prot.pts;
    let eye = null, view = null;
    try {
        eye = player.getHeadLocation();
        view = player.getViewDirection();
    }
    catch (e) { }
    const sn = isRuler(set) ? null : snap(guides(P, set), eye, view, hit?.pos ?? null);
    const pos = sn?.pos ?? hit?.pos;
    if (!pos)
        return bar(player, '§c블록이나 노란 안내선을 바라보세요');
    P.push({ ...pos });
    save(player);
    const tag = sn ? `§e[${set.angle}° 안내선 ${sn.t}칸]§r ` : '';
    bar(player, `${tagOf(set)} 점 ${P.length} ${tag}${fmt(pos)}  §7${describe(s, set)}`);
    return () => {
        P.pop();
        save(player);
    };
}

export function protBreak(player, pos, sneaking) {
    const s = protState(player), P = s.prot.pts;
    if (sneaking) {
        if (P.length < 2)
            return bar(player, '§c[각도기] 저장할 선이 없습니다 (점 2개 이상)');
        for (let i = 0; i + 1 < P.length; i++)
            s.prot.saved.push([{ ...P[i] }, { ...P[i + 1] }]);
        const n = P.length - 1;
        s.prot.pts = [];
        save(player);
        return bar(player, `§d[각도기] 선 ${n}개 저장§r (저장한 선 ${s.prot.saved.length}개)  §7새 선을 그리면 저장한 선과의 각도를 잽니다`);
    }
    P.pop();
    save(player);
    bar(player, `§e[각도기] 마지막 점 취소§r (점 ${P.length}개)`);
}

export async function protMenu(player) {
    const s = protState(player), set = s.settings.prot, P = s.prot.pts;
    const V = shape(P, set);
    const shapeName = SHAPE_NAME(set);
    const head = `점 ${P.length}개 · 선 ${Math.max(0, P.length - 1)}개 · 저장한 선 ${s.prot.saved.length}개\n각도 ${set.angle}° (${set.plane === 'v' ? '세로면' : '수평'}) · 도형: ${shapeName}`;
    const ruler = isRuler(set);
    const v = await menu(player, ruler ? '줄자' : '각도기', head, [
        { text: ruler ? '§2각도기로 바꾸기§r\n§8안내선·도형·각도 재기' : '§2줄자로 바꾸기§r\n§8눈금 + 정확한 길이 (사선도)', value: 'mode' },
        { text: '보기·각도 설정 (선 / 블록으로 보기)', value: 'angle' },
        { text: '도형 설정 (사각형 · 삼각형 · 정다각형)', value: 'shape' },
        { text: P.length >= 2 ? '§2만들기 (월드에딧식)§r\n§8선 채우기 · 도형 채우기 · 벽 · 굵기 · 높이 · 블록 피커' : '§8만들기 (선을 먼저 그리세요)', value: P.length >= 2 ? 'make' : '' },
        { text: '§9다른 도구로 보내기 · 가져오기§r\n§8영역(1·2번) · 곡선 점 · 프레임', value: 'send' },
        { text: V ? '§2도형 만들기§r\n§8마지막 두 선으로 시작하는 도형' : '§8도형 만들기 (선 2개를 먼저 그리세요)', value: V ? 'build' : '' },
        { text: P.length >= 2 ? '§2선만 만들기§r' : '§8선만 만들기 (선을 먼저 그리세요)', value: P.length >= 2 ? 'lines' : '' },
        { text: '§d저장한 선 지우기', value: 'unsave' },
        { text: '§c지금 그린 점·선 지우기', value: 'clear' },
    ]);
    if (v === 'mode') {
        s.settings.prot = { ...set, mode: ruler ? 'prot' : 'ruler' };
        save(player);
        bar(player, ruler ? '§b[각도기]§r 각도기 모드' : '§a[줄자]§r 줄자 모드: 점을 찍으면 길이를 잽니다');
    }
    else if (v === 'angle') {
        const r = await ask(player, 'prot:angle', '각도기 - 보기·각도', [
            {
                key: 'mode', type: 'dropdown', label: '모드', default: set.mode, options: [
                    { value: 'prot', label: '각도기 (안내선 · 도형 · 각도 재기)' },
                    { value: 'ruler', label: '줄자 (1칸 눈금 · 정확한 길이 · 사선 길이)' },
                ],
            },
            {
                key: 'show', type: 'dropdown', label: '보기', default: set.show, options: [
                    { value: 'line', label: '선으로' },
                    { value: 'block', label: '블록으로 (지어질 블록을 테두리 + 반투명 면으로)' },
                    { value: 'both', label: '선 + 블록' },
                ],
            },
            {
                key: 'guideShow', type: 'dropdown', label: '노란 안내선 보기', default: set.guideShow, options: [
                    { value: 'line', label: '선으로' },
                    { value: 'block', label: `블록으로 (그 각도로 놓일 블록, 가까운 ${GUIDE_BLOCKS}칸)` },
                    { value: 'both', label: '선 + 블록' },
                ],
            },
            { key: 'angle', type: 'slider', label: '각도 (선과 선이 만나는 각, °)', default: Number(set.angle), min: 1, max: 179 },
            { key: 'angleText', type: 'text', label: '각도 직접 입력 (소수 가능, 비우면 위 슬라이더)', placeholder: '예: 37.5', default: '' },
            {
                key: 'plane', type: 'dropdown', label: '어느 면에서 잴까', default: set.plane, options: [
                    { value: 'h', label: '수평 (위에서 본 각도)' },
                    { value: 'v', label: '세로면 (선을 담은 수직면, 경사로·지붕)' },
                ],
            },
            {
                key: 'sides', type: 'dropdown', label: '안내선', default: set.sides, options: [
                    { value: 'both', label: '양쪽' },
                    { value: 'left', label: '왼쪽만' },
                    { value: 'right', label: '오른쪽만' },
                ],
            },
            { key: 'guideLen', type: 'slider', label: '안내선 길이 (칸, 0 = 마지막 선과 같게)', default: Number(set.guideLen), min: 0, max: 512, step: 8 },
            { key: 'vanilla', type: 'toggle', label: '기본(바닐라) 파티클로 보기 (리소스 팩이 꺼져 있어 안 보일 때)', default: !!set.vanilla },
        ], { submit: '저장' });
        if (r) {
            const typed = parseFloat(String(r.angleText ?? '').replace(',', '.'));
            s.settings.prot = { ...set, angle: typed > 0 && typed < 180 ? typed : r.angle, plane: r.plane, sides: r.sides, guideLen: r.guideLen, vanilla: !!r.vanilla, mode: r.mode, show: r.show, guideShow: r.guideShow };
            save(player);
            bar(player, isRuler(s.settings.prot) ? '§a[줄자]§r 설정 저장' : `§e[각도기] ${s.settings.prot.angle}° 안내선`);
        }
    }
    else if (v === 'shape') {
        const r = await ask(player, 'prot:shape', '각도기 - 도형', [
            {
                key: 'shape', type: 'dropdown', label: '도형 (마지막 두 선으로 시작)', default: set.shape, options: [
                    { value: 'para', label: '사각형 (네 번째 꼭짓점을 채움: 평행사변형, 직각이면 직사각형)' },
                    { value: 'tri', label: '삼각형 (세 점을 이음)' },
                    { value: 'regular', label: '정다각형 (첫 선을 한 변으로, 둘째 선 쪽으로)' },
                    { value: 'circle', label: '원 (마지막 선: 중심 → 반지름, 수평 또는 세로면)' },
                ],
            },
            { key: 'n', type: 'slider', label: '정다각형 변 수 (3 = 정삼각형, 5 = 정오각형 ...)', default: Number(set.n), min: 3, max: 24 },
            { key: 'block', type: 'text', label: '블록', default: set.block, placeholder: 'stone' },
            { key: 'fill', type: 'toggle', label: '안을 채우기 (끄면 테두리만)', default: !!set.fill },
        ], { submit: '저장' });
        if (r) {
            s.settings.prot = { ...set, shape: r.shape, n: r.n, block: String(r.block || 'stone').trim(), fill: !!r.fill };
            save(player);
        }
    }
    else if (v === 'build' || v === 'lines')
        await build(player, v);
    else if (v === 'make')
        await makeMenu(player);
    else if (v === 'send')
        await sendMenu(player);
    else if (v === 'unsave') {
        s.prot.saved = [];
        save(player);
        bar(player, '§e[각도기] 저장한 선을 지웠습니다');
    }
    else if (v === 'clear') {
        s.prot.pts = [];
        save(player);
        bar(player, '§e[각도기] 점·선을 지웠습니다');
    }
}

async function build(player, what) {
    const s = protState(player), set = s.settings.prot, P = s.prot.pts;
    let block;
    try {
        block = parseBlock(set.block || 'stone');
    }
    catch (e) {
        return say(player, `§c각도기: ${e?.message ?? e}`);
    }
    let cells;
    if (what === 'build') {
        const V = shape(P, set);
        if (!V)
            return say(player, '§c각도기: 선을 2개 그리세요');
        cells = polygonBlocks(V, set.fill);
    }
    else {
        cells = new Set();
        for (let i = 0; i + 1 < P.length; i++)
            blocksOn(c(P[i]), c(P[i + 1]), cells);
    }
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const ctx = makeContext(player, {});
    try {
        await runAsync((function* () {
            let n = 0;
            for (const k of cells) {
                const [x, y, z] = k.split(',').map(Number);
                ctx.edit.set({ x, y, z }, block);
                if (++n % 2000 === 0)
                    yield;
            }
        })());
    }
    catch (e) {
        return say(player, `§c각도기: ${e?.message ?? e}`);
    }
    await finish(player, '각도기', ctx.edit, what === 'build' ? `${SHAPE_NAME(set)}${set.fill ? ' (채움)' : ''}` : `선 ${P.length - 1}개`);
}

// ------------------------------------------------------------------ world-edit style
/**
 * The blocks for `what`: 'lines' (the lines drawn, //line), 'outline' (the
 * shape's edge; with a height, walls), 'fill' (the shape filled; with a
 * height, a prism). `radius` thickens every block into a ball (a thick line,
 * a thick wall), `height` stacks it up (or down), `hollow` keeps only the
 * outer skin. Null without a shape; throws when far too big.
 */
export function makeCells(pts, set, what, { radius = 0, height = 1, down = false, hollow = false } = {}) {
    let cells = new Set();
    if (what === 'lines') {
        if (pts.length < 2)
            return null;
        for (let i = 0; i + 1 < pts.length; i++)
            blocksOn(c(pts[i]), c(pts[i + 1]), cells);
    }
    else {
        const V = shape(pts, set);
        if (!V)
            return null;
        cells = polygonBlocks(V, what === 'fill');
    }
    const LIMIT = 1500000;
    const grow = (src, offs) => {
        const out = new Set();
        for (const k of src) {
            const [x, y, z] = k.split(',').map(Number);
            for (const [dx, dy, dz] of offs)
                out.add(`${x + dx},${y + dy},${z + dz}`);
            if (out.size > LIMIT)
                throw new Error(`너무 큽니다 (${LIMIT}블록 넘음)`);
        }
        return out;
    };
    const r = Math.max(0, Math.floor(radius));
    if (r > 0) {
        const offs = [];
        for (let dx = -r; dx <= r; dx++)
            for (let dy = -r; dy <= r; dy++)
                for (let dz = -r; dz <= r; dz++)
                    if (dx * dx + dy * dy + dz * dz <= r * r + 0.5)
                        offs.push([dx, dy, dz]);
        cells = grow(cells, offs);
    }
    const h = Math.max(1, Math.floor(height));
    if (h > 1) {
        const offs = [];
        for (let i = 0; i < h; i++)
            offs.push([0, down ? -i : i, 0]);
        cells = grow(cells, offs);
    }
    if (hollow) {
        const out = new Set();
        for (const k of cells) {
            const [x, y, z] = k.split(',').map(Number);
            if ([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, d]) => !cells.has(`${x + a},${y + b},${z + d}`)))
                out.add(k);
        }
        cells = out;
    }
    return cells;
}

async function makeMenu(player) {
    const s = protState(player), set = s.settings.prot, P = s.prot.pts;
    const hasShape = !!shape(P, set);
    const r = await ask(player, 'prot:make', '각도기 - 만들기 (월드에딧식)', [
        { type: 'label', label: `도형: ${hasShape ? SHAPE_NAME(set) : '§8없음 (선 2개 또는 원은 선 1개)§r'} · 선 ${Math.max(0, P.length - 1)}개\n§7되돌리기는 다른 도구와 같이 (메뉴 > 되돌리기, /arc:undo)` },
        {
            key: 'what', type: 'dropdown', label: '무엇을', default: hasShape ? 'outline' : 'lines', options: [
                { value: 'lines', label: '선 채우기 (//line: 그린 선들)' },
                { value: 'outline', label: '도형 테두리 · 벽 (//outline, 높이를 주면 //walls)' },
                { value: 'fill', label: '도형 채우기 · 기둥 (//set 다각형, 높이를 주면 입체)' },
            ],
        },
        { key: 'block', type: 'block', label: '블록', default: set.block || 'stone' },
        { key: 'radius', type: 'slider', label: '굵기 (반지름, 0 = 1칸)', default: 0, min: 0, max: 8 },
        { key: 'height', type: 'slider', label: '높이 (쌓을 층 수, 1 = 한 겹)', default: 1, min: 1, max: 64 },
        { key: 'down', type: 'toggle', label: '아래로 쌓기 (끄면 위로)', default: false },
        { key: 'hollow', type: 'toggle', label: '속 비우기 (//hollow: 겉껍질만)', default: false },
        { key: 'mask', type: 'mask', label: '바꿀 대상 마스크 (//replace, 비우면 전부. air = 빈 곳만)', placeholder: '예: air  /  grass_block,dirt  /  !air', default: '' },
    ], { submit: '만들기' });
    if (!r)
        return;
    let pattern, mask, cells;
    try {
        pattern = parsePattern(blockValue(player, r, 'block'));
        mask = String(r.mask ?? '').trim() ? parseMask(r.mask) : null;
        cells = makeCells(P, set, r.what, r);
    }
    catch (e) {
        return say(player, `§c각도기: ${e?.message ?? e}`);
    }
    if (!cells)
        return say(player, '§c각도기: 도형이 없습니다 (선 2개, 원은 선 1개를 그리세요)');
    await place(player, cells, pattern, mask, `${{ lines: '선 채우기', outline: r.height > 1 ? '벽' : '테두리', fill: r.height > 1 ? '기둥' : '채우기' }[r.what]} ${cells.size}칸`);
}

async function place(player, cells, pattern, mask, label) {
    if (isBusy(player))
        return say(player, '§c이전 작업이 아직 진행 중입니다.');
    const ctx = makeContext(player, {});
    try {
        await runAsync((function* () {
            let n = 0;
            for (const k of cells) {
                const [x, y, z] = k.split(',').map(Number), p = { x, y, z };
                if (!mask || mask.test(p, ctx.edit))
                    pattern.place(ctx.edit, p);
                if (++n % 2000 === 0)
                    yield;
            }
        })());
    }
    catch (e) {
        return say(player, `§c각도기: ${e?.message ?? e}`);
    }
    await finish(player, '각도기', ctx.edit, label);
}

/** Hand the drawing to the other tools, or take theirs. */
async function sendMenu(player) {
    const s = protState(player), set = s.settings.prot, P = s.prot.pts;
    const V = shape(P, set);
    const pick = await menu(player, '각도기 - 보내기 · 가져오기', `점 ${P.length}개${V ? ' · 도형 ' + SHAPE_NAME(set) : ''}`, [
        { text: P.length ? '§9영역(1·2번)으로 보내기§r\n§8도형(없으면 선)을 감싸는 상자 → 채우기 등 영역 도구' : '§8영역으로 보내기 (점을 먼저)', value: P.length ? 'region' : '' },
        { text: P.length >= 2 ? '§9곡선 점으로 보내기§r\n§8선택 지팡이 곡선 점 → 도로·철도·곡선 도구' : '§8곡선 점으로 보내기 (선을 먼저)', value: P.length >= 2 ? 'points' : '' },
        { text: P.length >= 2 ? '§9프레임으로 보내기§r\n§8프레임 피커 → 로프트' : '§8프레임으로 보내기 (선을 먼저)', value: P.length >= 2 ? 'frame' : '' },
        { text: '§3곡선 점 가져오기§r\n§8선택 지팡이 곡선 점 → 각도기 점', value: 'fromPoints' },
        { text: '§3영역 가져오기§r\n§81·2번 지점의 바닥 직사각형 → 각도기 (사각형)', value: 'fromRegion' },
    ]);
    if (!pick)
        return;
    const fl = (p) => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
    const verts = V ? V.map(fl) : P.map(p => ({ ...p }));
    if (pick === 'region') {
        const r = await ask(player, 'prot:toRegion', '영역으로 보내기', [
            { key: 'up', type: 'slider', label: '위로 더 (칸, 벽·건물 높이)', default: 0, min: 0, max: 128 },
            { key: 'down', type: 'slider', label: '아래로 더 (칸)', default: 0, min: 0, max: 64 },
        ], { submit: '보내기' });
        if (!r)
            return;
        const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
        const box = V ? [...polygonBlocks(V, false)].map(k => { const [x, y, z] = k.split(',').map(Number); return { x, y, z }; }) : verts;
        for (const p of box)
            for (const a of ['x', 'y', 'z']) {
                lo[a] = Math.min(lo[a], p[a]);
                hi[a] = Math.max(hi[a], p[a]);
            }
        lo.y -= r.down;
        hi.y += r.up;
        s.pos1 = lo;
        s.pos2 = hi;
        s.dim = player.dimension.id;
        save(player);
        return say(player, `§9[각도기] 영역으로 보냄§r: ${fmt(lo)} ~ ${fmt(hi)} (${hi.x - lo.x + 1}×${hi.y - lo.y + 1}×${hi.z - lo.z + 1}) §7메뉴의 영역 도구(채우기 등)가 바로 씁니다`);
    }
    if (pick === 'points' || pick === 'frame') {
        const r = await ask(player, 'prot:toPoints', pick === 'frame' ? '프레임으로 보내기' : '곡선 점으로 보내기', [
            {
                key: 'src', type: 'dropdown', label: '무엇을', default: V ? 'shape' : 'pts', options: [
                    { value: 'pts', label: '그린 점들 (선)' },
                    ...(V ? [{ value: 'shape', label: `도형 꼭짓점 (${SHAPE_NAME(set)})` }] : []),
                ],
            },
            { key: 'close', type: 'toggle', label: '닫기 (처음 점을 끝에 한 번 더: 한 바퀴 도는 길)', default: false },
            ...(pick === 'points' ? [{ key: 'append', type: 'toggle', label: '지금 곡선 점 뒤에 이어 붙이기 (끄면 바꾸기)', default: false }] : []),
        ], { submit: '보내기' });
        if (!r)
            return;
        let list = (r.src === 'shape' && V ? verts : P.map(p => ({ ...p })));
        if (r.src === 'shape' && set.shape === 'circle')
            list = list.filter((_, i) => i % Math.max(1, Math.round(list.length / 16)) === 0); // a circle: 16 points are enough for a curve
        if (r.close && list.length > 2)
            list.push({ ...list[0] });
        if (pick === 'frame') {
            s.frames.push(list);
            save(player);
            return say(player, `§9[각도기] 프레임으로 보냄§r: 점 ${list.length}개 (프레임 ${s.frames.length}개) §7로프트 도구로 이어 붙이세요`);
        }
        s.points = r.append ? [...s.points, ...list] : list;
        s.wandMode = 'points';
        s.dim = player.dimension.id;
        save(player);
        return say(player, `§9[각도기] 곡선 점으로 보냄§r: 점 ${s.points.length}개 §7선택 지팡이가 곡선 점 모드로 바뀌었습니다. 도로·철도·곡선 도구가 이 점을 씁니다`);
    }
    if (pick === 'fromPoints') {
        if (s.points.length < 1)
            return say(player, '§c[각도기] 곡선 점이 없습니다');
        s.prot.pts = s.points.map(p => ({ ...p }));
        save(player);
        return bar(player, `${tagOf(set)} 곡선 점 ${s.prot.pts.length}개를 가져왔습니다`);
    }
    if (pick === 'fromRegion') {
        if (!s.pos1 || !s.pos2)
            return say(player, '§c[각도기] 영역(1·2번 지점)이 없습니다');
        const lo = { x: Math.min(s.pos1.x, s.pos2.x), z: Math.min(s.pos1.z, s.pos2.z) }, hi = { x: Math.max(s.pos1.x, s.pos2.x), z: Math.max(s.pos1.z, s.pos2.z) }, y = Math.min(s.pos1.y, s.pos2.y);
        s.prot.pts = [{ x: lo.x, y, z: lo.z }, { x: hi.x, y, z: lo.z }, { x: hi.x, y, z: hi.z }];
        s.settings.prot = { ...set, shape: 'para', mode: 'prot' };
        save(player);
        return bar(player, `${tagOf(set)} 영역 바닥 ${hi.x - lo.x + 1}×${hi.z - lo.z + 1} 직사각형을 가져왔습니다 (도형: 사각형)`);
    }
}

// ------------------------------------------------------------------ preview
/**
 * Draw it all with a painter (ui/draw.js): solid lines, the guides, the
 * shape, saved lines, the angle arc, a ruler (a tick every block, a long one
 * every 5) on the lines, and the blocks that would be built highlighted
 * (see-through, outlined) as on a selection.
 */
export function protPreview(s, P) {
    s.settings.prot = { ...DEFAULTS, ...(s.settings.prot ?? {}) };
    const set = s.settings.prot, pts = s.prot?.pts ?? [], ruler = isRuler(set);
    const V = ruler ? null : shape(pts, set);
    // as blocks: the blocks that would be built, as one outlined solid
    if (set.show !== 'line') {
        let cells;
        if (V)
            cells = polygonBlocks(V, set.fill);
        else if (pts.length >= 2) {
            cells = new Set();
            for (let i = 0; i + 1 < pts.length; i++)
                blocksOn(c(pts[i]), c(pts[i + 1]), cells);
        }
        if (cells?.size)
            P.cells([...cells].slice(0, 240), V ? 'shape' : 'line');
    }
    for (const p of pts.slice(-32))
        P.dot(c(p), 'point');
    for (let i = 0; i + 1 < pts.length; i++) {
        const a = c(pts[i]), b = c(pts[i + 1]);
        if (set.show !== 'block')
            P.seg(a, b, 'line', 0.06);
        if (ruler)
            rulerTicks(P, a, b);
    }
    if (!ruler) {
        for (const g of guides(pts, set)) {
            if (set.guideShow !== 'block')
                P.seg(g.o, add(g.o, mul(g.d, g.L)), 'guide', 0.05);
            if (set.guideShow !== 'line') {
                // the blocks a line along the guide would take (the nearest ones)
                const cells = new Set();
                blocksOn(g.o, add(g.o, mul(g.d, Math.min(g.L, GUIDE_BLOCKS))), cells);
                cells.delete(`${Math.floor(g.o.x)},${Math.floor(g.o.y)},${Math.floor(g.o.z)}`);
                P.cells([...cells], 'guide', 'guideFace');
            }
        }
        // the angle at the last corner, as a small arc
        if (pts.length >= 3) {
            const [A, B, C] = pts.slice(-3).map(c);
            const u = norm(sub(A, B)), w = norm(sub(C, B));
            let prev = null;
            for (let i = 0; i <= 12; i++) {
                const t = i / 12;
                const q = add(B, mul(norm(add(mul(u, 1 - t), mul(w, t))), 1.4));
                if (prev)
                    P.seg(prev, q, 'arc', 0.05);
                prev = q;
            }
        }
        if (V && set.show !== 'block')
            for (let i = 0; i < V.length; i++)
                P.seg(V[i], V[(i + 1) % V.length], 'shape', 0.05);
    }
    for (const [a, b] of (s.prot?.saved ?? []).slice(-24))
        P.seg(c(a), c(b), 'saved', 0.05);
}
/** Ticks across a line: every block, a long one every 5. */
function rulerTicks(P, a, b) {
    const L = len(sub(b, a));
    if (L < 1)
        return;
    const d = norm(sub(b, a));
    let side = cross(d, { x: 0, y: 1, z: 0 });
    if (len(side) < 1e-6)
        side = { x: 1, y: 0, z: 0 };
    side = norm(side);
    for (let t = 1; t < L && t <= 128; t++) {
        const m = add(a, mul(d, t)), k = t % 5 === 0 ? 0.45 : 0.22;
        P.seg(add(m, mul(side, -k)), add(m, mul(side, k)), 'tick', t % 5 === 0 ? 0.05 : 0.03);
    }
}
/** The ruler reading of the last line: exact length, along each axis, blocks it takes. */
export function measure(pts) {
    if (pts.length < 2)
        return '';
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L = Math.hypot(dx, dy, dz), H = Math.hypot(dx, dz);
    const cells = new Set();
    blocksOn(c(a), c(b), cells);
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const parts = [`§f길이 ${r3(L)}칸§r`, `Δx ${dx} Δy ${dy} Δz ${dz}`];
    if (dy && H)
        parts.push(`수평 ${r3(H)}칸, 경사 ${Math.round(Math.atan2(dy, H) * 1800 / Math.PI) / 10}°`);
    parts.push(`블록 ${cells.size}개`);
    return parts.join(' · ');
}
