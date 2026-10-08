// Pure rules: the clock, upkeep, rest, encounter odds and combat resolution.
// Health and stamina follow Betrayal at Krondor: stamina is spent first, then
// health; camping restores health only to 80%, an inn restores it fully.

import { GameState, Member, MemberId, rand } from './state';

export const DAY = 24 * 60;
export const WALK_DRAIN = 1.6; // stamina per hour on an ordinary road by day
export const CAMP_HEALTH_CAP = 0.8;
export const STARVE_FRACTION = 0.15;
export const CHAOS_PER_DAY = 3;

const pad = (n: number) => String(n).padStart(2, '0');

export const dayOf = (m: number) => Math.floor(m / DAY) + 1;
export const hourOf = (m: number) => Math.floor((m % DAY) / 60);
export const clock = (m: number) => `Day ${dayOf(m)} · ${pad(hourOf(m))}:${pad(Math.floor(m % 60))}`;
export const isNight = (m: number) => {
  const h = hourOf(m);
  return h < 6 || h >= 20;
};

export type Phase = 'night' | 'dawn' | 'day' | 'dusk';
export function phaseOf(m: number): Phase {
  const h = (m % DAY) / 60;
  if (h < 5 || h >= 21) return 'night';
  if (h < 8) return 'dawn';
  if (h < 18) return 'day';
  return 'dusk';
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const conscious = (m: Member) => m.health > 0;

/** Combat damage: stamina absorbs it first, then health, down to zero. */
export function damage(m: Member, n: number): void {
  const fromStamina = Math.min(m.stamina, n);
  m.stamina -= fromStamina;
  m.health = Math.max(0, m.health - (n - fromStamina));
}

/** Exhaustion: like damage, but it never knocks anyone out on its own. */
export function drain(m: Member, n: number): void {
  const fromStamina = Math.min(m.stamina, n);
  m.stamina -= fromStamina;
  const rest = n - fromStamina;
  if (rest > 0) m.health = Math.max(Math.min(m.health, 1), m.health - rest);
}

export type RestMode = 'walk' | 'camp' | 'inn';
export interface PassOpts {
  terrain?: number;
  fire?: boolean;
  watch?: MemberId | null;
}

/**
 * Advance the clock, applying travel drain or rest recovery as time passes.
 * Every midnight the party eats; returns any lines worth telling the player.
 */
export function passTime(s: GameState, minutes: number, mode: RestMode, opts: PassOpts = {}): string[] {
  const lines: string[] = [];
  let left = Math.round(minutes);
  while (left > 0) {
    const toMidnight = DAY - (s.minutes % DAY);
    const chunk = Math.min(left, 60, toMidnight);
    const f = chunk / 60;
    const night = isNight(s.minutes);
    const healer = s.party.find((p) => p.id === 'mael');
    const healerBonus = healer && conscious(healer) && opts.watch !== 'mael' ? 1 : 0;
    for (const m of s.party) {
      if (mode === 'walk') {
        if (conscious(m)) drain(m, WALK_DRAIN * (night ? 1.5 : 1) * (opts.terrain ?? 1) * f);
      } else if (mode === 'camp') {
        const cold = night && !opts.fire;
        const onWatch = opts.watch === m.id;
        m.stamina = Math.min(m.maxStamina, m.stamina + (cold ? 2 : 4) * (onWatch ? 0.5 : 1) * f);
        const cap = m.maxHealth * CAMP_HEALTH_CAP;
        if (m.health < cap) m.health = Math.min(cap, m.health + ((opts.fire ? 1.5 : 1) + healerBonus) * f);
      } else {
        m.stamina = Math.min(m.maxStamina, m.stamina + 8 * f);
        m.health = Math.min(m.maxHealth, m.health + 4 * f);
      }
    }
    s.minutes += chunk;
    left -= chunk;
    if (s.minutes % DAY === 0) lines.push(...midnight(s));
  }
  return lines;
}

/** The day turns: the land frays a little more and the party eats. */
export function midnight(s: GameState): string[] {
  s.chaos = clamp(s.chaos + CHAOS_PER_DAY, 0, 100);
  const need = s.party.length;
  if (s.rations >= need) {
    s.rations -= need;
    return [`Midnight. One ration each — ${s.rations} left.`];
  }
  const fed = s.rations;
  s.rations = 0;
  const lines: string[] = [];
  s.party.forEach((m, i) => {
    if (i < fed) return;
    const loss = Math.ceil(m.maxHealth * STARVE_FRACTION);
    m.health = m.health > 0 ? Math.max(1, m.health - loss) : 0;
    lines.push(`${m.name.split(' ')[0]} goes hungry.`);
  });
  return lines;
}

export function roadEncounterChance(danger: number, chaos: number, night: boolean): number {
  if (danger <= 0) return 0;
  return clamp(0.07 * danger + chaos / 500 + (night ? 0.15 : 0), 0, 0.85);
}

export function campEncounterChance(danger: number, chaos: number, night: boolean, fire: boolean): number {
  if (danger <= 0) return 0;
  return clamp((0.05 * danger + chaos / 700) * (fire ? 1.6 : 1) * (night ? 1.3 : 1), 0, 0.6);
}

export interface Foe {
  name: string;
  might: number;
  hp: number;
  /** Taint added to whoever it wounds. */
  taint?: number;
}

export type FightOutcome = 'won' | 'lost' | 'withdrew';

/** Resolve a fight round by round; returns the outcome and who got hurt. */
export function fight(s: GameState, foe: Foe, ambush = false): { outcome: FightOutcome; lines: string[] } {
  let hp = foe.hp;
  const hurt = new Map<MemberId, number>();
  const volley = () =>
    s.party
      .filter(conscious)
      .reduce((sum, m) => sum + m.might * (0.6 + rand(s) * 0.8) * (m.stamina > 1 ? 1 : 0.6), 0);
  const strike = (round: number) => {
    const targets = s.party.filter(conscious);
    if (!targets.length) return;
    const t = targets[Math.floor(rand(s) * targets.length)];
    const dmg = foe.might * (0.6 + rand(s) * 0.8) * (ambush && round === 1 ? 1.5 : 1);
    damage(t, dmg);
    hurt.set(t.id, (hurt.get(t.id) ?? 0) + dmg);
    if (foe.taint) t.taint = clamp(t.taint + foe.taint, 0, 100);
  };

  let outcome: FightOutcome = 'withdrew';
  rounds: for (let r = 1; r <= 12; r++) {
    const order = ambush && r === 1 ? (['foe', 'party'] as const) : (['party', 'foe'] as const);
    for (const who of order) {
      if (who === 'party') {
        hp -= volley();
        if (hp <= 0) {
          outcome = 'won';
          break rounds;
        }
      } else {
        strike(r);
        if (!s.party.some(conscious)) {
          outcome = 'lost';
          break rounds;
        }
      }
    }
  }

  const lines: string[] = [];
  for (const m of s.party) {
    const n = hurt.get(m.id);
    if (!n) continue;
    const first = m.name.split(' ')[0];
    lines.push(conscious(m) ? `${first} takes ${Math.round(n)} in wounds.` : `${first} is down.`);
    if (foe.taint && m.taint >= 50) lines.push(`Something of it stays in ${first}.`);
  }
  if (!hurt.size && outcome === 'won') lines.push('No one is hurt.');
  return { outcome, lines };
}

export const partyDown = (s: GameState) => !s.party.some(conscious);

/** Hours of rest from now until the next 07:00, clamped to a sensible camp. */
export function hoursUntilMorning(m: number): number {
  const h = (m % DAY) / 60;
  const until = h < 7 ? 7 - h : 31 - h;
  return clamp(Math.round(until), 2, 12);
}
