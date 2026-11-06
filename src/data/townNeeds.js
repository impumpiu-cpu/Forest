// The needs of a town and the answers its council may give them (docs/WORLD.md «Нужды совета»; the design and its table:
// the project's «Нужды и ответы совета»). The first stage: room for the people, and the metal of the works.
//
// A need is a state the town wants — its people have room, its works have their metal — not a deed: «expansion» is one of
// the answers. It is lit by its strength (0 … 1) at `on` and put out below `off` (two thresholds: it does not flicker at the
// edge), and it lives until the state is restored. Its lane is `routine`, `yellow` in a crisis (`crisis`: the strength at
// which the want is no longer a plan for the years ahead but a want of today).
//
// An answer is a ready proposal of a decision point that is there already: a building to raise (town.project — as a goal
// the town builds before its council's own choice), settlers to send (town.settle), a budget of the realm's treasury for the
// works' buying (town.buy). Each is weighed only if it can be done now (its target found: a slot for the house, a spot for
// the settlers, a cell that gives the metal, a seller who has it) and is let by the run's profile (`cmd`); the cause the
// season's reckoning finds for the lack (atlas/treasury.js t.econ.why: money, route, goods — an estimate, not a proof) only
// hints which to look at first (× `hint`), it shuts none out. The weight: need × power × the people's leaning × (1 + k ×
// along(the answer's vector, the rose′)) — the rose′ is the people's rose pulled back from the realm's course (data/mind.js),
// not the wind: the wind holds the needs already, and the need would be counted twice.
//   NEEDS:   id → {label, on, off, crisis}
//   ANSWERS: [{id, need, cmd, label, vec, power, long, causes, review}] — `long`: a project (one at a time a need; a short
//            answer — the budget — may go along with it: what is lacking today is bought while the work is raised); `causes`:
//            what of the diagnosis it treats; `review`: seasons until it is judged by what it brought
//   NEED:    k — the rose's pull in the weight (as data/mind.js MIND.deed); hint; floor — below it no answer is taken; block —
//            seasons an answer that brought nothing is not offered again; budget — share: of the realm's treasury the
//            budgets of a season may take at most, seasons: how many seasons of the lack a budget covers, least: gold below which
//            none is given
//   LEAN:    people → {answer id: ×} — its leaning beyond its rose (the reasons in the table's «Почему так»)
import {Registry} from '../core/registry.js';

export const NEEDS = new Registry('townNeed');
NEEDS.registerAll([
  {id: 'room', label: 'населению хватает места', on: 0.3, off: 0.15, crisis: 1},
  {id: 'metal', label: 'мастерским хватает металла', on: 0.25, off: 0.1, crisis: 2},
]);

export const ANSWERS = new Registry('townAnswer');
ANSWERS.registerAll([
  {id: 'room.build', need: 'room', cmd: 'town.need.build', label: 'строить жильё', vec: {grow: 1}, power: 1, long: true, causes: [], review: 12},
  {id: 'room.settle', need: 'room', cmd: 'town.need.settle', label: 'выслать поселенцев', vec: {grow: 1}, power: 0.8, long: true, causes: [], review: 8},
  {id: 'metal.build', need: 'metal', cmd: 'town.need.build', label: 'поставить рудник или сталеварню', vec: {econ: 1}, power: 1, long: true, causes: ['goods'], review: 16},
  {id: 'metal.budget', need: 'metal', cmd: 'town.need.budget', label: 'выделить казну на привоз', vec: {econ: 1}, power: 1, long: false, causes: ['money'], review: 4},
]);

export const NEED = {k: 1.5, hint: 1.5, floor: 0.02, block: 8, budget: {share: 0.25, seasons: 4, least: 1}};

export const LEAN = {
  humans: {'room.settle': 1.2, 'metal.budget': 1.2},   // the people of the roads: they move readily (migrate 0.02), they trade (taste 1.3)
  dwarves: {'metal.build': 1.3},   // the knowledge of stone
  orcs: {'metal.build': 0.8, 'metal.budget': 0.6},   // the horde trades little (taste 0.6)
  elves: {},
};
