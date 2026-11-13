// The contracts of the world for the guild (data/contracts.js; plan claude/guild-plan.md Г2; docs/GUILD.md «Договоры»): a town or
// a realm posts a need and puts its gold aside for it (the reserve, out of its own treasury — the author's word 13.11); the
// guild takes it, sends its people, and is paid out of the reserve when it is handed in — or the reserve goes back. A goal is
// a living lair of the world (as an errand picks it) or a camp put up for this contract alone (a temporary lair, not of the
// world's lairs: no raids, no growth, gone with the contract). The stories (CHAINS) are contracts posted one after another.
//   a.contracts = {v, nextId, records, camps, chains}
//   record — {id, uid, tmpl, chain, side, tier, label, about, story, issuer {kind, id}, escrow, posted, until, state, why, target,
//             known, at, s, days, completeBy, by}; state: open → accepted → paid, or closed (why: the offer ran out, the target
//             went, the deadline, the party lost, the guild let it go)
//   camp   — {id, contract, kind, lair | band, label, i, x, y, s, alive}
// Chance: the guild's own stream (campaign/guild.js gdraw) is handed in; nothing here draws of its own.
import {CONTRACT, CONTRACTS, CHAINS} from '../data/contracts.js';
import {GUILD} from '../data/guild.js';
import {ERRANDS} from '../data/errands.js';
import {LAIRS} from '../data/lairs.js';
import {QUEST} from '../data/quest.js';
import {CAMPAIGN} from '../data/campaign.js';
import {CAMP} from '../data/camp.js';
import {scaleOf, wherePhrase, cultPool, townLabel} from '../atlas/index.js';
import {cellDist} from '../core/util.js';
import {reachable, places, layClues, circle} from './quest.js';
import {lairTargets, lairErrand, riskWord, lairFacts} from './errands.js';
import {lairGuard, garrison, lairDanger} from './land.js';
import {caravanMight} from './march.js';

export const contractsOf = a => (a.contracts ||= {v: 1, nextId: 1, records: [], camps: [], chains: []});
export const contractOf = (a, uid) => a.contracts?.records.find(c => c.uid === uid) || null;
export const campOf = (a, id) => a.contracts?.camps.find(c => c.id === id) || null;
const stub = t => ({home: t.i, people: t.people, realm: t.realm, capital: t.id});
const rng = (r, [lo, hi]) => lo + Math.floor(r() * (hi - lo + 1));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

// who pays: up to the tier CONTRACT.issuer.town the towns of the guild's realm (its own first, then the richest), above it the
// realm (its crown, then its towns); the first of them with gold enough for the least of the tier — and when the guild's own
// realm has none, the other realms' towns and crowns, the richest first (a guild's name goes beyond its borders)
function issuerFor(a, G, tier) {
  const t = a.towns.find(x => x.id === G.town), R = (a.realms || []).find(x => x.id === t?.realm && x.fallen == null);
  const towns = a.towns.filter(x => x.alive && x.realm === t?.realm).sort((p, q) => (q.id === G.town) - (p.id === G.town) || (q.gold || 0) - (p.gold || 0)).map(x => ({kind: 'town', id: x.id}));
  const realm = R ? [{kind: 'realm', id: R.id}] : [], own = tier <= CONTRACT.issuer.town ? [...towns, ...realm] : [...realm, ...towns];
  const others = [...a.towns.filter(x => x.alive && x.realm !== t?.realm).map(x => ({kind: 'town', id: x.id, g: x.gold || 0})),
    ...(a.realms || []).filter(x => x.fallen == null && x.id !== t?.realm).map(x => ({kind: 'realm', id: x.id, g: x.gold || 0}))].sort((p, q) => q.g - p.g || p.id - q.id).map(({kind, id}) => ({kind, id}));
  const order = [...own, ...others];
  const need = CONTRACT.least * CONTRACT.pay[tier][0] / CONTRACT.share;
  return order.find(x => (holder(a, x)?.gold || 0) >= need) || order[0] || null;
}
function holder(a, iss) {
  if (!iss) return null;
  if (iss.kind === 'town') { const t = a.towns.find(x => x.id === iss.id); return t?.alive ? t : null; }
  const R = (a.realms || []).find(x => x.id === iss.id); return R && R.fallen == null ? R : null;
}
export function issuerName(a, iss) {
  const h = holder(a, iss); if (!h) return 'никто';
  return iss.kind === 'town' ? `${townLabel(h, 0)} ${h.name}` : `держава ${h.name}`;   // (townLabel 0: «город», «крепость»…)
}
// the reserve: out of the issuer's treasury, at most `share` of it; a one-off that cannot put aside enough is not posted
function reserve(a, iss, tier, r, must) {
  const h = holder(a, iss), want = rng(r, CONTRACT.pay[tier]), have = Math.max(0, h?.gold || 0);
  const take = Math.min(want, Math.floor(have * CONTRACT.share));
  if (!must && take < CONTRACT.least * CONTRACT.pay[tier][0]) return null;
  if (h && take > 0) h.gold = Math.round((h.gold - take) * 10) / 10;
  return take;
}
function refund(a, rec) {
  const h = holder(a, rec.issuer);
  if (h && rec.escrow > 0) h.gold = Math.round((h.gold + rec.escrow) * 10) / 10;
  rec.escrow = 0;
}

// a camp put up for a contract: a cell reachable from the guild's town, `days` of walk away (CONTRACT.camp)
function placeCamp(a, G, tier, spec, s, r) {
  const t = a.towns.find(x => x.id === G.town), {cells} = reachable(a, stub(t)), day = CAMPAIGN.speed * scaleOf(a);
  const [lo, hi] = CONTRACT.camp.days[tier], taken = new Set(contractsOf(a).camps.filter(c => c.alive).map(c => c.i));
  const at = cells.filter(i => !taken.has(i)).map(i => ({i, d: cellDist(a, t.i, i) / day}));
  let pool = at.filter(c => c.d >= lo && c.d <= hi);
  if (!pool.length) pool = at.filter(c => c.d <= hi).sort((p, q) => q.d - p.d).slice(0, 8);   // (a small world: the farthest it has)
  if (!pool.length) return null;
  const {i, d} = pool[Math.floor(r() * pool.length)], C = contractsOf(a);
  const camp = {id: C.nextId++, contract: null, kind: spec.lair ? 'lair' : spec.band, lair: spec.lair || null, band: spec.band || null,
    label: `${spec.name} — ${wherePhrase(a, i)}`, name: spec.name, i, x: i % a.w + 0.5, y: ((i / a.w) | 0) + 0.5, s: Math.round(s * 100) / 100, alive: true, days: Math.max(1, Math.round(d))};
  C.camps.push(camp);
  return camp;
}
// the guard of a camp on the local map: the folk of its kind of lair, or a band; its leader; the dead it raised
export function campGuard(a, camp, spec) {
  const g = camp.lair ? {...lairGuard(a, camp.lair, camp.i, camp.s)} : {kind: camp.band, band: camp.band, strength: camp.s, ...(camp.band === 'cultists' ? {pool: cultPool(a, camp.i)} : {})};
  g.label = camp.label;
  if (spec.boss) g.boss = {name: spec.boss.name, g: 'm', species: spec.boss.species, add: {...spec.boss.add}, mustDie: true};
  if (spec.summon) g.with = {band: 'undead', label: 'поднятые мертвецы', share: CONTRACT.summon, summoned: true};
  return g;
}

// ── posting: a contract of a row (one-off) or of a chain's step
function post(a, G, def, {tmpl, chain = null, side = false, strong = 1}, r) {
  const t = a.towns.find(x => x.id === G.town); if (!t) return null;
  const tier = def.tier, iss = issuerFor(a, G, tier), C = contractsOf(a);
  const known = def.camp ? !def.camp.clue : !(ERRANDS.get(def.errand)?.clueAt?.length);
  let target = null, at = null, s = 0, days = null, where = '', facts = [], goal = '';
  if (def.errand) {
    const E = ERRANDS.get(def.errand), {mask} = reachable(a, stub(t)), busy = new Set(C.records.filter(c => c.state === 'open' || c.state === 'accepted').map(c => c.target?.lair));
    const T = lairTargets(a, stub(t), E, mask).find(x => !busy.has(x.l.id)); if (!T) return null;
    target = {lair: T.l.id}; s = garrison(T.l, E.guard) * strong; at = known ? {x: T.l.x, y: T.l.y} : null;
    days = Math.max(1, Math.round(T.d * Math.hypot(a.w, a.h) / (CAMPAIGN.speed * scaleOf(a))));
    goal = `${LAIRS.get(T.l.kind).label} «${T.l.name}», ${wherePhrase(a, T.l.i)}`; facts = lairFacts(a, T.l, t);
  } else {
    const k = def.camp.lair ? lairDanger(def.camp.lair) : 1, camp = placeCamp(a, G, tier, def.camp, CONTRACT.camp.s[tier] * k * strong, r);
    if (!camp) return null;
    target = {camp: camp.id}; s = camp.s; at = known ? {x: camp.x, y: camp.y} : null; days = camp.days; where = wherePhrase(a, camp.i);
    goal = known ? camp.label : `${def.camp.name} — где-то ${where}; найти по следам`;
  }
  const escrow = reserve(a, iss, tier, r, !!chain);
  if (escrow == null) { if (target.camp != null) C.camps = C.camps.filter(c => c.id !== target.camp); return null; }
  const id = C.nextId++, rec = {id, uid: `c${id}`, tmpl, chain, side, tier, label: def.label, about: def.about || '',
    story: fill(def.story || def.about || '', {town: `${townLabel(t, 1)} ${t.name}`, where: where || 'неподалёку'}),
    issuer: iss, escrow, posted: G.day, until: G.day + rng(r, CONTRACT.offer), state: 'open', why: null, target, known, at, s: Math.round(s * 100) / 100, days, goal, facts,
    completeBy: null, by: null};
  if (target.camp != null) campOf(a, target.camp).contract = rec.uid;
  C.records.push(rec);
  return rec;
}
const defOf = rec => {
  if (!rec.chain) return CONTRACTS.get(rec.tmpl);
  const [chain, step] = rec.tmpl.split(':'), H = CHAINS.get(chain);
  return rec.side ? H.sides[step] : H.steps[step];
};
const liveTarget = (a, rec) => (rec.target.camp != null ? campOf(a, rec.target.camp)?.alive : (a.lairs || []).find(l => l.id === rec.target.lair)?.alive);

// ── a season of the guild's world: offers run out, targets go, the board is topped up, the stories begin
//   io — {r (the guild's stream), tell (a line of its chronicle), pay (its ledger)}
export function stepContracts(a, G, io) {
  const C = contractsOf(a), first = !G.contractsSeeded;
  for (const rec of C.records) {
    if (rec.state !== 'open') continue;
    if (!holder(a, rec.issuer)) { rec.escrow = 0; close(a, G, rec, 'заказчик пал — резерв пропал с его казной', io); }
    else if (!liveTarget(a, rec)) close(a, G, rec, 'цель уничтожена другими', io);
    else if (G.day >= rec.until) close(a, G, rec, 'срок предложения вышел', io);
  }
  const most = tierOf(G);   // (the world gives a guild the tiers its level is trusted with)
  for (let tier = 1; tier <= most && tier < CONTRACT.board.open.length; tier++) {
    const rows = CONTRACTS.filter(x => x.tier === tier), open = () => C.records.filter(c => !c.chain && c.state === 'open' && c.tier === tier).length;
    for (let k = 0; k < rows.length * 2 && open() < CONTRACT.board.open[tier]; k++) {
      if (!first && io.r() >= CONTRACT.board.post) break;
      const def = rows[Math.floor(io.r() * rows.length)];
      if (C.records.some(c => c.tmpl === def.id && c.state === 'open')) continue;
      const rec = post(a, G, def, {tmpl: def.id}, io.r);
      if (rec && !first) io.tell(`На доске новый договор: ${rec.label} (${tierWord(tier)}; платит ${issuerName(a, rec.issuer)} — ${rec.escrow} зол.).`, 'contract');
    }
  }
  for (const H of CHAINS.all()) {
    if (levelOf(G) < H.level || C.chains.some(c => c.chain === H.id && c.guild === G.id)) continue;
    const ch = {id: C.nextId++, chain: H.id, guild: G.id, step: H.start, flags: {}, state: 'on', steps: []};
    const rec = post(a, G, H.steps[H.start], {tmpl: `${H.id}:${H.start}`, chain: ch.id}, io.r);
    if (!rec) continue;   // (no place for it in this world yet: the next season)
    C.chains.push(ch); ch.steps.push(rec.uid);
    io.tell(`Новая история: «${H.label}». ${H.about}`, 'chain');
  }
  G.contractsSeeded = true;
}
// ── the guild's level (GUILD.level; the author's word 13.11): its fame as experience — the level reached, the highest tier the
// world trusts it with; fame lost, the level lost with it
export function levelOf(G) { const N = GUILD.level.need; let L = 0; while (L + 1 < N.length && (G.fame || 0) >= N[L + 1]) L++; return L; }
export const tierOf = G => GUILD.level.tier[levelOf(G)];
export const levelNext = G => GUILD.level.need[levelOf(G) + 1] ?? null;
// fame moved, the level told when it moved with it
export function fameBy(G, d, tell) {
  const L0 = levelOf(G);
  G.fame = Math.max(0, Math.round(((G.fame || 0) + d) * 10) / 10);
  const L = levelOf(G);
  if (L > L0) tell(`Гильдия выросла до ${L}-го уровня${tierOf(G) > GUILD.level.tier[L0] ? `: теперь ей доверяют договоры тира ${['', 'I', 'II', 'III', 'IV', 'V'][tierOf(G)]}` : ''}.`, 'level');
  else if (L < L0) tell(`Слава гильдии упала: она снова ${L}-го уровня${tierOf(G) < GUILD.level.tier[L0] ? ` — договоров тира ${['', 'I', 'II', 'III', 'IV', 'V'][GUILD.level.tier[L0]]} ей больше не дают` : ''}.`, 'level');
}
const tierWord = t => `тир ${['', 'I', 'II', 'III', 'IV', 'V'][t]}`;

// closed without the guild's pay: the reserve back to its issuer, the camp struck, the story told on
function close(a, G, rec, why, io, failed = true) {
  rec.state = 'closed'; rec.why = why;
  refund(a, rec);
  if (rec.target.camp != null) { const c = campOf(a, rec.target.camp); if (c) c.alive = false; }
  if (rec.chain) chainOn(a, G, rec, false, io);
  else if (failed && rec.by == null) io.tell(`Договор снят с доски: ${rec.label} — ${why}.`, 'contract');
}

// the guild takes a contract (campaign/guild.js launch): its deadline from today
export function takeContract(a, G, uid, n) {
  const rec = contractOf(a, uid);
  if (!rec || rec.state !== 'open') throw new Error('Этого договора на доске больше нет.');
  if (!liveTarget(a, rec)) throw new Error('Цели договора больше нет.');
  rec.state = 'accepted'; rec.by = n; rec.takenAt = G.day;
  rec.completeBy = G.day + CONTRACT.time.base[rec.tier] + Math.round(CONTRACT.time.road * 2 * (rec.days || 0));
  return rec;
}
export const contractWhy = (a, uid) => { const rec = contractOf(a, uid); return !rec || rec.state !== 'open' ? 'этого договора на доске больше нет' : !liveTarget(a, rec) ? 'цели договора больше нет' : null; };

// the guild calls its party back (campaign/guild.js recall): the contract let go — early it costs a little fame, in the last
// CONTRACT.fame.late of its time much; the party walks home with nothing
export function abortWhy(a, G, K) {
  const rec = K && contractOf(a, K.contract);
  return !rec || rec.state !== 'accepted' ? 'отряд не на договоре' : K.phase !== 'out' ? 'отряд уже идёт домой' : null;
}
export function abortContract(a, G, K, giveUp, say) {
  const rec = contractOf(a, K.contract), why = abortWhy(a, G, K); if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  rec.abortedAt = G.day;
  const late = (G.day - (rec.takenAt ?? 0)) >= (1 - CONTRACT.fame.late) * Math.max(1, rec.completeBy - (rec.takenAt ?? 0));
  giveUp(a, K, 'отозван', `Гильдия отозвала отряд: договор «${rec.label}» брошен${late ? ' в последний срок' : ''}. Отряд возвращается ни с чем.`, (t, k, w) => say(a, K, t, k, w));
  return late;
}
// the time a contract leaves beyond the road there and back (its deadline from the day taken: CONTRACT.time)
export const marginOf = rec => CONTRACT.time.base[rec.tier] + Math.round(CONTRACT.time.road * 2 * (rec.days || 0)) - 2 * (rec.days || 0);
// the expedition of a contract home (campaign/guild.js closeExpedition): handed in — the reserve is the guild's pay; failed or
// the party lost — the reserve goes back and the guild's name suffers. → {paid, why}
export function settleContract(a, G, K, io) {
  const rec = contractOf(a, K.contract); if (!rec || rec.state !== 'accepted') return null;
  const done = K.done?.at(-1), handed = !!done && !done.failed && done.contract === rec.uid;
  if (handed) {
    rec.state = 'paid';
    if (rec.escrow > 0) io.pay(G, rec.escrow, `плата по договору: ${rec.label} (${issuerName(a, rec.issuer)})`);
    rec.paid = rec.escrow; rec.escrow = 0;
    if (!holder(a, rec.issuer)) io.tell(`${issuerName(a, rec.issuer) === 'никто' ? 'Заказчика больше нет' : 'Заказчик пал'}, но резерв был отложен: плата — из него.`, 'contract');
    fameBy(G, CONTRACT.fame.won[rec.tier], io.tell);
    if (rec.target.camp != null) { const c = campOf(a, rec.target.camp); if (c) c.alive = false; }
    if (rec.chain) chainOn(a, G, rec, true, io);
    return {paid: rec.paid};
  }
  // not handed in: by why (the target gone by another hand — no blame; let go early — a little; failed, beaten back, the party
  // lost, let go at the last — much: CONTRACT.fame)
  const w = done?.why, external = w === 'цель уничтожена другими';
  const span = Math.max(1, (rec.completeBy ?? G.day) - (rec.takenAt ?? G.day)), early = rec.abortedAt != null && (rec.abortedAt - (rec.takenAt ?? 0)) < (1 - CONTRACT.fame.late) * span;
  const why = external ? w : rec.abortedAt != null ? (early ? 'гильдия отказалась' : 'гильдия отказалась в последний срок') : w === 'отступили' ? 'отряду не хватило сил' : done?.failed ? 'срок вышел' : 'отряд не вернулся';
  // done in part (CONTRACT.partial): the guard of the goal broken by this share — paid for it, less a cut; the fame lost the less
  const g = K.quest?.crown?.guard, part = external || !g?.full ? 0 : Math.max(0, Math.min(1, 1 - g.strength / g.full)), P = CONTRACT.partial;
  const share = part >= P.least ? part : 0;
  if (share) {
    const gold = Math.floor(rec.escrow * share * (1 - P.cut));
    if (gold > 0) { io.pay(G, gold, `плата по договору, исполненному отчасти (${Math.round(share * 100)} %): ${rec.label}`); rec.escrow -= gold; rec.paid = gold; }
    io.tell(`Договор «${rec.label}» исполнен лишь отчасти: стража сломлена на ${Math.round(share * 100)} %. Заказчик платит ${gold} зол. — меньше доли.`, 'contract');
  }
  if (!external) fameBy(G, -CONTRACT.fame.won[rec.tier] * (early ? CONTRACT.fame.abort : CONTRACT.fame.lost) * (1 - share), io.tell);
  close(a, G, rec, share ? `${why}; исполнен отчасти` : why, io);
  return {paid: rec.paid || 0, why, part: share};
}

// a story's next step (CHAINS): the flags of the step closed, then `next` by how it went (or `unless`), or its end
function chainOn(a, G, rec, won, io) {
  const C = contractsOf(a), ch = C.chains.find(c => c.id === rec.chain); if (!ch || ch.state !== 'on') return;
  const H = CHAINS.get(ch.chain), [, step] = rec.tmpl.split(':'), def = defOf(rec);
  const f = def.flag?.[won ? 'won' : 'lost']; if (f) ch.flags[f] = true;
  if (rec.side) { if (won) io.tell(`«${H.label}»: ${rec.label} — исполнено. Это скажется на истории.`, 'chain'); return; }
  let next = def.next?.[won ? 'won' : 'lost'] ?? null;
  if (won && def.unless) for (const [flag, s] of Object.entries(def.unless)) if (!ch.flags[flag]) next = s;
  if (next) {
    const N = H.steps[next], strong = Object.entries(N.strong || {}).reduce((x, [k, v]) => (ch.flags[k] ? x * v : x), 1);
    const nx = post(a, G, N, {tmpl: `${H.id}:${next}`, chain: ch.id, strong}, io.r);
    if (!nx) { ch.state = 'lost'; io.tell(`«${H.label}»: след оборвался — ${H.ends.lost}`, 'chain'); return; }
    ch.step = next; ch.steps.push(nx.uid);
    io.tell(`«${H.label}»: ${won ? 'исполнено' : 'провал'} — ${rec.label}. Дальше: ${nx.label}. ${nx.story}`, 'chain');
    if (N.side) { const sd = post(a, G, H.sides[N.side], {tmpl: `${H.id}:${N.side}`, chain: ch.id, side: true}, io.r); if (sd) { ch.steps.push(sd.uid); io.tell(`«${H.label}»: и ещё — ${sd.label}. ${sd.story}`, 'chain'); } }
    return;
  }
  ch.state = won ? 'won' : 'lost';
  const flagged = won && Object.keys(ch.flags).map(k => H.ends[`won.${k}`]).find(Boolean);
  io.tell(`«${H.label}» окончена. ${flagged || H.ends[won ? 'won' : 'lost']}`, 'chain');
}

// ── the quest of a contract (campaign/start.js newExpedition): a lair of the world as its errand lays it out, or the camp
export function contractQuest(a, K, rnd, rec, G) {
  const def = defOf(rec);
  let Q;
  if (def.errand) {
    Q = lairErrand(a, K, rnd, ERRANDS.get(def.errand), rec.target.lair);
    if (!Q) return null;
  } else {
    const camp = campOf(a, rec.target.camp); if (!camp?.alive) return null;
    const {mask, cells} = reachable(a, K), spec = def.camp;
    const goal = {kind: camp.lair && LAIRS.get(camp.lair)?.undead || camp.band === 'undead' ? 'dread' : 'lair', at: camp.i, i: camp.i, label: camp.label, camp: camp.id};
    const clues = spec.clue ? layClues(a, K, rnd, places(a, K, mask), cells, goal, CONTRACT.clueAt) : [];
    const [name, acc, g] = spec.trophy;
    Q = {name, acc, g, how: 'lair', lair: null, camp: camp.id, leader: null, pursuit: false, story: rec.story,
      crown: {...goal, guard: campGuard(a, camp, spec), area: null, exact: !clues.length, seen: false, state: 'lost', carrier: null},
      clues, search: null, stormAt: 0, next: null, found: 0};
    if (clues.length) clues[0].area = circle(a, clues[0].i, QUEST.area, rnd);
  }
  Q.errand = null; Q.contract = rec.uid; Q.tier = rec.tier; Q.from = K.day;
  Q.spec = {label: rec.label, about: rec.about, gold: 0, years: null, tier: rec.tier};
  Q.story = rec.story;
  Q.until = K.day + Math.max(1, rec.completeBy - G.day);
  return Q;
}

// ── the board: the contracts open to the guild, as the cards of the errands' board (ui/campaignView.js errandCards)
//   ms — those picked (the risk against them), none — a fresh eight
export function contractCards(a, G, ms = [], sort = 'tier') {
  const C = a.contracts; if (!C) return [];
  const might = ms.length ? caravanMight({members: ms, beasts: G.store?.beasts || [], vehicles: []}) : CAMP.foe.quickUnit;
  return C.records.filter(c => c.state === 'open').map(c => {
    const ch = c.chain ? C.chains.find(x => x.id === c.chain) : null, H = ch && CHAINS.get(ch.chain);
    const facts = [...(H ? [`История «${H.label}»${c.side ? ' — побочное' : `, шаг ${ch.steps.filter(u => !contractOf(a, u)?.side).indexOf(c.uid) + 1}`}`] : []),
      `Платит ${issuerName(a, c.issuer)}: ${c.escrow ? `${c.escrow} зол. отложено` : 'казна пуста — за честь'}`,
      `Предложение — ещё ${Math.max(0, c.until - G.day)} дн.; срок — ${CONTRACT.time.base[c.tier] + Math.round(CONTRACT.time.road * 2 * (c.days || 0))} дн. с принятия, запас сверх дороги ≈ ${marginOf(c)} дн.`,
      ...(c.facts || [])];
    return {id: c.uid, contract: c.uid, errand: null, targetId: null, tier: c.tier, label: c.label, about: c.story || c.about, years: null, gold: c.escrow,
      ok: true, why: '', goal: c.goal, known: c.known, at: c.at, guard: c.s, risk: riskWord(c.s, might), facts, days: c.days, chain: !!c.chain,
      margin: marginOf(c), left: Math.max(0, c.until - G.day)};
  }).sort(SORTS[sort] || SORTS.tier);
}
// the board's orders (ui/guildView.js): by tier, by pay, by the time to spare, by the road, by the offer running out
export const SORTS = {
  tier: (p, q) => p.tier - q.tier || (q.chain - p.chain) || p.id.localeCompare(q.id),
  pay: (p, q) => q.gold - p.gold || p.tier - q.tier,
  margin: (p, q) => q.margin - p.margin || p.tier - q.tier,
  road: (p, q) => (p.days ?? 0) - (q.days ?? 0) || p.tier - q.tier,
  left: (p, q) => p.left - q.left || p.tier - q.tier,
};
// the camps standing (the guild's map draws them)
export const campsOf = a => (a.contracts?.camps || []).filter(c => c.alive);
