/**
 * Generates the share preview card and the favicons.
 *
 * AUDIT M8: last year there were zero meta tags beyond charset/viewport and NO
 * favicon at all, so the WhatsApp/iMessage preview — which is the entire
 * distribution model for a gift link — rendered blank.
 *
 * The card is TYPOGRAPHIC, never a personal photo. It is rendered once, when
 * she sends him the link, and a personal photo in a link preview leaks into
 * every chat backup and notification shade it passes through.
 *
 * Run:  node scripts/og.mjs
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

const PAPER = '#F6F2EC';
const INK = '#2A2724';
const BURGUNDY = '#6E1A2B';
const BRASS = '#A8894F';

const YEAR = 2026;

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

/** 1200x630 share card. */
function ogSvg(greeting, name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${BURGUNDY}"/>
  <text x="96" y="150" font-family="Georgia, 'Times New Roman', serif" font-size="22"
        letter-spacing="6" fill="${INK}" opacity="0.55">${YEAR}</text>
  <text x="96" y="290" font-family="Georgia, 'Times New Roman', serif" font-size="86"
        font-weight="bold" fill="${INK}">${escapeXml(greeting)}</text>
  <text x="96" y="400" font-family="Georgia, 'Times New Roman', serif" font-size="86"
        font-weight="bold" fill="${BURGUNDY}">${escapeXml(name)}</text>
  <rect x="96" y="470" width="120" height="2" fill="${BRASS}"/>
</svg>`;
}

/** Wax-seal mark — reads at 16px, and fits the keepsake-letter direction. */
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="${PAPER}"/>
  <circle cx="32" cy="32" r="20" fill="${BURGUNDY}"/>
  <circle cx="32" cy="32" r="13.5" fill="none" stroke="${PAPER}" stroke-opacity="0.55" stroke-width="1.5"/>
  <rect x="24" y="31" width="16" height="2" rx="1" fill="${PAPER}" fill-opacity="0.9"/>
</svg>`;

async function main() {
  const yearFile = path.join(ROOT, 'src', 'content', 'years', `${YEAR}.json`);
  const data = JSON.parse(await readFile(yearFile, 'utf8'));
  const greeting = data.hero.greeting;
  const name = data.names.primary;

  await mkdir(path.join(PUBLIC, 'og'), { recursive: true });

  const svg = Buffer.from(ogSvg(greeting, name));
  const outPng = path.join(PUBLIC, 'og', `${YEAR}-title-card.png`);
  await sharp(svg).png({ compressionLevel: 9 }).toFile(outPng);

  await writeFile(path.join(PUBLIC, 'favicon.svg'), faviconSvg);
  await sharp(Buffer.from(faviconSvg)).resize(180, 180).png().toFile(path.join(PUBLIC, 'apple-touch-icon.png'));

  const { size } = await import('node:fs').then((m) => m.statSync(outPng));
  console.log(`\n  og/${YEAR}-title-card.png   1200x630  ${(size / 1024).toFixed(0)} KB`);
  console.log(`  favicon.svg`);
  console.log(`  apple-touch-icon.png      180x180`);
  console.log(`\n  Card reads: "${greeting} / ${name}"  — typographic, no personal photo.\n`);
}

main().catch((err) => {
  console.error(`\nOG generation failed: ${err.message}\n`);
  process.exit(1);
});
