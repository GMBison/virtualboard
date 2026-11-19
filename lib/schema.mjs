export const WIDTH = 1100;
export const HEIGHT = 720;
export const MIN_WIDTH = 480;
export const MIN_HEIGHT = 360;
export const MAX_WIDTH = 2200;
export const MAX_HEIGHT = 1600;
export const COLORS = ['#28334a', '#295cde', '#14735d', '#ba4634', '#8956b8'];
export const MAX_BATCH = 80;
export const MAX_MARKS = 1200;
const numeric = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const coordinate = (value, axis) => numeric(value, 0, axis);
const point = value => Array.isArray(value) && value.length === 2 &&
  coordinate(value[0], MAX_WIDTH) && coordinate(value[1], MAX_HEIGHT);
const str = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const boardText = (value, limit) => str(value, limit) &&
  [...value].every(char => {
    const point = char.codePointAt(0);
    return point === 9 || point === 10 || point === 13 ||
      (point >= 32 && point < 0xd800) || (point >= 0xe000 && point <= 0xfffd) || point >= 0x10000;
  });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const dimensions = (width, height) => Number.isInteger(width) && Number.isInteger(height) &&
  numeric(width, MIN_WIDTH, MAX_WIDTH) && numeric(height, MIN_HEIGHT, MAX_HEIGHT);

export function validateBatch(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_BATCH) {
    throw new Error('Send an array containing 1 to 80 actions.');
  }
  return value.map(action => {
    if (!record(action)) throw new Error('Every action must be an object.');
    const { type, x, y, text, points, size, width, height, color, say, ids, name } = action;
    if (say !== undefined && !str(say, 250)) throw new Error('Narration must be 1 to 250 characters.');
    const ink = color ?? COLORS[0];
    if (!COLORS.includes(ink)) throw new Error('Choose a color from the board palette.');
    const narration = say ? { say } : {};
    switch (type) {
      case 'write':
        if (!coordinate(x, MAX_WIDTH - 24) || !coordinate(y, MAX_HEIGHT - 24) ||
          !boardText(text, 480) || !numeric(size ?? 30, 14, 72)) break;
        return { type, x, y, text, size: size ?? 30, color: ink, ...narration };
      case 'stroke':
        if (!Array.isArray(points) || points.length < 1 || points.length > 1600 || !points.every(point) ||
          !numeric(width ?? 3, 1, 24)) break;
        return { type, points, width: width ?? 3, color: ink, ...narration };
      case 'erase':
        if (!Array.isArray(ids) || !ids.length || ids.length > MAX_MARKS || !ids.every(id)) break;
        return { type, ids: [...new Set(ids)] };
      case 'clear':
      case 'undo':
      case 'redo':
        return { type };
      case 'new-page':
        if (name !== undefined && !boardText(name, 70)) break;
        if (!dimensions(width ?? WIDTH, height ?? HEIGHT)) break;
        return { type, name: name?.trim(), width: width ?? WIDTH, height: height ?? HEIGHT };
      case 'select-page':
        if (!id(action.id)) break;
        return { type, id: action.id };
      case 'resize-page':
        if (!dimensions(width, height)) break;
        return { type, width, height };
    }
    throw new Error('Invalid action: ' + String(type).slice(0, 50));
  });
}
