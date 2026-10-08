// Word-locked chests, after Betrayal at Krondor: a riddle, a row of lettered
// wheels, and no way in but the answer. Each wheel carries the right letter
// among a few decoys; the decoys are fixed per chest so a lock never changes.

import { clamp } from '../rules';
import { GameState, member } from '../state';

export interface Chest {
  id: string;
  node: string;
  /** What the party sees before trying it. */
  desc: string;
  riddle: string[];
  answer: string;
  /** Applies the contents; returns lines for the result card. */
  open: (s: GameState) => string[];
}

const healTaint = (s: GameState, n: number) => {
  for (const m of s.party) m.taint = clamp(m.taint - n, 0, 100);
};

export const CHESTS: Chest[] = [
  {
    id: 'boundary',
    node: 'tithe-road',
    desc: 'Under the boundary stone, a squat iron box with four lettered wheels, sunk in the earth so long the grass grows through its hinges.',
    riddle: ['First I feed you, then I feed the ground.', 'In my third year, what do I do?'],
    answer: 'REST',
    open: (s) => {
      s.rations += 3;
      s.coin += 2;
      return ['A farmer\'s cache, wrapped in waxed cloth: three rations of hard bread and cheese, and two coins.', 'Someone kept the stone\'s rule after all.'];
    },
  },
  {
    id: 'hearth',
    node: 'tallow-cross',
    desc: 'Set into the inn\'s hearthstone, blackened by a century of fires, a little brass coffer with five wheels. Grandmother Brannagh watches you find it and says nothing.',
    riddle: ['Out of the oak I stepped, with leaves for a crown.', 'I put my hands in the black rye and it stood up green.', 'Name me.'],
    answer: 'HULDA',
    open: (s) => {
      s.coin += 5;
      healTaint(s, 15);
      return [
        'Five coins, and a sprig of something green that has not withered, though the coffer smells of a hundred years of smoke.',
        'You each hold it a moment. Whatever chaos clings to you loosens.',
        '"My father put that there," says Brannagh. "For whoever still remembered her."',
      ];
    },
  },
  {
    id: 'speaking-box',
    node: 'hessle',
    desc: 'The speaking-box has a second panel, low on its side, with four tiny lettered wheels no child ever noticed.',
    riddle: ['I answer every call, and never call myself.', 'Shout into a valley and I will prove it.'],
    answer: 'ECHO',
    open: (s) => {
      s.coin += 6;
      s.flags.boxSpring = 1;
      return [
        'Inside: a coil of spring-steel finer than hair, a little brass key, and six coins left as a fee for the next repairer.',
        'A card in a cramped, impatient hand: "For whoever keeps this running. Don\'t over-wind it. —D."',
      ];
    },
  },
  {
    id: 'dead-drop',
    node: 'gallows-rise',
    desc: 'Under the gibbet\'s footing stone, a dead-drop box stamped with the keyhole-and-coin. Five wheels. Sefa goes very still.',
    riddle: ['The more of me you take,', 'the more of me you leave behind.'],
    answer: 'STEPS',
    open: (s) => {
      s.coin += 10;
      const sefa = member(s, 'sefa');
      sefa.taint = clamp(sefa.taint + 6, 0, 100);
      return [
        'Ten coins in a purse of red silk. Keystone money.',
        'Sefa takes the purse before anyone else can and will not hand it over. "Guild coin is never clean," Sefa says. "Better it dirties me than you."',
      ];
    },
  },
  {
    id: 'cairn',
    node: 'cairn-pass',
    desc: 'One cairn stands taller than the rest, and in its heart, behind a loose flat stone, an iron box with five wheels, its lid stamped with a hammer.',
    riddle: ['I have no voice, yet I tell you the way.', 'Pile me high, or the mountain keeps you.'],
    answer: 'CAIRN',
    open: (s) => {
      const oswin = member(s, 'oswin');
      oswin.might += 1;
      return [
        'A whetstone, black and fine-grained, worn to the shape of a big man\'s hand. Scratched on it: V.',
        'Oswin draws it once along his blade and the steel sings. His sword will bite deeper now.',
      ];
    },
  },
  {
    id: 'reliquary',
    node: 'reedmarsh',
    desc: 'Half sunk in the causeway, a lead reliquary with five wheels, green with marsh-slime, its lid etched with a column of falling water.',
    riddle: ['I fall forever and I never land.', 'By day a thread, by night a flame;', 'I pour into stone from the sky\'s own hand.'],
    answer: 'FALLS',
    open: (s) => {
      healTaint(s, 20);
      s.flags.tincture = 1;
      return [
        'A stoppered phial of something clear that moves like mercury. The label, in a careful physician\'s script: "Against the creeping. Anatol\'s method. One swallow each."',
        'You share it. It tastes of iron and snow. The marsh-taint drains out of you like cold water.',
      ];
    },
  },
  {
    id: 'niche',
    node: 'shrine',
    desc: 'Under the empty eighth niche, a slot in the stone: seven wheels of black iron, almost rusted shut.',
    riddle: ['Climb me and I am a promise.', 'Fall through me and I am a curse.', 'Spell me climbing.'],
    answer: 'DELIVER',
    open: (s) => {
      for (const m of s.party) {
        m.taint = 0;
        m.maxHealth += 2;
        m.health = Math.min(m.maxHealth, m.health + 2);
      }
      s.flags.niche = 1;
      return [
        'The wheels grind, catch, and the stone under the niche slides back.',
        'Inside there is nothing but a slip of vellum, dry as if it were sealed yesterday, in a hand none of you know:',
        '"Forgive them. They will not know what they owe. —A."',
        'When you close the stone again, you all feel cleaner, and somehow harder to kill.',
      ];
    },
  },
];

export const chestAt = (nodeId: string) => CHESTS.filter((c) => c.node === nodeId);
export const chestById = (id: string) => CHESTS.find((c) => c.id === id);
export const isOpen = (s: GameState, id: string) => !!s.flags[`chest:${id}`];

const COMMON = 'ETAOINSHRDLUCMWFGYPBVK';

function hashSeed(text: string): { seed: number } {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return { seed: h | 0 };
}

function nextRand(r: { seed: number }): number {
  let t = (r.seed = (r.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The letters on each wheel, in wheel order. Deterministic per chest. */
export function wheelsFor(chest: Chest): string[][] {
  const per = chest.answer.length > 5 ? 4 : 5;
  const r = hashSeed(chest.id);
  return [...chest.answer].map((letter) => {
    const letters = [letter];
    while (letters.length < per) {
      const c = COMMON[Math.floor(nextRand(r) * COMMON.length)];
      if (!letters.includes(c)) letters.push(c);
    }
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand(r) * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    return letters;
  });
}

/** Starting wheel positions: every wheel starts on a wrong letter. */
export function startPositions(chest: Chest): number[] {
  return wheelsFor(chest).map((w, i) => {
    const right = w.indexOf(chest.answer[i]);
    return (right + 1 + (i % (w.length - 1))) % w.length;
  });
}
