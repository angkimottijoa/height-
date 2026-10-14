// Far chunks: placed via ticking areas when the setting is on, skipped when off; undo reaches them too.
import { load, world, runTool, mc } from './harness.mjs';
const { session } = await import('./scripts/core/session.js');
const { undo } = await import('./scripts/core/edit.js');
const fill = await load('tools/fill.js');
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
let { dim, player } = world({ id: 'ld1' });
dim.unloaded = (x, z) => x >= 64; // everything east of x=64 is not loaded
// a fill from x=0 to x=300 (crosses many unloaded chunks, more than one tile)
let m = await runTool(fill, { block: 'stone' }, { player, region: [{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 2 }] });
console.log(m.slice(-1)[0], 'areas made', mc.world.tickingAreaManager.created, 'left open', mc.world.tickingAreaManager.getAllTickingAreas().length);
check(dim.count() === 301 * 3, 'all 903 blocks placed, far ones through ticking areas: ' + dim.count());
check(mc.world.tickingAreaManager.getAllTickingAreas().length === 0, 'ticking areas released afterwards');
await undo(player);
check(dim.count() === 0, 'undo also reaches the far blocks: ' + dim.count());
// setting off: far blocks are skipped with a message
({ dim, player } = world({ id: 'ld2' }));
dim.unloaded = (x, z) => x >= 64;
session(player).settings.loadAll = false;
m = await runTool(fill, { block: 'stone' }, { player, region: [{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 2 }] });
check(dim.count() === 64 * 3 && player.msgs.some(t => /건너뛰었습니다/.test(t)), 'setting off: only loaded part placed, skip reported');

// ---- slow loading, a full allowance and the command fallback: everything still gets placed
{
  mc.system.autoTimers = true;
  const tam = mc.world.tickingAreaManager;
  // chunks take 30 ms to load after an area is made; the allowance is tiny and taken by someone else for a while
  ({ dim, player } = world({ id: 'ld3' }));
  dim.unloaded = (x, z) => x >= 64;
  dim.loadDelayMs = 30;
  const max = tam.maxChunkCount;
  tam.maxChunkCount = 4;
  await tam.createTickingArea('someone_else', { dimension: dim, from: { x: -512, y: 0, z: -512 }, to: { x: -481, y: 0, z: -481 } });
  setTimeout(() => tam.removeTickingArea('someone_else'), 60);
  m = await runTool(fill, { block: 'stone' }, { player, region: [{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 40 }] });
  console.log(m.slice(-1)[0]);
  check(dim.count() === 301 * 41, 'slow loading + full allowance: all ' + 301 * 41 + ' blocks placed: ' + dim.count());
  // no ticking area manager capacity at all: the /tickingarea command takes over
  ({ dim, player } = world({ id: 'ld4' }));
  dim.unloaded = (x, z) => x >= 64;
  dim.loadDelayMs = 10;
  tam.maxChunkCount = 0;
  const before = mc.commandAreas.made;
  m = await runTool(fill, { block: 'stone' }, { player, region: [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 2 }] });
  check(dim.count() === 201 * 3 && mc.commandAreas.made > before && mc.commandAreas.open === 0, 'no allowance: placed through /tickingarea, all removed again: ' + dim.count());
  tam.maxChunkCount = max;
  mc.system.autoTimers = false;
}
