// Loads main.js and drives it like a player: wand clicks, menus, a tool, a brush, undo.
import { mc, ui, world, put } from './harness.mjs';
await import('./scripts/main.js');
const W = mc.world, S = mc.system;
const cmds = {};
S.beforeEvents.startup.fire({ customCommandRegistry: { registerCommand: (c, cb) => cmds[c.name] = cb, registerEnum() {} } });
const { dim, player } = world({ id: 'main' });
player.playerPermissionLevel = 2;
for (let x = -5; x < 30; x++) for (let z = -5; z < 30; z++) put(dim, x, 0, z, 'grass_block');
const wand = new mc.ItemStack('arc:wand');
// right clicks add points
for (const [x, z] of [[0, 0], [10, 5], [20, 0]]) {
  S.currentTick++;
  player.lookAt = { x, y: 0, z };
  W.beforeEvents.itemUse.fire({ source: player, itemStack: wand, cancel: false });
  S.flush();
}
const { session } = await import('./scripts/core/session.js');
console.log('points', JSON.stringify(session(player).points));
// 8Crafter selection tool is mirrored
for (const p of [{ x: 0, y: 0, z: 0 }, { x: 9, y: 4, z: 9 }]) {
  player.lookAt = p;
  W.beforeEvents.itemUse.fire({ source: player, itemStack: new mc.ItemStack('andexdb:selection_tool'), cancel: false });
}
S.flush();
console.log('mirror', JSON.stringify([session(player).pos1, session(player).pos2]));
// sneak + use opens the main menu; choose 곡선 도구 > 도로 and submit the form with defaults
const { TOOLS, GROUPS, BRUSHES } = await import('./scripts/tools/index.js');
const btn = (label) => (form) => ({ canceled: false, selection: form.items.filter(i => i[0] === 'button').findIndex(b => b[1].includes(label)) });
ui.answers.push(btn('곡선 도구'), btn('도로'), (f) => f.defaults({ '폭': '5' }));
player.isSneaking = true;
S.currentTick++;
W.beforeEvents.itemUse.fire({ source: player, itemStack: wand, cancel: false });
S.flush();
player.isSneaking = false;
await new Promise(r => setTimeout(r, 50));
S.flush();
console.log('road via menu:', player.msgs.filter(m => m.includes('도로')).slice(-1)[0]);
// every tool and brush form builds (defaults) without throwing
const { ask } = await import('./scripts/ui/form.js');
let forms = 0;
for (const t of [...TOOLS, ...BRUSHES]) { ui.answers.push(f => f.defaults()); await ask(player, 'x:' + t.id, t.name, t.fields ?? []); forms++; }
console.log('forms ok', forms, 'tools', TOOLS.length, 'brushes', BRUSHES.length);
// bind a brush to a stick via menu and use it
player.inv[0] = new mc.ItemStack('stick');
ui.answers.push(btn('브러시'), btn('큐브'), f => f.defaults());
S.currentTick++; player.isSneaking = true;
W.beforeEvents.itemUse.fire({ source: player, itemStack: wand, cancel: false }); S.flush(); player.isSneaking = false;
await new Promise(r => setTimeout(r, 50)); S.flush();
console.log('bound', JSON.stringify(Object.keys(session(player).brushes)));
S.currentTick++; player.lookAt = { x: 15, y: 0, z: 15 };
W.beforeEvents.itemUse.fire({ source: player, itemStack: player.inv[0], cancel: false }); S.flush();
await new Promise(r => setTimeout(r, 50)); S.flush();
console.log('brush:', player.msgs.slice(-1)[0]);
const before = dim.count();
cmds['arc:undo']({ sourceEntity: player }); S.flush(); await new Promise(r => setTimeout(r, 20));
console.log('undo', before, '->', dim.count());
console.log('commands', Object.keys(cmds).join(' '));
console.log('errors', player.msgs.filter(m => m.startsWith('§c')));
