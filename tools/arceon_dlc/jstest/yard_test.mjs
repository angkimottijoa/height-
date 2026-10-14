// Layout tool: tracks that remember their ends (buffer stops), carrying on from an end,
// branching off / joining a track's side through turnouts, and the automatic yard.
import { world, mc } from './harness.mjs';
const Y = await import('./scripts/lib/yard.js');
const { makeContext, finish } = await import('./scripts/core/runner.js');
const { runAsync } = await import('./scripts/core/edit.js');
const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const { dim, player } = world({ id: 'yard' });
const ids = (pred) => [...dim.map].filter(([k, p]) => pred(p, k)).map(([k]) => k.split(',').map(Number));
async function run(gen, label) { const ctx = makeContext(player, {}); const r = await runAsync(gen(ctx)); await finish(player, label, ctx.edit); mc.system.flush(); return r; }
const P = (x, z) => ({ type: 'point', pos: { x, y: 0, z } });

// 1. a straight track from point to point: rails, buffer stops at both ends, recorded
let r = await run(ctx => Y.buildDrawn(ctx, P(0, 0), [], P(40, 0)), '배선');
Y.saveTrack(r.track);
const anv = ids(p => p.id === 'minecraft:anvil');
check(anv.length >= 2 * 40, 'rails laid: ' + anv.length);
const stops = ids(p => p.id === 'minecraft:red_concrete');
check(stops.some(([x]) => x < 0) && stops.some(([x]) => x > 40), 'buffer stops of real blocks at both ends');
check(Y.tracks().length === 1 && Y.tracks()[0].ends.every(e => e.open), 'recorded with two open ends');

// 2. tapping the buffer stop finds the end; tapping the side finds the track
const hEnd = Y.hitTest({ x: 41, y: 1, z: 0 }), hSide = Y.hitTest({ x: 20, y: 0, z: 1 });
check(hEnd?.type === 'end' && hEnd.end === 1, 'tap on the end buffer stop -> that end');
check(hSide?.type === 'track' && Math.abs(hSide.s - 20) < 2, 'tap beside the track -> the track at that spot: ' + hSide?.s);

// 3. carry on from the end: the stop goes, the rails run on
r = await run(ctx => Y.buildDrawn(ctx, { type: 'end', track: hEnd.track, end: 1 }, [], P(80, 10)), '배선');
Y.saveTrack(r.track); for (const t of r.touched) Y.saveTrack(t);
check(!ids(p => p.id === 'minecraft:red_concrete').some(([x, , z]) => x > 39 && x < 44 && Math.abs(z) < 3), 'the old end\'s buffer stop is gone');
check(Y.trackById('t1').ends[1].open === false && Y.tracks().length === 2, 'old end closed, new track recorded');
const gap = [41, 42, 43].every(x => ids(p => p.id === 'minecraft:anvil').some(([ax, , az]) => ax === x && Math.abs(az) <= 2));
check(gap, 'rails continue across the old end');

// 4. branch off the first track's side at 10, out to the north-east
const t1 = Y.trackById('t1');
const before = ids(p => p.id === 'minecraft:anvil').length;
r = await run(ctx => Y.buildDrawn(ctx, { type: 'track', track: t1, s: 8 }, [{ x: 30, y: 0, z: -14 }], P(46, -24)), '배선');
Y.saveTrack(r.track);
check(r.turnouts === 1, 'branch: one turnout');
check(ids(p => p.id === 'minecraft:polished_blackstone_bricks').length >= 1, 'switch machine beside the points');
// main rails still continuous at z = -1 / 1 lines (x 0..40)
const rails = new Set(ids(p => p.id === 'minecraft:anvil').map(([x, , z]) => x + ',' + z));
const mainOk = [...Array(38).keys()].map(i => i + 1).every(x => rails.has(x + ',-1') || rails.has(x + ',-2')) && [...Array(38).keys()].map(i => i + 1).every(x => rails.has(x + ',1') || rails.has(x + ',2'));
check(mainOk, 'the through track keeps both rails through the turnout');
const guards = ids(p => p.id === 'minecraft:anvil').filter(([x, , z]) => z === 0 || z === 0);
check(ids(p => p.id === 'minecraft:anvil').length > before + 40, 'branch rails laid (and guard rails): ' + (ids(p => p.id === 'minecraft:anvil').length - before));

// 5. a track from a point that joins the first track's side (merge turnout)
r = await run(ctx => Y.buildDrawn(ctx, P(-10, 30), [{ x: 10, y: 0, z: 20 }], { type: 'track', track: Y.trackById('t1'), s: 30 }), '배선');
check(r.turnouts === 1 && r.track.ends[1].open === false && r.track.ends[0].open === true, 'join into the side: turnout, joined end closed, loose start gets a stop');

// 6. automatic yard: main line + 4 tracks, both throats
const { dim: d2, player: p2 } = world({ id: 'yard2' });
const ctx2 = makeContext(p2, {});
const out = await runAsync(Y.buildAuto(ctx2, [{ x: 0, y: 0, z: 300 }, { x: 500, y: 0, z: 300 }], { n: 4, gap: 6, N: 6, side: -1, both: true, startAt: 10 }));
await finish(p2, '자동 배선', ctx2.edit); mc.system.flush();
console.log('yard:', out.count, 'tracks, main', out.length);
const mid = [...d2.map].filter(([k, p]) => p.id === 'minecraft:anvil' && +k.split(',')[0] === 250).map(([k]) => +k.split(',')[2]).sort((a, b) => a - b);
console.log('rails across x=250:', mid.join(' '));
check(out.count === 4 && mid.length === 10, 'yard: 5 parallel tracks (10 rails) in the middle');
check(Math.min(...mid) < 295, 'the yard lies to the left (north) of an eastbound main');
const turnouts = [...d2.map.values()].filter(p => p.id === 'minecraft:polished_blackstone_bricks').length;
check(turnouts === 8, 'a switch machine at every throat turnout (4 tracks x 2): ' + turnouts);
