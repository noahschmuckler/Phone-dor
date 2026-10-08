// Player actions. Each mutates the state and leaves it on the screen to show next.

import { bearing, compassWord, legMinutes, neighbours, node } from './content/road';
import { arrivalScene, pickEncounter, SCENES } from './content/scenes';
import {
  campEncounterChance, conscious, DAY, isNight, partyDown, passTime, roadEncounterChance,
} from './rules';
import { GameState, MemberId, checkpoint, member, newGame, rand, restoreCheckpoint } from './state';

const first = (name: string) => name.split(' ')[0];

export function fmtHours(mins: number): string {
  const h = mins / 60;
  if (h === 1) return '1 hour';
  return Number.isInteger(h) ? `${h} hours` : `${h.toFixed(1)} hours`;
}

function note(s: GameState, line: string): void {
  s.log.push(line);
  if (s.log.length > 6) s.log.splice(0, s.log.length - 6);
}

function show(s: GameState, title: string, lines: string[]): void {
  s.result = { title, lines };
  s.screen = 'result';
}

export function startChapter(seed?: number): GameState {
  return newGame(seed);
}

export function setOut(s: GameState): void {
  s.screen = 'road';
  checkpoint(s);
}

export function travel(s: GameState, toId: string): void {
  const here = node(s.node);
  const leg = neighbours(s.node).find((n) => n.to.id === toId);
  if (!leg) return;
  if (leg.edge.requires && !s.flags[leg.edge.requires]) {
    show(s, 'No way through', [leg.edge.blockedText ?? 'The way is shut.']);
    return;
  }
  checkpoint(s);
  const mins = legMinutes(here, leg.to, leg.edge);
  const night = isNight(s.minutes) || isNight(s.minutes + mins / 2);
  const dir = compassWord(bearing(here.x, here.y, leg.to.x, leg.to.y));
  const lines = [
    `You walk ${dir} for ${fmtHours(mins)}${night ? ', much of it in the dark' : ''}.`,
    ...passTime(s, mins, 'walk', { terrain: leg.edge.terrain }),
  ];
  s.node = leg.to.id;
  if (!s.visited.includes(leg.to.id)) s.visited.push(leg.to.id);

  const danger = Math.max(here.danger, leg.to.danger);
  if (rand(s) < roadEncounterChance(danger, s.chaos, night)) {
    s.flags.ambush = 0;
    s.queue.push(pickEncounter(s, danger));
    lines.push('Before you reach it, something on the road.');
  }
  const arrival = arrivalScene(s, leg.to.id);
  if (arrival) s.queue.push(arrival);
  note(s, `Walked to ${leg.to.name}.`);
  show(s, leg.to.name, lines);
}

export function camp(s: GameState, hours: number, fire: boolean, watch: MemberId | null): void {
  checkpoint(s);
  const here = node(s.node);
  const watcher = watch ? member(s, watch) : null;
  const lines = [
    `You make camp${fire ? ' and light a fire' : ' without a fire'}. ${watcher ? `${first(watcher.name)} keeps watch.` : 'No one keeps watch.'}`,
  ];
  const total = hours * 60;
  let rested = 0;
  const upkeep: string[] = [];
  let interrupted = false;
  while (rested < total) {
    const chunk = Math.min(180, total - rested);
    upkeep.push(...passTime(s, chunk, 'camp', { fire, watch }));
    rested += chunk;
    const p = here.ward ? 0 : campEncounterChance(here.danger, s.chaos, isNight(s.minutes), fire);
    if (rand(s) < p) {
      const alert = !!watcher && conscious(watcher);
      s.flags.ambush = alert ? 0 : 1;
      s.queue.push(pickEncounter(s, Math.max(1, here.danger)));
      upkeep.push(alert ? `${first(watcher!.name)} hears them coming and kicks you awake.` : 'You wake to something moving in the dark.');
      interrupted = true;
      break;
    }
  }
  lines.push(`You rest ${fmtHours(rested)}${interrupted ? ' before it ends' : ''}.`, ...upkeep);

  // Chaos works on the tainted: small greeds, in the night.
  if (!here.ward) {
    for (const m of s.party) {
      if (m.taint >= 40 && s.coin > 0 && rand(s) < m.taint / 200) {
        s.coin -= 1;
        lines.push(`In the morning the purse is lighter by a coin. ${first(m.name)} won't meet anyone's eye.`);
      }
    }
  }
  note(s, `Camped ${fmtHours(rested)} at ${here.name}.`);
  show(s, 'Camp', lines);
}

export function innCost(s: GameState): number | null {
  const price = node(s.node).inn?.price;
  return price === undefined ? null : price * s.party.length;
}

export function stayAtInn(s: GameState): void {
  const cost = innCost(s);
  if (cost === null || s.coin < cost) return;
  s.coin -= cost;
  const h = (s.minutes % DAY) / 60;
  const hours = Math.max(6, Math.round(h < 7 ? 7 - h : 31 - h));
  const lines = [`A room, a meal, a bed with only some fleas. ${cost} coin.`, ...passTime(s, hours * 60, 'inn')];
  lines.push('You wake whole.');
  note(s, `Slept at ${node(s.node).name}.`);
  show(s, 'The inn', lines);
}

export function buyRation(s: GameState): void {
  const price = node(s.node).rationPrice;
  if (price === undefined || s.coin < price) return;
  s.coin -= price;
  s.rations += 1;
}

export function lookAround(s: GameState): void {
  if (!SCENES[s.node]) return;
  presentScene(s, s.node);
}

export function presentScene(s: GameState, id: string): void {
  s.scene = id;
  s.flags[`seen:${id}`] = 1;
  s.screen = 'scene';
}

export function choose(s: GameState, index: number): void {
  const scene = s.scene ? SCENES[s.scene] : undefined;
  const choice = scene?.choices(s)[index];
  if (!choice) return;
  const r = choice.run(s);
  note(s, r.title);
  show(s, r.title, r.lines);
}

export function continueOn(s: GameState): void {
  s.result = undefined;
  if (partyDown(s)) {
    s.queue = [];
    s.screen = 'defeat';
  } else if (s.queue.length) {
    presentScene(s, s.queue.shift()!);
  } else if (s.flags.chapterDone) {
    s.screen = 'end';
  } else {
    s.screen = 'road';
  }
}

export function riseAgain(s: GameState): GameState | null {
  const r = restoreCheckpoint(s);
  if (!r) return null;
  // A fresh roll of fate, so the same road does not end the same way.
  r.seed = (r.seed ^ (Date.now() >>> 0)) | 1;
  r.queue = [];
  r.screen = 'road';
  r.result = undefined;
  note(r, 'You came to, sore and lucky.');
  return r;
}
