// Strain Guide data — the single source of truth for strain info.
// Published-style ranges: THC percentages vary a lot by grower and batch,
// so treat these as typical ranges, not a promise about any one jar.

export type StrainType = 'indica' | 'sativa' | 'hybrid';

export interface StrainEffect {
  name: string;
  /** 0–5, how strongly this strain is known for the effect. */
  level: number;
}

export interface StrainTerpene {
  name: string;
  /** One plain-language line about what this terpene brings. */
  note: string;
}

export interface Strain {
  id: string;
  name: string;
  type: StrainType;
  thcMin: number;
  thcMax: number;
  lineage: string;
  flavors: string[];
  effects: StrainEffect[];
  terpenes: StrainTerpene[];
  blurb: string;
}

export const STRAINS: Strain[] = [
  {
    id: 'granddaddy-purple',
    name: 'Granddaddy Purple',
    type: 'indica',
    thcMin: 17,
    thcMax: 23,
    lineage: 'Purple Urkle × Big Bud',
    flavors: ['Grape', 'Berry', 'Sweet'],
    effects: [
      { name: 'Relaxed', level: 5 },
      { name: 'Sleepy', level: 5 },
      { name: 'Happy', level: 4 },
      { name: 'Hungry', level: 3 },
    ],
    terpenes: [
      { name: 'Myrcene', note: 'Earthy and musky — the classic couch-lock terpene.' },
      { name: 'Linalool', note: 'Floral and lavender-like — the calm, wind-down smell.' },
      { name: 'Caryophyllene', note: 'Peppery and warm — adds a spicy kick to the grape.' },
    ],
    blurb:
      'The famous purple nightcap — sweet grape flavor and a heavy, sleepy body feel that is made for the end of the day.',
  },
  {
    id: 'blue-dream',
    name: 'Blue Dream',
    type: 'hybrid',
    thcMin: 17,
    thcMax: 24,
    lineage: 'Blueberry × Haze',
    flavors: ['Blueberry', 'Sweet', 'Herbal'],
    effects: [
      { name: 'Happy', level: 4 },
      { name: 'Relaxed', level: 4 },
      { name: 'Uplifted', level: 4 },
      { name: 'Creative', level: 3 },
    ],
    terpenes: [
      { name: 'Myrcene', note: 'Earthy and musky — keeps the high mellow and easy.' },
      { name: 'Pinene', note: 'Fresh pine — the sharp, foresty smell in the berry sweetness.' },
      { name: 'Caryophyllene', note: 'Peppery and warm — a little spice behind the fruit.' },
    ],
    blurb:
      'A sweet berry classic that lifts your mood without knocking you out — the easy all-rounder people reach for again and again.',
  },
  {
    id: 'sour-diesel',
    name: 'Sour Diesel',
    type: 'sativa',
    thcMin: 18,
    thcMax: 26,
    lineage: 'Chemdawg × Super Skunk',
    flavors: ['Diesel', 'Citrus', 'Skunky'],
    effects: [
      { name: 'Energized', level: 5 },
      { name: 'Uplifted', level: 4 },
      { name: 'Talkative', level: 4 },
      { name: 'Focused', level: 3 },
    ],
    terpenes: [
      { name: 'Limonene', note: 'Bright citrus — the zesty, wake-you-up smell.' },
      { name: 'Caryophyllene', note: 'Peppery and warm — the spice under the fuel smell.' },
      { name: 'Terpinolene', note: 'Fresh and herbal — a light, almost floral lift.' },
    ],
    blurb:
      'Pungent fuel and citrus with a fast, buzzy lift — the daytime strain for getting stuff done and talking a mile a minute.',
  },
  {
    id: 'og-kush',
    name: 'OG Kush',
    type: 'hybrid',
    thcMin: 19,
    thcMax: 25,
    lineage: 'Chemdawg × Hindu Kush',
    flavors: ['Earthy', 'Pine', 'Lemon'],
    effects: [
      { name: 'Relaxed', level: 5 },
      { name: 'Happy', level: 4 },
      { name: 'Euphoric', level: 4 },
      { name: 'Hungry', level: 3 },
    ],
    terpenes: [
      { name: 'Caryophyllene', note: 'Peppery and warm — the spicy backbone of OG.' },
      { name: 'Limonene', note: 'Bright citrus — a lemony lift on top of the earth.' },
      { name: 'Myrcene', note: 'Earthy and musky — the heavy, relaxing base note.' },
    ],
    blurb:
      'The strain that built a thousand other strains — earthy pine and lemon with a strong, happy body melt.',
  },
  {
    id: 'gsc',
    name: 'GSC',
    type: 'hybrid',
    thcMin: 18,
    thcMax: 28,
    lineage: 'OG Kush × Durban Poison',
    flavors: ['Sweet', 'Earthy', 'Mint'],
    effects: [
      { name: 'Happy', level: 5 },
      { name: 'Relaxed', level: 4 },
      { name: 'Euphoric', level: 4 },
      { name: 'Hungry', level: 3 },
    ],
    terpenes: [
      { name: 'Caryophyllene', note: 'Peppery and warm — the cookie-spice smell.' },
      { name: 'Limonene', note: 'Bright citrus — keeps the high upbeat and sunny.' },
      { name: 'Humulene', note: 'Woody and hoppy — the earthy, beer-like note.' },
    ],
    blurb:
      'Sweet, minty, and famously strong — a happy head rush that settles into a full-body relax, and yes, it brings the munchies.',
  },
  {
    id: 'northern-lights',
    name: 'Northern Lights',
    type: 'indica',
    thcMin: 16,
    thcMax: 21,
    lineage: 'Afghani × Thai',
    flavors: ['Earthy', 'Sweet', 'Pine'],
    effects: [
      { name: 'Relaxed', level: 5 },
      { name: 'Sleepy', level: 4 },
      { name: 'Happy', level: 4 },
      { name: 'Calm', level: 4 },
    ],
    terpenes: [
      { name: 'Myrcene', note: 'Earthy and musky — the deep, sleepy base.' },
      { name: 'Caryophyllene', note: 'Peppery and warm — a gentle spice under the pine.' },
      { name: 'Pinene', note: 'Fresh pine — the clean, foresty top note.' },
    ],
    blurb:
      'An old-school couch classic — sweet pine and earth with a calm, dreamy wind-down that is made for lights-out.',
  },
  {
    id: 'jack-herer',
    name: 'Jack Herer',
    type: 'sativa',
    thcMin: 15,
    thcMax: 24,
    lineage: 'Haze × Northern Lights #5 × Shiva Skunk',
    flavors: ['Pine', 'Earthy', 'Citrus'],
    effects: [
      { name: 'Creative', level: 5 },
      { name: 'Focused', level: 4 },
      { name: 'Uplifted', level: 4 },
      { name: 'Happy', level: 3 },
    ],
    terpenes: [
      { name: 'Terpinolene', note: 'Fresh and herbal — the bright, buzzy top note.' },
      { name: 'Pinene', note: 'Fresh pine — the sharp, clear-headed smell.' },
      { name: 'Caryophyllene', note: 'Peppery and warm — a little spice to ground it.' },
    ],
    blurb:
      'Piney and bright with a clear, creative buzz — the go-to for making stuff, brainstorming, or just getting inspired.',
  },
  {
    id: 'pineapple-express',
    name: 'Pineapple Express',
    type: 'hybrid',
    thcMin: 16,
    thcMax: 26,
    lineage: 'Trainwreck × Hawaiian',
    flavors: ['Pineapple', 'Tropical', 'Citrus'],
    effects: [
      { name: 'Happy', level: 5 },
      { name: 'Uplifted', level: 4 },
      { name: 'Energized', level: 4 },
      { name: 'Creative', level: 3 },
    ],
    terpenes: [
      { name: 'Limonene', note: 'Bright citrus — the sunny tropical punch.' },
      { name: 'Pinene', note: 'Fresh pine — a clean, green edge under the fruit.' },
      { name: 'Caryophyllene', note: 'Peppery and warm — a little kick behind the sweetness.' },
    ],
    blurb:
      'Tastes like a tropical vacation and feels like one too — sunny, upbeat energy that is made for good times with friends.',
  },
  {
    id: 'wedding-cake',
    name: 'Wedding Cake',
    type: 'hybrid',
    thcMin: 20,
    thcMax: 25,
    lineage: 'Triangle Kush × Animal Mints',
    flavors: ['Sweet', 'Vanilla', 'Earthy'],
    effects: [
      { name: 'Relaxed', level: 5 },
      { name: 'Happy', level: 4 },
      { name: 'Euphoric', level: 4 },
      { name: 'Sleepy', level: 3 },
    ],
    terpenes: [
      { name: 'Limonene', note: 'Bright citrus — the sweet, zesty top note.' },
      { name: 'Caryophyllene', note: 'Peppery and warm — the cake-spice smell.' },
      { name: 'Myrcene', note: 'Earthy and musky — the heavy, relaxing base.' },
    ],
    blurb:
      'Indica-leaning and dessert-sweet — vanilla and earth with a strong, happy relax that melts into a mellow evening.',
  },
  {
    id: 'zkittlez',
    name: 'Zkittlez',
    type: 'hybrid',
    thcMin: 15,
    thcMax: 23,
    lineage: 'Grape Ape × Grapefruit',
    flavors: ['Fruity', 'Berry', 'Citrus'],
    effects: [
      { name: 'Relaxed', level: 5 },
      { name: 'Happy', level: 4 },
      { name: 'Calm', level: 4 },
      { name: 'Sleepy', level: 3 },
    ],
    terpenes: [
      { name: 'Caryophyllene', note: 'Peppery and warm — the spice behind the candy fruit.' },
      { name: 'Limonene', note: 'Bright citrus — the zesty fruit-punch note.' },
      { name: 'Linalool', note: 'Floral and lavender-like — the soft, calming finish.' },
    ],
    blurb:
      'Indica-leaning and tastes like a bag of fruit candy — sweet and calm, perfect for kicking back and doing nothing.',
  },
  {
    id: 'durban-poison',
    name: 'Durban Poison',
    type: 'sativa',
    thcMin: 15,
    thcMax: 25,
    lineage: 'South African landrace (Durban)',
    flavors: ['Sweet', 'Earthy', 'Pine'],
    effects: [
      { name: 'Focused', level: 5 },
      { name: 'Energized', level: 4 },
      { name: 'Uplifted', level: 4 },
      { name: 'Creative', level: 3 },
    ],
    terpenes: [
      { name: 'Terpinolene', note: 'Fresh and herbal — the bright, clear lift.' },
      { name: 'Myrcene', note: 'Earthy and musky — keeps the buzz smooth, not jittery.' },
      { name: 'Humulene', note: 'Woody and hoppy — the deep, earthy base note.' },
    ],
    blurb:
      'A pure landrace sativa from South Africa — sweet pine with a clean, focused buzz that is great for daytime and getting in the zone.',
  },
  {
    id: 'gelato',
    name: 'Gelato',
    type: 'hybrid',
    thcMin: 18,
    thcMax: 25,
    lineage: 'Sunset Sherbet × Thin Mint GSC',
    flavors: ['Sweet', 'Creamy', 'Berry'],
    effects: [
      { name: 'Happy', level: 5 },
      { name: 'Relaxed', level: 4 },
      { name: 'Euphoric', level: 4 },
      { name: 'Giggly', level: 3 },
    ],
    terpenes: [
      { name: 'Caryophyllene', note: 'Peppery and warm — the spice under the cream.' },
      { name: 'Limonene', note: 'Bright citrus — a sunny lift on top of the sweet.' },
      { name: 'Linalool', note: 'Floral and lavender-like — the soft, mellow finish.' },
    ],
    blurb:
      'Sweet and creamy like dessert, with a happy, giggly lift that settles into a cozy relax — a crowd favorite for a reason.',
  },
];

/** Every effect name used across the strains, for filter dropdowns. */
export const EFFECT_NAMES: string[] = [
  'Relaxed',
  'Sleepy',
  'Happy',
  'Hungry',
  'Uplifted',
  'Creative',
  'Energized',
  'Talkative',
  'Focused',
  'Euphoric',
  'Calm',
  'Giggly',
];

/** Every terpene name used across the strains, for filter dropdowns. */
export const TERPENE_NAMES: string[] = [
  'Myrcene',
  'Limonene',
  'Caryophyllene',
  'Pinene',
  'Linalool',
  'Terpinolene',
  'Humulene',
];
