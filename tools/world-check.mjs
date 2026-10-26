// The range of the world map's deeds (docs/WORLD.md «Нравы»): scenes on a land of «Заселение мира» (atlas/settle.js) where
// the hand puts a town and a lair, raises a leader and asks the actor's brain (atlas/actor.js) what it would do — the way
// tools/behaviour-check.mjs tries one behaviour of a creature at a time. A scene asserts the choice and its outcome, not
// the way to it. Usage: node tools/world-check.mjs [scene id]
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';
import {startFree, landPeople, addLair, setCalamity, runYears, endRun} from '../src/atlas/settle.js';
import {atlasDone} from '../src/atlas/generate.js';
import {raise, partyOf, stepLeaders} from '../src/atlas/leaders.js';
import {actorStep} from '../src/atlas/actor.js';
import {BEHAVIOURS, stepParties} from '../src/atlas/parties.js';
import {DOES} from '../src/atlas/deeds/index.js';
import {meet, stepDiplomacy} from '../src/atlas/diplomacy.js';
import {realmSpecies} from '../src/atlas/court.js';
import {stepLairs} from '../src/atlas/lairs.js';
import {freeLairCaptives} from '../src/campaign/fight.js';
import {CAPTIVE_RAID} from '../src/data/lairs.js';
const stepLairsOnce = (a, season) => stepLairs(a, mulberry(9), season);
import {DEEDS} from '../src/data/deeds.js';
import {LAIRS} from '../src/data/lairs.js';
import {SPECIES} from '../src/data/species.js';
import {biomeAt} from '../src/atlas/biomes.js';
import {groundFits} from '../src/atlas/lairs.js';
import {scaleOf} from '../src/atlas/tectonics.js';
import {mulberry} from '../src/core/rng.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {DIPLOMACY} from '../src/data/diplomacy.js';
import {townFx} from '../src/atlas/towns.js';
const townFxDefence = t => townFx(t).defence > 0;

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

// two peoples landed within the front of each other, their realms met with the attitude given → {A, B, rel}
function neighbours(a, p1, p2, att) {
  const homely = (pid, i) => (SPECIES.get(WORLD_PEOPLES.get(pid).race).home[biomeAt(a, i)?.id] || 0) >= 0.5;
  const front = DIPLOMACY.front * scaleOf(a) - 2;
  // a home cell of the first with a home cell of the second within the front
  let c1 = -1, c2 = -1;
  for (let i = 0; i < a.n && c2 < 0; i += 3) {
    if (a.f.ocean[i] || a.f.lake[i] >= 0 || !homely(p1, i) || i % a.w < 4 || i % a.w > a.w - 4) continue;
    c1 = i; c2 = cellOf(a, j => dist(xy(a, j), xy(a, i)) > 7 && dist(xy(a, j), xy(a, i)) < front && homely(p2, j));
  }
  if (c2 < 0) return null;
  const t1 = landPeople(a, p1, c1).town;
  if (!t1) return null;
  const t2 = landPeople(a, p2, c2).town;
  if (!t2) return null;
  const A = a.realms.find(r => r.id === t1.realm), B = a.realms.find(r => r.id === t2.realm);
  const rel = meet(a, A.id, B.id, a.hist.year); rel.att = att;
  stepDiplomacy(a, mulberry(1), () => {}, () => 0);   // the body of the relation: the front and the border
  rel.att = att;
  return {A, B, rel, t1, t2};
}
// the court asked: the deeds of the realm's people unless given, a stream, a season
function court(a, realm, list = null, r = () => 0, season = 'spring') {
  const lines = [];
  const o = actorStep(a, realm, {list: list || realmSpecies(a, realm).deeds.realm, party: () => null, setOut(a, realm, [plan, , , d], ctx) { const line = DOES[d.id].act?.(a, realm, plan, ctx); if (line) lines.push(line); }},
    {sp: realmSpecies(a, realm), realm, role: 'realm', season, r, say: t => lines.push(t)});
  realm.lines = lines;
  return o;
}

scene_('W12', 'державы: при общей границе и вражде люди объявляют войну гномам; эльфы войну не начинают, но отвечают войском', () => {
  const a = world(), n = neighbours(a, 'humans', 'dwarves', -4);
  if (!n) return 'соседи не высадились';
  if (!n.rel.border) return 'граница не легла';
  const o = court(a, n.A);
  if (o?.[3].id !== 'warOn' || !n.rel.war) return `люди: ${o ? o[3].id : 'ничего'}; война ${!!n.rel.war}`;
  if (n.rel.war.turn !== n.A.id) return 'первый ход не за объявившим';
  // the elves beside the dwarves: no war of their own, but the sword answered
  const b = world(), m = neighbours(b, 'elves', 'dwarves', -4);
  if (!m) return true;   // (this land gave the elves no forest by the dwarves: the half is not tried)
  if (m.rel.border && court(b, m.A)?.[3].id === 'warOn') return 'эльфы объявили войну';
  m.rel.war = {since: b.hist.year, battles: 0, razed: 0, turn: m.A.id, mustered: null};
  m.t1.pop = 400;
  const o2 = court(b, m.A);
  return (o2?.[3].id === 'march') || `эльфы в войне: ${o2 ? o2[3].id : 'ничего'} (${m.rel.front ? 'фронт есть' : 'фронта нет'})`;
});

scene_('W13', 'держава в войне: ход её — войско из города у фронта идёт на город врага; ход переходит; второго войска в тот же год нет', () => {
  const a = world(), n = neighbours(a, 'humans', 'dwarves', -4);
  if (!n?.rel.border) return 'соседи не легли границей';
  n.rel.war = {since: a.hist.year, battles: 0, razed: 0, turn: n.A.id, mustered: null}; n.t1.pop = 400;
  const o = court(a, n.A, ['march']);
  if (o?.[3].id !== 'march') return `предложено: ${o ? o[3].id : 'ничего'} (${n.rel.front ? 'фронт есть' : 'фронта нет'})`;
  const army = (a.parties || []).find(p => p.kind === 'army' && p.owner === n.A.id);
  if (!army || army.target !== n.t2.id) return `войско не вышло: ${n.A.lines.join(' | ')}`;
  if (n.rel.war.turn !== n.B.id) return 'ход не перешёл';
  if (court(a, n.A, ['march']) !== null) return 'второе войско в тот же год';
  return court(a, n.B, ['march']) === null || 'гномы собрали войско, пока людское в пути';
});

scene_('W14', 'усталость от войны: мир — красная полоса, он прежде набега и войска', () => {
  const a = world(), n = neighbours(a, 'orcs', 'humans', -1.5);
  if (!n?.rel.border) return 'соседи не легли границей';
  n.rel.war = {since: a.hist.year - 2, battles: 0, razed: 0, turn: n.A.id, mustered: null}; n.t1.pop = 400; n.t1.built.push('palisade');
  const o = court(a, n.A);
  return (o?.[3].id === 'makePeace' && o[3].band === 'red' && !n.rel.war) || `предложено: ${o ? `${o[3].id} (${o[3].band})` : 'ничего'}`;
});

scene_('W15', 'набег державы: орки с воинами грабят нелюбимый город рядом (не больше raidsPerYear в год); люди набегами не ходят', () => {
  const a = world(), n = neighbours(a, 'orcs', 'humans', -3);
  if (!n) return 'соседи не высадились';
  n.t1.pop = 300; n.t1.built.push('palisade');
  if (!townFxDefence(n.t1)) return 'у орков нет воинов и с частоколом';
  const pop0 = n.t2.pop, o = court(a, n.A, ['raidTown']);
  if (o?.[3].id !== 'raidTown') return `предложено: ${o ? o[3].id : 'ничего'}`;
  if (!(n.t2.pop < pop0) && !n.A.lines.some(t => /отбили набег/.test(t))) return `набег не состоялся: ${n.A.lines.join(' | ')}`;
  for (let k = 0; k < 6; k++) court(a, n.A, ['raidTown']);
  if (n.A.raids.n > DIPLOMACY.raidsPerYear) return `набегов за год ${n.A.raids.n}`;
  if (realmSpecies(a, n.B).deeds.realm.includes('raidTown')) return 'люди умеют ходить набегом';
  return true;
});

scene_('W16', 'держава выжигает логово, чьи владения достают до её города', () => {
  const a = world(), {town, lair} = townAndLair(a, 'varg', 6);
  if (!lair?.id) return 'логово варгов не встало';
  lair.strength = 0.2; town.pop = 400; town.built.push('palisade');
  const realm = a.realms.find(r => r.id === town.realm);
  const o = court(a, realm, ['clearLair']);
  if (o?.[3].id !== 'clearLair') return `предложено: ${o ? o[3].id : 'ничего'}`;
  return !lair.alive || `логово цело: ${realm.lines.join(' | ')}`;
});

scene_('W16s', 'скрытое логово глуши: держава его не выжигает, пока следопыты не найдут; найденное — выжигает', () => {
  const a = world(), {town, lair} = townAndLair(a, 'varg', 6);
  if (!lair?.id) return 'логово варгов не встало';
  lair.strength = 0.2; lair.hidden = true; town.pop = 400; town.built.push('palisade');
  const realm = a.realms.find(r => r.id === town.realm);
  const o1 = court(a, realm, ['clearLair']);
  if (o1?.[3].id === 'clearLair' || !lair.alive) return 'скрытое логово выжгли';
  const o2 = court(a, realm, ['scout']);
  if (o2?.[3].id !== 'scout' || lair.hidden) return `разведка: ${o2 ? o2[3].id : 'ничего'}, скрыто ${lair.hidden}`;
  if (!realm.lines.some(t => /выследили/.test(t))) return `нет строки: ${realm.lines.join(' | ')}`;
  const o3 = court(a, realm, ['clearLair']);
  return (o3?.[3].id === 'clearLair' && !lair.alive) || `найденное цело: ${realm.lines.join(' | ')}`;
});

scene_('W17', 'стан гоблинов осенью идёт за пленными: город теряет жителей в полон, не в могилы; пленные живут при логове и тают', () => {
  const a = world(), {town, lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return 'стан не встал';
  lair.strength = 1; lair.boss = 1; town.pop = 60;   // a camp led by a calamity's boss: strong enough to walk as a party
  const pop0 = town.pop, o = ask(a, lair, ['captives'], () => 0, 'lair', 'autumn');
  if (!o || o[0].target !== town.id) return `предложено: ${o ? o[0].target : 'ничего'}`;
  let party = (a.parties || []).find(p => p.kind === 'raid' && p.owner === lair.id && p.plan === 'captives');
  if (party) { party.might = 1e6; BEHAVIOURS.raid.arrive(a, party, mulberry(3), () => {}); }
  const n = lair.captives?.[town.people] || 0;
  if (!(n > 0) || !(town.pop < pop0) || Math.round(pop0 - town.pop) !== n) return `полон не взят: ${n}, город ${pop0} → ${town.pop}; ${lair.lines.join(' | ')}`;
  // the years: the captives waste
  lair.captives[town.people] = 40;
  a.hist.season = 0; stepLairsOnce(a, 'spring');
  return lair.captives[town.people] < 40 || 'пленные не тают';
});

scene_('W18', 'держава орков с воинами уводит пленных из нелюбимого города рядом: город орков растёт; у людей такого дела нет', () => {
  const a = world(), n = neighbours(a, 'orcs', 'humans', -3);
  if (!n) return 'соседи не высадились';
  n.t1.pop = 300; n.t1.built.push('palisade'); n.t2.pop = 300;
  const p1 = n.t1.pop, p2 = n.t2.pop, o = court(a, n.A, ['captives']);
  if (o?.[3].id !== 'captives') return `предложено: ${o ? o[3].id : 'ничего'}`;
  const took = n.A.captives?.humans || 0;
  if (took > 0 && !(n.t1.pop > p1 && n.t2.pop < p2)) return `полон взят, а города не изменились: ${p1} → ${n.t1.pop}, ${p2} → ${n.t2.pop}`;
  if (!took && !n.A.lines.some(t => /отбили/.test(t))) return `ни полона, ни отпора: ${n.A.lines.join(' | ')}`;
  return !realmSpecies(a, n.B).deeds.realm.includes('captives') || 'люди ходят за пленными';
});

scene_('W19', 'караван, разбивший людей логова в его землях, освобождает его пленных; они идут с караваном', () => {
  const a = world(), {lair} = townAndLair(a, 'goblins');
  if (!lair?.id) return 'стан не встал';
  lair.captives = {humans: 3};
  const K = {members: [{id: 1, name: 'Вожак', alive: true, role: 'leader', core: true}], day: 5, nextMember: 1, cargo: {}, stats: {}};
  const lines = [];
  const got = freeLairCaptives(a, K, {kind: 'tribe', lair: lair.id}, () => 0, t => lines.push(t));
  if (got.length !== CAPTIVE_RAID.freed.max) return `освобождено ${got.length}: ${lines.join(' | ')}`;
  if ((lair.captives.humans || 0) !== 3 - got.length) return `в логове осталось ${lair.captives.humans}`;
  return K.members.filter(m => m.role === 'freed' && m.race === 'human').length === got.length || 'освобождённые не в караване';
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

// an alliance against a calamity (atlas/alliance.js): two peoples landed, a calamity set between them by hand; no heroes
// to take the boss first. The armies' might is set by the scene, so the storm goes one way or the other whatever the world
function allianceWorld() {
  const a = world();
  const forest = cellOf(a, i => ['forest', 'taiga'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.3);
  const plain = cellOf(a, i => ['meadow', 'steppe', 'forest'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.55);
  const e = landPeople(a, 'elves', forest), h = landPeople(a, 'humans', plain);
  if (e.error || h.error) return {error: 'народы не высадились'};
  const mid = cellOf(a, i => { const p = xy(a, i); return Math.abs(p.x - (e.town.x + h.town.x) / 2) <= 3 && Math.abs(p.y - (e.town.y + h.town.y) / 2) <= 3 && !a.towns.some(t => dist(t, p) < 6); });
  const c = setCalamity(a, {kind: 'necromancer', at: mid, years: 1});
  if (c.error) return {error: c.error};
  const run = y => { runYears(a, y); while (!atlasDone(a)) runNextStage(a); endRun(a); };
  const cal = () => a.calamities.find(x => x.id === c.id), A = () => (a.alliances || []).find(x => x.calamity === c.id);
  for (let y = 0; y < 6 && cal().phase !== 'rise'; y++) run(1);
  if (cal().phase !== 'rise') return {error: `бедствие не поднялось: ${cal().phase}`};
  cal().heroesAt = 1e9; cal().allyAfter = 0;
  // until the alliance marches; then the scene sets its armies' might
  for (let q = 0; q < 48 && !A()?.armies.length; q++) run(0.25);   // a season at a time: the armies are caught on their way
  if (!A()?.armies.length) return {error: `союз не выступил: ${A() ? `походов ${A().tries}` : 'союза нет'}`};
  const armies = () => A().armies.map(id => a.parties.find(p => p.id === id)).filter(Boolean);
  return {a, run, cal, A, armies};
}
scene_('W20', 'союз против бедствия: державы рядом заключают союз, шлют войска, сильные войска берут логово — босс пал от союза; после лет мира союз распадается', () => {
  const S = allianceWorld(); if (S.error) return S.error;
  for (const p of S.armies()) p.might = 1e6;
  for (let y = 0; y < 6 && S.cal().phase === 'rise'; y++) S.run(1);
  if (S.cal().fell?.by !== 'alliance') return `босс пал не от союза: ${S.cal().phase}, ${S.cal().fell?.by}; ${S.a.chronicle.filter(l => /оюз|войск/i.test(l.text)).slice(-6).map(l => l.year + ' ' + l.text).join(' | ')}; ${S.armies().map(p => p.state + p.might).join(',')}`;
  for (let y = 0; y < 20 && !S.A().broken; y++) S.run(1);
  return S.A().broken || `союз не распался: мир до ${S.A().peaceUntil}, год ${S.a.hist.year}`;
});
scene_('W21', 'союз против бедствия: слабые войска разбиты у логова — босс устоял, союз пробует снова позже', () => {
  const S = allianceWorld(); if (S.error) return S.error;
  for (const p of S.armies()) p.might = 0;
  const tries = S.A().tries;
  for (let y = 0; y < 6 && S.A().nextTry == null; y++) S.run(1);
  if (S.cal().phase !== 'rise' || S.A().nextTry == null) return `штурм не отбит: ${S.cal().phase}, следующая попытка ${S.A().nextTry}`;
  for (let y = 0; y < 12 && S.A().tries === tries; y++) S.run(1);
  return S.A().tries > tries || `новой попытки не было: походов ${S.A().tries}`;
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
