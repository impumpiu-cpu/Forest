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
  const first = recs.every(r => !r.pick || r.opts[r.opts.length - 1].key === r.pick);
  check('караван: решения — первое, что захотело, по прежнему порядку', recs.length > 0 && first, `${recs.length} решений: ${['caravan.visit', 'caravan.camp'].map(p => `${p} ${recs.filter(r => r.point === p && r.pick).length}`).join(', ')}`);
  const side = /приручить|добывать|сколотить|срубить/;
  const lean = walk('noSide'), sideLines = K => (K.log || []).filter(x => side.test(x.text || '')).length;
  check('караван без побочных промыслов: не строит, не приручает, не добывает', sideLines(lean) === 0, `в обычном походе таких стоянок ${sideLines(plain)}`);
}

if (fail.length) { console.log(`\nне прошло: ${fail.length}`); process.exit(1); }
