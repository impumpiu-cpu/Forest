// The door of the local map (docs/ARCHITECTURE.md «Системы и их двери»): the settlement's world, its creatures, its life
// and its outside — world/, nav/, agents/, settlement/, outside/, sim.js, headless.js — as the campaign, the seam and the
// screen's view see them. Inside, the modules import each other directly.
// (sim.js is loaded first: the order it loads the data and the systems in is the one that resolves their cycles —
// data tables with hooks into the systems, systems reading the tables)
import '../sim.js';
export {createAgent, hpShare, maxHp, personality} from '../agents/agent.js';
export {wake} from '../agents/attention.js';
export {CARCASS, ROLE_LABEL, carcassById, huntOf} from '../agents/carcass.js';
export {attackerOf, darkness, sneakSeen} from '../agents/combat.js';
export {allItems, def, dress, gearDef, gearText, gearToken, gearType, gearValue, gearSpec, itemPrice, mayTake, newItem} from '../agents/equipment.js';
export {makeGolem} from '../agents/golem.js';
export {boldness} from '../agents/hunting.js';
export {OUTCOMES} from '../agents/lifecycle.js';
export {moodLabel, moodOf, wishes} from '../agents/mind.js';
export {beltNeed, rebelt, sleepDose, threatOf, useOfEffect} from '../agents/potions.js';
export {formLinks, formUndeadLinks, promote, trimBand} from '../agents/ranks.js';
export {actionAccess, canMake, jobAccess, reasonText, recipeAccess, recipeNeed, skillTier, softCap} from '../agents/skills.js';
export {innateOf, limits, raceLabel, refreshBody, rollCreature} from '../agents/special.js';
export {fighterLabel, squadText} from '../agents/squad.js';
export {STANDINGS, setStanding} from '../agents/standing.js';
export {expectedStrength, sideStrength} from '../agents/strength.js';
export {taskLabel} from '../agents/tasks.js';
export {herdAlarm, herdOf, stragglerOf} from '../agents/wildHerd.js';
export {dressWound} from '../agents/wounds.js';
export {FAR, Navigation} from '../nav/navigation.js';
export {memberStrength} from '../outside/bands.js';
export {PROVIDERS} from '../outside/index.js';
export {fuelReserve, lotFertility, putUp} from '../settlement/buildings.js';
export {bindWaiting, captiveText} from '../settlement/captives.js';
export {recordOf} from '../settlement/chronicle.js';
export {councilWish} from '../settlement/council.js';
export {craftContext, orderText} from '../settlement/crafting.js';
export {noteFact} from '../settlement/facts.js';
export {soilYield} from '../settlement/farming.js';
export {formerText} from '../settlement/freedom.js';
export {beastText, herd, isTameable, makeTame, penRoom, penSpace} from '../settlement/herd.js';
export {peekKinds} from '../settlement/kinds.js';
export {statusOf} from '../settlement/life.js';
export {masterTitle} from '../settlement/masters.js';
export {spawnGroup} from '../settlement/migration.js';
export {colonists, foodTotal, has} from '../settlement/query.js';
export {feelings, history} from '../settlement/relations.js';
export {campFuel, furnacePick} from '../settlement/stock.js';
export {raidThreat} from '../settlement/threat.js';
export {goodsUnits} from '../settlement/trade.js';
export {addWork, freeCell, handsOf, spotNear, stepWorks, tetherAt, workDone, worksOf} from '../settlement/works.js';
export {mindOf} from '../settlement/campMind.js';
export {newGame, step} from '../sim.js';
export {createWorld} from '../world/generate.js';
export {DX, DY, cellOf, walkable, cellMid} from '../world/grid.js';
export {airTemp, tempAt} from '../world/heat.js';
export {oreOf} from '../world/ores.js';
export {faunaLevel} from '../world/region.js';
