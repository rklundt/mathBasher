// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Sprint 2.16 — the words the Words puzzles use, all chosen for young
 * readers. Pure data; `wordPuzzles.ts` builds the puzzles. Tests check the
 * lists keep their promises (no word in two kinds that a puzzle contrasts,
 * every family long enough, each pair's answer unique).
 */

/**
 * The words with a picture, in the picture sheet's frame order (10 across,
 * `scripts/sprites/themes.mjs` draws them; the owner may swap in their own
 * sheet with the same frames). Short words first.
 */
export const PICTURE_WORDS = [
  // 3 letters
  'cat',
  'dog',
  'pig',
  'cow',
  'hen',
  'fox',
  'bee',
  'owl',
  'bug',
  'ant',
  'sun',
  'cup',
  'hat',
  'bus',
  'car',
  'bed',
  'box',
  'egg',
  'key',
  'web',
  // 4 letters
  'fish',
  'frog',
  'duck',
  'bird',
  'bear',
  'lion',
  'moon',
  'star',
  'tree',
  'ball',
  'cake',
  'kite',
  'boat',
  'book',
  'sock',
  'drum',
  'bell',
  'leaf',
  // 5 and 6 letters
  'apple',
  'house',
  'clock',
  'horse',
  'snake',
  'mouse',
  'train',
  'robot',
  'pizza',
  'cloud',
  'rocket',
  'flower',
] as const;

export type PictureWord = (typeof PICTURE_WORDS)[number];

/** The picture sheet's frame for a word, or null if it has none. */
export function picOf(word: string): number | null {
  const i = (PICTURE_WORDS as readonly string[]).indexOf(word);
  return i < 0 ? null : i;
}

/**
 * Rhyming families (spelled alike at the end, so a reader can see it).
 * Word Train needs five of a family; Odd Word Out four.
 */
export const RHYMES: Readonly<Record<string, readonly string[]>> = {
  at: ['cat', 'hat', 'bat', 'mat', 'rat', 'sat', 'pat'],
  an: ['can', 'fan', 'man', 'pan', 'van', 'ran', 'tan'],
  ig: ['big', 'dig', 'pig', 'wig', 'fig', 'jig'],
  op: ['hop', 'mop', 'top', 'pop', 'shop', 'stop'],
  ed: ['bed', 'red', 'fed', 'led', 'sled'],
  og: ['dog', 'fog', 'log', 'frog', 'jog', 'hog'],
  ake: ['cake', 'bake', 'lake', 'make', 'rake', 'snake'],
  ing: ['king', 'ring', 'sing', 'wing', 'swing'],
  ell: ['bell', 'well', 'shell', 'smell', 'spell', 'tell'],
  ug: ['bug', 'hug', 'mug', 'rug', 'jug'],
  ip: ['lip', 'dip', 'hip', 'ship', 'sip', 'tip', 'zip'],
  ee: ['bee', 'see', 'tree', 'free', 'three'],
  ight: ['light', 'night', 'right', 'sight', 'tight', 'bright'],
  eat: ['beat', 'heat', 'meat', 'neat', 'seat'],
  un: ['bun', 'fun', 'run', 'sun'],
  ook: ['book', 'cook', 'hook', 'look'],
};

/** Words by their first letter (Word Train's "same first letter"; Odd Word Out's first letters). */
export const FIRST_LETTERS: Readonly<Record<string, readonly string[]>> = {
  b: ['ball', 'bed', 'bee', 'bird', 'boat', 'book', 'box', 'bus', 'bell'],
  s: ['sun', 'sock', 'sand', 'seal', 'star', 'snake', 'ship', 'soap'],
  c: ['cat', 'cow', 'cup', 'cake', 'car', 'coat', 'cloud', 'clock'],
  m: ['moon', 'mouse', 'milk', 'mop', 'map', 'mat', 'mud'],
  t: ['tree', 'train', 'top', 'toy', 'tent', 'tiger', 'tooth'],
  p: ['pig', 'pen', 'pan', 'pizza', 'pot', 'pear', 'park'],
  f: ['fish', 'frog', 'fox', 'fan', 'fork', 'fire', 'feet'],
  d: ['dog', 'duck', 'drum', 'doll', 'door', 'desk', 'dish'],
  h: ['hat', 'hen', 'horse', 'house', 'hand', 'hill', 'hook'],
  r: ['rain', 'ring', 'robot', 'rocket', 'rose', 'rug', 'road'],
};

/**
 * One word for each letter (Word Train Hard: the first letters go in ABC
 * order). No X: no word a young reader knows starts with it.
 */
export const ABC_WORDS: Readonly<Record<string, readonly string[]>> = {
  a: ['ant', 'apple', 'arm'],
  b: ['bee', 'ball', 'bus'],
  c: ['cat', 'cup', 'car'],
  d: ['dog', 'duck', 'drum'],
  e: ['egg', 'elf', 'ear'],
  f: ['fox', 'fish', 'frog'],
  g: ['goat', 'gift', 'gum'],
  h: ['hat', 'hen', 'house'],
  i: ['ink', 'igloo', 'ice'],
  j: ['jam', 'jet', 'jug'],
  k: ['kite', 'key', 'king'],
  l: ['lion', 'leaf', 'lamp'],
  m: ['moon', 'mouse', 'map'],
  n: ['nest', 'nose', 'net'],
  o: ['owl', 'ox', 'oven'],
  p: ['pig', 'pen', 'pizza'],
  q: ['queen', 'quilt'],
  r: ['ring', 'robot', 'rain'],
  s: ['sun', 'sock', 'star'],
  t: ['tree', 'top', 'train'],
  u: ['up', 'umbrella'],
  v: ['van', 'vase'],
  w: ['web', 'whale', 'wing'],
  y: ['yak', 'yarn'],
  z: ['zoo', 'zebra', 'zip'],
};

/**
 * Word chains where each word adds one letter to the one before (Word
 * Train "growing words"). Every chain is five long.
 */
export const GROW_CHAINS: readonly (readonly string[])[] = [
  ['a', 'an', 'can', 'cane', 'crane'],
  ['i', 'in', 'pin', 'spin', 'spine'],
  ['a', 'at', 'cat', 'cart', 'chart'],
  ['i', 'it', 'sit', 'spit', 'split'],
  ['a', 'an', 'ant', 'pant', 'plant'],
  ['a', 'am', 'ram', 'tram', 'tramp'],
  ['i', 'in', 'tin', 'twin', 'twine'],
  ['a', 'ad', 'had', 'hand', 'handy'],
  ['a', 'an', 'and', 'sand', 'stand'],
  ['o', 'no', 'now', 'snow', 'snowy'],
  ['o', 'on', 'one', 'bone', 'bones'],
  ['a', 'at', 'eat', 'meat', 'meant'],
];

/** Kinds of things, for Odd Word Out. Each kind's plural name says what the others are. */
export interface WordKind {
  readonly name: string;
  readonly words: readonly string[];
}

/** Easy: broad kinds a young child knows (no word in two of them). */
export const EASY_KINDS: Readonly<Record<string, WordKind>> = {
  animals: {
    name: 'animals',
    words: ['cat', 'dog', 'pig', 'cow', 'hen', 'fox', 'bear', 'lion', 'frog', 'duck', 'horse', 'mouse', 'owl', 'snake'],
  },
  food: {
    name: 'things to eat',
    words: ['apple', 'cake', 'pizza', 'egg', 'bread', 'milk', 'banana', 'grape', 'pear', 'soup', 'cheese'],
  },
  go: {
    name: 'things that go',
    words: ['car', 'bus', 'train', 'boat', 'bike', 'truck', 'plane', 'rocket', 'van', 'ship'],
  },
  clothes: { name: 'clothes', words: ['sock', 'hat', 'coat', 'shoe', 'dress', 'shirt', 'boots', 'scarf', 'glove'] },
  colours: { name: 'colours', words: ['red', 'blue', 'green', 'yellow', 'pink', 'purple', 'brown', 'black', 'white'] },
  body: { name: 'body parts', words: ['hand', 'foot', 'nose', 'ear', 'eye', 'arm', 'leg', 'knee', 'toe', 'mouth'] },
  sky: { name: 'in the sky', words: ['sun', 'moon', 'star', 'cloud', 'rain', 'snow'] },
  toys: { name: 'toys', words: ['ball', 'kite', 'doll', 'drum', 'blocks', 'teddy', 'puzzle', 'robot'] },
};

/** Hard: closer kinds, in pairs that are easy to mix up. */
export const HARD_KINDS: Readonly<Record<string, WordKind>> = {
  farm: { name: 'farm animals', words: ['cow', 'pig', 'horse', 'sheep', 'goat', 'donkey'] },
  wild: { name: 'wild animals', words: ['lion', 'tiger', 'zebra', 'bear', 'fox', 'wolf', 'monkey', 'hippo'] },
  sea: { name: 'sea animals', words: ['fish', 'crab', 'whale', 'shark', 'seal', 'octopus', 'squid'] },
  fruit: { name: 'fruits', words: ['apple', 'pear', 'grape', 'banana', 'plum', 'peach', 'cherry', 'lemon'] },
  veg: { name: 'vegetables', words: ['carrot', 'pea', 'corn', 'bean', 'potato', 'onion', 'lettuce'] },
  fly: { name: 'things that fly', words: ['bird', 'bee', 'owl', 'plane', 'eagle', 'jet', 'butterfly'] },
};

/** Which hard kinds a puzzle may set against each other (the others are the first, the odd one the second). */
export const HARD_KIND_PAIRS: readonly (readonly [string, string])[] = [
  ['farm', 'wild'],
  ['wild', 'farm'],
  ['fruit', 'veg'],
  ['veg', 'fruit'],
  ['sea', 'farm'],
  ['sea', 'wild'],
  ['fly', 'sea'],
  ['fly', 'farm'],
];

/**
 * Word Wand's magic: A becomes B, so C becomes ? Each relation's pairs
 * (no A twice in one relation, so the answer is always one word), its
 * note ("A dog says woof, a cat says meow!"), and the level it plays at.
 */
export interface WandRelation {
  readonly id: string;
  readonly level: 'easy' | 'medium' | 'hard';
  readonly pairs: readonly (readonly [string, string])[];
  /** The note after a right answer, from the second pair. */
  readonly why: (a: string, b: string) => string;
}

const an = (w: string): string => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const WAND_RELATIONS: readonly WandRelation[] = [
  {
    id: 'sound',
    level: 'easy',
    pairs: [
      ['dog', 'woof'],
      ['cat', 'meow'],
      ['cow', 'moo'],
      ['duck', 'quack'],
      ['pig', 'oink'],
      ['sheep', 'baa'],
      ['lion', 'roar'],
      ['owl', 'hoot'],
      ['bee', 'buzz'],
      ['snake', 'hiss'],
    ],
    why: (a, b) => `${cap(an(a))} says ${b}!`,
  },
  {
    id: 'colour',
    level: 'easy',
    pairs: [
      ['grass', 'green'],
      ['sky', 'blue'],
      ['snow', 'white'],
      ['banana', 'yellow'],
      ['coal', 'black'],
      ['cherry', 'red'],
      ['pumpkin', 'orange'],
    ],
    why: (a, b) => `${cap(a)} is ${b}!`,
  },
  {
    id: 'opposite',
    level: 'easy',
    pairs: [
      ['hot', 'cold'],
      ['big', 'small'],
      ['up', 'down'],
      ['day', 'night'],
      ['happy', 'sad'],
      ['fast', 'slow'],
      ['wet', 'dry'],
      ['in', 'out'],
      ['on', 'off'],
      ['yes', 'no'],
    ],
    why: (a, b) => `${cap(b)} is the opposite of ${a}!`,
  },
  {
    id: 'baby',
    level: 'medium',
    pairs: [
      ['dog', 'puppy'],
      ['cat', 'kitten'],
      ['cow', 'calf'],
      ['sheep', 'lamb'],
      ['hen', 'chick'],
      ['horse', 'foal'],
      ['duck', 'duckling'],
      ['frog', 'tadpole'],
      ['goat', 'kid'],
      ['bear', 'cub'],
    ],
    why: (a, b) => `A baby ${a} is ${an(b)}!`,
  },
  {
    id: 'home',
    level: 'medium',
    pairs: [
      ['bee', 'hive'],
      ['bird', 'nest'],
      ['dog', 'kennel'],
      ['spider', 'web'],
      ['rabbit', 'burrow'],
      ['pig', 'sty'],
      ['horse', 'stable'],
      ['bear', 'den'],
    ],
    why: (a, b) => `${cap(an(a))} lives in ${an(b)}!`,
  },
  {
    id: 'plural',
    level: 'medium',
    pairs: [
      ['cat', 'cats'],
      ['box', 'boxes'],
      ['bus', 'buses'],
      ['fox', 'foxes'],
      ['baby', 'babies'],
      ['berry', 'berries'],
      ['dish', 'dishes'],
      ['book', 'books'],
      ['glass', 'glasses'],
    ],
    why: (a, b) => `More than one ${a}: ${b}!`,
  },
  {
    id: 'opposite2',
    level: 'medium',
    pairs: [
      ['full', 'empty'],
      ['light', 'dark'],
      ['tall', 'short'],
      ['push', 'pull'],
      ['open', 'closed'],
      ['give', 'take'],
      ['win', 'lose'],
      ['float', 'sink'],
      ['hard', 'soft'],
      ['clean', 'dirty'],
    ],
    why: (a, b) => `${cap(b)} is the opposite of ${a}!`,
  },
  {
    id: 'plural2',
    level: 'hard',
    pairs: [
      ['mouse', 'mice'],
      ['foot', 'feet'],
      ['tooth', 'teeth'],
      ['child', 'children'],
      ['man', 'men'],
      ['goose', 'geese'],
      ['person', 'people'],
      ['leaf', 'leaves'],
      ['wolf', 'wolves'],
      ['knife', 'knives'],
    ],
    why: (a, b) => `More than one ${a}: ${b}!`,
  },
  {
    id: 'past',
    level: 'hard',
    pairs: [
      ['run', 'ran'],
      ['sing', 'sang'],
      ['eat', 'ate'],
      ['swim', 'swam'],
      ['drink', 'drank'],
      ['write', 'wrote'],
      ['ride', 'rode'],
      ['fly', 'flew'],
      ['go', 'went'],
      ['see', 'saw'],
      ['give', 'gave'],
      ['sit', 'sat'],
      ['dig', 'dug'],
    ],
    why: (a, b) => `Today I ${a}, yesterday I ${b}!`,
  },
  {
    id: 'covering',
    level: 'hard',
    pairs: [
      ['bird', 'feathers'],
      ['fish', 'scales'],
      ['sheep', 'wool'],
      ['bear', 'fur'],
      ['turtle', 'shell'],
      ['tree', 'bark'],
    ],
    why: (a, b) => `${cap(an(a))} is covered in ${b}!`,
  },
];

/**
 * Compound words a young reader knows, as their two halves (Word Snap).
 * Every whole word is a real word written as one.
 */
export const COMPOUNDS: readonly (readonly [string, string])[] = [
  ['sun', 'flower'],
  ['rain', 'bow'],
  ['foot', 'ball'],
  ['cup', 'cake'],
  ['butter', 'fly'],
  ['star', 'fish'],
  ['snow', 'man'],
  ['pan', 'cake'],
  ['bed', 'room'],
  ['tooth', 'brush'],
  ['play', 'ground'],
  ['rain', 'coat'],
  ['sun', 'shine'],
  ['jelly', 'fish'],
  ['pop', 'corn'],
  ['gold', 'fish'],
  ['sand', 'box'],
  ['sea', 'shell'],
  ['back', 'pack'],
  ['door', 'bell'],
  ['horse', 'shoe'],
  ['lady', 'bug'],
  ['snow', 'ball'],
  ['mail', 'box'],
  ['rain', 'drop'],
  ['home', 'work'],
  ['bath', 'tub'],
  ['air', 'plane'],
  ['moon', 'light'],
  ['water', 'melon'],
  ['sail', 'boat'],
  ['tea', 'pot'],
  ['sun', 'set'],
  ['bed', 'time'],
  ['fish', 'bowl'],
  ['bird', 'house'],
  ['dog', 'house'],
  ['light', 'house'],
  ['tree', 'house'],
  ['grass', 'hopper'],
  ['dragon', 'fly'],
  ['straw', 'berry'],
  ['blue', 'berry'],
  ['sea', 'horse'],
  ['snow', 'flake'],
  ['pea', 'nut'],
  ['note', 'book'],
  ['cook', 'book'],
  ['pine', 'cone'],
  ['hair', 'brush'],
  ['sand', 'castle'],
  ['foot', 'print'],
  ['hot', 'dog'],
  ['skate', 'board'],
  ['key', 'board'],
  ['book', 'shelf'],
  ['sea', 'weed'],
  ['bird', 'bath'],
  ['earth', 'worm'],
  ['pin', 'wheel'],
  ['tooth', 'paste'],
  ['sun', 'rise'],
  ['birth', 'day'],
  ['up', 'stairs'],
];

/**
 * Halves that DO snap together into a real word although the list above
 * doesn't pair them (Word Snap Hard must never offer them as wrong
 * choices). A test checks every Hard pairing against the big word list.
 */
export const ALSO_REAL: readonly string[] = [
  'sunfish',
  'sunlight',
  'sunbath',
  'raincoat',
  'snowboard',
  'snowshoe',
  'starlight',
  'moonshine',
  'football',
  'footbath',
  'bathroom',
  'bedbug',
  'birdbath',
  'doghouse',
  'housework',
  'seahorse',
  'starboard',
  'keyhole',
  'cupboard',
  'teacup',
  'teapot',
  'backboard',
  'goldfish',
  'popcorn',
  'pineapple',
  'airbag',
  'sandbag',
  'sandman',
  'upset',
  'hotcake',
  'hotbed',
  'mailman',
  'fishcake',
  'catfish',
  'dogfish',
  'shellfish',
  'pancake',
  'seabird',
  'songbird',
  'sunshade',
  // Found by checking every pairing against the big word list.
  'footwork',
  'seaman',
  'doorman',
  'horseman',
  'bluebell',
  'bookworm',
];

/** Every word in the lists above (Letter Garden shows one of these first when it reveals a word). */
export const KID_WORDS: ReadonlySet<string> = new Set(
  [
    ...PICTURE_WORDS,
    ...Object.values(RHYMES).flat(),
    ...Object.values(FIRST_LETTERS).flat(),
    ...Object.values(ABC_WORDS).flat(),
    ...GROW_CHAINS.flat(),
    ...Object.values(EASY_KINDS).flatMap((k) => k.words),
    ...Object.values(HARD_KINDS).flatMap((k) => k.words),
    ...WAND_RELATIONS.flatMap((r) => r.pairs.flat()),
    ...COMPOUNDS.flatMap(([a, b]) => [a, b, a + b]),
  ].filter((w) => /^[a-z]+$/.test(w)),
);

/**
 * Sprint 2.16 — more words a young reader knows, for Missing Letter
 * (owner, 2026-11-01: "need more variety… pull in quite a few more
 * options"). Most have no picture, so Missing Letter checks each choice
 * against the big word list: only the right letters make a real word.
 */
export const KID_VOCAB: readonly string[] = [
  // 4 letters
  ...'ball bark barn bath beak bean bear bell bike bird blue boat bone book boot bowl bush cake calf card cart cave clap coat cold comb corn crab cube dart deer desk dish doll door drum duck dust farm fern fish flag foam food foot fork frog game gate gift goat gold golf hand harp hill hive home hook horn jump kick king kite lake lamp leaf lion lock mail milk mint moon nest nose park pear pond pony pool rain ring road rock roof rope rose sail sand seal ship shoe sing skip sled snow soap sock song star swim tail tent toad tree tube vase wand wave wing wolf yard yarn'.split(
    ' ',
  ),
  // 5 letters
  ...'apple beach bench berry block board brush candy chair chalk cheek chick cloud clown coral crown daisy dance dream drink eagle fairy feast flute fruit giant glove grape grass heart honey horse house juice koala lemon light llama magic mango maple melon mouse music nurse ocean otter paint panda party peach pearl penny piano pilot pizza plant plate puppy queen quilt radio river robin robot salad scarf shark sheep shell skate skirt sleep smile snack snail snake spoon squid stamp stick stone sugar sunny table teeth tiger toast tooth tower train truck tulip whale wheel zebra'.split(
    ' ',
  ),
  // 6 letters
  ...'animal banana basket bubble bucket butter button camera candle carrot castle cherry cookie cotton dragon flower forest garden guitar hammer helmet island jacket kitten ladder lizard monkey orange parrot peanut pebble pencil pepper pillow planet pocket potato puddle puzzle rabbit rocket sister spider spring summer sunset teapot tomato turtle window winter yellow zipper'.split(
    ' ',
  ),
  // 7 letters
  ...'balloon blanket brother cupcake dolphin feather giraffe hamster kitchen lantern leopard octopus pancake panther peacock penguin picture popcorn pumpkin rainbow sandbox scooter seaweed snowman sparkle sunrise teacher thunder unicorn vanilla whistle'.split(
    ' ',
  ),
];
