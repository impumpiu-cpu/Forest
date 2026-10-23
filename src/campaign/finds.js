// A morning's find after a quiet night (data/campaign.js FINDS): never a purse out of thin air — a traveller's body
// by the road, an abandoned cart, a beast's den full of bones, a hiding place in the ashes of a burnt town, an old
// battlefield. What the land makes possible is read from the world: its roads, its lairs and wolves, its ruins
// and fallen lairs, the graves of its battles and raids, the track of an army.
import {roadAccess} from '../atlas/roads.js';
import {gearDef} from '../agents/equipment.js';
import {lairAt} from '../atlas/lairs.js';
import {ruinAt} from '../atlas/diplomacy.js';
import {faunaLevel} from '../world/region.js';
import {LAIRS} from '../data/lairs.js';
import {ITEMS} from '../data/items.js';
import {RESOURCES} from '../data/resources.js';
import {FINDS} from '../data/campaign.js';
import {cellRegion} from './land.js';
import {takeGear} from './fight.js';
import {toolTier} from './baggage.js';
import {free} from './captives.js';
import {plural} from '../core/util.js';

const between = (r, [lo, hi]) => lo + r() * (hi - lo);
const near = (a, i, p, r) => Math.abs(p.x - i % a.w) <= r && Math.abs(p.y - ((i / a.w) | 0)) <= r;

// how much a cell has of what each kind of find needs: 0 … 1
export const WHERE = {
  road: (a, i) => Math.min(1, roadAccess(a, i)),
  beasts: (a, i) => {
    const l = lairAt(a, i), L = l && LAIRS.get(l.kind);
    if (L && !L.tribe && !L.undead && !L.dragon) return 1;
    return Math.min(1, faunaLevel({region: cellRegion(a, i)}, 'wolf') / 2);
  },
  ruin: (a, i) => (ruinAt(a, i) || (a.lairs || []).some(l => !l.alive && near(a, i, l, 1)) ? 1 : 0),
  battle: (a, i) => Math.min(1, Math.max(a.f.barrows?.[i] ?? 0, (a.f.scourge?.[i] ?? 0) > 0.3 ? 0.5 : 0)),
};

// a quiet morning: at most one find; → its line, or null. r — the campaign's stream of finds
export function morningFind(a, K, r) {
  const F = FINDS.find(f => r() < f.chance * WHERE[f.where](a, K.i));
  if (!F) return null;
  const things = [];
  const g = Math.round(between(r, F.gold));
  if (g > 0) { K.gold = Math.round((K.gold + g) * 10) / 10; things.push(`кошель — ${g} ${plural(g, 'золотой', 'золотых', 'золотых')}`); }
  for (const [id, [p, lo, hi]] of Object.entries(F.goods || {})) {
    if (r() >= p) continue;
    const n = Math.round(between(r, [lo, hi]));
    if (n > 0) { K.cargo[id] = (K.cargo[id] || 0) + n; things.push(`${RESOURCES.get(id).label} (${n})`); }
  }
  const items = Object.entries(F.items || {}).filter(([, p]) => r() < p).map(([id]) => id);
  // a building tool better than the caravan's: a squire takes it in place of his own (as from a beaten foe)
  const tier = d => (d?.iron ? 2 : d?.bronze ? 1 : 0), builds = d => d?.tool && (d.tool.chop || d.tool.build);
  for (const id of [...items]) {
    const d = gearDef(id);
    if (!builds(d) || tier(d) <= toolTier(K)) continue;
    const m = free(K).find(x => x.role === 'squire' && !x.former) || free(K).find(x => !x.former);
    if (!m) continue;
    const old = m.gear.hand[0]; m.gear.hand[0] = id; items.splice(items.indexOf(id), 1);
    if (old && !!gearDef(old)) K.spoils = [...(K.spoils || []), old];
    things.push(`${d.label.toLowerCase()} — ${m.name} взял${m.gender === 'f' ? 'а' : ''} его вместо своего`);
  }
  if (items.length) {
    const names = items.map(id => gearDef(id).label.toLowerCase()).join(', ');
    const took = takeGear(K, items).filter(t => !t.startsWith('трофеи'));   // the one it suits takes it, the rest is for sale
    things.push(took.length ? `${names} — взяли себе: ${took.join(', ')}` : `${names} — в обоз на продажу`);
  }
  K.stats.finds++; K.stats.treasures = (K.stats.treasures || 0) + 1;
  const text = F.text[(r() * F.text.length) | 0];
  return text.replace('{things}', things.join(', ')).replace('{gold}', String(g));
}
