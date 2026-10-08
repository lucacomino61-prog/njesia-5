// Subsets the self-hosted fonts to the characters Albanian and English need (variable axes kept)
// and prints the metrics the fallback @font-face overrides in src/styles/fonts.css are built from,
// so swapping the web font in causes no layout shift.
// Run: node tools/fonts.mjs   (sources: OFL woff2 files from @fontsource-variable in node_modules)
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import subsetFont from 'subset-font';
import * as fontkit from 'fontkit';

const NM = 'node_modules/@fontsource-variable/';
const OUT = 'public/fonts/';

const ranges = [
  [0x20, 0x7e], [0xa0, 0xff], [0x2010, 0x2027], [0x2030, 0x203a], [0x2190, 0x2193],
];
const extra = [0x0131, 0x0152, 0x0153, 0x2044, 0x20ac, 0x2116, 0x2122, 0x2212, 0x2215, 0x2713];
let text = '';
for (const [a, b] of ranges) for (let c = a; c <= b; c++) text += String.fromCodePoint(c);
for (const c of extra) text += String.fromCodePoint(c);

const jobs = [
  [NM + 'big-shoulders/files/big-shoulders-latin-standard-normal.woff2', 'big-shoulders.v1.woff2', { opsz: 72, wght: 860 }],
  [NM + 'atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2', 'atkinson-next.v1.woff2', { wght: { min: 400, max: 800, default: 400 } }],
  [NM + 'atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-wght-normal.woff2', 'atkinson-mono.v1.woff2', { wght: { min: 400, max: 700, default: 400 } }],
];

const sample = 'Këtë javë 14 fqinjë ngritën 5 probleme në Selitë; ekipi u përgjigj brenda 6 orësh.';

for (const [src, name, variationAxes] of jobs) {
  const input = readFileSync(src);
  const out = await subsetFont(input, text, { targetFormat: 'woff2', preserveNameIds: [1, 2, 3, 4, 5, 6], variationAxes });
  writeFileSync(OUT + name, out);
  const f = fontkit.create(input);
  const run = f.layout(sample);
  const width = run.glyphs.reduce((s, g) => s + g.advanceWidth, 0) / sample.length;
  console.log(
    `${name}: ${statSync(OUT + name).size} B (was ${input.length}), upm ${f.unitsPerEm}, asc ${f.ascent}, desc ${f.descent}, gap ${f.lineGap}, ` +
      `capH ${f.capHeight}, xH ${f.xHeight}, avgAdvance ${width.toFixed(1)}, axes ${Object.keys(f.variationAxes).join(',')}`,
  );
}

// System fallbacks the overrides are matched against.
for (const p of ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialn.ttf', 'C:/Windows/Fonts/arialbd.ttf']) {
  try {
    const f = fontkit.openSync(p);
    const run = f.layout(sample);
    const width = run.glyphs.reduce((s, g) => s + g.advanceWidth, 0) / sample.length;
    console.log(`${p}: upm ${f.unitsPerEm}, asc ${f.ascent}, desc ${f.descent}, capH ${f.capHeight}, avgAdvance ${width.toFixed(1)}`);
  } catch (e) {
    console.log(p, 'missing');
  }
}
