// Monsters that come with raids. There is no magic in the world: every undead thing is the work of
// the rot — a fungus that settles in a dead (or still living) body and moves it. Necromancers grow it
// and steer the dead with smells and draughts, not spells. Strains of the rot make the whole host:
//   zombie   — a fresh corpse, rots fast in warmth;
//   skeleton — bones grown through with mycelium in place of sinews; arrows pass through it;
//   upyr     — the rot in a still living body: hungry for blood, half-witted, hates the sun;
//   vampire  — the same strain in lasting balance: the mind is kept, centuries of life, silver burns it.
// Fields beyond a species' usual ones:
//   mind      — 'mindless' | 'beast' | 'semi' | 'sentient' (data/species.js MINDS)
//   mindless  — walks into fire, never flees, goes straight for the living instead of the stores
//   rots      — health lost per tick in warmth (above 12 °C); `sun` — extra loss in daylight
//   drinks    — share of the damage it deals that heals it (blood)
//   (resist — what blows do to its body — lives in data/balance/creatures.js with its other numbers)
//   weakTo    — ['silver']: plain weapons barely hurt it (agents/combat.js)
//   undead    — no needs, no fear, the rot: a necromancer steers it (`a.master`)
//   kind      — 'undead' (data/species.js KINDS); the necromancer is a race, a human gone wrong
import {RACES} from './races.js';
import {bodyFor} from './balance/creatures.js';
import {personNames} from './names.js';
import {onEdit} from './schema/layer.js';
import {DEED_WAYS} from './deeds.js';

const human = RACES.find(r => r.id === 'human');
// what the necromancer takes from a human as he is (not what he has of his own, nor his body's row): read again after
// an edit of the tables, so an edit of the human race reaches him too (data/schema/layer.js onEdit)
const OWN = new Set(['id', 'kind', 'label', 'labelAcc', 'plural', 'settle', 'mind', 'look', 'innate', 'align', 'values', 'needs', 'special', 'hp', 'speed', 'attack', 'resist', 'peoples', 'ks', 'names']);
onEdit(() => { const n = MONSTERS.find(m => m.id === 'necromancer'); if (n) for (const k of Object.keys(human)) if (!OWN.has(k)) n[k] = human[k]; });

export const MONSTERS = [
  // Demons are the one magic left in the world: they come through the rifts at live volcanoes and plate
  // seams (atlas/lairs.js `rift`), few and far from the colony. Fire-born: no fire frightens or burns one.
  {id: 'demon', kind: 'fiend', deeds: {lair: [...DEED_WAYS.lair]}, label: 'демон', labelAcc: 'демона', plural: 'демоны', mind: 'semi', fiend: true,
    needs: [], heatHarm: 900, fearHeat: 900, look: {shape: 'spirit', size: 0.9, color: '#c8321e'},
    weakTo: ['silver'],
    killMessage: name => `Демон разорвал поселенца: <b>${name}</b>.`},

  {id: 'zombie', kind: 'undead', label: 'мертвяк', labelAcc: 'мертвяка', plural: 'мертвяки', mind: 'mindless', undead: true,
    needs: [], heatHarm: 45, look: {shape: 'person', size: 0.6, color: '#7f9a78', skin: '#55684f'},
    rots: 0.000012,
    killMessage: name => `Мертвецы растерзали поселенца: <b>${name}</b>.`},

  {id: 'skeleton', kind: 'undead', deeds: {lair: [...DEED_WAYS.lair]}, label: 'костяк', labelAcc: 'костяка', plural: 'костяки', mind: 'mindless', undead: true,
    needs: [], heatHarm: 55, inventory: true, look: {shape: 'person', size: 0.58, color: '#d8d2bd', skin: '#8f8a78'},
    killMessage: name => `Костяки зарубили поселенца: <b>${name}</b>.`},

  {id: 'upyr', kind: 'undead', deeds: {lair: [...DEED_WAYS.lair]}, label: 'упырь', labelAcc: 'упыря', plural: 'упыри', mind: 'semi', undead: true,
    needs: [], heatHarm: 50, look: {shape: 'person', size: 0.6, color: '#9a6f78', skin: '#c9b8b8'},
    drinks: 0.5, sun: 0.0004,
    killMessage: name => `Упыри выпили кровь поселенца: <b>${name}</b>.`},

  {id: 'vampire', kind: 'undead', deeds: {lair: [...DEED_WAYS.vampire]}, label: 'вампир', labelAcc: 'вампира', plural: 'вампиры', mind: 'sentient', undead: true,
    needs: [], heatHarm: 55, inventory: true, look: {shape: 'person', size: 0.64, color: '#5a1f2a', skin: '#e8e2e8'},
    drinks: 0.6, sun: 0.0006, weakTo: ['silver'],
    names: personNames('vampire'),
    killMessage: name => `Вампир осушил поселенца: <b>${name}</b>.`},

  // a necromancer is a human: he walks behind his dead and steers them; kill him and they stagger off
  {...human, id: 'necromancer', kind: 'race', deeds: {lair: [...DEED_WAYS.captors]}, label: 'некромант', labelAcc: 'некроманта', plural: 'некроманты', settle: 0, mind: 'sentient',
    look: {shape: 'person', size: 0.62, color: '#3d3550', skin: '#c8b8a0'},
    innate: [{label: 'гнильщик', note: 'растит гниль и водит мертвецов запахами и отварами'}],
    align: {order: 2, mercy: -5, spread: {order: 0.5, mercy: 0.5}}, values: {knowledge: 3, gold: 1}},
].map(m => bodyFor({needs: [], ...m}));
