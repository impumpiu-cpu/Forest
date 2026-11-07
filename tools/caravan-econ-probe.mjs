// The caravan's trade in towns across walks (claude/caravan-ver_d.md): node tools/caravan-econ-probe.mjs [worlds=4] [auto|local] [root]
const [nW = '4', mode = 'auto', root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')] = process.argv.slice(2);
const {generateAtlas} = await import(root + '/src/atlas/generate.js');
const {saveAtlas, loadAtlas} = await import(root + '/src/atlas/save.js');
const {capitals, newCampaign, runCampaign} = await import(root + '/src/campaign/index.js');
const {CAMPAIGN} = await import(root + '/src/data/campaign.js');
const {core} = await import(root + '/src/campaign/march.js');
const S = {walks: 0, won: 0, lost: 0, timeout: 0, days: 0, home: 0, stats: {}, lines: {}, goldEnd: 0, ms: 0};
const pat = {sold: /продали [а-яё ]+\(\d+\) за/g, spoils: /продали трофеи/g, broke: /город не потянул/g, food: /купили \d+ па/g,
  bought: /за \d+(\.\d)? ?(зол\.)?(;|\.|$)/g, forged: /кузнец перековал/g, alch: /алхимик сварил/g, hired: /наняли /g, joined: /пристал/g,
  slaveSold: /продали пленн/g, closed: /закрыл ворота/g, worked: /нанялся в/g, alms: /накормили даром/g, enter: /Караван вошёл/g};
const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const per = {};
for (let s = 0; s < +nW; s++) {
  const seed = String(777 + s * 13), base = generateAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 0, elder: 0, young: 0});
  const frozen = JSON.stringify(saveAtlas(base)), caps = capitals(base);
  for (const p of CAMPAIGN.peoples) {
    const c = caps.find(x => x.people === p); if (!c) continue;
    const a = loadAtlas(JSON.parse(frozen)), t0 = Date.now();
    newCampaign(a, c.town, {mode});
    const K = runCampaign(a);
    S.ms += Date.now() - t0; S.walks++; add(S, K.phase); S.days += K.day; S.goldEnd += K.gold || 0;
    const h = K.phase === 'won' ? core(K).length : 0; S.home += h;
    const P = per[p] ||= {walks: 0, won: 0, days: 0};
    P.walks++; P.days += K.day; if (K.phase === 'won') P.won++;
    for (const [k, v] of Object.entries(K.stats || {})) if (typeof v === 'number') add(S.stats, k, v);
    for (const l of K.log) if (l.kind === 'town') for (const [k, re] of Object.entries(pat)) add(S.lines, k, (l.text.match(re) || []).length);
    process.stderr.write(`${seed}/${p}: ${K.phase} ${K.day}d home ${h} gold ${K.gold}\n`);
  }
}
const r = v => Math.round(v / S.walks * 100) / 100;
console.log(JSON.stringify({root, mode, walks: S.walks, won: S.won, lost: S.lost, timeout: S.timeout, days: r(S.days), homeOfWon: S.won ? Math.round(S.home / S.won * 10) / 10 : 0,
  goldEnd: r(S.goldEnd), msPerWalk: r(S.ms), lines: Object.fromEntries(Object.entries(S.lines).map(([k, v]) => [k, r(v)])),
  stats: Object.fromEntries(Object.entries(S.stats).map(([k, v]) => [k, r(v)])), peoples: Object.fromEntries(Object.entries(per).map(([p, P]) => [p, `${P.won}/${P.walks} ${Math.round(P.days / P.walks)}d`]))}, null, 1));
