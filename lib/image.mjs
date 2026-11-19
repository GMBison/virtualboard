import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { markNode } from '../public/ink.js';
import { HEIGHT, WIDTH } from './schema.mjs';

const require = createRequire(import.meta.url);
const escape = value => String(value).replace(/[<>&"]/g, char => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'
})[char]);
let initialized;

function xml(tag, attributes = {}) {
  const children = [];
  return {
    textContent: '',
    setAttribute(name, value) { attributes[name] = value; },
    append(...nodes) { children.push(...nodes); },
    toString() {
      const attrs = Object.entries(attributes).map(([name, value]) => ' ' + name + '="' + escape(value) + '"').join('');
      return '<' + tag + attrs + '>' + escape(this.textContent) + children.join('') + '</' + tag + '>';
    }
  };
}
export function boardSvg(marks, { width = WIDTH, height = HEIGHT } = {}) {
  const root = xml('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: '0 0 ' + width + ' ' + height });
  root.append(xml('rect', { width, height, fill: '#fffefa' }));
  for (const mark of marks) root.append(markNode(mark, xml));
  return root.toString();
}

export async function boardPng(marks, page) {
  initialized ??= (async () => {
    const embedded = new URL('../index_bg.wasm', import.meta.url);
    let bytes;
    try {
      bytes = await readFile(embedded);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      bytes = await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm'));
    }
    return initWasm(bytes);
  })();
  await initialized;
  const image = new Resvg(boardSvg(marks, page));
  try {
    const rendered = image.render();
    try {
      return Buffer.from(rendered.asPng());
    } finally {
      rendered.free();
    }
  } finally {
    image.free();
  }
}
