// The night's watch on the road and the first story of the company in deeds (plan claude/caravan-ver_d.md D3): who stands
// watch goes round by turns; the watch tires, a night's sleep rests; one too tired asks someone to stand for it — whom it
// asks is its own choice (the bond, how rested the other is, what it knows of the other's word), and the other answers by
// its own rules (Ensemble's way: the wish of the one, the answer of the other, each a sum of reasons): yes, «later», no.
// A yes is a promise (K.social.commitments) — kept on the night it is due, or not: the one who promised is hurt or gone
// (failed, through no fault: «impossible»), or just does not get up (broken). What came of it moves the bond, once, here,
// with the fact as its reason; and the next request remembers it. The watch weighs only on tiredness (the user's choice):
// the night's fights are as before. Numbers: data/social.js DUTY.
//   K.duty = {queue: [member id], night: day, on: [member id]}
//   m.social.load = {tired, watched, lastWatch}
//   commitment = {id, kind: 'watch' | 'escort', debtor, creditor, made, due, until, status, why, fact, end, endFact} — status:
//   'accepted', then 'fulfilled', 'failed' (hurt or bound, busy fighting: through no fault), 'impossible' (gone; no need came),
//   'broken' (did not get up, did not go), 'lapsed'
// The escort (D4.2: a promise kept by a deed on the map): on a camp to forage where the night is not quiet, the faint-hearted
// asks one bolder to go along when it goes out (escortAsk); the map gives the one who promised the task (settlement/together.js
// escortOption), the camp's outcome says what came of it and why (campaign/camp.js), the campaign closes it (takeEscorts).
import {DUTY} from '../data/social.js';
import {ensureSocial, campaignFact, bondBy, bondOf, repayer} from './social.js';
import {draw} from './start.js';
import {fateOf} from '../social/fate.js';
import {tracing, noteDecision, r3} from '../core/decide.js';
import {TRAITS} from '../data/traits.js';

const loadOf = m => ((m.social ||= {}).load ||= {tired: 0, watched: 0, lastWatch: null});
export const tiredOf = m => m.social?.load?.tired || 0;
// may stand watch: in the company, free, not badly hurt
export const mayWatch = m => m.alive && !m.captive && m.hp >= DUTY.badly;
const name = (K, id) => K.members.find(m => m.id === id)?.name || '—';
const fem = (K, id) => K.members.find(m => m.id === id)?.gender === 'f';
const traitsOf = m => m.local?.traits || [];

// what one knows of another's word: kept and broken promises to it, as it remembers them (m.social.memory → facts)
function wordOf(K, judge, other) {
  const S = ensureSocial(K), mine = new Set((judge.social?.memory || []).map(x => x.fact));
  let kept = 0, broke = 0;
  for (const f of S.facts) if (mine.has(f.id) && f.by === other.id) { if (f.kind === 'tookWatch' || f.kind === 'keptEscort') kept++; else if (f.kind === 'brokeWord') broke++; }
  return {kept, broke};
}
// favours the asker did the one asked: the watches it stood for it
const owes = (K, asked, asker) => ensureSocial(K).facts.filter(f => f.kind === 'tookWatch' && f.by === asker.id && f.to === asked.id).length;

// whom one asks: of those free tonight, the best by the bond, the rest and the word (ties: the lower id)
function whomToAsk(K, asker, free) {
  const P = DUTY.pick;
  let best = null, bs = -Infinity, why = null;
  for (const o of free) {
    const w = wordOf(K, asker, o), parts = {bond: P.bond * bondOf(K, asker.id, o.id), rested: P.rested * (1 - tiredOf(o)), kept: P.kept * w.kept, broke: P.broke * w.broke};
    const s = Object.values(parts).reduce((x, y) => x + y, 0);
    if (s > bs || (s === bs && o.id < best.id)) { bs = s; best = o; why = parts; }
  }
  return best ? {m: best, score: bs, why} : null;
}
// the answer of the one asked: the sum of the rules that hold, each a reason
function answer(K, asked, asker, r) {
  const A = DUTY.answer, t = traitsOf(asked), w = wordOf(K, asked, asker);
  const why = {base: A.base, bond: A.bond * bondOf(K, asked.id, asker.id), tired: A.tired * tiredOf(asked), owes: A.owes * owes(K, asked, asker), broke: A.broke * w.broke,
    ...(t.includes('lazy') ? {lazy: A.lazy} : {}), ...(t.includes('diligent') ? {diligent: A.diligent} : {}), noise: A.noise * (2 * r() - 1)};
  const v = Object.values(why).reduce((x, y) => x + y, 0);
  return {say: v >= 0 ? 'yes' : v >= -DUTY.later ? 'later' : 'no', v, why};
}

// the evening's watch: tonight's turn, the requests of the tired, the promises due — then who is on, and the night's rest.
// `camping` — a camp or a stop (more sleep); in a town nobody stands watch. Called once a day (campaign/march.js caravanDay)
export function nightWatch(a, K, {camping = false, say = () => {}} = {}) {
  const S = ensureSocial(K), D = (K.duty ||= {queue: [], night: null, on: []});
  if (D.night === K.day) return D.on;   // (once a day)
  D.night = K.day;
  const ms = K.members.filter(m => m.alive && !m.captive);
  if (K.inTown) { for (const m of ms) rest(m, DUTY.rest.town); D.on = []; lapse(K); return D.on; }
  // the turn: the queue keeps everyone free once, in the order they came; the first who may watch stand tonight
  const ids = new Set(ms.map(m => m.id));
  D.queue = D.queue.filter(id => ids.has(id)); for (const m of ms) if (!D.queue.includes(m.id)) D.queue.push(m.id);
  const byId = id => K.members.find(m => m.id === id), able = D.queue.map(byId).filter(mayWatch);
  let on = able.slice(0, Math.max(1, Math.min(DUTY.watch, Math.floor(able.length / DUTY.per))));
  lapse(K);   // (first: a promise past its days or with a side gone is closed before any is kept — a lapsed one is never fulfilled)
  const {r, done} = draw(K, 'social'), relieved = [];
  try {
    // the promises due tonight: the one who promised stands in for the other, or does not
    on = keepPromises(K, on, able, say);
    // a good turn paid back: the worn out on tonight's watch relieved, unasked, by one it did a good turn to lately
    for (const m of [...on]) {
      if (tiredOf(m) < DUTY.askAt) continue;
      const got = repayer(K, m, able.filter(o => !on.includes(o) && o !== m), tiredOf); if (!got) continue;
      const [o, turn] = got, f = campaignFact(K, 'repaid', {by: o.id, to: m.id, saw: ms.map(x => x.id), params: {for: turn.id}});
      bondBy(K, m.id, o.id, DUTY.bond.kept, f);
      on = on.map(x => (x === m ? o : x)); relieved.push(m.id);
      say(`${o.name} сам${fem(K, o.id) ? 'а' : ''} встал${fem(K, o.id) ? 'а' : ''} в дозор за ${m.name}: долг платежом красен.`, [o.id, m.id]);
    }
    // the tired on tonight's watch ask to be relieved
    for (const m of [...on]) {
      if (tiredOf(m) < DUTY.askAt || S.commitments.some(c => c.status === 'accepted' && c.creditor === m.id)) continue;
      const refused = new Set(S.facts.filter(f => f.kind === 'asked' && f.by === m.id && f.params?.answer === 'no' && K.day - f.day < DUTY.reask).map(f => f.to));
      const free = able.filter(o => !on.includes(o) && o !== m && tiredOf(o) <= tiredOf(m) - DUTY.gap && !refused.has(o.id));   // (nobody fresher to ask: one bears it)
      const to = whomToAsk(K, m, free); if (!to) continue;
      const ans = answer(K, to.m, m, r), here = ms.map(x => x.id);
      if (tracing()) {   // (the trace: whom it asked among whom, and the answer with its reasons — core/decide.js)
        noteDecision({point: 'caravan.watch', who: `member:${m.id}`, at: K.day, band: 'routine', policy: 'rule', opts: free.map(o => ({cmd: 'caravan.watch.ask', key: `caravan.watch.ask(${o.id})`, score: o === to.m ? r3(to.score) : null})), pick: `caravan.watch.ask(${to.m.id})`});
        noteDecision({point: 'caravan.watch', who: `member:${to.m.id}`, at: K.day, band: 'routine', policy: 'rule', opts: Object.entries(ans.why).map(([k, v]) => ({cmd: 'caravan.watch.answer', key: k, score: r3(v)})), pick: `caravan.watch.answer(${ans.say})`});
      }
      const f = campaignFact(K, 'asked', {by: m.id, to: to.m.id, saw: here, params: {answer: ans.say, v: Math.round(ans.v * 100) / 100, why: round(ans.why), chose: round(to.why)}});
      if (ans.say === 'no') { const friend = bondOf(K, m.id, to.m.id) >= DUTY.toldNo; bondBy(K, m.id, to.m.id, DUTY.bond.no, f); if (friend) say(`${m.name} просит подмены в дозоре — ${to.m.name} отказывает${tiredOf(to.m) >= DUTY.askAt ? ': ' + (fem(K, to.m.id) ? 'сама' : 'сам') + ' с ног валится' : ''}.`, [m.id, to.m.id]); continue; }
      // «later» is «your next turn»: due from tomorrow, held till the watch has gone round once more (and DUTY.promiseDays
      // over, for a night or two of the turn missed by the wounds)
      const turn = Math.ceil(able.length / Math.max(1, on.length));
      const c = {id: f.id, kind: 'watch', debtor: to.m.id, creditor: m.id, made: K.day, due: ans.say === 'yes' ? K.day : K.day + 1, until: K.day + (ans.say === 'yes' ? 0 : turn + DUTY.promiseDays), status: 'accepted', fact: f.id};
      S.commitments.push(c);
      say(ans.say === 'yes' ? `${m.name} еле стоит на ногах; ${fem(K, m.id) ? 'её' : 'его'} дозор ${fem(K, to.m.id) ? 'взяла' : 'взял'} ${to.m.name}.` : `${m.name} просит подмены; ${to.m.name} обещает отстоять за ${fem(K, m.id) ? 'неё' : 'него'} ${fem(K, m.id) ? 'её' : 'его'} следующую смену.`, [m.id, to.m.id]);
      if (ans.say === 'yes') on = keepPromises(K, on, able, say);
    }
  } finally { done(); }
  // the night: the watchmen tire, the others sleep
  for (const m of ms) if (on.includes(m)) { const L = loadOf(m); L.tired = Math.min(1, L.tired + DUTY.tiredWatch); L.watched++; L.lastWatch = K.day; } else rest(m, camping ? DUTY.rest.camp : DUTY.rest.march);
  // to the end of the queue go those who stood (or would have stood: the one relieved too — its turn is taken)
  const went = new Set([...on.map(m => m.id), ...relieved, ...S.commitments.filter(c => c.end === K.day && c.status === 'fulfilled').map(c => c.creditor)]);
  D.queue = [...D.queue.filter(id => !went.has(id)), ...D.queue.filter(id => went.has(id))];
  D.on = on.map(m => m.id);
  return D.on;
}
const rest = (m, v) => { const L = loadOf(m); L.tired = Math.max(0, L.tired - v); };
// a night off the watch for all (aboard a ferry the boat's crew keeps it: campaign/ferry.js) — rested as in a camp
export function offDuty(K) { for (const m of K.members) if (m.alive && !m.captive) rest(m, DUTY.rest.camp); }
const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));

// tonight's promises: for each one due whose creditor is on tonight — kept (the debtor takes the place), failed through no
// fault (gone, hurt, bound), or broken (it would not get up); the outcome is a fact and moves the bond once
function keepPromises(K, on, able, say) {
  const S = ensureSocial(K), byId = id => K.members.find(m => m.id === id), here = K.members.filter(m => m.alive && !m.captive).map(m => m.id);
  for (const c of S.commitments) {
    if (c.status !== 'accepted' || c.due > K.day || (c.kind ?? 'watch') !== 'watch') continue;   // (an escort is kept on the map)
    const cr = byId(c.creditor), db = byId(c.debtor);
    if (!cr || !on.includes(cr)) continue;   // the creditor is not on tonight: the promise waits for its turn
    if (!db || fateOf(db) !== 'in') { close(K, c, 'impossible', fateOf(db || {})); continue; }   // the one who promised is gone: nobody's fault
    if (!mayWatch(db)) { close(K, c, 'failed', db.captive ? 'bound' : 'hurt'); const f = campaignFact(K, 'wordFailed', {by: db.id, to: cr.id, saw: here, params: {why: c.why}}); c.endFact = f.id; say(`${cr.name} стоит в дозоре ${fem(K, cr.id) ? 'сама' : 'сам'}: ${db.name}, ${fem(K, db.id) ? 'обещавшая' : 'обещавший'} подмену, ${db.captive ? 'в путах' : fem(K, db.id) ? 'ранена' : 'ранен'}.`, [db.id, cr.id]); continue; }
    if (on.includes(db)) continue;   // on watch itself tonight: the promise waits for another night
    const lazy = traitsOf(db).includes('lazy') && tiredOf(db) >= DUTY.shirkAt && bondOf(K, db.id, cr.id) <= 0 && !owes(K, db, cr);
    if (lazy) {
      close(K, c, 'broken', 'ignored');
      const f = campaignFact(K, 'brokeWord', {by: db.id, to: cr.id, saw: here, params: {why: 'ignored'}}); c.endFact = f.id;
      bondBy(K, cr.id, db.id, DUTY.bond.broke, f);
      say(`${cr.name} ${fem(K, cr.id) ? 'ждала' : 'ждал'} подмены, а ${db.name} так и не ${fem(K, db.id) ? 'встала' : 'встал'} — ${cr.name} ${fem(K, cr.id) ? 'отстояла' : 'отстоял'} и эту ночь.`, [db.id, cr.id]);
      continue;
    }
    close(K, c, 'fulfilled');
    const f = campaignFact(K, 'tookWatch', {by: db.id, to: cr.id, saw: here, params: {promise: c.id}}); c.endFact = f.id;
    bondBy(K, cr.id, db.id, DUTY.bond.kept, f);
    on = on.map(m => (m === cr ? db : m));
    if (c.due < K.day || c.made < K.day) say(`${cr.name} спит: ${db.name} ${fem(K, db.id) ? 'сдержала' : 'сдержал'} слово и стоит в дозоре за ${fem(K, cr.id) ? 'неё' : 'него'}.`, [db.id, cr.id]);
  }
  return on;
}
// the promises past their days: lapsed — the creditor's turn did not come while it held (it was relieved by the turn, or
// hurt): nobody's fault, the bond is not moved
function lapse(K) {
  const S = ensureSocial(K), byId = id => K.members.find(m => m.id === id);
  for (const c of S.commitments) {
    if (c.status !== 'accepted') continue;
    // a side gone (dead, taken, sold, left): nobody's fault, closed at once, not on the turn that will not come
    const db = byId(c.debtor), cr = byId(c.creditor);
    if (!db || fateOf(db) !== 'in') close(K, c, 'impossible', fateOf(db || {}));
    else if (!cr || fateOf(cr) !== 'in') close(K, c, 'impossible', `to:${fateOf(cr || {})}`);
    else if (K.day > c.until) close(K, c, 'lapsed');
  }
  S.commitments = S.commitments.filter(c => c.status === 'accepted' || K.day - (c.end ?? K.day) <= DUTY.promiseDays * 10);   // (the closed ones a while, for the cards)
}
function close(K, c, status, why = null) { c.status = status; c.why = why; c.end = K.day; }

// ── the escort: asked on the evening a camp to forage begins where the night is not quiet (campaign/march.js evening)
const braveOf = m => (m.local?.own?.mul?.bravery ?? 1) + traitsOf(m).reduce((v, id) => v + (TRAITS.get(id)?.mods?.bravery ?? 0), 0);
export function escortAsk(a, K, say = () => {}) {
  const S = ensureSocial(K), E = DUTY.escort, ms = K.members.filter(m => mayWatch(m));
  if (K.mode === 'auto') return null;   // (the quick walk plays no map: a promise kept by a deed there would only lapse)
  if (S.commitments.some(c => c.kind === 'escort' && c.status === 'accepted')) return null;
  const asker = ms.filter(m => braveOf(m) < E.timid).sort((p, q) => braveOf(p) - braveOf(q) || p.id - q.id)[0]; if (!asker) return null;
  const free = ms.filter(o => o !== asker && braveOf(o) >= E.bold);
  const to = whomToAsk(K, asker, free); if (!to) return null;
  const {r, done} = draw(K, 'social'), ans = answer(K, to.m, asker, r); done();
  const here = K.members.filter(m => m.alive && !m.captive).map(m => m.id);
  const f = campaignFact(K, 'askedEscort', {by: asker.id, to: to.m.id, saw: here, params: {answer: ans.say, v: Math.round(ans.v * 100) / 100, why: round(ans.why)}});
  if (ans.say !== 'yes') { if (ans.say === 'no') bondBy(K, asker.id, to.m.id, DUTY.bond.no, f); return {asked: to.m.id, answer: ans.say}; }
  const c = {id: f.id, kind: 'escort', debtor: to.m.id, creditor: asker.id, made: K.day, due: K.day + 1, until: K.day + E.days, status: 'accepted', fact: f.id};
  S.commitments.push(c);
  say(`${asker.name} боится ходить одн${fem(K, asker.id) ? 'а' : 'им'} за едой: ${to.m.name} обещает пойти рядом.`, [asker.id, to.m.id]);
  return {asked: to.m.id, answer: 'yes', c};
}
// the escorts due on a camp's day, for its setup (campaign/camp.js campSetup): both on the map
export const escortsDue = (K, present) => ensureSocial(K).commitments.filter(c => c.kind === 'escort' && c.status === 'accepted' && c.due <= K.day && present.has(c.debtor) && present.has(c.creditor)).map(c => ({id: c.id, debtor: c.debtor, creditor: c.creditor}));
// what the map gave of them (campaign/fight.js applyCamp): kept — the bond grows by the deed; not — by its reason
const ESCORT_END = {kept: ['fulfilled'], hurt: ['failed', 'hurt'], busy: ['failed', 'busy'], notNeeded: ['impossible', 'notNeeded'], ignored: ['broken', 'ignored']};
export function takeEscorts(K, out = [], say = () => {}) {
  const S = ensureSocial(K), here = K.members.filter(m => m.alive && !m.captive).map(m => m.id);
  for (const p of out) {
    const c = S.commitments.find(x => x.id === p.id && x.status === 'accepted'); if (!c) continue;
    if (p.state === 'open' && p.why === 'notNeeded' && K.day < c.until) continue;   // (it never went out today: another day of the camp may need it)
    const [status, why] = ESCORT_END[p.state === 'kept' ? 'kept' : p.why] || ESCORT_END.busy;
    close(K, c, status, status === 'fulfilled' ? null : why);
    const db = K.members.find(m => m.id === c.debtor), cr = K.members.find(m => m.id === c.creditor);
    if (status === 'fulfilled') {
      const f = campaignFact(K, 'keptEscort', {by: c.debtor, to: c.creditor, saw: here, params: {promise: c.id}}); c.endFact = f.id;
      bondBy(K, c.creditor, c.debtor, DUTY.bond.kept, f);
      say(`${db?.name} ${fem(K, c.debtor) ? 'сдержала' : 'сдержал'} слово: ходил${fem(K, c.debtor) ? 'а' : ''} рядом с ${cr?.name}, пока ${fem(K, c.creditor) ? 'та' : 'тот'} собирал${fem(K, c.creditor) ? 'а' : ''} еду.`, [c.debtor, c.creditor]);
    } else if (status === 'broken') {
      const f = campaignFact(K, 'brokeWord', {by: c.debtor, to: c.creditor, saw: here, params: {why: 'escort'}}); c.endFact = f.id;
      bondBy(K, c.creditor, c.debtor, DUTY.bond.broke, f);
      say(`${cr?.name} ${fem(K, c.creditor) ? 'ждала' : 'ждал'} провожатого, а ${db?.name} так и не пош${fem(K, c.debtor) ? 'ла' : 'ёл'}.`, [c.debtor, c.creditor]);
    } else if (status === 'failed') { const f = campaignFact(K, 'wordFailed', {by: c.debtor, to: c.creditor, saw: here, params: {why}}); c.endFact = f.id; }
  }
}
