// Locking colors: a locked color stays put when its palette is shuffled.
import { hexToHsl, hslToHex, wrapHue, colorDistance } from './color.js';
import { nameColor } from './names.js';

export const hasLocks = (p) => !!p?.colors?.some((c) => c.locked);
export const lockCount = (p) => (p?.colors ?? []).filter((c) => c.locked).length;

export function toggleLock(p, index) {
  const c = p.colors[index];
  if (c) c.locked = !c.locked;
  return !!c?.locked;
}

export function unlockAll(p) {
  p.colors.forEach((c) => { c.locked = false; });
  return p;
}

/** A color that is clearly different from everything in `used`. */
function distinctFrom(used, seedHex) {
  const { h, s, l } = hexToHsl(seedHex);
  for (let k = 1; k < 24; k++) {
    const hex = hslToHex({ h: wrapHue(h + 37 * k), s: Math.max(0.35, s), l: Math.min(0.8, Math.max(0.28, l + ((k % 3) - 1) * 0.1)) });
    if (used.every((u) => colorDistance(u, hex) >= 20)) return hex;
  }
  return seedHex;
}

/**
 * Build a new color list in which every locked color of `oldColors` is kept
 * and every other slot gets a color from `freshHexes`.
 *  - locked colors keep their position when it still exists, otherwise they
 *    take the first free slot;
 *  - the result is `targetLen` long (the palette size may have changed);
 *  - nothing is duplicated.
 * Returns plain color objects: { hex, name, locked }.
 */
export function mergeLocked(oldColors, freshHexes, targetLen = oldColors.length) {
  const slots = Array(targetLen).fill(null);
  const locked = oldColors.map((c, i) => ({ c, i })).filter((x) => x.c.locked);

  // Locked colors first, at their old index when possible.
  const overflow = [];
  for (const { c, i } of locked) {
    if (i < targetLen && !slots[i]) slots[i] = { ...c, locked: true };
    else overflow.push(c);
  }
  for (const c of overflow) {
    const free = slots.indexOf(null);
    if (free >= 0) slots[free] = { ...c, locked: true };
  }

  const used = slots.filter(Boolean).map((c) => c.hex);
  const names = new Set(slots.filter(Boolean).map((c) => c.name));
  // Prefer fresh colors that are clearly different from the locked ones, so the
  // result never looks like it holds the same color twice.
  const near = (h) => used.some((u) => colorDistance(u, h) < 24);
  const pool = [...freshHexes.filter((h) => !near(h)), ...freshHexes.filter((h) => near(h) && !used.includes(h))];
  let next = 0;
  for (let i = 0; i < targetLen; i++) {
    if (slots[i]) continue;
    let hex = pool[next++];
    if (!hex) hex = distinctFrom(used, freshHexes[i % Math.max(1, freshHexes.length)] || used[0] || '#33ADE8');
    used.push(hex);
    const name = nameColor(hex, names);
    names.add(name);
    slots[i] = { hex, name, locked: false };
  }
  return slots;
}

/**
 * After a whole batch is regenerated, carry locks across: a new palette
 * inherits locks from the old palette with the same harmony and the same
 * position among palettes of that harmony (the 2nd triadic gets the 2nd
 * triadic's locks). Palettes without locks are left alone.
 */
export function carryLocks(oldPalettes, newPalettes) {
  const seen = {};
  const oldByKey = new Map();
  for (const p of oldPalettes) {
    const n = (seen[p.harmony] = (seen[p.harmony] ?? -1) + 1);
    if (hasLocks(p)) oldByKey.set(`${p.harmony}#${n}`, p);
  }
  const counted = {};
  return newPalettes.map((p) => {
    const n = (counted[p.harmony] = (counted[p.harmony] ?? -1) + 1);
    const old = oldByKey.get(`${p.harmony}#${n}`);
    if (!old) return p;
    return { ...p, colors: mergeLocked(old.colors, p.colors.map((c) => c.hex), p.colors.length) };
  });
}
