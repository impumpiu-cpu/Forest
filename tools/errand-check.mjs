// The errands (Ver_F Ф2; data/errands.js, campaign/errands.js, campaign/ending.js handIn; docs/CAMPAIGN.md «Поручения»).
//   the list: every errand of the table, each with whether the world has it and why not; the crown chosen by hand is the walk
//   of the world's own (the same walk, to the same end); each errand the world has is laid out, walked to its end, the same twice;
//   an errand of a lair won lays the lair waste in the world (by the capital's hand); a campaign of chapters waits at the capital
//   after the errand handed in (the world does not move), is saved and loaded there, goes on with the next errand as the
//   unbroken one, ends with the epilogue and the ascension, and keeps its errands in the world's archive. The board (boardFor):
//   a card each, a target picked goes into the quest, the board only reads, a target gone is refused before anything is made.
//   node tools/errand-check.mjs [seed=415]
import {generateAtlas} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, stepCampaign, finished, campaignHash, errandsFor, boardFor, nextErrand, endCampaign, mayAscend} from '../src/campaign/index.js';
import {ERRANDS} from '../src/data/errands.js';

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!cond) fails++; };
const seed = process.argv[2] || '415';
const base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
const fz = JSON.stringify(saveAtlas(base)), fresh = () => loadAtlas(JSON.parse(fz));
const cap = capitals(base)[0];
const walk = (a, K, most = 400) => { let n = 0; while (!finished(K) && K.phase !== 'home' && n < most) { stepCampaign(a); n++; } return n; };
const start = (errand, more = {}) => { const a = fresh(); return [a, newCampaign(a, cap.town, {mode: 'auto', ...(errand ? {errand} : {}), ...more})]; };

// ── the list
const list = errandsFor(base, cap.town);
ok(list.length === ERRANDS.all().length && list.every(e => typeof e.ok === 'boolean'), 'список: каждое поручение таблицы — с тем, есть ли оно в мире', list.map(e => `${e.id}${e.ok ? '' : '−'}`).join(' '));
ok(list.every(e => e.ok || e.why), 'недоступное — с причиной');
ok(list.filter(e => e.ok && ERRANDS.get(e.id).how === 'lair').every(e => e.goal), 'поручение логова — с целью: логово и где оно');

// ── the crown by hand is the world's own walk
{
  const [a1, K1] = start(null), [a2, K2] = start('crown');
  walk(a1, K1); walk(a2, K2);
  ok(campaignHash(K1) === campaignHash(K2) && K1.phase === K2.phase, '«Вернуть корону», выбранное рукой, — тот же поход, что без выбора', `${K1.phase}, день ${K1.day}`);
}

// ── each errand the world has: laid out, walked to its end, the same twice; a lair won is laid waste by the capital
for (const e of list.filter(e => e.ok)) {
  const E = ERRANDS.get(e.id);
  const [a, K] = start(e.id), [b, L] = start(e.id);
  ok(K.quest?.errand === e.id && K.quest.tier === E.tier, `${e.id}: поручение разложено`, K.quest ? `${K.quest.crown.label}; следов ${K.quest.clues.length}` : 'нет');
  if (E.how === 'lair') ok(K.quest.until === E.years * 120 && K.quest.clues.length === E.clueAt.length && K.quest.crown.exact === !E.clueAt.length, `${e.id}: срок, следы и известное место — как в строке`);
  walk(a, K); walk(b, L);
  ok(finished(K), `${e.id}: дошло до конца`, `${K.phase}, день ${K.day}, штурмов ${K.stats.storms || 0}`);
  ok(campaignHash(K) === campaignHash(L), `${e.id}: тот же сид — тот же поход`);
  if (E.how === 'lair' && K.phase === 'won') {
    const l = a.lairs.find(x => x.id === K.quest.lair);
    ok(l && !l.alive && l.clearedBy === K.capital, `${e.id}: логово разорено в мире рукой столицы`, l ? `${l.kind} «${l.name}»` : '');
    ok(K.log.some(x => x.kind === 'home' && x.text.includes('в доказательство')), `${e.id}: трофей принесён в столицу`);
  }
}

// ── a campaign of chapters
{
  const first = list.find(e => e.ok && e.tier === 1)?.id || 'crown', second = list.find(e => e.ok && e.tier === 2)?.id || first;
  const [a, K] = start(first, {chapters: true});
  // (a lair's guard made light, the company hardy: the chapters are the matter here, not whether eight fresh ones take a lair — the quick fight costs
  // what the map does: data/autofight.js)
  if (K.quest?.crown?.guard) K.quest.crown.guard.strength = 0.3;
  for (const m of K.members) for (const k of ['S', 'P', 'E', 'A']) m.special[k] = (m.special[k] ?? 5) + 5;   // (and the company made hardy: the road's fights cost what the map's do)
  walk(a, K);
  ok(K.phase === 'home' && K.done?.length === 1 && K.done[0].errand === first, `главы: поручение «${first}» сдано, караван ждёт в столице`, `${K.phase}, день ${K.day}, казна ${K.gold}, живых ${K.members.filter(m => m.alive).length}, бои ${(K.fights || []).map(f => `${f.how}:${f.kind}:${f.won ? "+" : "-"}:${f.fell.length}:${Math.round(f.ours)}/${Math.round(f.theirs)}`).join(" ")}`);
  const step0 = a.hist.step, day0 = K.day;
  stepCampaign(a); stepCampaign(a);
  ok(a.hist.step === step0 && K.day === day0, 'пока караван ждёт, мир стоит');
  ok(errandsFor(a, K.capital).find(e => e.id === first)?.goal !== list.find(e => e.id === first).goal, 'разорённое логово больше не предлагается', errandsFor(a, K.capital).find(e => e.id === first)?.goal || errandsFor(a, K.capital).find(e => e.id === first)?.why);
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a))));
  ok(b.campaign.phase === 'home', 'сохранённый в столице поход загружается ждущим');
  nextErrand(a, second); nextErrand(b, second);
  ok(K.phase === 'out' && K.quest.errand === second && K.quest.from === day0 && K.members.filter(m => m.alive && !m.captive).every(m => m.hp === 1), `новое поручение «${second}»: та же команда, раны залечены, срок — с сегодняшнего дня`);
  walk(a, K); walk(b, b.campaign);
  ok(campaignHash(K) === campaignHash(b.campaign), 'загруженный в столице поход идёт с новым поручением так же');
  if (K.phase === 'home') {
    endCampaign(a);
    let n = 0; while (!finished(K) && n < 20) { stepCampaign(a); n++; }
    const P = a.campaignsDone?.at(-1);
    ok(finished(K) && K.phase === 'won', 'конец по слову игрока: эпилог рассказан');
    ok(P?.errands?.length === 2 && P.errands.map(d => d.errand).join() === `${first},${second}`, 'архив мира хранит сданные поручения', P?.errands?.map(d => `${d.errand}:${d.tier}`).join(' '));
    ok(mayAscend(K).length > 0, 'живые могут вознестись', `${mayAscend(K).length}`);
    ok(!K.log.some(l => l.kind === 'epilogue' && /корон/.test(l.text)), 'эпилог без короны, которой не было');
  } else ok(true, `второе поручение кончилось иначе: ${K.phase} — главы не проверить до конца на этом сиде`);
}

// ── a campaign of chapters, the deadline past on the way (the author's word 11.11): home with nothing, the word waits again
{
  const e = list.find(x => x.ok && ERRANDS.get(x.id).how === 'lair')?.id || 'crown';
  const [a, K] = start(e, {chapters: true});
  K.quest.until = K.day + 25;   // (a deadline that runs out on the way there)
  const att0 = Object.entries(a.rel || {}).filter(([k]) => k.split(':').map(Number).includes(K.realm)).map(([, r]) => r.att);
  stepCampaign(a); if (K.phase === 'out') stepCampaign(a);
  ok(K.phase === 'empty' || K.phase === 'home', 'главы: срок вышел в пути — караван идёт домой ни с чем', `${K.phase}, день ${K.day}`);
  ok(K.log.some(l => l.text.includes('ни с чем')), 'главы: в летописи — провал и возвращение ни с чем');
  const att1 = Object.entries(a.rel || {}).filter(([k]) => k.split(':').map(Number).includes(K.realm)).map(([, r]) => r.att);
  ok(att0.length === 0 || att1.some((v, k) => v < att0[k] || att0[k] <= -2), 'главы: державы думают о столице хуже', `${att0.map(v => v.toFixed(2))} → ${att1.map(v => v.toFixed(2))}`);
  const b = loadAtlas(JSON.parse(JSON.stringify(saveAtlas(a)))), savedIn = b.campaign.phase;
  walk(a, K); walk(b, b.campaign);
  ok(K.phase === 'home' && K.done?.at(-1)?.failed && K.done.at(-1).gold === 0, 'главы: дома — провал записан, платы нет, снова выбор', `${K.phase}, ${JSON.stringify(K.done?.at(-1))}`);
  ok(campaignHash(K) === campaignHash(b.campaign), `главы: сохранённый ${savedIn === 'empty' ? 'по дороге ни с чем' : 'дома'} идёт так же`);
}
{
  const [a, K] = start(null);
  for (const m of K.members) if (m.core) { m.alive = false; }
  stepCampaign(a);
  ok(K.phase === 'lost' && K.log.some(l => l.text.includes('караван так и не вернулся')), 'погибло ядро — поход кончен: «караван так и не вернулся»', K.phase);
}

// ── the board (plan claude/guild-plan.md Д1; campaign/errands.js boardFor): cards of known places, a target picked, nothing moved
{
  // a capital whose board has two dens or more (else the first with a known place)
  const caps = capitals(base), board = c => boardFor(base, c.town);
  const bc = caps.find(c => board(c).filter(x => x.errand === 'den' && x.targetId != null).length >= 2) || caps.find(c => board(c).some(x => x.targetId != null));
  if (!bc) ok(true, 'доска: в этом мире нет логова с известным местом — выбор цели не проверить на этом сиде');
  else {
    const B = board(bc), kinds = B.filter(x => x.targetId != null), kind = kinds[0].errand, mine = kinds.filter(x => x.errand === kind);
    ok(new Set(B.map(x => x.id)).size === B.length, 'доска: у каждой карточки свой id (два поручения на одно логово — две карточки)', B.map(x => x.id).join(' '));
    ok(B.filter(x => !x.known).every(x => x.at == null), 'доска: место, которое ищут по следам, не выдаётся точкой');
    ok(B.every(x => x.targetId == null || !base.lairs.find(l => l.id === x.targetId)?.hidden), 'доска: скрытое логово не показано');
    ok(kinds.every(x => x.guard > 0 && x.risk && x.days > 0), 'доска: у цели — стража, риск словами и дни пути', kinds.map(x => `${x.id} ${x.guard} ${x.risk} ${x.days} дн.`).join('; '));
    const go = (more) => { const a = fresh(); return [a, newCampaign(a, bc.town, {mode: 'auto', errand: kind, ...more})]; };
    const [, K0] = go({});
    ok(K0.quest.lair === mine[0].targetId, 'доска: без выбора цели — первая карточка, как прежде', `${K0.quest.lair} / ${mine[0].targetId}`);
    if (mine[1]) { const [, K1] = go({targetId: mine[1].targetId}); ok(K1.quest.lair === mine[1].targetId && K1.quest.crown.lair === mine[1].targetId, 'доска: выбранная цель — в квесте', `${K1.quest.lair}`); }
    // the board only reads: the world, the campaign and its streams as they were
    const [a, K] = go({chapters: true}); walk(a, K);
    if (K.phase === 'home') {
      const norm = x => { const o = saveAtlas(x); delete o.savedAt; return JSON.stringify(o); }, before = norm(a), rng = JSON.stringify(K.rng);   // (the save as it is, but the moment it was taken)
      for (let k = 0; k < 3; k++) boardFor(a, K.capital, {K});
      ok(norm(a) === before && JSON.stringify(K.rng) === rng, 'доска: просмотр не меняет ни мир, ни поход, ни потоки');
      const C = boardFor(a, K.capital, {K}).find(x => x.targetId != null && x.ok);
      if (C) {
        const l = a.lairs.find(x => x.id === C.targetId); l.alive = false;
        let threw = null; try { nextErrand(a, C.errand, {targetId: C.targetId}); } catch (e) { threw = e.message; }
        ok(threw && K.phase === 'home' && JSON.stringify(K.rng) === rng, 'доска: цель исчезла — отказ без подмены и без похода', threw || 'не отказал');
        l.alive = true;
        nextErrand(a, C.errand, {targetId: C.targetId});
        ok(K.phase === 'out' && K.quest.lair === C.targetId, 'доска: следующее поручение — на выбранную цель');
      } else ok(true, 'доска: после сдачи нет цели на выбор — не проверить на этом сиде');
    } else ok(true, `доска: первое поручение кончилось иначе (${K.phase}) — просмотр в столице не проверить на этом сиде`);
    { const a = fresh(), l = a.lairs.find(x => x.id === mine[0].targetId); l.alive = false; let threw = null; try { newCampaign(a, bc.town, {mode: 'auto', errand: kind, targetId: l.id}); } catch (e) { threw = e.message; }
      ok(threw && !a.campaign, 'доска: исчезнувшая цель у столицы — поход не создан', threw || 'создан'); }
  }
}

if (fails) { console.log(`\nerrand-check: FAIL ×${fails}`); process.exit(1); }
console.log('\nerrand-check: ok');
