// Cute, deterministic names for colors and palettes.
import { hexToHsl, hashString } from './color.js';

const NOUNS = {
  red: ['Cherry', 'Ladybug', 'Strawberry', 'Valentine', 'Ruby', 'Candy Apple', 'Lipstick', 'Poppy', 'Cranberry'],
  coral: ['Coral', 'Papaya', 'Grapefruit', 'Watermelon', 'Hibiscus', 'Salmon Roll', 'Guava'],
  orange: ['Tangerine', 'Pumpkin', 'Clementine', 'Marmalade', 'Fox Tail', 'Creamsicle', 'Mango'],
  amber: ['Honeycomb', 'Butterscotch', 'Marigold', 'Apricot', 'Caramel Drizzle', 'Goldfish'],
  yellow: ['Lemonade', 'Sunflower', 'Banana Split', 'Buttercup', 'Daffodil', 'Sunbeam', 'Rubber Duck'],
  lime: ['Kiwi', 'Pistachio', 'Key Lime', 'Pear Drop', 'Sprout', 'Matcha', 'Tennis Ball'],
  green: ['Clover', 'Fern', 'Shamrock', 'Meadow', 'Frog Prince', 'Moss', 'Lily Pad', 'Pickle'],
  mint: ['Mint Chip', 'Seafoam', 'Jade', 'Spearmint', 'Eucalyptus', 'Sea Glass'],
  teal: ['Lagoon', 'Mermaid Tail', 'Peacock', 'Teal Wave', 'Tide Pool', 'Dragonfly'],
  aqua: ['Pool Party', 'Aqua Splash', 'Glacier', 'Robin Egg', 'Bubble Bath', 'Raindrop'],
  sky: ['Bluebird', 'Sky Kite', 'Cornflower', 'Forget-Me-Not', 'Denim', 'Puddle Jump'],
  blue: ['Blueberry', 'Sapphire', 'Ocean', 'Bluebell', 'Starry Night', 'Sailboat', 'Whale Song'],
  indigo: ['Galaxy', 'Iris', 'Twilight', 'Indigo Bunting', 'Stardust', 'Night Owl'],
  purple: ['Grape Soda', 'Lavender', 'Plum', 'Violet', 'Lilac', 'Amethyst', 'Potion'],
  magenta: ['Orchid', 'Fuchsia', 'Berry Smoothie', 'Dragonfruit', 'Unicorn', 'Jellybean'],
  pink: ['Bubblegum', 'Cotton Candy', 'Peony', 'Rosebud', 'Flamingo', 'Ballet Slipper', 'Strawberry Milk', 'Cupcake'],
  brown: ['Cocoa', 'Cinnamon', 'Gingerbread', 'Teddy Bear', 'Toffee', 'Acorn', 'Mocha', 'Hazelnut', 'Pinecone'],
  white: ['Marshmallow', 'Pearl', 'Snowflake', 'Cloud', 'Coconut', 'Meringue', 'Sugar Cube'],
  gray: ['Pebble', 'Kitten', 'Fog', 'Silver Spoon', 'Mouse', 'Raincloud', 'Moonstone'],
  black: ['Licorice', 'Raven', 'Charcoal', 'Midnight Cat', 'Ink Blot', 'Top Hat'],
};

const PREFIXES = {
  pastel: ['Whisper', 'Dreamy', 'Sugar', 'Petal', 'Baby', 'Misty', 'Powder', 'Cloud Nine', 'Fairy'],
  light: ['Sunny', 'Sweet', 'Fresh', 'Breezy', 'Honey', 'Daydream', 'Lucky', 'Picnic', 'Giggly'],
  vivid: ['Electric', 'Zesty', 'Juicy', 'Poppin\'', 'Wild', 'Disco', 'Glitter', 'Sparkle', 'Rockstar'],
  muted: ['Dusty', 'Vintage', 'Sleepy', 'Cozy', 'Faded', 'Antique', 'Storybook', 'Woolly', 'Cottage'],
  mid: ['Happy', 'Merry', 'Cheeky', 'Bright', 'Bouncy', 'Silly', 'Jolly', 'Snuggly', 'Peachy'],
  deep: ['Midnight', 'Royal', 'Deep', 'Moody', 'Secret', 'Velvet', 'Enchanted', 'Mystic', 'Hidden'],
  dark: ['Shadow', 'Inky', 'Moonless', 'Witchy', 'Starless', 'Spooky', 'Haunted', 'Nightfall'],
  neutral: ['Little', 'Lazy', 'Quiet', 'Tiny', 'Gentle', 'Humble', 'Sunday', 'Rainy Day'],
};

/** Map a color to a hue family name used by the name lists. */
export function hueFamily(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (s < 0.1 || (s < 0.18 && (l < 0.15 || l > 0.9))) {
    if (l > 0.8) return 'white';
    if (l < 0.22) return 'black';
    return 'gray';
  }
  if (h >= 18 && h < 50 && l < 0.45 && s < 0.75) return 'brown';
  if (h < 10 || h >= 350) return 'red';
  if (h < 22) return 'coral';
  if (h < 38) return 'orange';
  if (h < 50) return 'amber';
  if (h < 64) return 'yellow';
  if (h < 85) return 'lime';
  if (h < 150) return 'green';
  if (h < 168) return 'mint';
  if (h < 182) return 'teal';
  if (h < 196) return 'aqua';
  if (h < 214) return 'sky';
  if (h < 245) return 'blue';
  if (h < 268) return 'indigo';
  if (h < 292) return 'purple';
  if (h < 322) return 'magenta';
  return h < 342 ? 'pink' : 'red';
}

/** Describe how light/saturated a color is. */
export function toneOf(hex) {
  const { s, l } = hexToHsl(hex);
  if (s < 0.1) return 'neutral';
  if (l < 0.2) return 'dark';
  if (l < 0.34) return 'deep';
  if (l > 0.8) return 'pastel';
  if (s < 0.35) return 'muted';
  if (l > 0.64) return 'light';
  if (s > 0.68) return 'vivid';
  return 'mid';
}

function nameCandidates(hex) {
  const nouns = NOUNS[hueFamily(hex)];
  const prefixes = PREFIXES[toneOf(hex)];
  const seed = hashString(hex);
  const total = nouns.length * prefixes.length;
  const list = [];
  for (let i = 0; i < total; i++) {
    const k = (seed + i * 7919) % total;
    const prefix = prefixes[k % prefixes.length];
    const noun = nouns[Math.floor(k / prefixes.length) % nouns.length];
    list.push(`${prefix} ${noun}`);
  }
  return list;
}

/** A cute name for one color. Avoids anything in `taken`. */
export function nameColor(hex, taken = new Set()) {
  const list = nameCandidates(hex.toUpperCase());
  const free = list.find((n) => !taken.has(n));
  if (free) return free;
  let i = 2;
  while (taken.has(`${list[0]} No. ${i}`)) i++;
  return `${list[0]} No. ${i}`;
}

/** Name every color in a list so that no two share a name. */
export function nameColors(hexes) {
  const taken = new Set();
  return hexes.map((hex) => {
    const name = nameColor(hex, taken);
    taken.add(name);
    return name;
  });
}

const THEMES = {
  red: ['Cherry', 'Ruby', 'Valentine', 'Candy Apple'],
  coral: ['Coral', 'Papaya', 'Hibiscus'],
  orange: ['Tangerine', 'Pumpkin', 'Sunset', 'Marmalade'],
  amber: ['Honey', 'Marigold', 'Golden Hour'],
  yellow: ['Lemonade', 'Sunshine', 'Buttercup', 'Daffodil'],
  lime: ['Kiwi', 'Pistachio', 'Key Lime'],
  green: ['Meadow', 'Clover', 'Fern', 'Garden'],
  mint: ['Seafoam', 'Mint', 'Sea Glass'],
  teal: ['Lagoon', 'Mermaid', 'Peacock'],
  aqua: ['Pool Party', 'Glacier', 'Splash'],
  sky: ['Bluebird', 'Blue Sky', 'Kite'],
  blue: ['Ocean', 'Blueberry', 'Moonlit', 'Sailor'],
  indigo: ['Galaxy', 'Twilight', 'Stargazer'],
  purple: ['Lavender', 'Grape', 'Violet', 'Potion'],
  magenta: ['Orchid', 'Berry', 'Unicorn'],
  pink: ['Bubblegum', 'Peony', 'Strawberry', 'Flamingo'],
  brown: ['Cocoa', 'Campfire', 'Gingerbread', 'Teddy'],
  white: ['Marshmallow', 'Linen', 'Snowday'],
  gray: ['Pebble', 'Moonstone', 'Rainy'],
  black: ['Midnight', 'Licorice', 'Raven'],
};

const SCENES = {
  pastel: ['Daydream', 'Lullaby', 'Whisper', 'Sorbet', 'Cloud Castle', 'Tea Party'],
  light: ['Picnic', 'Breeze', 'Morning', 'Sundae', 'Garden Party'],
  vivid: ['Fiesta', 'Parade', 'Bonanza', 'Pop', 'Carnival', 'Disco'],
  mid: ['Jamboree', 'Holiday', 'Story', 'Adventure', 'Playdate'],
  muted: ['Postcard', 'Memory', 'Afternoon', 'Cottage', 'Scrapbook'],
  deep: ['Nocturne', 'Velvet', 'Secret', 'Spell', 'Masquerade'],
  dark: ['After Dark', 'Moonrise', 'Mystery', 'Midnight Feast'],
  neutral: ['Sketchbook', 'Hush', 'Linen Closet', 'Rainy Day'],
};

/** A fitting name for a whole palette, avoiding names in `taken`. */
export function namePalette(hexes, harmonyId = '', taken = new Set()) {
  const hsl = hexes.map(hexToHsl);
  const avgL = hsl.reduce((a, c) => a + c.l, 0) / hsl.length;
  const avgS = hsl.reduce((a, c) => a + c.s, 0) / hsl.length;
  // Dominant family = the most common hue family (first color breaks ties).
  const counts = {};
  hexes.forEach((h) => { const f = hueFamily(h); counts[f] = (counts[f] || 0) + 1; });
  const family = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), hueFamily(hexes[0]));
  let mood = 'mid';
  if (avgS < 0.1) mood = 'neutral';
  else if (avgL > 0.72) mood = 'pastel';
  else if (avgL < 0.3) mood = 'dark';
  else if (avgL < 0.42) mood = 'deep';
  else if (avgS < 0.35) mood = 'muted';
  else if (avgS > 0.65) mood = 'vivid';
  else if (avgL > 0.58) mood = 'light';

  const themes = THEMES[family];
  const scenes = SCENES[mood];
  const seed = hashString(hexes.join('') + harmonyId);
  const total = themes.length * scenes.length;
  for (let i = 0; i < total; i++) {
    const k = (seed + i * 104729) % total;
    const name = `${themes[k % themes.length]} ${scenes[Math.floor(k / themes.length)]}`;
    if (!taken.has(name)) return name;
  }
  let n = 2;
  const fallback = `${themes[0]} ${scenes[0]}`;
  while (taken.has(`${fallback} ${n}`)) n++;
  return `${fallback} ${n}`;
}
