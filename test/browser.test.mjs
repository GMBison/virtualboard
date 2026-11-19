import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { post, read, testBoard, write } from './helpers.mjs';

async function browserTest(t, options = {}) {
  const fixture = await testBoard(t);
  const { url, stop } = await fixture.start();
  const browser = await chromium.launch(process.env.VIRTUALBOARD_TEST_BROWSER ?
    { executablePath: process.env.VIRTUALBOARD_TEST_BROWSER } : {});
  const context = await browser.newContext({ viewport: { width: 1360, height: 1100 }, ...options });
  t.after(() => browser.close());
  return { url, stop, context, restart: () => fixture.start(url.port) };
}
async function live(page, url) {
  await page.goto(url.href);
  await page.getByText('Live', { exact: true }).waitFor();
}
const count = (page, amount) => page.waitForFunction(n => document.querySelector('#marks').children.length === n, amount);
const paths = page => page.locator('#marks path');
const writeFinished = page => page.waitForFunction(() => document.querySelector('#finish').disabled);

test('real browser shows animated ink, synchronizes tabs, reloads and exports', { timeout: 25000 }, async t => {
  const { url, context } = await browserTest(t);
  const page = await context.newPage();
  const mirror = await context.newPage();
  const errors = [];
  for (const tab of [page, mirror]) tab.on('pageerror', error => errors.push(error.message));
  await Promise.all([live(page, url), live(mirror, url)]);
  await page.bringToFront();
  await post(url, [write('√72 = 6√2', 90, { size: 42 })]);
  await page.locator('#marks path[stroke-dashoffset]').first().waitFor();
  await writeFinished(page);
  await count(mirror, 1);
  assert.equal(await paths(page).count(), 8);
  assert.equal(await page.locator('#marks text').count(), 0);
  await page.reload();
  await count(page, 1);
  assert.equal(await page.locator('#marks path[stroke-dashoffset]').count(), 0);

  const paper = page.locator('#paper');
  const { x, y, width } = await paper.boundingBox();
  const x1 = x + 100 * width / 1100;
  const y1 = y + 230 * width / 1100;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x1 + 110, y1, { steps: 20 });
  await page.mouse.up();
  await Promise.all([count(page, 2), count(mirror, 2)]);
  const stroke = (await read(url)).marks[1];
  assert.equal(stroke.type, 'stroke');
  assert.ok(stroke.points.length > 5);

  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await page.mouse.click(x1 + 35, y1);
  await count(mirror, 1);
  await page.keyboard.press('Control+z');
  await count(mirror, 2);
  await page.keyboard.press('Control+Shift+z');
  await count(mirror, 1);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await paper.click({ position: { x: 58, y: 385 } });
  await page.getByLabel('Text or equation').fill('My own work');
  await page.getByRole('button', { name: 'Write', exact: true }).click();
  await count(mirror, 2);
  assert.equal((await read(url)).marks[1].text, 'My own work');
  await writeFinished(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const saved = await download;
  assert.equal(saved.suggestedFilename(), 'virtualboard.svg');
  const ink = await readFile(await saved.path(), 'utf8');
  assert.match(ink, /aria-label="My own work"/);
  assert.doesNotMatch(ink, /id="cursor"/);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await read(url)).marks.length, 2);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Clear page', exact: true }).click();
  await count(mirror, 0);
  assert.deepEqual(errors, []);
});

test('narration pairs with ink, Finish cancels it, and the demo renders', { timeout: 20000 }, async t => {
  const { url, context } = await browserTest(t);
  await context.addInitScript(() => {
    window.spoken = [];
    const active = new Set();
    Object.defineProperty(window, 'speechSynthesis', { value: {
      speak(utterance) {
        window.spoken.push(utterance.text);
        active.add(utterance);
        if (utterance.text !== 'Hold here') setTimeout(() => {
          if (active.delete(utterance)) utterance.onend?.();
        }, 60);
      },
      cancel() { for (const utterance of active) utterance.onerror?.(); active.clear(); }
    } });
  });
  const page = await context.newPage();
  await live(page, url);
  await page.getByRole('button', { name: 'Voice off' }).click();
  await post(url, [write('One', 40, { say: 'Hold here' }), write('Two', 110, { say: 'Next step' })]);
  await page.getByText('Hold here', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Finish writing' }).click();
  await count(page, 2);
  await writeFinished(page);
  assert.deepEqual(await page.evaluate(() => window.spoken), ['Hold here']);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Clear page', exact: true }).click();
  await count(page, 0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Try a surds lesson' }).click();
  await count(page, 13);
  await writeFinished(page);
  assert.equal((await read(url)).marks.length, 13);
  assert.ok((await page.evaluate(() => window.spoken)).length > 5);
  const bounds = await page.locator('#marks').evaluate(node => {
    const { x, y, width, height } = node.getBBox();
    return { left: x, top: y, right: x + width, bottom: y + height };
  });
  assert.ok(bounds.right < 1100 && bounds.bottom < 720);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
});

test('settings manage pages, canvas dimensions and local zoom', { timeout: 22000 }, async t => {
  const { url, context } = await browserTest(t, { reducedMotion: 'reduce' });
  const page = await context.newPage();
  const mirror = await context.newPage();
  await Promise.all([live(page, url), live(mirror, url)]);
  await post(url, [write('Keep this on Page 1')]);
  await count(page, 1);
  const settings = () => page.getByRole('button', { name: 'Settings', exact: true }).click();
  await settings();
  await page.getByRole('button', { name: 'Add page' }).click();
  await mirror.getByRole('button', { name: 'Page 2 of 2' }).waitFor();
  await count(mirror, 0);
  await settings();
  await page.getByLabel('Width', { exact: true }).fill('1500');
  await page.getByLabel('Height', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await mirror.waitForFunction(() => document.querySelector('#paper').getAttribute('viewBox') === '0 0 1500 1000');
  await settings();
  await page.getByLabel('View zoom').selectOption('150');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/settings.png', fullPage: true });
  await page.getByRole('button', { name: 'Close settings' }).click();
  assert.equal(await page.locator('#paper-scroll').getAttribute('data-zoom'), '150');
  assert.equal(await mirror.locator('#paper-scroll').getAttribute('data-zoom'), '100');
  await page.getByRole('button', { name: 'Pan', exact: true }).click();
  const scroller = await page.locator('#paper-scroll').boundingBox();
  await page.mouse.move(scroller.x + 300, scroller.y + 220);
  await page.mouse.down();
  await page.mouse.move(scroller.x + 115, scroller.y + 180, { steps: 4 });
  await page.mouse.up();
  assert.ok(await page.locator('#paper-scroll').evaluate(node => node.scrollLeft > 100));
  assert.equal((await read(url)).marks.length, 0);
  await settings();
  await page.getByLabel('View zoom').selectOption('100');
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await mirror.getByRole('button', { name: 'Page 1 of 2' }).waitFor();
  await count(mirror, 1);
  assert.equal((await read(url)).marks[0].text, 'Keep this on Page 1');
});

test('touch input and reduced motion fit a narrow screen', { timeout: 15000 }, async t => {
  const { url, context } = await browserTest(t, {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  await live(page, url);
  const viewport = await page.evaluate(() => ({ screen: innerWidth, document: document.documentElement.scrollWidth }));
  assert.deepEqual(viewport, { screen: 390, document: 390 });
  const penPosition = await page.getByRole('button', { name: 'Pen', exact: true }).boundingBox();
  const fullPosition = await page.getByRole('button', { name: 'Full screen', exact: true }).boundingBox();
  assert.equal(penPosition.y, fullPosition.y);
  const paper = await page.locator('#paper').boundingBox();
  await page.touchscreen.tap(paper.x + 30, paper.y + 60);
  await count(page, 1);
  assert.equal((await read(url)).marks[0].type, 'stroke');
  await post(url, [write('2x + 4 = 10', 230, { size: 50 })]);
  await count(page, 2);
  assert.equal(await page.locator('[stroke-dashoffset]').count(), 0);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
});

test('automatic continuation switches pages and still animates the first strokes', {
  timeout: 15000
}, async t => {
  const { url, context } = await browserTest(t);
  const page = await context.newPage();
  await live(page, url);
  await post(url, [write('Existing work at the bottom', 630)]);
  await count(page, 1);
  await writeFinished(page);
  const previous = await read(url);
  await post(url, [write('The pen writes on a new page', 630)], {
    'x-virtualboard-continue-lesson': '1', 'x-virtualboard-page': previous.activePage.id
  });
  await page.getByRole('button', { name: 'Page 2 of 2' }).waitFor();
  await page.locator('#marks path[stroke-dashoffset]').first().waitFor();
  await writeFinished(page);
  assert.equal((await read(url)).pages[0].markCount, 1);
  assert.equal((await read(url)).marks[0].y, 56);
});

test('Chromium and Brave share edits, page switches and resizing at the same URL', {
  timeout: 25000,
  skip: !process.env.VIRTUALBOARD_TEST_BRAVE
}, async t => {
  const { url } = await (await testBoard(t)).start();
  const normal = await chromium.launch();
  t.after(() => normal.close());
  const brave = await chromium.launch({ executablePath: process.env.VIRTUALBOARD_TEST_BRAVE });
  t.after(() => brave.close());
  const primary = await normal.newPage({ reducedMotion: 'reduce' });
  const secondary = await brave.newPage({ reducedMotion: 'reduce' });
  await Promise.all([live(primary, url), live(secondary, url)]);
  await secondary.getByRole('button', { name: 'Type', exact: true }).click();
  await secondary.locator('#paper').click({ position: { x: 90, y: 75 } });
  await secondary.getByLabel('Text or equation').fill('My Brave note');
  await secondary.getByRole('button', { name: 'Write', exact: true }).click();
  await primary.locator('[aria-label="My Brave note"]').waitFor({ state: 'attached' });
  await primary.getByRole('button', { name: 'Settings', exact: true }).click();
  await primary.getByRole('button', { name: 'Add page' }).click();
  await secondary.getByRole('button', { name: 'Page 2 of 2' }).waitFor();
  await post(url, [{ type: 'resize-page', width: 1700, height: 1000 }]);
  await secondary.waitForFunction(() => document.querySelector('#paper').getAttribute('viewBox') === '0 0 1700 1000');
  await post(url, [write('Now visible on both browsers')]);
  await Promise.all([primary, secondary].map(page =>
    page.locator('[aria-label="Now visible on both browsers"]').waitFor({ state: 'attached' })));
});

test('full screen, fallback expansion, symbols and reconnect all preserve the page', {
  timeout: 25000
}, async t => {
  const { url, stop, restart, context } = await browserTest(t, { reducedMotion: 'reduce' });
  const page = await context.newPage();
  await live(page, url);
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await page.getByRole('button', { name: 'Exit full screen' }).waitFor();
  assert.ok(await page.locator('main').evaluate(element => document.fullscreenElement === element ||
    element.classList.contains('board-expanded')));
  await page.getByRole('button', { name: 'Page 1 of 1' }).click();
  await page.getByRole('dialog', { name: 'Board settings' }).waitFor();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await page.getByRole('button', { name: 'Full screen', exact: true }).waitFor();

  await page.evaluate(() => {
    document.querySelector('main').requestFullscreen = () => Promise.reject(new Error('Test native denial'));
  });
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await page.getByRole('button', { name: 'Exit full screen' }).waitFor();
  assert.ok(await page.locator('main').evaluate(element => element.classList.contains('board-expanded')));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Full screen', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Green ink', exact: true }).click();
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.locator('#paper').click({ position: { x: 100, y: 90 } });
  await page.getByRole('button', { name: 'Square root', exact: true }).click();
  await page.getByLabel('Text or equation').pressSequentially('36 = 6');
  await page.getByRole('button', { name: 'Write', exact: true }).click();
  await count(page, 1);
  const before = await read(url);
  assert.equal(before.marks[0].text, '√36 = 6');
  assert.equal(before.marks[0].color, '#14735d');
  await stop();
  await page.getByText('Reconnecting', { exact: true }).waitFor();
  await restart();
  await page.getByText('Live', { exact: true }).waitFor();
  assert.deepEqual(await read(url), before);
  await count(page, 1);
});
