// The needs of the towns and their councils' answers (docs/WORLD.md «Нужды совета»; data/townNeeds.js — the needs, the answers,
// the numbers). A season, after the towns' economies and before their building (atlas/history.js):
//   1. each town senses its needs (room: its people against its houses; metal: what its works lacked of metal, by value; food:
//      its people against what feeds them) and
//      lights or puts out each by its two thresholds;
//   2. its plans are judged: done (the house stands, the metal came, the settlers went), cancelled (the target is gone, the
//      need is out), or failed (nothing came by its review: the answer is not offered again for NEED.block seasons);
//   3. for a lit need the council weighs the answers it may give now — each with its target found (the house it can build,
//      the spot for settlers, the town of the realm whose cell gives the metal, the seller a budget would pay) or the reason
//      it cannot; the cause the reckoning finds only hints;
//   4. the realm approves its towns' best answers, the strongest first, and reserves what they take (the treasury's gold for a
//      budget, the target building for a goal: no two towns take the same), so two councils do not spend the same gold.
// What is approved is a plan — an obligation with a target, an expected result and a review: a goal for town.project
// (atlas/build.js pickProject builds it first), a call for settlers (atlas/peoples.js sendSettlers), a budget for the works'
// buying of a metal (atlas/treasury.js worksBuying). t.need = {id: {on, s, x, lane, cause, since, plans: {answer id: plan},
// blocked: {answer id: until step}, last: {pick, opts}, log: [{answer, outcome, why, at}]}}; t.goal = {b, need, from};
// t.budget = {good: {gold, got}}. Every sitting goes to the trace (core/decide.js) as the point `town.need`, the answers it
// could not give with their reasons.
import {realmTowns, townDist, withFrame} from './frame.js';
import {NEEDS, ANSWERS, NEED, LEAN} from '../data/townNeeds.js';
import {TOWN_BUILDINGS, TOWN_GOODS, METALS, makesOf, goodPrice, foodNet} from '../data/townBuildings.js';
import {WORLD_PEOPLES, TOWN_LIFE as TL} from '../data/peoples.js';
import {MIND, VECTOR_IDS, normVec, along} from '../data/mind.js';
import {SEASONS_PER_YEAR as S} from '../data/atlas.js';
import {townFx, room, canBuild, realmBuilt} from './towns.js';
import {townFacts} from './requirements.js';
import {digOf, realmMetals} from './economy.js';
import {settleSpot} from './peoples.js';
import {allowed} from '../data/commands.js';
import {pickMax, tracing, noteDecision, r3} from '../core/decide.js';

const METAL = new Set(Object.values(METALS).map(m => m.good));
const clamp01 = v => Math.max(0, Math.min(1, v));
const r2 = v => Math.round(v * 100) / 100;
const price = g => { try { return goodPrice(g) || 1; } catch (e) { return 1; } };
const stepOf = a => a.hist?.step ?? 0;
const gName = g => (TOWN_GOODS.has(g) ? TOWN_GOODS.get(g).label : g);

// ── 1. what a town senses: {s, x, lane, cause, by}
const SENSE = {
  // its people against its houses: lit as they fill them (x 0.72 at `on`), a crisis when they overflow
  room(a, t) {
    const D = NEEDS.get('room'), x = t.pop / Math.max(1, room(townFx(t)));
    return {x: r3(x), s: clamp01((x - D.from) / D.span)};
  },
  // its people against what feeds them (its land, works and the net, last spring: t.wants.feeds): lit as they come near it,
  // a crisis when they outgrow it (a hungry year)
  food(a, t) {
    const D = NEEDS.get('food'), x = t.pop / Math.max(1, t.wants?.feeds ?? t.pop * 2);
    return {x: r3(x), s: clamp01((x - D.from) / D.span)};
  },
  // what its works lacked of metal after the season's buying, against what they asked of it, by value; the cause — the larger
  // part of what was left: money (a seller had it), route (a weak link), goods (nobody it deals with had it)
  metal(a, t) {
    const e = t.econ, W = e?.why?.works?.by || {};
    let ask = 0, left = 0; const cause = {money: 0, route: 0, goods: 0}, by = {};
    for (const g of METAL) {
      const d = (e?.dem?.[g] || 0) / S, p = price(g);
      if (!(d > 0)) continue;
      ask += d * p;
      const w = W[g]; if (!w || !(w.left > 0)) continue;
      left += w.left * p; by[g] = {left: w.left, money: w.money, route: w.route, goods: w.goods};
      for (const k of Object.keys(cause)) cause[k] += (w[k] || 0) * p;
    }
    const top = Object.entries(cause).sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1))[0];
    return {s: ask > 0 ? clamp01(left / ask) : 0, x: r3(ask > 0 ? left / ask : 0), cause: top && top[1] > 0 ? top[0] : null, by};
  },
};

// the rose′ of a town's people: its rose pulled back from its realm's course, without the needs (data/mind.js)
function roseOf(a, t) {
  const P = WORLD_PEOPLES.get(t.people), rose = normVec(P?.rose || {}), realm = (a.realms || []).find(r => r.id === t.realm);
  const course = realm?.mind?.course || rose, pull = P?.rosePull ?? MIND.pull;
  return normVec(Object.fromEntries(VECTOR_IDS.map(k => [k, Math.max(0, rose[k] + pull * (rose[k] - (course[k] ?? rose[k])))])));
}
const realmOf = (a, t) => (a.realms || []).find(r => r.id === t.realm && r.fallen == null) || null;

// ── 3. the targets: what each answer would do now → {target, expect, note} or {why} (the reason it cannot)
const TARGET = {
  'room.build'(a, t) {
    const pj = t.project && TOWN_BUILDINGS.has(t.project) ? TOWN_BUILDINGS.get(t.project) : null;
    if (pj && pj.house > 0) return {why: `жильё уже строится: ${pj.name}`};
    const inR = realmBuilt(a, t), facts = townFacts(a, t, {inRealm: inR});
    const B = TOWN_BUILDINGS.all().filter(b => b.house > 0 && canBuild(a, t, b, inR, facts)).sort((p, q) => q.house - p.house || (p.id < q.id ? -1 : 1));
    if (!B.length) return {why: 'жильё не поставить: нет слота, ступени или места'};
    return {target: {town: t.id, b: B[0].id}, expect: {room: B[0].house}, note: `${B[0].name} на ${B[0].house} жителей`};
  },
  'food.build'(a, t) {
    const pj = t.project && TOWN_BUILDINGS.has(t.project) ? TOWN_BUILDINGS.get(t.project) : null, wf = WORLD_PEOPLES.get(t.people)?.workFlows || {};
    if (pj && foodNet(pj, null, wf[pj.id]) > 0) return {why: `то, что кормит, уже строится: ${pj.name}`};
    const inR = realmBuilt(a, t), facts = townFacts(a, t, {inRealm: inR});
    const B = TOWN_BUILDINGS.all().map(b => [b, foodNet(b, null, wf[b.id])]).filter(([b, f]) => f > 0 && canBuild(a, t, b, inR, facts)).sort((p, q) => q[1] - p[1] || (p[0].id < q[0].id ? -1 : 1));
    if (!B.length) return {why: 'нечего поставить: нет слота, места или ступени'};
    return {target: {town: t.id, b: B[0][0].id}, expect: {food: r2(B[0][1])}, note: `${B[0][0].name}: еды на ${Math.round(B[0][1])}`};
  },
  'food.settle'(a, t, st, ctx) { return TARGET['room.settle'](a, t, st, ctx); },
  'room.settle'(a, t, st, ctx) {
    const S0 = WORLD_PEOPLES.get(t.people)?.settlers, Z = TL.settle;
    if (!S0) return {why: 'народ не шлёт поселенцев'};
    if (t.pop < S0.from || t.pop - S0.pop < S0.keep) return {why: `мало жителей: поселенцы уходят от ${S0.from}`};
    if (a.hist.year - (t.settled ?? -Infinity) < Z.every) return {why: 'поселенцев посылали недавно'};
    // (where its settlers would go is asked by both needs that send them: once a sitting of the season — nothing is founded meanwhile)
    const spots = ctx ? (ctx.spots ||= new Map()) : null;
    let spot = spots?.get(t.id); if (spot === undefined) { spot = settleSpot(a, t); spots?.set(t.id, spot); }
    if (spot < 0) return {why: 'нет свободной земли в досягаемости'};
    return {target: {town: t.id}, expect: {people: S0.pop}, note: `${S0.pop} поселенцев`};
  },
  'metal.build'(a, t, st, ctx) {
    const gs = Object.entries(st.by).sort((p, q) => q[1].left * price(q[0]) - p[1].left * price(p[0]) || (p[0] < q[0] ? -1 : 1)).map(([g]) => g);
    if (!gs.length) return {why: 'нехватки металла по стоимости нет'};
    const towns = [...realmTowns(a, t)].sort((p, q) => (p === t ? -1 : q === t ? 1 : townDist(a, p, t) - townDist(a, q, t) || p.id - q.id));
    // (what the realm has built and the metals it knows are the realm's — the same for each of its towns; a town's facts and
    // a mine's dig, once each: nothing changes while the sitting looks — it was the late years' cost, towns × metals × towns)
    const inR = realmBuilt(a, t), known = realmMetals(a, t), factsOf = new Map(), digs = new Map();
    const facts = x => { let f = factsOf.get(x.id); if (!f) factsOf.set(x.id, f = townFacts(a, x, {inRealm: inR})); return f; };
    const dug = (x, b) => { const k = `${x.id}:${b.id}`; let d = digs.get(k); if (!d) digs.set(k, d = digOf(a, x, b)); return d; };
    for (const g of gs) {
      const makers = TOWN_BUILDINGS.all().filter(b => makesOf(b).includes(g));
      for (const x of towns) {
        if (x.goal) continue;   // (a town builds one goal at a time)
        for (const b of makers) {
          if (ctx.taken.has(x.id)) continue;   // (a town has one builder: one goal at a time)
          if (b.dig && !(dug(x, b)[g] > 0)) continue;
          if (Object.keys(b.in || {}).some(h => METAL.has(h) && !known.has(h))) continue;   // (a steelworks with no iron in the realm)
          if (!canBuild(a, x, b, inR, facts(x))) continue;
          const n = b.dig ? dug(x, b)[g] : (b.out?.[g] || 0);
          return {target: {town: x.id, b: b.id, g}, expect: {good: g, n: r2(n)}, note: `${b.name} в ${x.name}: ${gName(g)}`};
        }
      }
    }
    return {why: 'держава не может поставить делателя: нет жилы, людей, слота или сырья'};
  },
  'metal.budget'(a, t, st, ctx) {
    const R = realmOf(a, t);
    if (!R) return {why: 'нет державы — нет казны'};
    const gs = Object.entries(st.by).filter(([, w]) => w.money > 0);
    if (!gs.length) return {why: 'деньги не мешают: не хватает пути или самого металла'};
    const want = gs.reduce((s, [g, w]) => s + w.money * price(g) * NEED.budget.seasons, 0), free = ctx.purse.get(R.id) ?? 0;
    const gold = r2(Math.min(want, free));
    if (gold < NEED.budget.least) return {why: 'казна державы пуста или уже роздана'};
    const share = Object.fromEntries(gs.map(([g, w]) => [g, w.money * price(g)])), tot = Object.values(share).reduce((s, v) => s + v, 0);
    return {target: {town: t.id, realm: R.id, gold, by: Object.fromEntries(Object.entries(share).map(([g, v]) => [g, r2(gold * v / tot)]))},
      expect: {gold}, note: `${gold} золота на ${gs.map(([g]) => gName(g)).join(', ')}`};
  },
};

// ── 2. the plans judged → null (goes on) or {outcome, why}
function judge(a, t, st, A, p) {
  const age = stepOf(a) - p.since;
  if (A.id === 'room.build' || A.id === 'metal.build' || A.id === 'food.build') {
    const x = (a.towns || []).find(o => o.id === p.target.town), b = TOWN_BUILDINGS.get(p.target.b);
    if (!x?.alive) return {outcome: 'cancel', why: 'город пал'};
    if (x.built.filter(id => id === b.id).length > p.had) return {outcome: 'done', why: `построено: ${b.name}`, executed: true, eased: eased(st, p)};
    if (!st.on && !x.works?.[b.id]?.paid) return {outcome: 'cancel', why: 'нужда снята'};
    // begun: it goes on while the work moves; a work paid and standing `review` seasons since it last moved has failed
    const W = x.works?.[b.id];
    if (W?.paid) {
      if (W.done > (p.done ?? -1)) { p.done = W.done; p.moved = stepOf(a); }
      return stepOf(a) - (p.moved ?? p.since) >= A.review ? {outcome: 'fail', why: 'стройка встала'} : null;
    }
    if (x.project === b.id) return null;
    if (!canBuild(a, x, b)) return {outcome: 'cancel', why: 'цель больше не годится'};
    if (age >= A.review) return {outcome: 'fail', why: 'не начали: не по карману'};
    return null;
  }
  if (A.id === 'room.settle' || A.id === 'food.settle') {
    if ((t.settled ?? -Infinity) >= p.year) return {outcome: 'done', why: 'поселенцы ушли', executed: true, eased: eased(st, p)};
    if (!st.on) return {outcome: 'cancel', why: 'нужда снята'};
    if (age >= A.review) return {outcome: 'fail', why: 'поселенцы не ушли: нет места или людей'};
    return null;
  }
  if (A.id === 'metal.budget') {
    // carried out — something was brought on the budget; helped — the need eased. Brought and not eased is a plan that failed
    const got = Object.keys(p.target.by).reduce((s, g) => s + (t.budget?.[g]?.got || 0), 0), e = eased(st, p);
    if (age < A.review && st.on) return null;
    if (got > 0) return e ? {outcome: 'done', why: `привезли ${r2(got)}, нехватка спала`, executed: true, eased: true} : {outcome: 'fail', why: `привезли ${r2(got)}, но нехватка не спала`, executed: true, eased: false};
    return {outcome: st.on ? 'fail' : 'cancel', why: st.on ? 'не довезли' : 'нужда снята'};
  }
  return null;
}
// did the need ease since the plan was taken: it went out, or fell by NEED.eased from where it stood
const eased = (st, p) => !st.on || st.s <= (p.s0 ?? st.s) - NEED.eased;
// a plan closed: its goal let go, its budget's gold back to the treasury
function close(a, t, st, A, p, res) {
  if (p.target.b) {
    const x = (a.towns || []).find(o => o.id === p.target.town);
    if (x?.goal && x.goal.from === t.id && x.goal.need === A.need) delete x.goal;
  }
  if (A.id === 'metal.budget' && t.budget) {
    const R = (a.realms || []).find(r => r.id === p.target.realm);
    for (const g of Object.keys(p.target.by)) {
      const left = t.budget[g]?.gold || 0;
      if (left > 0) { if (R) R.gold = r2((R.gold || 0) + left); else t.gold = r2((t.gold || 0) + left); }
      delete t.budget[g];
    }
    if (!Object.keys(t.budget).length) delete t.budget;
  }
  delete st.plans[A.id];
  if (res.outcome === 'fail') st.blocked[A.id] = stepOf(a) + NEED.block;
  (st.log ||= []).push({answer: A.id, outcome: res.outcome, why: res.why, at: stepOf(a), ...(res.executed != null ? {executed: res.executed, eased: res.eased} : {})});
  if (st.log.length > 6) st.log.shift();
}

// a sitting's options for a lit need: each answer, weighed or with the reason it is not
function sitting(a, t, st, ctx) {
  const rose = roseOf(a, t), lean = LEAN[t.people] || {}, opts = [];
  const longOn = Object.keys(st.plans).map(id => ANSWERS.get(id)).find(A => A.long);
  for (const A of ANSWERS.all().filter(x => x.need === st.id)) {
    const o = {answer: A.id, cmd: A.cmd, label: A.label, score: 0};
    if (st.plans[A.id]) continue;   // under way
    if (!allowed(a.cfg, A.cmd)) o.why = 'выключено профилем';
    else if ((st.blocked[A.id] ?? -Infinity) > stepOf(a)) o.why = 'недавно не помогло';
    else if (A.long && longOn) o.why = `уже делается: ${longOn.label}`;
    else {
      const T = TARGET[A.id](a, t, st, ctx);
      if (T.why) o.why = T.why;
      else {
        Object.assign(o, T);
        const hint = A.causes.includes(st.cause) ? NEED.hint : 1;
        o.score = r3(st.s * A.power * (lean[A.id] ?? 1) * (1 + NEED.k * along(A.vec, rose)) * hint);
      }
    }
    opts.push(o);
  }
  return opts.sort((p, q) => q.score - p.score || (p.answer < q.answer ? -1 : 1));
}

// ── the season
export function stepNeeds(a) {
  a.builtMemo = new Map();   // (what the realms have built, once a realm for the sittings — atlas/towns.js realmBuilt)
  try { return withFrame(a, () => stepNeedsPass(a)); } finally { delete a.builtMemo; }   // (the season's frame: atlas/frame.js)
}
function stepNeedsPass(a) {
  const now = stepOf(a), towns = (a.towns || []).filter(t => t.alive && t.econ && WORLD_PEOPLES.has(t.people));
  // the realms' purses for the season's budgets: a share of each treasury (reserved as the budgets are given)
  const ctx = {taken: new Set(), purse: new Map((a.realms || []).filter(r => r.fallen == null).map(r => [r.id, Math.max(0, (r.gold || 0) * NEED.budget.share)]))};
  for (const x of a.towns || []) if (x.alive && x.goal) ctx.taken.add(x.id);   // (a town builds one goal at a time: its builder is taken)
  // a town fallen with plans: they close, its budgets' gold back to the realm (close), its goal on another town let go
  for (const t of a.towns || []) if (!t.alive && t.need) {
    for (const st of Object.values(t.need)) for (const [id, p] of Object.entries(st.plans || {})) close(a, t, st, ANSWERS.get(id), p, {outcome: 'cancel', why: 'город пал'});
    delete t.need; delete t.budget;
  }
  const asks = [];
  for (const t of towns) {
    const N = t.need ||= {};
    for (const D of NEEDS.all()) {
      const sn = SENSE[D.id](a, t), st = N[D.id] ||= {id: D.id, on: false, s: 0, plans: {}, blocked: {}};
      st.id = D.id; st.s = r3(sn.s); st.x = sn.x; st.cause = sn.cause ?? null; st.by = sn.by || {};
      const was = st.on;
      st.on = st.on ? st.s >= D.off : st.s >= D.on;
      if (st.on && !was) st.since = now;
      st.lane = st.on && st.s >= D.crisis ? 'yellow' : 'routine';
      for (const [id, p] of Object.entries(st.plans)) { const A = ANSWERS.get(id), res = judge(a, t, st, A, p); if (res) close(a, t, st, A, p, res); }
      for (const [id, u] of Object.entries(st.blocked)) if (u <= now) delete st.blocked[id];
      if (!st.on) { st.last = null; if (!Object.keys(st.plans).length && !Object.keys(st.blocked).length && !st.log?.length) delete N[D.id]; continue; }
      const opts = sitting(a, t, st, ctx);
      st.last = {at: now, pick: null, opts: opts.map(o => ({answer: o.answer, score: o.score, why: o.why || null, note: o.note || null}))};
      if (opts.some(o => o.score > NEED.floor)) asks.push({t, st, opts, top: opts[0].score});
    }
    if (!Object.keys(N).length) delete t.need;
  }
  // ── 4. the approval: the strongest first; each takes the first of its answers whose target is still free
  asks.sort((p, q) => (q.st.lane === 'yellow') - (p.st.lane === 'yellow') || q.top - p.top || p.t.id - q.t.id || (p.st.id < q.st.id ? -1 : 1));
  for (const {t, st, opts} of asks) {
    let pick = null;
    for (const o of opts) {
      if (!(o.score > NEED.floor)) break;
      let tg = o.target;
      // (its target taken meanwhile by a stronger council: the next best target of the same answer, once — the best target
      // within an answer first, then the answers compared)
      if (tg.b && ctx.taken.has(tg.town)) { const T = TARGET[o.answer](a, t, st, ctx); if (T.target) { tg = o.target = T.target; o.note = T.note; o.expect = T.expect; } }
      if (tg.b) {
        if (ctx.taken.has(tg.town)) { o.why = 'город уже строит другую цель, другого нет'; continue; }
        ctx.taken.add(tg.town);
        const x = (a.towns || []).find(q => q.id === tg.town);
        x.goal = {b: tg.b, need: st.id, from: t.id};
        st.plans[o.answer] = {target: tg, since: now, had: x.built.filter(id => id === tg.b).length, expect: o.expect, s0: st.s};
      } else if (o.answer === 'metal.budget') {
        const free = ctx.purse.get(tg.realm) ?? 0, R = (a.realms || []).find(r => r.id === tg.realm);
        const gold = r2(Math.min(tg.gold, free, R?.gold || 0));
        if (gold < NEED.budget.least) { o.why = 'казну уже разобрали другие советы'; continue; }
        const k = gold / tg.gold;
        ctx.purse.set(tg.realm, free - gold); R.gold = r2(R.gold - gold);
        const by = Object.fromEntries(Object.entries(tg.by).map(([g, v]) => [g, r2(v * k)]));
        t.budget ||= {};
        for (const [g, v] of Object.entries(by)) { const B = t.budget[g] ||= {gold: 0, got: 0}; B.gold = r2(B.gold + v); }
        st.plans[o.answer] = {target: {...tg, gold, by}, since: now, expect: {gold}, s0: st.s};
      } else {
        st.plans[o.answer] = {target: tg, since: now, year: a.hist.year, expect: o.expect, s0: st.s};
      }
      pick = o; break;
    }
    st.last.pick = pick?.answer || null;
    for (const o of st.last.opts) { const x = opts.find(q => q.answer === o.answer); if (x?.why) o.why = x.why; }
    if (tracing()) noteDecision({point: 'town.need', who: `town:${t.id}`, at: now, band: st.lane, policy: 'max', need: st.id, s: st.s, cause: st.cause,
      opts: opts.map(o => ({cmd: o.cmd, key: `${o.cmd}(${o.answer})`, score: o.score, why: o.why || null, note: o.note || null})),
      pick: pick ? `${pick.cmd}(${pick.answer})` : null});
  }
}

// what a town's council is about, for its card (ui/inspect.js): [{need, label, s, lane, cause, plans: [{answer, label, note}],
// last: {pick, opts}, log}]
export function needsOf(t) {
  return Object.values(t.need || {}).map(st => ({need: st.id, label: NEEDS.get(st.id).label, on: st.on, s: st.s, lane: st.lane, cause: st.cause,
    plans: Object.entries(st.plans).map(([id, p]) => ({answer: id, label: ANSWERS.get(id).label, since: p.since, target: p.target})),
    last: st.last, log: st.log || []}));
}
