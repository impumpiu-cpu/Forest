// What the code review of 23.10.2026 found (docs/TESTING.md), checked so it does not come back:
// table edits that reach the game, no value copied out of a table at load, the stock's kinds, calamities set by hand,
// the artifact's holder, the quest's reach, gear words that keep what a piece is.
import fs from 'fs';
import path from 'path';
import {setCell, resetAll} from '../src/data/schema/edits.js';
import {TABLES} from '../src/data/schema/index.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {SPECIES} from '../src/data/species.js';
import {CALAMITIES} from '../src/data/calamities.js';
import {LAIR_LIFE} from '../src/data/lairs.js';
import {referenceRaw} from '../src/agents/strength.js';
import {newAtlas, runNextStage, landDone, atlasDone} from '../src/atlas/generate.js';
import {DEFAULT_ATLAS_CFG} from '../src/data/atlas.js';
import {startFree, landPeople, setCalamity, runYears, stepRun} from '../src/atlas/settle.js';
import {questHint} from '../src/atlas/calamity.js';
import {biomeAt} from '../src/atlas/biomes.js';
import {takeKind, peekKinds, kindsOf, settle} from '../src/settlement/kinds.js';
import {gearToken, gearSpec, gearValue, gearType} from '../src/agents/equipment.js';
import {capitals, newCampaign} from '../src/campaign/index.js';
import {reachable} from '../src/campaign/quest.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

// ── the tables
const raw0 = referenceRaw();
setCell('races', 'elf', 'home', {forest: 0.1});
check('правка «Биомы расселения» доходит до народов карты мира', WORLD_PEOPLES.get('elves').home.forest === 0.1);
setCell('races', 'human', 'mods', {});
check('правка людей доходит до некроманта', JSON.stringify(SPECIES.get('necromancer').mods) === '{}');
const e = setCell('forms', 'spear', 'melee.dmg', 3);
check('рейтинг силы считается заново после правки таблиц', !e.error && referenceRaw() !== raw0, `${raw0.toFixed(2)} → ${referenceRaw().toFixed(2)}`);
setCell('worldLife', 'lairLife.grow', 'value', 0.1);
check('параметр новой таблицы пишется туда, откуда его читает игра', LAIR_LIFE.grow === 0.1);
resetAll();
check('сброс возвращает числа кода', LAIR_LIFE.grow === 0.08 && WORLD_PEOPLES.get('elves').home.forest !== 0.1);
check('имена боссов правятся в одном месте (таблица «Имена боссов»)', !TABLES.find(t => t.id === 'calamities').columns.some(c => c.key === 'names') && CALAMITIES.every(c => c.names?.length));
// no number copied out of a data table into a constant of the logic at load (an edit of the table would not reach it)
const COPY = /^(export )?const [A-Za-z_]+ = [A-Z][A-Z_]+(\.[A-Za-z_]+)+\s*;\s*$/;
const copies = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) fs.readFileSync(p, 'utf8').split('\n').forEach((l, n) => { if (COPY.test(l)) copies.push(`${path.relative('src', p)}:${n + 1}`); }); } };
for (const d of ['src/atlas', 'src/campaign', 'src/settlement', 'src/agents', 'src/world', 'src/outside']) walk(d);
// (object references are fine: an edit writes into the object; these few are objects)
const OBJECT_REFS = new Set(['campaign/captives.js', 'agents/combat.js']);
const bad = copies.filter(c => !OBJECT_REFS.has(c.split(':')[0]));
check('в логике нет чисел, скопированных из таблиц при загрузке', !bad.length, bad.slice(0, 5).join(', '));
const tables = TABLES.length, rows = TABLES.reduce((s, t) => s + t.rows().length, 0);
check('таблицы покрывают данные игры', tables >= 60 && rows >= 2000, `${tables} таблиц, ${rows} строк`);

// ── the stock's kinds
{
  const w = {stock: {wood: 10}, kinds: {wood: {oak: 5, holywood: 5}}, cfg: {seed: 'x'}, region: {biomes: {forest: 1}}};
  takeKind(w, 'wood', 3, 'burn');
  check('святое дерево не горит в костре прежде дуба', w.kinds.wood.holywood === 5 && w.kinds.wood.oak === 2);
  takeKind(w, 'wood', 1, 'build');
  check('и не идёт в стройку, пока есть другое', w.kinds.wood.holywood === 5);
  const elf = takeKind(w, 'wood', 1, 'make', 'elf');
  check('мастер (эльф) берёт его в ремесло первым', elf === 'holywood');
  const v = {stock: {wood: 20}, kinds: {wood: {pine: 5}}, cfg: {seed: 'x'}, region: {biomes: {forest: 1, taiga: 1}}}, before = JSON.stringify(v);
  peekKinds(v, 'wood');
  check('панель смотрит склад, не меняя его', JSON.stringify(v) === before);
  const one = {stock: {wood: 9}, kinds: {wood: {}}, cfg: {seed: 'x'}, region: {biomes: {forest: 1, taiga: 1}}}, many = structuredClone(one);
  settle(one, 'wood');
  many.stock.wood = 0; for (let k = 0; k < 30; k++) { many.stock.wood += 0.3; settle(many, 'wood'); }
  const same = Object.keys(kindsOf(one, 'wood')).every(id => Math.abs(one.kinds.wood[id] - many.kinds.wood[id]) < 1e-6);
  check('состав склада не зависит от того, как часто на него смотрят', same);
  const inf = {stock: {wood: Infinity}, kinds: {wood: {}}, cfg: {seed: 'x'}, region: {biomes: {forest: 1}}};
  settle(inf, 'wood');
  check('бесконечный запас не вешает сверку', true);
}

// ── gear words
{
  const t = gearToken({type: 'ironsword', q: 1, mark: 'dwarf', silver: true});
  check('слово вещи помнит серебро', gearSpec(t).silver === true && gearType(t) === 'ironsword', t);
  check('вещь мастера из святого дерева дороже простой', gearValue('bow~holywood!@elf') > gearValue('bow@elf') * 3, `${gearValue('bow~holywood!@elf')} против ${gearValue('bow@elf')}`);
}

// ── «Заселение мира»: calamities, the artifact, the quest
const L0 = (() => { const a = newAtlas({...DEFAULT_ATLAS_CFG, seed: '11', size: 'small'}); while (!landDone(a)) runNextStage(a); return a; })();
const run = (a, y) => { runYears(a, y); while (!stepRun(a)); };
const cellOf = (a, test) => { for (let i = 0; i < a.n; i++) if (!a.f.ocean[i] && a.f.lake[i] < 0 && test(i)) return i; return -1; };
{
  const a = structuredClone(L0); startFree(a);
  setCalamity(a, {kind: 'goblinking', years: 2}); let ok = true;
  try { run(a, 6); } catch (e) { ok = false; }
  check('бедствие со свитой племён идёт и без «Логов по земле»', ok && a.calamities[0].phase !== 'waiting');
}
{
  const a = structuredClone(L0); startFree(a);
  const r = landPeople(a, 'humans', cellOf(a, i => ['meadow', 'steppe', 'forest'].includes(biomeAt(a, i)?.id)));
  const bad = setCalamity(a, {kind: 'necromancer', at: r.town.i, years: 3});
  check('бедствие в город не ставится', !!bad.error, bad.error);
}
{
  const a = structuredClone(L0); startFree(a);
  landPeople(a, 'humans', cellOf(a, i => ['meadow', 'steppe', 'forest'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.5));
  setCalamity(a, {kind: 'brood', years: 2}); setCalamity(a, {kind: 'necromancer', years: 8});
  run(a, 12);
  const [c1, c2] = a.calamities;
  check('второе бедствие не отнимает артефакт у первого', a.artifact.holder.kind !== 'boss' || a.artifact.holder.calamity === c1.id || c1.phase === 'fallen',
    `первое ${c1.phase}, второе ${c2.phase}, артефакт: ${a.artifact.holder.kind} ${a.artifact.holder.calamity ?? ''}`);
  const hint = questHint(a);
  check('квест — у того бедствия, чей босс держит артефакт', !hint || hint.kind !== 'hand' || a.artifact.holder.kind !== 'boss' || hint.calamity === a.artifact.holder.calamity);
}
{
  // a hand's calamity out of the caravan's walk: it gathers where the caravan can reach, not across the sea
  const a = structuredClone(L0); startFree(a);
  landPeople(a, 'humans', cellOf(a, i => ['meadow', 'steppe', 'forest'].includes(biomeAt(a, i)?.id) && i % a.w > a.w * 0.5));
  run(a, 3);
  const caps = capitals(a), K0 = {home: caps[0].town != null ? a.towns.find(t => t.id === caps[0].town).i : 0};
  const {mask} = reachable(a, K0), far = cellOf(a, i => !mask[i]);
  if (far >= 0) {
    setCalamity(a, {kind: 'necromancer', at: far, years: 20});
    const K = newCampaign(a, caps[0].town, {mode: 'auto'});
    check('логово квеста там, куда каравану дойти', !K.quest.epic || mask[K.quest.crown.i], K.quest.crown?.label);
  } else check('логово квеста там, куда каравану дойти (вся суша достижима — нечего проверять)', true);
}

if (fail.length) { console.log(`\n${fail.length} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки ревизии прошли.');
