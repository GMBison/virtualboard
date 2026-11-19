import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBatch } from './lib/schema.mjs';
import { createPage, migrate, pageSpace, pageSummary } from './lib/pages.mjs';
import { transact } from './lib/transactions.mjs';

const port = Number(process.env.VIRTUALBOARD_PORT ?? 4397);
const host = '127.0.0.1';
const data = resolve(process.env.VIRTUALBOARD_DATA ?? resolve(homedir(), '.virtualboard'));
const stateFile = resolve(data, 'board.json');
const files = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/board.js', ['public/board.js', 'text/javascript; charset=utf-8']],
  ['/ink.js', ['public/ink.js', 'text/javascript; charset=utf-8']],
  ['/demo.js', ['public/demo.js', 'text/javascript; charset=utf-8']],
  ['/schema.js', ['lib/schema.mjs', 'text/javascript; charset=utf-8']]
]);
const security = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
};
const storageLimit = 12 * 1024 * 1024;
const clients = new Set();
const firstPage = createPage('Page 1');
let state = { pages: [firstPage], activePageId: firstPage.id, revision: 0 };
let serial = Promise.resolve();

await mkdir(data, { recursive: true });
try {
  if ((await stat(stateFile)).size > storageLimit) throw new Error('Saved board exceeds the storage limit.');
  state = migrate(JSON.parse(await readFile(stateFile, 'utf8')));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function json(response, status, value) {
  response.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function send(client, event, value) {
  if (client.destroyed || client.writableLength > 256 * 1024) {
    clients.delete(client);
    client.destroy();
    return;
  }
  client.write('event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n');
}

async function body(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total <= 256 * 1024) chunks.push(chunk);
  }
  if (total > 256 * 1024) throw new Error('Request exceeds 256 KB.');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function metadata(page = state.pages.find(item => item.id === state.activePageId)) {
  return {
    revision: state.revision, activePage: pageSummary(page), pages: state.pages.map(pageSummary),
    canUndo: !!page.undo.length, canRedo: !!page.redo.length, space: pageSpace(page)
  };
}
function snapshot() {
  const page = state.pages.find(item => item.id === state.activePageId);
  return { ...metadata(page), marks: page.marks };
}

async function commit(actions, options) {
  const { next, applied, pageChanged, playback, continuedOnNewPage } = transact(state, actions, options);
  if (!applied) return { revision: state.revision, applied: 0, activePageId: state.activePageId };
  let encoded = JSON.stringify(next);
  if (Buffer.byteLength(encoded) > storageLimit) {
    encoded = pruneHistory(next);
  }
  if (Buffer.byteLength(encoded) > storageLimit) throw Error('Board storage is full. Export old pages and erase their ink.');
  await writeFile(stateFile + '.tmp', encoded);
  await rename(stateFile + '.tmp', stateFile);
  state = next;
  const event = pageChanged ? 'snapshot' : 'update';
  const update = continuedOnNewPage ? { ...metadata(), marks: [], actions: playback } :
    pageChanged ? snapshot() : { ...metadata(), actions: playback };
  for (const client of clients) send(client, event, update);
  return { revision: state.revision, applied, activePageId: state.activePageId, continuedOnNewPage };
}

function pruneHistory(next) {
  const histories = next.pages.flatMap(page => [page.undo, page.redo]);
  let encoded = JSON.stringify(next);
  while (Buffer.byteLength(encoded) > storageLimit) {
    const longest = histories.reduce((left, right) => left.length >= right.length ? left : right);
    if (!longest.length) break;
    longest.shift();
    encoded = JSON.stringify(next);
  }
  return encoded;
}

const server = createServer(async (request, response) => {
  const allowed = [host + ':' + server.address().port, 'localhost:' + server.address().port];
  if (!allowed.includes(request.headers.host) || (request.headers.origin &&
      !allowed.some(name => 'http://' + name === request.headers.origin)) ||
      request.headers['sec-fetch-site'] === 'cross-site') {
    return json(response, 403, { error: 'Use the local board address.' });
  }
  const path = request.url;
  if (request.method === 'GET' && path === '/events') {
    if (clients.size >= 24) return json(response, 503, { error: 'Too many board tabs are open.' });
    response.writeHead(200, { ...security, 'Content-Type': 'text/event-stream; charset=utf-8' });
    clients.add(response);
    response.on('close', () => clients.delete(response));
    return send(response, 'snapshot', snapshot());
  }
  if (request.method === 'GET' && path === '/api/status') {
    return json(response, 200, { app: 'virtualboard', revision: state.revision });
  }
  if (request.method === 'GET' && path === '/api/board') {
    return json(response, 200, snapshot());
  }
  if (request.method === 'POST' && path === '/api/actions') {
    if (request.headers['x-virtualboard'] !== '1' ||
        request.headers['content-type']?.split(';')[0] !== 'application/json') {
      return json(response, 403, { error: 'Expected a VirtualBoard JSON request.' });
    }
    let actions;
    try {
      actions = validateBatch(await body(request));
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    const options = {
      immediate: request.headers['x-virtualboard-live-pen'] === '1',
      expectedPageId: request.headers['x-virtualboard-page'],
      continueLesson: request.headers['x-virtualboard-continue-lesson'] === '1'
    };
    const operation = serial.then(() => commit(actions, options));
    serial = operation.catch(() => {});
    try {
      return json(response, 200, await operation);
    } catch (error) {
      if (error.code) {
        console.error(error);
        return json(response, 500, { error: 'Could not save the board.' });
      }
      return json(response, error.status ?? 409, { error: error.message });
    }
  }
  if (request.method === 'GET' && files.has(path)) {
    const [file, contentType] = files.get(path);
    try {
      const contents = await readFile(new URL(file, import.meta.url));
      response.writeHead(200, { ...security, 'Content-Type': contentType });
      return response.end(contents);
    } catch (error) {
      console.error(error);
      return json(response, 500, { error: 'Could not load the application.' });
    }
  }
  json(response, 404, { error: 'Page not found.' });
});
const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (client.writableLength > 256 * 1024) client.destroy();
    else client.write(': heartbeat\n\n');
  }
}, 15000);
heartbeat.unref();
server.listen(port, host, () => {
  console.log('VirtualBoard listening at http://' + host + ':' + server.address().port);
});
