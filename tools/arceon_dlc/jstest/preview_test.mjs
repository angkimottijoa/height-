// Frame picker preview draws the frames and the rails between them.
import { world } from './harness.mjs';
const { preview } = await import('./scripts/ui/preview.js');
const { session } = await import('./scripts/core/session.js');
const { player } = world({ id: 'pv' });
const got = [];
player.spawnParticle = (id, p) => got.push([id, p]);
const s = session(player);
s.frames = [[{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 10 }, { x: 0, y: 0, z: 20 }],
            [{ x: 20, y: 0, z: -5 }, { x: 25, y: 0, z: 0 }, { x: 25, y: 0, z: 10 }, { x: 22, y: 0, z: 18 }, { x: 20, y: 0, z: 25 }]];
for (const mode of ['curved', 'flat']) {
  got.length = 0;
  s.settings.frameFill = mode;
  preview(player, 'arc:frame_picker');
  const rails = got.filter(g => g[0] === 'minecraft:basic_flame_particle');
  // rail particles span from frame 1 (x≈0) to frame 2 (x≈20)
  const xs = rails.map(r => r[1].x);
  const ok = rails.length > 20 && Math.min(...xs) < 3 && Math.max(...xs) > 20 && got.length <= 260;
  console.log(mode, 'particles', got.length, 'rail', rails.length, ok ? 'ok' : 'FAIL');
  if (!ok) process.exitCode = 1;
}
