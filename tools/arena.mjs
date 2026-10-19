// Arena: thousands of duels without graphics, with a report — which weapon, armour, race, skill and
// characteristic wins in which tier. The fight is the game's own: the `fight` task (agents/tasks.js)
// with its blows, shots, armour, shields, crits, dodges and wear (agents/combat.js), on a flat open
// field. Only the brain is left out: nobody flees or calls for help, a duel goes to the end.
//
//   npm run arena -- [options]
//     --fights 10000        how many duels
//     --tiers 0,1,2         material tiers to fight in (data/balance/: tier); default — every weapon tier
//     --races human,orc     who fights (data/races.js ids, or 'all' — the default)
//     --stats rolled|norm   SPECIAL rolled inside the race's limits (default) or 5 in everything
//     --skill random|0.5    melee and shooting skill: uniform 0–1 (default) or one value for all
//     --armor tier|any|none body armour: of the fight's tier (or the nearest lower one that has any; default),
//                           any of the tier or below, or none
//     --shield 0.5          chance that a one-hander comes with a shield
//     --quality 0|mix       plain pieces only (default), or a mix of +0…+3 as trade and luck give
//     --cross 0.2           share of duels where the second fighter has the next tier's gear
//     --foes skeleton,wolf  also fight these creatures (species ids, or 'monsters'); --foe-share 0.3 of the duels
//     --distance 8          cells between the two at the start
//     --max-ticks 3000      a duel still going after this is a draw
//     --fair                gear only: humans, SPECIAL 5, skill 0.5, no cross-tier duels
//     --seed arena          the same seed and options give the same duels, however many workers
//     --jobs N              parallel workers (default: CPU cores)
//     --out dir             where to write (default runs/arena-<date-time>)
//
// Writes fights.csv (one row per duel), summary.json and report.html; prints the short version.
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = {fights: 10000, tiers: null, races: 'all', stats: 'rolled', skill: 'random', armor: 'tier', shield: 0.5, quality: '0',
    cross: 0.2, foes: [], foeShare: 0.3, distance: 8, maxTicks: 3000, seed: 'arena', jobs: availableParallelism(), out: null, fair: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--fights') o.fights = +v();
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
  if (o.fair) Object.assign(o, {races: 'human', stats: 'norm', skill: '0.5', cross: 0});
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
  return {newGame, DEFAULT_CFG, createAgent, maxHp, TASKS, T, dress, refreshBody, ITEMS, SPECIES, RACES, MONSTERS, newStreams, mulberry, seedNumber, STATS, itemDef, power, RULES};
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

// Duel number i: everything random in it comes from the seed and i, so the workers can split the work
// any way and still produce the same duels
export function duel(E, w, P, opt, i) {
  const rng = E.mulberry(E.seedNumber(`${opt.seed}/${i}/pick`));
  w.rngs = E.newStreams(`${opt.seed}/${i}`);
  w.agents = []; w.armory = []; w.logLines = []; w.squads = {};
  if (w.scratch) w.scratch = {};
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

// ── the coordinator ──────────────────────────────────────────────────────────

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const E = await engine();
  const {VERSION} = await import('../src/version.js');
  const P = pools(E.ITEMS);
  opt.raceIds = opt.races === 'all' ? E.RACES.map(r => r.id) : opt.races.split(',');
  if (opt.foes.includes('monsters')) opt.foes = [...opt.foes.filter(f => f !== 'monsters'), ...E.MONSTERS.filter(m => m.kind !== 'race').map(m => m.id)];
  for (const id of [...opt.raceIds, ...opt.foes]) if (!E.SPECIES.has(id)) { console.error(`нет такого вида: ${id}`); process.exit(1); }
  if (opt.tiers) for (const t of opt.tiers) if (!P.tiers.includes(t)) { console.error(`в тире ${t} нет оружия (есть: ${P.tiers.join(', ')})`); process.exit(1); }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = resolve(opt.out || join(here, '..', 'runs', 'arena-' + stamp));
  mkdirSync(out, {recursive: true});
  const batch = 250, batches = [];
  for (let k = 0; k < opt.fights; k += batch) batches.push([k, Math.min(opt.fights, k + batch)]);
  const nW = Math.max(1, Math.min(opt.jobs, batches.length));
  console.log(`Арена ${VERSION}: ${opt.fights} боёв, тиры ${(opt.tiers || P.tiers).join(', ')}, расы ${opt.races === 'all' ? 'все' : opt.races}, потоков ${nW} → ${out}`);

  const results = [], t0 = Date.now();
  let next = 0;
  await new Promise((ok, fail) => {
    let alive = nW;
    const feed = wk => { if (next < batches.length) wk.postMessage(batches[next++]); else wk.postMessage('exit'); };
    for (let k = 0; k < nW; k++) {
      const wk = new Worker(fileURLToPath(import.meta.url), {workerData: opt});
      wk.on('message', r => {
        results.push(...r);
        const el = (Date.now() - t0) / 1000;
        process.stderr.write(`\r  ${results.length}/${opt.fights} боёв · ${el.toFixed(0)} с   `);
        feed(wk);
      });
      wk.on('error', fail);
      wk.on('exit', () => { if (--alive === 0) ok(); });
      feed(wk);
    }
  });
  process.stderr.write('\n');
  results.sort((x, y) => x.i - y.i);

  const {analyse, renderArena, consoleSummary} = await import('./arena-report.mjs');
  const names = {
    items: Object.fromEntries(E.ITEMS.all().map(d => [d.id, d.short])),
    species: Object.fromEntries(E.SPECIES.all().map(s => [s.id, s.label])),
    hands: Object.fromEntries(E.ITEMS.all().map(d => [d.id, d.hands || 0])),
  };
  const summary = analyse(results, {opt, names, version: VERSION, tiers: opt.tiers || P.tiers, seconds: (Date.now() - t0) / 1000});
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary));
  writeFileSync(join(out, 'report.html'), renderArena(summary));
  const cols = ['i', 'kind', 'tier', 'winner', 'ticks', 'left'], side = ['species', 'people', 'tier', 'S', 'P', 'E', 'A', 'L', 'skill', 'hp', 'size', 'weapon', 'wq', 'shield', 'sq', 'body', 'bq', 'atk', 'def', 'ranged'];
  const csvRows = [[...cols, ...side.map(c => 'a_' + c), ...side.map(c => 'b_' + c)].join(',')];
  for (const r of results) csvRows.push([...cols.map(c => r[c] ?? ''), ...side.map(c => r.a[c] ?? ''), ...side.map(c => r.b[c] ?? '')].join(','));
  writeFileSync(join(out, 'fights.csv'), csvRows.join('\n') + '\n');
  console.log(consoleSummary(summary));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} с · отчёт: ${join(out, 'report.html')}`);
}

// the same file is both the coordinator and its workers
if (!isMainThread) {
  const opt = workerData, E = await engine(), P = pools(E.ITEMS), w = field(E);
  opt.raceIds = opt.races === 'all' ? E.RACES.map(r => r.id) : opt.races.split(',');
  if (opt.foes.includes('monsters')) opt.foes = [...opt.foes.filter(f => f !== 'monsters'), ...E.MONSTERS.filter(m => m.kind !== 'race').map(m => m.id)];
  parentPort.on('message', job => {
    if (job === 'exit') process.exit(0);
    const res = [];
    for (let i = job[0]; i < job[1]; i++) res.push(duel(E, w, P, opt, i));
    parentPort.postMessage(res);
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
