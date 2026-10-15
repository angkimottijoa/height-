// Loads the all-in-one entry (debug stick + arceon) on the mock and checks both start.
// The scripts are copied fresh from the packs, and loaded in "early execution"
// like the game does: a native call while loading (making a block permutation
// at the top of a module) breaks the whole add-on there, so it fails here too.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mc from '@minecraft/server';
const here = path.dirname(fileURLToPath(import.meta.url));
const packs = path.resolve(here, '../../../packs');
const out = path.join(here, 'aio_scripts');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(packs, 'DebugStickBP/scripts'), path.join(out, 'debugstick'), { recursive: true });
fs.cpSync(path.join(packs, 'ArceonDLC_BP/scripts'), path.join(out, 'arceon'), { recursive: true });
fs.writeFileSync(path.join(out, 'main.js'), "import './debugstick/index.js';\nimport './arceon/main.js';\n");
globalThis.__earlyExecution = true;
try {
  await import('./aio_scripts/main.js');
}
catch (e) {
  console.log('FAIL loading in early execution:', e.message);
  process.exit(1);
}
globalThis.__earlyExecution = false;
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
