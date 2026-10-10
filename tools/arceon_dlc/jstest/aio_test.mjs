// Loads the all-in-one entry (debug stick + arceon) on the mock and checks both start.
import * as mc from '@minecraft/server';
await import('./aio_scripts/main.js');
const cmds = {}, comps = [];
mc.system.beforeEvents.startup.fire({
  customCommandRegistry: { registerCommand: (c, cb) => cmds[c.name] = cb, registerEnum() {} },
  blockComponentRegistry: { registerCustomComponent: (n) => comps.push(n) },
  itemComponentRegistry: { registerCustomComponent() {} },
});
console.log('commands:', Object.keys(cmds).sort().join(' '));
console.log('block components:', comps.length);
const ok = ['arc:menu', 'arc:tools', 'vyt:rotate'].every(c => cmds[c]);
console.log(ok ? 'all-in-one loads ok' : 'FAIL');
if (!ok) process.exitCode = 1;
