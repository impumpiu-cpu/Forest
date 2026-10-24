// Technologies (data/tech.js, atlas/tech.js; docs/TABLE.md этап 7): the list holds together, the realms find them by
// their race and their towns, a town builds only what its realm knows, a town's smith and market work only its metals.
import {TECHS, techOfBuilding} from '../src/data/tech.js';
import {TOWN_BUILDINGS} from '../src/data/townBuildings.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {knows, canFind} from '../src/atlas/tech.js';
import {offers} from '../src/campaign/town.js';
import {gearDef} from '../src/agents/equipment.js';
import {techOfMaterial} from '../src/data/tech.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

// the list: each building and metal opened by one technology at most; no circle of `requires`; a technology a people may
// know opens buildings that people may build (or it would never matter to it)
const openers = {};
for (const T of TECHS.all()) for (const b of T.opens?.buildings || []) (openers[b] ||= []).push(T.id);
const twice = Object.entries(openers).filter(([, l]) => l.length > 1);
const circle = TECHS.all().filter(T => { const seen = new Set(); const walk = id => { if (seen.has(id)) return id === T.id; seen.add(id); return (TECHS.get(id).requires || []).some(walk); }; return (T.requires || []).some(walk); });
const idle = TECHS.all().flatMap(T => (T.races || []).filter(p => (T.opens?.buildings || []).length && !(T.opens.buildings).some(b => !TOWN_BUILDINGS.get(b).peoples || TOWN_BUILDINGS.get(b).peoples.includes(p)) && !(T.opens?.materials || []).length).map(p => `${T.id}/${p}`));
check('список технологий: одна постройка — одна технология, без кругов, у каждого народа есть что открыть', !twice.length && !circle.length && !idle.length,
  [twice.length ? `дважды: ${twice.map(([b]) => b)}` : '', circle.length ? `круг: ${circle.map(t => t.id)}` : '', idle.length ? `ничего не даёт: ${idle}` : ''].filter(Boolean).join('; '));

const a = generateAtlas({seed: '3', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true, epicYears: {wild: 40, elder: 40, young: 40}});
const R = a.realms.filter(r => r.tech);
const byPeople = {};
for (const r of R) for (const id of r.tech) (byPeople[r.people] ||= new Set()).add(id);
const racesOk = R.every(r => r.tech.every(id => !TECHS.get(id).races || TECHS.get(id).races.includes(r.people)));
check('державы находят технологии, только доступные своему народу', R.some(r => r.tech.length) && racesOk,
  Object.entries(byPeople).map(([p, s]) => `${p}: ${s.size}`).join(', '));
check('у гномов своё: глубинные шахты и магмовая кузня; эльфы и орки их не знают', byPeople.dwarves?.has('deepmining') && !byPeople.elves?.has('deepmining') && !byPeople.orcs?.has('magmaforge'));
const differ = Object.values(a.realms.reduce((m, r) => ((m[r.people] ||= []).push(r.tech.join(',')), m), {})).some(l => new Set(l).size > 1);
check('две державы одного народа знают разное', differ);
const broken = a.towns.filter(t => t.alive).flatMap(t => t.built.filter(b => !knows(a, t.realm, techOfBuilding(b))).map(b => `${t.name}/${b}`));
check('город строит только то, что знает его держава', !broken.length, broken.slice(0, 5).join(', '));
// a town's market: an elven town whose realm knows no iron sells no iron, one that knows it does
const town = a.towns.find(t => t.alive && t.built.includes('forge')) || a.towns.find(t => t.alive);
const r = a.realms.find(x => x.id === town.realm), keep = r.tech;
r.tech = keep.filter(id => id !== 'iron');
const without = offers(town, a).filter(o => o.kind === 'item' && techOfMaterial(gearDef(o.id).material) === 'iron').length;
r.tech = [...keep, ...(keep.includes('iron') ? [] : ['iron'])];
const withIt = offers(town, a).filter(o => o.kind === 'item' && techOfMaterial(gearDef(o.id).material) === 'iron').length;
r.tech = keep;
check('рынок города продаёт железо, только если держава знает ковку железа', without === 0 && (withIt > 0 || !town.built.includes('forge')), `${town.name}: без технологии ${without}, с ней ${withIt}`);
check('держава без списка (старое сохранение) знает всё', knows(a, null, 'iron') && (() => { const x = a.realms[0], t = x.tech; delete x.tech; const k = knows(a, x.id, 'magmaforge'); x.tech = t; return k; })());
void canFind;
if (fail.length) process.exit(1);
