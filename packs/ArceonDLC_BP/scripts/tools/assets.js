/*
 * Assets (Arceon //assetplacer save | load | remove + the asset placer item).
 *
 * Saving trims the selection to its non-air blocks (unless -t) and stores it
 * as a world structure 'arc_asset:<name>'. The origin (the block that lands
 * on the clicked spot) is the block the player looks at, -f moves it down to
 * the bottom of the asset, -c puts it at the centre (with -f: bottom centre).
 * The direction the player faced while saving is remembered, so "player
 * rotation" turns the asset to stay the same way round relative to the player.
 *
 * Placing (right-click with 'arc:asset_placer'): the origin goes on the block
 * next to the clicked face, the asset turns by 90 degree steps (none, player,
 * random) and flips randomly (none, X/Z, X/Y/Z) around the origin, air is not
 * pasted, block states turn and mirror with it (core/turn.js), and the edit
 * goes through the edit session so it can be undone.
 *
 * Metadata (origin, facing, size) lives in the world dynamic property
 * 'arc:assets'; the blocks live in the structure.
 */
import { world, ItemStack, StructureSaveMode } from '@minecraft/server';
import { region, save, session, volume } from '../core/session.js';
import { mul as mmul, matrix, mirrorMatrix, apply, turnStates, IDENTITY } from '../core/turn.js';
import { runAsync } from '../core/edit.js';
import { invert } from '../core/blocks.js';

export const PREFIX = 'arc_asset:';
export const MAX_BLOCKS = 500000; // Arceon asset-placer.max-blocks
export const PLACER_ITEM = 'arc:asset_placer';
const META = 'arc:assets';
const DIRS = ['north', 'east', 'south', 'west']; // clockwise
const DIR_KO = { north: '북', east: '동', south: '남', west: '서' };

// --------------------------------------------------------------------------
// form fields (ui/form.js ask())
// --------------------------------------------------------------------------
export const SAVE_FIELDS = [
    { key: 'name', type: 'text', label: '에셋 이름 (영문·숫자·공백·-)', placeholder: 'oak tree 1', default: '' },
    { type: 'label', label: '§7기준점: 바라보는 블록(선택 영역 안)이 설치할 때 클릭한 자리에 옵니다.' },
    { key: 'center', type: 'toggle', label: '기준점을 가운데로 (-c)', default: false },
    { key: 'floor', type: 'toggle', label: '기준점을 바닥 높이로 (-f)', default: false },
    { key: 'noTrim', type: 'toggle', label: '빈 공간 다듬지 않기 (-t)', default: false },
];
export const ROTATIONS = [
    { value: 'player', label: '플레이어 방향 따라 회전' },
    { value: 'random', label: '무작위 회전' },
    { value: 'none', label: '회전 없음' },
];
export const FLIPS = [
    { value: 'none', label: '뒤집기 없음' },
    { value: 'xz', label: '무작위 X/Z 뒤집기' },
    { value: 'xyz', label: '무작위 X/Y/Z 뒤집기' },
];
export const PLACER_FIELDS = [
    { key: 'names', type: 'text', label: '에셋 이름 (쉼표로 여러 개 = 놓을 때마다 무작위)', placeholder: 'oak_tree_1, oak_tree_2', default: '' },
    { key: 'rotation', type: 'dropdown', label: '회전', default: 'player', options: ROTATIONS },
    { key: 'flip', type: 'dropdown', label: '뒤집기', default: 'none', options: FLIPS },
];

// --------------------------------------------------------------------------
// metadata
// --------------------------------------------------------------------------
function readMeta() {
    try {
        const raw = world.getDynamicProperty(META);
        return typeof raw === 'string' ? JSON.parse(raw) : {};
    }
    catch (e) {
        return {};
    }
}
function writeMeta(m) {
    world.setDynamicProperty(META, JSON.stringify(m));
}

/** Arceon's name rule, stored lower case with '_' for spaces and slashes. */
export function assetKey(name) {
    const s = String(name ?? '').trim();
    if (!s)
        throw new Error('에셋 이름을 입력하세요');
    if (!/^[a-zA-Z0-9\- /_]+$/.test(s))
        throw new Error('에셋 이름에는 영문, 숫자, 공백, -, / 만 쓸 수 있습니다');
    return s.toLowerCase().replace(/[ /]+/g, '_');
}

/** 4-way facing like Arceon's l.a(Player): Bedrock yaw 0 = south, 90 = west. */
export function facing(yaw) {
    const r = (((yaw - 90) % 360) + 360) % 360;
    if (r < 45 || r >= 315)
        return 'west';
    if (r < 135)
        return 'north';
    if (r < 225)
        return 'east';
    return 'south';
}

// --------------------------------------------------------------------------
// save / list / remove / select
// --------------------------------------------------------------------------
/**
 * Save the player's selection as an asset. opts: {center, floor, noTrim}.
 * Resolves to a message; throws Korean errors.
 */
export async function saveAsset(player, name, opts = {}) {
    const key = assetKey(name);
    const reg = region(player);
    if (!reg)
        throw new Error('선택 영역(pos1, pos2)이 없습니다');
    const s = session(player);
    if (s.dim && s.dim !== player.dimension.id)
        throw new Error('선택 영역이 다른 차원에 있습니다');
    if (volume(reg) >= MAX_BLOCKS)
        throw new Error(`에셋은 ${MAX_BLOCKS / 1000}k 블록보다 작아야 합니다`);
    const sm = world.structureManager;
    if (sm.get(PREFIX + key) || readMeta()[key])
        throw new Error(`이미 있는 이름입니다: ${key}`);
    const dim = player.dimension;
    const { min, max } = reg;
    // origin: the looked-at block, which must be inside the selection
    let hit = null;
    try {
        hit = player.getBlockFromViewDirection({ maxDistance: 79 })?.block;
    }
    catch (e) { }
    const look = hit ? { x: hit.location?.x ?? hit.x, y: hit.location?.y ?? hit.y, z: hit.location?.z ?? hit.z } : null;
    const inside = look && look.x >= min.x && look.x <= max.x && look.y >= min.y && look.y <= max.y && look.z >= min.z && look.z <= max.z;
    if (!opts.center && !inside)
        throw new Error('선택 영역 안의 블록을 바라보세요 (그 블록이 기준점이 됩니다). 또는 "가운데로 (-c)"를 켜세요');
    // trim to the blocks that exist (Arceon's ExistingBlockMask scan)
    const box = await runAsync(trim(dim, min, max, !opts.noTrim));
    if (!box)
        throw new Error('선택 영역에 블록이 없습니다');
    let origin;
    if (opts.center) {
        const c = { x: Math.floor((box.min.x + box.max.x) / 2), y: Math.floor((box.min.y + box.max.y) / 2), z: Math.floor((box.min.z + box.max.z) / 2) };
        origin = opts.floor ? { x: c.x, y: box.min.y, z: c.z } : c;
    }
    else if (opts.floor)
        origin = { x: look.x, y: box.min.y, z: look.z };
    else
        origin = look;
    try {
        sm.createFromWorld(PREFIX + key, dim, box.min, box.max, {
            saveMode: StructureSaveMode.World, includeEntities: false, includeBlocks: true,
        });
    }
    catch (e) {
        throw new Error(`구조물 저장 실패: ${e?.message ?? e}`);
    }
    const dir = facing(player.getRotation().y);
    const size = { x: box.max.x - box.min.x + 1, y: box.max.y - box.min.y + 1, z: box.max.z - box.min.z + 1 };
    const meta = readMeta();
    meta[key] = { origin: { x: origin.x - box.min.x, y: origin.y - box.min.y, z: origin.z - box.min.z }, size, dir, by: player.name };
    writeMeta(meta);
    return `에셋 저장: ${key} (${size.x}×${size.y}×${size.z}, ${DIR_KO[dir]}쪽 보고 저장)`;
}

function* trim(dim, min, max, doTrim) {
    const existing = (x, y, z) => {
        try {
            const b = dim.getBlock({ x, y, z });
            return !!b && !b.isAir;
        }
        catch (e) {
            return false;
        }
    };
    if (!doTrim) {
        // Arceon still needs one block somewhere
        let n = 0;
        for (let y = min.y; y <= max.y; y++)
            for (let x = min.x; x <= max.x; x++)
                for (let z = min.z; z <= max.z; z++) {
                    if (existing(x, y, z))
                        return { min: { ...min }, max: { ...max } };
                    if (++n % 4000 === 0)
                        yield;
                }
        return null;
    }
    const lo = { ...max }, hi = { ...min };
    let any = false, n = 0;
    for (let y = min.y; y <= max.y; y++)
        for (let x = min.x; x <= max.x; x++)
            for (let z = min.z; z <= max.z; z++) {
                if (++n % 4000 === 0)
                    yield;
                if (!existing(x, y, z))
                    continue;
                any = true;
                lo.x = Math.min(lo.x, x); lo.y = Math.min(lo.y, y); lo.z = Math.min(lo.z, z);
                hi.x = Math.max(hi.x, x); hi.y = Math.max(hi.y, y); hi.z = Math.max(hi.z, z);
            }
    return any ? { min: lo, max: hi } : null;
}

/** All saved assets: [{name, size, dir, origin, by}] sorted by name. */
export function listAssets() {
    const meta = readMeta();
    let ids = [];
    try {
        ids = world.structureManager.getWorldStructureIds();
    }
    catch (e) { }
    return ids.filter(id => id.startsWith(PREFIX)).map(id => {
        const name = id.slice(PREFIX.length);
        const m = meta[name] ?? {};
        return { name, size: m.size ?? null, dir: m.dir ?? 'north', origin: m.origin ?? { x: 0, y: 0, z: 0 }, by: m.by ?? '' };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Delete an asset. Returns true when something was removed. */
export function removeAsset(name) {
    const key = assetKey(name);
    let gone = false;
    try {
        gone = world.structureManager.delete(PREFIX + key);
    }
    catch (e) { }
    const meta = readMeta();
    if (meta[key]) {
        delete meta[key];
        writeMeta(meta);
        gone = true;
    }
    return gone;
}

/**
 * Configure the asset placer: names (one is picked at random per click),
 * opts {rotation: 'player'|'random'|'none', flip: 'none'|'xz'|'xyz'}.
 */
export function selectAsset(player, names, opts = {}) {
    const list = (Array.isArray(names) ? names : String(names ?? '').split(',')).map(x => String(x).trim()).filter(Boolean).map(assetKey);
    if (!list.length)
        throw new Error('에셋 이름을 입력하세요');
    const have = new Set(listAssets().map(a => a.name));
    const missing = list.filter(n => !have.has(n));
    if (missing.length)
        throw new Error(`없는 에셋: ${missing.join(', ')}`);
    const rotation = ['player', 'random', 'none'].includes(opts.rotation) ? opts.rotation : 'player';
    const flip = ['none', 'xz', 'xyz'].includes(opts.flip) ? opts.flip : 'none';
    session(player).settings.assetPlacer = { names: list, rotation, flip };
    save(player);
    return `에셋 설치기: ${list.join(', ')} (${ROTATIONS.find(r => r.value === rotation).label}, ${FLIPS.find(f => f.value === flip).label})`;
}

/** Give the placer item if the player has none (the item is defined by the pack). */
export function givePlacer(player) {
    try {
        const inv = player.getComponent('minecraft:inventory')?.container;
        if (!inv)
            return false;
        for (let i = 0; i < inv.size; i++)
            if (inv.getItem(i)?.typeId === PLACER_ITEM)
                return false;
        inv.addItem(new ItemStack(PLACER_ITEM, 1));
        return true;
    }
    catch (e) {
        return false;
    }
}

// --------------------------------------------------------------------------
// placing
// --------------------------------------------------------------------------
const FACE = {
    up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0],
};

/**
 * Transform for one placement: {yaw (clockwise degrees), flip: [fx, fy, fz], m}.
 * rand: () => [0, 1) for tests.
 */
export function placement(cfg, meta, playerYaw, rand = Math.random) {
    let yaw = 0;
    if (cfg.rotation === 'player')
        yaw = (DIRS.indexOf(facing(playerYaw)) - DIRS.indexOf(meta.dir ?? 'north')) * 90;
    else if (cfg.rotation === 'random')
        yaw = Math.floor(rand() * 4) * 90;
    yaw = ((yaw % 360) + 360) % 360;
    const flip = [1, 1, 1];
    if (cfg.flip === 'xz' || cfg.flip === 'xyz') {
        if (rand() < 0.5)
            flip[0] = -1;
        if (cfg.flip === 'xyz' && rand() < 0.5)
            flip[1] = -1;
        if (rand() < 0.5)
            flip[2] = -1;
    }
    let f = IDENTITY;
    if (flip[0] < 0)
        f = mmul(mirrorMatrix('x'), f);
    if (flip[1] < 0)
        f = mmul(mirrorMatrix('y'), f);
    if (flip[2] < 0)
        f = mmul(mirrorMatrix('z'), f);
    // flip first, then turn (both around the origin)
    const m = mmul(matrix(yaw, 0, 0), f).map(r => r.map(Math.round));
    return { yaw, flip, m };
}

/**
 * Place the configured asset. hit = the clicked block {x, y, z} plus an
 * optional face ('Up', 'North', ... from the event; default up): the origin
 * goes on the block next to that face. Generator for runAsync / the runner.
 */
export function* placeAsset(ctx, hit, rand = Math.random) {
    const cfg = ctx.session.settings.assetPlacer;
    if (!cfg?.names?.length)
        throw new Error('에셋 설치기에 에셋이 없습니다. 아르세온 메뉴 > 에셋에서 고르세요');
    const name = cfg.names[Math.floor(rand() * cfg.names.length) % cfg.names.length];
    const st = world.structureManager.get(PREFIX + name);
    if (!st)
        throw new Error(`에셋을 찾을 수 없습니다: ${name}`);
    const meta = readMeta()[name] ?? { origin: { x: 0, y: 0, z: 0 }, dir: 'north' };
    const size = st.size;
    const o = meta.origin;
    const { yaw, flip, m } = placement(cfg, meta, ctx.rotation.y, rand);
    const fd = FACE[String(hit.face ?? 'up').toLowerCase()] ?? FACE.up;
    const target = { x: Math.floor(hit.x) + fd[0], y: Math.floor(hit.y) + fd[1], z: Math.floor(hit.z) + fd[2] };
    const edit = ctx.edit;
    const turned = new Map();
    const turn = yaw !== 0 || flip.some(f => f < 0);
    let n = 0;
    for (let x = 0; x < size.x; x++)
        for (let y = 0; y < size.y; y++)
            for (let z = 0; z < size.z; z++) {
                if (++n % 3000 === 0)
                    yield;
                let p;
                try {
                    p = st.getBlockPermutation({ x, y, z });
                }
                catch (e) {
                    continue;
                }
                if (!p)
                    continue;
                const id = p.type.id;
                if (id === 'minecraft:air' || id === 'minecraft:structure_void')
                    continue;
                let out = p;
                if (turn) {
                    out = turned.get(p);
                    if (!out) {
                        out = turnStates(p, m);
                        if (flip[1] < 0) // upside down: stairs, slab halves, lanterns...
                            out = invert(out);
                        turned.set(p, out);
                    }
                }
                const d = apply(m, [x - o.x, y - o.y, z - o.z]);
                edit.set({ x: target.x + d[0], y: target.y + d[1], z: target.z + d[2] }, out);
            }
    const fl = flip.map((f, i) => f < 0 ? 'XYZ'[i] : '').join('');
    return `${name}${yaw ? ` ${yaw}°` : ''}${fl ? ` 뒤집기 ${fl}` : ''}`;
}

// --------------------------------------------------------------------------
// menu tool
// --------------------------------------------------------------------------
export default {
    id: 'assets',
    name: '에셋',
    desc: '선택 영역을 이름 붙여 저장하고, 에셋 설치기(우클릭)로 회전·뒤집기 하며 찍어 놓습니다.',
    icon: 'textures/blocks/structure_block_save',
    needs: 'none',
    fields: [
        {
            key: 'action', type: 'dropdown', label: '할 일', default: 'select', options: [
                { value: 'save', label: '선택 영역을 에셋으로 저장' },
                { value: 'select', label: '에셋 설치기에 에셋 넣기 (+ 설치기 받기)' },
                { value: 'list', label: '에셋 목록 보기' },
                { value: 'remove', label: '에셋 지우기' },
            ],
        },
        { key: 'name', type: 'text', label: '에셋 이름 (설치기: 쉼표로 여러 개)', placeholder: 'oak tree 1', default: '' },
        { type: 'header', label: '저장 옵션' },
        ...SAVE_FIELDS.filter(f => f.key && f.key !== 'name'),
        { type: 'header', label: '설치 옵션' },
        ...PLACER_FIELDS.filter(f => f.key !== 'names'),
    ],
    async run(ctx, v) {
        switch (v.action) {
            case 'save':
                return saveAsset(ctx.player, v.name, { center: v.center, floor: v.floor, noTrim: v.noTrim });
            case 'remove':
                if (!removeAsset(v.name))
                    throw new Error(`없는 에셋: ${v.name}`);
                return `에셋 지움: ${assetKey(v.name)}`;
            case 'list': {
                const all = listAssets();
                if (!all.length)
                    return '저장된 에셋이 없습니다';
                ctx.say('§b에셋 목록: §f' + all.map(a => a.size ? `${a.name} §7(${a.size.x}×${a.size.y}×${a.size.z})§f` : a.name).join(', '));
                return `${all.length}개`;
            }
            default: {
                const msg = selectAsset(ctx.player, v.name, { rotation: v.rotation, flip: v.flip });
                return msg + (givePlacer(ctx.player) ? ' - 설치기를 받았습니다' : '');
            }
        }
    },
};
