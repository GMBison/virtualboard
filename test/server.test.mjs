import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawnSync } from 'node:child_process';
import { get } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { boardSvg } from '../lib/image.mjs';
import { post, read, testBoard, write } from './helpers.mjs';

test('access boundaries and invalid or oversized batches leave state unchanged', async t => {
  const { url } = await (await testBoard(t)).start();
  assert.equal((await post(url, [write('reject')], { origin: 'https://example.org' })).status, 403);
  assert.equal((await post(url, [write('reject')], { 'x-virtualboard': '0' })).status, 403);
  const badHost = await new Promise((resolve, reject) => {
    get(url, { headers: { host: 'evil.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await post(url, [write('reject')], { 'sec-fetch-site': 'cross-site' })).status, 403);
  for (const invalid of [[], [write('fine'), write('bad', 999)], [{ type: 'stroke', points: [[-1, 4]] }],
      Array(81).fill(write('over batch')), [write('x'.repeat(270000))], [write('bad color', 40, { color: 'red' })]]) {
    assert.equal((await post(url, invalid)).status, 400);
  }
  const empty = await read(url);
  assert.deepEqual([empty.revision, empty.marks, empty.canUndo, empty.canRedo], [0, [], false, false]);
  assert.equal(empty.pages.length, 1);
});

test('parallel batches commit once, survive restart and restore by group', async t => {
  const fixture = await testBoard(t);
  const { url, stop } = await fixture.start();
  const batches = 40;
  const responses = await Promise.all(Array.from({ length: batches }, (_, number) =>
    post(url, [write('Start ' + number), write('End ' + number)])));
  const revisions = await Promise.all(responses.map(async response => {
    assert.equal(response.status, 200);
    return (await response.json()).revision;
  }));
  assert.equal(new Set(revisions).size, batches);
  let state = await read(url);
  assert.equal(state.marks.length, batches * 2);
  for (let i = 0; i < state.marks.length; i += 2) {
    assert.equal(state.marks[i].text.slice(6), state.marks[i + 1].text.slice(4));
  }
  const old = state.marks;
  await post(url, [{ type: 'erase', ids: [old[1].id, 'missing'] }]);
  await post(url, [{ type: 'clear' }]);
  await stop();
  const restarted = await fixture.start();
  state = await read(restarted.url);
  assert.equal(state.revision, batches + 2);
  assert.equal(state.marks.length, 0);
  await post(restarted.url, [{ type: 'undo' }, { type: 'undo' }]);
  assert.deepEqual((await read(restarted.url)).marks, old);
  await post(restarted.url, [{ type: 'redo' }]);
  assert.equal((await read(restarted.url)).marks.length, old.length - 1);
  await post(restarted.url, [write('New branch')]);
  assert.equal((await read(restarted.url)).canRedo, false);
});

test('SSE streams snapshots and committed edits with ordered revisions', async t => {
  const { url } = await (await testBoard(t)).start();
  const controller = new AbortController();
  const stream = await fetch(new URL('/events', url), { signal: controller.signal });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const next = async () => {
    while (!buffer.includes('\n\n')) {
      const part = await reader.read();
      assert.equal(part.done, false);
      buffer += part.value;
    }
    const index = buffer.indexOf('\n\n');
    const message = buffer.slice(0, index);
    buffer = buffer.slice(index + 2);
    const [name, data] = message.split('\n');
    return [name.slice(7), JSON.parse(data.slice(6))];
  };
  try {
    assert.equal((await next())[0], 'snapshot');
    await post(url, [write('Stroke by stroke', 40, { say: 'Watch the cursor.' })]);
    const [event, update] = await next();
    assert.equal(event, 'update');
    assert.equal(update.revision, 1);
    assert.equal(update.actions[0].say, 'Watch the cursor.');
    assert.equal((await read(url)).marks[0].say, undefined);
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
});

test('MCP handles bidirectional ink and real PNG snapshots', async t => {
  const fixture = await testBoard(t);
  const { url } = await fixture.start();
  const env = { ...process.env, VIRTUALBOARD_PORT: url.port, VIRTUALBOARD_DATA: fixture.data };
  const harness = spawnSync(process.execPath, ['board.mjs', 'apply', '-'], {
    env, input: '\ufeff' + JSON.stringify([write('CLI wrote first')]), encoding: 'utf8'
  });
  assert.equal(harness.status, 0, harness.stderr);
  const client = new Client({ name: 'virtualboard-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [process.env.VIRTUALBOARD_TEST_MCP ?? 'mcp/index.mjs'],
    env, stderr: 'inherit'
  }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(),
      ['draw_on_board', 'edit_board', 'inspect_board', 'manage_pages', 'open_board', 'read_board']);
    const call = (name, args = {}) => client.callTool({ name, arguments: args });
    assert.equal(JSON.parse((await call('open_board')).content[0].text).url, url.href);
    await post(url, [{ type: 'stroke', points: [[14, 20], [44, 52]] }]);
    const observed = JSON.parse((await call('read_board')).content[0].text);
    assert.equal(observed.marks[0].text, 'CLI wrote first');
    assert.deepEqual(observed.marks[1].bounds, { left: 14, top: 20, right: 44, bottom: 52 });
    const precise = JSON.parse((await call('read_board', { includePoints: true, offset: 1 })).content[0].text);
    assert.deepEqual(precise.marks[0].points, [[14, 20], [44, 52]]);
    const invalid = await call('draw_on_board', { actions: [write('Bad position', -1)] });
    assert.equal(invalid.isError, true);
    const drawn = await call('draw_on_board', { actions: [write('√72 = 6√2', 145), write('<script>&"') ] });
    assert.equal(JSON.parse(drawn.content[0].text).applied, 2);
    const state = await read(url);
    assert.equal(state.marks[2].text, '√72 = 6√2');
    assert.match(boardSvg(state.marks), /&lt;script&gt;&amp;&quot;/);
    assert.doesNotMatch(boardSvg(state.marks), /<script>/);
    const image = (await call('inspect_board')).content[1];
    assert.equal(image.mimeType, 'image/png');
    const bytes = Buffer.from(image.data, 'base64');
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 1100);
    assert.equal(bytes.readUInt32BE(20), 720);
    await call('edit_board', { type: 'erase', ids: [state.marks[1].id] });
    assert.equal((await read(url)).marks.some(mark => mark.id === state.marks[1].id), false);
    await call('edit_board', { type: 'undo' });
    assert.deepEqual((await read(url)).marks, state.marks);
    const next = await call('manage_pages', { type: 'new-page', name: 'Next example', width: 1600, height: 900,
      pageId: state.activePage.id });
    const created = JSON.parse(next.content[0].text).activePage;
    assert.equal(created.width, 1600);
    const wrong = await call('draw_on_board', { actions: [write('stale')], pageId: state.activePage.id });
    assert.equal(wrong.isError, true);
    const onNew = await call('draw_on_board', { actions: [write('On the wide page', 750)], pageId: created.id });
    assert.equal(onNew.isError, undefined);
    const widePng = Buffer.from((await call('inspect_board')).content[1].data, 'base64');
    assert.equal(widePng.readUInt32BE(16), 1600);
    assert.equal(widePng.readUInt32BE(20), 900);
    assert.equal((await post(url, [write('Bottom note', 825)])).status, 200);
    const annotation = await call('draw_on_board', { actions: [write('Beside existing work')],
      pageId: created.id, placement: 'annotate' });
    assert.equal(JSON.parse(annotation.content[0].text).activePageId, created.id);
    const continuation = await call('draw_on_board', {
      actions: [write('Continuation', 820)], pageId: created.id
    });
    assert.equal(continuation.isError, undefined);
    assert.equal(JSON.parse(continuation.content[0].text).continuedOnNewPage, true);
    const turned = await read(url);
    assert.equal(turned.activePage.name, 'Page 3');
    assert.deepEqual([turned.activePage.width, turned.activePage.height], [1600, 900]);
    assert.equal(turned.pages[1].markCount, 3);
    assert.equal(turned.marks[0].y, 56);
  } finally {
    await client.close();
  }
});

test('pages have independent history, placement limits and durable dimensions', async t => {
  const fixture = await testBoard(t);
  const { url, stop } = await fixture.start();
  await post(url, [write('First example', 630)]);
  const first = await read(url);
  assert.equal(first.space.almostFull, true);
  assert.ok(first.space.remainingHeight < 60);
  const overflow = await post(url, [write('reject the entire batch'), write('This cannot fit', 685)]);
  assert.equal(overflow.status, 400);
  assert.equal((await read(url)).revision, first.revision);
  await post(url, [{ type: 'new-page', width: 1500, height: 960 }]);
  const second = await read(url);
  assert.equal(second.pages.length, 2);
  assert.equal(second.canUndo, false);
  await post(url, [write('Second example', 823, { x: 1140, size: 24 })]);
  const rejection = await post(url, [{ type: 'resize-page', width: 1100, height: 720 }]);
  assert.equal(rejection.status, 400);
  await post(url, [{ type: 'resize-page', width: 1900, height: 1200 }]);
  const resized = await read(url);
  assert.equal(resized.activePage.width, 1900);
  assert.equal(resized.marks[0].wrapWidth, 1500);
  await post(url, [{ type: 'undo' }]);
  assert.equal((await read(url)).activePage.width, 1500);
  await post(url, [{ type: 'redo' }]);
  await post(url, [{ type: 'select-page', id: first.activePage.id }]);
  const selected = await read(url);
  assert.deepEqual(selected.marks, first.marks);
  assert.equal(selected.canUndo, true);
  assert.equal(selected.pages[1].width, 1900);
  await stop();
  const restarted = await fixture.start();
  assert.deepEqual(await read(restarted.url), selected);
});

test('existing single-page boards migrate without losing ink or history', async t => {
  const fixture = await testBoard(t);
  const mark = { ...write('Old notes'), id: 'legacy-mark', size: 30, color: '#28334a' };
  await writeFile(join(fixture.data, 'board.json'), JSON.stringify({
    marks: [mark], undo: [[]], redo: [], revision: 12
  }));
  const { url } = await fixture.start();
  const state = await read(url);
  assert.equal(state.revision, 12);
  assert.equal(state.activePage.name, 'Page 1');
  assert.deepEqual(state.marks, [mark]);
  await post(url, [{ type: 'undo' }]);
  assert.deepEqual((await read(url)).marks, []);
  await post(url, [{ type: 'redo' }]);
  assert.deepEqual((await read(url)).marks, [mark]);
});
