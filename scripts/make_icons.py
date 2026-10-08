"""Render the home-screen PNG icons (iOS needs PNG, not SVG). Run from repo root."""
from PIL import Image, ImageDraw

def icon(size):
    s = size / 64
    im = Image.new('RGB', (size, size), '#0b0c12')
    d = ImageDraw.Draw(im)
    d.rectangle([31 * s, 0, 33 * s, 30 * s], fill='#8a3a26')
    tower = [(24, 56), (22, 40), (26, 24), (30, 18), (32, 20), (35, 17), (39, 26), (42, 42), (40, 56)]
    d.polygon([(x * s, y * s) for x, y in tower], fill='#2a2620')
    d.rectangle([0, 55 * s, size, size], fill='#16150f')
    return im

for n in (180, 512):
    icon(n).save(f'public/icon-{n}.png')
