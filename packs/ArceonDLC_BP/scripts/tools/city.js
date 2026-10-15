/*
 * City map (도시 지도 불러오기): builds a real station district from map data
 * (data/city_*.js, made from OpenStreetMap by tools/city), 1 block = 1 m,
 * with the station where the player stands. Only the size of the area to
 * build can be chosen; the scale is always 1:1.
 *
 * By default the map itself, drawn as it is on the map (buildMapTile); or a
 * realistic flat ground (asphalt, pavements), or in 3D, which builds:
 * buildings at their real height (outline walls with windows, a flat
 * roof; glass curtain walls on tall ones), roads (asphalt, a dashed centre
 * line, pavements, elevated roads on piers), railways (ballast and rails,
 * viaducts on piers) and platforms, water and green areas with trees.
 * The area is built tile by tile (loading far chunks as it goes); the whole
 * build is one step of undo.
 *
 * A hidden tool (settings code), like the yard tool.
 */
import { system } from '@minecraft/server';
import { perm } from '../core/blocks.js';
import { history, loadAll } from '../core/edit.js';
import { placeAll } from '../core/loader.js';
import { unlocked } from '../core/session.js';
import { CITIES } from '../data/cities.js';

const TILE = 64;
const ROAD_KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
    'living_street', 'service', 'pedestrian', 'footway', 'steps', 'path', 'cycleway', 'corridor', 'other'];
const WALK = new Set([9, 10, 11, 12, 13, 14]); // pedestrian, footway, steps, path, cycleway, corridor
const ROAD_UP = 6; // an elevated road: deck this far up per layer
const RAIL_UP = 8; // a viaduct: track bed this far up per layer
const PIER_EVERY = 20;

const P = (id, st) => {
    try {
        return perm('minecraft:' + id, st);
    }
    catch (e) {
        return perm('minecraft:stone');
    }
};
const WALLS = ['white_concrete', 'light_gray_concrete', 'smooth_sandstone', 'quartz_block', 'brick_block', 'white_terracotta',
    'light_gray_terracotta', 'stone_bricks', 'polished_andesite', 'calcite', 'mud_bricks', 'polished_diorite'];
const GLASS = ['light_blue_stained_glass', 'cyan_stained_glass', 'gray_stained_glass', 'light_gray_stained_glass'];

// ---------------------------------------------------------------- data
const parsed = new Map();
/**
 * The city, turned by `turn` degrees about the station (clockwise seen from
 * above; the data comes with the tracks along Z, `raw.a` = how far that was
 * turned from true north).
 */
function city(id, turn = 0) {
    const key = id + '@' + turn;
    let d = parsed.get(key);
    if (d)
        return d;
    const c = CITIES.find(x => x.id === id);
    if (!c)
        throw new Error('그 도시가 없습니다');
    const raw = JSON.parse(c.data);
    const cs = Math.cos(turn * Math.PI / 180), sn = Math.sin(turn * Math.PI / 180);
    const pts = (a, from) => {
        const out = [];
        for (let i = from; i + 1 < a.length; i += 2)
            out.push(turn ? [a[i] * cs - a[i + 1] * sn, a[i] * sn + a[i + 1] * cs] : [a[i], a[i + 1]]);
        return out;
    };
    const box = (p, pad = 0) => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const [x, z] of p) {
            x0 = Math.min(x0, x);
            z0 = Math.min(z0, z);
            x1 = Math.max(x1, x);
            z1 = Math.max(z1, z);
        }
        return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
    };
    d = {
        name: raw.n, align: raw.a,
        buildings: raw.b.map((a, i) => { const p = pts(a, 2); return { i, h: a[0], min: a[1] % 1000, roof: a[1] >= 1000, pts: p, box: box(p, 1) }; }),
        roads: raw.r.map(a => { const p = pts(a, 4); return { kind: a[0], w: a[1], fl: a[2], layer: a[3], pts: p, box: box(p, a[1] / 2 + 2) }; }),
        rails: raw.t.map(a => { const p = pts(a, 2); return { fl: a[0], layer: a[1], pts: p, box: box(p, 4) }; }),
        platforms: raw.p.map(a => { const p = pts(a, 2); return { fl: a[0], layer: a[1], pts: p, box: box(p, 4) }; }),
        water: raw.w.map(a => { const p = pts(a, 1); return { area: !!a[0], pts: p, box: box(p, 6) }; }),
        green: raw.g.map(a => { const p = pts(a, 0); return { pts: p, box: box(p, 3) }; }),
        bounds: raw.bd?.length ? pts(raw.bd, 0) : null,
    };
    // a building over the tracks (a station hall) is a roof on columns, not walls across the line
    for (const b of d.buildings) {
        if (b.roof)
            continue;
        for (const r of d.rails) {
            if (!overlap(r.box, b.box))
                continue;
            if (r.pts.some(([x, z]) => inPoly(b.pts, x, z))) {
                b.roof = true;
                break;
            }
        }
    }
    // platforms stand level with the tracks beside them
    for (const pl of d.platforms) {
        // the nearest track to the platform's middle
        const mx = pl.pts.reduce((t, p) => t + p[0], 0) / pl.pts.length, mz = pl.pts.reduce((t, p) => t + p[1], 0) / pl.pts.length;
        let best = null;
        for (const r of d.rails) {
            if (!overlap(r.box, pl.box))
                continue;
            for (let i = 0; i + 1 < r.pts.length; i++) {
                const dd = segDist(mx, mz, r.pts[i], r.pts[i + 1]);
                if (!best || dd < best.d)
                    best = { d: dd, up: railUp3(r) };
            }
        }
        pl.up = best ? best.up : (pl.layer > 0 ? pl.layer * RAIL_UP : 0);
    }
    // the extent after turning
    const all = [d.buildings, d.roads, d.rails, d.platforms, d.water, d.green].flat();
    d.ext = all.reduce((e, f) => [Math.min(e[0], f.box[0]), Math.min(e[1], f.box[1]), Math.max(e[2], f.box[2]), Math.max(e[3], f.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    parsed.clear(); // one city in memory at a time
    parsed.set(key, d);
    return d;
}
function inPoly(pts, x, z) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, zi] = pts[i], [xj, zj] = pts[j];
        if ((zi > z) !== (zj > z) && x < xi + (z - zi) * (xj - xi) / (zj - zi))
            c = !c;
    }
    return c;
}
function segDist(px, pz, [ax, az], [bx, bz]) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
const overlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const railUp3 = (r) => (r.fl & 1 || r.layer > 0) ? Math.max(1, r.layer) * RAIL_UP : 0;
const roadUp3 = (r) => (r.fl & 1 || r.layer > 0) ? Math.max(1, r.layer) * ROAD_UP : 0;
const hash = (n) => {
    n = Math.imul(n ^ (n >>> 15), 2246822519);
    n = Math.imul(n ^ (n >>> 13), 3266489917);
    return (n ^ (n >>> 16)) >>> 0;
};

// ---------------------------------------------------------------- raster
/** x crossings of a closed polygon with the row through z. */
function crossings(pts, z) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, zi] = pts[i], [xj, zj] = pts[j];
        if ((zi > z) !== (zj > z))
            xs.push(xi + (z - zi) * (xj - xi) / (zj - zi));
    }
    return xs.sort((a, b) => a - b);
}
/** Cells (block x, z) inside the polygon, in a window [x0..x1] × [z0..z1]: a grid. */
function polyGrid(pts, x0, z0, x1, z1) {
    const W = x1 - x0 + 1, H = z1 - z0 + 1, g = new Uint8Array(W * H);
    for (let z = z0; z <= z1; z++) {
        const xs = crossings(pts, z + 0.5);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const a = Math.max(x0, Math.ceil(xs[k] - 0.5)), b = Math.min(x1, Math.floor(xs[k + 1] - 0.5));
            for (let x = a; x <= b; x++)
                g[(z - z0) * W + (x - x0)] = 1;
        }
    }
    return { g, W, x0, z0, x1, z1, at: (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && g[(z - z0) * W + (x - x0)] === 1 };
}
/** Cells within r of a polyline, in the window: calls f(x, z, dist, along). */
function band(pts, r, x0, z0, x1, z1, f) {
    let run = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
        const lx = Math.max(x0, Math.floor(Math.min(ax, bx) - r)), hx = Math.min(x1, Math.ceil(Math.max(ax, bx) + r));
        const lz = Math.max(z0, Math.floor(Math.min(az, bz) - r)), hz = Math.min(z1, Math.ceil(Math.max(az, bz) + r));
        for (let x = lx; x <= hx; x++)
            for (let z = lz; z <= hz; z++) {
                const px = x + 0.5, pz = z + 0.5;
                const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
                const d = Math.hypot(px - ax - dx * t, pz - az - dz * t);
                if (d <= r)
                    f(x, z, d, run + t * L, dx, dz);
            }
        run += L;
    }
}
/** Points every `step` along a polyline. */
function* every(pts, step) {
    let left = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
        for (let t = left; t < L; t += step)
            yield [ax + (bx - ax) * t / L, az + (bz - az) * t / L];
        left = ((left - L) % step + step) % step;
    }
}

// ---------------------------------------------------------------- map style
/**
 * The map as it is drawn (like the preview of tools/city): a light ground over
 * the whole area, roads in their colours (main roads pale yellow, small ones
 * white, walkways grey), building footprints in grey-blue shades by height
 * with a dark outline, green, water, pink platforms, and the railways as dark
 * lines (red on bridges), or real tracks, or none. All at ground level.
 */
function buildMapTile(d, o, x0, z0, x1, z1, R, minY, maxY, rails = 'line') {
    const out = new Map(), g = o.y, tb = [x0, z0, x1, z1];
    const put = (x, y, z, p) => {
        if (x < x0 || x > x1 || z < z0 || z > z1 || Math.abs(x) > R || Math.abs(z) > R || y < minY || y > maxY)
            return;
        out.set(`${x + o.x},${y},${z + o.z}`, p);
    };
    const M = {
        ground: P('smooth_quartz'), green: P('grass_block'), water: P('light_blue_concrete'),
        major: P('smooth_sandstone'), bridge: P('sandstone'), minor: P('snow'), walk: P('light_gray_concrete_powder'),
        low: P('white_terracotta'), mid: P('light_blue_terracotta'), high: P('gray_concrete'), line: P('gray_concrete'), lineDark: P('black_concrete'),
        platform: P('pink_concrete_powder'), rail: P('black_concrete'), railBridge: P('red_concrete'),
        gravel: P('gravel'), railNS: P('rail', { rail_direction: 0 }), railEW: P('rail', { rail_direction: 1 }),
    };
    const area = (pts, f, pad = 0) => {
        const G = polyGrid(pts, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
        for (let z = z0; z <= z1; z++)
            for (let x = x0; x <= x1; x++)
                if (G.at(x, z))
                    f(x, z, !G.at(x + 1, z) || !G.at(x - 1, z) || !G.at(x, z + 1) || !G.at(x, z - 1));
    };
    // the ground of the area the map covers
    if (d.bounds)
        area(d.bounds, (x, z) => put(x, g, z, M.ground));
    for (const a of d.green)
        if (overlap(a.box, tb))
            area(a.pts, (x, z) => put(x, g, z, M.green));
    for (const w of d.water) {
        if (!overlap(w.box, tb))
            continue;
        if (w.area)
            area(w.pts, (x, z) => put(x, g, z, M.water));
        else
            band(w.pts, 5, x0, z0, x1, z1, (x, z) => put(x, g, z, M.water));
    }
    // roads: walkways, then small roads, then main roads on top
    const rank = (r) => WALK.has(r.kind) ? 0 : r.kind >= 5 ? 1 : 2;
    for (const r of d.roads.filter(r => overlap(r.box, tb)).sort((a, b) => rank(a) - rank(b))) {
        const blk = WALK.has(r.kind) ? M.walk : r.kind >= 5 ? M.minor : r.fl & 1 ? M.bridge : M.major;
        if (r.fl & 4)
            area(r.pts, (x, z) => put(x, g, z, blk));
        else
            band(r.pts, Math.max(0.6, r.w / 2), x0, z0, x1, z1, (x, z) => put(x, g, z, blk));
    }
    // building footprints over the roads, shaded by height, low ones first
    for (const b of d.buildings.filter(b => overlap(b.box, tb)).sort((a, b) => a.h - b.h)) {
        const fill = b.h >= 60 ? M.high : b.h >= 20 ? M.mid : M.low, edge = b.h >= 60 ? M.lineDark : M.line;
        area(b.pts, (x, z, e) => put(x, g, z, e ? edge : fill));
    }
    if (rails === 'none')
        return out;
    for (const p of d.platforms) {
        if (!overlap(p.box, tb))
            continue;
        if (p.fl & 4)
            area(p.pts, (x, z) => put(x, g, z, M.platform));
        else
            band(p.pts, 1.5, x0, z0, x1, z1, (x, z) => put(x, g, z, M.platform));
    }
    for (const r of d.rails) {
        if (!overlap(r.box, tb))
            continue;
        if (rails === 'track')
            band(r.pts, 1.6, x0, z0, x1, z1, (x, z, dist, along, dx, dz) => {
                put(x, g, z, M.gravel);
                if (dist <= 0.5)
                    put(x, g + 1, z, Math.abs(dx) > Math.abs(dz) ? M.railEW : M.railNS);
            });
        else
            band(r.pts, 0.75, x0, z0, x1, z1, (x, z) => put(x, g, z, r.fl & 1 ? M.railBridge : M.rail));
    }
    return out;
}

// ---------------------------------------------------------------- one tile
/**
 * One tile. `flat`: the map itself, laid flat on the ground (building
 * footprints, roads, tracks, platforms, water, green, all at ground level);
 * otherwise in 3D (buildings at their height, viaducts, elevated roads).
 */
function buildTile(d, o, x0, z0, x1, z1, R, minY, maxY, flat = true, rails = 'track') {
    const roadUp = flat ? () => 0 : roadUp3, railUp = flat ? () => 0 : railUp3;
    const out = new Map();
    const inRange = (x, z) => Math.abs(x) <= R && Math.abs(z) <= R;
    const put = (x, y, z, p) => {
        if (x < x0 || x > x1 || z < z0 || z > z1 || !inRange(x, z) || y < minY || y > maxY)
            return;
        out.set(`${x + o.x},${y},${z + o.z}`, p);
    };
    const tb = [x0, z0, x1, z1], g = o.y;
    const B = {
        grass: P('grass_block'), water: P('water'), asphalt: P('gray_concrete'), line: P('white_concrete'),
        walk: P('smooth_stone'), plaza: P('polished_andesite'), deck: P('light_gray_concrete'), gravel: P('gravel'),
        railNS: P('rail', { rail_direction: 0 }), railEW: P('rail', { rail_direction: 1 }), platform: P('smooth_stone'),
        edge: P('yellow_concrete'), roof: P('smooth_stone'), footprint: P('white_concrete'), log: P('oak_log'), leaves: P('oak_leaves', { persistent_bit: true }),
    };
    // green, with a tree now and then
    for (const a of d.green) {
        if (!overlap(a.box, tb))
            continue;
        const G = polyGrid(a.pts, x0, z0, x1, z1);
        for (let z = z0; z <= z1; z++)
            for (let x = x0; x <= x1; x++)
                if (G.at(x, z)) {
                    put(x, g, z, B.grass);
                    if (!flat && hash(x * 73856093 ^ z * 19349663) % 41 === 0) {
                        for (let y = 1; y <= 3; y++)
                            put(x, g + y, z, B.log);
                        for (let dx = -1; dx <= 1; dx++)
                            for (let dz = -1; dz <= 1; dz++) {
                                put(x + dx, g + 4, z + dz, B.leaves);
                                if (!dx || !dz)
                                    put(x + dx, g + 5, z + dz, B.leaves);
                            }
                    }
                }
    }
    // water
    for (const w of d.water) {
        if (!overlap(w.box, tb))
            continue;
        const wet = (x, z) => {
            put(x, g, z, B.water);
            put(x, g - 1, z, B.water);
        };
        if (w.area) {
            const G = polyGrid(w.pts, x0, z0, x1, z1);
            for (let z = z0; z <= z1; z++)
                for (let x = x0; x <= x1; x++)
                    if (G.at(x, z))
                        wet(x, z);
        }
        else
            band(w.pts, 5, x0, z0, x1, z1, (x, z) => wet(x, z));
    }
    // flat: building footprints under the roads and tracks (a light outline, white inside)
    if (flat)
        for (const b of d.buildings) {
            if (!overlap(b.box, tb))
                continue;
            const G = polyGrid(b.pts, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
            for (let z = z0; z <= z1; z++)
                for (let x = x0; x <= x1; x++)
                    if (G.at(x, z))
                        put(x, g, z, !G.at(x + 1, z) || !G.at(x - 1, z) || !G.at(x, z + 1) || !G.at(x, z - 1) ? B.deck : B.footprint);
        }
    // roads: walkways first, then the carriageways over them
    const roads = d.roads.filter(r => overlap(r.box, tb)).sort((a, b) => (WALK.has(b.kind) ? 1 : 0) - (WALK.has(a.kind) ? 1 : 0) || roadUp(a) - roadUp(b));
    for (const r of roads) {
        const up = roadUp(r), y = g + up, walk = WALK.has(r.kind), half = Math.max(0.8, r.w / 2);
        const surf = walk ? (r.kind === 9 ? B.plaza : B.walk) : B.asphalt;
        if (r.fl & 4) {
            const G = polyGrid(r.pts, x0, z0, x1, z1);
            for (let z = z0; z <= z1; z++)
                for (let x = x0; x <= x1; x++)
                    if (G.at(x, z))
                        put(x, y, z, surf);
            continue;
        }
        const dashes = !walk && r.kind <= 4 && r.w >= 6 && !up;
        band(r.pts, half, x0, z0, x1, z1, (x, z, dist, along) => {
            put(x, y, z, dashes && dist <= 0.5 && Math.floor(along) % 6 < 3 ? B.line : surf);
            if (up) {
                put(x, y - 1, z, B.deck);
                if (dist > half - 1)
                    put(x, y + 1, z, B.deck); // parapet
            }
        });
        if (up)
            for (const [px, pz] of every(r.pts, PIER_EVERY))
                for (let dx = 0; dx <= 1; dx++)
                    for (let dz = 0; dz <= 1; dz++)
                        for (let yy = g + 1; yy <= y - 2; yy++)
                            put(Math.floor(px) + dx, yy, Math.floor(pz) + dz, B.deck);
    }
    // railways: ballast and rails, viaducts on piers
    for (const r of rails === 'none' ? [] : d.rails) {
        if (!overlap(r.box, tb))
            continue;
        const up = railUp(r), y = g + up;
        band(r.pts, 2.5, x0, z0, x1, z1, (x, z, dist, along, dx, dz) => {
            if (up)
                put(x, y - 1, z, B.deck);
            if (dist <= 1.6)
                put(x, y, z, B.gravel);
            else if (up)
                put(x, y, z, B.deck);
            if (dist <= 0.5)
                put(x, y + 1, z, Math.abs(dx) > Math.abs(dz) ? B.railEW : B.railNS);
        });
        if (up)
            for (const [px, pz] of every(r.pts, PIER_EVERY))
                for (let yy = g + 1; yy <= y - 2; yy++)
                    put(Math.floor(px), yy, Math.floor(pz), B.deck);
    }
    // platforms, level with their tracks, a yellow line along the edge
    for (const p of rails === 'none' ? [] : d.platforms) {
        if (!overlap(p.box, tb))
            continue;
        const y = flat ? g : g + p.up + 1;
        const fill = (x, z, edge) => {
            put(x, y, z, edge ? B.edge : B.platform);
            if (p.up)
                put(x, y - 1, z, B.deck);
        };
        if (p.fl & 4) {
            const G = polyGrid(p.pts, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
            for (let z = z0; z <= z1; z++)
                for (let x = x0; x <= x1; x++)
                    if (G.at(x, z))
                        fill(x, z, !G.at(x + 1, z) || !G.at(x - 1, z) || !G.at(x, z + 1) || !G.at(x, z - 1));
        }
        else
            band(p.pts, 3, x0, z0, x1, z1, (x, z, dist) => fill(x, z, dist > 2.2));
    }
    // buildings: walls with windows (glass curtain walls on tall ones), a flat roof
    for (const b of flat ? [] : d.buildings) {
        if (!overlap(b.box, tb))
            continue;
        const G = polyGrid(b.pts, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
        const base = g + 1 + Math.max(0, b.min), top = Math.min(maxY, g + Math.max(3, b.h));
        const hsh = hash(b.i + 1), tall = b.h >= 45;
        const wall = P(tall ? (hsh & 1 ? 'light_gray_concrete' : 'white_concrete') : WALLS[hsh % WALLS.length]);
        const glass = P(tall ? GLASS[hsh % GLASS.length] : (hsh >> 4) % 3 === 0 ? 'gray_stained_glass' : 'glass');
        for (let z = z0; z <= z1; z++)
            for (let x = x0; x <= x1; x++) {
                if (!G.at(x, z))
                    continue;
                const edge = !G.at(x + 1, z) || !G.at(x - 1, z) || !G.at(x, z + 1) || !G.at(x, z - 1);
                put(x, top, z, B.roof);
                if (b.roof) {
                    // a roof on columns: a column every 12 along the edge, a beam under the edge
                    if (edge) {
                        put(x, top - 1, z, B.deck);
                        if ((x % 12 === 0 && z % 4 === 0) || (z % 12 === 0 && x % 4 === 0))
                            for (let y = g + 1; y < top - 1; y++)
                                put(x, y, z, B.deck);
                    }
                    continue;
                }
                if (b.min > 0)
                    put(x, base, z, wall);
                if (!edge)
                    continue;
                for (let y = base; y < top; y++) {
                    const f = (y - base) % 4;
                    const win = tall ? f !== 0 : (f === 1 || f === 2) && (x + z) % 3 !== 0 && y > base + 1;
                    put(x, y, z, win ? glass : wall);
                }
            }
    }
    return out;
}

const tick = () => new Promise(r => system.runTimeout(r, 1));

export default {
    id: 'city',
    name: '도시 지도 불러오기',
    desc: '실제 역 주변 지도(오픈스트리트맵)를 1:1(1블록 = 1m)로 깝니다. 내가 선 자리가 역, 발밑 높이가 지면입니다. 기본은 지도 그림 그대로(평면), 입체는 방식에서. 되돌리기 한 번이면 통째로 되돌아갑니다.',
    icon: 'textures/items/map_filled',
    needs: 'none',
    noEdit: true,
    hidden: true,
    get fields() {
        return [
            { key: 'city', type: 'dropdown', label: '도시 (역)', default: CITIES[0]?.id, options: CITIES.map(c => ({ value: c.id, label: c.name })) },
            {
                key: 'base', type: 'dropdown', label: '방향 기준', default: 'station', options: [
                    { value: 'station', label: '역 기준 (선로가 Z축, 또는 X축과 나란히)' },
                    { value: 'north', label: '진북 기준 (북쪽 = -Z, 실제 지도 방향)' },
                ],
            },
            { key: 'angle', type: 'slider', label: '더 돌리기 (°, 위에서 볼 때 시계 방향)', default: 0, min: -180, max: 180, step: 1 },
            {
                key: 'mode', type: 'dropdown', label: '방식', default: 'map', options: [
                    { value: 'map', label: '지도 그대로 (지도 그림처럼 땅에 평면으로: 바탕·도로 색·건물 높이별 색·녹지·물)' },
                    { value: 'flat', label: '실제 땅처럼 평면 (아스팔트·중앙선·보도, 건물 자리)' },
                    { value: '3d', label: '입체 (건물을 실제 높이로, 고가 선로·고가 도로)' },
                ],
            },
            {
                key: 'rails', type: 'dropdown', label: '철도', default: 'line', options: [
                    { value: 'line', label: '지도처럼 선으로 (고가는 빨간 선, 입체에선 선로)' },
                    { value: 'track', label: '실제 선로 (자갈 + 레일)' },
                    { value: 'none', label: '없음' },
                ],
            },
            { key: 'range', type: 'slider', label: '불러올 범위 (역에서 사방으로, 칸 = m) — 축척은 항상 1:1', default: 200, min: 50, max: 1500, step: 50 },
        ];
    },
    async run(ctx, v) {
        if (!unlocked(ctx.player))
            throw new Error('사용할 수 없습니다');
        const c = CITIES.find(x => x.id === v.city);
        if (!c)
            throw new Error('그 도시가 없습니다');
        // the data is lined up on the station's tracks (turned c.align° from true north)
        const align = Number(c.align) || 0;
        const turn = Math.round(((v.base === 'north' ? -align : 0) + (Number(v.angle) || 0)) * 10) / 10;
        const d = city(v.city, turn);
        const R = Math.max(10, Math.floor(Number(v.range) || 200));
        const o = { x: Math.floor(ctx.location.x), y: Math.floor(ctx.location.y) - 1, z: Math.floor(ctx.location.z) };
        const minY = ctx.dim.heightRange?.min ?? -64, maxY = (ctx.dim.heightRange?.max ?? 320) - 1;
        const [ex0, ez0, ex1, ez1] = d.ext;
        const X0 = Math.max(-R, Math.floor(ex0)), Z0 = Math.max(-R, Math.floor(ez0)), X1 = Math.min(R, Math.ceil(ex1)), Z1 = Math.min(R, Math.ceil(ez1));
        const tiles = [];
        for (let tx = X0; tx <= X1; tx += TILE)
            for (let tz = Z0; tz <= Z1; tz += TILE)
                tiles.push([tx, tz]);
        // nearest the station first
        tiles.sort((a, b) => Math.hypot(a[0] + TILE / 2, a[1] + TILE / 2) - Math.hypot(b[0] + TILE / 2, b[1] + TILE / 2));
        let done = 0, skipped = 0, n = 0;
        const before = []; // what was there: the whole city is one step of undo
        for (const [tx, tz] of tiles) {
            const tx1 = Math.min(X1, tx + TILE - 1), tz1 = Math.min(Z1, tz + TILE - 1), mode = v.mode ?? 'map';
            const cells = mode === 'map' ? buildMapTile(d, o, tx, tz, tx1, tz1, R, minY, maxY, v.rails ?? 'line')
                : buildTile(d, o, tx, tz, tx1, tz1, R, minY, maxY, mode !== '3d', v.rails === 'none' ? 'none' : 'track');
            const list = [];
            for (const [k, p] of cells) {
                const [x, y, z] = k.split(',').map(Number);
                list.push([x, y, z, p]);
            }
            const r = await placeAll(ctx.dim, list, { load: loadAll(ctx.player) });
            done += r.done;
            for (const e of r.before)
                before.push(e);
            skipped += r.skipped;
            n++;
            try {
                ctx.player.onScreenDisplay.setActionBar(`§b[도시] ${d.name}§r ${n}/${tiles.length} 구역 · ${done}블록`);
            }
            catch (e) { }
            await tick();
        }
        if (before.length) {
            const h = history(ctx.player);
            h.undo.push({ label: `도시 지도 (${d.name})`, dim: ctx.dim.id, blocks: before });
            if (h.undo.length > 15)
                h.undo.shift();
            h.redo.length = 0;
        }
        return `${d.name} ${{ map: '지도', flat: '평면', '3d': '입체' }[v.mode ?? 'map']} 반경 ${R}m, 회전 ${turn}°: ${tiles.length}구역, ${done}블록${skipped ? ` (건너뜀 ${skipped})` : ''} §8지도 © OpenStreetMap`;
    },
};
