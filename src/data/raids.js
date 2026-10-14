// Who comes on a raid. Every time the hostile lands send a band (outside/scripted.js), one of these
// is drawn by `weight(w, t, night)`: t is the raid threat the enemies see (settlement/threat.js),
// night is 0…1 at the moment the band sets out. The band's size is a budget in "human raiders":
// each member costs `cost` of it, so a raid of 6 may be six bandits, twelve goblins or one troll and
// a bit. members(w, rng, budget, t) lists who comes: [{species, kit?, init?(a, w)}].
//   kind: 'sentient' — a thinking enemy (later: talks, ransoms, can be bargained with);
//         'monster'  — beasts and the rot's undead.
import {Registry} from '../core/registry.js';
import {pick, plural} from '../core/util.js';
import {SPECIES} from './species.js';

export const RAID_BANDS = new Registry('raid band');

// a member's share of the budget, in "human raiders": roughly its health × its blow
const COST = {human: 1, orc: 2, goblin: 0.6, ogre: 4.5, troll: 5, gnoll: 1.7, darkelf: 2,
  zombie: 0.9, skeleton: 1, upyr: 1.8, vampire: 7, necromancer: 1.5};

// fill the budget with species drawn from `mix` ([[species, weight], …]); at least one member
function fill(rng, budget, mix, extra = []) {
  const out = [...extra];
  let left = budget - extra.reduce((s, m) => s + COST[m.species], 0);
  const total = mix.reduce((s, m) => s + m[1], 0);
  for (let guard = 0; guard < 40; guard++) {
    const fits = mix.filter(([sp]) => COST[sp] <= left + 0.25);
    if (!fits.length) break;
    let r = rng() * fits.reduce((s, m) => s + m[1], 0), sp = fits[0][0];
    for (const [s, wt] of fits) { r -= wt; if (r <= 0) { sp = s; break; } }
    out.push({species: sp}); left -= COST[sp];
  }
  if (!out.length) out.push({species: mix[0][0]});
  return out.slice(0, 18);
}

// early bands carry clubs and slings in rags, later ones spears, shields, bows and leather
export function banditKit(rng, t) {
  const early = [['club'], ['club'], ['spear'], ['sling'], ['staff']];
  const late = [['spear', 'shield'], ['club', 'shield'], ['maul'], ['bow', 'quiver'], ['spear'], ['sling']];
  const set = pick(rng, rng() < Math.min(0.9, t * 0.04) ? late : early);
  const r = rng(), leather = Math.min(0.6, t * 0.025), plates = t > 12 ? Math.min(0.3, (t - 12) * 0.025) : 0;
  return [...set, ...(r < plates ? ['hardleather'] : r < plates + leather ? ['jerkin'] : r < plates + leather + 0.4 ? ['clothes'] : [])];
}

const KITS = {
  orc: (rng, t) => [...pick(rng, [['maul'], ['axe', 'shield'], ['club', 'shield'], ['spear'], t > 10 ? ['bronzeaxe', 'shield'] : ['axe']]), ...(rng() < 0.5 ? ['jerkin'] : [])],
  goblin: rng => pick(rng, [['sling'], ['sling'], ['bow', 'quiver'], ['club'], ['spear']]),
  ogre: rng => pick(rng, [['maul'], ['club']]),
  gnoll: (rng, t) => [...pick(rng, [['spear'], ['spear', 'shield'], ['bow', 'quiver'], ['axe']]), ...(rng() < 0.3 ? ['jerkin'] : [])],
  darkelf: (rng, t) => [...pick(rng, [['bow', 'quiver'], ['bow', 'quiver'], ['sword'], ['spear', 'shield']]), rng() < 0.6 ? 'hardleather' : 'jerkin'],
  skeleton: rng => pick(rng, [['club'], ['spear'], ['axe'], ['club', 'shield']]),
  vampire: () => ['sword', 'clothes'],
  necromancer: () => ['staff', 'clothes'],
};

// what a member of a band carries; species without hands carry nothing
export const kitFor = (species, rng, t) => (SPECIES.get(species).inventory && KITS[species] ? KITS[species](rng, t) : []);

const named = sp => a => { a.name = SPECIES.get(sp).label.replace(/^./, c => c.toUpperCase()); };

RAID_BANDS.registerAll([
  {id: 'bandits', label: 'разбойники «Серых волков»', kind: 'sentient',
    weight: () => 3,
    members: (w, rng, budget) => fill(rng, budget, [['human', 1]]).map(m => ({...m, init: a => { a.name = 'Налётчик'; }, kit: 'bandit'})),
    message: n => `Набег! ${n} ${plural(n, 'разбойник', 'разбойника', 'разбойников')} из «Серых волков»`},

  {id: 'orcs', label: 'орочья ватага', kind: 'sentient',
    weight: (w, t) => (t >= 4 ? 2 : 0.5),
    members: (w, rng, budget) => fill(rng, budget, [['orc', 3], ['goblin', 2], ['ogre', budget >= 10 ? 0.6 : 0]]),
    message: () => 'Набег! Орочья ватага с гоблинами'},

  {id: 'goblins', label: 'гоблинская шайка', kind: 'sentient',
    weight: () => 1.5,
    members: (w, rng, budget) => fill(rng, budget, [['goblin', 1]]),
    message: () => 'Набег! Гоблинская шайка: мелкие, юркие, тащат всё, что плохо лежит'},

  {id: 'gnolls', label: 'стая гноллов', kind: 'sentient',
    weight: (w, t) => (t >= 3 ? 1.5 : 0.4),
    members: (w, rng, budget) => fill(rng, budget, [['gnoll', 1]]),
    message: () => 'Набег! Гноллы-падальщики идут на запах лагеря'},

  {id: 'darkelves', label: 'отряд тёмных эльфов', kind: 'sentient',
    weight: (w, t, night) => (t >= 8 ? 0.6 + night : 0),
    members: (w, rng, budget) => fill(rng, budget, [['darkelf', 1]]),
    message: () => 'Набег! Тёмные эльфы вышли из-под земли за рабами и добычей'},

  {id: 'ogres', label: 'огры-людоеды', kind: 'monster',
    weight: (w, t) => (t >= 6 ? 0.8 : 0),
    members: (w, rng, budget) => fill(rng, Math.min(budget, 9.5), [['ogre', 1]]).map(m => ({...m, init: named('ogre')})),
    message: () => 'С гор спустились огры-людоеды'},

  {id: 'troll', label: 'тролль', kind: 'monster',
    weight: (w, t) => (t >= 5 ? 1 : 0),
    members: (w, rng, budget) => fill(rng, Math.min(budget, 10.5), [['troll', 1]]).map(m => ({...m, init: named('troll')})),
    message: n => (n === 1 ? 'Из чащи вышел тролль. Раны на нём затягиваются, пока рядом нет огня' : 'Из чащи вышли тролли. Раны на них затягиваются, пока рядом нет огня')},

  // the rot's host: by night three times as likely; past a threat of 10 a necromancer walks behind it
  {id: 'undead', label: 'мертвецы', kind: 'monster',
    weight: (w, t, night) => (t >= 3 ? 0.8 + 2 * night : 0),
    members: (w, rng, budget, t) => {
      const lead = t >= 10 ? [{species: 'necromancer', init: a => { a.role = 'necromancer'; a.name = 'Некромант'; }}] : [];
      return fill(rng, budget * 1.2, [['zombie', 3], ['skeleton', t >= 6 ? 2 : 0]], lead);
    },
    groupInit: group => { const nec = group.find(a => a.role === 'necromancer'); if (nec) for (const a of group) if (a !== nec) a.master = nec.id; },
    message: (n, group) => `Из курганов поднялись мертвецы: ${n}${group.some(a => a.role === 'necromancer') ? '. За ними идёт некромант — без него они разбредутся' : ''}`},

  // upyrs come only by night and run from the sun
  {id: 'upyrs', label: 'упыри', kind: 'monster',
    weight: (w, t, night) => (t >= 6 && night > 0.5 ? 1.2 : 0),
    members: (w, rng, budget) => fill(rng, Math.min(budget, 6), [['upyr', 1]]),
    message: () => 'Ночью к лагерю пришли упыри. Им нужна кровь, солнце гонит их прочь'},

  {id: 'vampire', label: 'вампир со свитой', kind: 'sentient',
    weight: (w, t, night) => (t >= 20 && night > 0.5 ? 0.5 : 0),
    members: (w, rng, budget) => fill(rng, budget, [['upyr', 1]], [{species: 'vampire', init: (a, w) => { [a.name, a.gender] = pick(w.rng, SPECIES.get('vampire').names); }}]),
    message: (n, group) => `${group.find(a => a.species === 'vampire')?.name || 'Вампир'} пришёл со свитой упырей. Простое железо его почти не берёт, нужно серебро`},
]);

export const bandCost = sp => COST[sp];
