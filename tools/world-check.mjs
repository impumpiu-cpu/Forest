// The range of the world map's deeds (docs/WORLD.md «Нравы»): scenes on a land of «Заселение мира» (atlas/settle.js) where
// the hand puts a town and a lair, raises a leader and asks the actor's brain (atlas/actor.js) what it would do — the way
// tools/behaviour-check.mjs tries one behaviour of a creature at a time. A scene asserts the choice and its outcome, not
// the way to it. Usage: node tools/world-check.mjs [scene id]
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';
import {startFree, landPeople, addLair} from '../src/atlas/settle.js';
import {raise, partyOf, stepLeaders} from '../src/atlas/leaders.js';
import {actorStep} from '../src/atlas/actor.js';
import {BEHAVIOURS, stepParties} from '../src/atlas/parties.js';
import {DOES} from '../src/atlas/deeds/index.js';
import {DEEDS} from '../src/data/deeds.js';
import {LAIRS} from '../src/data/lairs.js';
import {SPECIES} from '../src/data/species.js';
import {biomeAt} from '../src/atlas/biomes.js';
import {groundFits} from '../src/atlas/lairs.js';
import {mulberry} from '../src/core/rng.js';

// one land, made once; every scene gets its own copy with the clock started
function makeLand() { const a = newAtlas({...DEFAULT_ATLAS_CFG, seed: '11', size: 'small'}); while (!landDone(a)) runNextStage(a); return a; }
const base = makeLand();
const world = () => { const a = structuredClone(base); startFree(a); return a; };
const xy = (a, i) => ({x: i % a.w, y: (i / a.w) | 0});
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const cellOf = (a, test) => { for (let i = 0; i < a.n; i++) if (!a.f.ocean[i] && a.f.lake[i] < 0 && test(i)) return i; return -1; };
// a spot for a lair of this kind within `near` cells of a point (and at least `far` away), by the ground it needs
const spotNear = (a, kind, at, near, far = 3) => cellOf(a, i => { const d = dist(xy(a, i), xy(a, at)); return d >= far && d <= near && groundFits(a, LAIRS.get(kind), i) && !a.towns.some(t => dist(t, xy(a, i)) < 3); });
// the hand raises a leader in a lair
const lead = (a, l) => { l.ancient = true; raise(a, l, mulberry(7)); return l; };
// the brain asked with a list of deeds and a stream: the choice [plan, weight, why, deed] or null
function ask(a, l, list, r = () => 0, role = 'leader', season = 'spring') {
  const L = LAIRS.get(l.kind), lines = [];
  const ctx = {L, sp: SPECIES.get(L.species), role, season, r, say: t => lines.push(t)};
  // the leader's role only records the choice; the lair's lets the deed set its party out or strike where it stands
  const setOut = role === 'lair' ? (a, l, [plan, , , d], ctx) => { const line = DOES[d.id].act?.(a, l, plan, ctx); if (line) lines.push(line); } : (a, l, [plan, , , d]) => { l.chosen = {plan, deed: d.id}; };
  const o = actorStep(a, l, {list, party: role === 'lair' ? () => null : partyOf, setOut}, ctx);
  l.lines = lines;
  return o;
}
// the humans' town and a lair of the kind near it
function townAndLair(a, kind, near = 10) {
  const plain = cellOf(a, i => ['meadow', 'steppe'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.3 && i % a.w < a.w * 0.7 && ((i / a.w) | 0) > a.h * 0.3);
  const {town} = landPeople(a, 'humans', plain);
  const spot = spotNear(a, kind, town.i, near, 4);
  if (spot < 0) return {town, lair: null};
  return {town, lair: addLair(a, kind, spot)};
}

const scenes = [];
const scene_ = (id, what, fn) => scenes.push([id, what, fn]);

scene_('W01', 'главарь гоблинов: город людей в досягаемости — набег на него; дошёл — ударил, с добычей логово сильнее', () => {
  const a = world(), {town, lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return `стан не встал: ${lair?.error}`;
  lead(a, lair);
  const o = ask(a, lair, ['raid']);
  if (!o || o[3].id !== 'raid' || o[0].target !== town.id) return `предложено: ${o ? `${o[3].id} → ${o[0].target}` : 'ничего'}`;
  if (lair.why?.deed !== 'raid') return `на логове не записано решение: ${JSON.stringify(lair.why)}`;
  // the party at the town: a crushing might takes it
  const p = {kind: 'leader', owner: lair.id, plan: 'raid', target: town.id, might: 1e6, goal: town.i, i: town.i, x: town.x, y: town.y, home: lair.i, state: 'go'};
  a.parties = [p];
  const pop0 = town.pop, s0 = lair.strength, lines = [];
  BEHAVIOURS.leader.arrive(a, p, mulberry(3), t => lines.push(t));
  if (!(town.pop < pop0) || !lines.some(t => /Вёл их/.test(t)) || !(p.loot > 0)) return `удар не состоялся: ${lines.join(' | ')}`;
  BEHAVIOURS.leader.home(a, p);
  return lair.strength > s0 || `добыча не дошла до логова: ${s0} → ${lair.strength}`;
});

scene_('W02', 'главарь не идёт на город народа, который его раса терпит: гоблины и орки — одна память зеленокожих', () => {
  const a = world();
  const plain = cellOf(a, i => ['steppe', 'savanna', 'meadow'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.3 && i % a.w < a.w * 0.7);
  const {town} = landPeople(a, 'orcs', plain);
  if (!town) return 'орки не высадились';
  const spot = spotNear(a, 'goblins', town.i, 10, 4);
  if (spot < 0) return 'нет места для стана';
  const lair = lead(a, addLair(a, 'goblins', spot));
  const o = ask(a, lair, ['raid']);
  return o === null || `гоблины пошли на орков: ${o[3].id} → ${o[0].target}`;
});

scene_('W03', 'главарь подчиняет слабого соседа: данник платит; соперника — бьёт', () => {
  const a = world(), {lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return 'стан не встал';
  lead(a, lair);
  const spot = spotNear(a, 'varg', lair.i, 12, 3);
  if (spot < 0) return 'нет места для логова варгов';
  const varg = addLair(a, 'varg', spot); varg.strength = 0.2;
  const o = ask(a, lair, ['subdue', 'rival']);
  if (!o || o[3].id !== 'subdue' || o[0].target !== varg.id) return `предложено: ${o ? `${o[3].id} → ${o[0].target}` : 'ничего'}`;
  const p = {kind: 'leader', owner: lair.id, plan: 'subdue', target: varg.id, might: 1e6, goal: varg.i, i: varg.i, x: varg.x, y: varg.y, home: lair.i, state: 'go'};
  a.parties = [p];
  const lines = [];
  BEHAVIOURS.leader.arrive(a, p, mulberry(3), t => lines.push(t));
  if (varg.lord !== lair.id) return `не подчинил: ${lines.join(' | ')}`;
  // a rival kind: griffins against wyverns
  const b = world(), heights = cellOf(b, i => groundFits(b, LAIRS.get('griffin'), i));
  if (heights < 0) return 'нет круч для грифонов';
  const nest = lead(b, addLair(b, 'griffin', heights));
  const w = spotNear(b, 'wyvern', nest.i, 14, 3);
  if (w < 0) return true;   // this land has no second height near: the rival half is not tried
  const wy = addLair(b, 'wyvern', w); wy.strength = 0.3;
  const o2 = ask(b, nest, ['subdue', 'rival']);
  return (o2?.[3].id === 'rival' && o2[0].target === wy.id) || `грифоны к вивернам: ${o2 ? `${o2[3].id} → ${o2[0].target}` : 'ничего'}`;
});

scene_('W04', 'главарь сильного логова выводит выводок: новое логово — его данник', () => {
  const a = world(), {lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return 'стан не встал';
  lead(a, lair); lair.strength = 0.95;
  const o = ask(a, lair, ['expand'], mulberry(2));
  if (!o || o[3].id !== 'expand') return `предложено: ${o ? o[3].id : 'ничего'}`;
  const p = {kind: 'leader', owner: lair.id, plan: 'expand', goal: o[0].goal, i: o[0].goal, ...xy(a, o[0].goal), home: lair.i, state: 'go'};
  a.parties = [p];
  const n0 = a.lairs.length, lines = [];
  BEHAVIOURS.leader.arrive(a, p, mulberry(3), t => lines.push(t));
  const young = a.lairs[a.lairs.length - 1];
  return (a.lairs.length === n0 + 1 && young.kind === 'goblins' && young.lord === lair.id) || `выводок не осел: ${lines.join(' | ')}`;
});

scene_('W05', 'ум: отряд в пути — очередь дел не взвешивается; жребий по весам — последний при броске у единицы', () => {
  const a = world(), {lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return 'стан не встал';
  lead(a, lair); lair.strength = 0.95;
  const last = ask(a, lair, ['raid', 'expand'], () => 0.999);
  if (last?.[3].id !== 'expand') return `бросок у единицы выбрал ${last?.[3].id}`;
  const first = ask(a, lair, ['raid', 'expand'], () => 0);
  if (first?.[3].id !== 'raid') return `бросок у нуля выбрал ${first?.[3].id}`;
  a.parties = [{kind: 'leader', owner: lair.id, plan: 'raid', state: 'go'}];
  return ask(a, lair, ['raid', 'expand']) === null || 'отряд в пути, а главарь выбрал новое дело';
});

scene_('W06', 'летопись и история: в живом мире главари ходят по делам своего вида, отряд несёт id дела', () => {
  const a = world(), {town, lair} = townAndLair(a, 'goblins', 14);
  if (!lair?.id) return 'стан не встал';
  lead(a, lair); lair.strength = 0.95;
  // the seasons run: the leader's party sets out on one of its species' deeds and is carried by the parties
  let seen = null;
  for (let k = 0; k < 40 && !seen; k++) {
    a.hist.season = 0;
    stepLeaders(a, () => {});
    const p = partyOf(a, lair);
    if (p) seen = p;
    else stepParties(a, a.hist.rnd, () => {});
  }
  if (!seen) return 'за 40 вёсен главарь не вышел ни на одно дело';
  return DEEDS.has(seen.plan) && SPECIES.get('goblin').deeds.lair.includes(seen.plan) || `отряд несёт дело «${seen.plan}», которого нет в списке гоблинов`;
});

scene_('W08', 'стан без главаря: осенью, если силён, идёт набегом на город людей — отрядом или ударом на месте; весной и летом — нет', () => {
  const a = world(), {town, lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return 'стан не встал';
  lair.strength = 0.9;
  if (ask(a, lair, ['raid'], () => 0, 'lair', 'spring') !== null) return 'стан пошёл в набег весной';
  if (ask(a, lair, ['raid'], () => 0, 'lair', 'summer') !== null) return 'стан пошёл в набег летом';
  const pop0 = town.pop, o = ask(a, lair, ['raid'], () => 0, 'lair', 'autumn');
  if (!o || o[0].target !== town.id) return `осенью предложено: ${o ? o[0].target : 'ничего'}`;
  const party = (a.parties || []).find(p => p.kind === 'raid' && p.owner === lair.id);
  if (!party && !(town.pop < pop0) && !lair.lines.some(t => /отбили/.test(t)) && !a.hist.repelled) return `набег не состоялся: ${lair.lines.join(' | ')}`;
  lair.strength = 0.3;
  return ask(a, lair, ['raid'], () => 0, 'lair', 'autumn') === null || 'слабый стан пошёл в набег';
});

scene_('W09', 'логово зверей без вожака на города не ходит; с вожаком — ходит', () => {
  const a = world(), {lair} = townAndLair(a, 'varg', 12);
  if (!lair?.id) return 'логово варгов не встало';
  lair.strength = 0.9;
  if (ask(a, lair, ['raid'], () => 0, 'lair', 'autumn') !== null) return 'варги без вожака пошли на город';
  lead(a, lair);
  return ask(a, lair, ['raid']) !== null || 'вожак варгов не пошёл на город';
});

scene_('W10', 'логово без главаря: весной сильное и старое шлёт выводок, который основывает новое логово', () => {
  const a = world(), {lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return 'стан не встал';
  lair.strength = 0.95; lair.born = a.hist.year - 10;
  const m = mulberry(2); let first = true;
  const o = ask(a, lair, ['expand'], () => (first ? (first = false, 0) : m()), 'lair', 'spring');   // the year's roll falls, the spot is drawn
  if (!o) return 'выводок не предложен';
  const p = (a.parties || []).find(x => x.kind === 'brood' && x.owner === lair.id);
  if (!p) return 'выводок не вышел отрядом';
  const n0 = a.lairs.length, lines = [];
  p.i = p.goal; BEHAVIOURS.brood.arrive(a, p, mulberry(3), t => lines.push(t));
  return (a.lairs.length === n0 + 1 && a.lairs.at(-1).kind === 'goblins' && a.lairs.at(-1).lord == null) || `выводок не осел: ${lines.join(' | ')}`;
});

scene_('W11', 'дракон: спит; проснувшись летом, летит на самый богатый город в досягаемости и жжёт его; потом спит снова', () => {
  // a volcano with land for a town of men within the dragon's reach
  const a = world(), homely = i => (SPECIES.get('human').home[biomeAt(a, i)?.id] || 0) >= 0.5;
  let volc = -1, plain = -1;
  for (let i = 0; i < a.n && plain < 0; i++) {
    if (a.f.ocean[i] || !groundFits(a, LAIRS.get('dragon'), i)) continue;
    volc = i; plain = cellOf(a, j => homely(j) && dist(xy(a, j), xy(a, i)) > 6 && dist(xy(a, j), xy(a, i)) < 30);
  }
  if (plain < 0) return 'нет вулкана с равниной под город рядом';
  const lair = addLair(a, 'dragon', volc);
  if (!lair?.id) return `логово дракона не встало: ${lair?.error}`;
  const {town} = landPeople(a, 'humans', plain);
  if (!town) return 'люди не высадились';
  lair.sleep = 1;
  if (ask(a, lair, ['strike'], () => 0, 'lair', 'spring') !== null) return 'дракон вылетел весной';
  lair.sleep = 1;
  const o = ask(a, lair, ['strike'], () => 0, 'lair', 'summer');
  if (!o || o[0].target !== town.id) return `летом предложено: ${o ? o[0].target : 'ничего'} (${lair.lines.join(' | ')})`;
  const p = (a.parties || []).find(x => x.kind === 'dragon' && x.owner === lair.id);
  if (!p) return 'дракон не вылетел отрядом';
  const pop0 = town.pop, lines = [];
  p.might = 1e6; BEHAVIOURS.dragon.arrive(a, p, mulberry(3), t => lines.push(t));
  if (!(town.pop < pop0)) return `не выжег: ${lines.join(' | ')}`;
  BEHAVIOURS.dragon.home(a, p, mulberry(4));
  return lair.sleep > 1 || `не уснул: sleep ${lair.sleep}`;
});

scene_('W07', 'каталог: у каждого дела есть код; у хозяина каждого рода логов — список нравов из каталога', () => {
  for (const d of DEEDS.all()) if (!DOES[d.id]?.want) return `нет кода у «${d.id}»`;
  for (const L of LAIRS.all()) {
    const sp = SPECIES.get(L.species);
    if (!sp.deeds?.lair?.length) return `${L.id}: у ${sp.id} нет нравов логова`;
    for (const id of sp.deeds.lair) if (!DEEDS.has(id)) return `${sp.id}: дело «${id}» не в каталоге`;
  }
  return true;
});

const only = process.argv[2];
let bad = 0;
for (const [id, what, fn] of scenes) {
  if (only && id !== only) continue;
  let err;
  try { const r = fn(); err = r && typeof r !== 'string' ? null : r || 'не выполнено'; } catch (e) { err = 'исключение: ' + e.stack.split('\n').slice(0, 2).join(' '); }
  console.log(`${err ? 'FAIL' : 'ok  '} ${id} ${what}${err ? ` — ${err}` : ''}`);
  if (err) bad++;
}
if (bad) process.exit(1);
