import { describe, expect, it } from 'vitest';
import { CHESTS, isOpen, startPositions, wheelsFor } from './content/chests';
import { node } from './content/road';
import { openChest, tryChest } from './game';
import { newGame } from './state';

describe('word-locked chests', () => {
  it('sit on real road nodes with letter-only answers', () => {
    for (const c of CHESTS) {
      expect(() => node(c.node)).not.toThrow();
      expect(c.answer).toMatch(/^[A-Z]+$/);
    }
  });

  it('every wheel carries its answer letter among distinct letters, the same every time', () => {
    for (const c of CHESTS) {
      const wheels = wheelsFor(c);
      expect(wheels).toEqual(wheelsFor(c));
      wheels.forEach((w, i) => {
        expect(w).toContain(c.answer[i]);
        expect(new Set(w).size).toBe(w.length);
      });
    }
  });

  it('starts every wheel on a wrong letter', () => {
    for (const c of CHESTS) {
      wheelsFor(c).forEach((w, i) => expect(w[startPositions(c)[i]]).not.toBe(c.answer[i]));
    }
  });

  it('holds on a wrong word and opens once on the right one', () => {
    const s = newGame(1);
    s.node = 'tithe-road';
    openChest(s, 'boundary');
    expect(s.screen).toBe('chest');
    expect(tryChest(s, 'WEST')).toBe(false);
    expect(s.flags['tries:boundary']).toBe(1);
    const rations = s.rations;
    expect(tryChest(s, 'rest')).toBe(true);
    expect(isOpen(s, 'boundary')).toBe(true);
    expect(s.rations).toBe(rations + 3);
    expect(s.screen).toBe('result');
    openChest(s, 'boundary');
    expect(s.screen).toBe('result');
  });

  it('cannot be opened from another place', () => {
    const s = newGame(1);
    openChest(s, 'niche');
    expect(s.screen).not.toBe('chest');
  });
});
