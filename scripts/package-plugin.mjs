import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'plugins/virtualboard');
const require = createRequire(import.meta.url);
const packageInfo = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const { name, version } = packageInfo;
const description = 'A live whiteboard for handwritten explanations and two-way ink with Codex.';
const manifest = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name, version, description,
  extensions: { 'com.openai': { requires_local_executor: true, interface: { displayName: 'VirtualBoard' } } }
};
const settings = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  mcpServers: {
    virtualboard: {
      type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/mcp/index.mjs'], cwd: '${PLUGIN_ROOT}'
    }
  }
};
await mkdir(out, { recursive: true });
const copy = (source, target = source) => cp(resolve(root, source), resolve(out, target), { recursive: true });
const json = (path, value) => writeFile(resolve(out, path), JSON.stringify(value, null, 2) + '\n');

await Promise.all([
  json('plugin.json', manifest),
  json('mcp.json', settings),
  json('package.json', { name, version, private: true, type: 'module' }),
  copy('server.mjs'), copy('public'), copy('lib/schema.mjs'), copy('lib/pages.mjs'),
  copy('lib/transactions.mjs'), copy('LICENSE'),
  copy('.agents/skills/virtualboard', 'skills/virtualboard'),
  cp(require.resolve('@resvg/resvg-wasm/index_bg.wasm'), resolve(out, 'index_bg.wasm'))
]);
const output = await build({
  entryPoints: [resolve(root, 'mcp/index.mjs')], outfile: resolve(out, 'mcp/index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  banner: { js: "import { createRequire as cjsRequire } from 'node:module'; const require = cjsRequire(import.meta.url);" },
  legalComments: 'linked', metafile: true
});
const dependencyDirs = new Set(['@resvg/resvg-wasm']);
for (const input of Object.keys(output.metafile.inputs)) {
  const segments = input.split(/[/\\]/);
  const index = segments.lastIndexOf('node_modules');
  if (index < 0) continue;
  dependencyDirs.add(segments[index + 1].startsWith('@') ?
    segments.slice(index + 1, index + 3).join('/') : segments[index + 1]);
}
const licenses = ['Third-party notices for bundled VirtualBoard dependencies'];
for (const dependency of [...dependencyDirs].sort()) {
  const directory = resolve(root, 'node_modules', dependency);
  const names = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'NOTICE'];
  const notices = await Promise.all(names.map(file => readFile(resolve(directory, file), 'utf8').catch(() => null)));
  const info = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  licenses.push(dependency + ' ' + info.version + ' (' + (info.license ?? 'license in notice') + ')\n' +
    notices.filter(Boolean).join('\n'));
}
await writeFile(resolve(out, 'THIRD-PARTY-NOTICES.txt'), licenses.join('\n\n') + '\n');
console.log(out);
