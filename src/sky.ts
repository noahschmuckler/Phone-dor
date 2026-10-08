// The sky band: a 360° panorama centred on the road's goal. Near karsts rise as
// physical spires; every karst, near or far, marks the sky with its column of
// falling heaven-water, so the party can always navigate by the towers.

import { bearing, KARSTS, node } from './content/road';
import { DAY } from './rules';
import { GameState } from './state';

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`;

// [hour, zenith, horizon]
const SKY: [number, string, string][] = [
  [0, '#05060d', '#0c1020'],
  [5, '#0a0c1a', '#1c1a2c'],
  [6.5, '#2a2a48', '#b8705a'],
  [8, '#46647f', '#a3adb0'],
  [12, '#55758f', '#b2b9b6'],
  [17, '#4c6580', '#bba48a'],
  [19.5, '#29233e', '#a85c48'],
  [21, '#0a0c1a', '#1c1828'],
  [24, '#05060d', '#0c1020'],
];

function skyAt(hr: number): [RGB, RGB] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, z0, b0] = SKY[i];
    const [h1, z1, b1] = SKY[i + 1];
    if (hr >= h0 && hr <= h1) {
      const t = (hr - h0) / (h1 - h0);
      return [mix(hex(z0), hex(z1), t), mix(hex(b0), hex(b1), t)];
    }
  }
  return [hex(SKY[0][1]), hex(SKY[0][2])];
}

/** 0 by day, 1 at full night. */
function darkness(hr: number): number {
  if (hr < 5 || hr >= 21) return 1;
  if (hr < 7) return (7 - hr) / 2;
  if (hr > 19) return (hr - 19) / 2;
  return 0;
}

export function drawSky(cv: HTMLCanvasElement, s: GameState, t: number): void {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const here = node(s.node);
  const goal = KARSTS.find((k) => k.id === 'anviltooth')!;
  const centre = bearing(here.x, here.y, goal.x, goal.y);
  const xOf = (b: number) => W / 2 + ((((b - centre + 540) % 360) - 180) / 360) * W;
  const hz = H * 0.74;
  const hr = (s.minutes % DAY) / 60;
  const dark = darkness(hr);

  // Sky
  const [zen, hor] = skyAt(hr);
  const g = ctx.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, css(zen));
  g.addColorStop(1, css(hor));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, hz);

  // Stars
  if (dark > 0) {
    for (let i = 0; i < 70; i++) {
      const sx = (Math.sin(i * 91.7) * 0.5 + 0.5) * W;
      const sy = (Math.sin(i * 47.3 + 2) * 0.5 + 0.5) * hz * 0.9;
      const tw = 0.6 + 0.4 * Math.sin(t / 700 + i);
      ctx.fillStyle = `rgba(230,228,215,${0.7 * dark * tw})`;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  // Sun by day, moon by night
  if (hr > 5.5 && hr < 19.5) {
    const alt = Math.sin((Math.PI * (hr - 6)) / 13);
    const sb = 90 + ((hr - 6) / 13) * 180;
    const sx = xOf(sb);
    const sy = hz - Math.max(alt, -0.05) * (hz - 14);
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 26);
    sg.addColorStop(0, 'rgba(255,236,200,0.9)');
    sg.addColorStop(0.25, 'rgba(255,214,160,0.35)');
    sg.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 26, sy - 26, 52, 52);
  } else {
    const mb = 270 + (((hr + 24 - 19.5) % 24) / 10.5) * 180;
    const mx = xOf(mb);
    ctx.fillStyle = 'rgba(220,220,205,0.75)';
    ctx.beginPath();
    ctx.arc(mx, hz * 0.3, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Karsts: far ones first so near spires overlap them.
  const ks = KARSTS.map((k) => ({ k, d: Math.hypot(k.x - here.x, k.y - here.y) }))
    .filter((e) => e.d > 1.5)
    .sort((a, b) => b.d - a.d);
  for (const { k, d } of ks) {
    const x = xOf(bearing(here.x, here.y, k.x, k.y));
    const physical = d < 80;
    const spireH = physical ? Math.min(H * 0.62, Math.max(5, 1500 / (d + 10))) : 0;
    const top = hz - spireH - 3;
    const col = hex(k.color);

    // The metaphysical tower: a faint column up into the sky.
    const ca = (0.22 + 0.4 * dark) * (physical ? 1 : 0.7);
    const cg = ctx.createLinearGradient(0, 0, 0, top);
    cg.addColorStop(0, css(col, 0));
    cg.addColorStop(0.5, css(col, ca * 0.6));
    cg.addColorStop(1, css(col, ca));
    ctx.fillStyle = cg;
    ctx.fillRect(x - 1, 0, 2, top);

    // Heaven-water falling down the column.
    for (let i = 0; i < 4; i++) {
      const p = (t / 2600 + i / 4 + (k.x % 7) / 7) % 1;
      ctx.fillStyle = css(mix(col, [255, 255, 255], 0.6), (0.35 + 0.4 * dark) * (1 - p * 0.5));
      ctx.fillRect(x - 0.5, p * top, 1, 3);
    }

    if (physical) {
      // A karst tower: sheer sides, a little bulge, a broken crown.
      const bw = Math.max(3, spireH * 0.32);
      const haze = Math.min(1, d / 80);
      const body = mix(mix(hex('#15140f'), col, 0.18), mix(hor, hex('#000000'), 0.35), haze * 0.6);
      ctx.fillStyle = css(body);
      ctx.beginPath();
      ctx.moveTo(x - bw / 2, hz + 2);
      ctx.lineTo(x - bw * 0.56, hz - spireH * 0.35);
      ctx.lineTo(x - bw * 0.42, hz - spireH * 0.8);
      ctx.lineTo(x - bw * 0.2, hz - spireH);
      ctx.lineTo(x, hz - spireH * 0.94);
      ctx.lineTo(x + bw * 0.24, hz - spireH * 0.99);
      ctx.lineTo(x + bw * 0.45, hz - spireH * 0.76);
      ctx.lineTo(x + bw * 0.55, hz - spireH * 0.3);
      ctx.lineTo(x + bw / 2, hz + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Ground: low rolling hills along the horizon.
  const ground = mix(hex('#24231b'), hex('#0b0b09'), dark);
  ctx.fillStyle = css(ground);
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) {
    const b = centre + ((x - W / 2) / W) * 360;
    const r = (b * Math.PI) / 180;
    const hill = Math.sin(r * 3 + here.x * 0.05) * 3 + Math.sin(r * 7 + 1 + here.y * 0.1) * 2 + Math.sin(r * 13) * 1.2;
    ctx.lineTo(x, hz - 3 - hill);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Labels and compass.
  ctx.textAlign = 'center';
  ctx.font = '9px "EB Garamond", Georgia, serif';
  // Nearest karsts claim label space first; others drop to a second row or go unlabelled.
  const placed: [number, number, number][] = [];
  for (const { k, d } of [...ks].reverse()) {
    const x = xOf(bearing(here.x, here.y, k.x, k.y));
    const half = ctx.measureText(k.name).width / 2 + 3;
    for (const row of [0, 1]) {
      const clash = placed.some(([px, ph, pr]) => pr === row && Math.abs(px - x) < ph + half);
      if (clash || x - half < 0 || x + half > W) continue;
      placed.push([x, half, row]);
      ctx.fillStyle = css(mix(hex(k.color), [220, 215, 200], 0.5), d < 80 ? 0.85 : 0.5);
      ctx.fillText(k.name, x, hz + 13 + row * 10);
      break;
    }
  }
  ctx.font = '8px "Space Mono", monospace';
  ctx.fillStyle = 'rgba(200,195,180,0.4)';
  for (const [label, b] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const) {
    ctx.fillText(label, xOf(b), H - 4);
  }
}
