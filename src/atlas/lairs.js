// Lairs of the monsters (data/lairs.js): points with an owner species, a strength, an age and a
// territory. At the start of the wild era they are placed on suitable ground, spaced by territory.
// Each season a lair feeds on the prey of its territory (strength grows when fed, wanes when not),
// holds the density of its species up around it, sends out broods that found new lairs when strong,
// fights rival lairs whose territories touch, grows old, and dies out when it is starved or beaten.
// Every one of these turns writes a line to the chronicle.
// Tribes (data/lairs.js, `tribe`) are lairs whose owner is a thinking race: the camp lives off its
// land (the race's `home` over the territory) rather than prey, thins out where the peoples settle,
// and in autumn raids the towns of the peoples its race dislikes (data/relations.js).
// The rot (data/lairs.js ROT): a field on the coarse grid fed by the graves; where it is thick the
// undead lairs spawn (wights on the barrows, ghouls by the ruins, a necromancer's tower where it is
// thickest), live off it and raid any town in reach, leaving more graves.
import {LAIRS, NAME_ADJ, GENDER_INDEX, ANCIENT_YEARS, TRIBE_HOME, TRIBE_RAID, ROT} from '../data/lairs.js';
import {barrows, raidGraves, ruinAt} from './diplomacy.js';
import {RELATIONS} from '../data/relations.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {townFx, might, raidShare, townLabel} from './towns.js';
import {BIOMES} from '../data/biomes.js';
import {SPECIES} from '../data/species.js';
import {ROCK_BY_CODE} from '../data/geology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {faunaCell} from './fauna.js';

const rel = (a, i) => (a.f.elev[i] - a.sea) / (1 - a.sea);

// how well a race's home suits a cell, 0..1 (data/races.js `home`)
const homeAt = (a, L, i) => SPECIES.get(L.species).home[biomeAt(a, i).id] || 0;

// can this kind of lair stand on this cell
function groundFits(a, L, i) {
  if (a.f.ocean[i] || a.f.lake[i] >= 0) return false;
  if (L.ground === 'home') return homeAt(a, L, i) >= TRIBE_HOME && (!L.needsAny || L.needsAny.some(g => groundKind(a, g, i)));
  if (L.ground === 'rot') return !!a.rot && a.rot[faunaCell(a, i)] >= L.rotAt && (L.at === 'barrows' ? (a.f.barrows?.[i] || 0) >= 0.25 : L.at === 'ruins' ? !!ruinNear(a, i) : true);
  return groundKind(a, L.ground, i);
}
function groundKind(a, ground, i) {
  const b = biomeAt(a, i).id, rock = ROCK_BY_CODE[a.f.rock[i]]?.id;
  switch (ground) {
    case 'heights': return rel(a, i) > 0.35 && a.f.flat[i] < 0.6 && b !== 'ice';
    case 'volcano': return a.f.volc[i] > 0.4 || b === 'volcano';
    case 'caves': return rock === 'limestone' || rock === 'basalt';
    case 'deep': return ['forest', 'jungle', 'swamp', 'taiga'].includes(b) && a.f.trees[i] > 0.5;
    case 'open': return ['tundra', 'taiga', 'steppe', 'meadow'].includes(b);
  }
  return false;
}

// a burnt town within three cells
const ruinNear = (a, i) => (a.ruins || []).find(r => Math.abs(r.x - i % a.w) <= 3 && Math.abs(r.y - ((i / a.w) | 0)) <= 3) || null;
// how good a cell is for the lair's species: its carrying capacity there (a tribe: its race's home;
// the dead: the rot)
const goodness = (a, L, i) => (L.undead ? a.rot[faunaCell(a, i)] : L.tribe ? homeAt(a, L, i) : a.fauna.list[a.fauna.idx[L.species]].K[faunaCell(a, i)]);

const DIRS = ['на востоке', 'на юго-востоке', 'на юге', 'на юго-западе', 'на западе', 'на северо-западе', 'на севере', 'на северо-востоке'];
// «in the taiga in the north-east» — where a cell lies, for the chronicle: the commonest land biome
// around it (water does not count) and the side of the world
export function wherePhrase(a, i) {
  const x = i % a.w, y = (i / a.w) | 0, dx = x / a.w - 0.5, dy = y / a.h - 0.5;
  const dir = Math.hypot(dx, dy) < 0.12 ? 'в сердце мира' : DIRS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
  const cnt = {};
  for (let yy = Math.max(0, y - 3); yy <= Math.min(a.h - 1, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(a.w - 1, x + 3); xx++) {
    const b = biomeAt(a, yy * a.w + xx); if (b && b.id !== 'water') cnt[b.id] = (cnt[b.id] || 0) + 1;
  }
  const top = Object.entries(cnt).sort((p, q) => q[1] - p[1])[0];
  return `${top ? BIOMES.get(top[0]).where : ''} ${dir}`.trim();
}

function lairName(L, rnd, used) {
  for (let t = 0; t < 30; t++) {
    const [noun, gen] = L.nouns[(rnd() * L.nouns.length) | 0], adj = NAME_ADJ[(rnd() * NAME_ADJ.length) | 0][GENDER_INDEX[gen]];
    const name = `${adj} ${noun}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  return `${L.label} ${used.size + 1}`;
}

function newLair(a, L, i, rnd, strength, born = a.hist.year) {
  const H = a.hist, name = lairName(L, rnd, H.names);
  const lair = {id: H.nextLair++, kind: L.id, i, x: i % a.w, y: (i / a.w) | 0, name, born, strength, ancient: born <= H.year - ANCIENT_YEARS, alive: true};
  a.lairs.push(lair);
  return lair;
}

const R = (a, L) => L.radius * scaleOf(a);
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

// a free spot for a lair: fits the ground, not inside another lair's territory of the same kind,
// as good as possible among a sample of candidates
function findSpot(a, L, rnd, near, tries = 400) {
  let best = -1, bv = 0;
  for (let t = 0; t < tries; t++) {
    let i;
    if (near) {
      const ang = rnd() * Math.PI * 2, d = R(a, L) * (2 + 2 * rnd());
      const x = Math.round(near.x + Math.cos(ang) * d), y = Math.round(near.y + Math.sin(ang) * d);
      if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
      i = y * a.w + x;
    } else i = (rnd() * a.n) | 0;
    if (!groundFits(a, L, i)) continue;
    const v = goodness(a, L, i) * (0.6 + 0.4 * rnd());
    if (v <= 0.02 || v <= bv) continue;
    const p = {x: i % a.w, y: (i / a.w) | 0};
    if (a.lairs.some(o => o.alive && o.kind === L.id && dist(o, p) < 2 * R(a, L))) continue;
    best = i; bv = v;
  }
  return best;
}

// the race's home over each coarse cell of the beasts' grid, 0..1: what a tribe's land feeds
function homeField(a, L) {
  const F = a.fauna, N = F.W * F.H, out = new Float32Array(N), cnt = new Float32Array(N);
  for (let i = 0; i < a.n; i++) { if (a.f.ocean[i]) continue; const j = faunaCell(a, i); out[j] += homeAt(a, L, i); cnt[j]++; }
  for (let j = 0; j < N; j++) out[j] = cnt[j] ? out[j] / cnt[j] : 0;
  return out;
}

// the rot's field and the mean temperature of each coarse cell (frost and heat burn the rot out);
// a few barrows older than the chronicle, so the dead have somewhere to rise from
function seedRot(a, rnd) {
  const F = a.fauna, N = F.W * F.H, k = scaleOf(a);
  a.rot = new Float32Array(N);
  const temp = new Float32Array(N), cnt = new Float32Array(N);
  for (let i = 0; i < a.n; i++) { if (a.f.ocean[i]) continue; const j = faunaCell(a, i); temp[j] += a.f.temp[i]; cnt[j]++; }
  for (let j = 0; j < N; j++) temp[j] = cnt[j] ? temp[j] / cnt[j] : 0;
  a.rotTemp = temp;
  const n = ROT.ancient[0] + Math.floor(rnd() * (ROT.ancient[1] - ROT.ancient[0] + 1)), spots = [];
  for (let t = 0; t < 400 && spots.length < n; t++) {
    const i = (rnd() * a.n) | 0, b = biomeAt(a, i)?.id;
    if (a.f.ocean[i] || a.f.lake[i] >= 0 || !['steppe', 'meadow', 'tundra', 'shrubland', 'savanna', 'foothills'].includes(b)) continue;
    if (spots.some(q => Math.hypot(q % a.w - i % a.w, ((q / a.w) | 0) - ((i / a.w) | 0)) < 25 * k)) continue;
    spots.push(i); barrows(a, i, Math.max(2, Math.round(3 * k)), ROT.ancientGraves);
  }
  return spots;
}

// a season of the rot: it seeps from the graves, spreads, and fades — faster in frost and heat
export function stepRot(a) {
  const F = a.fauna, N = F.W * F.H, rot = a.rot;
  const B = a.rotBuf ||= {src: new Float32Array(N), cnt: new Float32Array(N), tmp: new Float32Array(N), ward: new Float32Array(N), cell: Int32Array.from({length: a.n}, (_, i) => (a.f.ocean[i] ? -1 : faunaCell(a, i)))};
  const {src, cnt, tmp, cell, ward} = B;
  // the wards of mage towers and temples of the fallen: the rot fades faster around them
  ward.fill(0);
  for (const t of a.towns || []) {
    if (!t.alive) continue;
    const w = (t.built.includes('magetower') ? ROT.wardMage : 0) + (t.built.includes('fallentemple') ? ROT.wardTemple : 0);
    if (!w) continue;
    const j = cell[t.i], x0 = j % F.W, y0 = (j / F.W) | 0;
    for (let y = Math.max(0, y0 - 1); y <= Math.min(F.H - 1, y0 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(F.W - 1, x0 + 1); x++) ward[y * F.W + x] = Math.max(ward[y * F.W + x], w);
  }
  src.fill(0); cnt.fill(0);
  if (a.f.barrows) for (let i = 0; i < a.n; i++) { const j = cell[i]; if (j < 0) continue; src[j] += a.f.barrows[i]; cnt[j]++; }
  else for (let i = 0; i < a.n; i++) { const j = cell[i]; if (j >= 0) cnt[j]++; }
  tmp.set(rot);
  for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
    const j = y * F.W + x;
    if (!cnt[j]) { rot[j] = 0; continue; }
    let s = 0, c = 0;
    if (x > 0) { s += tmp[j - 1]; c++; } if (x < F.W - 1) { s += tmp[j + 1]; c++; }
    if (y > 0) { s += tmp[j - F.W]; c++; } if (y < F.H - 1) { s += tmp[j + F.W]; c++; }
    const T = a.rotTemp[j], fade = ROT.decay + ward[j] + (T < 0 ? ROT.frost * Math.min(1, -T / 10) : 0) + (T > 20 ? ROT.heat * Math.min(1, (T - 20) / 10) : 0);
    rot[j] = Math.max(0, Math.min(1, tmp[j] + ROT.seed * src[j] / cnt[j] + ROT.diffuse * (s / c - tmp[j]) - fade * tmp[j]));
  }
}

export function placeLairs(a, rnd) {
  a.lairs = []; a.tribeLand = {};
  const tally = {};
  a.ancientBarrows = seedRot(a, rnd);
  for (const L of LAIRS.all()) {
    if (L.undead) continue;   // the dead rise through history, where the rot is (spawnUndead)
    if (L.tribe) a.tribeLand[L.id] = homeField(a, L);
    let fit = 0;
    for (let i = 0; i < a.n; i += 3) if (groundFits(a, L, i) && goodness(a, L, i) > 0.02) fit += 3;
    const want = Math.min(L.max, Math.round(fit / 10000 * L.density * (0.7 + 0.6 * rnd())));
    for (let q = 0; q < want; q++) {
      const i = findSpot(a, L, rnd);
      if (i < 0) break;
      // the lairs of the wild were there long before the chronicle begins
      newLair(a, L, i, rnd, 0.4 + 0.5 * rnd(), 1 - Math.floor(rnd() * 2 * ANCIENT_YEARS));
      tally[L.id] = (tally[L.id] || 0) + 1;
    }
  }
  return tally;
}

const power = sp => { const s = SPECIES.get(sp).special; return (s.S[0] + s.S[1]) / 2 + (s.E[0] + s.E[1]) / 2; };

// one season of every lair; returns lines for the chronicle
export function stepLairs(a, rnd, seasonId) {
  const H = a.hist, F = a.fauna, lines = [];
  stepRot(a);
  if (seasonId === 'spring') lines.push(...spawnUndead(a, rnd));
  for (const lair of a.lairs) {
    if (!lair.alive) continue;
    const L = LAIRS.get(lair.kind), r = R(a, L), s = L.tribe || L.undead ? null : F.list[F.idx[L.species]];
    // feed: the prey of the owner around the lair, against what the biomes there could hold;
    // a tribe lives off its land, and the peoples' settlers crowd it out
    let food = 0, cap = 0, land = 0, crowd = 0;
    const cells = [], c = F.c, rr = Math.ceil(r / c);
    const cx = (lair.x / c) | 0, cy = (lair.y / c) | 0;
    for (let y = Math.max(0, cy - rr); y <= Math.min(F.H - 1, cy + rr); y++) for (let x = Math.max(0, cx - rr); x <= Math.min(F.W - 1, cx + rr); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue;
      const j = y * F.W + x; cells.push(j);
      if (s) for (const q of s.prey || []) { food += F.list[q].N[j]; cap += F.list[q].K[j]; }
      else if (L.undead) land = Math.max(land, a.rot[j]);   // the dead feed on the thickest rot they reach
      else { land += a.tribeLand[L.id][j]; for (const pe of a.peoples || []) crowd += pe.u[j] * pe.K[j]; }
    }
    const fed = s ? (cap > 0 ? Math.min(1.2, food / cap) : 0.5)
      : L.undead ? Math.min(1.2, land / (L.rotAt * 1.2))
      : Math.min(1.2, land / cells.length / 0.6) * (1 - 0.8 * Math.min(1, crowd / cells.length));
    const winter = seasonId === 'winter' ? 0.03 : 0;
    lair.strength = Math.max(0, Math.min(1, lair.strength + 0.08 * (fed - 0.45) - winter + 0.02 * (rnd() - 0.5)));
    // the lair keeps its species about: the density near it does not fall below its strength
    if (s) for (const j of cells) if (s.K[j] > 0) s.N[j] = Math.max(s.N[j], s.K[j] * lair.strength);
    if (lair.strength < 0.08) {
      lair.alive = false; lair.died = H.year;
      lines.push(L.undead ? `${G[L.g].emptied} ${L.label} «${lair.name}» ${wherePhrase(a, lair.i)}: гниль иссякла, и ${SPECIES.get(L.species).plural} ${L.species === 'necromancer' ? 'ушёл' : 'рассыпались в прах'}.`
        : `${G[L.g].emptied} ${L.label} «${lair.name}» ${wherePhrase(a, lair.i)}: ${s ? 'добычи' : 'земли'} не стало, и ${SPECIES.get(L.species).plural} ушли.`);
      continue;
    }
    if ((L.tribe || L.undead) && seasonId === 'autumn' && a.towns) { const line = tribeRaid(a, lair, L, rnd); if (line) lines.push(line); }
    const age = H.year - lair.born;
    if (!lair.ancient && age >= ANCIENT_YEARS) {
      lair.ancient = true;
      lines.push(`${cap1(L.label)} «${lair.name}» ${G[L.g].stands} уже ${age} лет: о ${G[L.g].about} слагают страшные сказки.`);
    }
    // a strong lair sends out a brood in spring
    if (seasonId === 'spring' && lair.strength > 0.85 && age >= 3 && rnd() < L.breed && a.lairs.filter(o => o.alive && o.kind === L.id).length < L.max * 1.5) {
      const i = findSpot(a, L, rnd, lair, 60);
      if (i >= 0) {
        lair.strength *= 0.75;
        const young = newLair(a, L, i, rnd, 0.35);
        lines.push(`Молодые ${SPECIES.get(L.species).plural} ${L.from} «${lair.name}» основали ${G[L.g].fresh} ${acc(L)} — «${young.name}» ${wherePhrase(a, i)}.`);
      }
    }
  }
  // rivals whose territories touch fight now and then; the stronger and the fiercer wins
  for (const p of a.lairs) {
    if (!p.alive) continue;
    const Lp = LAIRS.get(p.kind);
    for (const q of a.lairs) {
      if (!q.alive || q.id <= p.id || !Lp.rivals.includes(q.kind)) continue;
      const Lq = LAIRS.get(q.kind);
      if (dist(p, q) > R(a, Lp) + R(a, Lq) || rnd() > 0.08) continue;
      const sp = p.strength * power(Lp.species) * (0.7 + 0.6 * rnd()), sq = q.strength * power(Lq.species) * (0.7 + 0.6 * rnd());
      const [win, lose, Lw, Ll] = sp >= sq ? [p, q, Lp, Lq] : [q, p, Lq, Lp];
      lose.strength *= 0.4; win.strength *= 0.9;
      const who = SPECIES.get(Lw.species), whom = SPECIES.get(Ll.species);
      if (lose.strength < 0.12) {
        lose.alive = false; lose.died = H.year;
        lines.push(`${cap1(who.plural)} ${Lw.from} «${win.name}» разорили ${acc(Ll)} «${lose.name}» ${wherePhrase(a, lose.i)}.`);
      } else lines.push(`${cap1(who.plural)} ${Lw.from} «${win.name}» схватились с ${whomInstr(whom)} ${Ll.from} «${lose.name}» и отогнали их.`);
    }
  }
  return lines;
}

// a tribe's autumn raid: the nearest town within reach of a people its race dislikes; the camp's
// strength against the town's might; the loot feeds the camp, a beating thins it
function tribeRaid(a, lair, L, rnd) {
  const T = TRIBE_RAID, k = scaleOf(a);
  if (lair.strength < T.from || rnd() > T.chance) return null;
  // a tribe raids the peoples its race dislikes (data/relations.js); the dead raid anyone
  const race = SPECIES.get(L.species), dislikes = t => L.undead || (RELATIONS[race.rel]?.[SPECIES.get(WORLD_PEOPLES.get(t.people).race).rel] ?? 0) < 0;
  let target = null, bd = T.reach * k;
  for (const t of a.towns) if (t.alive && dislikes(t)) { const d = dist(lair, t); if (d < bd) { bd = d; target = t; } }
  if (!target) return null;
  const fx = townFx(target), tribe = lair.strength * power(L.species) * (L.might || 1) * T.might * (0.6 + 0.8 * rnd());
  const town = might(target, fx) * (0.6 + 0.8 * rnd()) * (L.undead && target.built.includes('magetower') ? ROT.wardMight : 1);   // the tower's wards turn the dead
  const who = L.leads ? L.leads : cap1(race.plural) + (L.riders ? ` ${L.on}` : ''), P = WORLD_PEOPLES.get(target.people);
  target.raided = a.hist.year;
  if (tribe > town) {
    const loss = T.loss * raidShare(fx);
    target.pop *= 1 - loss; lair.strength = Math.min(1, lair.strength + T.loot);
    raidGraves(a, target);   // the dead of the raid lie unburied, and the rot takes them
    return `${who} ${L.from} «${lair.name}» ${L.raidVerb || 'разграбили'} ${townLabel(target, 1)} ${target.name}: погибло ${Math.round(loss * 100)}% жителей.`;
  }
  lair.strength *= T.beaten;
  // a beaten raid is counted and told once a year (atlas/history.js), not one line each
  const rep = a.hist.repelled ||= {};
  rep[target.people] = (rep[target.people] || 0) + 1;
  return null;
}

// spring: where the rot is thick enough, the dead rise — a new lair of each undead kind, with a
// chance a year, on the ground it asks for, apart from its own kind
function spawnUndead(a, rnd) {
  const F = a.fauna, lines = [], RISE = {wights: 'На курганах', ghouls: 'На пепелище', necromancer: 'Над'};
  for (const L of LAIRS.filter(L => L.undead)) {
    if (rnd() > L.spawn || a.lairs.filter(o => o.alive && o.kind === L.id).length >= L.max) continue;
    const thick = []; for (let j = 0; j < a.rot.length; j++) if (a.rot[j] >= L.rotAt) thick.push(j);
    if (!thick.length) continue;
    let best = -1, bv = 0;
    for (let t = 0; t < 60; t++) {
      const j = thick[(rnd() * thick.length) | 0], x0 = (j % F.W) * F.c, y0 = ((j / F.W) | 0) * F.c;
      const i = Math.min(a.n - 1, (y0 + ((rnd() * F.c) | 0)) * a.w + Math.min(a.w - 1, x0 + ((rnd() * F.c) | 0)));
      if (!groundFits(a, L, i)) continue;
      const v = a.rot[j] * (0.7 + 0.3 * rnd()), p = {x: i % a.w, y: (i / a.w) | 0};
      if (v <= bv || a.lairs.some(o => o.alive && o.kind === L.id && dist(o, p) < 2 * R(a, L))) continue;
      best = i; bv = v;
    }
    if (best < 0) continue;
    const lair = newLair(a, L, best, rnd, 0.35), where = wherePhrase(a, best);
    lines.push(L.id === 'necromancer' ? `Некромант поставил ${L.labelAcc} «${lair.name}» ${where}: по ночам там поднимают мертвецов.`
      : L.id === 'wights' ? `На курганах ${where} поднялись костяки: ${L.label} «${lair.name}».`
      : `На пепелище ${where} завелись упыри: ${L.label} «${lair.name}».`);
  }
  return lines;
}

const cap1 = s => s[0].toUpperCase() + s.slice(1);
// words that agree with the lair's noun
const G = {n: {emptied: 'Опустело', fresh: 'новое', stands: 'стоит', about: 'нём'}, f: {emptied: 'Опустела', fresh: 'новую', stands: 'стоит', about: 'ней'},
  m: {emptied: 'Опустел', fresh: 'новый', stands: 'стоит', about: 'нём'}, pl: {emptied: 'Опустели', fresh: 'новые', stands: 'стоят', about: 'них'}};
const acc = L => L.labelAcc || L.label;
// «with the griffins» — the instrumental plural for the few owners
const INSTR = {griffin: 'грифонами', wyvern: 'вивернами', drake: 'дрейками', spider: 'пауками', stoneworm: 'червями', bat: 'кровопийцами', varg: 'варгами'};
const whomInstr = sp => INSTR[sp.id] || sp.plural;

// the living lair whose territory holds a cell, if any
export function lairAt(a, i) {
  if (!a.lairs) return null;
  const p = {x: i % a.w, y: (i / a.w) | 0};
  let best = null, bd = Infinity;
  for (const l of a.lairs) {
    if (!l.alive) continue;
    const d = dist(l, p);
    if (d <= R(a, LAIRS.get(l.kind)) && d < bd) { best = l; bd = d; }
  }
  return best;
}
