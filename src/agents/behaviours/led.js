// Led: one a raider leads away — a tame beast after the camp is looted (campaign/camp.js, a.ledBy), or one of the
// people bound where it fell (capture.js): it follows the thief and is gone with it. The thief fallen, it stays and is
// what it was (a.ledFrom: a colonist again, a beast livestock again); the thief over the edge, a beast is stolen and a
// colonist taken into captivity — the chronicle and the people hear of it. Reads: nothing of its own.
import {approach} from '../movement.js';
import {agentById} from '../lookup.js';
import {wake} from '../attention.js';
import {think} from '../mind.js';
import {colonists} from '../../settlement/query.js';
import {log} from '../../core/log.js';
import {esc, g} from '../../core/util.js';
import {PEN} from '../../data/behaviour.js';

// the thief fell: free again, as it was
function freed(w, a) {
  a.brain = a.ledFrom || 'livestock'; a.ledBy = null; a.ledFrom = null; a.ledGone = null; a.task = null;
  if (a.faction === 'colony' && !a.tame) {
    log(w, `<b>${esc(a.name)}</b> ${g(a, 'вырвался', 'вырвалась')} из плена: налётчик пал.`, 'people', 'notice');
    wake(a, 'освободился', 'освободился');
  }
}

// the thief over the edge: gone with it
function taken(w, a) {
  a.gone = true; a.ledGone = null;
  if (a.tame || a.faction !== 'colony') { a.stolen = true; return; }
  const c = w.chronicle;
  c.taken = (c.taken || 0) + 1;
  const r = c.people?.find(p => p.id === a.id); if (r) { r.left = w.tick; r.cause = g(a, 'уведён в плен налётчиками', 'уведена в плен налётчиками'); }
  log(w, `<b>${esc(a.name)}</b> ${g(a, 'уведён', 'уведена')} налётчиками в плен.`, 'death');
  for (const o of colonists(w)) if (o !== a) think(w, o, 'someoneTaken', {name: a.name, f: a.gender === 'f'});
}

export const led = {
  want(w, a) { return a.ledBy == null ? null : [[a.task?.id === 'led' ? a.task : {id: 'led'}, 1, () => 'уводит налётчик']]; },   // (freed this very tick: nothing, the brain is another's from the next)
  step(w, a) {
    const r = agentById(w, a.ledBy);
    if (r?.gone || (!r && a.ledGone)) { taken(w, a); return; }   // (a thief over the edge may be off the list before its captive's step: tasks.js leave marks it)
    if (!r || r.dead) { freed(w, a); return; }
    if (Math.hypot(r.x - a.x, r.y - a.y) > PEN.ledNear) approach(w, a, r.x, r.y, PEN.ledPace);
  },
};
