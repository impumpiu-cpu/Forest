// The ways of the kinds (plan claude/bestiary-plan.md З-10; data/paths.js): a creature of a band or a lair carries its kind's
// way up to its level, a pawn does not; every row of a way names a perk a monster may hold, at a rank it has, the levels
// rising; every class's way reaches the 9th level; the level of a lair's folk grows with its age, of a contract's camp with
// its tier; the carried perks act — scales, venom and blood drunk are read from the creature, not only from its kind; and
// the strength rating (КС) grows with the level.
//   node tools/path-check.mjs
import {SPECIES_PATH, pathOf, lairLevel, tierLevel, LAIR_LEVEL} from '../src/data/paths.js';
import {SPECIES} from '../src/data/species.js';
import {PERKS, perkAccess, perkRanks, perksOf, heldOf} from '../src/data/perks.js';
import {CLASSES} from '../src/data/classes.js';
import {createAgent, refreshBody, maxHp} from '../src/local/index.js';
import {strengthOf} from '../src/agents/strength.js';
import {resistOf} from '../src/agents/combat.js';
import {mulberry, seedNumber} from '../src/core/rng.js';

let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };

// ── the ways as written
const bad = [];
for (const [id, path] of Object.entries(SPECIES_PATH)) {
  if (!SPECIES.has(id)) { bad.push(`${id}: нет такого вида`); continue; }
  let last = 0;
  for (const e of path) {
    if (!PERKS.has(e.perk)) { bad.push(`${id}: нет перка ${e.perk}`); continue; }
    const P = PERKS.get(e.perk);
    if (perkAccess(P).monster === 'no') bad.push(`${id}: ${e.perk} монстру нельзя`);
    if (!(e.rank >= 1 && e.rank <= perkRanks(P))) bad.push(`${id}: ${e.perk} ранг ${e.rank} из ${perkRanks(P)}`);
    if (!(e.level >= 1 && e.level <= 9) || e.level < last) bad.push(`${id}: уровни ${last} → ${e.level}`);
    last = e.level;
  }
}
ok(!bad.length, 'пути видов: перки есть, монстру можно, ранги в пределах, уровни растут 1…9', bad.join('; ') || `${Object.keys(SPECIES_PATH).length} видов`);
const no9 = CLASSES.all().filter(C => !C.path.some(e => e.level === 9));
ok(!no9.length, 'путь каждого класса доходит до 9-го уровня', no9.map(C => C.id).join(', '));

// ── carried to the level, by a monster and not by a pawn
const w = {rngs: {birth: mulberry(seedNumber('path-check'))}, agents: [], nextId: 1, nameIdx: 0, tick: 0, chronicle: {people: []}};
const make = (species, level, faction = 'raiders') => { const a = createAgent(w, species, faction, 0, 0); a.level = level; refreshBody(a); a.hp = maxHp(a); return a; };
const ids = a => perksOf(a).map(p => `${p.id}${(p.rank || 1) > 1 ? p.rank : ''}`).sort().join(',');
const g1 = make('goblin', 1), g9 = make('goblin', 9);
ok(ids(g1) !== ids(g9) && pathOf('goblin').every(e => perksOf(g9).some(p => p.id === e.perk)), 'гоблин 9-го уровня несёт весь путь вида, 1-го — нет', `1: ${ids(g1) || '—'} · 9: ${ids(g9)}`);
const pawn = make('goblin', 9, 'colony');
ok(!perksOf(pawn).some(p => p.from === 'kind'), 'пешка пути вида не несёт', ids(pawn) || '—');
const s1 = make('spider', 1), s9 = make('spider', 9);
ok(heldOf(s9, 'venom').dmg > heldOf(s1, 'venom').dmg, 'паук 9-го уровня травит сильнее — яд берётся от существа', `${heldOf(s1, 'venom').dmg} → ${heldOf(s9, 'venom').dmg}`);
const c1 = make('crocodile', 1), c9 = make('crocodile', 9), CR = SPECIES.get('crocodile');
ok(resistOf(CR, 'slash', true, c9) < resistOf(CR, 'slash', true, c1), 'старый крокодил в панцире — рубящее берёт хуже: чешуя берётся от существа', `${resistOf(CR, 'slash', true, c1)} → ${resistOf(CR, 'slash', true, c9)}`);
const k1 = make('skeleton', 1), k9 = make('skeleton', 9), SK = SPECIES.get('skeleton');
ok(maxHp(k9) > maxHp(k1) && resistOf(SK, 'blunt', true, k9) === resistOf(SK, 'blunt', true, k1), 'старый костяк крепче, но молот бьёт его как прежде', `здоровье ${maxHp(k1).toFixed(2)} → ${maxHp(k9).toFixed(2)}, дробящее ×${resistOf(SK, 'blunt', true, k9)}`);
// the same creature at the 1st and at the 9th (a charge, a roar the rating does not see: not less, and more for most)
const at9 = id => { const a = make(id, 1), lo = strengthOf(a); a.level = 9; refreshBody(a); a.hp = maxHp(a); return [id, lo, strengthOf(a)]; };
const grow = ['goblin', 'varg', 'spider', 'ogre', 'scorpion', 'cyclops', 'skeleton', 'cobra'].map(at9);
ok(grow.every(([, a, b]) => b >= a - 1e-9) && grow.filter(([, a, b]) => b > a).length >= 6, 'КС растёт с уровнем', grow.map(([id, a, b]) => `${id} ${Math.round(a)} → ${Math.round(b)}`).join(', '));

// ── where the level comes from
const ages = LAIR_LEVEL.age.map(lairLevel);
ok(ages.join() === LAIR_LEVEL.level.join() && lairLevel(5) === 1 && lairLevel(1000) === 9, 'уровень логова — по возрасту', `${LAIR_LEVEL.age.join('/')} лет → ${ages.join('/')}`);
ok(tierLevel(1) === 1 && tierLevel(5) === 9 && [1, 2, 3, 4, 5].every(t => tierLevel(t + 1) >= tierLevel(t) || t === 5), 'уровень временного логова — по тиру', [1, 2, 3, 4, 5].map(tierLevel).join('/'));

console.log(fails ? `\npath-check: ${fails} FAIL` : '\npath-check: ok');
process.exit(fails ? 1 : 0);
