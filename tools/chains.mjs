// Chains of goods of the world's towns (data/townBuildings.js): from what the land gives to what the people use up.
// For each people it says which goods it cannot get (a break), which it makes and nobody takes (a dead end), and which
// buildings stand idle for want of something. The flows are drafts the towns do not run yet; this checks the table
// before they do. `npm run chains` — the report; `node tools/chains.mjs --json file` — the model for a chain map.
import fs from 'fs';
import {TOWN_BUILDINGS, TOWN_GOODS, CATEGORIES, EFFECTS, CHAINS, TOOL_USES, worksOf, upkeepOf, townStart, townNeeds, goodPrice, fuelFor, FUEL} from '../src/data/townBuildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';

const fxText = b => [b.house ? `жильё ${b.house}` : '', ...Object.entries(b.fx || {}).map(([k, v]) => `${EFFECTS[k]} +${v}`)].filter(Boolean).join(', ');

// the model: every way of work of a building is a process; the building's upkeep (repair, warmth, tools) it needs too
export function chainModel() {
  const goods = TOWN_GOODS.all().map(g => ({id: g.id, label: g.label, unit: g.unit, kind: g.kind, raw: !!g.raw, chain: g.chain, note: g.note || null,
    price: goodPrice(g.id), consumable: ['tools', 'arms', 'armor'].includes(g.id), start: g.start || 0, need: g.need || 0}));
  const gates = TOWN_BUILDINGS.all().map(b => ({id: b.id, name: b.name, peoples: b.peoples, requires: b.requires || [], requiresAny: b.requiresAny || [], local: b.local || null,
    needsPlace: [...(b.needs || []), ...(b.needsAny || [])]}));
  const procs = [];
  for (const b of TOWN_BUILDINGS.all()) {
    const keep = upkeepOf(b), ways = worksOf(b);
    // fire: units of fuel for the cycles of fire this way burns (FUEL.uses cycles a unit)
    for (const w of ways) procs.push({id: w.id, at: b.id, building: b.name, name: ways.length > 1 ? `${b.name}: ${w.label}` : b.name, way: ways.length > 1 ? w.label : null,
      cat: CATEGORIES[b.cat], in: w.fire ? {...w.in, coal: (w.in.coal || 0) + fuelFor(w.fire)} : w.in, fire: w.fire || 0, out: w.out, keep, heat: b.heat || 0, repair: b.repair || {}, cycles: b.cycles || 0, herd: b.herd || 0,
      quality: w.quality || null, max: b.max, jobs: b.jobs || 0, house: b.house || 0, tier: b.tier, site: !!b.site, fx: fxText(b),
      needs: [...(b.needs || []), ...(b.needsAny ? ['одно из: ' + b.needsAny.join('/')] : [])]});
  }
  procs.push({id: 'start', at: null, building: 'руки жителей', name: 'руки жителей (старт)', way: null, cat: 'старт', in: {}, out: townStart(), keep: {}, heat: 0, repair: {}, cycles: 0, herd: 0,
    max: 1, jobs: 0, house: 0, tier: 0, site: false, fx: '', needs: [], note: 'город делает сам, без построек: на первые постройки'});
  const sinks = [
    {id: 'people', name: 'Жители (100 чел. за сезон)', in: [...Object.keys(townNeeds()), 'stores'], amounts: {...townNeeds(), stores: 'в голод и зимой'}},
    {id: 'treasury', name: 'Казна державы', in: ['gold']},
  ];
  return {goods, gates, procs, sinks, chains: CHAINS, toolUses: TOOL_USES, fuelUses: FUEL.uses, peoples: WORLD_PEOPLES.ids()};
}

// what works for a people: a process works when its building is open to the people (race and realm) and every good it
// takes, in its work and to keep standing, is made by something that works
export function analyse(M, race = null) {
  const gateOf = Object.fromEntries(M.gates.map(g => [g.id, g]));
  const allowed = g => !race || !g.peoples || g.peoples.includes(race);
  const can = new Set();
  for (let ch = true; ch;) {
    ch = false;
    for (const g of M.gates) {
      if (can.has(g.id) || !allowed(g) || !g.requires.every(r => can.has(r)) || (g.requiresAny.length && !g.requiresAny.some(r => can.has(r)))) continue;
      can.add(g.id); ch = true;
    }
  }
  const on = p => p.at == null || can.has(p.at);
  const takes = p => [...new Set([...Object.keys(p.in), ...Object.keys(p.keep)])];
  const supplied = new Set(), works = new Set();
  for (let ch = true; ch;) {
    ch = false;
    for (const p of M.procs) {
      if (works.has(p.id) || !on(p) || !takes(p).every(g => supplied.has(g))) continue;
      works.add(p.id); ch = true;
      for (const g of Object.keys(p.out)) supplied.add(g);
    }
  }
  const st = {}, issues = [];
  for (const g of M.goods) st[g.id] = {prod: M.procs.filter(p => p.out[g.id]), cons: M.procs.filter(p => takes(p).includes(g.id)), sinks: M.sinks.filter(s => s.in.includes(g.id))};
  const names = l => [...new Set(l.map(p => p.building))].join(', ');
  for (const g of M.goods) {
    const s = st[g.id], prodOn = s.prod.filter(on), consOn = s.cons.filter(on);
    Object.assign(s, {prodOn, consOn, supplied: supplied.has(g.id)});
    // a building that works another way (a kitchen on meat when there is no grain) does not miss this good
    const busy = new Set(M.procs.filter(p => works.has(p.id)).map(p => p.at));
    const needed = consOn.filter(p => !busy.has(p.at));
    let status = 'ok';
    if (!prodOn.length && !consOn.length && !s.sinks.length) status = 'na';
    // (a building of several ways that has none of them is one idle building below, not a break of each of its goods)
    else if ((needed.some(p => !p.way) || s.sinks.length) && !s.supplied) status = 'break';
    else if (consOn.length && !s.supplied) status = 'unused';
    else if (prodOn.length && !consOn.length && !s.sinks.length) status = 'dead';
    else if (s.supplied && !s.sinks.length && !consOn.some(p => works.has(p.id))) status = 'stuck';
    s.status = status;
    if (status === 'break') issues.push({sev: 'break', good: g.id, text: prodOn.length
      ? `«${g.label}»: делают (${names(prodOn)}), но сами стоят`
      : `«${g.label}» нужно (${names(needed) || s.sinks.map(k => k.name).join(', ')}), а взять негде`});
    if (status === 'dead') issues.push({sev: 'dead', good: g.id, text: `«${g.label}» делают (${names(prodOn)}), а дальше никуда${g.raw ? ' — сырое, есть нельзя' : ''}`});
    if (status === 'stuck') issues.push({sev: 'dead', good: g.id, text: `«${g.label}» есть, но всё, что его берёт, стоит (${names(consOn)})${g.raw ? ' — сырое, есть нельзя' : ''}`});
  }
  // a building stands idle when none of its ways works
  for (const g of M.gates) {
    if (!can.has(g.id)) continue;
    const ps = M.procs.filter(p => p.at === g.id);
    if (ps.some(p => works.has(p.id))) continue;
    const miss = [...new Set(ps.flatMap(p => takes(p).filter(x => !supplied.has(x))))];
    const label = id => M.goods.find(x => x.id === id).label;
    issues.push({sev: 'stall', proc: ps[0].id, good: miss[0], text: `${g.name}: стоит — нет ${miss.map(x => '«' + label(x) + '»').join(ps.length > 1 ? ' или ' : ', ')}`});
  }
  return {race, can, supplied, works, st, issues, on};
}

if (process.argv[1]?.endsWith('chains.mjs')) {
  const M = chainModel();
  const j = process.argv.indexOf('--json');
  if (j > 0) { fs.writeFileSync(process.argv[j + 1], JSON.stringify(M)); console.log(`модель цепочек: ${M.procs.length} переделов, ${M.goods.length} благ → ${process.argv[j + 1]}`); }
  else for (const race of [null, ...M.peoples]) {
    const A = analyse(M, race), cnt = k => A.issues.filter(i => i.sev === k).length;
    const at = l => new Set(l.map(p => p.at ?? p.id)).size;
    console.log(`\n── ${race || 'все народы вместе'}: работает ${at(M.procs.filter(p => A.works.has(p.id)))} из ${at(M.procs.filter(A.on))} построек; разрывов ${cnt('break')}, тупиков ${cnt('dead')}, стоят ${cnt('stall')}`);
    for (const i of A.issues) console.log(`   ${i.sev === 'break' ? 'РАЗРЫВ' : i.sev === 'dead' ? 'тупик ' : 'стоит '} ${i.text}`);
  }
}
