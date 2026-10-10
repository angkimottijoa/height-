// Converts every vanilla state of every supported block and back again.
import fs from 'fs';
import { Dimension, BlockPermutation } from '@minecraft/server';
const { toIndependent, toVanilla } = await import(process.env.DS_SCRIPTS + '/independent.js');
const cases = JSON.parse(fs.readFileSync(process.env.DS_CASES, 'utf8'));
const out = [];
for (const c of cases) {
  const dim = new Dimension();
  const at = { x: 0, y: 10, z: 0 };
  try {
    for (const b of c.world) dim.setBlockPermutation(b.at, BlockPermutation.resolve(b.id, b.states));
    const block = dim.getBlock(c.target ?? at);
    const id = toIndependent(block);
    const lower = dim.getBlock(c.lower ?? at);
    const ds = dim.map.get(`${(c.lower ?? at).x},${(c.lower ?? at).y},${(c.lower ?? at).z}`);
    const conv = dim.getBlock(c.target ?? at).permutation;
    const back = toVanilla(dim.getBlock(c.target ?? at));
    const vperm = dim.getBlock(c.target ?? at).permutation;
    out.push({ i: c.i, id, ds: conv.states, back, vanilla: vperm.states });
  } catch (e) {
    out.push({ i: c.i, error: String(e) });
  }
}
fs.writeFileSync(process.env.DS_OUT, JSON.stringify(out));
