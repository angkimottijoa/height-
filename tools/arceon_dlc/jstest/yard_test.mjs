// Hidden track features: the railway tool records its tracks (one end block at
// each loose end), carries on from an end, branches off / joins a side through a
// turnout; the layout tool saves lines like frames and lays them with the
// railway settings; connect mode lays crossovers and scissors crossovers.
import { load, world, runTool, mc, ui, topView } from './harness.mjs';
const { session } = await import('./scripts/core/session.js');
const Y = await import('./scripts/lib/yard.js');
const UY = await import('./scripts/ui/yard.js');
const railway = await load('tools/railway.js');
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = async () => { mc.system.flush(); await new Promise(r => setTimeout(r, 30)); mc.system.flush(); };
const one = { tracks: 1, pole: '' };

let { dim, player } = world({ id: 'y1' });
const ids = (pred) => [...dim.map].filter(([k, p]) => pred(p, k)).map(([k]) => k.split(',').map(Number));
const ends = () => ids(p => p.id === 'minecraft:red_concrete');
const rails = () => new Set(ids(p => p.id === 'minecraft:anvil').map(([x, , z]) => x + ',' + z));

// locked: nothing is recorded
await runTool(railway, one, { player, points: [{ x: 0, y: 0, z: -60 }, { x: 30, y: 0, z: -60 }] });
check(Y.tracks().length === 0 && ends().length === 0, 'locked: no record, no end blocks');
({ dim, player } = world({ id: 'y1' }));
session(player).settings.unlocked = true;

// 1. a straight single track: one end block at each end, recorded
let m = await runTool(railway, one, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
console.log(m.slice(-1)[0]);
check(ends().length === 2 && ends().some(([x]) => x < 0) && ends().some(([x]) => x > 40), 'one end block (1 block) past each end: ' + JSON.stringify(ends()));
check(Y.tracks().length === 1 && Y.tracks()[0].ends.every(e => e.open), 'recorded with two open ends');

// 2. the end block and the side are found again
const [ex, ey, ez] = ends().find(([x]) => x > 40);
const hEnd = Y.hitTest({ x: ex, y: ey, z: ez }), hSide = Y.hitTest({ x: 20, y: 0, z: 1 });
check(hEnd?.type === 'end' && hEnd.end === 1, 'tap on the end block -> that end');
check(hSide?.type === 'track' && Math.abs(hSide.s - 20) < 2, 'tap beside the track -> that spot: ' + hSide?.s);

// 3. carry on from the end (first point on the end block): the block goes, the rails run on
m = await runTool(railway, one, { player, points: [{ x: ex, y: ey, z: ez }, { x: 70, y: 0, z: 0 }, { x: 90, y: 0, z: 12 }] });
console.log(m.slice(-1)[0]);
check(!ends().some(([x, , z]) => x > 38 && x < 45 && Math.abs(z) < 3), 'the old end block is gone');
check(Y.tracks()[0].ends[1].open === false && Y.tracks().length === 2, 'old end closed, new track recorded');
check([39, 40, 41, 42, 43].every(x => rails().has(x + ',-1') || rails().has(x + ',-2')) && [39, 40, 41, 42, 43].every(x => rails().has(x + ',1') || rails().has(x + ',2')), 'both rails run on across the old end');

// 4. branch: first point on the side, then where the branch goes
const machines = () => ids(p => p.id === 'minecraft:polished_blackstone_bricks').length;
m = await runTool(railway, one, { player, points: [{ x: 8, y: 0, z: -1 }, { x: 30, y: 0, z: -14 }, { x: 46, y: 0, z: -26 }] });
console.log(m.slice(-1)[0]);
check(/분기기 1개/.test(m.slice(-1)[0]) && machines() >= 1, 'branch off the side: a turnout with a switch machine');
const R = rails();
const through = [...Array(36).keys()].map(i => i + 2).every(x => (R.has(x + ',-1') || R.has(x + ',-2')) && (R.has(x + ',1') || R.has(x + ',2')));
check(through, 'the through track keeps both rails through the turnout');
console.log(topView(dim, -4, -30, 60, 6));

// 5. join: last point on the side of the first track
m = await runTool(railway, one, { player, points: [{ x: -10, y: 0, z: 30 }, { x: 10, y: 0, z: 18 }, { x: 30, y: 0, z: 1 }] });
const t5 = Y.tracks().slice(-1)[0];
check(/분기기 1개/.test(m.slice(-1)[0]) && t5.ends[1].open === false && t5.ends[0].open === true, 'join into the side: turnout, joined end closed, the loose start gets its end block');

// 6. a double track is recorded with its two lanes
({ dim, player } = world({ id: 'y2' }));
session(player).settings.unlocked = true;
await runTool(railway, { tracks: 2, pole: '' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 120, y: 0, z: 0 }] });
const dbl = Y.tracks()[0];
check(dbl.centres.length === 2 && Math.abs(dbl.centres[0] - dbl.centres[1]) >= 6, 'double track: two lanes recorded ' + JSON.stringify(dbl.centres));

// 7. connect mode: a crossover and a scissors crossover between the two lanes
for (const kind of ['single', 'scissors']) {
  const a = { type: 'track', track: dbl, s: kind === 'single' ? 10 : 60, lane: 0 }, b = { type: 'track', track: dbl, s: kind === 'single' ? 40 : 90, lane: 1 };
  const plan = Y.crossoverPlan(a, b, kind, 6);
  const C = plan.paths[0];
  let maxBend = 0;
  for (let i = 3; i < C.length; i += 3) maxBend = Math.max(maxBend, Math.abs(Math.atan2(C[i].tz, C[i].tx) - Math.atan2(C[i - 3].tz, C[i - 3].tx)));
  check(plan.paths.length === (kind === 'single' ? 1 : 2) && plan.turnouts.length === (kind === 'single' ? 2 : 4), `${kind}: ${plan.paths.length} paths, ${plan.turnouts.length} turnouts, ${plan.length} long`);
  check(Math.abs(C[0].tz) < 0.02 && Math.abs(C[C.length - 1].tz) < 0.02 && maxBend < 0.08, `${kind}: tangent to both tracks at its ends, smooth (max bend per block ${maxBend.toFixed(3)} rad)`);
}

// 8. the layout tool: taps draw lines, sneak+break saves one, the menu lays them all
({ dim, player } = world({ id: 'y3' }));
const s = session(player);
s.settings.unlocked = true;
await runTool(railway, one, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] });
const main = Y.tracks()[0];
const tap = (x, z) => UY.yardTap(player, { pos: { x, y: 0, z } }, false);
// line 1: from the main track's end, on to a point, saved with sneak+break
const e1 = main.ends[1];
tap(Math.floor(e1.at[0] + e1.dir[0] * 1.2), Math.floor(e1.at[2]));
tap(70, 6); tap(100, 20);
UY.yardBreak(player, { x: 0, y: 0, z: 0 }, true);
check(s.yard.lines.length === 1 && s.yard.lines[0].start?.type === 'end', 'line 1 saved, starting at the main track end');
// line 2: branches off the saved line 1 (not laid yet) and finishes on its own
tap(80, 10); tap(95, -10); tap(110, -20);
UY.yardBreak(player, { x: 0, y: 0, z: 0 }, true);
check(s.yard.lines.length === 2 && s.yard.lines[1].start?.src === 'line', 'line 2 saved, branching off saved line 1');
// lay: menu > lay > the railway form (one track, no poles) > the detail form is skipped
const btn = (label) => (form) => ({ canceled: false, selection: form.items.filter(i => i[0] === 'button').findIndex(b => b[1].includes(label)) });
const before = machines;
ui.answers.push(btn('깔기'), f => {
  const v = f.defaults({ '선로 수': 0 });
  const i = f.items.findIndex(it => it[1] === '전신주'); v.formValues[i] = 2; // no poles
  return v;
});
await UY.yardMenu(player); await settle(); await settle();
console.log(player.msgs.slice(-2).join(' | '));
check(Y.tracks().length === 3 && s.yard.lines.length === 0, 'laid: two more tracks recorded, the saved lines cleared: ' + Y.tracks().length);
const t2 = Y.tracks()[1], t3 = Y.tracks()[2];
check(Y.tracks()[0].ends[1].open === false && t3.ends[0].open === false && t3.ends[1].open === true, 'line 1 carried on from the main end, line 2 branched off line 1 as laid');
check(ids(p => p.id === 'minecraft:polished_blackstone_bricks').length >= 1, 'the branch off the laid line 1 has its switch machine');
console.log(topView(dim, -4, -30, 120, 30));

// 9. connect mode through the tool: two taps on two lanes, then the form
({ dim, player } = world({ id: 'y4' }));
const s4 = session(player);
s4.settings.unlocked = true;
await runTool(railway, { tracks: 2, pole: '' }, { player, points: [{ x: 0, y: 0, z: 0 }, { x: 120, y: 0, z: 0 }] });
const t = Y.tracks()[0];
const lane = (k) => Math.round(t.centres[k]);
ui.answers.push(btn('선로 연결'));
await UY.yardMenu(player);
check(s4.yard.mode === 'connect', 'menu > 선로 연결 starts connect mode');
UY.yardTap(player, { pos: { x: 20, y: 0, z: lane(0) } }, false);
ui.answers.push(f => f.defaults({ '종류': 1, '번수': 6 }));
UY.yardTap(player, { pos: { x: 60, y: 0, z: lane(1) } }, false);
await settle(); await settle();
console.log(player.msgs.slice(-1)[0]);
check(/선로 연결/.test(player.msgs.slice(-1)[0]) && /시서스/.test(player.msgs.slice(-1)[0]), 'scissors crossover laid');
console.log(topView(dim, 0, -12, 110, 12));
const machines4 = [...dim.map].filter(([, p]) => p.id === 'minecraft:polished_blackstone_bricks').length;
check(machines4 === 4, 'four switch machines for a scissors crossover: ' + machines4);
