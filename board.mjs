import { readFile, writeFile } from 'node:fs/promises';
import { applyActions, boardUrl, ensureBoard, openExternal, readBoard, summarize } from './lib/client.mjs';
import { demo } from './public/demo.js';

const [command, arg] = process.argv.slice(2);
async function readInput(source) {
  if (source !== '-') return readFile(source, 'utf8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
try {
  switch (command) {
    case 'start':
      console.log(await ensureBoard());
      break;
    case 'open':
      await openExternal(arg ?? 'default');
      console.log(boardUrl);
      break;
    case 'read': {
      const { marks, ...meta } = await readBoard();
      console.log(JSON.stringify({ ...meta, marks: marks.map(mark => summarize(mark, arg === '--points')) }, null, 2));
      break;
    }
    case 'apply': {
      if (!arg) throw new Error('Pass a UTF-8 JSON file or - for stdin.');
      const input = await readInput(arg);
      console.log(await applyActions(JSON.parse(input.replace(/^\uFEFF/, ''))));
      break;
    }
    case 'demo':
      if ((await readBoard()).marks.length) throw new Error('The surds lesson needs a blank board.');
      console.log(await applyActions(demo));
      break;
    case 'export': {
      if (!arg || !/\.(png|svg)$/i.test(arg)) throw new Error('Pass an output path ending in .png or .svg.');
      const { boardPng, boardSvg } = await import('./lib/image.mjs');
      const { marks, activePage } = await readBoard();
      const image = /\.png$/i.test(arg) ? await boardPng(marks, activePage) : boardSvg(marks, activePage);
      await writeFile(arg, image, { flag: 'wx' });
      console.log(arg);
      break;
    }
    default:
      console.log('Usage: node board.mjs start | open [brave|default] | read [--points] | apply <file|-> | demo | export <file.png|file.svg>');
      if (command && command !== '--help') process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
