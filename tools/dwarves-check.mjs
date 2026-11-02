// The dwarves (docs/WORLD.md «Асимметрия народов»): golems and the tag «Механизм», the hammer-smith, the forge-master and
// the berserker, the dwarven war party, the colony under the rock (home, mushroom cave, stone wall, magma forge, golem
// forge), the caravan that buys a golem. `npm run dwarves`.
import {newGame} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {damage} from '../src/agents/combat.js';
import {heatHarm} from '../src/agents/body.js';
import {mendAtForge, makeGolem} from '../src/agents/golem.js';
import {golem as golemWay} from '../src/agents/behaviours/golem.js';
import {stepPotionEffects} from '../src/agents/potions.js';
import {kitRole} from '../src/agents/tactics.js';
import {newItem, dress} from '../src/agents/equipment.js';
import {eligible, putUp} from '../src/settlement/buildings.js';
import {recomputeMods} from '../src/settlement/mods.js';
import {forgeGolem} from '../src/settlement/golems.js';
import {workRate} from '../src/agents/jobRunners.js';
import {SPECIES} from '../src/data/species.js';
import {CONSTRUCTS, GOLEM_METALS, golemOf, GOLEM_LOCAL} from '../src/data/constructs.js';
import {hasTag} from '../src/data/tags.js';
import {COMBAT_ROLES, roleKit} from '../src/data/roles.js';
import {RAID_BANDS} from '../src/data/raids.js';
import {REALM_BANDS, WAR_ONLY_BANDS} from '../src/data/seam.js';
import {T} from '../src/data/terrain.js';
import {BEASTS} from '../src/data/transport.js';
import {offers, townGolem} from '../src/campaign/town.js';
import {caravanMight} from '../src/campaign/march.js';
import {mulberry} from '../src/core/rng.js';
import {lawOf} from '../src/data/slavery.js';
import {bindCaptive} from '../src/settlement/captives.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {liberate} from '../src/atlas/deeds/liberate.js';
import {relation} from '../src/atlas/diplomacy.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };
const game = (seed = 'dwarves') => { const w = newGame({...DEFAULT_CFG, seed, size: 'small', colonists: 0, wildlife: 'none', predators: 'none', raids: 'off'}); w.agents = []; return w; };

// the golems: four metals, the better the harder; tag «Механизм»
{
  const G = GOLEM_METALS.map(m => SPECIES.get(golemOf(m)));
  const hp = G.map(s => s.hp), cut = G.map(s => s.resist.slash);
  check('големы: бронзовый, железный, стальной, мифриловый — здоровье 3/4/5/6, броня растёт, мифриловый быстрее; все — «Механизм»',
    CONSTRUCTS.length === 4 && hp.join() === '3,4,5,6' && cut.every((v, k) => !k || v < cut[k - 1]) && G[3].speed > G[2].speed && G.every(s => hasTag(s, 'mechanism') && s.mind === 'mindless' && !s.needs.length),
    `здоровье ${hp.join('/')}, рубящий ×${cut.join('/')}, шаг ${G.map(s => s.speed).join('/')}`);
}

// the tag «Механизм»: no bleeding, stunning, poison; it never mends by itself, only by a forge
{
  const w = game(), cx = Math.floor(w.w / 2), cy = Math.floor(w.h / 2);
  const g = makeGolem(w, 'iron', cx, cy), man = createAgent(w, 'human', 'raiders', cx + 1, cy);
  let bled = 0, stunned = 0;
  for (let k = 0; k < 60; k++) { g.hp = maxHp(g); damage(w, man, g, 1, {q: {bleed: 1, stun: 1}}); if (g.bleeding) bled++; if (g.stunned) stunned++; }
  const human = createAgent(w, 'human', 'colony', cx - 1, cy);
  let hb = 0; for (let k = 0; k < 60; k++) { human.hp = maxHp(human); damage(w, man, human, 0.01, {q: {bleed: 1, stun: 1}}); if (human.bleeding) hb++; }
  check('механизм не кровит и не оглушается (а человек — да)', !bled && !stunned && hb > 0, `голем: кровь ${bled}, оглушён ${stunned}; человек: кровь ${hb}`);
  g.hp = maxHp(g) / 2; const hp0 = g.hp;
  for (let k = 0; k < 300; k++) { mendAtForge(w, g); golemWay.always(w, g); }
  const noForge = g.hp;
  const f = putUp(w, 'forge'); g.x = f.x + 1; g.y = f.y + 1; w.tick++;
  for (let k = 0; k < 300; k++) mendAtForge(w, g);
  check('голем сам не чинится; у кузни — чинится', noForge === hp0 && g.hp > hp0, `${hp0.toFixed(2)} → без кузни ${noForge.toFixed(2)} → у кузни ${g.hp.toFixed(2)}`);
  w.tick++; man.x = g.x + 1; man.y = g.y; const want = golemWay.want(w, g)?.[0]?.[0];
  check('голем на посту бьёт врага рядом', want?.id === 'fight', want?.id || '—');
}

// the hammer-smith strikes blunt blows a third harder; the forge-master takes no harm of fire; the berserker rages once a wound
{
  const hit = role => {
    const w = game('smith'), a = createAgent(w, 'dwarf', 'raiders', 10, 10), t = createAgent(w, 'human', 'colony', 11, 10);
    a.fightRole = role; t.mods.dodge = 0;
    let s = 0; for (let k = 0; k < 200; k++) { t.hp = 1e9; const d = damage(w, a, t, 1, {type: 'blunt'}); if (typeof d === 'number') s += d; }
    return s;
  };
  const smith = hit('smith'), plain = hit('cleaver');
  check('мастер-кузнец бьёт дробящим на 30% сильнее', Math.abs(smith / plain - 1.3) < 0.01, `${(smith / plain).toFixed(3)}`);
  const w = game(), fm = createAgent(w, 'dwarf', 'raiders', 10, 10); fm.fightRole = 'forgemaster';
  const sp = SPECIES.get('dwarf'), hp0 = fm.hp, burnt = heatHarm(fm, sp, 900, 'raider');
  check('мастер горна: огонь его не берёт; в руках — горновой огонь, что поджигает', !burnt && fm.hp === hp0 && roleKit('dwarf', 'forgemaster', mulberry(1), 10).includes('spitfire'));
  const b = createAgent(w, 'dwarf', 'raiders', 12, 10), foe = createAgent(w, 'human', 'colony', 13, 10); b.fightRole = 'berserker'; b.mods.dodge = 0;
  const speed0 = b.mods.speed;
  let k = 0; while (!(b.effects || []).some(e => e.id === 'frenzy') && k++ < 50) damage(w, foe, b, 0.05);
  const raging = b.mods.speed, first = b.effects?.find(e => e.id === 'frenzy')?.until;
  for (let j = 0; j < 20; j++) damage(w, foe, b, 0.01);
  const again = (b.effects || []).filter(e => e.id === 'frenzy').length === 1 && b.effects.find(e => e.id === 'frenzy').until === first;
  w.tick = first; stepPotionEffects(w, b);
  const spent = (b.effects || []).some(e => e.id === 'spent') && b.mods.speed < speed0;
  for (let j = 0; j < 20; j++) damage(w, foe, b, 0.01);
  const noRage = !(b.effects || []).some(e => e.id === 'frenzy');
  w.tick = b.effects.find(e => e.id === 'spent').until; stepPotionEffects(w, b);
  b.hp = maxHp(b); let n = 0; while (!(b.effects || []).some(e => e.id === 'frenzy') && n++ < 50) damage(w, foe, b, 0.05);
  check('берсерк: рана — бешенство (быстрее), за ним усталость (медленнее); не дважды подряд — снова только после усталости и новой раны',
    raging > speed0 && again && spent && noRage && (b.effects || []).some(e => e.id === 'frenzy'), `шаг ${speed0.toFixed(3)} → ${raging.toFixed(3)}, усталость ${spent}, без повтора ${again && noRage}`);
  const kitted = createAgent(w, 'dwarf', 'colony', 20, 20); kitted.equip.right = null; kitted.equip.left = null; kitted.equip.body = null;
  dress(kitted, [newItem('ironwarhammer')]);
  const smithRole = kitRole(kitted);
  check('дварф каравана с боевым молотом — мастер-кузнец', smithRole === 'smith', smithRole || '—');
}

// the dwarven war party: hammer-smiths, forge-masters, golems past a level; no captives; only at war
{
  const B = RAID_BANDS.get('dwarves'), r = mulberry(5), roles = new Set(); let golems = 0, early = 0;
  for (let k = 0; k < 20; k++) { for (const m of B.members(null, r, 1500, 20)) { if (m.role) roles.add(m.role); if (SPECIES.get(m.species).mechanism) golems++; } for (const m of B.members(null, r, 1500, 3)) if (SPECIES.get(m.species).mechanism) early++; }
  check('дружина дварфов: молотобойцы, мастера горна, берсерки; големы — только у сильной; пленных не берёт; приходит лишь в войну',
    ['smith', 'forgemaster', 'berserker'].every(x => roles.has(x)) && golems > 0 && !early && B.noCaptives && B.world && REALM_BANDS.dwarves === 'dwarves' && WAR_ONLY_BANDS.includes('dwarves'),
    `роли: ${[...roles].join(', ')}; големов ${golems}, у слабой ${early}`);
  check('рабство у дварфов под запретом', lawOf('dwarves').law === 'banned');
}

// the colony under the rock
{
  const w = game(), cx = Math.floor(w.w / 2), cy = Math.floor(w.h / 2);
  for (let k = 0; k < 4; k++) createAgent(w, 'dwarf', 'colony', cx + k, cy);
  for (let y = cy - 8; y < cy - 5; y++) for (let x = cx - 3; x < cx + 3; x++) w.grid.terr[y * w.w + x] = T.ROCK;   // a rock face near the camp
  putUp(w, 'quarry'); recomputeMods(w);
  const home = eligible(w, 'hallhome'), house = eligible(w, 'house'), cave = eligible(w, 'mushcave'), wall = eligible(w, 'stonewall'), pal = eligible(w, 'palisade');
  check('дварфы: подгорное жилище вместо избы, грибная пещера, каменная стена вместо частокола', home && !house && cave && wall && !pal, `жилище ${home}, изба ${house}, пещера ${cave}, стена ${wall}, частокол ${pal}`);
  putUp(w, 'smelter'); w.stock.anvil = 1; putUp(w, 'forge'); recomputeMods(w);
  const noMagma = eligible(w, 'magmaforge'); w.region = {...w.region, magma: 1}; const magma = eligible(w, 'magmaforge');
  const h = game('humans'); for (let k = 0; k < 3; k++) createAgent(h, 'human', 'colony', cx + k, cy); h.region = {...h.region, magma: 1}; putUp(h, 'quarry'); putUp(h, 'smelter'); h.stock.anvil = 1; putUp(h, 'forge'); recomputeMods(h);
  check('магмовую кузню дварфы ставят у магмы; без магмы — нет; людям — только захватом', !noMagma && magma && !eligible(h, 'magmaforge'), `без магмы ${noMagma}, с магмой ${magma}, люди ${eligible(h, 'magmaforge')}`);
  const gf = eligible(w, 'golemforge'); putUp(w, 'golemforge'); recomputeMods(w);
  w.stock.steel = 15; w.stock.iron = 20; w.stock.coal = 20;
  const g1 = forgeGolem(w), g2 = forgeGolem(w);
  check('кузня големов: голем из лучшего металла на складе, стоит за колонию; предел — по числу жителей', gf && g1?.species === 'steelgolem' && g1.faction === 'allies' && g1.brain === 'golem' && !g2 && w.stock.steel === 15 - GOLEM_LOCAL.cost,
    `${g1?.species}, второй ${g2?.species || '—'}`);
  const pace = job => { const a = w.agents.find(x => x.species === 'dwarf'), D = SPECIES.get('dwarf'), P = D.jobPace, v = workRate(w, a, job); D.jobPace = null; const u = workRate(w, a, job); D.jobPace = P; return v / u; };
  check('дварфы: камень и руда на четверть быстрее, ковка на пятую часть', Math.abs(pace('mine') - 1.25) < 1e-9 && Math.abs(pace('dig') - 1.25) < 1e-9 && Math.abs(pace('smith') - 1.2) < 1e-9,
    `камень ×${pace('mine').toFixed(2)}, руда ×${pace('dig').toFixed(2)}, ковка ×${pace('smith').toFixed(2)}`);
}

// the caravan: a golem bought in a dwarven town with a golem forge — the town gives one of its guard golems
{
  const t = {people: 'dwarves', built: ['golemforge', 'forge', 'smelter', 'mineshaft'], golems: {auto: {}, guard: ['iron', 'steel'], since: 0}, tier: 2};
  const o = offers(t).find(x => x.kind === 'beast' && BEASTS[x.id]?.golem);
  const none = offers({...t, built: ['forge']}).find(x => x.kind === 'beast' && BEASTS[x.id]?.golem);
  check('в городе с кузней големов продают голема — лучшего из стражей города; без кузни големов — нет', o?.id === 'steelgolem' && townGolem(null, t) === 'steel' && !none, o?.id || '—');
  const K = {members: [], beasts: [{id: 1, kind: 'steelgolem', hp: 1}]};
  check('голем каравана прибавляет ему силы', caravanMight(K) > 0, caravanMight(K).toFixed(2));
}

// no slaves: a dwarven colony dresses a fallen foe and lets it go; the only war over slaves is for their own kin
{
  const w = game(), cx = Math.floor(w.w / 2), cy = Math.floor(w.h / 2);
  const d = createAgent(w, 'dwarf', 'colony', cx, cy); createAgent(w, 'dwarf', 'colony', cx + 1, cy);
  const f = createAgent(w, 'human', 'raiders', cx + 2, cy); f.downed = {since: w.tick}; f.hp = 0.01;
  const res = bindCaptive(w, d, f);
  check('дварфы перевязывают упавшего врага и отпускают, а не вяжут', !!res && !f.captive && !f.downed && f.faction === 'leavers' && f.brain === 'leaver', `${f.faction}/${f.brain}`);
  const a = generateAtlas({seed: '3', size: 'small', land: 1, plates: 1, hemisphere: 'north'});
  const realm = a.realms.find(x => x.people === 'dwarves'), mine = a.towns.find(t => t.alive && t.realm === realm?.id);
  const other = mine && a.towns.filter(t => t.alive && t.realm && t.realm !== realm.id).sort((p, q) => Math.hypot(p.x - mine.x, p.y - mine.y) - Math.hypot(q.x - mine.x, q.y - mine.y))[0];
  for (const l of a.lairs || []) if (l.captives) delete l.captives.dwarves;
  for (const t of a.towns) if (t.slavesOf) delete t.slavesOf.dwarves;
  other.slaves = 60; other.slavesOf = {humans: 60};
  const none = liberate.want(a, realm, {r: () => 0});
  other.slavesOf = {dwarves: 60}; other.x = mine.x + 1; other.y = mine.y;
  const plan = liberate.want(a, realm, {r: () => 0})?.[0]?.[0];
  const pop0 = mine.pop, line = plan ? liberate.act(a, realm, plan, {r: () => 0.99}) : '';
  const rel = relation(a, realm.id, other.realm);
  check('освобождение: за чужих рабов дварфы не воюют, за братьев-дварфов — война, и свободные приходят в город',
    !none && plan?.town === other.id && !!rel?.war && (other.slavesOf.dwarves === 0 ? mine.pop > pop0 : mine.pop < pop0), line);
}

// the dwarves on the world map (docs/WORLD.md «Народы и города», Дварфы): a bunk in every work, tools of stone, little crime,
// the walls of metal and the reworking of what is over into what is lacking
{
  const {townFx: fxW, room: roomW} = await import('../src/atlas/towns.js');
  const {townEconomy: econW} = await import('../src/atlas/economy.js');
  const {recycle} = await import('../src/atlas/treasury.js');
  const {TOWN_BUILDINGS: TB, goodPrice: gp} = await import('../src/data/townBuildings.js');
  const {WORLD_PEOPLES: WP} = await import('../src/data/peoples.js');
  const town = people => ({id: 1, people, pop: 300, tier: 1, built: ['hallhomes', 'forge', 'quarry', 'handshop'], stock: {}, trade: {}, work: {}});
  const rD = roomW(fxW(town('dwarves'))), rH = roomW(fxW({...town('humans'), built: ['house', 'forge', 'quarry', 'handshop']}));
  const rD0 = roomW(fxW({...town('dwarves'), built: ['hallhomes']}));
  check('дварфы: койка в каждой мастерской, инструмент из камня, преступность вчетверо медленнее',
    Math.abs(rD - rD0 - 3 * WP.get('dwarves').bunks[1]) < 1e-6 && WP.get('dwarves').ruinGrow.crime === 0.25 && (e => e.dem.stone > 0 && !e.dem.wood)(econW(null, {...town('dwarves'), built: ['handshop']})),
    `место ${rD0} → ${rD} (у людей ${rH})`);
  const {digOf} = await import('../src/atlas/economy.js');
  const n = 49, ore = v => Float32Array.from({length: n}, (_, j) => (typeof v === 'function' ? v(j) : v));
  const fa = {w: 7, h: 7, f: {ore_iron: ore(0.3), ore_bronze: ore(0.2), ore_silver: ore(0), ore_gold: ore(0), ore_mithril: ore(j => (j === 0 ? 0.1 : 0))}};
  const dm = TB.get('deepmine'), dig = p => digOf(fa, {i: 24, people: p}, dm);
  check('знание камня: мифрил в трёх клетках от шахты Дварфы находят и добывают кратно, Люди на той же клетке — нет',
    (dig('dwarves').ore_mithril || 0) > 0 && !(dig('humans').ore_mithril > 0), `мифриловой руды в год: Дварфы ${(dig('dwarves').ore_mithril || 0).toFixed(0)}, Люди ${(dig('humans').ore_mithril || 0).toFixed(0)}`);
  check('заставы Дварфов: подземные ходы, каменная стена и зал предков — с 0-й ступени, кузня големов — с 1-й; поселенцы обходят стойбища',
    TB.get('tunnels').tier === 0 && TB.get('stonewall').tierBy?.dwarves === 0 && TB.get('stonewall').tier === 1 && TB.get('ancestorhall').tier === 0 && !TB.get('ancestorhall').here && TB.get('golemforge').tier === 1 && WP.get('dwarves').settlers.avoid?.orcs > 0,
    `стойбищ не ближе ${WP.get('dwarves').settlers.avoid?.orcs} шагов`);
  const walls = ['stonewall', 'bronzewall', 'ironwall', 'steelwall', 'mithrilwall'].map(id => TB.get(id));
  check('дварфийские стены: каменная → бронзовая → железная → стальная → мифриловая, каждая крепче прежней',
    walls.every((b, i) => !i || (b.upgrades[0] === walls[i - 1].id && b.fx.defence > walls[i - 1].fx.defence)), walls.map(b => b.fx.defence).join(' → '));
  const t = {...town('dwarves'), built: ['recycler'], stock: {stone: 1000}}, got = {}, L = {tools: 5}, P = {stone: 1000};
  const took = recycle(t, L, P, (g, n) => { got[g] = (got[g] || 0) + n; });
  check('переработка: излишек камня — в недостающее постройкам и жителям по цене 4 к 1, не больше годового предела за сезон',
    took > 0 && took <= TB.get('recycler').recycle.worth / 4 + 1e-6 && got.tools === 5 && Math.abs(Object.entries(got).reduce((s, [g, n]) => s + n * gp(g), 0) * 4 - took) < 1e-6 && Math.abs(t.stock.stone - (1000 - took / gp('stone'))) < 1e-6, `взято ${took.toFixed(1)} золотых камня → ${Object.entries(got).map(([g, n]) => `${g} ${n.toFixed(1)}`).join(', ')}`);
}

if (fail.length) process.exit(1);
