// Generează iconițele PWA (PNG) dintr-un SVG minimalist, în stilul tablei.
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(dir, { recursive: true });

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#16181A"/>
  <g opacity="0.9">
    <rect x="60" y="300" width="44" height="150" fill="#fff"/>
    <rect x="116" y="250" width="34" height="200" fill="#fff"/>
    <rect x="162" y="330" width="50" height="120" fill="#fff"/>
    <rect x="224" y="210" width="40" height="240" fill="#fff"/>
    <rect x="238" y="180" width="12" height="34" fill="#fff"/>
    <rect x="276" y="300" width="54" height="150" fill="#fff"/>
    <rect x="342" y="252" width="34" height="198" fill="#fff"/>
    <rect x="388" y="320" width="52" height="130" fill="#fff"/>
  </g>
  <polygon points="0,0 150,0 0,150" fill="#C0392B"/>
  <text x="256" y="150" font-family="Arial, sans-serif" font-weight="900" font-size="150" fill="#fff" text-anchor="middle">AM</text>
</svg>`;

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-maskable-512.png', size: 512 },
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t.size))).resize(t.size, t.size).png().toFile(join(dir, t.name));
  console.log('scris', t.name);
}
