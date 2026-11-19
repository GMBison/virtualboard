const glyphs = {
  A:'M0 10L3 0 6 10M1 6L5 6',B:'M0 10L0 0Q7 -1 6 3Q6 5 0 5Q7 4 7 8Q6 11 0 10',
  C:'M7 1Q0 -2 0 5Q0 12 7 9',D:'M0 10L0 0Q8 -1 8 5Q8 11 0 10',
  E:'M7 0L0 0 0 10 7 10M0 5L5 5',F:'M7 0L0 0 0 10M0 5L5 5',
  G:'M7 1Q0 -2 0 5Q0 12 7 9L7 5 4 5',H:'M0 0L0 10M7 0L7 10M0 5L7 5',
  I:'M1 0L6 0M3.5 0L3.5 10M1 10L6 10',J:'M6 0L6 8Q6 12 1 9',
  K:'M0 0L0 10M7 0L0 6 7 10',L:'M0 0L0 10 7 10',
  M:'M0 10L0 0 4 6 8 0 8 10',N:'M0 10L0 0 7 10 7 0',
  O:'M4 0C9 0 9 10 4 10S-1 0 4 0',P:'M0 10L0 0Q8 -1 7 4Q6 6 0 5',
  Q:'M4 0C9 0 9 10 4 10S-1 0 4 0M5 7L8 11',R:'M0 10L0 0Q8 -1 7 4Q6 6 0 5M3 5L7 10',
  S:'M7 1Q2 -2 0 2Q-1 4 4 5Q9 7 6 9Q3 11 0 9',T:'M0 0L8 0M4 0L4 10',
  U:'M0 0L0 7Q0 10 3.5 10Q7 10 7 7L7 0',V:'M0 0L3 10 7 0',
  W:'M0 0L2 10 5 4 8 10 10 0',X:'M0 0L7 10M7 0L0 10',
  Y:'M0 0L4 5 8 0M4 5L4 10',Z:'M0 0L7 0 0 10 7 10',
  a:'M6 5C2 1 -1 7 1 9Q3 12 6 7M6 4L6 10',b:'M0 0L0 10M0 7Q4 1 6 5Q9 10 1 10',
  c:'M6 5Q1 1 0 7Q0 12 6 9',d:'M6 5Q1 1 0 7Q0 12 6 8M6 0L6 10',
  e:'M0 7Q7 7 5 4Q1 2 0 7Q0 12 6 9',f:'M2 11L2 3Q2 -1 6 0M0 5L5 5',
  g:'M6 5Q1 1 0 7Q0 12 6 8M6 4L6 11Q6 15 0 13',h:'M0 0L0 10M0 7Q6 0 6 8L6 10',
  i:['M1 1l.02 .02M1 4L1 10',2.5],j:['M2 1l.02 .02M2 4L2 11Q2 14 -1 13',3],
  k:'M0 0L0 10M6 4L0 8 6 10',l:['M1 0L1 9Q1 10 2.5 10',3],
  m:['M0 4L0 10M0 6Q4 1 4 7L4 10M4 6Q9 1 9 7L9 10',9],
  n:'M0 4L0 10M0 7Q6 1 6 7L6 10',o:'M3 4C7 4 7 10 3 10S-1 4 3 4',
  p:'M0 4L0 14M0 7Q5 1 6 5Q8 10 0 10',q:'M6 5Q1 1 0 7Q0 12 6 8M6 4L6 14',
  r:['M0 4L0 10M0 7Q2 3 5 4',5],s:'M6 5Q2 2 0 5Q0 6 3 7Q8 9 4 10Q2 11 0 9',
  t:['M2 1L2 8Q2 11 5 9M0 4L5 4',5],u:'M0 4L0 7Q0 13 6 8M6 4L6 10',
  v:'M0 4L3 10 6 4',w:['M0 4L2 10 5 6 7 10 9 4',9],x:'M0 4L6 10M6 4L0 10',
  y:'M0 4L3 10M6 4L2 14',z:'M0 4L6 4 0 10 6 10',
  0:'M3 0C7 0 7 10 3 10S-1 0 3 0',1:['M0 2L2 0 2 10M0 10L4 10',4],
  2:'M0 2Q2 -2 6 1Q8 4 0 10L7 10',3:'M0 1Q7 -2 6 3Q6 5 2 5Q8 4 7 8Q6 12 0 9',
  4:'M5 0L0 7 7 7M5 2L5 10',5:'M7 0L1 0 0 5Q6 3 7 7Q8 12 0 9',
  6:'M6 0Q0 0 0 7Q0 11 4 10Q8 10 6 6Q3 3 0 6',7:'M0 0L7 0 2 10',
  8:'M3 0Q8 0 6 4Q0 6 0 8Q0 11 5 10Q9 9 6 6Q-2 3 1 1Q2 0 3 0',
  9:'M6 5Q0 8 0 3Q0 -1 4 0Q10 1 4 10',
  '+':'M0 5L7 5M3.5 1.5L3.5 8.5','-':'M0 5L7 5','−':'M0 5L7 5',
  '=':'M0 3.5L7 3.5M0 6.5L7 6.5','≠':'M0 3.5L7 3.5M0 6.5L7 6.5M5 1L2 9',
  '≈':'M0 4Q2 2 3.5 4T7 4M0 7Q2 5 3.5 7T7 7',
  '×':'M0 2L6 8M6 2L0 8','·':['M1 5l.02 .02',2],'÷':'M0 5L7 5M3.5 1.5l.02 .02M3.5 8.5l.02 .02',
  '/':['M0 11L5 -1',5],'(':['M3 -1Q-2 5 3 11',3],')':['M0 -1Q5 5 0 11',3],
  '[':['M3 -1L0 -1 0 11 3 11',3],']':['M0 -1L3 -1 3 11 0 11',3],
  '.':['M0.8 10l.02 .02',2],',':['M1.5 9.4L0 12',2],':':['M1 4l.02 .02M1 8l.02 .02',2],
  ';':['M1 4l.02 .02M1.5 8.5L0 11',2],"'":['M1 0L0.5 2.5',2],'’':['M1 0L0.5 2.5',2],
  '?':'M0 1Q7 -2 6 3Q5 4 3 5L3 7M3 10l.02 .02','!':['M1 0L1 7M1 10l.02 .02',2],
  '√':['M0 6L2 6 4 10 7 0 11 0',11],'π':'M0 4L7 4M2 4L1 10M5.5 4L5.5 9Q6 11 7 9',
  '²':['M0 0Q3 -2 4 0Q5 1 0 4L4 4',4],'³':['M0 0Q4 -2 4 0Q4 1 2 1Q5 1 4 3Q3 5 0 4',4],
  '^':['M0 4L2.5 0 5 4',5],'_':'M0 11L7 11','<':'M6 1L0 5 6 9','>':'M0 1L6 5 0 9',
  '→':['M0 5L10 5M6 1L10 5 6 9',10],'∞':['M5 5Q0 -1 0 5T5 5T10 5T5 5',10],
  '%':['M1 10L7 0M1 0a1.5 1.5 0 1 0 .01 0M6 7a1.5 1.5 0 1 0 .01 0',8],
  '|':['M1 -1L1 11',2],'&':'M7 10Q-1 3 1 1Q4 -2 5 1Q6 3 1 6Q-2 11 4 10Q6 10 7 6',
  '≤':'M7 0L0 4 7 8M0 10L7 10','≥':'M0 0L7 4 0 8M0 10L7 10',
  '±':'M0 4L7 4M3.5 1L3.5 7M0 10L7 10','≡':'M0 2L7 2M0 5L7 5M0 8L7 8',
  'θ':'M3.5 0C8 0 8 10 3.5 10S-1 0 3.5 0M0 5L7 5',
  'α':'M6 6Q3 1 1 5Q-2 10 2 10Q5 10 7 4M6 7Q6 10 8 10',
  'β':'M0 13L1 3Q2 -2 6 1Q8 3 3 5Q8 4 7 8Q6 11 1 9',
  'Δ':'M0 10L3.5 0 7 10Z','∆':'M0 10L3.5 0 7 10Z',
  '∠':'M7 1L0 10 7 10','∥':['M1 0L1 10M4 0L4 10',5],
  '∑':'M7 0L0 0 4 5 0 10 7 10','∫':['M5 0Q2 -1 2 4L2 8Q2 12 -1 11',5],
  '∈':'M7 1Q0 -1 0 5Q0 11 7 9M0 5L6 5',
  '°':['M3 1a1.5 1.5 0 1 0 .01 0',4]
};
const svg = 'http://www.w3.org/2000/svg';
export function element(tag, attributes = {}) {
  const node = document.createElementNS(svg, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
function glyph(char) {
  const path = glyphs[char];
  return Array.isArray(path) ? path : [path, char === ' ' ? 3.7 : (/[A-Z0-9]/.test(char) ? 7.8 : 6.9)];
}
export function layout(text, size, width) {
  const scale = size / 10;
  const lines = [[]];
  const advance = char => (glyph(char)[1] + 1.05) * scale;
  let x = 0;
  const newline = () => { lines.push([]); x = 0; };
  for (const token of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split(/(\n| +)/u)) {
    if (token === '\n') { newline(); continue; }
    const chars = [...token];
    const extent = chars.reduce((sum, char) => sum + advance(char), 0);
    if (x && x + extent > width) newline();
    if (!x && /^ +$/.test(token)) continue;
    for (const char of chars) {
      if (x && x + advance(char) > width) newline();
      const step = advance(char);
      lines.at(-1).push({ char, x, advance: step });
      x += step;
    }
  }
  return lines;
}
function linePath(points) {
  const [first, ...rest] = points;
  if (!rest.length) return 'M' + first.join(',') + 'l.01,.01';
  let d = 'M' + first.join(',');
  for (let i = 0; i < rest.length - 1; i++) {
    const [x, y] = rest[i];
    d += 'Q' + x + ',' + y + ' ' + ((x + rest[i + 1][0]) / 2) + ',' + ((y + rest[i + 1][1]) / 2);
  }
  return d + 'L' + rest.at(-1).join(',');
}
export function strokeNode(points, color, width, create = element) {
  return create('path', { d: linePath(points), fill: 'none', stroke: color, 'stroke-width': width });
}
export function markNode(mark, create = element) {
  const group = create('g', { 'data-mark': mark.id, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (mark.type === 'stroke') {
    group.append(strokeNode(mark.points, mark.color, mark.width, create));
    return group;
  }
  group.setAttribute('aria-label', mark.text);
  const scale = mark.size / 10;
  for (const [lineIndex, line] of layout(mark.text, mark.size, (mark.wrapWidth ?? 1100) - 28 - mark.x).entries()) {
    const y = mark.y + lineIndex * mark.size * 1.65;
    for (const { char, x } of line) {
      if (char === ' ') continue;
      const [d] = glyph(char);
      const nudge = Math.sin((x + y) * 0.39) * 0.48;
      const transform = 'translate(' + (mark.x + x) + ' ' + (y + nudge) + ')';
      if (d) {
        for (const stroke of d.match(/M[^M]+/g)) {
          group.append(create('path', {
            d: stroke, transform: transform + ' scale(' + scale + ') rotate(' + (nudge * 2.7) + ')',
            fill: 'none', stroke: mark.color, 'stroke-width': 0.73
          }));
        }
      } else {
        const fallback = create('text', { transform, y: mark.size * .92, fill: mark.color, 'font-size': mark.size });
        fallback.textContent = char;
        group.append(fallback);
      }
    }
  }
  return group;
}
