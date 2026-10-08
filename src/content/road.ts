// Chapter One: the Anvil Road, from the Moot to Anviltooth (one cube edge).
// Coordinates are kilometres on a local map: x east, y north, the Moot's
// Ledger Gate near the origin.

export interface RoadNode {
  id: string;
  name: string;
  x: number;
  y: number;
  /** 0 = safe, 3 = dangerous. */
  danger: number;
  desc: string;
  night?: string;
  inn?: { price: number };
  rationPrice?: number;
  /** Camping here is protected. */
  ward?: boolean;
  end?: boolean;
}

export interface Edge {
  a: string;
  b: string;
  /** Multiplies walking time and stamina drain. */
  terrain?: number;
  /** Flag that must be set before this edge can be walked. */
  requires?: string;
  blockedText?: string;
}

export interface Karst {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

/** Colours from The Eight — Character Codex, lifted for a night sky. */
export const KARSTS: Karst[] = [
  { id: 'moot', name: 'The Moot', x: -2, y: -1, color: '#a07cc4' },
  { id: 'anviltooth', name: 'Anviltooth', x: 62, y: 11, color: '#e0603c' },
  { id: 'hush', name: 'The Hush', x: 2, y: 64, color: '#6fa0d0' },
  { id: 'greencrown', name: 'Greencrown', x: -4, y: -62, color: '#5fc07e' },
  { id: 'keystone', name: 'The Keystone', x: 62, y: 70, color: '#d03030' },
  { id: 'dynamo', name: 'Dynamo', x: 60, y: -58, color: '#5a90e0' },
  { id: 'wallspire', name: 'Wallspire', x: -58, y: -60, color: '#c0a070' },
  { id: 'emberflask', name: 'Emberflask', x: -95, y: 4, color: '#90c050' },
];

export const NODES: RoadNode[] = [
  {
    id: 'moot-gate', name: 'The Ledger Gate', x: 2, y: 0, danger: 0, rationPrice: 1, inn: { price: 1 },
    desc: 'Behind you the Moot climbs out of the mist, terrace on terrace of archive-halls. Clerks in grey lean from the windows to watch you go. Ahead, the Anvil Road runs east through stubble fields. Over the gate, seven old letters are cut into the karst, worn almost smooth: D·E·L·I·V·E·R. The clerks say they read differently from the cellars.',
    night: 'The archive lamps burn late. Someone up there is still counting.',
  },
  {
    id: 'tithe-road', name: 'The Tithe Fields', x: 9, y: 2, danger: 1,
    desc: 'Tithe-fields, mostly fallow. The barley that did come up is black at the root. A boundary stone reads FIRST YEAR WHEAT · SECOND YEAR BEANS · THIRD YEAR REST. The field behind it has been wheat for six years.',
    night: 'Owls over the dead barley. Nothing else moves.',
  },
  {
    id: 'tallow-cross', name: 'Tallow Cross', x: 16, y: 1, danger: 1, rationPrice: 2, inn: { price: 2 },
    desc: 'A crossroads inn of blackened timber. Smoke from one chimney of three. A board by the door prices rations at what would have been robbery last year. The road forks here: the high road climbs north-east toward the pass, the low road drops to the river.',
    night: 'One window lit. Someone inside is singing badly, on purpose, to keep the quiet out.',
  },
  {
    id: 'gallows-rise', name: 'Gallows Rise', x: 24, y: 8, danger: 2,
    desc: 'A gibbet on the hill, three iron cages. Each holds what is left of a man, and a board: THIEF.',
    night: 'The cages creak in the wind. You stop looking at them.',
  },
  {
    id: 'cairn-pass', name: 'Cairn Pass', x: 34, y: 12, danger: 3,
    desc: 'The high road narrows between scree slopes. Cairns every hundred paces, built by travellers who wanted to be found. Some have been kicked over.',
    night: 'Wind through the pass, and under it, something padding along the ridge, keeping pace.',
  },
  {
    id: 'shrine', name: 'The Three-Peak Shrine', x: 42, y: 10, danger: 0, ward: true,
    desc: 'A wayshrine on the saddle of the pass. From here three peaks stand clear at once, as the old songs say they should: the Moot behind, Anviltooth ahead, and far to the north the pale needle of the Hush. Light falls into each of them out of the sky.',
    night: 'The three columns of heaven-water shine faintly against the stars. The shrine-stones are warm.',
  },
  {
    id: 'hessle', name: 'Hessle', x: 24, y: -3, danger: 1, rationPrice: 3,
    desc: 'A dozen houses and a chapel with its roof half-tiled. On a post in the green stands a brass cabinet with a crank: the speaking-box, the old folk call it. Children dare each other to touch it.',
    night: 'Shutters barred. A dog barks at you from behind every door.',
  },
  {
    id: 'wend-bridge', name: 'The Wend Bridge', x: 33, y: -4, danger: 1,
    desc: 'What is left of it. The centre span lies in the river. The stones are good Wallspire work, but the mortar has gone to sand.',
    night: 'The river is loud in the dark, and colder for it.',
  },
  {
    id: 'reedmarsh', name: 'Reedmarsh', x: 41, y: -2, danger: 2,
    desc: 'The road becomes a causeway of rotting planks. Things move under the water that are too big to be fish.',
    night: 'Marsh-lights out over the reeds. Do not follow them.',
  },
  {
    id: 'cinder-hollow', name: 'Cinder Hollow', x: 49, y: 4, danger: 2,
    desc: 'A burnt farmstead in a hollow where the high and low roads meet again. Fresh cart tracks, deep and heavy, lead off toward the hills. Someone has scratched a coiled shape into the doorpost: a serpent with wings.',
    night: 'Far off in the hills, a fire, and voices singing to it.',
  },
  {
    id: 'slag-fields', name: 'The Slag Fields', x: 55, y: 8, danger: 1,
    desc: 'Black glass and clinker for miles. Anviltooth fills the eastern sky, its foundry vents dark. In every song you know, they glow.',
    night: 'No glow from the vents. The karst is a hole in the stars.',
  },
  {
    id: 'anviltooth-gate', name: 'Anviltooth, Lower Gate', x: 59, y: 10, danger: 0, end: true,
    desc: 'Iron doors three storeys high, shut. No bells. No hammers. Only the heaven-water falling out of the clouds onto the summit, loud in the silence.',
  },
];

export const EDGES: Edge[] = [
  { a: 'moot-gate', b: 'tithe-road' },
  { a: 'tithe-road', b: 'tallow-cross' },
  { a: 'tallow-cross', b: 'gallows-rise', terrain: 1.2 },
  { a: 'gallows-rise', b: 'cairn-pass', terrain: 1.6 },
  { a: 'cairn-pass', b: 'shrine', terrain: 1.4 },
  { a: 'shrine', b: 'cinder-hollow', terrain: 1.2 },
  { a: 'tallow-cross', b: 'hessle' },
  { a: 'hessle', b: 'wend-bridge' },
  {
    a: 'wend-bridge', b: 'reedmarsh', terrain: 1.3, requires: 'forded',
    blockedText: 'The bridge is down. You would have to ford the river.',
  },
  { a: 'reedmarsh', b: 'cinder-hollow', terrain: 1.3 },
  { a: 'cinder-hollow', b: 'slag-fields' },
  { a: 'slag-fields', b: 'anviltooth-gate' },
];

/** Walking speed with packs on a poor road, km per hour. */
export const WALK_KMH = 2.5;

export function node(id: string): RoadNode {
  const n = NODES.find((x) => x.id === id);
  if (!n) throw new Error(`unknown node ${id}`);
  return n;
}

export function neighbours(id: string): { to: RoadNode; edge: Edge }[] {
  return EDGES.filter((e) => e.a === id || e.b === id).map((edge) => ({
    to: node(edge.a === id ? edge.b : edge.a),
    edge,
  }));
}

export function legMinutes(from: RoadNode, to: RoadNode, edge: Edge): number {
  const km = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(((km / WALK_KMH) * (edge.terrain ?? 1) * 60) / 30) * 30;
}

/** Compass bearing in degrees, 0 = north, clockwise. */
export function bearing(fx: number, fy: number, tx: number, ty: number): number {
  return ((Math.atan2(tx - fx, ty - fy) * 180) / Math.PI + 360) % 360;
}

export function compassWord(deg: number): string {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][
    Math.round(deg / 45) % 8
  ];
}
