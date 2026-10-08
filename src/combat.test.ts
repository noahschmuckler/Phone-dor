import { describe, expect, it } from 'vitest';
import {
  alive, autoResolve, cheb, defend, endPartyPhase, engage, guard, moveTo, poultice, reach, retreat, sight, startCombat,
  strike, throwKnife,
} from './combat';
import { choose, continueOn, presentScene, settleCombat } from './game';
import { GameState, member, newGame } from './state';

const fresh = (seed = 1, foe: 'wolves' | 'brigands' | 'abomination' = 'wolves', ambush = false) => {
  const s = newGame(seed);
  startCombat(s, { foe, win: foe === 'wolves' ? 'wolves' : foe, title: 'Test', ambush });
  return s;
};
const unit = (s: GameState, id: string) => s.combat!.units.find((u) => u.id === id)!;

describe('tactical combat', () => {
  it('sets the field: party below, foes above, rocks clear of bodies', () => {
    const s = fresh();
    const c = s.combat!;
    expect(c.units.filter((u) => u.side === 'party')).toHaveLength(3);
    expect(c.units.filter((u) => u.side === 'foe')).toHaveLength(3);
    for (const u of c.units) expect(c.rocks).not.toContain(`${u.x},${u.y}`);
    expect(c.selected).toBe('mael');
  });

  it('moves only within reach, once', () => {
    const s = fresh();
    const mael = unit(s, 'mael');
    expect(moveTo(s, 'mael', mael.x, mael.y - 5)).toBe(false);
    const [k] = [...reach(s, s.combat!, mael)].find(([, n]) => n === 1)!;
    const [x, y] = k.split(',').map(Number);
    expect(moveTo(s, 'mael', x, y)).toBe(true);
    expect(moveTo(s, 'mael', mael.x, mael.y - 1)).toBe(false);
  });

  it('strikes only what is adjacent, and engage walks up to it', () => {
    const s = fresh(3);
    const wolf = unit(s, 'wolves0');
    expect(strike(s, 'sefa', wolf.id)).toBe(false);
    wolf.x = 4;
    wolf.y = 3;
    const sefa = unit(s, 'sefa');
    expect(cheb(sefa, wolf)).toBeGreaterThan(1);
    expect(engage(s, 'sefa', wolf.id)).toBe(true);
    expect(cheb(sefa, wolf)).toBe(1);
    expect(sefa.acted).toBe(true);
  });

  it('knives need sight and stock; poultices heal neighbours', () => {
    const s = fresh(4);
    const c = s.combat!;
    c.rocks = [];
    const wolf = unit(s, 'wolves0');
    wolf.x = 4;
    wolf.y = 3;
    expect(sight(c, 4, 6, 4, 3)).toBe(true);
    c.rocks = ['4,4'];
    expect(sight(c, 4, 6, 4, 3)).toBe(false);
    c.rocks = [];
    const before = wolf.hp;
    expect(throwKnife(s, 'sefa', wolf.id)).toBe(true);
    expect(c.uses.knife).toBe(2);
    expect(wolf.hp).toBeLessThanOrEqual(before);
    member(s, 'oswin').health = 10;
    expect(poultice(s, 'mael', 'oswin')).toBe(true);
    expect(member(s, 'oswin').health).toBe(18);
  });

  it('the enemy phase closes in and draws blood; guard draws attacks to Oswin', () => {
    const s = fresh(5, 'abomination');
    const c = s.combat!;
    c.rocks = [];
    const abom = unit(s, 'abomination0');
    abom.x = 3;
    abom.y = 4;
    guard(s, 'oswin');
    defend(s, 'mael');
    defend(s, 'sefa');
    expect(c.round).toBe(2);
    const oswin = member(s, 'oswin');
    expect(oswin.health + oswin.stamina).toBeLessThan(70 + 1);
    expect(cheb(abom, unit(s, 'oswin'))).toBe(1);
  });

  it('a fight always ends one way or another', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = fresh(seed, 'brigands');
      for (let r = 0; r < 40 && !s.combat!.over; r++) endPartyPhase(s);
      if (!s.combat!.over) autoResolve(s);
      expect(['won', 'lost', 'fled', 'broke']).toContain(s.combat!.over);
    }
  });

  it('ambushes let the enemy strike first', () => {
    const s = fresh(6, 'wolves', true);
    expect(s.combat!.log[0]).toMatch(/strike before/);
  });

  it('retreat can fail and costs the turn', () => {
    let fled = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh(seed);
      retreat(s);
      if (s.combat!.over === 'fled') fled++;
      else expect(s.combat!.round).toBeGreaterThanOrEqual(2);
    }
    expect(fled).toBeGreaterThan(0);
    expect(fled).toBeLessThan(30);
  });

  it('a won fight pays out through the scene registry and returns to the road', () => {
    const s = newGame(7);
    s.flags.ambush = 0;
    presentScene(s, 'enc:deserters');
    choose(s, 0);
    expect(s.screen).toBe('combat');
    for (const f of s.combat!.units) if (f.side === 'foe') f.hp = 0;
    s.combat!.over = 'won';
    const coin = s.coin;
    settleCombat(s);
    expect(s.combat).toBeUndefined();
    expect(s.screen).toBe('result');
    expect(s.coin).toBe(coin + 5);
    continueOn(s);
    expect(s.screen).toBe('road');
  });

  it('a fight in progress survives a save and reload', () => {
    const s = fresh(8);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    endPartyPhase(copy);
    expect(copy.combat!.round).toBe(2);
    expect(copy.combat!.units.filter((u) => u.side === 'party').every((u) => alive(copy, u) === u.acted ? !alive(copy, u) : true)).toBe(true);
  });
});
