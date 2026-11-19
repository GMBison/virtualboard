import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { applyActions, boardUrl, ensureBoard, openExternal, readBoard, summarize } from '../lib/client.mjs';
import { boardPng } from '../lib/image.mjs';
import { COLORS, MAX_HEIGHT, MAX_WIDTH, MIN_HEIGHT, MIN_WIDTH } from '../lib/schema.mjs';

const server = new McpServer({ name: 'virtualboard', version: '1.0.0' }, {
  instructions: 'When asked to use the whiteboard, open it visibly before adding ink unless the user already has it open. Read existing work and page space first. Use manage_pages to continue whenever the current page is nearly full. Send short animated steps and preserve the user’s ink.'
});
const result = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const handler = fn => async input => {
  try { return await fn(input); }
  catch (error) { return { ...result(error.message), isError: true }; }
};
const x = z.number().min(0).max(MAX_WIDTH);
const y = z.number().min(0).max(MAX_HEIGHT);
const pageId = z.string().optional().describe('ID of the active page from read_board. If the user switches pages, the edit is rejected.');
const color = z.enum(COLORS).optional();
const say = z.string().max(250).optional().describe('Optional spoken explanation for this step. Write out pronunciations for equations.');
// Some hosts cannot expose tagged unions or positional tuples as tool inputs.
// The shared server validator still enforces the fields required by each action.
const action = z.object({
  type: z.enum(['write', 'stroke']),
  x: x.optional(),
  y: y.optional(),
  text: z.string().max(480).optional(),
  size: z.number().min(14).max(72).optional(),
  points: z.array(z.array(z.number()).length(2)).min(1).max(1600).optional()
    .describe('Stroke points as arrays of exactly two numbers, [x,y].'),
  width: z.number().min(1).max(24).optional(),
  color,
  say
});
server.registerTool('open_board', {
  description: 'Start the local board. Default returns a URL you should make visible using the Codex in-app browser. Select brave only when requested.',
  inputSchema: { browser: z.enum(['in-app', 'brave', 'default']).optional() }
}, handler(async ({ browser = 'in-app' }) => {
  await ensureBoard();
  if (browser !== 'in-app') await openExternal(browser);
  return result({ url: boardUrl, browser, activePage: (await readBoard()).activePage });
}));
server.registerTool('read_board', {
  description: 'Read active page dimensions, all page IDs, available writing space, and marks in paint order. Use space.nextY and remainingHeight to lay out a lesson. Use includePoints for exact stroke points or inspect_board for a PNG.',
  annotations: { readOnlyHint: true },
  inputSchema: { offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).optional(),
    includePoints: z.boolean().optional() }
}, handler(async ({ offset = 0, limit = 30, includePoints = false }) => {
  const { marks, ...meta } = await readBoard();
  const take = Math.min(limit, includePoints ? 5 : 100);
  return result({ ...meta, total: marks.length, nextOffset: offset + take < marks.length ? offset + take : null,
    marks: marks.slice(offset, offset + take).map(mark => summarize(mark, includePoints)) });
}));
server.registerTool('inspect_board', {
  description: 'See a PNG of the committed page, including user freehand ink. Use read_board for exact typed text and revision.',
  annotations: { readOnlyHint: true },
  inputSchema: {}
}, handler(async () => {
  const { marks, revision, activePage } = await readBoard();
  const image = await boardPng(marks, activePage);
  return { content: [
    { type: 'text', text: activePage.name + ', revision ' + revision + ', ' + marks.length + ' marks.' },
    { type: 'image', data: image.toString('base64'), mimeType: 'image/png' }
  ] };
}));
server.registerTool('draw_on_board', {
  description: 'Add a batch of animated marks. Default lesson placement continues on a new page when the current page is nearly full. Use annotate only when adding directly beside existing work. Write at top-left x,y. Use stroke for diagrams and say for narration.',
  annotations: { destructiveHint: false, idempotentHint: false },
  inputSchema: { actions: z.array(action).min(1).max(80), pageId,
    placement: z.enum(['lesson', 'annotate']).optional() }
}, handler(async ({ actions, pageId, placement }) => result(await applyActions(actions, pageId, {
  continueLesson: placement !== 'annotate'
}))));
server.registerTool('edit_board', {
  description: 'Erase marks by their IDs, undo or redo one transaction, or clear the board when explicitly requested.',
  annotations: { destructiveHint: true, idempotentHint: false },
  inputSchema: { type: z.enum(['erase', 'undo', 'redo', 'clear']), pageId,
    ids: z.array(z.string()).min(1).max(1200).optional().describe('Required for erase.') }
}, handler(async ({ pageId, ...action }) => result(await applyActions([action], pageId))));
server.registerTool('manage_pages', {
  description: 'Create a blank active page (new-page), switch to an existing page by id (select-page), or change the active canvas dimensions (resize-page). Start a new page before the next writing step would overflow the current page. Resizing retains ink and refuses to cut it off.',
  annotations: { destructiveHint: false, idempotentHint: false },
  inputSchema: {
    type: z.enum(['new-page', 'select-page', 'resize-page']),
    pageId,
    id: z.string().optional().describe('Target page ID for select-page.'),
    name: z.string().max(70).optional().describe('Optional name for new-page.'),
    width: z.number().int().min(MIN_WIDTH).max(MAX_WIDTH).optional(),
    height: z.number().int().min(MIN_HEIGHT).max(MAX_HEIGHT).optional()
  }
}, handler(async ({ pageId, ...action }) => {
  const updated = await applyActions([action], pageId);
  const { activePage, pages, space } = await readBoard();
  return result({ ...updated, activePage, pages, space });
}));
await server.connect(new StdioServerTransport());
