// Drives /vyt:copy, /vyt:rotate, /vyt:paste, /vyt:spin, /vyt:undo on a mock world.
import * as mc from '@minecraft/server';
import fs from 'fs';
const subs = {};
const ev = n => ({ subscribe: f => { subs[n] = f; return f; }, unsubscribe() {} });
Object.assign(mc.world.beforeEvents, { playerInteractWithBlock: ev('pib'), playerBreakBlock: ev('pbb') });
Object.assign(mc.world.afterEvents, { playerInventoryItemChange: ev('pic'), playerHotbarSelectedSlotChange: ev('hsc'), playerLeave: ev('pl') });
mc.world.getAllPlayers = () => [];
mc.system.beforeEvents.startup = ev('startup');
mc.system.runJob = gen => { for (const _ of gen); return 0; };
mc.system.runInterval = () => 0;
await import('./scripts/index.js');
const cmds = {};
subs.startup({
  blockComponentRegistry: { registerCustomComponent() {} },
  customCommandRegistry: { registerCommand: (c, cb) => cmds[c.name] = cb, registerEnum() {} },
});
const dim = new mc.Dimension();
const msgs = [];
const player = { id: 'p', typeId: 'minecraft:player', dimension: dim, location: { x: 0.5, y: 0, z: 0.5 },
  sendMessage: m => msgs.push(m) };
const run = (name, ...a) => cmds[name]({ sourceEntity: player }, ...a);
const put = (x, y, z, id, st = {}) => dim.setBlockPermutation({ x, y, z }, mc.BlockPermutation.resolve(id, st));
const get = (x, y, z) => dim.getBlock({ x, y, z }).permutation;
// an L of stone plus one east-facing stair (weirdo 0 = east)
for (let x = 0; x < 5; x++) put(x, 0, 0, 'minecraft:stone');
for (let z = 1; z < 3; z++) put(0, 0, z, 'minecraft:stone');
put(4, 0, 1, 'minecraft:oak_stairs', { weirdo_direction: 0 });
player.location = { x: 0, y: 0, z: 0 }; run('vyt:pos1');
player.location = { x: 4, y: 0, z: 2 }; run('vyt:pos2');
player.location = { x: 0.5, y: 0, z: 0.5 }; run('vyt:copy');
run('vyt:rotate', 90);
player.location = { x: 20.5, y: 0, z: 20.5 }; run('vyt:paste', true);
const out = {};
for (const [k, p] of dim.map) { const [x, y, z] = k.split(',').map(Number); if (x >= 10) out[k] = p.id + (p.states.weirdo_direction !== undefined ? '@' + p.states.weirdo_direction : ''); }
console.log('rot90', JSON.stringify(out));
// 45 degrees: count placed, check for holes along the long arm
run('vyt:rotate', -45);
player.location = { x: 40.5, y: 0, z: 40.5 }; run('vyt:paste', true);
let n45 = 0; for (const [k, p] of dim.map) { const x = +k.split(',')[0]; if (x >= 30 && p.id !== 'minecraft:air') n45++; }
console.log('rot45 placed', n45);
// spin in place 90, then undo
const before = JSON.stringify([...dim.map].filter(([k]) => +k.split(',')[0] < 10));
run('vyt:spin', 90);
const spun = [...dim.map].filter(([k, p]) => +k.split(',')[0] < 10 && p.id !== 'minecraft:air').map(([k, p]) => k + '=' + p.id.slice(10) + (p.states.weirdo_direction ?? ''));
console.log('spin', spun.join(' '));
run('vyt:undo');
const after = JSON.stringify([...dim.map].filter(([k]) => +k.split(',')[0] < 10).map(([k, p]) => [k, p]).filter(([k, p]) => p.id !== 'minecraft:air'));
const orig = JSON.stringify(JSON.parse(before).filter(([k, p]) => p.id !== 'minecraft:air'));
console.log('undo restores', after === orig);
console.log(msgs.join('\n'));
