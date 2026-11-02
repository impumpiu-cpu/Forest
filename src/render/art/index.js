// «Картинки»: what the maps draw when the look is the pictures (render/skin.js). Each painter draws one thing and
// returns true; false — it has no picture for this thing yet, and the map draws its plain mark (the «Схема») as before.
// So the pictures come in one kind at a time and the look always works. docs/ART.md.
//
// Local map (render/renderer.js): agent, building. World map (ui/atlasView.js, ui/campaignView.js): town, party, lair,
// ruin, leader, sanctuary, grave, site, caravan, thing (a thing of the caravan's bubble). The world map draws in
// cells: those painters get the size in cells and `S`, CSS pixels to a cell, and draw their bitmaps crisp at that size.
import {SPECIES} from '../../data/species.js';
import {LOOKS} from '../looks.js';
import {drawPawn} from './pawn.js';
import {drawBeast} from './beasts.js';
import * as W from './world.js';
import {drawBuilding} from './buildings.js';

// a creature of the local map at (px, py), radius r as the plain look has it; a rider over its beast
function agent(ctx, a, px, py, r, color, S) {
  const sp = SPECIES.get(a.species);
  if (a.mount?.hp > 0) {
    const ms = SPECIES.get(a.mount.species), ml = ms.look, mr = Math.max(Math.min(S * ml.size, 4 + S * 0.26), 2.8);
    if (!drawBeast(ctx, a, ms, px, py + r * 0.3, mr, ml.color || color)) LOOKS[ml.shape](ctx, a, px, py + r * 0.3, mr, ml.color || color, S);
    return !!(drawPawn(ctx, a, sp, px, py - mr * 0.7, r * 0.85, color) || (LOOKS[sp.look.shape](ctx, a, px, py - mr * 0.6, r * 0.85, color, S), true));
  }
  if (sp.look.shape === 'person') return !!drawPawn(ctx, a, sp, px, py, r, color);
  return !!drawBeast(ctx, a, sp, px, py, r, color);
}

export const ART = {
  agent,
  building: drawBuilding,
  town: W.town,
  party: W.party,
  lair: W.lair,
  ruin: W.ruin,
  leader: W.leader,
  sanctuary: W.sanctuary,
  grave: W.grave,
  site: W.site,
  caravan: W.caravan,
  thing: W.thing,
};
