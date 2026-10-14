// Test harness: copies the add-on scripts next to the mock modules and
// gives helpers to run a tool or brush on a mock world.
//
//   import { load, runTool, world } from './harness.mjs';
//   const road = await load('tools/road.js');
//   const { dim, player } = world();
//   await runTool(road, { block: 'stone', width: 7 }, { player, points: [...] });
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../../packs/ArceonDLC_BP/scripts');
fs.rmSync(path.join(here, 'scripts'), { recursive: true, force: true });
fs.cpSync(src, path.join(here, 'scripts'), { recursive: true });
export const mc = await import('@minecraft/server');
export const ui = await import('@minecraft/server-ui');
const sessionMod = await import('./scripts/core/session.js');
const runner = await import('./scripts/core/runner.js');
export const blocks = await import('./scripts/core/blocks.js');

export async function load(rel) {
  return (await import('./scripts/' + rel)).default;
}
const yardLib = await import('./scripts/lib/yard.js');
export function world(opts = {}) {
  // a new world: no tracks recorded (unless kept on purpose)
  if (!opts.keep) for (const t of yardLib.tracks()) yardLib.deleteTrack(t.id);
  const dim = new mc.Dimension();
  const player = mc.mockPlayer(dim, opts);
  return { dim, player };
}
export const put = (dim, x, y, z, id, st) => dim.setBlockPermutation({ x, y, z }, mc.BlockPermutation.resolve(id.includes(':') ? id : 'minecraft:' + id, st ?? {}));
export const at = (dim, x, y, z) => dim.getBlock({ x, y, z }).permutation;
/**
 * Run a tool. values: plain values; a 'block' field may be given as a string
 * (it becomes manual input). opts: {points, region:[pos1,pos2], frames}.
 */
export async function runTool(tool, values, { player, points, region, frames } = {}) {
  const s = sessionMod.session(player);
  if (points) s.points = points;
  if (region) { s.pos1 = region[0]; s.pos2 = region[1]; s.dim = player.dimension.id; }
  if (frames) s.frames = frames;
  const v = expand(tool, values);
  await runner.runTool(player, tool, v);
  mc.system.flush();
  return player.msgs;
}
export async function runBrush(brush, values, hit, { player } = {}) {
  await runner.runBrush(player, brush, expand(brush, values), hit);
  mc.system.flush();
  return player.msgs;
}
function expand(tool, values) {
  const v = {};
  for (const f of tool.fields ?? []) if (f.key !== undefined && f.default !== undefined) v[f.key] = f.default;
  for (const f of tool.fields ?? []) if (f.type === 'block') { v[f.key + '#src'] = 1; v[f.key + '#text'] = f.default ?? 'stone'; }
  for (const [k, val] of Object.entries(values)) {
    const f = (tool.fields ?? []).find(x => x.key === k);
    if (f?.type === 'block') { v[k + '#src'] = 1; v[k + '#text'] = val; } else v[k] = val;
  }
  return v;
}
/** ASCII top view (x right, z down) of the highest non-air block per column. */
export function topView(dim, x0, z0, x1, z1) {
  const rows = [];
  for (let z = z0; z <= z1; z++) {
    let r = '';
    for (let x = x0; x <= x1; x++) {
      let ch = '.';
      for (let y = 319; y >= -64; y--) { const p = dim.map.get(`${x},${y},${z}`); if (p && p.id !== 'minecraft:air') { ch = p.id.includes('slab') ? (p.states['minecraft:vertical_half'] === 'top' ? '^' : '_') : '#'; break; } }
      r += ch;
    }
    rows.push(r);
  }
  return rows.join('\n');
}
