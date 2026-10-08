// Tactical combat on a small grid, after Betrayal at Krondor. The party acts
// first (each member moves, then acts), then every foe moves and strikes.
// Party wounds land on the real Member records, stamina first then health.

import { FOES, FoeKind } from './content/foes';
import { clamp, conscious, damage, fight } from './rules';
import { GameState, MemberId, member, rand } from './state';

export const GRID_W = 7;
export const GRID_H = 7;

export interface Unit {
  id: string;
  side: 'party' | 'foe';
  member?: MemberId;
  name: string;
  glyph: string;
  x: number;
  y: number;
  /** Foes only: party health lives on the Member. */
  hp: number;
  maxHp: number;
  might: number;
  move: number;
  ai?: 'pack' | 'brute' | 'coward';
  verb?: string;
  taint?: number;
  gone?: boolean;
  moved: boolean;
  acted: boolean;
  guard?: boolean;
  defend?: boolean;
}

export type Outcome = 'won' | 'lost' | 'fled' | 'broke';

export interface Combat {
  foe: FoeKind;
  /** Key into the win-handler registry in scenes.ts. */
  win: string;
  title: string;
  intro: string[];
  ambush: boolean;
  round: number;
  rocks: string[];
  units: Unit[];
  log: string[];
  /** Units struck in the last enemy phase, for a flash in the UI. */
  hits: string[];
  selected?: string;
  mode?: 'knife' | 'poultice';
  uses: { knife: number; poultice: number };
  /** Health + stamina per member at the start, to report wounds. */
  start: Record<string, number>;
  over?: Outcome;
}

export const KNIFE_RANGE = 4;
export const POULTICE_HEAL = 8;
const MOVES: Record<MemberId, number> = { oswin: 3, mael: 3, sefa: 4 };

const key = (x: number, y: number) => `${x},${y}`;
export const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const first = (name: string) => name.split(' ')[0];

export function alive(s: GameState, u: Unit): boolean {
  if (u.side === 'party') return conscious(member(s, u.member!));
  return !u.gone && u.hp > 0;
}

const foes = (s: GameState, c: Combat) => c.units.filter((u) => u.side === 'foe' && alive(s, u));
const allies = (s: GameState, c: Combat) => c.units.filter((u) => u.side === 'party' && alive(s, u));

function say(c: Combat, line: string): void {
  c.log.push(line);
  if (c.log.length > 12) c.log.splice(0, c.log.length - 12);
}

export function unitAt(s: GameState, c: Combat, x: number, y: number): Unit | undefined {
  return c.units.find((u) => u.x === x && u.y === y && alive(s, u));
}

const blocked = (s: GameState, c: Combat, x: number, y: number) =>
  x < 0 || y < 0 || x >= GRID_W || y >= GRID_H || c.rocks.includes(key(x, y)) || !!unitAt(s, c, x, y);

/** Tiles a unit can walk to this turn, with the steps each takes. */
export function reach(s: GameState, c: Combat, u: Unit): Map<string, number> {
  const out = new Map<string, number>([[key(u.x, u.y), 0]]);
  let frontier = [[u.x, u.y]];
  for (let step = 1; step <= u.move; step++) {
    const next: number[][] = [];
    for (const [fx, fy] of frontier) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = fx + dx;
          const ny = fy + dy;
          if (out.has(key(nx, ny)) || blocked(s, c, nx, ny)) continue;
          out.set(key(nx, ny), step);
          next.push([nx, ny]);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/** Straight-line sight between two tiles; rocks block it. */
export function sight(c: Combat, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if ((x !== x1 || y !== y1) && c.rocks.includes(key(x, y))) return false;
  }
  return true;
}

export interface StartOpts {
  foe: FoeKind;
  win: string;
  title: string;
  intro?: string[];
  ambush?: boolean;
}

export function startCombat(s: GameState, o: StartOpts): void {
  const spec = FOES[o.foe];
  const ambush = !!o.ambush;
  const units: Unit[] = [];
  const partyRow = ambush ? 3 : GRID_H - 1;
  const order: MemberId[] = ['mael', 'oswin', 'sefa'];
  order.forEach((id, i) => {
    const m = member(s, id);
    units.push({
      id, side: 'party', member: id, name: m.name, glyph: m.name[0], x: 2 + i, y: partyRow,
      hp: 0, maxHp: 0, might: m.might, move: MOVES[id], moved: false, acted: false,
    });
  });
  const xs = [3, 1, 5, 2, 4, 0, 6];
  for (let i = 0; i < spec.count; i++) {
    const y = ambush ? (i % 2 ? 5 : 1) : i < 4 ? 0 : 1;
    units.push({
      id: `${o.foe}${i}`, side: 'foe', name: spec.name, glyph: spec.glyph, x: xs[i % xs.length], y,
      hp: spec.hp, maxHp: spec.hp, might: spec.might, move: spec.move, ai: spec.ai, verb: spec.verb, taint: spec.taint,
      moved: false, acted: false,
    });
  }
  const rocks: string[] = [];
  let tries = 0;
  while (rocks.length < 5 && tries++ < 50) {
    const x = Math.floor(rand(s) * GRID_W);
    const y = 2 + Math.floor(rand(s) * 3);
    const k = key(x, y);
    if (!rocks.includes(k) && !units.some((u) => u.x === x && u.y === y)) rocks.push(k);
  }
  const start: Record<string, number> = {};
  for (const m of s.party) start[m.id] = m.health + m.stamina;

  const c: Combat = {
    foe: o.foe, win: o.win, title: o.title, intro: o.intro ?? [], ambush, round: 1, rocks, units,
    log: [], hits: [], uses: { knife: 3, poultice: 2 }, start,
  };
  s.combat = c;
  if (ambush) {
    say(c, 'They strike before you can draw.');
    foePhase(s);
  }
  if (!c.over) beginPartyPhase(s);
}

function beginPartyPhase(s: GameState): void {
  const c = s.combat!;
  for (const u of c.units) {
    if (u.side !== 'party') continue;
    u.moved = false;
    u.acted = !alive(s, u);
    u.guard = false;
    u.defend = false;
  }
  c.mode = undefined;
  c.selected = allies(s, c)[0]?.id;
}

function checkOver(s: GameState): boolean {
  const c = s.combat!;
  if (!allies(s, c).length) c.over = 'lost';
  else if (!foes(s, c).length) c.over = c.units.some((u) => u.side === 'foe' && !u.gone && u.hp <= 0) ? 'won' : 'broke';
  return !!c.over;
}

function afterAction(s: GameState, u: Unit): void {
  const c = s.combat!;
  u.acted = true;
  u.moved = true;
  c.mode = undefined;
  if (checkOver(s)) return;
  const next = allies(s, c).find((a) => !a.acted);
  if (next) c.selected = next.id;
  else endPartyPhase(s);
}

const ready = (s: GameState, uid: string): Unit | undefined => {
  const c = s.combat;
  const u = c?.units.find((x) => x.id === uid);
  return c && !c.over && u && u.side === 'party' && alive(s, u) && !u.acted ? u : undefined;
};

export function select(s: GameState, uid: string): void {
  const c = s.combat;
  if (ready(s, uid) && c) {
    c.selected = uid;
    c.mode = undefined;
  }
}

export function setMode(s: GameState, mode: 'knife' | 'poultice'): void {
  const c = s.combat;
  if (c) c.mode = c.mode === mode ? undefined : mode;
}

export function moveTo(s: GameState, uid: string, x: number, y: number): boolean {
  const u = ready(s, uid);
  if (!u || u.moved) return false;
  const steps = reach(s, s.combat!, u).get(key(x, y));
  if (steps === undefined || steps === 0) return false;
  u.x = x;
  u.y = y;
  u.moved = true;
  return true;
}

function woundFoe(s: GameState, target: Unit, dmg: number, by: string, how: string): void {
  const c = s.combat!;
  target.hp -= dmg;
  if (target.hp <= 0) say(c, `${by} ${how} the ${target.name.toLowerCase()}. It falls.`);
  else say(c, `${by} ${how} the ${target.name.toLowerCase()} (${Math.round(dmg)}).`);
}

/** Melee: adjacent foe. Sefa strikes harder at a foe someone else is engaging. */
export function strike(s: GameState, uid: string, targetId: string): boolean {
  const u = ready(s, uid);
  const c = s.combat;
  const t = c?.units.find((x) => x.id === targetId);
  if (!u || !c || !t || t.side !== 'foe' || !alive(s, t) || cheb(u, t) > 1) return false;
  const m = member(s, u.member!);
  const by = first(m.name);
  if (rand(s) < 0.85) {
    const flank = u.member === 'sefa' && allies(s, c).some((a) => a.id !== u.id && cheb(a, t) <= 1);
    const dmg = m.might * (0.7 + rand(s) * 0.6) * (m.stamina > 1 ? 1 : 0.6) * (flank ? 1.5 : 1);
    woundFoe(s, t, dmg, by, flank ? 'knifes from the flank' : 'strikes');
  } else {
    say(c, `${by} swings and misses.`);
  }
  afterAction(s, u);
  return true;
}

/** Strike a foe, walking up to it first if it is out of reach this turn. */
export function engage(s: GameState, uid: string, targetId: string): boolean {
  if (strike(s, uid, targetId)) return true;
  const u = ready(s, uid);
  const c = s.combat;
  const t = c?.units.find((x) => x.id === targetId);
  if (!u || !c || !t || u.moved) return false;
  let best: { k: string; steps: number } | null = null;
  for (const [k, steps] of reach(s, c, u)) {
    const [x, y] = k.split(',').map(Number);
    if (steps > 0 && cheb({ x, y }, t) <= 1 && (!best || steps < best.steps)) best = { k, steps };
  }
  if (!best) return false;
  const [x, y] = best.k.split(',').map(Number);
  moveTo(s, uid, x, y);
  return strike(s, uid, targetId);
}

export function canKnife(s: GameState, u: Unit, t: Unit): boolean {
  const c = s.combat!;
  return u.member === 'sefa' && c.uses.knife > 0 && t.side === 'foe' && alive(s, t) &&
    cheb(u, t) <= KNIFE_RANGE && sight(c, u.x, u.y, t.x, t.y);
}

export function throwKnife(s: GameState, uid: string, targetId: string): boolean {
  const u = ready(s, uid);
  const c = s.combat;
  const t = c?.units.find((x) => x.id === targetId);
  if (!u || !c || !t || !canKnife(s, u, t)) return false;
  c.uses.knife -= 1;
  const m = member(s, 'sefa');
  if (rand(s) < 0.8) woundFoe(s, t, m.might * (0.6 + rand(s) * 0.6), 'Sefa', 'puts a knife in');
  else say(c, 'Sefa\'s knife skips off the stones.');
  afterAction(s, u);
  return true;
}

export function poultice(s: GameState, uid: string, allyId: string): boolean {
  const u = ready(s, uid);
  const c = s.combat;
  const t = c?.units.find((x) => x.id === allyId);
  if (!u || !c || u.member !== 'mael' || c.uses.poultice <= 0 || !t || t.side !== 'party' || !alive(s, t) || cheb(u, t) > 1) {
    return false;
  }
  c.uses.poultice -= 1;
  const m = member(s, t.member!);
  m.health = Math.min(m.maxHealth, m.health + POULTICE_HEAL);
  say(c, `Mael packs ${t.id === u.id ? 'her own' : `${first(m.name)}'s`} wounds with yarrow and moss.`);
  afterAction(s, u);
  return true;
}

/** Oswin plants himself: nearby foes come at him, and he takes half. */
export function guard(s: GameState, uid: string): boolean {
  const u = ready(s, uid);
  if (!u || u.member !== 'oswin') return false;
  u.guard = true;
  say(s.combat!, 'Oswin plants his feet and calls them on.');
  afterAction(s, u);
  return true;
}

/** Brace and breathe: some stamina back, less damage taken. */
export function defend(s: GameState, uid: string): boolean {
  const u = ready(s, uid);
  if (!u) return false;
  const m = member(s, u.member!);
  m.stamina = Math.min(m.maxStamina, m.stamina + 3);
  u.defend = true;
  say(s.combat!, `${first(m.name)} braces and gets a breath back.`);
  afterAction(s, u);
  return true;
}

export function wait(s: GameState, uid: string): boolean {
  const u = ready(s, uid);
  if (!u) return false;
  afterAction(s, u);
  return true;
}

export function endPartyPhase(s: GameState): void {
  const c = s.combat;
  if (!c || c.over) return;
  foePhase(s);
  if (c.over) return;
  c.round += 1;
  beginPartyPhase(s);
}

/** Try to break away. The more of you are engaged, the harder it is. */
export function retreat(s: GameState): void {
  const c = s.combat;
  if (!c || c.over) return;
  const engaged = foes(s, c).filter((f) => allies(s, c).some((a) => cheb(a, f) <= 1)).length;
  if (rand(s) < clamp(0.75 - 0.15 * engaged, 0.15, 0.75)) {
    c.over = 'fled';
    return;
  }
  say(c, 'You try to break away. They will not let you.');
  for (const u of c.units) if (u.side === 'party') u.acted = true;
  endPartyPhase(s);
}

function chooseTarget(s: GameState, c: Combat, f: Unit): Unit | undefined {
  const targets = allies(s, c);
  if (!targets.length) return undefined;
  const warden = targets.find((t) => t.guard);
  if (warden && f.ai !== 'coward' && cheb(f, warden) <= f.move + 1) return warden;
  const near = (a: Unit, b: Unit) => cheb(f, a) - cheb(f, b);
  if (f.ai === 'pack') {
    return [...targets].sort((a, b) => member(s, a.member!).health - member(s, b.member!).health || near(a, b))[0];
  }
  return [...targets].sort(near)[0];
}

function foePhase(s: GameState): void {
  const c = s.combat!;
  c.hits = [];
  for (const f of c.units) {
    if (f.side !== 'foe' || !alive(s, f)) continue;

    if (f.ai === 'coward' && f.hp < f.maxHp * 0.4) {
      if (f.y === 0) {
        f.gone = true;
        say(c, `A ${f.name.toLowerCase()} throws down his billhook and runs.`);
        continue;
      }
      let best: [number, number] = [f.x, f.y];
      for (const k of reach(s, c, f).keys()) {
        const [x, y] = k.split(',').map(Number);
        if (y < best[1]) best = [x, y];
      }
      [f.x, f.y] = best;
      say(c, `A wounded ${f.name.toLowerCase()} backs away.`);
      continue;
    }

    const t = chooseTarget(s, c, f);
    if (!t) break;
    if (cheb(f, t) > 1) {
      let best: { x: number; y: number; d: number; steps: number } | null = null;
      for (const [k, steps] of reach(s, c, f)) {
        const [x, y] = k.split(',').map(Number);
        const d = cheb({ x, y }, t);
        if (!best || d < best.d || (d === best.d && steps < best.steps)) best = { x, y, d, steps };
      }
      if (best) {
        f.x = best.x;
        f.y = best.y;
      }
    }
    if (cheb(f, t) > 1) continue;

    const m = member(s, t.member!);
    if (rand(s) < (f.ai === 'pack' ? 0.8 : 0.75)) {
      const dmg = f.might * (0.7 + rand(s) * 0.6) * (t.defend ? 0.6 : 1) * (t.guard ? 0.5 : 1) * (c.ambush && c.round === 1 ? 1.3 : 1);
      damage(m, dmg);
      if (f.taint) m.taint = clamp(m.taint + f.taint, 0, 100);
      c.hits.push(t.id);
      say(c, conscious(m) ? `The ${f.name.toLowerCase()} ${f.verb} ${first(m.name)} (${Math.round(dmg)}).` : `The ${f.name.toLowerCase()} ${f.verb} ${first(m.name)}, who goes down.`);
    } else {
      say(c, `The ${f.name.toLowerCase()} lunges at ${first(m.name)} and misses.`);
    }
    if (checkOver(s)) return;
  }
  checkOver(s);
}

/** Let the rest of the fight play out without tactics. */
export function autoResolve(s: GameState): void {
  const c = s.combat;
  if (!c || c.over) return;
  const left = foes(s, c);
  const spec = FOES[c.foe];
  const outcome = fight(s, {
    name: spec.name.toLowerCase(),
    hp: left.reduce((t, f) => t + f.hp, 0),
    might: spec.might * (1 + 0.25 * (left.length - 1)),
    taint: spec.taint,
  }).outcome;
  c.over = outcome === 'withdrew' ? 'broke' : outcome;
}

/** Wound report: who lost what since the fight began. */
export function woundLines(s: GameState, c: Combat): string[] {
  const lines: string[] = [];
  for (const m of s.party) {
    const lost = (c.start[m.id] ?? 0) - (m.health + m.stamina);
    if (!conscious(m)) lines.push(`${first(m.name)} is down.`);
    else if (lost >= 1) lines.push(`${first(m.name)} takes ${Math.round(lost)} in wounds.`);
  }
  return lines;
}
