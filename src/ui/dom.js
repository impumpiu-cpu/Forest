export const $ = id => document.getElementById(id);

// segmented button group: one pressed button, callback with its data value
export function segmented(box, attr, onPick) {
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !box.contains(b)) return;
    box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b.dataset[attr]);
  });
}

export function press(box, value, attr) {
  box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value))));
}
