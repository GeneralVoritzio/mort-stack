#!/usr/bin/env node
// Capture a reference set: full-page shots, per-section measurements and :root tokens.
// Usage: node capture.mjs <url> <out-dir> [--viewports 1440x900,768x1024] [--cookie-file f] [--section-selector sel]
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [url, outDir, ...rest] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: capture.mjs <url> <out-dir> [--viewports WxH,...] [--cookie-file f] [--section-selector sel]');
  process.exit(2);
}
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? fallback : rest[i + 1];
};
const viewports = flag('viewports', '1440x900,768x1024,390x844')
  .split(',')
  .map((v) => v.split('x').map(Number));
const cookieFile = flag('cookie-file');
// Default: direct children of <main>, or of <body> when there is no <main>.
const sectionSelector = flag('section-selector', '[data-section], main > *, body > *:not(script):not(style)');

await mkdir(join(outDir, 'shots'), { recursive: true });
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });

for (const [w, h] of viewports) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  if (cookieFile) {
    const cookies = JSON.parse(await readFile(cookieFile, 'utf8'));
    await context.addCookies(cookies);
  }
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Scroll in steps so lazy sections mount and reveal animations settle.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });

  await page.screenshot({ path: join(outDir, 'shots', `full-${w}.png`), fullPage: true });
  await page.screenshot({ path: join(outDir, 'shots', `viewport-${w}.png`) });

  const measure = await page.evaluate((sel) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const type = (el) => {
      const s = getComputedStyle(el);
      return {
        fontFamily: s.fontFamily, fontSize: parseFloat(s.fontSize), lineHeight: s.lineHeight,
        fontWeight: Number(s.fontWeight), letterSpacing: s.letterSpacing, color: s.color,
      };
    };
    const seen = new Set();
    const sections = [...document.querySelectorAll(sel)].filter((el) => {
      if (seen.has(el) || !visible(el)) return false;
      seen.add(el);
      return true;
    });
    return {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight },
      docHeight: document.documentElement.scrollHeight,
      body: { backgroundColor: getComputedStyle(document.body).backgroundColor, ...type(document.body) },
      sections: sections.map((el, i) => {
        const s = getComputedStyle(el);
        const headings = [...el.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).slice(0, 6);
        return {
          index: i,
          name: el.dataset.section ?? el.id ?? el.tagName.toLowerCase(),
          tag: el.tagName.toLowerCase(),
          box: box(el),
          backgroundColor: s.backgroundColor,
          padding: s.padding,
          display: s.display,
          gridTemplateColumns: s.gridTemplateColumns,
          gap: s.gap,
          headings: headings.map((hd) => ({ tag: hd.tagName.toLowerCase(), text: hd.textContent.trim().slice(0, 60), box: box(hd), ...type(hd) })),
        };
      }),
    };
  }, sectionSelector);
  await writeFile(join(outDir, `measure-${w}.json`), JSON.stringify(measure, null, 2));
  await context.close();
  console.log(`captured ${w}x${h}: ${measure.sections.length} sections, docHeight ${measure.docHeight}`);
}

// Tokens: custom properties declared on :root-like rules, in stylesheet order.
{
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const tokens = await page.evaluate(() => {
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { out.push(`/* cross-origin sheet skipped: ${sheet.href} */`); continue; }
      const walk = (list) => {
        for (const rule of list) {
          if (rule.cssRules) walk(rule.cssRules);
          if (!rule.style || !/:root|html|\.dark|\.light|\[data-theme/.test(rule.selectorText ?? '')) continue;
          const props = [...rule.style].filter((p) => p.startsWith('--'));
          if (props.length) out.push(`${rule.selectorText} {`, ...props.map((p) => `  ${p}: ${rule.style.getPropertyValue(p).trim()};`), '}');
        }
      };
      walk(rules);
    }
    return out.join('\n');
  });
  await writeFile(join(outDir, 'tokens.txt'), tokens || '/* no custom properties found; sample computed colours instead */\n');
  await page.close();
}

await browser.close();
