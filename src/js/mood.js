// "Mood from words": type a few words and get palettes, with no internet and
// no AI. A hand-made dictionary maps words (places, foods, weather, feelings,
// styles…) to seed colors and to global "modifiers" (pastel, dark, neon…).
// Pure functions, so they run in Node tests.
import { clamp, wrapHue, hexToHsl, hslToHex, colorDistance, makeRng, hashString } from './color.js';
import { tidy } from './themes.js';

/**
 * Format:  word, alias, alias: HEX HEX HEX | modifier modifier
 * Seeds come first (most important first). Modifiers are optional.
 * Modifiers: dark light deep soft pastel muted vivid neon warm cool vintage bright
 */
const RAW = `
# ---- colors
red: D7263D E94F5F 9E1B32
crimson: B3123C DC143C 7A0C2A
scarlet: FF2400 D62D20 8F1B12
maroon: 800000 5E1224 A63A50
burgundy, wine: 6D1A36 8C2F4A B04A62 3D0E1F
ruby: 9B111E E0115F C21E56
rose, roses: E8899A F4B6C2 C5546A 8F2D45
blush: F8D1D6 F2B5BF E89AA6
pink, pinky: F78FB3 FFC1D6 E24A82
hot pink: FF4F9A E0187C 9C0F55
fuchsia: D8109A FF3FB4 8A0B66
magenta: C2188C E040B0 7A0F5A
coral: FF7F6B FFB199 E85D4A
salmon: FA8072 FFB4A2 E56B5D
peach, peachy: FFB38A FFD2B8 F28C6B
apricot: FBCEB1 F5A25D E58C3F
orange: F57C20 FFA040 C85A0F
tangerine: FF8C1A FFB347 E56A00
amber: FFB000 E69A00 B36B00
gold, golden: D4AF37 F2D16B A67C00
yellow: FFD93D FFE98A F2B705
lemon, lemony: FFF176 FCE38A F4C430
mustard: D9A521 B8860B F0C94D
cream, creamy: FFF4D6 F8E8C8 EAD7A8
butter, buttery: FFE9A8 F7D774 EAC15A
lime: A4DE02 C9F26B 6BAA05
chartreuse: 9ACD32 C5E864 5B8A0A
green: 3FA34D 7BCB8A 1E6B34
emerald: 0F9D68 3DD6A0 075E43
mint, minty: 98E5C3 C9F5DD 5CC8A0
sage: 9CAF88 C5D3B5 6F8466
olive: 708238 A3B15B 465220
teal: 1A9C9C 5CC7C7 0B5E65
turquoise: 30D5C8 7FE8DE 0F9C93
aqua: 4FD1E8 A5ECF7 1B9DB5
cyan: 00BCD4 6EE7F5 007C91
sky: 74C0FC A5D8FF 3B8FD9
blue: 2F7DE1 74A9F5 174A9C
cobalt: 0047AB 3D7FD6 002A66
navy: 1B2A4E 34507F 0D1630
indigo: 4B3FB8 7C6FE0 2A2275
periwinkle: 8E9AEF BCC4F8 5F6BD1
lavender: B79CED D8C8F5 8A6BC9
lilac: C8A2C8 E3CDE3 9C6B9C
violet: 7F3FBF B07CE0 4E2380
purple: 8A3FC7 B67CE8 54238A
plum: 6E2C5B A0527F 40152F
mauve: B784A7 D9B7CC 8A5C7C
brown: 8B5A3C B58863 5A3822
tan: D2B48C E6D2B0 A98B64
beige: E8DCC8 F5EEDF C9B99A
ivory: FFFFF0 F6F1DE E5DDC3
white: FFFFFF F4F4F6 DADCE3
gray, grey: 8E9AA6 C3CBD3 5B6670
silver: C0C5CC DADFE4 9AA2AB
charcoal: 36393F 5A5F66 1E2024
black: 111318 2A2D34 4A4E57
rainbow: E63946 F4A261 F2D14B 52B788 3A86FF 8E44AD

# ---- sky, light and time
sunset: FF6B6B FFA94D FFD166 8E4585 3D2C5E
sunrise: FFC27A FF9E7A F78FB3 FFE29A 7FB3D5
dawn, daybreak: F7B2AD FDE2C4 B5C6E0 8FA3C8
dusk: 6C5B9E C06C84 F5A25D 2E2A55
twilight: 4A3F8F 7B5EA7 D17A9E 1E1B4B
golden hour: F6B04E E88C3A FFD98A B5651D 5C3A21
morning: FFE3A3 BDE4F4 FFB4A2 FFF6DC 7FB5D6 | light warm
noon, midday: FFE45E 6EC6FF FFFFFF 3FA7D6 | bright
afternoon: F2C879 E8A87C 85B8CB C38D9E 5E6C84
evening: 5C4B8A C47A8E F2B263 2E2A4F 8E9AC6
night, nighttime, tonight: 0B1026 1B2A5B 3D4F8F 8FA4D9 | dark
midnight: 0A0E2A 1A1F4D 3C3F8F 6B6FBF | dark
moon, moonlight, moonlit: E6E8F2 C9CEE3 8D95BD 2B3057
star, stars, starry, starlight: FFE9A8 FFF6D6 3A3D78 0F1235 | dark
galaxy: 1B1464 5B2A9E C94BA8 3D7DD6 0B0A2E | dark
space: 05060F 1A1F4B 4B2E83 B84BA3 7ED6F5 | dark
cosmic: 2A0F5B 6A2C9E E056A6 42C6FF | deep
aurora: 0B3C49 2EC4B6 7BE0AD 9B5DE5 1B1B3A | deep
sun, sunny, sunshine: FFD60A FFB703 FB8500 8ECAE6 FFF3B0 | bright
rainbow sherbet: FF9AA2 FFDAC1 E2F0CB B5EAD7 C7CEEA

# ---- water and weather
ocean: 0F5E9C 2A9BD6 7FD3EB 08324F
sea: 1F7A8C 5DB5C2 BFDBF7 053C5E
sea glass: A8D5C8 CFE8DF 7FB8A8 EAF4EF F2EAD6 | soft
beach: F4E3C1 7FD3E8 F2A365 FFFFFF E0C097
sand, sandy: E6CFA3 D2B27A F4E8CC A88B5A
shell, seashell: F6E3D8 F4C2C2 E7B9A3 C9A2A6 | soft
coral reef: FF6F61 FFB86F 3FC1C9 0A7D8C | vivid
lagoon: 2EC4B6 7FDDD1 1B8A8F 0B4F6C
wave, waves, surf, surfing: 0E7C86 52C5D0 F9E4B7 E76F51 264653
tide: 3F88C5 79B8E0 DCE9F2 1F4E79
river: 3E7CB1 81A4CD DBE4EE 54494B
lake: 4F86A8 9CC5DA D6E6F0 2C5266
pool: 3FC1E8 A8EAF7 F5F5F0 0F86B3 FFD166 | bright
waterfall: 6EC6E8 B5E3F2 3F8FB5 EAF7FB
rain, rainy, raining, drizzle: 6B7F94 A5B4C3 3F4B59 D5DDE5 | cool muted
storm, stormy, thunder: 3D4B5C 667A8F 1E2A36 A3B1C0 F5D547 | dark
cloud, clouds, cloudy: DDE6F0 F4F8FC AAB8C9 7C8CA3 | soft cool
fog, foggy, mist, misty: C5CCD3 DDE2E7 A0A9B2 7D8791 | muted
snow, snowy: F5FAFF DCEBF7 A9C8E3 6E93B8 | cool light
winter: DDEBF7 9CC3E4 5B7FA6 2C3E5C F5F8FA | cool
ice, icy, frost, frosty: D8F1FA A5DCF0 6BBEDC E9F8FC | cool light
blizzard: EDF4F8 B9CCDA 7E97AB 4A5F73 | cool

# ---- seasons and nature
spring: FFB7C5 B8E0A5 FFF2A8 9EDDF0 F6A5C0 | pastel
summer: FFD23F 2EC4B6 FF6B6B 48BFE3 FFFFFF | bright
autumn, fall: C8553D E09F3E 9E2A2B 6B4226 F2CC8F | warm
harvest: D9822B A44A3F 6B4226 E8C07D 7D8F3A | warm
forest: 2D6A4F 52B788 95D5B2 1B4332 B7E4C7
woods, woodland: 3E5C3A 6B8F5A 8B6B47 2A3D2C C2B280
jungle: 0B6E4F 3DAA6D 9BD770 F7C548 1F3D2B | vivid
rainforest: 0A6847 38A169 A7D676 F2B134 14452F
tropical, tropics: FF6F91 FFC93C 1FAB89 22B8CF F9F871 | vivid
island: 25A6A6 F4D58D 7BC96F FF8552 | bright
desert: D9A066 F2D7A6 B5651D 7A4B2A E8B77C | warm
canyon: B5502B D9824A 8C3B1F F0C29A 5A2A18 | warm
mountain, mountains: 5E7A8C 8CA3B5 C7D3DD 3C4F5E F2F5F7 | cool
alpine: 3E6A8A 8DB3CC E8F1F7 2A4A5E 6E9B5B | cool
meadow: 8BC34A C5E1A5 FFEE58 F48FB1 6AA84F | bright
field, fields: C9B458 8FAE4B E8D98A 6B8E23
garden, gardens: 6AB04C F2A1C5 FFD966 8E6BBF 3F7F3F
flower, flowers, floral, bouquet: F06292 FFB74D BA68C8 FFF176 81C784
blossom, cherry blossom, sakura: FFC1D9 FFE0EC F59BB8 8E5572 | soft
petal, petals: F8B8D0 FDE4EC E88BB0 B65A8A | soft
lavender field: 9B7FD1 C9B8EC 6B4FA8 8FAE6B
sunflower: F7B500 FFD84D 6B4A12 7A9E3F
tulip, tulips: E63E62 FFC857 8E44AD 2E8B57
daisy, daisies: FFFFFF FFE066 A5D6A7 FFF9C4
poppy, poppies: E5383B FF7F50 2B2D42 F7B801
orchid: DA70D6 C080C8 7B3F7F E6C6E8
leaf, leaves, leafy: 6BAA47 A8D08D 3D7A2A F4B942
fern: 4F8A4B 8FC07A 2F5D34 C5E1A5
mushroom, mushrooms: C9B79C E6DBC9 8B6F54 A8423F
acorn: B5894D 7A5530 D9B16B 4A3B24
pine: 21573D 3F8A5A 0F3325 A7C4A0
cedar: 8A5A3C 5B8A6B A9C4A0 3E2A1D
bamboo: A8C66C 6FA05B D9E5A0 3F6B3A
cactus: 5E9B6A 89BF8C F2A3B8 E8D5A0
succulent, succulents: 8FBF9F B7D8C4 D9A5B3 5F8F7A | soft
moss, mossy: 6B8E23 8FAE4B 3F5A12 B5C98A | muted
earth, earthy: 8B6B4A A3B18A 6B705C D2B48C 5E4B3A | muted
nature, natural, organic: 8FA37E C9B79C 6F8A5B E8DFC8 A57F5F | muted
mud, muddy: 6B4F3A 8F7456 4A3626 B59C7C | muted
clay: B5654A D9967A 8C4A33 EAC4AF
terracotta: C8553D E2896C 9C3F2A F2C9B8
brick: 9C4A3C B96A59 6D2E24 D9A89C
rust, rusty: B7410E D2691E 8A3503 E8A06A
copper: B87333 D99A5E 7C4A22 E8B68A
bronze: 8C6A3F B58F55 5B4326 D4B483
stone, granite, rock: 8D8D8D B0A99F 6E6A62 D3CEC4 | muted
steel, metal, iron: 71797E A6AEB4 4A5055 D2D7DA | cool muted
ash, ashes: 5B5B5B 8A8A8A BDBDBD 2E2E2E
smoke, smoky: 6B6E73 9A9DA3 C7C9CC 3A3D41
fire, flame: FF4500 FF8C00 FFD700 8B0000 | warm vivid
lava, volcano: 3A0A0A C1121F FF5400 FFB700 | dark
ember, embers: 5C1A0B C4451C FF8A3D FFD27A
campfire: 2B1A12 C44D1E FF9E2C FFD56B 4F3A2C | warm
fireplace: 5C2A1A C44D1E F59E3D FFD27A 2B1812 | warm
candle, candlelight: F2D8A7 F7B267 8A5A3C FFF1D0 4A2F1B | warm soft

# ---- food and drink
coffee: 4B2E1E 7B4F32 B58863 E8D5BC 2B1A10
cafe, coffeehouse, coffee shop: 6F4E37 C69C6D F0E1CC 3B2A20 A34A3A | warm
latte: C9A27A E4CBAA F3E6D3 8B6B4A | soft warm
cappuccino: B89B7E D8C3A8 F1E6D6 7A5C43 | soft warm
espresso: 2B1810 4B2C1D 7A4B2E C8A27C | dark
mocha: 7B4B3A A6735A D5B8A3 3C2218
tea: B28A5C D5B98C 6B4F2D F1E4C8 8FA66B
chai: B8854F D9AE74 7A4E2D F2DDBA 9C5A3C | warm
matcha, green tea: 8DB255 C5DC8F 5B7F2E EAF4D3 3F5A1E
boba: E8D5C4 B08968 5C4033 F5B5C8
chocolate: 4A2C1B 7A4A2D B07A4F F0D9B5 2A160C
cocoa, cacao: 5D3A29 8A5A40 C9A383 F2E3D0
vanilla: FFF3D6 F8E3B5 E8C98A FFFBF0 | soft
caramel: C68E4E E0B07A 9C6B30 F6DDB5
honey: F2B134 F8D774 C48A1A FFF0C0 8B5A14 | warm
maple, syrup: C65D2E E39A5B 8A3B1D F6D8A8 | warm
cinnamon: B4572B D9895A 7D3A18 F0C9A0 | warm
spice, spices, spicy: C4561F E59B3A 8A3A1B 6B2C12 F0C27B | warm
ginger: D98E2B F2C078 9C5A12 FBE5BE
pumpkin: E8751A F5A65B B34A0C 6B3A1A F8D9A0 | warm
apple: C2272D F25F5C 7BA23F E8F0C4 5A1A1E
green apple: A4C639 D1E88A 6B8E23 F3FAD0
pear: C9D858 E6EFA5 8FA326 F6E9B0
citrus: FFB30F FFD23F 7CB518 FB6107 F3DE2C | bright
grapefruit: FF7F6B FFB4A2 E0526A FFD8CC
mango: FFB400 FF8A3D E8602C 8DB600 FCE38A | vivid
papaya: FF9F68 FFC48C E86E3A 6F9E3D
pineapple: F7D047 FBE79A 8A9A3B C4731E
coconut: FFFDF7 EAD9C0 C2A27C 6B4F3A 8FBF9F
banana: FFE14D F7D038 A8802A FFF3A6
watermelon: FF5A74 FF8FA3 3F9C5A C9F0C1 1F5E3A
melon: F8C98E F4E2B0 B7D88F 8FBF6A | soft
cherry, cherries: B0123A DC143C 5E0B24 F18BA5 2E6B3A
strawberry, strawberries: E63950 FF8FA3 7DAA3F FDE4E9 8E1B2E
raspberry: C2185B E65C93 7A1040 F8C6D8
blueberry, blueberries: 4B5FA8 7A8FD1 2A3A75 C9D1F2
blackberry: 3D1E4F 6B3F82 24102F A58AB5
berry, berries: 8E2C6B C94F8E 4A1A3D E8B6D2 5C7DB5
grape, grapes: 6F2DA8 A05ED0 431766 C9A0DC
fig: 6F3A4F 9B5E72 3F1E2E C99DAD 7A8B4A
avocado, guacamole: 568203 9BB562 3A5A12 E6D8A0 6B4423
tomato: E03A2E F26B5B 8F1D14 7FA65A
pepper, salsa: C1272D 4F7942 FFC145 2A2A2A F4A259 | vivid
champagne: F7E7CE E9D2A8 C9A66B FFF8E7 | soft
cocktail: FF6F91 FFC93C 2EC4B6 9B5DE5 | vivid
margarita: C5E384 F2F7C3 5AA96B FFB997
sangria: 8C1C3A C2415D F2A65A 5E2A3B
lemonade: FFF176 FFE082 FFCA28 FFF9C4 4FC3F7 | bright
soda, pop: E94560 FFD460 16C79A 0F3460 | vivid
candy: FF4F9A FFD93D 3FD0C9 B388FF FF8A5B | vivid
cotton candy: FFC1E3 BDE0FE A2D2FF FFAFCC CDB4DB | pastel
bubblegum: FF8FC7 FFB8DE FF5CAF C2E9FB | bright
sugar, sweet, sweets: FFDDE9 FFF1D6 CDEBFF E8D5FF | pastel
dessert: F3D3BD FFB6B9 8A5A44 FFF1E6
cake: FFE5EC FFC2D1 A0522D FFF8F0
cupcake: FFB6C1 FFEBEE 8B5A3C FFD54F 9AD0EC
ice cream: FFD1DC FFF3B0 B5EAD7 C7CEEA FFDAC1 | pastel
sorbet: FF9AA2 FFB7B2 FFDAC1 E2F0CB B5EAD7
cookie, cookies: C48A52 E6BC85 7A4A2B FFF1D8
bread, bakery, baking: D9A441 EBCB8B A06A2C F6E6C4 F7B7A3 | warm
wheat: E5C77F D6AE54 F1E2AE 9C7A32
popcorn: FFF3C4 FFD966 E94F37 FFFFFF

# ---- feelings and moods
calm, calming: A8C5D8 D9E6EE 7FA3B8 EEF4F7 5C7F94 | soft cool
peaceful, peace: B7D0C8 E3EEE9 8FB3A5 F6F3EA | soft
serene, serenity: C9DCE8 E7F0F6 9DBBD0 F4F7F9 | soft cool
relax, relaxing, relaxed: B8D8D0 E6F2EE 8DB8AE F9F4EA | soft
zen: C7D0C0 8F9E8A E6E1D3 5B6B58 2F3A2E | muted
spa: CFE8E0 F2F7F4 9CC9BE EAD9C4 7FA89B | soft
cozy, cosy, snug, comfy, comfort: C97B4A E8B88A 8B4A2B F5E1C8 5B3A29 | warm muted
hygge: D9B99B F2E6D8 A67B5B 8B6F5A E6D5C3 | warm soft
homey, home: E3C9A8 F4E7D3 B58B64 8F6B4E | warm
warm, warmth: E9873C F7B267 C1440E FFE3C0 | warm
cool, chill, chilly: 5B8FB9 A5C8E4 2F5D8A E2EEF7 | cool
rustic: 8B5E3C C49A6C 5E4B3A A3B18A E8D8BE | muted
farmhouse: F0EAD6 A3B18A 6B705C 8B6F47 D8CBB0 | muted
country: C1A57B 8A9A5B 6B4F3A E8DCC0 A34A3A
boho, bohemian: D9A066 B5651D E8C9A0 8E9B7A C86B4A | warm
vintage, antique: C9A66B 8B6F47 A6B5A0 E8D5B5 7D4F50 | vintage
retro: E4572E F3A712 29335C A8C686 669BBC | vintage bright
nostalgia, nostalgic: D9B08C E8C4A0 8FA3A3 C97B63 F2E2CC | vintage
seventies, 70s: D9822B E5B25D 8A9A5B A34A28 F2D7A6 | vintage
eighties, 80s: FF6EC7 7DF9FF 9D4EDD FFD60A 240046 | neon
nineties, 90s: 00C2B8 FF5CA8 FFD93D 7B61FF 1D1D3B | bright
y2k: C0F0FF FF9AD5 B28DFF E6FF8A 6F6AF8 | bright
grunge: 4A4A4A 8A3A3A 2E3B2F B5A58A 1A1A1A | muted dark
punk: FF2E63 FFDE59 08D9D6 252A34 | vivid
gothic, goth: 1B1B1F 4A1C40 7A1F3D 2D2D44 B8A9C9 | dark
spooky, scary, creepy: 2B1B3A FF7518 6B8E23 1C1C1C D6C6E1 | dark
haunted: 2E2A3B 5C4B73 8E8AA3 C9BFD9 14111D | dark
witch, witchy: 2A1B3D 5A3A7E 8A5BB8 C2A878 1B1B1B | dark
mystical, mystic, mysterious, mystery: 3A2A6B 7A4EBF B58CE8 F2D58A 1B1140 | deep
magic, magical: 6A4CBF A67CF2 FFD76A 5FD3F2 2A1B5E
enchanted: 2F5D50 6BAA75 B5E3A0 F2D96B 1E3B34
fairy, fairytale, fairy tale: FFC8E2 CDB4F6 A8E6CF FFE29A B5D8FF | pastel
unicorn: FFB3D9 C9B3FF A8E6FF FFE8A3 B8F2D9 | pastel
mermaid: 2EC4B6 7B6CF6 F28CB1 A8E6CF 1A5F7A
dragon: 7A1F1F D4A017 2E4F3E 1C1C1C B5563A | deep
whimsical, whimsy: FFB5A7 FCD5CE A8D8EA FFE6A7 CDB4DB | pastel
playful, fun: FF6B6B FFD93D 6BCB77 4D96FF C77DFF | bright
joyful, joy, happy, happiness: FFD93D FF8A5B FF6B9D 6BCB77 5AB2FF | bright
cheerful, cheery: FFE066 FF9F59 7ED6A5 59C3F3 FF7A90 | bright
bright, brilliant: FF595E FFCA3A 8AC926 1982C4 6A4C93 | vivid
bold, daring: D00000 FFBA08 3F88C5 032B43 136F63 | vivid
vibrant, vivid, colorful, colourful: FF3D81 FFB400 00C2A8 3D5AFE 7C4DFF | vivid
energetic, energy, lively: FF3D00 FFC400 00E676 00B0FF D500F9 | vivid
electric: 00E5FF 651FFF F50057 FFEA00 1DE9B6 | neon
neon, glow, glowing: FF2079 00F0FF 39FF14 FFE600 B026FF | neon
confetti: FF595E FFCA3A 8AC926 1982C4 6A4C93 | bright
party, birthday, celebration: FF4F9A FFD23F 2EC4B6 9B5DE5 FF8A5B | bright
festival, fiesta: E8472B F5A623 2BB0A7 7B4FBF F2D16B | vivid
carnival, circus: D62828 F7B801 1D3557 F1FAEE E63946 | vivid
christmas, xmas, yule: C1121F 2D6A4F F4D35E F1FAEE 14452F
halloween: FF7518 2B1B3A 6B8E23 1C1C1C F5E6A8 | dark
thanksgiving: C8553D E09F3E 6B4226 7D8F3A F2CC8F | warm
easter: F6C6EA B5E8D5 FFF3A6 C9B6F2 FFD3B6 | pastel
valentine, valentines: E63946 F4A6B7 FFE5EC 8A1C3B C9184A
romantic, romance: E63946 F4A6B7 FFE5EC 8A1C3B C9184A | soft
love: E5383B FF758F FFB3C1 800F2F
passion, passionate: B00020 E63946 FF6B6B 4A0E1C | deep
cute, kawaii, adorable: FFC8DD FFAFCC BDE0FE A2D2FF FFF1A8 | pastel
baby, nursery, newborn: BDE0FE FFC8DD FFF1A8 CDEAC0 E2CFF7 | pastel
kids, kid, childlike, childhood: FF595E FFCA3A 8AC926 1982C4 FF8FAB | bright
dreamy, dream, dreaming: C9B6F2 FFC8E2 A8D8F0 FFF0F5 8E7CC3 | pastel
ethereal: DCE6F7 E8DDF7 C5D5F0 F7F0FA 9FB5D9 | soft
celestial, heavenly, angelic: 2B2D6E 6F73C9 C8B6F2 F2E6A8 12133A
soft, gentle, delicate, tender: F2D7D5 E8C1C5 C9D6DF F6EFE9 BFA2A8 | soft
pastel, pastels: F4C2C2 BFD8B8 FFF1B6 B8D8F0 D5C1E8 | pastel
muted, subtle, faded, washed: A3A08C C2B8A3 8A8F85 D9D2C3 75756B | muted
dusty: B8A39B 9C8C86 D6C8C0 7A6A68 A9B5B0 | muted warm
neutral, neutrals: D9CFC1 B8AD9E 8F8577 F2EDE4 5B544A | muted
minimal, minimalist, simple: F5F5F2 DADAD5 9A9A94 3D3D3A E8E4DD | soft
modern, contemporary: 1F2937 3B82F6 F59E0B F3F4F6 10B981
clean, crisp, tidy: F8FAFC E2E8F0 94A3B8 0EA5E9 1E293B
fresh, freshly: 9BE564 F7F7B0 4DD0E1 FF9E80 2E7D32 | bright
airy, light, lightness: E9F2F9 FDF6EC D6E6F2 F4E1E6 BFD7EA | light
elegant, elegance, graceful: 2B2B3A 8A7968 D4C5B0 EDE6DA 5C4B4B
luxury, luxurious, luxe, lavish: 1A1A2E D4AF37 F5E6C8 4A2545 2B2B2B | deep
royal, regal, majestic: 3B2F8F D4AF37 7A1F4B F5E7B5 1B1647 | deep
glam, glamour, glamorous: E9C46A 1A1A1A F4ACB7 C77DFF F8F0E3
sophisticated, refined, chic: 3A3A4A 8E8AA0 D8D2C4 B09A8B 2A2A35
classic, timeless, traditional: 2C3E50 ECF0F1 C0392B 7F8C8D F5CBA7
professional, corporate, business, formal: 1D3557 457B9D A8DADC F1FAEE E63946
tech, technology, digital: 0F172A 1E293B 38BDF8 818CF8 F472B6
futuristic, future, cyber, cyberpunk, scifi, sci fi: 0D0221 261447 FF00A0 00F0FF F9F871 | neon
robot, robotic: 8A939B 2E3338 00E5FF D2D7DA FF6F00
moody, brooding: 2B2D42 5C5470 8D99AE 3A506B 1C2541 | dark muted
dark, darkness, shadow, shadows, shadowy: 1B1B2F 2E2E4D 4A4A6A 8F8FB0 | dark
deep, intense: 1D2B53 7E2553 008751 AB5236 | deep
sad, sadness, melancholy, blue mood, lonely: 3F5E7A 8AA6B8 566B7F D1DCE5 2B3A47 | cool muted
gloomy, gloom, somber, grim: 4B5563 6B7280 9CA3AF 1F2937 | dark muted
angry, anger, rage, fierce: 9B1B1B E5383B 2B0A0A F77F00 | vivid dark
strong, power, powerful, brave: 7A1F1F 1D3557 F4A261 2B2D42 E9C46A | deep
wild, wilderness, untamed: E85D04 DC2F02 6A994E 3D405B FFBA08
free, freedom: 4CC9F0 4895EF 90E0EF F8F9FA FFBE0B | bright
adventure, adventurous, explorer, explore: 2A9D8F E9C46A F4A261 E76F51 264653
travel, wanderlust, journey, trip, vacation: 3A86FF FFBE0B FB5607 8338EC 06D6A0 | bright
safari: C2A35D 8A7A3D 5B6B33 D9C49A 3F2E1E | warm muted
camp, camping, hiking, hike, outdoors: 2F5D50 8A5A3C F2A65A 1B3A32 E8D8B8
cabin, lodge: 6B4A32 A8764A 2F4F3A E8D5B0 8B2E2E | warm
lucky: 2D6A4F 52B788 D4AF37 F1FAEE 1B4332
hope, hopeful: A8DADC F1FAEE FFE29A 457B9D F4A261 | light
nostalgic summer: F7B267 F79D84 EAD2AC 7FB7BE 5C6B73 | vintage

# ---- places and people
library, study, studying: 5C4033 8B6B4A C9A66B 2F4F4F E8DCC0 | warm muted
bookstore, books, book: 6B4F3A A88B5E 2F4F4F C94F4F E8D9B5
museum, gallery: E8E4DC 9C8F7A 3B3B3B C0504D 6B7A8F | muted
school, classroom: FFC857 4A7C59 C73E1D 2E5A88 F2E8CF
office, workspace: 4B5D67 9AB3C0 E4E9EC F2C14E 2F3E46
grandma, grandmother, granny, nana: E8C9B4 C97B84 8FA38A F2E3C6 B5838D | vintage soft
kitchen: F4E9D8 C9A87C A3B18A D17A5A 6B4F3A | warm
farm, barn, farmhouse kitchen: 7A9E4B C9A66B A34A3A E8D8A8 5C7A8F | warm
city, urban, downtown: 3A4352 6B7A8F A0AEC0 F2C94C E15759
skyline: 1F2A44 4D5B7C F4A259 C06C84 0B132B | deep
tokyo, japan, japanese: BC002D F5F0E6 2B2B2B 8FA3A3 D8A7B1
paris, parisian, french: E8B4B8 C9D6DF F5EBE0 8E7F72 3D3B58 | soft
london, british: 5C6B7A 9C2A2A 1F2A44 D8D2C4 | muted
italy, italian: C1272D 5B8E3B F4EBD0 D4A24C 2E5E4E
tuscany, tuscan: C8883A 7A8F4B A34A28 EAD9B0 5B4636 | warm
mediterranean, greek, greece, santorini: 1F6FB2 F4F1EA 7FB8E0 E6B450 2E8B8B
mexico, mexican: E63946 F4A261 2A9D8F E9C46A 7B2CBF | vivid
moroccan, morocco: C1440E E5B25D 1F6F8B 7A1F3D F2E2C0 | warm
india, indian: E8472B F5A623 8E24AA 00897B FFD54F | vivid
africa, african: C1440E E9B44C 2E7D32 5D4037 1B1B1B | warm
scandinavian, nordic, scandi: E8EEF2 9DB4C0 D9C8B4 5E6B73 B5836A | soft cool
cottage, cottagecore: B7C9A8 F3D9DC F0E6D2 8FA68E C9A9A6 | soft
park, picnic: 7CB518 F2E8CF E63946 FFD166 4A7C59 | bright
playground: FF595E FFCA3A 8AC926 1982C4 6A4C93 | bright
sports, sport, team: 1D3557 E63946 F1FAEE 457B9D FFB703 | vivid
gym, workout, fitness: 2B2D42 EF233C FFB703 8D99AE EDF2F4 | vivid
music, concert, band: 1F1147 7B2CBF E63946 FFB703 0A0A23 | deep vivid
jazz: 1B1B3A 693668 A74482 F84AA7 FFDF00 | deep
disco: C77DFF 7B2CBF FF4D6D FFD60A 3A0CA3 | neon
rave: 00F5D4 F15BB5 FEE440 9B5DE5 00BBF9 | neon
art, artist, artsy, creative: E63946 FFB703 2A9D8F 7B2CBF 264653 | vivid
paint, painter, painting: E63946 F4A261 2A9D8F 3A86FF F2D14B | vivid
watercolor, watercolour: BDE0FE FFC8DD CDEAC0 FFF1A8 E2CFF7 | soft
wedding, bride, bridal: FFF5F5 F4C2C2 C9A66B 8FA68E E8DCC8 | soft
spring wedding: F9E0E3 BFD8B8 FFF4C2 C9B6F2 | pastel
baby shower: BDE0FE FFC8DD FFF1A8 CDEAC0 | pastel
bedroom: D9CFC1 B5A18C 8A9A8F E8DED0 5C5248 | muted soft
living room: C9B79C 8A6F52 4F6D5F E8DFD0 B0583F | warm
bathroom: CFE8E5 9AC9C7 F2F7F7 5B8A8A D9C8A8 | soft
nursery pastels: FADADD E0F0E3 FFF1CC DCE6F7 | pastel

# ---- materials and styles
rose gold: B76E79 E8B4B8 F5D5D0 8A4B52
marble: F2F2F0 D5D5D2 9E9E9A 5C5C5A | soft
velvet: 5B1E4D 8B2E6E 2E0E28 C47AA8 | deep
silk, satin: E9D8C4 F5EBDD C7A98C B58A6D | soft
denim, jeans: 2B4E7A 4F78A8 8CAAC9 1B2F4B
linen, cotton: E9E0CF D6C8AF B8A88A F6F1E6 | soft
wool, knit, knitted, sweater: C8B6A6 A38D7C E8DCCD 6F5B4B B4543A | warm muted
wood, wooden, timber: 8B5E3C B58863 5A3822 D9B88F
leather: 6B3E26 8F5B3A 3E2316 C49A6C | warm
glass: CFEAF0 A5D8E6 E9F6F9 7FB9C9 | soft
crystal: E6F0FA C7DDF0 A7C7E7 F9FBFE B8A9E8 | soft
diamond: E8F4FF C4E3F7 9FD0F0 F5FAFF | light
gem, gems, gemstone, jewel, jewels, jewelry: 9B1D64 0F7B6C 2E4A9E D4AF37 5C1A6B | deep vivid
pearl, pearls, pearly: F8F4EC E9DFD0 D8C9B8 B8A99A | soft
opal, opalescent: D8EFEF F2D8E8 CFE3F5 F6F1D2 | pastel
paper: F3EBDD E0D2BA C8B492 8C7B5A | warm
chalk, chalkboard: 2F3E46 52796F 84A98C F1F1EA E7C8A0 | muted
sketch, pencil: 4F4F4F 8A8A8A D6D2C4 F4F1E8 2B2B2B | muted
ink: 0B132B 1C2541 3A506B 5BC0BE 6FFFE9 | deep

# ---- style modifiers (no colors of their own)
darker, dim, dimly: | dark
lighter, pale, paler: | light
darkly: | dark
saturated, rich: | vivid
colorless, greyscale, grayscale, monochrome: 111111 555555 999999 CCCCCC F2F2F2 | muted
sepia: 704214 A47B4D D2B48C F1E4CC 3F2A14 | vintage
warmer, toasty: | warm
cooler, icy cool: | cool
glowy: | bright
`;

/* ---------- parse the dictionary ---------- */

const MODS = new Set(['dark', 'light', 'deep', 'soft', 'pastel', 'muted', 'vivid', 'neon', 'warm', 'cool', 'vintage', 'bright']);

export const DICTIONARY = new Map();
for (const line of RAW.split('\n')) {
  const text = line.trim();
  if (!text || text.startsWith('#')) continue;
  const colon = text.indexOf(':');
  const words = text.slice(0, colon).split(',').map((w) => w.trim()).filter(Boolean);
  const [seedPart, modPart = ''] = text.slice(colon + 1).split('|');
  const seeds = seedPart.trim().split(/\s+/).filter(Boolean).map((h) => `#${h.toUpperCase()}`);
  const mods = modPart.trim().split(/\s+/).filter(Boolean);
  for (const w of words) DICTIONARY.set(w, { seeds, mods });
}

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'with', 'in', 'on', 'for', 'to', 'my', 'your', 'our', 'its', 'at', 'by', 'from', 'like', 'some', 'very', 'so', 'is', 'it', 'me', 'we', 'i', 'as', 'or', 'but', 'that', 'this', 'palette', 'colors', 'colours', 'color', 'colour', 'theme', 'vibes', 'vibe', 'feel', 'feeling', 'style', 'looking', 'look']);

export const SUGGESTIONS = ['rainy café', 'cozy winter', 'tropical sunset', 'enchanted forest', 'mermaid lagoon', "grandma's kitchen", 'neon tokyo night', 'strawberry cupcake', 'desert sunrise', 'cottagecore garden', 'spooky halloween', 'ocean breeze'];

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']s\b/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function lookup(word) {
  if (DICTIONARY.has(word)) return word;
  const tries = [];
  if (word.endsWith('ies')) tries.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) tries.push(word.slice(0, -2));
  if (word.endsWith('s')) tries.push(word.slice(0, -1));
  if (word.endsWith('ing')) tries.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
  if (word.endsWith('ed')) tries.push(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith('y')) tries.push(word.slice(0, -1));
  return tries.find((t) => DICTIONARY.has(t)) ?? null;
}

/**
 * Understand a phrase: which words we know, which we don't, the seed colors
 * they bring and the modifiers they ask for. Two-word phrases ("golden hour",
 * "ice cream") are tried before single words.
 */
export function interpretMood(text) {
  const tokens = strip(String(text)).split(' ').filter(Boolean).slice(0, 12);
  const known = [];
  const unknown = [];
  const seeds = [];
  const mods = new Set();
  const take = (key, label) => {
    const entry = DICTIONARY.get(key);
    known.push(label);
    entry.seeds.forEach((s) => { if (!seeds.includes(s)) seeds.push(s); });
    entry.mods.forEach((m) => mods.add(m));
  };
  for (let i = 0; i < tokens.length; i++) {
    const two = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : null;
    if (two && DICTIONARY.has(two)) { take(two, two); i++; continue; }
    const w = tokens[i];
    if (STOP.has(w)) continue;
    const key = lookup(w);
    if (key) take(key, w);
    else if (!/^\d+$/.test(w)) unknown.push(w);
  }
  return { tokens, known, unknown, seeds, mods };
}

/* ---------- turning seeds into palettes ---------- */

const shiftHue = (h, target, k) => {
  const d = ((target - h + 540) % 360) - 180;
  return wrapHue(h + d * k);
};

function applyMods(hex, mods) {
  let { h, s, l } = hexToHsl(hex);
  if (mods.has('warm')) h = shiftHue(h, 28, 0.35);
  if (mods.has('cool')) h = shiftHue(h, 215, 0.35);
  if (mods.has('vintage')) { h = shiftHue(h, 35, 0.18); s *= 0.68; l = clamp(l, 0.25, 0.82); }
  if (mods.has('muted')) s *= 0.55;
  if (mods.has('soft')) { s *= 0.72; l = l * 0.55 + 0.38; }
  if (mods.has('pastel')) { s = Math.min(s, 0.62); l = l * 0.25 + 0.72; }
  if (mods.has('light')) l = l * 0.5 + 0.5;
  if (mods.has('dark')) l *= 0.52;
  if (mods.has('deep')) { l *= 0.72; s = Math.min(1, s * 1.1); }
  if (mods.has('vivid')) s = Math.min(1, s * 1.25 + 0.1);
  if (mods.has('bright')) { s = Math.max(s, 0.72); l = clamp(l, 0.48, 0.68); }
  if (mods.has('neon')) { s = 1; l = clamp(l, 0.5, 0.6); }
  return hslToHex({ h, s: clamp(s), l: clamp(l, 0.04, 0.97) });
}

const LADDER = [0.13, -0.13, 0.25, -0.24, 0.07, -0.07, 0.34, -0.32, 0.19, -0.18, 0.4, -0.38];
const MIN_DIST = 18;
const distinct = (list, hex) => list.every((c) => colorDistance(c, hex) >= MIN_DIST);

/** Fill `n` colors: the seeds first, then tints and shades of them. */
function fillPalette(seeds, n, rng, style) {
  const out = [];
  const room = n >= 6 ? n - 2 : n; // keep two slots for a paper tone and an ink tone
  for (const s of seeds) if (out.length < room && distinct(out, s)) out.push(s);

  if (style === 'contrast' && seeds.length && out.length < room) {
    const { h, s, l } = hexToHsl(seeds[0]);
    const comp = hslToHex({ h: wrapHue(h + 180), s: clamp(s * 0.9 + 0.05), l: clamp(l, 0.35, 0.65) });
    if (distinct(out, comp)) out.push(comp);
  }

  let k = 0;
  let guard = 0;
  while (out.length < room && guard++ < 600) {
    const base = seeds[k % seeds.length];
    const round = Math.floor(k / seeds.length);
    const step = style === 'tonal'
      ? LADDER[round % LADDER.length] * 1.2
      : LADDER[round % LADDER.length];
    k++;
    const { h, s, l } = hexToHsl(base);
    const hex = hslToHex({
      h: wrapHue(h + (rng() - 0.5) * 10),
      s: clamp(s - Math.abs(step) * 0.25 + (rng() - 0.5) * 0.08),
      l: clamp(l + step + (rng() - 0.5) * 0.03, 0.08, 0.94),
    });
    if (distinct(out, hex)) out.push(hex);
  }
  // Last resort for very similar seeds: loosen the distance rule.
  while (out.length < room) {
    const base = seeds[out.length % seeds.length];
    const { h, s, l } = hexToHsl(base);
    out.push(hslToHex({ h: wrapHue(h + rng() * 40 - 20), s: clamp(s + rng() * 0.2 - 0.1), l: clamp(0.2 + rng() * 0.65) }));
  }

  if (room < n) {
    const { h, s } = hexToHsl(seeds[0]);
    out.push(hslToHex({ h, s: clamp(s * 0.35, 0.05, 0.4), l: 0.94 })); // paper
    out.push(hslToHex({ h, s: clamp(s * 0.5, 0.1, 0.5), l: 0.17 })); // ink
  }
  return out.slice(0, n);
}

export const VARIANTS = [
  { id: 'balanced', suffix: '', mod: null, style: 'balanced' },
  { id: 'contrast', suffix: 'Contrast', mod: null, style: 'contrast' },
  { id: 'tonal', suffix: 'Tonal', mod: null, style: 'tonal' },
  { id: 'bold', suffix: 'Bold', mod: 'vivid', style: 'balanced' },
  { id: 'soft', suffix: 'Soft', mod: 'soft', style: 'balanced' },
  { id: 'moody', suffix: 'Moody', mod: 'deep', style: 'balanced' },
  { id: 'warm', suffix: 'Warm', mod: 'warm', style: 'balanced' },
  { id: 'cool', suffix: 'Cool', mod: 'cool', style: 'balanced' },
  { id: 'vintage', suffix: 'Vintage', mod: 'vintage', style: 'balanced' },
];

const titleCase = (s) => s.replace(/(^|[\s·-])(\p{L})(\p{L}*)/gu, (_, sep, a, b) => sep + a.toUpperCase() + b.toLowerCase());

/**
 * Palettes for a phrase.
 * @returns {{ palettes: {name, hexes, variant}[], known: string[], unknown: string[], fallback: boolean }}
 */
export function moodPalettes(text, { count = 8, variants = 9, seed = 1 } = {}) {
  const info = interpretMood(text);
  const clean = strip(String(text)).slice(0, 40);
  let seeds = info.seeds.slice(0, 8);
  let fallback = false;
  if (!seeds.length) {
    // Nothing recognised: still make something nice, the same way every time.
    fallback = true;
    const h = hashString(clean || 'color') % 360;
    seeds = [hslToHex({ h, s: 0.6, l: 0.55 }), hslToHex({ h: wrapHue(h + 30), s: 0.5, l: 0.65 }), hslToHex({ h: wrapHue(h - 30), s: 0.45, l: 0.4 })];
  }
  const base = titleCase(String(text).trim().replace(/\s+/g, ' ').slice(0, 30)) || 'My Mood';
  const palettes = [];
  for (let v = 0; v < Math.min(variants, VARIANTS.length * 2); v++) {
    const variant = VARIANTS[v % VARIANTS.length];
    const mods = new Set(info.mods);
    if (variant.mod) mods.add(variant.mod);
    const rng = makeRng(hashString(`${clean}|${v}|${seed}`));
    const shaped = seeds.map((s) => applyMods(s, mods));
    const hexes = tidy(fillPalette(shaped, clamp(Math.round(count), 6, 15), rng, variant.style));
    const round = Math.floor(v / VARIANTS.length);
    const name = [base, variant.suffix, round ? String(round + 1) : ''].filter(Boolean).join(' · ');
    palettes.push({ name, hexes, variant: variant.id });
  }
  return { palettes, known: info.known, unknown: info.unknown, fallback };
}
