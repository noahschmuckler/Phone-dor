// Enemy bands for tactical combat. Each band is several bodies on the field.

export type Ai = 'pack' | 'brute' | 'coward';

export interface FoeSpec {
  name: string;
  count: number;
  hp: number;
  might: number;
  move: number;
  ai: Ai;
  glyph: string;
  verb: string;
  /** Taint added to whoever it wounds. */
  taint?: number;
}

export type FoeKind = 'wolves' | 'brigands' | 'deserters' | 'abomination' | 'cultists';

/**
 * pack   – goes for the weakest of you, and moves fast.
 * brute  – goes for the nearest.
 * coward – fights while it is winning; badly hurt, it runs for the edge.
 */
export const FOES: Record<FoeKind, FoeSpec> = {
  wolves: { name: 'Dire wolf', count: 3, hp: 10, might: 4, move: 4, ai: 'pack', glyph: 'W', verb: 'bites', taint: 1 },
  brigands: { name: 'Brigand', count: 4, hp: 7, might: 3, move: 3, ai: 'coward', glyph: 'B', verb: 'hacks at' },
  deserters: { name: 'Deserter', count: 3, hp: 11, might: 5, move: 3, ai: 'brute', glyph: 'D', verb: 'cuts' },
  abomination: { name: 'Abomination', count: 1, hp: 32, might: 7, move: 2, ai: 'brute', glyph: '✶', verb: 'lashes', taint: 6 },
  cultists: { name: 'Cultist', count: 4, hp: 8, might: 4, move: 3, ai: 'brute', glyph: 'C', verb: 'stabs' },
};
