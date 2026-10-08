// Scenes: arrival events and roadside encounters. A scene shows text and a few
// choices; a choice mutates the state and returns a result card to show.

import { conscious, fight, Foe, passTime, clamp, isNight } from '../rules';
import { GameState, Result, member, rand } from '../state';

export interface Choice {
  label: string;
  hint?: string;
  run: (s: GameState) => Result;
}

export interface Scene {
  title: string;
  text: (s: GameState) => string;
  choices: (s: GameState) => Choice[];
}

const up = (s: GameState, id: 'oswin' | 'mael' | 'sefa') => conscious(member(s, id));

/** Fight a foe and wrap the outcome in a result card. */
function battle(s: GameState, foe: Foe, title: string, onWin: (s: GameState) => string[]): Result {
  const ambush = !!s.flags.ambush;
  s.flags.ambush = 0;
  const { outcome, lines } = fight(s, foe, ambush);
  if (outcome === 'won') return { title, lines: [...onWin(s), ...lines] };
  if (outcome === 'lost') return { title, lines: [...lines, 'The road goes dark.'] };
  return { title, lines: [`The ${foe.name} break off and melt into the dark. Neither side won.`, ...lines] };
}

/** Try to run. Failure means fighting with the enemy striking first. */
function flee(s: GameState, foe: Foe, onWin: (s: GameState) => string[]): Result {
  if (rand(s) < 0.55) {
    s.flags.ambush = 0;
    const lines = passTime(s, 60, 'walk', { terrain: 2 });
    return { title: 'You run', lines: ['You scatter, regroup a mile on, and walk the rest with your hearts going.', ...lines] };
  }
  s.flags.ambush = 1;
  const r = battle(s, foe, 'Cornered', onWin);
  r.lines.unshift('They are faster than you.');
  return r;
}

const ambushLine = (s: GameState) =>
  s.flags.ambush ? 'No one was watching. They are already among you. ' : '';

// --- Roadside encounters -------------------------------------------------

const WOLVES: Foe = { name: 'dire wolves', might: 5, hp: 30, taint: 2 };
const BRIGANDS: Foe = { name: 'brigands', might: 4, hp: 24 };
const DESERTERS: Foe = { name: 'deserters', might: 6, hp: 30 };
const ABOMINATION: Foe = { name: 'abomination', might: 7, hp: 34, taint: 7 };

export const ENCOUNTERS = ['enc:wolves', 'enc:brigands', 'enc:deserters', 'enc:abomination'] as const;

/** Pick a roadside encounter suited to the ground and the hour. */
export function pickEncounter(s: GameState, danger: number): string {
  const night = isNight(s.minutes);
  const pool: [string, number][] = [
    ['enc:brigands', 3],
    ['enc:deserters', s.visited.includes('hessle') || danger >= 2 ? 2 : 0.5],
    ['enc:wolves', (danger >= 2 ? 3 : 1) + (night ? 2 : 0)],
    ['enc:abomination', danger >= 2 && s.chaos >= 26 ? 1.5 : 0],
  ];
  const total = pool.reduce((t, [, w]) => t + w, 0);
  let roll = rand(s) * total;
  for (const [id, w] of pool) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return 'enc:brigands';
}

export const SCENES: Record<string, Scene> = {
  'enc:wolves': {
    title: 'Dire wolves',
    text: (s) =>
      `${ambushLine(s)}Wolves, too big and too quiet, eyes like coals in a banked fire. The grandmothers say the Eight drove them into the deep places. They are not in the deep places now.`,
    choices: (s) => [
      { label: 'Fight', run: (st) => battle(st, WOLVES, 'The wolves', () => ['The last of them limps off into the scrub, smoking where it bled.']) },
      ...(s.rations >= 1
        ? [{
            label: 'Throw them a ration and back away',
            hint: '−1 ration',
            run: (st: GameState): Result => {
              st.rations -= 1;
              if (rand(st) < 0.7) return { title: 'The wolves', lines: ['They fall on the food. You do not run, and you do not look back.'] };
              return battle(st, WOLVES, 'The wolves', () => ['They wanted more than bread. They got steel instead.']);
            },
          }]
        : []),
      { label: 'Run', run: (st) => flee(st, WOLVES, () => ['You stand and drive them off.']) },
    ],
  },

  'enc:brigands': {
    title: 'Brigands',
    text: (s) =>
      `${ambushLine(s)}Four men step out with billhooks. Thin. One still has a farmer's sunburn. "Your food," says the oldest. "Not your lives. We're not monsters. Not yet."`,
    choices: (s) => [
      {
        label: 'Fight',
        run: (st) => battle(st, BRIGANDS, 'The brigands', (x) => {
          x.coin += 2;
          return ['They break and run. One drops a purse with two coins in it, all he had.'];
        }),
      },
      ...(s.rations >= 2
        ? [{
            label: 'Give them two rations',
            hint: '−2 rations',
            run: (st: GameState): Result => {
              st.rations -= 2;
              st.flags.mercy = (st.flags.mercy ?? 0) + 1;
              return { title: 'The brigands', lines: ['The oldest takes the food without meeting your eyes. "Tithe-men took our seed corn," he says, to no one. They go.'] };
            },
          }]
        : []),
      ...(up(s, 'sefa')
        ? [{
            label: 'Let Sefa talk',
            hint: 'Keystone patter',
            run: (st: GameState): Result => {
              if (rand(st) < 0.6) {
                return { title: 'The brigands', lines: ['Sefa talks fast and low: the warden is Moot law, the healer is plague-touched, the purse is already spoken for by a Keystone house that collects. The billhooks drop. The men go.'] };
              }
              const r = battle(st, BRIGANDS, 'The brigands', () => ['They come on anyway, and lose.']);
              r.lines.unshift('"Keystone tongue," the oldest spits. "Gut that one first."');
              return r;
            },
          }]
        : []),
      { label: 'Run', run: (st) => flee(st, BRIGANDS, () => ['You turn on them and they scatter.']) },
    ],
  },

  'enc:deserters': {
    title: 'Deserters',
    text: (s) =>
      `${ambushLine(s)}Five soldiers in Anviltooth grey, guild marks scraped off their breastplates. "Turn back," says their sergeant. "The Masters sealed the deep halls forty days ago. They're making something down there, and it isn't for us."`,
    choices: (s) => [
      {
        label: 'Fight',
        run: (st) => battle(st, DESERTERS, 'The deserters', (x) => {
          x.coin += 5;
          x.rations += 1;
          return ['The sergeant goes down and the rest throw their swords in the ditch. You take their purse and a ration.'];
        }),
      },
      {
        label: 'Share the road and news',
        run: (st) => {
          st.flags.desertersTalked = 1;
          return {
            title: 'The deserters',
            lines: [
              'You share a fire. They talk the way frightened men do, all at once.',
              '"The Smith\'s old forge started speaking. In the deep. The Masters went down to listen and came back with gold in their teeth."',
              'By morning they are gone west, toward the Moot, where you could have told them no one will help.',
            ],
          };
        },
      },
      ...(s.coin >= 4
        ? [{
            label: 'Pay them to move on',
            hint: '−4 coin',
            run: (st: GameState): Result => {
              st.coin -= 4;
              return { title: 'The deserters', lines: ['Coin changes hands. Nobody pretends it is anything but what it is.'] };
            },
          }]
        : []),
    ],
  },

  'enc:abomination': {
    title: 'Abomination',
    text: (s) =>
      `${ambushLine(s)}It was a stag. It still has a stag's antlers, among other things. Where it walks, the grass grows the wrong way.`,
    choices: () => [
      { label: 'Fight', run: (st) => battle(st, ABOMINATION, 'The abomination', () => ['It comes apart into something like smoke and something like mud. Mael will not let anyone touch the remains.']) },
      { label: 'Run', run: (st) => flee(st, ABOMINATION, () => ['You kill it. You wish you had run faster.']) },
    ],
  },

  // --- Arrival events ----------------------------------------------------

  'tithe-road': {
    title: 'The boundary stone',
    text: () =>
      'An old man leans on a hoe by the stone. "Grandmother kept the stone\'s rule," he says. "My father kept it. The steward says it\'s peasant superstition, and the Moot wants wheat."',
    choices: (s) => [
      ...(s.rations >= 1
        ? [{
            label: 'Give him a ration',
            hint: '−1 ration',
            run: (st: GameState): Result => {
              st.rations -= 1;
              st.flags.mercy = (st.flags.mercy ?? 0) + 1;
              return {
                title: 'The boundary stone',
                lines: ['He takes it in both hands. "The iron carts from Anviltooth used to pass here weekly," he says. "Not one this season. Not one."'],
              };
            },
          }]
        : []),
      {
        label: 'Ask about the road east',
        run: () => ({
          title: 'The boundary stone',
          lines: [
            '"High road\'s quicker, over the pass. Wolves came back up there last winter. Wolves with fire in them."',
            '"Low road\'s longer, by the river, and the Wend bridge... well. You\'ll see."',
          ],
        }),
      },
      { label: 'Walk on', run: () => ({ title: 'The boundary stone', lines: ['He goes back to hoeing the wheat that will not grow.'] }) },
    ],
  },

  'tallow-cross': {
    title: 'By the fire',
    text: () =>
      'The only warm thing in the common room is an old woman wrapped in three shawls by the hearth. "Sit," she says. "Nobody sits with me any more. They think I\'m telling stories."',
    choices: () => [
      {
        label: 'Sit and listen',
        run: (st) => {
          st.flags.heardHulda = 1;
          return {
            title: 'Grandmother Brannagh',
            lines: [
              '"I was six. The rye had the black rot, every stalk. And out of the old oak by the mill stepped a woman with leaves in her hair. Hulda. Hulda herself."',
              '"She put her hands in the dirt and the rye stood up green. Then she sat with my father three days and taught him the rotation. Wheat, beans, rest."',
              '"That winter the wolves came. Not wolves. Fire in their eyes. And a man in shining armour walked out of the snow beside her: the Smith. Vrak. They stood in our door all night."',
              'She looks at you a long while. "The drovers say the wolves are back, up on the pass. If the Eight are sleeping, child, who stands in the door now?"',
            ],
          };
        },
      },
      { label: 'Leave her be', run: () => ({ title: 'By the fire', lines: ['She goes on talking, to the fire.'] }) },
    ],
  },

  hessle: {
    title: 'The speaking-box',
    text: () =>
      'The brass cabinet is green with age. A crank on its side, a horn on its front, and a plate: MADE AT DYNAMO BY THE HAND OF D. — the rest worn away by thumbs.',
    choices: (s) => [
      ...(up(s, 'sefa')
        ? [{
            label: 'Let Sefa work the crank',
            run: (st: GameState): Result => {
              st.flags.heardBox = 1;
              return {
                title: 'The speaking-box',
                lines: [
                  'Sefa finds the catch the children never found and winds until the spring sings. The horn hisses like surf.',
                  'Then, very faint: "—Lower Gate, Anviltooth... anyone on the line... the Masters have sealed the— they\'ve stopped feeding the— please—"',
                  'The spring runs down. No amount of winding brings the voice back.',
                ],
              };
            },
          }]
        : []),
      {
        label: 'Ask the reeve about it',
        run: () => ({
          title: 'The reeve',
          lines: [
            '"Delvin left it. The Artificer himself, come down out of the clouds in a ship, in my great-grandfather\'s day."',
            '"When the coughing sickness came, a doctor spoke to us through it from across the world. Taught by Anatol, he said. We boiled what he told us to boil, and we lived."',
            '"Nobody knows how to wind it proper now. Children play with it."',
          ],
        }),
      },
      { label: 'Move on', run: () => ({ title: 'Hessle', lines: ['The children go back to daring each other.'] }) },
    ],
  },

  'wend-bridge': {
    title: 'The broken bridge',
    text: () =>
      'The river runs fast and brown through the gap where the span was. Upstream the water spreads over a gravel bar. It might be fordable. It might not.',
    choices: () => [
      {
        label: 'Ford the river',
        hint: 'about 2 hours, cold, risky',
        run: (st) => {
          st.flags.forded = 1;
          const lines = ['You strip to the waist, hold the packs high, and go in.'];
          lines.push(...passTime(st, 120, 'walk', { terrain: 2.5 }));
          if (rand(st) < 0.4 && st.rations > 0) {
            const lost = Math.min(2, st.rations);
            st.rations -= lost;
            lines.push(`The current takes a pack. ${lost} ration${lost > 1 ? 's' : ''} gone.`);
          } else {
            lines.push('You come out on the far side blue with cold, everything you own still with you.');
          }
          return { title: 'The ford', lines };
        },
      },
      { label: 'Not yet', run: () => ({ title: 'The broken bridge', lines: ['You stand at the edge of the broken span a while, then turn away.'] }) },
    ],
  },

  reedmarsh: {
    title: 'Something in the reeds',
    text: () =>
      'Halfway along the causeway the reeds part. Something heaves up out of the water. It was a heron once. Or several.',
    choices: () => [
      { label: 'Fight', run: (st) => battle(st, ABOMINATION, 'The abomination', () => ['It sinks back into the black water. The reeds close over it. Mael checks everyone\'s cuts twice.']) },
      { label: 'Run for the far end', run: (st) => flee(st, ABOMINATION, () => ['It catches you at the end of the causeway, and you kill it there.']) },
    ],
  },

  'gallows-rise': {
    title: 'The gibbet',
    text: (s) =>
      up(s, 'sefa')
        ? 'Two of the boards bear the same mark: a keyhole pierced by a coin. Sefa looks at it a long moment. "Keystone guild mark. These weren\'t thieves. Thieves don\'t get hanged. They get hired."'
        : 'Two of the boards bear the same mark: a keyhole pierced by a coin.',
    choices: () => [
      {
        label: 'Cut them down and bury them',
        hint: 'about 1 hour',
        run: (st) => {
          st.flags.buried = 1;
          st.flags.mercy = (st.flags.mercy ?? 0) + 1;
          const lines = passTime(st, 60, 'walk', { terrain: 1.5 });
          return { title: 'The gibbet', lines: ['The ground is hard. You do it anyway. Sefa says the names of the two marked men, which means Sefa knew them.', ...lines] };
        },
      },
      {
        label: 'Search the cages',
        run: (st) => {
          st.coin += 3;
          return { title: 'The gibbet', lines: ['Three coins sewn into a hem. Oswin says nothing, which is worse than saying something.'] };
        },
      },
      { label: 'Walk on', run: () => ({ title: 'The gibbet', lines: ['The cages creak behind you for a long way.'] }) },
    ],
  },

  shrine: {
    title: 'The wayshrine',
    text: () =>
      'Eight niches in a ring of standing stones. Seven hold worn stone figures, thumb-polished. The eighth niche is empty, and the stone around it has been chiselled smooth, as if someone wanted it forgotten.',
    choices: (s) => [
      ...(!s.flags.prayed
        ? [{
            label: 'Pray at the shrine',
            run: (st: GameState): Result => {
              st.flags.prayed = 1;
              for (const m of st.party) m.taint = clamp(m.taint - 10, 0, 100);
              return {
                title: 'The wayshrine',
                lines: [
                  'The light from the three towers seems to lean toward the stones.',
                  'For a moment each of you remembers something that never happened to you: a woman with leaves in her hair, laughing at a man in armour who has fallen in a river.',
                  'Whatever chaos clung to you on the road loosens its grip.',
                ],
              };
            },
          }]
        : []),
      { label: 'Look at the empty niche', run: () => ({ title: 'The empty niche', lines: ['Under the chisel-marks, if you tilt your head, the ghost of a letter: an A.', 'You do not know why that makes the back of your neck go cold.'] }) },
      { label: 'Leave', run: () => ({ title: 'The wayshrine', lines: ['The shrine is warded. Whatever walks the pass does not come up here. A good place to sleep.'] }) },
    ],
  },

  'cinder-hollow': {
    title: 'The wagon',
    text: () =>
      'Down the track, a wagon under guard: six men in rust-red hoods. In the bed, chapel silver, a bell, candlesticks, coin in sacks. One of them is singing to the hills: "Wake, old ones, wake and see / what we have saved for thee..."',
    choices: (s) => [
      {
        label: 'Fall on them',
        run: (st) => battle(st, { name: 'cultists', might: 5, hp: 30 }, 'The dragon cult', (x) => {
          x.coin += 12;
          x.chaos = clamp(x.chaos - 5, 0, 100);
          x.flags.struckCult = 1;
          return [
            'The last of them dies shouting: "When the old ones rise, they\'ll remember who fed them!"',
            'You take what coin you can carry. The silver you leave. It belongs to a chapel somewhere that no longer has a roof.',
          ];
        }),
      },
      ...(up(s, 'sefa')
        ? [{
            label: 'Let Sefa lighten the wagon after dark',
            run: (st: GameState): Result => {
              if (rand(st) < 0.6) {
                st.coin += 8;
                st.flags.robbedCult = 1;
                return { title: 'The dragon cult', lines: ['Sefa comes back before moonset with eight coins and a cultist\'s red hood, and will not say what happened to the cultist.'] };
              }
              const r = battle(st, { name: 'cultists', might: 5, hp: 30 }, 'The dragon cult', (x) => {
                x.coin += 6;
                return ['Steel in the dark, and then quiet.'];
              });
              r.lines.unshift('A shout. Torches. So much for quiet.');
              return r;
            },
          }]
        : []),
      {
        label: 'Let them pass',
        run: (st) => {
          st.chaos = clamp(st.chaos + 5, 0, 100);
          return { title: 'The dragon cult', lines: ['The wagon creaks off into the hills. The song carries a long way. It sounds like it is being answered.'] };
        },
      },
    ],
  },

  'slag-fields': {
    title: 'The smith-monk',
    text: () =>
      'A man in a scorched leather apron sits on the slag, grey with ash, working a whetstone over a blade that is already sharp. Anviltooth\'s guild-sign is branded into his forearm.',
    choices: (s) => [
      ...(s.rations >= 1
        ? [{
            label: 'Give him a ration',
            hint: '−1 ration',
            run: (st: GameState): Result => {
              st.rations -= 1;
              st.flags.mercy = (st.flags.mercy ?? 0) + 1;
              st.flags.monkTalked = 1;
              return {
                title: 'The smith-monk',
                lines: [
                  'He eats like a man who forgot food existed.',
                  '"Vrak\'s own forge is in the deep halls. Cold for eighty years. Then this spring it lit by itself, and it spoke. The Masters went down and they don\'t come up."',
                  '"They\'re melting everything. Pans. Tithe-iron. The bells. Pouring it into something they call the hoard." He laughs, and it is not a good laugh. "A hoard. For whom?"',
                ],
              };
            },
          }]
        : []),
      {
        label: 'Ask what happened here',
        run: () => ({ title: 'The smith-monk', lines: ['"The Masters sealed the gate," he says. "I was on the wrong side of it." He goes back to the whetstone and will not say more.'] }),
      },
      { label: 'Walk on', run: () => ({ title: 'The Slag Fields', lines: ['Behind you, the whetstone. Scrape. Scrape.'] }) },
    ],
  },

  'anviltooth-gate': {
    title: 'The Lower Gate',
    text: () => 'A bell-pull of black chain hangs by the doors, its handle worn bright by centuries of hands.',
    choices: () => [
      {
        label: 'Ring the gate-bell',
        run: (st) => {
          st.flags.chapterDone = 1;
          return {
            title: 'The Lower Gate',
            lines: [
              'You pull. The sound goes into the karst and does not come back.',
              'Then, high above, a shutter opens. A face in a smith\'s mask looks down at you for a long time.',
              'The shutter closes. The gate stays shut. Somewhere deep in the mountain, very faint, something enormous turns over in its sleep.',
            ],
          };
        },
      },
    ],
  },
};

/** Arrival events that fire once (or until resolved) when the party arrives. */
export function arrivalScene(s: GameState, nodeId: string): string | null {
  if (!SCENES[nodeId]) return null;
  if (nodeId === 'wend-bridge') return s.flags.forded ? null : nodeId;
  if (nodeId === 'anviltooth-gate') return nodeId;
  return s.flags[`seen:${nodeId}`] ? null : nodeId;
}
