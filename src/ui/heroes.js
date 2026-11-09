// The ascended, kept in this browser outside every world (Ver_E Э7; campaign/ascend.js does the rest, pure): one record,
// the registry {v, heroes}. Read when a campaign is being fitted out, written when a company is raised and when one of
// it is summoned (erased at once: no undo).
import {tx} from './store.js';
import {emptyRegistry} from '../view/campaign.js';

const STORE = 'heroes', ID = 'registry';

export async function loadHeroes() {
  try { const rec = await tx(STORE, 'readonly', s => s.get(ID)); return rec?.reg || emptyRegistry(); }
  catch (e) { return emptyRegistry(); }   // (no store — an older database still opening: nobody to summon)
}
export const saveHeroes = reg => tx(STORE, 'readwrite', s => s.put({id: ID, reg}));
