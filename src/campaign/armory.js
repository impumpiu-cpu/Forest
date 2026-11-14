// The guild's armory, its merchant, its forge and its stable (data/rooms.js; plan claude/guild-plan.md Г3б; docs/GUILD.md
// «Оружейная»; the author's word 13.11): the arms and armour of the guild as real pieces (gear words, agents/itemDefs.js
// gearToken) on its racks — bought in its town, brought home as trophies, sold back, locked from taking, made finer at its
// forge; before a party sets out, each one takes from the racks what is better than his own, and leaves his own in its place.
// The stable keeps the guild's beasts (G.store.beasts: an expedition takes them along — campaign/start.js newExpedition).
//   G.armory = {items: [{id, token, locked}], nextId}
import {refuse} from '../core/util.js';
import {HOUSE} from '../data/rooms.js';
import {MATERIALS} from '../data/balance/materials.js';
import {MAX_Q} from '../data/quality.js';
import {BEASTS} from '../data/transport.js';
import {CAMPAIGN as PRICES} from '../data/balance/prices.js';
import {gearDef, gearType, gearValue, gearToken, gearSpec, itemPrice, mayTake} from '../local/index.js';
import {toTown, fromTown} from '../atlas/index.js';
import {offers} from './town.js';
import {roomBy, roomLevel, working} from './house.js';
import {branchesOf, branchWorks, priceK} from './branches.js';

export const armoryOf = G => (G.armory ||= {items: [], nextId: 1});
export const racks = G => roomBy(G, 'armory', 'slots') || 0;
export const stalls = G => roomBy(G, 'stable', 'slots') || 0;
const town = (a, G) => a.towns.find(t => t.id === G.town && t.alive) || null;
const r1 = x => Math.round(x * 10) / 10;
const kindOf = token => { const d = gearDef(token); return !d ? null : d.slot === 'body' ? 'body' : d.tool ? 'tool' : d.ranged ? 'ranged' : d.block && !d.melee ? 'shield' : d.melee ? 'melee' : null; };
// how good a piece is for its kind: the armour it gives, the blow it strikes (its finer work counted by the price, as a tie)
const worth = token => { const d = gearDef(token); if (!d) return 0; return (d.armor ?? 0) * 100 + (d.ranged?.dmg ?? 0) * 10 + (d.melee?.dmg ?? 0) * 10 + (d.block ?? 0) * 20 + gearValue(token) / 1000; };

// ── the prices of the guild's town (HOUSE.armory; the merchant's at his post)
const merchant = G => working(G, 'merchant');
export const buyPrice = (G, token) => Math.max(1, Math.round(gearValue(token) * HOUSE.armory.buy * (merchant(G) ? HOUSE.armory.merchant.buy : 1)));
export const sellPrice = (G, token) => Math.max(0, Math.floor(gearValue(token) * HOUSE.armory.sell * (merchant(G) ? HOUSE.armory.merchant.sell : 1)));
// what the guild's town sells of arms and armour, and of beasts the stable takes
export function shopOf(a, G) {
  const t = town(a, G); if (!t) return {items: [], beasts: []};
  const all = offers(t, a), arms = o => o.kind === 'item' && kindOf(o.id) && kindOf(o.id) !== 'tool';
  const items = all.filter(arms).map(o => ({token: o.id, label: gearDef(o.id).label, kind: kindOf(o.id), price: buyPrice(G, o.id)}));
  // the goods of the branches' towns (campaign/branches.js): what the guild's town does not sell, at their prices × the manager's
  const seen = new Set(items.map(o => o.token));
  for (const br of branchesOf(G)) {
    const bt = branchWorks(a, G, br) ? a.towns.find(x => x.id === br.town) : null; if (!bt) continue;
    for (const o of offers(bt, a)) if (arms(o) && !seen.has(o.id)) { seen.add(o.id); items.push({token: o.id, label: gearDef(o.id).label, kind: kindOf(o.id), price: Math.max(1, Math.round(buyPrice(G, o.id) * priceK(G, br))), at: bt.id, from: bt.name}); }
  }
  return {
    items,
    beasts: stalls(G) ? all.filter(o => o.kind === 'beast' && !o.golem && BEASTS[o.id] && BEASTS[o.id].use !== 'food').map(o => ({kind: o.id, label: BEASTS[o.id].label || o.id, price: Math.round(o.price * (merchant(G) ? HOUSE.armory.merchant.buy : 1))})) : [],
  };
}

// ── the racks
export function buyWhy(a, G, token) {
  if (!racks(G)) return 'нет оружейной';
  if (armoryOf(G).items.length >= racks(G)) return 'в оружейной нет места';
  const o = shopOf(a, G).items.find(x => x.token === token); if (!o) return 'в городе этого не продают';
  if (G.gold < o.price) return `в казне нет ${o.price} зол.`;
  return null;
}
export function buyItem(a, G, token, pay) {
  const why = buyWhy(a, G, token); refuse(why);
  const o = shopOf(a, G).items.find(x => x.token === token), p = o.price;
  pay(G, -p, `оружейная: куплено — ${gearDef(token).label}${o.from ? ` (из ${o.from})` : ''}`); toTown(o.at != null ? a.towns.find(x => x.id === o.at) : town(a, G), p);
  return rack(G, token);
}
const rack = (G, token, locked = false) => { const A = armoryOf(G), it = {id: A.nextId++, token, locked}; A.items.push(it); return it; };
export function sellItem(a, G, id, pay) {
  const A = armoryOf(G), it = A.items.find(x => x.id === id); if (!it) throw new Error('Этого в оружейной нет.');
  const p = r1(fromTown(town(a, G) || {}, sellPrice(G, it.token)));
  A.items = A.items.filter(x => x !== it);
  if (p > 0) pay(G, p, `оружейная: продано — ${gearDef(it.token)?.label || it.token}`);
  return p;
}
export function lockItem(G, id, locked) { const it = armoryOf(G).items.find(x => x.id === id); if (it) it.locked = !!locked; }

// ── the forge: a piece one step finer, up to HOUSE.forge.most, of the metals the forge's level works (mithril never)
const METAL_WORD = {bronze: 'бронзу', iron: 'железо', steel: 'сталь', mithril: 'мифрил'};
const metalTier = token => { const d = gearDef(token), M = MATERIALS[d?.material]; return M ? (M.class.includes('metal') ? M.tier : 0) : 0; };
export function forgeCost(token) {
  const s = gearSpec(token), q = s.q || 0; if (q >= Math.min(HOUSE.forge.most, MAX_Q)) return null;
  return Math.max(1, Math.round((itemPrice(s.type, q + 1, !!s.silver, s.mark || null, s.of || null, !!s.master) - itemPrice(s.type, q, !!s.silver, s.mark || null, s.of || null, !!s.master)) * HOUSE.forge.fee));
}
export function forgeWhy(G, id) {
  if (!working(G, 'forge')) return 'кузница не работает (нет кузницы или кузнеца)';
  const it = armoryOf(G).items.find(x => x.id === id); if (!it) return 'этого в оружейной нет';
  const d = gearDef(it.token); if (d?.quality === false) return 'это не улучшить';
  const M = MATERIALS[d?.material]; if (M?.class.includes('metal') && metalTier(it.token) > roomBy(G, 'forge', 'metal')) return `кузница ${roomLevel(G, 'forge')}-го уровня не берёт ${METAL_WORD[d.material] || d.material}`;
  const c = forgeCost(it.token); if (c == null) return `выше +${HOUSE.forge.most} не улучшить`;
  if (G.gold < c) return `в казне нет ${c} зол.`;
  return null;
}
export function forgeItem(G, id, pay) {
  const why = forgeWhy(G, id); refuse(why);
  const it = armoryOf(G).items.find(x => x.id === id), s = gearSpec(it.token), c = forgeCost(it.token);
  pay(G, -c, `кузница: ${gearDef(it.token).label} — тоньше работа`);
  it.token = gearToken({...s, q: (s.q || 0) + 1});
  return it;
}

// ── a party sets out: each one takes from the racks what is better than his own of each kind (the unlocked pieces his race
// will touch), his own goes onto the rack in its place. → the lines told
export function outfit(G, ms) {
  const A = armoryOf(G), lines = [];
  if (!racks(G) || !A.items.length) return lines;
  for (const m of ms) {
    const took = [];
    const swap = (kind, get, set) => {
      const mine = get(), best = A.items.filter(x => !x.locked && kindOf(x.token) === kind && mayTake(m.race, x.token)).sort((p, q) => worth(q.token) - worth(p.token))[0];
      if (!best || worth(best.token) <= (mine ? worth(mine) : 0)) return;
      A.items = A.items.filter(x => x !== best);
      if (mine && gearDef(mine)) rack(G, mine);
      set(best.token); took.push(gearDef(best.token).label.toLowerCase());
    };
    swap('body', () => m.gear.body, v => { m.gear.body = v; });
    const k = m.gear.hand.findIndex(x => kindOf(x) === 'ranged'), kind = k >= 0 ? 'ranged' : 'melee', at = k >= 0 ? k : Math.max(0, m.gear.hand.findIndex(x => kindOf(x) === 'melee'));
    swap(kind, () => m.gear.hand[at], v => { m.gear.hand[at] = v; });
    if (took.length) lines.push(`${m.name} взял из оружейной: ${took.join(', ')}`);
  }
  return lines;
}
// a party home: its spoils onto the racks while there is room, the rest sold in town; the beasts into the stable while there
// are stalls, the rest sold. → {kept, sold (gold)}
export function bringHome(a, G, K, pay) {
  const t = town(a, G) || {};
  let kept = 0, sold = 0;
  for (const token of K.spoils || []) {
    if (!gearDef(token)) continue;
    if (racks(G) && armoryOf(G).items.length < racks(G)) { rack(G, token); kept++; continue; }
    sold += fromTown(t, sellPrice(G, token));
  }
  K.spoils = [];
  const beasts = (K.beasts || []).filter(b => b.hp > 0 && !BEASTS[b.kind]?.golem), room = Math.max(stalls(G) - (G.store?.beasts?.length || 0), K.tookBeasts || 0);   // (the stalls not taken by those at home; the guild's own back whatever the stable now holds: none of its own sold for a room lost in a move)
  const keep = beasts.slice(0, room), extra = beasts.slice(room);
  for (const b of extra) sold += fromTown(t, Math.floor((PRICES.beasts[b.kind] || 10) * HOUSE.armory.sell));
  if (sold > 0) pay(G, r1(sold), 'продано по возвращении: трофеи и звери, которым нет места');
  return {kept, sold: r1(sold), beasts: [...keep, ...(K.beasts || []).filter(b => b.hp > 0 && BEASTS[b.kind]?.golem)]};
}
export function buyBeast(a, G, kind, pay) {
  const o = shopOf(a, G).beasts.find(x => x.kind === kind); if (!o) throw new Error('В городе таких зверей не продают (или нет конюшни).');
  if ((G.store.beasts || []).length >= stalls(G)) throw new Error('В конюшне нет места.');
  if (G.gold < o.price) throw new Error(`В казне нет ${o.price} зол.`);
  pay(G, -o.price, `конюшня: куплен — ${o.label}`); toTown(town(a, G), o.price);
  G.store.nextBeast = (G.store.nextBeast || 1);
  G.store.beasts.push({id: G.store.nextBeast++, kind, hp: 1, job: null, rider: null});
}
