import { randomUUID } from 'node:crypto';
import { HEIGHT, MAX_MARKS, WIDTH } from './schema.mjs';
import { createPage, fits, pageSpace } from './pages.mjs';

const historyLimit = 20;
const checkpoint = ({ marks, width, height }) => ({ marks, width, height });
function failure(message, status) {
  return Object.assign(new Error(message), { status });
}

export function transact(state, actions, { immediate, expectedPageId, continueLesson }) {
  if (expectedPageId && expectedPageId !== state.activePageId) {
    throw failure('The active page changed. Read it again before applying edits.', 409);
  }
  const next = {
    ...state,
    pages: state.pages.map(page => ({ ...page, undo: [...page.undo], redo: [...page.redo] }))
  };
  let page = next.pages.find(candidate => candidate.id === next.activePageId);
  let before;
  let pageChanged = false;
  let continuedOnNewPage = false;
  let applied = 0;
  const playback = [];
  const save = () => {
    if (!before) return;
    page.undo.push(before);
    page.undo = page.undo.slice(-historyLimit);
    page.redo = [];
    before = undefined;
  };
  const addPage = ({ name, width = WIDTH, height = HEIGHT }) => {
    save();
    if (next.pages.length >= 50) throw failure('This board already contains 50 pages.', 409);
    page = createPage(name ?? 'Page ' + (next.pages.length + 1), width, height);
    next.pages.push(page);
    next.activePageId = page.id;
    pageChanged = true;
    applied++;
  };
  const lesson = continueLesson && actions.some(action => action.type === 'write') &&
    actions.every(action => action.type === 'write' || action.type === 'stroke');
  if (lesson && page.marks.length && pageSpace(page).almostFull) {
    const top = Math.min(...actions.map(action => action.type === 'write' ?
      action.y : Math.min(...action.points.map(point => point[1]))));
    const shift = Math.max(0, top - 56);
    if (shift) actions = actions.map(action => action.type === 'write' ?
      { ...action, y: action.y - shift } :
      { ...action, points: action.points.map(([x, y]) => [x, y - shift]) });
    addPage({ width: page.width, height: page.height });
    continuedOnNewPage = true;
  }
  for (const action of actions) {
    if (action.type === 'new-page') {
      addPage(action);
      continue;
    }
    if (action.type === 'select-page') {
      save();
      const selected = next.pages.find(candidate => candidate.id === action.id);
      if (!selected) throw failure('That page no longer exists.', 404);
      if (selected === page) continue;
      page = selected;
      next.activePageId = page.id;
      pageChanged = true;
      applied++;
      continue;
    }
    if (action.type === 'undo' || action.type === 'redo') {
      save();
      const frame = page[action.type].pop();
      if (!frame) continue;
      const destination = action.type === 'undo' ? page.redo : page.undo;
      destination.push(checkpoint(page));
      pageChanged ||= frame.width !== page.width || frame.height !== page.height;
      Object.assign(page, frame);
      playback.push({ type: 'replace', marks: page.marks });
      applied++;
      continue;
    }
    const previous = checkpoint(page);
    if (action.type === 'resize-page') {
      if (action.width === page.width && action.height === page.height) continue;
      const resized = { width: action.width, height: action.height };
      if (!page.marks.every(mark => fits(mark, resized))) {
        throw failure('That size would cut off existing ink. Choose a larger canvas.', 400);
      }
      Object.assign(page, resized);
      pageChanged = true;
    } else if (action.type === 'erase') {
      const erased = new Set(action.ids);
      page.marks = previous.marks.filter(mark => !erased.has(mark.id));
      if (page.marks.length === previous.marks.length) continue;
      playback.push(action);
    } else if (action.type === 'clear') {
      if (!page.marks.length) continue;
      page.marks = [];
      playback.push(action);
    } else {
      const { say, ...ink } = action;
      const mark = { ...ink, id: randomUUID() };
      if (mark.type === 'write') mark.wrapWidth = page.width;
      if (!fits(mark, page)) {
        throw failure('Ink does not fit on this page. Move it, reduce its size, or start a new page.', 400);
      }
      if (page.marks.length >= MAX_MARKS) throw failure('This page is full. Start a new page.', 409);
      page.marks = [...previous.marks, mark];
      playback.push({ ...mark, say, immediate: immediate && mark.type === 'stroke' });
    }
    before ??= previous;
    applied++;
  }
  save();
  if (applied) next.revision++;
  return { next, applied, pageChanged, playback, continuedOnNewPage };
}
