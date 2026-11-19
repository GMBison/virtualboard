import { COLORS, HEIGHT, WIDTH } from '/schema.js';
import { element, markNode, strokeNode } from '/ink.js';
import { demo } from '/demo.js';

const get = id => document.getElementById(id);
const paper = get('paper');
const viewport = get('paper-scroll');
const workspace = document.querySelector('main');
const fullScreenButton = get('fullscreen');
const marks = get('marks');
const preview = get('preview');
const cursor = get('cursor');
const connection = get('connection');
const undo = get('undo');
const redo = get('redo');
const finish = get('finish');
const voiceButton = get('voice');
const typeDialog = get('type-dialog');
const clearDialog = get('clear-dialog');
const settings = get('settings-dialog');
const typed = get('typed');
const caption = get('caption');
const rendered = new Map();
const queue = [];
const pendingPreviews = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const synth = window.speechSynthesis;
let revision = -1;
let paintedRevision = -1;
let tool = 'pen';
let color = COLORS[0];
let pointer;
let typeAt;
let clearPageId;
let activePage = { id: null, width: WIDTH, height: HEIGHT };
let pages = [];
let almostFull = false;
let pageListSignature = '';
let online = false;
let busy = false;
let instant = false;
let epoch = 0;
let voice = false;
let cancelSpeech;
let frame = 0;

function error(message) {
  const node = get(typeDialog.open ? 'type-error' : settings.open ? 'settings-error' : 'error');
  node.textContent = message;
  node.hidden = !message;
}
function status(isOnline, label) {
  online = isOnline;
  connection.classList.toggle('live', isOnline);
  connection.lastChild.textContent = ' ' + label;
  if (!online) undo.disabled = redo.disabled = true;
}
async function command(actions, livePen = false, pageId = activePage.id) {
  if (!online) {
    error('The board is reconnecting. Wait for the Live indicator.');
    return;
  }
  try {
    const response = await fetch('/api/actions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-virtualboard': '1',
        ...(pageId && { 'x-virtualboard-page': pageId }),
        ...(livePen && { 'x-virtualboard-live-pen': '1' })
      },
      body: JSON.stringify(actions)
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    error('');
    return result;
  } catch (failure) {
    error(failure.message || 'Could not save the edit.');
  }
}
function remove(id) {
  rendered.get(id)?.remove();
  rendered.delete(id);
}
function replace(all) {
  marks.replaceChildren();
  rendered.clear();
  for (const mark of all) {
    const node = markNode(mark);
    rendered.set(mark.id, node);
    marks.append(node);
  }
}
function painted(value) {
  paintedRevision = value;
  for (let i = pendingPreviews.length - 1; i >= 0; i--) {
    if (pendingPreviews[i].revision <= value) pendingPreviews.splice(i, 1)[0].node?.remove();
  }
}
function canAnimate(run) {
  return run === epoch && !instant && !reducedMotion.matches && !document.hidden;
}
function narrate(text) {
  if (!text || !voice || !synth) return Promise.resolve();
  caption.textContent = text;
  caption.hidden = false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  return new Promise(resolve => {
    let complete = false;
    const done = () => {
      if (complete) return;
      complete = true;
      clearTimeout(timeout);
      if (cancelSpeech === cancel) cancelSpeech = undefined;
      caption.hidden = true;
      resolve();
    };
    const cancel = () => { synth.cancel(); done(); };
    const timeout = setTimeout(cancel, 2500 + text.length * 95);
    cancelSpeech = cancel;
    utterance.onend = utterance.onerror = done;
    synth.speak(utterance);
  });
}
function animate(parts, run) {
  if (!parts.length || !canAnimate(run)) return Promise.resolve();
  const graphics = parts.map(part => ({
    part,
    length: part.tagName === 'path' ? Math.max(0.1, part.getTotalLength()) : 0,
    matrix: part.transform?.baseVal.consolidate()?.matrix
  }));
  for (const { part, length } of graphics) {
    if (!length) part.setAttribute('visibility', 'hidden');
    else {
      part.setAttribute('stroke-dasharray', length);
      part.setAttribute('stroke-dashoffset', length);
    }
  }
  const duration = graphics.length === 1 ? 340 : Math.min(4200, Math.max(140, graphics.length * 31));
  return new Promise(resolve => {
    const start = performance.now();
    let drawn = 0;
    const tick = timestamp => {
      const index = (timestamp - start) / duration * graphics.length;
      if (index >= graphics.length || !canAnimate(run)) {
        for (const { part } of graphics) {
          part.removeAttribute('stroke-dasharray');
          part.removeAttribute('stroke-dashoffset');
          part.removeAttribute('visibility');
        }
        cursor.setAttribute('hidden', '');
        return resolve();
      }
      while (drawn < Math.floor(index)) {
        const { part } = graphics[drawn++];
        part.removeAttribute('stroke-dashoffset');
        part.removeAttribute('stroke-dasharray');
        part.removeAttribute('visibility');
      }
      const { part, length, matrix } = graphics[drawn];
      if (length) {
        const progress = index - drawn;
        const offset = length * (1 - progress);
        part.setAttribute('stroke-dashoffset', offset);
        const position = part.getPointAtLength(length * progress);
        const coordinates = matrix ? position.matrixTransform(matrix) : position;
        cursor.setAttribute('cx', coordinates.x);
        cursor.setAttribute('cy', coordinates.y);
        cursor.setAttribute('fill', part.getAttribute('stroke'));
        cursor.removeAttribute('hidden');
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function playback() {
  if (busy) return;
  busy = true;
  finish.disabled = false;
  finish.hidden = false;
  try {
    while (queue.length) {
      const mark = queue.shift();
      if (mark.type === 'painted') { painted(mark.revision); continue; }
      if (mark.type === 'replace') { replace(mark.marks); continue; }
      if (mark.type === 'clear') { replace([]); continue; }
      if (mark.type === 'erase') { mark.ids.forEach(remove); continue; }
      const node = markNode(mark);
      rendered.set(mark.id, node);
      marks.append(node);
      if (!mark.immediate) {
        const sound = instant || document.hidden ? Promise.resolve() : narrate(mark.say);
        await Promise.all([animate([...node.children], epoch), sound]);
      }
    }
  } finally {
    busy = false;
    instant = false;
    finish.disabled = true;
    finish.hidden = true;
  }
}
function skip() {
  if (busy) instant = true;
  cancelSpeech?.();
}
finish.addEventListener('click', skip);
document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });

const events = new EventSource('/events');
function history(data) {
  const old = activePage;
  activePage = data.activePage;
  pages = data.pages;
  almostFull = data.space.almostFull;
  const position = pages.findIndex(page => page.id === activePage.id);
  const pageLabel = get('page-label');
  pageLabel.textContent = 'Page ' + (position + 1) + ' of ' + pages.length;
  pageLabel.title = activePage.name + ' · Open settings';
  if (old.id !== activePage.id || old.width !== activePage.width || old.height !== activePage.height) {
    paper.setAttribute('viewBox', '0 0 ' + activePage.width + ' ' + activePage.height);
    viewport.style.setProperty('--canvas-ratio', activePage.width / activePage.height);
    for (const layer of paper.querySelectorAll('rect')) {
      layer.setAttribute('width', activePage.width);
      layer.setAttribute('height', activePage.height);
    }
    setCanvasFields();
    if (old.id !== activePage.id) viewport.scrollTo(0, 0);
  }
  if (settings.open) renderPages();
  updateHint();
  undo.disabled = !data.canUndo;
  redo.disabled = !data.canRedo;
}
events.addEventListener('snapshot', event => {
  const data = JSON.parse(event.data);
  epoch++;
  const active = busy;
  skip();
  queue.length = 0;
  if (active) instant = false;
  if (pointer) resetPointer().node?.remove();
  revision = data.revision;
  replace(data.marks);
  history(data);
  status(true, 'Live');
  if (data.actions?.length) {
    queue.push(...data.actions, { type: 'painted', revision });
    void playback();
  } else {
    painted(revision);
  }
});
events.addEventListener('update', event => {
  const data = JSON.parse(event.data);
  if (data.revision <= revision) return;
  revision = data.revision;
  queue.push(...data.actions, { type: 'painted', revision });
  history(data);
  void playback();
});
events.addEventListener('error', () => status(false, 'Reconnecting'));

voiceButton.disabled = !synth;
voiceButton.addEventListener('click', () => {
  voice = !voice;
  voiceButton.setAttribute('aria-pressed', voice);
  voiceButton.textContent = voice ? 'Voice on' : 'Voice off';
  if (!voice) cancelSpeech?.();
});
const hints = {
  pen: 'Draw with your mouse, touch, or pen.',
  type: 'Choose a spot on the board to write there.',
  erase: 'Drag over ink to erase strokes or lines of writing.',
  pan: 'Drag to move around the zoomed board.'
};
function updateHint() {
  get('hint').textContent = almostFull && tool === 'pen' ? 'This page is nearly full. Add a page in Settings.' : hints[tool];
}
function selectTool(value) {
  tool = value;
  paper.dataset.tool = value;
  document.querySelectorAll('[data-tool]').forEach(button => {
    if (button !== paper) button.setAttribute('aria-pressed', button.dataset.tool === value);
  });
  get('pan').setAttribute('aria-pressed', value === 'pan');
  updateHint();
}
document.querySelectorAll('button[data-tool]').forEach(button => {
  button.setAttribute('aria-label', button.textContent.trim());
  button.addEventListener('click', () => selectTool(button.dataset.tool));
});
const colorNames = ['Graphite', 'Blue', 'Green', 'Red', 'Purple'];
for (const [index, ink] of COLORS.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.title = colorNames[index];
  button.setAttribute('aria-label', colorNames[index] + ' ink');
  button.setAttribute('aria-pressed', ink === color);
  const icon = element('svg', { viewBox: '0 0 28 28', 'aria-hidden': 'true' });
  icon.append(element('circle', { cx: 14, cy: 14, r: 8.2, fill: ink, stroke: 'none' }));
  button.append(icon);
  button.addEventListener('click', () => {
    color = ink;
    get('colors').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', item === button));
  });
  get('colors').append(button);
}
undo.addEventListener('click', () => { skip(); void command([{ type: 'undo' }]); });
redo.addEventListener('click', () => { skip(); void command([{ type: 'redo' }]); });
get('clear').addEventListener('click', () => {
  clearPageId = activePage.id;
  clearDialog.showModal();
});
clearDialog.addEventListener('close', () => {
  if (clearDialog.returnValue === 'clear') {
    skip();
    void command([{ type: 'clear' }], false, clearPageId);
  }
  clearDialog.returnValue = '';
});
get('demo').addEventListener('click', () => {
  if (activePage.markCount || busy) {
    error('The lesson needs a blank board. Clear your board first if you want to play it.');
    return;
  }
  void command(demo).then(result => { if (result) settings.close(); });
});
function setCanvasFields() {
  get('canvas-width').value = activePage.width;
  get('canvas-height').value = activePage.height;
}
function renderPages() {
  const signature = JSON.stringify([activePage.id, pages.map(({ id, name }) => [id, name])]);
  if (signature === pageListSignature) return;
  pageListSignature = signature;
  const group = get('page-list');
  group.replaceChildren();
  for (const page of pages) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = page.name;
    button.setAttribute('aria-current', page.id === activePage.id ? 'page' : 'false');
    button.addEventListener('click', () => {
      void command([{ type: 'select-page', id: page.id }]).then(result => { if (result) settings.close(); });
    });
    group.append(button);
  }
  get('new-page').disabled = pages.length >= 50;
}
function openSettings() {
  setCanvasFields();
  renderPages();
  settings.showModal();
  error('');
}
get('settings').addEventListener('click', openSettings);
get('page-label').addEventListener('click', openSettings);
get('new-page').addEventListener('click', () => {
  void command([{ type: 'new-page', width: activePage.width, height: activePage.height }])
    .then(result => { if (result) settings.close(); });
});
get('resize-form').addEventListener('submit', event => {
  event.preventDefault();
  void command([{ type: 'resize-page', width: get('canvas-width').valueAsNumber, height: get('canvas-height').valueAsNumber }])
    .then(result => { if (result) settings.close(); });
});
function setZoom(value) {
  if (!['100', '125', '150', '200'].includes(value)) value = '100';
  viewport.dataset.zoom = value;
  get('zoom').value = value;
  get('pan').hidden = value === '100';
  if (value === '100' && tool === 'pan') selectTool('pen');
}
try { setZoom(localStorage.getItem('virtualboard.zoom')); }
catch { setZoom('100'); }
get('zoom').addEventListener('change', event => {
  setZoom(event.target.value);
  try { localStorage.setItem('virtualboard.zoom', event.target.value); } catch {}
});
get('pan').addEventListener('click', () => selectTool(tool === 'pan' ? 'pen' : 'pan'));
function updateFullScreen() {
  const expanded = document.fullscreenElement === workspace || workspace.classList.contains('board-expanded');
  const label = expanded ? 'Exit full screen' : 'Full screen';
  fullScreenButton.setAttribute('aria-label', label);
  fullScreenButton.setAttribute('aria-pressed', expanded);
  fullScreenButton.title = label;
  get('expand-icon').toggleAttribute('hidden', expanded);
  get('collapse-icon').toggleAttribute('hidden', !expanded);
}
fullScreenButton.addEventListener('click', async () => {
  fullScreenButton.disabled = true;
  try {
    if (workspace.classList.contains('board-expanded')) workspace.classList.remove('board-expanded');
    else if (document.fullscreenElement === workspace) await document.exitFullscreen();
    else {
      try {
        if (!workspace.requestFullscreen) throw new Error('Fullscreen API unavailable.');
        await workspace.requestFullscreen();
      } catch {
        workspace.classList.add('board-expanded');
      }
    }
  } finally {
    updateFullScreen();
    fullScreenButton.disabled = false;
  }
});
document.addEventListener('fullscreenchange', updateFullScreen);
function position(event) {
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(paper.getScreenCTM().inverse());
  return [Math.max(0, Math.min(activePage.width, Math.round(point.x * 10) / 10)),
    Math.max(0, Math.min(activePage.height, Math.round(point.y * 10) / 10))];
}
function typeOnBoard(point) {
  typeAt = {
    x: Math.min(activePage.width - 100, Math.max(12, point[0])),
    y: Math.min(activePage.height - 60, Math.max(12, point[1])),
    pageId: activePage.id
  };
  typed.value = '';
  typeDialog.returnValue = '';
  typeDialog.showModal();
  error('');
  typed.focus();
}
get('symbols').addEventListener('click', event => {
  if (event.target.tagName !== 'BUTTON') return;
  const nextLength = typed.value.length - (typed.selectionEnd - typed.selectionStart) + 1;
  if (nextLength <= typed.maxLength) {
    typed.setRangeText(event.target.textContent, typed.selectionStart, typed.selectionEnd, 'end');
  }
  typed.focus();
});
get('type-form').addEventListener('submit', event => {
  if (event.submitter?.value !== 'write') return;
  event.preventDefault();
  if (!typed.value.trim()) return;
  const { x, y, pageId } = typeAt;
  const text = typed.value.trim();
  void command([{ type: 'write', x, y, text, size: 26, color }], false, pageId).then(result => {
    if (result && typeDialog.open && typed.value.trim() === text) typeDialog.close();
  });
});
function eraseAt(event) {
  const mark = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-mark]');
  if (mark && marks.contains(mark)) {
    pointer.erased.add(mark.dataset.mark);
    mark.classList.add('erasing');
  }
}
function renderPreview() {
  frame = 0;
  if (!pointer || pointer.tool !== 'pen') return;
  const node = strokeNode(pointer.points, pointer.color, 3.2);
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  pointer.node?.remove();
  pointer.node = node;
  preview.append(node);
}
function keepPreviewUntilPainted(node, saved) {
  if (!saved || saved.revision <= paintedRevision) node?.remove();
  else pendingPreviews.push({ node, revision: saved.revision });
}
paper.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || pointer || !online) return;
  if (tool === 'type') { typeOnBoard(position(event)); return; }
  paper.setPointerCapture(event.pointerId);
  pointer = { id: event.pointerId, tool, color, points: [position(event)], erased: new Set(), pageId: activePage.id };
  if (tool === 'pan') {
    pointer.pan = { x: event.clientX + viewport.scrollLeft, y: event.clientY + viewport.scrollTop };
    return;
  }
  if (tool === 'erase') eraseAt(event);
  else renderPreview();
});
function sample(event) {
  const point = position(event);
  const last = pointer.points.at(-1);
  if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.2) return;
  if (pointer.points.length >= 1600) {
    pointer.points = pointer.points.filter((_, index) => index % 2 === 0);
  }
  pointer.points.push(point);
}
paper.addEventListener('pointermove', event => {
  if (pointer?.id !== event.pointerId) return;
  if (pointer.pan) {
    viewport.scrollTo(pointer.pan.x - event.clientX, pointer.pan.y - event.clientY);
    return;
  }
  if (pointer.tool === 'erase') { eraseAt(event); return; }
  const events = event.getCoalescedEvents?.() ?? [];
  for (const step of events.length ? events : [event]) sample(step);
  if (!frame) frame = requestAnimationFrame(renderPreview);
});
function resetPointer() {
  const current = pointer;
  pointer = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
  return current;
}
paper.addEventListener('pointerup', event => {
  if (pointer?.id !== event.pointerId) return;
  if (pointer.pan) { resetPointer(); return; }
  if (pointer.tool === 'erase') {
    eraseAt(event);
    const current = resetPointer();
    if (!current.erased.size) return;
    skip();
    void command([{ type: 'erase', ids: [...current.erased] }], false, current.pageId).finally(() => {
      for (const id of current.erased) rendered.get(id)?.classList.remove('erasing');
    });
    return;
  }
  sample(event);
  cancelAnimationFrame(frame);
  renderPreview();
  const current = resetPointer();
  void command([{ type: 'stroke', points: current.points, color: current.color, width: 3.2 }], true, current.pageId)
    .then(saved => keepPreviewUntilPainted(current.node, saved));
});
for (const event of ['pointercancel', 'lostpointercapture']) {
  paper.addEventListener(event, input => {
    if (pointer?.id !== input.pointerId) return;
    const current = resetPointer();
    current.node?.remove();
    for (const id of current.erased) rendered.get(id)?.classList.remove('erasing');
  });
}
document.addEventListener('keydown', event => {
  if (typeDialog.open || clearDialog.open || settings.open || event.altKey || event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'escape' && workspace.classList.contains('board-expanded')) {
    workspace.classList.remove('board-expanded');
    updateFullScreen();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
    event.preventDefault();
    (key === 'y' || event.shiftKey ? redo : undo).click();
    return;
  }
  if (event.ctrlKey || event.metaKey) return;
  const picks = { p: 'pen', t: 'type', e: 'erase' };
  if (picks[key]) selectTool(picks[key]);
  if (tool === 'type' && event.target === paper && (key === 'enter' || key === ' ')) {
    event.preventDefault();
    const last = [...rendered.values()].at(-1)?.getBBox();
    const y = last ? last.y + last.height + 24 : 40;
    typeOnBoard([44, y]);
  }
});
get('export').addEventListener('click', () => {
  const clone = paper.cloneNode(true);
  for (const selector of ['#preview', '#cursor']) clone.querySelector(selector).remove();
  for (const attribute of ['stroke-dasharray', 'stroke-dashoffset', 'visibility']) {
    clone.querySelectorAll('[' + attribute + ']').forEach(node => node.removeAttribute(attribute));
  }
  clone.setAttribute('width', activePage.width);
  clone.setAttribute('height', activePage.height);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'virtualboard.svg';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
