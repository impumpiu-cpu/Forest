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
import {createWorld} from '../world/generate.js';
import {Navigation} from '../nav/navigation.js';
import {step} from '../sim.js';
import {PROVIDERS} from '../outside/index.js';
import {spawnGroup} from '../settlement/migration.js';
import {MIGRATIONS} from '../data/migrations.js';
import {createAgent, maxHp} from '../agents/agent.js';
import {refreshBody} from '../agents/special.js';
import {sideStrength, strengthOf, expectedStrength} from '../agents/strength.js';
import {dress, def, gearDef, gearToken, gearType} from '../agents/equipment.js';
import {makeTame} from '../settlement/herd.js';
import {putUp} from '../settlement/buildings.js';
import {raidThreat} from '../settlement/threat.js';
import {recordOf} from '../settlement/chronicle.js';
import {walkable} from '../world/grid.js';
import {FAR} from '../nav/navigation.js';
import {cellPlan} from '../seam/cell.js';
import {mulberry, seedNumber} from '../core/rng.js';
import {DAY, HOUR} from '../core/time.js';
import {SEASON_DAYS} from '../data/seasons.js';
import {DEFAULT_CFG} from '../data/presets.js';
import {FOODS} from '../data/foods.js';
import {RESOURCES} from '../data/resources.js';
import {ITEMS} from '../data/items.js';
import {SPECIES} from '../data/species.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {ORES} from '../data/ores.js';
import {CAMP, CAMP_FOES, GAME_FLOW} from '../data/camp.js';
import {FOES, GAME} from '../data/campaign.js';
import {faunaLevel} from '../world/region.js';
import {BEASTS} from '../data/transport.js';
import {bindWaiting} from '../settlement/captives.js';
import {allItems, def as itemOf} from '../agents/equipment.js';

// the camp's border with the world: nobody comes by schedule — the campaign sends the foe itself
PROVIDERS.register({id: 'camp', label: 'Стоянка каравана', flows: {}, distance: () => null, receive() {}});

const alive = K => K.members.filter(m => m.alive);
const round1 = v => Math.round(v * 10) / 10;

// ── the setup: the camp as plain data.  ev = {kind: 'night' | 'ambush' | 'stop', foe?, dayIn (the day of the season)}
//   foe = {kind (data/campaign.js FOES), strength, label, band?, beast?} — what of the bubble came
export function campSetup(a, K, ev) {
  const race = WORLD_PEOPLES.get(K.people).race;
  const plan = cellPlan(a, K.i, {name: 'Стоянка', race});
  // the second camp of a kind on the same day gets a seed of its own (the first keeps the old one)
  const n = (K.camps || []).filter(c => c.day === K.day && c.kind === ev.kind).length;
  return {
    day: K.day, year: a.hist.year, kind: ev.kind, seed: `${K.seed}:camp:${K.day}:${ev.kind}${n ? `:${n}` : ''}`, i: K.i,
    startDay: a.hist.season * SEASON_DAYS + (ev.dayIn ?? 0), plan, people: K.people,
    members: alive(K).map(m => ({id: m.id, name: m.name, gender: m.gender, race: m.race, people: m.people, role: m.role, special: m.special,
      align: m.align, values: m.values, hp: m.hp, gear: {hand: [...m.gear.hand], body: m.gear.body}, local: m.local || null, captive: m.captive ? {...m.captive} : null, master: m.master ? {...m.master} : null, former: m.former ? {...m.former} : null, loyalty: m.loyalty ?? null})),
    beasts: K.beasts.filter(b => b.hp > 0).map(b => ({id: b.id, kind: b.kind, hp: b.hp})),
    vehicles: K.vehicles.map((v, k) => ({k, kind: v.kind, building: v.building || null})),
    food: K.food, cargo: {...K.cargo},
    // a stop to dig: the ore the council stopped for (campaign/march.js wantMine); only it is dug on the map
    dig: K.why?.startsWith('mine:') && K.why.slice(5) !== 'placer' ? K.why.slice(5) : null,
    foe: ev.foe ? {kind: ev.foe.kind, strength: ev.foe.strength ?? 1, label: ev.foe.label || FOES[ev.foe.kind].label, band: ev.foe.band || null, beast: ev.foe.beast || null, boss: ev.foe.boss || null, leaderLair: ev.foe.leaderLair || null} : null,
  };
}

// the hours of a camp: when it begins, when the foe comes, when it ends at the latest (ticks)
function hours(S, r) {
  const H = CAMP[S.kind] && S.kind !== 'night' ? CAMP[S.kind] : CAMP.night;
  const t0 = Math.round(H.from * HOUR), wrap = h => (h < H.from ? h + 24 : h);
  const until = Math.round(wrap(H.until) * HOUR);
  const come = H.come ? Math.round(wrap(H.come[0] + r() * (H.come[1] - H.come[0] + (H.come[1] < H.come[0] ? 24 : 0))) * HOUR) : null;
  return {t0, until, come};
}

// ── the camp's world
export function openCamp(S) {
  const plan = S.plan;
  const cfg = {...DEFAULT_CFG, name: 'Стоянка', seed: S.seed, size: 'small', dims: CAMP.size, colonists: 0, stock: 'poor', start: 'spring',
    raids: 'off', light: true, provider: 'camp', cell: {...plan, extra: {...plan.extra, startDay: S.startDay}}};
  const w = createWorld(cfg);
  // an open-cut face is dug only on a stop to dig, and only for the ore it was for (settlement/query.js wantedOre)
  w.campDig = S.dig && ORES.has(S.dig) ? new Set([ORES.get(S.dig).code]) : new Set();
  w.scratch = null;   // what was counted for this tick before the camp knew what it digs
  w.nav = new Navigation(w); w.nav.buildAll();
  w.perf = {fields: 0, nav: 0, agents: 0, render: 0};
  const r = mulberry(seedNumber(S.seed + ':plan')), H = hours(S, r);
  w.tick = H.t0;
  w.campaign = {S, foeAt: H.come, until: H.until, spawned: !S.foe, foes: [], foeObjs: [], people: new Map(), herd: new Map(), quiet: null, built: [], start: H.t0, rnd: r};
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
    ag.member = m.id; w.campaign.people.set(m.id, ag); ag.name = m.name; ag.gender = m.gender; ag.people = m.people;
    ag.special = {...m.special}; if (m.align) ag.align = {...m.align}; if (m.values) ag.values = [...m.values];
    const L = m.local;
    if (L) Object.assign(ag, {likes: L.likes, dislikes: L.dislikes, prefs: {...L.prefs}, traits: [...L.traits], food: {...L.food}, own: {...L.own}, skill: {...L.skill}});
    else {
      for (const [id, v] of Object.entries(CAMP.skills[m.role] || {})) ag.skill[id] = Math.max(ag.skill[id] || 0, v);
      for (const tok of m.gear.hand) { const id = gearType(tok); if (CAMP.tools[id]) ag.skill[CAMP.tools[id]] = Math.max(ag.skill[CAMP.tools[id]] || 0, CAMP.toolSkill); }   // (a bought or forged piece is a word with marks: «ironaxe@dwarf»)
    }
    const rec = recordOf(w, ag); if (rec) rec.name = m.name;
    if (m.master) ag.master = {skill: m.master.skill, since: w.tick, workedAt: -1};
    if (m.former) ag.former = {since: w.tick, bond: m.loyalty ?? 0.6, fought: false};   // a former slave: no arms (settlement/freedom.js)   // a master of the caravan (campaign/masters.js)
    // a captive of the caravan stays one on the map (settlement/captives.js)
    if (m.captive) { ag.captive = {since: w.tick, bonds: m.captive.bonds, by: null, band: null, people: m.people || null, was: 'raiders', member: true, will: m.captive.will, resigned: m.captive.resigned ?? null, service: m.captive.service || 0}; if (rec) rec.captive = true; }
    refreshBody(ag); ag.hp = maxHp(ag) * Math.max(0.05, Math.min(1, m.hp));
    dress(ag, [...m.gear.hand, m.gear.body].filter(id => !!gearDef(id)), CAMP.arrows);
    for (const it of Object.values(ag.equip)) if (it) it.own = m.id;   // the caravan's own: not loot when a fallen one's gear is stripped
    for (const n of Object.keys(ag.needs)) ag.needs[n] = Math.max(ag.needs[n], 0.75);
    ag.needs.rest = CAMP.rest[S.kind] ?? 0.85;   // a day's march behind them
    if (S.kind === 'stop') ag.needs.food = 1;   // the day's meal is the campaign's: on the map they hunt and gather
  });
  w.founding = false;
  // the beasts by the camp
  S.beasts.forEach((b, k) => {
    const [x, y] = ring(k + 0.5, Math.max(3, S.beasts.length), 4);
    const sp = BEASTS[b.kind].species || b.kind, ag = createAgent(w, sp, 'herd', x, y);
    makeTame(w, ag, null, true);
    ag.age = SPECIES.get(sp).tame?.grownDays || 0; ag.wool = 0; ag.beast = b.id; w.campaign.herd.set(b.id, ag);
    ag.hp = maxHp(ag) * Math.max(0.1, Math.min(1, b.hp));
  });
  // a packed building put up by the fire
  const packed = S.vehicles.filter(v => v.building);
  // a stop: the land's game comes out onto the meadows
  if (S.kind === 'stop') stockGame(w, r);
  w.campaign.food0 = foodNow(w); w.campaign.stock0 = {...w.stock};
  w.campaign.ourMight = sideStrength([...w.campaign.people.values()].filter(ag => !ag.captive), {now: true});   // the caravan's fighting strength as it stands, wounds and all (the foe's budget, the fight's record: campaign/stats.js)
  // (on the march, after an ambush, the building stays packed)
  if (S.kind === 'night' || S.kind === 'stop') for (const v of packed) { const b = putUp(w, v.building, CAMP.deploy); if (b) w.campaign.built.push({k: v.k, id: b.id}); }
  w.logLines = [];
  return w;
}

function stockGame(w, r) {
  for (const sp of Object.keys(GAME)) {
    const flow = GAME_FLOW[sp] || sp; if (!MIGRATIONS.has(flow) || !SPECIES.has(sp)) continue;
    const lvl = faunaLevel(w, sp); if (lvl <= 0) continue;
    const n = Math.round(CAMP.stop.game * Math.min(2, lvl) * (0.4 + r()) * (GAME[sp] >= 0.8 ? 1 : 1.5));
    if (n > 0) spawnGroup(w, flow, n, {minDist: 10});
  }
}

const foodNow = w => FOODS.all().reduce((s, f) => s + (w.stock[f.id] || 0) * f.nutrition, 0);

// the foe comes: a band of raiders (data/raids.js) or a pack of beasts, at the edge or close by
// the weight of a fight on the caravan's strength (data/camp.js CAMP.foe): a chance meeting lighter, a named foe heavier,
// and a sway at random on top. Shared with the quick mode (campaign/fight.js autoFight)
export function foeWeight(r, F, kind) {
  const B = CAMP.foe, named = F.boss ? (F.boss.mustDie ? B.boss : F.leaderLair ? B.leader : B.mini) : null;
  const base = named ?? (kind === 'guard' || F.kind === 'army' ? B.force : B.skirmish[0] + r() * (B.skirmish[1] - B.skirmish[0]));
  return Math.max(0.1, base + (2 * r() - 1) * B.sway);
}

function spawnFoe(w) {
  const C = w.campaign, S = C.S, F = S.foe, map = CAMP_FOES[F.kind] || {}, r = C.rnd;
  const close = S.kind === 'ambush' || S.kind === 'guard', at = close ? nearCell(w, CAMP[S.kind].near, r) : null;
  const opts = {minDist: close ? CAMP[S.kind].near : CAMP.far, ...(at != null ? {at} : {})};
  const beast = F.beast || map.beast, band = F.band || map.band;
  // the foe is bought by the caravan's strength (campSetup: C.ourMight — everyone who stands in the fight, with all
  // they wear) × the fight's weight (foeWeight), never by the thing's own strength: a caravan in copper is not sent
  // against a boss bought for a caravan in steel. The heads are rounded up (data/raids.js fill `up`)
  const t = raidThreat(w), budget = C.ourMight * foeWeight(r, F, S.kind);
  C.weight = Math.round(budget / Math.max(1e-6, C.ourMight) * 100) / 100;   // for the fight's record
  let group = [];
  if (beast && MIGRATIONS.has(beast)) {
    const n = Math.min(CAMP.foe.most, Math.max(1, F.boss ? CAMP.boss.atLeast : 1, Math.ceil(budget / expectedStrength(MIGRATIONS.get(beast).species, {key: 'wild'}))));   // a wild beast comes as it is, no band's body or kit
    group = spawnGroup(w, beast, n, opts);
    for (const g of group) { g.needs.food = Math.min(g.needs.food ?? 1, 0.2); g.hunger = true; }   // they came for a meal
  } else {
    // the threat the band carries its gear by: × the thing's strength (settlement/threat.js reads w.fame on top)
    const want = CAMP.threat * F.strength * (map.threat || 1);
    w.fame = 0; w.fame = want - raidThreat(w);
    // the band counted out in strength rating (data/raids.js fill): the budget, rounded up by heads, the bands' caps lifted
    group = spawnGroup(w, 'raiders', budget, {...opts, band: band || 'bandits', fill: {up: true, max: {}}, atLeast: F.boss ? CAMP.boss.atLeast : 0});
  }
  // the guards of a place stormed (campaign/quest.js) defend it to the last: their band does not break and flee
  if (S.kind === 'guard') for (const id of new Set(group.map(g => g.squad).filter(x => x != null))) {
    const sq = w.squads?.[id]; if (sq) { sq.kind = 'mindless'; sq.goal = 'slaughter'; }
  }
  // the beasts of the fourth's lair hold it to the last as well (agents/behaviours/maul.js defendLair); a grave's may be driven off
  if (S.kind === 'guard' && F.boss?.mustDie) for (const g of group) if (SPECIES.get(g.species)?.predator) g.defend = true;
  // a boss (campaign/epic.js): the strongest of them, grown past its kind — named, at full health
  if (F.boss && group.length) {
    const own = group.filter(g => g.species === F.boss.species), b = (own.length ? own : group).slice().sort((p, q) => maxHp(q) - maxHp(p))[0];   // its own kind, if it came
    b.special = {...b.special}; for (const [id, v] of Object.entries(F.boss.add || {})) b.special[id] = (b.special[id] ?? 5) + v;
    refreshBody(b); b.hp = maxHp(b); b.name = F.boss.name; b.boss = true; C.boss = b;
    // grown, it is worth more than the budget bought: the weakest of its retinue go, while what is left still covers the budget
    for (;;) {
      const rest = group.filter(g => g !== b).sort((p, q) => strengthOf(p, {now: true}) - strengthOf(q, {now: true}));
      if (group.length <= CAMP.boss.atLeast || !rest.length || sideStrength(group, {now: true}) - strengthOf(rest[0], {now: true}) < budget) break;
      rest[0].gone = true; group.splice(group.indexOf(rest[0]), 1);   // never came (the map drops the gone)
    }
    // the boss's aura (agents/auras.js): its side stands while it stands; its band's leader is an officer who holds to the end
    b.auras = [...(b.auras || []), 'lead'];
    for (const id of new Set(group.map(g => g.squad).filter(x => x != null))) { const sq = w.squads?.[id]; if (sq) { sq.goal = 'slaughter'; const l = group.find(g => g.id === sq.leader); if (l && l !== b) l.officer = true; } }
  }
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

const foesLeft = w => w.agents.filter(o => w.campaign.foes.includes(o.id) && !o.dead && !o.gone && !o.downed && !o.captive && o.task?.id !== 'leave').length;   // the fallen and the bound are out of it

// a tick of the camp
export function stepCamp(w) {
  const C = w.campaign;
  if (!C.spawned && w.tick >= C.foeAt) spawnFoe(w);
  step(w);
  // a raider who looted the stores leads off a beast that stands by
  if (w.tick % 10 === 0) for (const o of w.agents) {
    if (o.faction !== 'raiders' || o.dead || !o.looted || o.task?.id !== 'leave' || o.leads) continue;
    const b = w.agents.find(x => x.tame && !x.dead && !x.ledBy && Math.hypot(x.x - o.x, x.y - o.y) < 2.5);
    if (b) { b.ledBy = o.id; b.brain = 'led'; o.leads = b.id; }   // the brain `led` (agents/behaviours/led.js): it follows him and is gone with him
  }
  if (C.boss && !C.bossFell && (C.boss.dead || C.boss.captive)) C.bossFell = w.tick;   // the aura is gone with it: its band may break now (agents/squad.js)
  if (C.spawned && C.foes.length) {
    if (foesLeft(w) === 0) C.quiet ??= w.tick; else C.quiet = null;
  }
}

export function campDone(w) {
  const C = w.campaign;
  if (w.over || !w.agents.some(a => a.faction === 'colony' && !a.dead)) return true;
  if (w.tick >= C.until) return true;
  // the foe is beaten or gone, and an hour passed quietly (the wounded tended, the fire made up)
  // (the camp waits for its own fallen to be helped, and for the fallen foes to be bound while there are bonds)
  return C.S.kind !== 'stop' && C.spawned && C.quiet != null && w.tick - C.quiet >= CAMP.quiet * HOUR && !w.agents.some(a => a.downed && !a.dead && a.faction === 'colony') && !bindWaiting(w);
}

// play a camp through; → the world at its end
export function runCamp(S) {
  const w = openCamp(S);
  for (let guard = 0; guard < 2 * DAY && !campDone(w); guard++) stepCamp(w);
  return w;
}

// ── what came out of it (the agents are kept by reference: the dead and the gone leave w.agents)
export function campOutcome(w) {
  const C = w.campaign, S = C.S;
  const members = S.members.map(m => {
    const ag = C.people.get(m.id);
    if (ag?.fugitive && !ag.dead) return {id: m.id, alive: false, escaped: true};   // a captive got away (settlement/escape.js)
    if (!ag || ag.dead) return {id: m.id, alive: false, cause: (ag && w.chronicle.people.find(p => p.id === ag.id)?.cause) || 'погиб'};
    const local = {likes: ag.likes, dislikes: ag.dislikes, prefs: ag.prefs, traits: ag.traits, food: ag.food, own: ag.own, skill: ag.skill};
    // a fallen one still bleeding when the camp ends: the others bind the wound — barely alive
    const cap = ag.captive ? {will: ag.captive.will, resigned: ag.captive.resigned ?? null, service: ag.captive.service || 0} : null;
    return {id: m.id, alive: true, hp: Math.max(0.05, Math.min(1, ag.hp / maxHp(ag))) * (ag.downed ? 0.5 : 1), local: JSON.parse(JSON.stringify(local)), ...(cap ? {captive: cap} : {})};
  });
  const beasts = S.beasts.map(b => {
    const ag = C.herd.get(b.id);
    if (!ag) return {id: b.id, alive: false, stolen: false};
    if (ag.stolen) return {id: b.id, alive: false, stolen: true};
    if (ag.dead || !ag.tame || ag.gone || ag.hp / maxHp(ag) <= CAMP.beastGone) return {id: b.id, alive: false, stolen: false, bolted: !ag.dead};
    return {id: b.id, alive: true, hp: Math.min(1, ag.hp / maxHp(ag))};
  });
  // the stores: food back as rations, goods as they are (with what the dead foes and the hunt gave)
  const carried = [...C.people.values()].filter(ag => !ag.dead).reduce((v, ag) => v + Object.entries(ag.carry?.res || {}).reduce((t, [id, n]) => t + (FOODS.has(id) ? n * FOODS.get(id).nutrition : 0), 0), 0);
  const food = Math.max(0, (foodNow(w) + carried) / CAMP.perRation);
  // what the stores gained (the hunt, the gathering, the dead foes)
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
    name: o.name, gender: o.gender, race: o.species, people: o.people || null, special: {...o.special}, align: o.align ? {...o.align} : null, values: o.values ? [...o.values] : null,
    hp: Math.max(0.05, Math.min(1, o.hp / maxHp(o))), bonds: o.captive.bonds, from: S.foe?.kind || null, will: o.captive.will,
    gear: {hand: [...new Set([...allItems(o), ...w.armory.filter(it => it.handedBy === o.id)].filter(it => itemOf(it).slot === 'hand').map(gearToken))].filter(id => !!gearDef(id)), body: (b => (b ? gearToken(b) : 'clothes'))(allItems(o).find(it => itemOf(it).slot === 'body'))},
    local: JSON.parse(JSON.stringify({likes: o.likes, dislikes: o.dislikes, prefs: o.prefs, traits: o.traits, food: o.food, own: o.own, skill: o.skill}))}));
  const plundered = w.stats.lastSteal >= C.start;
  const lost = members.filter(m => !m.alive).length, stolen = beasts.filter(b => b.stolen).length;
  // the vehicles: a building that burnt is lost; a cart may be broken where the foe looted the stores
  const vehicles = S.vehicles.map(v => {
    const b = C.built.find(x => x.k === v.k);
    return {k: v.k, wrecked: plundered && C.rnd() < CAMP.wreck, burnt: !!b && !w.buildings.some(x => x.id === b.id)};
  });
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
  return {kind: S.kind, day: S.day, won, bossDead, members, beasts, food: round1(food), got, cargo, items, vehicles, plundered, stolen, taken,
    foes: {n, killed, taken: taken.length, fled, left: n - killed - fled - taken.length, species, boss, might: C.foeMight || 0, weight: C.weight ?? null}, ours: {might: C.ourMight || 0, kills}, ticks: w.tick - C.start, lines: campLines(w)};
}

// a fingerprint of an outcome: the same setup must play out the same (the screen plays it again)
export const outcomeHash = o => `${o.won ? 'w' : 'l'}:${o.members.map(m => (m.alive ? Math.round(m.hp * 100) : 'x')).join(',')}:${o.beasts.map(b => (b.alive ? 1 : 0)).join('')}:${o.food}:${o.foes.killed}/${o.foes.n}`;

// the local map's journal, for the campaign's log: the lines that matter (deaths, the foe, the loot), oldest first
function campLines(w) {
  return (w.logLines || []).filter(l => ['danger', 'death'].includes(l.topic) || l.level === 'alert').slice(0, 12).reverse()
    .map(l => `${l.when.replace(/^День \d+, /, '')} ${l.html.replace(/<[^>]+>/g, '')}`);
}
