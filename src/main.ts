import './style.css';
import { bearing, compassWord, EDGES, KARSTS, legMinutes, neighbours, node, NODES } from './content/road';
import { CHESTS, chestAt, chestById, isOpen, startPositions, wheelsFor } from './content/chests';
import { SCENES } from './content/scenes';
import {
  buyRation, camp, choose, continueOn, fmtHours, innCost, leaveChest, lookAround, openChest, riseAgain, setOut, startChapter,
  stayAtInn, travel, tryChest,
} from './game';
import { clock, conscious, hoursUntilMorning, isNight } from './rules';
import { drawSky } from './sky';
import { GameState, MemberId, clearSave, load, save } from './state';

const app = document.getElementById('app')!;
const sky = document.getElementById('sky-canvas') as HTMLCanvasElement;
const clockEl = document.getElementById('clock')!;

let S: GameState | null = load();
let titleScreen = true;
let showMap = false;
const campUi = { hours: 8, fire: true, watch: 'oswin' as MemberId | null };
const chestUi = { pos: [] as number[], msg: '', shake: false };

const TITLE_SKY: GameState = { ...startChapter(1), minutes: 19 * 60 + 40, node: 'shrine' };

const MAP_NAMES: Record<string, string> = {
  'moot-gate': 'Ledger Gate', 'tithe-road': 'Tithe Fields', shrine: 'Shrine', 'anviltooth-gate': 'Anviltooth',
  'wend-bridge': 'Wend Bridge', 'slag-fields': 'Slag Fields',
};
const MAP_LABEL_BELOW = new Set(['moot-gate', 'tallow-cross', 'shrine', 'hessle', 'wend-bridge', 'reedmarsh', 'cinder-hollow', 'slag-fields']);

const REVISIT = new Set(['shrine', 'hessle', 'anviltooth-gate', 'wend-bridge']);

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const first = (name: string) => name.split(' ')[0];

function chaosWord(c: number): string {
  if (c < 25) return 'uneasy';
  if (c < 40) return 'fraying';
  if (c < 60) return 'feverish';
  return 'unravelling';
}

function bar(cls: string, v: number, max: number): string {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return `<div class="bar ${cls}"><i style="width:${pct}%"></i><span>${Math.round(v)}</span></div>`;
}

function partyHtml(s: GameState): string {
  return `<div class="party">${s.party
    .map(
      (m) => `<div class="member ${conscious(m) ? '' : 'down'}" style="--mc:${m.color}">
        <div class="mname">${esc(first(m.name))}</div>
        <div class="mtitle">${esc(m.title)}</div>
        ${bar('hp', m.health, m.maxHealth)}
        ${bar('st', m.stamina, m.maxStamina)}
        <div class="mfoot">${conscious(m) ? (m.stamina < 1 ? '<b>exhausted</b> ' : '') : '<b>down</b> '}${m.taint > 0 ? `<span class="taint" title="Chaos taint">taint ${Math.round(m.taint)}</span>` : ''}</div>
      </div>`,
    )
    .join('')}</div>`;
}

function suppliesHtml(s: GameState): string {
  return `<div class="supplies">
    <span><b>${s.rations}</b> rations</span>
    <span><b>${s.coin}</b> coin</span>
    <span>The land is <b class="chaos">${chaosWord(s.chaos)}</b></span>
  </div>`;
}

function btn(act: string, label: string, sub = '', arg = '', disabled = false): string {
  return `<button class="act" data-act="${act}" data-arg="${esc(arg)}" ${disabled ? 'disabled' : ''}>
    <span class="label">${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
}

function roadHtml(s: GameState): string {
  const here = node(s.node);
  const roads = neighbours(s.node)
    .map(({ to, edge }) => {
      const mins = legMinutes(here, to, edge);
      const dir = compassWord(bearing(here.x, here.y, to.x, to.y));
      const blocked = edge.requires && !s.flags[edge.requires];
      const sub = blocked ? 'the bridge is down' : `${dir} · ${fmtHours(mins)}${(edge.terrain ?? 1) > 1.3 ? ' · rough' : ''}`;
      return btn('travel', `→ ${esc(to.name)}`, sub, to.id);
    })
    .join('');
  const inn = innCost(s);
  const price = here.rationPrice;
  const here_ = [
    btn('camp-open', 'Make camp', here.ward ? 'warded ground' : 'rest, watch, fire'),
    inn !== null ? btn('inn', 'Take rooms at the inn', `${inn} coin · until morning`, '', s.coin < inn) : '',
    price !== undefined ? btn('buy', 'Buy a ration', `${price} coin`, '', s.coin < price) : '',
    ...chestAt(s.node).filter((c) => !isOpen(s, c.id)).map((c) => btn('chest', 'A word-locked chest', `${c.answer.length} wheels`, c.id)),
    SCENES[s.node] && REVISIT.has(s.node) ? btn('look', 'Look around') : '',
    btn('map', 'Map'),
  ].join('');
  const nightNote = isNight(s.minutes) ? '<p class="warn">It is dark. Roads are worse at night, and walking tires you faster.</p>' : '';
  return `
    <section class="place">
      <h1>${esc(here.name)}</h1>
      <p class="desc">${esc(here.desc)}</p>
      ${isNight(s.minutes) && here.night ? `<p class="desc night">${esc(here.night)}</p>` : ''}
    </section>
    ${partyHtml(s)}
    ${suppliesHtml(s)}
    ${nightNote}
    <h2>Roads</h2><div class="actions">${roads}</div>
    <h2>Here</h2><div class="actions">${here_}</div>
    ${s.log.length ? `<div class="log">${s.log.slice(-3).map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : ''}
  `;
}

function campHtml(s: GameState): string {
  const here = node(s.node);
  const watchers: (MemberId | null)[] = [null, ...s.party.filter(conscious).map((m) => m.id)];
  if (campUi.watch && !watchers.includes(campUi.watch)) campUi.watch = null;
  return `
    <section class="place"><h1>Make camp</h1>
      <p class="desc">${here.ward ? 'The shrine-stones are warm. Nothing will trouble you here.' : 'A fire keeps you warm and mends you faster, but it can be seen for miles. Whoever keeps watch rests less, but no one is caught asleep.'}</p>
    </section>
    ${partyHtml(s)}
    <h2>Hours of rest</h2>
    <div class="stepper">
      <button class="act small" data-act="hours" data-arg="-1">−</button>
      <div class="val">${campUi.hours}h <span class="sub">until ${clock(s.minutes + campUi.hours * 60).split('· ')[1]}</span></div>
      <button class="act small" data-act="hours" data-arg="1">+</button>
    </div>
    <h2>Fire</h2>
    <div class="chips">
      <button class="chip ${campUi.fire ? 'on' : ''}" data-act="fire" data-arg="1">Light a fire</button>
      <button class="chip ${!campUi.fire ? 'on' : ''}" data-act="fire" data-arg="0">Cold camp</button>
    </div>
    <h2>Watch</h2>
    <div class="chips">${watchers
      .map((w) => `<button class="chip ${campUi.watch === w ? 'on' : ''}" data-act="watch" data-arg="${w ?? ''}">${w ? esc(first(s.party.find((m) => m.id === w)!.name)) : 'No watch'}</button>`)
      .join('')}</div>
    <div class="actions">
      ${btn('camp', 'Sleep', `${campUi.hours} hours`)}
      ${btn('back', 'Not yet')}
    </div>`;
}

function chestHtml(s: GameState): string {
  const chest = s.chest ? chestById(s.chest) : undefined;
  if (!chest) return '';
  const wheels = wheelsFor(chest);
  if (chestUi.pos.length !== wheels.length) chestUi.pos = startPositions(chest);
  const n = (w: string[], i: number) => w[((i % w.length) + w.length) % w.length];
  const tries = s.flags[`tries:${chest.id}`] ?? 0;
  return `
    <section class="place scene"><h1>A word-locked chest</h1><p class="desc">${esc(chest.desc)}</p></section>
    <div class="riddle">${chest.riddle.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
    <div class="wheels ${chestUi.shake ? 'shake' : ''}">${wheels
      .map((w, i) => {
        const p = chestUi.pos[i];
        return `<div class="wheel" data-wheel="${i}">
          <button class="spin" data-act="wheel" data-arg="${i}:-1" aria-label="previous letter">▲</button>
          <div class="drum"><span class="ghost">${n(w, p - 1)}</span><b>${n(w, p)}</b><span class="ghost">${n(w, p + 1)}</span></div>
          <button class="spin" data-act="wheel" data-arg="${i}:1" aria-label="next letter">▼</button>
        </div>`;
      })
      .join('')}</div>
    <p class="lockmsg">${esc(chestUi.msg) || (tries ? `${tries} wrong ${tries === 1 ? 'try' : 'tries'}. The lock does not mind. It has time.` : 'Swipe or tap the wheels to spell the answer.')}</p>
    <div class="actions">
      ${btn('try', 'Try the lock')}
      ${btn('leave-chest', 'Leave it for now')}
    </div>`;
}

function sceneHtml(s: GameState): string {
  const scene = s.scene ? SCENES[s.scene] : undefined;
  if (!scene) return '';
  const choices = scene.choices(s);
  return `
    <section class="place scene"><h1>${esc(scene.title)}</h1><p class="desc">${esc(scene.text(s))}</p></section>
    ${partyHtml(s)}
    <div class="actions">${choices.map((c, i) => btn('choose', esc(c.label), c.hint ? esc(c.hint) : '', String(i))).join('')}</div>`;
}

function resultHtml(s: GameState): string {
  const r = s.result!;
  return `
    <section class="place result"><h1>${esc(r.title)}</h1>${r.lines.map((l) => `<p class="desc">${esc(l)}</p>`).join('')}</section>
    ${partyHtml(s)}
    ${suppliesHtml(s)}
    <div class="actions">${btn('continue', 'Continue')}</div>`;
}

function chapterHtml(): string {
  return `
    <section class="card">
      <div class="eyebrow">Chapter One</div>
      <h1 class="title">The Anvil Road</h1>
      <div class="dispatch">
        <p>To the Warden Oswin Tarrow, and those who walk with him —</p>
        <p>The iron tithe of Anviltooth is forty days late. Their letters have stopped. Of the three couriers sent east along the Anvil Road, none has returned.</p>
        <p>Walk the road. Learn why the forges went quiet. Come back with the truth.</p>
        <p class="sig">Entered in the Ledger by Ysolde Marrow, Clerk of the Third Ledger, the Moot.<br>In the eighty-third year of the Long Sleep.</p>
      </div>
      <p class="note">With you: Mael Corrie, a hedge-healer who learned her craft from Emberflask books, and Sefa Ninefingers, born under the Keystone. The Moot does not trust Sefa. The Moot does not need to.</p>
      <p class="note">Each of you eats a ration every midnight. Rations are cheap at the Ledger Gate and dear everywhere east of it.</p>
      <div class="actions">${btn('setout', 'Set out')}</div>
    </section>`;
}

function titleHtml(): string {
  const saved = load();
  return `
    <section class="card titlecard">
      <div class="eyebrow">In the long sleep of the Eight</div>
      <h1 class="title big">Phone-dor</h1>
      <p class="note">The heroes sleep in their karsts. The land frays. Someone has to walk the roads.</p>
      <div class="actions">
        ${saved ? btn('resume', 'Continue', `${esc(node(saved.node).name)} · ${clock(saved.minutes)}`) : ''}
        ${btn('new', saved ? 'Begin again' : 'Begin', saved ? 'erases the journey so far' : '')}
      </div>
    </section>`;
}

function defeatHtml(s: GameState): string {
  let where = '';
  try {
    where = s.checkpoint ? node((JSON.parse(s.checkpoint) as GameState).node).name : '';
  } catch {
    where = '';
  }
  return `
    <section class="card">
      <div class="eyebrow">The road goes dark</div>
      <h1 class="title">The party falls</h1>
      <p class="note">No song will be made of it. The Ledger will record you as late, then as missing.</p>
      <div class="actions">
        ${where ? btn('rise', 'Rise again', `at ${esc(where)}`) : ''}
        ${btn('new', 'Begin again')}
      </div>
    </section>`;
}

function endHtml(s: GameState): string {
  const learned = [
    s.flags.heardHulda && 'Grandmother Brannagh\'s tale of Hulda, Vrak and the wolves',
    s.flags.heardBox && 'a voice from Anviltooth on Delvin\'s speaking-box',
    s.flags.desertersTalked && 'deserters\' talk of the Smith\'s forge speaking in the deep',
    s.flags.monkTalked && 'a smith-monk\'s word: the Masters are building a hoard',
    s.flags.struckCult && 'that the dragon cult bleeds like anyone',
  ].filter(Boolean) as string[];
  return `
    <section class="card">
      <div class="eyebrow">End of Chapter One</div>
      <h1 class="title">The gate stays shut</h1>
      <p class="note">You reached Anviltooth on ${clock(s.minutes)}, with ${s.rations} rations and ${s.coin} coin. The land is ${chaosWord(s.chaos)}.</p>
      ${learned.length ? `<h2>What you carry back to the Ledger</h2><ul class="learned">${learned.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="note">You learned little on the road. Perhaps you walked it too fast.</p>'}
      ${(s.flags.mercy ?? 0) > 0 ? `<p class="note">You were kind ${s.flags.mercy} time${s.flags.mercy > 1 ? 's' : ''}. In a fraying land, someone will remember.</p>` : ''}
      <p class="note">Word-locked chests opened: ${CHESTS.filter((c) => isOpen(s, c.id)).length} of ${CHESTS.length}.</p>
      <p class="note">Chapter Two is not yet written.</p>
      <div class="actions">${btn('new', 'Walk it again')}</div>
    </section>`;
}

function mapHtml(s: GameState): string {
  const xs = NODES.map((n) => n.x);
  const ys = NODES.map((n) => n.y);
  const minX = Math.min(...xs) - 6;
  const maxX = Math.max(...xs) + 6;
  const minY = Math.min(...ys) - 8;
  const maxY = Math.max(...ys) + 8;
  const W = maxX - minX;
  const H = maxY - minY;
  const px = (x: number) => x - minX;
  const py = (y: number) => maxY - y;
  const edges = EDGES.map((e) => {
    const a = node(e.a);
    const b = node(e.b);
    const blocked = e.requires && !s.flags[e.requires];
    return `<line x1="${px(a.x)}" y1="${py(a.y)}" x2="${px(b.x)}" y2="${py(b.y)}" class="${blocked ? 'blocked' : ''} ${(e.terrain ?? 1) > 1.3 ? 'rough' : ''}"/>`;
  }).join('');
  const nodes = NODES.map((n) => {
    const seen = s.visited.includes(n.id);
    const cur = n.id === s.node;
    return `<g class="${cur ? 'cur' : ''} ${seen ? 'seen' : ''}">
      <circle cx="${px(n.x)}" cy="${py(n.y)}" r="${cur ? 1.5 : 1}"/>
      <text x="${px(n.x)}" y="${py(n.y) + (MAP_LABEL_BELOW.has(n.id) ? 3.6 : -2.2)}">${esc(MAP_NAMES[n.id] ?? n.name)}</text></g>`;
  }).join('');
  const karsts = KARSTS.filter((k) => k.x >= minX && k.x <= maxX && k.y >= minY && k.y <= maxY)
    .map((k) => `<path d="M${px(k.x) - 2} ${py(k.y) + 2} L${px(k.x)} ${py(k.y) - 4} L${px(k.x) + 2} ${py(k.y) + 2}Z" fill="${k.color}"/>`)
    .join('');
  return `<div class="overlay" data-act="map-close">
    <div class="mapbox">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${edges}${karsts}${nodes}</svg>
      <p class="sub">The Anvil Road. Dashed: rough going. Tap anywhere to close.</p>
    </div></div>`;
}

function render(): void {
  if (titleScreen || !S) {
    app.innerHTML = titleHtml();
    clockEl.textContent = '';
    return;
  }
  const s = S;
  let html = '';
  switch (s.screen) {
    case 'chapter': html = chapterHtml(); break;
    case 'road': html = roadHtml(s); break;
    case 'camp': html = campHtml(s); break;
    case 'scene': html = sceneHtml(s); break;
    case 'chest': html = chestHtml(s); break;
    case 'result': html = resultHtml(s); break;
    case 'defeat': html = defeatHtml(s); break;
    case 'end': html = endHtml(s); break;
    default: html = roadHtml(s);
  }
  if (showMap) html += mapHtml(s);
  app.innerHTML = html;
  clockEl.textContent = clock(s.minutes);
}

function commit(scrollTop = true): void {
  if (S) save(S);
  render();
  if (scrollTop) window.scrollTo({ top: 0 });
}

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = el.dataset.act!;
  const arg = el.dataset.arg ?? '';

  if (act === 'new') {
    clearSave();
    S = startChapter();
    titleScreen = false;
    return commit();
  }
  if (act === 'resume') {
    S = load();
    titleScreen = false;
    return commit();
  }
  if (!S) return;
  const s = S;
  switch (act) {
    case 'setout': setOut(s); break;
    case 'travel': travel(s, arg); break;
    case 'camp-open':
      campUi.hours = hoursUntilMorning(s.minutes);
      s.screen = 'camp';
      break;
    case 'hours':
      campUi.hours = Math.max(1, Math.min(12, campUi.hours + Number(arg)));
      return commit(false);
    case 'fire': campUi.fire = arg === '1'; return commit(false);
    case 'watch': campUi.watch = (arg || null) as MemberId | null; return commit(false);
    case 'camp': camp(s, campUi.hours, campUi.fire, campUi.watch); break;
    case 'back': s.screen = 'road'; break;
    case 'inn': stayAtInn(s); break;
    case 'buy': buyRation(s); return commit(false);
    case 'look': lookAround(s); break;
    case 'choose': choose(s, Number(arg)); break;
    case 'chest':
      chestUi.pos = [];
      chestUi.msg = '';
      openChest(s, arg);
      break;
    case 'wheel': {
      const [i, d] = arg.split(':').map(Number);
      spinWheel(i, d);
      return commit(false);
    }
    case 'try': {
      const chest = s.chest ? chestById(s.chest) : undefined;
      if (!chest) break;
      const wheels = wheelsFor(chest);
      const word = wheels.map((w, i) => w[((chestUi.pos[i] % w.length) + w.length) % w.length]).join('');
      if (!tryChest(s, word)) {
        chestUi.msg = 'The wheels turn, and the lock holds.';
        chestUi.shake = true;
        commit(false);
        chestUi.shake = false;
        return;
      }
      chestUi.pos = [];
      break;
    }
    case 'leave-chest': leaveChest(s); break;
    case 'continue': continueOn(s); break;
    case 'rise': {
      const r = riseAgain(s);
      if (r) S = r;
      break;
    }
    case 'map': showMap = true; return commit(false);
    case 'map-close': showMap = false; return commit(false);
  }
  commit();
});

function spinWheel(i: number, d: number): void {
  chestUi.pos[i] = (chestUi.pos[i] ?? 0) + d;
  chestUi.msg = '';
}

// Swipe a wheel up or down to turn it.
let swipe: { wheel: number; y: number } | null = null;
document.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.wheel');
  swipe = el && !(e.target as HTMLElement).closest('.spin') ? { wheel: Number(el.dataset.wheel), y: e.clientY } : null;
});
document.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dy = e.clientY - swipe.y;
  if (Math.abs(dy) > 18) {
    spinWheel(swipe.wheel, dy < 0 ? 1 : -1);
    commit(false);
  }
  swipe = null;
});

// Sky animation, throttled; it only runs while the page is visible.
let last = 0;
function frame(t: number): void {
  if (t - last > 40 && !document.hidden) {
    last = t;
    if (S && !titleScreen) {
      drawSky(sky, S, t);
    } else {
      drawSky(sky, TITLE_SKY, t);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

render();
