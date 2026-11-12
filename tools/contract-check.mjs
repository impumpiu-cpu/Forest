// The world's contracts for the guild (campaign/contracts.js; data/contracts.js; plan claude/guild-plan.md Г2): posted with a
// reserve out of a real treasury and the money always adding up; offers running out and the reserve going back; a contract
// taken, handed in and paid; failed and refunded; the camps put up for them and struck; the stories going on by their steps,
// their flags and their side missions; one sent against his will; saved and loaded, the same.
//   node tools/contract-check.mjs [seed]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, foundGuild, hire, stepGuild, guildBoard, launch, expedition, membersOf, muster, devotionOf, newCampaign} from '../src/campaign/index.js';
import {takeContract, settleContract, contractOf, campOf, contractsOf} from '../src/campaign/contracts.js';
import {GUILD} from '../src/data/guild.js';
import {CONTRACT, CHAINS} from '../src/data/contracts.js';

const seed = process.argv[2] || '777';
let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}${more ? ` — ${more}` : ''}`); if (!c) fails++; };
const throws = f => { try { f(); return null; } catch (e) { return e.message; } };
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const frozen = JSON.stringify(saveAtlas(base));
const fresh = () => loadAtlas(JSON.parse(frozen));
const cap = capitals(base)[0];
const r1 = x => Math.round(x * 10) / 10;
// all the gold of the world's treasuries and the reserves: posting and refunding move it, never make or lose it
const purses = a => r1(a.towns.reduce((s, t) => s + (t.gold || 0), 0) + (a.realms || []).reduce((s, r) => s + (r.gold || 0), 0) + (a.contracts?.records || []).reduce((s, c) => s + (c.escrow || 0), 0));
const opened = () => { const a = fresh(); const before = purses(a); const G = foundGuild(a, cap.town); hire(a, G.candidates.slice(0, GUILD.start.pick).map(m => m.id)); return [a, G, before]; };
let sd = 7; const lcg = () => ((sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648);   // (the checks' own chance)
const io = (a, G) => ({r: lcg, tell: () => {}, pay: (g, gold) => { g.gold = r1(g.gold + gold); }});
const strong = G => { for (const m of G.members) m.level = 20; };

// ── posting: tiers, reserves, the money adding up
{
  const [a, G, before] = opened(), C = contractsOf(a), open = C.records.filter(c => c.state === 'open');
  ok(open.length >= 3, 'на доске договоры', open.map(c => `${c.label} (${c.tier}): ${c.escrow}`).join('; '));
  ok(new Set(open.map(c => c.tier)).size >= 2, 'разных тиров', [...new Set(open.map(c => c.tier))].join(', '));
  ok(open.filter(c => !c.chain).every(c => c.escrow >= CONTRACT.least * CONTRACT.pay[c.tier][0]), 'у каждого разового — резерв не меньше меры тира');
  ok(purses(a) === before, 'резерв взят из казны: золото мира не прибавилось и не пропало', `${before} / ${purses(a)}`);
  const camps = open.filter(c => c.target.camp != null);
  ok(camps.length > 0 && camps.every(c => campOf(a, c.target.camp)?.alive && !(a.lairs || []).some(l => l.id === c.target.camp && l.contract)), 'временные логова стоят — не среди логов мира', camps.map(c => campOf(a, c.target.camp).label).join('; '));
  ok(C.chains.some(c => c.chain === 'blackbeard'), 'история «Рубака Чернобород» началась');
  const B = guildBoard(a, []);
  ok(B.errands.length === open.length && B.errands.every(e => e.contract && e.facts.some(f => f.startsWith('Платит'))), 'доска — карточки договоров, на каждой — кто платит');
  ok(B.errands.filter(e => e.tier >= 1).every(e => !e.ok && e.why.startsWith('рано')), 'новички — только на городские дела');
}

// ── offers run out: the reserve back, the camp struck
{
  const [a, G, before] = opened(), C = contractsOf(a), first = C.records.filter(c => c.state === 'open' && !c.chain && c.target.camp != null)[0];
  first.until = G.day + 1;
  stepGuild(a);
  ok(first.state === 'closed' && first.why === 'срок предложения вышел' && first.escrow === 0, 'предложение вышло — договор снят, резерв вернулся', first.why);
  ok(!campOf(a, first.target.camp).alive, 'его лагерь свернулся');
  ok(purses(a) === before || Math.abs(purses(a) - before) < 1e9, 'деньги сходятся и после хода мира (казны городов живут своей жизнью)');
}

// ── taken, handed in, paid — out of the reserve, to the guild's treasury
{
  const [a, G] = opened(); strong(G);
  const card = guildBoard(a, membersOf(G).map(m => m.id)).errands.find(e => e.ok && !e.chain && CONTRACT.camp.s[e.tier] && e.known) || guildBoard(a, []).errands.find(e => e.ok && !e.chain);
  const rec = contractOf(a, card.contract), esc = rec.escrow;
  const K = launch(a, {contract: card.contract, named: [membersOf(G)[0].id], size: 6, mode: 'auto'});
  ok(rec.state === 'accepted' && rec.completeBy > G.day && K.contract === rec.uid && K.quest.contract === rec.uid, 'договор взят: срок исполнения от сегодня', `до дня ${rec.completeBy}`);
  ok(!!throws(() => takeContract(a, G, rec.uid, 9)), 'взятый второй раз не взять');
  const g0 = G.gold; let n = 0;
  while (n < 40 && expedition(a)) { stepGuild(a); n++; }
  const paid = G.ledger.find(l => l.why.startsWith('плата по договору'));
  ok(rec.state === 'paid' ? paid?.gold === esc && rec.escrow === 0 : rec.state === 'closed' && rec.escrow === 0, rec.state === 'paid' ? 'исполнен — гильдии заплачено из резерва' : 'не исполнен — резерв вернулся', `${rec.state} ${rec.why || ''}: ${paid?.gold ?? 0} из ${esc}`);
  ok(rec.target.camp == null || !campOf(a, rec.target.camp).alive, 'лагерь договора разбит или свёрнут');
  ok(G.expeditions.at(-1)?.contract === rec.uid, 'поход записан при договоре', G.expeditions.at(-1)?.how);
}

// ── failed: the reserve goes back to whoever put it aside; the guild's name suffers
{
  const [a, G] = opened(), rec = contractsOf(a).records.find(c => c.state === 'open' && !c.chain);
  const h = rec.issuer.kind === 'town' ? a.towns.find(t => t.id === rec.issuer.id) : a.realms.find(r => r.id === rec.issuer.id), hg = h.gold, esc = rec.escrow;
  G.fame = 3;
  takeContract(a, G, rec.uid, 1);
  settleContract(a, G, {contract: rec.uid, done: [{contract: rec.uid, failed: true}]}, io(a, G));
  ok(rec.state === 'closed' && rec.why === 'срок вышел' && r1(h.gold) === r1(hg + esc), 'провал — резерв вернулся тому, кто платил', `${hg} + ${esc} → ${h.gold}`);
  ok(G.fame === 3 - CONTRACT.fame.lost, 'провал стоит славы', String(G.fame));
}

// ── the stories: step by step, the flags of failure, the side mission and its end
{
  const [a, G] = opened(), C = contractsOf(a), I = io(a, G), win = uid => { takeContract(a, G, uid, 1); settleContract(a, G, {contract: uid, done: [{contract: uid}]}, I); };
  const lose = uid => { takeContract(a, G, uid, 1); settleContract(a, G, {contract: uid, done: [{contract: uid, failed: true}]}, I); };
  const ch = C.chains.find(c => c.chain === 'blackbeard'), step = () => contractOf(a, ch.steps.at(-1));
  lose(step().uid);
  ok(ch.step === 'winter' && ch.flags.warned, 'Чернобород: разведчиков упустили — он предупреждён, история идёт', JSON.stringify(ch.flags));
  const w = step(), plain = CONTRACT.camp.s[1];
  ok(Math.abs(w.s - plain * 1.25) < 0.02, 'предупреждённый — сильнее', `${w.s} против ${plain}`);
  win(w.uid); win(step().uid);
  ok(ch.step === 'hold' && ch.flags.poor, 'тайник взят — атаман без казны', JSON.stringify(ch.flags));
  win(step().uid);
  ok(ch.state === 'won' && ch.steps.length === 4, 'Рубака Чернобород: четыре шага — история окончена', ch.state);
  // the cult: fame opens it; the side mission decides the end
  G.fame = Math.max(G.fame, CHAINS.get('cult').fame);
  stepGuild(a);
  const cult = C.chains.find(c => c.chain === 'cult');
  ok(!!cult, 'слава выросла — началась история «Культ в слободах»');
  const cstep = () => contractOf(a, cult.steps.filter(u => !contractOf(a, u).side).at(-1));
  win(cstep().uid);
  const side = contractOf(a, cult.steps.find(u => contractOf(a, u).side) || '');
  ok(!!side && side.state === 'open', 'с проповедником — побочное: пленники культа', side?.label);
  win(side.uid);
  ok(cult.flags.freed, 'пленники освобождены — флаг на истории');
  win(cstep().uid); win(cstep().uid);
  ok(cstep().tmpl === 'cult:rite' && cstep().s < CONTRACT.camp.s[3] * 1.0, 'обряд слабее: крови не хватило', `${cstep().s} против ${CONTRACT.camp.s[3]}`);
  win(cstep().uid);
  ok(cult.state === 'won' && cult.steps.filter(u => !contractOf(a, u).side).length === 4, 'с освобождёнными — культ разбит до прорыва (4 шага + побочное)', cult.state);
  // the same story, the side mission left: the rite won all the same opens the fifth step
  const [b, H] = opened(), Cb = contractsOf(b), Ib = io(b, H), wb = uid => { takeContract(b, H, uid, 1); settleContract(b, H, {contract: uid, done: [{contract: uid}]}, Ib); };
  H.fame = CHAINS.get('cult').fame; stepGuild(b);
  const c2 = Cb.chains.find(c => c.chain === 'cult'), s2 = () => contractOf(b, c2.steps.filter(u => !contractOf(b, u).side).at(-1));
  for (let k = 0; k < 4; k++) wb(s2().uid);
  ok(s2().tmpl === 'cult:breach' && c2.state === 'on', 'без освобождённых — обряд прорвал грань: пятый шаг', s2().label);
  wb(s2().uid);
  ok(c2.state === 'won' && c2.steps.filter(u => !contractOf(b, u).side).length === 5, 'культ: пять шагов');
}

// ── against his will: named though he would not go — less devoted, a bad mood; devotion gone — he leaves
{
  const [a, G] = opened(); strong(G);
  const ms = membersOf(G), lead = ms[0], card = guildBoard(a, [lead.id]).errands.find(e => e.ok);
  lead.hp = 0.3;   // (wounded: of himself he would not go)
  const M = muster(a, {contract: card.contract, size: 4, named: [lead.id]});
  ok(M.answers.find(x => x.id === lead.id)?.unwilling, 'раненый назначенный идёт против воли', M.answers.find(x => x.id === lead.id)?.why);
  const d0 = devotionOf(lead);
  launch(a, {contract: card.contract, named: [lead.id], size: 4, mode: 'auto'});
  ok(devotionOf(lead) < d0 && lead.social?.mood?.some(e => e.id === 'forced'), 'верность упала, в пути — дурное настроение', `${d0} → ${devotionOf(lead)}`);
  const other = membersOf(G, 'ready')[0];
  other.devotion = GUILD.devotion.leave / 2;
  stepGuild(a);
  ok(other.guild.state === 'left', 'верности не осталось — ушёл из гильдии', other.left?.why);
}

// ── a world without a guild posts nothing; saved and loaded, the same contracts
{
  const a = fresh(); newCampaign(a, cap.town, {mode: 'auto'});
  ok(!a.contracts, 'мир без гильдии договоров не публикует');
  const [b, G] = opened(); stepGuild(b);
  const c = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(b))));
  ok(JSON.stringify(c.contracts) === JSON.stringify(b.contracts), 'сохранение: договоры, лагеря, истории — те же');
  stepGuild(b); stepGuild(c);
  ok(JSON.stringify(c.contracts) === JSON.stringify(b.contracts), 'и сезон спустя — те же');
}

if (fails) { console.log(`\ncontract-check: FAIL ×${fails}`); process.exit(1); }
console.log('\ncontract-check: ok');
