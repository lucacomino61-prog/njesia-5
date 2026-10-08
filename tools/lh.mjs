// Lighthouse on every page type, phone and desktop, against the production preview.
// Run: node tools/lh.mjs [base] [--only=mobile|desktop] [--pages=/,/forumi]
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:3751';
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const pagesArg = (process.argv.find((a) => a.startsWith('--pages=')) ?? '').slice(8);

async function discover() {
  const forum = await (await fetch(BASE + '/forumi')).text();
  const ev = await (await fetch(BASE + '/ngjarje')).text();
  const live = await (await fetch(BASE + '/live')).text();
  const dec = await (await fetch(BASE + '/vendime')).text();
  const pick = (html, p) => (html.match(new RegExp(`href="(${p}/[0-9a-z]{16}[^"#?]*)`)) ?? [])[1];
  return [
    '/',
    '/forumi',
    pick(forum, '/tema'),
    pick(forum, '/propozime'),
    '/vendime',
    pick(dec, '/vendime'),
    '/ngjarje',
    pick(ev, '/ngjarje'),
    '/live',
    pick(live, '/live'),
    '/bizneset',
    '/kushtet',
    '/hyr',
    '/en',
    '/regjistrohu',
  ].filter(Boolean);
}

const pages = pagesArg ? pagesArg.split(',') : await discover();
const chrome = await chromeLauncher.launch({
  chromePath: process.env.LH_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  chromeFlags: process.env.LH_CHROME ? ['--no-first-run'] : ['--headless=new', '--no-first-run'],
});
mkdirSync('tools/.out/lh', { recursive: true });
const rows = [];
for (const formFactor of only ? [only] : ['mobile', 'desktop']) {
  for (const p of pages) {
    const config =
      formFactor === 'desktop'
        ? { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 }, emulatedUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Chrome-Lighthouse' } }
        : { extends: 'lighthouse:default' };
    const r = await lighthouse(BASE + p, { port: chrome.port, output: 'json', logLevel: 'error' }, config);
    const lhr = r.lhr;
    const cats = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
    const fails = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1 && ['binary', 'numeric', 'metricSavings'].includes(a.scoreDisplayMode) && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode))
      .filter((a) => Object.values(lhr.categories).some((c) => c.auditRefs.some((ref) => ref.id === a.id && ref.weight > 0)) || a.scoreDisplayMode === 'binary')
      .map((a) => `${a.id}(${a.score})${a.displayValue ? ' ' + a.displayValue : ''}`);
    const m = (id) => lhr.audits[id]?.displayValue ?? '';
    rows.push({ formFactor, p, cats, fails });
    console.log(
      `${formFactor.padEnd(7)} ${p.slice(0, 48).padEnd(48)} P${cats.performance} A${cats.accessibility} BP${cats['best-practices']} SEO${cats.seo}  FCP ${m('first-contentful-paint')} LCP ${m('largest-contentful-paint')} TBT ${m('total-blocking-time')} CLS ${m('cumulative-layout-shift')}${fails.length ? '\n        ' + fails.join(', ') : ''}`,
    );
    writeFileSync(`tools/.out/lh/${formFactor}-${p.replace(/[^a-z0-9]+/gi, '_').slice(0, 60) || 'home'}.json`, JSON.stringify(lhr));
  }
}
await chrome.kill();
const bad = rows.filter((r) => Object.values(r.cats).some((s) => s < 100));
console.log(`\n${rows.length - bad.length}/${rows.length} runs at 100 in every category`);
