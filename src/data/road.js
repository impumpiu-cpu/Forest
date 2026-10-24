// The caravan's road (docs/CAMPAIGN.md): its name among the realms, and the pace it keeps.
//
// REPUTATION — two numbers by realm, as fame and infamy in Fallout: New Vegas (K.fame[realm] = {fame, infamy}): a fight
// won near a town (within `near` cells) — `win` fame with that town's realm; a captive sold in a town — `slaveSale`
// infamy with its realm; never past `max`. What it does: a town sells × (1 − fameDiscount × fame + infamyMarkup ×
// infamy) and buys × the reverse (campaign/town.js termsOf; 0 — as before).
// PACES — fast, normal, careful (as the travel pace of D&D): × the day's march, × the forage of the march, × how hard
// an ambush catches the caravan (data/bubble.js AMBUSH.surprise × `wary`). PACE_RULES — which the council keeps: when
// pursued, when the danger about is past `dangerAt`; otherwise normal. All 'normal' — as before.
import {Registry} from '../core/registry.js';

export const REPUTATION = {win: 1, slaveSale: 1, near: 12, max: 50, fameDiscount: 0, infamyMarkup: 0};
// no term of a town's prices (tongue, fame) moves a price by more than this share either way
export const TERMS = {max: 0.9};

export const PACES = new Registry('pace');
PACES.registerAll([
  {id: 'normal', label: 'обычный', speed: 1, forage: 1, wary: 1, note: 'как всегда'},
  {id: 'fast', label: 'быстрый', speed: 1.3, forage: 0.6, wary: 0.85, note: 'спешат: меньше добывают по пути, засада застаёт врасплох'},
  {id: 'careful', label: 'осторожный', speed: 0.75, forage: 1.15, wary: 1.15, note: 'идут с оглядкой: больше добывают, засаду замечают'},
]);
export const PACE_RULES = {pursued: 'normal', danger: 'normal', dangerAt: 1.5};
