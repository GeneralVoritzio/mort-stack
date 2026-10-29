#!/usr/bin/env node
// Run checks.json against a build. CHECK=1 exits 1 on any FAIL.
// Usage: node measure.mjs <url> <checks.json> [--viewport desktop]
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const [url, checksPath, ...rest] = process.argv.slice(2);
if (!url || !checksPath) {
  console.error('usage: measure.mjs <url> <checks.json> [--viewport name]');
  process.exit(2);
}
const only = rest.includes('--viewport') ? rest[rest.indexOf('--viewport') + 1] : null;
const doc = JSON.parse(await readFile(checksPath, 'utf8'));
// checks.json is either an array of checks or { viewports, defaults, checks }.
const checks = Array.isArray(doc) ? doc : doc.checks;
const viewports = { desktop: [1440, 900], tablet: [768, 1024], phone: [390, 844], ...(doc.viewports ?? {}) };
const defaults = { box: 2, typography: 2, grid: 8, sectionSizes: 30, docHeight: 150, ...(doc.defaults ?? {}) };

const tol = (check, key) => {
  const t = check.tolerance;
  if (typeof t === 'number') return t;
  if (t && typeof t === 'object' && key in t) return t[key];
  return defaults[check.metric] ?? 2;
};
const norm = (v) => (typeof v === 'string' ? v.replace(/\s+/g, '') : v);
const same = (got, want, t) =>
  typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= t : JSON.stringify(norm(got)) === JSON.stringify(norm(want));

// Runs in the page. Returns the measured value for one check, or { error }.
function probe(check) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height };
  };
  const px = (v) => (v === 'normal' ? v : parseFloat(v));
  const pick = (sel) => [...document.querySelectorAll(sel)].find(visible);
  const sections = () => [...document.querySelectorAll('[data-section]')].filter(visible);

  switch (check.metric) {
    case 'sectionOrder':
      return sections().map((el) => el.dataset.section);
    case 'docHeight':
      return document.documentElement.scrollHeight;
    case 'sectionSizes': {
      const out = {};
      for (const name of Object.keys(check.expected)) {
        const el = sections().find((s) => s.dataset.section === name);
        out[name] = el ? { w: box(el).w, h: box(el).h } : null;
      }
      return out;
    }
    case 'visible':
      return !!pick(check.selector);
  }
  // No selector: the section itself, or <body> for "global".
  const selector = check.selector ?? (check.section && check.section !== 'global' ? `[data-section="${check.section}"]` : 'body');
  const el = pick(selector);
  if (!el) return { error: `no visible element for ${selector}` };
  const s = getComputedStyle(el);
  switch (check.metric) {
    case 'box':
      return box(el);
    case 'style':
      return Object.fromEntries(Object.keys(check.expected).map((k) => [k, k.endsWith('Radius') || k === 'opacity' ? parseFloat(s[k]) : s[k]]));
    case 'typography':
      return {
        fontSize: px(s.fontSize), lineHeight: px(s.lineHeight), fontWeight: Number(s.fontWeight),
        letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing), color: s.color, fontFamily: s.fontFamily,
      };
    case 'grid': {
      const cells = [...el.children].filter(visible).map(box);
      if (!cells.length) return { error: 'grid has no visible children' };
      const rows = [];
      for (const c of cells) {
        const row = rows.find((r) => Math.abs(r[0].y - c.y) <= 8);
        row ? row.push(c) : rows.push([c]);
      }
      const [a, b] = rows[0];
      return {
        columns: rows[0].length, rows: rows.length, count: cells.length,
        childW: a.w, childH: a.h,
        colGap: b ? b.x - (a.x + a.w) : 0,
        rowGap: rows[1] ? rows[1][0].y - (a.y + a.h) : 0,
      };
    }
  }
  return { error: `unknown metric ${check.metric}` };
}

const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
const results = { PASS: 0, FAIL: 0, MANUAL: 0, SKIP: 0 };
const byViewport = Object.groupBy(checks, (c) => c.viewport ?? 'desktop');

for (const [vp, list] of Object.entries(byViewport)) {
  if (only && vp !== only) continue;
  const [w, h] = viewports[vp] ?? vp.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });

  for (const check of list) {
    if (check.metric === 'skip') { results.SKIP++; continue; }
    if (check.metric === 'manual') {
      results.MANUAL++;
      console.log(`MANUAL ${check.id} [${vp}] ${check.item ?? ''}`);
      continue;
    }
    const got = await page.evaluate(probe, check);
    const misses = [];
    if (got?.error) misses.push(got.error);
    else if (['sectionOrder', 'docHeight', 'visible'].includes(check.metric)) {
      if (!same(got, check.expected, tol(check, check.metric))) misses.push(`got ${JSON.stringify(got)}`);
    } else {
      for (const [k, want] of Object.entries(check.expected)) {
        const g = got[k];
        if (g && typeof want === 'object') {
          for (const [kk, ww] of Object.entries(want)) {
            if (!same(g[kk], ww, tol(check, kk))) misses.push(`${k}.${kk} ${g[kk]?.toFixed?.(1) ?? g[kk]} ≠ ${ww}`);
          }
        } else if (!same(g, want, tol(check, k))) {
          misses.push(`${k} ${typeof g === 'number' ? g.toFixed(1) : JSON.stringify(g)} ≠ ${JSON.stringify(want)}`);
        }
      }
    }
    if (misses.length) {
      results.FAIL++;
      console.log(`FAIL ${check.id} [${vp}] ${check.section ?? ''} ${check.selector ?? ''}\n     ${misses.join('\n     ')}`);
    } else {
      results.PASS++;
    }
  }
  await page.close();
}
await browser.close();

console.log(`\n${results.PASS} pass · ${results.FAIL} fail · ${results.MANUAL} manual · ${results.SKIP} skip`);
if (process.env.CHECK === '1' && results.FAIL > 0) process.exit(1);
