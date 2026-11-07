// What a caravan meets in towns after history (claude/caravan-ver_d.md): node tools/town-market-probe.mjs [worlds=4] [root]
const [nW = '4', root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')] = process.argv.slice(2);
const {generateAtlas} = await import(root + '/src/atlas/generate.js');
const {rationPrice, offers} = await import(root + '/src/campaign/town.js');
const {townPurse, marketK} = await import(root + '/src/atlas/treasury.js');
const {gearDef} = await import(root + '/src/agents/equipment.js');
const by = {};
for (let s = 0; s < +nW; s++) {
  const a = generateAtlas({seed: String(777 + s * 13), size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  for (const t of a.towns.filter(x => x.alive)) {
    const P = by[t.people] ||= {n: 0, ration: 0, purse: [], poor20: 0, poor60: 0, arms: 0, armour: 0, armsK: 0, foodK: 0, stockArms: 0};
    P.n++; P.ration += rationPrice(t, 'friend');
    const pu = townPurse(t); P.purse.push(pu === Infinity ? 1e9 : pu); if (pu < 20) P.poor20++; if (pu < 60) P.poor60++;
    let o = []; try { o = offers(t, a); } catch (e) { P.err = String(e).slice(0, 80); }
    const it = o.filter(x => x.kind === 'item');
    if (it.some(x => gearDef(x.id)?.melee && !gearDef(x.id)?.tool)) P.arms++;
    if (it.some(x => gearDef(x.id)?.slot === 'body')) P.armour++;
    if ((t.stock?.arms || 0) > 0) P.stockArms++;
    P.armsK += marketK(t, 'arms'); P.foodK += marketK(t, 'food');
  }
}
const out = {};
for (const [p, P] of Object.entries(by)) { P.purse.sort((x, y) => x - y); out[p] = {towns: P.n, ration: +(P.ration / P.n).toFixed(3), purseMedian: Math.round(P.purse[P.purse.length >> 1]), purseLt20: +(P.poor20 / P.n).toFixed(2), purseLt60: +(P.poor60 / P.n).toFixed(2), sellArms: +(P.arms / P.n).toFixed(2), sellArmour: +(P.armour / P.n).toFixed(2), storeArms: +(P.stockArms / P.n).toFixed(2), armsK: +(P.armsK / P.n).toFixed(2), foodK: +(P.foodK / P.n).toFixed(2), ...(P.err ? {err: P.err} : {})}; }
console.log(root, JSON.stringify(out, null, 1));
