import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

export async function testBoard(t) {
  const data = await mkdtemp(join(tmpdir(), 'virtualboard-test-'));
  const live = new Set();
  const stop = async instance => {
    if (instance.exitCode === null) {
      const closed = once(instance, 'exit');
      instance.kill();
      await closed;
    }
  };
  t.after(async () => {
    await Promise.all([...live].map(stop));
    await rm(data, { recursive: true, force: true });
  });
  return {
    data,
    async start(port = 0) {
      const child = spawn(process.execPath, ['server.mjs'], {
        env: { ...process.env, VIRTUALBOARD_PORT: String(port), VIRTUALBOARD_DATA: data },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      live.add(child);
      child.once('exit', () => live.delete(child));
      child.stderr.on('data', chunk => process.stderr.write(chunk));
      const lines = createInterface({ input: child.stdout });
      const url = await Promise.race([
        once(lines, 'line').then(([line]) => new URL(line.split(' ').at(-1) + '/')),
        once(child, 'exit').then(([code]) => { throw new Error('Board stopped with code ' + code); })
      ]);
      return { url, stop: () => stop(child) };
    }
  };
}
export const headers = { 'content-type': 'application/json', 'x-virtualboard': '1' };
export const post = (url, actions, override) => fetch(new URL('/api/actions', url), {
  method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(actions)
});
export const read = async url => (await fetch(new URL('/api/board', url))).json();
export const write = (text, y = 40, options = {}) => ({ type: 'write', text, x: 40, y, ...options });
