// Arena: thousands of fights without graphics, with a report. Two parts:
//   1. Weapons — duels: which weapon, armour, race, skill and characteristic wins in which tier
//      (for damage, cooldowns, armour and prices: data/balance/weapons.js, armor.js);
//   2. Strength rating (КС) — group battles, N against M: do sides with the same total rating win half the
//      time, what `alpha` fits, which race, creature or tier the rating over- or underrates
//      (for data/balance/strength.js).
// The fight is the game's own: the `fight` task (agents/tasks.js) with its blows, shots, armour, shields,
// crits, dodges and wear (agents/combat.js), on a flat open field. Only the brain is left out: nobody
// flees or calls for help, a fight goes to the end; in a battle everyone goes for the nearest foe.
//
//   npm run arena -- [options]
//     --part all|weapons|strength   which part to run (default: both)
//     --fights 10000        how many duels (part 1)
//     --battles 4000        how many group battles (part 2)
//     --team 10             the most fighters on one side of a battle
//     --tiers 0,1,2         material tiers to fight in (data/balance/: tier); default — every weapon tier
//     --races human,orc     who fights (data/races.js ids, or 'all' — the default)
//     --stats rolled|norm   SPECIAL rolled inside the race's limits (default) or 5 in everything
//     --skill random|0.5    melee and shooting skill: uniform 0–1 (default) or one value for all
//     --armor tier|any|none body armour: of the fight's tier (or the nearest lower one that has any; default),
//                           any of the tier or below, or none
//     --shield 0.5          chance that a one-hander comes with a shield
//     --quality 0|mix       plain pieces only (default), or a mix of +0…+3 as trade and luck give
//     --cross 0.2           share of duels where the second fighter has the next tier's gear
//     --foes skeleton,wolf  duels with these creatures too (species ids, or 'monsters'); --foe-share 0.3 of them
//     --battle-foes monsters  creatures that make up whole sides in battles (default: the raid monsters;
//                           'none' for none); --battle-foe-share 0.3 of the battles
//     --distance 8          cells between the sides at the start
//     --max-ticks 3000      a fight still going after this is a draw
//     --fair                gear only: humans, SPECIAL 5, skill 0.5, no cross-tier duels, no creatures
//     --seed arena          the same seed and options give the same fights, however many workers
//     --jobs N              parallel workers (default: CPU cores)
//     --out dir             where to write (default runs/arena-<date-time>)
//
// Writes fights.csv (one row per duel), battles.csv (one row per battle), summary.json and report.html;
// prints the short version.
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = {part: 'all', fights: 10000, battles: 4000, team: 10, tiers: null, races: 'all', stats: 'rolled', skill: 'random', armor: 'tier', shield: 0.5, quality: '0',
    cross: 0.2, foes: [], foeShare: 0.3, battleFoes: ['monsters'], battleFoeShare: 0.3, distance: 8, maxTicks: 3000, seed: 'arena', jobs: availableParallelism(), out: null, fair: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--part') o.part = v();
    else if (a === '--fights') o.fights = +v();
    else if (a === '--battles') o.battles = +v();
    else if (a === '--team') o.team = +v();
    else if (a === '--battle-foes') { const x = v(); o.battleFoes = x === 'none' ? [] : x.split(','); }
    else if (a === '--battle-foe-share') o.battleFoeShare = +v();
    else if (a === '--tiers') o.tiers = v().split(',').map(Number);
    else if (a === '--races') o.races = v();
    else if (a === '--stats') o.stats = v();
    else if (a === '--skill') o.skill = v();
    else if (a === '--armor') o.armor = v();
    else if (a === '--shield') o.shield = +v();
    else if (a === '--quality') o.quality = v();
    else if (a === '--cross') o.cross = +v();
    else if (a === '--foes') o.foes = v().split(',');
    else if (a === '--foe-share') o.foeShare = +v();
    else if (a === '--distance') o.distance = +v();
    else if (a === '--max-ticks') o.maxTicks = +v();
    else if (a === '--seed') o.seed = v();
    else if (a === '--jobs') o.jobs = +v();
    else if (a === '--out') o.out = v();
    else if (a === '--fair') o.fair = true;
    else if (a === '-h' || a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n')); process.exit(0); }
    else { console.error(`неизвестный ключ ${a} (--help — список)`); process.exit(1); }
  }
  if (o.fair) Object.assign(o, {races: 'human', stats: 'norm', skill: '0.5', cross: 0, foes: [], battleFoes: []});
  if (!['all', 'weapons', 'strength'].includes(o.part)) { console.error('--part: all, weapons или strength'); process.exit(1); }
  return o;
}

// ── one duel ─────────────────────────────────────────────────────────────────

// Everything a duel needs from the game, loaded once per worker
export async function engine() {
  const [{newGame}, {DEFAULT_CFG}, {createAgent, maxHp}, {TASKS}, {T}, {dress}, {refreshBody}, {ITEMS}, {SPECIES}, {RACES}, {MONSTERS}, {newStreams, mulberry, seedNumber}, {STATS}] = await Promise.all([
    import('../src/sim.js'), import('../src/data/presets.js'), import('../src/agents/agent.js'), import('../src/agents/tasks.js'),
    import('../src/data/terrain.js'), import('../src/agents/equipment.js'), import('../src/agents/special.js'), import('../src/data/items.js'),
    import('../src/data/species.js'), import('../src/data/races.js'), import('../src/data/monsters.js'), import('../src/core/rng.js'), import('../src/data/special.js')]);
  const {itemDef} = await import('../src/agents/equipment.js'), power = await import('../src/data/balance/power.js'), {RULES} = await import('../src/data/balance/rules.js');
  const strength = await import('../src/agents/strength.js'), {STRENGTH} = await import('../src/data/balance/strength.js');
  return {newGame, DEFAULT_CFG, createAgent, maxHp, TASKS, T, dress, refreshBody, ITEMS, SPECIES, RACES, MONSTERS, newStreams, mulberry, seedNumber, STATS, itemDef, power, RULES, strength, STRENGTH};
}

// a flat grass field with nobody on it (as in tools/logic-check.mjs)
export function field(E) {
  const w = E.newGame({...E.DEFAULT_CFG, seed: 'arena-field', size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'});
  const g = w.grid;
  for (let i = 0; i < w.w * w.h; i++) { g.terr[i] = E.T.GRASS; g.heat[i] = 0; g.fire[i] = 0; g.smoke[i] = 0; g.wood[i] = 0; g.lake && (g.lake[i] = -1); }
  w.lakes = []; w.snow = 0;
  w.nav.buildAll();
  return w;
}

// what can be fought with in each tier, from the balance tables
export function pools(ITEMS) {
  const all = ITEMS.all();
  const weapons = all.filter(d => d.slot === 'hand' && (d.melee || d.ranged) && d.form !== 'shield');
  const shields = all.filter(d => d.slot === 'hand' && d.block && !d.melee);
  const bodies = all.filter(d => d.slot === 'body');
  const tiers = [...new Set(weapons.map(d => d.tier))].sort((a, b) => a - b);
  return {weapons, shields, bodies, tiers};
}

const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
const QMIX = [[0, 0.6], [1, 0.25], [2, 0.12], [3, 0.03]];
const rollQ = rng => { let u = rng(); for (const [q, p] of QMIX) { if ((u -= p) < 0) return q; } return 0; };

// a fighter's kit for tier T: one weapon of that tier, maybe a shield, armour by the --armor rule
function kitFor(P, opt, rng, T) {
  const weapon = pick(rng, P.weapons.filter(d => d.tier === T));
  const q = () => (opt.quality === 'mix' ? rollQ(rng) : 0);
  const kit = {weapon: weapon.id, wq: q(), shield: null, sq: 0, body: null, bq: 0};
  if (weapon.hands === 1 && rng() < opt.shield) {
    const sh = P.shields.filter(d => d.tier <= T).sort((a, b) => b.tier - a.tier)[0];
    if (sh) { kit.shield = sh.id; kit.sq = q(); }
  }
  if (opt.armor !== 'none') {
    let pool = P.bodies.filter(d => d.tier <= T);
    if (opt.armor === 'tier') { const top = Math.max(...pool.map(d => d.tier)); pool = pool.filter(d => d.tier === top); }
    if (pool.length) { kit.body = pick(rng, pool).id; kit.bq = q(); }
  }
  return kit;
}

function spawn(E, w, opt, rng, who, x, y) {
  const a = E.createAgent(w, who.species, 'raiders', x, y);
  if (who.kit) {
    if (opt.stats === 'norm' && a.special) { for (const s of E.STATS.ids()) a.special[s] = 5; E.refreshBody(a); a.hp = E.maxHp(a); }
    const s = opt.skill === 'random' ? rng() : +opt.skill;
    a.skill = {melee: s, ranged: s};
    const k = who.kit, list = [{type: k.weapon, q: k.wq}];
    if (k.shield) list.push({type: k.shield, q: k.sq});
    if (k.body) list.push({type: k.body, q: k.bq});
    const ammo = E.ITEMS.get(k.weapon).ranged?.ammo;
    const quiver = ammo && E.ITEMS.all().find(d => d.holds?.ammo === ammo);
    if (quiver) list.push(quiver.id);
    E.dress(a, list, quiver ? quiver.holds.max : 0);
  }
  return a;
}

// a short record of a fighter as it entered the duel; atk / def: the power of its kit (data/balance/power.js)
function card(E, a, who) {
  const c = {species: a.species, people: a.people || '', ...(a.special ? {S: a.special.S, P: a.special.P, E: a.special.E, A: a.special.A, L: a.special.L} : {}),
    skill: a.skill ? +a.skill.melee.toFixed(3) : null, hp: +a.hp.toFixed(3), size: E.SPECIES.get(a.species).hp, ...(who.kit || {}), tier: who.tier ?? null};
  const k = who.kit;
  if (k) {
    const ref = E.ITEMS.get(E.RULES.ref), wd = E.itemDef(k.weapon, k.wq);
    c.ranged = wd.ranged ? 1 : 0;
    c.atk = +(E.power.attackPL(wd, ref) ?? 0).toFixed(3);
    c.def = +(E.power.defencePL(wd) + (k.shield ? E.power.defencePL(E.itemDef(k.shield, k.sq)) : 0) + (k.body ? E.power.defencePL(E.itemDef(k.body, k.bq)) : 0)).toFixed(3);
  }
  return c;
}

// a clean field and fresh random streams for fight `key`
function fresh(E, w, opt, key) {
  w.rngs = E.newStreams(`${opt.seed}/${key}`);
  w.agents = []; w.armory = []; w.logLines = []; w.squads = {};
  if (w.scratch) w.scratch = {};
  return E.mulberry(E.seedNumber(`${opt.seed}/${key}/pick`));
}

// Duel number i: everything random in it comes from the seed and i, so the workers can split the work
// any way and still produce the same duels
export function duel(E, w, P, opt, i) {
  const rng = fresh(E, w, opt, `${i}`);
  const tiers = opt.tiers || P.tiers, T = pick(rng, tiers);
  let kind = 'same', B;
  const races = opt.raceIds;
  const A = {species: pick(rng, races), tier: T, kit: kitFor(P, opt, rng, T)};
  if (opt.foes.length && rng() < opt.foeShare) { kind = 'foe'; B = {species: pick(rng, opt.foes)}; }
  else if (opt.cross > 0 && tiers.includes(T + 1) && rng() < opt.cross) { kind = 'cross'; B = {species: pick(rng, races), tier: T + 1, kit: kitFor(P, opt, rng, T + 1)}; }
  else B = {species: pick(rng, races), tier: T, kit: kitFor(P, opt, rng, T)};
  const cx = w.w / 2, cy = w.h / 2, d = opt.distance / 2;
  // who stands on the left is drawn too, so neither side gets the first move for free
  const flip = rng() < 0.5;
  const a = spawn(E, w, opt, rng, A, flip ? cx + d : cx - d, cy), b = spawn(E, w, opt, rng, B, flip ? cx - d : cx + d, cy);
  const ca = card(E, a, A), cb = card(E, b, B);
  const fight = E.TASKS.get('fight'), out = x => x.dead || x.downed;
  let t = 0;
  for (; t < opt.maxTicks && !out(a) && !out(b); t++) {
    w.tick++;
    for (const [me, foe] of t % 2 ? [[a, b], [b, a]] : [[b, a], [a, b]]) {
      if (out(me) || out(foe)) continue;
      if (me.cd > 0) me.cd--;
      // venom keeps biting (as in agents/body.js)
      if (me.poison) { if (w.tick < me.poison.until) { me.hp -= me.poison.dmg; if (me.hp <= 0) { me.dead = true; continue; } } else me.poison = null; }
      if (me.task?.id !== 'fight' || me.task.target !== foe) me.task = {id: 'fight', target: foe};
      fight.step(w, me, me.task);
    }
  }
  const winner = out(b) && !out(a) ? 'a' : out(a) && !out(b) ? 'b' : 'draw';
  const left = winner === 'a' ? a.hp / E.maxHp(a) : winner === 'b' ? b.hp / E.maxHp(b) : null;
  return {i, kind, tier: T, a: ca, b: cb, winner, ticks: t, left: left == null ? null : +Math.max(0, left).toFixed(3)};
}

// ── one battle ───────────────────────────────────────────────────────────────

// Battle number i. Side A: one kind of fighter (a race with gear of one tier), 1…team of them. Side B:
// another kind (a race, maybe of another tier, or a creature), added one by one until its total rating
// reaches A's × a ratio drawn between ½ and 2 (or the side is full). So the battles cover even and uneven
// sides, few against many, and the outcome can be checked against the ratings.
export function battle(E, w, P, opt, i) {
  const rng = fresh(E, w, opt, `battle/${i}`);
  const tiers = opt.tiers || P.tiers, cx = w.w / 2, cy = w.h / 2, d = opt.distance / 2;
  const flip = rng() < 0.5, xA = flip ? cx + d : cx - d, xB = flip ? cx - d : cx + d;
  const at = (x, k) => [x + (k % 2 ? 0.6 : 0) * Math.sign(x - cx), cy + (k - opt.team / 2) * 0.9];
  const kindA = {species: pick(rng, opt.raceIds), tier: pick(rng, tiers)};
  const kindB = opt.battleFoes.length && rng() < opt.battleFoeShare ? {species: pick(rng, opt.battleFoes)} : {species: pick(rng, opt.raceIds), tier: pick(rng, tiers)};
  const make = (kind, x, k) => spawn(E, w, opt, rng, {species: kind.species, tier: kind.tier, kit: kind.tier == null ? null : kitFor(P, opt, rng, kind.tier)}, ...at(x, k));
  const nA = 1 + Math.floor(rng() * opt.team), A = [];
  for (let k = 0; k < nA; k++) A.push(make(kindA, xA, k));
  const ksA = A.reduce((s, a) => s + E.strength.strengthOf(a), 0), want = ksA * Math.exp((rng() * 2 - 1) * Math.LN2);
  const B = []; let ksB = 0;
  while (B.length < opt.team) {
    const b = make(kindB, xB, B.length), ks = E.strength.strengthOf(b);
    if (B.length && ksB + ks / 2 > want) { w.agents.splice(w.agents.indexOf(b), 1); break; }
    B.push(b); ksB += ks;
  }
  const rec = side => side.map(a => ({raw: +E.strength.strengthParts(a).raw.toPrecision(5), weapon: a.equip?.right?.type || a.equip?.left?.type || null, shield: a.gear.blockItem && !E.ITEMS.get(a.gear.blockItem.type).melee ? 1 : 0}));
  const unitsA = rec(A), unitsB = rec(B);
  const fight = E.TASKS.get('fight'), out = x => x.dead || x.downed, all = [...A, ...B];
  const foesOf = a => (A.includes(a) ? B : A);
  let t = 0;
  for (; t < opt.maxTicks && A.some(a => !out(a)) && B.some(b => !out(b)); t++) {
    w.tick++;
    const order = t % 2 ? all : [...all].reverse();
    for (const me of order) {
      if (out(me)) continue;
      if (me.cd > 0) me.cd--;
      if (me.poison) { if (w.tick < me.poison.until) { me.hp -= me.poison.dmg; if (me.hp <= 0) { me.dead = true; continue; } } else me.poison = null; }
      // keep after the foe already engaged; once it falls, the nearest one still standing
      let foe = me.task?.id === 'fight' && !out(me.task.target) ? me.task.target : null;
      if (!foe) { let bd = Infinity; for (const o of foesOf(me)) { if (out(o)) continue; const dd = (o.x - me.x) ** 2 + (o.y - me.y) ** 2; if (dd < bd) { bd = dd; foe = o; } } }
      if (!foe) continue;
      if (me.task?.id !== 'fight' || me.task.target !== foe) me.task = {id: 'fight', target: foe};
      fight.step(w, me, me.task);
    }
  }
  const upA = A.filter(a => !out(a)).length, upB = B.filter(b => !out(b)).length;
  const winner = upA && !upB ? 'a' : upB && !upA ? 'b' : 'draw';
  return {i, a: {species: kindA.species, tier: kindA.tier, n: A.length, ks: +ksA.toFixed(2), left: upA, units: unitsA},
    b: {species: kindB.species, tier: kindB.tier ?? null, n: B.length, ks: +ksB.toFixed(2), left: upB, units: unitsB}, winner, ticks: t};
}

// ── the coordinator ──────────────────────────────────────────────────────────

// 'monsters' in a list of creatures: every raid monster that is not a race (the undead and the demon)
function expandFoes(E, opt) {
  const mon = E.MONSTERS.filter(m => m.kind !== 'race').map(m => m.id);
  for (const k of ['foes', 'battleFoes']) if (opt[k].includes('monsters')) opt[k] = [...new Set([...opt[k].filter(f => f !== 'monsters'), ...mon])];
}

// run jobs [{type, from, to}] on a pool of workers; returns every result in order of its number
async function runPool(opt, jobs, total, word) {
  const results = [], t0 = Date.now();
  if (!jobs.length) return results;
  const nW = Math.max(1, Math.min(opt.jobs, jobs.length));
  let next = 0;
  await new Promise((ok, fail) => {
    let alive = nW;
    const feed = wk => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.postMessage('exit'); };
    for (let k = 0; k < nW; k++) {
      const wk = new Worker(fileURLToPath(import.meta.url), {workerData: opt});
      wk.on('message', r => {
        results.push(...r);
        process.stderr.write(`\r  ${results.length}/${total} ${word} · ${((Date.now() - t0) / 1000).toFixed(0)} с   `);
        feed(wk);
      });
      wk.on('error', fail);
      wk.on('exit', () => { if (--alive === 0) ok(); });
      feed(wk);
    }
  });
  process.stderr.write('\n');
  return results.sort((x, y) => x.i - y.i);
}
const batches = (type, n, size) => { const out = []; for (let k = 0; k < n; k += size) out.push({type, from: k, to: Math.min(n, k + size)}); return out; };

// the typical rating of each race in each tier and of each creature: many of them rolled and kitted as in
// the battles, on a scratch world
function typical(E, P, opt, tiers) {
  const w = {rngs: {birth: E.mulberry(E.seedNumber(opt.seed + '/typical'))}, agents: [], nextId: 1, nameIdx: 0};
  const rng = E.mulberry(E.seedNumber(opt.seed + '/typical/pick')), N = 300;
  const stats = xs => { const s = [...xs].sort((a, b) => a - b); return {mean: s.reduce((a, b) => a + b, 0) / s.length, p25: s[Math.floor(s.length * 0.25)], p75: s[Math.floor(s.length * 0.75)]}; };
  const races = opt.raceIds.map(id => ({species: id, tiers: Object.fromEntries(tiers.map(T => [T, stats(Array.from({length: N}, () => { w.agents = []; return E.strength.strengthOf(spawn(E, w, opt, rng, {species: id, tier: T, kit: kitFor(P, opt, rng, T)}, 0, 0)); }))]))}));
  const foes = [...new Set([...opt.battleFoes, ...opt.foes])].map(id => ({species: id, ...stats(Array.from({length: N}, () => { w.agents = []; return E.strength.strengthOf(spawn(E, w, opt, rng, {species: id}, 0, 0)); }))}));
  return {races, foes};
}


async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const E = await engine();
  const {VERSION} = await import('../src/version.js');
  const P = pools(E.ITEMS);
  opt.raceIds = opt.races === 'all' ? E.RACES.map(r => r.id) : opt.races.split(',');
  expandFoes(E, opt);
  for (const id of [...opt.raceIds, ...opt.foes, ...opt.battleFoes]) if (!E.SPECIES.has(id)) { console.error(`нет такого вида: ${id}`); process.exit(1); }
  if (opt.tiers) for (const t of opt.tiers) if (!P.tiers.includes(t)) { console.error(`в тире ${t} нет оружия (есть: ${P.tiers.join(', ')})`); process.exit(1); }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = resolve(opt.out || join(here, '..', 'runs', 'arena-' + stamp));
  mkdirSync(out, {recursive: true});
  const tiers = opt.tiers || P.tiers, doW = opt.part !== 'strength', doS = opt.part !== 'weapons';
  console.log(`Арена ${VERSION}: ${doW ? opt.fights + ' поединков' : ''}${doW && doS ? ' и ' : ''}${doS ? opt.battles + ' групповых боёв' : ''}, тиры ${tiers.join(', ')}, расы ${opt.races === 'all' ? 'все' : opt.races} → ${out}`);
  const t0 = Date.now();
  const duels = doW ? await runPool(opt, batches('duel', opt.fights, 250), opt.fights, 'поединков') : [];
  const fights = doS ? await runPool(opt, batches('battle', opt.battles, 50), opt.battles, 'групповых боёв') : [];

  const {analyse, renderArena, consoleSummary} = await import('./arena-report.mjs');
  const names = {
    items: Object.fromEntries(E.ITEMS.all().map(d => [d.id, d.short])),
    species: Object.fromEntries(E.SPECIES.all().map(s => [s.id, s.label])),
    hands: Object.fromEntries(E.ITEMS.all().map(d => [d.id, d.hands || 0])),
    ranged: Object.fromEntries(E.ITEMS.all().filter(d => d.ranged).map(d => [d.id, 1])),
  };
  const summary = analyse(duels, {opt, names, version: VERSION, tiers, seconds: (Date.now() - t0) / 1000,
    battles: fights, strength: {...E.STRENGTH, refRaw: E.strength.referenceRaw()}, typical: doS ? typical(E, P, opt, tiers) : null});
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary));
  writeFileSync(join(out, 'report.html'), renderArena(summary));
  if (duels.length) {
    const cols = ['i', 'kind', 'tier', 'winner', 'ticks', 'left'], side = ['species', 'people', 'tier', 'S', 'P', 'E', 'A', 'L', 'skill', 'hp', 'size', 'weapon', 'wq', 'shield', 'sq', 'body', 'bq', 'atk', 'def', 'ranged'];
    const rows = [[...cols, ...side.map(c => 'a_' + c), ...side.map(c => 'b_' + c)].join(',')];
    for (const r of duels) rows.push([...cols.map(c => r[c] ?? ''), ...side.map(c => r.a[c] ?? ''), ...side.map(c => r.b[c] ?? '')].join(','));
    writeFileSync(join(out, 'fights.csv'), rows.join('\n') + '\n');
  }
  if (fights.length) {
    const rows = ['i,winner,ticks,a_species,a_tier,a_n,a_ks,a_left,b_species,b_tier,b_n,b_ks,b_left'];
    for (const r of fights) rows.push([r.i, r.winner, r.ticks, r.a.species, r.a.tier, r.a.n, r.a.ks, r.a.left, r.b.species, r.b.tier ?? '', r.b.n, r.b.ks, r.b.left].join(','));
    writeFileSync(join(out, 'battles.csv'), rows.join('\n') + '\n');
  }
  console.log(consoleSummary(summary));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} с · отчёт: ${join(out, 'report.html')}`);
}

// the same file is both the coordinator and its workers
if (!isMainThread) {
  const opt = workerData, E = await engine(), P = pools(E.ITEMS), w = field(E);
  opt.raceIds = opt.races === 'all' ? E.RACES.map(r => r.id) : opt.races.split(',');
  expandFoes(E, opt);
  parentPort.on('message', job => {
    if (job === 'exit') process.exit(0);
    const res = [], run = job.type === 'battle' ? battle : duel;
    for (let i = job.from; i < job.to; i++) res.push(run(E, w, P, opt, i));
    parentPort.postMessage(res);
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
