// Summary sheets (docs/NRI.md, этап 6): what the tables add up to, worked out from them and shown, never edited —
// as the stat blocks and price lists at the back of a rule book. Each is made again after an edit of any table.
//
//   creatureSheet — every species: body, blow, the strength rating (КС) of one as it comes, unarmed, and what it
//                   is made of: offence (damage a tick) and staying power, against the reference fighter
//   recipeSheet   — every recipe: what goes in and what comes out in gold, the labour, the margin and the gold an
//                   hour of a craftsman's work earns
//   buildingSheet — every building of the settlement: its price in gold, labour, and what it gives (effects)
import {SPECIES} from '../species.js';
import {middle} from '../special.js';
import {RECIPES} from '../recipes.js';
import {RESOURCES} from '../resources.js';
import {ITEMS} from '../items.js';
import {BUILDINGS} from '../buildings.js';
import {planOf} from '../anatomy.js';
import {HOUR} from '../../core/time.js';
import {onEdit} from './layer.js';
import {expectedStrength, strengthParts, referenceRaw} from '../../agents/strength.js';
import {createAgent, maxHp} from '../../agents/agent.js';
import {refreshBody} from '../../agents/special.js';
import {mulberry} from '../../core/rng.js';

const cache = new Map();
onEdit(() => cache.clear());
const kept = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

// one creature of a species at the middle of its limits, at full health, unarmed, on a scratch world
function typical(sp) {
  const w = {rngs: {birth: mulberry(7)}, agents: [], nextId: 1, nameIdx: 0};
  const a = createAgent(w, sp.id, 'raiders', 0, 0);
  if (a.special && sp.special) { a.special = middle(sp.special); refreshBody(a); }
  a.hp = maxHp(a);
  return a;
}

export const creatureSheet = () => kept('creatures', () => {
  const ref = referenceRaw();
  return SPECIES.all().map(sp => {
    const a = typical(sp), p = strengthParts(a);
    return {id: sp.id, label: sp.label, kind: sp.kind, mind: sp.mind, plan: planOf(sp), hp: r2(maxHp(a)), speed: r3(sp.speed),
      blow: r2(sp.attack?.power ?? 1), cd: sp.attack?.cooldown ?? 12, type: sp.attack?.type ?? 'blunt',
      offence: r3(p.offence * 1000), staying: r2(p.staying), raw: r3(p.raw / ref), rating: Math.round(expectedStrength(sp.id, {key: 'sheet', n: 16})), ks: sp.ks ?? 1};
  });
});

const goldOf = cost => Object.entries(cost || {}).reduce((s, [id, n]) => s + (RESOURCES.has(id) ? RESOURCES.get(id).value * n : 0), 0);
const words = cost => Object.entries(cost || {}).map(([id, n]) => `${RESOURCES.has(id) ? RESOURCES.get(id).short : id} ${n}`).join(', ');

export const recipeSheet = () => kept('recipes', () => RECIPES.all().map(r => {
  const input = goldOf(r.cost), out = r.makes.item ? ITEMS.get(r.makes.item).value : RESOURCES.get(r.makes.resource).value * (r.makes.n || 1);
  const made = r.makes.item ? ITEMS.get(r.makes.item).short : `${RESOURCES.get(r.makes.resource).short} ${r.makes.n || 1}`;
  const margin = out - input;
  return {id: r.id, at: r.at, tier: r.tier || 1, input: words(r.cost), inputGold: r2(input), work: r.work, makes: made, outGold: r2(out),
    margin: r2(margin), perHour: r3(r.work > 0 ? margin / r.work * HOUR : 0), loss: margin < 0};
}));

const effectWords = e => Object.entries(e || {}).flatMap(([kind, o]) => Object.entries(o || {}).map(([k, v]) => `${kind}.${k} ${v}`)).join(', ');

export const buildingSheet = () => kept('buildings', () => BUILDINGS.all().map(b => ({
  id: b.id, name: b.name, costGold: r2(goldOf(b.cost)), cost: words(b.cost), work: b.work ?? 0, max: b.max ?? 1,
  station: !!b.station, portable: !!b.portable, effects: effectWords(b.effects), effect: b.effect || ''})));
