import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { validateBatch } from './schema.mjs';

const port = Number(process.env.VIRTUALBOARD_PORT ?? 4397);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid VIRTUALBOARD_PORT.');
export const boardUrl = 'http://127.0.0.1:' + port + '/';
let pending;

async function request(path, options) {
  const response = await fetch(new URL(path, boardUrl), { ...options, signal: AbortSignal.timeout(8000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Board request failed.');
  return result;
}

async function probe() {
  try {
    return (await request('api/status')).app === 'virtualboard';
  } catch {
    return false;
  }
}

async function launch() {
  if (await probe()) return boardUrl;
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    { detached: true, stdio: 'ignore', windowsHide: true }
  );
  let spawnError;
  child.on('error', error => { spawnError = error; });
  child.unref();
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await probe()) return boardUrl;
    if (spawnError) throw spawnError;
    await delay(100);
  }
  throw new Error('Could not start VirtualBoard on port ' + port + '. Run node server.mjs from its folder to see the error.');
}

export function ensureBoard() {
  pending ??= launch().finally(() => { pending = undefined; });
  return pending;
}

export async function readBoard() {
  await ensureBoard();
  return request('api/board');
}

export async function applyActions(input, expectedPageId, { continueLesson = false } = {}) {
  const actions = validateBatch(input);
  await ensureBoard();
  return request('api/actions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-virtualboard': '1',
      ...(expectedPageId && { 'x-virtualboard-page': expectedPageId }),
      ...(continueLesson && { 'x-virtualboard-continue-lesson': '1' })
    },
    body: JSON.stringify(actions)
  });
}

function startBrowser(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export async function openExternal(browser) {
  await ensureBoard();
  if (browser === 'brave') {
    if (process.platform === 'darwin') return startBrowser('open', ['-a', 'Brave Browser', boardUrl]);
    if (process.platform !== 'win32') return startBrowser('brave-browser', [boardUrl]);
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const root of roots) {
      const executable = join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe');
      if (await access(executable).then(() => true, () => false)) {
        return startBrowser(executable, [boardUrl]);
      }
    }
    throw new Error('Could not find Brave in its standard Windows install locations.');
  }
  if (browser !== 'default') throw new Error('Choose brave or default.');
  if (process.platform === 'win32') return startBrowser('rundll32.exe', ['url.dll,FileProtocolHandler', boardUrl]);
  return startBrowser(process.platform === 'darwin' ? 'open' : 'xdg-open', [boardUrl]);
}

export function summarize(mark, includePoints) {
  if (!mark.points || includePoints) return mark;
  const { points, ...summary } = mark;
  return {
    ...summary, pointCount: points.length,
    bounds: {
      left: Math.min(...points.map(point => point[0])),
      top: Math.min(...points.map(point => point[1])),
      right: Math.max(...points.map(point => point[0])),
      bottom: Math.max(...points.map(point => point[1]))
    }
  };
}
