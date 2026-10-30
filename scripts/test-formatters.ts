import assert from 'node:assert/strict';
import { formatCurrency, formatIndianNumberInput, parseIndianNumber } from '../src/utils/formatters';

const formattingCases: Array<[string, string]> = [
  ['100', '100'],
  ['1000', '1,000'],
  ['10000', '10,000'],
  ['100000', '1,00,000'],
  ['1000000', '10,00,000'],
  ['12345678.90', '1,23,45,678.90'],
  ['200.00', '200.00'],
  ['-123456.50', '-1,23,456.50'],
];

for (const [input, expected] of formattingCases) {
  assert.equal(formatIndianNumberInput(input), expected, `Formatting ${input}`);
}
assert.equal(parseIndianNumber('1,23,456.78'), 123456.78);
assert.equal(formatCurrency('1,23,456.78', '₹'), '₹1,23,456.78');
console.log(`Passed ${formattingCases.length} Indian amount formatting cases plus parsing/currency checks.`);
