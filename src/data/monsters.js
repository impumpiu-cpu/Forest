// Monsters that come with raids. There is no magic in the world: every undead thing is the work of
// the rot — a fungus that settles in a dead (or still living) body and moves it. Necromancers grow it
// and steer the dead with smells and draughts, not spells. Strains of the rot make the whole host:
//   zombie   — a fresh corpse, rots fast in warmth;
//   skeleton — bones grown through with mycelium in place of sinews; arrows pass through it;
//   upyr     — the rot in a still living body: hungry for blood, half-witted, hates the sun;
//   vampire  — the same strain in lasting balance: the mind is kept, centuries of life, silver burns it.
// Fields beyond a species' usual ones:
//   mind      — 'beast' | 'semi' | 'sentient' (only the sentient can be hired or bargained with)
//   mindless  — walks into fire, never flees, goes straight for the living instead of the stores
//   rots      — health lost per tick in warmth (above 12 °C); `sun` — extra loss in daylight
//   drinks    — share of the damage it deals that heals it (blood)
//   resist    — damage multipliers by kind: {ranged: 0.5}
//   weakTo    — ['silver']: plain weapons barely hurt it (agents/combat.js)
//   undead    — no needs, no fear, the rot: a necromancer steers it (`a.master`)
import {RACES} from './races.js';

const special = (S, P, E, C, I, A, L) => ({S, P, E, C, I, A, L});
const human = RACES.find(r => r.id === 'human');

export const MONSTERS = [
  {id: 'zombie', label: 'мертвяк', labelAcc: 'мертвяка', plural: 'мертвяки', mind: 'beast', undead: true, mindless: true,
    hp: 0.9, speed: 0.075, needs: [], heatHarm: 45, look: {shape: 'person', size: 0.6, color: '#7f9a78', skin: '#55684f'},
    attack: {power: 0.9, cooldown: 18}, rots: 0.000012,
    special: special([5, 8], [1, 3], [7, 10], [0, 0], [0, 1], [1, 3], [0, 0]),
    killMessage: name => `Мертвецы растерзали поселенца: <b>${name}</b>.`},

  {id: 'skeleton', label: 'костяк', labelAcc: 'костяка', plural: 'костяки', mind: 'beast', undead: true, mindless: true,
    hp: 0.7, speed: 0.11, needs: [], heatHarm: 55, inventory: true, look: {shape: 'person', size: 0.58, color: '#d8d2bd', skin: '#8f8a78'},
    attack: {power: 1, cooldown: 14}, resist: {ranged: 0.45},
    special: special([4, 7], [2, 4], [5, 8], [0, 0], [0, 1], [3, 6], [0, 0]),
    killMessage: name => `Костяки зарубили поселенца: <b>${name}</b>.`},

  {id: 'upyr', label: 'упырь', labelAcc: 'упыря', plural: 'упыри', mind: 'semi', undead: true,
    hp: 0.95, speed: 0.155, needs: [], heatHarm: 50, look: {shape: 'person', size: 0.6, color: '#9a6f78', skin: '#c9b8b8'},
    attack: {power: 1.15, cooldown: 12}, drinks: 0.5, sun: 0.0004,
    special: special([5, 10], [5, 9], [6, 10], [0, 2], [1, 3], [5, 10], [1, 4]),
    killMessage: name => `Упыри выпили кровь поселенца: <b>${name}</b>.`},

  {id: 'vampire', label: 'вампир', labelAcc: 'вампира', plural: 'вампиры', mind: 'sentient', undead: true, sentient: true,
    hp: 1.4, speed: 0.15, needs: [], heatHarm: 55, inventory: true, look: {shape: 'person', size: 0.64, color: '#5a1f2a', skin: '#e8e2e8'},
    attack: {power: 1.6, cooldown: 11}, drinks: 0.6, sun: 0.0006, weakTo: ['silver'],
    special: special([9, 12], [8, 12], [9, 12], [8, 13], [8, 13], [8, 12], [3, 8]),
    names: [['Граф Вельмор', 'm'], ['Госпожа Ильвира', 'f'], ['Барон Кастрель', 'm'], ['Морена', 'f']],
    killMessage: name => `Вампир осушил поселенца: <b>${name}</b>.`},

  // a necromancer is a human: he walks behind his dead and steers them; kill him and they stagger off
  {...human, id: 'necromancer', label: 'некромант', labelAcc: 'некроманта', plural: 'некроманты', settle: 0, mind: 'sentient',
    look: {shape: 'person', size: 0.62, color: '#3d3550', skin: '#c8b8a0'}, hp: 0.9,
    special: {...human.special, I: [7, 10], C: [2, 8]},
    innate: [{label: 'гнильщик', note: 'растит гниль и водит мертвецов запахами и отварами'}],
    align: {order: 1, mercy: -3, spread: 0.5}, values: {knowledge: 3, gold: 1}},
].map(m => ({needs: [], ...m}));
