import { randomUUID } from 'node:crypto';
import { layout } from '../public/ink.js';
import { HEIGHT, WIDTH } from './schema.mjs';

const boundsCache = new WeakMap();
export function createPage(name, width = WIDTH, height = HEIGHT) {
  return { id: randomUUID(), name, width, height, marks: [], undo: [], redo: [] };
}

export function pageSummary(page) {
  const { id, name, width, height, marks } = page;
  return { id, name, width, height, markCount: marks.length };
}

function measure(mark) {
  if (mark.type === 'stroke') {
    const half = mark.width / 2;
    const xs = mark.points.map(point => point[0]);
    const ys = mark.points.map(point => point[1]);
    return {
      left: Math.min(...xs) - half, top: Math.min(...ys) - half,
      right: Math.max(...xs) + half, bottom: Math.max(...ys) + half
    };
  }
  const lines = layout(mark.text, mark.size, (mark.wrapWidth ?? WIDTH) - 28 - mark.x);
  return {
    left: mark.x - mark.size * .2,
    top: mark.y - mark.size * .2,
    right: mark.x + Math.max(0, ...lines.map(line => {
      const last = line.at(-1);
      return last ? last.x + last.advance : 0;
    })),
    bottom: mark.y + (lines.length - 1) * mark.size * 1.65 + mark.size * 1.5
  };
}

export function markBounds(mark) {
  if (!boundsCache.has(mark)) boundsCache.set(mark, measure(mark));
  return boundsCache.get(mark);
}

export function fits(mark, page) {
  if (mark.type === 'stroke') return mark.points.every(([x, y]) => x <= page.width && y <= page.height);
  const bounds = markBounds(mark);
  return bounds.right + 24 <= page.width && bounds.bottom + 16 <= page.height;
}

export function pageSpace(page) {
  const nextY = Math.min(page.height, Math.ceil(Math.max(18,
    ...page.marks.map(mark => markBounds(mark).bottom)) + 24));
  const remainingHeight = Math.max(0, page.height - nextY - 30);
  return { nextY, remainingHeight, almostFull: remainingHeight < 120 };
}

export function migrate(saved) {
  if (!Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('Invalid board revision.');
  if (Array.isArray(saved.pages) && saved.pages.length) {
    if (!saved.pages.some(page => page.id === saved.activePageId)) throw new Error('Missing active page.');
    return saved;
  }
  if (!Array.isArray(saved.marks) || !Array.isArray(saved.undo) || !Array.isArray(saved.redo)) {
    throw new Error('Saved board has an invalid format.');
  }
  const page = createPage('Page 1');
  page.marks = saved.marks;
  const frame = marks => ({ width: WIDTH, height: HEIGHT, marks });
  page.undo = saved.undo.map(frame);
  page.redo = saved.redo.map(frame);
  return { pages: [page], activePageId: page.id, revision: saved.revision };
}
