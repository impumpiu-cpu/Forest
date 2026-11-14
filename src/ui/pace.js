// The pace buttons of the observer's clock (core/clock.js PACE) and its pause, in a box of a screen: the same four
// buttons on every screen that runs time, and the space bar for the pause while the screen is up.
import {PACE} from '../core/clock.js';

// the pace buttons and the pause in a box: `onPace(id)` when one is chosen, `onPause()` for the pause button; the box
// reflects the clock (sync). The space bar toggles the pause while `active()` says the screen is up
// `shown(P)` — whether a pace is offered now (the guild's «По дням» only in the guild; the rest of the screens never see it)
export function mountPace(box, clock, {onPace, onPause, active = () => true, pauseId = null, shown = P => !P.slow} = {}) {
  box.innerHTML = PACE.map(P => `<button type="button" data-val="${P.id}" title="${P.title}" aria-pressed="${P.id === clock.pace}">${P.label}</button>`).join('');
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; onPace(b.dataset.val); });
  const pause = pauseId ? document.getElementById(pauseId) : null;
  pause?.addEventListener('click', () => onPause());
  const sync = () => {
    box.querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.val === clock.pace)); b.hidden = !shown(PACE.find(P => P.id === b.dataset.val)); });
    if (pause) pause.textContent = clock.paused ? 'Дальше' : 'Пауза';
  };
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || !active() || e.target.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault(); onPause();
  });
  sync();
  return sync;
}

