// Renders the SPICE launcher artwork (the native app's music-note mark) into the
// PNGs Expo's config expects. Run from the repo root after `npm ci`:
//   node apps/mobile-expo/scripts/generate-icons.mjs
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const NOTE =
  'M53.35,31.29v34.55c-2.46,-1.65 -5.76,-2.3 -9.21,-1.65c-6.26,1.15 -10.37,5.59 -9.38,10.53c0.99,4.94 6.75,7.73 13,6.58c5.92,-0.99 10.2,-5.1 10.2,-9.71V42.31c6.26,0.66 11.85,2.8 16.79,5.92V38.03c-5.92,-3.62 -13,-5.76 -21.4,-6.74z';
const ACCENT = ['#8b5cf6', '#6d28d9'];
const gradient = `<linearGradient id="note" x1="29" y1="25" x2="81" y2="89" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${ACCENT[0]}"/><stop offset="1" stop-color="${ACCENT[1]}"/></linearGradient>`;
const tile = `<linearGradient id="tile" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#15101c"/><stop offset="1" stop-color="#09070d"/></linearGradient>`;

const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 108 108"><defs>${defs}</defs>${body}</svg>`;

const outputs = {
  // Full-bleed square; stores and iOS round the corners themselves.
  'icon.png': svg(`<rect width="108" height="108" fill="url(#tile)"/><path d="${NOTE}" fill="url(#note)"/>`, tile + gradient),
  'android-icon-foreground.png': svg(`<path d="${NOTE}" fill="url(#note)"/>`, gradient),
  'android-icon-background.png': svg(`<rect width="108" height="108" fill="url(#tile)"/>`, tile),
  'android-icon-monochrome.png': svg(`<path d="${NOTE}" fill="#ffffff"/>`),
  'splash-icon.png': svg(`<path d="${NOTE}" fill="url(#note)"/>`, gradient),
  'favicon.png': svg(`<rect width="108" height="108" rx="24" fill="url(#tile)"/><path d="${NOTE}" fill="url(#note)"/>`, tile + gradient),
};

for (const [name, markup] of Object.entries(outputs)) {
  const size = name === 'favicon.png' ? 48 : 1024;
  await sharp(Buffer.from(markup)).resize(size, size).png().toFile(path.join(assets, name));
  console.log('wrote', name);
}
