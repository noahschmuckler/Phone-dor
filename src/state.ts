// Game state, party roster, and persistence. Everything the game remembers
// lives in one plain JSON-able object so saves are a single localStorage write.

export type MemberId = 'oswin' | 'mael' | 'sefa';

export interface Member {
  id: MemberId;
  name: string;
  title: string;
  color: string;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  /** Fighting strength. */
  might: number;
  /** Chaos taint, 0–100. */
  taint: number;
}

export type Screen = 'title' | 'chapter' | 'road' | 'camp' | 'scene' | 'result' | 'defeat' | 'end';

export interface Result {
  title: string;
  lines: string[];
}

export interface GameState {
  v: 1;
  seed: number;
  /** Minutes since midnight of day 1. */
  minutes: number;
  node: string;
  visited: string[];
  flags: Record<string, number>;
  rations: number;
  coin: number;
  /** How far chaos has crept into the land, 0–100. */
  chaos: number;
  party: Member[];
  screen: Screen;
  /** Scene currently shown on the 'scene' screen. */
  scene?: string;
  result?: Result;
  /** Scenes waiting to play after the current result is dismissed. */
  queue: string[];
  log: string[];
  /** Serialized state at the last arrival, for "rise again" after a defeat. */
  checkpoint?: string;
}

export const START_MINUTES = 7 * 60;

export function newParty(): Member[] {
  return [
    {
      id: 'oswin', name: 'Oswin Tarrow', title: 'Warden of the Moot', color: '#9a7fb8',
      health: 40, maxHealth: 40, stamina: 30, maxStamina: 30, might: 6, taint: 0,
    },
    {
      id: 'mael', name: 'Mael Corrie', title: 'Hedge-healer', color: '#7fa65c',
      health: 28, maxHealth: 28, stamina: 24, maxStamina: 24, might: 3, taint: 0,
    },
    {
      id: 'sefa', name: 'Sefa Ninefingers', title: 'Keystone-born', color: '#c0605a',
      health: 32, maxHealth: 32, stamina: 28, maxStamina: 28, might: 4, taint: 12,
    },
  ];
}

export function newGame(seed = Date.now() >>> 0): GameState {
  return {
    v: 1,
    seed,
    minutes: START_MINUTES,
    node: 'moot-gate',
    visited: ['moot-gate'],
    flags: {},
    rations: 9,
    coin: 10,
    chaos: 20,
    party: newParty(),
    screen: 'chapter',
    queue: [],
    log: [],
  };
}

const SAVE_KEY = 'phonedor.save.v1';

export function save(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage full: the game still plays, it just won't resume.
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Snapshot the state (minus any older snapshot) for recovery after a defeat. */
export function checkpoint(s: GameState): void {
  const { checkpoint: _old, ...rest } = s;
  s.checkpoint = JSON.stringify(rest);
}

export function restoreCheckpoint(s: GameState): GameState | null {
  if (!s.checkpoint) return null;
  const restored = JSON.parse(s.checkpoint) as GameState;
  restored.checkpoint = s.checkpoint;
  return restored;
}

/** Deterministic PRNG (mulberry32) whose seed lives in the save. */
export function rand(s: { seed: number }): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function member(s: GameState, id: MemberId): Member {
  const m = s.party.find((p) => p.id === id);
  if (!m) throw new Error(`no party member ${id}`);
  return m;
}
