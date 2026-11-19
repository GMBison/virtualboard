const blue = '#295cde';
const green = '#14735d';
const write = (text, x, y, size, color, say) => ({ type: 'write', text, x, y, size, color, say });
const stroke = (points, color, width = 2.8) => ({ type: 'stroke', points, color, width });
export const demo = [
  write('Simplifying surds', 67, 48, 43, green, 'Let’s simplify a surd by looking for a perfect square inside the root.'),
  stroke([[68,118],[130,116],[233,117],[358,115],[578,117]], green),
  write('Find a square factor of 72.', 68, 148, 28, undefined, 'First, spot the perfect square. Seventy-two is thirty-six times two.'),
  write('72 = 36 × 2', 93, 212, 38, blue),
  write('√72 = √(36 × 2)', 93, 277, 38, blue, 'Replace seventy-two with its factors.'),
  write('= √36 × √2', 207, 344, 38, blue, 'We can split the square root across the two positive factors.'),
  write('= 6√2', 207, 414, 42, green, 'The square root of thirty-six is six. That leaves six root two.'),
  stroke([[189,400],[386,401],[397,409],[396,473],[189,474],[185,464],[185,409],[189,400]], green),
  stroke([[623,147],[624,267],[622,439],[625,550]], '#8956b8', 2),
  write('Try it', 669, 155, 32, '#8956b8', 'Try the same idea with root fifty. Which perfect square divides fifty?'),
  write('√50 = ?', 669, 215, 36, blue),
  write('Hint: 50 = 25 × 2', 669, 304, 24, undefined),
  write('Look for the largest square factor.', 68, 605, 27, green)
];
