import { describe, expect, it } from 'vitest';
import { EDGES, legMinutes, node, NODES } from './content/road';
import { arrivalScene, SCENES } from './content/scenes';
import { autoResolve } from './combat';
import { camp, choose, continueOn, presentScene, riseAgain, settleCombat, stayAtInn, travel } from './game';
import {
  CAMP_HEALTH_CAP, campEncounterChance, clock, damage, drain, fight, hoursUntilMorning, passTime, roadEncounterChance, WALK_DRAIN,
} from './rules';
import { checkpoint, newGame } from './state';

describe('clock', () => {
  it('formats day and time', () => {
    expect(clock(7 * 60)).toBe('Day 1 · 07:00');
    expect(clock(24 * 60 + 90)).toBe('Day 2 · 01:30');
  });
  it('plans camp until morning', () => {
    expect(hoursUntilMorning(22 * 60)).toBe(9);
    expect(hoursUntilMorning(3 * 60)).toBe(4);
  });
});

describe('health and stamina', () => {
  it('spends stamina before health', () => {
    const m = newGame(1).party[0];
    damage(m, 35);
    expect(m.stamina).toBe(0);
    expect(m.health).toBe(35);
  });
  it('never lets exhaustion knock anyone out', () => {
    const m = newGame(1).party[0];
    drain(m, 500);
    expect(m.health).toBe(1);
  });
  it('drains stamina while walking, faster at night', () => {
    const day = newGame(1);
    passTime(day, 120, 'walk');
    const night = newGame(1);
    night.minutes = 22 * 60;
    passTime(night, 120, 'walk');
    expect(day.party[0].stamina).toBeCloseTo(30 - 2 * WALK_DRAIN);
    expect(night.party[0].stamina).toBeCloseTo(30 - 3 * WALK_DRAIN);
  });
  it('camping restores health only to 80%, the inn fully', () => {
    const a = newGame(1);
    a.party[0].health = 10;
    passTime(a, 12 * 60, 'camp', { fire: true });
    expect(a.party[0].health).toBe(a.party[0].maxHealth * CAMP_HEALTH_CAP);
    const b = newGame(1);
    b.party[0].health = 10;
    passTime(b, 12 * 60, 'inn');
    expect(b.party[0].health).toBe(b.party[0].maxHealth);
  });
});

describe('midnight upkeep', () => {
  it('eats one ration each at midnight', () => {
    const s = newGame(1);
    s.minutes = 23 * 60;
    passTime(s, 120, 'camp');
    expect(s.rations).toBe(6);
  });
  it('starves those who go without', () => {
    const s = newGame(1);
    s.rations = 1;
    s.minutes = 23 * 60;
    const lines = passTime(s, 60, 'walk');
    expect(s.rations).toBe(0);
    expect(lines.filter((l) => l.includes('hungry'))).toHaveLength(2);
  });
});

describe('encounter odds', () => {
  it('fire and night make camps more dangerous; safe ground is safe', () => {
    expect(campEncounterChance(2, 20, true, true)).toBeGreaterThan(campEncounterChance(2, 20, false, false));
    expect(roadEncounterChance(0, 90, true)).toBe(0);
  });
});

describe('combat', () => {
  it('is deterministic for a seed and resolves', () => {
    const a = newGame(42);
    const b = newGame(42);
    const ra = fight(a, { name: 'wolves', might: 5, hp: 30 });
    const rb = fight(b, { name: 'wolves', might: 5, hp: 30 });
    expect(ra).toEqual(rb);
    expect(['won', 'lost', 'withdrew']).toContain(ra.outcome);
  });
});

describe('the road', () => {
  it('every edge joins real nodes and takes time', () => {
    for (const e of EDGES) expect(legMinutes(node(e.a), node(e.b), e)).toBeGreaterThan(0);
  });
  it('every node can be reached from the Moot', () => {
    const seen = new Set(['moot-gate']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of EDGES) {
        if (seen.has(e.a) !== seen.has(e.b)) {
          seen.add(e.a);
          seen.add(e.b);
          grew = true;
        }
      }
    }
    expect(seen.size).toBe(NODES.length);
  });
  it('arrival scenes all exist', () => {
    const s = newGame(1);
    for (const n of NODES) {
      const id = arrivalScene(s, n.id);
      if (id) expect(SCENES[id]).toBeDefined();
    }
  });
});

describe('game flow', () => {
  it('travels, queues the arrival event, and plays it', () => {
    const s = newGame(7);
    s.chaos = 0;
    travel(s, 'tithe-road');
    expect(s.node).toBe('tithe-road');
    expect(s.screen).toBe('result');
    expect(s.minutes).toBeGreaterThan(7 * 60);
    while (s.queue.length && s.queue[0].startsWith('enc:')) {
      continueOn(s);
      choose(s, 0);
      if (s.screen === 'combat') {
        autoResolve(s);
        settleCombat(s);
      }
    }
    continueOn(s);
    expect(s.scene).toBe('tithe-road');
  });
  it('refuses the broken bridge until forded', () => {
    const s = newGame(3);
    s.node = 'wend-bridge';
    travel(s, 'reedmarsh');
    expect(s.node).toBe('wend-bridge');
    presentScene(s, 'wend-bridge');
    choose(s, 0);
    expect(s.flags.forded).toBe(1);
    expect(arrivalScene(s, 'wend-bridge')).toBeNull();
  });
  it('camping passes the night and can be ambushed', () => {
    let ambushed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed);
      s.node = 'cairn-pass';
      s.minutes = 21 * 60;
      camp(s, 9, true, null);
      if (s.queue.length) ambushed++;
    }
    expect(ambushed).toBeGreaterThan(0);
    expect(ambushed).toBeLessThan(40);
  });
  it('the inn sleeps until morning', () => {
    const s = newGame(2);
    s.node = 'tallow-cross';
    s.minutes = 13 * 60;
    stayAtInn(s);
    expect(clock(s.minutes)).toBe('Day 2 · 07:00');
  });
  it('rises again from the checkpoint after a defeat', () => {
    const s = newGame(5);
    checkpoint(s);
    for (const m of s.party) m.health = 0;
    continueOn(s);
    expect(s.screen).toBe('defeat');
    const r = riseAgain(s)!;
    expect(r.screen).toBe('road');
    expect(r.party.every((m) => m.health > 0)).toBe(true);
  });
});
