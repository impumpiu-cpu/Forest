// The contract of a decision (core/decide.js, data/commands.js; docs/BEHAVIOUR.md «Договор решения»): every mind of the game
// chooses through it. Checked: the catalogue holds every behaviour and every deed under its full id, every point has its
// commands, the marks and profiles name only what is there and never switch off a command that must stay; a run with the
// trace on is the same run as without it, and its records say what was asked and taken; a profile switches off what it
// names — no hostile deed is taken in a world without hostility, no colonist takes up work when work is off, no town builds
// when building is off — and never what must stay. `node tools/minds-check.mjs`
// (that moving the minds onto the contract changed nothing is the baseline's: node tools/minds-baseline.mjs)
import {newGame, step} from '../src/sim.js';
import {DEFAULT_CFG} from '../src/data/presets.js';
import {worldHash} from '../src/world/save.js';
import {HOUR} from '../src/core/time.js';
import {generateAtlas, atlasHash} from '../src/atlas/generate.js';
import {saveAtlas, loadAtlas} from '../src/atlas/save.js';
import {capitals, newCampaign, runCampaign, campaignHash} from '../src/campaign/index.js';
import {BEHAVIOURS} from '../src/data/behaviours.js';
import {DEEDS} from '../src/data/deeds.js';
import {commands, commandOf, commandErrors, maskOf, MARKS, PROFILES, POINTS, resetCommands, localId, deedId} from '../src/data/commands.js';
import {traceMode, traceRecords} from '../src/core/decide.js';
import {COUNCIL} from '../src/data/campaign.js';
import {councilWeight} from '../src/campaign/visit.js';
import {LEANS, LEAN_AXES} from '../src/data/leans.js';
import {leanBonus} from '../src/agents/brains/tabled.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

// ── the catalogue
{
  const errs = commandErrors();
  check('каталог: метки, профили и точки ссылаются на то, что есть', !errs.length, errs.join('; '));
  check('каждое поведение — команда local.behaviour.*', BEHAVIOURS.all().every(d => commandOf(localId(d.id))?.point === 'local.task'));
  check('каждое дело мира — команда world.deed.*', DEEDS.all().every(d => commandOf(deedId(d.id))?.point === 'world.deed'));
  check('два «набега» — две команды', !!commandOf('local.behaviour.raid') && !!commandOf('world.deed.raid'));
  check('у каждой точки решения есть команды', POINTS.all().every(p => commands().all().some(c => c.point === p.id)), `${POINTS.all().length} точек, ${commands().all().length} команд`);
  const must = commands().filter(c => c.must).map(c => c.id);
  check('обязательные команды есть: без сознания, огонь, нужды тела', ['downed', 'fleeFire', 'needs'].every(id => must.includes(localId(id))), must.join(', '));
  // a profile that names a must command by id, and one that names the mark: neither switches it off, and the check tells it
  PROFILES.register({id: '_check_must', label: 'проверка', offMarks: ['must'], off: ['local.behaviour.downed'], note: ''});
  resetCommands();
  const m = maskOf({profile: '_check_must'});
  check('обязательную команду профиль не выключает и проверка о нём говорит', !m?.has('local.behaviour.downed') && commandErrors().some(e => e.includes('_check_must')));
  PROFILES.unregister('_check_must'); resetCommands();
  check('без профиля и с профилем «всё как было» ничего не выключено', maskOf({}) === null && maskOf({profile: 'full'}) === null);
  const hostile = maskOf({profile: 'noHostile'});
  check('«без исходящей агрессии» выключает все враждебные дела и только их', MARKS.hostile.every(id => hostile.has(id)) && [...hostile].every(id => MARKS.hostile.includes(id)) && !hostile.has('world.deed.makePeace'));
  let threw = false; try { maskOf({profile: 'нет такого'}); } catch { threw = true; }
  check('неизвестный профиль — ошибка, а не тихое «всё можно»', threw);
}

// ── the settlement: the trace changes nothing; a profile without work
{
  const cfg = {...DEFAULT_CFG, seed: 'minds', raids: 'often', wildlife: 'many', predators: 'many'};
  const run = (c, ticks) => { const w = newGame(c); for (let t = 0; t < ticks && !w.over; t++) step(w); return w; };
  const ticks = 30 * HOUR;
  const plain = run(cfg, ticks);
  traceMode('debug', {keep: 100000});
  const traced = run(cfg, ticks);
  const recs = traceRecords(), local = recs.filter(r => r.point === 'local.task');
  traceMode('off');
  check('поселение: след не меняет игру', worldHash(plain) === worldHash(traced), `${worldHash(plain)} / ${worldHash(traced)}`);
  check('поселение: след записал мысли существ', local.length > 100, `${local.length} решений`);
  const sane = local.every(r => r.opts.length && r.opts.some(o => o.key === r.pick) && r.opts.every(o => commandOf(o.cmd)));
  check('поселение: в каждой записи выбранное — среди предложенных, команды — из каталога', sane);
  const best = local.filter(r => !r.kept).every(r => { const top = Math.max(...r.opts.map(o => o.score)); return r.opts.find(o => o.key === r.pick).score >= top - 1e-9 || r.opts.length > 1; });
  check('поселение: выбрано наибольшее (или удержанное)', best);
  check('поселение: у решений есть исходы', recs.some(r => r.outcome), `${recs.filter(r => r.outcome).length} с исходом`);

  PROFILES.register({id: '_check_nowork', label: 'проверка', offMarks: [], off: ['local.behaviour.work'], note: ''}); resetCommands();
  const lazy = run({...cfg, profile: '_check_nowork'}, 12 * HOUR);
  const jobs = lazy.agents.filter(a => a.faction === 'colony' && !a.dead && a.task?.id === 'job').length;
  check('поселение без работы: никто не взялся за работу', jobs === 0, `за работой ${jobs}`);
  check('поселение без работы: живут и думают (еда, сон, совет)', lazy.agents.some(a => a.faction === 'colony' && !a.dead && a.task));
  PROFILES.unregister('_check_nowork'); resetCommands();
}

// ── the world: the trace changes nothing; no hostile deed in a world without hostility; no building when building is off
{
  const cfg = {seed: 'mindscheck', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1};
  const plain = generateAtlas(cfg);
  const seen = new Map();
  traceMode('collect', {sink: r => { if (r.point) seen.set(r.point, (seen.get(r.point) || 0) + 1); }});
  const traced = generateAtlas(cfg);
  traceMode('off');
  check('мир: след не меняет историю', atlasHash(plain) === atlasHash(traced));
  check('мир: след записал решения двора, логов и городов', ['world.deed', 'town.project'].every(p => seen.get(p) > 0), [...seen].map(([k, v]) => `${k} ${v}`).join(', '));

  const hostile = [];
  traceMode('collect', {sink: r => { if (r.point === 'world.deed' && MARKS.hostile.includes(r.pick)) hostile.push(r.pick); }});
  const calm = generateAtlas({...cfg, profile: 'noHostile'});
  traceMode('off');
  check('мир без исходящей агрессии: ни одного враждебного дела', !hostile.length, hostile.slice(0, 5).join(', '));
  // (a war after a realm's schism is the system of the schism, not a deed: atlas/realms.js; the profile does not reach it)
  const warsOf = a => Object.values(a.rel || {}).reduce((s, r) => s + (r.wars || 0), 0), schisms = a => a.chronicle.filter(c => /не поделили власть: началась война/.test(c.text)).length;
  check('мир без исходящей агрессии: войны — только после раскола (вне каталога)', warsOf(calm) <= schisms(calm), `${warsOf(calm)} войн, из них после раскола ${schisms(calm)}; в обычном мире ${warsOf(plain)}`);

  PROFILES.register({id: '_check_nobuild', label: 'проверка', offMarks: [], off: ['town.project.build'], note: ''}); resetCommands();
  const bare = generateAtlas({...cfg, profile: '_check_nobuild'});
  const builtOf = a => a.towns.reduce((s, t) => s + t.built.length, 0);
  check('мир без стройки: построек меньше, чем в обычном', builtOf(bare) < builtOf(plain), `${builtOf(bare)} против ${builtOf(plain)}`);
  PROFILES.unregister('_check_nobuild'); resetCommands();
}

// ── the caravan: the trace changes nothing; the old order; a profile without side pursuits
{
  const base = generateAtlas({seed: '777', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), cap = capitals(base).find(c => c.people === 'humans') || capitals(base)[0];
  const walk = (profile = null) => { const a = loadAtlas(JSON.parse(frozen)); if (profile) a.cfg.profile = profile; newCampaign(a, cap.town, {mode: 'auto'}); return runCampaign(a); };
  const plain = walk();
  const recs = [];
  traceMode('collect', {sink: r => { if (r.point?.startsWith('caravan.')) recs.push(r); }});
  const traced = walk();
  traceMode('off');
  check('караван: след не меняет поход', campaignHash(plain) === campaignHash(traced));
  const council = recs.filter(r => r.point === 'caravan.visit' || r.point === 'caravan.camp');
  const drawn = council.every(r => !r.pick || (r.opts.some(o => o.key === r.pick) && r.opts.every(o => o.score > 0 && commandOf(o.cmd)?.band === r.band)));
  check('караван: совет тянет жребий в первой полосе, где есть чего хотеть', council.length > 0 && drawn, `${council.filter(r => r.pick).length} решений, из них с выбором ${council.filter(r => r.opts.length > 1).length}`);
  const need = council.filter(r => r.opts.some(o => commandOf(o.cmd).band === 'yellow'));
  check('караван: стоянка и город нужды прежде выбора', need.every(r => r.band === 'yellow'));
  const quest = recs.filter(r => r.point === 'caravan.quest' && r.pick);
  check('караван: цель квеста — первое по порядку поиска', quest.length > 0 && quest.every(r => r.opts[r.opts.length - 1].key === r.pick), `${quest.length} решений`);
  // the mission profile: at the middle nothing changes; the profile «без влияния склонностей» — the middle
  const mid = {cfg: {profile: 'noLeans'}};
  check('караван: профиль миссии в середине — веса как в таблице', Object.keys(COUNCIL.want).every(id => Math.abs(councilWeight(mid, {people: 'orcs'}, id) - COUNCIL.want[id]) < 1e-9));
  const orc = councilWeight({cfg: {}}, {people: 'orcs'}, 'caravan.camp.heal'), elf = councilWeight({cfg: {}}, {people: 'elves'}, 'caravan.camp.heal');
  check('караван: осторожные эльфы стоят ради раненых охотнее зеленокожих', elf > orc, `эльфы ${elf.toFixed(2)}, зеленокожие ${orc.toFixed(2)}`);
  const side = /приручить|добывать|сколотить|срубить/;
  const lean = walk('noSide'), sideLines = K => (K.log || []).filter(x => side.test(x.text || '')).length;
  check('караван без побочных промыслов: не строит, не приручает, не добывает', sideLines(lean) === 0, `в обычном походе таких стоянок ${sideLines(plain)}`);
}

// ── the leanings of a creature (data/leans.js): own axes, a bounded weight, none at the middle, none without them
{
  const links = LEANS.links.filter(l => l.axis === 'social'), t = {id: 'company'};
  const at = v => leanBonus({leans: {social: v}}, links, t, '');
  check('склонность 0,5 ничего не добавляет', at(0.5) === 0);
  check('склонность тянет в свою сторону, не больше предела', at(1) > 0 && at(0) < 0 && at(1) <= LEANS.cap && at(0) >= -LEANS.cap, `общительный ${at(1)}, замкнутый ${at(0)}`);
  const cfg = {...DEFAULT_CFG, seed: 'leans'}, w = newGame(cfg);
  const col = w.agents.filter(a => a.faction === 'colony');
  check('у каждого поселенца свои склонности, каждая — своя ось 0…1', col.length > 0 && col.every(a => a.leans && Object.values(a.leans).every(v => v >= 0 && v <= 1)) && new Set(col.map(a => a.leans.curious)).size > 1,
    col.slice(0, 3).map(a => `${a.name}: ${Object.entries(a.leans).map(([k, v]) => `${LEAN_AXES[k].label} ${v}`).join(', ')}`).join('; '));
  const run = c => { const x = newGame(c); for (let k = 0; k < 20 * HOUR && !x.over; k++) step(x); return x; };
  const cap = LEANS.cap; LEANS.cap = 0; const zero = run(cfg); LEANS.cap = cap;
  const off = run({...cfg, profile: 'noLeans'}); delete off.cfg.profile;   // (the profile's name aside: it is kept in the settings)
  check('без влияния склонностей — то же, что склонности с нулевым весом', worldHash(off) === worldHash(zero));
}

if (fail.length) { console.log(`\nне прошло: ${fail.length}`); process.exit(1); }
