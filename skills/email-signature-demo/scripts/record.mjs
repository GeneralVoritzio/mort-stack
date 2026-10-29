// Record real product interactions; no external skill pack required.
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [flowPath, output, flag, statePath] = process.argv.slice(2);
if (!flowPath || !output || (flag && (flag !== '--storage-state' || !statePath))) {
  throw new Error('Usage: node record.mjs flow.json new-output-dir [--storage-state private-state.json]');
}
const flow = JSON.parse(await readFile(flowPath, 'utf8'));
if (!['http:', 'https:'].includes(new URL(flow.url).protocol)) throw new Error('Use an HTTP(S) product URL');
const viewport = flow.viewport ?? { width: 960, height: 540 };
if (![viewport.width, viewport.height].every(n => Number.isInteger(n) && n >= 200 && n <= 3840)) throw new Error('Invalid viewport');
const actions = new Set(['hold', 'click', 'fill', 'select', 'hover', 'press', 'scroll']);
if (!Array.isArray(flow.steps) || !flow.steps.length) throw new Error('Provide a nonempty steps array');
for (const step of flow.steps) {
  const seconds = step.seconds ?? 2;
  if (!actions.has(step.action) || !Number.isFinite(seconds) || seconds < 0.25 || seconds > 10) throw new Error('Invalid action or hold duration');
  if (step.action !== 'hold' && typeof step.selector !== 'string') throw new Error('Action requires a CSS selector');
  if (['fill', 'select'].includes(step.action) && typeof step.value !== 'string') throw new Error('Action requires value');
  if (step.action === 'press' && typeof step.key !== 'string') throw new Error('Press requires key');
}
if (flow.steps.reduce((n, step) => n + (step.seconds ?? 2), 0) > 30) throw new Error('Keep holds under 30 seconds');
execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
const out = resolve(output);
await mkdir(out, { recursive: false });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport, recordVideo: { dir: join(out, 'raw'), size: viewport },
    ...(statePath ? { storageState: resolve(statePath) } : {}) });
  const page = await context.newPage();
  const epoch = performance.now();
  page.setDefaultTimeout(15000);
  const video = page.video();
  await page.goto(flow.url, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  if (flow.readySelector) await page.locator(flow.readySelector).waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, 'first.png') });
  const start = (performance.now() - epoch) / 1000;
  for (const step of flow.steps) {
    const locator = step.selector ? page.locator(step.selector) : null;
    switch (step.action) {
      case 'click': await locator.click(); break;
      case 'fill': await locator.fill(step.value); break;
      case 'select': await locator.selectOption(step.value); break;
      case 'hover': await locator.hover(); break;
      case 'press': await locator.press(step.key); break;
      case 'scroll': await locator.scrollIntoViewIfNeeded(); break;
    }
    await page.waitForTimeout((step.seconds ?? 2) * 1000);
  }
  const duration = (performance.now() - epoch) / 1000 - start;
  await page.screenshot({ path: join(out, 'last.png') });
  await context.close();
  const raw = await video.path();
  execFileSync('ffmpeg', ['-v', 'error', '-i', raw, '-ss', start.toFixed(3), '-t', duration.toFixed(3),
    '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', join(out, 'demo.webm')], { stdio: 'pipe' });
  await writeFile(join(out, 'recording.json'), JSON.stringify({ start, duration, viewport }, null, 2) + '\n');
  console.log(`Recorded ${duration.toFixed(1)} seconds to ${join(out, 'demo.webm')}. Inspect frames before sharing; raw/ includes loading.`);
} finally {
  await browser.close();
}
