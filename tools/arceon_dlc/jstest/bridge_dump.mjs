// Dump a railway-on-bridge build to JSON for tools/arceon_dlc/render_iso.py
//   node bridge_dump.mjs <bridge id> <out.json> [points json] [extra values json]
import { load, world, runTool, put } from './harness.mjs';
import { writeFileSync } from 'fs';
const railway = await load('tools/railway.js');
const [id, out, ptsArg, extraArg] = process.argv.slice(2);
const pts = ptsArg ? JSON.parse(ptsArg) : [{ x: 0, y: 0, z: 0 }, { x: 56, y: 0, z: 0 }];
const extra = extraArg ? JSON.parse(extraArg) : {};
const { dim, player } = world({ id: 'b' });
const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
for (let x = Math.min(...xs) - 30; x <= Math.max(...xs) + 30; x++)
  for (let z = Math.min(...zs) - 30; z <= Math.max(...zs) + 30; z++) put(dim, x, Number(process.env.GROUND ?? -16), z, 'grass_block');
const ground = new Set(dim.map.keys());
(await import('./scripts/core/session.js')).session(player).settings.unlocked = true;
const m = await runTool(railway, { bridge: id, poleEvery: 20, ...extra }, { player, points: pts });
console.log(m.slice(-1)[0]);
const blocks = [];
for (const [k, p] of dim.map) { if (ground.has(k) && p.id === 'minecraft:grass_block') continue; if (p.id.endsWith('air')) continue; const [x, y, z] = k.split(',').map(Number); blocks.push([x, y, z, p.id.replace('minecraft:', ''), p.states]); }
writeFileSync(out, JSON.stringify(blocks));
