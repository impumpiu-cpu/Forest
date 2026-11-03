// The clock of the observer (docs/GAME.md «Наблюдатель»): one pace for every screen that runs time — the world map
// (a season a step: atlas/history.js), the campaign (a season of the walk, its camps on the local map) and the local map
// (a tick: core/time.js TICK_MS). The pace is world time per real second, not steps per frame, so the same button means
// the same thing everywhere:
//   watch — the observer: half a month a second (a season in 6 s, two and a half years a minute, a world of 120 years in
//           about three quarters of an hour); the local map at its own pace (20 ticks a second: an hour in 2,5 s, a day
//           in a minute) — the pace at which a party is seen walking and a colonist seen working
//   x4, x16 — the same, faster;  max — as fast as the frame allows, the camps not watched
// SeasonClock runs a step every `season` ms (or with a frame's budget at `max`) and tells how far into the season the
// screen is (phase: the parties slide by it, the day of the season is read from it). TickClock turns real time into
// local ticks at `local` × the base pace. Pause is the clock's own; the buttons and the space bar are ui/pace.js.
import {TICK_MS} from './time.js';
import {SEASON_DAYS} from '../data/atlas.js';

export const PACE = [
  {id: 'watch', label: 'Наблюдатель', season: 6000, local: 1, title: 'Полмесяца в секунду: сезон за 6 с, 2,5 года в минуту. На локальной карте — час за 2,5 с'},
  {id: 'x4', label: '×4', season: 1500, local: 4, title: 'Сезон за 1,5 с, 10 лет в минуту'},
  {id: 'x16', label: '×16', season: 375, local: 16, title: 'Сезон за 0,4 с, 40 лет в минуту'},
  {id: 'max', label: 'Сразу', season: 0, local: 0, title: 'Так быстро, как успевает экран; стоянки не показываются'},
];
export const DEFAULT_PACE = 'watch';
export const paceOf = id => PACE.find(p => p.id === id) || PACE[0];
const BUDGET = 30;   // ms of stepping a frame at `max`
const BREATH = 16;   // ms the screen is given between two runs of steps at `max` (a frame to draw in; a season of a grown world is longer than BUDGET alone)

// the seasons' clock. `step()` — one season (true when there is more to run); `after()` — after every step, for the
// screen; `done()` — the clock has nothing more to run
export class SeasonClock {
  constructor({step, after = () => {}, done = () => {}}) {
    this.stepFn = step; this.after = after; this.done = done;
    this.pace = DEFAULT_PACE; this.paused = false; this.timer = 0; this.tickAt = 0; this.tickWait = 0; this.gen = 0;
  }
  // how far between the last step and the next the screen is, 0 … 1 (1 when paused or at `max`)
  phase() {
    if (this.held != null) return this.held;
    if (!this.tickAt || this.paused || !this.tickWait) return 1;
    return Math.min(1, (performance.now() - this.tickAt) / this.tickWait);
  }
  // the day of the season the screen is at, 1 … SEASON_DAYS
  day() { return Math.min(SEASON_DAYS, 1 + Math.floor(this.phase() * SEASON_DAYS)); }
  // a new pace: a season under way is run again at it; one held (a camp watched) stays held — only the wait it will
  // go on with is the new pace's
  setPace(id) {
    this.pace = paceOf(id).id;
    if (this.held != null) { if (this.tickWait) this.tickWait = paceOf(id).season; return; }
    if (this.timer) { this.stop(); this.start(); }
  }
  start(delay = 0) {
    if (this.held != null) return;   // a camp is watched: release() goes on with the season
    this.stop(); this.paused = false;
    const gen = ++this.gen;
    this.next = () => {
      if (gen !== this.gen || this.paused) return;
      const P = paceOf(this.pace);
      // a step answers: true — more to run at the pace; 'fast' — more, and the next at once (the land's stages before
      // history, a stretch of generation nobody watches); false — nothing more
      let more;
      if (P.season) more = this.stepFn();
      else { const t0 = performance.now(); do more = this.stepFn(); while (more && performance.now() - t0 < BUDGET); }
      const fast = more === 'fast' || !P.season;
      this.tickAt = performance.now(); this.tickWait = fast ? 0 : P.season;
      this.after();
      if (more) this.timer = setTimeout(this.next, fast ? BREATH : P.season); else { this.timer = 0; this.done(); }
    };
    this.timer = setTimeout(this.next, delay);
  }
  stop() { clearTimeout(this.timer); this.timer = 0; this.gen++; this.held = null; }
  // the season's wait is held (a camp on the local map is being watched) and let go from where it stood. Held, the clock
  // has no timer: nothing (a new pace, a stray start) runs the world on while the camp is watched
  // `at` — the phase to hold at (the camp's own day: the frame that noticed it may be a little past it)
  hold(at = null) { if (!this.timer || this.held != null) return; this.held = at ?? this.phase(); clearTimeout(this.timer); this.timer = 0; }
  release() {
    if (this.held == null) return;
    const frac = this.held, wait = this.tickWait; this.held = null;
    this.tickAt = performance.now() - frac * wait;
    this.timer = setTimeout(this.next, Math.max(0, (1 - frac) * wait));
  }
  get running() { return !!this.timer || this.held != null; }
  pause() { this.paused = true; this.stop(); }
  resume() { if (this.paused) { this.paused = false; this.start(); } }
  toggle() { if (this.paused) this.resume(); else this.pause(); }
  // a step done by hand (a stretch set while paused): the phase starts anew
  mark() { this.tickAt = performance.now(); this.tickWait = paceOf(this.pace).season; }
}

// the local map's clock: real milliseconds into ticks at the pace (`local` × the base pace of TICK_MS), at most `cap` a frame
export class TickClock {
  constructor() { this.pace = DEFAULT_PACE; this.acc = 0; this.last = 0; this.paused = false; }
  // ticks to run this frame
  ticks(now, cap = 40) {
    const dt = this.last ? Math.min(250, now - this.last) : 0; this.last = now;
    const P = paceOf(this.pace);
    if (this.paused) { this.acc = 0; return 0; }
    if (!P.local) return cap;   // `max`: as many as the frame allows
    this.acc += dt * P.local;
    const n = Math.min(cap, Math.floor(this.acc / TICK_MS));
    this.acc -= n * TICK_MS;
    if (this.acc > 500) this.acc = 0;
    return n;
  }
}

// the date of a world with the day of the season the screen is at: «год 181, весна, день 12»
export function dateText(a, clock, seasonLabel) {
  const H = a.hist; if (!H) return '';
  const day = clock && clock.running ? clock.day() : null;
  return `год ${H.year}, ${seasonLabel(H.season)}${day ? `, день ${day}` : ''}`;
}
