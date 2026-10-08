// Renders the app icons, favicon PNG and the social share image (og.png) from HTML with the
// site's own fonts, in headless Chrome. Run: node tools/icons.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const font = (f) => `data:font/woff2;base64,${readFileSync(resolve('public/fonts', f)).toString('base64')}`;
const css = `@font-face{font-family:S;src:url(${font('big-shoulders.v1.woff2')})}
@font-face{font-family:A;src:url(${font('atkinson-next.v1.woff2')})}
*{margin:0;box-sizing:border-box}html,body{width:100%;height:100%}`;

const icon = (pad) => `<html><head><style>${css}
body{background:#1c1d1f;display:grid;place-items:center}
.z{display:flex;gap:7%;width:${100 - pad * 2}%;height:${100 - pad * 2}%;align-items:stretch}
.z i{flex:1;background:#f3c12a}</style></head><body><div class="z"><i></i><i></i><i></i><i></i></div></body></html>`;

const og = `<html><head><style>${css}
body{background:#f3f3f0;color:#1c1d1f;font-family:A;padding:64px 72px;display:grid;grid-template-rows:auto 1fr auto;gap:24px}
.zebra{display:grid;grid-template-columns:repeat(9,1fr);gap:22px;height:34px}.zebra i{background:#f3c12a}
h1{font-family:S;font-weight:900;font-size:168px;line-height:.86;text-transform:uppercase;align-self:center}
h1 span{background:linear-gradient(#f3c12a,#f3c12a) 0 82%/100% .42em no-repeat}
p{font-size:34px;font-weight:700}</style></head><body>
<div class="zebra">${'<i></i>'.repeat(9)}</div>
<h1><span>Njësia 5</span><br>forumi i lagjes</h1>
<p>Blloku · Selita · Tirana e Re. Nismë e banorëve.</p></body></html>`;

mkdirSync('public/icons', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
async function shot(html, w, h, out) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'png' });
  console.log('wrote', out);
}
await shot(icon(16), 192, 192, 'public/icons/192.png');
await shot(icon(16), 512, 512, 'public/icons/512.png');
await shot(icon(26), 512, 512, 'public/icons/maskable-512.png');
await shot(icon(14), 180, 180, 'public/apple-touch-icon.png');
await shot(icon(12), 32, 32, 'public/favicon-32.png');
await shot(og, 1200, 630, 'public/og.png');
await browser.close();
