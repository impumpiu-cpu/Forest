// The same levy and physical stores for a war and an alliance (diplomacy.js, alliance.js).
// Livestock stays home. Guard golems and trained war beasts are transferred, never counted twice. The elves' wild allies
// (p.wild: beasts of the land, treants of the forest — atlas/wilds.js) fight and fall with the army and go back to the wood.
import {ARMY as A} from '../data/parties.js';
import {GOLEMS} from '../data/townBuildings.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {beastWorth} from './beasts.js';
import {townFx} from './towns.js';
import {wildOfArmy} from './wilds.js';
import {sendParty} from './parties.js';
import {YEAR_DAYS} from '../data/atlas.js';
import {rideWith, stepOff} from './persons.js';
import {takeHeads, addGroup, book, grownOf, groupSize} from './population.js';

const r2 = n => Math.round(n * 100) / 100;
const beastMen = list => Object.entries(list || {}).reduce((s, [sp, n]) => s + n * beastWorth(SPECIES.get(sp)), 0);
const guardMen = list => (list || []).reduce((s, metal) => s + (GOLEMS.men[metal] || 0), 0);

export function refreshArmy(p) {
  if (p.force) p.might = Math.sqrt(Math.max(0, p.men) + beastMen(p.warBeasts) + beastMen(p.wild) + guardMen(p.golems)) * p.force;
  // Old saves and hand-set scenarios retain their rating, but it now follows their casualties.
  else if (p.ratedMen > 0) p.might *= Math.sqrt(Math.max(0, p.men) / p.ratedMen);
  p.ratedMen = p.men;
  return p.might;
}

export function sendArmy(a, t, goal, men0, props) {
  // the levy is of the town's grown ones: no more than it has, and fewer than ARMY.minMen is no host (nothing is spent)
  const men = Math.min(men0, grownOf(a, t));
  if (!(men >= A.minMen)) return null;
  const share = WORLD_PEOPLES.get(t.people)?.beastLevy ?? A.beasts;
  const warBeasts = Object.fromEntries(Object.entries(t.warBeasts?.list || {}).map(([sp, n]) => [sp, Math.ceil(n * share)]).filter(([, n]) => n > 0));
  const wild = wildOfArmy(a, t, men, goal);   // the elves' beasts of the land and treants of the forest (atlas/wilds.js)
  const guards = t.golems?.guard || [], golems = guards.slice(0, Math.ceil(guards.length * A.beasts));
  const kit = Object.fromEntries(Object.entries(A.kit).map(([g, n]) => [g, Math.min(t.stock?.[g] || 0, men * n)]));
  const fx = townFx(t), force = (1 + A.prod * fx.prod + A.defence * fx.defence) * A.might;
  // its food: stores for A.supplies days, a store a man a year — its realm's store first, then its town's; short, it forages
  const owner = props?.owner ?? t.realm, realm = (a.realms || []).find(r => r.id === owner);
  const need = men * A.supplies / YEAR_DAYS, fromRealm = Math.max(0, Math.min(need, realm?.stock?.stores || 0)), fromTown = Math.max(0, Math.min(need - fromRealm, t.stock?.stores || 0));
  const supplies = Math.round(A.supplies * (A.supplyFloor + (1 - A.supplyFloor) * (need > 0 ? (fromRealm + fromTown) / need : 1)));
  const army = {people: t.people, from: t.id, men, men0: men, warBeasts, wild, golems, kit, force, supplies, speed: 'foot', burnt: 0, ...props};
  refreshArmy(army);
  const p = sendParty(a, 'army', t.i, goal, army);
  if (!p) return null;
  rideWith(a, t, p);   // a chief that leads rides with it (atlas/persons.js)
  p.group = takeHeads(a, t, men, {band: 1, how: 'levy'});   // the levy: grown ones of the town's races, as they are (atlas/population.js)
  p.men = p.men0 = groupSize(p.group); refreshArmy(p);   // (the host is exactly what was taken)
  if (t.warBeasts) { for (const [sp, n] of Object.entries(warBeasts)) { t.warBeasts.list[sp] -= n; if (!t.warBeasts.list[sp]) delete t.warBeasts.list[sp]; } t.warBeasts.men = beastMen(t.warBeasts.list); }
  if (t.golems) t.golems.guard = guards.slice(golems.length);
  for (const [g, n] of Object.entries(kit)) if (n > 0) { t.stock[g] = r2(t.stock[g] - n); if (t.stock[g] <= 0) delete t.stock[g]; }
  if (props?.supplies == null) {   // (an army that brings its own supplies — the alliance's — takes no stores)
    if (fromRealm > 0) { realm.stock.stores = r2(realm.stock.stores - fromRealm); if (realm.stock.stores <= 0) delete realm.stock.stores; }
    if (fromTown > 0) { t.stock.stores = r2(t.stock.stores - fromTown); if (t.stock.stores <= 0) delete t.stock.stores; }
  }
  return p;
}

// Herbs save part of the wounded after a battle, not men lost to starvation on the road.
export function armyLosses(p, share, rnd, battle = null) {
  p.ratedMen = p.men;
  let loss = Math.max(0, p.men) * share;
  if (battle) {
    p.result = battle;
    const herbs = Math.min(p.kit?.herbs || 0, loss * A.heal.share / A.heal.perHerb);
    if (herbs > 0) { p.kit.herbs = r2(p.kit.herbs - herbs); loss -= herbs * A.heal.perHerb; p.herbsUsed = r2((p.herbsUsed || 0) + herbs); }
  }
  p.men = Math.max(0, p.men - loss);
  if (p.warBeasts) for (const [sp, n] of Object.entries(p.warBeasts)) { let alive = 0; for (let k = 0; k < n; k++) if (rnd() >= share) alive++; if (alive) p.warBeasts[sp] = alive; else delete p.warBeasts[sp]; }
  if (p.wild) for (const [sp, n] of Object.entries(p.wild)) { let alive = 0; for (let k = 0; k < n; k++) if (rnd() >= share) alive++; if (alive) p.wild[sp] = alive; else delete p.wild[sp]; }
  if (p.golems) p.golems = p.golems.filter(() => rnd() >= share);
  refreshArmy(p);
}

// the dead of a scene the caravan played (campaign/march.js worldOutcome): `dead` of its men lie dead, `taken` walk off bound —
// no herbs (the scene's dead are dead), its beasts and golems in the same share, rounded; its levy's composition follows
export function sceneLosses(a, p, dead, taken) {
  const men = Math.max(0, p.men), gone = Math.min(men, Math.max(0, dead) + Math.max(0, taken));
  if (!(gone > 0) || !(men > 0)) return 0;
  const share = gone / men, keep = 1 - share;
  p.men = men - gone;
  if (p.group) for (const b of Object.values(p.group)) for (let i = 0; i < 3; i++) b[i] *= keep;
  const trim = list => { for (const [sp, n] of Object.entries(list || {})) { const left = Math.round(n * keep); if (left > 0) list[sp] = left; else delete list[sp]; } };
  trim(p.warBeasts); trim(p.wild);
  if (p.golems) p.golems = p.golems.slice(0, Math.round(p.golems.length * keep));
  refreshArmy(p);
  return gone;
}

export function returnArmy(a, p) {
  if (p.returned) return;
  p.returned = true;
  // home, or — its town gone — to the nearest town of its realm (people are not lost by a town's fall: atlas/demography.js)
  const home = a.towns.find(t => t.id === p.from), near = o => Math.hypot(o.x - (home?.x ?? 0), o.y - (home?.y ?? 0));
  const t = home?.alive ? home : (a.towns || []).filter(o => o.alive && (p.owner != null ? o.realm === p.owner : o.people === p.people)).sort((x, y) => near(x) - near(y) || x.id - y.id)[0];
  if (!t) return;
  stepOff(a, p, t);
  // the survivors come home as they went — the races of the levy, less the fallen in proportion; the fallen are the town's loss of war
  const alive = Math.max(0, p.men), k = p.men0 > 0 ? alive / p.men0 : 0;
  if (p.group) addGroup(a, t, Object.fromEntries(Object.entries(p.group).map(([r, b]) => [r, b.map(x => x * k)])));
  else addGroup(a, t, {[WORLD_PEOPLES.get(p.people || t.people).race]: [0, alive, 0]});   // (an old save's army: grown ones of its people's race)
  book(t, 'war', Math.max(0, (p.men0 || 0) - alive));
  if (p.warBeasts && Object.keys(p.warBeasts).length) { const b = t.warBeasts ||= {list: {}, men: 0}; for (const [sp, n] of Object.entries(p.warBeasts)) b.list[sp] = (b.list[sp] || 0) + n; b.men = beastMen(b.list); }
  if (p.golems?.length) { t.golems ||= {auto: {}, guard: [], since: null}; t.golems.guard.push(...p.golems); }
  const survival = Math.min(1, Math.max(0, p.men / (p.men0 || p.men || 1))), wear = A.wear[p.result || 'retreat'];
  t.stock ||= {};
  for (const [g, n] of Object.entries(p.kit || {})) { const back = r2(n * survival * (g === 'herbs' ? 1 : 1 - wear)); if (back > 0) t.stock[g] = r2((t.stock[g] || 0) + back); }
  // Livestock withdrawn by a pre-change save is returned as food stock, not lost in migration.
  if (p.beasts) t.stock.beasts = (t.stock.beasts || 0) + Math.floor(p.beasts * survival);
}
