// The caravan's camp on a local map: the light mode of the local simulation (data/camp.js). A small map of
// the cell the caravan stands on (seam/cell.js), with no council, no trade, no settlement's roster beyond
// what the day asks; the caravan on it as it is — its people with their gear, wounds and skills, its beasts,
// its food and goods in the stores, a packed building put up by the fire. A foe of the bubble comes from the
// edge at night, or close by on the march; a stop is a day of hunting and gathering on the land itself.
//
// Three steps, all plain data in and out, so that the same camp can be played again and come out the same
// (the campaign's screen shows it after the core has played it: ui/campaignView.js):
//   campSetup(a, K, ev)  → setup: everything the camp is made of (saved in K.camps to be watched again);
//   openCamp(setup)      → the local world, at the hour the camp begins;  stepCamp(w) — a tick;  campDone(w);
//   campOutcome(w)       → what came out of it, for the campaign to take back (campaign/march.js).
import {createWorld} from '../local/index.js';
import {Navigation} from '../local/index.js';
import {step} from '../local/index.js';
import {PROVIDERS} from '../local/index.js';
import {formLinks, formUndeadLinks, promote, trimBand} from '../local/index.js';
import {RANK_RULES} from '../data/ranks.js';
import {memberStrength} from '../local/index.js';
import {spawnGroup} from '../local/index.js';
import {MIGRATIONS} from '../data/migrations.js';
import {AUTOFIGHT} from '../data/autofight.js';
import {createAgent, maxHp} from '../local/index.js';
import {refreshBody} from '../local/index.js';
import {attackerOf, sneakSeen, darkness} from '../local/index.js';
import {wake} from '../local/index.js';
import {sideStrength, expectedStrength} from '../local/index.js';
import {dress, gearDef, gearToken, gearType} from '../local/index.js';
import {makeTame} from '../local/index.js';
import {makeGolem} from '../local/index.js';
import {putUp} from '../local/index.js';
import {campOf} from './baggage.js';
import {POTION} from '../data/potions.js';
import {raidThreat} from '../local/index.js';
import {recordOf} from '../local/index.js';
import {walkable} from '../local/index.js';
import {FAR} from '../local/index.js';
import {cellPlan} from '../seam/index.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {DAY, HOUR, nightness, sunTicks, ofSun, atHour} from '../core/time.js';
import {SEASON_DAYS} from '../data/seasons.js';
import {DEFAULT_CFG} from '../data/presets.js';
import {FOODS} from '../data/foods.js';
import {RESOURCES} from '../data/resources.js';
import {bondsAmong, moodOut, moodIn} from './social.js';
import {DUTY} from '../data/social.js';
import {escortsDue} from './duty.js';
import {noteFact} from '../local/index.js';
import {ITEMS} from '../data/items.js';
import {SPECIES, isMindless} from '../data/species.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {ORES} from '../data/ores.js';
import {CAMP, CAMP_FOES, CAMP_WORKS, GAME_FLOW} from '../data/camp.js';
import {FOES, GAME} from '../data/campaign.js';
import {HERD} from '../data/bubble.js';
import {faunaLevel} from '../local/index.js';
import {BEASTS, VEHICLES} from '../data/transport.js';
import {planWorks, worksOutcome, planCaches, cachesOutcome} from './works.js';
import {stepWorks, tetherAt, worksOf} from '../local/index.js';
import {log} from '../core/log.js';
import {esc} from '../core/util.js';
import {bindWaiting} from '../local/index.js';
import {allItems, def as itemOf} from '../local/index.js';
import {setStanding} from '../local/index.js';
import {effectsOut, woundsOut, foesOf} from './potions.js';
import {dressWound as bindFallen} from '../local/index.js';
import {allowed} from '../data/commands.js';
import {tracing, noteDecision} from '../core/decide.js';

// the camp's border with the world: nobody comes by schedule — the campaign sends the foe itself
PROVIDERS.register({id: 'camp', label: 'Стоянка каравана', flows: {}, distance: () => null, receive() {}});

const alive = K => K.members.filter(m => m.alive);
const round1 = v => Math.round(v * 10) / 10;
// the setup is a snapshot of plain data, not a window on the live members: what changes after it does not change it (a replay)
const copy = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ── the setup: the camp as plain data.  ev = {kind: 'night' | 'ambush' | 'stop', foe?, dayIn (the day of the season)}
//   foe = {kind (data/campaign.js FOES), strength, label, band?, beast?} — what of the bubble came
export function campSetup(a, K, ev) {
  const race = WORLD_PEOPLES.get(K.people).race;
  const plan = cellPlan(a, K.i, {name: 'Стоянка', race});
  // the second camp of a kind on the same day gets a seed of its own (the first keeps the old one)
  const n = (K.camps || []).filter(c => c.day === K.day && c.kind === ev.kind).length;
  return {
    ...(a.cfg?.profile && a.cfg.profile !== 'full' ? {profile: a.cfg.profile} : {}),
    day: K.day, year: a.hist.year, kind: ev.kind, seed: `${K.seed}:camp:${K.day}:${ev.kind}${n ? `:${n}` : ''}`, i: K.i,
    startDay: a.hist.season * SEASON_DAYS + (ev.dayIn ?? 0), plan, people: K.people,
    members: alive(K).map(m => ({id: m.id, name: m.name, potions: m.potions || 0, belt: [...(m.belt || [])], effects: effectsOut(K, m), wounds: woundsOut(K, m), marks: m.marks ? [...m.marks] : null, gender: m.gender, race: m.race, people: m.people, role: m.role, special: copy(m.special),
      align: copy(m.align), alignRoot: copy(m.alignRoot || null), values: copy(m.values), mood: m.social?.mood?.length ? m.social.mood.map(e => ({...e})) : null, tired: m.social?.load?.tired || 0, hp: m.hp, gear: {hand: [...m.gear.hand], body: m.gear.body}, local: copy(m.local || null), captive: m.captive ? {...m.captive} : null, master: m.master ? {...m.master} : null, former: m.former ? {...m.former} : null, loyalty: m.loyalty ?? null,
      maims: m.maims || 0, perks: m.perks?.length ? m.perks.map(p => ({id: p.id, rank: p.rank})) : null})),   // (Ver_E: the maims borne and the perks learned — read by openCamp)
    bonds: bondsAmong(K, alive(K).map(m => m.id)),   // what the members present feel for each other (campaign/social.js), by member id
    promises: escortsDue(K, new Set(alive(K).filter(m => !m.captive).map(m => m.id))),   // the escorts promised for today, kept on the map (campaign/duty.js)
    beasts: K.beasts.filter(b => b.hp > 0).map(b => ({id: b.id, kind: b.kind, hp: b.hp, ...(b.species ? {species: b.species} : {})})),
    vehicles: K.vehicles.map((v, k) => ({k, kind: v.kind})), buildings: [...campOf(K)],
    // the camp's chores (campaign/works.js): the day at this place (a stop's second day stands set up), the stakes the wheels
    // carry, those cut here the day before (campaign/fight.js K.campHere), an axe among the tools to cut more
    stayed: K.campHere?.i === K.i && K.campHere.day === K.day - 1 ? K.campHere.days : 0,
    stakes: K.vehicles.reduce((n, v) => n + (VEHICLES[v.kind].stakes || 0), 0),
    cut: K.campHere?.i === K.i && K.campHere.day === K.day - 1 ? K.campHere.cut || 0 : 0,
    axe: alive(K).some(m => m.gear.hand.some(tok => CAMP.tools[gearType(tok)] === 'woodcutting')),
    food: K.food, cargo: {...K.cargo},
    met: foesOf(K),   // the foes of the last fights: the belts are filled against them on the map (settlement/potions.js)
    // a stop to dig: the ore the council stopped for (campaign/mine.js wantMine); only it is dug on the map
    dig: K.why?.startsWith('mine:') && K.why.slice(5) !== 'placer' ? K.why.slice(5) : null,
    // the pieces of terrain of this map (world/pieces.js): a scene on a storm or a boss, else the land's and the scatter
    // (a camp kept from before the pieces has none, and is watched again as it was played)
    layout: {v: 1, kind: ev.kind, scene: ev.kind === 'guard' || !!ev.foe?.boss, foe: ev.foe ? {kind: ev.foe.kind, band: ev.foe.band || CAMP_FOES[ev.foe.kind]?.band || null, beast: ev.foe.beast || CAMP_FOES[ev.foe.kind]?.beast || null, boss: ev.foe.boss?.species || null} : null},
    foe: ev.foe ? {kind: ev.foe.kind, strength: ev.foe.strength ?? 1, label: ev.foe.label || FOES[ev.foe.kind].label, band: ev.foe.band || null, beast: ev.foe.beast || null, with: ev.foe.with || null, pool: ev.foe.pool || null, boss: ev.foe.boss || null, person: ev.foe.person || null, one: !!ev.foe.one} : null,
  };
}

// ── the company's strength with no map (the quick fight: campaign/fight.js autoFight; data/camp.js CAMP.auto): each member made
// on a scratch world as openCamp makes it — its letters, skills, perks, marks, wounds, health and gear — and rated as the map
// rates it (agents/strength.js, at its present health); the war beasts and the golems at theirs. Nothing of the game is drawn.
export function companyStrength(a, K) {
  const w = {rngs: {birth: mulberry(seedNumber(`${K.seed}:might`))}, agents: [], nextId: 1, nameIdx: 0, tick: 0};
  let sum = 0;
  for (const m of K.members) {
    if (!m.alive || m.captive) continue;
    const ag = createAgent(w, m.race, 'raiders', 0, 0);   // (a scratch world keeps no chronicle: the side is only a word here)
    ag.special = {...m.special};
    const L = m.local;
    if (L?.skill) ag.skill = {...L.skill};
    else for (const [id, v] of Object.entries(CAMP.skills[m.role] || {})) ag.skill[id] = Math.max(ag.skill[id] || 0, v);
    const ws = woundsOut(K, m), es = effectsOut(K, m);
    if (es.length) ag.effects = es.map(e => ({id: e.id, until: e.ticks}));
    if (ws.length) ag.wounds = ws.map(x => ({id: x.id, until: x.ticks}));
    if (m.marks?.length) ag.marks = [...new Set([...(ag.marks || []), ...m.marks])];
    if (m.maims) ag.maims = m.maims;
    if (m.perks?.length) { ag.perks = m.perks.map(p => ({id: p.id, rank: p.rank})); ag.kinHere = K.members.filter(x => x.alive && !x.captive && x.race === m.race).length; }
    refreshBody(ag); ag.hp = maxHp(ag) * Math.max(AUTOFIGHT.least.member, Math.min(1, m.hp));
    const hands = (m.wounds || []).some(x => x.id === 'lostArm') ? m.gear.hand.filter(id => gearDef(id)?.form !== 'shield').slice(0, 1) : m.gear.hand;
    dress(ag, [...hands, m.gear.body].filter(id => !!gearDef(id)), CAMP.arrows);
    sum += sideStrength([ag], {now: true});
    w.agents = [];
  }
  for (const b of K.beasts) {
    if (!(b.hp > 0)) continue;
    const sp = b.species || BEASTS[b.kind]?.species || b.kind;
    if (b.kind !== 'war' && !BEASTS[b.kind]?.golem) continue;   // (the herd's beasts keep out of a fight)
    if (SPECIES.has(sp)) sum += expectedStrength(sp, {key: 'company'}) * Math.max(AUTOFIGHT.least.beast, Math.min(1, b.hp));
  }
  return sum;
}

// the hours of a camp: when it begins, when the foe comes, when it ends at the latest (ticks)
// (in the camp's own ticks: its sun is slower than a settlement's, CAMP.clock — core/time.js dayScale)
function hours(S, r) {
  const H = CAMP[S.kind] && S.kind !== 'night' ? CAMP[S.kind] : CAMP.night, h = HOUR * CAMP.clock.scale;
  const t0 = Math.round(H.from * h), wrap = x => (x < H.from ? x + 24 : x);
  const until = Math.round(wrap(H.until) * h);
  const come = H.come ? Math.round(wrap(H.come[0] + r() * (H.come[1] - H.come[0] + (H.come[1] < H.come[0] ? 24 : 0))) * h) : null;
  return {t0, until, come};
}

// ── the camp's world
export function openCamp(S) {
  const plan = S.plan;
  const cfg = {...DEFAULT_CFG, name: 'Стоянка', seed: S.seed, size: 'small', dims: CAMP.size, colonists: 0, stock: 'poor', start: 'spring',
    raids: 'off', light: true, provider: 'camp', cell: {...plan, extra: {...plan.extra, startDay: S.startDay, ...(S.layout ? {layout: S.layout} : {})}}, ...(S.profile ? {profile: S.profile} : {})};   // (the world's profile of commands: data/commands.js)
  const w = createWorld(cfg);
  w.dayScale = CAMP.clock.scale;   // the camp's sun is slower: more is done by it in a night (core/time.js; docs/CAMPAIGN.md «Часы стоянки»)
  // an open-cut face is dug only on a stop to dig, and only for the ore it was for (settlement/query.js wantedOre)
  w.campDig = S.dig && ORES.has(S.dig) ? new Set([ORES.get(S.dig).code]) : new Set();
  w.scratch = null;   // what was counted for this tick before the camp knew what it digs
  w.nav = new Navigation(w); w.nav.buildAll();
  w.perf = {fields: 0, nav: 0, agents: 0, render: 0};
  const r = mulberry(seedNumber(S.seed + ':plan')), H = hours(S, r);
  w.tick = H.t0;
  w.campaign = {S, foeAt: H.come, until: H.until, spawned: !S.foe, foes: [], foeObjs: [], people: new Map(), herd: new Map(), quiet: null, built: [], start: H.t0, rnd: r};
  w.chronicle.met = {...(S.met || {})};   // (what the caravan has met: its belts are not traded away before the foe comes)
  // the stores: the food as jerky, the goods, firewood for the night, hay for the beasts
  for (const k of Object.keys(w.stock)) w.stock[k] = 0;
  w.stock[CAMP.food] = S.food * CAMP.perRation / FOODS.get(CAMP.food).nutrition;
  for (const [id, n] of Object.entries(S.cargo || {})) if (RESOURCES.has(id)) w.stock[id] = (w.stock[id] || 0) + n;
  w.stock.wood = (w.stock.wood || 0) + CAMP.wood;
  if (S.beasts.length) w.stock.hay = (w.stock.hay || 0) + CAMP.hay * S.beasts.length;
  // the people round the fire
  w.founding = true;
  const ring = (k, n, rad) => [w.camp.x + 0.5 + Math.cos(k / n * 6.283) * rad, w.camp.y + 0.5 + Math.sin(k / n * 6.283) * rad];
  S.members.forEach((m, k) => {
    const [x, y] = ring(k, S.members.length, 2);
    const ag = createAgent(w, m.race, 'colony', x, y);
    ag.member = m.id; ag.place = m.role; ag.fightPref = m.fight || null; w.campaign.people.set(m.id, ag); ag.name = m.name; ag.gender = m.gender; ag.people = m.people;   // (ag.place: its place in the company, docs/BEHAVIOUR.md «Словарь»)
    ag.special = {...m.special}; if (m.align) ag.align = {...m.align}; if (m.alignRoot) ag.alignRoot = {...m.alignRoot}; if (m.values) ag.values = [...m.values];
    const L = m.local;
    if (L) Object.assign(ag, {likes: L.likes, dislikes: L.dislikes, prefs: {...L.prefs}, traits: [...L.traits], food: {...L.food}, own: {...L.own}, skill: {...L.skill}, ...(L.leans ? {leans: {...L.leans}} : {})});
    else {
      for (const [id, v] of Object.entries(CAMP.skills[m.role] || {})) ag.skill[id] = Math.max(ag.skill[id] || 0, v);
      for (const tok of m.gear.hand) { const id = gearType(tok); if (CAMP.tools[id]) ag.skill[CAMP.tools[id]] = Math.max(ag.skill[CAMP.tools[id]] || 0, CAMP.toolSkill); }   // (a bought or forged piece is a word with marks: «ironaxe@dwarf»)
    }
    const rec = recordOf(w, ag); if (rec) rec.name = m.name;
    if (m.master) ag.master = {skill: m.master.skill, since: w.tick, workedAt: -1};
    if (m.former) setStanding(ag, 'former', {since: w.tick, bond: m.loyalty ?? 0.6, fought: false});   // (the role's shorter list: data/behaviour.js WAYS.former)   // a former slave: no arms (settlement/freedom.js)   // a master of the caravan (campaign/masters.js)
    // a captive of the caravan stays one on the map (settlement/captives.js)
    if (m.captive) { setStanding(ag, 'captive', {since: w.tick, bonds: m.captive.bonds, by: null, band: null, people: m.people || null, was: 'raiders', member: true, will: m.captive.will, resigned: m.captive.resigned ?? null, service: m.captive.service || 0}); if (rec) rec.captive = true; }   // (no council, flag, watch or trade; kept in: data/behaviour.js WAYS.captive)
    if (m.mood?.length) ag.diary = [...moodIn(S.day, w.tick, m.mood, w), ...(ag.diary || [])];   // the fresh thoughts it brings (campaign/social.js)
    // (what lasts by the sun comes in the sun's ticks and goes out in them: core/time.js dayScale)
    if (m.effects?.length) ag.effects = m.effects.map(e => ({id: e.id, until: w.tick + sunTicks(w, e.ticks)}));
    if (m.wounds?.length) ag.wounds = m.wounds.map(x => ({id: x.id, until: x.ticks == null ? null : w.tick + sunTicks(w, x.ticks)}));   // the wounds and traumas it bears (campaign/potions.js woundsOut)
    if (m.marks?.length) ag.marks = [...new Set([...(ag.marks || []), ...m.marks])];   // an elixir's mark for life (campaign/potions.js)   // the brews at work go on (campaign/potions.js)
    if (m.maims) ag.maims = m.maims;   // the maims it bears: with the last, the next deadly wound kills (data/wounds.js DEATHBLOW.maim)
    if (m.perks?.length) { ag.perks = m.perks.map(p => ({id: p.id, rank: p.rank})); ag.kinHere = S.members.filter(x => !x.captive && x.race === m.race).length; }   // its perks (data/perks.js), and how many of its kind are in the company (a goblin's herd)
    refreshBody(ag); ag.hp = maxHp(ag) * Math.max(0.05, Math.min(1, m.hp));
    // one hand lost: one thing in it — the weapon, not the shield (data/conditions.js lostArm `hand`)
    const hands = (m.wounds || []).some(x => x.id === 'lostArm') ? m.gear.hand.filter(id => gearDef(id)?.form !== 'shield').slice(0, 1) : m.gear.hand;
    dress(ag, [...hands, m.gear.body].filter(id => !!gearDef(id)), CAMP.arrows);
    for (const it of Object.values(ag.equip)) if (it) it.own = m.id;   // the caravan's own: not loot when a fallen one's gear is stripped
    if (!m.captive && !m.former && m.potions) ag.potions = Math.min(POTION.slot, m.potions);   // the healing potions in the slot (agents/potions.js)
    if (!m.captive && !m.former && m.belt?.length) ag.belt = m.belt.slice(0, POTION.belt);   // and the others in the belt
    for (const n of Object.keys(ag.needs)) ag.needs[n] = Math.max(ag.needs[n], 0.75);
    ag.needs.rest = Math.max(0, (CAMP.rest[S.kind] ?? 0.85) - DUTY.campRest * (m.tired || 0));   // a day's march behind them, and the nights on watch (campaign/duty.js)
    if (S.kind === 'stop') ag.needs.food = 1;   // the day's meal is the campaign's: on the map they hunt and gather
  });
  w.founding = false;
  // the bonds, once everyone is on the map: member ids → the map's agent ids (campaign/social.js); a member's own map id
  // is known to the map's day, so a bond to one who falls here is not dropped (settlement/relations.js daily)
  w.campaign.memberOf = new Map([...w.campaign.people].map(([id, ag]) => [ag.id, id]));
  // the promises to keep here (campaign/duty.js escortAsk): by the map's ids — the one who promised, the one it promised
  w.campaign.promises = (S.promises || []).map(p => ({...p, by: w.campaign.people.get(p.debtor)?.id, to: w.campaign.people.get(p.creditor)?.id, state: 'open', seenOut: false})).filter(p => p.by != null && p.to != null);
  for (const [a, row] of Object.entries(S.bonds || {})) {
    const ag = w.campaign.people.get(+a); if (!ag) continue;
    for (const [b, v] of Object.entries(row)) { const o = w.campaign.people.get(+b); if (o) (ag.grudge ||= {})[o.id] = v; }
  }
  // the beasts by the camp
  S.beasts.forEach((b, k) => {
    const [x, y] = ring(k + 0.5, Math.max(3, S.beasts.length), 4);
    const sp = b.species || BEASTS[b.kind].species || b.kind;
    // a war beast of the guild's cages (campaign/cages.js): tame, at the company's side, it fights their foes and stays by them
    if (b.kind === 'war') {
      const side = [...w.campaign.people.values()][0]?.faction, ag = createAgent(w, sp, !side || side === 'colony' ? 'allies' : side, x, y);   // (as a caller's beasts: agents/summon.js)
      ag.brain = 'summoned'; ag.summoned = {by: null, last: w.tick, keep: true}; ag.warBeast = true; ag.beast = b.id; w.campaign.herd.set(b.id, ag);
      ag.hp = maxHp(ag) * Math.max(0.1, Math.min(1, b.hp)); return;
    }
    // a golem stands guard over the camp (agents/golem.js), it is no tame beast
    if (BEASTS[b.kind].golem) { const ag = makeGolem(w, SPECIES.get(sp).metal, x, y, {x: w.camp?.x ?? x, y: w.camp?.y ?? y}); ag.beast = b.id; w.campaign.herd.set(b.id, ag); ag.hp = maxHp(ag) * Math.max(0.1, Math.min(1, b.hp)); return; }
    const ag = createAgent(w, sp, 'herd', x, y);
    makeTame(w, ag, null, true);
    ag.age = SPECIES.get(sp).tame?.grownDays || 0; ag.wool = 0; ag.beast = b.id; w.campaign.herd.set(b.id, ag);
    ag.hp = maxHp(ag) * Math.max(0.1, Math.min(1, b.hp));
  });
  // a packed building put up by the fire
  const camp = S.buildings || S.vehicles.filter(v => v.building).map(v => v.building);   // (a camp kept to be watched again from before the camp went with the caravan)
  // a stop: the land's game comes out onto the meadows
  if (S.kind === 'stop') stockGame(w, r);
  w.campaign.food0 = foodNow(w); w.campaign.stock0 = {...w.stock};
  w.campaign.ourMight = sideStrength([...w.campaign.people.values()].filter(ag => !ag.captive), {now: true});   // the caravan's fighting strength as it stands, wounds and all (the fight's record: campaign/stats.js; not the foe's budget)
  // (on the march, after an ambush, the building stays packed)
  // the caravan's camp stands whole at a night's camp and a stop (data/transport.js CAMP_FX); on the march it is packed
  if (S.kind === 'night' || S.kind === 'stop') for (const id of camp) { const b = putUp(w, id, 0); if (b) w.campaign.built.push({key: id, id: b.id}); }
  // the evening's chores: the cart by the fire, the tether, the hides, the spit, the smoking rack, the stakes (campaign/works.js)
  if (S.kind === 'night' || S.kind === 'stop') planWorks(w, {...S, beasts: S.beasts.filter(b => !BEASTS[b.kind].golem)});
  planCaches(w, S);   // the caches of the pieces of terrain, to be searched once the foe is beaten (campaign/works.js)
  w.logLines = [];
  const seen = (w.pieces || []).filter(p => p.layer !== 'scene' && p.layer !== 'scatter').map(p => p.label);
  if (w.scene || seen.length) log(w, `Место: ${[...new Set([w.scene?.label, ...seen].filter(Boolean))].join(', ')}.`, 'build');
  return w;
}

function stockGame(w, r) {
  for (const sp of Object.keys(GAME)) {
    const flow = GAME_FLOW[sp] || sp; if (!MIGRATIONS.has(flow) || !SPECIES.has(sp)) continue;
    const lvl = faunaLevel(w, sp); if (lvl <= 0) continue;
    const n = Math.round(CAMP.stop.game * Math.min(CAMP.stop.gameCap, lvl) * (CAMP.stop.roll + r()) * (GAME[sp] >= HERD.big ? 1 : CAMP.stop.smallGame));
    if (n > 0) spawnGroup(w, flow, n, {minDist: 10});
  }
}

const foodNow = w => FOODS.all().reduce((s, f) => s + (w.stock[f.id] || 0) * f.nutrition, 0);

// the foe comes: a band of raiders (data/raids.js) or a pack of beasts, at the edge or close by
// the fight's budget (data/camp.js CAMP.foe): the thing's strength (its land, its lair, the errand's tier: campaign/land.js)
// × `unit` (the strength rating of a point of it; `quickUnit` — of might, in the quick mode) × the fight's weight: a chance
// meeting lighter, a named foe heavier, and a sway at random on top. Never the caravan's own strength. Shared with the quick
// mode (campaign/fight.js autoFight)
const refOf = F => CAMP.foe.density.ref[F.kind] ?? CAMP.foe.density.ref.else;
export const foeStrength = F => F.strength ?? refOf(F);
export function foeWeight(r, F, kind) {
  const B = CAMP.foe, named = F.boss ? (F.boss.mustDie ? B.boss : F.person ? B.leader : B.mini) : null;
  const base = named ?? (kind === 'guard' || F.kind === 'army' ? B.force : B.skirmish[0] + r() * (B.skirmish[1] - B.skirmish[0]));
  return Math.max(B.floor, base + (2 * r() - 1) * B.sway);
}
export const foeBudget = (r, F, kind, unit = CAMP.foe.unit) => unit * foeStrength(F) * foeWeight(r, F, kind);
// the foe as the quick fight weighs it (campaign/fight.js autoFight; data/autofight.js): its strength × `unit`, a named one × its
// weight over a force's — the same the table of the map's outcomes was measured by (the sway and the chance meeting's lightness are
// in the table: the map's fights had them)
export function foeNominal(F) {
  const B = CAMP.foe, named = F.boss ? (F.boss.mustDie ? B.boss : F.person ? B.leader : B.mini) / B.force : 1;
  return B.unit * foeStrength(F) * named;
}

function spawnFoe(w) {
  const C = w.campaign, S = C.S, F = S.foe, map = CAMP_FOES[F.kind] || {}, r = C.rnd;
  // a stormed place laid out as a scene: its guards stand at the heart (world/pieces.js anchor), if one can walk there
  const heart = S.kind === 'guard' && w.scene?.anchor != null && w.nav.get('camp')[w.scene.anchor] < FAR ? w.scene.anchor : null;
  const close = S.kind === 'ambush' || S.kind === 'guard', at = heart ?? (close ? nearCell(w, CAMP[S.kind].near, r) : null);
  const opts = {minDist: close ? CAMP[S.kind].near : CAMP.far, ...(at != null ? {at} : {})};
  // (a beast with no arrival on the local map — a rift's demon — still comes as a band, as before: docs/TODO.md)
  const beast = F.beast || map.beast, band = F.band || map.band;
  // the foe is bought by its own strength (foeBudget: the land's, the lair's, the errand's), never by the caravan's: the same
  // guards stand against a company in copper and one in steel, and the steel wins more often. The heads are rounded up
  // (outside/bands.js fill `up`)
  const t = raidThreat(w), budget = foeBudget(r, F, S.kind);
  C.weight = Math.round(budget / Math.max(1e-6, C.ourMight) * 100) / 100;   // for the fight's record: the foe over the caravan
  // one kind, or two (campaign/land.js withCompany): the second takes its share of the budget
  const W = F.with && (F.with.beast ? MIGRATIONS.has(F.with.beast) : F.with.band) ? F.with : null, main = budget * (W ? 1 - W.share : 1);   // (a second kind with no arrival stays home)
  const part = (who, b, first) => {
    if (who.beast && MIGRATIONS.has(who.beast)) {
      const n = first && F.one ? 1 : Math.min(S.kind === 'guard' ? CAMP.foe.mostGuard : CAMP.foe.most, Math.max(1, first && F.boss ? CAMP.boss.atLeast : 1, Math.ceil(b / expectedStrength(MIGRATIONS.get(who.beast).species, {key: 'wild'}))));   // a wild beast comes as it is, no band's body or kit
      const g = spawnGroup(w, who.beast, n, opts);
      // they came for a meal, at the camp: a crowd has to outnumber the pack to scare it, the camp's zone does not keep it off,
      // and it does not wander away for want of game (agents/behaviours/scare.js, wanderOff.js)
      for (const x of g) { x.needs.food = Math.min(x.needs.food ?? 1, CAMP.foe.hungry); x.hunger = true; }
      return g;
    }
    // the threat the band carries its gear by: × the thing's strength (settlement/threat.js reads w.fame on top)
    const want = CAMP.threat * F.strength * (map.threat || 1);
    w.fame = 0; w.fame = want - raidThreat(w);
    // the band counted out in strength rating (outside/bands.js fill): the budget, rounded up by heads, the bands' caps lifted
    return spawnGroup(w, 'raiders', b, {...opts, band: who.band || 'bandits', fill: {up: true, max: {}, ...(S.kind === 'guard' ? {most: CAMP.foe.mostGuard} : {}), ...(F.pool && who.band === 'cultists' ? {pool: F.pool} : {})}, atLeast: first && F.boss ? CAMP.boss.atLeast : 0});
  };
  // beasts that come with a band (campaign/land.js withCompany) are its war beasts: one side, one squad, the band's brain
  const bandMain = !(beast && MIGRATIONS.has(beast)), joined = W && W.beast && bandMain ? W : null;
  let group;
  if (joined) {
    // they come as the band's war beasts, trained (data/conditions.js): bought at that price, not at a wild one's
    const sp = MIGRATIONS.get(joined.beast).species, n = Math.min(S.kind === 'guard' ? CAMP.foe.mostGuard : CAMP.foe.most, Math.max(1, Math.ceil((budget - main) / memberStrength(sp, t))));
    const want = CAMP.threat * F.strength * (map.threat || 1);
    w.fame = 0; w.fame = want - raidThreat(w);
    group = spawnGroup(w, 'raiders', main, {...opts, band: band || 'bandits', fill: {up: true, max: {}, ...(S.kind === 'guard' ? {most: CAMP.foe.mostGuard} : {}), ...(F.pool && band === 'cultists' ? {pool: F.pool} : {})}, beasts: {species: sp, n}, atLeast: F.boss ? CAMP.boss.atLeast : 0});
  } else {
    group = part({beast, band}, main, true);
    if (W) group = group.concat(part(W, budget - main, false));
  }
  // the guards of a place stormed (campaign/quest.js) defend it to the last: their band does not break and flee
  if (S.kind === 'guard') for (const id of new Set(group.map(g => g.squad).filter(x => x != null))) {
    const sq = w.squads?.[id]; if (sq) { sq.kind = 'mindless'; sq.goal = 'slaughter'; }
  }
  // the beasts of a lair stormed hold it to the last as well (agents/behaviours/maul.js defendLair: no fear, no flight — a dragon
  // does not fly off from its hoard, Г6); a grave's guard with a miniboss may be driven off
  if (S.kind === 'guard' && (!F.boss || F.boss.mustDie)) for (const g of group) if (SPECIES.get(g.species)?.predator) g.defend = true;
  // a boss (campaign/epic.js): the strongest of them, grown past its kind — named, at full health
  if (F.boss && group.length) {
    const own = group.filter(g => g.species === F.boss.species), b = (own.length ? own : group).slice().sort((p, q) => maxHp(q) - maxHp(p))[0];   // its own kind, if it came
    b.special = {...b.special}; for (const [id, v] of Object.entries(F.boss.add || {})) b.special[id] = (b.special[id] ?? 5) + v;
    refreshBody(b); b.hp = maxHp(b); b.name = F.boss.name; b.boss = true; b.person = F.person || null; C.boss = b;   // (the person of the world it is: atlas/persons.js)
    // grown, it is worth more than the budget bought: the weakest of its retinue go, while what is left still covers the budget
    trimBand(w, group, budget, CAMP.boss.atLeast);
    // the boss's aura (agents/auras.js): its side stands while it stands; its band's leader is an officer who holds to the end
    b.auras = [...(b.auras || []), 'lead'];
    for (const g of group) if (g !== b) g.side = b.id;   // its side: those who came with it, and only they
    for (const id of new Set(group.map(g => g.squad).filter(x => x != null))) { const sq = w.squads?.[id]; if (sq) sq.goal = 'slaughter'; }
  }
  // ranks (agents/ranks.js, data/ranks.js): each band big enough splits into links under officers, its leader first;
  // under a boss the leader is an officer whatever the size. Officers are worth more than the budget bought: the
  // weakest pawns go, as for a boss
  let ranked = false;
  for (const id of new Set(group.map(g => g.squad).filter(x => x != null))) {
    const sq = w.squads?.[id]; if (!sq) continue;
    const own = group.filter(g => g.squad === id), officers = formLinks(w, own, 'camp', sq.leader);
    if (officers.length) ranked = true;
    if (formUndeadLinks(w, own, 'camp').length) ranked = true;   // the dead under wights
    const l = own.find(g => g.id === sq.leader);
    if (F.boss && l && !l.boss && !officers.includes(l) && !isMindless(SPECIES.get(l.species)) && !l.warBeast) { promote(l, l.band, true); l.link = l.id; ranked = true; }
  }
  if (ranked) trimBand(w, group, budget * RANK_RULES.pay.camp, F.boss ? CAMP.boss.atLeast : 1);
  C.foes = group.map(g => g.id); C.foeObjs = group; C.spawned = true;
  C.foeMight = sideStrength(group, {now: true});   // the foe's strength as it came (the fight's record)
}

// a cell this far from the camp that can be walked to from it
function nearCell(w, d, r) {
  const dCamp = w.nav.get('camp');
  for (let k = 0; k < 200; k++) {
    const ang = r() * 6.283, x = Math.round(w.camp.x + Math.cos(ang) * d), y = Math.round(w.camp.y + Math.sin(ang) * d);
    if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) continue;
    const i = y * w.w + x;
    if (walkable(w, i) && dCamp[i] < FAR) return i;
  }
  return null;
}

// (over the foes themselves, not every creature: the dead and the gone leave w.agents and are out of it here too)
const foesLeft = w => w.campaign.foeObjs.filter(o => !o.dead && !o.gone && !o.downed && !o.captive && o.task?.id !== 'leave').length;   // the fallen and the bound are out of it

// a tick of the camp
export function stepCamp(w) {
  const C = w.campaign;
  if (!C.spawned && w.tick >= C.foeAt) spawnFoe(w);
  step(w);
  stepWorks(w);
  // a raider who looted the stores leads off a beast that stands by — a tethered one (campaign/works.js) after cutting the
  // rope: CAMP_WORKS.tether.cut ticks beside it
  if (w.tick % 10 === 0) for (const o of w.agents) {
    if (o.faction !== 'raiders' || o.dead || !o.looted || o.task?.id !== 'leave' || o.leads) continue;
    const b = w.agents.find(x => x.tame && !x.dead && !x.ledBy && Math.hypot(x.x - o.x, x.y - o.y) < 2.5);
    if (!b) { o.cutting = null; continue; }
    const T = tetherAt(w);
    if (T && Math.hypot(b.x - T[0], b.y - T[1]) <= CAMP_WORKS.tether.keep + 1) {
      if (o.cutting?.beast !== b.id) { o.cutting = {beast: b.id, since: w.tick}; continue; }
      if (w.tick - o.cutting.since < CAMP_WORKS.tether.cut) continue;
      log(w, `<b>${esc(o.name)}</b> перерезал привязь: уводит ${esc(b.name)}.`, 'danger');
    }
    o.cutting = null;
    b.ledBy = o.id; b.brain = 'led'; o.leads = b.id;   // the brain `led` (agents/behaviours/led.js): it follows him and is gone with him
  }
  if (C.spawned && !C.alarm) raiseAlarm(w);
  if (C.boss && !C.bossFell && (C.boss.dead || C.boss.captive)) C.bossFell = w.tick;   // the aura is gone with it: its band may break now (agents/squad.js)
  if (C.spawned && C.foes.length) {
    if (foesLeft(w) === 0) C.quiet ??= w.tick; else C.quiet = null;
  }
}

// the camp's alarm (CAMP.band): one of the caravan awake sees a foe, or one of them is struck. Then the whole company
// is up and goes for the foe (agents/behaviours/warband.js) — the sleepers too
// the decision point `camp.alarm` (data/commands.js): a rule, the command `camp.alarm.raise`; switched off, nobody raises the camp
// (each answers only what strikes it)
function raiseAlarm(w) {
  if (!allowed(w.cfg, 'camp.alarm.raise')) return;
  const C = w.campaign, R = CAMP.band.sight, night = nightness(w), foes = C.foeObjs.filter(o => !o.dead && !o.gone);
  for (const p of C.people.values()) {
    if (p.dead || p.captive) continue;
    const struck = !!attackerOf(w, p) || p.downed;
    const awake = p.task?.id !== 'sleep' && !p.downed, r = R * darkness(w, p);
    if (struck || (awake && foes.some(o => Math.hypot(o.x - p.x, o.y - p.y) <= (o.sneaking ? Math.min(r, sneakSeen(o)) : r)))) {   // one who creeps is seen only close (agents/combat.js)
      C.alarm = w.tick;
      if (tracing()) noteDecision({point: 'camp.alarm', who: 'camp', at: w.tick, band: 'red', policy: 'rule', opts: [{cmd: 'camp.alarm.raise', key: 'camp.alarm.raise', score: 1}], pick: 'camp.alarm.raise', by: p.id, struck});
      for (const q of C.people.values()) if (!q.dead && !q.captive) wake(q, 'тревога в лагере', 'тревога');
      return;
    }
  }
}

export function campDone(w) {
  const C = w.campaign;
  if (w.over || !w.agents.some(a => a.faction === 'colony' && !a.dead)) return true;
  if (w.tick >= C.until) return true;
  // the foe is beaten or gone, and an hour passed quietly (the wounded tended, the fire made up)
  // (the camp waits for its own fallen to be helped, and for the fallen foes to be bound while there are bonds)
  return C.S.kind !== 'stop' && C.spawned && C.quiet != null && w.tick - C.quiet >= atHour(w, CAMP.quiet) && !w.agents.some(a => a.downed && !a.dead && a.faction === 'colony') && !bindWaiting(w)
    && !worksOf(w).some(x => x.key === 'cache' && !x.done && x.by != null);   // (a cache being searched is searched to the end)
}

// play a camp through; → the world at its end
export function runCamp(S) {
  const w = openCamp(S);
  for (let guard = 0; guard < 2 * DAY && !campDone(w); guard++) stepCamp(w);
  return w;
}

// ── what came out of it (the agents are kept by reference: the dead and the gone leave w.agents)
// (taken once at a tick: the binding of the fallen is done by the taking — a second call at the same tick gives the same
// outcome, not a second binding; a map stepped on is taken anew)
export function campOutcome(w) {
  const C = w.campaign;
  if (C.final?.tick === w.tick) return C.final.o;
  const o = outcomeOf(w);
  C.final = {tick: w.tick, o};
  return o;
}
function outcomeOf(w) {
  const C = w.campaign, S = C.S;
  // the promises (before the fallen are bound below): kept, or why not — the one who promised fell or was bound (hurt), the camp was fighting (busy), the other
  // never went out (notNeeded), it went and the promised one did not (ignored for the lazy, busy for the rest)
  const promises = (C.promises || []).map(p => {
    if (p.state === 'kept') return {id: p.id, state: 'kept'};
    const db = [...C.people.values()].find(x => x.id === p.by);
    // (took: it set out and was at the other's side a while but not long enough — the camp ended, the other came home: the
    // deed was begun, not done — through no fault: `short`)
    const why = !db || db.dead || db.downed || db.captive || db.gone ? 'hurt' : !p.seenOut ? 'notNeeded' : C.alarm || w.campaign.foes?.length ? 'busy' : p.took ? 'short' : (db.traits || []).includes('lazy') ? 'ignored' : 'busy';
    return {id: p.id, state: 'open', why};
  });
  const bonds = {};   // what each member present came to feel for the others there, by member id (campaign/social.js takeBonds)
  for (const m of S.members) { const ag = C.people.get(m.id), row = {}; for (const [id, v] of Object.entries(ag?.grudge || {})) { const b = C.memberOf?.get(+id); if (b != null) row[b] = v; } bonds[m.id] = row; }
  // who can bind the fallen is settled before any fate is resolved: one bound here does not become the helper of the next
  // (Р2-02 — the fates do not hang on the order of the members)
  const standing = [...C.people.values()].filter(o => !o.dead && !o.downed && !o.captive && !o.gone && !o.fugitive);
  const members = S.members.map(m => {
    const ag = C.people.get(m.id);
    if (ag?.fugitive && !ag.dead) return {id: m.id, alive: false, escaped: true};   // a captive got away (settlement/escape.js)
    if (ag?.gone && !ag.dead && !ag.fugitive) return {id: m.id, alive: false, taken: true, seen: C.seenFate?.[m.id] || []};   // led off over the edge by a raider (agents/behaviours/led.js): alive, but no more with the caravan
    if (!ag || ag.dead) return {id: m.id, alive: false, cause: (ag && w.chronicle.people.find(p => p.id === ag.id)?.cause) || 'погиб', seen: C.seenFate?.[m.id] || null};
    // a fallen one still senseless when the camp ends: the others bind the wound (agents/wounds.js dress) — a grave wound
    // and the trauma it fell with, barely alive. Only if there are others to do it: one of the company on its feet and free
    // when the camp ends (plan claude/caravan-ver_d.md D4.9: no help from nowhere) — the binding is theirs, as a group, a fact
    // with no single saviour; with nobody to bind it, the wound takes its course
    const wasDown = !!ag.downed;
    if (wasDown) {
      const able = standing.some(o => o !== ag);
      if (!able && !ag.downed.maim) return {id: m.id, alive: false, cause: m.gender === 'f' ? 'истекла кровью: перевязать было некому' : 'истёк кровью: перевязать было некому'};
      // a maimed one is stable (data/wounds.js DEATHBLOW.maim): alone, it comes to by itself — the maim is its for life, but
      // nobody bound it, so no fact of the company's binding
      bindFallen(w, ag); if (able) noteFact(w, 'boundAfter', null, ag, {});
    }
    const local = {likes: ag.likes, dislikes: ag.dislikes, prefs: ag.prefs, traits: ag.traits, food: ag.food, own: ag.own, skill: ag.skill, leans: ag.leans};
    const cap = ag.captive ? {will: ag.captive.will, resigned: ag.captive.resigned ?? null, service: ag.captive.service || 0} : null;
    return {id: m.id, alive: true, potions: ag.potions || 0, belt: [...(ag.belt || [])], wounds: (ag.wounds || []).filter(x => x.until == null || x.until > w.tick).map(x => ({id: x.id, ticks: x.until == null ? null : ofSun(w, x.until - w.tick)})), marks: ag.marks?.length ? ag.marks.filter(id => id !== 'officer' && id !== 'wight') : null, effects: (ag.effects || []).filter(e => e.until > w.tick).map(e => ({id: e.id, ticks: ofSun(w, e.until - w.tick)})), hp: Math.max(0.05, Math.min(1, ag.hp / maxHp(ag))) * (wasDown ? 0.5 : 1), local: JSON.parse(JSON.stringify(local)), align: ag.align ? {...ag.align} : null, mood: moodOut(S.day, w.tick, ag.diary, w), ...(cap ? {captive: cap} : {}), maimed: [...(ag.maimedNow || [])], scarsAt: {...(ag.scarsAt || {})}, acts: {...(ag.acts || {})}, actXp: {...(ag.actXp || {})}, practiced: {...(ag.practiced || {})}};   // (acts: what it did here by its own hand — agents/acts.js, campaign/experience.js)
  });
  const beasts = S.beasts.map(b => {
    const ag = C.herd.get(b.id);
    if (!ag) return {id: b.id, alive: false, stolen: false};
    if (ag.stolen) return {id: b.id, alive: false, stolen: true};
    if (ag.dead || (!ag.tame && !ag.warBeast && !SPECIES.get(ag.species).mechanism) || ag.gone || ag.hp / maxHp(ag) <= CAMP.beastGone) return {id: b.id, alive: false, stolen: false, bolted: !ag.dead};
    return {id: b.id, alive: true, hp: Math.min(1, ag.hp / maxHp(ag))};
  });
  // the stores: food back as rations, goods as they are (with what the dead foes and the hunt gave)
  const carried = [...C.people.values()].filter(ag => !ag.dead).reduce((v, ag) => v + Object.entries(ag.carry?.res || {}).reduce((t, [id, n]) => t + (FOODS.has(id) ? n * FOODS.get(id).nutrition : 0), 0), 0);
  const food = Math.max(0, (foodNow(w) + carried) / CAMP.perRation);
  // what the stores gained (the hunt, the gathering, the dead foes)
  const works = worksOutcome(w);   // the hides cured on the racks (into the stores), the stakes cut here (campaign/works.js)
  const got = {};
  for (const [id, n] of Object.entries(w.stock)) { const d = n - (C.stock0[id] || 0); if (d >= 1) got[id] = Math.floor(d); }
  const cargo = {};
  for (const id of new Set([...Object.keys(S.cargo || {}), ...CAMP.carry])) { const n = Math.floor((w.stock[id] || 0) + 1e-6); if (n > 0) cargo[id] = n; }
  // gear from the foes' dead (agents/agent.js kill: into the armory)
  const items = w.armory.filter(it => it.dur > 0 && !it.own && it.handedBy == null && ITEMS.has(it.type)).map(gearToken);   // (a captive's tool handed in for the night is no loot)
  // a boss that must die (the fourth, campaign/epic.js) — dead or bound; a miniboss driven off frees its grave as well
  const bossDead = C.boss && S.foe?.boss?.mustDie ? !!C.boss.dead || !!C.boss.captive : null;
  const killed = C.foeObjs.filter(o => o.dead).length, fled = C.foeObjs.filter(o => !o.dead && !o.captive && (o.gone || o.task?.id === 'leave')).length;
  // the fallen foes the caravan bound (settlement/captives.js): they walk on with it
  const taken = w.agents.filter(o => o.captive && !o.captive.member && !o.dead && !o.fugitive).map(o => ({
    name: o.name, gender: o.gender, race: o.species, people: o.people || null, person: o.person || null, special: {...o.special}, align: o.align ? {...o.align} : null, values: o.values ? [...o.values] : null,
    hp: Math.max(0.05, Math.min(1, o.hp / maxHp(o))), bonds: o.captive.bonds, wounds: (o.wounds || []).filter(x => x.until == null || x.until > w.tick).map(x => ({id: x.id, ticks: x.until == null ? null : ofSun(w, x.until - w.tick)})), from: S.foe?.kind || null, will: o.captive.will,
    gear: {hand: [...new Set([...allItems(o), ...w.armory.filter(it => it.handedBy === o.id)].filter(it => itemOf(it).slot === 'hand').map(gearToken))].filter(id => !!gearDef(id)), body: (b => (b ? gearToken(b) : 'clothes'))(allItems(o).find(it => itemOf(it).slot === 'body'))},
    local: JSON.parse(JSON.stringify({likes: o.likes, dislikes: o.dislikes, prefs: o.prefs, traits: o.traits, food: o.food, own: o.own, skill: o.skill, leans: o.leans}))}));
  const plundered = w.stats.lastSteal >= C.start;
  const lost = members.filter(m => !m.alive).length, stolen = beasts.filter(b => b.stolen).length;
  // the camp: a building that burnt is lost; the vehicles: a cart may be broken where the foe looted the stores
  const burnt = C.built.filter(b => !w.buildings.some(x => x.id === b.id)).map(b => b.key);
  const vehicles = S.vehicles.map(v => ({k: v.k, wrecked: plundered && C.rnd() < CAMP.wreck}));
  const n = C.foeObjs.length;
  // for the fight's record (campaign/stats.js): who came, the boss's fate, who of the caravan killed whom
  const species = {}; for (const o of C.foeObjs) species[o.species] = (species[o.species] || 0) + 1;
  const B = C.boss, boss = B ? {name: B.name, species: B.species, dead: !!B.dead, bound: !!B.captive, fled: !B.dead && !B.captive && (!!B.gone || B.task?.id === 'leave'), hp: B.dead ? 0 : Math.round(B.hp / maxHp(B) * 100) / 100} : null;
  const kills = {}; for (const m of S.members) { const ag = C.people.get(m.id); const k = (ag?.stats?.raiders || 0) + (ag?.stats?.wolves || 0); if (k) kills[m.id] = k; }
  const down = killed + taken.length + (S.kind === 'guard' ? fled : 0);   // a foe bound counts as one beaten; one that fled a stormed place, too
  // a storm with a boss in it is won only when the boss is dead (or bound)
  // (a storm is won only by beating its guards: standing unhurt before them is not taking the place; all of them beaten —
  // taken, whatever it cost)
  const won = (!n ? true : S.kind === 'guard' ? down >= n || (down > 0 && down >= lost && down * 2 >= n) : lost === 0 ? !plundered || down > 0 : down >= lost && !plundered) && bossDead !== false;
  const found = cachesOutcome(w, won);   // the caches searched on the map, and the rest in the morning if the field is ours
  return {kind: S.kind, day: S.day, session: S.seed, won, bossDead, found, members, bonds, promises, works, facts: (C.facts || []).map(f => ({...f, saw: [...f.saw], params: {...f.params}})), beasts, food: round1(food), got, cargo, items, vehicles, burnt, potions: w.chronicle.potions?.ours || 0, plundered, stolen, taken,
    foes: {n, killed, taken: taken.length, fled, left: n - killed - fled - taken.length, species, boss, might: C.foeMight || 0, weight: C.weight ?? null}, ours: {might: C.ourMight || 0, kills}, ticks: w.tick - C.start, lines: campLines(w)};
}

// a fingerprint of an outcome: the same setup must play out the same (the screen plays it again)
export const outcomeHash = o => `${o.won ? 'w' : 'l'}:${o.members.map(m => (m.alive ? Math.round(m.hp * 100) : 'x')).join(',')}:${o.beasts.map(b => (b.alive ? 1 : 0)).join('')}:${o.food}:${o.foes.killed}/${o.foes.n}`;

// the local map's journal, for the campaign's log: the lines that matter (deaths, the foe, the loot), oldest first
function campLines(w) {
  return (w.logLines || []).filter(l => ['danger', 'death'].includes(l.topic) || l.level === 'alert').slice(0, 12).reverse()
    .map(l => `${l.when.replace(/^День \d+, /, '')} ${l.html.replace(/<[^>]+>/g, '')}`);
}
