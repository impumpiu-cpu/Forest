// The greenskins (docs/WORLD.md «Асимметрия народов»): one people of many kinds — orcs, goblins, gnolls, trolls, ogres;
// the cult of war, slaves of every kind, the open land and the loose camps, the kinds' own buildings, the fighting pits,
// the riders, the beast-driver, the champion. `npm run greenskins`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {damage} from '../src/agents/combat.js';
import {speedOf} from '../src/agents/movement.js';
import {mountUp} from '../src/agents/mount.js';
import {putUp, eligible} from '../src/settlement/buildings.js';
import {recomputeMods} from '../src/settlement/mods.js';
import {penSpace} from '../src/settlement/herd.js';
import {raise, breakToWar} from '../src/settlement/warbeasts.js';
import {spawnGroup} from '../src/settlement/migration.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {townKin, leadKin, canBuild, townFx, roughShare, might} from '../src/atlas/towns.js';
import {stepWarBeasts} from '../src/atlas/beasts.js';
import {warOn} from '../src/atlas/deeds/warOn.js';
import {makePeace} from '../src/atlas/deeds/makePeace.js';
import {captives} from '../src/atlas/deeds/captives.js';
import {muster} from '../src/atlas/diplomacy.js';
import {tradeUp} from '../src/atlas/peoples.js';
import {goodPrice} from '../src/data/townBuildings.js';
import {relationsOf} from '../src/atlas/deeds/realm.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {SPECIES} from '../src/data/species.js';
import {RAID_BANDS} from '../src/data/raids.js';
import {roleKit, COMBAT_ROLES} from '../src/data/roles.js';
import {ITEMS} from '../src/data/items.js';
import {MATERIALS} from '../src/data/balance/materials.js';
import {lawOf} from '../src/data/slavery.js';
import {mulberry} from '../src/core/rng.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const game = (seed = 'greenskins') => { const w = newGame({...DEFAULT_CFG, seed, size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'}); w.agents = []; return w; };

// the people: one name, all the kinds of one line; slaves are lawful
{
  const P = WORLD_PEOPLES.get('orcs'), kinds = Object.keys(P.kin);
  check('народ «зеленокожие»: орки, гоблины, гноллы, тролли, огры — одна линия отношений; рабство законно',
    P.label === 'зеленокожие' && ['orc', 'goblin', 'gnoll', 'troll', 'ogre'].every(k => kinds.includes(k) && SPECIES.get(k).rel === 'greenskin') && lawOf('orcs').law === 'legal', kinds.join(', '));
}

// the world
const a = generateAtlas({seed: '5', size: 'small', land: 1, plates: 1, hemisphere: 'north'});
const gtowns = a.towns.filter(t => t.alive && t.people === 'orcs');
{
  const t = gtowns[0], k = townKin(a, t), sum = Object.values(k).reduce((s, v) => s + v, 0);
  const leads = new Set(gtowns.map(x => leadKin(a, x)));
  check('в городе зеленокожих живут все виды; главный — по биому', Math.abs(sum - 1) < 0.01 && Object.keys(k).length === 5 && leads.size >= 1, `${t.name}: ${JSON.stringify(k)}; главные: ${[...leads].join(', ')}`);
  const den = TOWN_BUILDINGS.get('hyenadens'), keep = t.kin, tier = t.tier;
  // (on a town that has none yet: one that has built its dens to the full may build no more, gnolls or not)
  const built = t.built; t.built = built.filter(x => x !== 'hyenadens');
  t.kin = {...keep, gnoll: 0}; const no = canBuild(a, t, den); t.kin = {...keep, gnoll: 0.3}; const yes = canBuild(a, t, den); t.kin = keep; t.tier = tier; t.built = built;
  check('свои постройки видов: гиеньи норы — только где живут гноллы', !no && yes, `без гноллов ${no}, с гноллами ${yes}`);
  const hut = {...t, built: ['yurts'], realm: t.realm}, fx = townFx(hut);
  check('не любят тесноты: шатры на 150, а не 200; грубое жильё коррупции не растит', Math.abs(fx.housing * 100 - 150) < 1e-6 && roughShare(hut) === 0, `жильё ${fx.housing * 100}, доля грубого ${roughShare(hut)}`);
}
{
  // a realm of greenskins with a neighbour at peace (a war on is ended first: the scene needs a peace to break)
  const realm = a.realms.filter(r => r.people === 'orcs').find(r => relationsOf(a, r).some(x => x.r.border)) || a.realms.find(r => r.people === 'orcs');
  const rels = relationsOf(a, realm).filter(x => x.r.border); for (const x of rels) x.r.war = null;
  if (rels.length) {
    const x = rels[0]; x.r.att = 3; x.r.peaceAt = -99;
    const plan = warOn.want(a, realm, {r: () => 0})?.find(o => o[0].cult)?.[0];
    const line = plan ? warOn.act(a, realm, plan, {r: () => 0}) : '';
    const war = x.r.war, until = war?.cult?.until, y0 = a.hist.year;
    a.hist.year = until; const peace = makePeace.want(a, realm)?.[0]?.[0], told = peace ? makePeace.act(a, realm, peace) : '';
    const again = warOn.want(a, realm, {r: () => 0})?.some(o => o[0].kk === x.kk && o[0].cult);
    a.hist.year = y0;
    check('культ войны: драка с соседом без всякой вражды, короткая, мир — без обид; сразу снова не начинают',
      !!plan && !!war?.cult && until - y0 >= 2 && until - y0 <= 5 && /без обид/.test(told) && x.r.att === 3 && !x.r.war && !again, `${line} … ${told}`);
  } else check('культ войны: у державы зеленокожих есть сосед', false);
}
{
  const realm = a.realms.find(r => r.people === 'orcs');
  const plans = captives.want(a, realm, {role: 'realm', season: 'autumn', r: () => 0}) || [];
  check('набеги за рабами — на любого, своих и дикие племена тоже', plans.length > 0, plans.map(p => p[0].lair != null ? 'логово' : 'город').join(', '));
  const t = gtowns.find(x => a.fauna) || gtowns[0]; t.built = t.built.filter(x => x !== 'fightpits'); t.warBeasts = null; t.built.push('fightpits'); const m0 = might(t, townFx(t));   // (pits of its own, fresh: its history may have filled them)
  let got = []; for (let k = 0; k < 4; k++) { const s = stepWarBeasts(a, t); if (s) got.push(s); }
  check('бойцовские ямы: ловят зверей и чудовищ своей земли, никогда разумных; сила города растёт',
    got.length > 0 && got.every(id => SPECIES.get(id).mind !== 'sentient' && SPECIES.get(id).kind !== 'race') && might(t, townFx(t)) > m0, got.join(', '));
}

// the riders: one fighter of two bodies
{
  const w = game(), r = createAgent(w, 'orc', 'raiders', 20, 20), foe = createAgent(w, 'human', 'colony', 21, 20);
  const foot = speedOf(w, r); mountUp(r, 'varg'); const rides = speedOf(w, r);
  r.mods.dodge = 0;
  let onMount = 0; for (let k = 0; k < 40 && r.mount; k++) { const hp = r.hp; damage(w, foe, r, 0.3); if (r.hp === hp) onMount++; }
  const thrown = !r.mount && r.stunned?.until > w.tick;
  const r2 = createAgent(w, 'orc', 'raiders', 25, 25); mountUp(r2, 'varg'); r2.hp = 0.01; r2.mods.dodge = 0;
  for (let k = 0; k < 60 && !r2.dead; k++) damage(w, foe, r2, 0.02);
  const loose = w.agents.find(x => x.species === 'varg' && !x.dead);
  check('наездник на варге: скачет с шагом варга, удары делят оба тела; пал варг — всадник пеший и оглушён; пал всадник — варг бьётся сам',
    rides > foot && onMount > 0 && thrown && !!loose && loose.warBeast && loose.faction === 'raiders', `шаг ${foot.toFixed(3)} → ${rides.toFixed(3)}, ударов по варгу ${onMount}`);
}

// the beast-driver: no iron, its blows bite beasts harder, it brings war beasts
{
  const rng = mulberry(3), metal = []; for (let k = 0; k < 200; k++) for (const id of roleKit('orc', 'beastmaster', rng, 40)) { const d = ITEMS.get(id); if (d && MATERIALS[d.material]?.class.includes('metal')) metal.push(id); }
  const hit = (role, sp) => { const w = game('bm'), a = createAgent(w, 'orc', 'raiders', 10, 10), t = createAgent(w, sp, 'wild', 11, 10); a.fightRole = role; t.mods.dodge = 0; let s = 0; for (let k = 0; k < 100; k++) { t.hp = 1e9; const d = damage(w, a, t, 1, {type: 'blunt'}); if (typeof d === 'number') s += d; } return s; };
  const ratio = hit('beastmaster', 'wolf') / hit('cleaver', 'wolf');
  const band = Array.from({length: 20}, (_, k) => RAID_BANDS.get('orcs').members(null, mulberry(k), 3000, 30)).flat(), led = band.filter(m => !SPECIES.get(m.species).inventory).length;
  check('загонщик: железа не носит, зверей бьёт на 30% сильнее, водит боевых зверей; в ватаге зеленокожих — наездники',
    !metal.length && Math.abs(ratio - 1.3) < 0.01 && COMBAT_ROLES.get('beastmaster').lead && led > 0 && band.some(m => m.role && COMBAT_ROLES.get(m.role).mount),
    `железо ${metal.length}, по волку ×${ratio.toFixed(2)}, зверей ${led}`);
}
// the champion: one a band
{
  const w = game('champ'); w.camp = w.camp || {x: 40, y: 40};
  const g = spawnGroup(w, 'raiders', 1500, {band: 'orcs'});
  const ch = g.filter(x => x.marks?.includes('champion'));
  check('в отряде зеленокожих ровно один чемпион, крепче прочих', ch.length === 1 && maxHp(ch[0]) >= Math.max(...g.filter(x => x !== ch[0] && x.species === ch[0].species).map(maxHp), 0), ch.map(x => x.name).join(', '));
}

// the colony: pens twice as big, the dens and the pits
{
  const w = game(), cx = Math.floor(w.w / 2), cy = Math.floor(w.h / 2);
  for (let k = 0; k < 4; k++) createAgent(w, 'orc', 'colony', cx + k, cy);
  putUp(w, 'pen'); recomputeMods(w);
  const h = game('h'); for (let k = 0; k < 4; k++) createAgent(h, 'human', 'colony', cx + k, cy); putUp(h, 'pen');
  check('загон зеленокожих вмещает вдвое больше', penSpace(w) === 2 * penSpace(h), `${penSpace(w)} против ${penSpace(h)}`);
  const warg = eligible(w, 'wargden'), spider = eligible(w, 'spiderden');
  putUp(w, 'wargden'); putUp(w, 'fightpits'); recomputeMods(w); w.stock.meat = 50;
  const v = raise(w, 'wargden');
  const wolf = createAgent(w, 'wolf', 'wild', cx + 2, cy + 2), pit = w.buildings.find(b => b.key === 'fightpits'); wolf.x = pit.x; wolf.y = pit.y;
  const by = w.agents.find(x => x.species === 'orc'); wolf.hp = 0;
  const broken = breakToWar(w, by, wolf);
  check('логово варгов — у орков (паучье — только с гоблинами); варг встаёт на стражу; побитого волка у ям ломают в боевого',
    warg && !spider && v?.species === 'varg' && v.faction === 'allies' && broken && wolf.faction === 'allies' && wolf.hp > 0, `варг ${v?.faction}, волк ${wolf.faction}`);
}

// the horde: a third of its people to war, all its trained beasts; it breeds fast, wants little
{
  const P = WORLD_PEOPLES.get('orcs'), H = WORLD_PEOPLES.get('humans');
  const t = gtowns.find(x => x.pop > 100) || gtowns[0], R = a.realms.find(r => r.id === t.realm), tg = a.towns.find(x => x.alive && x.realm !== t.realm);
  t.stock = {...(t.stock || {}), beasts: 20}; t.warBeasts = {list: {varg: 2}, men: 1}; const pop0 = t.pop, said = [];
  const before = new Set((a.parties || []).map(p => p.id));   // (the town may have an army out from its history: the new one is checked)
  muster(a, t, tg, null, () => 0.5, s => said.push(s));
  const army = (a.parties || []).find(p => p.kind === 'army' && p.from === t.id && !before.has(p.id));
  check('орда: в поход идёт треть города и боевые звери, скот остаётся дома; растёт почти вдвое быстрее, благ хочет вдвое меньше',
    !!army && Math.abs(army.men - Math.round(pop0 / 3)) <= 1 && army.warBeasts?.varg === 2 && !t.warBeasts.list.varg && t.stock.beasts === 20 && P.breed > (H.breed ?? 1) && P.needs < 1 && !H.levy, said.join(' '));
}


// nomads (data/peoples.js tradeUp, wants; atlas/peoples.js tradeUp): the greenskins sell their finery for arms at once, at
// 0.8 of its worth; they want arms and no luxury; another people keeps what it has
{
  const o = {people: 'orcs', stock: {lux: 10, gems: 2, silver: 1, wood: 5}}, h = {people: 'humans', stock: {lux: 10}};
  const worth = 10 * goodPrice('lux') + 2 * goodPrice('gems') + 1 * goodPrice('silver'), sold = tradeUp(o), kept = tradeUp(h);
  const wantsArms = WORLD_PEOPLES.get('orcs').wants?.basic?.arms > 0 && WORLD_PEOPLES.get('orcs').wants?.comfort?.lux === 0;
  check('кочевники: роскошь, самоцветы и серебро сразу меняют на оружие по 0,8 стоимости; оружие — их нужда, роскоши не хотят; люди своё держат',
    Math.abs(sold - worth) < 1e-9 && !o.stock.lux && !o.stock.gems && !o.stock.silver && o.stock.wood === 5 && Math.abs(o.stock.arms - worth * 0.8 / goodPrice('arms')) < 1e-9 && kept === 0 && h.stock.lux === 10 && wantsArms,
    `продано на ${worth}, оружия ${o.stock.arms?.toFixed(2)}`);
}

if (fail.length) { console.log(`\nНе прошло: ${fail.length}`); process.exit(1); }
