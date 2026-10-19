// Tools and things for the back: numbers only (names and what they hold: data/items.js).
//   tool: {job: work speed multiplier};  carry: extra units carried while harvesting;  max: what a quiver holds
//   dur:  uses before it breaks (Infinity: never);  value: price in imperial gold
export const GEAR = {
  rod:    {tier: 0, tool: {fish: 1.6}, dur: 80,  value: 1},
  quiver: {tier: 0, max: 15, dur: Infinity, value: 1},
  pan:    {tier: 0, tool: {pan: 1.2},  dur: 150, value: 1},
  basket: {tier: 0, carry: 2, dur: Infinity, value: 1},
};
